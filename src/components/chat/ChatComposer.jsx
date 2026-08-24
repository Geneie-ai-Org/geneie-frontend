import { useEffect, useLayoutEffect, useRef } from 'react';
import { PanelRight, ArrowUp, Plus, Square, FileText, Dna } from 'lucide-react';
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

/**
 * Two rows, one decision: which *kind* of data is being added. Where the file comes
 * from (computer or URL) is a toggle inside each modal, not a second menu level.
 */
const FileTypeDropdown = ({ showFileTypeDropdown, onSelectVariantFile, onSelectFastq }) => {
  if (!showFileTypeDropdown) return null;

  return (
    <div
      className="absolute bottom-full left-0 mb-2 rounded-lg border overflow-hidden shadow-xl min-w-[260px] z-50"
      style={{
        backgroundColor: 'var(--bg-surface-raised)',
        borderColor: 'var(--border-default)',
      }}
    >
      <button
        type="button"
        onClick={onSelectVariantFile}
        className="w-full px-3 py-2.5 text-sm text-left flex items-center gap-2.5 transition-colors hover:bg-white/5"
        style={{ color: 'var(--text-primary)' }}
      >
        <FileText className="w-3.5 h-3.5" style={{ color: 'var(--accent-teal)' }} />
        Annotated variant file
      </button>
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

/**
 * The chat composer, and the primary object on the page.
 *
 * `layout` is the only difference between the two call sites: `stacked` puts the
 * textarea above its own button row (the empty state has room to breathe), `inline`
 * keeps everything on one line. Everything else is shared — there is deliberately no
 * second copy of the textarea, send button or upload menu.
 *
 * `pipelineDrawer` renders *behind* this component and appears to slide out from
 * underneath it. The layering is pure flow: the drawer pads its own bottom by
 * `--drawer-tuck` and cancels it with an equal negative margin, and this component's
 * opaque background paints over the overlap. Nothing is absolutely positioned, so
 * expanding the drawer never nudges the composer — and no wrapper element is needed,
 * so the drawer's box in the elements tree is the drawer and nothing else.
 */
const ChatComposer = ({
  layout = 'inline',
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
  onSelectVariantFile,
  onSelectFastq,
  isVariantSidebarOpen,
  onToggleVariantSidebar,
  hasDocument = false,
  pipelineDrawer = null,
}) => {
  const isStacked = layout === 'stacked';
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

  const uploadButton = showUpload && (
    <div
      className="relative shrink-0"
      ref={showFileTypeDropdown === dropdownSource ? fileTypeDropdownRef : undefined}
    >
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
              <Plus className="size-5" />
            </Button>
          }
        />
        <TooltipContent>Add data</TooltipContent>
      </Tooltip>
      <FileTypeDropdown
        showFileTypeDropdown={showFileTypeDropdown === dropdownSource}
        onSelectVariantFile={onSelectVariantFile}
        onSelectFastq={onSelectFastq}
      />
    </div>
  );

  const textarea = (
    <Textarea
      ref={textareaRef}
      value={input}
      onChange={(e) => onInputChange(e.target.value)}
      onKeyDown={handleKeyDown}
      disabled={isInputDisabled}
      rows={1}
      placeholder={placeholder}
      className={`${TEXTAREA_BASE} text-sm py-1.5 ${
        isStacked ? 'min-h-[44px] max-h-[160px]' : 'min-h-[36px] max-h-[120px]'
      }`}
      style={{ color: 'var(--text-primary)' }}
    />
  );

  const sidebarToggle = hasDocument && (
    <VariantSidebarToggle
      isVariantSidebarOpen={isVariantSidebarOpen}
      onToggleVariantSidebar={onToggleVariantSidebar}
    />
  );

  const stopButton = (
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
  );

  const sendOrStop = isCurrentlyActive ? (
    stopButton
  ) : (
    <SendButton onClick={onSend} disabled={sendDisabled} style={sendButtonStyle} />
  );

  return (
    /* A fragment, not a wrapping div: the three boxes below are block-level and the
     * parent is already the full column width, so a container would add nothing but a
     * phantom box in the elements tree. TooltipProvider is a context provider and
     * renders no DOM of its own. */
    <TooltipProvider>
      <>
        {/* Drawer and composer are siblings on purpose — no wrapper. Both are
         * `position: relative` with their own z-index, so they stack inside this element
         * without an extra box in the tree for the drawer to hide behind. */}
        {pipelineDrawer}
        <div
          onClick={handleContainerClick}
          className={`pipeline-composer ${
            isStacked ? 'flex flex-col px-3 py-2' : 'flex items-end gap-1 px-2 py-1.5'
          }`}
        >
          {isStacked ? (
            <>
              {textarea}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1">{uploadButton}</div>
                <div className="flex items-center gap-1">
                  {sidebarToggle}
                  <SendButton onClick={onSend} disabled={sendDisabled} style={sendButtonStyle} />
                </div>
              </div>
            </>
          ) : (
            <>
              {uploadButton}
              {textarea}
              <div className="flex items-center gap-0.5 mb-0.5">
                {sidebarToggle}
                {sendOrStop}
              </div>
            </>
          )}
        </div>
        <p
          /* Positioned so the dock's blur layers paint behind it, not over it. */
          className={`relative z-10 text-center text-2xs leading-tight ${isStacked ? 'mt-2' : 'mt-1.5'}`}
          style={{ color: 'var(--text-disabled)' }}
        >
          Geneie can make mistakes. Verify important information.
        </p>
      </>
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

export default ChatComposer;
