/**
 * Pure helpers for choosing variants for the clinical report. Shared by the Report tab and the
 * legacy assignment modal so both read the same candidate payload the same way.
 */
export const INCLUDE = 'clinical_result';
export const ADDITIONAL = 'additional_finding';

export function rowKeyOf(row, index) {
  return row.row_key || `${row.id || 'row'}__${index}`;
}

/** Ranking suggestions -> { rowKey: bucket }. Only rows the ranking placed in a section are set. */
export function assignmentsFromSuggestions(rows) {
  const next = {};
  rows.forEach((row, index) => {
    const key = rowKeyOf(row, index);
    const section = row.suggested_section;
    if (section === INCLUDE) next[key] = INCLUDE;
    else if (section === ADDITIONAL) next[key] = ADDITIONAL;
  });
  return next;
}

export function whyText(row) {
  const caveats = Array.isArray(row.pfra_caveats) ? row.pfra_caveats : [];
  const parts = [];
  if (row.ga_label) parts.push(row.ga_label);
  if (row.ga_score != null && row.ga_score !== '') parts.push(`Score ${row.ga_score}`);
  if (row.phenotype_fit) parts.push(`Phenotype: ${row.phenotype_fit}`);
  if (caveats.length) parts.push(`Flags: ${caveats.join(' · ')}`);
  return parts.join('\n') || 'No GA rationale on this row';
}

export function rowLabel(row) {
  return (
    row.display_id ||
    (row.gene && row.hgvs ? `${row.gene} ${row.hgvs}` : null) ||
    row.hgvs ||
    row.gene ||
    row.id
  );
}

/** Assignments -> the two id lists the API takes. A variant is never in both; Include wins. */
export function selectedIdsFrom(candidates, assignments) {
  const clinical = [];
  const additional = [];
  const seenClinical = new Set();
  const seenAdditional = new Set();
  candidates.forEach((row, index) => {
    const key = rowKeyOf(row, index);
    const bucket = assignments[key];
    const vid = row.id;
    if (!vid) return;
    if (bucket === INCLUDE && !seenClinical.has(vid)) {
      seenClinical.add(vid);
      clinical.push(vid);
    } else if (bucket === ADDITIONAL && !seenAdditional.has(vid) && !seenClinical.has(vid)) {
      seenAdditional.add(vid);
      additional.push(vid);
    }
  });
  return { clinical, additional };
}
