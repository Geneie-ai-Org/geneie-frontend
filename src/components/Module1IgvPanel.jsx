import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Loader2, Maximize2, RotateCcw, Search } from 'lucide-react';
import { toBlob } from 'html-to-image';
import { fetchModule1BamArtifacts, uploadModule1ReportFigure } from '@/services/backendApi';
import { useTheme } from '@/hooks/useTheme';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  assemblyForGenome,
  buildGeneieJbrowseConfiguration,
  defaultLocusForGenome,
} from '@/lib/module1JbrowseTheme';
import { bamExpiryCopy } from '@/lib/module1IgvLocus';
import { subscribeModule1IgvOpen } from '@/lib/module1IgvBus';
import { lookupGeneLocus } from '@/lib/module1GeneLookup';

/** ~40–80 kb window — pileup stays under JBrowse’s BAM fetchSizeLimit. */
const DEFAULT_BP_PER_PX = 1.5;
/** Soft cap: beyond this, reads are almost always blocked by fetchSizeLimit. */
const MAX_USEFUL_BP_PER_PX = 40;

function getLgView(viewState) {
  return viewState?.session?.view ?? viewState?.view ?? null;
}

export function module1IgvWindowUrl(conversationId, locus) {
  const q = new URLSearchParams();
  if (conversationId) q.set('cid', conversationId);
  if (locus) q.set('locus', locus);
  return `/app/module1-igv?${q.toString()}`;
}

/**
 * Geneie-themed JBrowse 2 linear genome view for retained Module 1 markdup BAM.
 * Opens in a full dialog (not the bottom drawer) so pan/zoom is not clipped.
 * Snapshot is saved the first time the user opens the viewer (not on page load).
 *
 * @param {{ locus?: string, token?: number|string }} [locusRequest] — open + nav when token changes
 * @param {boolean} [embedded] — skip the pipeline card; open immediately (popup page)
 * @param {boolean} [hideLauncher] — dialog-only (parent owns the open trigger)
 */
const Module1IgvPanel = ({
  conversationId,
  hasBam,
  genome: genomeHint,
  bamExpiresAt = null,
  bamIgvV2 = false,
  locusRequest = null,
  embedded = false,
  hideLauncher = false,
  autoOpen = false,
  /** When false, ignore the global View-in-IGV bus (use when another instance owns the dialog). */
  listenForOpenRequests = true,
}) => {
  const { isDark } = useTheme();
  const [open, setOpen] = useState(Boolean(embedded || autoOpen));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [snapshotStatus, setSnapshotStatus] = useState(null);
  const [bamMeta, setBamMeta] = useState(null);
  const [JBrowse, setJBrowse] = useState(null);
  const [viewState, setViewState] = useState(null);
  const [activeLocus, setActiveLocus] = useState(null);
  const [geneQuery, setGeneQuery] = useState('');
  const [geneStatus, setGeneStatus] = useState(null);
  const [geneBusy, setGeneBusy] = useState(false);
  const captureRootRef = useRef(null);
  const capturedRef = useRef(false);
  const lastLocusTokenRef = useRef(null);

  const expiryLine = bamExpiryCopy(bamExpiresAt, { hasBam });

  // Reset per conversation so a new BAM gets a fresh view + snapshot.
  useEffect(() => {
    capturedRef.current = false;
    if (!embedded) setOpen(Boolean(autoOpen));
    setViewState(null);
    setBamMeta(null);
    setSnapshotStatus(null);
    setError(null);
    setActiveLocus(null);
    lastLocusTokenRef.current = null;
  }, [conversationId, embedded, autoOpen]);

  // External "View in IGV" requests (variant row) — prop or bus.
  useEffect(() => {
    if (!locusRequest || locusRequest.token == null) return;
    if (lastLocusTokenRef.current === locusRequest.token) return;
    lastLocusTokenRef.current = locusRequest.token;
    if (locusRequest.locus) setActiveLocus(locusRequest.locus);
    if (hasBam) setOpen(true);
  }, [locusRequest, hasBam]);

  useEffect(() => {
    if (!listenForOpenRequests || !conversationId) return undefined;
    return subscribeModule1IgvOpen((detail) => {
      if (String(detail.conversationId || '') !== String(conversationId)) return;
      if (detail.token != null) lastLocusTokenRef.current = detail.token;
      if (detail.locus) setActiveLocus(detail.locus);
      if (hasBam) setOpen(true);
    });
  }, [conversationId, hasBam, listenForOpenRequests]);

  useEffect(() => {
    if (!open || !conversationId || !hasBam) return undefined;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [{ createViewState, JBrowseLinearGenomeView }, data] = await Promise.all([
          import('@jbrowse/react-linear-genome-view2'),
          fetchModule1BamArtifacts(conversationId),
        ]);
        if (cancelled) return;

        if (!data?.has_bam || !data.bam_url || !data.bai_url) {
          throw new Error(data?.message || 'Alignment BAM is not available.');
        }

        const genome = (data.genome || genomeHint || 'hg38').toLowerCase();
        const assemblyName = genome === 'hg19' ? 'hg19' : 'hg38';
        const sample = data.sample_name || 'Alignments';
        const trackId = `module1-bam-${conversationId}`;
        const startLocus = activeLocus || defaultLocusForGenome(assemblyName);

        setBamMeta({
          sample,
          genome: assemblyName,
          bamExpiresAt: data.bam_expires_at || bamExpiresAt || null,
        });
        setJBrowse(() => JBrowseLinearGenomeView);

        setViewState((prev) => {
          if (prev) return prev;
          return createViewState({
            assembly: assemblyForGenome(assemblyName),
            tracks: [
              {
                type: 'AlignmentsTrack',
                trackId,
                name: sample,
                assemblyNames: [assemblyName],
                adapter: {
                  type: 'BamAdapter',
                  bamLocation: { uri: data.bam_url, locationType: 'UriLocation' },
                  index: {
                    location: { uri: data.bai_url, locationType: 'UriLocation' },
                  },
                  fetchSizeLimit: 12_000_000,
                },
              },
            ],
            location: startLocus,
            defaultSession: {
              name: 'module1',
              view: {
                id: 'linearGenomeView',
                type: 'LinearGenomeView',
                hideHeaderOverview: true,
                bpPerPx: DEFAULT_BP_PER_PX,
                tracks: [
                  {
                    id: trackId,
                    type: 'AlignmentsTrack',
                    configuration: trackId,
                    displays: [
                      {
                        id: `${trackId}-display`,
                        type: 'LinearAlignmentsDisplay',
                        configuration: `${trackId}-LinearAlignmentsDisplay`,
                      },
                    ],
                  },
                ],
              },
            },
            configuration: buildGeneieJbrowseConfiguration(isDark),
          });
        });
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Could not open alignment viewer.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // activeLocus only seeds first createViewState; later nav is a separate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conversationId, hasBam, genomeHint, isDark, bamExpiresAt]);

  // Soft-cap zoom-out: BAM pileup cannot render chromosome-scale windows.
  useEffect(() => {
    if (!open || !viewState) return undefined;
    const view = getLgView(viewState);
    if (!view?.zoomTo) return undefined;

    let cancelled = false;
    const id = window.setInterval(() => {
      if (cancelled) return;
      const bp = view.bpPerPx ?? view.effectiveBpPerPx;
      if (typeof bp === 'number' && bp > MAX_USEFUL_BP_PER_PX) {
        view.zoomTo(MAX_USEFUL_BP_PER_PX);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [open, viewState]);

  // Navigate when locus changes after the view exists.
  useEffect(() => {
    if (!open || !viewState || !activeLocus || !bamMeta?.genome) return;
    const view = getLgView(viewState);
    if (typeof view?.navToLocString === 'function') {
      void view.navToLocString(activeLocus, bamMeta.genome);
    }
    if (typeof view?.zoomTo === 'function') {
      view.zoomTo(DEFAULT_BP_PER_PX);
    }
  }, [open, viewState, activeLocus, bamMeta]);

  const resetView = useCallback(() => {
    const view = getLgView(viewState);
    const genome = bamMeta?.genome;
    if (!view || !genome) return;
    const locus = activeLocus || defaultLocusForGenome(genome);
    if (typeof view.navToLocString === 'function') {
      void view.navToLocString(locus, genome);
    }
    if (typeof view.zoomTo === 'function') {
      view.zoomTo(DEFAULT_BP_PER_PX);
    }
  }, [viewState, bamMeta, activeLocus]);

  const jumpToGene = useCallback(async () => {
    const genome = bamMeta?.genome || genomeHint || 'hg38';
    const q = geneQuery.trim();
    if (!q || !hasBam) return;
    setGeneBusy(true);
    setGeneStatus(null);
    try {
      const hit = await lookupGeneLocus(q, genome);
      if (!hit?.locus) {
        setGeneStatus(`No coordinates for “${q}” on ${genome}.`);
        return;
      }
      setActiveLocus(hit.locus);
      setGeneStatus(`${hit.symbol} · ${hit.locus}`);
      const view = getLgView(viewState);
      if (typeof view?.navToLocString === 'function') {
        void view.navToLocString(hit.locus, genome);
      }
      if (typeof view?.zoomTo === 'function') {
        view.zoomTo(DEFAULT_BP_PER_PX);
      }
    } catch (_err) {
      setGeneStatus('Gene lookup failed. Try again.');
    } finally {
      setGeneBusy(false);
    }
  }, [geneQuery, hasBam, bamMeta, genomeHint, viewState]);

  const openSeparateWindow = useCallback(() => {
    if (!conversationId || !hasBam) return;
    const url = module1IgvWindowUrl(conversationId, activeLocus || undefined);
    window.open(url, 'geneie-module1-igv', 'noopener,noreferrer,width=1280,height=860');
  }, [conversationId, hasBam, activeLocus]);

  const geneSearchControls = (
    <form
      className="flex items-center gap-1.5 min-w-0"
      onSubmit={(e) => {
        e.preventDefault();
        void jumpToGene();
      }}
    >
      <label className="sr-only" htmlFor="module1-igv-gene">
        Gene search
      </label>
      <input
        id="module1-igv-gene"
        type="text"
        value={geneQuery}
        onChange={(e) => setGeneQuery(e.target.value)}
        placeholder="Gene (e.g. BRCA1)"
        disabled={!hasBam || geneBusy}
        className="h-7 w-[9.5rem] px-2 text-2xs rounded-md border disabled:opacity-40"
        style={{
          borderColor: 'var(--border-subtle)',
          backgroundColor: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
        }}
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="submit"
        disabled={!hasBam || geneBusy || !geneQuery.trim()}
        className="inline-flex items-center gap-1 text-2xs px-2 py-1 rounded-md border disabled:opacity-40"
        style={{
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-secondary)',
          backgroundColor: 'var(--bg-elevated)',
        }}
        title="Jump to gene"
      >
        {geneBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
        Go
      </button>
    </form>
  );

  // Capture viewport → durable report (once per conversation while BAM live).
  useEffect(() => {
    if (!open || !viewState || !captureRootRef.current || capturedRef.current || loading || error) {
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setSnapshotStatus('Saving alignment snapshot…');
        const blob = await toBlob(captureRootRef.current, {
          cacheBust: true,
          pixelRatio: 2,
          backgroundColor: isDark ? '#0f0f0f' : '#ffffff',
        });
        if (cancelled || !blob) {
          setSnapshotStatus(null);
          return;
        }
        await uploadModule1ReportFigure(conversationId, blob, {
          fileName: `alignment_browser_${Date.now()}.png`,
          kind: 'browser_snapshot',
          label: bamMeta?.sample
            ? `Alignment browser · ${bamMeta.sample}`
            : 'Alignment browser',
        });
        capturedRef.current = true;
        if (!cancelled) setSnapshotStatus('Alignment snapshot saved to QC report.');
      } catch (err) {
        console.warn('[Module1IgvPanel] snapshot failed:', err);
        if (!cancelled) setSnapshotStatus('Could not save alignment snapshot (will retry next open).');
      }
    }, 3500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, viewState, loading, error, conversationId, isDark, bamMeta]);

  const Browser = useMemo(() => JBrowse, [JBrowse]);

  if (!hasBam && !bamIgvV2) return null;

  const browserBody = (
    <div className="flex-1 min-h-0 px-3 pb-3 flex flex-col">
      {loading && (
        <div className="flex items-center gap-2 py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
          <span className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
            Loading browser…
          </span>
        </div>
      )}
      {error && (
        <p className="text-2xs px-1 py-2" style={{ color: 'var(--error)' }}>
          {error}
        </p>
      )}
      {!loading && !error && Browser && viewState && (
        <div
          ref={captureRootRef}
          className="module1-jbrowse-root flex-1 min-h-[480px] rounded-md border"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: isDark ? '#0f0f0f' : '#ffffff',
            touchAction: 'none',
          }}
        >
          <Browser viewState={viewState} />
        </div>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div
        className="w-full h-screen flex flex-col"
        style={{ backgroundColor: 'var(--bg-surface)' }}
        aria-label="Module 1 alignment viewer window"
      >
        <div className="px-4 pt-3 pb-2 shrink-0 flex items-start justify-between gap-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="min-w-0">
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Alignment browser
              {bamMeta?.sample ? ` · ${bamMeta.sample}` : ''}
            </p>
            <p className="text-2xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {expiryLine}
              {activeLocus ? ` · ${activeLocus}` : ''}
              {geneStatus ? ` · ${geneStatus}` : ''}
              {snapshotStatus ? ` · ${snapshotStatus}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {geneSearchControls}
            <button
              type="button"
              onClick={resetView}
              disabled={!viewState || !bamMeta}
              className="inline-flex items-center gap-1 text-2xs px-2 py-1 rounded-md border disabled:opacity-40"
              style={{
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
                backgroundColor: 'var(--bg-elevated)',
              }}
            >
              <RotateCcw className="w-3 h-3" />
              Reset view
            </button>
          </div>
        </div>
        {hasBam ? browserBody : (
          <p className="text-xs px-4 py-8" style={{ color: 'var(--text-tertiary)' }}>
            {expiryLine}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      {!hideLauncher && (
        <div
          className="mt-3 rounded-lg border"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
          aria-label="Module 1 alignment viewer"
        >
          <button
            type="button"
            onClick={() => hasBam && setOpen(true)}
            disabled={!hasBam}
            title={hasBam ? 'Open alignment browser' : expiryLine}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div className="min-w-0">
              <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                Alignment browser
              </p>
              <p className="text-2xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                {hasBam
                  ? `Open full interactive view · pan, zoom, and search${bamMeta?.genome ? ` · ${bamMeta.genome}` : ''}. ${bamIgvV2 ? expiryLine : ''}`.trim()
                  : expiryLine}
              </p>
            </div>
            <Maximize2 className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
          </button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton
          className="!max-w-[min(96vw,1100px)] !min-w-[min(96vw,720px)] w-full h-[min(90vh,860px)] flex flex-col p-0 gap-0 overflow-hidden"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-strong)' }}
        >
          <DialogHeader className="px-4 pt-4 pb-2 shrink-0 pr-12">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="text-sm" style={{ color: 'var(--text-primary)' }}>
                  Alignment browser
                  {bamMeta?.sample ? ` · ${bamMeta.sample}` : ''}
                </DialogTitle>
                <DialogDescription className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
                  Drag to pan · zoom in to load reads (zooming out too far is blocked for BAM size)
                  {bamMeta?.genome ? ` · ${bamMeta.genome}` : ''}.
                  {bamIgvV2 ? ` ${expiryLine}` : ''}
                  {activeLocus ? ` · at ${activeLocus}` : ''}
                  {geneStatus ? ` · ${geneStatus}` : ''}
                  {snapshotStatus ? ` ${snapshotStatus}` : ''}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 mt-0.5 flex-wrap justify-end">
                {geneSearchControls}
                <button
                  type="button"
                  onClick={openSeparateWindow}
                  disabled={!hasBam}
                  className="inline-flex items-center gap-1 text-2xs px-2 py-1 rounded-md border disabled:opacity-40"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                    backgroundColor: 'var(--bg-elevated)',
                  }}
                  title="Open in a separate window"
                >
                  <ExternalLink className="w-3 h-3" />
                  New window
                </button>
                <button
                  type="button"
                  onClick={resetView}
                  disabled={!viewState || !bamMeta}
                  className="inline-flex items-center gap-1 text-2xs px-2 py-1 rounded-md border disabled:opacity-40"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                    backgroundColor: 'var(--bg-elevated)',
                  }}
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset view
                </button>
              </div>
            </div>
          </DialogHeader>

          {browserBody}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Module1IgvPanel;
