import React, { useEffect, useState } from 'react';
import { saveBlob } from '@/lib/reportPreview';
import { fetchCaseReportHtml, fetchCaseReportPdfBlob } from '@/services/reportPreviewApi';
import DocumentViewerDialog from '@/components/workspace/DocumentViewerDialog';
import ReportPreview from '@/components/workspace/ReportPreview';
import { useReportDoc, useReportPdf } from '@/components/workspace/useReportDocuments';

/**
 * The 1-page case report in the large viewer. Opening it is the user's action and fetches
 * GET /api/case-report/{id}.html; the PDF is fetched (GET .../{id}.pdf, read not downloaded) only when
 * the user asks for it in the PDF pane. `conversationId="sample"` shows the public sample.
 */
export default function CaseReportPreviewDialog({ open, onOpenChange, conversationId, title = '1-page case report' }) {
  const [mode, setMode] = useState('document');
  const doc = useReportDoc(conversationId);
  const pdf = useReportPdf(conversationId);
  const loadDoc = doc.load;

  const buildDoc = () => loadDoc((signal) => fetchCaseReportHtml(conversationId, { signal }), 'case');
  const buildPdf = () => pdf.load((signal) => fetchCaseReportPdfBlob(conversationId, { signal }), 'case');

  useEffect(() => {
    if (open && conversationId) {
      setMode('document');
      loadDoc((signal) => fetchCaseReportHtml(conversationId, { signal }), 'case');
    }
  }, [open, conversationId, loadDoc]);

  return (
    <DocumentViewerDialog open={open} onOpenChange={onOpenChange} title={title} description="A one-page summary of the working set. Read it here, or open it in its own tab.">
      <ReportPreview
        title={title}
        mode={mode}
        onModeChange={setMode}
        doc={doc}
        pdf={pdf}
        onBuildDoc={buildDoc}
        onBuildPdf={buildPdf}
        buildPdfLabel="Load the PDF"
        pdfIdleText="Fetch the PDF version of this one-page report to view it here."
        onDownloadPdf={() => (pdf.blob ? saveBlob(pdf.blob, pdf.filename) : null)}
        className="min-h-0 flex-1"
      />
    </DocumentViewerDialog>
  );
}
