import { useEffect, useLayoutEffect, useRef } from 'react';
import { Upload, FileText, PanelRight, ArrowUp, Plus, Square, Link2, FolderOpen, Dna } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

function useAutosizeTextarea(ref, value, maxHeight = 240) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [ref, value, maxHeight]);
}

const TEXTAREA_BASE =
  'w-full resize-none border-none bg-transparent dark:bg-transparent disabled:bg-transparent dark:disabled:bg-transparent shadow-none rounded-none px-0 outline-none focus-visible:ring-0 focus-visible:border-transparent';

const FileTypeDropdown = ({
  dropdownSource,
  showFileTypeDropdown,
  fileTypeDropdownRef,
  onUploadButtonClick,
  onSelectLocalFile,
  onSelectFromUrl,
  onSelectFastq,
}) => {
  if (!showFileTypeDropdown) return null;

  return (
    <div
      className="absolute bottom-full left-0 mb-2 rounded-lg border overflow-hidden shadow-xl min-w-[160px] z-50"
      style={{
        backgroundColor: 'var(--bg-surface-raised)',
        borderColor: 'var(--border-default)',
      }}
    >
      <button
        type="button"
        onClick={onSelectLocalFile}
        className="w-full px-3 py-2.5 text-sm text-left flex items-center gap-2.5 transition-colors hover:bg-white/5"
        style={{ color: 'var(--text-primary)' }}
      >
        <FolderOpen className="w-3.5 h-3.5" style={{ color: 'var(--accent-teal)' }} />
        Local File
      </button>
      {onSelectFromUrl && (
        <>
          <div style={{ height: '1px', backgroundColor: 'var(--border-default)' }} />
          <button
            type="button"
            onClick={onSelectFromUrl}
            className="w-full px-3 py-2.5 text-sm text-left flex items-center gap-2.5 transition-colors hover:bg-white/5"
            style={{ color: 'var(--text-primary)' }}
          >
            <Link2 className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
            From URL
          </button>
        </>
      )}
      {onSelectFastq && (
        <>
          <div style={{ height: '1px', backgroundColor: 'var(--border-default)' }} />
          <button
            type="button"
            onClick={onSelectFastq}
            className="w-full px-3 py-2.5 text-sm text-left flex items-center gap-2.5 transition-colors hover:bg-white/5"
            style={{ color: 'var(--text-primary)' }}
          >
            <Dna className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
            Raw sequencing data (FASTQ)
          </button>
        </>
      )}
    </div>
  );
};

const ChatPromptInput = ({
  mode,
  input,
  onInputChange,
  onSend,
  onStop,
  isCurrentlyActive,
  isInputDisabled,
  placeholder,
  showUpload,
  dropdownSource,
  showFileTypeDropdown,
  fileTypeDropdownRef,
  onUploadButtonClick,
  onSelectLocalFile,
  onSelectFromUrl,
  onSelectFastq,
  isVariantSidebarOpen,
  onToggleVariantSidebar,
  hasDocument = false,
  pipelineGatedMessage,
  gatedAction,
  analysisPipelineBlock,
}) => {
  const isEmpty = mode === 'empty';
  const uploadIcon = isEmpty ? Upload : Plus;
  const UploadIcon = uploadIcon;
  const sendDisabled = isInputDisabled || !input.trim();

  const textareaRef = useRef(null);
  useAutosizeTextarea(textareaRef, input);

  const wasDisabledRef = useRef(isInputDisabled);
  useEffect(() => {
    const reopened = wasDisabledRef.current && !isInputDisabled;
    wasDisabledRef.current = isInputDisabled;
    if (!reopened) return;

    if (window.matchMedia?.('(pointer: coarse)').matches) return;
    textareaRef.current?.focus();
  }, [isInputDisabled]);

  const handleContainerClick = () => {
    if (!isInputDisabled) textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend?.();
    }
  };

  const sendButtonStyle = {
    backgroundColor: sendDisabled ? 'var(--bg-surface-hover)' : 'var(--text-primary)',
    color: sendDisabled ? 'var(--text-disabled)' : 'var(--bg-app)',
  };

  const disclaimerClass = isEmpty
    ? 'text-center text-2xs mt-2 leading-tight'
    : 'text-center text-2xs mt-1.5 leading-tight';

  const uploadButton = showUpload && (
    <div className="relative shrink-0" ref={showFileTypeDropdown === dropdownSource ? fileTypeDropdownRef : undefined}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onUploadButtonClick(dropdownSource)}
              className="chat-chrome-btn size-9 rounded-[0.5rem]"
              aria-label="Upload variant file"
            >
              <UploadIcon className="size-5" />
            </Button>
          }
        />
        <TooltipContent>Upload variant file</TooltipContent>
      </Tooltip>
      <FileTypeDropdown
        dropdownSource={dropdownSource}
        showFileTypeDropdown={showFileTypeDropdown === dropdownSource ? dropdownSource : null}
        fileTypeDropdownRef={fileTypeDropdownRef}
        onUploadButtonClick={onUploadButtonClick}
        onSelectLocalFile={onSelectLocalFile}
        onSelectFromUrl={onSelectFromUrl}
        onSelectFastq={onSelectFastq}
      />
    </div>
  );

  return (
    <TooltipProvider>
      <div className="w-full">
        {analysisPipelineBlock}
        {pipelineGatedMessage && (
          <div
            role="alert"
            className="mb-3 px-4 py-3 rounded-xl border text-sm leading-relaxed flex items-start gap-3"
            style={{
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              borderColor: 'rgba(245, 158, 11, 0.35)',
              color: 'var(--text-primary)',
            }}
          >
            <span className="min-w-0 flex-1">{pipelineGatedMessage}</span>
            {gatedAction && (
              <button
                type="button"
                onClick={gatedAction.onClick}
                className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:opacity-90"
                style={{ borderColor: 'var(--accent-teal)', color: 'var(--accent-teal)' }}
              >
                {gatedAction.label}
              </button>
            )}
          </div>
        )}
        <div
          onClick={handleContainerClick}
          className={
            isEmpty
              ? 'border border-[var(--border-default)] rounded-2xl flex flex-col px-3 py-2'
              : 'border border-[var(--border-default)] rounded-2xl flex items-end gap-1 px-2 py-1.5'
          }
          style={{ backgroundColor: 'var(--bg-surface)' }}
        >
          {isEmpty ? (
            <>
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isInputDisabled}
                rows={1}
                placeholder={placeholder || 'Ask your genomic assistant...'}
                className={`${TEXTAREA_BASE} text-sm min-h-[44px] max-h-[160px] py-1.5`}
                style={{ color: 'var(--text-primary)' }}
              />
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1">
                  {uploadButton}
                </div>
                <div className="flex items-center gap-1">
                  {hasDocument && (
                    <VariantSidebarToggle
                      isVariantSidebarOpen={isVariantSidebarOpen}
                      onToggleVariantSidebar={onToggleVariantSidebar}
                    />
                  )}
                  <SendButton
                    onClick={onSend}
                    disabled={sendDisabled}
                    style={sendButtonStyle}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {uploadButton}
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isInputDisabled}
                rows={1}
                placeholder={placeholder}
                className={`${TEXTAREA_BASE} text-sm min-h-[36px] max-h-[120px] py-1.5`}
                style={{ color: 'var(--text-primary)' }}
              />
              <div className="flex items-center gap-0.5 mb-0.5">
                {hasDocument && (
                  <VariantSidebarToggle
                    isVariantSidebarOpen={isVariantSidebarOpen}
                    onToggleVariantSidebar={onToggleVariantSidebar}
                  />
                )}
                {isCurrentlyActive ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={onStop}
                          className="chat-send-btn size-9 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: 'var(--bg-surface-hover)', color: 'var(--text-secondary)' }}
                          aria-label="Stop generation"
                        >
                          <Square className="size-5" />
                        </Button>
                      }
                    />
                    <TooltipContent>Stop generation</TooltipContent>
                  </Tooltip>
                ) : (
                  <SendButton
                    onClick={onSend}
                    disabled={sendDisabled}
                    style={sendButtonStyle}
                  />
                )}
              </div>
            </>
          )}
        </div>
        <p className={disclaimerClass} style={{ color: 'var(--text-disabled)' }}>
          Geneie can make mistakes. Verify important information.
        </p>
      </div>
    </TooltipProvider>
  );
};

const VariantSidebarToggle = ({ isVariantSidebarOpen, onToggleVariantSidebar }) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggleVariantSidebar}
          className={`chat-chrome-btn size-9 rounded-[0.5rem] ${isVariantSidebarOpen ? 'is-active' : ''}`}
          aria-label={isVariantSidebarOpen ? 'Close variant filters' : 'Open variant filters'}
          aria-pressed={isVariantSidebarOpen}
        >
          <PanelRight className="size-5" />
        </Button>
      }
    />
    <TooltipContent>{isVariantSidebarOpen ? 'Close variant filters' : 'Open variant filters'}</TooltipContent>
  </Tooltip>
);

const SendButton = ({ onClick, disabled, style }) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClick}
          disabled={disabled}
          className={`chat-send-btn size-9 rounded-full flex items-center justify-center transition-all
            ${disabled ? 'cursor-not-allowed disabled:opacity-30' : 'hover:opacity-80 active:scale-95'}`}
          style={style}
          aria-label="Send message"
        >
          <ArrowUp className="size-5" />
        </Button>
      }
    />
    <TooltipContent>Send message</TooltipContent>
  </Tooltip>
);

export default ChatPromptInput;
