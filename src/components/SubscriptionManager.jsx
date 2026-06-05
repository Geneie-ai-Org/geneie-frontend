import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Zap, Unlock, TrendingUp } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import SubscriptionPage from './SubscriptionPage';

const FeatureItem = ({ text, isIncluded }) => (
    <li className="flex items-start space-x-2 py-1.5">
        {isIncluded ? (
            <Zap className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
        ) : (
            <Unlock className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--text-tertiary)' }} />
        )}
        <span style={{ color: isIncluded ? 'var(--text-primary)' : 'var(--text-tertiary)' }} className={isIncluded ? '' : 'line-through'}>{text}</span>
    </li>
);

const SubscriptionManager = ({ isInputGated, userId, db }) => {
    const { userTier } = useAuth();
    const auth = getAuth();
    const [showSubscriptionPage, setShowSubscriptionPage] = useState(false);

    const getManagerContent = () => {
        if (userTier === 'guest') {
            return {
                title: "Guest Access: Chat Limits",
                description: "You are not logged in. Your chat is limited to 5 total exchanges and your history will NOT be saved. Sign up to save your progress and get your first free experiment!",
                showUpgrade: true,
                upgradeText: "Sign Up Now",
                action: () => {
                    console.log("Redirect to signup/login triggered by App.jsx");
                }
            };
        } else if (userTier === 'free') {
            return {
                title: "Unlock Unlimited Research",
                description: `Thank you for using Geneie! You've reached your free tier limit of 10 chat exchanges. Upgrade to Pro to continue your research with unlimited conversations, advanced features, and priority support.`,
                showUpgrade: true,
                upgradeText: "Upgrade to Pro",
                action: () => {
                    setShowSubscriptionPage(true);
                }
            };
        } else if (userTier === 'pro') {
            return {
                title: "🎉 Pro Subscriber: Welcome!",
                description: "You have unlimited chat, access to 1 free experiment (plus purchasing options), and unlimited file uploads. You're ready to go!",
                showUpgrade: false,
                upgradeText: "Manage Subscription",
                action: () => {
                    setShowSubscriptionPage(true);
                }
            };
        }
        return { title: "Loading...", description: "" };
    };

    const content = getManagerContent();

    return (
        <>
            {showSubscriptionPage && (
                <SubscriptionPage
                    isOpen={showSubscriptionPage}
                    onClose={() => setShowSubscriptionPage(false)}
                    userId={userId}
                    db={db}
                />
            )}
            <div className="w-full max-w-4xl mx-auto p-6 space-y-8">
            <div className="p-8 rounded-xl border-t-4"
            style={{ backgroundColor: 'var(--bg-surface)', borderTopColor: 'var(--accent-teal)', border: '1px solid var(--border-default)', borderTopWidth: '3px' }}
            >
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center space-x-3">
                        <TrendingUp className="w-5 h-5" style={{ color: 'var(--accent-teal)' }} />
                        <h3 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{content.title}</h3>
                    </div>
                    {userTier !== 'guest' && (
                        <button
                            onClick={() => auth.signOut()}
                            className="text-sm px-3 py-1 rounded-lg hover:bg-white/5 transition-colors"
                            style={{ color: 'var(--text-tertiary)' }}
                        >
                            Sign Out
                        </button>
                    )}
                </div>

                <p className="mb-8 leading-relaxed text-sm" style={{ color: 'var(--text-secondary)' }}>{content.description}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
                    {/* Free/Guest Plan Card */}
                    <div className="p-5 border rounded-lg"
                    style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-default)' }}
                    >
                        <h4 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                            {userTier === 'guest' ? 'Guest Access' : 'Current Plan (Free)'}
                        </h4>
                        <ul className="text-sm space-y-1.5">
                            <FeatureItem text={`Chat Exchanges: ${userTier === 'guest' ? '5 Max' : '10 Max'}`} isIncluded={true} />
                            <FeatureItem text="Conversation History Saved" isIncluded={userTier !== 'guest'} />
                            <FeatureItem text="1 Free Experiment" isIncluded={userTier !== 'guest'} />
                            <FeatureItem text="Unlimited Chat Exchanges" isIncluded={false} />
                            <FeatureItem text="Unlimited File Uploads" isIncluded={false} />
                        </ul>
                    </div>

                    {/* Pro Plan Card */}
                    <div className="p-5 border rounded-lg" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--accent-teal)' }}>
                        <h4 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Pro Plan</h4>
                        <ul className="text-sm space-y-1.5">
                            <FeatureItem text="Chat Exchanges: Unlimited" isIncluded={true} />
                            <FeatureItem text="Conversation History Saved" isIncluded={true} />
                            <FeatureItem text="1 Free Experiment + Purchase Options" isIncluded={true} />
                            <FeatureItem text="Unlimited Chat Exchanges" isIncluded={true} />
                            <FeatureItem text="Unlimited File Uploads" isIncluded={true} />
                            <FeatureItem text="Bioinformatics Pipelines" isIncluded={true} />
                        </ul>
                    </div>
                </div>

                {content.showUpgrade && (
                    <button
                        onClick={content.action}
                        className="mt-6 w-full py-3 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 active:scale-98"
                        style={{ backgroundColor: 'var(--accent-teal)', color: '#0F0F0F' }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                    >
                        {content.upgradeText}
                    </button>
                )}
            </div>

        </div>
        </>
    );
};

export default SubscriptionManager;
