import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBuffNpcSecondaryProposal,
  validateBuffNpcSecondaryProposal,
} from './buff-npc-secondary-apply.mjs';
import { buildBuffNpcSecondaryCandidate, hashJson } from './buff-npc-secondary-candidate.mjs';

const TARGET_IDS = Array.from({ length: 12 }, (_, index) => 389 + index);
const SERVER_UUID = 'b4ae6728-4f72-11f1-bcc9-00155d37eadf';
const MAINT_BUFFS = TARGET_IDS.map((sourceId, index) => ({
  id: 413 + index,
  source_id: sourceId,
  internal_name: `Buff${sourceId}`,
  landing_source_id: 12553,
  landing_source_key: 'canonical.buff-page-immunity.buff-insert-only-20261006-v2-389-400',
  landing_content_hash: 'd'.repeat(64),
  source_provider: 'terraria.wiki.gg',
  source_page: 'Template:GetBuffInfo',
  source_revision_timestamp: '2026-08-22 05:46:54',
}));

test('accepts a separately bound variable NPC identity scope while preserving proposal hashes', () => {
  const candidate = buildBuffNpcSecondaryCandidate({
    facts: [{
      factGroup: 'immuneNpcs',
      buffSourceId: 389,
      buffInternalName: 'Buff389',
      sourceInternalName: 'DungeonGuardian',
      sourceName: 'Dungeon Guardian',
      stableSourceId: 68,
      maintSourceId: 68,
      maintInternalName: 'DungeonGuardian',
      classification: 'resolved-page-target-source-id',
      promotable: true,
      sourceOrder: 0,
    }, {
      factGroup: 'immuneNpcs',
      buffSourceId: 397,
      buffInternalName: 'Buff397',
      sourceInternalName: 'LunaticCultist',
      sourceName: 'Lunatic Cultist',
      stableSourceId: null,
      maintSourceId: null,
      maintInternalName: null,
      classification: 'ambiguous-page-target-variant-source-id',
      promotable: false,
      sourceOrder: 0,
    }],
    maintBuffRows: MAINT_BUFFS,
    currentRows: [],
    targetBuffIds: TARGET_IDS,
    serverUuid: SERVER_UUID,
  });
  candidate.scopeContract = {
    schemaVersion: 'buff-npc-secondary-identity-scope/v1',
    discoverySha256: `sha256:${'a'.repeat(64)}`,
    promotableCount: 1,
    deferredCount: 1,
  };
  candidate.candidateSha256 = hashJson(Object.fromEntries(
    Object.entries(candidate).filter(([key]) => key !== 'candidateSha256'),
  ));

  const proposal = buildBuffNpcSecondaryProposal({
    candidate,
    candidateArtifactSha256: `sha256:${'b'.repeat(64)}`,
    currentRows: [],
  });

  assert.equal(proposal.changes.inserts.length, 1);
  assert.equal(proposal.summary.deferredCount, 1);
  assert.deepEqual(proposal.source.scopeContract, candidate.scopeContract);
  assert.equal(validateBuffNpcSecondaryProposal(proposal), true);
});
