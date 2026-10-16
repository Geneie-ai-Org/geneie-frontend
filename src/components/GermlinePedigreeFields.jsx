import React, { useId } from 'react';
import {
  DE_NOVO_STATUS_OPTIONS,
  PARENT_AFFECTED_OPTIONS,
  PARENTS_AVAILABLE_OPTIONS,
  SEGREGATION_RESULT_OPTIONS,
  SEGREGATION_TESTING_OPTIONS,
  TRIO_FAMILY_ANALYSIS_OPTIONS,
  YES_NO_UNKNOWN,
} from '@/components/germlinePedigreeOptions';
import { Field, FieldGroup, TEXT_INPUT_CLASS, WizardSelect } from '@/components/UploadWizardKit';

/** Fields of the groups below that hold a value; lets callers show "n added". */
export function countPedigreeFieldsFilled(value = {}) {
  return [
    'familyHistory',
    'consanguinity',
    'parentsAvailable',
    'trioFamilyAnalysisType',
    'motherAffectedStatus',
    'fatherAffectedStatus',
    'affectedSiblingsCount',
    'unaffectedSiblingsCount',
    'segregationTesting',
    'segregationResult',
    'deNovoStatus',
  ].filter((key) => {
    const v = value?.[key];
    return v === 0 || (v !== '' && v != null);
  }).length;
}

/**
 * Pedigree / family fields for Germline sample information (Track 14.7), grouped as
 * Family and Segregation. The Individual group (role, affected status, inheritance) lives
 * with the caller. Render this inside a disclosure: it is optional detail, not a first screen.
 * `Select` must accept value/onChange/placeholder/options; it defaults to the shared WizardSelect.
 */
export default function GermlinePedigreeFields({ value, onChange, Select = WizardSelect }) {
  const uid = useId();
  const v = value || {};
  const set = (patch) => onChange({ ...v, ...patch });
  const id = (name) => `${uid}-${name}`;

  const select = (name, label, options, extra = {}) => (
    <Field label={label} htmlFor={id(name)}>
      <Select
        id={id(name)}
        value={v[name] || ''}
        onChange={(val) => set({ [name]: val, ...(extra.onChangePatch ? extra.onChangePatch(val) : {}) })}
        placeholder="Choose one"
        options={options}
      />
    </Field>
  );

  const countInput = (name, label) => (
    <Field label={label} htmlFor={id(name)}>
      <input
        id={id(name)}
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={v[name] ?? ''}
        onChange={(e) => set({ [name]: e.target.value })}
        className={`${TEXT_INPUT_CLASS} tabular-nums`}
        placeholder="0"
      />
    </Field>
  );

  return (
    <>
      <FieldGroup title="Family">
        {select('familyHistory', 'Family history', YES_NO_UNKNOWN)}
        {select('consanguinity', 'Consanguinity', YES_NO_UNKNOWN)}
        {select('parentsAvailable', 'Parents available', PARENTS_AVAILABLE_OPTIONS)}
        {select('trioFamilyAnalysisType', 'Trio / family analysis type', TRIO_FAMILY_ANALYSIS_OPTIONS)}
        {select('motherAffectedStatus', 'Mother affected status', PARENT_AFFECTED_OPTIONS)}
        {select('fatherAffectedStatus', 'Father affected status', PARENT_AFFECTED_OPTIONS)}
        {countInput('affectedSiblingsCount', 'Affected siblings')}
        {countInput('unaffectedSiblingsCount', 'Unaffected siblings')}
      </FieldGroup>

      <FieldGroup title="Segregation">
        {select('segregationTesting', 'Segregation testing', SEGREGATION_TESTING_OPTIONS, {
          // Same rule as before: a result only exists when testing was done.
          onChangePatch: (val) => (val === 'Yes' ? {} : { segregationResult: '' }),
        })}
        {select('deNovoStatus', 'De novo status', DE_NOVO_STATUS_OPTIONS)}
        {v.segregationTesting === 'Yes'
          ? select('segregationResult', 'Segregation result', SEGREGATION_RESULT_OPTIONS)
          : null}
      </FieldGroup>
    </>
  );
}
