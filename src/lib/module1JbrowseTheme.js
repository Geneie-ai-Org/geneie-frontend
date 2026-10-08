/**
 * Map Geneie CSS tokens → JBrowse 2 MUI theme (light + dark).
 * Read computed styles so we stay in sync with index.css / .dark.
 */

function cssVar(name, fallback) {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw || fallback;
}

/** Prefer brand tokens; fall back to hsl() channels used by shadcn. */
function brandColor(cssName, hslChannelsFallback, alphaFallback) {
  const direct = cssVar(cssName, '');
  if (direct && (direct.startsWith('#') || direct.startsWith('rgb') || direct.startsWith('hsl'))) {
    return direct;
  }
  if (hslChannelsFallback) {
    return `hsl(${hslChannelsFallback}${alphaFallback ? ` / ${alphaFallback}` : ''})`;
  }
  return '#2A9D8F';
}

export function buildGeneieJbrowseConfiguration(isDark) {
  const primary = brandColor('--accent-teal', cssVar('--primary', '174 42% 51%'));
  const secondary = brandColor('--accent-teal', cssVar('--chart-2', '174 43% 55%'));
  const error = brandColor('--error', cssVar('--destructive', '6 74% 73%'));

  // JBrowse overview polygon fills with `palette.tertiary.light`. If `light` is
  // missing it paints solid black — the wedge seen when zoomed way out.
  const brand = { main: primary, light: primary, dark: primary };
  const brandSecondary = { main: secondary, light: secondary, dark: secondary };
  const brandError = { main: error, light: error, dark: error };

  return {
    theme: {
      palette: {
        mode: isDark ? 'dark' : 'light',
        primary: brand,
        secondary: brandSecondary,
        tertiary: brand,
        quaternary: brandError,
        ...(isDark
          ? {
              dark: {
                primary: brand,
                secondary: brandSecondary,
              },
            }
          : {}),
      },
      typography: {
        fontSize: 12,
        fontFamily: cssVar('--font-sans', 'Geist Variable, ui-sans-serif, system-ui, sans-serif'),
      },
    },
  };
}

export function assemblyForGenome(genome) {
  const g = (genome || 'hg38').toLowerCase() === 'hg19' ? 'hg19' : 'hg38';
  if (g === 'hg19') {
    return {
      name: 'hg19',
      sequence: {
        type: 'ReferenceSequenceTrack',
        trackId: 'hg19-ref',
        adapter: {
          type: 'BgzipFastaAdapter',
          fastaLocation: {
            uri: 'https://jbrowse.org/genomes/hg19/fasta/hg19.fa.gz',
            locationType: 'UriLocation',
          },
          faiLocation: {
            uri: 'https://jbrowse.org/genomes/hg19/fasta/hg19.fa.gz.fai',
            locationType: 'UriLocation',
          },
          gziLocation: {
            uri: 'https://jbrowse.org/genomes/hg19/fasta/hg19.fa.gz.gzi',
            locationType: 'UriLocation',
          },
        },
      },
      refNameAliases: {
        adapter: {
          type: 'RefNameAliasAdapter',
          location: {
            uri: 'https://jbrowse.org/genomes/hg19/hg19_aliases.txt',
            locationType: 'UriLocation',
          },
        },
      },
    };
  }
  return {
    name: 'hg38',
    sequence: {
      type: 'ReferenceSequenceTrack',
      trackId: 'hg38-ref',
      adapter: {
        type: 'BgzipFastaAdapter',
        fastaLocation: {
          uri: 'https://jbrowse.org/genomes/GRCh38/fasta/hg38.prefix.fa.gz',
          locationType: 'UriLocation',
        },
        faiLocation: {
          uri: 'https://jbrowse.org/genomes/GRCh38/fasta/hg38.prefix.fa.gz.fai',
          locationType: 'UriLocation',
        },
        gziLocation: {
          uri: 'https://jbrowse.org/genomes/GRCh38/fasta/hg38.prefix.fa.gz.gzi',
          locationType: 'UriLocation',
        },
      },
    },
    refNameAliases: {
      adapter: {
        type: 'RefNameAliasAdapter',
        location: {
          uri: 'https://jbrowse.org/genomes/GRCh38/hg38_aliases.txt',
          locationType: 'UriLocation',
        },
      },
    },
  };
}

export function defaultLocusForGenome(genome) {
  return (genome || 'hg38').toLowerCase() === 'hg19'
    ? 'chr17:7,571,720-7,579,900'
    : 'chr17:7,668,402-7,675,520';
}
