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

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="text-xs" style={{ color: 'var(--error)' }} title={error}>
          {error.length > 50 ? error.slice(0, 50) + '...' : error}
        </span>
      )}
      <button
        type="button"
        onClick={handleExport}
        disabled={!canExport || isExporting}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          !canExport || isExporting
            ? 'opacity-50 cursor-not-allowed'
            : 'hover:opacity-90'
        }`}
        style={{
          backgroundColor: canExport ? 'var(--accent-teal)' : 'var(--bg-surface-hover)',
          color: canExport ? 'white' : 'var(--text-secondary)',
        }}
        title={!canExport ? message : `Download ${rowCount.toLocaleString()} variants as TSV`}
      >
        {isExporting ? (
          <>
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Exporting...
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5" />
            {canExport
              ? `Download ${rowCount.toLocaleString()} variants`
              : 'Download'}
          </>
        )}
      </button>
      {isLoading && !eligibility && (
        <div className="w-3.5 h-3.5 border-2 border-[var(--text-secondary)] border-t-transparent rounded-full animate-spin" />
      )}
    </div>
  );
}
