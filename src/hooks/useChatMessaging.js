import { useState, useRef, useCallback } from 'react';
import { optionalIdToken } from '@/lib/safeAuth';
import * as mongodbApi from '../services/mongodbApi';
import { getChatApiUrl, getChatStreamApiUrl } from '@/config/api';
import { getDeviceId } from '@/lib/deviceId';
import { DEFAULT_GUEST_CHAT_LIMIT } from '@/services/backendApi';
import { useAuth } from '@/hooks/useAuth';
import { describeLimitError, isLimitCode } from '@/services/limitErrors';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_RETRIES = 3;

// Real backend token streaming (SSE via /api/chat/stream). Opt-in via VITE_CHAT_STREAMING so
// the JSON /api/chat path stays the default until the backend endpoint is deployed everywhere.
const CHAT_STREAMING_ENABLED =
  String(import.meta.env?.VITE_CHAT_STREAMING ?? '').toLowerCase() === 'true';

// Map an SSE {type:"error"} detail onto the same shape runChatCompletion returns, so the
// existing limit/eligibility handling in sendMessage works unchanged.
function sseErrorToResult(evt, setChatEligibility, normalizeChatEligibilityMessage) {
  const detail = evt.detail || {};
  const code = detail.code;
  const message = detail.message;
  if (isLimitCode(code)) {
    return { data: null, lastError: { code, message, status: evt.status, detail }, aborted: false };
  }
  if (
    code === 'CHAT_REQUIRES_FILTER' || code === 'CHAT_ANNOVAR_REQUIRED' ||
    code === 'CHAT_TOO_MANY_VARIANTS' || code === 'CHAT_TOO_MANY_VARIANTS_AFTER_FILTER' ||
    code === 'S3_LINE_COUNT_PENDING' || code === 'CHAT_NOT_ALLOWED'
  ) {
    setChatEligibility((prev) => ({
      ...prev, allowed: false,
      message: normalizeChatEligibilityMessage(message), reason: code,
    }));
    return { data: null, lastError: new Error(message || code), aborted: false };
  }
  const err = new Error(message || `Stream error: ${evt.status}`);
  err.status = evt.status; err.code = code;
  return { data: null, lastError: err, aborted: false };
}

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
  // When the in-flight turn was asked. Drives the live "thinking for…" reading, and
  // becomes the answer's recorded duration once the reply lands.
  const [turnStartedAt, setTurnStartedAt] = useState(null);

  const typingTimeoutRef = useRef(null);
  const typingGenerationIdRef = useRef(0);
  const chatAbortControllerRef = useRef(null);
  const pendingTurnRef = useRef(null);

  // The conversation the currently in-flight turn belongs to (loading + typing animation).
  // Used to GATE what the UI renders: typingText/isLoading only belong to the origin
  // conversation. Set when a turn starts, cleared when it finishes/aborts.
  const inFlightOriginRef = useRef(null);

  // Live mirror of the active conversation so async callbacks compare against the CURRENT
  // conversation, not a stale closure. Fixes cross-conversation leak: an in-flight reply
  // must render only if the user is still on the conversation it was asked in.
  const activeConversationIdRef = useRef(activeConversationId);
  activeConversationIdRef.current = activeConversationId;

  // Read-side gate: even if an async writer sets typingText/isLoading, the UI must only see
  // them while viewing the origin conversation. This is the durable guarantee — it scopes what
  // the OTHER conversation is allowed to render, independent of catching every async write path.
  const onOrigin = inFlightOriginRef.current == null
    || inFlightOriginRef.current === activeConversationId;
  const visibleTypingText = onOrigin ? typingText : '';
  const visibleIsLoading = onOrigin ? isLoading : false;

  // originConversationId: the conversation this answer was asked in. The typing animation
  // runs for seconds; if the user switches conversations mid-animation we must STOP writing
  // into the shared typingText state (else the reply visibly leaks into the other conversation),
  // but we must NOT just drop the answer — persistence happens in onComplete. So on a
  // conversation switch we fast-forward: fire onComplete once (persists to the origin) and stop.
  const typeMessage = useCallback((fullText, onComplete, sources, originConversationId = null) => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setTypingText('');
    const myGen = typingGenerationIdRef.current + 1;
    typingGenerationIdRef.current = myGen;
    // If we never pinned an origin, treat the current conversation as origin (back-compat).
    const origin = originConversationId ?? activeConversationIdRef.current;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      typingTimeoutRef.current = null;
      setTypingText('');
      setIsLoading(false);
      inFlightOriginRef.current = null;   // turn done — stop gating
      if (onComplete) onComplete(fullText, sources);
    };
    let i = 0;
    const typeNextChar = () => {
      if (typingGenerationIdRef.current !== myGen) return;   // superseded by a newer turn/cancel
      // Conversation switched away mid-animation → stop animating, but persist to origin.
      if (activeConversationIdRef.current !== origin) { finish(); return; }
      if (i < fullText.length) {
        setTypingText(fullText.substring(0, i + 1));
        i++;
        typingTimeoutRef.current = setTimeout(typeNextChar, 1);
      } else {
        if (typingGenerationIdRef.current !== myGen) return;
        finish();
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
    setTurnStartedAt(null);
    inFlightOriginRef.current = null;
    const pending = pendingTurnRef.current;
    pendingTurnRef.current = null;
    if (pending?.userLocalId != null) {
      const restore = pending.userText ?? '';
      setMessages((prev) => prev.filter((m) => m.id !== pending.userLocalId));
      setInput(restore);
    }
  }, []);

  const appendAssistantAndPersist = useCallback(
    async (wasFirstInConversation, userTextForTitle, aiText, sources, mode = 'full', originConversationId = null, durationMs = null) => {
      const src = sources || [];
      const optimisticId = `temp-ai-${Date.now()}`;
      // The answer belongs to the conversation it was asked in. Persist to that origin
      // unconditionally; only RENDER it if the user is still viewing that conversation
      // (else it lands only in the DB and reloads when they switch back).
      const convId = originConversationId || activeConversationIdRef.current;
      const stillActive = () => activeConversationIdRef.current === convId;

      const addAssistantMessage = (id, messageId = undefined) => {
        setMessages((prev) => [
          ...prev,
          {
            role: 'ai',
            text: aiText,
            sources: src,
            id,
            ...(durationMs != null ? { durationMs } : {}),
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
      if (!userId || !convId) {
        if (stillActive()) addAssistantMessage(Date.now());
        return;
      }

      // Render into the view only if we're still on the origin conversation.
      if (stillActive()) addAssistantMessage(optimisticId);

      try {
        if (mode === 'full') {
          await mongodbApi.createMessage(convId, 'user', userTextForTitle, []);
          if (wasFirstInConversation) {
            await updateConversationTitle(convId, userTextForTitle);
          }
        }
        const created = await mongodbApi.createMessage(convId, 'ai', aiText, src, { durationMs });
        const mid = created?.message_id;
        if (mid && stillActive()) {
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
    [userId, userTier, guestExchangesUsed, updateConversationTitle, setGuestExchangesUsed, setGuestLimitExceeded]
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
          const token = userTier === 'guest' ? null : await optionalIdToken();

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

  // Real token streaming over SSE (/api/chat/stream). Calls onDelta(fullSoFar) as tokens arrive
  // and returns the SAME {data,lastError,aborted} shape as runChatCompletion at end-of-stream, so
  // sendMessage's persistence / limits / leak-fix logic is identical for both paths.
  const runChatCompletionStream = useCallback(
    async (userMessageText, historyPayload, signal, onDelta) => {
      try {
        const requestBody = {
          message: userMessageText,
          history: historyPayload,
          conversationId: activeConversationId || (userTier === 'guest' ? 'guest-session' : null),
          hasUploadedFile: userTier === 'guest' && currentDocument !== null,
        };
        const token = userTier === 'guest' ? null : await optionalIdToken();
        const response = await fetch(getChatStreamApiUrl(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
            'X-Device-Id': getDeviceId(),
          },
          body: JSON.stringify(requestBody),
          signal,
        });

        if (!response.ok || !response.body) {
          let errorDetail = null;
          try { errorDetail = await response.json(); } catch { /* ignore */ }
          return sseErrorToResult(
            { status: response.status, detail: errorDetail?.detail || {} },
            setChatEligibility, normalizeChatEligibilityMessage,
          );
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let full = '';
        let sources = [];
        let meta = {};
        let streamError = null;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (signal.aborted) { try { await reader.cancel(); } catch { /* ignore */ } return { data: null, lastError: null, aborted: true }; }
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // SSE frames are separated by a blank line; each line we care about starts with "data: ".
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';
          for (const frame of frames) {
            const line = frame.split('\n').find((l) => l.startsWith('data: '));
            if (!line) continue;
            let evt;
            try { evt = JSON.parse(line.slice(6)); } catch { continue; }
            if (evt.type === 'delta') {
              full += evt.text || '';
              if (onDelta) onDelta(full);
            } else if (evt.type === 'sources') {
              sources = evt.sources || [];
            } else if (evt.type === 'meta') {
              const { type, ...rest } = evt; // eslint-disable-line no-unused-vars
              meta = rest;
            } else if (evt.type === 'done') {
              full = evt.response ?? full;
            } else if (evt.type === 'error') {
              // If some text streamed before the error, keep it as the partial answer.
              if (evt.partial_response) full = evt.partial_response;
              streamError = evt;
            }
          }
        }

        if (streamError) {
          const res = sseErrorToResult(streamError, setChatEligibility, normalizeChatEligibilityMessage);
          // Preserve any partial text so the caller can still show/persist it if desired.
          if (full) res.partial = full;
          return res;
        }

        return { data: { response: full, sources, ...meta }, lastError: null, aborted: false };
      } catch (error) {
        if (error.name === 'AbortError') return { data: null, lastError: null, aborted: true };
        // Network/parse failure: let the caller fall back to the non-streaming path.
        return { data: null, lastError: error, aborted: false, streamFailed: true };
      }
    },
    [activeConversationId, userTier, currentDocument, setChatEligibility, normalizeChatEligibilityMessage]
  );

  const sendMessage = useCallback(async () => {
    if (!isAuthReady || !input.trim() || typingText || isChatLimitReached || variantUploadInProgress) return;
    if (promptChatBlocked()) return;

    const userMessageText = input.trim();
    setInput('');
    // Pin the conversation this turn belongs to. If the user switches conversations while
    // the reply is in flight, we still persist to (and title) THIS conversation, and skip
    // rendering into whatever conversation is open now (cross-conversation leak fix).
    const originConversationId = activeConversationId;
    inFlightOriginRef.current = originConversationId;   // gate loading/typing to this conversation
    const wasFirstInConversation = messages.length === 0;
    const userLocalId = Date.now();
    setMessages((prev) => [...prev, { role: 'user', text: userMessageText, id: userLocalId }]);
    pendingTurnRef.current = { userText: userMessageText, userLocalId };
    const turnStart = Date.now();
    setTurnStartedAt(turnStart);
    setIsLoading(true);

    const ac = new AbortController();
    chatAbortControllerRef.current = ac;

    const historyPayload = [
      ...messages.map((msg) => ({ role: msg.role, text: msg.text })),
      { role: 'user', text: userMessageText },
    ];

    // Real-streaming path renders tokens live (no fake typewriter). We pin each delta write to
    // the origin conversation: if the user switches away mid-stream, we STOP writing typingText
    // (so nothing leaks into the new conversation) but keep accumulating server-side; the final
    // answer still persists to the origin. This is the real-SSE analog of the typeMessage
    // origin-guard (leak-fix #107 reworked for streaming, R3).
    let streamedLive = false;
    const onDelta = (fullSoFar) => {
      if (activeConversationIdRef.current === originConversationId) {
        streamedLive = true;
        setTypingText(fullSoFar);
      } else {
        // switched away: stop rendering into the shared typingText (would leak into new convo)
        setTypingText('');
      }
    };

    let result;
    if (CHAT_STREAMING_ENABLED) {
      result = await runChatCompletionStream(userMessageText, historyPayload, ac.signal, onDelta);
      // Network/parse failure before any tokens: fall back to the JSON endpoint so a flaky
      // stream never blocks a reply.
      if (result.streamFailed) {
        setTypingText('');
        result = await runChatCompletion(userMessageText, historyPayload, ac.signal);
      }
    } else {
      result = await runChatCompletion(userMessageText, historyPayload, ac.signal);
    }
    const { data, lastError, aborted } = result;
    chatAbortControllerRef.current = null;

    // Thinking is over the moment the answer exists; the typing animation that follows
    // is presentation, not work, so it stays out of the recorded duration.
    const thinkingMs = Date.now() - turnStart;
    setTurnStartedAt(null);

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
      if (activeConversationIdRef.current === originConversationId) {
        if (streamedLive) {
          // Tokens already rendered live via onDelta — no fake typewriter. Clear the transient
          // typingText and persist the final answer to the origin conversation.
          typingGenerationIdRef.current += 1;
          if (typingTimeoutRef.current) { clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = null; }
          setTypingText('');
          setIsLoading(false);
          inFlightOriginRef.current = null;
          pendingTurnRef.current = null;
          await appendAssistantAndPersist(wasFirstInConversation, userMessageText, data.response, data.sources || [], 'full', originConversationId, thinkingMs);
        } else {
          // Non-streaming (JSON path or non-streamable mode returned whole): animate the reply in,
          // then persist. Pass origin so the animation stops (and fast-forwards to persist) if the
          // user switches conversations mid-animation, instead of leaking into the new one.
          typeMessage(data.response, async (finalText, finalSources) => {
            pendingTurnRef.current = null;
            await appendAssistantAndPersist(wasFirstInConversation, userMessageText, finalText, finalSources || [], 'full', originConversationId, thinkingMs);
          }, data.sources || [], originConversationId);
        }
      } else {
        // User navigated away mid-reply: skip the typing animation entirely and persist
        // straight to the origin conversation (it reloads from the DB on switch-back).
        pendingTurnRef.current = null;
        inFlightOriginRef.current = null;
        setIsLoading(false);
        await appendAssistantAndPersist(wasFirstInConversation, userMessageText, data.response, data.sources || [], 'full', originConversationId, thinkingMs);
      }
    } else {
      pendingTurnRef.current = null;
      inFlightOriginRef.current = null;
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
    runChatCompletionStream,
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
    const originConversationId = activeConversationId;
    inFlightOriginRef.current = originConversationId;   // gate loading/typing to this conversation

    setMessages((prevMsgs) => prevMsgs.slice(0, -1));

    if (userTier !== 'guest' && originConversationId && aiMessageId) {
      try {
        await mongodbApi.deleteMessage(originConversationId, aiMessageId);
      } catch (e) {
        console.error('[Regenerate] Failed to delete assistant message:', e);
      }
    }

    const turnStart = Date.now();
    setTurnStartedAt(turnStart);
    setIsLoading(true);
    const ac = new AbortController();
    chatAbortControllerRef.current = ac;

    const { data, lastError, aborted } = await runChatCompletion(userMessageText, historyPayload, ac.signal);
    chatAbortControllerRef.current = null;

    const thinkingMs = Date.now() - turnStart;
    setTurnStartedAt(null);

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
      if (activeConversationIdRef.current === originConversationId) {
        typeMessage(data.response, async (finalText, finalSources) => {
          await appendAssistantAndPersist(false, userMessageText, finalText, finalSources || [], 'assistant-only', originConversationId, thinkingMs);
        }, data.sources || [], originConversationId);
      } else {
        inFlightOriginRef.current = null;
        setIsLoading(false);
        await appendAssistantAndPersist(false, userMessageText, data.response, data.sources || [], 'assistant-only', originConversationId, thinkingMs);
      }
    } else {
      inFlightOriginRef.current = null;
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
    // Gated: typing/loading only surface while viewing the conversation the turn belongs to,
    // so an in-flight reply never bleeds into another conversation (cross-conversation leak fix).
    typingText: visibleTypingText,
    isLoading: visibleIsLoading,
    // Gated the same way: another conversation must not show this turn's stopwatch.
    turnStartedAt: onOrigin ? turnStartedAt : null,
    input,
    setInput,
    sendMessage,
    regenerateLastResponse,
    cancelGeneration,
  };
}
