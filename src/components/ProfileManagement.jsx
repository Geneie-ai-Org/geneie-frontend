import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, LogOut, ChevronRight, Crown, MessageSquare, FileText, Zap } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import SubscriptionPage from './SubscriptionPage';
import { useModalScrollLock } from '@/hooks/useModalScrollLock';

const ProfileManagement = ({ isOpen, onClose, userTier, userId, db, conversations, currentExchanges, chatLimit = 10 }) => {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState('');
  const [accountCreatedAt, setAccountCreatedAt] = useState(null);
  const [filesUploaded, setFilesUploaded] = useState(0);
  const [actualUserTier, setActualUserTier] = useState(userTier);
  const [originalPlanStatus, setOriginalPlanStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSubscriptionPage, setShowSubscriptionPage] = useState(false);
  const panelRef = useRef(null);

  useModalScrollLock(isOpen, panelRef);

  const freeChatLimit = userTier === 'free' ? chatLimit : Infinity;

  const loadUserData = useCallback(async () => {
    try {
      setLoading(true);
      const auth = getAuth();
      setUserEmail(auth.currentUser?.email || 'N/A');

      if (userId && db) {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
          const data = userDoc.data();
          const planStatus = data.planStatus || data.plan_status || 'free';
          setOriginalPlanStatus(planStatus);
          setActualUserTier(planStatus === 'admin' ? 'pro' : planStatus);

          if (auth.currentUser?.metadata?.creationTime) {
            setAccountCreatedAt(new Date(auth.currentUser.metadata.creationTime));
          }

          try {
            const appId = 'default-app-id';
            const conversationsRef = collection(db, 'artifacts', appId, 'users', userId, 'conversations');
            const conversationsSnapshot = await getDocs(conversationsRef);
            let totalFiles = 0;
            for (const convDoc of conversationsSnapshot.docs) {
              const convData = convDoc.data();
              if (convData.documentName || convData.documentUrl) totalFiles++;
            }
            setFilesUploaded(totalFiles);
          } catch {
            setFilesUploaded(0);
          }
        } else {
          setActualUserTier('free');
        }
      }
    } catch (error) {
      console.error('[ProfileManagement] Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  }, [userId, db]);

  useEffect(() => {
    if (isOpen && userId && db) {
      loadUserData();
    } else if (isOpen) {
      const auth = getAuth();
      setUserEmail(auth.currentUser?.email || 'N/A');
      setLoading(false);
    }
  }, [isOpen, userId, db, loadUserData]);

  if (!isOpen) return null;

  const isPro = actualUserTier === 'pro';
  const isAdmin = originalPlanStatus === 'admin';
  const initial = userEmail ? userEmail.charAt(0).toUpperCase() : '?';
  const convCount = conversations?.length || 0;

  return createPortal(
    <dialog
      open
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm overscroll-contain p-0 w-full h-full max-w-none max-h-none border-0"
      onClick={onClose}
      aria-modal="true"
    >
      <div
        ref={panelRef}
        className="rounded-2xl w-full mx-4 overflow-hidden"
        style={{
          maxWidth: '320px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div
              className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: 'var(--accent-teal)', borderTopColor: 'transparent' }}
            />
          </div>
        ) : (
          <>
            {/* Profile row */}
            <div className="flex items-center gap-3 px-5 pt-5 pb-4">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--accent-teal-soft)' }}
              >
                <span className="text-sm font-bold" style={{ color: 'var(--accent-teal)' }}>{initial}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{userEmail}</p>
                <span
                  className="text-2xs font-semibold px-1.5 py-px rounded mt-0.5 inline-block"
                  style={{
                    backgroundColor: isPro ? 'var(--accent-teal-soft)' : 'var(--bg-surface-hover)',
                    color: isPro ? 'var(--accent-teal)' : 'var(--text-tertiary)',
                  }}
                >
                  {isAdmin ? 'Admin' : isPro ? 'Pro' : 'Free tier'}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-lg transition-colors hover:bg-white/5 shrink-0"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Divider */}
            <div style={{ height: '1px', backgroundColor: 'var(--border-default)' }} />

            {/* Stats list */}
            <div className="px-5 py-3">
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2.5">
                  <MessageSquare className="w-4 h-4" style={{ color: 'var(--text-disabled)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Chats</span>
                </div>
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{convCount}</span>
              </div>

              {actualUserTier !== 'pro' && (
                <div className="py-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Zap className="w-4 h-4" style={{ color: 'var(--text-disabled)' }} />
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Exchanges</span>
                    </div>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {currentExchanges || 0}
                      <span className="font-normal" style={{ color: 'var(--text-disabled)' }}>/{freeChatLimit}</span>
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4" style={{ color: 'var(--text-disabled)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Files</span>
                </div>
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{filesUploaded}</span>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: '1px', backgroundColor: 'var(--border-default)' }} />

            {/* Actions */}
            <div className="px-5 py-4 flex items-center justify-end gap-2.5">
              {/* Upgrade — free users only */}
              {!isPro && !isAdmin && (
                <button
                  onClick={() => setShowSubscriptionPage(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                  style={{ backgroundColor: 'var(--accent-teal)', color: '#0F0F0F' }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                >
                  <Crown className="w-3.5 h-3.5" />
                  Upgrade
                </button>
              )}

              {/* Sign out */}
              <button
                onClick={() => {
                  getAuth().signOut();
                  onClose();
                  navigate('/auth');
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--error)'; e.currentTarget.style.color = 'var(--error)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </>
        )}
      </div>

      {/* Subscription Page */}
      <SubscriptionPage
        isOpen={showSubscriptionPage}
        onClose={() => setShowSubscriptionPage(false)}
        userId={userId}
        db={db}
      />
    </dialog>,
    document.body
  );
};

export default ProfileManagement;
