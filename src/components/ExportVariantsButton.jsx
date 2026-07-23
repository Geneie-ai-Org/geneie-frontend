import React, { useState, useCallback, useEffect } from 'react';
import { Download } from 'lucide-react';
import { getExportEligibility, exportVariants } from '@/services/backendApi';

export default function ExportVariantsButton({ conversationId, variantData, filteredCount, isGuest }) {
  const [eligibility, setEligibility] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);

  const checkEligibility = useCallback(async () => {
    if (!conversationId || isGuest) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getExportEligibility(conversationId);
      setEligibility(data);
    } catch (err) {
      setEligibility(null);
      setError(err.message || 'Failed to check export eligibility');
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, isGuest]);

  useEffect(() => {
    if (conversationId && !isGuest && (variantData || filteredCount !== null)) {
      checkEligibility();
    } else {
      setEligibility(null);
    }
  }, [conversationId, isGuest, variantData, filteredCount, checkEligibility]);

  const handleExport = useCallback(async () => {
    if (!conversationId || isExporting) return;
    setIsExporting(true);
    setError(null);
    try {
      await exportVariants(conversationId);
    } catch (err) {
      setError(err.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [conversationId, isExporting]);

  if (isGuest) return null;
  if (!conversationId || !variantData) return null;

  const canExport = eligibility?.can_export === true;
  const rowCount = eligibility?.row_count ?? 0;
  const message = eligibility?.message || '';

  const label = isExporting
    ? 'Exporting…'
    : canExport
      ? `Download ${rowCount.toLocaleString()} variants`
      : isLoading && !eligibility
        ? 'Checking export…'
        : rowCount > 0
          ? 'Download'
          : 'Nothing to download yet';

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={handleExport}
        disabled={!canExport || isExporting}
        title={!canExport ? message : `Download ${rowCount.toLocaleString()} variants as TSV`}
        className={`w-full h-10 rounded-lg flex items-center justify-center gap-2 text-[13px] font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-sidebar)] ${
          canExport && !isExporting
            ? 'bg-[var(--accent-teal)] text-[var(--bg-app)] hover:brightness-110'
            : 'bg-[var(--bg-surface)] text-[var(--text-tertiary)] cursor-not-allowed'
        }`}
      >
        {isExporting ? (
          <div className="w-3.5 h-3.5 rounded-full animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {label}
      </button>
      {error && (
        <p className="text-[11px] text-[var(--error)] truncate" title={error}>
          {error}
        </p>
      )}
    </div>
  );
}
