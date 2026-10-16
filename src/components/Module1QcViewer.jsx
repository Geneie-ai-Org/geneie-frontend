import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ExternalLink, PanelTopOpen, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DocumentViewer from '@/components/workspace/DocumentViewer';
import DocumentViewerDialog from '@/components/workspace/DocumentViewerDialog';
import { openUrlInNewTab } from '@/lib/reportPreview';

/**
 * "View here" for Module 1 QC reports (fastp / MultiQC HTML).
 *
 * These pages are made by third-party tools, run their own scripts and are served from a presigned
 * object-store origin. They are framed, never fetched or proxied: `src` is the presigned URL itself.
 *
 *  - sandbox has `allow-scripts` and NEVER `allow-same-origin` (DocumentViewer also strips it), so the
 *    page runs on an opaque origin: it cannot read Geneie's storage, cookies or DOM, and its own
 *    storage calls fail (MultiQC copes). `referrerpolicy="no-referrer"` comes from DocumentViewer.
 *  - A cross-origin frame cannot report "blocked" or "downloaded instead of shown". The viewer gives
 *    the person a new-tab button that is always there, plus a hint when the frame has not loaded in 4 s.
 *  - Presigned links expire. The link is parsed for its expiry, refreshed before opening when stale, and
 *    "Refresh link" re-fetches the panel's own QC payload (the panel passes its retry).
 */
export const QC_FRAME_SANDBOX = 'allow-scripts allow-popups allow-downloads';
const SLOW_MS = 4000;
const STALE_MARGIN_MS = 20_000;

/** Epoch ms when a SigV4 presigned URL stops working (X-Amz-Date + X-Amz-Expires), or null if unknown. */
export function presignExpiryMs(url) {
  try {
    const u = new URL(String(url));
    const date = u.searchParams.get('X-Amz-Date');
    const secs = Number(u.searchParams.get('X-Amz-Expires'));
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(date || '');
    if (m && Number.isFinite(secs)) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) + secs * 1000;
    const legacy = Number(u.searchParams.get('Expires')); // SigV2: absolute epoch seconds
    if (Number.isFinite(legacy) && legacy > 1e9) return legacy * 1000;
  } catch { /* not a URL */ }
  return null;
}

/** True when the link is expired or about to be. Unknown expiry counts as fresh. */
export function isLinkStale(url, now = Date.now()) {
  const at = presignExpiryMs(url);
  return at != null && at - now < STALE_MARGIN_MS;
}

/** "multiqc_report.html" -> "MultiQC report", "fastp" -> "fastp report", "S1_fastp.html" -> "fastp report". */
export function qcReportKind(...names) {
  const s = names.filter(Boolean).join(' ').toLowerCase();
  if (s.includes('multiqc')) return 'multiqc';
  if (s.includes('fastp')) return 'fastp';
  if (s.includes('fastqc')) return 'fastqc';
  return 'qc';
}
const KIND_NAME = { multiqc: 'MultiQC report', fastp: 'fastp report', fastqc: 'FastQC report', qc: 'QC report' };
export const qcReportName = (kind) => KIND_NAME[kind] || KIND_NAME.qc;

/** The "View here" pill. Its accessible name is the visible words plus the report: "View MultiQC report here". */
export function ViewHereButton({ name, onClick, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`View ${name} here, inside Geneie`}
      className={`wb-chip wb-qc-view gap-1.5 font-medium outline-none transition-colors hover:!border-[hsl(var(--brand-300))] hover:!bg-[hsl(var(--brand-50))] hover:text-[hsl(var(--brand-700))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] ${className}`}
    >
      <PanelTopOpen className="size-3.5 shrink-0" aria-hidden />
      <span>View<span className="sr-only"> {name}</span> here</span>
    </button>
  );
}

function useNarrow() {
  const [narrow, setNarrow] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 767px)').matches : false));
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(max-width: 767px)');
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return narrow;
}

function StateCard({ role = 'status', icon: Icon = RotateCw, spin = false, title, body, children }) {
  return (
    <div className="wb-report-state" role={role}>
      <span className="wb-report-state-icon" aria-hidden="true"><Icon className={`size-4 ${spin ? 'animate-spin' : ''}`} /></span>
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {body ? <p className="max-w-xs text-[13px] leading-5 text-muted-foreground">{body}</p> : null}
      {children ? <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{children}</div> : null}
    </div>
  );
}

/** `bare` = in the toolbar, where narrow viewers drop the words (aria-label keeps the name). */
function RefreshPill({ onRefresh, busy, className = '', bare = false }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onRefresh}
      disabled={busy}
      aria-label="Refresh link"
      title="Fetch a fresh link to this report"
      className={`wb-qc-pill gap-1.5 rounded-full [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:px-3 ${className}`}
    >
      <RotateCw className={`size-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden />
      <span className={bare ? 'wb-report-btn-label' : undefined}>Refresh link</span>
    </Button>
  );
}

function ViewerBody({ name, kind, url, nonce, loading, error, onRefresh }) {
  const wrapRef = useRef(null);
  const narrow = useNarrow();
  const stale = Boolean(url) && isLinkStale(url);
  const usable = Boolean(url) && !stale;
  // Same URL fetched again must still reload the frame: a fragment changes the key, never the request.
  const frameUrl = usable ? (nonce > 0 && !url.includes('#') ? `${url}#qcv${nonce}` : url) : null;

  const [loadedFor, setLoadedFor] = useState(null);
  const [slowFor, setSlowFor] = useState(null);
  const loaded = frameUrl != null && loadedFor === frameUrl;
  const slow = frameUrl != null && slowFor === frameUrl && !loaded;

  // `load` does not bubble but it does capture: listen on the wrapper, before any iframe can finish loading.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const onLoad = (e) => {
      if (e.target?.tagName === 'IFRAME') setLoadedFor(e.target.getAttribute('src'));
    };
    el.addEventListener('load', onLoad, true);
    return () => el.removeEventListener('load', onLoad, true);
  }, []);

  useEffect(() => {
    if (!frameUrl) return undefined;
    const t = setTimeout(() => setSlowFor(frameUrl), SLOW_MS);
    return () => clearTimeout(t);
  }, [frameUrl]);

  const openTab = () => openUrlInNewTab(url);
  const busy = Boolean(loading);

  let source = null;
  let state = null;
  if (usable) {
    source = { kind: 'url', url: frameUrl };
  } else if (busy) {
    state = <StateCard spin title="Getting a fresh link" body="The saved link to this report is being renewed." />;
  } else if (error && !url) {
    state = (
      <StateCard role="alert" title="Could not renew the link" body={error}>
        <RefreshPill onRefresh={onRefresh} busy={false} />
      </StateCard>
    );
  } else {
    state = (
      <StateCard icon={ExternalLink} title={stale ? 'This link has expired' : 'This report is not available'} body={stale ? 'Links to reports are short-lived. Refresh it to see the report again.' : 'It may have been removed after chat unlocked.'}>
        <RefreshPill onRefresh={onRefresh} busy={false} />
      </StateCard>
    );
  }

  const notice = usable ? (
    <>
      {kind === 'multiqc' ? (
        <div className="wb-qc-note">
          <span className="min-w-0 flex-1">Some interactive MultiQC features, like saved highlights, need a new tab: browser storage is blocked in this frame.</span>
          <Button type="button" variant="outline" size="sm" onClick={openTab} className="wb-qc-pill shrink-0 gap-1.5 rounded-full [@media(pointer:coarse)]:h-10">
            <ExternalLink className="size-3.5" aria-hidden />Open in new tab
          </Button>
        </div>
      ) : null}
      {error ? <div className="wb-qc-note" role="alert"><span className="min-w-0 flex-1">Could not renew the link: {error}</span></div> : null}
    </>
  ) : null;

  return (
    <div ref={wrapRef} className="flex min-h-0 flex-1 flex-col" data-qc-frame-state={usable ? (loaded ? 'loaded' : slow ? 'slow' : 'loading') : 'none'}>
      <DocumentViewer
        title={name}
        source={source}
        sandbox={QC_FRAME_SANDBOX}
        paperWidth={narrow ? 480 : 1100}
        notice={notice}
        toolbarEnd={usable ? <RefreshPill bare onRefresh={onRefresh} busy={busy} /> : null}
        className="min-h-0 flex-1"
      >
        {state}
      </DocumentViewer>
      {usable ? (
        <div className="wb-qc-hint" data-slow={slow || undefined} role={slow ? 'status' : undefined}>
          {slow ? (
            <>
              <span className="min-w-0 flex-1">Taking long? The report may not be allowed to show inside Geneie.</span>
              <Button type="button" variant="outline" size="sm" onClick={openTab} className="wb-qc-pill shrink-0 gap-1.5 rounded-full [@media(pointer:coarse)]:h-10">
                <ExternalLink className="size-3.5" aria-hidden />Open in new tab
              </Button>
            </>
          ) : (
            <span className="min-w-0 flex-1">Blank or an error? Open it in a new tab, or refresh the link.</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Hook for a panel that owns the QC payload.
 *   resolveUrl(id) -> the CURRENT presigned URL for that report (read from the panel's latest payload)
 *   refetch()      -> the panel's own retry; `loading` / `error` are the panel's own state
 * Returns { openViewer(entry), dialog }. `entry` = { id, kind, name?, description? }.
 * The open report is remembered by id, never by URL, so a refresh reaches the frame.
 */
export function useQcViewer({ resolveUrl, refetch, loading, error, fallbackFocus }) {
  const [sel, setSel] = useState(null);
  const [nonce, setNonce] = useState(0);
  const resolveRef = useRef(resolveUrl);
  resolveRef.current = resolveUrl;
  const fallbackRef = useRef(fallbackFocus);
  fallbackRef.current = fallbackFocus;
  // The frame is reloaded when the refetch FINISHES (a new URL, or the same one: see `nonce`), not when it starts.
  const refreshing = useRef(false);
  const sawLoading = useRef(false);
  useEffect(() => {
    if (loading) { sawLoading.current = true; return; }
    if (sawLoading.current && refreshing.current) setNonce((n) => n + 1);
    if (sawLoading.current) { sawLoading.current = false; refreshing.current = false; }
  }, [loading]);

  const openViewer = useCallback((entry) => {
    setNonce(0);
    setSel(entry);
    if (isLinkStale(resolveRef.current(entry.id))) refetch();
  }, [refetch]);
  const onOpenChange = useCallback((o) => {
    if (o) return;
    setSel(null);
    // The button that opened the viewer can vanish while the link is refreshed (a failed refetch swaps
    // the row for the error notice). Focus returns to it when it is still there; otherwise to the panel.
    setTimeout(() => {
      const a = document.activeElement;
      if (!a || a === document.body) fallbackRef.current?.()?.focus?.({ preventScroll: true });
    }, 450);
  }, []);
  const onRefresh = useCallback(() => { refreshing.current = true; refetch(); }, [refetch]);

  // Keep the last report while the dialog plays its close animation.
  const lastRef = useRef(null);
  if (sel) lastRef.current = sel;
  const view = sel || lastRef.current;
  const url = view ? resolveUrl(view.id) : null;
  const name = view ? (view.name || qcReportName(view.kind)) : '';
  const dialog = (
    <DocumentViewerDialog
      open={Boolean(sel)}
      onOpenChange={onOpenChange}
      title={name || 'QC report'}
      description={view?.description}
    >
      {view ? (
        <ViewerBody name={name} kind={view.kind} url={url} nonce={nonce} loading={loading} error={error} onRefresh={onRefresh} />
      ) : null}
    </DocumentViewerDialog>
  );
  return { openViewer, dialog };
}
