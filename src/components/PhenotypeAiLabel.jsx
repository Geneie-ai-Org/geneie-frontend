import React from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import AiDnaIcon from '@hugeicons/core-free-icons/AiDnaIcon';

/**
 * "Phenotype" marked as AI-driven — a leading DNA/AI glyph in tabs and inline button
 * labels, a stacked AI badge in headings.
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

  // Tab labels inherit size and weight from the tab button so the Phenotype tab
  // tracks the active/inactive state like the plain-text tabs beside it.
  const textSize = isHeading ? 'text-sm font-bold' : '';

  // The tab carries a leading glyph rather than an "AI" chip: at 340px the chip
  // collided with the word and pushed past the pill. The DNA-with-AI mark says what
  // this tab actually does, where a generic sparkle would only say "AI something".
  if (isTab) {
    return (
      <span
        className={`inline-flex items-center gap-1 leading-none ${className}`}
        aria-label="Phenotype AI"
      >
        {showAi && (
          <HugeiconsIcon
            icon={AiDnaIcon}
            size={14}
            strokeWidth={2}
            className="shrink-0 text-[var(--accent-teal)]"
            aria-hidden
          />
        )}
        <span className={`${textSize} ${textClassName}`}>Phenotype</span>
      </span>
    );
  }

  // Inline sits inside a sentence on a button ("Prioritize with Phenotype"). The old
  // floating badge broke out of the button's line box and split the baselines, so it
  // uses the same leading glyph as the tab and inherits the sentence's size/weight.
  if (isInline) {
    return (
      <span
        className={`inline-flex items-center gap-1 align-middle leading-none ${className}`}
        aria-label="Phenotype AI"
      >
        {showAi && (
          <HugeiconsIcon
            icon={AiDnaIcon}
            size={14}
            strokeWidth={2}
            className="shrink-0"
            aria-hidden
          />
        )}
        <span className={textClassName}>Phenotype</span>
      </span>
    );
  }

  // Heading uses the same leading glyph as the tab and inline variants — one mark for
  // Phenotype everywhere, instead of a stacked "AI" chip that read as a second logo.
  return (
    <span
      className={`inline-flex items-center gap-1.5 leading-none ${className}`}
      aria-label="Phenotype AI"
    >
      {showAi && (
        <HugeiconsIcon
          icon={AiDnaIcon}
          size={16}
          strokeWidth={2}
          className="shrink-0 text-[var(--accent-teal)]"
          aria-hidden
        />
      )}
      <span className={`${textSize} ${textClassName}`}>Phenotype</span>
    </span>
  );
}
