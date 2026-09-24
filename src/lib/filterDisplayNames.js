/** User-facing copy for the phenotype-driven filter (filter_3). Internal keys stay `exomiser`. */

export const PHENOTYPE_FILTER_DISPLAY_NAME = 'Phenotype';

export const PHENOTYPE_FILTER_DESCRIPTION =
  'Phenotype-driven variant prioritization for Germline cases using HPO terms and AI gene/variant scoring. Requires annotation and a phenotype description.';

export const ACMG_PHENOTYPE_APPLIES_LABEL = 'ACMG / Phenotype applies';

export function formatAcmgPhenotypeMeterLabel(remaining, limit) {
  return `${remaining} of ${limit} ${ACMG_PHENOTYPE_APPLIES_LABEL} left`;
}

export const PHENOTYPE_STARTING_MESSAGE = 'Starting phenotype prioritization…';
export const PHENOTYPE_RUNNING_MESSAGE = 'Running phenotype prioritization…';
export const PHENOTYPE_COMPLETE_MESSAGE = 'Phenotype prioritization complete.';
export const PHENOTYPE_FAILED_TITLE = 'Phenotype prioritization failed';
export const PHENOTYPE_FAILED_FALLBACK = 'Phenotype prioritization did not complete successfully.';

/**
 * Rewrite backend job messages that still say "Exomiser" into Phenotype-driven copy.
 * Internal keys/APIs may keep `exomiser`; user-facing UI must not.
 */
export function sanitizePhenotypeStatusMessage(message, fallback = PHENOTYPE_RUNNING_MESSAGE) {
  if (!message || typeof message !== 'string') return fallback;
  let m = message.trim();
  if (!m) return fallback;
  if (!/exomiser/i.test(m)) return m;

  const replacements = [
    [/Running Exomiser prioritization/gi, 'Running phenotype prioritization'],
    [/Your Exomiser request is queued/gi, 'Your phenotype prioritization request is queued'],
    [/Preparing variants for Exomiser/gi, 'Preparing variants for phenotype prioritization'],
    [/Saving Exomiser results/gi, 'Saving phenotype prioritization results'],
    [/Applying Exomiser filter to your variants/gi, 'Applying phenotype filter to your variants'],
    [/Exomiser finished:/gi, 'Phenotype prioritization finished:'],
    [/Exomiser filter complete/gi, 'Phenotype prioritization complete'],
    [/Exomiser failed/gi, 'Phenotype prioritization failed'],
    [/Exomiser analysis in progress/gi, 'Phenotype prioritization in progress'],
    [/\bExomiser\b/gi, 'phenotype prioritization'],
  ];
  for (const [re, to] of replacements) {
    m = m.replace(re, to);
  }
  return m;
}
