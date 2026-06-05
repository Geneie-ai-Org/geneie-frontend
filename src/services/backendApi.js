import { getAuth } from 'firebase/auth';
import { apiUrl } from '@/config/api';

const DEVICE_ID_STORAGE_KEY = 'geneie_device_id';

/** Defaults aligned with backend env when subscription-status is unavailable (guest). */
export const DEFAULT_GUEST_CHAT_LIMIT = 5;
export const DEFAULT_FREE_CHAT_LIMIT = 10;
export const DEFAULT_GUEST_FILE_SIZE_MB = 5;
export const DEFAULT_FREE_FILE_SIZE_MB = 10;

/** Pro files above this use direct-to-S3 presign instead of multipart POST. */
export const PRO_PRESIGN_UPLOAD_THRESHOLD_BYTES = 10 * 1024 * 1024;

export function getOrCreateDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing?.trim()) return existing;
    const created = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export async function getAuthHeaders() {
  const auth = getAuth();
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
  if (!token) throw new Error('Authentication required');
  return {
    Authorization: `Bearer ${token}`,
    'X-Device-Id': getOrCreateDeviceId(),
  };
}

export function parseApiErrorDetail(detail) {
  if (!detail) return null;
  if (typeof detail === 'string') return detail;
  if (typeof detail === 'object' && detail.message) return detail.message;
  if (Array.isArray(detail)) return detail.map((d) => d.msg || d).join(', ');
  return null;
}

export async function fetchSubscriptionStatus() {
  const headers = await getAuthHeaders();
  const response = await fetch(apiUrl('/api/subscription-status'), { headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiErrorDetail(data.detail) || 'Failed to load subscription status');
  }
  return data;
}

export async function fetchChatEligibility(conversationId) {
  const headers = await getAuthHeaders();
  const response = await fetch(apiUrl(`/api/chat-eligibility/${encodeURIComponent(conversationId)}`), {
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiErrorDetail(data.detail) || 'Failed to load chat eligibility');
  }
  return data;
}

export async function mapProprietaryFilters(conversationId, columnInterpretation) {
  const columnInterpretations = buildColumnInterpretationsPayload(columnInterpretation);
  if (!Object.keys(columnInterpretations).length) {
    return null;
  }
  const headers = {
    ...(await getAuthHeaders()),
    'Content-Type': 'application/json',
  };
  const response = await fetch(apiUrl('/api/map-proprietary-filters'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      conversation_id: conversationId,
      column_interpretations: columnInterpretations,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiErrorDetail(data.detail) || 'Failed to map proprietary filters');
  }
  return data;
}

export async function convertToVcf(conversationId, referenceGenome = 'hg38') {
  const headers = {
    ...(await getAuthHeaders()),
    'Content-Type': 'application/json',
  };
  const response = await fetch(apiUrl('/api/convert-to-vcf'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      conversation_id: conversationId,
      reference_genome: referenceGenome,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiErrorDetail(data.detail) || 'Failed to convert file to VCF');
  }
  return data;
}

export async function presignVariantUpload({ conversationId, fileName, fileSize, contentType }) {
  const headers = {
    ...(await getAuthHeaders()),
    'Content-Type': 'application/json',
  };
  const response = await fetch(apiUrl('/api/upload-variant-file/presign'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      conversation_id: conversationId,
      file_name: fileName,
      file_size: fileSize,
      content_type: contentType || 'application/octet-stream',
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiErrorDetail(data.detail) || 'Failed to prepare upload');
  }
  return data;
}

export async function completeVariantUpload({
  conversationId,
  s3Key,
  fileName,
  sampleMetadata,
  experimentType,
  phenotypeInfo,
}) {
  const headers = await getAuthHeaders();
  const formData = new FormData();
  formData.append('conversation_id', conversationId);
  formData.append('s3_key', s3Key);
  formData.append('file_name', fileName);
  if (experimentType) formData.append('experiment_type', experimentType);
  if (phenotypeInfo) formData.append('phenotype_info', phenotypeInfo);
  if (sampleMetadata) formData.append('sample_metadata', JSON.stringify(sampleMetadata));

  const response = await fetch(apiUrl('/api/upload-variant-file/complete'), {
    method: 'POST',
    headers,
    body: formData,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiErrorDetail(data.detail) || 'Failed to process uploaded file');
  }
  return data;
}

/** Build per-column payload expected by POST /api/map-proprietary-filters. */
export function buildColumnInterpretationsPayload(columnInterpretation) {
  if (!columnInterpretation) return {};

  const result = {};

  const addColumn = (colName, meta = {}) => {
    if (!colName || result[colName]) return;
    result[colName] = {
      type: meta.type || 'variant_column',
      description: meta.description || meta.reason || colName,
    };
  };

  const addFromRequired = (required = {}) => {
    Object.entries(required).forEach(([target, info]) => {
      if (info?.matched_column) {
        addColumn(info.matched_column, {
          type: target,
          description: info.reason || info.match_method || target,
        });
      }
    });
  };

  const addFromPredictors = (predictors = {}) => {
    Object.entries(predictors).forEach(([target, info]) => {
      if (info?.matched_column) {
        addColumn(info.matched_column, { type: 'predictor', description: target });
      }
    });
  };

  addFromRequired(columnInterpretation.step1?.required_columns);
  addFromRequired(columnInterpretation.step2?.required_columns);
  addFromPredictors(columnInterpretation.step2?.pathogenicity_predictor_group);
  addFromRequired(columnInterpretation.step3?.required_columns);

  return result;
}

export function getProUploadMaxBytes(fileName, proEntitlements) {
  const name = (fileName || '').toLowerCase();
  const caps = proEntitlements?.uploadMaxBytes || {};
  if (name.endsWith('.vcf.gz')) return caps.vcf_gzip ?? 1024 ** 3;
  if (name.endsWith('.vcf')) return caps.vcf_uncompressed ?? 5 * 1024 ** 3;
  return caps.tsv_csv_txt ?? 4 * 1024 ** 3;
}

export function getMaxUploadBytes(fileName, userTier, subscriptionStatus) {
  const name = (fileName || '').toLowerCase();
  if (userTier === 'pro') {
    return getProUploadMaxBytes(name, subscriptionStatus?.proEntitlements);
  }
  if (userTier === 'free') {
    const mb = subscriptionStatus?.freeTierUsage?.upload_preview?.max_file_size_mb;
    return (mb ?? DEFAULT_FREE_FILE_SIZE_MB) * 1024 * 1024;
  }
  return DEFAULT_GUEST_FILE_SIZE_MB * 1024 * 1024;
}

export function getTierChatLimit(userTier, subscriptionStatus) {
  if (userTier === 'guest') return DEFAULT_GUEST_CHAT_LIMIT;
  if (userTier === 'pro') return Infinity;
  const fromApi = subscriptionStatus?.freeTierUsage?.limits?.chat;
  return fromApi ?? DEFAULT_FREE_CHAT_LIMIT;
}

export function shouldUsePresignedUpload(userTier, fileSize) {
  return userTier === 'pro' && fileSize > PRO_PRESIGN_UPLOAD_THRESHOLD_BYTES;
}

/** PUT file to S3 via presigned URL with byte progress. */
export function putFileToPresignedUrl({ url, method = 'PUT', headers = {}, file, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress((e.loaded / e.total) * 100);
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`S3 upload failed (${xhr.status})`));
    });
    xhr.addEventListener('error', () => reject(new Error('S3 upload network error')));
    xhr.open(method, url);
    Object.entries(headers).forEach(([key, value]) => {
      if (value != null) xhr.setRequestHeader(key, value);
    });
    xhr.send(file);
  });
}
