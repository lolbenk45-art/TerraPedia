import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const OWNER = 'item-source-lane';

export function parseBuildItemSourceGovernedPartitionArgs(argv = process.argv.slice(2)) {
  const options = Object.fromEntries(argv.map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }));
  const parsed = {
    candidatePlanPath: options['candidate-plan'] ?? options.candidatePlan ?? options.input,
    dryRunReportPath: options['dry-run-report'] ?? options.dryRunReport ?? options.dryRun,
    outputPath: options.output
  };
  for (const [key, value] of Object.entries(parsed)) {
    if (!value) throw new Error(`${key} is required`);
  }
  return parsed;
}

export function buildItemSourceGovernedPartition({ candidates, dryRun, generatedAt = new Date().toISOString() } = {}) {
  validateInputs(candidates, dryRun);

  const eligibleCandidates = Array.isArray(candidates.eligibleCandidates) ? candidates.eligibleCandidates : [];
  const blockedCandidates = Array.isArray(candidates.blockedCandidates) ? candidates.blockedCandidates : [];
  const exemptCandidates = Array.isArray(candidates.explicitSourceExemptionCandidates)
    ? candidates.explicitSourceExemptionCandidates
    : [];
  const candidateIndex = buildCandidateIndex([...eligibleCandidates, ...blockedCandidates, ...exemptCandidates]);
  const plannedRows = Array.isArray(dryRun.plannedRows) ? dryRun.plannedRows : [];
  const plannedFingerprints = new Set(plannedRows.map((row) => requiredText(row.fingerprint, 'planned row fingerprint')));
  const duplicateByFingerprint = new Map();

  for (const row of Array.isArray(dryRun.skipped) ? dryRun.skipped : []) {
    if (row.reason !== 'duplicate') continue;
    const fingerprint = requiredText(row.fingerprint, 'duplicate fingerprint');
    if (!plannedFingerprints.has(fingerprint)) {
      throw new Error(`duplicate fingerprint is absent from planned rows: ${fingerprint}`);
    }
    duplicateByFingerprint.set(fingerprint, row);
  }

  const dryRunBlockers = new Map();
  for (const row of [...(dryRun.blocked ?? []), ...(dryRun.validationErrors ?? [])]) {
    const fingerprint = normalizeText(row.fingerprint);
    if (fingerprint) dryRunBlockers.set(fingerprint, row);
  }

  const acceptedRows = [];
  const duplicateRows = [];
  const quarantineRows = [];
  const blockedRows = [];
  const acceptedIdentities = new Set();

  for (const row of plannedRows) {
    const candidate = findCandidate(candidateIndex, row);
    const source = findCandidateSource(candidate, row);
    const sourceIdentity = buildSourceIdentity(row, source);
    const base = buildEvidenceRow({ candidate, source, row, sourceIdentity });
    const duplicate = duplicateByFingerprint.get(row.fingerprint);
    if (duplicate) {
      duplicateRows.push({
        ...base,
        existingRowId: toNullableInteger(duplicate.id),
        reason: 'duplicate',
        nextAction: 'manual_review'
      });
      continue;
    }

    const dryRunBlocker = dryRunBlockers.get(row.fingerprint);
    const identityProblem = validateCandidateIdentity(candidate, row);
    if (dryRunBlocker || identityProblem) {
      blockedRows.push({
        ...base,
        reason: identityProblem ?? normalizeText(dryRunBlocker.reason) ?? 'dry-run-validation-failed',
        nextAction: identityProblem ? 'repair_identity' : nextActionFor(dryRunBlocker.reason)
      });
      continue;
    }

    const classification = normalizeText(candidate?.classification) ?? 'unclassified';
    if (classification !== 'high_confidence') {
      quarantineRows.push({
        ...base,
        classification,
        reason: classification,
        nextAction: nextActionFor(classification)
      });
      continue;
    }

    const sourceTrace = normalizeSourceTrace(source?.lineage ?? candidate?.lineage ?? row.lineage, row.itemId);
    if (!sourceTrace) {
      quarantineRows.push({
        ...base,
        classification,
        reason: 'missing-four-layer-evidence',
        nextAction: 'local_evidence_required'
      });
      continue;
    }

    if (acceptedIdentities.has(base.sourceIdentityHash)) {
      throw new Error(`duplicate accepted source identity: ${base.sourceIdentityHash}`);
    }
    acceptedIdentities.add(base.sourceIdentityHash);
    acceptedRows.push({ ...base, classification, sourceTrace });
  }

  for (const candidate of blockedCandidates) {
    for (const source of candidate.blockedSources ?? []) {
      blockedRows.push(buildNonPlannedRow(candidate, source, {
        reason: source.blockedReason ?? candidate.blockedReason ?? 'blocked-source-row',
        nextAction: nextActionFor(source.blockedReason ?? candidate.blockedReason)
      }));
    }
  }
  for (const candidate of exemptCandidates) {
    for (const source of candidate.exemptedSources ?? []) {
      quarantineRows.push(buildNonPlannedRow(candidate, source, {
        reason: candidate.exemptionReason ?? source.exemptionStatus ?? 'explicit-source-exemption',
        nextAction: 'manual_review'
      }));
    }
  }

  const selectedSourceRowCount = acceptedRows.length + duplicateRows.length + quarantineRows.length + blockedRows.length;
  const candidateItemCount = eligibleCandidates.length + blockedCandidates.length + exemptCandidates.length;
  const candidateItems = countCandidateItemLanes({
    candidates: [...eligibleCandidates, ...blockedCandidates, ...exemptCandidates],
    acceptedRows,
    duplicateRows,
    quarantineRows,
    blockedRows
  });
  const partition = {
    schemaVersion: 'item-source-governed-partition-v1',
    generatedAt,
    readOnly: true,
    acceptedRows,
    duplicateRows,
    quarantineRows,
    blockedRows,
    summary: {
      candidateItemCount,
      selectedSourceRowCount,
      accepted: acceptedRows.length,
      duplicates: duplicateRows.length,
      quarantine: quarantineRows.length,
      blocked: blockedRows.length,
      unclassified: 0,
      candidateItems
    }
  };
  partition.scopeHash = hashCanonical({
    schemaVersion: partition.schemaVersion,
    acceptedRows,
    duplicateRows,
    quarantineRows,
    blockedRows
  });
  return partition;
}

function validateInputs(candidates, dryRun) {
  if (!candidates?.readOnly || dryRun?.apply !== false) {
    throw new Error('candidate and dry-run evidence must be read-only');
  }
  if (!Array.isArray(dryRun.plannedRows)) throw new Error('dry-run plannedRows is required');
}

function countCandidateItemLanes({ candidates, acceptedRows, duplicateRows, quarantineRows, blockedRows }) {
  const laneNames = {
    accepted: new Set(acceptedRows.map((row) => normalizeIdentity(row.itemInternalName))),
    duplicates: new Set(duplicateRows.map((row) => normalizeIdentity(row.itemInternalName))),
    quarantine: new Set(quarantineRows.map((row) => normalizeIdentity(row.itemInternalName))),
    blocked: new Set(blockedRows.map((row) => normalizeIdentity(row.itemInternalName)))
  };
  const counts = { accepted: 0, duplicates: 0, quarantine: 0, blocked: 0, unclassified: 0 };
  for (const candidate of candidates) {
    const key = normalizeIdentity(candidate.itemInternalName);
    if (laneNames.accepted.has(key)) counts.accepted += 1;
    else if (laneNames.quarantine.has(key)) counts.quarantine += 1;
    else if (laneNames.blocked.has(key)) counts.blocked += 1;
    else if (laneNames.duplicates.has(key)) counts.duplicates += 1;
    else counts.unclassified += 1;
  }
  return counts;
}

function buildCandidateIndex(candidates) {
  const index = new Map();
  for (const candidate of candidates) {
    const key = normalizeIdentity(candidate.itemInternalName);
    if (!key) continue;
    if (index.has(key)) throw new Error(`duplicate candidate identity: ${candidate.itemInternalName}`);
    index.set(key, candidate);
  }
  return index;
}

function findCandidate(index, row) {
  return index.get(normalizeIdentity(row.itemInternalName)) ?? null;
}

function findCandidateSource(candidate, row) {
  if (!candidate) return null;
  const sources = [
    ...(candidate.plannedSources ?? []),
    ...(candidate.blockedSources ?? []),
    ...(candidate.exemptedSources ?? [])
  ];
  return sources.find((source) => sourceMatchesRow(source, candidate, row)) ?? null;
}

function sourceMatchesRow(source, candidate, row) {
  return normalizeIdentity(source.sourceType) === normalizeIdentity(row.sourceType)
    && normalizeIdentity(source.sourceRefType) === normalizeIdentity(row.sourceRefType)
    && resolveSourceRefId(source) === toNullableInteger(row.sourceRefId)
    && normalizeIdentity(source.sourceRefName) === normalizeIdentity(row.sourceRefName)
    && normalizeIdentity(source.sourcePage ?? candidate.pageTitle) === normalizeIdentity(row.sourcePage)
    && normalizeText(source.chanceText) === normalizeText(row.chanceText)
    && normalizeText(source.quantityText) === normalizeText(row.quantityText)
    && normalizeText(source.conditions) === normalizeText(row.conditions);
}

function buildEvidenceRow({ candidate, source, row, sourceIdentity }) {
  const evidence = {
    rawPath: normalizeText(candidate?.rawPath),
    importPlanKey: normalizeText(source?.importPlanKey),
    sourceRevisionTimestamp: normalizeText(source?.sourceRevisionTimestamp ?? row.sourceRevisionTimestamp),
    sourceIdentity
  };
  return {
    itemInternalName: normalizeText(row.itemInternalName ?? candidate?.itemInternalName),
    sourceIdentity,
    sourceIdentityHash: hashCanonical(sourceIdentity),
    evidenceHash: hashCanonical(evidence),
    owner: OWNER
  };
}

function buildNonPlannedRow(candidate, source, { reason, nextAction }) {
  const row = candidateSourceAsRow(candidate, source);
  const sourceIdentity = buildSourceIdentity(row, source);
  return {
    ...buildEvidenceRow({ candidate, source, row, sourceIdentity }),
    classification: normalizeText(candidate.classification) ?? 'blocked',
    reason,
    nextAction
  };
}

function candidateSourceAsRow(candidate, source) {
  return {
    itemId: toNullableInteger(candidate?.itemResolution?.id),
    itemInternalName: candidate?.itemInternalName,
    sourceType: source?.sourceType,
    sourceRefType: source?.sourceRefType,
    sourceRefId: resolveSourceRefId(source),
    sourceRefName: source?.sourceRefName,
    sourcePage: source?.sourcePage ?? candidate?.pageTitle,
    chanceText: source?.chanceText,
    quantityText: source?.quantityText,
    conditions: source?.conditions,
    sourceRevisionTimestamp: source?.sourceRevisionTimestamp
  };
}

function buildSourceIdentity(row, source) {
  const itemId = toNullableInteger(row.itemId);
  if (itemId == null) throw new Error('source identity itemId is required');
  return {
    itemId,
    sourceType: requiredText(row.sourceType, 'sourceType'),
    sourceRefType: requiredText(row.sourceRefType, 'sourceRefType'),
    sourceRefId: toNullableInteger(row.sourceRefId),
    sourceRefInternalName: normalizeText(source?.resolvedRef?.internalName ?? source?.sourceRefInternalNameHint ?? row.sourceRefInternalName),
    sourceRefName: normalizeText(row.sourceRefName),
    sourcePage: normalizeText(row.sourcePage),
    chanceText: normalizeText(row.chanceText),
    quantityText: normalizeText(row.quantityText),
    conditions: normalizeText(row.conditions)
  };
}

function validateCandidateIdentity(candidate, row) {
  if (!candidate || candidate.itemResolution?.status !== 'resolved') return 'item_identity_unresolved';
  if (toNullableInteger(candidate.itemResolution.id) !== toNullableInteger(row.itemId)) return 'item_identity_mismatch';
  const expectedInternalName = normalizeIdentity(candidate.itemResolution.internalName ?? candidate.itemInternalName);
  if (expectedInternalName !== normalizeIdentity(row.itemInternalName)) return 'item_identity_mismatch';
  return null;
}

function normalizeSourceTrace(lineage, itemId) {
  if (!lineage || !HASH_PATTERN.test(lineage.rawEvidenceHash ?? '')) return null;
  const maintRecordKey = normalizeText(lineage.maintRecordKey);
  const relationRecordKey = normalizeText(lineage.relationRecordKey);
  const localItemId = toNullableInteger(lineage.localItemId);
  if (!maintRecordKey || !relationRecordKey || localItemId !== toNullableInteger(itemId)) return null;
  return {
    rawEvidenceHash: lineage.rawEvidenceHash,
    maintRecordKey,
    relationRecordKey,
    localItemId
  };
}

function nextActionFor(reason) {
  const normalized = normalizeIdentity(reason) ?? '';
  if (normalized.includes('identity') || normalized.includes('unresolved') || normalized.includes('refmissing')) return 'repair_identity';
  if (normalized.includes('family') || normalized.includes('external')) return 'external_evidence_required';
  if (normalized.includes('polluted') || normalized.includes('parser')) return 'parser_policy';
  if (normalized.includes('evidence') || normalized.includes('lineage')) return 'local_evidence_required';
  return 'manual_review';
}

function resolveSourceRefId(source) {
  return toNullableInteger(source?.resolvedRef?.id ?? source?.sourceRefId);
}

function requiredText(value, label) {
  const text = normalizeText(value);
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function normalizeText(value) {
  if (value == null) return null;
  const normalized = String(value).normalize('NFKC').trim();
  return normalized || null;
}

function normalizeIdentity(value) {
  return normalizeText(value)?.toLowerCase() ?? null;
}

function toNullableInteger(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function hashCanonical(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseBuildItemSourceGovernedPartitionArgs();
  const candidates = JSON.parse(await fs.readFile(args.candidatePlanPath, 'utf8'));
  const dryRun = JSON.parse(await fs.readFile(args.dryRunReportPath, 'utf8'));
  const partition = buildItemSourceGovernedPartition({ candidates, dryRun });
  await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
  await fs.writeFile(args.outputPath, `${JSON.stringify(partition, null, 2)}\n`);
  console.log(JSON.stringify({ output: args.outputPath, scopeHash: partition.scopeHash, summary: partition.summary }));
}
