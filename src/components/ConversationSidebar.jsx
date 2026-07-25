import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Plus, Trash2, ChevronLeft, ChevronRight, Settings, LogOut } from 'lucide-react';
import { getAuth, signOut } from 'firebase/auth';
import { useIsMobile } from '@/hooks/useIsMobile';
import NotificationBell from './NotificationBell';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
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
} from '@/components/ui/dropdown-menu';

const ConversationSidebar = ({
    conversations,
    activeConversationId,
    onSelectConversation,
    onCreateConversation,
    onDeleteConversation,
    isOpen,
    onToggle,
    userTier,
    currentExchanges,
    chatLimit = 10,
    userId,
    onOpenProfile
}) => {
    const isMobile = useIsMobile();
    const navigate = useNavigate();
    const freeChatLimit = userTier === 'free' ? chatLimit : Infinity;
    const [pendingDeleteId, setPendingDeleteId] = useState(null);

    const confirmDelete = () => {
        if (pendingDeleteId != null) {
            onDeleteConversation(pendingDeleteId);
        }
        setPendingDeleteId(null);
    };

    // Get display name from Firebase
    const auth = getAuth();
    const currentUser = auth.currentUser;
    const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User';
    const email = currentUser?.email || '';

    const handleSignOut = async () => {
        try {
            await signOut(auth);
            navigate('/auth');
        } catch (err) {
            console.error('Sign out error:', err);
        }
    };

    // Group conversations by time period (newest first within each group)
    const sortByRecent = (a, b) => {
        const dateA = a.updatedAt?.toDate ? a.updatedAt.toDate() : new Date(a.updatedAt || a.createdAt);
        const dateB = b.updatedAt?.toDate ? b.updatedAt.toDate() : new Date(b.updatedAt || b.createdAt);
        return dateB - dateA;
    };

    const groupConversations = (convs) => {
        const sorted = [...convs].sort(sortByRecent);
        const now = new Date();
        const groups = { today: [], yesterday: [], week: [], month: [], older: [] };

        sorted.forEach((conv) => {
            const date = conv.updatedAt?.toDate ? conv.updatedAt.toDate() : new Date(conv.updatedAt || conv.createdAt);
            const diff = now - date;
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));

            if (days === 0) groups.today.push(conv);
            else if (days === 1) groups.yesterday.push(conv);
            else if (days < 7) groups.week.push(conv);
            else if (days < 30) groups.month.push(conv);
            else groups.older.push(conv);
        });

        const result = [];
        if (groups.today.length) result.push({ label: 'Today', items: groups.today });
        if (groups.yesterday.length) result.push({ label: 'Yesterday', items: groups.yesterday });
        if (groups.week.length) result.push({ label: 'Previous 7 days', items: groups.week });
        if (groups.month.length) result.push({ label: 'Previous 30 days', items: groups.month });
        if (groups.older.length) result.push({ label: 'Older', items: groups.older });
        return result;
    };

    const grouped = groupConversations(conversations);

    return (
        <>
            {/* Circular collapse/expand arrow — desktop only */}
            {!isMobile && (
                <button
                    onClick={onToggle}
                    className="absolute z-50 w-5 h-5 rounded-full flex items-center justify-center right-[-10px] top-[37px] bg-[var(--bg-surface-raised)] text-[var(--text-secondary)] border border-[var(--border-subtle)] transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)]"
                    aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
                >
                    {isOpen ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
            )}

            {/* Sidebar */}
            <div className="relative z-40 h-full w-full flex flex-col overflow-hidden">

                {/* Top: Logo — desktop only (mobile uses main top bar) */}
                {!isMobile && (
                    <div className={`flex items-center h-16 overflow-hidden shrink-0 ${isOpen ? 'px-3' : 'justify-center'}`}>
                        <div className={`flex items-center min-w-0 ${isOpen ? 'gap-0 pl-2' : ''}`}>
                            <img
                                src="/geneie-g.svg"
                                alt="G"
                                className="w-6 h-6 shrink-0"
                            />
                            {isOpen && (
                                <span className="text-sm font-semibold font-brand whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                                    eneie
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* New Chat */}
                <div className={`py-2 overflow-hidden shrink-0 ${isOpen ? 'px-3' : 'flex justify-center'}`}>
                    <button
                        onClick={onCreateConversation}
                        className={`rounded-lg text-sm text-[var(--text-primary)] transition-colors flex items-center overflow-hidden hover:bg-[var(--bg-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)] ${isOpen ? 'w-full py-2.5 px-3 gap-2.5' : 'w-8 h-8 justify-center shrink-0'}`}
                        title="New Chat"
                    >
                        <Plus className="w-4 h-4 shrink-0 text-[var(--text-secondary)]" />
                        {isOpen && (
                            <span className="whitespace-nowrap">
                                New Chat
                            </span>
                        )}
                    </button>
                </div>

                {/* Conversations List — expanded only */}
                <ScrollArea className="flex-1 min-h-0">
                    <div className="px-3 pb-3">
                    {isOpen && conversations.length === 0 && (
                        <div className="text-center py-12 text-[var(--text-tertiary)]">
                            <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">No conversations.</p>
                            <p className="text-xs mt-1 text-[var(--text-disabled)]">Start one from “New Chat”.</p>
                        </div>
                    )}
                    {isOpen && conversations.length > 0 && grouped.map((group) => (
                            <div key={group.label} className="mb-3">
                                <p className="px-3 pt-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider whitespace-nowrap overflow-hidden text-[var(--text-tertiary)]">
                                    {group.label}
                                </p>
                                {group.items.map((conv) => {
                                    const active = activeConversationId === conv.id;
                                    return (
                                        <div key={conv.id} className="group relative mb-0.5 last:mb-0">
                                            <button
                                                type="button"
                                                onClick={() => onSelectConversation(conv.id)}
                                                aria-current={active ? 'page' : undefined}
                                                className={`w-full text-left px-3 py-2 rounded-lg transition-colors overflow-hidden hover:bg-[var(--bg-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)] ${active ? 'bg-[var(--bg-surface-hover)]' : 'bg-transparent'}`}
                                            >
                                                <h3 className={`text-sm truncate whitespace-nowrap pr-6 ${active ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'}`}>
                                                    {conv.title || 'New Conversation'}
                                                </h3>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setPendingDeleteId(conv.id);
                                                }}
                                                className="absolute top-1/2 right-1.5 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--error)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)]"
                                                aria-label={`Delete "${conv.title || 'New Conversation'}"`}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </ScrollArea>

                {/* Bottom section */}
                <div className="mt-auto">
                    {/* Account bar: profile + bell as one segmented unit */}
                    {isOpen ? (
                        <div className="px-3 pb-2">
                            <div className="flex items-stretch rounded-lg overflow-hidden bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                                <DropdownMenu>
                                    <DropdownMenuTrigger
                                        className="flex-1 min-w-0 h-10 px-2.5 flex items-center gap-2.5 cursor-pointer transition-colors hover:bg-[var(--bg-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-teal)]"
                                    >
                                        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-[var(--accent-blue-soft)]">
                                            <span className="text-[11px] font-semibold text-[var(--accent-blue)]">
                                                {displayName.charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <span className="text-sm truncate whitespace-nowrap text-[var(--text-secondary)]">
                                            {displayName}
                                        </span>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent side="top" align="start" className="w-56">
                                        <DropdownMenuGroup>
                                            <DropdownMenuLabel>{email || displayName}</DropdownMenuLabel>
                                        </DropdownMenuGroup>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={onOpenProfile}>
                                            <Settings /> Settings
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
                                            <LogOut /> Sign out
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                <div className="w-px bg-[var(--border-subtle)]" aria-hidden />

                                <NotificationBell
                                    onNavigateToConversation={(convId) => onSelectConversation(convId)}
                                    triggerClassName="h-10 w-10 shrink-0 flex items-center justify-center text-[var(--text-secondary)] cursor-pointer transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-teal)]"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-1 pb-2">
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors hover:bg-[var(--bg-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)]"
                                    title="Profile & Settings"
                                >
                                    <div className="w-6 h-6 rounded-full flex items-center justify-center bg-[var(--accent-blue-soft)]">
                                        <span className="text-[11px] font-semibold text-[var(--accent-blue)]">
                                            {displayName.charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent side="right" align="end" className="w-56">
                                    <DropdownMenuGroup>
                                        <DropdownMenuLabel>{email || displayName}</DropdownMenuLabel>
                                    </DropdownMenuGroup>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={onOpenProfile}>
                                        <Settings /> Settings
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
                                        <LogOut /> Sign out
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <NotificationBell
                                onNavigateToConversation={(convId) => onSelectConversation(convId)}
                                triggerClassName="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] cursor-pointer transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)]"
                            />
                        </div>
                    )}
                    {/* Usage indicator */}
                    {userTier !== 'pro' && (
                        <div className="px-5 py-2.5 mb-1 overflow-hidden" style={{ opacity: isOpen ? 1 : 0, transition: 'opacity 150ms', height: isOpen ? 'auto' : 0 }}>
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>Exchanges</span>
                                <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                                    {currentExchanges || 0}/{freeChatLimit}
                                </span>
                            </div>
                            <Progress
                                value={Math.min(((currentExchanges || 0) / freeChatLimit) * 100, 100)}
                                className={`w-full [&_[data-slot=progress-track]]:h-1 [&_[data-slot=progress-track]]:bg-[var(--bg-surface-hover)] [&_[data-slot=progress-indicator]]:duration-500 ${
                                    (currentExchanges || 0) >= freeChatLimit
                                        ? '[&_[data-slot=progress-indicator]]:bg-[var(--error)]'
                                        : '[&_[data-slot=progress-indicator]]:bg-[var(--accent-teal)]'
                                }`}
                            />
                        </div>
                    )}
                </div>
            </div>

            <AlertDialog
                open={pendingDeleteId !== null}
                onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure? This cannot be undone.
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

        </>
    );
};

export default ConversationSidebar;
