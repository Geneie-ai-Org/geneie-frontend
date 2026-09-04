import { useState, useRef, useCallback } from 'react';
import { optionalIdToken } from '@/lib/safeAuth';
import * as mongodbApi from '../services/mongodbApi';
import { getChatApiUrl } from '@/config/api';
import { getDeviceId } from '@/lib/deviceId';
import { DEFAULT_GUEST_CHAT_LIMIT } from '@/services/backendApi';
import { useAuth } from '@/hooks/useAuth';
import { describeLimitError, isLimitCode } from '@/services/limitErrors';
import { streamExploratory } from '@/services/streamExploratory';

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
  isChatLimitReached,
  updateConversationTitle,
  setAnnovarMessageModal,
  setIsShowingAuthForm,
  setConversationWarning,
  onRequestUpgrade,
  onDeviceBlocked,
  onGuestExchange,
}) {
  const { limits, patchLimitsFromChat, refreshSubscriptionStatus } = useAuth();
  const [messages, setMessages] = useState([]);
  const [typingText, setTypingText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState('');

  const typingTimeoutRef = useRef(null);
  const typingGenerationIdRef = useRef(0);
  const chatAbortControllerRef = useRef(null);
  const pendingTurnRef = useRef(null);

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
          // Note: exploratory mode is handled in an earlier branch (streams directly to the
          // exploratory service); this requestBody is the normal PROD chat path only.
          const requestBody = {
            message: userMessageText,
            history: historyPayload,
            conversationId: activeConversationId || (userTier === 'guest' ? 'guest-session' : null),
            hasUploadedFile: userTier === 'guest' && currentDocument !== null,
          };
          // Always attempt a fresh token: optionalIdToken() returns null iff genuinely not signed in
      // (no currentUser). Gating on userTier==='guest' wrongly nulled a valid token when the tier
      // state hadn't resolved yet -> request went out as guest -> backend 400 on the user's own
      // conversation. currentUser is the source of truth, not the tier snapshot.
      const token = await optionalIdToken();

          const response = await fetch(getChatApiUrl(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token && { Authorization: `Bearer ${token}` }),
              'X-Device-Id': getDeviceId(),
            },
            body: JSON.stringify(requestBody),
            signal,
          });

          if (!response.ok) {
            let errorDetail = null;
            try { errorDetail = await response.json(); } catch { /* ignore */ }
            const code = errorDetail?.detail?.code;
            const message = errorDetail?.detail?.message;

            if (isLimitCode(code)) {
              return {
                data: null,
                lastError: { code, message, status: response.status, detail: errorDetail?.detail },
                aborted: false,
              };
            }

            if (
              code === 'CHAT_REQUIRES_FILTER' ||
              code === 'CHAT_ANNOVAR_REQUIRED' ||
              code === 'CHAT_TOO_MANY_VARIANTS' ||
              code === 'CHAT_TOO_MANY_VARIANTS_AFTER_FILTER' ||
              code === 'S3_LINE_COUNT_PENDING' ||
              code === 'CHAT_NOT_ALLOWED'
            ) {
              // Merge, don't replace: a bare object would drop variants_under_consideration
              // and every enrichment_* field, silently breaking the enrichment UI.
              setChatEligibility((prev) => ({
                ...prev,
                allowed: false,
                message: normalizeChatEligibilityMessage(message),
                reason: code,
              }));
              return { data: null, lastError: new Error(message || code), aborted: false };
            }

            lastError = new Error(message || `API Error: ${response.status} ${response.statusText}`);
            lastError.status = response.status;
            lastError.code = code;
            const worthRetrying = response.status >= 500 || response.status === 408 || response.status === 429;
            if (!worthRetrying) {
              return { data: null, lastError, aborted: false };
            }
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

    // --- Exploratory (Strands) mode: stream steps + live answer via SSE, then return.
    // Isolated branch; the normal PROD path below is untouched.
    const exploratoryOn = typeof window !== 'undefined'
      && window.localStorage?.getItem('geneie_exploratory_mode') === 'on';
    if (exploratoryOn) {
      // Auth for the exploratory stream: same as the PROD branch. Signed-in users send a
      // Firebase bearer so the backend resolves ownership; guests use their device id only.
      // (Previously referenced `token` from the PROD branch's scope -> "token is not defined".)
      // Always attempt a fresh token: optionalIdToken() returns null iff genuinely not signed in
      // (no currentUser). Gating on userTier==='guest' wrongly nulled a valid token when the tier
      // state hadn't resolved yet -> request went out as guest -> backend 400 on the user's own
      // conversation. currentUser is the source of truth, not the tier snapshot.
      const token = await optionalIdToken();
      const aiId = userLocalId + 1;
      setMessages((prev) => [...prev, { role: 'ai', text: '', id: aiId, streaming: true, trace: [] }]);
      const patch = (fn) => setMessages((prev) => prev.map((m) => (m.id === aiId ? fn(m) : m)));
      // append an item to the ordered trace; coalesce consecutive 'think' deltas into one item.
      // data carries structured detail for kinds the FE renders richly (e.g. 'routed' -> the
      // multi-agent panel: which agent, why, considered, tools, curated knowledge).
      const pushTrace = (kind, text, data) => patch((m) => {
        const tr = [...(m.trace || [])];
        if (kind === 'think' && tr.length && tr[tr.length - 1].kind === 'think') {
          tr[tr.length - 1] = { kind, text: tr[tr.length - 1].text + text };
        } else {
          tr.push(data ? { kind, text, data } : { kind, text });
        }
        return { ...m, trace: tr };
      });
      let finalAnswer = '';   // accumulate so we can PERSIST the turn after the stream
      try {
        await streamExploratory(userMessageText, (evt) => {
          if (evt.type === 'answer_delta') {
            const t = evt.data?.text || '';
            finalAnswer += t;
            patch((m) => ({ ...m, text: m.text + t }));
          } else if (evt.type === 'routed') {
            // the orchestrator picked a specialised agent -> render the multi-agent panel inline,
            // in stream order, from the structured data (agent / why / considered / tools / packs)
            pushTrace('routed', evt.data?.agent || evt.label, evt.data || {});
          } else if (evt.type === 'critique') {
            // adversarial critic round -> render the objections (or concede) inline
            pushTrace('critique', evt.label, evt.data || {});
          } else if (evt.type === 'revision') {
            // worker's revision/defense for that round
            pushTrace('revision', evt.label, evt.data || {});
          } else if (evt.type === 'thinking') {
            pushTrace('think', evt.data?.text || '');            // real reasoning, in-order
          } else if (evt.type === 'narration') {
            pushTrace('fact', evt.data?.fact || evt.label);      // grounded fact, in-order
          } else if (evt.type === 'refused') {
            finalAnswer = '⚠️ ' + (evt.label || 'Answer withheld (not grounded).');
            patch((m) => ({ ...m, text: finalAnswer }));
          } else if (evt.type === 'error') {
            patch((m) => ({ ...m, text: 'Error: ' + (evt.data?.error || 'stream failed') }));
          } else if (evt.type === 'done') {
            patch((m) => ({ ...m, streaming: false }));
          } else if (evt.type === 'tool_call') {
            pushTrace('toolcall', evt.data?.query || evt.label);  // starts a new timeline turn
          } else if (evt.type === 'tool_result') {
            pushTrace('toolresult', evt.label);                   // row count for the current turn
          } else {
            // planning / verifying -> a plain step line, in-order
            if (evt.label) pushTrace('step', evt.label);
          }
        }, ac.signal, activeConversationId || 'guest-session',
           { ...(token && { Authorization: `Bearer ${token}` }), 'X-Device-Id': getDeviceId() });

        // PERSIST the exploratory turn so it survives reload (Standard persists; this branch didn't).
        // Best-effort — a save failure must never break the live UI.
        if (userId && activeConversationId && finalAnswer.trim()) {
          try {
            await mongodbApi.createMessage(activeConversationId, 'user', userMessageText, []);
            await mongodbApi.createMessage(activeConversationId, 'ai', finalAnswer, []);
          } catch (persistErr) {
            console.error('Exploratory persist error:', persistErr);
          }
        }
      } catch (e) {
        patch((m) => ({ ...m, streaming: false, text: m.text || `Error: ${e.message}` }));
      }
      chatAbortControllerRef.current = null;
      setIsLoading(false);
      // updateConversationTitle expects (conversationId, firstMessage) — the exploratory branch
      // was calling it with just (userMessageText), so firstMessage was undefined -> the title
      // endpoint 422'd. Pass both, and only when we have a real conversation.
      if (wasFirstInConversation && updateConversationTitle && activeConversationId) {
        updateConversationTitle(activeConversationId, userMessageText);
      }
      return;
    }

    const { data, lastError, aborted } = await runChatCompletion(userMessageText, historyPayload, ac.signal);
    chatAbortControllerRef.current = null;

    if (aborted) return;

    if (data) {
      patchLimitsFromChat(data);
      // Guests get no limits block on the response; re-read the server-side Redis meter.
      onGuestExchange?.();
      const warned = data.beta_conversation_warning || data.free_conversation_warning;
      if (warned) {
        setConversationWarning?.(
          data.beta_conversation_warning_message
            || data.free_conversation_warning_message
            || 'This conversation is getting long.'
        );
      }
      typeMessage(data.response, async (finalText, finalSources) => {
        pendingTurnRef.current = null;
        await appendAssistantAndPersist(wasFirstInConversation, userMessageText, finalText, finalSources || [], 'full');
      }, data.sources || []);
    } else {
      pendingTurnRef.current = null;
      setIsLoading(false);
      typingGenerationIdRef.current += 1;

      const descriptor = describeLimitError(lastError, { context: 'chat', limits });
      if (descriptor) {
        // Drop the optimistic user bubble — the turn never happened server-side.
        setMessages((prev) => prev.filter((m) => m.id !== userLocalId));
        if (descriptor.family === 'guestChat') setGuestLimitExceeded(true);
        if (descriptor.refresh) refreshSubscriptionStatus?.();
        if (descriptor.blocking) {
          onDeviceBlocked?.(descriptor);
          return;
        }
        setAnnovarMessageModal({
          title: descriptor.title,
          message: descriptor.message,
          variant: descriptor.variant,
          ...(descriptor.cta.kind === 'signup'
            ? {
                ctaLabel: descriptor.cta.label,
                onCta: () => { setAnnovarMessageModal(null); setIsShowingAuthForm(true); },
              }
            : {}),
          ...(descriptor.cta.kind === 'upgrade' || descriptor.cta.kind === 'topup'
            ? {
                ctaLabel: descriptor.cta.label,
                onCta: () => { setAnnovarMessageModal(null); onRequestUpgrade?.(descriptor.cta.kind); },
              }
            : {}),
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
    setConversationWarning,
    onRequestUpgrade,
    onDeviceBlocked,
    onGuestExchange,
    limits,
    patchLimitsFromChat,
    refreshSubscriptionStatus,
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
      patchLimitsFromChat(data);
      // Guests get no limits block on the response; re-read the server-side Redis meter.
      onGuestExchange?.();
      const warned = data.beta_conversation_warning || data.free_conversation_warning;
      if (warned) {
        setConversationWarning?.(
          data.beta_conversation_warning_message
            || data.free_conversation_warning_message
            || 'This conversation is getting long.'
        );
      }
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
