import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, Loader2, BookOpen, FileText, User, Upload, X, CheckCircle2, AlertCircle, RefreshCw, Square, MessageSquare, PanelRight, ArrowUp, Plus, Copy, ThumbsUp, ThumbsDown, Share2, RotateCw, MoreHorizontal, Bot, Menu } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import * as mongodbApi from '../services/mongodbApi';

// --- prompt-kit imports ---
import { ChatContainerRoot, ChatContainerContent, ChatContainerScrollAnchor } from '../components/prompt-kit/chat-container';
import { ScrollButton } from '../components/prompt-kit/scroll-button';
import { Message, MessageContent, MessageActions, MessageAction } from '../components/prompt-kit/message';
import { Markdown } from '../components/prompt-kit/markdown';
import { PromptInput, PromptInputTextarea, PromptInputActions, PromptInputAction } from '../components/prompt-kit/prompt-input';
import { Source, SourceTrigger, SourceContent } from '../components/prompt-kit/source';

// --- NEW IMPORTS ---
import { useAuth } from '../hooks/useAuth';
import AuthForm from '../components/AuthForm';
import SubscriptionManager from '../components/SubscriptionManager';
import ConversationSidebar from '../components/ConversationSidebar';
import DocumentUpload from '../components/DocumentUpload';
import VariantFilterSidebar from '../components/VariantFilterSidebar';
import ProfileManagement from '../components/ProfileManagement';
import SubscriptionSuccess from '../components/SubscriptionSuccess';
import SubscriptionCanceled from '../components/SubscriptionCanceled';
import ProcessingNotification from '../components/ProcessingNotification';
import ColumnInterpretationResults from '../components/ColumnInterpretationResults';
import VariantAnalysisPipeline from '../components/VariantAnalysisPipeline';
import SessionLoadingScreen from '@/components/SessionLoadingScreen';
import VariantUploadLoadingModal from '@/components/VariantUploadLoadingModal';
import qiagenLogo from '../Qiagen.svg.png';

import { getChatApiUrl, apiUrl } from '@/config/api';
import { buildVariantDataFromConversation, variantFileRowCountForSidebar } from '@/lib/variantPipelineUtils';
import { conversationPath, isValidConversationId } from '@/lib/conversationRoutes';
import { useVariantPipeline } from '@/hooks/useVariantPipeline';
import { useIsMobile } from '@/hooks/useIsMobile';
import { getTierChatLimit, DEFAULT_GUEST_CHAT_LIMIT } from '@/services/backendApi';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const MAX_RETRIES = 3;

// Stable device identifier for Pro session tracking
function getDeviceId() {
  const KEY = 'geneie_device_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

// --- Global Styling for Typing Effect ---
const GlobalTypingStyles = () => (
  <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .animate-blink { animation: blink 0.7s step-end infinite; }
    `}</style>
);

// --- Component 1: Typing Text Animation ---
const TypingText = React.memo(({ text, speed = 30, className, startDelay = 0 }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [index, setIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    const startTimeout = setTimeout(() => {
      if (index < text.length) {
        const charTimeout = setTimeout(() => {
          setDisplayedText((prev) => prev + text[index]);
          setIndex((prev) => prev + 1);
        }, speed);
        return () => clearTimeout(charTimeout);
      } else {
        setIsTyping(false);
      }
    }, index === text.length ? startDelay : speed);

    return () => clearTimeout(startTimeout);
  }, [text, speed, index, startDelay]);

  const isCursorVisible = isTyping || index === text.length;

  return (
    <span className={className}>
      {displayedText}
      {isCursorVisible && <span className="animate-blink" style={{ color: 'var(--text-tertiary)' }}>.</span>}
    </span>
  );
});

// --- Component 2.1: Markdown with Reference Buttons ---
const MarkdownWithReferences = React.memo(({ content, placeholders, scrollToSource }) => {
  const containerRef = useRef(null);

  // Custom text component that replaces placeholders with buttons
  const processTextNode = (text) => {
    if (typeof text !== 'string') return text;

    // Check if text contains any placeholders
    if (!text.includes('{{REF_')) return text;

    const parts = [];
    let lastIndex = 0;
    const placeholderPattern = /\{\{REF_(\d+)\}\}/g;
    let match;

    while ((match = placeholderPattern.exec(text)) !== null) {
      // Add text before placeholder
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      // Add placeholder button
      const placeholderKey = match[0];
      const refInfo = placeholders.get(placeholderKey);
      if (refInfo) {
        parts.push(
          <button
            key={`ref-btn-${match.index}-${refInfo.number}`}
            onClick={(e) => {
              e.preventDefault();
              scrollToSource(refInfo.index);
            }}
            className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 mx-0.5 text-xs font-semibold border rounded hover:bg-white/10 transition-colors cursor-pointer align-middle"
            style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--accent-teal)', borderColor: 'var(--border-default)' }}
            onMouseEnter={(e) => e.target.style.color = 'var(--accent-teal-hover)'}
            onMouseLeave={(e) => e.target.style.color = 'var(--accent-teal)'}
            title={`Click to view source ${refInfo.number}`}
          >
            {refInfo.number}
          </button>
        );
      } else {
        // Placeholder not found in map, keep original text (shouldn't happen)
        console.warn('Placeholder not found in map:', placeholderKey);
        parts.push(match[0]);
      }
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 1 ? <>{parts}</> : text;
  };

  // Process any React node recursively to find and replace placeholders
  const processNode = (node) => {
    if (typeof node === 'string') {
      return processTextNode(node);
    }
    if (Array.isArray(node)) {
      return node.map((child, idx) => (
        <React.Fragment key={idx}>{processNode(child)}</React.Fragment>
      ));
    }
    if (React.isValidElement(node)) {
      // If it's a React element, process its children
      if (node.props && node.props.children) {
        return React.cloneElement(node, {
          ...node.props,
          children: processNode(node.props.children)
        });
      }
      return node;
    }
    return node;
  };

  const textComponent = ({ children, ...props }) => {
    return processNode(children);
  };

  // Custom component factory that processes children
  const createProcessedComponent = (Tag, className = '') => {
    return ({ node, children, ...props }) => {
      const processedChildren = processNode(children);
      return <Tag className={className} {...props}>{processedChildren}</Tag>;
    };
  };

  // Post-process after render to catch any missed placeholders
  useEffect(() => {
    if (containerRef.current && placeholders.size > 0) {
      const walker = document.createTreeWalker(
        containerRef.current,
        NodeFilter.SHOW_TEXT,
        null
      );

      const textNodes = [];
      let node = walker.nextNode();
      while (node) {
        if (node.textContent && node.textContent.includes('{{REF_')) {
          textNodes.push(node);
        }
        node = walker.nextNode();
      }

      // Replace placeholders in text nodes
      textNodes.forEach(textNode => {
        const text = textNode.textContent;
        const placeholderPattern = /\{\{REF_(\d+)\}\}/g;
        let match;
        const fragments = [];
        let lastIndex = 0;

        while ((match = placeholderPattern.exec(text)) !== null) {
          if (match.index > lastIndex) {
            fragments.push(document.createTextNode(text.substring(lastIndex, match.index)));
          }

          const placeholderKey = match[0];
          const refInfo = placeholders.get(placeholderKey);
          if (refInfo) {
            const button = document.createElement('button');
            button.textContent = refInfo.number;
            button.className = 'inline-flex items-center justify-center min-w-[20px] h-5 px-1 mx-0.5 text-xs font-semibold border rounded hover:bg-white/10 transition-colors cursor-pointer align-middle';
            button.style.backgroundColor = 'var(--bg-surface)';
            button.style.color = 'var(--accent-teal)';
            button.style.borderColor = 'var(--border-default)';
            button.addEventListener('mouseenter', () => { button.style.color = 'var(--accent-teal-hover)'; });
            button.addEventListener('mouseleave', () => { button.style.color = 'var(--accent-teal)'; });
            button.title = `Click to view source ${refInfo.number}`;
            button.onclick = (e) => {
              e.preventDefault();
              scrollToSource(refInfo.index);
            };
            fragments.push(button);
          }
          lastIndex = match.index + match[0].length;
        }

        if (fragments.length > 0) {
          if (lastIndex < text.length) {
            fragments.push(document.createTextNode(text.substring(lastIndex)));
          }
          const parent = textNode.parentNode;
          fragments.forEach(fragment => parent.insertBefore(fragment, textNode));
          parent.removeChild(textNode);
        }
      });
    }
  }, [content, placeholders, scrollToSource]);

  return (
    <div ref={containerRef}>
      <Markdown
        components={{
          p: createProcessedComponent('p', 'break-words overflow-wrap-anywhere'),
          strong: createProcessedComponent('strong', 'font-bold'),
          em: createProcessedComponent('em'),
          li: createProcessedComponent('li'),
          span: createProcessedComponent('span'),
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border-collapse border text-sm" style={{ borderColor: 'var(--border-default)' }} {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => <thead style={{ backgroundColor: 'var(--bg-app)' }} {...props} />,
          tbody: ({ node, ...props }) => <tbody {...props} />,
          tr: ({ node, ...props }) => <tr className="border-b hover:bg-white/5" style={{ borderColor: 'var(--border-subtle)' }} {...props} />,
          th: ({ node, ...props }) => <th className="border px-3 py-2 text-left font-semibold" style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} {...props} />,
          td: ({ node, ...props }) => <td className="border px-3 py-2" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }} {...props} />,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
});

// --- Component 2: Chat Message Display ---
const ChatMessage = React.memo(({ role, text, sources, showRegenerate, onRegenerate, regenerateDisabled }) => {
  const isUser = role === 'user';
  const messageRef = useRef(null);
  const [copied, setCopied] = useState(false);

  const scrollToSource = (index) => {
    if (messageRef.current) {
      const sourceElement = messageRef.current.querySelector(`[data-source-index="${index}"]`);
      if (sourceElement) {
        sourceElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        sourceElement.classList.add('bg-white/5', 'border-white/20');
        setTimeout(() => {
          sourceElement.classList.remove('bg-white/5', 'border-white/20');
        }, 2000);
      }
    }
  };

  const handleCopy = () => {
    if (navigator.clipboard && text) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const processedText = React.useMemo(() => {
    if (!text || !sources || sources.length === 0) return { type: 'markdown', content: text };
    const referencePattern = /\[(\d+)\]/g;
    let processedContent = text;
    const placeholderMap = new Map();
    let placeholderIndex = 0;
    let match;
    while ((match = referencePattern.exec(text)) !== null) {
      const refIndex = parseInt(match[1], 10);
      if (refIndex > 0 && refIndex <= sources.length) {
        const placeholder = `{{REF_${placeholderIndex}}}`;
        placeholderMap.set(placeholder, { index: refIndex - 1, number: refIndex });
        processedContent = processedContent.replace(match[0], placeholder);
        placeholderIndex++;
      }
    }
    if (placeholderMap.size === 0) return { type: 'markdown', content: text };
    return { type: 'withRefs', content: processedContent, placeholders: placeholderMap };
  }, [text, sources]);

  const markdownComponents = {
    table: ({ node, ...props }) => (
      <div className="overflow-x-auto my-4">
        <table className="min-w-full border-collapse border text-sm" style={{ borderColor: 'var(--border-default)' }} {...props} />
      </div>
    ),
    thead: ({ node, ...props }) => <thead style={{ backgroundColor: 'var(--bg-app)' }} {...props} />,
    tbody: ({ node, ...props }) => <tbody {...props} />,
    tr: ({ node, ...props }) => <tr className="border-b hover:bg-white/5" style={{ borderColor: 'var(--border-subtle)' }} {...props} />,
    th: ({ node, ...props }) => <th className="border px-3 py-2 text-left font-semibold" style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} {...props} />,
    td: ({ node, ...props }) => <td className="border px-3 py-2" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }} {...props} />,
  };

  if (isUser) {
    return (
      <div className="flex w-full justify-end" ref={messageRef}>
        <div
          className="max-w-[75%] px-4 py-2.5 rounded-3xl text-sm"
          style={{
            backgroundColor: 'var(--bg-surface-raised)',
            color: 'var(--text-primary)',
            wordBreak: 'break-word',
            lineHeight: 1.6,
          }}
        >
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="group flex w-full gap-3" ref={messageRef}>

      <div className="flex-1 min-w-0">
        <MessageContent className="text-sm bg-transparent p-0 rounded-none break-words overflow-wrap-anywhere">
          {processedText.type === 'withRefs' ? (
            <MarkdownWithReferences
              content={processedText.content}
              placeholders={processedText.placeholders}
              scrollToSource={scrollToSource}
            />
          ) : (
            <Markdown className="break-words" components={markdownComponents}>
              {processedText.content}
            </Markdown>
          )}
        </MessageContent>

        {/* Sources */}
        {sources && sources.length > 0 && (
          <div className="mt-3 pt-2.5 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex flex-wrap gap-1.5">
              {sources.map((source, idx) => (
                <Source key={idx} href={source.url || '#'}>
                  <SourceTrigger
                    data-source-index={idx}
                    showFavicon
                    label={
                      <span className="flex items-center gap-1">
                        <span className="font-bold" style={{ color: 'var(--accent-teal)' }}>{idx + 1}</span>
                        <span className="truncate max-w-[120px]">{source.title || source.url || `Source ${idx + 1}`}</span>
                      </span>
                    }
                  />
                  <SourceContent
                    title={source.title || `Source ${idx + 1}`}
                    description={source.url || ''}
                  />
                </Source>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons — hover reveal */}
        <div className="flex items-center gap-0.5 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            type="button"
            onClick={handleCopy}
            className="chat-chrome-btn-sm"
            title={copied ? 'Copied!' : 'Copy'}
          >
            {copied ? <CheckCircle2 style={{ color: 'var(--success)' }} /> : <Copy />}
          </button>
          {showRegenerate && onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={regenerateDisabled}
              className="chat-chrome-btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
              title="Regenerate"
            >
              <RotateCw />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

// --- Main Chat Page ---
const ChatPage = () => {
  const navigate = useNavigate();
  const { conversationId: urlConversationId } = useParams();
  const isMobile = useIsMobile();

  // Conversation state
  const [conversations, setConversations] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => !isMobile);
  const [currentDocument, setCurrentDocument] = useState(null);
  const [variantData, setVariantData] = useState(null);
  const [isVariantSidebarOpen, setIsVariantSidebarOpen] = useState(false);

  useEffect(() => {
    setIsSidebarOpen(!isMobile);
  }, [isMobile]);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false); // Center modal for variant file upload on landing
  const [metadataFormOpen, setMetadataFormOpen] = useState(false);
  const [activeFileTypeTab, setActiveFileTypeTab] = useState('tabular'); // Track active tab for modal color
  const [showFileTypeDropdown, setShowFileTypeDropdown] = useState(null); // 'new-chat' | 'conversation' | null
  const [preSelectedFile, setPreSelectedFile] = useState(null); // File selected via dropdown before modal
  const [uploadingFileName, setUploadingFileName] = useState(null);
  const fileTypeDropdownRef = useRef(null);
  const tsvFileInputRef = useRef(null);
  const vcfFileInputRef = useRef(null);
  const [showSubscriptionSuccess, setShowSubscriptionSuccess] = useState(false);
  const [showSubscriptionCanceled, setShowSubscriptionCanceled] = useState(false);
  const [columnInterpretationResult, setColumnInterpretationResult] = useState(null); // 3-step interpretation results
  const [showInterpretationModal, setShowInterpretationModal] = useState(false); // Show interpretation results modal
  const interpretationShownRef = useRef(false); // Track if we've already shown the modal for current result
  const interpretationDismissedRef = useRef(false); // User closed File Analysis — do not auto-reopen until new upload
  const [annovarMessageModal, setAnnovarMessageModal] = useState(null); // { title, message, variant: 'success'|'error'|'info' } - styled in-app, no browser alert
  const [isAnnovarRecommended, setIsAnnovarRecommended] = useState(false);
  const [conversationFilterState, setConversationFilterState] = useState({
    activeVariantFilters: null,
    filteredVariantCount: null,
    activeProprietaryFilter: null,
    filterWorkingSetCount: null,
  });
  // Message state
  const [messages, setMessages] = useState([]);
  const [typingText, setTypingText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState('');
  // messagesEndRef removed — auto-scroll handled by ChatContainerRoot
  const typingTimeoutRef = useRef(null);
  const typingGenerationIdRef = useRef(0);
  const chatAbortControllerRef = useRef(null);
  const pendingTurnRef = useRef(null);
  const [isShowingAuthForm, setIsShowingAuthForm] = useState(false);
  const [justSignedUp, setJustSignedUp] = useState(false);
  const [pendingEmailVerification, setPendingEmailVerification] = useState(false);
  const [pipelineExpanded, setPipelineExpanded] = useState(false);
  const [pipelineDismissed, setPipelineDismissed] = useState(false);

  // --- HOOK INTEGRATION ---
  const { userId, isAuthReady, userLoading, userTier, subscriptionStatus, refreshSubscriptionStatus } = useAuth();

  const tierChatLimit = getTierChatLimit(userTier, subscriptionStatus);

  const activeConversationId =
    userTier !== 'guest' && urlConversationId && isValidConversationId(urlConversationId)
      ? urlConversationId
      : null;

  const navigateToConversation = useCallback(
    (conversationId, { replace = false } = {}) => {
      navigate(conversationPath(conversationId), { replace });
    },
    [navigate]
  );

  const pipeline = useVariantPipeline({
    userTier,
    userId,
    activeConversationId,
    currentDocument,
    columnInterpretationResult,
    setColumnInterpretationResult,
    setVariantData,
    conversationFilterState,
    setConversationFilterState,
    variantData,
    setShowInterpretationModal,
    interpretationDismissedRef,
    setIsAnnovarRecommended,
    setAnnovarMessageModal,
    setIsShowingAuthForm,
    setJustSignedUp,
    getDeviceId,
  });

  const {
    chatEligibility,
    setChatEligibility,
    pipelineSnapshot,
    pipelineToast,
    setPipelineToast,
    isRunningAnnovar,
    isApplyingAcmgFilter,
    uploadSessionConversationId,
    handleVariantUploadingChange,
    handleUploadProgressChange,
    uploadProgress,
    presentFileAnalysisModal,
    runAnnovarForCurrentConversation,
    runAcmgFilterForCurrentConversation,
    promptChatBlocked,
    isChatPipelineGated,
    pipelineJobActive,
    variantUploadInProgress,
    acmgFilterCanApply,
    syncPipelineFromConversation,
    resetConversationPipeline,
    refreshConversationAfterAnnovar,
    normalizeChatEligibilityMessage,
    remapProprietaryFiltersForConversation,
    convertTabularToVcfForConversation,
    refreshChatEligibilityFromApi,
  } = pipeline;

  const syncPipelineFromConversationRef = useRef(syncPipelineFromConversation);
  syncPipelineFromConversationRef.current = syncPipelineFromConversation;
  const refreshConversationAfterAnnovarRef = useRef(refreshConversationAfterAnnovar);
  refreshConversationAfterAnnovarRef.current = refreshConversationAfterAnnovar;

  const handleUploadStarted = useCallback((fileName) => {
    setUploadingFileName(fileName || null);
  }, []);

  const handleVariantUploadingChangeWithCleanup = useCallback(
    (isUploading) => {
      handleVariantUploadingChange(isUploading);
      if (!isUploading) {
        setUploadingFileName(null);
      }
    },
    [handleVariantUploadingChange]
  );

  // Check for subscription success/cancel in URL, then normalize URL
  useEffect(() => {
    const { pathname, search, hash } = window.location;
    const urlParams = new URLSearchParams(search);
    const sessionId = urlParams.get('session_id');
    const hasSuccessPath = pathname.includes('subscription-success');
    const hasCanceledPath = pathname.includes('subscription-canceled');

    if (hasSuccessPath || sessionId) {
      setShowSubscriptionSuccess(true);
      refreshSubscriptionStatus();
    } else if (hasCanceledPath) {
      setShowSubscriptionCanceled(true);
    }

    if (hasSuccessPath || hasCanceledPath || sessionId) {
      const normalizedPath = pathname
        .replace(/\/subscription-success\/?$/, '/app')
        .replace(/\/subscription-canceled\/?$/, '/app')
        .replace(/\/{2,}/g, '/');
      window.history.replaceState({}, document.title, `${normalizedPath || '/app'}${hash || ''}`);
    }
  }, []);

  // Close file type dropdown on outside click
  useEffect(() => {
    if (!showFileTypeDropdown) return;
    const handleClickOutside = (e) => {
      if (fileTypeDropdownRef.current && !fileTypeDropdownRef.current.contains(e.target)) {
        setShowFileTypeDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFileTypeDropdown]);

  // Handle file selected from dropdown file inputs
  const handleDropdownFileSelect = (e, fileType) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setActiveFileTypeTab(fileType === 'vcf' ? 'vcf' : 'tabular');
    setPreSelectedFile(file);
    setShowUploadModal(true);
    setShowFileTypeDropdown(null);
    // Reset the input so the same file can be re-selected
    e.target.value = '';
  };

  // Handle upload button click — guests go straight to file picker, authenticated users see dropdown
  const handleUploadButtonClick = (source) => {
    const isGuest = userTier === 'guest' || userId === 'guest';
    if (isGuest) {
      // Guests don't need file type selection — trigger TSV/CSV input directly
      tsvFileInputRef.current?.click();
      return;
    }
    setShowFileTypeDropdown(prev => prev === source ? null : source);
  };

  // Listen for custom event to show auth form (from CTAs in guest mode)
  useEffect(() => {
    const handleShowAuthForm = () => {
      setIsShowingAuthForm(true);
      setJustSignedUp(false);
    };

    window.addEventListener('showAuthForm', handleShowAuthForm);
    return () => {
      window.removeEventListener('showAuthForm', handleShowAuthForm);
    };
  }, []);

  // --- GUEST PERSISTENCE STATE (New Logic) ---
  const [guestExchangesUsed, setGuestExchangesUsed] = useState(0);
  const [guestLimitExceeded, setGuestLimitExceeded] = useState(false);

  // *** FIX: DEFINE HANDLER INSIDE THE COMPONENT ***
  const handleSignupSuccess = (status) => {
    setJustSignedUp(status);
    setIsShowingAuthForm(false);
  };

  // Load and check Guest State on component mount/userTier change
  useEffect(() => {
    // Check for pending email verification FIRST (before userTier check)
    // This ensures we catch it immediately and prevent chat flash
    const pendingEmail = localStorage.getItem('pendingEmailVerification');
    if (pendingEmail) {
      setPendingEmailVerification(true);
    }

    // Check if user just verified their email (from URL parameter)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('verified') === 'true') {
      // Clear pending verification state since email is now verified
      localStorage.removeItem('pendingEmailVerification');
      setPendingEmailVerification(false);
      // Show login form instead of signup success
      setIsShowingAuthForm(true);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (userTier === 'guest') {
      const storedCount = parseInt(localStorage.getItem('guest_chat_count') || '0', 10);
      setGuestExchangesUsed(storedCount);
      setGuestLimitExceeded(storedCount >= DEFAULT_GUEST_CHAT_LIMIT);
    } else {
      localStorage.removeItem('guest_chat_count');
      setGuestExchangesUsed(0);
      setGuestLimitExceeded(false);
    }
  }, [userTier]);

  // --- CONVERSATION MANAGEMENT ---

  const mapConversationRecord = useCallback((conv) => ({
    id: conv.conversation_id,
    conversation_id: conv.conversation_id,
    title: conv.title,
    createdAt: conv.created_at,
    updatedAt: conv.updated_at,
    documentUrl: conv.document?.s3_url || null,
    documentName: conv.document?.file_name || null,
    documentType: conv.document?.file_type || null,
    documentSize: conv.document?.file_size || null,
    variantRanges: null,
    variantColumns: null,
    variantNumericColumns: null,
    variantCategoricalColumns: null,
    variantAllUniqueValues: null,
    totalVariants: null,
    activeVariantFilters: conv.active_variant_filters || null,
    filteredVariantCount: conv.filtered_variant_count || null,
    activeProprietaryFilter: conv.active_proprietary_filter || null,
    proprietaryFiltersState: conv.proprietary_filters_state || null,
    proprietaryFilterMapping: conv.proprietary_filter_mapping || null,
    summary: conv.summary || '',
    turnsSinceSummary: conv.turns_since_summary || 0,
    messageCount: 0,
  }), []);

  const createConversation = useCallback(async () => {
    if (!userId || userTier === 'guest') return null;

    try {
      const newConv = await mongodbApi.createConversation('New Conversation');
      const mapped = {
        ...mapConversationRecord(newConv),
        title: newConv.title || 'New Conversation',
      };
      setConversations((prev) => [mapped, ...prev]);
      navigateToConversation(newConv.conversation_id);
      setMessages([]);
      return newConv.conversation_id;
    } catch (error) {
      console.error('Error creating conversation:', error);
      return null;
    }
  }, [userId, userTier, mapConversationRecord, navigateToConversation]);

  // Guests use /app only — strip conversation id from URL if present.
  useEffect(() => {
    if (userTier === 'guest' && urlConversationId) {
      navigate('/app', { replace: true });
    }
  }, [userTier, urlConversationId, navigate]);

  // Redirect malformed conversation ids in the URL.
  useEffect(() => {
    if (userTier === 'guest' || !userId || !isAuthReady) return;
    if (urlConversationId && !isValidConversationId(urlConversationId)) {
      navigate('/app', { replace: true });
    }
  }, [userTier, userId, isAuthReady, urlConversationId, navigate]);

  // Keep URL in sync with the conversation list (deep links, refresh, /app with no id).
  // If user provided a specific conversation ID in the URL, we should never redirect away from it automatically.
  // The message loading logic (lines 804+) will handle whether that conversation actually exists.
  useEffect(() => {
    if (!userId || userTier === 'guest' || !isAuthReady) return;
    if (conversations.length === 0) return;

    // If URL has a valid conversation ID, keep it regardless of whether it's in our list
    // (it might exist on server even if not loaded yet)
    if (urlConversationId && isValidConversationId(urlConversationId)) {
      return;
    }

    // If no conversation ID in URL and we have conversations, navigate to first
    if (!urlConversationId) {
      navigateToConversation(conversations[0].id, { replace: true });
    }
  }, [
    userId,
    userTier,
    isAuthReady,
    conversations,
    urlConversationId,
    navigateToConversation,
  ]);

  // 1. Load conversations on mount (one-time, no polling)
  useEffect(() => {
    const loadConversationsOnce = async () => {
      if (!userId || userTier === 'guest' || !isAuthReady) {
        setConversations([]);
        return;
      }

      try {
        const loadedConversations = await mongodbApi.getConversations();
        const mappedConversations = loadedConversations.map(mapConversationRecord);

        setConversations(mappedConversations);

        if (mappedConversations.length === 0) {
          await createConversation();
        }
      } catch (error) {
        console.error('[App] Error loading conversations:', error);
      }
    };

    loadConversationsOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, userTier, isAuthReady]);

  const clearConversationScopedState = useCallback(() => {
    setMessages([]);
    setCurrentDocument(null);
    setVariantData(null);
    setColumnInterpretationResult(null);
    setShowInterpretationModal(false);
    interpretationShownRef.current = false;
    setConversationFilterState({
      activeVariantFilters: null,
      filteredVariantCount: null,
      activeProprietaryFilter: null,
      filterWorkingSetCount: null,
    });
    resetConversationPipeline();
  }, [resetConversationPipeline]);

  // 2. Load messages and conversation document when active conversation changes
  useEffect(() => {
    let cancelled = false;
    const conversationId = activeConversationId;

    if (!conversationId || !userId || userTier === 'guest') {
      clearConversationScopedState();
      return () => {
        cancelled = true;
      };
    }

    // Drop previous chat's file chip / pipeline immediately (don't wait for fetch).
    clearConversationScopedState();

    const loadConversationDataOnce = async () => {
      try {
        const loadedMessages = await mongodbApi.getMessages(conversationId);
        if (cancelled) return;

        setMessages(
          loadedMessages.map((msg) => ({
            id: msg.message_id,
            message_id: msg.message_id,
            role: msg.role,
            text: msg.text,
            sources: msg.sources || [],
            createdAt: msg.created_at,
          }))
        );

        const convData = await mongodbApi.getConversation(conversationId);
        if (cancelled) return;

        if (convData) {
          if (convData.document?.s3_url && convData.document?.file_name) {
            setCurrentDocument({
              url: convData.document.s3_url,
              name: convData.document.file_name,
              type: convData.document.file_type || 'unknown',
              size: convData.document.file_size || 0,
            });
          } else {
            setCurrentDocument(null);
          }

          if (
            convData.column_interpretation &&
            convData.document?.s3_url &&
            convData.document?.file_name
          ) {
            setColumnInterpretationResult(convData.column_interpretation);
          } else {
            setColumnInterpretationResult(null);
            setShowInterpretationModal(false);
            interpretationShownRef.current = false;
          }

          if (convData.variant_metadata && convData.document?.s3_url) {
            setVariantData(buildVariantDataFromConversation(convData, convData.variant_metadata));
          } else {
            setVariantData(null);
          }

          setConversationFilterState({
            activeVariantFilters: convData.active_variant_filters ?? null,
            filteredVariantCount: convData.filtered_variant_count ?? null,
            activeProprietaryFilter: convData.active_proprietary_filter ?? null,
            filterWorkingSetCount: convData.variant_filter_working_set_count ?? null,
          });
          syncPipelineFromConversationRef.current(convData);
        } else {
          setCurrentDocument(null);
          setVariantData(null);
          setColumnInterpretationResult(null);
          setConversationFilterState({
            activeVariantFilters: null,
            filteredVariantCount: null,
            activeProprietaryFilter: null,
            filterWorkingSetCount: null,
          });
          syncPipelineFromConversationRef.current(null);
        }
      } catch (error) {
        if (cancelled) return;
        console.error('[App] Error loading conversation data:', error);
        clearConversationScopedState();
      }
    };

    loadConversationDataOnce();
    return () => {
      cancelled = true;
    };
    /*
    if (!activeConversationId || !userId || userTier === 'guest') {
      setMessages([]); 
      setCurrentDocument(null);
      setVariantData(null);
      return;
    }

    // TEMP: Polling disabled during development
    // TODO: Re-enable polling or implement WebSockets for production
    // Poll messages
    const unsubscribeMessages = mongodbApi.pollMessages(activeConversationId, (loadedMessages) => {
      // Map MongoDB format to frontend format
      const mappedMessages = loadedMessages.map(msg => ({
        id: msg.message_id,
        message_id: msg.message_id,
        role: msg.role,
        text: msg.text,
        sources: msg.sources || [],
        createdAt: msg.created_at
      }));
      
      setMessages(mappedMessages);
    }, 5000);
    
    // Poll conversation document for variant data and document info
    const unsubscribeConv = mongodbApi.pollConversationDoc(activeConversationId, (convData) => {
      if (convData) {
        // Load document data
        if (convData.document?.s3_url && convData.document?.file_name) {
          const documentObj = {
            url: convData.document.s3_url,
            name: convData.document.file_name,
            type: convData.document.file_type || 'unknown',
            size: convData.document.file_size || 0
          };
          console.log('[App] Setting currentDocument from MongoDB:', documentObj);
          setCurrentDocument(documentObj);
        } else {
          console.log('[App] No document in conversation, clearing currentDocument');
          setCurrentDocument(null);
        }
        
        // Load column interpretation results (3-step interpretation)
        // Only show interpretation results if there's actually a document
        if (convData.column_interpretation && convData.document?.s3_url && convData.document?.file_name) {
          console.log('[App] Setting column interpretation results from MongoDB:', convData.column_interpretation);
          setColumnInterpretationResult((prevResult) => {
            // Auto-show modal if this is a new interpretation result (was null before)
            if (!prevResult && convData.column_interpretation) {
              // Check if we've already shown this result
              const resultId = JSON.stringify(convData.column_interpretation);
              if (!interpretationShownRef.current || interpretationShownRef.current !== resultId) {
                console.log('[App] Auto-showing interpretation results modal');
                interpretationShownRef.current = resultId;
                setTimeout(() => setShowInterpretationModal(true), 100);
              }
            }
            return convData.column_interpretation;
          });
        } else {
          // No interpretation results OR no document - clear everything
          console.log('[App] No column interpretation results or no document in conversation');
          setColumnInterpretationResult(null);
          setShowInterpretationModal(false);
          interpretationShownRef.current = false; // Reset when no results or no document
        }
        
        // variant_metadata removed - column interpretation will be done in 3-step process later
        // Clear variant data for now
        console.log('[App] variant_metadata removed - column interpretation will be done in 3-step process later');
        setVariantData(null);
      } else {
        // Conversation doesn't exist, clear all state
        console.log('[App] Conversation does not exist, clearing document and variant data');
        setCurrentDocument(null);
        setVariantData(null);
      }
    }, 5000);
    
    return () => {
      unsubscribeMessages();
      unsubscribeConv();
    };
    */
    // Only re-load when the active conversation identity changes — not when pipeline
    // callbacks are recreated (which previously re-triggered clear + fetch in a loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, userId, userTier]);

  // 3. Delete conversation (optimistic: remove from list first, then call API)
  const deleteConversation = async (conversationId) => {
    if (!userId) return;

    const sid = String(conversationId);
    const wasActive = activeConversationId === conversationId || String(activeConversationId) === sid;

    // Optimistic: remove from list so UI shows correct state immediately
    let remainingAfterDelete = [];
    setConversations(prev => {
      remainingAfterDelete = prev.filter(
        conv => String(conv.id) !== sid && String(conv.conversation_id) !== sid
      );
      return remainingAfterDelete;
    });

    if (wasActive) {
      setMessages([]);
      setCurrentDocument(null);
      setVariantData(null);
      setColumnInterpretationResult(null);
      setShowInterpretationModal(false);
      interpretationShownRef.current = false;
    }

    if (wasActive && remainingAfterDelete.length === 0) {
      setTimeout(() => createConversation(), 0);
    } else if (wasActive && remainingAfterDelete.length > 0) {
      navigateToConversation(remainingAfterDelete[0].id, { replace: true });
    }

    try {
      await mongodbApi.deleteConversation(conversationId);
      console.log('[DELETE CONVERSATION] Conversation deleted via MongoDB API');
    } catch (error) {
      console.error('Error deleting conversation:', error);
      // Restore consistency: refetch list from backend
      try {
        const loaded = await mongodbApi.getConversations();
        const mapped = loaded.map(mapConversationRecord);
        setConversations(mapped);
      } catch (refetchErr) {
        console.error('Error refetching conversations after delete failure:', refetchErr);
      }
    }
  };

  // 5. Update conversation title (auto-generate crisp title using LLM)
  const updateConversationTitle = async (conversationId, firstMessage) => {
    if (!userId) return;

    try {
      // Call backend to generate crisp title using LLM
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      const response = await fetch(apiUrl('/api/generate-conversation-title'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          firstMessage: firstMessage
        })
      });

      let title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : ''); // Fallback

      if (response.ok) {
        const data = await response.json();
        title = data.title || title;
      }

      // Update MongoDB with the generated title
      await mongodbApi.updateConversation(conversationId, { title });
    } catch (error) {
      console.error('Error updating conversation title:', error);
      // Fallback: use simple truncation if LLM call fails
      try {
        const fallbackTitle = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : '');
        await mongodbApi.updateConversation(conversationId, { title: fallbackTitle });
      } catch (fallbackError) {
        console.error('Error with fallback title update:', fallbackError);
      }
    }
  };

  const syncAfterColumnInterpretation = useCallback(
    async (conversationId, columnInterpretation) => {
      if (!conversationId || !columnInterpretation || userTier === 'guest') return;
      await remapProprietaryFiltersForConversation(conversationId, columnInterpretation);
      await refreshChatEligibilityFromApi(conversationId);
    },
    [userTier, remapProprietaryFiltersForConversation, refreshChatEligibilityFromApi]
  );

  // 6. Handle document upload success
  const handleDocumentUpload = async (documentData) => {
    console.log('[App] handleDocumentUpload called with:', documentData);
    console.log('[App] userId:', userId, 'activeConversationId:', activeConversationId, 'userTier:', userTier);

    const isGuest = userTier === 'guest';

    // For guests, store everything in local state (no Firestore)
    if (isGuest) {
      if (!documentData) {
        // Remove document
        setCurrentDocument(null);
        setVariantData(null);
        setColumnInterpretationResult(null);
        setShowInterpretationModal(false);
        interpretationShownRef.current = false;
        console.log('[App] Document removed (guest mode)');
      } else {
        // Store document in local state
        setCurrentDocument(documentData);
        setPipelineDismissed(false);
        setPipelineExpanded(true);
        console.log('[App] Document stored locally (guest mode):', documentData);

        if (documentData.column_interpretation) {
          setColumnInterpretationResult(documentData.column_interpretation);
          const resultId = JSON.stringify(documentData.column_interpretation);
          interpretationShownRef.current = resultId;
          presentFileAnalysisModal({
            column_interpretation: documentData.column_interpretation,
            document: documentData.url
              ? { s3_url: documentData.url, file_name: documentData.name ?? documentData.file_name }
              : null,
          });
        }
        if (documentData.variant_metadata) {
          setVariantData(buildVariantDataFromConversation(documentData, documentData.variant_metadata));
        }

        if (!documentData.column_interpretation && documentData.type && ['tsv', 'csv'].includes(documentData.type.toLowerCase())) {
          try {
            console.log('[App] Calling validation endpoint for variant extraction (guest mode)...');

            const validationResponse = await fetch(apiUrl('/api/validate-document'), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
                // No auth token for guests
              },
              body: JSON.stringify({
                document_url: documentData.url,
                document_type: documentData.type,
                conversation_id: 'guest-session' // Placeholder for guests
              })
            });

            if (validationResponse.ok) {
              const validationData = await validationResponse.json();
              console.log('[App] Validation response (guest):', validationData);

              if (validationData.is_variant_file && validationData.variant_data) {
                const variantDataObj = {
                  parameter_ranges: validationData.variant_data.parameter_ranges || {},
                  categorical_columns: validationData.variant_data.categorical_columns || {},
                  columns: validationData.variant_data.columns || [],
                  numeric_columns: validationData.variant_data.numeric_columns || [],
                  all_unique_values: validationData.variant_data.all_unique_values || {},
                  total_variants: validationData.variant_data.total_variants || 0,
                  filtered_variants: null,
                };
                setVariantData(variantDataObj);

                try {
                  const sampleVariants = validationData.variant_data.sample_variants || [];
                  const sampleData = {};
                  (variantDataObj.columns || []).forEach((col) => {
                    sampleData[col] = sampleVariants
                      .slice(0, 50)
                      .map((row) => (row && row[col] != null ? String(row[col]) : ''));
                  });

                  const interpResponse = await fetch(apiUrl('/api/three-step-interpretation'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      file_columns: variantDataObj.columns || [],
                      sample_data: sampleData,
                      is_vcf: false,
                    }),
                  });

                  if (interpResponse.ok) {
                    const interpretation = await interpResponse.json();
                    setColumnInterpretationResult(interpretation);
                    const resultId = JSON.stringify(interpretation);
                    interpretationShownRef.current = resultId;
                    presentFileAnalysisModal({
                      column_interpretation: interpretation,
                      document: documentData.url
                        ? { s3_url: documentData.url, file_name: documentData.name ?? documentData.file_name }
                        : null,
                    });
                  }
                } catch (interpError) {
                  console.error('[App] Error running guest 3-step interpretation:', interpError);
                }
              }
            } else {
              console.warn('[App] Validation endpoint returned error (guest):', validationResponse.status);
            }
          } catch (validationError) {
            console.error('[App] Error calling validation endpoint (guest):', validationError);
            // Don't fail the upload if validation fails
          }
        }
      }
      return; // Exit early for guests
    }

    // For authenticated users: Backend handles MongoDB updates
    if (!userId || !activeConversationId) {
      console.error('[App] Missing prerequisites for document upload');
      return;
    }

    try {
      if (documentData === null) {
        // Remove document - call backend to clean up S3, PostgreSQL, MongoDB
        console.log('[App] Removing document from conversation');

        try {
          const auth = getAuth();
          const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

          if (token) {
            const deleteResponse = await fetch(apiUrl(`/api/conversation/${activeConversationId}/document`), {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });

            if (deleteResponse.ok) {
              const deleteData = await deleteResponse.json();
              console.log('[App] Backend document deletion:', deleteData);
            } else {
              console.warn('[App] Backend document deletion failed');
            }
          }
        } catch (backendError) {
          console.warn('[App] Backend document deletion error:', backendError);
        }

        // Backend handles MongoDB cleanup, just clear local state
        setCurrentDocument(null);
        setVariantData(null);
        setColumnInterpretationResult(null);
        setShowInterpretationModal(false);
        interpretationShownRef.current = false; // Reset the ref so modal won't auto-show if old data comes back
        console.log('[App] Document removed successfully');
      } else {
        // Add/update document
        console.log('[App] Adding/updating document:', documentData);

        // Backend handles MongoDB updates via upload-variant-file endpoint
        // Just set local state - polling will update from MongoDB
        setCurrentDocument(documentData);
        interpretationDismissedRef.current = false;
        setPipelineDismissed(false);
        setPipelineExpanded(true);

        if (documentData.column_interpretation) {
          setColumnInterpretationResult(documentData.column_interpretation);
          if (documentData.variant_metadata) {
            setVariantData(buildVariantDataFromConversation(documentData, documentData.variant_metadata));
          }
          presentFileAnalysisModal({
            column_interpretation: documentData.column_interpretation,
            document: documentData.url
              ? { s3_url: documentData.url, file_name: documentData.name ?? documentData.file_name }
              : null,
          });
          await syncAfterColumnInterpretation(activeConversationId, documentData.column_interpretation);
          refreshSubscriptionStatus();
        }

        if (documentData.free_tier_preview?.enabled) {
          const p = documentData.free_tier_preview;
          setAnnovarMessageModal({
            title: 'Preview Mode',
            message: `Showing first ${p.sampled_rows} rows and ${p.sampled_cols} columns of ${p.original_rows} rows and ${p.original_cols} columns. ${userTier === 'guest' ? 'Sign up' : 'Upgrade to Pro'} to access the full dataset.`,
            variant: 'info',
            ...(userTier === 'guest'
              ? {
                  ctaLabel: 'Sign Up',
                  onCta: () => {
                    setAnnovarMessageModal(null);
                    setIsShowingAuthForm(true);
                  },
                }
              : userTier === 'free'
                ? {
                    ctaLabel: 'Upgrade to Pro',
                    onCta: () => {
                      setAnnovarMessageModal(null);
                    },
                  }
                : {}),
          });
        }

        if (!documentData.column_interpretation) {
          setVariantData(null);
          setColumnInterpretationResult(null);
          setShowInterpretationModal(false);
        }

        if (documentData.storageType === 's3' && documentData.is_variant_file && !documentData.column_interpretation) {
          // Backend already processed and stored everything (PostgreSQL, MongoDB)
          console.log('[App] Document uploaded via S3 endpoint, backend already processed:', documentData.variant_count, 'variants');

          // Since polling is disabled, manually fetch conversation data to get interpretation results
          if (activeConversationId && userId) {
            // Retry fetching interpretation results (backend processing may take time)
            let retryCount = 0;
            const maxRetries = 10; // Try for up to 20 seconds (2s * 10)
            const retryInterval = 2000; // 2 seconds

            const fetchInterpretationResults = async () => {
              try {
                console.log(`[App] Fetching interpretation results (attempt ${retryCount + 1}/${maxRetries})...`);
                const convData = await mongodbApi.getConversation(activeConversationId);
                if (convData && convData.column_interpretation && convData.document?.s3_url) {
                  console.log('[App] Found interpretation results, showing modal:', convData.column_interpretation);
                  setColumnInterpretationResult(convData.column_interpretation);
                  if (convData.variant_metadata) {
                    setVariantData(buildVariantDataFromConversation(convData, convData.variant_metadata));
                  }
                  const resultId = JSON.stringify(convData.column_interpretation);
                  interpretationShownRef.current = resultId;
                  presentFileAnalysisModal(convData);
                  syncPipelineFromConversationRef.current(convData);
                  await syncAfterColumnInterpretation(activeConversationId, convData.column_interpretation);
                  return;
                } else {
                  retryCount++;
                  if (retryCount < maxRetries) {
                    console.log(`[App] No interpretation results yet, retrying in ${retryInterval}ms...`);
                    setTimeout(fetchInterpretationResults, retryInterval);
                  } else {
                    console.warn('[App] Max retries reached, interpretation results not found');
                  }
                }
              } catch (error) {
                console.error('[App] Error fetching conversation data after upload:', error);
                retryCount++;
                if (retryCount < maxRetries) {
                  setTimeout(fetchInterpretationResults, retryInterval);
                }
              }
            };

            // Start fetching after initial delay
            setTimeout(fetchInterpretationResults, retryInterval);
          }
        } else if (documentData.type && ['tsv', 'csv'].includes(documentData.type.toLowerCase())) {
          // For guest mode or old Firebase Storage uploads, call validate_document
          try {
            console.log('[App] Calling validation endpoint for variant extraction...');
            const auth = getAuth();
            const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

            const validationResponse = await fetch(apiUrl('/api/validate-document'), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` })
              },
              body: JSON.stringify({
                document_url: documentData.url,
                document_type: documentData.type,
                conversation_id: activeConversationId
              })
            });

            if (validationResponse.ok) {
              const validationData = await validationResponse.json();
              console.log('[App] Validation response:', validationData);

              if (validationData.is_variant_file && validationData.variant_data) {
                // Backend already updated MongoDB, polling will refresh variant data
                console.log('[App] Variant file detected, variant data stored in MongoDB');
              }
            } else {
              console.warn('[App] Validation endpoint returned error:', validationResponse.status);
            }
          } catch (validationError) {
            console.error('[App] Error calling validation endpoint:', validationError);
            // Don't fail the upload if validation fails
          }
        }
      }
    } catch (error) {
      console.error('[App] Error updating conversation document:', error);
      throw error; // Re-throw so DocumentUpload can handle it
    }
  };


  const isConversationStarted = messages.length > 0;
  const isCurrentlyActive = isLoading || typingText;

  const activeConversation = useMemo(
    () => conversations.find((c) => String(c.id) === String(activeConversationId)),
    [conversations, activeConversationId]
  );

  const conversationHeaderTitle = useMemo(() => {
    if (userTier === 'guest') return 'Guest session';
    if (activeConversation?.title) return activeConversation.title;
    if (isConversationStarted || isCurrentlyActive) return 'New conversation';
    return 'Geneie';
  }, [userTier, activeConversation?.title, isConversationStarted, isCurrentlyActive]);

  // --- TIER GATING LOGIC ---
  const tierLimit = tierChatLimit;
  const currentExchanges = Math.floor(messages.length / 2);

  const isChatLimitReached =
    (userTier === 'guest' && guestLimitExceeded) ||
    (userTier !== 'guest' && currentExchanges >= tierLimit);

  // isChatPipelineGated from useVariantPipeline
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

      // Optimistic UI — show the reply immediately, persist in the background.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, userTier, guestExchangesUsed, activeConversationId]
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, userTier, guestExchangesUsed, activeConversationId]
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
            // Parse backend error detail for limit/guardrail codes
            let errorDetail = null;
            try { errorDetail = await response.json(); } catch {}
            const code = errorDetail?.detail?.code;
            const message = errorDetail?.detail?.message;

            // Don't retry on limit/guardrail errors — they won't resolve with retries
            if (code === 'GUEST_LIMIT_REACHED' || code === 'FREE_TIER_LIMIT_REACHED' ||
                code === 'PRO_DAILY_CHAT_LIMIT_REACHED' || code === 'PRO_DEVICE_LIMIT_REACHED' ||
                code === 'PRO_DEVICE_ID_REQUIRED') {
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
            await sleep(Math.pow(2, attempt) * 1000);
          }
        }
      }

      return { data: null, lastError, aborted: false };
    },
    [activeConversationId, userTier, currentDocument, setChatEligibility, normalizeChatEligibilityMessage]
  );

  const sendMessage = async () => {
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

      // Handle backend limit errors with specific UI
      const code = lastError?.code;
      if (code === 'GUEST_LIMIT_REACHED') {
        setGuestLimitExceeded(true);
        // Remove the user message we just added — they can't send
        setMessages(prev => prev.filter(m => m.id !== userLocalId));
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
        // Remove the user message
        setMessages(prev => prev.filter(m => m.id !== userLocalId));
        setAnnovarMessageModal({
          title: 'Chat Limit Reached',
          message: lastError.message || `Free tier chat limit reached (${tierChatLimit} exchanges). Upgrade to Pro to continue.`,
          variant: 'info',
          ctaLabel: 'Upgrade to Pro',
          onCta: () => { setAnnovarMessageModal(null); /* TODO: open subscription modal */ },
        });
        return;
      }
      if (code === 'PRO_DAILY_CHAT_LIMIT_REACHED') {
        setMessages(prev => prev.filter(m => m.id !== userLocalId));
        setAnnovarMessageModal({
          title: 'Daily Limit Reached',
          message: lastError.message || 'Pro daily chat limit reached (50). Please try again tomorrow.',
          variant: 'info',
        });
        return;
      }
      if (code === 'PRO_DEVICE_LIMIT_REACHED') {
        setMessages(prev => prev.filter(m => m.id !== userLocalId));
        setAnnovarMessageModal({
          title: 'Device Limit Reached',
          message: lastError.message || 'Too many active devices. Sign out from another device first.',
          variant: 'error',
        });
        return;
      }
      if (code === 'PRO_DEVICE_ID_REQUIRED') {
        setMessages(prev => prev.filter(m => m.id !== userLocalId));
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
  };

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

  useEffect(() => {
    if (!columnInterpretationResult) {
      setIsAnnovarRecommended(false);
      return;
    }
    const step1Passed = !!columnInterpretationResult?.step1?.passed;
    const step2ReqModal = columnInterpretationResult?.step2?.required_columns || {};
    const step2AcmgReady = Boolean(
      step2ReqModal.CLNSIG?.found || step2ReqModal.InterVar_automated?.found
    );
    const step3Passed = !!columnInterpretationResult?.step3?.passed;
    const recommendAnnovar = step1Passed && (!step2AcmgReady || !step3Passed);
    setIsAnnovarRecommended(recommendAnnovar);
  }, [columnInterpretationResult]);

  const showFileAnalysisModal =
    showInterpretationModal &&
    !interpretationDismissedRef.current &&
    !pipelineJobActive &&
    !annovarMessageModal &&
    columnInterpretationResult &&
    currentDocument;

  const showAnalysisPipeline =
    (currentDocument || variantUploadInProgress) &&
    (userTier === 'guest' || activeConversationId);

  useEffect(() => {
    if (variantUploadInProgress || pipelineJobActive) {
      setPipelineDismissed(false);
    }
    if (variantUploadInProgress || isRunningAnnovar || isApplyingAcmgFilter) {
      setPipelineExpanded(true);
    }
  }, [
    variantUploadInProgress,
    pipelineJobActive,
    isRunningAnnovar,
    isApplyingAcmgFilter,
  ]);

  const handlePipelineStepAction = useCallback(
    (stepId) => {
      switch (stepId) {
        case 'upload':
          setShowUploadModal(true);
          break;
        case 'interpret':
          interpretationDismissedRef.current = false;
          setShowInterpretationModal(true);
          break;
        case 'annovar':
          runAnnovarForCurrentConversation();
          break;
        case 'reduce':
          setIsVariantSidebarOpen(true);
          break;
        case 'chat':
          setPipelineExpanded(false);
          break;
        default:
          break;
      }
    },
    [runAnnovarForCurrentConversation]
  );

  const analysisPipelineBlock = showAnalysisPipeline ? (
    <VariantAnalysisPipeline
      fileName={currentDocument?.name ?? currentDocument?.file_name}
      expanded={pipelineExpanded}
      onExpandedChange={setPipelineExpanded}
      dismissed={pipelineDismissed}
      onDismiss={() => setPipelineDismissed(true)}
      compactReadyOnly={pipelineDismissed && !!chatEligibility.allowed}
      isGuest={userTier === 'guest'}
      onStepAction={handlePipelineStepAction}
      uploadInProgress={variantUploadInProgress}
      uploadProgress={uploadProgress}
      hasUploadedFile={!!currentDocument || variantUploadInProgress}
      columnInterpretationResult={columnInterpretationResult}
      hasAnnotatedFile={pipelineSnapshot.hasAnnotatedFile}
      requiresAnnovar={chatEligibility.requires_annovar}
      isRunningAnnovar={isRunningAnnovar}
      isApplyingAcmgFilter={isApplyingAcmgFilter}
      annovarJob={pipelineSnapshot.annovarJob}
      filterJob={pipelineSnapshot.filterJob}
      chatEligibility={chatEligibility}
      activeProprietaryFilter={conversationFilterState.activeProprietaryFilter}
      activeVariantFilters={conversationFilterState.activeVariantFilters}
      filteredVariantCount={conversationFilterState.filteredVariantCount}
      s3LineCountStatus={variantData?.s3_line_count_status || chatEligibility.s3_line_count_status}
      variantsUnderConsideration={
        chatEligibility.variants_under_consideration ??
        conversationFilterState.filteredVariantCount
      }
    />
  ) : null;

  // --- MAIN RENDER GATING LOGIC ---
  if (!isAuthReady || userLoading) {
    return <SessionLoadingScreen />;
  }

  // CRITICAL: Check for pending email verification FIRST, before any other rendering logic
  // This prevents the chat interface from flashing after signup
  // Check localStorage directly to catch it even before state updates
  const hasPendingVerification = pendingEmailVerification || localStorage.getItem('pendingEmailVerification');

  if (hasPendingVerification) {
    return <AuthForm
      triggerReason={'manual'}
      onSignupSuccess={(status) => {
        setPendingEmailVerification(false);
        localStorage.removeItem('pendingEmailVerification');
        setJustSignedUp(status);
      }}
      onEmailVerificationPending={setPendingEmailVerification}
    />;
  }

  if (justSignedUp) {
    return <AuthForm
      triggerReason={'manual'}
      onSignupSuccess={setJustSignedUp}
      onEmailVerificationPending={setPendingEmailVerification}
    />;
  }

  if (userTier === 'guest' && (guestLimitExceeded || isShowingAuthForm)) {
    return <AuthForm
      triggerReason={isShowingAuthForm ? 'manual' : 'guestLimit'}
      onSignupSuccess={handleSignupSuccess}
      onEmailVerificationPending={setPendingEmailVerification}
    />;
  }

  if (userTier === 'free' && isChatLimitReached) {
    return (
      <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--bg-app)' }}>
        <header className="px-6 py-4 border-b flex justify-start items-center z-10" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)' }}>
          <h1 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>geneie</h1>
        </header>
        <SubscriptionManager isInputGated={true} />
      </div>
    );
  }

  const isInputDisabled =
    !isAuthReady || isCurrentlyActive || isChatLimitReached || variantUploadInProgress;

  let inputPlaceholder = "Ask a question about bioinformatics...";
  if (variantUploadInProgress) {
    inputPlaceholder = 'Upload in progress — chat will resume when your file is ready…';
  } else if (isCurrentlyActive) {
    inputPlaceholder = "geneie is thinking...";
  } else if (isChatPipelineGated && chatEligibility.message) {
    const short =
      chatEligibility.message.length > 120
        ? `${chatEligibility.message.slice(0, 117)}…`
        : chatEligibility.message;
    inputPlaceholder = short;
  } else if (isChatLimitReached) {
    inputPlaceholder = userTier === 'guest'
      ? `Limit reached (${DEFAULT_GUEST_CHAT_LIMIT} exchanges). Please Sign Up or Log In.`
      : `Limit reached (${tierChatLimit} exchanges). Please upgrade to Pro.`;
  }

  const shellLeftState =
    userTier === 'guest' ? 'hidden' : isSidebarOpen ? 'open' : 'collapsed';
  const shellBothOpen =
    userTier !== 'guest' && isSidebarOpen && isVariantSidebarOpen;

  // --- RENDER CHAT INTERFACE WITH SIDEBAR ---
  return (
    <div
      className="chat-app-shell font-sans relative"
      data-left={shellLeftState}
      data-right={isVariantSidebarOpen ? 'open' : 'closed'}
      data-both-open={shellBothOpen ? 'true' : undefined}
    >
      <aside className="chat-shell-left" aria-hidden={userTier === 'guest'}>
        {userTier !== 'guest' && (
          <ConversationSidebar
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={navigateToConversation}
            onCreateConversation={createConversation}
            onDeleteConversation={deleteConversation}
            isOpen={isSidebarOpen}
            onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
            userTier={userTier}
            currentExchanges={currentExchanges}
            chatLimit={tierChatLimit}
            userId={userId}
            onOpenProfile={() => setShowProfileModal(true)}
          />
        )}
      </aside>

      <main className="chat-shell-main">
      <GlobalTypingStyles />

      {/* Mobile top bar */}
      {isMobile && (
        <div
          className="flex items-center gap-2 px-3 h-12 shrink-0 border-b"
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-app)' }}
        >
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Open sidebar"
          >
            <Menu className="w-[18px] h-[18px]" />
          </button>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-sm font-semibold shrink-0" style={{ color: 'var(--text-primary)' }}>Geneie</span>
            {isConversationStarted && (
              <>
                <span className="text-xs shrink-0" style={{ color: 'var(--text-disabled)' }}>·</span>
                <span className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
                  {conversationHeaderTitle}
                </span>
              </>
            )}
          </div>
          {userTier === 'guest' && (
            <button
              type="button"
              onClick={() => {
                setIsShowingAuthForm(true);
                setJustSignedUp(false);
              }}
              className="text-xs px-2.5 py-1 rounded-lg font-medium border transition-colors hover:opacity-90 shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-default)',
                color: 'var(--accent-teal)',
              }}
            >
              Log In
            </button>
          )}
        </div>
      )}

      {/* Desktop guest login button */}
      {userTier === 'guest' && !isMobile && (
        <div className="fixed top-3 right-4 z-50">
          <button
            type="button"
            onClick={() => {
              setIsShowingAuthForm(true);
              setJustSignedUp(false);
            }}
            className="text-sm px-3 py-1.5 rounded-lg font-medium border transition-colors hover:opacity-90"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-default)',
              color: 'var(--accent-teal)',
            }}
          >
            Log In / Sign Up
          </button>
        </div>
      )}

      {/* Variant Filter Sidebar Toggle Button - Right Side */}
      {/* {!isVariantSidebarOpen && (
        <button
          onClick={() => setIsVariantSidebarOpen(true)}
          className="fixed right-0 top-1/2 -translate-y-1/2 p-2.5 rounded-l-xl transition-colors z-40 hover:brightness-125"
          style={{
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-default)',
            borderRight: 'none'
          }}
          title="Open Variant Filters"
        >
          <FileText className="w-5 h-5" />
        </button>
      )} */}

      {/* Run ANNOVAR action */}
      {userTier !== 'guest' && activeConversationId && currentDocument && isVariantSidebarOpen && (
        <button
          onClick={runAnnovarForCurrentConversation}
          disabled={isRunningAnnovar}
          className={`chat-annovar-fab group h-10 w-10 rounded-full border transition-all duration-200 flex items-center justify-center ${isRunningAnnovar ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-default)',
            color: isAnnovarRecommended ? 'var(--accent-teal)' : 'var(--text-tertiary)'
          }}
          title={isAnnovarRecommended ? 'ANNOVAR recommended' : 'Run ANNOVAR'}
        >
          <img
            src={qiagenLogo}
            alt="Qiagen"
            className="w-4 h-4 object-contain"
            style={{ filter: isAnnovarRecommended ? 'none' : 'grayscale(100%) opacity(0.6)' }}
          />
          <span
            className={`absolute right-full mr-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shadow-md border transition-all duration-200 pointer-events-none ${isRunningAnnovar
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0'
              }`}
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
          >
            {isRunningAnnovar ? 'Running ANNOVAR...' : 'Run ANNOVAR'}
          </span>
        </button>
      )}

        {/* {pipelineToast && userTier !== 'guest' && currentDocument && (
          <div
            className="px-4 py-2 flex items-start justify-between gap-3 border-b shrink-0"
            style={{
              backgroundColor: pipelineToast.variant === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(47,127,122,0.12)',
              borderColor: pipelineToast.variant === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(47,127,122,0.25)',
            }}
            role="status"
          >
            <div className="flex items-start gap-2 min-w-0">
              {pipelineToast.variant === 'error' ? (
                <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--error)' }} />
              ) : (
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--accent-teal)' }} />
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{pipelineToast.title}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{pipelineToast.message}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPipelineToast(null)}
              className="p-1 flex-shrink-0 hover:opacity-80"
              style={{ color: 'var(--text-tertiary)' }}
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )} */}

        {/* Chat + Input column */}
        <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">

          {/* ===== NEW CHAT — centered layout (DeepSeek style) ===== */}
          {!isConversationStarted && !isCurrentlyActive ? (
            <div className={`flex-1 flex flex-col items-center w-full min-w-0 chat-column-inner ${isMobile ? 'justify-end pb-4' : 'justify-center'}`}>
              {/* Branding */}
              <div className={`flex items-center gap-2.5 w-full justify-center ${isMobile ? 'mb-auto mt-auto' : 'mb-8'}`}>
                <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-semibold tracking-tight text-center`} style={{ color: 'var(--text-primary)' }}>
                  What do you want to ask Geneie?
                </h2>
              </div>

              {userTier === 'guest' && (
                <p className="text-xs font-medium mb-4 flex items-center justify-center gap-1.5 w-full" style={{ color: 'var(--warning)' }}>
                  <AlertCircle className="w-5 h-5 shrink-0" /> Variants won't be included in chat context until you sign up.
                </p>
              )}

              <div className={`w-full ${isMobile ? 'shrink-0' : ''}`}>
                {analysisPipelineBlock}
                <PromptInput
                  value={input}
                  onValueChange={setInput}
                  onSubmit={sendMessage}
                  isLoading={isCurrentlyActive}
                  disabled={isInputDisabled}
                  className="border border-[var(--border-default)] rounded-2xl flex flex-col px-3 py-2"
                  style={{ backgroundColor: 'var(--bg-surface)' }}
                >
                  <PromptInputTextarea
                    placeholder="Message geneie..."
                    className="text-sm min-h-[44px] max-h-[160px] py-1.5"
                    style={{ color: 'var(--text-primary)' }}
                  />
                  <PromptInputActions className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1">
                      {(userTier === 'guest' || userId) && (
                        <div className="relative" ref={showFileTypeDropdown === 'new-chat' ? fileTypeDropdownRef : undefined}>
                          <button
                            type="button"
                            onClick={() => handleUploadButtonClick('new-chat')}
                            className="chat-chrome-btn"
                            title="Upload variant file"
                            aria-label="Upload variant file"
                          >
                            <Upload />
                          </button>
                          {showFileTypeDropdown === 'new-chat' && (
                            <div
                              className="absolute bottom-full left-0 mb-2 rounded-lg border overflow-hidden shadow-xl min-w-[140px] z-50"
                              style={{
                                backgroundColor: 'var(--bg-surface-raised)',
                                borderColor: 'var(--border-default)',
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => { setShowFileTypeDropdown(null); setActiveFileTypeTab('tabular'); tsvFileInputRef.current?.click(); }}
                                className="w-full px-3 py-2.5 text-sm text-left flex items-center gap-2.5 transition-colors hover:bg-white/5"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                <FileText className="w-3.5 h-3.5" style={{ color: 'var(--accent-teal)' }} />
                                TSV / CSV
                              </button>
                              <div style={{ height: '1px', backgroundColor: 'var(--border-default)' }} />
                              <button
                                type="button"
                                onClick={() => { setShowFileTypeDropdown(null); setActiveFileTypeTab('vcf'); vcfFileInputRef.current?.click(); }}
                                className="w-full px-3 py-2.5 text-sm text-left flex items-center gap-2.5 transition-colors hover:bg-white/5"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                <FileText className="w-3.5 h-3.5" style={{ color: 'var(--accent-blue)' }} />
                                VCF
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setIsVariantSidebarOpen(!isVariantSidebarOpen)}
                        className={`chat-chrome-btn ${isVariantSidebarOpen ? 'is-active' : ''}`}
                        title={isVariantSidebarOpen ? 'Close variant filters' : 'Open variant filters'}
                        aria-label={isVariantSidebarOpen ? 'Close variant filters' : 'Open variant filters'}
                        aria-pressed={isVariantSidebarOpen}
                      >
                        <PanelRight />
                      </button>
                      <button
                        onClick={sendMessage}
                        disabled={isInputDisabled || !input.trim()}
                        className={`chat-send-btn flex items-center justify-center transition-all
                          ${(isInputDisabled || !input.trim())
                            ? 'cursor-not-allowed opacity-30'
                            : 'hover:opacity-80 active:scale-95'
                          }`}
                        style={{
                          backgroundColor: (isInputDisabled || !input.trim()) ? 'var(--bg-surface-hover)' : 'var(--accent-teal)',
                          color: (isInputDisabled || !input.trim()) ? 'var(--text-disabled)' : '#fff',
                        }}
                        title="Send message"
                        aria-label="Send message"
                      >
                        <ArrowUp />
                      </button>
                    </div>
                  </PromptInputActions>
                </PromptInput>
                <p className="text-center text-[11px] mt-2 leading-tight" style={{ color: 'var(--text-disabled)' }}>
                  Geneie can make mistakes. Verify important information.
                </p>
              </div>
            </div>
          ) : (
            /* ===== ACTIVE CONVERSATION — messages + bottom input ===== */
            <>
              {!isMobile && <header className="chat-conversation-header">
                <div className="chat-column-inner flex items-center justify-between gap-3 h-12">
                  <h1
                    className="text-sm font-medium truncate flex-1 min-w-0"
                    style={{ color: 'var(--text-primary)' }}
                    title={conversationHeaderTitle}
                  >
                    {conversationHeaderTitle}
                  </h1>
                  {/* <div className="flex items-center gap-0.5 shrink-0">
                    {userTier !== 'guest' && (
                      <button
                        type="button"
                        onClick={createConversation}
                        className="chat-chrome-btn"
                        title="New chat"
                        aria-label="New chat"
                      >
                        <Plus />
                      </button>
                    )}
                  </div> */}
                </div>
              </header>}


              <ChatContainerRoot className="flex-1 min-w-0 overflow-x-hidden relative"
                style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
              >
                <ChatContainerContent className="chat-column-inner space-y-8 pt-5 pb-4">
                  <div className="space-y-8 pb-4 w-full">
                    {messages.map((msg, index) => (
                      <ChatMessage
                        key={msg.id}
                        role={msg.role}
                        text={msg.text}
                        sources={msg.sources}
                        showRegenerate={
                          !isCurrentlyActive &&
                          index === messages.length - 1 &&
                          msg.role === 'ai'
                        }
                        onRegenerate={regenerateLastResponse}
                        regenerateDisabled={!isAuthReady}
                      />
                    ))}

                    {isCurrentlyActive && (
                      <div className="flex w-full gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="chat-prose" style={{ color: 'var(--text-primary)' }}>
                            {typingText ? (
                              <Markdown className="break-words">
                                {typingText}
                              </Markdown>
                            ) : (
                              <div className="flex items-center gap-2 pt-1">
                                <div className="thinking-loader" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </ChatContainerContent>
                <ChatContainerScrollAnchor />
                <div className="sticky bottom-4 flex justify-center pointer-events-none" style={{ zIndex: 10 }}>
                  <ScrollButton
                    className="pointer-events-auto shadow-lg"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
                  />
                </div>
              </ChatContainerRoot>

              {/* Bottom input — conversation mode */}
              <div className="chat-column-inner pb-3 pt-1.5 shrink-0" style={{ backgroundColor: 'var(--bg-app)' }}>
                <div className="w-full">
                  {analysisPipelineBlock}
                  {isChatPipelineGated && chatEligibility.message && (
                    <div
                      role="alert"
                      className="mb-3 px-4 py-3 rounded-xl border text-sm leading-relaxed"
                      style={{
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        borderColor: 'rgba(245, 158, 11, 0.35)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {chatEligibility.message}
                    </div>
                  )}
                  <PromptInput
                    value={input}
                    onValueChange={setInput}
                    onSubmit={sendMessage}
                    isLoading={isCurrentlyActive}
                    disabled={isInputDisabled}
                    className="border border-[var(--border-default)] rounded-2xl flex items-end gap-1 px-2 py-1.5"
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                  >
                    {(userTier === 'guest' || userId) && (
                      <div className="relative shrink-0 mb-0.5" ref={showFileTypeDropdown === 'conversation' ? fileTypeDropdownRef : undefined}>
                        <button
                          type="button"
                          onClick={() => handleUploadButtonClick('conversation')}
                          className="chat-chrome-btn"
                          title="Upload variant file"
                          aria-label="Upload variant file"
                        >
                          <Plus />
                        </button>
                        {showFileTypeDropdown === 'conversation' && (
                          <div
                            className="absolute bottom-full left-0 mb-2 rounded-lg border overflow-hidden shadow-xl min-w-[140px] z-50"
                            style={{
                              backgroundColor: 'var(--bg-surface-raised)',
                              borderColor: 'var(--border-default)',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => { setShowFileTypeDropdown(null); setActiveFileTypeTab('tabular'); tsvFileInputRef.current?.click(); }}
                              className="w-full px-3 py-2.5 text-sm text-left flex items-center gap-2.5 transition-colors hover:bg-white/5"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              <FileText className="w-3.5 h-3.5" style={{ color: 'var(--accent-teal)' }} />
                              TSV / CSV
                            </button>
                            <div style={{ height: '1px', backgroundColor: 'var(--border-default)' }} />
                            <button
                              type="button"
                              onClick={() => { setShowFileTypeDropdown(null); setActiveFileTypeTab('vcf'); vcfFileInputRef.current?.click(); }}
                              className="w-full px-3 py-2.5 text-sm text-left flex items-center gap-2.5 transition-colors hover:bg-white/5"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              <FileText className="w-3.5 h-3.5" style={{ color: 'var(--accent-blue)' }} />
                              VCF
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <PromptInputTextarea
                      placeholder={inputPlaceholder}
                      className="text-sm min-h-[36px] max-h-[120px] py-1.5"
                      style={{ color: 'var(--text-primary)' }}
                    />

                    <div className="flex items-center gap-0.5 mb-0.5">
                      <button
                        type="button"
                        onClick={() => setIsVariantSidebarOpen(!isVariantSidebarOpen)}
                        className={`chat-chrome-btn ${isVariantSidebarOpen ? 'is-active' : ''}`}
                        title={isVariantSidebarOpen ? 'Close variant filters' : 'Open variant filters'}
                        aria-label={isVariantSidebarOpen ? 'Close variant filters' : 'Open variant filters'}
                        aria-pressed={isVariantSidebarOpen}
                      >
                        <PanelRight />
                      </button>
                      {isCurrentlyActive ? (
                        <button
                          type="button"
                          onClick={cancelGeneration}
                          className="chat-send-btn flex items-center justify-center"
                          style={{ backgroundColor: 'var(--bg-surface-hover)', color: 'var(--text-secondary)' }}
                          title="Stop generation"
                          aria-label="Stop generation"
                        >
                          <Square />
                        </button>
                      ) : (
                        <button
                          onClick={sendMessage}
                          disabled={isInputDisabled || !input.trim()}
                          className={`chat-send-btn flex items-center justify-center transition-all
                            ${(isInputDisabled || !input.trim())
                              ? 'cursor-not-allowed opacity-30'
                              : 'hover:opacity-80 active:scale-95'
                            }`}
                          style={{
                            backgroundColor: (isInputDisabled || !input.trim()) ? 'var(--bg-surface-hover)' : 'var(--text-primary)',
                            color: (isInputDisabled || !input.trim()) ? 'var(--text-disabled)' : 'var(--bg-app)',
                          }}
                          title="Send message"
                          aria-label="Send message"
                        >
                          <ArrowUp />
                        </button>
                      )}
                    </div>
                  </PromptInput>
                  <p className="text-center text-[11px] mt-1.5 leading-tight" style={{ color: 'var(--text-disabled)' }}>
                    Geneie can make mistakes. Verify important information.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <aside className="chat-shell-right" aria-hidden={!isVariantSidebarOpen}>
          <VariantFilterSidebar
            conversationId={activeConversationId || 'guest-session'}
            userId={userId || 'guest'}
            variantData={variantData}
            currentDocument={currentDocument}
            onUploadSuccess={handleDocumentUpload}
            isOpen={isVariantSidebarOpen}
            onToggle={() => setIsVariantSidebarOpen(!isVariantSidebarOpen)}
            onFiltersChange={(filters, filteredCount, filterTotalCount, filterMeta) => {
              if (!activeConversationId) return;
              if (filterMeta?.parameter_ranges) {
                setVariantData((prev) =>
                  prev
                    ? {
                        ...prev,
                        parameter_ranges: filterMeta.parameter_ranges,
                        numeric_columns: filterMeta.numeric_columns || prev.numeric_columns,
                        parameter_ranges_from_full_file: true,
                      }
                    : prev
                );
              }
              refreshConversationAfterAnnovarRef.current(activeConversationId);
              setConversationFilterState((prev) => {
                const empty = !filters || Object.keys(filters).length === 0;
                if (empty) {
                  return {
                    activeVariantFilters: null,
                    filteredVariantCount: filteredCount ?? null,
                    activeProprietaryFilter: null,
                    filterWorkingSetCount: filterTotalCount ?? null,
                  };
                }
                if (filters.proprietary === null) {
                  return {
                    ...prev,
                    activeProprietaryFilter: null,
                    filteredVariantCount: filteredCount ?? null,
                    filterWorkingSetCount: filterTotalCount ?? prev.filterWorkingSetCount,
                  };
                }
                if (filters.proprietary) {
                  return {
                    ...prev,
                    activeProprietaryFilter: filters.proprietary,
                    filteredVariantCount: filteredCount ?? null,
                    filterWorkingSetCount: filterTotalCount ?? filteredCount ?? null,
                  };
                }
                return {
                  ...prev,
                  activeVariantFilters: filters,
                  filteredVariantCount: filteredCount ?? null,
                  filterWorkingSetCount: filterTotalCount ?? prev.filterWorkingSetCount,
                };
              });
            }}
            userTier={userTier}
            activeVariantFiltersFromConv={conversationFilterState.activeVariantFilters}
            filteredVariantCountFromConv={conversationFilterState.filteredVariantCount}
            activeProprietaryFilterFromConv={conversationFilterState.activeProprietaryFilter}
            filterWorkingSetCountFromConv={conversationFilterState.filterWorkingSetCount}
          />
      </aside>

      {/* Hidden file inputs for dropdown file type selection */}
      <input
        ref={tsvFileInputRef}
        type="file"
        accept=".tsv,.csv"
        onChange={(e) => handleDropdownFileSelect(e, 'tabular')}
        className="hidden"
      />
      <input
        ref={vcfFileInputRef}
        type="file"
        accept=".vcf,.vcf.gz,.gz,application/gzip"
        onChange={(e) => handleDropdownFileSelect(e, 'vcf')}
        className="hidden"
      />

      {/* Upload Modal for Variant Files — file picker; sample metadata opens as its own popup */}
      {(showUploadModal || uploadSessionConversationId) && (
        <div
          className={`fixed inset-0 z-50 ${
            !showUploadModal && uploadSessionConversationId ? 'pointer-events-none opacity-0' : ''
          }`}
          aria-hidden={!showUploadModal && Boolean(uploadSessionConversationId)}
        >
          {!metadataFormOpen && showUploadModal && (
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                setShowUploadModal(false);
                setPreSelectedFile(null);
                if (uploadSessionConversationId === activeConversationId) {
                  setPipelineToast({
                    title: 'Upload in progress',
                    message:
                      'Your file is still uploading. Please wait — chat will resume when processing finishes.',
                    variant: 'info',
                  });
                }
              }}
              aria-hidden="true"
            />
          )}
          <div
            className={
              metadataFormOpen
                ? 'fixed w-px h-px overflow-visible opacity-0 pointer-events-none'
                : showUploadModal
                  ? 'relative flex min-h-full items-center justify-center p-4 pointer-events-none'
                  : 'hidden'
            }
          >
            <div
              className="rounded-2xl max-w-lg w-full transition-all pointer-events-auto"
              style={{
                backgroundColor: 'var(--bg-surface-raised)',
                border: '1px solid var(--accent-teal)',
                boxShadow: 'var(--shadow-xl)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 md:p-5">
                <DocumentUpload
                  conversationId={uploadSessionConversationId || activeConversationId || 'guest-session'}
                  userId={userId || 'guest'}
                  onUploadingChange={handleVariantUploadingChangeWithCleanup}
                  onUploadProgressChange={handleUploadProgressChange}
                  onUploadStarted={handleUploadStarted}
                  onDismissForUpload={() => {
                    setShowUploadModal(false);
                    setMetadataFormOpen(false);
                  }}
                  onUploadSuccess={async (doc) => {
                    await handleDocumentUpload(doc);
                    if (doc !== null) {
                      setShowUploadModal(false);
                      setMetadataFormOpen(false);
                      setActiveFileTypeTab('tabular');
                      setPreSelectedFile(null);
                      setUploadingFileName(null);
                    }
                  }}
                  existingDocument={currentDocument}
                  userTier={userTier}
                  activeFileTypeTab={activeFileTypeTab}
                  preSelectedFile={preSelectedFile}
                  onMetadataFormChange={setMetadataFormOpen}
                  onCancel={() => {
                    setShowUploadModal(false);
                    setPreSelectedFile(null);
                    setMetadataFormOpen(false);
                    setUploadingFileName(null);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Profile Management Modal */}
      {userTier !== 'guest' && (
        <ProfileManagement
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          userTier={userTier}
          userId={userId}
          conversations={conversations}
          currentExchanges={currentExchanges}
          chatLimit={tierChatLimit}
        />
      )}

      {/* Subscription Success Modal */}
      {showSubscriptionSuccess && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <SubscriptionSuccess onClose={() => setShowSubscriptionSuccess(false)} />
        </div>
      )}

      {/* Subscription Canceled Modal */}
      {showSubscriptionCanceled && (
        <SubscriptionCanceled onClose={() => setShowSubscriptionCanceled(false)} />
      )}

      {/* Global Processing Notification */}
      <ProcessingNotification
        message={null}
        isVisible={false}
      />

      {/* Column Interpretation Results Modal */}
      {showFileAnalysisModal && (
        <ColumnInterpretationResults
          interpretationResult={columnInterpretationResult}
          chatAllowed={!isChatPipelineGated}
          chatBlockedMessage={chatEligibility.message}
          onChatBlocked={() => promptChatBlocked()}
          isVcfFile={(() => {
            const t = (currentDocument.file_type ?? currentDocument.type)?.toLowerCase() || '';
            const name = (currentDocument.file_name ?? currentDocument.name ?? '').toLowerCase();
            return t === 'vcf' || name.endsWith('.vcf') || name.endsWith('.vcf.gz');
          })()}
          onClose={async () => {
            interpretationDismissedRef.current = true;
            setShowInterpretationModal(false);
            if (columnInterpretationResult && activeConversationId) {
              await syncAfterColumnInterpretation(activeConversationId, columnInterpretationResult);
            }
          }}
          onTryVcfUpload={() => {
            interpretationDismissedRef.current = true;
            setShowInterpretationModal(false);
            setActiveFileTypeTab('vcf');
            setShowUploadModal(true);
          }}
          onConvertToVcf={async () => {
            interpretationDismissedRef.current = true;
            setShowInterpretationModal(false);
            const genome = currentDocument?.sample_metadata?.genome;
            const refGenome = genome?.includes('37') || genome?.includes('hg19') ? 'hg19' : 'hg38';
            await convertTabularToVcfForConversation(refGenome);
          }}
          onAnnovarClick={runAnnovarForCurrentConversation}
          onAcmgFilterClick={runAcmgFilterForCurrentConversation}
          isApplyingAcmgFilter={isApplyingAcmgFilter}
          isRunningAnnovar={isRunningAnnovar}
          acmgFilterActive={conversationFilterState.activeProprietaryFilter === 'filter_1'}
          acmgFilterCanApply={acmgFilterCanApply}
          showVcfTabHighlight={columnInterpretationResult?.step1?.passed === false}
          onDeleteDocument={async () => {
            console.log('[App] Deleting document from conversation');
            try {
              const auth = getAuth();
              const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
              if (token && activeConversationId) {
                const deleteResponse = await fetch(apiUrl(`/api/conversation/${activeConversationId}/document`), {
                  method: 'DELETE',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                  }
                });
                if (deleteResponse.ok) {
                  const deleteData = await deleteResponse.json();
                  console.log('[App] Backend document deletion:', deleteData);
                } else {
                  console.warn('[App] Backend document deletion failed');
                }
              }
            } catch (backendError) {
              console.warn('[App] Backend document deletion error:', backendError);
            }
            setCurrentDocument(null);
            setVariantData(null);
            setColumnInterpretationResult(null);
            setShowInterpretationModal(false);
            interpretationShownRef.current = false;
            console.log('[App] Document removed successfully');
          }}
        />
      )}

      {/* Variant file upload — blocks chat while POST /api/upload-variant-file runs */}
      {userTier !== 'guest' && (
        <VariantUploadLoadingModal
          isOpen={variantUploadInProgress}
          uploadProgress={uploadProgress}
          fileName={uploadingFileName || preSelectedFile?.name}
        />
      )}

      {/* ANNOVAR message modal (styled in-app) */}
      {annovarMessageModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60]"
          style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
          onClick={() => setAnnovarMessageModal(null)}
        >
          <div
            className="rounded-xl max-w-md w-full mx-4 overflow-hidden"
            style={{ backgroundColor: 'var(--bg-surface-raised)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 flex items-center justify-between border-b" style={{ backgroundColor: 'var(--accent-teal-soft)', borderColor: 'var(--border-subtle)' }}>
              <span className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{annovarMessageModal.title}</span>
              <button
                type="button"
                onClick={() => setAnnovarMessageModal(null)}
                className="p-1 rounded hover:bg-white/10 transition-colors"
                aria-label="Close"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex items-start gap-3 mb-5">
                {annovarMessageModal.variant === 'success' && (
                  <CheckCircle2 className="w-8 h-8 flex-shrink-0" style={{ color: 'var(--success)' }} />
                )}
                {annovarMessageModal.variant === 'error' && (
                  <AlertCircle className="w-8 h-8 flex-shrink-0" style={{ color: 'var(--error)' }} />
                )}
                {annovarMessageModal.variant === 'info' && (
                  <AlertCircle className="w-8 h-8 flex-shrink-0" style={{ color: 'var(--accent-blue)' }} />
                )}
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                  {annovarMessageModal.message}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAnnovarMessageModal(null)}
                  className="px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                  style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
                >
                  {annovarMessageModal.ctaLabel ? 'Dismiss' : 'OK'}
                </button>
                {annovarMessageModal.ctaLabel && (
                  <button
                    type="button"
                    onClick={() => annovarMessageModal.onCta?.()}
                    className="px-4 py-2 rounded-lg font-medium transition-colors hover:opacity-90 text-sm"
                    style={{ backgroundColor: 'var(--accent-teal)', color: '#0F0F0F' }}
                  >
                    {annovarMessageModal.ctaLabel}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;
