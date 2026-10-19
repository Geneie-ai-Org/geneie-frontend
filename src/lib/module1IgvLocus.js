/**
 * Build a JBrowse locString for Module 1 alignment view from variant coords.
 * Padding keeps pileup under the BAM fetchSizeLimit (~40–80 kb window).
 */

const DEFAULT_PAD_BP = 40_000;

/** Normalize chrom to chrN / chrX style used by JBrowse assemblies. */
export function normalizeChrom(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const bare = s.replace(/^chr/i, '');
  if (!bare) return '';
  return `chr${bare}`;
}

/**
 * Parse ids shaped like `1:12345:A:G` or `chr1:12345:A:G` (variant_selection_id / coord_key).
 * Returns { chrom, pos } or null.
 */
export function parseGenomicAlleleKey(id) {
  const s = String(id || '').trim();
  if (!s) return null;
  const parts = s.split(':');
  if (parts.length < 2) return null;
  const chrom = normalizeChrom(parts[0]);
  const pos = Number(String(parts[1]).replace(/,/g, ''));
  if (!chrom || !Number.isFinite(pos) || pos <= 0) return null;
  return { chrom, pos: Math.floor(pos) };
}

/**
 * @param {{ chrom?: string, pos?: number|string, start?: number|string, variantId?: string, coordKey?: string, id?: string }} fields
 * @param {{ padBp?: number }} [opts]
 * @returns {string|null} locString e.g. chr17:7,668,000-7,675,000
 */
export function locusFromVariantFields(fields = {}, opts = {}) {
  const pad = Number.isFinite(opts.padBp) ? Math.max(500, opts.padBp) : DEFAULT_PAD_BP;
  let chrom = normalizeChrom(fields.chrom || fields.Chr || fields.chromosome);
  let pos = Number(String(fields.pos ?? fields.start ?? fields.Start ?? '').replace(/,/g, ''));

  if (!chrom || !Number.isFinite(pos) || pos <= 0) {
    const parsed =
      parseGenomicAlleleKey(fields.coordKey) ||
      parseGenomicAlleleKey(fields.variantId) ||
      parseGenomicAlleleKey(fields.variant_id) ||
      parseGenomicAlleleKey(fields.id) ||
      parseGenomicAlleleKey(fields.row_key);
    if (!parsed) return null;
    chrom = parsed.chrom;
    pos = parsed.pos;
  }

  const left = Math.max(1, pos - pad);
  const right = pos + pad;
  const fmt = (n) => String(n);
  return `${chrom}:${fmt(left)}-${fmt(right)}`;
}

/** Short user-facing expiry line from ISO bam_expires_at. */
export function bamExpiryCopy(bamExpiresAt, { hasBam = true } = {}) {
  if (!bamExpiresAt) {
    return hasBam
      ? 'Alignment available while BAM is retained.'
      : 'Alignment BAM is not available.';
  }
  const ends = new Date(bamExpiresAt);
  if (Number.isNaN(ends.getTime())) {
    return hasBam ? 'Alignment available for a limited time after calling.' : 'Alignment BAM is not available.';
  }
  const now = Date.now();
  if (ends.getTime() <= now) {
    return 'Alignment window ended (BAM removed).';
  }
  const days = Math.max(1, Math.ceil((ends.getTime() - now) / 86_400_000));
  const when = ends.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return `Alignment available ~${days} day${days === 1 ? '' : 's'} (until ${when}).`;
}
