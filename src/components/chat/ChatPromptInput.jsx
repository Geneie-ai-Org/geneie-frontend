import { Upload, FileText, PanelRight, ArrowUp, Plus, Square } from 'lucide-react';
import { PromptInput, PromptInputTextarea, PromptInputActions } from '../prompt-kit/prompt-input';

const FileTypeDropdown = ({
  dropdownSource,
  showFileTypeDropdown,
  fileTypeDropdownRef,
  onUploadButtonClick,
  onSelectTabular,
  onSelectVcf,
}) => {
  if (!showFileTypeDropdown) return null;

  return (
    <div
      className="absolute bottom-full left-0 mb-2 rounded-lg border overflow-hidden shadow-xl min-w-[140px] z-50"
      style={{
        backgroundColor: 'var(--bg-surface-raised)',
        borderColor: 'var(--border-default)',
      }}
    >
      <button
        type="button"
        onClick={onSelectTabular}
        className="w-full px-3 py-2.5 text-sm text-left flex items-center gap-2.5 transition-colors hover:bg-white/5"
        style={{ color: 'var(--text-primary)' }}
      >
        <FileText className="w-3.5 h-3.5" style={{ color: 'var(--accent-teal)' }} />
        TSV / CSV
      </button>
      <div style={{ height: '1px', backgroundColor: 'var(--border-default)' }} />
      <button
        type="button"
        onClick={onSelectVcf}
        className="w-full px-3 py-2.5 text-sm text-left flex items-center gap-2.5 transition-colors hover:bg-white/5"
        style={{ color: 'var(--text-primary)' }}
      >
        <FileText className="w-3.5 h-3.5" style={{ color: 'var(--accent-blue)' }} />
        VCF
      </button>
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
  onSelectTabular,
  onSelectVcf,
  isVariantSidebarOpen,
  onToggleVariantSidebar,
  pipelineGatedMessage,
  analysisPipelineBlock,
}) => {
  const isEmpty = mode === 'empty';
  const uploadIcon = isEmpty ? Upload : Plus;
  const UploadIcon = uploadIcon;
  const sendDisabled = isInputDisabled || !input.trim();

  const sendButtonStyle = isEmpty
    ? {
        backgroundColor: sendDisabled ? 'var(--bg-surface-hover)' : 'var(--accent-teal)',
        color: sendDisabled ? 'var(--text-disabled)' : '#fff',
      }
    : {
        backgroundColor: sendDisabled ? 'var(--bg-surface-hover)' : 'var(--text-primary)',
        color: sendDisabled ? 'var(--text-disabled)' : 'var(--bg-app)',
      };

  const disclaimerClass = isEmpty
    ? 'text-center text-[11px] mt-2 leading-tight'
    : 'text-center text-[11px] mt-1.5 leading-tight';

  return (
    <div className="w-full">
      {analysisPipelineBlock}
      {!isEmpty && pipelineGatedMessage && (
        <div
          role="alert"
          className="mb-3 px-4 py-3 rounded-xl border text-sm leading-relaxed"
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            borderColor: 'rgba(245, 158, 11, 0.35)',
            color: 'var(--text-primary)',
          }}
        >
          {pipelineGatedMessage}
        </div>
      )}
      <PromptInput
        value={input}
        onValueChange={onInputChange}
        onSubmit={onSend}
        isLoading={isCurrentlyActive}
        disabled={isInputDisabled}
        className={
          isEmpty
            ? 'border border-[var(--border-default)] rounded-2xl flex flex-col px-3 py-2'
            : 'border border-[var(--border-default)] rounded-2xl flex items-end gap-1 px-2 py-1.5'
        }
        style={{ backgroundColor: 'var(--bg-surface)' }}
      >
        {isEmpty ? (
          <>
            <PromptInputTextarea
              placeholder="Message geneie..."
              className="text-sm min-h-[44px] max-h-[160px] py-1.5"
              style={{ color: 'var(--text-primary)' }}
            />
            <PromptInputActions className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1">
                {showUpload && (
                  <div className="relative" ref={showFileTypeDropdown === dropdownSource ? fileTypeDropdownRef : undefined}>
                    <button
                      type="button"
                      onClick={() => onUploadButtonClick(dropdownSource)}
                      className="chat-chrome-btn"
                      title="Upload variant file"
                      aria-label="Upload variant file"
                    >
                      <UploadIcon />
                    </button>
                    <FileTypeDropdown
                      dropdownSource={dropdownSource}
                      showFileTypeDropdown={showFileTypeDropdown === dropdownSource ? dropdownSource : null}
                      fileTypeDropdownRef={fileTypeDropdownRef}
                      onUploadButtonClick={onUploadButtonClick}
                      onSelectTabular={onSelectTabular}
                      onSelectVcf={onSelectVcf}
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <VariantSidebarToggle
                  isVariantSidebarOpen={isVariantSidebarOpen}
                  onToggleVariantSidebar={onToggleVariantSidebar}
                />
                <SendButton
                  onClick={onSend}
                  disabled={sendDisabled}
                  style={sendButtonStyle}
                />
              </div>
            </PromptInputActions>
          </>
        ) : (
          <>
            {showUpload && (
              <div className="relative shrink-0 mb-0.5" ref={showFileTypeDropdown === dropdownSource ? fileTypeDropdownRef : undefined}>
                <button
                  type="button"
                  onClick={() => onUploadButtonClick(dropdownSource)}
                  className="chat-chrome-btn"
                  title="Upload variant file"
                  aria-label="Upload variant file"
                >
                  <UploadIcon />
                </button>
                <FileTypeDropdown
                  dropdownSource={dropdownSource}
                  showFileTypeDropdown={showFileTypeDropdown === dropdownSource ? dropdownSource : null}
                  fileTypeDropdownRef={fileTypeDropdownRef}
                  onUploadButtonClick={onUploadButtonClick}
                  onSelectTabular={onSelectTabular}
                  onSelectVcf={onSelectVcf}
                />
              </div>
            )}
            <PromptInputTextarea
              placeholder={placeholder}
              className="text-sm min-h-[36px] max-h-[120px] py-1.5"
              style={{ color: 'var(--text-primary)' }}
            />
            <div className="flex items-center gap-0.5 mb-0.5">
              <VariantSidebarToggle
                isVariantSidebarOpen={isVariantSidebarOpen}
                onToggleVariantSidebar={onToggleVariantSidebar}
              />
              {isCurrentlyActive ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="chat-send-btn flex items-center justify-center"
                  style={{ backgroundColor: 'var(--bg-surface-hover)', color: 'var(--text-secondary)' }}
                  title="Stop generation"
                  aria-label="Stop generation"
                >
                  <Square />
                </button>
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
      </PromptInput>
      <p className={disclaimerClass} style={{ color: 'var(--text-disabled)' }}>
        Geneie can make mistakes. Verify important information.
      </p>
    </div>
  );
};

const VariantSidebarToggle = ({ isVariantSidebarOpen, onToggleVariantSidebar }) => (
  <button
    type="button"
    onClick={onToggleVariantSidebar}
    className={`chat-chrome-btn ${isVariantSidebarOpen ? 'is-active' : ''}`}
    title={isVariantSidebarOpen ? 'Close variant filters' : 'Open variant filters'}
    aria-label={isVariantSidebarOpen ? 'Close variant filters' : 'Open variant filters'}
    aria-pressed={isVariantSidebarOpen}
  >
    <PanelRight />
  </button>
);

const SendButton = ({ onClick, disabled, style }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`chat-send-btn flex items-center justify-center transition-all
      ${disabled ? 'cursor-not-allowed opacity-30' : 'hover:opacity-80 active:scale-95'}`}
    style={style}
    title="Send message"
    aria-label="Send message"
  >
    <ArrowUp />
  </button>
);

export default ChatPromptInput;
