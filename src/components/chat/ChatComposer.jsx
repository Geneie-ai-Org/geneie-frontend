import { useEffect, useLayoutEffect, useRef } from 'react';
import ExploratoryModeToggle from '@/components/ExploratoryModeToggle';
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
  'w-full resize-none border-none bg-transparent dark:bg-transparent disabled:bg-transparent dark:disabled:bg-transparent shadow-none rounded-none px-0 outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-transparent disabled:opacity-100 disabled:cursor-not-allowed placeholder:text-[var(--text-tertiary)] disabled:placeholder:text-[var(--text-secondary)]';

/* One shape for every toolbar button: 32px on desktop, 44px for coarse pointers. */
const TOOL_BTN =
  'chat-chrome-btn !size-8 [@media(pointer:coarse)]:!size-11 rounded-[8px] [&_svg]:!size-4 text-muted-foreground hover:text-foreground';

/**
 * Two rows, one decision: which *kind* of data is being added. Where the file comes
 * from (computer or URL) is a toggle inside each modal, not a second menu level.
 */
const FileTypeDropdown = ({ showFileTypeDropdown, onSelectVariantFile, onSelectFastq }) => {
  if (!showFileTypeDropdown) return null;

  const item =
    'w-full px-3 py-2 text-[13px] text-left flex items-center gap-2.5 text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none [@media(pointer:coarse)]:py-3';

  return (
    <div
      role="menu"
      aria-label="Add data"
      className="chat-upload-menu absolute bottom-full left-0 mb-2 rounded-lg border border-border bg-popover text-popover-foreground overflow-hidden shadow-[var(--shadow-md)] min-w-[260px] z-50 py-1"
    >
      <button type="button" role="menuitem" onClick={onSelectVariantFile} className={item}>
        <FileText className="size-4 text-muted-foreground" aria-hidden />
        Variants file (VCF/TSV)
      </button>
      {onSelectFastq && (
        <button type="button" role="menuitem" onClick={onSelectFastq} className={item}>
          <Dna className="size-4 text-muted-foreground" aria-hidden />
          Raw sequencing data (FASTQ)
        </button>
      )}
    </div>
  );
};

/**
 * Why sending is blocked, as a one-line note inside the composer with the next action as a text
 * link. The copy comes from the parent's placeholder; `blockedAction` ({ label, onClick }) lets the
 * parent name the exact next step, otherwise a safe one is inferred from the reason.
 */
function inferBlockedAction({ placeholder, isVariantSidebarOpen, onToggleVariantSidebar, hasDocument }) {
  if (!placeholder || !onToggleVariantSidebar || isVariantSidebarOpen || !hasDocument) return null;
  if (/apply a filter/i.test(placeholder)) return { label: 'Open filters', onClick: onToggleVariantSidebar };
  if (/(upload in progress|annotation is running|applying filter|enriching|indexing|preparing chat|running phenotype)/i.test(placeholder)) {
    return { label: 'View progress', onClick: onToggleVariantSidebar };
  }
  return null;
}

/**
 * The chat composer, and the primary object on the page.
 *
 * One rounded surface: the textarea on top, a toolbar inside it (attach on the left; answer
 * mode, workspace toggle and send on the right). `layout` only changes density: `stacked` gives
 * the empty state a taller field, `inline` is the compact conversation dock. There is
 * deliberately no second copy of the textarea, send button or upload menu.
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
  /* Optional: { label, onClick } shown as a text link beside the blocked reason. */
  blockedAction = null,
  /* The Standard/Explore switch lives in the toolbar. Set false to keep it elsewhere. */
  showModeToggle = true,
}) => {
  const isStacked = layout === 'stacked';
  // Two separate gates. Typing is only blocked by the hard gates (no auth, quota
  // exhausted, upload or annotation in flight); an in-flight response blocks sending
  // but not typing, so the user can draft their next message while Geneie answers.
  const canType = !isInputDisabled || isCurrentlyActive;
  const sendDisabled = isInputDisabled || !input.trim();

  const textareaRef = useRef(null);
  useAutosizeTextarea(textareaRef, input);

  const wasDisabledRef = useRef(!canType);
  useEffect(() => {
    const reopened = wasDisabledRef.current && canType;
    wasDisabledRef.current = !canType;
    if (!reopened) return;

    if (window.matchMedia?.('(pointer: coarse)').matches) return;
    textareaRef.current?.focus();
  }, [canType]);

  const handleContainerClick = (e) => {
    if (!canType) return;
    // Clicks on buttons/links keep their own focus; only the empty surface focuses the field.
    if (e.target.closest?.('button, a, [role="menu"]')) return;
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent?.isComposing) {
      e.preventDefault();
      if (!sendDisabled) onSend?.();
    }
  };

  const menuOpen = !!showUpload && showFileTypeDropdown === dropdownSource;
  const handleSurfaceKeyDown = (e) => {
    // The attach menu is a plain conditional render owned by the page; Escape toggles it shut.
    if (e.key === 'Escape' && menuOpen) {
      e.stopPropagation();
      onUploadButtonClick?.(dropdownSource);
    }
  };

  const blocked = !canType;
  const blockedLink =
    blockedAction ||
    (blocked
      ? inferBlockedAction({ placeholder, isVariantSidebarOpen, onToggleVariantSidebar, hasDocument })
      : null);

  const uploadButton = showUpload && (
    /* Not `relative`: the menu anchors to the composer card, so it opens above the card instead of covering the field. */
    <div
      className="shrink-0"
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
              className={`${TOOL_BTN} chat-chrome-btn-plus`}
              aria-label="Add data"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <Plus className="size-4" />
            </Button>
          }
        />
        <TooltipContent>Add data</TooltipContent>
      </Tooltip>
      <FileTypeDropdown
        showFileTypeDropdown={menuOpen}
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
      disabled={!canType}
      rows={1}
      placeholder={placeholder}
      aria-label="Message Geneie"
      className={`${TEXTAREA_BASE} text-[15px] leading-6 py-1 ${
        !canType ? 'min-h-[28px] max-h-[56px]' : isStacked ? 'min-h-[52px] max-h-[200px]' : 'min-h-[32px] max-h-[160px]'
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
            className="chat-send-btn !size-8 [@media(pointer:coarse)]:!size-11 [&_svg]:!size-3 rounded-full flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/85 hover:text-primary-foreground"
            aria-label="Stop generation"
          >
            <Square className="size-3 fill-current" />
          </Button>
        }
      />
      <TooltipContent>Stop generation</TooltipContent>
    </Tooltip>
  );

  const sendOrStop = isCurrentlyActive ? (
    stopButton
  ) : (
    <SendButton onClick={onSend} disabled={sendDisabled} />
  );

  return (
    /* A fragment, not a wrapping div: the boxes below are block-level and the parent is already
     * the full column width, so a container would add nothing but a phantom box in the elements
     * tree. TooltipProvider is a context provider and renders no DOM of its own. */
    <TooltipProvider>
      <>
        {/* Drawer and composer are siblings on purpose — no wrapper. Both are
         * `position: relative` with their own z-index, so they stack inside this element
         * without an extra box in the tree for the drawer to hide behind. */}
        {pipelineDrawer}
        <div
          onClick={handleContainerClick}
          onKeyDown={handleSurfaceKeyDown}
          className={`pipeline-composer flex flex-col ${
            isStacked ? 'px-4 pt-4 pb-2.5' : 'px-4 pt-3 pb-2.5'
          }`}
        >
          {textarea}
          {blocked && blockedLink && (
            <div className="flex items-center gap-1.5 pb-1 text-xs text-[var(--text-secondary)]" aria-live="polite">
              <span aria-hidden className="size-1.5 rounded-full bg-[var(--warning)]" />
              <span>Chat is paused.</span>
              <button
                type="button"
                onClick={blockedLink.onClick}
                className="font-medium text-[var(--accent-teal)] underline-offset-2 hover:underline rounded-sm"
              >
                {blockedLink.label}
              </button>
            </div>
          )}
          {/* Toolbar, inside the card. Left: attach and answer mode. Right: workspace toggle and send. */}
          <div className="chat-composer-toolbar flex items-center gap-1 pt-2">
            <div className="flex items-center gap-1 min-w-0">
              {uploadButton}
              {showModeToggle && <ExploratoryModeToggle variant="inline" />}
            </div>
            <div className="flex-1" aria-hidden />
            <div className="flex items-center gap-1.5 shrink-0">
              {sidebarToggle}
              {sendOrStop}
            </div>
          </div>
        </div>
        {isStacked && (
          <p
            /* Positioned so the dock's blur layers paint behind it, not over it. */
            className="relative z-10 text-center text-xs leading-tight mt-2.5"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Geneie can make mistakes. Verify important information.
          </p>
        )}
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
          className={`${TOOL_BTN} ${isVariantSidebarOpen ? 'is-active bg-muted !text-foreground' : ''}`}
          aria-label={isVariantSidebarOpen ? 'Close workspace' : 'Open workspace'}
          aria-pressed={isVariantSidebarOpen}
        >
          <PanelRight className="size-4" />
        </Button>
      }
    />
    <TooltipContent>{isVariantSidebarOpen ? 'Close workspace' : 'Open workspace'}</TooltipContent>
  </Tooltip>
);

const SendButton = ({ onClick, disabled }) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClick}
          disabled={disabled}
          className={`chat-send-btn !size-8 [@media(pointer:coarse)]:!size-11 [&_svg]:!size-4 rounded-full flex items-center justify-center transition-colors ${
            disabled
              ? 'cursor-not-allowed bg-primary text-primary-foreground opacity-30 disabled:opacity-30'
              : 'bg-primary text-primary-foreground hover:bg-primary/85 hover:text-primary-foreground'
          }`}
          aria-label="Send message"
        >
          <ArrowUp className="size-4" />
        </Button>
      }
    />
    <TooltipContent>Send message</TooltipContent>
  </Tooltip>
);

export default ChatComposer;
