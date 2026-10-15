import { cloneElement, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    SquarePen,
    Search,
    X,
    MoreHorizontal,
    Pencil,
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
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
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

/** Title shown in the rail: real title, else the sample file name, else "Untitled chat". */
export function conversationLabel(conv) {
    if (isRealTitle(conv.title)) return conv.title.trim();
    const file = conv.documentName || conv.document?.file_name;
    if (file) return file;
    return UNTITLED;
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

/**
 * Job status, only when the conversations list exposes it. The list endpoint does not carry
 * pipeline state today, so this stays null until the lead maps `status` onto the record.
 */
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

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55';

const ICON_BTN = cn(
    'inline-flex shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-sidebar-accent/60 hover:text-[var(--text-primary)] aria-expanded:bg-sidebar-accent aria-expanded:text-[var(--text-primary)]',
    FOCUS_RING
);

/** The shared 32px rail row: icon, label, optional right hint. Used by New chat, Search and More. */
const ROW_BASE = cn(
    'flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] leading-none text-[var(--text-primary)] transition-colors hover:bg-sidebar-accent/60 max-md:h-11',
    FOCUS_RING
);

/** Tooltip around a trigger element. Used on every icon-only control in the collapsed rail. */
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
            className="flex shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-2xs font-medium text-[var(--text-secondary)]"
            style={{ width: size, height: size }}
        >
            {name.charAt(0).toUpperCase()}
        </span>
    );
}

function StatusDot({ status }) {
    if (!status) return null;
    return (
        <span className="inline-flex shrink-0 items-center" role="img" aria-label={status === 'running' ? 'Running' : 'Failed'}>
            <span
                className={cn(
                    'size-1.5 rounded-full',
                    status === 'running' ? 'bg-[var(--info)] motion-safe:animate-pulse' : 'bg-[var(--error)]'
                )}
            />
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
    isOpen,
    onToggle,
    userTier,
    userId,
    onOpenProfile
}) => {
    const isMobile = useIsMobile();
    const navigate = useNavigate();
    const { theme, setTheme } = useTheme();
    const chatMeter = meterFor(useLimits(), 'chat');
    const [pendingDelete, setPendingDelete] = useState(null); // { id, label }
    const [query, setQuery] = useState('');
    const [renamingId, setRenamingId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const searchRef = useRef(null);
    const focusSearchAfterOpen = useRef(false);
    const renameCancelled = useRef(false);
    const [openGroups, setOpenGroups] = useState(() => new Set()); // group labels showing every row

    // On a phone the rail is a drawer: whenever it is on screen it shows the full layout.
    const expanded = isMobile || isOpen;

    useEffect(() => {
        if (expanded && focusSearchAfterOpen.current) {
            focusSearchAfterOpen.current = false;
            searchRef.current?.focus();
        }
    }, [expanded]);

    const confirmDelete = () => {
        if (pendingDelete) onDeleteConversation(pendingDelete.id);
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
            || r.file.toLowerCase().includes(q)
        );
    }, [rows, q]);

    const rowByConv = useMemo(() => new Map(visibleRows.map((r) => [r.conv, r])), [visibleRows]);
    const grouped = useMemo(
        () => groupConversations(visibleRows.map((r) => r.conv)),
        [visibleRows]
    );

    const startRename = (row) => {
        renameCancelled.current = false;
        setRenamingId(row.conv.id);
        setRenameValue(isRealTitle(row.conv.title) ? row.conv.title : row.label === UNTITLED ? '' : row.label);
    };
    const commitRename = async (row) => {
        const next = renameValue.trim();
        setRenamingId(null);
        if (renameCancelled.current) { renameCancelled.current = false; return; }
        if (!next || next === row.label || !onRenameConversation) return;
        try {
            await onRenameConversation(row.conv.id, next);
        } catch (err) {
            console.error('[ConversationSidebar] rename failed:', err);
            toast.error('Could not rename this chat. Try again.');
        }
    };

    // Arrow keys walk the list; Tab still works as usual.
    const onListKeyDown = (e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const items = [...e.currentTarget.querySelectorAll('[data-row-button]')];
        const i = items.indexOf(document.activeElement);
        if (i === -1) return;
        e.preventDefault();
        const next = items[i + (e.key === 'ArrowDown' ? 1 : -1)];
        next?.focus();
    };

    // Usage meter
    const showMeter = chatMeter.tracked && !chatMeter.unlimited && chatMeter.limit != null;
    const used = chatMeter.used || 0;
    const usedPct = showMeter ? Math.min((used / chatMeter.limit) * 100, 100) : 0;
    const meterTone = !showMeter ? '' : used >= chatMeter.limit ? 'error' : usedPct >= 80 ? 'warning' : 'ok';
    const meterBar = cn(
        '[&_[data-slot=progress-track]]:h-1 [&_[data-slot=progress-track]]:bg-border [&_[data-slot=progress-indicator]]:duration-500',
        meterTone === 'error' && '[&_[data-slot=progress-indicator]]:bg-[var(--error)]',
        meterTone === 'warning' && '[&_[data-slot=progress-indicator]]:bg-[var(--warning)]',
        meterTone === 'ok' && '[&_[data-slot=progress-indicator]]:bg-primary'
    );

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

    const renderRow = (conv) => {
        const row = rowByConv.get(conv);
        const active = String(activeConversationId) === String(conv.id);
        const { Icon, label: kindLabel } = KIND_META[row.kind];
        const renaming = renamingId === conv.id;
        const ago = shortAgo(conv);
        return (
            <li key={conv.id} className="group relative">
                {renaming ? (
                    <div className="flex h-8 items-center gap-2 rounded-lg bg-sidebar-accent px-2 max-md:h-11">
                        <Icon aria-hidden="true" className="size-3.5 shrink-0 text-[var(--text-tertiary)]" />
                        <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onFocus={(e) => e.target.select()}
                            onBlur={() => commitRename(row)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
                                if (e.key === 'Escape') { renameCancelled.current = true; e.currentTarget.blur(); }
                            }}
                            aria-label="Chat title"
                            maxLength={120}
                            className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text-primary)] outline-none focus-visible:outline-none"
                        />
                    </div>
                ) : (
                    <>
                        <button
                            type="button"
                            data-row-button
                            onClick={() => onSelectConversation(conv.id)}
                            aria-current={active ? 'page' : undefined}
                            title={row.file && row.file !== row.label ? `${row.label} (${row.file})` : row.label}
                            className={cn(
                                ROW_BASE,
                                'pr-11',
                                active ? 'bg-sidebar-accent' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            )}
                        >
                            <Icon aria-hidden="true" className="size-3.5 shrink-0 text-[var(--text-tertiary)]" />
                            <span className="sr-only">{kindLabel}: </span>
                            <span className={cn('min-w-0 flex-1 truncate', active && 'text-[var(--text-primary)]')}>{row.label}</span>
                            <StatusDot status={row.status} />
                        </button>
                        {/* Right edge: time-ago, swapped for the more menu on hover / focus / open menu. */}
                        {ago && (
                            <span
                                aria-hidden="true"
                                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs tabular-nums text-[var(--text-tertiary)] group-hover:opacity-0 group-focus-within:opacity-0 [@media(hover:none)]:opacity-0"
                            >
                                {ago}
                            </span>
                        )}
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                aria-label={`More actions for ${row.label}`}
                                className={cn(
                                    ICON_BTN,
                                    'absolute right-1 top-1/2 size-6 -translate-y-1/2 max-md:size-9',
                                    'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[popup-open]:opacity-100 [@media(hover:none)]:opacity-100'
                                )}
                            >
                                <MoreHorizontal className="size-4" />
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
                                    <Trash2 /> Delete
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
                <div className={cn('flex h-11 shrink-0 items-center', expanded ? 'px-2' : 'justify-center')}>
                    <Tip
                        label={isMobile ? 'Close' : expanded ? 'Collapse sidebar' : 'Expand sidebar'}
                        render={
                            <button
                                type="button"
                                onClick={onToggle}
                                aria-label={isMobile ? 'Close sidebar' : expanded ? 'Collapse sidebar' : 'Expand sidebar'}
                                aria-expanded={expanded}
                                className={cn(ICON_BTN, 'size-8 max-md:size-11')}
                            />
                        }
                    >
                        {isMobile ? <X className="size-4" /> : expanded ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
                    </Tip>
                </div>

                {/* New chat + Search: plain rows */}
                <div className={cn('flex shrink-0 flex-col gap-0.5 pb-1', expanded ? 'px-2' : 'items-center')}>
                    {expanded ? (
                        <>
                            <button type="button" onClick={onCreateConversation} className={ROW_BASE}>
                                <SquarePen aria-hidden="true" className="size-4 shrink-0 text-[var(--text-secondary)]" />
                                <span className="flex-1 truncate">New chat</span>
                                <span aria-hidden="true" className="text-xs text-[var(--text-tertiary)]">{NEW_CHAT_HINT}</span>
                            </button>
                            <label className={cn(ROW_BASE, 'cursor-text focus-within:bg-sidebar-accent/60')}>
                                <Search aria-hidden="true" className="size-4 shrink-0 text-[var(--text-secondary)]" />
                                <input
                                    ref={searchRef}
                                    type="search"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
                                    placeholder="Search"
                                    aria-label="Search chats"
                                    autoComplete="off"
                                    spellCheck={false}
                                    className="min-w-0 flex-1 bg-transparent text-[13px] leading-none text-[var(--text-primary)] outline-none focus-visible:outline-none placeholder:text-[var(--text-primary)] focus:placeholder:text-[var(--text-tertiary)] max-md:text-base [&::-webkit-search-cancel-button]:hidden"
                                />
                                {query && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.preventDefault(); setQuery(''); searchRef.current?.focus(); }}
                                        aria-label="Clear search"
                                        className={cn(ICON_BTN, 'size-5 max-md:size-9')}
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                )}
                            </label>
                        </>
                    ) : (
                        <>
                            <Tip
                                label={`New chat (${NEW_CHAT_HINT})`}
                                render={<button type="button" onClick={onCreateConversation} aria-label="New chat" className={cn(ICON_BTN, 'size-8')} />}
                            >
                                <SquarePen className="size-4" />
                            </Tip>
                            <Tip
                                label="Search chats"
                                render={<button type="button" onClick={expandAndSearch} aria-label="Search chats" className={cn(ICON_BTN, 'size-8')} />}
                            >
                                <Search className="size-4" />
                            </Tip>
                        </>
                    )}
                </div>

                {/* Sessions */}
                <ScrollArea className="min-h-0 flex-1">
                    {expanded && (
                        <nav aria-label="Conversations" className="px-2 pb-3" onKeyDown={onListKeyDown}>
                            {rows.length === 0 && (
                                <div className="px-3 py-10 text-center">
                                    <MessageSquare aria-hidden="true" className="mx-auto mb-2 size-5 text-[var(--text-disabled)]" />
                                    <p className="text-[13px] font-medium text-[var(--text-primary)]">No chats yet</p>
                                    <p className="mt-1 text-xs text-[var(--text-tertiary)]">Your conversations and samples show up here.</p>
                                    <button
                                        type="button"
                                        onClick={onCreateConversation}
                                        className={cn('mt-3 rounded text-xs font-medium text-[hsl(var(--signal))] underline-offset-4 hover:underline', FOCUS_RING)}
                                    >
                                        Start a chat
                                    </button>
                                </div>
                            )}

                            {rows.length > 0 && visibleRows.length === 0 && (
                                <div className="px-3 py-10 text-center" role="status">
                                    <p className="text-[13px] font-medium text-[var(--text-primary)]">No matches</p>
                                    <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                                        Nothing in your chats matches &ldquo;{query.trim()}&rdquo;.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setQuery('')}
                                        className={cn('mt-3 rounded text-xs font-medium text-[hsl(var(--signal))] underline-offset-4 hover:underline', FOCUS_RING)}
                                    >
                                        Clear search
                                    </button>
                                </div>
                            )}

                            {grouped.map((group) => {
                                const activeIdx = group.items.findIndex((c) => String(activeConversationId) === String(c.id));
                                const showAll =
                                    !!q || openGroups.has(group.label) || group.items.length <= GROUP_LIMIT || activeIdx >= GROUP_LIMIT;
                                const shown = showAll ? group.items : group.items.slice(0, GROUP_LIMIT);
                                return (
                                    <section key={group.label} className="mb-1" aria-label={group.label}>
                                        <h2 className="px-2 pb-1 pt-3 text-xs font-normal text-[var(--text-tertiary)]">
                                            {group.label}
                                        </h2>
                                        <ul className="m-0 flex list-none flex-col p-0">
                                            {shown.map(renderRow)}
                                            {!showAll && (
                                                <li>
                                                    <button
                                                        type="button"
                                                        data-row-button
                                                        onClick={() => setOpenGroups((prev) => new Set(prev).add(group.label))}
                                                        className={cn(ROW_BASE, 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]')}
                                                    >
                                                        <MoreHorizontal aria-hidden="true" className="size-3.5 shrink-0" />
                                                        <span>More</span>
                                                    </button>
                                                </li>
                                            )}
                                        </ul>
                                    </section>
                                );
                            })}
                        </nav>
                    )}
                </ScrollArea>

                {/* Footer: usage, account */}
                <div className="mt-auto shrink-0">
                    {showMeter && expanded && (
                        <div className="px-4 pb-1 pt-2" role="group" aria-label="Chat usage">
                            <div className="mb-1.5 flex items-center justify-between text-xs">
                                <span className="text-[var(--text-tertiary)]">Exchanges</span>
                                <span className={cn('tabular-nums', meterTone === 'error' ? 'font-medium text-destructive' : 'text-[var(--text-secondary)]')}>
                                    {used}/{chatMeter.limit}
                                </span>
                            </div>
                            <Progress
                                value={usedPct}
                                aria-label={`Exchanges used: ${used} of ${chatMeter.limit}`}
                                className={cn('w-full', meterBar)}
                            />
                        </div>
                    )}

                    {expanded ? (
                        <div className="flex h-12 items-center gap-1 px-3 max-md:h-14">
                            <Avatar name={displayName} />
                            <span className="ml-1.5 min-w-0 flex-1 truncate text-[13px] text-[var(--text-primary)]" title={email || displayName}>
                                {displayName}
                            </span>

                            <NotificationBell
                                onNavigateToConversation={(convId) => onSelectConversation(convId)}
                                side={isMobile ? 'top' : 'right'}
                                triggerClassName={cn(ICON_BTN, 'size-8 max-md:size-11')}
                            />
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    aria-label="Account menu"
                                    className={cn(ICON_BTN, 'size-8 max-md:size-11')}
                                >
                                    <Settings aria-hidden="true" className="size-4" />
                                </DropdownMenuTrigger>
                                {accountMenu('top', 'end')}
                            </DropdownMenu>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-0.5 py-2">
                            {showMeter && (
                                <Tip
                                    label={`Exchanges ${used}/${chatMeter.limit}`}
                                    render={<div role="img" aria-label={`Exchanges used: ${used} of ${chatMeter.limit}`} className="mb-1 w-7 py-1.5" />}
                                >
                                    <Progress value={usedPct} className={cn('w-full', meterBar)} />
                                </Tip>
                            )}
                            <NotificationBell
                                onNavigateToConversation={(convId) => onSelectConversation(convId)}
                                tooltip="Notifications"
                                side="right"
                                triggerClassName={cn(ICON_BTN, 'size-8')}
                            />
                            <DropdownMenu>
                                <Tip
                                    label={displayName}
                                    render={
                                        <DropdownMenuTrigger
                                            aria-label="Account menu"
                                            className="flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 aria-expanded:bg-sidebar-accent"
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
                        <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
                        <AlertDialogDescription>
                            &ldquo;{pendingDelete?.label}&rdquo; will be permanently deleted. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={confirmDelete}>
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </TooltipProvider>
    );
};

export default ConversationSidebar;
