import { cloneElement, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    SquarePen,
    Search,
    X,
    MoreHorizontal,
    Pencil,
    Check,
    Trash2,
    PanelLeftClose,
    PanelLeftOpen,
    Settings,
    LogOut,
    Sun,
    Moon,
    MessageSquare,
    FileSpreadsheet,
    Dna,
} from 'lucide-react';
import { toast } from 'sonner';
import { getAuth } from 'firebase/auth';
import { performLogout } from '@/lib/logout';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useTheme } from '@/hooks/useTheme';
import { useLimits } from '@/hooks/useLimits';
import { meterFor } from '@/services/tierLimits';
import NotificationBell from './NotificationBell';
import { ScrollArea } from '@/components/ui/scroll-area';
import UsageMeter, { UsageBar, meterStatus } from './account/UsageMeter';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { MAX_USER_TITLE } from '@/lib/conversationTitle';
import { PopIn } from '@/components/motion';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuItem,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

/* ---------------------------------------------------------------------------
 * Row data helpers
 * ------------------------------------------------------------------------- */

const UNTITLED = 'Untitled chat';
/** Rows shown per group before the "More" row. */
const GROUP_LIMIT = 12;

/** A conversation is "named" once it has a real title; the server default does not count. */
function isRealTitle(title) {
    const t = (title || '').trim();
    return t !== '' && t.toLowerCase() !== 'new conversation';
}

function createdDate(conv) {
    const v = conv.createdAt ?? conv.updatedAt;
    const d = v?.toDate ? v.toDate() : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** First sentence of the stored summary, capped for a 280px rail. */
function summaryTitle(conv) {
    const text = (conv.summary || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    const first = text.split(/(?<=[.!?])\s/)[0];
    return first.length > 60 ? `${first.slice(0, 57).trimEnd()}...` : first;
}

/** "Chat, 15 Oct, 2:14 PM": distinguishes otherwise identical untitled rows. */
function stampTitle(conv) {
    const d = createdDate(conv);
    if (!d) return '';
    const day = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
    return `Chat, ${day}, ${time}`;
}

/**
 * Title shown in the rail: real title, else the sample file name, else the summary's first
 * sentence, else "Chat, <date time>" (the list payload carries no first-message text).
 */
export function conversationLabel(conv) {
    if (isRealTitle(conv.title)) return conv.title.trim();
    const file = conv.documentName || conv.document?.file_name;
    if (file) return file;
    return summaryTitle(conv) || stampTitle(conv) || UNTITLED;
}

/** chat | variants | raw. Raw sequencing is FASTQ (or a BAM/CRAM); anything else with a file is a variants file. */
function conversationKind(conv) {
    const name = (conv.documentName || conv.document?.file_name || '').toLowerCase();
    const type = (conv.documentType || conv.document?.file_type || '').toLowerCase();
    if (!name && !type && !conv.documentUrl) return 'chat';
    if (/(\.fastq|\.fq)(\.gz)?$/.test(name) || type.includes('fastq') || type === 'fq') return 'raw';
    if (/\.(bam|cram)$/.test(name) || type === 'bam' || type === 'cram') return 'raw';
    return 'variants';
}

const KIND_META = {
    chat: { label: 'Chat', Icon: MessageSquare },
    variants: { label: 'Variants file', Icon: FileSpreadsheet },
    raw: { label: 'Raw sequencing', Icon: Dna },
};

/** Job status mapped onto the record by ChatPage (`annovar_job.status`); null when there is none. */
function conversationStatus(conv) {
    const raw = conv.status ?? conv.pipelineStatus ?? conv.jobStatus ?? (conv.isRunning ? 'running' : null);
    if (!raw) return null;
    const s = String(raw).toLowerCase();
    if (['running', 'processing', 'in_progress', 'queued', 'pending'].includes(s)) return 'running';
    if (['failed', 'error'].includes(s)) return 'failed';
    return null;
}

function toDate(conv) {
    const v = conv.updatedAt ?? conv.createdAt;
    const d = v?.toDate ? v.toDate() : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Newest first, grouped by calendar-day distance: Today / Previous 7 days / Previous 30 days / Older. */
function groupConversations(convs) {
    const stamp = (c) => toDate(c)?.getTime() ?? 0;
    const sorted = [...convs].sort((a, b) => stamp(b) - stamp(a));
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const buckets = { today: [], week: [], month: [], older: [] };

    sorted.forEach((conv) => {
        const d = toDate(conv);
        if (!d) { buckets.older.push(conv); return; }
        const dayStart = new Date(d);
        dayStart.setHours(0, 0, 0, 0);
        const days = Math.round((startOfToday - dayStart) / 86400000);
        if (days <= 0) buckets.today.push(conv);
        else if (days < 7) buckets.week.push(conv);
        else if (days < 30) buckets.month.push(conv);
        else buckets.older.push(conv);
    });

    return [
        { label: 'Today', items: buckets.today },
        { label: 'Previous 7 days', items: buckets.week },
        { label: 'Previous 30 days', items: buckets.month },
        { label: 'Older', items: buckets.older },
    ].filter((g) => g.items.length > 0);
}

/** Compact relative time for the right edge of a row: now, 5m, 3h, 9d, 5w, 3mo. */
function shortAgo(conv) {
    const d = toDate(conv);
    if (!d) return '';
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;
    if (days < 365) return `${Math.floor(days / 30)}mo`;
    return `${Math.floor(days / 365)}y`;
}

const IS_MAC = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || '');
const NEW_CHAT_HINT = IS_MAC ? '\u2318N' : 'Ctrl N';

/* ---------------------------------------------------------------------------
 * Small pieces
 * ------------------------------------------------------------------------- */

/** Rows use an inset ring so the focus indicator is never clipped by the list container. */
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70';
const FOCUS_RING_INSET = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70';

/** One size and one stroke for every rail icon. */
const ICON = { 'aria-hidden': true, strokeWidth: 1.75 };

const ICON_BTN = cn(
    'inline-flex shrink-0 items-center justify-center rounded-[var(--row-radius)] text-[var(--text-secondary)] transition-colors duration-150 hover:bg-sidebar-accent/60 hover:text-[var(--text-primary)] aria-expanded:bg-sidebar-accent aria-expanded:text-[var(--text-primary)]',
    FOCUS_RING
);

/** The shared 32px rail row: icon, label, optional right hint. Used by New chat, Search and More. */
const ROW_BASE = cn(
    'flex h-8 w-full items-center gap-2 rounded-[var(--row-radius)] px-2 text-left text-[13px] leading-none text-[var(--text-primary)] transition-colors duration-150 hover:bg-sidebar-accent/60 max-md:h-11 max-md:text-[15px]',
    FOCUS_RING_INSET
);

/** Tooltip around a trigger element. Used on every icon-only control in the rail. */
function Tip({ label, side = 'right', render, children, enabled = true }) {
    if (!enabled) {
        return cloneElement(render, undefined, children);
    }
    return (
        <Tooltip>
            <TooltipTrigger render={render}>{children}</TooltipTrigger>
            <TooltipContent side={side}>{label}</TooltipContent>
        </Tooltip>
    );
}

function Avatar({ name, size = 24 }) {
    return (
        <span
            aria-hidden="true"
            className="flex shrink-0 items-center justify-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[12px] font-medium text-[hsl(var(--brand-700))]"
            style={{ width: size, height: size }}
        >
            {name.charAt(0).toUpperCase()}
        </span>
    );
}

function StatusDot({ status }) {
    if (!status) return null;
    const text = status === 'running' ? 'Running' : 'Failed';
    return (
        <span className="inline-flex shrink-0 items-center">
            <span
                aria-hidden="true"
                className={cn(
                    'size-1.5 rounded-full',
                    status === 'running' ? 'bg-[var(--info)] motion-safe:animate-pulse' : 'bg-[var(--error)]'
                )}
            />
            <span className="sr-only">{text}</span>
        </span>
    );
}

/* ---------------------------------------------------------------------------
 * Rail
 * ------------------------------------------------------------------------- */

const ConversationSidebar = ({
    conversations,
    activeConversationId,
    onSelectConversation,
    onCreateConversation,
    onDeleteConversation,
    /** Optional. (id, title) => void | Promise. The Rename action only appears when this is passed. */
    onRenameConversation,
    /** Optional. True while the first conversations fetch is in flight; shows row skeletons. */
    isLoading = false,
    isOpen,
    onToggle,
    userTier,
    userId,
    onOpenProfile
}) => {
    const isMobile = useIsMobile();
    const navigate = useNavigate();
    const navId = useId();
    const { theme, setTheme } = useTheme();
    const chatMeter = meterFor(useLimits(), 'chat');
    const [pendingDelete, setPendingDelete] = useState(null); // { id, label }
    const [query, setQuery] = useState('');
    const [renamingId, setRenamingId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const [rovingId, setRovingId] = useState(null); // the one row that is in the Tab order
    const [truncId, setTruncId] = useState(null); // row whose title is currently cut off (tooltip only then)
    const searchRef = useRef(null);
    const navRef = useRef(null);
    const focusSearchAfterOpen = useRef(false);
    const renameCancelled = useRef(false);
    const renameByKey = useRef(false);
    const [savedId, setSavedId] = useState(null); // row that just saved a rename (shows a check for a moment)
    const savedTimer = useRef(null);
    useEffect(() => () => clearTimeout(savedTimer.current), []);
    const [openGroups, setOpenGroups] = useState(() => new Set()); // group labels showing every row

    // On a phone the rail is a drawer: whenever it is on screen it shows the full layout.
    const expanded = isMobile || isOpen;

    useEffect(() => {
        if (expanded && focusSearchAfterOpen.current) {
            focusSearchAfterOpen.current = false;
            searchRef.current?.focus();
        }
    }, [expanded]);

    /** Put focus back on a row after the element that had it is gone (delete, rename). */
    const restoreRowFocus = useCallback((id) => {
        if (id == null) return;
        const key = String(id);
        setRovingId(key);
        [60, 240, 460].forEach((ms) => {
            setTimeout(() => {
                const ae = document.activeElement;
                if (ae && ae !== document.body && navRef.current?.contains(ae)) return;
                const target = [...(navRef.current?.querySelectorAll('[data-conv-id]') || [])].find((el) => el.dataset.convId === key);
                target?.focus();
            }, ms);
        });
    }, []);

    const confirmDelete = () => {
        if (pendingDelete) {
            const ids = [...(navRef.current?.querySelectorAll('[data-conv-id]') || [])].map((el) => el.dataset.convId);
            const at = ids.indexOf(String(pendingDelete.id));
            const neighbour = at === -1 ? null : (ids[at + 1] ?? ids[at - 1] ?? null);
            onDeleteConversation(pendingDelete.id);
            if (neighbour) restoreRowFocus(neighbour);
            else setTimeout(() => searchRef.current?.focus(), 120);
        }
        setPendingDelete(null);
    };

    // Get display name from Firebase
    const auth = getAuth();
    const currentUser = auth.currentUser;
    const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User';
    const email = currentUser?.email || '';

    const handleSignOut = async () => {
        // Releases this browser's device slot before signing out. See lib/logout.js.
        await performLogout(navigate);
    };

    const rows = useMemo(
        () => (conversations || []).map((conv) => ({
            conv,
            label: conversationLabel(conv),
            file: conv.documentName || conv.document?.file_name || '',
            kind: conversationKind(conv),
            status: conversationStatus(conv),
        })),
        [conversations]
    );

    const q = query.trim().toLowerCase();
    const visibleRows = useMemo(() => {
        if (!q) return rows;
        return rows.filter((r) =>
            r.label.toLowerCase().includes(q)
            || (r.conv.title || '').toLowerCase().includes(q)
            || (r.conv.summary || '').toLowerCase().includes(q)
            || r.file.toLowerCase().includes(q)
        );
    }, [rows, q]);

    const rowByConv = useMemo(() => new Map(visibleRows.map((r) => [r.conv, r])), [visibleRows]);
    const grouped = useMemo(
        () => groupConversations(visibleRows.map((r) => r.conv)),
        [visibleRows]
    );

    // Which rows are on screen (a group shows 12 until "More"), so exactly one of them can be the Tab stop.
    const groupViews = grouped.map((group) => {
        const activeIdx = group.items.findIndex((c) => String(activeConversationId) === String(c.id));
        const showAll = !!q || openGroups.has(group.label) || group.items.length <= GROUP_LIMIT || activeIdx >= GROUP_LIMIT;
        return { ...group, showAll, shown: showAll ? group.items : group.items.slice(0, GROUP_LIMIT) };
    });
    const renderedIds = groupViews.flatMap((g) => g.shown.map((c) => String(c.id)));
    const tabStopId = renderedIds.includes(String(rovingId))
        ? String(rovingId)
        : renderedIds.includes(String(activeConversationId)) ? String(activeConversationId) : renderedIds[0];

    const startRename = (row) => {
        renameCancelled.current = false;
        renameByKey.current = false;
        setRenamingId(row.conv.id);
        setRenameValue(isRealTitle(row.conv.title) ? row.conv.title.trim() : row.file || '');
    };
    const commitRename = async (row) => {
        const next = renameValue.trim();
        setRenamingId(null);
        if (renameByKey.current) { renameByKey.current = false; restoreRowFocus(row.conv.id); }
        if (renameCancelled.current) { renameCancelled.current = false; return; }
        if (!next || next === row.label || !onRenameConversation) return;
        try {
            await onRenameConversation(row.conv.id, next);
            setSavedId(String(row.conv.id));
            clearTimeout(savedTimer.current);
            savedTimer.current = setTimeout(() => setSavedId(null), 1600);
        } catch (err) {
            console.error('[ConversationSidebar] rename failed:', err);
            toast.error('Could not rename this chat. Try again.');
        }
    };

    /**
     * Keyboard model for the list. Rows are one Tab stop; Up/Down/Home/End move between rows,
     * Right reaches a row's menu button, Left comes back, Enter opens (native button),
     * Delete/Backspace asks to delete, F2 renames.
     */
    const onListKeyDown = (e) => {
        if (!e.currentTarget.contains(e.target)) return; // menus and dialogs are portalled; ignore their keys
        const t = e.target;
        if (!(t instanceof HTMLElement)) return;
        const rowBtn = t.closest('li')?.querySelector('[data-row-button]') || (t.matches('[data-row-button]') ? t : null);
        const items = [...e.currentTarget.querySelectorAll('[data-row-button]')];
        const i = rowBtn ? items.indexOf(rowBtn) : -1;
        if (i === -1) return;
        const go = (el) => { if (el) { e.preventDefault(); el.focus(); } };
        const onMore = t.hasAttribute('data-more-button');
        switch (e.key) {
            case 'ArrowDown': go(items[i + 1]); break;
            case 'ArrowUp': go(items[i - 1]); break;
            case 'Home': go(items[0]); break;
            case 'End': go(items[items.length - 1]); break;
            case 'ArrowRight': if (!onMore) go(t.closest('li')?.querySelector('[data-more-button]')); break;
            case 'ArrowLeft': if (onMore) go(rowBtn); break;
            case 'Delete':
            case 'Backspace': {
                const id = rowBtn?.dataset.convId;
                if (id == null || t.matches('input,textarea')) break;
                const row = visibleRows.find((r) => String(r.conv.id) === id);
                if (row) { e.preventDefault(); setPendingDelete({ id: row.conv.id, label: row.label }); }
                break;
            }
            case 'F2': {
                const id = rowBtn?.dataset.convId;
                const row = visibleRows.find((r) => String(r.conv.id) === id);
                if (row && onRenameConversation) { e.preventDefault(); startRename(row); }
                break;
            }
            default: break;
        }
    };

    // Usage meter. The count is shown as it is (49 of 10 stays 49 of 10); the bar is the only thing clamped.
    const showMeter = chatMeter.tracked && !chatMeter.unlimited && chatMeter.limit != null;
    const used = chatMeter.used || 0;
    const meterWord = showMeter ? meterStatus(used, chatMeter.limit).word : null;
    const meterSummary = showMeter ? `Exchanges: ${used} of ${chatMeter.limit} used${meterWord ? `, ${meterWord.toLowerCase()}` : ''}` : '';
    const planLabel = userTier === 'admin' ? 'Admin' : userTier === 'pro' || userTier === 'super_pro' ? 'Pro' : userTier === 'beta' ? 'Beta' : 'Free';
    // Footer icon buttons are pills: a visible edge appears on hover and while open.
    const FOOT_BTN = 'rounded-full hover:border-[hsl(var(--wb-line))] border border-transparent hover:bg-[hsl(var(--brand-50))] hover:text-[hsl(var(--brand-700))] aria-expanded:bg-[hsl(var(--brand-50))] aria-expanded:border-[hsl(var(--brand-300))]';

    const expandAndSearch = () => {
        focusSearchAfterOpen.current = true;
        onToggle?.();
    };

    /* ---- account menu (shared by expanded + collapsed) ---- */
    const accountMenu = (side, align) => (
        <DropdownMenuContent side={side} align={align} sideOffset={8} className="w-60">
            <DropdownMenuGroup>
                <DropdownMenuLabel className="truncate text-foreground">{email || displayName}</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
                <DropdownMenuLabel>Theme</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v)}>
                    <DropdownMenuRadioItem value="light"><Sun /> Light</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark"><Moon /> Dark</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenProfile}>
                <Settings /> Settings
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
                <LogOut /> Sign out
            </DropdownMenuItem>
        </DropdownMenuContent>
    );

    // New chat shortcut. Some browsers reserve Cmd/Ctrl+N; where the page never sees it the row still works by click.
    const createRef = useRef(onCreateConversation);
    createRef.current = onCreateConversation;
    useEffect(() => {
        if (isMobile) return undefined;
        const onKey = (e) => {
            if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'n') return;
            const t = e.target;
            if (t instanceof HTMLElement && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
            e.preventDefault();
            createRef.current?.();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isMobile]);

    /** Tooltip with the full title, only when the visible title is actually cut off. */
    const measureTruncation = (id) => (e) => {
        const el = e.currentTarget.querySelector('[data-label]');
        setTruncId(el && el.scrollWidth > el.clientWidth + 1 ? id : null);
    };

    const renderRow = (conv) => {
        const row = rowByConv.get(conv);
        const key = String(conv.id);
        const active = String(activeConversationId) === key;
        const { Icon, label: kindLabel } = KIND_META[row.kind];
        const renaming = renamingId === conv.id;
        const ago = shortAgo(conv);
        return (
            <li
                key={conv.id}
                className="group relative [contain-intrinsic-size:auto_32px] [content-visibility:auto]"
                onPointerEnter={measureTruncation(key)}
                onFocusCapture={measureTruncation(key)}
            >
                {renaming ? (
                    <div className="flex h-8 items-center gap-2 rounded-full border border-[hsl(var(--brand-300))] bg-[var(--bg-surface)] px-2.5 shadow-[0_0_0_3px_hsl(var(--brand-100)/0.7)] max-md:h-11">
                        <Icon {...ICON} className="size-4 shrink-0 text-[var(--text-secondary)]" />
                        <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onFocus={(e) => e.target.select()}
                            onBlur={() => commitRename(row)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); renameByKey.current = true; e.currentTarget.blur(); }
                                if (e.key === 'Escape') { e.preventDefault(); renameCancelled.current = true; renameByKey.current = true; e.currentTarget.blur(); }
                            }}
                            aria-label="Chat title"
                            maxLength={MAX_USER_TITLE}
                            placeholder="Name this chat"
                            enterKeyHint="done"
                            className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text-primary)] outline-none placeholder:text-muted-foreground focus-visible:outline-none"
                        />
                    </div>
                ) : (
                    <>
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <button
                                        type="button"
                                        data-row-button
                                        data-conv-id={key}
                                        tabIndex={key === tabStopId ? 0 : -1}
                                        onFocus={() => setRovingId(key)}
                                        onClick={() => onSelectConversation(conv.id)}
                                        onDoubleClick={onRenameConversation ? () => startRename(row) : undefined}
                                        aria-current={active ? 'page' : undefined}
                                        className={cn(
                                            ROW_BASE,
                                            'pr-11 max-md:pr-12',
                                            active ? 'bg-sidebar-accent font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                        )}
                                    />
                                }
                            >
                                <Icon {...ICON} className={cn('size-4 shrink-0', active ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]')} />
                                {row.kind !== 'chat' && <span className="sr-only">{kindLabel}: </span>}
                                <span data-label className="min-w-0 flex-1 truncate">{row.label}</span>
                                {savedId === key ? (
                                    <PopIn className="inline-flex shrink-0 items-center text-[hsl(var(--brand-700))]">
                                        <Check {...ICON} className="size-3.5" />
                                        <span className="sr-only" role="status">Renamed</span>
                                    </PopIn>
                                ) : (
                                    <StatusDot status={row.status} />
                                )}
                            </TooltipTrigger>
                            {truncId === key && (
                                <TooltipContent side="right" className="max-w-[18rem] break-words">
                                    {row.label}
                                </TooltipContent>
                            )}
                        </Tooltip>
                        {/* Right edge: time-ago, swapped for the more menu on hover / focus / open menu. Same box, so nothing shifts. */}
                        {ago && savedId !== key && (
                            <span
                                aria-hidden="true"
                                className={cn(
                                    'pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[12px] tabular-nums transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0 [@media(hover:none)]:opacity-0',
                                    active ? 'text-[var(--text-secondary)]' : 'text-muted-foreground'
                                )}
                            >
                                {ago}
                            </span>
                        )}
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                data-more-button
                                tabIndex={-1}
                                aria-label={`More actions for ${row.label}`}
                                className={cn(
                                    ICON_BTN,
                                    'absolute right-1 top-1/2 size-6 -translate-y-1/2 max-md:right-0.5 max-md:size-10 max-md:rounded-full',
                                    'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 data-[popup-open]:opacity-100 [@media(hover:none)]:opacity-100'
                                )}
                            >
                                <MoreHorizontal {...ICON} className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent side="bottom" align="end" sideOffset={4} className="w-44">
                                {onRenameConversation && (
                                    <DropdownMenuItem onClick={() => startRename(row)}>
                                        <Pencil /> Rename
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => setPendingDelete({ id: conv.id, label: row.label })}
                                >
                                    <Trash2 /> Delete chat
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </>
                )}
            </li>
        );
    };

    return (
        <TooltipProvider>
            <div
                className="relative z-40 flex h-full w-full flex-col overflow-hidden text-[var(--text-primary)]"
                // The phone drawer slides off-screen when closed; keep it out of the tab order and AT tree.
                inert={isMobile && !isOpen ? true : undefined}
            >

                {/* Chrome strip (same height as the thread header): collapse toggle only, no logo block */}
                <div className={cn('flex h-11 shrink-0 items-center', expanded ? 'px-2' : 'justify-center', isMobile && 'h-14 justify-between pl-4')}>
                    {isMobile && <span className="font-brand text-[15px] text-[var(--text-primary)]">Geneie</span>}
                    <Tip
                        label={isMobile ? 'Close' : expanded ? 'Collapse sidebar' : 'Expand sidebar'}
                        render={
                            <button
                                type="button"
                                onClick={onToggle}
                                aria-label={isMobile ? 'Close sidebar' : expanded ? 'Collapse sidebar' : 'Expand sidebar'}
                                aria-expanded={isMobile ? undefined : expanded}
                                aria-controls={navId}
                                className={cn(ICON_BTN, 'size-8 max-md:size-11 max-md:rounded-full')}
                            />
                        }
                    >
                        {isMobile ? <X {...ICON} className="size-4" /> : expanded ? <PanelLeftClose {...ICON} className="size-4" /> : <PanelLeftOpen {...ICON} className="size-4" />}
                    </Tip>
                </div>

                {/* New chat + Search: plain rows */}
                <div className={cn('flex shrink-0 flex-col gap-0.5 pb-1', expanded ? 'px-2' : 'items-center')}>
                    {expanded ? (
                        <>
                            <button type="button" onClick={onCreateConversation} className={ROW_BASE}>
                                <SquarePen {...ICON} className="size-4 shrink-0 text-[var(--text-secondary)]" />
                                <span className="flex-1 truncate">New chat</span>
                                <span aria-hidden="true" className="text-[12px] text-muted-foreground max-md:hidden">{NEW_CHAT_HINT}</span>
                            </button>
                            <label className={cn(ROW_BASE, 'cursor-text focus-within:bg-sidebar-accent/60 focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring/70')}>
                                <Search {...ICON} className="size-4 shrink-0 text-[var(--text-secondary)]" />
                                <input
                                    ref={searchRef}
                                    type="search"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Escape') setQuery('');
                                        if (e.key === 'ArrowDown') {
                                            const first = navRef.current?.querySelector('[data-row-button][tabindex="0"]') || navRef.current?.querySelector('[data-row-button]');
                                            if (first) { e.preventDefault(); first.focus(); }
                                        }
                                    }}
                                    placeholder="Search"
                                    aria-label="Search chats"
                                    autoComplete="off"
                                    spellCheck={false}
                                    className="min-w-0 flex-1 bg-transparent text-[13px] leading-none text-[var(--text-primary)] outline-none focus-visible:outline-none placeholder:text-[var(--text-primary)] focus:placeholder:text-muted-foreground max-md:text-base [&::-webkit-search-cancel-button]:hidden"
                                />
                                {query && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.preventDefault(); setQuery(''); searchRef.current?.focus(); }}
                                        aria-label="Clear search"
                                        className={cn(ICON_BTN, 'size-6 max-md:size-9')}
                                    >
                                        <X {...ICON} className="size-4" />
                                    </button>
                                )}
                            </label>
                        </>
                    ) : (
                        <>
                            <Tip
                                label={`New chat (${NEW_CHAT_HINT})`}
                                render={<button type="button" onClick={onCreateConversation} className={cn(ICON_BTN, 'size-8')} />}
                            >
                                <SquarePen {...ICON} className="size-4" />
                                <span className="sr-only">New chat</span>
                            </Tip>
                            <Tip
                                label="Search chats"
                                render={<button type="button" onClick={expandAndSearch} className={cn(ICON_BTN, 'size-8')} />}
                            >
                                <Search {...ICON} className="size-4" />
                                <span className="sr-only">Search chats</span>
                            </Tip>
                        </>
                    )}
                </div>

                {/* Sessions. Stays mounted when the rail is collapsed (keeps scroll position and search), but inert and hidden. */}
                <div
                    className={cn('flex min-h-0 flex-1 flex-col', !expanded && 'invisible')}
                    inert={!expanded ? true : undefined}
                >
                <ScrollArea className="min-h-0 flex-1">
                    <nav id={navId} ref={navRef} aria-label="Conversations" className="px-2 pb-3" onKeyDown={onListKeyDown}>
                        {/* Announces how many chats match the search. */}
                        <p role="status" className="sr-only">
                            {q ? `${visibleRows.length} ${visibleRows.length === 1 ? 'chat matches' : 'chats match'} your search.` : ''}
                        </p>

                        {isLoading && rows.length === 0 && (
                            <div aria-busy="true" className="flex flex-col gap-0.5 pt-3">
                                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                                    <div key={i} className="flex h-8 items-center gap-2 px-2">
                                        <Skeleton className="size-4 shrink-0" />
                                        <Skeleton className="h-3" style={{ width: `${88 - ((i * 13) % 40)}%` }} />
                                    </div>
                                ))}
                                <span className="sr-only" role="status">Loading chats</span>
                            </div>
                        )}

                        {!isLoading && rows.length === 0 && (
                            <div className="px-3 py-10 text-center">
                                <MessageSquare {...ICON} className="mx-auto mb-2 size-4 text-muted-foreground" />
                                <p className="text-[13px] font-medium text-[var(--text-primary)]">No chats yet</p>
                                <p className="mt-1 text-[12px] text-muted-foreground">Chats and uploaded files you work on appear here.</p>
                                <button
                                    type="button"
                                    onClick={onCreateConversation}
                                    className={cn('mt-3 rounded text-[13px] font-medium text-[hsl(var(--signal))] underline-offset-4 hover:underline', FOCUS_RING)}
                                >
                                    Start a chat
                                </button>
                            </div>
                        )}

                        {rows.length > 0 && visibleRows.length === 0 && (
                            <div className="px-3 py-10 text-center">
                                <p className="text-[13px] font-medium text-[var(--text-primary)]">No matches</p>
                                <p className="mt-1 text-[12px] text-muted-foreground">
                                    No chat title, file name or summary matches &ldquo;{query.trim()}&rdquo;.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setQuery('')}
                                    className={cn('mt-3 rounded text-[13px] font-medium text-[hsl(var(--signal))] underline-offset-4 hover:underline', FOCUS_RING)}
                                >
                                    Clear search
                                </button>
                            </div>
                        )}

                        {groupViews.map((group) => (
                            <section key={group.label} className="mb-1" aria-label={group.label}>
                                <h2 className="px-2 pb-1 pt-3 text-[12px] font-normal text-muted-foreground">
                                    {group.label}
                                </h2>
                                <ul className="m-0 flex list-none flex-col p-0">
                                    {group.shown.map(renderRow)}
                                    {!group.showAll && (
                                        <li>
                                            <button
                                                type="button"
                                                data-row-button
                                                tabIndex={-1}
                                                onClick={() => setOpenGroups((prev) => new Set(prev).add(group.label))}
                                                className={cn(ROW_BASE, 'text-muted-foreground hover:text-[var(--text-primary)]')}
                                            >
                                                <MoreHorizontal {...ICON} className="size-4 shrink-0" />
                                                <span>More</span>
                                                <span className="sr-only">, show {group.items.length - GROUP_LIMIT} more chats</span>
                                            </button>
                                        </li>
                                    )}
                                </ul>
                            </section>
                        ))}
                    </nav>
                </ScrollArea>
                </div>

                {/* Footer: usage, account */}
                <div className="mt-auto shrink-0">
                    {showMeter && expanded && (
                        <UsageMeter
                            compact
                            label="Exchanges"
                            used={used}
                            limit={chatMeter.limit}
                            className="px-4 pb-1 pt-2"
                        />
                    )}

                    {expanded ? (
                        <div className="flex h-12 items-center gap-1 px-3 max-md:h-14">
                            <Avatar name={displayName} />
                            <span className="ml-1.5 flex min-w-0 flex-1 flex-col" title={email || displayName}>
                                <span className="truncate text-[13px] leading-tight text-[var(--text-primary)]">{displayName}</span>
                                <span className="truncate text-[12px] leading-tight text-muted-foreground">{planLabel} plan</span>
                            </span>

                            <NotificationBell
                                onNavigateToConversation={(convId) => onSelectConversation(convId)}
                                onOpenSettings={onOpenProfile}
                                tooltip="Notifications"
                                side={isMobile ? 'top' : 'right'}
                                triggerClassName={cn(ICON_BTN, FOOT_BTN, 'size-8 max-md:size-11')}
                            />
                            <DropdownMenu>
                                <Tip
                                    label="Account and settings"
                                    side="top"
                                    render={
                                        <DropdownMenuTrigger
                                            aria-label="Account menu"
                                            className={cn(ICON_BTN, FOOT_BTN, 'size-8 max-md:size-11')}
                                        />
                                    }
                                >
                                    <Settings {...ICON} className="size-4" />
                                </Tip>
                                {accountMenu('top', 'end')}
                            </DropdownMenu>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-0.5 py-2">
                            {showMeter && (
                                <Tip
                                    label={meterSummary}
                                    render={<div role="img" aria-label={meterSummary} className="mb-1 w-7 py-1.5" />}
                                >
                                    <UsageBar decorative used={used} limit={chatMeter.limit} />
                                </Tip>
                            )}
                            <NotificationBell
                                onNavigateToConversation={(convId) => onSelectConversation(convId)}
                                onOpenSettings={onOpenProfile}
                                tooltip="Notifications"
                                side="right"
                                triggerClassName={cn(ICON_BTN, FOOT_BTN, 'size-8')}
                            />
                            <DropdownMenu>
                                <Tip
                                    label={displayName}
                                    render={
                                        <DropdownMenuTrigger
                                            aria-label="Account menu"
                                            className="flex size-8 items-center justify-center rounded-full border border-transparent transition-colors duration-150 hover:border-[hsl(var(--wb-line))] hover:bg-[hsl(var(--brand-50))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 aria-expanded:border-[hsl(var(--brand-300))] aria-expanded:bg-[hsl(var(--brand-50))]"
                                        />
                                    }
                                >
                                    <Avatar name={displayName} />
                                </Tip>
                                {accountMenu('right', 'end')}
                            </DropdownMenu>
                        </div>
                    )}
                </div>
            </div>

            <AlertDialog
                open={pendingDelete !== null}
                onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete chat?</AlertDialogTitle>
                        <AlertDialogDescription>
                            &ldquo;{pendingDelete?.label}&rdquo; with its messages and uploaded files will be permanently deleted. This can&rsquo;t be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep chat</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={confirmDelete}>
                            Delete chat
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </TooltipProvider>
    );
};

export default ConversationSidebar;
