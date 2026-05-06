import crypto from 'node:crypto';

function createCandidateKey(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function hasCombatEvidence({ revisionText, profileKind, leadText, pageDescription }) {
  const text = `${revisionText ?? ''}\n${profileKind ?? ''}\n${leadText ?? ''}\n${pageDescription ?? ''}`.toLowerCase();
  return /(^|\n)==\s*combat\s*==/i.test(String(revisionText ?? ''))
    || text.includes(' enemy')
    || text.includes('enemies|enemy')
    || text.includes('fires ')
    || text.includes('projectile');
}

function buildCandidate({
  domain,
  entityId,
  entitySourceId,
  pageTitle,
  missingField,
  recommendedAction,
  evidence
}) {
  return {
    candidateKey: createCandidateKey({
      domain,
      entityType: 'npc',
      entityInternalName: entityId,
      entitySourceId: entitySourceId ?? null,
      missingField,
      evidence
    }),
    domain,
    entityType: 'npc',
    entityInternalName: entityId ?? null,
    entitySourceId: entitySourceId ?? null,
    missingField,
    recommendedAction,
    evidenceJson: [
      {
        sourcePage: pageTitle ?? null,
        parserSection: evidence.parserSection,
        rowText: evidence.rowText ?? null,
        reason: evidence.reason
      }
    ],
    status: 'open'
  };
}

export function buildNpcBackfillCandidates({
  entityId = null,
  entitySourceId = null,
  pageTitle = null,
  revisionText = '',
  profileKind = '',
  leadText = '',
  pageDescription = '',
  lootRows = [],
  projectileId = null
} = {}) {
  const candidates = [];
  const combatEvidence = hasCombatEvidence({ revisionText, profileKind, leadText, pageDescription });

  if (combatEvidence && (!Array.isArray(lootRows) || lootRows.length === 0)) {
    candidates.push(buildCandidate({
      domain: 'npc_item_relation',
      entityId,
      entitySourceId,
      pageTitle,
      missingField: 'loot',
      recommendedAction: 'crawl_npc_page',
      evidence: {
        parserSection: 'drops',
        reason: 'combat_npc_without_loot_rows'
      }
    }));
  }

  if (combatEvidence && !String(projectileId ?? '').trim()) {
    candidates.push(buildCandidate({
      domain: 'npc_projectile_relation',
      entityId,
      entitySourceId,
      pageTitle,
      missingField: 'projectileId',
      recommendedAction: 'crawl_npc_page',
      evidence: {
        parserSection: 'combat',
        reason: 'combat_npc_without_projectile_id'
      }
    }));
  }

  return candidates;
}
