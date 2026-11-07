import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Module1IgvPanel from '@/components/Module1IgvPanel';

/**
 * Standalone alignment browser window (`/app/module1-igv?cid=&locus=`).
 * Opened from the in-chat IGV dialog "New window" control.
 */
export default function Module1IgvWindowPage() {
  const [params] = useSearchParams();
  const conversationId = (params.get('cid') || '').trim();
  const locus = (params.get('locus') || '').trim() || null;

  const locusRequest = useMemo(
    () => (locus ? { locus, token: locus } : null),
    [locus],
  );

  if (!conversationId) {
    return (
      <div className="p-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
        Missing conversation id. Close this window and open Alignment browser from the chat again.
      </div>
    );
  }

  return (
    <Module1IgvPanel
      conversationId={conversationId}
      hasBam
      embedded
      autoOpen
      locusRequest={locusRequest}
    />
  );
}
