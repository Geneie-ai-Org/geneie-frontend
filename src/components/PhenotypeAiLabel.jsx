import React from 'react';

/**
 * "Phenotype" with a small animated AI badge above — used in tabs, headings, and buttons.
 */
export default function PhenotypeAiLabel({
  variant = 'tab',
  className = '',
  textClassName = '',
  showAi = true,
}) {
  const isTab = variant === 'tab';
  const isHeading = variant === 'heading';
  const isInline = variant === 'inline';

  const textSize = isHeading
    ? 'text-sm font-bold'
    : isInline
      ? 'text-sm font-medium'
      : 'text-sm font-semibold';

  if (isInline) {
    return (
      <span className={`relative inline-flex items-end leading-none ${className}`} aria-label="Phenotype AI">
        {showAi && (
          <span
            className="phenotype-ai-badge absolute -top-2.5 left-1/2 -translate-x-1/2 rounded px-1 py-px text-[8px] font-bold uppercase tracking-wider text-[var(--accent-teal)]"
            aria-hidden
          >
            AI
          </span>
        )}
        <span className={`${textSize} ${textClassName}`}>Phenotype</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex flex-col items-center justify-center leading-none ${className}`}
      aria-label="Phenotype AI"
    >
      {showAi && (
        <span
          className={`phenotype-ai-badge mb-0.5 rounded px-1 py-px font-bold uppercase tracking-wider text-[var(--accent-teal)] ${
            isTab ? 'text-[8px]' : 'text-[9px]'
          }`}
          aria-hidden
        >
          AI
        </span>
      )}
      <span className={`${textSize} ${textClassName}`}>Phenotype</span>
    </span>
  );
}
