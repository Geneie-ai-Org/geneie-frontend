import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { User, X, Mail, Calendar, Settings, CreditCard, LogOut, Database, MessageSquare, FileText } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import SubscriptionPage from './SubscriptionPage';
import { useModalScrollLock } from '@/hooks/useModalScrollLock';

const ProfileManagement = ({ isOpen, onClose, userTier, userId, db, conversations, currentExchanges, chatLimit = 10 }) => {
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
          console.log('[ProfileManagement] User data from Firestore:', data);
          const planStatus = data.planStatus || data.plan_status || 'free';
          console.log('[ProfileManagement] Detected planStatus:', planStatus);
          setOriginalPlanStatus(planStatus);
          const displayTier = planStatus === 'admin' ? 'pro' : planStatus;
          setActualUserTier(displayTier);

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
              if (convData.documentName || convData.documentUrl) {
                totalFiles++;
              }
            }
            setFilesUploaded(totalFiles);
          } catch (fileCountError) {
            console.error('[ProfileManagement] Error counting files:', fileCountError);
            setFilesUploaded(0);
          }
        } else {
          console.warn('[ProfileManagement] User document does not exist in Firestore');
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

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (!isOpen) return null;

  return createPortal(
    <dialog
      open
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm overscroll-contain p-0 w-full h-full max-w-none max-h-none border-0"
      onClick={onClose}
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <div
        ref={panelRef}
        className="rounded-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto overscroll-contain"
        style={{ backgroundColor: 'var(--bg-surface-raised)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-xl)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 px-6 py-5 rounded-t-xl border-b" style={{ backgroundColor: 'var(--bg-surface-raised)', borderColor: 'var(--border-default)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-blue-soft)' }}>
                <User className="w-4 h-4" style={{ color: 'var(--accent-blue)' }} />
              </div>
              <h2 id="profile-modal-title" className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Profile & Settings</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent-blue)' }}></div>
            </div>
          ) : (
            <>
              {/* Account Information */}
              <div className="rounded-lg p-4 border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <User className="w-4 h-4" style={{ color: 'var(--accent-teal)' }} />
                  Account Information
                </h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <Mail className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                    <div className="flex-1 min-w-0">
                      <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Email</label>
                      <p className="text-sm mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>{userEmail}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-4 h-4 mt-0.5 flex items-center justify-center rounded flex-shrink-0" style={{ backgroundColor: 'var(--accent-teal-soft)' }}>
                      {actualUserTier === 'pro' ? '✨' : '🆓'}
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Account Tier</label>
                      <div className="mt-0.5">
                        <span className="inline-block px-2.5 py-0.5 rounded text-xs font-semibold"
                          style={{ backgroundColor: actualUserTier === 'pro' ? 'var(--success-soft)' : 'var(--accent-blue-soft)', color: actualUserTier === 'pro' ? 'var(--success)' : 'var(--accent-blue)' }}
                        >
                          {originalPlanStatus === 'admin' ? '✨ Admin' : actualUserTier === 'pro' ? '✨ Pro' : '🆓 Free'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {accountCreatedAt && (
                    <div className="flex items-start gap-3">
                      <Calendar className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                      <div className="flex-1">
                        <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Member Since</label>
                        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{formatDate(accountCreatedAt)}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Usage Statistics */}
              <div className="rounded-lg p-4 border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <Database className="w-4 h-4" style={{ color: 'var(--accent-teal)' }} />
                  Usage Statistics
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg p-3 border" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
                      <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Conversations</span>
                    </div>
                    <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{conversations?.length || 0}</p>
                  </div>

                  {actualUserTier !== 'pro' && (
                    <div className="rounded-lg p-3 border" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <MessageSquare className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
                        <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Exchanges</span>
                      </div>
                      <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                        {currentExchanges || 0}<span className="text-sm font-normal" style={{ color: 'var(--text-tertiary)' }}>/{freeChatLimit}</span>
                      </p>
                    </div>
                  )}

                  <div className="rounded-lg p-3 border" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
                      <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Files</span>
                    </div>
                    <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{filesUploaded}</p>
                  </div>
                </div>
              </div>

              {/* Settings */}
              <div className="rounded-lg p-4 border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <Settings className="w-4 h-4" style={{ color: 'var(--accent-teal)' }} />
                  Settings
                </h3>
                <div className="space-y-2">
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <p className="font-medium mb-0.5">Notification Preferences</p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Coming soon</p>
                  </div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <p className="font-medium mb-0.5">Privacy Settings</p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Coming soon</p>
                  </div>
                </div>
              </div>

              {/* Subscription */}
              {actualUserTier === 'free' && originalPlanStatus !== 'admin' && (
                <div className="rounded-lg p-4 border-2" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--accent-teal)' }}>
                  <h3 className="text-sm font-semibold mb-1.5 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <CreditCard className="w-4 h-4" style={{ color: 'var(--accent-teal)' }} />
                    Subscription
                  </h3>
                  <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                    Upgrade to Pro for unlimited exchanges and advanced features.
                  </p>
                  <button
                    onClick={() => setShowSubscriptionPage(true)}
                    className="w-full px-4 py-2 rounded-lg font-medium text-sm transition-all"
                    style={{ backgroundColor: 'var(--accent-teal)', color: '#0F0F0F' }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                  >
                    Upgrade to Pro
                  </button>
                </div>
              )}

              {/* Sign Out */}
              <div className="border-t pt-4" style={{ borderColor: 'var(--border-subtle)' }}>
                <button
                  onClick={() => {
                    getAuth().signOut();
                    onClose();
                  }}
                  className="w-full px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                  style={{ backgroundColor: 'var(--error-soft)', borderColor: 'var(--error)', color: 'var(--error)', border: '1px solid' }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
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
