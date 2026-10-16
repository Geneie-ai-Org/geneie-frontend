import React, { useMemo } from 'react';
import { Download, FileText, Maximize2, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StageMark } from '@/components/motion';
import { SegmentedPill } from '@/components/UploadWizardKit';
import { canEmbedPdf } from '@/lib/reportPreview';
import DocumentViewer, { PaperSkeleton } from '@/components/workspace/DocumentViewer';

const MODES = [
  { value: 'document', label: 'Document' },
  { value: 'pdf', label: 'PDF' },
];

function Notice({ children, action }) {
  return (
    <div className="wb-report-notice" role="status">
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}

function PaperWait({ label }) {
  return (
    <div className="wb-report-state" role="status" aria-busy="true">
      <div className="wb-report-paper-wait"><PaperSkeleton /></div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function StateCard({ icon, title, children, action, role }) {
  return (
    <div className="wb-report-state" role={role || 'status'}>
      <span className="wb-report-state-icon" aria-hidden="true">{icon}</span>
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {children ? <p className="max-w-sm text-[13px] leading-5 text-muted-foreground">{children}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/**
 * ReportPreview: the Document | PDF viewer for a generated report. It owns no data: the host passes the
 * state of each kind and the actions that (re)build them, so the same surface serves the Report tab,
 * its large dialog and the 1-page case report.
 *
 *   doc  { state: idle|fetching|ready|error, html, error, stale }
 *   pdf  { state: idle|fetching|ready|error, url, error, stale }
 *   onBuildDoc()           build / refresh the HTML document (a user action, never automatic)
 *   onBuildPdf()           produce the PDF (the host decides what that costs; `buildPdfLabel` says it)
 *   onDownloadPdf()        save the PDF bytes the host already holds
 *   idleDocAction          node shown under the "nothing yet" text of the Document pane
 *   onExpand               shows the Expand button (omit inside the dialog)
 */
export default function ReportPreview({
  title = 'Clinical report preview',
  mode,
  onModeChange,
  doc,
  pdf,
  onBuildDoc,
  onBuildPdf,
  buildPdfLabel = 'Generate report',
  pdfIdleText = 'No PDF has been built in this browser session yet.',
  onDownloadPdf,
  idleDocAction = null,
  idleDocText = 'Build a preview to read the report here before you generate the PDF.',
  canBuild = true,
  onExpand,
  className,
  canvasClassName,
}) {
  const isPdf = mode === 'pdf';

  const downloadBtn = onDownloadPdf && pdf?.state === 'ready' ? (
    <Button type="button" variant="outline" size="sm" onClick={onDownloadPdf} className="wb-report-dl gap-1.5 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:px-3" aria-label="Download PDF" title="Download PDF">
      <Download className="size-3.5" aria-hidden="true" />
      <span className="wb-report-btn-label">Download PDF</span>
    </Button>
  ) : null;

  const expandBtn = onExpand ? (
    <Button type="button" variant="outline" size="sm" onClick={onExpand} className="gap-1.5 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:px-3" aria-label="Expand preview" title="Open the preview large">
      <Maximize2 className="size-3.5" aria-hidden="true" />
      <span className="wb-report-btn-label">Expand</span>
    </Button>
  ) : null;

  const { source, children, notice, dim } = useMemo(() => {
    const retry = (fn, label = 'Try again') => (
      <Button type="button" variant="outline" size="sm" onClick={fn} disabled={!canBuild} className="gap-1.5 [@media(pointer:coarse)]:h-10">
        <RotateCw className="size-3.5" aria-hidden="true" />{label}
      </Button>
    );
    if (!isPdf) {
      if (doc?.state === 'ready' && doc.html != null) {
        return {
          source: { kind: 'html', html: doc.html },
          dim: Boolean(doc.stale),
          notice: doc.stale ? (
            <Notice action={retry(onBuildDoc, 'Refresh preview')}>Picks changed, refresh preview. This document shows the earlier picks.</Notice>
          ) : null,
        };
      }
      if (doc?.state === 'fetching') return { children: <PaperWait label="Building the preview" /> };
      if (doc?.state === 'error') {
        return {
          children: (
            <StateCard role="alert" icon={<StageMark state="failed" size={22} />} title="The preview could not be built" action={retry(onBuildDoc)}>
              {doc.error}
            </StateCard>
          ),
        };
      }
      return {
        children: (
          <StateCard icon={<FileText className="size-4" />} title="No preview yet" action={idleDocAction}>
            {idleDocText}
          </StateCard>
        ),
      };
    }
    if (pdf?.state === 'ready' && pdf.url) {
      return {
        source: { kind: 'pdf', blobUrl: pdf.url },
        dim: Boolean(pdf.stale),
        notice: pdf.stale ? (
          <Notice action={retry(onBuildPdf, buildPdfLabel)}>Picks changed. This PDF shows the earlier picks.</Notice>
        ) : null,
      };
    }
    if (pdf?.state === 'fetching') return { children: <PaperWait label="Building the PDF" /> };
    if (pdf?.state === 'error') {
      return {
        children: (
          <StateCard role="alert" icon={<StageMark state="failed" size={22} />} title="The PDF was not built" action={retry(onBuildPdf)}>
            {pdf.error}
          </StateCard>
        ),
      };
    }
    return {
      children: (
        <StateCard
          icon={<FileText className="size-4" />}
          title="No PDF here yet"
          action={
            <Button type="button" size="sm" onClick={onBuildPdf} disabled={!canBuild} className="gap-1.5 [@media(pointer:coarse)]:h-10">
              <FileText className="size-3.5" aria-hidden="true" />{buildPdfLabel}
            </Button>
          }
        >
          {pdfIdleText}
        </StateCard>
      ),
    };
  }, [isPdf, doc, pdf, onBuildDoc, onBuildPdf, buildPdfLabel, pdfIdleText, idleDocAction, idleDocText, canBuild]);

  return (
    <DocumentViewer
      className={className}
      canvasClassName={canvasClassName}
      title={isPdf ? `${title.replace(/ preview$/i, '')} PDF` : title}
      source={source || null}
      notice={notice}
      dim={dim}
      openLabel={isPdf ? 'Open PDF' : 'Open in new tab'}
      pdfFallbackActions={downloadBtn}
      toolbarStart={<SegmentedPill ariaLabel="Preview type" value={mode} onChange={onModeChange} options={MODES} />}
      toolbarEnd={<>{isPdf && source?.kind === 'pdf' && canEmbedPdf() ? downloadBtn : null}{expandBtn}</>}
    >
      {children}
    </DocumentViewer>
  );
}
