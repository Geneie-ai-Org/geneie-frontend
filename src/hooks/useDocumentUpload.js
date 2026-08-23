import { useCallback } from 'react';
import { getAuth } from 'firebase/auth';
import * as mongodbApi from '../services/mongodbApi';
import { apiUrl } from '@/config/api';
import { buildVariantDataFromConversation } from '@/lib/variantPipelineUtils';

export function useDocumentUpload({
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
  setConversationFilterState,
}) {
  const handleDocumentUpload = useCallback(async (documentData) => {
    console.log('[App] handleDocumentUpload called with:', documentData);
    console.log('[App] userId:', userId, 'activeConversationId:', activeConversationId, 'userTier:', userTier);

    /* Any change of document — add, replace or remove — invalidates the filters and the
     * filtered count held for the previous file. Without this the pipeline reports the
     * old file's Filter step as complete until the next conversation refetch overwrites
     * it, which is how a freshly uploaded file could show a ticked Filter step. */
    setConversationFilterState?.({
      activeVariantFilters: null,
      filteredVariantCount: null,
      activeProprietaryFilter: null,
      filterWorkingSetCount: null,
    });

    const isGuest = userTier === 'guest';

    if (isGuest) {
      if (!documentData) {
        setCurrentDocument(null);
        setVariantData(null);
        setColumnInterpretationResult(null);
        setShowInterpretationModal(false);
        interpretationShownRef.current = false;
        console.log('[App] Document removed (guest mode)');
      } else {
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
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                document_url: documentData.url,
                document_type: documentData.type,
                conversation_id: 'guest-session',
              }),
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
          }
        }
      }
      return;
    }

    if (!userId || !activeConversationId) {
      console.error('[App] Missing prerequisites for document upload');
      return;
    }

    try {
      if (documentData === null) {
        console.log('[App] Removing document from conversation');

        try {
          const auth = getAuth();
          const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

          if (token) {
            const deleteResponse = await fetch(apiUrl(`/api/conversation/${activeConversationId}/document`), {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
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
        syncPipelineFromConversationRef.current(null);
        console.log('[App] Document removed successfully');
      } else {
        console.log('[App] Adding/updating document:', documentData);

        setCurrentDocument(documentData);
        interpretationDismissedRef.current = false;
        setPipelineDismissed(false);
        setPipelineExpanded(true);

        if (documentData.column_interpretation) {
          setColumnInterpretationResult(documentData.column_interpretation);
          if (documentData.variant_metadata) {
            setVariantData(buildVariantDataFromConversation(documentData, documentData.variant_metadata));
          }
          const convDataForModal = {
            column_interpretation: documentData.column_interpretation,
            document: documentData.url
              ? { s3_url: documentData.url, file_name: documentData.name ?? documentData.file_name }
              : null,
          };
          presentFileAnalysisModal(convDataForModal);
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
          console.log('[App] Document uploaded via S3 endpoint, backend already processed:', documentData.variant_count, 'variants');

          if (activeConversationId && userId) {
            let retryCount = 0;
            const maxRetries = 10;
            const retryInterval = 2000;

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
                }
                retryCount++;
                if (retryCount < maxRetries) {
                  console.log(`[App] No interpretation results yet, retrying in ${retryInterval}ms...`);
                  setTimeout(fetchInterpretationResults, retryInterval);
                } else {
                  console.warn('[App] Max retries reached, interpretation results not found');
                }
              } catch (error) {
                console.error('[App] Error fetching conversation data after upload:', error);
                retryCount++;
                if (retryCount < maxRetries) {
                  setTimeout(fetchInterpretationResults, retryInterval);
                }
              }
            };

            setTimeout(fetchInterpretationResults, retryInterval);
          }
        }
        // No legacy POST /api/validate-document here: the modern S3 upload already lands
        // variant_metadata + column_interpretation with the conversation, and the old call's
        // response was never used for anything but a console.log.
      }
    } catch (error) {
      console.error('[App] Error updating conversation document:', error);
      throw error;
    }
  }, [
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
    setConversationFilterState,
  ]);

  return { handleDocumentUpload };
}
