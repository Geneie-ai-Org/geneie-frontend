import { PHENOTYPE_FILTER_DISPLAY_NAME } from '@/lib/filterDisplayNames';
export function variantFileRowCountForSidebar(convData, vm = {}) {
  const annotated =
    convData?.annotated_multianno_row_count ??
    convData?.variant_filter_working_set_count ??
    vm?.annotated_row_count ??
    null;
  if (convData?.annotated_file_s3_key && annotated != null && Number(annotated) > 0) {
    return Number(annotated);
  }
  return Number(convData?.s3_variant_line_count ?? vm?.total_variants ?? 0) || 0;
}

export function buildVariantDataFromConversation(convData, vm) {
  const fileLineCount = variantFileRowCountForSidebar(convData, vm);
  return {
    parameter_ranges: vm.parameter_ranges || {},
    categorical_columns: vm.categorical_columns || {},
    columns: vm.columns || [],
    numeric_columns: vm.numeric_columns || [],
    all_unique_values: vm.all_unique_values || {},
    total_variants: fileLineCount,
    annotated_row_count: convData.annotated_multianno_row_count ?? vm.annotated_row_count ?? null,
    parameter_ranges_from_full_file: Boolean(vm.parameter_ranges_from_full_file),
    filtered_variants: null,
    no_valid_values_columns: vm.no_valid_values_columns || [],
    sample_only_ingest: convData.variant_ingest_mode === 'sample_only' || Boolean(vm.sample_only_ingest),
    interpretation_sample_rows: vm.interpretation_sample_rows || null,
    s3_line_count_status: convData.s3_line_count_status || vm.s3_line_count_status || null,
  };
}

export function formatAnnovarProgressMessage(message) {
  if (!message || typeof message !== 'string') {
    return 'Annotating your variants with clinical and population databases…';
  }
  const m = message.trim();
  if (/lightsail|worker processing|batches on|s3_key|s3:\/\//i.test(m)) {
    const countMatch = m.match(/([\d,]+)\s+variant/i);
    const count = countMatch ? countMatch[1] : null;
    if (count) {
      const n = parseInt(count.replace(/,/g, ''), 10);
      if (!Number.isNaN(n) && n <= 500) {
        return `Annotating ${count} variants — usually just a few minutes.`;
      }
      if (count) {
        return `Annotating ${count} variants with clinical and population databases. Large files can take a while.`;
      }
    }
    return 'Annotating your variants with clinical and population databases…';
  }
  if (/^ANNOVAR chunk \d+\/\d+$/i.test(m)) {
    return m.replace(/^ANNOVAR chunk/i, 'Annotating your variants — step').replace('/', ' of ') + '…';
  }
  if (/ANNOVAR started\. Poll GET/i.test(m)) {
    return 'Starting annotation…';
  }
  return m
    .replace(/^Counted ([\d,]+) variant lines\. Starting ANNOVAR worker/i, 'Found $1 variants. Starting annotation')
    .replace(/ANNOVAR worker running/i, 'Annotation in progress');
}

export function normalizeChatEligibilityMessage(message) {
  if (!message || typeof message !== 'string') return message;
  return message
    .replace(/ClinVar prioritization\s*\(Filter\s*1\)/gi, 'the ACMG filter')
    .replace(/ClinVar prioritization/gi, 'the ACMG filter')
    .replace(/\bFilter\s*1\b/gi, 'ACMG filter');
}

const GUEST_ELIGIBILITY_DEFAULTS = {
  s3_line_count_status: null,
  enrichment_status: null,
  enrichment_phase: null,
  enrichment_message: null,
  enrichment_progress_percent: null,
  literature_status: null,
  advanced_chat_status: null,
};

export const GUEST_CHAT_MAX_VARIANTS_WITHOUT_FILTER = 100;

/** True when ACMG or Exomiser proprietary filter is active. */
export function isProprietaryPrioritizationFilter(activeProprietaryFilter) {
  return activeProprietaryFilter === 'filter_1' || activeProprietaryFilter === 'filter_3';
}

/**
 * Rows the chat/pipeline UI should treat as "under consideration".
 * With ACMG/Exomiser, that is the prioritized keep-set (e.g. 2), not the file denominator (e.g. 1,000).
 */
export function resolveVariantsUnderConsideration({
  activeProprietaryFilter = null,
  filteredVariantCount = null,
  filterWorkingSetCount = null,
  fileTotal = null,
  eligibilityUnderCount = null,
} = {}) {
  const hasProprietary = isProprietaryPrioritizationFilter(activeProprietaryFilter);
  if (hasProprietary && filteredVariantCount != null) {
    return Number(filteredVariantCount);
  }
  if (eligibilityUnderCount != null) {
    return Number(eligibilityUnderCount);
  }
  if (filteredVariantCount != null) {
    return Number(filteredVariantCount);
  }
  if (filterWorkingSetCount != null) {
    return Number(filterWorkingSetCount);
  }
  if (fileTotal != null) {
    return Number(fileTotal);
  }
  return null;
}

/** Guest pipeline/chat eligibility — never leaves `allowed: null` (avoids stuck "Checking…"). */
export function buildGuestChatEligibility({
  hasAnnotatedFile = false,
  isRunningAnnovar = false,
  annovarJobStatus = null,
  variantCount = null,
  variantsUnderConsideration = null,
  activeProprietaryFilter = null,
  maxVariantsWithoutFilter = GUEST_CHAT_MAX_VARIANTS_WITHOUT_FILTER,
} = {}) {
  const annovarRunning = isRunningAnnovar || annovarJobStatus === 'running';
  const annovarFailed = annovarJobStatus === 'failed';
  const annovarDone = hasAnnotatedFile || annovarJobStatus === 'completed';

  if (annovarRunning) {
    return {
      ...GUEST_ELIGIBILITY_DEFAULTS,
      allowed: false,
      message: 'Annotation is running in the background.',
      reason: 'ANNOVAR_RUNNING',
      requires_annovar: true,
      requires_filter: false,
      variants_under_consideration: variantCount,
    };
  }

  if (annovarFailed) {
    return {
      ...GUEST_ELIGIBILITY_DEFAULTS,
      allowed: false,
      message: 'ANNOVAR did not complete. Open details to retry.',
      reason: 'ANNOVAR_FAILED',
      requires_annovar: true,
      requires_filter: false,
      variants_under_consideration: variantCount,
    };
  }

  if (annovarDone) {
    const under = variantsUnderConsideration ?? variantCount;
    const hasProprietary = isProprietaryPrioritizationFilter(activeProprietaryFilter);
    const needsFilter =
      !hasProprietary && under != null && under > maxVariantsWithoutFilter;

    if (hasProprietary) {
      const label = activeProprietaryFilter === 'filter_3' ? PHENOTYPE_FILTER_DISPLAY_NAME : 'ACMG';
      const countLabel =
        under != null ? `${Number(under).toLocaleString()} variant${under === 1 ? '' : 's'}` : 'your prioritized set';
      return {
        ...GUEST_ELIGIBILITY_DEFAULTS,
        allowed: true,
        message: `Chat is using your ${label}-prioritized set (${countLabel}). Sign up to save history.`,
        reason: null,
        requires_annovar: false,
        requires_filter: false,
        variants_under_consideration: under,
      };
    }

    if (needsFilter) {
      return {
        ...GUEST_ELIGIBILITY_DEFAULTS,
        allowed: false,
        message: `This file has ${Number(under).toLocaleString()} variant rows. Apply the ACMG or ${PHENOTYPE_FILTER_DISPLAY_NAME} filter to enable guest chat.`,
        reason: 'CHAT_REQUIRES_FILTER',
        requires_annovar: false,
        requires_filter: true,
        variants_under_consideration: under,
      };
    }

    return {
      ...GUEST_ELIGIBILITY_DEFAULTS,
      allowed: true,
      message:
        'Annotation complete. Start chatting below — sign up to save history and unlock filters.',
      reason: null,
      requires_annovar: false,
      requires_filter: false,
      variants_under_consideration: under,
    };
  }

  return {
    ...GUEST_ELIGIBILITY_DEFAULTS,
    allowed: false,
    message: 'Run ANNOVAR to annotate your variants, then chat or apply filters.',
    reason: 'CHAT_REQUIRES_ANNOVAR',
    requires_annovar: true,
    requires_filter: false,
    variants_under_consideration: variantCount,
  };
}

/** Apply conversation fields returned by guest-safe status endpoints (annovar-status / filter-status). */
export function guestStatusPayloadToConversationStub(payload) {
  if (!payload?.variant_metadata) return null;
  const vm = payload.variant_metadata;
  return {
    annotated_file_s3_key: payload.annotated_file_s3_key || null,
    annotated_multianno_row_count: payload.annotated_multianno_row_count ?? vm.annotated_row_count ?? null,
    s3_variant_line_count: payload.s3_variant_line_count ?? vm.total_variants ?? null,
    s3_line_count_status: payload.s3_line_count_status || vm.s3_line_count_status || null,
    variant_ingest_mode: payload.variant_ingest_mode || null,
  };
}

/** Contextual guest CTA under the pipeline drawer (replaces blanket "sign in to run ANNOVAR"). */
export function getGuestPipelineCta({
  hasAnnotatedFile = false,
  isRunningAnnovar = false,
  annovarJob = null,
  chatEligibility = null,
  onSignUp,
  onApplyFilter,
} = {}) {
  if (isRunningAnnovar || annovarJob?.status === 'running') return null;

  if (annovarJob?.status === 'failed') {
    return {
      message: 'Annotation failed on this preview. Sign up for full support and saved history.',
      action: onSignUp ? { label: 'Sign up free', onClick: onSignUp } : null,
    };
  }

  if (hasAnnotatedFile || annovarJob?.status === 'completed') {
    if (!chatEligibility?.allowed && chatEligibility?.reason === 'CHAT_REQUIRES_FILTER') {
      return {
        message:
          chatEligibility.message ||
          'Large variant set — apply the ACMG filter to enable guest chat, or sign up for full analysis.',
        action: onApplyFilter ? { label: 'Apply ACMG filter', onClick: onApplyFilter } : null,
        secondaryAction: onSignUp ? { label: 'Sign up free', onClick: onSignUp } : null,
      };
    }
    if (chatEligibility?.allowed) {
      return {
        message: null,
        action: onSignUp ? { label: 'Sign up free', onClick: onSignUp } : null,
      };
    }
    if (chatEligibility?.message) {
      return {
        message: chatEligibility.message,
        action: onSignUp ? { label: 'Sign up free', onClick: onSignUp } : null,
      };
    }
  }

  return {
    message: 'Guest preview includes one ANNOVAR run and 5 chat exchanges on this device.',
    action: onSignUp ? { label: 'Sign up for full analysis', onClick: onSignUp } : null,
  };
}
