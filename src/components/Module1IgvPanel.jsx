import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2, Maximize2, RotateCcw, RotateCw } from 'lucide-react';
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
import { QcHeading } from '@/components/Module1QcPanel';
import { cn } from '@/lib/utils';
import {
  assemblyForGenome,
  buildGeneieJbrowseConfiguration,
  defaultLocusForGenome,
} from '@/lib/module1JbrowseTheme';

/** ~40–80 kb window — pileup stays under JBrowse’s BAM fetchSizeLimit. */
const DEFAULT_BP_PER_PX = 1.5;
/** Soft cap: beyond this, reads are almost always blocked by fetchSizeLimit. */
const MAX_USEFUL_BP_PER_PX = 40;

function getLgView(viewState) {
  return viewState?.session?.view ?? viewState?.view ?? null;
}

/**
 * Geneie-themed JBrowse 2 linear genome view for retained Module 1 markdup BAM.
 *
 * `variant="card"` (default): a quiet row that opens the viewer in a full dialog, so pan/zoom is
 * not clipped by the card.
 * `variant="panel"`: plain content for a workspace tab. The viewer mounts inline, fills its parent
 * (`h-full min-h-0 flex flex-col`), and shows an explicit loading, error or empty state instead of
 * a blank box. No dialog, no fixed width.
 *
 * Snapshot is saved the first time the viewer is shown (not on page load).
 */
const Module1IgvPanel = ({ conversationId, hasBam, genome: genomeHint, variant = 'card' }) => {
  const { isDark } = useTheme();
  const inline = variant === 'panel';
  const [open, setOpen] = useState(false);
  // The viewer is "active" when its dialog is open, or always in a workspace panel.
  const active = inline || open;
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [snapshotStatus, setSnapshotStatus] = useState(null);
  const [bamMeta, setBamMeta] = useState(null);
  const [JBrowse, setJBrowse] = useState(null);
  const [viewState, setViewState] = useState(null);
  const captureRootRef = useRef(null);
  const capturedRef = useRef(false);

  // Reset per conversation so a new BAM gets a fresh view + snapshot.
  useEffect(() => {
    capturedRef.current = false;
    setOpen(false);
    setViewState(null);
    setBamMeta(null);
    setSnapshotStatus(null);
    setError(null);
  }, [conversationId]);

  useEffect(() => {
    if (!active || !conversationId || !hasBam) return undefined;

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

        setBamMeta({ sample, genome: assemblyName });
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
                  // Default 5 MB trips easily when zoomed out; slightly higher, with
                  // a zoom soft-cap below so we still avoid multi-GB fetches.
                  fetchSizeLimit: 12_000_000,
                },
              },
            ],
            location: defaultLocusForGenome(assemblyName),
            defaultSession: {
              name: 'module1',
              view: {
                id: 'linearGenomeView',
                type: 'LinearGenomeView',
                // Overview polygon fills with tertiary.light; hide it in the embed
                // so a bad theme never paints a black wedge over the toolbar.
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
  }, [active, attempt, conversationId, hasBam, genomeHint, isDark]);

  // Soft-cap zoom-out: BAM pileup cannot render chromosome-scale windows.
  useEffect(() => {
    if (!active || !viewState) return undefined;
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
  }, [active, viewState]);

  const resetView = useCallback(() => {
    const view = getLgView(viewState);
    const genome = bamMeta?.genome;
    if (!view || !genome) return;
    const locus = defaultLocusForGenome(genome);
    if (typeof view.navToLocString === 'function') {
      void view.navToLocString(locus, genome);
    }
    if (typeof view.zoomTo === 'function') {
      view.zoomTo(DEFAULT_BP_PER_PX);
    }
  }, [viewState, bamMeta]);

  // Capture viewport → durable report (once per conversation while BAM live).
  useEffect(() => {
    if (!active || !viewState || !captureRootRef.current || capturedRef.current || loading || error) {
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setSnapshotStatus('Saving alignment snapshot…');
        // toBlob needs a concrete colour, not a var(): read what the themed surface resolved to.
        const matte = window.getComputedStyle(captureRootRef.current).backgroundColor;
        const blob = await toBlob(captureRootRef.current, {
          cacheBust: true,
          pixelRatio: 2,
          backgroundColor: matte && matte !== 'rgba(0, 0, 0, 0)' ? matte : undefined,
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
  }, [active, viewState, loading, error, conversationId, isDark, bamMeta]);

  const Browser = useMemo(() => JBrowse, [JBrowse]);

  if (!hasBam) return null;

  const retry = () => {
    setViewState(null);
    setError(null);
    setAttempt((n) => n + 1);
  };

  /** Loading, error, or the browser itself. Never a blank box. */
  const browserArea = (
    <>
      {loading && (
        <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border" role="status">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
          <p className="text-xs text-muted-foreground">Loading the alignment browser…</p>
        </div>
      )}
      {error && !loading && (
        <div className="flex min-h-[240px] flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-border px-6 text-center" role="alert">
          <AlertCircle className="h-5 w-5 text-[var(--error)]" aria-hidden />
          <div>
            <p className="text-sm font-medium text-foreground">The alignment browser could not open</p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          </div>
          <button
            type="button"
            onClick={retry}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/55"
          >
            <RotateCw className="h-3 w-3" aria-hidden />
            Try again
          </button>
        </div>
      )}
      {!loading && !error && Browser && viewState && (
        <div
          ref={captureRootRef}
          className={cn('module1-jbrowse-root min-h-[420px] flex-1 rounded-lg border border-border bg-background', inline && 'min-h-[360px]')}
          style={{ touchAction: 'none' }}
        >
          <Browser viewState={viewState} />
        </div>
      )}
      {!loading && !error && !(Browser && viewState) && (
        <div className="flex min-h-[240px] flex-1 items-center justify-center rounded-lg border border-dashed border-border px-6 text-center text-xs text-muted-foreground">
          No alignment loaded yet.
        </div>
      )}
    </>
  );

  const resetButton = (
    <button
      type="button"
      onClick={resetView}
      disabled={!viewState || !bamMeta}
      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/55 disabled:opacity-40"
    >
      <RotateCcw className="h-3 w-3" aria-hidden />
      Reset view
    </button>
  );

  const hint = `Drag to pan. Zoom in to load reads; zooming out too far is blocked for BAM size${bamMeta?.genome ? ` · ${bamMeta.genome}` : ''}.`;

  if (inline) {
    return (
      <section className="flex min-h-0 flex-1 flex-col gap-3" aria-label="Module 1 alignment viewer">
        <QcHeading
          title={`Alignment browser${bamMeta?.sample ? ` · ${bamMeta.sample}` : ''}`}
          hint={snapshotStatus ? `${hint} ${snapshotStatus}` : hint}
          trailing={resetButton}
        />
        {browserArea}
      </section>
    );
  }

  return (
    <>
      <section aria-label="Module 1 alignment viewer" className="space-y-2.5">
        <QcHeading title="Alignment browser" hint="Pan, zoom and search the reads while the BAM is retained." />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-border px-3 text-left text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/55"
        >
          <span className="min-w-0 flex-1 truncate">Open interactive view{bamMeta?.genome ? ` · ${bamMeta.genome}` : ''}</span>
          <Maximize2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton
          className="!max-w-[min(96vw,1100px)] !min-w-[min(96vw,720px)] w-full h-[min(90vh,860px)] flex flex-col p-0 gap-0 overflow-hidden bg-popover border border-border max-sm:!min-w-full max-sm:!h-[100dvh] max-sm:rounded-none"
        >
          <DialogHeader className="shrink-0 px-4 pb-2 pt-4 pr-12">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="text-sm text-foreground">
                  Alignment browser
                  {bamMeta?.sample ? ` · ${bamMeta.sample}` : ''}
                </DialogTitle>
                <DialogDescription className="text-2xs text-muted-foreground">
                  {hint}
                  {snapshotStatus ? ` ${snapshotStatus}` : ''}
                </DialogDescription>
              </div>
              {resetButton}
            </div>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">{browserArea}</div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Module1IgvPanel;
