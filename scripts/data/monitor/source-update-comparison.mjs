export function compareWikiSourceFingerprint({
  source,
  apiFingerprint,
  ingestedRecord
} = {}) {
  if (!ingestedRecord) {
    return buildResult({
      changed: true,
      status: 'missing_ingestion_manifest',
      source,
      apiFingerprint,
      ingestedRecord,
      compareField: null,
      currentValue: null,
      ingestedValue: null
    });
  }

  if (ingestedRecord.contentHash != null) {
    return compareField({
      source,
      apiFingerprint,
      ingestedRecord,
      field: 'contentHash'
    });
  }
  if (ingestedRecord.revisionId != null) {
    return compareField({
      source,
      apiFingerprint,
      ingestedRecord,
      field: 'revisionId'
    });
  }
  return compareField({
    source,
    apiFingerprint,
    ingestedRecord,
    field: 'revisionTimestamp'
  });
}

function compareField({ source, apiFingerprint, ingestedRecord, field }) {
  const currentValue = apiFingerprint?.[field] ?? null;
  const ingestedValue = ingestedRecord?.[field] ?? null;
  if (currentValue == null) {
    return buildResult({
      changed: false,
      status: 'error',
      source,
      apiFingerprint,
      ingestedRecord,
      compareField: field,
      currentValue,
      ingestedValue
    });
  }
  return buildResult({
    changed: String(currentValue) !== String(ingestedValue),
    status: 'ok',
    source,
    apiFingerprint,
    ingestedRecord,
    compareField: field,
    currentValue,
    ingestedValue
  });
}

function buildResult({
  changed,
  status,
  source,
  apiFingerprint,
  ingestedRecord,
  compareField,
  currentValue,
  ingestedValue
}) {
  return {
    changed,
    status,
    currentValue,
    ingestedValue,
    previousValue: ingestedValue,
    meta: {
      compareBasis: 'ingestion-manifest',
      compareField,
      apiRevisionId: apiFingerprint?.revisionId ?? null,
      ingestedRevisionId: ingestedRecord?.revisionId ?? null
    }
  };
}
