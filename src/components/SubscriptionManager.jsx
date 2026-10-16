import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { performLogout } from '@/lib/logout';
import { meterFor } from '@/services/tierLimits';
import { useAuth } from '../hooks/useAuth';
import { ArrowUpRight, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SubscriptionPage, { PlanCard } from './SubscriptionPage';

/**
 * Full-page gate shown when the chat allowance is used up (and the plan overview for guests).
 * One message, two plans side by side, one action.
 */
const SubscriptionManager = ({ isInputGated, userId }) => {
    const { userTier, limits } = useAuth();
    const navigate = useNavigate();
    const chatMeter = meterFor(limits, 'chat');
    // The real number from the API rather than a hardcoded one — free is 60 and beta is 100 now.
    const chatLimit = chatMeter.tracked && chatMeter.limit != null ? chatMeter.limit : null;
    const chatLimitCopy = chatLimit != null
        ? `your plan's limit of ${chatLimit} chat exchanges`
        : "your plan's chat limit";
    const [showSubscriptionPage, setShowSubscriptionPage] = useState(false);

    const getManagerContent = () => {
        if (userTier === 'guest') {
            return {
                title: "Sign up to keep going",
                description: "Guest chats are limited to 5 exchanges and your history is not saved. Create an account to save your work and get your first free experiment.",
                showUpgrade: true,
                upgradeText: "Sign up",
                action: () => {
                    navigate('/auth');
                }
            };
        } else if (userTier === 'free' || userTier === 'beta') {
            return {
                title: "You've used your free allowance",
                description: `You've reached ${chatLimitCopy}. Upgrade to Pro to continue your research with a larger monthly allowance, advanced features and priority support.`,
                showUpgrade: true,
                upgradeText: "Upgrade to Pro",
                action: () => {
                    setShowSubscriptionPage(true);
                }
            };
        } else if (userTier === 'pro') {
            return {
                title: "You're on Pro",
                description: "You have unlimited chat, one free experiment (plus purchasing options) and unlimited file uploads.",
                showUpgrade: true,
                upgradeText: "Manage subscription",
                action: () => {
                    setShowSubscriptionPage(true);
                }
            };
        }
        return { title: "Loading", description: "" };
    };

    const content = getManagerContent();
    const isGuest = userTier === 'guest';
    const isPro = userTier === 'pro';
    const freeChat = isGuest
        ? '5 chat exchanges'
        : chatLimit != null ? `${chatLimit} chat exchanges` : 'Limited chat exchanges';

    return (
        <>
            {showSubscriptionPage && (
                <SubscriptionPage
                    isOpen={showSubscriptionPage}
                    onClose={() => setShowSubscriptionPage(false)}
                    userId={userId}
                />
            )}
            <div className="wb-scope flex min-h-0 flex-1 flex-col overflow-y-auto">
            <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
                <div className="wb-rise mb-8 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <span className="wb-chip mb-3" data-tone="brand">
                            {isGuest ? 'Guest' : isPro ? 'Pro plan' : 'Free plan'}
                        </span>
                        <h1 className="text-[18px] font-semibold text-foreground">{content.title}</h1>
                        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">{content.description}</p>
                    </div>
                    {!isGuest && (
                        <Button variant="outline" size="lg" className="shrink-0" onClick={() => performLogout(navigate)}>
                            <LogOut aria-hidden="true" /> Sign out
                        </Button>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <PlanCard
                        name={isGuest ? 'Guest' : 'Free'}
                        current={!isPro}
                        features={[
                            freeChat,
                            ...(isGuest ? [] : ['Conversation history saved', '1 free experiment']),
                        ]}
                    />
                    <PlanCard
                        name="Pro"
                        highlighted
                        current={isPro}
                        features={[
                            'Unlimited chat exchanges',
                            'Unlimited file uploads',
                            'Bioinformatics pipelines',
                            'Conversation history saved',
                            '1 free experiment + purchase options',
                        ]}
                    >
                        {content.showUpgrade && (
                            <Button
                                size="lg"
                                variant={isPro ? 'outline' : 'default'}
                                className="h-10 w-full"
                                onClick={content.action}
                            >
                                {content.upgradeText}
                                {!isPro && !isGuest ? <ArrowUpRight aria-hidden="true" /> : null}
                            </Button>
                        )}
                    </PlanCard>
                </div>
            </main>
            </div>
        </>
    );
};

export default SubscriptionManager;
