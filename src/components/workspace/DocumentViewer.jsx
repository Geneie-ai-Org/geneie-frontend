import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SegmentedPill } from '@/components/UploadWizardKit';
import { cn } from '@/lib/utils';
import { canEmbedPdf, hardenHtml, openHtmlInNewTab, openUrlInNewTab, safeSandbox } from '@/lib/reportPreview';

/**
 * DocumentViewer: one place to look at a generated document inside the app.
 *
 *   <DocumentViewer title="Clinical report preview" source={{ kind: 'html', html }} />
 *
 * `source` (null while nothing is loaded):
 *   { kind: 'html', html }      an HTML string, shown through `srcdoc` in a SANDBOXED iframe on a white
 *                               "paper" sheet. A script-blocking CSP is put in front of the document.
 *   { kind: 'url',  url }       a framed URL (for example a presigned S3 report), same sandbox and sheet.
 *   { kind: 'pdf',  blobUrl }   a PDF blob URL the caller made from bytes it fetched. Drawn by the
 *                               browser's own viewer where `canEmbedPdf()` (desktop with a PDF plugin);
 *                               otherwise a fallback card with "Open PDF" (+ `pdfFallbackActions`).
 *                               Not sandboxed (browsers refuse PDF viewers inside sandboxed frames), so
 *                               pass only blob URLs you created yourself.
 *
 * Props
 *   title            iframe title + landmark label (required for accessibility)
 *   sandbox          iframe sandbox tokens, default "" (no scripts, no same-origin, no forms/popups/modals).
 *                    `allow-same-origin` is dropped whenever `allow-scripts` is present. The html kind's
 *                    "Open in new tab" copy is ALWAYS script-blocked (a blob page would run as the app).
 *   paperWidth       logical page width in px for html/url (default 794, A4); Fit scales it to the pane
 *   defaultZoom      'fit' | '100' | '125' (html/url only)
 *   toolbarStart/End extra controls on the toolbar (a mode switch, Expand, Download ...)
 *   children         replaces the canvas (idle / loading / error states); the toolbar stays
 *   notice           a node shown between the toolbar and the canvas (an out-of-date banner)
 *   dim              fades the document (an out-of-date preview) without hiding it
 *   canvasClassName  size the canvas (for example a height) when the viewer is not in a flex column
 *   openLabel        label of the always-present open button (default "Open in new tab")
 * The viewer never injects HTML into the app DOM and never runs scripts of the document.
 */
const ZOOMS = [
  { value: 'fit', label: 'Fit' },
  { value: '100', label: '100%' },
  { value: '125', label: '125%' },
];

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Cheap identity for "is this still the same document" (resets the loaded flag). */
function sourceKey(source) {
  if (!source) return 'none';
  if (source.kind === 'html') {
    const h = String(source.html || '');
    let x = 5381;
    for (let i = 0; i < h.length; i += 1) x = ((x << 5) + x + h.charCodeAt(i)) | 0;
    return `html:${h.length}:${x}`;
  }
  return `${source.kind}:${source.url || source.blobUrl || ''}`;
}

/** A page-shaped skeleton that sits on the paper while the document loads. Fixed light colours: it is on white in both themes. */
export function PaperSkeleton({ className }) {
  return (
    <div className={cn('wb-report-skel', className)} aria-hidden="true">
      <span className="wb-report-skel-bar" style={{ width: '46%', height: 16 }} />
      <span className="wb-report-skel-bar" style={{ width: '30%', height: 10, marginTop: 8 }} />
      <span className="wb-report-skel-block" style={{ height: 54, marginTop: 20 }} />
      {[92, 100, 96, 70].map((w, i) => <span key={i} className="wb-report-skel-bar" style={{ width: `${w}%`, height: 9, marginTop: i === 0 ? 20 : 9 }} />)}
      <span className="wb-report-skel-block" style={{ height: 110, marginTop: 20 }} />
      {[100, 88, 94].map((w, i) => <span key={i} className="wb-report-skel-bar" style={{ width: `${w}%`, height: 9, marginTop: 9 }} />)}
    </div>
  );
}

export default function DocumentViewer({
  title,
  source = null,
  sandbox = '',
  paperWidth = 794,
  defaultZoom = 'fit',
  toolbarStart = null,
  toolbarEnd = null,
  children,
  notice = null,
  dim = false,
  openLabel = 'Open in new tab',
  pdfFallbackActions = null,
  className,
  canvasClassName,
}) {
  const [zoom, setZoom] = useState(defaultZoom);
  const canvasRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const key = useMemo(() => sourceKey(source), [source]);
  const [loadedKey, setLoadedKey] = useState(null);
  const loaded = loadedKey === key;

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const kind = source?.kind || null;
  const framed = kind === 'html' || kind === 'url';
  const showingDoc = !children && Boolean(source);
  const sb = safeSandbox(sandbox);
  const srcDoc = useMemo(() => (kind === 'html' ? (sb.includes('allow-scripts') ? String(source.html || '') : hardenHtml(source.html)) : null), [kind, source, sb]);

  const openIt = () => {
    if (!source) return;
    if (kind === 'html') openHtmlInNewTab(source.html);
    else if (kind === 'url') openUrlInNewTab(source.url);
    else if (kind === 'pdf') openUrlInNewTab(source.blobUrl);
  };

  const pad = box.w && box.w < 520 ? 10 : 16;
  const fit = box.w ? clamp((box.w - pad * 2) / paperWidth, 0.3, 1.5) : 1;
  const scale = zoom === 'fit' ? fit : zoom === '100' ? 1 : 1.25;
  const sheetH = Math.max(220, box.h - pad * 2);
  const overflowing = scale > fit + 0.001;

  let body = null;
  if (showingDoc && framed) {
    body = (
      <div
        className="wb-report-sheet"
        data-dim={dim || undefined}
        style={{ width: Math.round(paperWidth * scale), height: sheetH, margin: `${pad}px auto` }}
      >
        {!loaded ? <PaperSkeleton /> : null}
        <iframe
          key={key}
          title={title}
          sandbox={sb}
          {...(kind === 'html'
            ? { srcDoc: srcDoc }
            : { src: source.url })}
          referrerPolicy="no-referrer"
          onLoad={() => setLoadedKey(key)}
          style={{
            width: paperWidth,
            height: sheetH / scale,
            transform: `scale(${scale})`,
            transformOrigin: '0 0',
            colorScheme: 'light',
            opacity: loaded ? 1 : 0,
          }}
          className="wb-report-frame"
        />
      </div>
    );
  } else if (showingDoc && kind === 'pdf') {
    body = canEmbedPdf() ? (
      <iframe key={key} title={title} src={`${source.blobUrl}#view=FitH&navpanes=0`} className="wb-report-pdf" data-dim={dim || undefined} onLoad={() => setLoadedKey(key)} />
    ) : (
      <div className="wb-report-state" role="status">
        <span className="wb-report-state-icon" aria-hidden="true"><FileText className="size-4" /></span>
        <p className="text-[13px] font-medium text-foreground">This device cannot show a PDF inside the page</p>
        <p className="max-w-xs text-[13px] leading-5 text-muted-foreground">Open it in its own tab, or save it. The Document view shows the same report here.</p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={openIt} className="gap-1.5 [@media(pointer:coarse)]:h-10"><ExternalLink className="size-3.5" aria-hidden="true" />Open PDF</Button>
          {pdfFallbackActions}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('wb-report-viewer', className)} data-kind={kind || 'none'}>
      <div className="wb-report-toolbar">
        {toolbarStart}
        <span className="min-w-0 flex-1" />
        {showingDoc && framed ? (
          <SegmentedPill ariaLabel="Zoom" value={zoom} onChange={setZoom} options={ZOOMS} />
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openIt}
          disabled={!source}
          title={kind === 'html' ? `${openLabel}. Print it from there with your browser.` : openLabel}
          aria-label={openLabel}
          className="wb-report-open gap-1.5 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:px-3"
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
          <span className="wb-report-btn-label">{openLabel}</span>
        </Button>
        {toolbarEnd}
      </div>
      {notice}
      <div
        ref={canvasRef}
        className={cn('wb-report-canvas', canvasClassName)}
        data-kind={kind || 'none'}
        role="region"
        aria-label={`${title} viewer`}
        tabIndex={overflowing && showingDoc ? 0 : undefined}
      >
        {children ?? body}
      </div>
    </div>
  );
}
