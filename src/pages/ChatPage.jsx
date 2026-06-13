import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, FileText, User, X, CheckCircle2, AlertCircle, MessageSquare, Bot, Menu } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import * as mongodbApi from '../services/mongodbApi';

import { ChatContainerRoot, ChatContainerContent, ChatContainerScrollAnchor } from '../components/prompt-kit/chat-container';
import { ScrollButton } from '../components/prompt-kit/scroll-button';
import { Markdown } from '../components/prompt-kit/markdown';

import { useAuth } from '../hooks/useAuth';
import { useChatMessaging } from '../hooks/useChatMessaging';
import { useDocumentUpload } from '../hooks/useDocumentUpload';
import AuthForm from '../components/AuthForm';
import ChatMessage, { GlobalTypingStyles } from '../components/chat/ChatMessage';
import AuthPageLayout from '../components/chat/AuthPageLayout';
import AnnovarMessageModal from '../components/chat/AnnovarMessageModal';
import ChatPromptInput from '../components/chat/ChatPromptInput';
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

import { apiUrl } from '@/config/api';
import { buildVariantDataFromConversation, variantFileRowCountForSidebar } from '@/lib/variantPipelineUtils';
import { conversationPath, isValidConversationId } from '@/lib/conversationRoutes';
import { getDeviceId } from '@/lib/deviceId';
import { useVariantPipeline } from '@/hooks/useVariantPipeline';
import { useIsMobile } from '@/hooks/useIsMobile';
import { getTierChatLimit, DEFAULT_GUEST_CHAT_LIMIT } from '@/services/backendApi';

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
  const [isShowingAuthForm, setIsShowingAuthForm] = useState(false);
  const [justSignedUp, setJustSignedUp] = useState(false);
  const [pendingEmailVerification, setPendingEmailVerification] = useState(false);
  const [pipelineExpanded, setPipelineExpanded] = useState(false);
  const [pipelineDismissed, setPipelineDismissed] = useState(false);

  // --- HOOK INTEGRATION ---
  const { userId, isAuthReady, userLoading, userTier, subscriptionStatus, refreshSubscriptionStatus } = useAuth();

  const tierChatLimit = getTierChatLimit(userTier, subscriptionStatus);

  const [guestExchangesUsed, setGuestExchangesUsed] = useState(0);
  const [guestLimitExceeded, setGuestLimitExceeded] = useState(false);

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

  const updateConversationTitle = useCallback(async (conversationId, firstMessage) => {
    if (!userId) return;

    try {
      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      const response = await fetch(apiUrl('/api/generate-conversation-title'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          firstMessage,
        }),
      });

      let title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : '');

      if (response.ok) {
        const data = await response.json();
        title = data.title || title;
      }

      await mongodbApi.updateConversation(conversationId, { title });
    } catch (error) {
      console.error('Error updating conversation title:', error);
      try {
        const fallbackTitle = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : '');
        await mongodbApi.updateConversation(conversationId, { title: fallbackTitle });
      } catch (fallbackError) {
        console.error('Error with fallback title update:', fallbackError);
      }
    }
  }, [userId]);

  const {
    messages,
    setMessages,
    typingText,
    isLoading,
    input,
    setInput,
    sendMessage,
    regenerateLastResponse,
    cancelGeneration,
  } = useChatMessaging({
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
  });

  const syncAfterColumnInterpretation = useCallback(
    async (conversationId, columnInterpretation) => {
      if (!conversationId || !columnInterpretation || userTier === 'guest') return;
      await remapProprietaryFiltersForConversation(conversationId, columnInterpretation);
      await refreshChatEligibilityFromApi(conversationId);
    },
    [userTier, remapProprietaryFiltersForConversation, refreshChatEligibilityFromApi]
  );

  const { handleDocumentUpload } = useDocumentUpload({
    userId,
    userTier,
    activeConversationId,
    setCurrentDocument,
    setVariantData,
    setColumnInterpretationResult,
    setShowInterpretationModal,
    interpretationShownRef,
    interpretationDismissedRef,
    setPipelineDismissed,
    setPipelineExpanded,
    presentFileAnalysisModal,
    syncAfterColumnInterpretation,
    refreshSubscriptionStatus,
    setAnnovarMessageModal,
    setIsShowingAuthForm,
    syncPipelineFromConversationRef,
  });

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
                // console.log('[App] Auto-showing interpretation results modal (via conversation load)', { variantUploadInProgress });
                interpretationShownRef.current = resultId;
                if (!variantUploadInProgress) {
                  setTimeout(() => setShowInterpretationModal(true), 100);
                } else {
                  // console.log('[App] Upload in progress, skipping auto-show of interpretation modal');
                }
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

  const onSelectTabularFile = () => {
    setShowFileTypeDropdown(null);
    setActiveFileTypeTab('tabular');
    tsvFileInputRef.current?.click();
  };

  const onSelectVcfFile = () => {
    setShowFileTypeDropdown(null);
    setActiveFileTypeTab('vcf');
    vcfFileInputRef.current?.click();
  };

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
    return (
      <AuthPageLayout>
        <AuthForm
          triggerReason={'manual'}
          onSignupSuccess={(status) => {
            setPendingEmailVerification(false);
            localStorage.removeItem('pendingEmailVerification');
            setJustSignedUp(status);
          }}
          onEmailVerificationPending={setPendingEmailVerification}
        />
      </AuthPageLayout>
    );
  }

  if (justSignedUp) {
    return (
      <AuthPageLayout>
        <AuthForm
          triggerReason={'manual'}
          onSignupSuccess={setJustSignedUp}
          onEmailVerificationPending={setPendingEmailVerification}
        />
      </AuthPageLayout>
    );
  }

  if (userTier === 'guest' && (guestLimitExceeded || isShowingAuthForm)) {
    return (
      <AuthPageLayout>
        <AuthForm
          triggerReason={isShowingAuthForm ? 'manual' : 'guestLimit'}
          onSignupSuccess={handleSignupSuccess}
          onEmailVerificationPending={setPendingEmailVerification}
        />
      </AuthPageLayout>
    );
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
                <ChatPromptInput
                  mode="empty"
                  input={input}
                  onInputChange={setInput}
                  onSend={sendMessage}
                  onStop={cancelGeneration}
                  isCurrentlyActive={isCurrentlyActive}
                  isInputDisabled={isInputDisabled}
                  showUpload={userTier === 'guest' || !!userId}
                  dropdownSource="new-chat"
                  showFileTypeDropdown={showFileTypeDropdown}
                  fileTypeDropdownRef={fileTypeDropdownRef}
                  onUploadButtonClick={handleUploadButtonClick}
                  onSelectTabular={onSelectTabularFile}
                  onSelectVcf={onSelectVcfFile}
                  isVariantSidebarOpen={isVariantSidebarOpen}
                  onToggleVariantSidebar={() => setIsVariantSidebarOpen(!isVariantSidebarOpen)}
                  analysisPipelineBlock={analysisPipelineBlock}
                />
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
                <ChatPromptInput
                  mode="conversation"
                  input={input}
                  onInputChange={setInput}
                  onSend={sendMessage}
                  onStop={cancelGeneration}
                  isCurrentlyActive={isCurrentlyActive}
                  isInputDisabled={isInputDisabled}
                  placeholder={inputPlaceholder}
                  showUpload={userTier === 'guest' || !!userId}
                  dropdownSource="conversation"
                  showFileTypeDropdown={showFileTypeDropdown}
                  fileTypeDropdownRef={fileTypeDropdownRef}
                  onUploadButtonClick={handleUploadButtonClick}
                  onSelectTabular={onSelectTabularFile}
                  onSelectVcf={onSelectVcfFile}
                  isVariantSidebarOpen={isVariantSidebarOpen}
                  onToggleVariantSidebar={() => setIsVariantSidebarOpen(!isVariantSidebarOpen)}
                  pipelineGatedMessage={isChatPipelineGated ? chatEligibility.message : null}
                  analysisPipelineBlock={analysisPipelineBlock}
                />
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

      <AnnovarMessageModal
        modal={annovarMessageModal}
        onClose={() => setAnnovarMessageModal(null)}
      />
    </div>
  );
};

export default ChatPage;
