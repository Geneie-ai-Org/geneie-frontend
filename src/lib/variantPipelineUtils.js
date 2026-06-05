/** Sidebar denominator: annotated multianno rows when ANNOVAR finished, else upload line count. */
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
