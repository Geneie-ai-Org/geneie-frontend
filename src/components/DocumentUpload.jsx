import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Upload, FileText, X, CheckCircle, AlertCircle, Loader2, ChevronDown } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import ProcessingNotification from './ProcessingNotification';
import { apiUrl as buildApiUrl } from '@/config/api';
import { getUploadDisplayMessage } from '@/lib/uploadProcessingPhases';
import { useAuth } from '@/hooks/useAuth';
import {
  completeVariantUpload,
  getMaxUploadBytes,
  getOrCreateDeviceId,
  presignVariantUpload,
  putFileToPresignedUrl,
  shouldUsePresignedUpload,
} from '@/services/backendApi';

/** Tabular + VCF (.vcf and .vcf.gz). Uses suffix checks so .vcf.gz is not mistaken for .gz-only. */
function isAllowedVariantFilename(fileName) {
  const n = (fileName || '').toLowerCase();
  if (n.endsWith('.tsv') || n.endsWith('.csv')) return true;
  if (n.endsWith('.vcf.gz')) return true;
  if (n.endsWith('.vcf')) return true;
  return false;
}

// Custom select — menu is portaled so it doesn't expand a scrollable modal
const CustomSelect = ({ value, onChange, placeholder, options, error, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const updateMenuPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 4;
    const maxMenuHeight = 240;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openUp = spaceBelow < Math.min(maxMenuHeight, 160) && spaceAbove > spaceBelow;
    const available = openUp ? spaceAbove : spaceBelow;
    const height = Math.min(maxMenuHeight, Math.max(available, 120));

    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      zIndex: 10000,
      maxHeight: height,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + gap }
        : { top: rect.bottom + gap }),
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();
    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      const t = e.target;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const selectedLabel = options.find(o => o.value === value)?.label;
  const hasOptions = options.length > 0;

  const menu = isOpen && hasOptions && menuStyle && createPortal(
    <div
      ref={menuRef}
      className="rounded-lg border shadow-xl overflow-y-auto"
      style={{
        ...menuStyle,
        backgroundColor: 'var(--bg-surface-raised)',
        borderColor: 'var(--border-default)',
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => { onChange(opt.value); setIsOpen(false); }}
          className="w-full px-2.5 py-1.5 text-xs text-left transition-colors hover:bg-white/5 flex items-center justify-between"
          style={{ color: value === opt.value ? 'var(--accent-teal)' : 'var(--text-primary)' }}
        >
          {opt.label}
          {value === opt.value && <CheckCircle className="w-3.5 h-3.5" style={{ color: 'var(--accent-teal)' }} />}
        </button>
      ))}
    </div>,
    document.body
  );

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!hasOptions) return;
          if (!isOpen) updateMenuPosition();
          setIsOpen((open) => !open);
        }}
        className="w-full h-[34px] px-2.5 flex items-center justify-between rounded-lg border text-xs transition-colors text-left"
        style={{
          borderColor: error ? 'var(--error)' : 'var(--border-default)',
          backgroundColor: 'var(--bg-input)',
          color: selectedLabel ? 'var(--text-primary)' : 'var(--text-tertiary)',
          cursor: hasOptions ? 'pointer' : 'default',
        }}
      >
        <span className="truncate">{selectedLabel || placeholder}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--text-tertiary)' }} />
      </button>
      {menu}
    </div>
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
}) => {
  const { subscriptionStatus } = useAuth();
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

  const uploadStatusMessage = getUploadDisplayMessage({ uploadProgress });

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
    const maxSize = getMaxUploadBytes(file.name, isGuest ? 'guest' : userTier, subscriptionStatus);
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
    console.log('[DocumentUpload] Processing file:', file.name, file.size, 'bytes');
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

    if (!isGuest) {
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
        setShowInfoForm(true);
      } else {
        console.log('[DocumentUpload] Starting upload (non-CSV/TSV file)...');
        await uploadFile(file);
      }
    } else {
      console.log('[DocumentUpload] Starting upload (guest mode)...');
      await uploadFile(file);
    }
  };

  // Auto-process pre-selected file from dropdown
  useEffect(() => {
    if (preSelectedFile) {
      processFile(preSelectedFile);
    }
  }, [preSelectedFile]);

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
    console.log('[DocumentUpload] Form submitted, selectedFile:', selectedFile);
    
    if (!selectedFile) {
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
    
    // Check for optional fields that are empty - show encouragement but allow proceeding
    const emptyOptionalFields = [];
    if (!sampleMetadata.sampleSex) emptyOptionalFields.push('Sample Sex');
    if (!sampleMetadata.sampleSource) emptyOptionalFields.push('Sample Source');
    if (sampleMetadata.analysisType === 'Germline') {
      if (!sampleMetadata.sampleRole) emptyOptionalFields.push('Sample Role');
      if (!sampleMetadata.affectedStatus) emptyOptionalFields.push('Affected Status');
      if (!sampleMetadata.inheritanceModel) emptyOptionalFields.push('Inheritance Model');
      if (!sampleMetadata.phenotype) emptyOptionalFields.push('Phenotype');
    }
    
    // If optional fields are empty, show custom warning modal
    if (emptyOptionalFields.length > 0) {
      setShowOptionalFieldsWarning(true);
      return; // Wait for user decision
    }
    
    // Notify parent first so DocumentUpload stays mounted while POST /api/upload-variant-file runs.
    notifyUploadStarting(selectedFile);
    dismissUploadUiForBackgroundUpload();
    await uploadFile(selectedFile, sampleMetadata);
  };

  const handleInfoFormCancel = () => {
    setShowInfoForm(false);
    setSelectedFile(null);
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
      
      if (isGuest) {
        // For guests: Store in IndexedDB
        console.log('[DocumentUpload] Using IndexedDB (Guest Mode)');
        setUploadProgress(50); // Simulate progress
        
        const fileData = await storeFileInIndexedDB(file, conversationId);
        setUploadProgress(100);
        
        // Create a data URL for the file so we can use it for validation
        const blob = new Blob([fileData.data], { type: file.type || 'text/plain' });
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        
        const documentData = {
          url: dataUrl, // Data URL for guest files
          name: fileData.name,
          type: fileData.type,
          size: fileData.size,
          uploadedAt: fileData.uploadedAt,
          storageType: 'indexeddb',
          indexedDbId: fileData.id,
          conversationId: conversationId
        };

        console.log('[DocumentUpload] File stored in IndexedDB:', documentData);
        console.log('[DocumentUpload] Calling onUploadSuccess callback...');

        // Notify parent component
        if (onUploadSuccess) {
          try {
            await onUploadSuccess(documentData);
            console.log('[DocumentUpload] onUploadSuccess callback completed');
          } catch (callbackError) {
            console.error('[DocumentUpload] Error in onUploadSuccess callback:', callbackError);
            setError(`Upload succeeded but failed to save metadata: ${callbackError.message}`);
          }
        }

        setSuccess(`Document "${file.name}" stored locally (sign up to enable full features)!`);
        setIsUploading(false);
        setUploadProgress(0);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }

        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(''), 3000);
        return;
      }
      
      // For authenticated users: Use backend API (S3)
      console.log('[DocumentUpload] Using backend API (S3)');

      const auth = getAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      if (!token) {
        throw new Error('Authentication required. Please log in.');
      }

      const finishSuccessfulUpload = async (response) => {
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
          free_tier_preview: response.free_tier_preview || null,
          column_interpretation: response.column_interpretation || null,
          variant_metadata: response.variant_metadata || null,
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
          `Document "${file.name}" uploaded successfully! ${response.is_variant_file ? `(${response.variant_count} variants)` : ''}`
        );
        setIsUploading(false);
        setUploadProgress(0);
        onUploadProgressChange?.(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setTimeout(() => setSuccess(''), 5000);
      };

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

      if (shouldUsePresignedUpload(userTier, file.size)) {
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
        await finishSuccessfulUpload(response);
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
            await finishSuccessfulUpload(response);
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
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('X-Device-Id', getOrCreateDeviceId());
      xhr.send(formData);
      
    } catch (error) {
      console.error('[DocumentUpload] Upload error:', error);
      setError(`Upload failed: ${error.message}`);
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
            className={`text-xs px-3 py-1.5 border rounded transition-colors cursor-pointer flex items-center gap-1 ${
              isUploading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--accent-blue)' }} />
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
        
        {/* Processing Notification for compact mode */}
        <ProcessingNotification 
          message={isUploading ? uploadStatusMessage : null}
          isVisible={isUploading}
        />
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

      {/* Upload Area */}
      {!existingDocument && (
        <div className="space-y-3 flex flex-col items-center">
          <div className="flex items-center justify-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".tsv,.csv,.vcf,.vcf.gz,.gz,application/gzip"
              onChange={handleFileSelect}
              className="hidden"
              id="document-upload"
              disabled={isUploading}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: isUploading ? 'var(--text-tertiary)' : 'var(--accent-blue)', color: 'var(--bg-app)' }}
              onMouseEnter={(e) => { if (!isUploading) e.currentTarget.style.opacity = '0.9'; }}
              onMouseLeave={(e) => { if (!isUploading) e.currentTarget.style.opacity = '1'; }}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Uploading {uploadProgress > 0 ? `${Math.round(uploadProgress)}%` : ''}</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Select File</span>
                </>
              )}
            </button>
          </div>
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

      {/* Error Message - Only show upload-related errors, not form validation errors */}
      {error && !showInfoForm && (
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
      
      {/* Processing Notification */}
      <ProcessingNotification 
        message={isUploading ? uploadStatusMessage : null}
        isVisible={isUploading}
      />
        </>
      )}
      
      {/* Sample Metadata — always a centered popup (portal), never inline in sidebar/parent */}
      {showInfoForm && createPortal(
        <dialog
          open
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] backdrop-blur-sm p-4 w-full h-full max-w-none max-h-none border-0"
          onClick={handleInfoFormCancel}
          aria-modal="true"
          aria-labelledby="sample-metadata-title"
        >
          <div
            className="rounded-2xl max-w-4xl w-full max-h-[min(96vh,900px)] flex flex-col transition-all duration-300 relative overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-surface-raised)',
              boxShadow: 'var(--shadow-lg)',
              border: '1px solid var(--border-default)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-shrink-0 px-5 pt-5 pb-3 relative">
            <button
              type="button"
              onClick={handleInfoFormCancel}
              disabled={isUploading}
              className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors disabled:opacity-40"
              style={{ color: 'var(--text-tertiary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              aria-label="Close sample metadata"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 id="sample-metadata-title" className="text-sm font-semibold mb-0.5 pr-8" style={{ color: 'var(--text-primary)' }}>
              Sample Metadata
            </h3>
            <p className="text-xs mb-0" style={{ color: 'var(--text-tertiary)' }}>
              Provide details about your variant file for better analysis.
            </p>
            {selectedFile && (
              <p className="text-xs mt-3 px-2.5 py-1.5 rounded-lg truncate" style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
                File: <span className="font-medium">{selectedFile.name}</span>
              </p>
            )}
            {error && showInfoForm && (
              <div className="mt-3 p-2.5 border rounded-lg flex items-start gap-2" style={{ backgroundColor: 'var(--error-soft)', borderColor: 'var(--error)' }}>
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--error)' }} />
                <p className="text-xs" style={{ color: 'var(--error)' }}>{error}</p>
              </div>
            )}
            </div>

            <form onSubmit={handleInfoFormSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-3">
                {/* Name - Editable */}
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Name
                  </label>
                  <input
                    type="text"
                    value={sampleMetadata.name}
                    onChange={(e) => setSampleMetadata({ ...sampleMetadata, name: e.target.value })}
                    className="w-full px-2.5 py-1.5 border rounded-lg focus:outline-none focus:ring-1 text-xs transition-all"
                    style={{
                      borderColor: 'var(--border-default)',
                      background: 'var(--bg-input)',
                      color: 'var(--text-primary)',
                      height: '34px'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-blue)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
                    placeholder="Enter sample name..."
                  />
                </div>

                {/* Project */}
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Project
                  </label>
                  {!showCreateProject ? (
                    <div className="flex gap-2 items-stretch">
                      <CustomSelect
                        value={sampleMetadata.project}
                        onChange={(val) => setSampleMetadata({ ...sampleMetadata, project: val })}
                        placeholder="Select Project..."
                        options={existingProjects.map(proj => ({ value: proj, label: proj }))}
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCreateProject(true)}
                        className="px-2.5 py-1.5 text-xs font-medium border rounded-lg transition-colors whitespace-nowrap"
                        style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-surface)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-surface)'; }}
                      >
                        + New
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2 items-stretch">
                      <input
                        type="text"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="Enter project name..."
                        className="flex-1 px-2.5 py-1.5 border rounded-lg focus:outline-none focus:ring-1 text-xs transition-all"
                        style={{
                          borderColor: 'var(--border-default)',
                          background: 'var(--bg-input)',
                          color: 'var(--text-primary)',
                        }}
                        onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-blue)'}
                        onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newProjectName.trim()) {
                            setSampleMetadata({ ...sampleMetadata, project: newProjectName.trim() });
                            setExistingProjects(prev => [...prev, newProjectName.trim()]);
                            setNewProjectName('');
                          }
                          setShowCreateProject(false);
                        }}
                        className="px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                        style={{ backgroundColor: 'var(--accent-teal)', color: '#0F0F0F' }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateProject(false);
                          setNewProjectName('');
                        }}
                        className="px-2.5 py-1.5 text-xs font-medium border rounded-lg transition-colors whitespace-nowrap"
                        style={{ borderColor: 'var(--border-default)', color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-input)' }}
                        onMouseEnter={(e) => { e.target.style.backgroundColor = '#F9FBFF'; e.target.style.borderColor = '#9CA3AF'; }}
                        onMouseLeave={(e) => { e.target.style.backgroundColor = '#FFFFFF'; e.target.style.borderColor = '#D1D5DB'; }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {/* Genome - Mandatory Field */}
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Genome <span style={{ color: 'var(--error)' }}>*</span>
                  </label>
                  <CustomSelect
                    value={sampleMetadata.genome}
                    onChange={(val) => setSampleMetadata({ ...sampleMetadata, genome: val })}
                    placeholder="Select Genome..."
                    options={[
                      { value: 'hg19 (GRCh37)', label: 'hg19 (GRCh37)' },
                      { value: 'hg38 (GRCh38)', label: 'hg38 (GRCh38)' },
                    ]}
                    error={validationAttempted && !sampleMetadata.genome}
                  />
                </div>

                {/* Sequencing Type - Mandatory Field */}
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Sequencing Type <span style={{ color: 'var(--error)' }}>*</span>
                  </label>
                  <CustomSelect
                    value={sampleMetadata.sequencingType}
                    onChange={(val) => setSampleMetadata({ ...sampleMetadata, sequencingType: val })}
                    placeholder="Select Sequencing Type..."
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
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Sample File Type <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>(Auto-detected)</span>
                  </label>
                  <input
                    type="text"
                    value={sampleMetadata.sampleFileType}
                    className="w-full px-2.5 py-1.5 border rounded-lg focus:outline-none text-xs transition-all"
                    style={{
                      borderColor: 'var(--border-default)',
                      background: 'var(--bg-surface-hover)',
                      color: 'var(--text-tertiary)',
                      height: '34px'
                    }}
                    readOnly
                  />
                </div>

                {/* Sample Sex - Optional */}
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Sample Sex
                  </label>
                  <CustomSelect
                    value={sampleMetadata.sampleSex}
                    onChange={(val) => setSampleMetadata({ ...sampleMetadata, sampleSex: val })}
                    placeholder="Select Sex..."
                    options={[
                      { value: 'Male', label: 'Male' },
                      { value: 'Female', label: 'Female' },
                      { value: 'Unknown', label: 'Unknown' },
                    ]}
                  />
                </div>

                {/* Analysis Type - Mandatory Field */}
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Analysis Type <span style={{ color: 'var(--error)' }}>*</span>
                  </label>
                  <CustomSelect
                    value={sampleMetadata.analysisType}
                    onChange={(val) => setSampleMetadata({ ...sampleMetadata, analysisType: val })}
                    placeholder="Select Analysis Type..."
                    options={[
                      { value: 'Germline', label: 'Germline' },
                      { value: 'Somatic', label: 'Somatic' },
                      { value: 'Tumor-Normal Paired', label: 'Tumor-Normal Paired' },
                      { value: 'Tumor-Only', label: 'Tumor-Only' },
                      { value: 'IVF', label: 'IVF' },
                      { value: 'PGT', label: 'PGT' },
                      { value: 'Unknown', label: 'Unknown' },
                    ]}
                    error={validationAttempted && !sampleMetadata.analysisType}
                  />
                </div>

                {/* Sample Source - Optional */}
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Sample Source
                  </label>
                  <CustomSelect
                    value={sampleMetadata.sampleSource}
                    onChange={(val) => setSampleMetadata({ ...sampleMetadata, sampleSource: val })}
                    placeholder="Select Source..."
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
                <div 
                  className="border-t border-[var(--border-default)] pt-4 mt-4 transition-all duration-500 ease-in-out"
                  style={{
                    animation: 'fadeInSlide 0.5s ease-out'
                  }}
                >
                  <style>{`
                    @keyframes fadeInSlide {
                      from {
                        opacity: 0;
                        transform: translateY(-15px);
                      }
                      to {
                        opacity: 1;
                        transform: translateY(0);
                      }
                    }
                  `}</style>
                  <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Germline Analysis Fields
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Sample Role */}
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                        Sample Role
                      </label>
                      <CustomSelect
                        value={sampleMetadata.sampleRole}
                        onChange={(val) => setSampleMetadata({ ...sampleMetadata, sampleRole: val })}
                        placeholder="Select Role..."
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
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                        Affected Status
                      </label>
                      <CustomSelect
                        value={sampleMetadata.affectedStatus}
                        onChange={(val) => setSampleMetadata({ ...sampleMetadata, affectedStatus: val })}
                        placeholder="Select Status..."
                        options={[
                          { value: 'affected', label: 'Affected' },
                          { value: 'unaffected', label: 'Unaffected' },
                        ]}
                      />
                    </div>

                    {/* Inheritance Model */}
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                        Inheritance Model
                      </label>
                      <CustomSelect
                        value={sampleMetadata.inheritanceModel}
                        onChange={(val) => setSampleMetadata({ ...sampleMetadata, inheritanceModel: val })}
                        placeholder="Select Model..."
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

                  {/* Phenotype - Full width */}
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                      Phenotype
                    </label>
                    <textarea
                      value={sampleMetadata.phenotype}
                      onChange={(e) => setSampleMetadata({ ...sampleMetadata, phenotype: e.target.value })}
                      placeholder="Describe the phenotype or clinical presentation..."
                      rows={3}
                    className="w-full px-2.5 py-1.5 border rounded-lg focus:outline-none focus:ring-1 resize-none text-xs transition-all"
                    style={{ 
                      borderColor: 'var(--border-default)',
                      background: 'var(--bg-input)',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      color: 'var(--text-primary)' 
                    }}
                    />
                  </div>
                </div>
              )}

              {/* Tumor Type - Only shown for Somatic/Tumor analyses (NOT Germline) */}
              {(sampleMetadata.analysisType === 'Somatic' || 
                sampleMetadata.analysisType === 'Tumor-Normal Paired' || 
                sampleMetadata.analysisType === 'Tumor-Only') && (
                <div 
                  className="border-t border-[var(--border-default)] pt-4 mt-4 transition-all duration-500 ease-in-out"
                  style={{
                    animation: 'fadeInSlide 0.5s ease-out'
                  }}
                >
                  <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    Tumor Analysis Fields
                  </h4>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                      Tumor Type
                    </label>
                    <input
                      type="text"
                      value={sampleMetadata.tumorType}
                      onChange={(e) => setSampleMetadata({ ...sampleMetadata, tumorType: e.target.value })}
                      placeholder="Enter tumor type (e.g., Breast Cancer, Lung Adenocarcinoma)..."
                      className="w-full px-2.5 py-1.5 border rounded-lg focus:outline-none focus:ring-1 text-xs transition-all"
                      style={{
                        borderColor: 'var(--border-default)',
                        background: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        height: '34px'
                      }}
                    />
                  </div>
                </div>
              )}

              </div>

              {/* Form Actions — pinned footer */}
              <div className="flex-shrink-0 flex gap-2 justify-end px-5 py-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <button
                  type="button"
                  onClick={handleInfoFormCancel}
                  disabled={isUploading}
                  className="px-3 py-1.5 rounded-lg transition-colors text-xs font-medium disabled:opacity-40"
                  style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => { if (!isUploading) e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-surface)'; }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-3 py-1.5 rounded-lg transition-colors text-xs font-medium flex items-center gap-1.5 disabled:opacity-70"
                  style={{ backgroundColor: 'var(--accent-teal)', color: '#0F0F0F' }}
                  onMouseEnter={(e) => { if (!isUploading) e.currentTarget.style.opacity = '0.9'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {uploadStatusMessage || 'Processing…'}
                    </>
                  ) : (
                    'Upload File'
                  )}
                </button>
              </div>
            </form>
          </div>
        </dialog>,
        document.body
      )}

      {/* Optional Fields Warning Modal */}
      {showOptionalFieldsWarning && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[90] backdrop-blur-sm">
          <div
            className="rounded-2xl p-6 max-w-md w-full mx-4"
            style={{
              backgroundColor: 'var(--bg-surface-raised)',
              border: '1px solid var(--border-default)',
              boxShadow: 'var(--shadow-xl)'
            }}
          >
            <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
              Continue without optional fields?
            </h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
              Some optional fields are empty. Filling them will improve analysis accuracy.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowOptionalFieldsWarning(false);
                }}
                className="px-4 py-2 rounded-lg transition-colors text-sm font-medium hover:bg-white/5"
                style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowOptionalFieldsWarning(false);
                  notifyUploadStarting(selectedFile);
                  dismissUploadUiForBackgroundUpload();
                  await uploadFile(selectedFile, sampleMetadata);
                }}
                className="px-4 py-2 rounded-lg transition-colors text-sm font-medium hover:opacity-90"
                style={{ backgroundColor: 'var(--accent-teal)', color: '#0F0F0F' }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Remove Document Confirmation Modal */}
      {showRemoveConfirm && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[90] backdrop-blur-sm">
          <div 
            className="rounded-2xl p-6 max-w-md w-full mx-4 transition-all duration-300"
            style={{ 
              background: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              border: '0.5px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
            }}
          >
            <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
              Remove Document?
            </h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-tertiary)' }}>
              Are you sure you want to remove this document from the conversation?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowRemoveConfirm(false)}
                className="px-4 py-2 rounded-xl transition-colors text-sm font-medium"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-default)', color: 'var(--text-tertiary)' }}
                onMouseEnter={(e) => { e.target.style.backgroundColor = '#F9FBFF'; e.target.style.borderColor = '#9CA3AF'; }}
                onMouseLeave={(e) => { e.target.style.backgroundColor = '#FFFFFF'; e.target.style.borderColor = '#D1D5DB'; }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRemoveDocument}
                className="px-4 py-2 rounded-xl transition-colors text-sm font-medium text-white shadow-sm"
                style={{ backgroundColor: '#2F7F7A' }}
                onMouseEnter={(e) => { e.target.style.backgroundColor = '#256B67'; }}
                onMouseLeave={(e) => { e.target.style.backgroundColor = '#2F7F7A'; }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Replace Document Confirmation Modal */}
      {showReplaceConfirm && existingDocument && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[90] backdrop-blur-sm">
          <div 
            className="rounded-2xl p-6 max-w-md w-full mx-4 transition-all duration-300"
            style={{ 
              background: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              border: '0.5px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
            }}
          >
            <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
              Replace Document?
            </h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-tertiary)' }}>
              This conversation already has a document ({existingDocument.name}). Do you want to replace it?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowReplaceConfirm(false);
                  setPendingFile(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
                className="px-4 py-2 rounded-xl transition-colors text-sm font-medium"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-default)', color: 'var(--text-tertiary)' }}
                onMouseEnter={(e) => { e.target.style.backgroundColor = '#F9FBFF'; e.target.style.borderColor = '#9CA3AF'; }}
                onMouseLeave={(e) => { e.target.style.backgroundColor = '#FFFFFF'; e.target.style.borderColor = '#D1D5DB'; }}
              >
                Cancel
              </button>
              <button
                type="button"
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
                      setShowInfoForm(true);
                    } else {
                      await uploadFile(file);
                    }
                  } else {
                    await uploadFile(file);
                  }
                }}
                className="px-4 py-2 rounded-xl transition-colors text-sm font-medium text-white shadow-sm"
                style={{ backgroundColor: '#2F7F7A' }}
                onMouseEnter={(e) => { e.target.style.backgroundColor = '#256B67'; }}
                onMouseLeave={(e) => { e.target.style.backgroundColor = '#2F7F7A'; }}
              >
                Replace
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default DocumentUpload;

