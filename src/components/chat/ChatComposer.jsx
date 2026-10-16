import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import ExploratoryModeToggle from '@/components/ExploratoryModeToggle';
import { PanelRight, ArrowUp, Plus, Square, FileText, Dna, Upload, Search, Filter, BookOpen } from 'lucide-react';
import { ChipList, PopIn, SPRING } from '@/components/motion';
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
    'chat-add-item chat-focus-inset w-full text-left flex items-center gap-3 text-foreground [@media(pointer:coarse)]:py-3';

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Add data"
      onKeyDown={onKeyDown}
      className="chat-upload-menu absolute bottom-full left-0 mb-2 z-30"
    >
      <button type="button" role="menuitem" tabIndex={-1} onClick={onSelectVariantFile} className={item}>
        <span className="chat-add-tile" aria-hidden>
          <FileText />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="chat-add-title">Variants file</span>
          <span className="chat-add-desc">VCF or TSV. Annotate, filter and ask about the variants.</span>
        </span>
      </button>
      {onSelectFastq && (
        <button type="button" role="menuitem" tabIndex={-1} onClick={onSelectFastq} className={item}>
          <span className="chat-add-tile" aria-hidden>
            <Dna />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="chat-add-title">Raw sequencing data</span>
            <span className="chat-add-desc">Paired FASTQ. Runs the pipeline to call variants.</span>
          </span>
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
  /* Optional: the parent's ref to the field (the starter chips below focus it after a prefill). */
  textareaRef: externalTextareaRef = null,
}) => {
  const isStacked = layout === 'stacked';
  // Two separate gates. Typing is only blocked by the hard gates (no auth, quota
  // exhausted, upload or annotation in flight); an in-flight response blocks sending
  // but not typing, so the user can draft their next message while Geneie answers.
  const canType = !isInputDisabled || isCurrentlyActive;
  const sendDisabled = isInputDisabled || !input.trim();

  const ownTextareaRef = useRef(null);
  const textareaRef = externalTextareaRef || ownTextareaRef;
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
              className={`${TOOL_BTN} chat-pill chat-tool-plus max-[480px]:!px-0`}
              aria-label="Add data"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <Plus aria-hidden />
              <span className="max-[480px]:hidden">Add data</span>
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
      className={`${TEXTAREA_BASE} text-[15px] [@media(pointer:coarse)]:text-[16px] leading-6 py-1 ${
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

  /* One button that morphs: idle (nothing to send) -> ready (text, can send) -> busy (reply streaming,
   * the same button becomes Stop). The state is a data attribute so CSS owns the transition. */
  const sendState = isCurrentlyActive ? 'busy' : sendDisabled ? 'idle' : 'ready';
  const sendOrStop = (
    <SendButton state={sendState} onSend={onSend} onStop={onStop} />
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
          <span id={reasonId} role="status" className="sr-only">
            {reason}
          </span>
          {/* Phones: the blocked reason's action gets its own full-width row (the toolbar has no room for it). */}
          {blocked && blockedLink && (
            <button
              type="button"
              onClick={blockedLink.onClick}
              className="chat-focus mt-1 min-h-10 self-start rounded-sm text-[14px] font-medium text-[var(--accent-teal)] underline decoration-1 underline-offset-[0.18em] min-[481px]:hidden"
            >
              {blockedLink.label}
            </button>
          )}
          {/* Toolbar, inside the card: + · mode · space · workspace · send. The space holds the
           * next action when chat is blocked (a text link), so the card keeps one height. */}
          <div className="chat-composer-toolbar flex h-8 items-center gap-2 mt-2 [@media(pointer:coarse)]:h-11">
            {uploadButton}
            {showModeToggle && <ExploratoryModeToggle variant="inline" />}
            <div className="flex min-w-0 flex-1 items-center justify-end px-2">
              {!blocked && !(hasDocument && !isStacked) && (
                <span className="chat-hint" aria-hidden="true">
                  Enter to send, Shift+Enter for new line
                </span>
              )}
              {blocked && blockedLink && (
                <button
                  type="button"
                  onClick={blockedLink.onClick}
                  className="chat-focus min-h-6 max-w-full truncate rounded-sm text-[13px] font-medium text-[var(--accent-teal)] underline decoration-1 underline-offset-[0.18em] hover:decoration-2 max-[480px]:hidden"
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
          <StarterChips
            visible={canType && !input.trim()}
            hasDocument={hasDocument}
            showUpload={!!showUpload}
            onSelectVariantFile={onSelectVariantFile}
            onSelectFastq={onSelectFastq}
            onPrefill={(text) => {
              onInputChange(text);
              requestAnimationFrame(() => {
                const el = textareaRef.current;
                if (!el) return;
                el.focus();
                el.setSelectionRange(text.length, text.length);
              });
            }}
          />
        )}
        {isStacked && (
          <p
            /* Positioned so the dock's blur layers paint behind it, not over it. */
            className="relative z-10 text-center text-xs leading-tight mt-5"
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

const SendButton = ({ state, onSend, onStop }) => {
  const busy = state === 'busy';
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={busy ? onStop : onSend}
            disabled={state === 'idle'}
            data-state={state}
            className={`${TOOL_BTN} chat-tool-send`}
            aria-label={busy ? 'Stop generation' : 'Send message'}
          >
            <ArrowUp className="chat-send-arrow" aria-hidden />
            <Square className="chat-send-stop fill-current" aria-hidden />
          </button>
        }
      />
      <TooltipContent>{busy ? 'Stop generation' : 'Send message'}</TooltipContent>
    </Tooltip>
  );
};

/**
 * Starter prompts under the home composer. Chips that suggest a question pre-fill the field (never
 * send); the upload chips open the same flows as the + menu. They pop in once, staggered, and step
 * aside as soon as there is text in the field. The copy only promises what works without data.
 */
function StarterChips({ visible, hasDocument, showUpload, onSelectVariantFile, onSelectFastq, onPrefill }) {
  // AnimatePresence skips the entrance of children present on its first render, so arm one frame later.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const starters = [
    hasDocument && { id: 'summarise', label: 'Summarise my variants', icon: Search, prompt: 'Summarise my variants.' },
    !hasDocument && showUpload && onSelectVariantFile && { id: 'vcf', label: 'Upload a VCF', icon: Upload, onClick: onSelectVariantFile },
    !hasDocument && showUpload && onSelectFastq && { id: 'fastq', label: 'Upload FASTQ files', icon: Dna, onClick: onSelectFastq },
    { id: 'gene', label: 'Explain a gene', icon: BookOpen, prompt: 'Explain the BRCA1 gene and the kinds of variants in it that matter clinically.' },
    { id: 'rare', label: 'Filter rare pathogenic variants', icon: Filter, prompt: 'How do I filter for rare pathogenic variants?' },
  ].filter(Boolean);

  return (
    <div className="chat-starters" role="group" aria-label="Starter prompts">
      <ChipList>
        {armed && visible
          ? starters.map((c, i) => (
              <PopIn
                key={c.id}
                className="inline-flex max-w-full"
                transition={{ ...SPRING, delay: 0.06 + i * 0.06 }}
              >
                <button
                  type="button"
                  className="chat-starter chat-focus"
                  onClick={() => (c.onClick ? c.onClick() : onPrefill(c.prompt))}
                >
                  <c.icon aria-hidden />
                  <span className="truncate">{c.label}</span>
                </button>
              </PopIn>
            ))
          : null}
      </ChipList>
    </div>
  );
}

export default ChatComposer;
