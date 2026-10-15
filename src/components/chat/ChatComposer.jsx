import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import ExploratoryModeToggle from '@/components/ExploratoryModeToggle';
import { PanelRight, ArrowUp, Plus, Square, FileText, Dna } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

function useAutosizeTextarea(ref, value, maxHeight = 240) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [ref, value, maxHeight]);
}

/* The field has no ring of its own: the card's border steps up to a 3:1 gray while focus is
 * anywhere inside it (the shell's own focus-within border resolves to the text colour).
 * `read-only` (not `disabled`) when chat is blocked, so the field stays reachable and its
 * placeholder, which carries the reason, is read out. */
const TEXTAREA_BASE =
  'w-full resize-none border-none bg-transparent dark:bg-transparent shadow-none rounded-none px-0 outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-transparent placeholder:text-muted-foreground read-only:cursor-not-allowed read-only:placeholder:text-[var(--text-secondary)]';

/* One shape for every toolbar control (see `.chat-tool` in App.css): 32px, 44px for coarse pointers. */
const TOOL_BTN = 'chat-tool chat-focus';

/**
 * Two rows, one decision: which *kind* of data is being added. Where the file comes
 * from (computer or URL) is a toggle inside each modal, not a second menu level.
 */
const FileTypeDropdown = ({ showFileTypeDropdown, onSelectVariantFile, onSelectFastq }) => {
  const menuRef = useRef(null);

  // Menu semantics, so menu behaviour: focus moves in on open, Up/Down/Home/End move between
  // rows. Escape (handled by the composer) closes it and returns focus to the + button.
  useEffect(() => {
    if (!showFileTypeDropdown) return;
    menuRef.current?.querySelector('[role="menuitem"]')?.focus();
  }, [showFileTypeDropdown]);

  if (!showFileTypeDropdown) return null;

  const onKeyDown = (e) => {
    const items = [...menuRef.current.querySelectorAll('[role="menuitem"]')];
    const i = items.indexOf(document.activeElement);
    const go = (n) => {
      e.preventDefault();
      items[(n + items.length) % items.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
  };

  const item =
    'chat-focus-inset w-full px-3 py-2 text-[13px] text-left flex items-center gap-2.5 text-foreground transition-colors duration-150 hover:bg-muted [@media(pointer:coarse)]:py-3';

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Add data"
      onKeyDown={onKeyDown}
      className="chat-upload-menu absolute bottom-full left-0 mb-2 rounded-lg border border-border bg-popover text-popover-foreground overflow-hidden shadow-[var(--shadow-md)] min-w-[260px] z-30 py-1"
    >
      <button type="button" role="menuitem" tabIndex={-1} onClick={onSelectVariantFile} className={item}>
        <FileText className="size-4 text-muted-foreground" aria-hidden />
        Variants file (VCF/TSV)
      </button>
      {onSelectFastq && (
        <button type="button" role="menuitem" tabIndex={-1} onClick={onSelectFastq} className={item}>
          <Dna className="size-4 text-muted-foreground" aria-hidden />
          Raw sequencing data (FASTQ)
        </button>
      )}
    </div>
  );
};

/**
 * Why sending is blocked: the reason is the placeholder (the parent's copy), and the next action is
 * a text link in the toolbar's free space. `blockedAction` ({ label, onClick }) lets the parent
 * name the exact next step, otherwise a safe one is inferred from the reason.
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
 * One rounded surface: the textarea on top, a toolbar inside it: + · answer mode · space ·
 * workspace toggle · send (or stop while a reply is generating). `layout` only changes density: `stacked` gives
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

  const plusRef = useRef(null);
  const menuOpen = !!showUpload && showFileTypeDropdown === dropdownSource;
  const handleSurfaceKeyDown = (e) => {
    // The attach menu is a plain conditional render owned by the page; Escape toggles it shut
    // and hands focus back to the + button.
    if (e.key === 'Escape' && menuOpen) {
      e.stopPropagation();
      onUploadButtonClick?.(dropdownSource);
      plusRef.current?.focus();
    }
  };

  const blocked = !canType;
  const blockedLink =
    blockedAction ||
    (blocked
      ? inferBlockedAction({ placeholder, isVariantSidebarOpen, onToggleVariantSidebar, hasDocument })
      : null);

  /* One live region for the composer, mounted once and always present. It speaks only while chat
   * is blocked, as a full phrase, so the reason is announced when the state changes. */
  const reasonId = useId();
  const reason = blocked && placeholder ? `Chat is paused. ${placeholder}.` : '';

  const uploadButton = showUpload && (
    /* Not `relative`: the menu anchors to the composer card, so it opens above the card instead of covering the field. */
    <div
      className="shrink-0"
      ref={showFileTypeDropdown === dropdownSource ? fileTypeDropdownRef : undefined}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              ref={plusRef}
              type="button"
              onClick={() => onUploadButtonClick(dropdownSource)}
              className={`${TOOL_BTN} chat-tool-plus`}
              aria-label="Add data"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <Plus aria-hidden />
            </button>
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

  /* Same min-height whether the field is typeable or blocked, so a state change never moves the
   * toolbar. */
  const textarea = (
    <Textarea
      ref={textareaRef}
      value={input}
      onChange={(e) => onInputChange(e.target.value)}
      onKeyDown={handleKeyDown}
      readOnly={!canType}
      aria-disabled={!canType || undefined}
      aria-describedby={blocked && reason ? reasonId : undefined}
      rows={1}
      placeholder={placeholder}
      aria-label="Message Geneie"
      className={`${TEXTAREA_BASE} text-[15px] leading-6 py-1 ${
        isStacked ? 'min-h-[52px] max-h-[200px]' : 'min-h-[32px] max-h-[160px]'
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
          <button
            type="button"
            onClick={onStop}
            className={`${TOOL_BTN} chat-tool-send`}
            aria-label="Stop generation"
          >
            <Square className="!size-3 fill-current" aria-hidden />
          </button>
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
          className={`pipeline-composer [&.pipeline-composer:focus-within]:!border-[hsl(var(--muted-foreground))] flex flex-col ${
            isStacked ? 'px-4 pt-4 pb-2.5' : 'px-4 pt-3 pb-2.5'
          }`}
        >
          {textarea}
          <span id={reasonId} role="status" className="sr-only">
            {reason}
          </span>
          {/* Toolbar, inside the card: + · mode · space · workspace · send. The space holds the
           * next action when chat is blocked (a text link), so the card keeps one height. */}
          <div className="chat-composer-toolbar flex h-8 items-center gap-2 mt-2 [@media(pointer:coarse)]:h-11">
            {uploadButton}
            {showModeToggle && <ExploratoryModeToggle variant="inline" />}
            <div className="flex min-w-0 flex-1 items-center justify-end px-2">
              {blocked && blockedLink && (
                <button
                  type="button"
                  onClick={blockedLink.onClick}
                  className="chat-focus min-h-6 max-w-full truncate rounded-sm text-[13px] font-medium text-[var(--accent-teal)] underline decoration-1 underline-offset-[0.18em] hover:decoration-2"
                >
                  {blockedLink.label}
                </button>
              )}
            </div>
            {sidebarToggle}
            {sendOrStop}
          </div>
        </div>
        {isStacked && (
          <p
            /* Positioned so the dock's blur layers paint behind it, not over it. */
            className="relative z-10 text-center text-xs leading-tight mt-2.5"
            style={{ color: 'hsl(var(--muted-foreground))' }}
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
        <button
          type="button"
          onClick={onToggleVariantSidebar}
          className={TOOL_BTN}
          aria-label="Workspace"
          aria-pressed={!!isVariantSidebarOpen}
        >
          <PanelRight aria-hidden />
        </button>
      }
    />
    <TooltipContent>{isVariantSidebarOpen ? 'Close workspace' : 'Open workspace'}</TooltipContent>
  </Tooltip>
);

const SendButton = ({ onClick, disabled }) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={`${TOOL_BTN} chat-tool-send`}
          aria-label="Send message"
        >
          <ArrowUp aria-hidden />
        </button>
      }
    />
    <TooltipContent>Send message</TooltipContent>
  </Tooltip>
);

export default ChatComposer;
