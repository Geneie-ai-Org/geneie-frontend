import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { fetchModule1BamArtifacts } from '@/services/backendApi';

/**
 * Embedded igv.js alignment view for retained Module 1 markdup BAM.
 * Loads only when the user expands the panel (keeps the stepper light).
 * Presigned URLs refresh via promise-valued track urls when IGV re-fetches.
 */
const Module1IgvPanel = ({ conversationId, hasBam, genome: genomeHint }) => {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);
  const browserRef = useRef(null);

  useEffect(() => {
    if (!expanded || !conversationId || !hasBam) return undefined;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const igv = (await import('igv')).default;
        if (cancelled) return;

        const refreshUrls = async () => {
          const data = await fetchModule1BamArtifacts(conversationId);
          if (!data?.has_bam || !data.bam_url || !data.bai_url) {
            throw new Error(data?.message || 'Alignment BAM is not available.');
          }
          return data;
        };

        const initial = await refreshUrls();
        if (cancelled) return;

        if (browserRef.current) {
          try {
            igv.removeBrowser(browserRef.current);
          } catch {
            /* ignore */
          }
          browserRef.current = null;
        }
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }

        const igvGenome = (initial.genome || genomeHint || 'hg38').toLowerCase() === 'hg19' ? 'hg19' : 'hg38';
        const sample = initial.sample_name || 'Alignments';

        const browser = await igv.createBrowser(containerRef.current, {
          genome: igvGenome,
          locus: igvGenome === 'hg19' ? 'chr17:7,571,720-7,579,900' : 'chr17:7,668,402-7,675,520',
          showNavigation: true,
          showRuler: true,
          tracks: [
            {
              name: sample,
              type: 'alignment',
              format: 'bam',
              // Promise-valued urls so IGV can refresh after presign expiry.
              url: async () => (await refreshUrls()).bam_url,
              indexURL: async () => (await refreshUrls()).bai_url,
              height: 200,
            },
          ],
        });
        if (cancelled) {
          igv.removeBrowser(browser);
          return;
        }
        browserRef.current = browser;
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Could not open IGV.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      const browser = browserRef.current;
      browserRef.current = null;
      if (browser) {
        import('igv')
          .then((mod) => {
            try {
              mod.default.removeBrowser(browser);
            } catch {
              /* ignore */
            }
          })
          .catch(() => {});
      }
    };
  }, [expanded, conversationId, hasBam, genomeHint]);

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
            Alignment (IGV)
          </p>
          <p className="text-2xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            View the markdup BAM while it is still retained.
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
        <div className="px-3 pb-3">
          {loading && (
            <div className="flex items-center gap-2 py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
              <span className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
                Loading IGV…
              </span>
            </div>
          )}
          {error && (
            <p className="text-2xs py-2" style={{ color: 'var(--error)' }}>
              {error}
            </p>
          )}
          <div
            ref={containerRef}
            className="module1-igv-root rounded-md overflow-hidden"
            style={{ minHeight: expanded && !error ? 280 : 0 }}
          />
        </div>
      )}
    </div>
  );
};

export default Module1IgvPanel;
