import React from 'react';

/**
 * Decorative genome scene for the hero: a ruler, a gene model (exons joined by an intron line)
 * and three variant lollipops. Pure inline SVG with token colours, no text, hidden from assistive
 * tech. It is laid out so that only its lower and right edges show from behind the preview card.
 */
export default function HeroGenome({ className = '' }) {
  const exons = [
    [56, 38],
    [142, 24],
    [214, 58],
    [318, 30],
    [392, 46],
  ];
  const pins = [
    { x: 75, h: 62, solid: true },
    { x: 346, h: 44, solid: false },
    { x: 415, h: 78, solid: true },
  ];
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      viewBox="0 62 520 128"
      preserveAspectRatio="xMidYMax meet"
      fill="none"
    >
      <defs>
        <pattern id="pub-ruler" width="10" height="14" patternUnits="userSpaceOnUse">
          <path d="M0.5 14V10" className="pub-g-line" strokeWidth="1" />
        </pattern>
        <pattern id="pub-ruler-major" width="50" height="14" patternUnits="userSpaceOnUse">
          <path d="M0.5 14V4" className="pub-g-ink" strokeWidth="1" />
        </pattern>
      </defs>

      {/* ruler */}
      <rect x="0" y="118" width="520" height="14" fill="url(#pub-ruler)" />
      <rect x="0" y="118" width="520" height="14" fill="url(#pub-ruler-major)" />
      <path d="M0 132.5H520" className="pub-g-line" strokeWidth="1" />

      {/* gene model */}
      <path d="M20 160H500" className="pub-g-ink" strokeWidth="1.25" strokeDasharray="1 5" strokeLinecap="round" />
      {exons.map(([x, w]) => (
        <rect key={x} x={x} y="152" width={w} height="16" rx="4" className="pub-g-fill" strokeWidth="1" />
      ))}

      {/* variants */}
      {pins.map((p) => (
        <g key={p.x}>
          <path d={`M${p.x} 152V${152 - p.h}`} className="pub-g-ink" strokeWidth="1.25" />
          <circle cx={p.x} cy={152 - p.h} r="5" className={p.solid ? 'pub-g-dot' : 'pub-g-dot--ring'} strokeWidth="1.5" />
        </g>
      ))}
    </svg>
  );
}
