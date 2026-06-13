import { useState, useRef, useCallback } from 'react';
import { getAuth } from 'firebase/auth';
import * as mongodbApi from '../services/mongodbApi';
import { getChatApiUrl } from '@/config/api';
import { getDeviceId } from '@/lib/deviceId';
import { DEFAULT_GUEST_CHAT_LIMIT } from '@/services/backendApi';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_RETRIES = 3;

export function useChatMessaging({
  isAuthReady,
  userId,
  userTier,
  activeConversationId,
  currentDocument,
  guestExchangesUsed,
  setGuestExchangesUsed,
  setGuestLimitExceeded,
  setChatEligibility,
  normalizeChatEligibilityMessage,
  promptChatBlocked,
  variantUploadInProgress,
  tierChatLimit,
  guestLimitExceeded,
  updateConversationTitle,
  setAnnovarMessageModal,
  setIsShowingAuthForm,
}) {
  const [messages, setMessages] = useState([]);
  const [typingText, setTypingText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState('');

  const typingTimeoutRef = useRef(null);
  const typingGenerationIdRef = useRef(0);
  const chatAbortControllerRef = useRef(null);
  const pendingTurnRef = useRef(null);

  const isChatLimitReached =
    (userTier === 'guest' && guestLimitExceeded) ||
    (userTier !== 'guest' && Math.floor(messages.length / 2) >= tierChatLimit);

  const typeMessage = useCallback((fullText, onComplete, sources) => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setTypingText('');
    const myGen = typingGenerationIdRef.current + 1;
    typingGenerationIdRef.current = myGen;
    let i = 0;
    const typeNextChar = () => {
      if (typingGenerationIdRef.current !== myGen) return;
      if (i < fullText.length) {
        setTypingText(fullText.substring(0, i + 1));
        i++;
        typingTimeoutRef.current = setTimeout(typeNextChar, 1);
      } else {
        if (typingGenerationIdRef.current !== myGen) return;
        typingTimeoutRef.current = null;
        if (onComplete) onComplete(fullText, sources);
        setTypingText('');
        setIsLoading(false);
      }
    };
    typeNextChar();
  }, []);

  const cancelGeneration = useCallback(() => {
    if (chatAbortControllerRef.current) {
      chatAbortControllerRef.current.abort();
      chatAbortControllerRef.current = null;
    }
    typingGenerationIdRef.current += 1;
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    setTypingText('');
    setIsLoading(false);
    const pending = pendingTurnRef.current;
    pendingTurnRef.current = null;
    if (pending?.userLocalId != null) {
      const restore = pending.userText ?? '';
      setMessages((prev) => prev.filter((m) => m.id !== pending.userLocalId));
      setInput(restore);
    }
  }, []);

  const appendAssistantAndPersist = useCallback(
    async (wasFirstInConversation, userTextForTitle, aiText, sources, mode = 'full') => {
      const src = sources || [];
      const optimisticId = `temp-ai-${Date.now()}`;

      const addAssistantMessage = (id, messageId = undefined) => {
        setMessages((prev) => [
          ...prev,
          {
            role: 'ai',
            text: aiText,
            sources: src,
            id,
            ...(messageId ? { message_id: messageId } : {}),
          },
        ]);
      };

      if (userTier === 'guest') {
        addAssistantMessage(Date.now());
        if (mode === 'full') {
          const newCount = guestExchangesUsed + 1;
          localStorage.setItem('guest_chat_count', newCount);
          setGuestExchangesUsed(newCount);
          if (newCount >= DEFAULT_GUEST_CHAT_LIMIT) setGuestLimitExceeded(true);
        }
        return;
      }
      if (!userId || !activeConversationId) {
        addAssistantMessage(Date.now());
        return;
      }

      addAssistantMessage(optimisticId);

      try {
        if (mode === 'full') {
          await mongodbApi.createMessage(activeConversationId, 'user', userTextForTitle, []);
          if (wasFirstInConversation) {
            await updateConversationTitle(activeConversationId, userTextForTitle);
          }
        }
        const created = await mongodbApi.createMessage(activeConversationId, 'ai', aiText, src);
        const mid = created?.message_id;
        if (mid) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === optimisticId ? { ...m, id: mid, message_id: mid } : m
            )
          );
        }
      } catch (error) {
        console.error('MongoDB Save Error:', error);
      }
    },
    [userId, userTier, guestExchangesUsed, activeConversationId, updateConversationTitle, setGuestExchangesUsed, setGuestLimitExceeded]
  );

  const persistFailureTurn = useCallback(
    async (wasFirstInConversation, userText, errorText) => {
      setMessages((prev) => [...prev, { role: 'ai', text: errorText, id: Date.now() }]);
      if (userTier === 'guest') {
        const newCount = guestExchangesUsed + 1;
        localStorage.setItem('guest_chat_count', newCount);
        setGuestExchangesUsed(newCount);
        if (newCount >= DEFAULT_GUEST_CHAT_LIMIT) setGuestLimitExceeded(true);
        return;
      }
      if (!userId || !activeConversationId) return;
      try {
        await mongodbApi.createMessage(activeConversationId, 'user', userText, []);
        if (wasFirstInConversation) {
          await updateConversationTitle(activeConversationId, userText);
        }
        await mongodbApi.createMessage(activeConversationId, 'ai', errorText, []);
      } catch (error) {
        console.error('MongoDB Save Error (failure path):', error);
      }
    },
    [userId, userTier, guestExchangesUsed, activeConversationId, updateConversationTitle, setGuestExchangesUsed, setGuestLimitExceeded]
  );

  const runChatCompletion = useCallback(
    async (userMessageText, historyPayload, signal) => {
      let data = null;
      let lastError = null;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (signal.aborted) return { data: null, lastError: null, aborted: true };
        try {
          const requestBody = {
            message: userMessageText,
            history: historyPayload,
            conversationId: activeConversationId || (userTier === 'guest' ? 'guest-session' : null),
            hasUploadedFile: userTier === 'guest' && currentDocument !== null,
          };
          const auth = getAuth();
          const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

          const response = await fetch(getChatApiUrl(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token && { Authorization: `Bearer ${token}` }),
              ...(token && { 'X-Device-Id': getDeviceId() }),
            },
            body: JSON.stringify(requestBody),
            signal,
          });

          if (!response.ok) {
            let errorDetail = null;
            try { errorDetail = await response.json(); } catch { /* ignore */ }
            const code = errorDetail?.detail?.code;
            const message = errorDetail?.detail?.message;

            if (
              code === 'GUEST_LIMIT_REACHED' ||
              code === 'FREE_TIER_LIMIT_REACHED' ||
              code === 'PRO_DAILY_CHAT_LIMIT_REACHED' ||
              code === 'PRO_DEVICE_LIMIT_REACHED' ||
              code === 'PRO_DEVICE_ID_REQUIRED'
            ) {
              return { data: null, lastError: { code, message }, aborted: false };
            }

            if (
              code === 'CHAT_REQUIRES_FILTER' ||
              code === 'CHAT_ANNOVAR_REQUIRED' ||
              code === 'CHAT_TOO_MANY_VARIANTS' ||
              code === 'CHAT_TOO_MANY_VARIANTS_AFTER_FILTER' ||
              code === 'S3_LINE_COUNT_PENDING' ||
              code === 'CHAT_NOT_ALLOWED'
            ) {
              setChatEligibility({
                allowed: false,
                message: normalizeChatEligibilityMessage(message),
                reason: code,
              });
              return { data: null, lastError: new Error(message || code), aborted: false };
            }

            lastError = new Error(message || `API Error: ${response.status} ${response.statusText}`);
            throw lastError;
          }

          data = await response.json();
          return { data, lastError: null, aborted: false };
        } catch (error) {
          if (error.name === 'AbortError') {
            return { data: null, lastError: null, aborted: true };
          }
          lastError = error;
          console.error(`Attempt ${attempt + 1} failed:`, error);
          if (attempt < MAX_RETRIES - 1) {
            await sleep(2 ** attempt * 1000);
          }
        }
      }

      return { data: null, lastError, aborted: false };
    },
    [activeConversationId, userTier, currentDocument, setChatEligibility, normalizeChatEligibilityMessage]
  );

  const sendMessage = useCallback(async () => {
    if (!isAuthReady || !input.trim() || typingText || isChatLimitReached || variantUploadInProgress) return;
    if (promptChatBlocked()) return;

    const userMessageText = input.trim();
    setInput('');
    const wasFirstInConversation = messages.length === 0;
    const userLocalId = Date.now();
    setMessages((prev) => [...prev, { role: 'user', text: userMessageText, id: userLocalId }]);
    pendingTurnRef.current = { userText: userMessageText, userLocalId };
    setIsLoading(true);

    const ac = new AbortController();
    chatAbortControllerRef.current = ac;

    const historyPayload = [
      ...messages.map((msg) => ({ role: msg.role, text: msg.text })),
      { role: 'user', text: userMessageText },
    ];

    const { data, lastError, aborted } = await runChatCompletion(userMessageText, historyPayload, ac.signal);
    chatAbortControllerRef.current = null;

    if (aborted) return;

    if (data) {
      typeMessage(data.response, async (finalText, finalSources) => {
        pendingTurnRef.current = null;
        await appendAssistantAndPersist(wasFirstInConversation, userMessageText, finalText, finalSources || [], 'full');
      }, data.sources || []);
    } else {
      pendingTurnRef.current = null;
      setIsLoading(false);
      typingGenerationIdRef.current += 1;

      const code = lastError?.code;
      if (code === 'GUEST_LIMIT_REACHED') {
        setGuestLimitExceeded(true);
        setMessages((prev) => prev.filter((m) => m.id !== userLocalId));
        setAnnovarMessageModal({
          title: 'Chat Limit Reached',
          message: lastError.message || `Guest chat limit reached (${DEFAULT_GUEST_CHAT_LIMIT} exchanges). Sign up to continue.`,
          variant: 'info',
          ctaLabel: 'Sign Up / Log In',
          onCta: () => { setAnnovarMessageModal(null); setIsShowingAuthForm(true); },
        });
        return;
      }
      if (code === 'FREE_TIER_LIMIT_REACHED') {
        setMessages((prev) => prev.filter((m) => m.id !== userLocalId));
        setAnnovarMessageModal({
          title: 'Chat Limit Reached',
          message: lastError.message || `Free tier chat limit reached (${tierChatLimit} exchanges). Upgrade to Pro to continue.`,
          variant: 'info',
          ctaLabel: 'Upgrade to Pro',
          onCta: () => { setAnnovarMessageModal(null); },
        });
        return;
      }
      if (code === 'PRO_DAILY_CHAT_LIMIT_REACHED') {
        setMessages((prev) => prev.filter((m) => m.id !== userLocalId));
        setAnnovarMessageModal({
          title: 'Daily Limit Reached',
          message: lastError.message || 'Pro daily chat limit reached (50). Please try again tomorrow.',
          variant: 'info',
        });
        return;
      }
      if (code === 'PRO_DEVICE_LIMIT_REACHED') {
        setMessages((prev) => prev.filter((m) => m.id !== userLocalId));
        setAnnovarMessageModal({
          title: 'Device Limit Reached',
          message: lastError.message || 'Too many active devices. Sign out from another device first.',
          variant: 'error',
        });
        return;
      }
      if (code === 'PRO_DEVICE_ID_REQUIRED') {
        setMessages((prev) => prev.filter((m) => m.id !== userLocalId));
        setAnnovarMessageModal({
          title: 'Session Error',
          message: 'Device identification required. Please refresh the page.',
          variant: 'error',
        });
        return;
      }

      const errorText = `The server failed after ${MAX_RETRIES} attempts. Please try again later. Error: ${lastError?.message || 'Unknown network error'}`;
      await persistFailureTurn(wasFirstInConversation, userMessageText, errorText);
    }
  }, [
    isAuthReady,
    input,
    typingText,
    isChatLimitReached,
    variantUploadInProgress,
    promptChatBlocked,
    messages,
    runChatCompletion,
    typeMessage,
    appendAssistantAndPersist,
    persistFailureTurn,
    setGuestLimitExceeded,
    setAnnovarMessageModal,
    setIsShowingAuthForm,
    tierChatLimit,
    guestLimitExceeded,
  ]);

  const regenerateLastResponse = useCallback(async () => {
    if (!isAuthReady || isLoading || typingText) return;
    if (promptChatBlocked()) return;
    if (messages.length < 2) return;
    const last = messages[messages.length - 1];
    const prev = messages[messages.length - 2];
    if (last.role !== 'ai' || prev.role !== 'user') return;

    const historyPayload = messages.slice(0, -1).map((m) => ({ role: m.role, text: m.text }));
    const userMessageText = prev.text;
    const aiMessageId = last.message_id;

    setMessages((prevMsgs) => prevMsgs.slice(0, -1));

    if (userTier !== 'guest' && activeConversationId && aiMessageId) {
      try {
        await mongodbApi.deleteMessage(activeConversationId, aiMessageId);
      } catch (e) {
        console.error('[Regenerate] Failed to delete assistant message:', e);
      }
    }

    setIsLoading(true);
    const ac = new AbortController();
    chatAbortControllerRef.current = ac;

    const { data, lastError, aborted } = await runChatCompletion(userMessageText, historyPayload, ac.signal);
    chatAbortControllerRef.current = null;

    if (aborted) return;

    if (data) {
      typeMessage(data.response, async (finalText, finalSources) => {
        await appendAssistantAndPersist(false, userMessageText, finalText, finalSources || [], 'assistant-only');
      }, data.sources || []);
    } else {
      setIsLoading(false);
      typingGenerationIdRef.current += 1;
      const errorText = `The server failed after ${MAX_RETRIES} attempts. Please try again later. Error: ${lastError?.message || 'Unknown network error'}`;
      setMessages((prevMsgs) => [...prevMsgs, { role: 'ai', text: errorText, id: Date.now() }]);
      if (userTier !== 'guest' && activeConversationId) {
        try {
          await mongodbApi.createMessage(activeConversationId, 'ai', errorText, []);
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, [
    isAuthReady,
    isLoading,
    typingText,
    messages,
    userTier,
    activeConversationId,
    runChatCompletion,
    typeMessage,
    appendAssistantAndPersist,
    promptChatBlocked,
  ]);

  return {
    messages,
    setMessages,
    typingText,
    isLoading,
    input,
    setInput,
    sendMessage,
    regenerateLastResponse,
    cancelGeneration,
  };
}
