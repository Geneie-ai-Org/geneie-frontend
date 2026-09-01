/** User-facing copy for the phenotype-driven filter (filter_3). Internal keys stay `exomiser`. */

export const PHENOTYPE_FILTER_DISPLAY_NAME = 'Phenotype';

export const PHENOTYPE_FILTER_DESCRIPTION =
  'Phenotype-driven variant prioritization for Germline cases using HPO terms and AI gene/variant scoring. Requires ANNOVAR annotation and a phenotype description.';

export const ACMG_PHENOTYPE_APPLIES_LABEL = 'ACMG / Phenotype applies';

export function formatAcmgPhenotypeMeterLabel(remaining, limit) {
  return `${remaining} of ${limit} ${ACMG_PHENOTYPE_APPLIES_LABEL} left`;
}

export const PHENOTYPE_STARTING_MESSAGE = 'Starting phenotype prioritization…';
export const PHENOTYPE_RUNNING_MESSAGE = 'Phenotype prioritization is running…';
export const PHENOTYPE_COMPLETE_MESSAGE = 'Phenotype prioritization complete.';
export const PHENOTYPE_FAILED_TITLE = 'Phenotype prioritization failed';
export const PHENOTYPE_FAILED_FALLBACK = 'Phenotype prioritization did not complete successfully.';
