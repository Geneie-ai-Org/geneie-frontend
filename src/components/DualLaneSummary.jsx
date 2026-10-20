import React, { useEffect, useState } from 'react';
import { fetchDualLane } from '@/services/backendApi';

function names(rows, limit = 8) {
  const bits = (rows || [])
    .map((row) => {
      const gene = String(row.gene || '').trim();
      const variant = String(row.variant || '').trim();
      if (gene && variant) return `${gene} ${variant}`;
      return gene || variant;
    })
    .filter(Boolean);
  const shown = bits.slice(0, limit);
  const extra = bits.length - shown.length;
  return extra > 0 ? `${shown.join('; ')} +${extra} more` : shown.join('; ');
}

/**
 * Shown inside Review & report only when flags.dual_lane is on and GA has finished.
 * Does not change Include suggestions.
 */
export default function DualLaneSummary({ conversationId, open }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!open || !conversationId) {
      setData(null);
      return undefined;
    }
    let cancelled = false;
    fetchDualLane(conversationId)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, open]);

  if (!data?.enabled || !data?.available) return null;

  const onlyFiltered = Array.isArray(data.only_filtered) ? data.only_filtered : [];

  return (
    <div
      className="mx-4 mb-2 rounded-md border px-3 py-2 text-2xs leading-snug"
      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
    >
      <p className="font-medium text-[var(--text-primary)]">
        {data.ga_lane_label}: {data.ga_count ?? 0}
        {' · '}
        {data.filtered_lane_label}: {data.filtered_count ?? 0}
        {' · '}
        in both: {data.in_both_count ?? 0}
      </p>
      <p className="mt-1">
        Only in the filtered set: {data.only_filtered_count ?? 0}
        {onlyFiltered.length ? ` — ${names(onlyFiltered)}` : ''}
      </p>
      <p className="mt-1 text-[var(--text-tertiary)]">
        Neither list is the diagnosis. Include suggestions are unchanged.
      </p>
    </div>
  );
}
