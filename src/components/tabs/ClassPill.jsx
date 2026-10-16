import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Variant classification pills. Colour carries meaning only (pathogenic family = error tone, VUS =
 * warning, benign family = success), and it is never the only cue: every class has its own glyph
 * shape and its word. Used by Triage and the ACMG mode.
 */

export const CLASS_TONES = {
  pathogenic: { label: 'Pathogenic', bg: 'var(--error-soft)', fg: 'var(--error)' },
  likely_pathogenic: { label: 'Likely pathogenic', bg: 'var(--error-soft)', fg: 'var(--error)' },
  vus: { label: 'VUS', bg: 'var(--warning-soft)', fg: 'var(--warning)' },
  likely_benign: { label: 'Likely benign', bg: 'var(--success-soft)', fg: 'var(--success)' },
  benign: { label: 'Benign', bg: 'var(--success-soft)', fg: 'var(--success)' },
  other: { label: 'Unclassified', bg: 'hsl(var(--wb-pill))', fg: 'hsl(var(--muted-foreground))' },
};

/** Map a free-text classification (ClinVar, InterVar, GA ACMG) onto one of the known classes. */
export function classKey(raw) {
  const s = String(raw || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (!s || s === 'n/a' || s === 'na' || s === '.') return null;
  if (s.includes('conflict')) return 'other';
  if (s.includes('likely pathogenic') || s === 'lp') return 'likely_pathogenic';
  if (s.includes('pathogenic')) return 'pathogenic';
  if (s.includes('likely benign') || s === 'lb') return 'likely_benign';
  if (s.includes('benign')) return 'benign';
  if (s.includes('vus') || s.includes('uncertain')) return 'vus';
  return 'other';
}

/** A 12px glyph whose shape (not its colour) tells the classes apart. */
export function ClassGlyph({ k, className }) {
  const common = { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': true, className: cn('shrink-0', className) };
  switch (k) {
    case 'pathogenic': // solid dot
      return <svg {...common}><circle cx="6" cy="6" r="4.2" fill="currentColor" /></svg>;
    case 'likely_pathogenic': // half dot
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6 2a4 4 0 0 1 0 8z" fill="currentColor" />
        </svg>
      );
    case 'vus': // ring with a bar
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M4 6h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'likely_benign': // ring with a check
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M4.2 6.2l1.3 1.3 2.4-2.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'benign': // solid square-ish check
      return (
        <svg {...common}>
          <rect x="1.6" y="1.6" width="8.8" height="8.8" rx="2.6" fill="currentColor" />
          <path d="M4 6.2l1.4 1.4 2.6-3" fill="none" stroke="hsl(var(--wb-card))" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default: // dashed ring
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 2" />
        </svg>
      );
  }
}

/** One class as a pill: glyph, word, optional count. `kept={false}` draws it dashed and struck back (left out). */
export function ClassPill({ k, children, count, kept = true, size = 'md', title, className }) {
  const t = CLASS_TONES[k] || CLASS_TONES.other;
  const h = size === 'sm' ? 'h-[22px] text-[12px]' : 'h-7 text-[13px]';
  return (
    <span
      title={title}
      className={cn('inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full border px-2.5 font-medium tabular-nums', h, !kept && 'border-dashed', className)}
      style={
        kept
          ? { background: t.bg, color: t.fg, borderColor: `color-mix(in srgb, ${t.fg} 24%, transparent)` }
          : { background: 'transparent', color: 'hsl(var(--muted-foreground))', borderColor: 'hsl(var(--wb-line-strong))' }
      }
    >
      <ClassGlyph k={k} />
      <span className="truncate">{children ?? t.label}</span>
      {count != null ? <span className={kept ? 'opacity-80' : ''}>{count}</span> : null}
    </span>
  );
}

/**
 * A stacked pill bar. segments: [{ key, label, value, fill, hatch? }]. The bar is decorative to
 * assistive tech (the legend and `summary` carry the same numbers as text). Segments are
 * separated by a surface-coloured gap so neighbours never rely on hue alone.
 */
export function StackedBar({ segments, summary, className, height = 8 }) {
  const total = segments.reduce((a, s) => a + Math.max(0, Number(s.value) || 0), 0);
  if (total <= 0) return null;
  return (
    <div className={className}>
      <div
        role="img"
        aria-label={summary}
        className="flex w-full gap-[2px] overflow-hidden rounded-full"
        style={{ height }}
      >
        {segments.filter((s) => Number(s.value) > 0).map((s) => (
          <span
            key={s.key}
            className="block h-full min-w-[4px] transition-[width] duration-500 motion-reduce:transition-none first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(Number(s.value) / total) * 100}%`,
              background: s.hatch
                ? `repeating-linear-gradient(135deg, ${s.fill} 0 2px, transparent 2px 5px)`
                : s.fill,
              boxShadow: s.hatch ? `inset 0 0 0 1px ${s.fill}` : undefined,
            }}
          />
        ))}
      </div>
    </div>
  );
}
