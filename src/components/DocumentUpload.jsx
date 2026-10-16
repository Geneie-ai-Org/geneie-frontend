import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, FileText, X, CheckCircle, Plus, ChevronLeft, ArrowRight, Download, Check, Trash2 } from 'lucide-react';
import { optionalIdToken, requiredIdToken } from '@/lib/safeAuth';
import { apiUrl as buildApiUrl } from '@/config/api';
import { useAuth } from '@/hooks/useAuth';
import { guestLimits } from '@/services/tierLimits';
import { getDeviceId } from '@/lib/deviceId';
import {
  completeVariantUpload,
  getMaxUploadBytes,
  presignVariantUpload,
  putFileToPresignedUrl,
  shouldUsePresignedUpload,
  detectGenomeBuild,
  urlPreflight,
  uploadFromUrl,
  isRecognizedImportUrl,
} from '@/services/backendApi';
import { patchSampleMetadata } from '@/services/mongodbApi';
import PhenotypeInputPanel, {
  PHENOTYPE_MODE_NOTE,
  sampleHasPhenotype,
} from '@/components/PhenotypeInputPanel';
import GermlinePedigreeFields, { countPedigreeFieldsFilled } from '@/components/GermlinePedigreeFields';
import {
  Disclosure,
  DropZone,
  Field,
  FieldGroup,
  FileChip,
  ICON_BTN_CLASS,
  MissingHint,
  QuietSummary,
  SegmentedPill,
  TEXT_INPUT_CLASS,
  UploadErrorBanner,
  WIZARD_DIALOG_CLASS,
  WizardPanes,
  WizardSelect,
  WizardStepper,
} from '@/components/UploadWizardKit';
import { Collapse, HoldButton, StateButton } from '@/components/motion';
import { Button } from '@/components/ui/button';
import {
  EMPTY_PEDIGREE_FIELDS,
  pedigreeFieldsForSubmit,
  pickPedigreeFields,
} from '@/components/germlinePedigreeOptions';
import PipelineRunModeToggle, {
  PIPELINE_RUN_MANUAL,
  normalizePipelineRunMode,
  applyPipelineRunModeChange,
} from '@/components/PipelineRunModeToggle';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/** Tabular + VCF (.vcf and .vcf.gz). Uses suffix checks so .vcf.gz is not mistaken for .gz-only. */
function isAllowedVariantFilename(fileName) {
  const n = (fileName || '').toLowerCase();
  if (n.endsWith('.tsv') || n.endsWith('.csv')) return true;
  if (n.endsWith('.vcf.gz')) return true;
  if (n.endsWith('.vcf')) return true;
  return false;
}

// Shared select (ui/select wrapper; unavailable options toast their reason).
const CustomSelect = WizardSelect;

/** Human size for the file row, e.g. "1.4 MB". */
function formatFileSize(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return '';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const hasValue = (v) => v === 0 || (v !== '' && v != null);

const DocumentUpload = ({
  conversationId,
  userId,
  onUploadSuccess,
  onUploadingChange,
  onUploadProgressChange,
  existingDocument,
  compact = false,
  userTier,
  activeFileTypeTab,
  preSelectedFile,
  onCancel,
  onDismissForUpload,
  onUploadStarted,
  onMetadataFormChange,
  editMode = false,
  initialMetadata = null,
  onEditSaved = null,
  /** Optional: called with { message, code, status } whenever a submit fails. */
  onUploadFailed = null,
}) => {
  const { limits } = useAuth();
  const isGuestUser = userTier === 'guest' || userId === 'guest';
  const uploadLimits = isGuestUser ? guestLimits() : limits;
  const [isUploading, setIsUploading] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  // Live text in the phenotype box, for the "Skip & upload" label.
  const [phenotypeDraft, setPhenotypeDraft] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setErrorState] = useState('');
  // Machine-readable half of the last failure (backend `detail.code`, HTTP status), so the
  // banner can say "too many sessions" instead of echoing a raw message.
  const [errorMeta, setErrorMeta] = useState(null);
  const setError = useCallback((value) => {
    setErrorState(value);
    setErrorMeta(null);
  }, []);
  const [success, setSuccess] = useState('');
  const [touched, setTouched] = useState({});
  const [detailsOpen, setDetailsOpen] = useState(false);
  const lastSubmitRef = useRef(null);
  const showInfoFormRef = useRef(false);
  const [showInfoForm, setShowInfoForm] = useState(false);
  /** Sample Metadata wizard: basics → analysis fields → (Germline) phenotype. */
  const [metadataStep, setMetadataStep] = useState('sample'); // 'sample' | 'analysis' | 'phenotype'
  const [selectedFile, setSelectedFile] = useState(null);
  const [sampleMetadata, setSampleMetadata] = useState({
    name: '', // Auto-generated from filename
    project: '', // Dropdown + create new
    genome: '', // Mandatory: hg19 (GRCh37) / hg38 (GRCh38)
    sequencingType: '', // Mandatory: WES / WGS / Targeted
    sampleFileType: '', // Auto-detected from file extension
    sampleSex: '', // Optional: Male / Female / Unknown
    analysisType: '', // Mandatory: Germline / Somatic / Tumor-Normal Paired / Tumor-Only / IVF / PGT / Unknown
    sampleSource: '', // Optional: Tissue / Blood / FFPE / Other
    // Conditional fields (only if Analysis Type = Germline)
    sampleRole: '', // proband / mother / father / sibling / other
    affectedStatus: '', // affected / unaffected
    inheritanceModel: '', // Autosomal Dominant / Autosomal Recessive / X-linked / De novo / Unknown
    ...EMPTY_PEDIGREE_FIELDS,
    phenotype: '', // Canonical active-tab text (only for Germline)
    phenotype_mode: PHENOTYPE_MODE_NOTE,
    phenotype_findings: '',
    phenotype_disease: '',
    phenotype_note_clean: '',
    phenotype_run_mode: PIPELINE_RUN_MANUAL,
    pipeline_run_mode: PIPELINE_RUN_MANUAL,
    phenotype_hpo: null,
    tumorType: '' // Free text (only for Somatic/Tumor-Normal Paired/Tumor-Only)
  });
  const [existingProjects, setExistingProjects] = useState([]); // Will be fetched from backend later
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [isDetectingGenome, setIsDetectingGenome] = useState(false);
  const [genomeDetection, setGenomeDetection] = useState(null); // { detected_build, genome, confidence, source }
  const [editImpact, setEditImpact] = useState(null); // metadata_edit_impact from PATCH response
  const [importMode, setImportMode] = useState('file'); // 'file' | 'url' — chosen in-modal
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileUrl, setFileUrl] = useState('');
  const [urlFilenameOverride, setUrlFilenameOverride] = useState('');
  const [showUrlFilename, setShowUrlFilename] = useState(false);
  const [urlFieldFocused, setUrlFieldFocused] = useState(false);
  const [importUrlMeta, setImportUrlMeta] = useState(null); // preflight result
  const [isPreflighting, setIsPreflighting] = useState(false);
  useEffect(() => {
    if (editMode && initialMetadata) {
      setSampleMetadata({
        name: initialMetadata.sampleName || initialMetadata.name || '',
        project: initialMetadata.projectName || initialMetadata.project || '',
        genome: initialMetadata.genome || '',
        sequencingType: initialMetadata.sequencingType || '',
        sampleFileType: initialMetadata.sampleFileType || '',
        sampleSex: initialMetadata.sampleSex || initialMetadata.patientSex || '',
        analysisType: initialMetadata.analysisType || '',
        sampleSource: initialMetadata.sampleSource || '',
        sampleRole: initialMetadata.sampleRole || '',
        affectedStatus: initialMetadata.affectedStatus || '',
        inheritanceModel: initialMetadata.inheritanceModel || '',
        ...pickPedigreeFields(initialMetadata),
        phenotype: initialMetadata.phenotype || '',
        phenotype_mode: initialMetadata.phenotype_mode || PHENOTYPE_MODE_NOTE,
        phenotype_findings: initialMetadata.phenotype_findings || (initialMetadata.phenotype_mode === 'disease' ? '' : (initialMetadata.phenotype || '')),
        phenotype_disease: initialMetadata.phenotype_disease || (initialMetadata.phenotype_mode === 'disease' ? (initialMetadata.phenotype || '') : ''),
        phenotype_note_clean: initialMetadata.phenotype_note_clean || '',
        phenotype_run_mode: normalizePipelineRunMode(
          initialMetadata.pipeline_run_mode || initialMetadata.phenotype_run_mode
        ),
        pipeline_run_mode: normalizePipelineRunMode(
          initialMetadata.pipeline_run_mode || initialMetadata.phenotype_run_mode
        ),
        phenotype_hpo: initialMetadata.phenotype_hpo || null,
        // Save sends these back, so they must be loaded or an untouched edit clears them.
        selected_panels: initialMetadata.selected_panels || [],
        selected_panel_gene_list: initialMetadata.selected_panel_gene_list || [],
        selected_panel_include_amber: initialMetadata.selected_panel_include_amber !== false,
        tumorType: initialMetadata.tumorType || '',
      });
      setEditImpact(null);
      setError('');
      setTouched({});
      // Saved optional values must not hide behind the collapsed section.
      setDetailsOpen(
        [
          initialMetadata.sampleSex || initialMetadata.patientSex,
          initialMetadata.sampleSource,
          initialMetadata.sampleRole,
          initialMetadata.affectedStatus,
          initialMetadata.inheritanceModel,
          initialMetadata.tumorType,
        ].some(hasValue) || countPedigreeFieldsFilled(pickPedigreeFields(initialMetadata)) > 0
      );
      setMetadataStep('sample');
      setShowInfoForm(true);
    }
  }, [editMode, initialMetadata]);

  // File type is now selected via dropdown in ChatPage before reaching this component
  const fileInputRef = useRef(null);

  /** Tell parent upload started synchronously (before closing modals) so upload UI stays mounted. */
  const notifyUploadStarting = useCallback(
    (file) => {
      setIsUploading(true);
      setUploadProgress(0);
      onUploadingChange?.(true);
      onUploadProgressChange?.(0);
      const name = file?.name || selectedFile?.name || preSelectedFile?.name;
      if (name) onUploadStarted?.(name);
    },
    [
      selectedFile,
      preSelectedFile,
      onUploadingChange,
      onUploadProgressChange,
      onUploadStarted,
    ]
  );

  /** Fire-and-forget genome detection when a file is selected for the metadata form. */
  const runGenomeDetection = useCallback(async (file) => {
    setIsDetectingGenome(true);
    setGenomeDetection(null);
    try {
      const result = await detectGenomeBuild(file);
      console.log('[DocumentUpload] Genome detection result:', result);
      if (result.genome) {
        // Pre-fill only if the user hasn't manually selected a genome yet
        setSampleMetadata((prev) => {
          if (prev.genome) return prev; // user already picked one
          return { ...prev, genome: result.genome };
        });
      }
      setGenomeDetection(result);
    } catch (err) {
      console.warn('[DocumentUpload] Genome detection failed (non-blocking):', err.message);
      setGenomeDetection(null);
    } finally {
      setIsDetectingGenome(false);
    }
  }, []);

  /**
   * Single exit for every failed submit. The error lands in the wizard's banner (the dialog is
   * re-shown if it was hidden while the transfer ran) and in a toast, so a failure can never
   * pass unseen even if the host unmounts this component.
   */
  const failUpload = useCallback(
    (message, meta = null, { reopenWizard = true } = {}) => {
      setErrorState(message);
      setErrorMeta(meta);
      setIsUploading(false);
      setUploadProgress(0);
      onUploadProgressChange?.(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (reopenWizard) setShowInfoForm(true);
      onUploadFailed?.({ message, ...(meta || {}) });
      toast.error('Upload failed', { description: message });
    },
    [onUploadProgressChange, onUploadFailed]
  );

  useEffect(() => {
    onUploadingChange?.(isUploading);
    if (!isUploading) {
      onUploadProgressChange?.(null);
    }
  }, [isUploading, onUploadingChange, onUploadProgressChange]);

  // Processing status is already shown by <VariantUploadLoadingModal /> — no extra toast needed.

  // Fetch existing projects when form opens (for authenticated users only)
  useEffect(() => {
    const fetchProjects = async () => {
      const isGuest = userTier === 'guest' || userId === 'guest';
      if (isGuest || !showInfoForm) {
        return; // Don't fetch for guests or if form is not shown
      }

      try {
        // getAuth() was never imported (ReferenceError). Use the existing safeAuth helper -
        // same token, no direct firebase/auth import, matches the rest of this file.
        const token = await optionalIdToken();

        if (!token) {
          console.log('[DocumentUpload] No auth token, skipping project fetch');
          return;
        }

        const response = await fetch(buildApiUrl('/api/user/projects'), {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          console.log('[DocumentUpload] Fetched projects:', data.projects);
          setExistingProjects(data.projects || []);
        } else {
          console.warn('[DocumentUpload] Failed to fetch projects:', response.status);
        }
      } catch (error) {
        console.error('[DocumentUpload] Error fetching projects:', error);
        // Don't show error to user, just log it
      }
    };

    fetchProjects();
  }, [showInfoForm, userId, userTier]);

  useEffect(() => {
    showInfoFormRef.current = showInfoForm;
    onMetadataFormChange?.(showInfoForm);
  }, [showInfoForm, onMetadataFormChange]);

  const validateFile = (file) => {
    const fileName = (file.name || '').toLowerCase();
    if (!isAllowedVariantFilename(file.name)) {
      return {
        valid: false,
        error: 'Invalid file type. Only .TSV, .CSV, .VCF, and .vcf.gz files are allowed.',
      };
    }
    // Reject generic .gz that is not bgzip VCF (e.g. foo.gz)
    if (fileName.endsWith('.gz') && !fileName.endsWith('.vcf.gz')) {
      return {
        valid: false,
        error: 'For gzip archives only .vcf.gz (bgzip-compressed VCF) is allowed.',
      };
    }

    // Check file size — tier-aware (from GET /api/subscription-status when signed in)
    const isGuest = userTier === 'guest' || userId === 'guest';
    const maxSize = getMaxUploadBytes(file.name, uploadLimits);
    if (file.size > maxSize) {
      const limitMb = Math.round(maxSize / (1024 * 1024));
      const limitGb = maxSize / (1024 ** 3);
      const limitLabel = limitGb >= 1 ? `${limitGb.toFixed(1)}GB` : `${limitMb}MB`;
      return {
        valid: false,
        error: isGuest
          ? `File too large (max ${limitLabel} for guests). Sign up for more.`
          : `File size exceeds ${limitLabel} limit.${userTier === 'free' ? ' Upgrade to Pro for larger uploads.' : ''}`
      };
    }

    return { valid: true };
  };

  // Core file processing logic — used by both handleFileSelect and preSelectedFile
  const processFile = async (file, { skipReplace = false } = {}) => {
    setError('');
    setSuccess('');

    const isGuest = userTier === 'guest' || userId === 'guest';

    const validation = validateFile(file);
    if (!validation.valid) {
      console.error('[DocumentUpload] Validation failed:', validation.error);
      setError(validation.error);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    console.log('[DocumentUpload] File validated, checking conversation:', conversationId, 'userId:', userId, 'userTier:', userTier);

    if (!isGuest && (!conversationId || !userId)) {
      const errorMsg = 'Missing conversation ID or user ID';
      console.error('[DocumentUpload]', errorMsg);
      setError(errorMsg);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (existingDocument && !skipReplace) {
      setPendingFile(file);
      setShowReplaceConfirm(true);
      return;
    }

    const fileName = file.name.toLowerCase();
    const isVcf = fileName.endsWith('.vcf.gz') || fileName.endsWith('.vcf');
    const isTsvOrCsv = fileName.endsWith('.tsv') || fileName.endsWith('.csv');
    if (isVcf || isTsvOrCsv) {
      setSelectedFile(file);
      let detectedFileType = '';
      if (isVcf) detectedFileType = 'VCF';
      else if (fileName.endsWith('.tsv')) detectedFileType = 'TSV';
      else if (fileName.endsWith('.csv')) detectedFileType = 'CSV';
      const nameWithoutExt = fileName.endsWith('.vcf.gz')
        ? file.name.substring(0, file.name.length - '.vcf.gz'.length)
        : file.name.substring(0, file.name.lastIndexOf('.'));
      setSampleMetadata(prev => ({
        ...prev,
        name: nameWithoutExt,
        sampleFileType: detectedFileType
      }));
      setValidationAttempted(false);
      setTouched({});
      setDetailsOpen(false);
      setError('');
      setGenomeDetection(null);
      setMetadataStep('sample');
      setShowInfoForm(true);
      runGenomeDetection(file);
    } else {
      console.log('[DocumentUpload] Starting upload (non-CSV/TSV/VCF file)...');
      await uploadFile(file);
    }
  };

  // Auto-process pre-selected file from dropdown
  useEffect(() => {
    if (preSelectedFile) {
      processFile(preSelectedFile);
    }
  }, [preSelectedFile]);

  /** Switching source clears the other mode's staged selection so neither can leak into submit. */
  const handleImportModeChange = (next) => {
    if (next === importMode) return;
    setImportMode(next);
    setError('');
    setSelectedFile(null);
    setImportUrlMeta(null);
    setFileUrl('');
    setUrlFilenameOverride('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      console.log('[DocumentUpload] No file selected');
      return;
    }
    await processFile(file);
  };

  // Helper function to store file in IndexedDB (for guests)
  const storeFileInIndexedDB = async (file, conversationId) => {
    return new Promise((resolve, reject) => {
      // First, read the file as ArrayBuffer
      const fileReader = new FileReader();
      fileReader.onerror = () => reject(fileReader.error);
      fileReader.onload = (e) => {
        // Now that we have the file data, open the database and store it
        const request = indexedDB.open('BioinfoChatbot_GuestFiles', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['files'], 'readwrite');
          const store = transaction.objectStore('files');

          const fileData = {
            id: `${conversationId}_${Date.now()}`,
            conversationId: conversationId,
            name: file.name,
            type: file.name.substring(file.name.lastIndexOf('.') + 1).toLowerCase(),
            size: file.size,
            data: e.target.result, // ArrayBuffer
            uploadedAt: new Date().toISOString()
          };

          const addRequest = store.put(fileData);
          addRequest.onsuccess = () => resolve(fileData);
          addRequest.onerror = () => reject(addRequest.error);

          // Keep transaction alive until operation completes
          transaction.oncomplete = () => {
            // Transaction completed successfully
          };
          transaction.onerror = () => reject(transaction.error);
        };

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('files')) {
            const objectStore = db.createObjectStore('files', { keyPath: 'id' });
            objectStore.createIndex('conversationId', 'conversationId', { unique: false });
          }
        };
      };

      // Start reading the file
      fileReader.readAsArrayBuffer(file);
    });
  };


  /** Required essentials still empty, in the words used on screen. */
  const missingEssentials = [
    !sampleMetadata.genome && 'genome',
    !sampleMetadata.sequencingType && 'sequencing type',
    !sampleMetadata.analysisType && 'analysis type',
  ].filter(Boolean);

  // Inline validation: a field shows its error after it was touched (list closed / input
  // blurred) or after a submit attempt, never while the user is still on their way to it.
  const touch = (field) => setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  const fieldError = (field, value, message) =>
    (validationAttempted || touched[field]) && !value ? message : null;

  const validateSampleMetadataBasics = () => {
    setValidationAttempted(true);
    if (missingEssentials.length > 0) return false;
    setError('');
    return true;
  };

  const handleMetadataContinue = () => {
    if (!validateSampleMetadataBasics()) return;
    setMetadataStep('analysis');
  };

  const isGermlineFlow = sampleMetadata.analysisType === 'Germline';
  const metadataTotalSteps = isGermlineFlow ? 3 : 2;
  const metadataStepIndex =
    metadataStep === 'phenotype' ? 3 : metadataStep === 'analysis' ? 2 : 1;
  // The last screen is the phenotype step for Germline, the details step otherwise.
  const isFinalMetadataStep = metadataStep === 'phenotype' || (metadataStep === 'analysis' && !isGermlineFlow);
  const wizardSteps = [
    { id: 'sample', label: 'Essentials' },
    { id: 'analysis', label: 'Clinical details', optional: true },
    // Until an analysis type is picked, show the Germline path: it is the one on offer today.
    ...(isGermlineFlow || !sampleMetadata.analysisType ? [{ id: 'phenotype', label: 'Phenotype', optional: true }] : []),
  ];
  const isTumorFlow =
    sampleMetadata.analysisType === 'Somatic' ||
    sampleMetadata.analysisType === 'Tumor-Normal Paired' ||
    sampleMetadata.analysisType === 'Tumor-Only';
  const detailsFilledCount =
    [
      sampleMetadata.sampleSex,
      sampleMetadata.sampleSource,
      ...(isGermlineFlow
        ? [sampleMetadata.sampleRole, sampleMetadata.affectedStatus, sampleMetadata.inheritanceModel]
        : []),
      ...(isTumorFlow ? [sampleMetadata.tumorType] : []),
    ].filter(hasValue).length + (isGermlineFlow ? countPedigreeFieldsFilled(sampleMetadata) : 0);
  /** Optional things left empty, listed once on the last step instead of a confirm dialog. */
  const notProvided = [
    !sampleMetadata.sampleSex && 'sample sex',
    !sampleMetadata.sampleSource && 'sample source',
    isGermlineFlow && !sampleMetadata.sampleRole && 'sample role',
    isGermlineFlow && !sampleMetadata.affectedStatus && 'affected status',
    isGermlineFlow && !sampleMetadata.inheritanceModel && 'inheritance model',
    isGermlineFlow && !sampleHasPhenotype(sampleMetadata) && !phenotypeDraft.trim() && 'phenotype',
  ].filter(Boolean);

  const handleInfoFormSubmit = async (e) => {
    e.preventDefault();

    // Step 1: Enter / primary action advances to analysis-type fields.
    if (metadataStep === 'sample') {
      handleMetadataContinue();
      return;
    }

    // Germline Step 2 → Step 3 (phenotype); do not upload yet.
    if (metadataStep === 'analysis' && sampleMetadata.analysisType === 'Germline') {
      setError('');
      setMetadataStep('phenotype');
      return;
    }

    // --- Edit mode: PATCH sample metadata ---
    if (editMode && conversationId) {
      setError('');
      setValidationAttempted(true);

      if (!validateSampleMetadataBasics()) return;

      setIsUploading(true);
      try {
        const result = await patchSampleMetadata(conversationId, {
          genome: sampleMetadata.genome,
          sequencingType: sampleMetadata.sequencingType,
          analysisType: sampleMetadata.analysisType,
          sampleName: sampleMetadata.name,
          projectName: sampleMetadata.project,
          patientSex: sampleMetadata.sampleSex,
          patientAge: initialMetadata?.patientAge || '',
          ...(sampleMetadata.analysisType === 'Germline'
            ? {
                sampleRole: sampleMetadata.sampleRole || '',
                affectedStatus: sampleMetadata.affectedStatus || '',
                inheritanceModel: sampleMetadata.inheritanceModel || '',
                ...pedigreeFieldsForSubmit(sampleMetadata),
                phenotype: sampleMetadata.phenotype || '',
                phenotype_mode: sampleMetadata.phenotype_mode || PHENOTYPE_MODE_NOTE,
                phenotype_findings: sampleMetadata.phenotype_findings || '',
                phenotype_disease: sampleMetadata.phenotype_disease || '',
                phenotype_note_clean: sampleMetadata.phenotype_note_clean || '',
                phenotype_run_mode: normalizePipelineRunMode(
                  sampleMetadata.pipeline_run_mode || sampleMetadata.phenotype_run_mode
                ),
                pipeline_run_mode: normalizePipelineRunMode(
                  sampleMetadata.pipeline_run_mode || sampleMetadata.phenotype_run_mode
                ),
                phenotype_hpo: sampleMetadata.phenotype_hpo || null,
                selected_panels: sampleMetadata.selected_panels || [],
                selected_panel_gene_list: sampleMetadata.selected_panel_gene_list || [],
                selected_panel_include_amber:
                  sampleMetadata.selected_panel_include_amber !== false,
              }
            : {
                phenotype: '',
                phenotype_mode: PHENOTYPE_MODE_NOTE,
                phenotype_findings: '',
                phenotype_disease: '',
                phenotype_note_clean: '',
                phenotype_run_mode: PIPELINE_RUN_MANUAL,
                pipeline_run_mode: PIPELINE_RUN_MANUAL,
                phenotype_hpo: null,
                selected_panels: [],
                selected_panel_gene_list: [],
                ...EMPTY_PEDIGREE_FIELDS,
              }),
          tumorType: (sampleMetadata.analysisType === 'Somatic' || sampleMetadata.analysisType === 'Tumor-Normal Paired' || sampleMetadata.analysisType === 'Tumor-Only') ? sampleMetadata.tumorType : '',
        });
        onEditSaved?.(result);
        setShowInfoForm(false);
        setMetadataStep('sample');
        setEditImpact(null);
      } catch (err) {
        setErrorState(err.message || 'Failed to update sample metadata');
        setErrorMeta({ status: err.status ?? null, code: err.code ?? null });
      } finally {
        setIsUploading(false);
      }
      return;
    }

    console.log('[DocumentUpload] Form submitted, selectedFile:', selectedFile, 'importUrlMeta:', importUrlMeta);

    if (importMode === 'url') {
      if (!importUrlMeta) {
        setError('URL preflight info missing. Please validate the URL again.');
        return;
      }
    } else if (!selectedFile) {
      setError('No file selected');
      return;
    }

    if (!validateSampleMetadataBasics()) return;

    // No "continue without optional fields?" confirm: what was left out is named in a quiet
    // line on the last step, and it can all be added later from Edit sample info.
    await startSubmittedUpload();
  };

  /**
   * Starts the upload with the metadata entered in the wizard. The dialog is NOT dismissed
   * here: while the transfer runs it is hidden (the page's loading modal takes over) and it
   * comes back with the reason if the request fails. Success closes everything through
   * onUploadSuccess, as before.
   */
  const startSubmittedUpload = async () => {
    const run = async () => {
      notifyUploadStarting(importMode === 'url' ? { name: importUrlMeta.file_name } : selectedFile);
      if (importMode === 'url') {
        await performUrlImport(sampleMetadata);
      } else {
        await uploadFile(selectedFile, sampleMetadata);
      }
    };
    lastSubmitRef.current = run;
    setShowInfoForm(true);
    await run();
  };

  const retryLastSubmit = async () => {
    setError('');
    if (editMode) {
      await handleInfoFormSubmit({ preventDefault: () => {} });
      return;
    }
    if (lastSubmitRef.current) await lastSubmitRef.current();
  };

  const handleInfoFormCancel = () => {
    if (editMode) {
      setShowInfoForm(false);
      setMetadataStep('sample');
      setEditImpact(null);
      setError('');
      onCancel?.();
      return;
    }
    setShowInfoForm(false);
    setMetadataStep('sample');
    setSelectedFile(null);
    setImportUrlMeta(null);
    setFileUrl('');
    setUrlFilenameOverride('');
    setShowUrlFilename(false);
    setUrlFieldFocused(false);
    setImportMode('file');
    setSampleMetadata({
      name: '',
      project: '',
      genome: '',
      sequencingType: '',
      sampleFileType: '',
      sampleSex: '',
      analysisType: '',
      sampleSource: '',
      sampleRole: '',
      affectedStatus: '',
      inheritanceModel: '',
      ...EMPTY_PEDIGREE_FIELDS,
      phenotype: '',
      phenotype_mode: PHENOTYPE_MODE_NOTE,
      phenotype_findings: '',
      phenotype_disease: '',
      phenotype_note_clean: '',
      phenotype_run_mode: PIPELINE_RUN_MANUAL,
      pipeline_run_mode: PIPELINE_RUN_MANUAL,
      phenotype_hpo: null,
      tumorType: ''
    });
    setShowCreateProject(false);
    setNewProjectName('');
    setValidationAttempted(false);
    setTouched({});
    setDetailsOpen(false);
    setError('');
    setGenomeDetection(null);
    setIsDetectingGenome(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    // Close the parent modal if file was pre-selected via dropdown
    if (onCancel) onCancel();
  };

  const uploadFile = async (file, userInfo = null) => {
    notifyUploadStarting(file);
    setError('');

    const isGuest = userTier === 'guest' || userId === 'guest';

    try {
      console.log('[DocumentUpload] Upload started for file:', file.name);

      console.log(
        `[DocumentUpload] Using backend API (S3)${isGuest ? ' — guest + X-Device-Id' : ''}`
      );

      let token = null;
      if (!isGuest) {
        try {
          token = await requiredIdToken();
        } catch {
          throw new Error('Authentication required. Please log in.');
        }
      }

      const handleUploadFailure = (status, responseText) => {
        let errorMsg = `Upload failed (${status})`;
        let errorCode = null;
        try {
          const errorData = JSON.parse(responseText);
          const detail = errorData.detail;
          if (detail && typeof detail === 'object') {
            const code = detail.code;
            errorCode = code || null;
            if (code === 'GUEST_LIMIT_REACHED' || code === 'GUEST_UPLOAD_LIMIT_REACHED' || code === 'FREE_TIER_LIMIT_REACHED') {
              errorMsg = detail.message || 'Upload limit reached. Please upgrade to continue.';
            } else if (
              code === 'GUEST_FILE_SIZE_EXCEEDED' ||
              code === 'FREE_TIER_FILE_SIZE_EXCEEDED' ||
              code === 'PRO_TIER_FILE_SIZE_EXCEEDED'
            ) {
              errorMsg = detail.message || 'File exceeds the allowed size for your plan.';
            } else {
              errorMsg = detail.message || JSON.stringify(detail);
            }
          } else if (typeof detail === 'string') {
            errorMsg = detail;
          }
        } catch {
          // keep default message
        }
        failUpload(errorMsg, { status, code: errorCode }, { reopenWizard: Boolean(userInfo) });
      };

      const sampleMetaPayload = userInfo
        ? {
          sampleMetadata: userInfo,
          experimentType: userInfo.sequencingType || '',
          phenotypeInfo: userInfo.phenotype || '',
        }
        : null;

      if (shouldUsePresignedUpload(file.size, uploadLimits)) {
        console.log('[DocumentUpload] Using Pro presigned S3 upload');
        const presign = await presignVariantUpload({
          conversationId,
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type || 'application/octet-stream',
        });

        await putFileToPresignedUrl({
          url: presign.url,
          method: presign.method,
          headers: presign.headers,
          file,
          onProgress: (progress) => {
            setUploadProgress(progress);
            onUploadProgressChange?.(progress);
          },
        });

        setUploadProgress(100);
        onUploadProgressChange?.(100);

        const response = await completeVariantUpload({
          conversationId,
          s3Key: presign.s3_key,
          fileName: file.name,
          sampleMetadata: sampleMetaPayload?.sampleMetadata,
          experimentType: sampleMetaPayload?.experimentType,
          phenotypeInfo: sampleMetaPayload?.phenotypeInfo,
        });
        await finishUploadSuccess(response, file.name);
        return;
      }

      const uploadUrl = buildApiUrl('/api/upload-variant-file');
      console.log('[DocumentUpload] Uploading to:', uploadUrl);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('conversation_id', conversationId);

      if (userInfo) {
        formData.append('experiment_type', userInfo.sequencingType || '');
        if (userInfo.phenotype) {
          formData.append('phenotype_info', userInfo.phenotype);
        }
        formData.append('sample_metadata', JSON.stringify(userInfo));
      }

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = (e.loaded / e.total) * 100;
          setUploadProgress(progress);
          onUploadProgressChange?.(progress);
        }
      });

      xhr.addEventListener('load', async () => {
        if (xhr.status === 200) {
          try {
            const response = JSON.parse(xhr.responseText);
            await finishUploadSuccess(response, file.name);
          } catch (error) {
            console.error('[DocumentUpload] Error parsing response:', error);
            failUpload('Upload succeeded but the response could not be read. Check your files, then retry if it is missing.', null, { reopenWizard: Boolean(userInfo) });
          }
        } else {
          handleUploadFailure(xhr.status, xhr.responseText);
        }
      });

      xhr.addEventListener('error', () => {
        failUpload('Upload failed: Network error', null, { reopenWizard: Boolean(userInfo) });
      });

      xhr.open('POST', uploadUrl);
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      xhr.setRequestHeader('X-Device-Id', getDeviceId());
      xhr.send(formData);

    } catch (error) {
      console.error('[DocumentUpload] Upload error:', error);
      failUpload(
        `Upload failed: ${error.message}`,
        { status: error.status ?? null, code: error.code ?? null },
        { reopenWizard: Boolean(userInfo) }
      );
    }
  };

  /** Shared success handler for both file upload and URL import. */
  const finishUploadSuccess = useCallback(async (response, displayName) => {
    console.log('[DocumentUpload] Upload response:', response);

    const documentData = {
      url: response.s3_url,
      name: response.file_name,
      type: response.file_type,
      size: response.file_size,
      uploadedAt: new Date().toISOString(),
      storageType: 's3',
      s3_key: response.s3_key,
      is_variant_file: response.is_variant_file,
      variant_count: response.variant_count,
      column_interpretation: response.column_interpretation || null,
      variant_metadata: response.variant_metadata || null,
      s3_line_count_status: response.s3_line_count_status || null,
      // Carry the metadata the user just submitted so "Edit Sample Information" is prefilled
      // before the conversation reloads from the backend (the upload response omits it).
      sample_metadata: response.sample_metadata || {
        ...sampleMetadata,
        sampleFileType: sampleMetadata?.sampleFileType || response.file_type || '',
      },
    };

    if (onUploadSuccess) {
      try {
        await onUploadSuccess(documentData);
      } catch (callbackError) {
        console.error('[DocumentUpload] Error in onUploadSuccess callback:', callbackError);
        failUpload(`Upload succeeded but failed to save metadata: ${callbackError.message}`, null, {
          reopenWizard: showInfoFormRef.current,
        });
        return;
      }
    }

    // The wizard stayed mounted (hidden) while the file transferred; close it now.
    setShowInfoForm(false);
    onDismissForUpload?.();

    setSuccess(
      `Document "${displayName}" uploaded successfully! ${response.is_variant_file ? `(${response.variant_count} variants)` : ''}`
    );
    setIsUploading(false);
    setUploadProgress(0);
    onUploadProgressChange?.(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => setSuccess(''), 5000);
  }, [onUploadSuccess, onUploadProgressChange, sampleMetadata, failUpload, onDismissForUpload]);

  /** Preflight a pasted URL: validate, get filename/size/genome hint, then open metadata form. */
  const handleUrlContinue = async () => {
    setError('');
    const url = fileUrl.trim();
    if (!url) {
      setError('Please enter a URL');
      return;
    }
    if (!isRecognizedImportUrl(url)) {
      setError('Enter a full URL starting with https://, or a Google Drive / Dropbox share link.');
      return;
    }

    setIsPreflighting(true);
    try {
      const isGuest = userTier === 'guest' || userId === 'guest';
      const result = await urlPreflight({
        fileUrl: url,
        fileName: urlFilenameOverride.trim() || undefined,
        conversationId: conversationId || 'guest-session',
        isGuest,
      });

      const fn = (result.file_name || '').toLowerCase();
      if (!isAllowedVariantFilename(result.file_name)) {
        setError('Invalid file type. Only .TSV, .CSV, .VCF, and .vcf.gz files are allowed.');
        setIsPreflighting(false);
        return;
      }

      if (result.content_length != null) {
        const maxSize = getMaxUploadBytes(result.file_name, uploadLimits);
        if (result.content_length > maxSize) {
          const limitMb = Math.round(maxSize / (1024 * 1024));
          const limitGb = maxSize / (1024 ** 3);
          const limitLabel = limitGb >= 1 ? `${limitGb.toFixed(1)}GB` : `${limitMb}MB`;
          setError(`This file is too large (${Math.round(result.content_length / (1024 * 1024))} MB). Maximum allowed for your plan: ${limitLabel}.`);
          setIsPreflighting(false);
          return;
        }
      }

      setImportUrlMeta(result);

      const nameWithoutExt = result.file_name.endsWith('.vcf.gz')
        ? result.file_name.substring(0, result.file_name.length - '.vcf.gz'.length)
        : result.file_name.includes('.') ? result.file_name.substring(0, result.file_name.lastIndexOf('.')) : result.file_name;

      let detectedFileType = '';
      if (fn.endsWith('.vcf.gz') || fn.endsWith('.vcf')) detectedFileType = 'VCF';
      else if (fn.endsWith('.tsv')) detectedFileType = 'TSV';
      else if (fn.endsWith('.csv')) detectedFileType = 'CSV';

      setSampleMetadata(prev => ({
        ...prev,
        name: nameWithoutExt || result.file_name,
        sampleFileType: detectedFileType,
        genome: result.genome_hint?.genome || '',
      }));
      setValidationAttempted(false);
      setError('');
      setMetadataStep('sample');
      setShowInfoForm(true);
    } catch (err) {
      setError(err.message || 'Failed to validate URL');
    } finally {
      setIsPreflighting(false);
    }
  };

  /** Perform the actual URL import after metadata form submit. */
  const performUrlImport = async (metadata) => {
    if (!importUrlMeta) {
      failUpload('URL preflight info missing. Please go back and validate the URL again.', null);
      return;
    }

    const isGuest = userTier === 'guest' || userId === 'guest';
    const displayName = importUrlMeta.file_name;

    try {
      const response = await uploadFromUrl({
        conversationId: conversationId || 'guest-session',
        fileUrl: importUrlMeta.file_url,
        fileName: importUrlMeta.file_name,
        sampleMetadata: metadata,
        experimentType: metadata.sequencingType || '',
        phenotypeInfo: metadata.phenotype || '',
        isGuest,
      });
      await finishUploadSuccess(response, displayName);
    } catch (err) {
      console.error('[DocumentUpload] URL import error:', err);
      failUpload(`Import failed: ${err.message}`, { status: err.status ?? null, code: err.code ?? null });
    }
  };

  const handleRemoveDocument = () => {
    setShowRemoveConfirm(true);
  };

  const confirmRemoveDocument = () => {
    setShowRemoveConfirm(false);
    if (onUploadSuccess) {
      onUploadSuccess(null); // Pass null to remove document
    }
  };

  // Compact mode for header button
  if (compact) {
    return (
      <div className="relative">
        <input
          ref={fileInputRef}
          type="file"
          accept=".tsv,.csv,.vcf,.vcf.gz,.gz,application/gzip"
          onChange={handleFileSelect}
          className="hidden"
          id="document-upload-compact"
          disabled={isUploading}
        />
        {existingDocument ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="wb-chip !h-8 gap-1.5 !bg-[hsl(var(--wb-card))] px-3 text-xs outline-none transition-colors hover:!border-[hsl(var(--brand-300))] hover:!bg-[hsl(var(--brand-50))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] disabled:opacity-50"
              title={existingDocument.name}
            >
              <FileText className="size-3.5" aria-hidden />
              <span className="max-w-[100px] truncate">{existingDocument.name}</span>
            </button>
            <button
              type="button"
              onClick={handleRemoveDocument}
              className={ICON_BTN_CLASS}
              aria-label="Remove document"
              title="Remove document"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        ) : (
          <label
            htmlFor="document-upload-compact"
            className={`wb-chip !h-8 cursor-pointer gap-1.5 !bg-[hsl(var(--wb-card))] px-3 text-xs transition-colors hover:!border-[hsl(var(--brand-300))] hover:!bg-[hsl(var(--brand-50))] ${
              isUploading ? 'cursor-not-allowed opacity-50' : ''
            }`}
          >
            {isUploading ? (
              <>
                <span className="wb-spin-inline" aria-hidden />
                <span className="max-w-[120px] truncate tabular-nums">
                  {uploadProgress > 0 && uploadProgress < 100
                    ? `${Math.round(uploadProgress)}%`
                    : 'Processing'}
                </span>
              </>
            ) : (
              <>
                <Upload className="size-3.5" aria-hidden />
                <span>Upload</span>
              </>
            )}
          </label>
        )}

        {/* Error/Success messages for compact mode */}
        {(error || success) && (
          <div
            role={error ? 'alert' : 'status'}
            className={`wb-pop absolute right-0 top-full z-50 mt-1 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs ${
              error
                ? 'border-[var(--error)]/40 bg-[var(--error-soft)] text-[var(--error)]'
                : 'border-[var(--success)]/40 bg-[var(--success-soft)] text-[var(--success)]'
            }`}
          >
            {error || success}
          </div>
        )}

      </div>
    );
  }

  // Full mode. `wb-scope` makes the shared Button/Badge pills here too (this panel sits inside the
  // page's own card frame, not a Dialog); the transparent background keeps that frame's surface.
  return (
    <div className="wb-scope w-full" style={{ backgroundColor: 'transparent' }}>
      {/* Hide upload UI when form is showing or file was pre-selected */}
      {!showInfoForm && !preSelectedFile && (
        <>
          {!compact && !existingDocument && (
            <div className="mb-4">
              <h3 className="text-base font-semibold text-foreground">
                Add a variants file
              </h3>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                VCF, TSV or CSV with variant calls. Annotated or not.
              </p>
            </div>
          )}

          {/* Source of the file: the kind of file was already chosen in the upload menu */}
          {!compact && !existingDocument && userTier !== 'guest' && userId !== 'guest' && (
            <SegmentedPill
              className="mb-3"
              ariaLabel="Where the file is"
              value={importMode}
              onChange={handleImportModeChange}
              options={[
                { value: 'file', label: 'From computer' },
                { value: 'url', label: 'From URL' },
              ]}
            />
          )}

          {/* Pick a local file: click or drag. Drops route through the same processFile
              path as the hidden input, so validation and genome detection are identical. */}
          {importMode === 'file' && !compact && !existingDocument && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".tsv,.csv,.vcf,.vcf.gz,.gz,application/gzip"
                onChange={handleFileSelect}
                className="hidden"
                id="document-upload-full"
                disabled={isUploading}
              />
              <DropZone
                htmlFor="document-upload-full"
                dragOver={isDragOver}
                disabled={isUploading}
                busy={isUploading}
                formats={['.vcf', '.vcf.gz', '.tsv', '.csv']}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!isUploading) setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (isUploading) return;
                  const file = e.dataTransfer.files?.[0];
                  if (file) processFile(file);
                }}
              />
            </div>
          )}

          {/* Import from a link: public URL / Drive / Dropbox */}
          {importMode === 'url' && !compact && (
            <div>
              <Field
                label="Link to the file"
                htmlFor="document-upload-url"
                error={error || null}
                helper={
                  <>
                    Links must be shared as <span className="text-foreground">&ldquo;Anyone with the link.&rdquo;</span>
                  </>
                }
              >
                <div className="relative">
                  <input
                    id="document-upload-url"
                    type="url"
                    inputMode="url"
                    value={fileUrl}
                    onChange={(e) => setFileUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/uefaebf/view?usp=sharing"
                    autoFocus
                    aria-invalid={error ? true : undefined}
                    className={cn(TEXT_INPUT_CLASS, 'pr-11', error && 'border-[var(--error)]')}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleUrlContinue(); }}
                  />
                  {fileUrl && (
                    <button
                      type="button"
                      onClick={() => setFileUrl('')}
                      aria-label="Clear URL"
                      className="absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--brand-100))] hover:text-[hsl(var(--brand-700))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)]"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              </Field>

              {/* Optional filename: revealed on request */}
              <div className="mt-3">
                {showUrlFilename || urlFilenameOverride ? null : (
                  <button
                    type="button"
                    onClick={() => setShowUrlFilename(true)}
                    className="wb-chip !h-7 gap-1 text-muted-foreground outline-none transition-colors hover:!border-[hsl(var(--brand-300))] hover:!bg-[hsl(var(--brand-50))] hover:text-[hsl(var(--brand-700))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)]"
                  >
                    <Plus className="size-3" aria-hidden />
                    Set a filename
                  </button>
                )}
                <Collapse open={Boolean(showUrlFilename || urlFilenameOverride)}>
                  <div className="px-px pb-px">
                    <Field label="Filename" htmlFor="document-upload-url-name" helper="Only needed when the link does not end in the file name.">
                      <input
                        id="document-upload-url-name"
                        type="text"
                        value={urlFilenameOverride}
                        onChange={(e) => setUrlFilenameOverride(e.target.value)}
                        placeholder="sample.vcf.gz"
                        autoFocus={showUrlFilename && !urlFilenameOverride}
                        className={TEXT_INPUT_CLASS}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleUrlContinue(); }}
                      />
                    </Field>
                  </div>
                </Collapse>
              </div>

              {/* Primary action */}
              <div className="mt-4 flex justify-end">
                <StateButton
                  state={isPreflighting ? 'running' : 'idle'}
                  labels={{ idle: 'Continue', running: 'Validating link' }}
                  icon={ArrowRight}
                  onClick={handleUrlContinue}
                  disabled={isPreflighting || !fileUrl.trim()}
                  size="lg"
                />
              </div>
            </div>
          )}

          {/* Existing Document Display */}
          {existingDocument && !isUploading && (
            <div className="wb-card mb-3 flex items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-700))]">
                  <FileText className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-foreground">
                    {existingDocument.name}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="wb-chip !h-5 text-[11px]" data-tone="brand">{String(existingDocument.type || '').toUpperCase()}</span>
                    <span className="tabular-nums">{formatFileSize(existingDocument.size)}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRemoveDocument}
                className={ICON_BTN_CLASS}
                aria-label="Remove document"
                title="Remove document"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          )}

          {/* Replace Document Button */}
          {existingDocument && !isUploading && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              <Upload className="size-4" aria-hidden />
              Replace file
            </Button>
          )}

          {/* Hidden file input for replace */}
          {existingDocument && (
            <input
              ref={fileInputRef}
              type="file"
              accept=".tsv,.csv,.vcf,.vcf.gz,.gz,application/gzip"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isUploading}
            />
          )}

          {/* Error Message - Only show upload-related errors, not form validation errors.
          URL mode renders its own inline error under the field. */}
          {error && !showInfoForm && importMode !== 'url' && (
            <UploadErrorBanner
              className="mt-3"
              error={errorMeta ? { message: error, ...errorMeta } : error}
              devices={limits?.devices}
              onDismiss={() => setError('')}
            />
          )}

          {/* Success Message */}
          {success && (
            <div className="wb-rise mt-3 flex items-start gap-2 rounded-2xl border border-[var(--success)]/40 bg-[var(--success-soft)] p-3" role="status">
              <CheckCircle className="mt-0.5 size-4 shrink-0 text-[var(--success)]" aria-hidden />
              <p className="text-[13px] text-foreground">{success}</p>
            </div>
          )}

        </>
      )}

      {/* Sample metadata wizard: a focused dialog with three steps.
        *   1 Essentials (name, genome, sequencing, analysis type, run mode)
        *   2 Clinical details, all optional and collapsed behind one disclosure
        *   3 Phenotype, optional (Germline only)
        * Outside click / Esc ask before discarding; Cancel stays immediate. The dialog is
        * hidden (not unmounted) while a file transfers, and returns with the reason on failure. */}
      <Dialog
        open={showInfoForm && !(isUploading && !editMode)}
        onOpenChange={(open, details) => {
          if (open) return;
          if (details?.reason === 'outside-press' || details?.reason === 'escape-key') {
            setShowDiscardConfirm(true);
            return;
          }
          handleInfoFormCancel();
        }}
      >
        {/* Pinned to the top rather than centred: the steps grow as results load, and a
          * centred dialog jumped up each time it did. Full-height sheet on phones. */}
        <DialogContent
          showCloseButton={false}
          initialFocus={() => document.getElementById('meta-name') || true}
          className={WIZARD_DIALOG_CLASS}
        >
          <DialogDescription className="sr-only">
            {editMode ? 'Update metadata for this variant file.' : 'Provide details about your variant file for better analysis.'}
          </DialogDescription>
          <div className="flex-shrink-0 px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
            <div className="flex items-start justify-between gap-3">
              <DialogTitle id="sample-metadata-title" className="min-w-0 text-base font-semibold leading-snug text-foreground">
                {editMode ? 'Edit sample information' : 'Add sample details'}
              </DialogTitle>
              <button
                type="button"
                onClick={handleInfoFormCancel}
                disabled={isUploading}
                aria-label="Close"
                className={cn(ICON_BTN_CLASS, '-mr-1')}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {!editMode && (selectedFile || importUrlMeta) && (
              <FileChip
                className="mt-2.5"
                name={selectedFile ? selectedFile.name : importUrlMeta?.file_name}
                size={
                  selectedFile
                    ? formatFileSize(selectedFile.size)
                    : importUrlMeta?.content_length != null
                      ? formatFileSize(importUrlMeta.content_length)
                      : null
                }
                kind={sampleMetadata.sampleFileType || null}
              />
            )}
            <WizardStepper steps={wizardSteps} current={metadataStepIndex - 1} className="mt-4" />
            {error && showInfoForm && (
              <UploadErrorBanner
                className="mt-4"
                error={errorMeta ? { message: error, ...errorMeta } : error}
                devices={limits?.devices}
                onRetry={retryLastSubmit}
                onDismiss={() => setError('')}
                retrying={isUploading}
              />
            )}
          </div>

          <form onSubmit={handleInfoFormSubmit} className="flex min-h-0 flex-1 flex-col">
            <div data-wizard-scroll className="flex-1 overflow-x-hidden overflow-y-auto px-5 pb-4 pt-1 sm:px-7">
             <WizardPanes step={metadataStep} index={metadataStepIndex} className="space-y-5">
              {metadataStep === 'sample' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
                    <Field label="Sample name" htmlFor="meta-name" className="sm:col-span-2">
                      <input
                        id="meta-name"
                        type="text"
                        value={sampleMetadata.name}
                        onChange={(e) => setSampleMetadata({ ...sampleMetadata, name: e.target.value })}
                        className={TEXT_INPUT_CLASS}
                        placeholder="Enter sample name"
                      />
                    </Field>

                    <Field
                      label="Genome build"
                      required
                      htmlFor="meta-genome"
                      error={fieldError('genome', sampleMetadata.genome, 'Choose a genome build.')}
                      helper={
                        isDetectingGenome && !editMode
                          ? 'Detecting the genome build from the file…'
                          : !editMode && genomeDetection?.detected_build && !genomeDetection._userOverride
                            ? `Auto-detected ${genomeDetection.detected_build.toUpperCase()}${genomeDetection.confidence !== 'high' ? ', please verify' : ''}.`
                            : null
                      }
                    >
                      <CustomSelect
                        id="meta-genome"
                        value={sampleMetadata.genome}
                        onChange={(val) => {
                          setSampleMetadata({ ...sampleMetadata, genome: val });
                          // Clear auto-detection badge when user manually picks
                          if (genomeDetection) setGenomeDetection((prev) => prev ? { ...prev, _userOverride: true } : prev);
                        }}
                        onTouched={() => touch('genome')}
                        placeholder={isDetectingGenome ? 'Detecting…' : 'Choose one'}
                        options={[
                          { value: 'hg19 (GRCh37)', label: 'hg19 (GRCh37)' },
                          { value: 'hg38 (GRCh38)', label: 'hg38 (GRCh38)' },
                        ]}
                        error={Boolean(fieldError('genome', sampleMetadata.genome, 'x'))}
                      />
                    </Field>

                    <Field
                      label="Sequencing type"
                      required
                      htmlFor="meta-seq"
                      error={fieldError('sequencingType', sampleMetadata.sequencingType, 'Choose a sequencing type.')}
                    >
                      <CustomSelect
                        id="meta-seq"
                        value={sampleMetadata.sequencingType}
                        onChange={(val) => setSampleMetadata({ ...sampleMetadata, sequencingType: val })}
                        onTouched={() => touch('sequencingType')}
                        placeholder="Choose one"
                        options={[
                          { value: 'Whole Exome (WES)', label: 'Whole Exome (WES)' },
                          { value: 'Whole Genome (WGS)', label: 'Whole Genome (WGS)' },
                          { value: 'Targeted', label: 'Targeted' },
                        ]}
                        error={Boolean(fieldError('sequencingType', sampleMetadata.sequencingType, 'x'))}
                      />
                    </Field>

                    <Field
                      label="Analysis type"
                      required
                      htmlFor="meta-analysis"
                      error={fieldError('analysisType', sampleMetadata.analysisType, 'Choose an analysis type.')}
                      className="sm:col-span-2"
                    >
                      <CustomSelect
                        id="meta-analysis"
                        value={sampleMetadata.analysisType}
                        onChange={(val) => setSampleMetadata({ ...sampleMetadata, analysisType: val })}
                        onTouched={() => touch('analysisType')}
                        placeholder="Choose one"
                        options={[
                          { value: 'Germline', label: 'Germline' },
                          { value: 'Somatic', label: 'Somatic', disabled: true, disabledReason: 'Somatic analysis is coming soon.' },
                          { value: 'Tumor-Normal Paired', label: 'Tumor-Normal Paired', disabled: true, disabledReason: 'Tumor-Normal Paired analysis is coming soon.' },
                          { value: 'Tumor-Only', label: 'Tumor-Only', disabled: true, disabledReason: 'Tumor-Only analysis is coming soon.' },
                          { value: 'IVF', label: 'IVF', disabled: true, disabledReason: 'IVF analysis is coming soon.' },
                          { value: 'PGT', label: 'PGT', disabled: true, disabledReason: 'PGT analysis is coming soon.' },
                          { value: 'Unknown', label: 'Unknown', disabled: true, disabledReason: 'Unknown analysis type is not supported yet.' },
                        ]}
                        error={Boolean(fieldError('analysisType', sampleMetadata.analysisType, 'x'))}
                      />
                    </Field>
                  </div>

                  <PipelineRunModeToggle
                    value={sampleMetadata.pipeline_run_mode || sampleMetadata.phenotype_run_mode}
                    onChange={(mode) =>
                      setSampleMetadata((prev) => applyPipelineRunModeChange(prev, mode))
                    }
                  />
                </div>
              )}

              {metadataStep === 'analysis' && (
                <div className="space-y-4">
                  <p className="text-[13px] text-muted-foreground">
                    Nothing here is required. Clinical context sharpens prioritisation, and you can add it
                    later from Edit sample info.
                  </p>
                  <Disclosure
                    label="Add clinical details (optional)"
                    summary={detailsFilledCount > 0 ? `${detailsFilledCount} added` : null}
                    open={detailsOpen}
                    onToggle={() => setDetailsOpen((v) => !v)}
                  >
                    <FieldGroup title="Individual">
                      <Field label="Sample sex" htmlFor="meta-sex">
                        <CustomSelect
                          id="meta-sex"
                          value={sampleMetadata.sampleSex}
                          onChange={(val) => setSampleMetadata({ ...sampleMetadata, sampleSex: val })}
                          placeholder="Choose one"
                          options={[
                            { value: 'Male', label: 'Male' },
                            { value: 'Female', label: 'Female' },
                            { value: 'Unknown', label: 'Unknown' },
                          ]}
                        />
                      </Field>
                      <Field label="Sample source" htmlFor="meta-source">
                        <CustomSelect
                          id="meta-source"
                          value={sampleMetadata.sampleSource}
                          onChange={(val) => setSampleMetadata({ ...sampleMetadata, sampleSource: val })}
                          placeholder="Choose one"
                          options={[
                            { value: 'Tissue', label: 'Tissue' },
                            { value: 'Blood', label: 'Blood' },
                            { value: 'FFPE', label: 'FFPE' },
                            { value: 'Other', label: 'Other' },
                          ]}
                        />
                      </Field>
                      {isGermlineFlow && (
                        <>
                          <Field label="Sample role" htmlFor="meta-role">
                            <CustomSelect
                              id="meta-role"
                              value={sampleMetadata.sampleRole}
                              onChange={(val) => setSampleMetadata({ ...sampleMetadata, sampleRole: val })}
                              placeholder="Choose one"
                              options={[
                                { value: 'proband', label: 'Proband' },
                                { value: 'mother', label: 'Mother' },
                                { value: 'father', label: 'Father' },
                                { value: 'sibling', label: 'Sibling' },
                                { value: 'other', label: 'Other' },
                              ]}
                            />
                          </Field>
                          <Field label="Affected status" htmlFor="meta-affected">
                            <CustomSelect
                              id="meta-affected"
                              value={sampleMetadata.affectedStatus}
                              onChange={(val) => setSampleMetadata({ ...sampleMetadata, affectedStatus: val })}
                              placeholder="Choose one"
                              options={[
                                { value: 'affected', label: 'Affected' },
                                { value: 'unaffected', label: 'Unaffected' },
                              ]}
                            />
                          </Field>
                          <Field label="Inheritance model" htmlFor="meta-inheritance">
                            <CustomSelect
                              id="meta-inheritance"
                              value={sampleMetadata.inheritanceModel}
                              onChange={(val) => setSampleMetadata({ ...sampleMetadata, inheritanceModel: val })}
                              placeholder="Choose one"
                              options={[
                                { value: 'Autosomal Dominant', label: 'Autosomal Dominant' },
                                { value: 'Autosomal Recessive', label: 'Autosomal Recessive' },
                                { value: 'X-linked', label: 'X-linked' },
                                { value: 'De novo', label: 'De novo' },
                                { value: 'Unknown', label: 'Unknown' },
                              ]}
                            />
                          </Field>
                        </>
                      )}
                      {isTumorFlow && (
                        <Field label="Tumor type" htmlFor="meta-tumor" className="sm:col-span-2">
                          <input
                            id="meta-tumor"
                            type="text"
                            value={sampleMetadata.tumorType}
                            onChange={(e) => setSampleMetadata({ ...sampleMetadata, tumorType: e.target.value })}
                            placeholder="e.g. Breast cancer, Lung adenocarcinoma"
                            className={TEXT_INPUT_CLASS}
                          />
                        </Field>
                      )}
                    </FieldGroup>

                    {isGermlineFlow && (
                      <GermlinePedigreeFields
                        value={sampleMetadata}
                        onChange={(fields) => setSampleMetadata((prev) => ({ ...prev, ...fields }))}
                        Select={CustomSelect}
                      />
                    )}
                  </Disclosure>
                  {detailsFilledCount === 0 && !detailsOpen && (
                    <QuietSummary>No clinical details added.</QuietSummary>
                  )}
                </div>
              )}

              {metadataStep === 'phenotype' && sampleMetadata.analysisType === 'Germline' && (
                <div>
                  <PhenotypeInputPanel
                    hideLabel
                    onDraftChange={setPhenotypeDraft}
                    value={{
                      phenotype_mode: sampleMetadata.phenotype_mode || PHENOTYPE_MODE_NOTE,
                      phenotype_findings: sampleMetadata.phenotype_findings || '',
                      phenotype_disease: sampleMetadata.phenotype_disease || '',
                      phenotype_note_clean: sampleMetadata.phenotype_note_clean || '',
                      phenotype_run_mode: normalizePipelineRunMode(
                        sampleMetadata.pipeline_run_mode || sampleMetadata.phenotype_run_mode
                      ),
                      pipeline_run_mode: normalizePipelineRunMode(
                        sampleMetadata.pipeline_run_mode || sampleMetadata.phenotype_run_mode
                      ),
                      phenotype: sampleMetadata.phenotype || '',
                      phenotype_hpo: sampleMetadata.phenotype_hpo,
                      selected_panels: sampleMetadata.selected_panels,
                      selected_panel_gene_list: sampleMetadata.selected_panel_gene_list,
                      selected_panel_include_amber: sampleMetadata.selected_panel_include_amber,
                    }}
                    onChange={(fields) =>
                      setSampleMetadata((prev) => {
                        const mode = normalizePipelineRunMode(
                          prev.pipeline_run_mode ||
                            prev.phenotype_run_mode ||
                            fields.pipeline_run_mode ||
                            fields.phenotype_run_mode
                        );
                        return {
                          ...prev,
                          ...fields,
                          pipeline_run_mode: mode,
                          phenotype_run_mode: mode,
                        };
                      })
                    }
                  />
                </div>
              )}
             </WizardPanes>
            </div>

            {/* Footer: pinned. What is missing / left out is plain text, not a tooltip or a confirm. */}
            <div className="flex-shrink-0 space-y-2.5 border-t border-[hsl(var(--wb-line))] px-5 py-3 sm:px-7 sm:py-4">
              {metadataStep === 'sample' && missingEssentials.length > 0 && (
                <MissingHint items={missingEssentials} />
              )}
              {isFinalMetadataStep && !editMode && notProvided.length > 0 && (
                <QuietSummary>
                  Not provided: {notProvided.join(', ')}. You can add these later from Edit sample info.
                </QuietSummary>
              )}
              {/* Phones: the primary action first and full width, then Cancel, then Back. */}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-2">
                  {metadataStep === 'analysis' || metadataStep === 'phenotype' ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="lg"
                      onClick={() => {
                        setError('');
                        setMetadataStep(metadataStep === 'phenotype' ? 'analysis' : 'sample');
                      }}
                      disabled={isUploading}
                      className="max-sm:h-11 max-sm:w-full"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden />
                      Back
                    </Button>
                  ) : null}
                </div>
                <div className="flex gap-2 max-sm:flex-col-reverse">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={handleInfoFormCancel}
                    disabled={isUploading}
                    className="max-sm:h-11 max-sm:w-full"
                  >
                    Cancel
                  </Button>
                  {!isFinalMetadataStep ? (
                    <Button
                      type="submit"
                      size="lg"
                      disabled={isUploading || (metadataStep === 'sample' && missingEssentials.length > 0)}
                      title={
                        metadataStep === 'sample' && missingEssentials.length > 0
                          ? `Still needed: ${missingEssentials.join(', ')}`
                          : undefined
                      }
                      className="max-sm:h-11 max-sm:w-full"
                    >
                      Continue
                      <ArrowRight className="size-4" aria-hidden />
                    </Button>
                  ) : (
                    <StateButton
                      type="submit"
                      size="lg"
                      state={isUploading ? 'running' : 'idle'}
                      icon={editMode ? Check : importMode === 'url' ? Download : Upload}
                      disabled={isUploading}
                      className="max-sm:h-11 max-sm:w-full"
                      labels={{
                        running: editMode ? 'Saving' : 'Uploading',
                        idle: editMode
                          ? 'Save changes'
                          : metadataStep === 'phenotype' &&
                              sampleMetadata.analysisType === 'Germline' &&
                              !phenotypeDraft.trim() &&
                              !(sampleMetadata.phenotype || '').trim()
                            ? importMode === 'url' ? 'Skip phenotype and import' : 'Skip phenotype and upload'
                            : importMode === 'url' ? 'Import file' : 'Upload file',
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove Document Confirmation Modal: destructive, so the confirm is a press-and-hold. */}
      <AlertDialog open={showRemoveConfirm} onOpenChange={(open) => { if (!open) setShowRemoveConfirm(false); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove 1 file from this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              {existingDocument?.name ? `${existingDocument.name} will be removed from the conversation.` : 'The file will be removed from the conversation.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep file</AlertDialogCancel>
            <HoldButton icon={Trash2} doneLabel="Removed" onConfirm={confirmRemoveDocument}>
              Hold to remove file
            </HoldButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDiscardConfirm} onOpenChange={(open) => { if (!open) setShowDiscardConfirm(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{editMode ? 'Discard your edits?' : 'Discard this upload?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {editMode
                ? 'Changes to the sample information will not be saved.'
                : 'The file and the details you entered will be cleared.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <HoldButton
              icon={Trash2}
              holdMs={900}
              doneLabel="Discarded"
              onConfirm={() => {
                setShowDiscardConfirm(false);
                handleInfoFormCancel();
              }}
            >
              {editMode ? 'Hold to discard edits' : 'Hold to discard upload'}
            </HoldButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Replace Document Confirmation Modal */}
      <AlertDialog
        open={showReplaceConfirm && !!existingDocument}
        onOpenChange={(open) => {
          if (!open) {
            setShowReplaceConfirm(false);
            setPendingFile(null);
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
            // A file handed in by the parent (guest upload button) hides this card's own UI,
            // so declining the replace has to close the whole modal — otherwise an empty
            // frame is left open.
            if (preSelectedFile) onCancel?.();
          }
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Replace {existingDocument?.name || 'the current file'} with {pendingFile?.name || 'the new file'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This conversation already has a file ({existingDocument?.name}). The new file takes its place.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current file</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setShowReplaceConfirm(false);
                const file = pendingFile;
                setPendingFile(null);
                if (!file) return;

                // Same routing as a fresh pick: VCF/TSV/CSV go through the metadata wizard
                // (a bare upload here would skip the sample details entirely).
                const isGuest = userTier === 'guest' || userId === 'guest';
                if (isGuest) {
                  await uploadFile(file);
                } else {
                  await processFile(file, { skipReplace: true });
                }
              }}
            >
              Replace file
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DocumentUpload;

