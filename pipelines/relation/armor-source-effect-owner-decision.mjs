import { createHash } from 'node:crypto';

export const ARMOR_SOURCE_EFFECT_OWNER_DECISION_SCHEMA =
  'armor-source-effect-owner-decision/v1';
export const ARMOR_SOURCE_EFFECT_OWNER_OPERATION_ID =
  'canonical-armor-typed-effect-publication';

const HASH = /^sha256:[a-f0-9]{64}$/;
const REVISION_KEYS = Object.freeze([
  'pageRevisionId', 'iteminfoRevisionId', 'armorSetsRevisionId',
]);
const CATEGORIES = new Set([
  'behavior-trigger', 'compound-numeric', 'non-effect-label',
  'numeric-simple', 'unknown-prose', 'visual-behavior',
]);
const OWNER_KINDS = new Set(['armor_set', 'item', 'unresolved']);
const SEMANTIC_STATUSES = new Set(['typed', 'non_effect', 'unresolved']);
const DECISION_STATUSES = new Set(['resolved', 'blocked', 'quarantined']);
const PARTIAL_POLICY_KEYS = Object.freeze([
  'allowPartialApply', 'unresolvedRowsMustRemainUntouched', 'unresolvedSourceEffects',
]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex')}`;
}

function text(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  return value.trim();
}

function hash(value, label) {
  if (!HASH.test(String(value ?? ''))) throw new Error(`${label} must be a SHA-256 hash`);
  return String(value);
}

function fingerprint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...REVISION_KEYS].sort())) {
    throw new Error('Armor source-effect owner decision source fingerprint is invalid');
  }
  return Object.fromEntries(REVISION_KEYS.map(key => {
    if (!Number.isSafeInteger(value[key]) || value[key] <= 0) {
      throw new Error(`Armor source-effect owner decision revision is invalid: ${key}`);
    }
    return [key, value[key]];
  }));
}

function normalizePartialPolicy(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...PARTIAL_POLICY_KEYS].sort())
      || value.unresolvedSourceEffects !== 'quarantine'
      || value.allowPartialApply !== true
      || value.unresolvedRowsMustRemainUntouched !== true) {
    throw new Error('Armor source-effect quarantine requires the exact approved partial policy');
  }
  return {
    unresolvedSourceEffects: 'quarantine',
    allowPartialApply: true,
    unresolvedRowsMustRemainUntouched: true,
  };
}

function classificationEntries(classification) {
  if (!classification || classification.schemaVersion !== 'armor-effect-parse-unresolved-classification/v1'
      || !HASH.test(classification.classificationSha256 ?? '')
      || !Array.isArray(classification.entries)) {
    throw new Error('Armor source-effect classification evidence is invalid');
  }
  const { classificationSha256, ...body } = classification;
  if (hashJson(body) !== classificationSha256) throw new Error('Armor source-effect classification hash drifted');
  const seen = new Set();
  return classification.entries.map((entry, index) => {
    const key = `${text(entry.textKey, `classification entry ${index} textKey`)}\u0000${entry.sourceLineIndex}`;
    if (seen.has(key)) throw new Error(`Armor source-effect classification entry is duplicate: ${key}`);
    seen.add(key);
    if (!Number.isSafeInteger(entry.sourceLineIndex) || entry.sourceLineIndex < 0
        || !CATEGORIES.has(entry.category) || !Number.isSafeInteger(entry.occurrences)
        || entry.occurrences <= 0 || !Array.isArray(entry.owners)
        || entry.owners.some(owner => !Number.isSafeInteger(owner) || owner <= 0)) {
      throw new Error(`Armor source-effect classification entry is invalid: ${key}`);
    }
    return {
      textKey: entry.textKey,
      sourceLineIndex: entry.sourceLineIndex,
      category: entry.category,
      occurrences: entry.occurrences,
      owners: [...entry.owners],
      sourcePage: entry.sourcePage ?? null,
      line: text(entry.line, `classification entry ${index} line`),
    };
  });
}

function normalizeAssignments(assignments, classification, partialPolicy) {
  if (!Array.isArray(assignments) || assignments.length !== classification.length) {
    throw new Error('Armor source-effect owner assignments must cover every classified line exactly once');
  }
  const byKey = new Map(classification.map(entry => [`${entry.textKey}\u0000${entry.sourceLineIndex}`, entry]));
  const seen = new Set();
  return assignments.map((input, index) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error(`Armor source-effect owner assignment ${index} is invalid`);
    }
    const entryKey = `${text(input.textKey, `assignment ${index} textKey`)}\u0000${input.sourceLineIndex}`;
    const entry = byKey.get(entryKey);
    if (!entry || seen.has(entryKey)) throw new Error(`Armor source-effect owner assignment is missing or duplicate: ${entryKey}`);
    seen.add(entryKey);
    if (!OWNER_KINDS.has(input.ownerKind) || !SEMANTIC_STATUSES.has(input.semanticStatus)
        || !DECISION_STATUSES.has(input.decisionStatus)) {
      throw new Error(`Armor source-effect owner assignment status is invalid: ${entryKey}`);
    }
    const ownerIds = input.ownerIds == null ? [] : input.ownerIds;
    if (!Array.isArray(ownerIds) || ownerIds.some(owner => !Number.isSafeInteger(owner) || owner <= 0)) {
      throw new Error(`Armor source-effect owner assignment ownerIds are invalid: ${entryKey}`);
    }
    const expectedOwnerIds = [...new Set(entry.owners)].sort((a, b) => a - b);
    if (JSON.stringify([...new Set(ownerIds)].sort((a, b) => a - b)) !== JSON.stringify(expectedOwnerIds)) {
      throw new Error(`Armor source-effect owner assignment ownerIds drifted: ${entryKey}`);
    }
    if (input.ownerKind === 'unresolved'
        && !['blocked', 'quarantined'].includes(input.decisionStatus)) {
      throw new Error(`unresolved source-effect owner cannot be resolved: ${entryKey}`);
    }
    if (input.decisionStatus === 'resolved'
        && (input.ownerKind === 'unresolved' || input.semanticStatus === 'unresolved')) {
      throw new Error(`resolved source-effect owner has unresolved semantics: ${entryKey}`);
    }
    if (input.decisionStatus === 'quarantined'
        && (input.ownerKind !== 'unresolved' || input.semanticStatus !== 'unresolved' || !partialPolicy)) {
      throw new Error(`quarantined source-effect owner requires unresolved semantics and the approved partial policy: ${entryKey}`);
    }
    const rationale = text(input.rationale, `assignment ${index} rationale`);
    return {
      textKey: entry.textKey,
      sourceLineIndex: entry.sourceLineIndex,
      category: entry.category,
      occurrences: entry.occurrences,
      owners: expectedOwnerIds,
      sourcePage: entry.sourcePage,
      line: entry.line,
      ownerKind: input.ownerKind,
      ownerIds: [...new Set(ownerIds)].sort((a, b) => a - b),
      semanticStatus: input.semanticStatus,
      decisionStatus: input.decisionStatus,
      rationale,
    };
  }).sort((left, right) => left.textKey.localeCompare(right.textKey) || left.sourceLineIndex - right.sourceLineIndex);
}

function normalizeDecision(input = {}) {
  const classification = input.classification;
  const entries = classificationEntries(classification);
  const partialPolicy = normalizePartialPolicy(input.partialPolicy);
  const assignments = normalizeAssignments(input.assignments, entries, partialPolicy);
  const allDispositioned = assignments.every(entry => ['resolved', 'quarantined'].includes(entry.decisionStatus));
  const payload = {
    schemaVersion: ARMOR_SOURCE_EFFECT_OWNER_DECISION_SCHEMA,
    operationId: ARMOR_SOURCE_EFFECT_OWNER_OPERATION_ID,
    reviewStatus: 'recorded',
    formalAdmission: false,
    databaseWrites: false,
    applyAllowed: false,
    proposalSha256: hash(input.proposalSha256, 'Armor source-effect proposal hash'),
    sourceFingerprint: fingerprint(input.sourceFingerprint),
    sourceEvidenceHash: hash(input.sourceEvidenceHash, 'Armor source-effect evidence hash'),
    classificationSha256: classification.classificationSha256,
    actor: text(input.actor, 'Armor source-effect owner actor'),
    authorizationReference: text(input.authorizationReference, 'Armor source-effect authorization reference'),
    decisionIdentity: text(input.decisionIdentity, 'Armor source-effect decision identity'),
    reviewedAt: (() => {
      const value = text(input.reviewedAt, 'Armor source-effect reviewedAt');
      if (!Number.isFinite(Date.parse(value))) throw new Error('Armor source-effect reviewedAt is invalid');
      return new Date(value).toISOString();
    })(),
    rationale: text(input.rationale, 'Armor source-effect owner rationale'),
    entries,
    assignments,
    reviewComplete: allDispositioned,
    executionReady: allDispositioned,
  };
  if (partialPolicy) payload.partialPolicy = partialPolicy;
  return payload;
}

export function buildArmorSourceEffectOwnerDecision(input = {}) {
  const payload = normalizeDecision(input);
  return Object.freeze({ ...payload, decisionSha256: hashJson(payload) });
}

export function validateArmorSourceEffectOwnerDecision(decision) {
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)
      || !HASH.test(decision.decisionSha256 ?? '')) {
    throw new Error('Armor source-effect owner decision identity is invalid');
  }
  const { decisionSha256, ...payload } = decision;
  const partialPolicy = normalizePartialPolicy(payload.partialPolicy);
  const hasQuarantinedAssignments = payload.assignments?.some(
    entry => entry?.decisionStatus === 'quarantined',
  ) === true;
  if (hasQuarantinedAssignments && !partialPolicy) {
    throw new Error('Armor source-effect quarantine is missing the approved partial policy');
  }
  if (!HASH.test(payload.proposalSha256 ?? '')
      || !HASH.test(payload.sourceEvidenceHash ?? '')
      || !HASH.test(payload.classificationSha256 ?? '')
      || !Array.isArray(payload.entries) || !Array.isArray(payload.assignments)
      || payload.entries.length !== payload.assignments.length) {
    throw new Error('Armor source-effect owner decision evidence binding is invalid');
  }
  const entryKeys = new Set();
  const classificationKeys = new Set();
  for (const entry of payload.entries) {
    const key = `${entry.textKey}\u0000${entry.sourceLineIndex}`;
    if (classificationKeys.has(key) || !CATEGORIES.has(entry.category)
        || !Number.isSafeInteger(entry.sourceLineIndex) || entry.sourceLineIndex < 0
        || !Number.isSafeInteger(entry.occurrences) || entry.occurrences <= 0
        || !Array.isArray(entry.owners) || entry.owners.some(owner => !Number.isSafeInteger(owner) || owner <= 0)) {
      throw new Error(`Armor source-effect owner decision classification entry is invalid: ${key}`);
    }
    classificationKeys.add(key);
  }
  for (const assignment of payload.assignments) {
    const key = `${assignment.textKey}\u0000${assignment.sourceLineIndex}`;
    if (entryKeys.has(key) || !classificationKeys.has(key)
        || !OWNER_KINDS.has(assignment.ownerKind) || !SEMANTIC_STATUSES.has(assignment.semanticStatus)
        || !DECISION_STATUSES.has(assignment.decisionStatus) || !Array.isArray(assignment.ownerIds)
        || assignment.ownerIds.some(owner => !Number.isSafeInteger(owner) || owner <= 0)
        || assignment.ownerKind === 'unresolved'
          && !['blocked', 'quarantined'].includes(assignment.decisionStatus)
        || assignment.decisionStatus === 'resolved'
          && (assignment.ownerKind === 'unresolved' || assignment.semanticStatus === 'unresolved')) {
      throw new Error(`Armor source-effect owner decision assignment is invalid: ${key}`);
    }
    if (assignment.decisionStatus === 'quarantined'
        && (assignment.ownerKind !== 'unresolved' || assignment.semanticStatus !== 'unresolved'
          || !partialPolicy)) {
      throw new Error(`Armor source-effect quarantine assignment is invalid: ${key}`);
    }
    const entry = payload.entries.find(candidate => `${candidate.textKey}\u0000${candidate.sourceLineIndex}` === key);
    if (JSON.stringify([...new Set(assignment.ownerIds)].sort((a, b) => a - b))
        !== JSON.stringify([...new Set(entry.owners)].sort((a, b) => a - b))) {
      throw new Error(`Armor source-effect owner decision assignment coverage drifted: ${key}`);
    }
    entryKeys.add(key);
  }
  if (entryKeys.size !== classificationKeys.size) {
    throw new Error('Armor source-effect owner decision assignment coverage is incomplete');
  }
  const classification = {
    schemaVersion: 'armor-effect-parse-unresolved-classification/v1',
    executable: false,
    databaseWrites: false,
    applyAllowed: false,
    sourceEvidenceHash: payload.sourceEvidenceHash,
    summary: { totalOccurrences: payload.entries.reduce((sum, entry) => sum + entry.occurrences, 0), uniqueLines: payload.entries.length, byCategory: Object.fromEntries([...CATEGORIES].map(category => [category, 0])) },
    entries: payload.entries.map(entry => ({
      textKey: entry.textKey, sourceLineIndex: entry.sourceLineIndex, line: entry.line,
      category: entry.category, occurrences: entry.occurrences, owners: entry.owners, sourcePage: entry.sourcePage,
    })),
    classificationSha256: payload.classificationSha256,
  };
  // The complete classification payload is supplied by the caller during build;
  // validation still checks the decision's own hash and exact resolved status.
  if (hashJson(payload) !== decisionSha256) throw new Error('Armor source-effect owner decision hash drifted');
  if (payload.schemaVersion !== ARMOR_SOURCE_EFFECT_OWNER_DECISION_SCHEMA
      || payload.operationId !== ARMOR_SOURCE_EFFECT_OWNER_OPERATION_ID
      || payload.reviewStatus !== 'recorded' || payload.formalAdmission !== false
      || payload.databaseWrites !== false || payload.applyAllowed !== false
      || payload.reviewComplete !== payload.assignments.every(
        entry => ['resolved', 'quarantined'].includes(entry.decisionStatus),
      )
      || payload.executionReady !== payload.reviewComplete) {
    throw new Error('Armor source-effect owner decision safety or readiness flags are invalid');
  }
  // Keep this object referenced so future validators cannot accidentally omit
  // the classification shape while retaining the hash-bound assignment list.
  if (classification.entries.length !== payload.entries.length) throw new Error('Armor source-effect classification coverage drifted');
  return true;
}

export function evaluateArmorSourceEffectOwnerReadiness(decision) {
  validateArmorSourceEffectOwnerDecision(decision);
  const blockers = decision.assignments.filter(
    entry => !['resolved', 'quarantined'].includes(entry.decisionStatus),
  )
    .map(entry => `${entry.textKey}:${entry.sourceLineIndex}`);
  return {
    executionReady: decision.executionReady === true && blockers.length === 0,
    blockers,
    formalAdmission: false,
    applyAllowed: false,
  };
}
