import React from 'react';
import {
  DE_NOVO_STATUS_OPTIONS,
  PARENT_AFFECTED_OPTIONS,
  PARENTS_AVAILABLE_OPTIONS,
  SEGREGATION_RESULT_OPTIONS,
  SEGREGATION_TESTING_OPTIONS,
  TRIO_FAMILY_ANALYSIS_OPTIONS,
  YES_NO_UNKNOWN,
} from '@/components/germlinePedigreeOptions';

/**
 * Pedigree / family fields for Germline sample information (Track 14.7).
 * `Select` must be a select component that accepts value/onChange/placeholder/options.
 */
export default function GermlinePedigreeFields({ value, onChange, Select }) {
  const v = value || {};
  const set = (patch) => onChange({ ...v, ...patch });

  const Field = ({ label, children }) => (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </label>
      {children}
    </div>
  );

  const numberInputClass =
    'w-full px-3 h-10 border rounded-lg text-sm';
  const numberInputStyle = {
    borderColor: 'var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
  };

  return (
    <div className="md:col-span-2 space-y-3">
      <h5 className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
        Family / pedigree
      </h5>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4">
        <Field label="Family history">
          <Select
            value={v.familyHistory || ''}
            onChange={(val) => set({ familyHistory: val })}
            placeholder="Choose one"
            options={YES_NO_UNKNOWN}
          />
        </Field>
        <Field label="Consanguinity">
          <Select
            value={v.consanguinity || ''}
            onChange={(val) => set({ consanguinity: val })}
            placeholder="Choose one"
            options={YES_NO_UNKNOWN}
          />
        </Field>
        <Field label="Parents available">
          <Select
            value={v.parentsAvailable || ''}
            onChange={(val) => set({ parentsAvailable: val })}
            placeholder="Choose one"
            options={PARENTS_AVAILABLE_OPTIONS}
          />
        </Field>
        <Field label="Trio / family analysis type">
          <Select
            value={v.trioFamilyAnalysisType || ''}
            onChange={(val) => set({ trioFamilyAnalysisType: val })}
            placeholder="Choose one"
            options={TRIO_FAMILY_ANALYSIS_OPTIONS}
          />
        </Field>
        <Field label="Mother affected status">
          <Select
            value={v.motherAffectedStatus || ''}
            onChange={(val) => set({ motherAffectedStatus: val })}
            placeholder="Choose one"
            options={PARENT_AFFECTED_OPTIONS}
          />
        </Field>
        <Field label="Father affected status">
          <Select
            value={v.fatherAffectedStatus || ''}
            onChange={(val) => set({ fatherAffectedStatus: val })}
            placeholder="Choose one"
            options={PARENT_AFFECTED_OPTIONS}
          />
        </Field>
        <Field label="Affected siblings count">
          <input
            type="number"
            min={0}
            step={1}
            value={v.affectedSiblingsCount ?? ''}
            onChange={(e) => set({ affectedSiblingsCount: e.target.value })}
            className={numberInputClass}
            style={numberInputStyle}
            placeholder="0"
          />
        </Field>
        <Field label="Unaffected siblings count">
          <input
            type="number"
            min={0}
            step={1}
            value={v.unaffectedSiblingsCount ?? ''}
            onChange={(e) => set({ unaffectedSiblingsCount: e.target.value })}
            className={numberInputClass}
            style={numberInputStyle}
            placeholder="0"
          />
        </Field>
        <Field label="Segregation testing">
          <Select
            value={v.segregationTesting || ''}
            onChange={(val) =>
              set({
                segregationTesting: val,
                ...(val === 'Yes' ? {} : { segregationResult: '' }),
              })
            }
            placeholder="Choose one"
            options={SEGREGATION_TESTING_OPTIONS}
          />
        </Field>
        <Field label="De novo status">
          <Select
            value={v.deNovoStatus || ''}
            onChange={(val) => set({ deNovoStatus: val })}
            placeholder="Choose one"
            options={DE_NOVO_STATUS_OPTIONS}
          />
        </Field>
        {v.segregationTesting === 'Yes' ? (
          <Field label="Segregation result">
            <Select
              value={v.segregationResult || ''}
              onChange={(val) => set({ segregationResult: val })}
              placeholder="Choose one"
              options={SEGREGATION_RESULT_OPTIONS}
            />
          </Field>
        ) : null}
      </div>
    </div>
  );
}
