/**
 * Translate backend/API error strings into user-facing copy.
 * Add entries to FRIENDLY_ERROR_MAP as new dev-oriented messages surface.
 */

const FRIENDLY_ERROR_MAP = [
  {
    // e.g. "Cannot apply filter: missing required columns: ['CLNSIG or InterVar_automated', 'gnomad41_genome_AF']"
    match: /missing required columns:\s*\[([^\]]*)\]/i,
    transform: (m) => {
      const raw = (m[1] || '').trim();
      const cols = raw
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
      if (cols.length === 0) {
        return "This filter needs annotations we couldn't find in your file. Run ANNOVAR first.";
      }
      const list = cols.length === 1
        ? cols[0]
        : cols.length === 2
          ? `${cols[0]} and ${cols[1]}`
          : `${cols.slice(0, -1).join(', ')}, and ${cols[cols.length - 1]}`;
      return `This filter needs annotations we couldn't find in your file: ${list}. Run ANNOVAR first, then try again.`;
    },
  },
];

export function humanizeError(msg) {
  if (!msg || typeof msg !== 'string') return msg;
  for (const rule of FRIENDLY_ERROR_MAP) {
    const m = msg.match(rule.match);
    if (m) return rule.transform ? rule.transform(m) : rule.text;
  }
  return msg;
}

export function apiErrorDetailToMessage(detail) {
  if (!detail) return null;
  if (typeof detail === 'string') return humanizeError(detail);
  if (Array.isArray(detail)) {
    const parts = detail
      .map((d) => (typeof d === 'string' ? d : d?.msg || d?.message))
      .filter(Boolean);
    return parts.length ? humanizeError(parts.join(', ')) : null;
  }
  if (typeof detail === 'object') {
    if (typeof detail.message === 'string') return humanizeError(detail.message);
    if (typeof detail.msg === 'string') return humanizeError(detail.msg);
    if (typeof detail.error === 'string') return humanizeError(detail.error);
  }
  return null;
}
