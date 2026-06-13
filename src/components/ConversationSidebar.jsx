import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Plus, Trash2, ChevronLeft, ChevronRight, User, Settings, LogOut } from 'lucide-react';
import { getAuth, signOut } from 'firebase/auth';
import { useIsMobile } from '@/hooks/useIsMobile';

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
    const freeChatLimit = userTier === 'free' ? chatLimit : Infinity;
    const [showAccountMenu, setShowAccountMenu] = useState(false);
    const menuRef = useRef(null);

    // Close menu on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setShowAccountMenu(false);
            }
        };
        if (showAccountMenu) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showAccountMenu]);

    // Get display name from Firebase
    const auth = getAuth();
    const currentUser = auth.currentUser;
    const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User';
    const email = currentUser?.email || '';

    const handleSignOut = async () => {
        try {
            await signOut(auth);
            setShowAccountMenu(false);
            window.location.reload();
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
                    className="absolute z-50 w-5 h-5 rounded-full flex items-center justify-center transition-colors right-[-10px] top-[37px] bg-[var(--bg-surface-raised)] border border-[var(--border-subtle)] text-[var(--text-secondary)]"
                    aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
                >
                    {isOpen ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
            )}

            {/* Sidebar */}
            <div
                className="relative z-40 h-full w-full flex flex-col overflow-hidden"
                style={{ backgroundColor: 'var(--bg-sidebar)' }}
            >

                {/* Top: Logo — desktop only (mobile uses main top bar) */}
                {!isMobile && (
                    <div className={`flex items-center h-16 overflow-hidden shrink-0 ${isOpen ? 'px-3' : 'justify-center'}`}>
                        <div className={`flex items-center min-w-0 ${isOpen ? 'gap-2.5' : ''}`}>
                            <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold tracking-wide"
                                style={{
                                    backgroundColor: isOpen ? 'var(--accent-teal-soft)' : 'transparent',
                                    color: 'var(--accent-teal)'
                                }}
                                aria-hidden
                            >
                                G
                            </div>
                            {isOpen && (
                                <span className="text-sm font-semibold font-brand whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                                    geneie
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* New Chat */}
                <div className={`py-2 overflow-hidden shrink-0 ${isOpen ? 'px-3' : 'flex justify-center'}`}>
                    <button
                        onClick={onCreateConversation}
                        className={`rounded-lg text-sm transition-colors flex items-center hover:bg-white/5 overflow-hidden ${isOpen ? 'w-full py-2.5 px-3 gap-2.5' : 'w-8 h-8 justify-center shrink-0'}`}
                        style={{ color: 'var(--text-primary)' }}
                        title="New Chat"
                    >
                        <Plus className="w-5 h-5 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                        {isOpen && (
                            <span className="whitespace-nowrap">
                                New Chat
                            </span>
                        )}
                    </button>
                </div>

                {/* Conversations List — expanded only */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3">
                    {isOpen && conversations.length === 0 && (
                        <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
                            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">No conversations yet</p>
                        </div>
                    )}
                    {isOpen && conversations.length > 0 && grouped.map((group) => (
                            <div key={group.label} className="mb-4">
                                <p className="px-3 pt-4 pb-2 text-xs font-medium whitespace-nowrap overflow-hidden" style={{ color: 'var(--text-tertiary)' }}>
                                    {group.label}
                                </p>
                                {group.items.map((conv) => (
                                    <div
                                        key={conv.id}
                                        className="group relative px-3 py-2.5 rounded-lg cursor-pointer transition-colors hover:bg-white/5 overflow-hidden"
                                        style={{
                                            backgroundColor: activeConversationId === conv.id ? 'var(--bg-surface-hover)' : 'transparent',
                                        }}
                                        onClick={() => onSelectConversation(conv.id)}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <h3 className="text-sm truncate flex-1 whitespace-nowrap" style={{
                                                color: activeConversationId === conv.id ? 'var(--text-primary)' : 'var(--text-secondary)'
                                            }}>
                                                {conv.title || 'New Conversation'}
                                            </h3>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDeleteConversation(conv.id);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10 shrink-0"
                                                style={{ color: 'var(--text-tertiary)' }}
                                                aria-label="Delete conversation"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                </div>

                {/* Bottom section */}
                <div className="mt-auto">
                    {/* Account button with popover menu */}
                    <div className="relative" ref={menuRef}>
                        {/* Popover menu */}
                        {showAccountMenu && (
                            <div
                                className={`absolute rounded-xl py-1 shadow-lg w-56 z-50 bg-zinc-900 border border-zinc-700/80 ${isOpen ? 'bottom-full left-3 right-3 mb-1' : 'bottom-0 left-full ml-2'}`}
                            >
                                {/* User info */}
                                <div className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300">
                                    <User className="w-4 h-4 shrink-0" />
                                    <div className="min-w-0">
                                        {email && (
                                            <p className="text-sm truncate mt-0.5 text-zinc-300">
                                                {email}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Settings */}
                                <button
                                    onClick={() => { setShowAccountMenu(false); onOpenProfile(); }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/5"
                                >
                                    <Settings className="w-4 h-4" />
                                    Settings
                                </button>

                                {/* Sign out */}
                                <button
                                    onClick={handleSignOut}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-white/5"
                                >
                                    <LogOut className="w-4 h-4" />
                                    Sign out
                                </button>
                            </div>
                        )}

                        <button
                            onClick={() => setShowAccountMenu(!showAccountMenu)}
                            className={`w-full py-3 transition-colors hover:bg-white/5 cursor-pointer overflow-hidden ${isOpen ? 'px-5' : 'px-0'}`}
                            title={isOpen ? undefined : 'Profile & Settings'}
                        >
                            <div className={`flex items-center ${isOpen ? 'gap-2.5' : 'justify-center'}`}>
                                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--accent-blue-soft)' }}>
                                    <span className="text-xs font-semibold" style={{ color: 'var(--accent-blue)' }}>
                                        {displayName.charAt(0).toUpperCase()}
                                    </span>
                                </div>
                                {isOpen && (
                                    <span className="text-sm truncate whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                                        {displayName}
                                    </span>
                                )}
                            </div>
                        </button>
                    </div>
                    {/* Usage indicator */}
                    {userTier !== 'pro' && (
                        <div className="px-5 py-2.5 mb-1 overflow-hidden" style={{ opacity: isOpen ? 1 : 0, transition: 'opacity 150ms', height: isOpen ? 'auto' : 0 }}>
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>Exchanges</span>
                                <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                                    {currentExchanges || 0}/{freeChatLimit}
                                </span>
                            </div>
                            <div className="w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-surface-hover)' }}>
                                <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                        width: `${Math.min(((currentExchanges || 0) / freeChatLimit) * 100, 100)}%`,
                                        backgroundColor: (currentExchanges || 0) >= freeChatLimit ? 'var(--error)' : 'var(--accent-teal)',
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

        </>
    );
};

export default ConversationSidebar;
