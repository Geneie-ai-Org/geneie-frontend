import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, FileText, X, CheckCircle, AlertCircle, Loader2, Link2, Info, Plus } from 'lucide-react';
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
import { PillToggle } from '@/components/ui/pill-toggle';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

// Custom select — thin wrapper over shadcn Select (Base UI handles portal/positioning)
const CustomSelect = ({ value, onChange, placeholder, options, error, className = '' }) => {
  const items = Object.fromEntries((options || []).map((o) => [o.value, o.label]));
  return (
    <Select value={value || ''} onValueChange={onChange} items={items}>
      <SelectTrigger
        className={cn(
          // Override the base-nova default (data-[size=default]:h-8) with an explicit h-10.
          'w-full !h-10 px-3 text-sm rounded-lg bg-[var(--bg-input)] text-[var(--text-primary)] data-placeholder:text-[var(--text-tertiary)]',
          className
        )}
        style={{ borderColor: error ? 'var(--error)' : 'var(--border-default)' }}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="p-1.5">
        {(options || []).map((opt) =>
          opt.disabled ? (
            <div
              key={opt.value}
              role="option"
              aria-disabled="true"
              aria-selected="false"
              className="relative flex w-full cursor-not-allowed items-center gap-2 rounded-md py-2 pr-8 pl-2.5 text-sm select-none"
              style={{ color: 'var(--text-tertiary)' }}
              onPointerDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toast.info(opt.disabledReason);
              }}
            >
              {opt.label}
            </div>
          ) : (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          )
        )}
      </SelectContent>
    </Select>
  );
};

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
}) => {
  const { limits } = useAuth();
  const isGuestUser = userTier === 'guest' || userId === 'guest';
  const uploadLimits = isGuestUser ? guestLimits() : limits;
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showInfoForm, setShowInfoForm] = useState(false);
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
    phenotype: '', // Free text (only for Germline)
    tumorType: '' // Free text (only for Somatic/Tumor-Normal Paired/Tumor-Only)
  });
  const [existingProjects, setExistingProjects] = useState([]); // Will be fetched from backend later
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [showOptionalFieldsWarning, setShowOptionalFieldsWarning] = useState(false);
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
        phenotype: initialMetadata.phenotype || '',
        tumorType: initialMetadata.tumorType || '',
      });
      setEditImpact(null);
      setError('');
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

  const dismissUploadUiForBackgroundUpload = useCallback(() => {
    setShowInfoForm(false);
    setError('');
    if (onDismissForUpload) onDismissForUpload();
    else if (onCancel) onCancel();
  }, [onDismissForUpload, onCancel]);

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
        const auth = getAuth();
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

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
  const processFile = async (file) => {
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

    if (existingDocument) {
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
      setError('');
      setGenomeDetection(null);
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


  const handleInfoFormSubmit = async (e) => {
    e.preventDefault();

    // --- Edit mode: PATCH sample metadata ---
    if (editMode && conversationId) {
      setError('');
      setValidationAttempted(true);

      if (!sampleMetadata.genome) { setError('Please select a Genome (required)'); return; }
      if (!sampleMetadata.sequencingType) { setError('Please select a Sequencing Type (required)'); return; }
      if (!sampleMetadata.analysisType) { setError('Please select an Analysis Type (required)'); return; }
      if (sampleMetadata.analysisType === 'Germline' && !sampleMetadata.phenotype?.trim()) {
        setError('Phenotype is required for Germline analysis (needed for Exomiser prioritization).');
        return;
      }

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
          phenotype: sampleMetadata.analysisType === 'Germline' ? sampleMetadata.phenotype : '',
          tumorType: (sampleMetadata.analysisType === 'Somatic' || sampleMetadata.analysisType === 'Tumor-Normal Paired' || sampleMetadata.analysisType === 'Tumor-Only') ? sampleMetadata.tumorType : '',
        });
        onEditSaved?.(result);
        setShowInfoForm(false);
        setEditImpact(null);
      } catch (err) {
        setError(err.message || 'Failed to update sample metadata');
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

    // Mark validation as attempted
    setValidationAttempted(true);

    // Validate mandatory fields
    if (!sampleMetadata.genome) {
      setError('Please select a Genome (required)');
      return;
    }
    if (!sampleMetadata.sequencingType) {
      setError('Please select a Sequencing Type (required)');
      return;
    }
    if (!sampleMetadata.analysisType) {
      setError('Please select an Analysis Type (required)');
      return;
    }
    if (sampleMetadata.analysisType === 'Germline' && !sampleMetadata.phenotype?.trim()) {
      setError('Phenotype is required for Germline analysis (needed for Exomiser prioritization).');
      return;
    }

    // Check for optional fields that are empty - show encouragement but allow proceeding
    const emptyOptionalFields = [];
    if (!sampleMetadata.sampleSex) emptyOptionalFields.push('Sample Sex');
    if (!sampleMetadata.sampleSource) emptyOptionalFields.push('Sample Source');
    if (sampleMetadata.analysisType === 'Germline') {
      if (!sampleMetadata.sampleRole) emptyOptionalFields.push('Sample Role');
      if (!sampleMetadata.affectedStatus) emptyOptionalFields.push('Affected Status');
      if (!sampleMetadata.inheritanceModel) emptyOptionalFields.push('Inheritance Model');
    }

    // If optional fields are empty, show custom warning modal
    if (emptyOptionalFields.length > 0) {
      setShowOptionalFieldsWarning(true);
      return; // Wait for user decision
    }

    // Notify parent first so DocumentUpload stays mounted while upload runs.
    notifyUploadStarting(importMode === 'url' ? { name: importUrlMeta.file_name } : selectedFile);
    dismissUploadUiForBackgroundUpload();
    if (importMode === 'url') {
      await performUrlImport(sampleMetadata);
    } else {
      await uploadFile(selectedFile, sampleMetadata);
    }
  };

  const handleInfoFormCancel = () => {
    if (editMode) {
      setShowInfoForm(false);
      setEditImpact(null);
      setError('');
      onCancel?.();
      return;
    }
    setShowInfoForm(false);
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
      phenotype: '',
      tumorType: ''
    });
    setShowCreateProject(false);
    setNewProjectName('');
    setValidationAttempted(false);
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
        try {
          const errorData = JSON.parse(responseText);
          const detail = errorData.detail;
          if (detail && typeof detail === 'object') {
            const code = detail.code;
            if (code === 'GUEST_LIMIT_REACHED' || code === 'FREE_TIER_LIMIT_REACHED') {
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
        setError(errorMsg);
        setIsUploading(false);
        onUploadProgressChange?.(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
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
            setError('Upload succeeded but failed to process response');
            setIsUploading(false);
          }
        } else {
          handleUploadFailure(xhr.status, xhr.responseText);
        }
      });

      xhr.addEventListener('error', () => {
        setError('Upload failed: Network error');
        setIsUploading(false);
        onUploadProgressChange?.(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      });

      xhr.open('POST', uploadUrl);
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      xhr.setRequestHeader('X-Device-Id', getDeviceId());
      xhr.send(formData);

    } catch (error) {
      console.error('[DocumentUpload] Upload error:', error);
      setError(`Upload failed: ${error.message}`);
      setIsUploading(false);
      onUploadProgressChange?.(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
        setError(`Upload succeeded but failed to save metadata: ${callbackError.message}`);
        return;
      }
    }

    setSuccess(
      `Document "${displayName}" uploaded successfully! ${response.is_variant_file ? `(${response.variant_count} variants)` : ''}`
    );
    setIsUploading(false);
    setUploadProgress(0);
    onUploadProgressChange?.(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => setSuccess(''), 5000);
  }, [onUploadSuccess, onUploadProgressChange, sampleMetadata]);

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
      setError('URL preflight info missing. Please go back and validate the URL again.');
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
      setError(`Import failed: ${err.message}`);
      setIsUploading(false);
      onUploadProgressChange?.(null);
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
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="text-xs px-2 py-1 border rounded transition-colors flex items-center gap-1"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--accent-teal)', color: 'var(--accent-teal)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-surface)'; }}
              title={existingDocument.name}
            >
              <FileText className="w-3 h-3" />
              <span className="truncate max-w-[100px]">{existingDocument.name}</span>
            </button>
            <button
              onClick={handleRemoveDocument}
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--error)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--error-soft)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              aria-label="Remove document"
              title="Remove document"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <label
            htmlFor="document-upload-compact"
            className={`text-xs px-3 py-1.5 border rounded transition-colors cursor-pointer flex items-center gap-1 ${isUploading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--accent-teal)' }} />
                <span className="truncate max-w-[120px]">
                  {uploadProgress > 0 && uploadProgress < 100
                    ? `${Math.round(uploadProgress)}%`
                    : 'Processing'}
                </span>
              </>
            ) : (
              <>
                <Upload className="w-3 h-3" />
                <span>Upload</span>
              </>
            )}
          </label>
        )}

        {/* Error/Success messages for compact mode */}
        {(error || success) && (
          <div className="absolute top-full right-0 mt-1 p-2 rounded text-xs whitespace-nowrap z-50 border"
            style={error
              ? { backgroundColor: 'var(--error-soft)', borderColor: 'var(--error)', color: 'var(--error)' }
              : { backgroundColor: 'var(--success-soft)', borderColor: 'var(--success)', color: 'var(--success)' }
            }>
            {error || success}
          </div>
        )}

      </div>
    );
  }

  // Full mode (original implementation, now with tabs)
  // Note: Tabs are now rendered in App.jsx modal header, so we don't show them here
  return (
    <div className="w-full">
      {/* Hide upload UI when form is showing or file was pre-selected */}
      {!showInfoForm && !preSelectedFile && (
        <>
          {!compact && !existingDocument && (
            <div className="mb-3">
              <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                Add an annotated variant file
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                VCF, TSV or CSV with variant calls already annotated.
              </p>
            </div>
          )}

          {/* Source of the file — the kind of file was already chosen in the upload menu */}
          {!compact && !existingDocument && userTier !== 'guest' && userId !== 'guest' && (
            <PillToggle
              className="mb-3"
              value={importMode}
              onChange={handleImportModeChange}
              options={[
                { value: 'file', label: 'From computer' },
                { value: 'url', label: 'From URL' },
              ]}
            />
          )}

          {/* Pick a local file — click or drag. Drops route through the same processFile
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
              <label
                htmlFor="document-upload-full"
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
                className={`flex flex-col items-center justify-center gap-2 w-full px-4 py-8 border border-dashed rounded-xl text-center transition-colors ${
                  isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                }`}
                style={{
                  borderColor: isDragOver ? 'var(--accent-teal)' : 'var(--border-default)',
                  backgroundColor: isDragOver ? 'var(--accent-teal-soft)' : 'var(--bg-input)',
                }}
              >
                <Upload className="w-5 h-5" style={{ color: 'var(--accent-teal)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {isUploading ? 'Processing…' : 'Choose a file or drag it here'}
                </span>
                <span className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>
                  .vcf, .vcf.gz, .tsv or .csv
                </span>
              </label>
            </div>
          )}

          {/* Import from a link — public URL / Drive / Dropbox */}
          {importMode === 'url' && !compact && (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Import from a link
              </p>
              {/* Optional filename — progressive disclosure */}
              {showUrlFilename || urlFilenameOverride ? (
                <input
                  type="text"
                  value={urlFilenameOverride}
                  onChange={(e) => setUrlFilenameOverride(e.target.value)}
                  placeholder="Filename"
                  autoFocus={showUrlFilename && !urlFilenameOverride}
                  className="w-full h-9 px-3 mb-2 text-xs rounded-lg border transition-all focus:outline-none placeholder:text-[var(--text-tertiary)]"
                  style={{ borderColor: 'var(--border-default)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent-teal)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleUrlContinue(); }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowUrlFilename(true)}
                  className="inline-flex items-center gap-1 mt-2 text-xs transition-colors"
                  style={{ color: 'var(--text-tertiary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                >
                  <Plus className="w-3 h-3" />
                  Set a filename
                </button>
              )}
              {/* URL field with inline icon + clear */}
              <div className="relative">
                <input
                  type="url"
                  inputMode="url"
                  value={fileUrl}
                  onChange={(e) => setFileUrl(e.target.value)}
                  placeholder="https://drive.google.com/file/uefaebf/view?usp=sharing"
                  autoFocus
                  className="w-full h-10 px-3 text-sm rounded-lg border transition-all focus:outline-none placeholder:text-[var(--text-tertiary)]"
                  style={{
                    borderColor: error ? 'var(--error)' : (urlFieldFocused ? 'var(--accent-teal)' : 'var(--border-default)'),
                    background: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={() => setUrlFieldFocused(true)}
                  onBlur={() => setUrlFieldFocused(false)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleUrlContinue(); }}
                />
                {fileUrl && (
                  <button
                    type="button"
                    onClick={() => setFileUrl('')}
                    aria-label="Clear URL"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center"
                    style={{ backgroundColor: 'var(--bg-surface-hover)', color: 'var(--text-secondary)' }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {/* Inline error replaces the guidance line, in red */}
              {error ? (
                <div className="flex items-start gap-2 mt-3 ml-3">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--error)' }} />
                  <p className="text-2xs leading-relaxed" style={{ color: 'var(--error)' }}>{error}</p>
                </div>
              ) : (
                <div className="flex items-start gap-2 mt-3 ml-3">
                  <p className="text-2xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                    Links must be shared as{' '}
                    <span style={{ color: 'var(--text-secondary)' }}>&ldquo;Anyone with the link.&rdquo;</span>
                  </p>
                </div>
              )}

              {/* Primary action */}
              <div className="flex justify-end mt-3">
                <button
                  type="button"
                  onClick={handleUrlContinue}
                  disabled={isPreflighting || !fileUrl.trim()}
                  className="h-9 px-5 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--accent-teal)', color: '#0F0F0F' }}
                  onMouseEnter={(e) => { if (!isPreflighting && fileUrl.trim()) e.currentTarget.style.backgroundColor = 'var(--accent-teal-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--accent-teal)'; }}
                >
                  {isPreflighting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Validating
                    </>
                  ) : (
                    'Continue'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Existing Document Display */}
          {existingDocument && !isUploading && (
            <div className="mb-3 p-3 border rounded-lg flex items-center justify-between" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--accent-teal)' }}>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--accent-teal-soft)' }}>
                  <FileText className="w-4 h-4" style={{ color: 'var(--accent-teal)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {existingDocument.name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {existingDocument.type.toUpperCase()} • {(existingDocument.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <button
                onClick={handleRemoveDocument}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--text-tertiary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--error-soft)';
                  e.currentTarget.style.color = 'var(--error)';
                }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
                aria-label="Remove document"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Replace Document Button */}
          {existingDocument && !isUploading && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 px-4 rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2"
              style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--accent-teal)', color: 'var(--accent-teal)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-surface)'; }}
            >
              <Upload className="w-4 h-4" />
              Replace Document
            </button>
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
          URL mode renders its own inline error under the panel. */}
          {error && !showInfoForm && importMode !== 'url' && (
            <div className="mt-3 p-3 border rounded-lg flex items-start gap-2" style={{ backgroundColor: 'var(--bg-surface)', borderColor: '#8B2F3C' }}>
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#8B2F3C' }} />
              <p className="text-sm" style={{ color: '#8B2F3C' }}>{error}</p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mt-3 p-3 border rounded-lg flex items-start gap-2" style={{ backgroundColor: 'var(--bg-surface)', borderColor: '#3E8E7E' }}>
              <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#3E8E7E' }} />
              <p className="text-sm" style={{ color: '#3E8E7E' }}>{success}</p>
            </div>
          )}

        </>
      )}

      {/* Sample Metadata — always a centered popup (portal), never inline in sidebar/parent */}
      <Dialog open={showInfoForm} onOpenChange={(open) => { if (!open) handleInfoFormCancel(); }}>
        <DialogContent
          showCloseButton={false}
          className="!max-w-2xl w-full max-h-[min(96vh,900px)] flex flex-col p-0 gap-0 overflow-hidden ring-0 border"
          style={{
            backgroundColor: 'var(--bg-surface-raised)',
            boxShadow: 'var(--shadow-lg)',
            borderColor: 'var(--border-default)',
          }}
        >
          <DialogTitle className="sr-only">{editMode ? 'Edit Sample Information' : 'Sample Metadata'}</DialogTitle>
          <DialogDescription className="sr-only">
            {editMode ? 'Update metadata for this variant file.' : 'Provide details about your variant file for better analysis.'}
          </DialogDescription>
          <div className="flex-shrink-0 px-7 pt-6 pb-4 relative">
            <h3 id="sample-metadata-title" className="text-base font-semibold mb-1 pr-8" style={{ color: 'var(--text-primary)' }}>
              {editMode ? 'Edit Sample Information' : 'Sample Metadata'}
            </h3>
            <p className="text-xs mb-0" style={{ color: 'var(--text-tertiary)' }}>
              {editMode ? 'Update metadata for this variant file. Changes may require re-running analysis steps.' : 'Provide details about your variant file for better analysis.'}
            </p>
            {!editMode && (selectedFile || importUrlMeta) && (
              <div className="inline-flex items-center gap-2 mt-4 max-w-full pl-2.5 pr-3 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)]" title={selectedFile ? selectedFile.name : importUrlMeta?.file_name}>
                <FileText className="w-3.5 h-3.5 shrink-0 text-[var(--accent-teal)]" />
                <span className="text-xs font-medium truncate text-[var(--text-secondary)]">
                  {selectedFile ? selectedFile.name : (importUrlMeta ? `URL: ${importUrlMeta.file_name}` : '')}
                </span>
              </div>
            )}
            {error && showInfoForm && (
              <div className="mt-4 p-3 border rounded-lg flex items-start gap-2" style={{ backgroundColor: 'var(--error-soft)', borderColor: 'var(--error)' }}>
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--error)' }} />
                <p className="text-xs" style={{ color: 'var(--error)' }}>{error}</p>
              </div>
            )}
          </div>

          <form onSubmit={handleInfoFormSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-7 pb-4 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-5">
                {/* Name - Editable */}
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Name
                  </label>
                  <input
                    type="text"
                    value={sampleMetadata.name}
                    onChange={(e) => setSampleMetadata({ ...sampleMetadata, name: e.target.value })}
                    className="w-full px-3 h-10 border rounded-lg focus:outline-none focus:ring-1 text-sm transition-all"
                    style={{
                      borderColor: 'var(--border-default)',
                      background: 'var(--bg-input)',
                      color: 'var(--text-primary)',
                      height: '40px'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--border-focus)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
                    placeholder="Enter sample name..."
                  />
                </div>

                {/* Genome - Mandatory Field (auto-detected when possible) */}
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Genome <span style={{ color: 'var(--error)' }}>*</span>
                  </label>
                  <CustomSelect
                    value={sampleMetadata.genome}
                    onChange={(val) => {
                      setSampleMetadata({ ...sampleMetadata, genome: val });
                      // Clear auto-detection badge when user manually picks
                      if (genomeDetection) setGenomeDetection((prev) => prev ? { ...prev, _userOverride: true } : prev);
                    }}
                    placeholder={isDetectingGenome ? 'Detecting…' : 'Choose one'}
                    options={[
                      { value: 'hg19 (GRCh37)', label: 'hg19 (GRCh37)' },
                      { value: 'hg38 (GRCh38)', label: 'hg38 (GRCh38)' },
                    ]}
                    error={validationAttempted && !sampleMetadata.genome}
                  />
                  {/* Auto-detection feedback */}
                  {!editMode && isDetectingGenome && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--accent-teal)' }} />
                      <span className="text-2xs" style={{ color: 'var(--text-tertiary)' }}>Detecting genome build…</span>
                    </div>
                  )}
                  {!editMode && genomeDetection?.detected_build && !isDetectingGenome && !genomeDetection._userOverride && (
                    <div
                      className="flex items-center gap-1.5 mt-1 min-w-0"
                      title={genomeDetection.source ? `Source: ${genomeDetection.source.replace(/_/g, ' ')}` : undefined}
                    >
                      <span className="text-2xs truncate text-[var(--text-tertiary)]">
                        Auto-detected {genomeDetection.detected_build.toUpperCase()}
                        {genomeDetection.confidence !== 'high' && ' — verify'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Sequencing Type - Mandatory Field */}
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Sequencing Type <span style={{ color: 'var(--error)' }}>*</span>
                  </label>
                  <CustomSelect
                    value={sampleMetadata.sequencingType}
                    onChange={(val) => setSampleMetadata({ ...sampleMetadata, sequencingType: val })}
                    placeholder="Choose one"
                    options={[
                      { value: 'Whole Exome (WES)', label: 'Whole Exome (WES)' },
                      { value: 'Whole Genome (WGS)', label: 'Whole Genome (WGS)' },
                      { value: 'Targeted', label: 'Targeted' },
                    ]}
                    error={validationAttempted && !sampleMetadata.sequencingType}
                  />
                </div>

                {/* Sample File Type - Auto-detected */}
                <div>
                  <label className="flex items-baseline gap-1.5 text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Sample File Type <span className="text-2xs font-normal items-baseline" style={{ color: 'var(--text-tertiary)' }}>(auto-detected)</span>
                  </label>
                  <input
                    type="text"
                    value={sampleMetadata.sampleFileType}
                    className="w-full px-3 h-10 border rounded-lg focus:outline-none text-sm transition-all"
                    style={{
                      borderColor: 'var(--border-default)',
                      background: 'var(--bg-surface-hover)',
                      color: 'var(--text-tertiary)',
                    }}
                    readOnly
                  />
                </div>

                {/* Sample Sex - Optional */}
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Sample Sex
                  </label>
                  <CustomSelect
                    value={sampleMetadata.sampleSex}
                    onChange={(val) => setSampleMetadata({ ...sampleMetadata, sampleSex: val })}
                    placeholder="Choose one"
                    options={[
                      { value: 'Male', label: 'Male' },
                      { value: 'Female', label: 'Female' },
                      { value: 'Unknown', label: 'Unknown' },
                    ]}
                  />
                </div>

                {/* Analysis Type - Mandatory Field */}
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Analysis Type <span style={{ color: 'var(--error)' }}>*</span>
                  </label>
                  <CustomSelect
                    value={sampleMetadata.analysisType}
                    onChange={(val) => setSampleMetadata({ ...sampleMetadata, analysisType: val })}
                    placeholder="Choose one"
                    options={[
                      { value: 'Germline', label: 'Germline' },
                      { value: 'Somatic', label: 'Somatic' },
                      { value: 'Tumor-Normal Paired', label: 'Tumor-Normal Paired' },
                      { value: 'Tumor-Only', label: 'Tumor-Only' },
                      { value: 'IVF', label: 'IVF', disabled: true, disabledReason: 'IVF analysis is coming soon.' },
                      { value: 'PGT', label: 'PGT', disabled: true, disabledReason: 'PGT analysis is coming soon.' },
                      { value: 'Unknown', label: 'Unknown', disabled: true, disabledReason: 'Unknown analysis type is not supported yet.' },
                    ]}
                    error={validationAttempted && !sampleMetadata.analysisType}
                  />
                </div>

                {/* Sample Source - Optional */}
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Sample Source
                  </label>
                  <CustomSelect
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
                </div>
              </div>

              {/* Conditional Fields - Only shown if Analysis Type = Germline */}
              {sampleMetadata.analysisType === 'Germline' && (
                <div className="disclosure-enter border-t border-[var(--border-default)] pt-4 mt-4">
                  <h4 className="text-md font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                    Germline Analysis Fields
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    {/* Sample Role */}
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                        Sample Role
                      </label>
                      <CustomSelect
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
                    </div>

                    {/* Affected Status */}
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                        Affected Status
                      </label>
                      <CustomSelect
                        value={sampleMetadata.affectedStatus}
                        onChange={(val) => setSampleMetadata({ ...sampleMetadata, affectedStatus: val })}
                        placeholder="Choose one"
                        options={[
                          { value: 'affected', label: 'Affected' },
                          { value: 'unaffected', label: 'Unaffected' },
                        ]}
                      />
                    </div>

                    {/* Inheritance Model */}
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                        Inheritance Model
                      </label>
                      <CustomSelect
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
                    </div>

                  </div>

                  {/* Phenotype - Full width — required for Germline */}
                  {(() => {
                    const phenotypeInvalid = validationAttempted && !sampleMetadata.phenotype?.trim();
                    return (
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                          Phenotype <span style={{ color: 'var(--error)' }}>*</span>
                        </label>
                        <textarea
                          value={sampleMetadata.phenotype}
                          onChange={(e) => setSampleMetadata({ ...sampleMetadata, phenotype: e.target.value })}
                          placeholder="Describe the phenotype or clinical presentation..."
                          rows={3}
                          className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-1 resize-none text-sm transition-all"
                          style={{
                            borderColor: phenotypeInvalid ? 'var(--error)' : 'var(--border-default)',
                            background: 'var(--bg-input)',
                            backdropFilter: 'blur(10px)',
                            WebkitBackdropFilter: 'blur(10px)',
                            color: 'var(--text-primary)'
                          }}
                        />
                        {phenotypeInvalid && (
                          <p className="mt-1 text-xs" style={{ color: 'var(--error)' }}>
                            Required for Germline analysis — used for Exomiser phenotype prioritization.
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Tumor Type - Only shown for Somatic/Tumor analyses (NOT Germline) */}
              {(sampleMetadata.analysisType === 'Somatic' ||
                sampleMetadata.analysisType === 'Tumor-Normal Paired' ||
                sampleMetadata.analysisType === 'Tumor-Only') && (
                  <div className="disclosure-enter border-t border-[var(--border-default)] pt-4 mt-4">
                    <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                      Tumor Analysis Fields
                    </h4>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                        Tumor Type
                      </label>
                      <input
                        type="text"
                        value={sampleMetadata.tumorType}
                        onChange={(e) => setSampleMetadata({ ...sampleMetadata, tumorType: e.target.value })}
                        placeholder="Enter tumor type (e.g., Breast Cancer, Lung Adenocarcinoma)..."
                        className="w-full px-3 h-10 border rounded-lg focus:outline-none focus:ring-1 text-sm transition-all"
                        style={{
                          borderColor: 'var(--border-default)',
                          background: 'var(--bg-input)',
                          color: 'var(--text-primary)',
                          height: '40px'
                        }}
                      />
                    </div>
                  </div>
                )}

            </div>

            {/* Form Actions — pinned footer */}
            <div className="flex-shrink-0 flex gap-2 justify-end px-7 py-4 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={handleInfoFormCancel}
                disabled={isUploading}
                className="h-10 px-4 rounded-lg transition-colors text-sm font-medium disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)]"
                style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => { if (!isUploading) e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-surface)'; }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUploading}
                className="h-10 px-5 rounded-lg transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface-raised)]"
                style={{ backgroundColor: 'var(--accent-teal)', color: '#0F0F0F' }}
                onMouseEnter={(e) => { if (!isUploading) e.currentTarget.style.opacity = '0.9'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {editMode ? 'Saving…' : 'Processing…'}
                  </>
                ) : (
                  editMode ? 'Save Changes' : (importMode === 'url' ? 'Import File' : 'Upload File')
                )}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Optional Fields Warning Modal */}
      <AlertDialog open={showOptionalFieldsWarning} onOpenChange={(open) => { if (!open) setShowOptionalFieldsWarning(false); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Continue without optional fields?</AlertDialogTitle>
            <AlertDialogDescription>
              Some optional fields are empty. Filling them will improve analysis accuracy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[var(--accent-teal)] text-[#0F0F0F] hover:bg-[var(--accent-teal-hover)]"
              onClick={async () => {
                setShowOptionalFieldsWarning(false);
                notifyUploadStarting(importMode === 'url' ? { name: importUrlMeta.file_name } : selectedFile);
                dismissUploadUiForBackgroundUpload();
                if (importMode === 'url') {
                  await performUrlImport(sampleMetadata);
                } else {
                  await uploadFile(selectedFile, sampleMetadata);
                }
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Document Confirmation Modal */}
      <AlertDialog open={showRemoveConfirm} onOpenChange={(open) => { if (!open) setShowRemoveConfirm(false); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Document?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this document from the conversation?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[var(--accent-teal)] text-white hover:bg-[var(--accent-teal-hover)]"
              onClick={confirmRemoveDocument}
            >
              Remove
            </AlertDialogAction>
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
          }
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Replace Document?</AlertDialogTitle>
            <AlertDialogDescription>
              This conversation already has a document ({existingDocument?.name}). Do you want to replace it?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[var(--accent-teal)] text-[#0F0F0F] hover:bg-[var(--accent-teal-hover)]"
              onClick={async () => {
                setShowReplaceConfirm(false);
                const file = pendingFile;
                setPendingFile(null);
                if (!file) return;

                // Continue with file processing
                const isGuest = userTier === 'guest' || userId === 'guest';
                if (!isGuest) {
                  const fileName = file.name.toLowerCase();
                  const extension = fileName.substring(fileName.lastIndexOf('.'));
                  if (extension === '.tsv' || extension === '.csv') {
                    setSelectedFile(file);
                    let detectedFileType = '';
                    if (extension === '.tsv') {
                      detectedFileType = 'TSV';
                    } else if (extension === '.csv') {
                      detectedFileType = 'CSV';
                    }
                    const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.'));
                    setSampleMetadata(prev => ({
                      ...prev,
                      name: nameWithoutExt,
                      sampleFileType: detectedFileType
                    }));
                    setValidationAttempted(false);
                    setError('');
                    setGenomeDetection(null);
                    setShowInfoForm(true);
                    runGenomeDetection(file);
                  } else {
                    await uploadFile(file);
                  }
                } else {
                  await uploadFile(file);
                }
              }}
            >
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DocumentUpload;

