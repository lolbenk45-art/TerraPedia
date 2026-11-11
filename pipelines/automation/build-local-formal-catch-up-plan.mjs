import { createHash } from 'node:crypto';

import { admitFormalCatchUpDomain } from './local-formal-catch-up-classifier.mjs';

export const LOCAL_FORMAL_CATCH_UP_DOMAIN_ORDER = Object.freeze([
  'items', 'npcs', 'projectiles', 'audio', 'bosses', 'armor_sets', 'buffs', 'shimmer',
]);

const SHA256 = /^sha256:[a-f0-9]{64}$/i;

function requireText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} is required`);
  return normalized;
}

function sha256Json(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function validHash(value) {
  return SHA256.test(String(value ?? ''));
}

function tableIdentity(value) {
  if (typeof value === 'string') return value;
  const table = String(value?.table ?? '').trim();
  const databaseRole = String(value?.databaseRole ?? '').trim();
  return table && databaseRole ? `${databaseRole}.${table}` : table;
}

function policyOwnsCanonicalTables(policy, canonicalTables) {
  const owned = new Set((policy?.policy?.ownedTables ?? []).map(tableIdentity).filter(Boolean));
  return canonicalTables.every((table) => {
    const key = tableIdentity(table);
    if (!key) return false;
    if (owned.has(key)) return true;
    return typeof table === 'string' && [...owned].some((value) => value.endsWith(`.${key}`));
  });
}

function immutableSourceSnapshot(value, sourceFingerprint) {
  const artifactHash = value?.sha256 ?? value?.snapshotHash;
  return Boolean(value
    && String(value.path ?? '').trim()
    && (value.immutable === true || value.snapshotHash != null)
    && validHash(artifactHash)
    && value.sourceFingerprint === sourceFingerprint);
}

function block(classification, name, reason, evidence) {
  return {
    ...classification,
    classification: name,
    reason,
    writeAllowed: false,
    ...(evidence === undefined ? {} : { admissionEvidence: evidence }),
  };
}

export function buildLocalFormalCatchUpPlan({
  runId,
  targetVersionContext,
  formalServer,
  classifications,
  dependencies = {},
  canonical = {},
  policies = [],
  sourceSnapshots = {},
  codeBundleSha256 = null,
  sourceProbeReportSha256 = null,
  consumerReadbackSha256 = null,
} = {}) {
  const normalizedRunId = requireText(runId, 'runId');
  const normalizedVersion = requireText(targetVersionContext, 'targetVersionContext');
  if (!formalServer || formalServer.host !== '127.0.0.1' || Number(formalServer.port) !== 13306
      || !String(formalServer.serverUuid ?? '').trim()) {
    throw new Error('formalServer must bind the verified local MySQL identity');
  }
  if (!Array.isArray(classifications) || classifications.length === 0) {
    throw new TypeError('domain classifications are required');
  }
  if (!Array.isArray(policies)) throw new TypeError('policies must be an array');
  for (const [label, value] of Object.entries({ codeBundleSha256, sourceProbeReportSha256, consumerReadbackSha256 })) {
    if (value != null && !validHash(value)) throw new Error(`${label} must be a sha256 identity`);
  }

  const classificationByDomain = new Map();
  for (const entry of classifications) {
    const domain = requireText(entry?.domain, 'classification domain');
    if (!LOCAL_FORMAL_CATCH_UP_DOMAIN_ORDER.includes(domain)) throw new Error(`unsupported catch-up domain: ${domain}`);
    if (classificationByDomain.has(domain)) throw new Error(`duplicate catch-up classification for ${domain}`);
    if (entry.targetVersionContext !== normalizedVersion) throw new Error(`target version context drifted for ${domain}`);
    classificationByDomain.set(domain, entry);
  }
  const policyByDomain = new Map(policies.map((entry) => [String(entry?.domainId ?? ''), entry]));

  const domains = LOCAL_FORMAL_CATCH_UP_DOMAIN_ORDER
    .filter((domain) => classificationByDomain.has(domain))
    .map((domain) => {
      let classification = classificationByDomain.get(domain);
      if (classification.classification === 'behind') {
        const snapshot = sourceSnapshots[domain];
        if (!immutableSourceSnapshot(snapshot, classification.sourceIdentity?.fingerprint)) {
          classification = block(classification, 'source_blocked', 'immutable_source_snapshot_missing', snapshot ?? null);
        } else {
          const readiness = canonical[domain] ?? {};
          const canonicalTables = Array.isArray(readiness.ownedTables) ? readiness.ownedTables : [];
          const policy = policyByDomain.get(domain);
          if (readiness.ready === true && readiness.apiParity === true
              && !policyOwnsCanonicalTables(policy, canonicalTables)) {
            classification = block(classification, 'canonical_blocked', 'canonical_scope_exceeds_registered_policy', {
              canonicalOwnedTables: canonicalTables,
              policyOwnedTables: policy?.policy?.ownedTables ?? [],
            });
          } else {
            classification = admitFormalCatchUpDomain({
              classification,
              dependencies: dependencies[domain],
              canonical: readiness,
            });
          }
          classification = {
            ...classification,
            sourceSnapshot: {
              path: String(snapshot.path),
              sha256: snapshot.sha256 ?? snapshot.snapshotHash,
              sourceFingerprint: snapshot.sourceFingerprint,
            },
          };
        }
      }

      return {
        domain,
        targetVersionContext: normalizedVersion,
        classification: classification.classification,
        reason: classification.reason,
        sourceIdentity: classification.sourceIdentity ?? null,
        formalIdentity: classification.formalIdentity ?? null,
        dependencyEvidence: dependencies[domain] ?? null,
        canonicalEvidence: canonical[domain] ?? null,
        policy: policyByDomain.get(domain) ?? null,
        sourceSnapshot: classification.sourceSnapshot ?? null,
        ownedTables: classification.ownedTables ?? [],
        writeAllowed: classification.writeAllowed === true,
      };
    });

  const actionScope = domains.filter((entry) => entry.classification === 'ready' && entry.writeAllowed).map((entry) => entry.domain);
  const policyIdentity = [...policyByDomain.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([domain, entry]) => ({ domain, version: entry.currentVersion, hash: entry.policyHash }));
  const status = actionScope.length > 0 ? 'ready' : 'blocked';

  return {
    schemaVersion: 'local-formal-catch-up-plan/v1',
    operation: 'local-formal-catch-up',
    runId: normalizedRunId,
    generatedAt: new Date().toISOString(),
    targetVersionContext: normalizedVersion,
    formalServer: { host: formalServer.host, port: Number(formalServer.port), serverUuid: formalServer.serverUuid },
    status,
    reason: status === 'blocked' ? 'no_canonical_ready_domains' : 'canonical_ready_domains_admitted',
    policySetHash: sha256Json(policyIdentity),
    codeBundleSha256,
    sourceProbeReportSha256,
    consumerReadbackSha256,
    domains,
    actionScope,
    writePolicy: {
      allowedOperations: ['insert', 'update'],
      deletesAllowed: false,
      truncateAllowed: false,
      tableScopeExpansionAllowed: false,
    },
    execution: {
      serial: true,
      domainOrder: [...LOCAL_FORMAL_CATCH_UP_DOMAIN_ORDER],
      maxConcurrentDomains: 1,
      naturalTickOnly: true,
      manualSweepAllowed: false,
      schedulerAfterWindow: { enabled: false, mode: 'changed-only' },
    },
  };
}
