/**
 * Cell formatting helpers shared by the Results table and the Variants filter bar.
 * Everything here is presentation only: the raw value is always what gets copied, sorted and exported.
 */

export const NUM_RE = /^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;

const MISSING = new Set(['', '.', 'na', 'n/a', 'nan', 'null', 'none', 'not_available']);
export const isMissing = (v) => v == null || MISSING.has(String(v).trim().toLowerCase());

/* ---------------------------------------------------------------- pathogenicity classes */

/** "LIKELY_PATHOGENIC", "Likely pathogenic" and "likely-pathogenic" all normalise to one key. */
const classKey = (v) => String(v ?? '').trim().toLowerCase().replace(/[\s_\-/]+/g, ' ');

/**
 * Status for an ACMG / ClinVar style class string, or null when the value is not a class.
 * tone: path | likely-path | vus | likely-benign | benign | conflict | none
 */
export function classStatus(value) {
  const k = classKey(value);
  if (!k) return null;
  let tone = null;
  if (/conflict/.test(k)) tone = 'conflict';
  else if (/^(pathogenic or likely pathogenic|likely pathogenic or pathogenic)$/.test(k)) tone = 'likely-path';
  else if (/^likely pathogenic/.test(k) || /^pathogenic.*likely/.test(k)) tone = 'likely-path';
  else if (/^pathogenic/.test(k)) tone = 'path';
  else if (/benign or likely benign|likely benign or benign/.test(k)) tone = 'likely-benign';
  else if (/^likely benign/.test(k)) tone = 'likely-benign';
  else if (/^benign/.test(k)) tone = 'benign';
  else if (/uncertain|^vus$|^us$/.test(k)) tone = 'vus';
  else if (/not provided|not available|no assertion|^not /.test(k)) tone = 'none';
  else if (/drug response|risk factor|association|protective|affects|other/.test(k)) tone = 'none';
  if (!tone) return null;
  const text = String(value).trim().replace(/_/g, ' ');
  const label = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  return { tone, label: tone === 'vus' && /^vus$/i.test(text) ? 'VUS' : label };
}

/** Status pill look per tone. Colour is never the only carrier: the label is always printed. */
export const CLASS_TONE_CLASS = {
  path: 'bg-[var(--error-soft)] text-[var(--error)] border-[color-mix(in_srgb,var(--error)_22%,transparent)]',
  'likely-path': 'bg-[var(--warning-soft)] text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_24%,transparent)]',
  vus: 'bg-[var(--info-soft)] text-[var(--info)] border-[color-mix(in_srgb,var(--info)_22%,transparent)]',
  'likely-benign': 'bg-[var(--success-soft)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_22%,transparent)]',
  benign: 'bg-[var(--success-soft)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_22%,transparent)]',
  conflict: 'bg-[var(--warning-soft)] text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_24%,transparent)] border-dashed',
  none: 'bg-[hsl(var(--wb-pill))] text-muted-foreground border-[hsl(var(--wb-line))]',
};

/* ---------------------------------------------------------------- column kinds */

const GENE_RE = /^(gene|gene_?symbol|symbol|gene_?name)$/i;
const CLASS_RE = /(interpretation|classification|significance|acmg|clnsig|pathogenicity)$|^(acmg|clinvar)(_|$)/i;
const FREQ_RE = /freq|gnomad|(^|_)af($|_)|allele_?f|(^|_)maf($|_)/i;
const HGVS_RE = /^hgvs/i;
const MONO_RE = /hgvs|(^|_)(id|rsid|ref|alt|chrom|cdna|seq|sequence|transcript)($|_)|^rs_?|dbsnp|variant_?id|^(chr|contig|chrom|start|end|pos|position)$/i;
const COORD_RE = /^(chr|chrom|contig|start|end|pos|position)$/i;

/**
 * What a column is, from its name and a sample of its values.
 * gene | class | freq | hgvs | coord | id | number | text
 * `isNumber` is the caller's own numeric decision (it already looked at the values).
 */
export function columnKind(name, sample = [], isNumber = false) {
  const vals = sample.filter((v) => !isMissing(v));
  if (GENE_RE.test(name)) return 'gene';
  if (HGVS_RE.test(name)) return 'hgvs';
  if (COORD_RE.test(name)) return 'coord';
  if (FREQ_RE.test(name) && (isNumber || vals.some((v) => parseFreq(v) != null))) return 'freq';
  if (CLASS_RE.test(name) && vals.length && vals.filter((v) => classStatus(v)).length / vals.length >= 0.6) return 'class';
  if (!isNumber && vals.length >= 4 && vals.filter((v) => classStatus(v)).length / vals.length >= 0.85) return 'class';
  if (MONO_RE.test(name)) return 'id';
  return isNumber ? 'number' : 'text';
}

export const isMonoKind = (kind) => kind === 'hgvs' || kind === 'coord' || kind === 'id';
export const isMonoName = (name) => MONO_RE.test(name);

/* ---------------------------------------------------------------- allele frequency */

/**
 * One number from a frequency cell. Accepts "0.0023", "8.99e-5" and annotation blobs such as
 * "GNOMAD_E_SAS=0.0023,GNOMAD_G_AFR=0.0024" (the highest population wins, which is the safe reading
 * for a rarity filter). Returns null when nothing numeric is there.
 */
export function parseFreq(v) {
  if (isMissing(v)) return null;
  const s = String(v).trim();
  if (NUM_RE.test(s)) return Number(s);
  let best = null;
  for (const m of s.matchAll(/=\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && (best == null || n > best)) best = n;
  }
  return best;
}

/** Human frequency: 0.0023 stays 0.0023; tiny values use scientific form. */
export function formatFreq(n) {
  if (n == null || !Number.isFinite(n)) return '';
  if (n === 0) return '0';
  const a = Math.abs(n);
  if (a >= 0.01) return String(Number(n.toPrecision(3)));
  if (a >= 0.001) return String(Number(n.toPrecision(2)));
  return n.toExponential(1).replace('e-', 'e-').replace('+', '');
}

/**
 * Log-scale bar fill (0..1) over the observed span, so 1e-5 and 1e-1 both read. A zero or missing value
 * has no bar. The caller passes the min and max seen in the loaded rows.
 */
export function freqFill(n, lo, hi) {
  if (n == null || !(n > 0) || !(lo > 0) || !(hi > lo)) return n > 0 ? 1 : 0;
  const t = (Math.log10(n) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
  return Math.max(0.06, Math.min(1, t));
}

/* ---------------------------------------------------------------- HGVS and numbers */

/**
 * Compact an annotation-style HGVS ("GENE:ENST00000506757.7:c.1520T>C:p.(Phe507Ser)") to the part a
 * clinician reads ("c.1520T>C  p.(Phe507Ser)"). The gene and transcript stay in the tooltip, the row
 * detail and the copied value. Anything that does not look like that is returned untouched.
 */
export function compactHgvs(v) {
  const s = String(v ?? '');
  const m = s.match(/^[^:\s]+:(?:ENST|NM_|NR_|XM_|ENSG)[\w.]+:(c\.[^:]+)(?::(p\..+))?$/);
  if (!m) return null;
  return { c: m[1], p: m[2] || '' };
}

/** Numbers read at 4 significant digits; large integers and ids keep full digits. */
export function formatNumber(raw) {
  const s = String(raw ?? '').trim();
  if (!NUM_RE.test(s)) return s;
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  if (Number.isInteger(n) && !/e/i.test(s)) return s.length > 9 ? n.toExponential(2).replace('e+', 'e') : s;
  const a = Math.abs(n);
  if (a !== 0 && (a < 1e-3 || a >= 1e7)) return n.toExponential(2).replace('e+', 'e');
  return String(Number(n.toPrecision(4)));
}

/* ---------------------------------------------------------------- detail groups */

/** Row-detail sections. First match wins; anything left over lands in "Other". */
export const DETAIL_GROUPS = [
  ['Identity', /^(gene|gene_?symbol|symbol|id|vcf_?id|rs_?id|rsid|dbsnp.*|variant_?id|contig|chr|chrom|start|end|pos|position|ref|alt|hgvs.*|transcript.*|entrez.*|filter|qual)$/i],
  ['Clinical', /acmg|clinvar|class|interpret|signific|moi|inherit|genotype|zygos|pathogen|disease|whitelist|contributing|functional|conseq|effect|impact|change_length/i],
  ['Frequency', /freq|gnomad|(^|_)af($|_)|allele|maf/i],
  ['Scores', /score|rank|cadd|revel|loeuf|constraint|p-?value|(^|_)path/i],
];
export function detailGroupOf(name) {
  for (const [label, re] of DETAIL_GROUPS) if (re.test(name)) return label;
  return 'Other';
}
