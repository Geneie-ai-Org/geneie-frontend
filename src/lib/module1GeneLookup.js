/**
 * Resolve a gene symbol to a JBrowse locString via MyGene.info (public, no API key).
 * Returns null when the gene is unknown or the genome build has no coords.
 */

import { normalizeChrom } from './module1IgvLocus.js';

const PAD_BP = 5_000;

function locFromInterval(chromRaw, start, end) {
  const chrom = normalizeChrom(chromRaw);
  const s = Number(start);
  const e = Number(end);
  if (!chrom || !Number.isFinite(s) || !Number.isFinite(e) || s <= 0 || e < s) return null;
  const left = Math.max(1, s - PAD_BP);
  const right = e + PAD_BP;
  return `${chrom}:${left}-${right}`;
}

/**
 * @param {string} symbol
 * @param {'hg19'|'hg38'|string} genome
 * @returns {Promise<{ locus: string, symbol: string, chrom: string, start: number, end: number }|null>}
 */
export async function lookupGeneLocus(symbol, genome = 'hg38') {
  const q = String(symbol || '').trim();
  if (!q || q.length > 40) return null;
  // Reject obvious coordinate pastes — those should use locus jump elsewhere.
  if (/^chr[\w]+[:-]/i.test(q) || /^\d+:\d+/.test(q)) return null;

  const url =
    `https://mygene.info/v3/query?q=symbol:${encodeURIComponent(q)}` +
    `&species=human&fields=symbol,genomic_pos,genomic_pos_hg19&size=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Gene lookup failed');
  const data = await res.json();
  const hit = Array.isArray(data?.hits) ? data.hits[0] : null;
  if (!hit) return null;

  const useHg19 = String(genome || '').toLowerCase() === 'hg19';
  let pos = useHg19 ? hit.genomic_pos_hg19 : hit.genomic_pos;
  if (Array.isArray(pos)) pos = pos[0];
  if (!pos || typeof pos !== 'object') return null;

  const locus = locFromInterval(pos.chr ?? pos.chrom, pos.start, pos.end);
  if (!locus) return null;
  return {
    locus,
    symbol: String(hit.symbol || q).toUpperCase(),
    chrom: normalizeChrom(pos.chr ?? pos.chrom),
    start: Number(pos.start),
    end: Number(pos.end),
  };
}
