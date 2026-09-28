const IMMUNITY_STATUSES = new Set(['parsed', 'section_missing']);
const APPLICABILITY_EVIDENCE_TYPE = 'source-page-contract/v1';

export function classifyBuffPageApplicability(record = {}, { pageClassification = null } = {}) {
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
  // Category probes and current-page metadata are diagnostic only. They do not
  // prove that a missing immunity section is semantically inapplicable.
  if (pageClassification != null) validatePageClassification(record, pageClassification);
  const applicability = evidence.applicability;
  if (applicability == null) return { status: 'unknown', reason: 'missing-applicability-evidence', evidence: null };
  if (applicability.status !== 'not_applicable'
      || applicability.evidenceType !== APPLICABILITY_EVIDENCE_TYPE
      || typeof applicability.reason !== 'string' || !applicability.reason.trim()
      || String(applicability.sourcePageTitle) !== String(evidence.pageTitle)
      || Number(applicability.revisionId) !== Number(evidence.revisionId)) {
    return { status: 'unknown', reason: 'unverified-applicability-claim', evidence: null };
  }
  return { status: 'not_applicable', reason: applicability.reason, evidence: { ...applicability } };
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

function validatePageClassification(record, classification) {
  if (!classification || !Number.isSafeInteger(Number(classification.pageId))
      || !Number.isSafeInteger(Number(classification.revisionId)) || !Array.isArray(classification.categories)) {
    throw new Error('Buff page classification evidence is invalid');
  }
  const source = record.sourceEvidence;
  if (Number(source.revisionId) !== Number(classification.revisionId)
      || String(source.pageTitle) !== String(classification.pageTitle)) {
    throw new Error('Buff page classification revision or title drifted');
  }
}
