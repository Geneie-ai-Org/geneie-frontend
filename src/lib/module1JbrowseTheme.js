/**
 * Map Geneie CSS tokens → JBrowse 2 MUI theme (light + dark).
 * Read computed styles so we stay in sync with index.css / .dark.
 */

function cssVar(name, fallback) {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw || fallback;
}

/**
 * Resolve a CSS colour expression (`hsl(var(--wb-card))`, `var(--error)`) to a concrete `rgb()` string.
 * MUI parses palette colours itself (contrast text, alpha, lighten) and chokes on the space-separated
 * `hsl(174 42% 51%)` form and on unresolved var() references, so every token goes through a probe element
 * and comes back as `rgb(...)`.
 */
function resolveColor(expr, fallback) {
  if (typeof document === 'undefined') return fallback;
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;color:' + fallback;
  probe.style.color = expr;
  document.body.appendChild(probe);
  const out = getComputedStyle(probe).color;
  probe.remove();
  return out && out.startsWith('rgb') ? out : fallback;
}

const hsl = (token) => `hsl(var(${token}))`;

/**
 * Map Geneie tokens to the JBrowse 2 MUI theme (light + dark). What each slot paints in the embedded view:
 *   secondary.main        the frame around the view (EmbeddedViewContainer); it was the teal accent, which
 *                         read as a tinted border, so it is the neutral pill tone now
 *   secondary.contrastText  the view title on that frame
 *   background.paper      the view body, header and mini controls (matches the card tone)
 *   tertiary              accordion headers in the feature widgets, rubberband selection, overview scalebar
 *   primary               toolbar and primary buttons
 * `light`/`dark` stay filled on every colour: the overview polygon paints with `tertiary.light`, and a
 * missing one renders solid black.
 */
export function buildGeneieJbrowseConfiguration(isDark) {
  const color = (token, fb) => resolveColor(hsl(token), fb);
  const paper = color('--wb-card', isDark ? '#202121' : '#ffffff');
  const canvas = color('--wb-bg', isDark ? '#181919' : '#f3f5f5');
  const frame = color('--wb-pill', isDark ? '#262828' : '#eff1f1');
  const line = color('--wb-line', isDark ? '#333535' : '#dfe3e3');
  const ink = color('--foreground', isDark ? '#ebebeb' : '#171717');
  const inkMuted = color('--muted-foreground', isDark ? '#a1a1a1' : '#6b6b6b');
  const brandSolid = color('--brand-solid', '#2d6460');
  const brandMid = color('--brand-500', '#4f9d96');
  const brandSoft = color('--brand-300', '#a1c9c5');
  const onBrand = color('--on-brand', isDark ? '#141414' : '#ffffff');
  const error = resolveColor('var(--error)', '#9f2f2d');

  const tone = (main, light, dark, contrastText) => ({ main, light, dark, contrastText });
  const primary = tone(brandSolid, brandMid, brandSolid, onBrand);
  const secondary = tone(frame, frame, line, ink);
  const tertiary = tone(brandSolid, brandSoft, brandSolid, onBrand);
  const quaternary = tone(error, error, error, onBrand);
  // Overview box, ruler labels and selection use `highlight` (stock: mandarin orange).
  const highlight = tone(brandMid, brandSoft, brandSolid, onBrand);

  return {
    theme: {
      palette: {
        mode: isDark ? 'dark' : 'light',
        primary,
        secondary,
        tertiary,
        quaternary,
        highlight,
        background: { default: canvas, paper },
        divider: line,
        text: { primary: ink, secondary: inkMuted },
        ...(isDark ? { dark: { primary, secondary } } : {}),
      },
      typography: {
        fontSize: 12,
        fontFamily: cssVar('--font-sans', 'Geist Variable, ui-sans-serif, system-ui, sans-serif'),
      },
      components: {
        // The frame is a Paper at elevation 12: drop its heavy shadow, and MUI's dark-mode white overlay
        // gradient, so the frame is exactly the token tone in both themes. Menus keep their own elevation.
        MuiPaper: {
          styleOverrides: {
            root: { backgroundImage: 'none' },
            elevation12: { boxShadow: 'none' },
          },
        },
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
