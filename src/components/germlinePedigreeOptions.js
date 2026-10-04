/** Pedigree / family fields for Germline sample metadata (Track 14.7 / Oct2_PedigreeRelated). */

export const YES_NO_UNKNOWN = [
  { value: 'Yes', label: 'Yes' },
  { value: 'No', label: 'No' },
  { value: 'Unknown', label: 'Unknown' },
];

export const PARENTS_AVAILABLE_OPTIONS = [
  { value: 'Both', label: 'Both' },
  { value: 'Mother only', label: 'Mother only' },
  { value: 'Father only', label: 'Father only' },
  { value: 'No', label: 'No' },
  { value: 'Unknown', label: 'Unknown' },
];

export const PARENT_AFFECTED_OPTIONS = [
  { value: 'Affected', label: 'Affected' },
  { value: 'Unaffected', label: 'Unaffected' },
  { value: 'Unknown', label: 'Unknown' },
  { value: 'Not available', label: 'Not available' },
];

export const TRIO_FAMILY_ANALYSIS_OPTIONS = [
  { value: 'Proband only', label: 'Proband only' },
  { value: 'Duo - mother', label: 'Duo - mother' },
  { value: 'Duo - father', label: 'Duo - father' },
  { value: 'Trio', label: 'Trio' },
  { value: 'Extended family', label: 'Extended family' },
  { value: 'Unknown', label: 'Unknown' },
];

export const SEGREGATION_TESTING_OPTIONS = [
  { value: 'Yes', label: 'Yes' },
  { value: 'No', label: 'No' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Unknown', label: 'Unknown' },
];

export const DE_NOVO_STATUS_OPTIONS = [
  { value: 'Confirmed de novo', label: 'Confirmed de novo' },
  { value: 'Suspected de novo', label: 'Suspected de novo' },
  { value: 'Inherited', label: 'Inherited' },
  { value: 'Unknown', label: 'Unknown' },
  { value: 'Not assessed', label: 'Not assessed' },
];

export const SEGREGATION_RESULT_OPTIONS = [
  { value: 'Supports variant', label: 'Supports variant' },
  { value: 'Does not support variant', label: 'Does not support variant' },
  { value: 'Inconclusive', label: 'Inconclusive' },
  { value: 'Not done', label: 'Not done' },
];

export const EMPTY_PEDIGREE_FIELDS = {
  familyHistory: '',
  consanguinity: '',
  parentsAvailable: '',
  motherAffectedStatus: '',
  fatherAffectedStatus: '',
  affectedSiblingsCount: '',
  unaffectedSiblingsCount: '',
  trioFamilyAnalysisType: '',
  segregationTesting: '',
  deNovoStatus: '',
  segregationResult: '',
};

export function pickPedigreeFields(meta = {}) {
  return {
    familyHistory: meta.familyHistory || '',
    consanguinity: meta.consanguinity || '',
    parentsAvailable: meta.parentsAvailable || '',
    motherAffectedStatus: meta.motherAffectedStatus || '',
    fatherAffectedStatus: meta.fatherAffectedStatus || '',
    affectedSiblingsCount:
      meta.affectedSiblingsCount === 0 || meta.affectedSiblingsCount
        ? String(meta.affectedSiblingsCount)
        : '',
    unaffectedSiblingsCount:
      meta.unaffectedSiblingsCount === 0 || meta.unaffectedSiblingsCount
        ? String(meta.unaffectedSiblingsCount)
        : '',
    trioFamilyAnalysisType: meta.trioFamilyAnalysisType || '',
    segregationTesting: meta.segregationTesting || '',
    deNovoStatus: meta.deNovoStatus || '',
    segregationResult: meta.segregationResult || '',
  };
}

/** Normalize for API / Mongo: integers for counts; clear segregationResult unless testing=Yes. */
export function pedigreeFieldsForSubmit(meta = {}) {
  const toCount = (v) => {
    if (v === '' || v == null) return '';
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return '';
    return Math.floor(n);
  };
  const testing = meta.segregationTesting || '';
  return {
    familyHistory: meta.familyHistory || '',
    consanguinity: meta.consanguinity || '',
    parentsAvailable: meta.parentsAvailable || '',
    motherAffectedStatus: meta.motherAffectedStatus || '',
    fatherAffectedStatus: meta.fatherAffectedStatus || '',
    affectedSiblingsCount: toCount(meta.affectedSiblingsCount),
    unaffectedSiblingsCount: toCount(meta.unaffectedSiblingsCount),
    trioFamilyAnalysisType: meta.trioFamilyAnalysisType || '',
    segregationTesting: testing,
    deNovoStatus: meta.deNovoStatus || '',
    segregationResult: testing === 'Yes' ? meta.segregationResult || '' : '',
  };
}
