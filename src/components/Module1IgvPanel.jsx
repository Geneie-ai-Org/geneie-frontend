import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Maximize2, RotateCcw } from 'lucide-react';
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

/** ~40–80 kb window — pileup stays under JBrowse’s BAM fetchSizeLimit. */
const DEFAULT_BP_PER_PX = 1.5;
/** Soft cap: beyond this, reads are almost always blocked by fetchSizeLimit. */
const MAX_USEFUL_BP_PER_PX = 40;

function getLgView(viewState) {
  return viewState?.session?.view ?? viewState?.view ?? null;
}

/**
 * Geneie-themed JBrowse 2 linear genome view for retained Module 1 markdup BAM.
 * Opens in a full dialog (not the bottom drawer) so pan/zoom is not clipped.
 * Snapshot is saved the first time the user opens the viewer (not on page load).
 */
const Module1IgvPanel = ({ conversationId, hasBam, genome: genomeHint }) => {
  const { isDark } = useTheme();
  const [open, setOpen] = useState(false);
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
  }, [open, conversationId, hasBam, genomeHint, isDark]);

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

  if (!hasBam) return null;

  return (
    <>
      <div
        className="mt-3 rounded-lg border"
        style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
        aria-label="Module 1 alignment viewer"
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              Alignment browser
            </p>
            <p className="text-2xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Open full interactive view · pan, zoom, and search while BAM is retained
              {bamMeta?.genome ? ` · ${bamMeta.genome}` : ''}.
            </p>
          </div>
          <Maximize2 className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
        </button>
      </div>

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
                  {snapshotStatus ? ` ${snapshotStatus}` : ''}
                </DialogDescription>
              </div>
              <button
                type="button"
                onClick={resetView}
                disabled={!viewState || !bamMeta}
                className="shrink-0 inline-flex items-center gap-1 text-2xs px-2 py-1 rounded-md border mt-0.5 disabled:opacity-40"
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
          </DialogHeader>

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
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Module1IgvPanel;
