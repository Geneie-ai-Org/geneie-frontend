import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { toBlob } from 'html-to-image';
import { fetchModule1BamArtifacts, uploadModule1ReportFigure } from '@/services/backendApi';
import { useTheme } from '@/hooks/useTheme';
import {
  assemblyForGenome,
  buildGeneieJbrowseConfiguration,
  defaultLocusForGenome,
} from '@/lib/module1JbrowseTheme';

/**
 * Geneie-themed JBrowse 2 linear genome view for retained Module 1 markdup BAM.
 * Auto-opens once to capture a PNG into the durable QC report before purge.
 */
const Module1IgvPanel = ({ conversationId, hasBam, genome: genomeHint }) => {
  const { isDark } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [snapshotStatus, setSnapshotStatus] = useState(null);
  const [bamMeta, setBamMeta] = useState(null);
  const [JBrowse, setJBrowse] = useState(null);
  const [viewState, setViewState] = useState(null);
  const captureRootRef = useRef(null);
  const capturedRef = useRef(false);
  const autoOpenedRef = useRef(false);

  // Auto-expand once while BAM is live so we can save a browser snapshot.
  useEffect(() => {
    if (!hasBam || !conversationId || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    setExpanded(true);
  }, [hasBam, conversationId]);

  useEffect(() => {
    if (!expanded || !conversationId || !hasBam) return undefined;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setViewState(null);

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

        const state = createViewState({
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
              },
            },
          ],
          location: defaultLocusForGenome(assemblyName),
          defaultSession: {
            name: 'module1',
            view: {
              id: 'linearGenomeView',
              type: 'LinearGenomeView',
              bpPerPx: 0.5,
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

        setBamMeta({ sample, genome: assemblyName });
        setJBrowse(() => JBrowseLinearGenomeView);
        setViewState(state);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Could not open alignment viewer.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [expanded, conversationId, hasBam, genomeHint, isDark]);

  // Capture viewport → durable report (once per conversation while BAM live).
  useEffect(() => {
    if (!expanded || !viewState || !captureRootRef.current || capturedRef.current || loading || error) {
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
  }, [expanded, viewState, loading, error, conversationId, isDark, bamMeta]);

  const Browser = useMemo(() => JBrowse, [JBrowse]);

  if (!hasBam) return null;

  return (
    <div
      className="mt-3 rounded-lg border overflow-hidden"
      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
      aria-label="Module 1 alignment viewer"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="min-w-0">
          <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            Alignment browser
          </p>
          <p className="text-2xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Geneie-themed view · snapshot saved into the QC report before purge
            {bamMeta?.genome ? ` · ${bamMeta.genome}` : ''}.
          </p>
        </div>
        <ChevronDown
          className="w-4 h-4 shrink-0 transition-transform"
          style={{
            color: 'var(--text-tertiary)',
            transform: expanded ? 'rotate(180deg)' : 'none',
          }}
        />
      </button>

      {expanded && (
        <div className="px-2 pb-2">
          {loading && (
            <div className="flex items-center gap-2 py-6 justify-center">
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
          {snapshotStatus && (
            <p className="text-2xs px-1 pb-1" style={{ color: 'var(--text-tertiary)' }}>
              {snapshotStatus}
            </p>
          )}
          {!loading && !error && Browser && viewState && (
            <div
              ref={captureRootRef}
              className="module1-jbrowse-root rounded-md overflow-hidden min-h-[320px]"
            >
              <Browser viewState={viewState} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Module1IgvPanel;
