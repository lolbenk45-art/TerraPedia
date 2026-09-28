const IMMUNITY_STATUSES = new Set(['parsed', 'section_missing']);

export function classifyBuffPageApplicability(record = {}) {
  const evidence = record?.sourceEvidence;
  if (!evidence || typeof evidence !== 'object') throw new Error('Buff source evidence is required');
  const group = evidence.factGroups?.immuneNpcs;
  if (!group || typeof group !== 'object' || !IMMUNITY_STATUSES.has(group.status)) {
    throw new Error('Buff immunity fact-group status is invalid');
  }
  if (group.status === 'parsed') {
    if (!Array.isArray(group.sections) || group.sections.length === 0) {
      throw new Error('parsed Buff immunity evidence requires sections');
    }
    return { status: 'parsed', reason: 'section-parsed', evidence: null };
  }
  const applicability = evidence.applicability;
  if (applicability == null) {
    return { status: 'unknown', reason: 'missing-applicability-evidence', evidence: null };
  }
  if (applicability?.status !== 'not_applicable'
      || typeof applicability.reason !== 'string' || !applicability.reason.trim()) {
    throw new Error('Buff applicability evidence requires not_applicable status and reason');
  }
  return {
    status: 'not_applicable',
    reason: applicability.reason,
    evidence: { status: 'not_applicable', reason: applicability.reason },
  };
}

export function summarizeBuffSourceApplicability(records = []) {
  if (!Array.isArray(records)) throw new TypeError('Buff source records must be an array');
  const summary = { total: records.length, parsed: 0, notApplicable: 0, unknown: 0 };
  for (const record of records) {
    const status = classifyBuffPageApplicability(record).status;
    if (status === 'parsed') summary.parsed += 1;
    else if (status === 'not_applicable') summary.notApplicable += 1;
    else summary.unknown += 1;
  }
  return summary;
}
