import { getAuth } from 'firebase/auth';
import { apiUrl } from '@/config/api';
import { env } from '@/config/env';
import { meterFor, PRO_LIKE } from '@/services/tierLimits';
import { getDeviceId } from '@/lib/deviceId';

/** Defaults aligned with backend env when subscription-status is unavailable (guest). */
export const DEFAULT_GUEST_CHAT_LIMIT = 5;
export const DEFAULT_GUEST_FILE_SIZE_MB = 5;
export const DEFAULT_FREE_FILE_SIZE_MB = 10;

/** Files above this use direct-to-S3 presign instead of multipart POST. Configurable via env. */
export const PRESIGN_UPLOAD_THRESHOLD_BYTES = env.variantDirectUploadMinBytes;

/** Product caps from TIER_LIMITS_SPEC §6 — same for every cohort allowed on the path. */
export const MODULE1_FASTQ_MAX_BYTES = 12 * 1024 ** 3;
export const MODULE1_BED_MAX_BYTES = 50 * 1024 * 1024;

export async function getAuthHeaders() {
  const auth = getAuth();
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
  if (!token) throw new Error('Authentication required');
  return {
    Authorization: `Bearer ${token}`,
    'X-Device-Id': getDeviceId(),
  };
}

export async function releaseDevice({ unregister = true } = {}) {
  const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
  return fetch(apiUrl('/api/device/release'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ unregister }),
    keepalive: true, // survive the navigation that follows sign-out
  });
}

export function parseApiErrorDetail(detail) {
  if (!detail) return null;
  if (typeof detail === 'string') return detail;
  if (typeof detail === 'object' && detail.message) return detail.message;
  if (Array.isArray(detail)) return detail.map((d) => d.msg || d).join(', ');
  return null;
}

/* --- Admin: tier management (unlisted /admin-haha tool) -----------------------------
 * These replace the frontend writing Firestore user documents directly. Authorisation is
 * enforced server-side by a signed Firebase custom claim or an env allowlist; the
 * VITE_ADMIN_EMAILS gate in the UI is only there to avoid showing a page that would 403.
 */

export async function adminListUsers({ plan, email, limit = 100, cursor } = {}) {
  const params = new URLSearchParams();
  if (plan) params.set('plan', plan);
  if (email) params.set('email', email);
  if (limit) params.set('limit', String(limit));
  if (cursor) params.set('cursor', cursor);

  const headers = await getAuthHeaders();
  const response = await fetch(apiUrl(`/api/admin/users?${params.toString()}`), { headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiErrorDetail(data.detail) || 'Failed to load users');
  }
  return data;
}

export async function adminSetPlan(uid, planStatus, { reason, seedBetaQuotas = true } = {}) {
  const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
  const response = await fetch(apiUrl(`/api/admin/users/${encodeURIComponent(uid)}/plan`), {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ planStatus, reason, seedBetaQuotas }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiErrorDetail(data.detail) || 'Failed to set plan');
  }
  return data.user;
}

export async function adminSetCounters(uid, fields, { reason } = {}) {
  const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
  const response = await fetch(apiUrl(`/api/admin/users/${encodeURIComponent(uid)}/counters`), {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ set: fields, reason }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiErrorDetail(data.detail) || 'Failed to update counters');
  }
  return data.user;
}

export async function adminResetDevices(uid) {
  const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
  const response = await fetch(
    apiUrl(`/api/admin/users/${encodeURIComponent(uid)}/devices/reset`),
    { method: 'POST', headers, body: '{}' },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiErrorDetail(data.detail) || 'Failed to reset devices');
  }
  return data.user;
}

/**
 * Guest usage, keyed on X-Device-Id. No auth — guests have no token.
 *
 * Guest meters now live in Redis server-side, so this is authoritative. The localStorage
 * tally we used to rely on is only a pre-response hint: clearing it resets the client
 * counter while the server still refuses, which reads as the UI lying.
 */
export async function fetchGuestStatus() {
  const response = await fetch(apiUrl('/api/guest-status'), {
    headers: { 'X-Device-Id': getDeviceId() },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiErrorDetail(data.detail) || 'Failed to load guest status');
  }
  return data;
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


const DETECT_GENOME_SLICE_BYTES = 10 * 1024 * 1024;

async function sliceToLastNewline(file, maxBytes) {
  if (file.size <= maxBytes) return file;
  const rawSlice = file.slice(0, maxBytes);
  const text = await rawSlice.text();
  const lastNewline = text.lastIndexOf('\n');
  if (lastNewline === -1) return rawSlice;
  const completeByteLength = new TextEncoder().encode(text.slice(0, lastNewline + 1)).length;
  return file.slice(0, completeByteLength);
}

export async function detectGenomeBuild(file) {
  const slice = await sliceToLastNewline(file, DETECT_GENOME_SLICE_BYTES);
  const formData = new FormData();
  formData.append('file', slice, file.name);

  // Works for both guests and signed-in users; attach auth if available.
  let headers = {};
  try {
    headers = await getAuthHeaders();
  } catch {
    // guest — no auth header needed, endpoint allows it
  }

  const response = await fetch(apiUrl('/api/detect-genome-build'), {
    method: 'POST',
    headers,
    body: formData,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiErrorDetail(data.detail) || 'Genome detection failed');
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

/** FASTQ/BED filename checks per Module 1 role — mirrors the server-side extension validation. */
export function isAllowedModule1RoleFilename(role, fileName) {
  const n = (fileName || '').toLowerCase();
  if (role === 'bed') return n.endsWith('.bed');
  return n.endsWith('.fastq.gz') || n.endsWith('.fastq') || n.endsWith('.fq.gz') || n.endsWith('.fq');
}

export async function fetchModule1BedCatalog(genome = 'hg38') {
  const headers = await getAuthHeaders();
  const response = await fetch(apiUrl(`/api/module1/bed-catalog?genome=${encodeURIComponent(genome)}`), {
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(parseApiErrorDetail(data.detail) || 'Failed to load BED catalog');
    err.status = response.status;
    throw err;
  }
  return data; // { genome, genome_ready, items }
}

export async function presignModule1Upload({ conversationId, role, fileName, fileSize, contentType }) {
  const headers = {
    ...(await getAuthHeaders()),
    'Content-Type': 'application/json',
  };
  const response = await fetch(apiUrl('/api/module1/presign'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      conversation_id: conversationId,
      role,
      file_name: fileName,
      file_size: fileSize,
      content_type: contentType || 'application/octet-stream',
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(parseApiErrorDetail(data.detail) || 'Failed to prepare upload');
    err.status = response.status;
    throw err;
  }
  return data; // { method, url, s3_key, role, headers, expires_in }
}

export async function module1UrlPreflight({ conversationId, role, fileUrl, fileName }) {
  const headers = {
    ...(await getAuthHeaders()),
    'Content-Type': 'application/json',
  };
  const body = { role, file_url: fileUrl };
  if (fileName) body.file_name = fileName;
  if (conversationId) body.conversation_id = conversationId;
  const response = await fetch(apiUrl('/api/module1/url-preflight'), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(parseApiErrorDetail(data.detail) || 'URL validation failed');
    err.status = response.status;
    err.code = typeof data.detail === 'object' ? data.detail?.code : undefined;
    err.limitBytes = typeof data.detail === 'object' ? data.detail?.limit_bytes : undefined;
    throw err;
  }
  return data; // { ok, role, file_url, file_name, content_length, max_bytes, source_kind }
}

export function module1UrlErrorMessage(error, fallback = 'URL import failed.') {
  if (!error) return fallback;
  if (error.status === 401) return 'Your session expired. Sign in again to import from a URL.';
  if (error.status === 404) return 'This chat is no longer available. Start a new chat and try again.';
  if (error.status === 503) return 'Raw data analysis is unavailable right now. Try again later.';
  if (error.status === 413) {
    const gb = error.limitBytes ? error.limitBytes / 1024 ** 3 : null;
    const limit = gb ? (gb >= 1 ? `${gb.toFixed(0)} GB` : `${Math.round(error.limitBytes / 1024 ** 2)} MB`) : null;
    return limit
      ? `This file is larger than the ${limit} limit for this slot.`
      : error.message || 'This file is too large.';
  }
  return error.message || fallback;
}


export async function module1ImportFromUrl({ conversationId, role, fileUrl, fileName }) {
  const headers = {
    ...(await getAuthHeaders()),
    'Content-Type': 'application/json',
  };
  const response = await fetch(apiUrl('/api/module1/from-url'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      conversation_id: conversationId,
      role,
      file_url: fileUrl,
      file_name: fileName || undefined,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(parseApiErrorDetail(data.detail) || 'URL import failed');
    err.status = response.status;
    err.code = typeof data.detail === 'object' ? data.detail?.code : undefined;
    err.limitBytes = typeof data.detail === 'object' ? data.detail?.limit_bytes : undefined;
    throw err;
  }
  return data; // { ok, conversation_id, role, file_name, s3_key, bytes, source_kind }
}


/**
 * Server-side import of R1/R2 (and optional BED) from URLs.
 *
 * Multi-GB imports legitimately run for many minutes, so there is deliberately NO client-side
 * timeout — one would abort a healthy transfer. `signal` lets the user cancel instead.
 */
export async function module1ImportFromUrls({
  conversationId,
  r1Url,
  r2Url,
  r1FileName,
  r2FileName,
  bedUrl,
  bedFileName,
  signal,
}) {
  const headers = {
    ...(await getAuthHeaders()),
    'Content-Type': 'application/json',
  };
  let response;
  try {
    response = await fetch(apiUrl('/api/module1/from-urls'), {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      conversation_id: conversationId,
      r1_url: r1Url,
      r2_url: r2Url,
      r1_file_name: r1FileName || undefined,
      r2_file_name: r2FileName || undefined,
      bed_url: bedUrl || undefined,
      bed_file_name: bedFileName || undefined,
    }),
    });
  } catch (error) {
    // A dropped connection on a long import surfaces as a bare "Failed to fetch"; name it.
    if (error?.name === 'AbortError') {
      throw Object.assign(new Error('Import cancelled.'), { code: 'IMPORT_CANCELLED' });
    }
    throw Object.assign(
      new Error(
        'The connection dropped while importing. Large files can take several minutes — '
        + 'check your network and try again.',
      ),
      { code: 'IMPORT_NETWORK_ERROR', cause: error },
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(parseApiErrorDetail(data.detail) || 'URL import failed');
    err.status = response.status;
    err.code = typeof data.detail === 'object' ? data.detail?.code : undefined;
    err.limitBytes = typeof data.detail === 'object' ? data.detail?.limit_bytes : undefined;
    throw err;
  }
  return data; // { ok, r1, r2, bed, r1_s3_key, r2_s3_key, custom_bed_s3_key }
}

/**
 * POST /api/module1/validate-bed returns a flat `{ok:true,...}` on 200 but wraps
 * `{ok:false,...}` inside `detail` on 400 — normalize both into one flat shape so
 * callers never need to branch on response.ok.
 */
export async function validateModule1Bed({ conversationId, s3Key, genome = 'hg38' }) {
  const headers = {
    ...(await getAuthHeaders()),
    'Content-Type': 'application/json',
  };
  const response = await fetch(apiUrl('/api/module1/validate-bed'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ conversation_id: conversationId, s3_key: s3Key, genome }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (data.detail && typeof data.detail === 'object') return data.detail;
    const err = new Error(parseApiErrorDetail(data.detail) || 'BED validation failed');
    err.status = response.status;
    throw err;
  }
  return data; // { ok:true, code, message, lines_checked, example_chroms }
}

export async function runModule1Pipeline(payload) {
  const headers = {
    ...(await getAuthHeaders()),
    'Content-Type': 'application/json',
  };
  const response = await fetch(apiUrl('/api/module1/run'), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.detail;
    const err = new Error(parseApiErrorDetail(detail) || 'Failed to start Module 1 run');
    err.status = response.status;
    err.code = typeof detail === 'object' ? detail.code : undefined;
    err.jobId = typeof detail === 'object' ? detail.job_id : undefined;
    throw err;
  }
  return data; // { job_id, conversation_id, status, phase, message }
}

export async function fetchModule1Status(conversationId) {
  const headers = await getAuthHeaders();
  const response = await fetch(apiUrl(`/api/module1/status/${encodeURIComponent(conversationId)}`), {
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(parseApiErrorDetail(data.detail) || 'Failed to fetch Module 1 status');
    err.status = response.status;
    throw err;
  }
  return data;
}

/** Fast, non-authoritative client hint only — the server /validate-bed call remains the real gate. */
export async function precheckBedChromStyle(file) {
  const head = await file.slice(0, 64 * 1024).text();
  const firstDataLine = head.split('\n').find((l) => l.trim() && !l.startsWith('#'));
  if (!firstDataLine) return { ok: null };
  const firstCol = firstDataLine.split(/\s+/)[0] || '';
  return { ok: /^chr/i.test(firstCol), sampleChrom: firstCol };
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

export function getMaxUploadBytes(fileName, limits) {
  const name = (fileName || '').toLowerCase();
  const cohort = limits?.cohort ?? 'guest';
  if (cohort === 'guest') {
    // Backend guest uploads use Pro-sized caps (GUEST_LIMITS_FE_HANDOFF §TL;DR).
    return getProUploadMaxBytes(name, limits?.raw?.proEntitlements);
  }
  if (cohort === 'free') {
    return limits?.upload?.previewMaxBytes ?? DEFAULT_FREE_FILE_SIZE_MB * 1024 * 1024;
  }
  return getProUploadMaxBytes(name, limits?.raw?.proEntitlements);
}

export function getChatMeter(limits) {
  return meterFor(limits, 'chat');
}

export function shouldUsePresignedUpload(fileSize, limits) {
  const cohort = limits?.cohort ?? 'guest';
  if (cohort === 'guest' || cohort === 'free') return false;
  if (!PRO_LIKE.has(cohort) && cohort !== 'beta') return false;
  return fileSize > PRESIGN_UPLOAD_THRESHOLD_BYTES;
}

export async function getExportEligibility(conversationId) {
  const headers = await getAuthHeaders();
  const response = await fetch(
    apiUrl(`/api/export-variants-eligibility/${encodeURIComponent(conversationId)}`),
    { headers },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiErrorDetail(data.detail) || 'Failed to check export eligibility');
  }
  return data;
}

export async function exportVariants(conversationId) {
  const headers = await getAuthHeaders();
  const response = await fetch(
    apiUrl(`/api/export-variants/${encodeURIComponent(conversationId)}`),
    { headers },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(parseApiErrorDetail(data.detail) || 'Export failed');
  }
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const filenameMatch = disposition.match(/filename="(.+?)"/);
  const filename = filenameMatch?.[1] || `variants_${conversationId}.tsv`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Validate an import URL before showing the metadata form.
 * POST /api/upload-variant-file/url-preflight
 */
export async function urlPreflight({ fileUrl, fileName, conversationId, isGuest = false }) {
  const headers = isGuest
    ? { 'Content-Type': 'application/json' }
    : { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
  const body = { file_url: fileUrl, conversation_id: conversationId };
  if (fileName) body.file_name = fileName;
  const response = await fetch(apiUrl('/api/upload-variant-file/url-preflight'), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiErrorDetail(data.detail) || 'URL validation failed');
  }
  return data;
}

/**
 * Import a variant file from URL server-side.
 * POST /api/upload-variant-file/from-url
 */
export async function uploadFromUrl({
  conversationId,
  fileUrl,
  fileName,
  sampleMetadata,
  experimentType,
  phenotypeInfo,
  isGuest = false,
}) {
  const headers = isGuest
    ? { 'Content-Type': 'application/json' }
    : { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
  const body = { conversation_id: conversationId, file_url: fileUrl, file_name: fileName };
  if (sampleMetadata) body.sample_metadata = JSON.stringify(sampleMetadata);
  if (experimentType) body.experiment_type = experimentType;
  if (phenotypeInfo) body.phenotype_info = phenotypeInfo;
  const response = await fetch(apiUrl('/api/upload-variant-file/from-url'), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parseApiErrorDetail(data.detail) || 'URL import failed');
  }
  return data;
}

/**
 * Client-side check: does the pasted URL look like a valid import URL?
 * Accepts https://, s3://, or bare Drive/Dropbox domains.
 */
export function isRecognizedImportUrl(url) {
  const raw = (url || '').trim();
  if (!raw) return false;
  if (raw.toLowerCase().startsWith('s3://')) return true;
  if (/^https?:\/\//i.test(raw)) return true;
  const lower = raw.toLowerCase();
  return (
    lower.includes('drive.google.com') ||
    lower.includes('docs.google.com') ||
    lower.includes('dropbox.com') ||
    lower.includes('dropboxusercontent.com')
  );
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
