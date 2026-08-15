import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runItemCanonicalBaseEntityRestorationProposal,
} from './build-item-canonical-base-entity-restoration-proposal.mjs';

test('restoration proposal is read-only and builds an exact five-row canonical contract', async () => {
  const events = [];
  const proposal = await runItemCanonicalBaseEntityRestorationProposal({
    generatedAt: '2026-08-05T03:00:00.000Z',
    expiresAt: '2026-08-05T04:00:00.000Z',
    target: { host: '127.0.0.1', port: 13306, serverUuid: 'test', databases: { maint: 'terria_v1_maint', relation: 'terria_v1_relation' } },
    standardized: standardized(),
    sourceBytesSha256: `sha256:${'a'.repeat(64)}`,
    proposalAuthorization: { decisionIdentity: 'test-admin', path: 'reports/test', sha256: `sha256:${'b'.repeat(64)}`, authorizationHash: `sha256:${'c'.repeat(64)}` },
  }, {
    openReadOnlyConnection: async () => ({
      query: async (sql) => { events.push(sql); },
      rollback: async () => events.push('ROLLBACK'),
      end: async () => events.push('END'),
    }),
    readSnapshot: async () => ({
      legacyMaintRows: legacyRows('sourceId'),
      legacyRelationRows: legacyRows('sourceId'),
      legacyProjectionRows: legacyRows('id'),
      legacyProjectileAudits: legacyRows('itemSourceId'),
      protectedReferences: [],
      managedImages: images(),
    }),
  });

  assert.equal(proposal.maintRows.length, 5);
  assert.equal(proposal.relationRows.length, 5);
  assert.equal(proposal.projectionRows.length, 5);
  assert.equal(proposal.legacyMaintRows.length, 5);
  assert.equal(proposal.legacyProjectileAudits.length, 5);
  assert.deepEqual(events, ['START TRANSACTION READ ONLY', 'ROLLBACK', 'END']);
});

function standardized() {
  const names = ['AntlionEggs', 'BoneWhip', 'RoninShirt', 'TVHeadPants', 'TimelessTravelerHood'];
  const ids = [5067, 5074, 5049, 5063, 5051];
  return {
    entity: 'items', schemaVersion: '1.0.0', generatedAt: '2026-03-28T11:24:36.383Z',
    upstreamMeta: { fetchedAt: '2026-03-27T11:05:29.937Z', moduleGeneratedAt: '2026-03-09 22:43:19 (+00:00)', source: 'terraria.wiki.gg:Module:Iteminfo/data', sourcePageTitle: 'Module:Iteminfo/data', sourceRevisionTimestamp: '2026-03-09T22:52:58Z', wikiVersion: '1.4.5.6' },
    records: names.map((internalName, index) => ({ id: ids[index], internalName, name: internalName, rarityId: 2, economy: { buy: 0, sell: 0 }, stats: { damage: 0, defense: 0, knockback: 0, useTime: 0, width: 18, height: 14 }, stack: { stackSize: 1 }, status: 1 })),
  };
}

function images() {
  return ['AntlionEggs', 'BoneWhip', 'RoninShirt', 'TVHeadPants', 'TimelessTravelerHood'].map((itemInternalName) => ({ recordKey: `image-${itemInternalName}`, itemInternalName, cachedUrl: `/terrapedia-images/items/2026/08/05/${itemInternalName}.png`, isPrimary: 1, status: 1, deleted: 0 }));
}

function legacyRows(idField) {
  const names = ['FestiveTopHat', 'Wiesnbrau', 'HeartArrow', 'TurkeyFeather', 'ValentineRing'];
  const ids = [5067, 5074, 5049, 5063, 5051];
  return names.map((internalName, index) => ({
    [idField]: ids[index], internalName, itemInternalName: internalName,
    recordKey: `legacy-${internalName}`, sourcePage: `旧版:${internalName}`,
    terrariaVersion: 'legacy', rawJson: '{"legacyNpcShopItem":true}', status: 1, deleted: 0,
  }));
}
