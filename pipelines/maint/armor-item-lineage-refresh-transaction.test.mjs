import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildArmorItemLineageRefreshProposal,
  validateArmorItemLineageRefreshProposal,
} from './armor-item-lineage-refresh-transaction.mjs';
import { buildArmorItemLineageRefreshCandidate } from './armor-item-lineage-refresh.mjs';

const source = {
  pageTitle: 'Module:Iteminfo/data', pageId: 18021, revisionId: 1023241,
  revisionTimestamp: '2026-08-22T03:26:22Z', fetchedAt: '2026-10-06T10:00:00.000Z',
  wikitext: 'return { ["data"] = [=====[{"_terrariaversion":"1.4.5.8","_generated":"2026-08-22","1546":{"internalName":"ShroomiteHeadgear","name":"Shroomite Headgear","defense":11,"headSlot":103,"bodySlot":-1,"legSlot":-1},"1547":{"internalName":"ShroomiteMask","name":"Shroomite Mask","defense":11,"headSlot":104,"bodySlot":-1,"legSlot":-1},"1548":{"internalName":"ShroomiteHelmet","name":"Shroomite Helmet","defense":11,"headSlot":105,"bodySlot":-1,"legSlot":-1},"1549":{"internalName":"ShroomiteBreastplate","name":"Shroomite Breastplate","defense":24,"headSlot":-1,"bodySlot":67,"legSlot":-1},"1550":{"internalName":"ShroomiteLeggings","name":"Shroomite Leggings","defense":16,"headSlot":-1,"bodySlot":-1,"legSlot":56}}]=====] }',
};
const current = id => ({
  id, source_id: id, internal_name: ({1546:'ShroomiteHeadgear',1547:'ShroomiteMask',1548:'ShroomiteHelmet',1549:'ShroomiteBreastplate',1550:'ShroomiteLeggings'})[id],
  english_name: `item-${id}`, name_zh: null, source_provider: 'terraria.wiki.gg', source_page: 'Module:Iteminfo/data', source_revision_timestamp: '2026-03-09T22:52:58.000Z', landing_source_id: 6470, landing_source_key: 'wiki.module.iteminfo', landing_source_page: 'Module:Iteminfo/data', landing_content_hash: '6'.repeat(64), landing_fetched_at: '2026-03-27 11:05:29', landing_parsed_at: '2026-03-27 11:05:29', module_generated_at: '2026-03-09 22:43:19', terraria_version: '1.4.5.6', major_value: null, combat_value: null, defense_value: 11, use_time: null, stack_size: 1, width: 18, height: 18, flags_json: null, raw_json: '{}', status: 1, deleted: 0,
});

function candidate() {
  return buildArmorItemLineageRefreshCandidate({
    source,
    sourceArtifactPath: '.local/tmp/source.json', sourceArtifactSha256: '2'.repeat(64), sourceArtifactByteSize: 10,
    currentLocalLandings: [], currentMaintLandings: [], currentMaintItems: [1546,1547,1548,1549,1550].map(current),
  });
}

test('proposal is hash-bound and fail-closed for writes', () => {
  const proposal = buildArmorItemLineageRefreshProposal({ candidate: candidate(), serverUuid: 'server-1' });
  assert.equal(proposal.databaseWrites, false);
  assert.equal(proposal.applyAllowed, false);
  assert.doesNotThrow(() => validateArmorItemLineageRefreshProposal(proposal));
  assert.throws(() => validateArmorItemLineageRefreshProposal({ ...proposal, serverUuid: 'server-2' }), /hash|identity/i);
});

test('proposal rejects a candidate that expands beyond the five target updates', () => {
  const value = candidate();
  value.changes.maintItems.updates.push(value.changes.maintItems.updates[0]);
  assert.throws(() => buildArmorItemLineageRefreshProposal({ candidate: value, serverUuid: 'server-1' }), /scope|hash|candidate/i);
});
