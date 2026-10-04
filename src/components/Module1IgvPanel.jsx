import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { fetchModule1BamArtifacts } from '@/services/backendApi';
import { useTheme } from '@/hooks/useTheme';
import {
  assemblyForGenome,
  buildGeneieJbrowseConfiguration,
  defaultLocusForGenome,
} from '@/lib/module1JbrowseTheme';

/**
 * Geneie-themed JBrowse 2 linear genome view for retained Module 1 markdup BAM.
 * Live while BAM exists; after chat unlock the durable QC/alignment report remains.
 */
const Module1IgvPanel = ({ conversationId, hasBam, genome: genomeHint }) => {
  const { isDark } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [bamMeta, setBamMeta] = useState(null);
  const [JBrowse, setJBrowse] = useState(null);
  const [viewState, setViewState] = useState(null);

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
            Geneie-themed view of the markdup BAM while it is retained
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
          {!loading && !error && Browser && viewState && (
            <div className="module1-jbrowse-root rounded-md overflow-hidden min-h-[320px]">
              <Browser viewState={viewState} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Module1IgvPanel;
