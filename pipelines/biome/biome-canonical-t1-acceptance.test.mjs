import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  assertBiomeT1Closure,
  buildBiomeT1LandingRows,
  runBiomeCanonicalT1Acceptance,
  seedBiomeFixtureItems,
  seedBiomeFixtureNpcs,
} from './biome-canonical-t1-acceptance.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/biome-t1.sample.json', import.meta.url), 'utf8'));

test('Biome T1 fixture freezes exact closed identities and source counts', () => {
  assert.deepEqual(fixture.biomes.map(({ code }) => code), ['corruption', 'crimson']);
  assert.equal(fixture.expected.biomeRelations, 2);
  assert.equal(fixture.expected.itemCandidates, 4);
  assert.equal(fixture.expected.npcCandidates, 2);
  assert.deepEqual(fixture.dependencies.items, ['Musket', 'Vilethorn', 'TheUndertaker', 'TheRottedFork']);
  assert.deepEqual(fixture.dependencies.npcs, ['CorruptGoldfish', 'CrimsonGoldfish']);
  assert.deepEqual(seedBiomeFixtureItems({ fixture }), fixture.dependencies.items);
  assert.deepEqual(seedBiomeFixtureNpcs({ fixture }), fixture.dependencies.npcs);
  assert.equal(buildBiomeT1LandingRows({ fixture }).length, 2);
});

test('Biome T1 rejects formal and mismatched database identities before connecting', async () => {
  let connectionCalls = 0;
  const createConnectionImpl = async () => {
    connectionCalls += 1;
    throw new Error('must not connect');
  };
  await assert.rejects(
    () => runBiomeCanonicalT1Acceptance({
      profile: 't1',
      databases: { local: 'terria_v1_local', maint: 'terria_v1_maint', relation: 'terria_v1_relation' },
      createConnectionImpl,
    }),
    /biome T1.*isolated/i,
  );
  await assert.rejects(
    () => runBiomeCanonicalT1Acceptance({
      profile: 't1',
      databases: {
        local: 'terria_v1_automation_acceptance_npc_0123456789abcdef_local',
        maint: 'terria_v1_automation_acceptance_npc_ffffffffffffffff_maint',
        relation: 'terria_v1_automation_acceptance_npc_0123456789abcdef_relation',
      },
      createConnectionImpl,
    }),
    /three-database set/i,
  );
  assert.equal(connectionCalls, 0);
});

test('Biome T1 closure requires exact identities, owned source types, and filtered decoys', () => {
  const valid = {
    fixture,
    importSummary: {
      biomes: { input: 2, created: 2, updated: 0, errors: [] },
      biomeRelations: { input: 2, created: 2, updated: 0, errors: [] },
    },
    maintSync: { rows: { total: 2 }, writes: { inserted: 2, updated: 0 } },
    candidates: {
      itemBiomeCandidates: [
        { biomeCode: 'corruption', itemInternalName: 'Musket' },
        { biomeCode: 'corruption', itemInternalName: 'Vilethorn' },
        { biomeCode: 'crimson', itemInternalName: 'TheUndertaker' },
        { biomeCode: 'crimson', itemInternalName: 'TheRottedFork' },
      ],
      npcBiomeCandidates: [
        { biomeCode: 'corruption', npcInternalName: 'CorruptGoldfish' },
        { biomeCode: 'crimson', npcInternalName: 'CrimsonGoldfish' },
      ],
    },
    resolvedWrites: {
      biomeResources: { created: 4, updated: 0 },
      itemBiomes: { created: 4, updated: 0 },
      itemAcquisitionSources: { created: 4, updated: 0 },
      npcBiomes: { created: 2, updated: 0 },
    },
    readback: {
      biomeCodes: ['corruption', 'crimson'],
      relationPairs: ['corruption->crimson:counterpart', 'crimson->corruption:counterpart'],
      itemPairs: ['corruption:Musket', 'corruption:Vilethorn', 'crimson:TheRottedFork', 'crimson:TheUndertaker'],
      resourcePairs: ['corruption:Musket', 'corruption:Vilethorn', 'crimson:TheRottedFork', 'crimson:TheUndertaker'],
      itemBiomePairs: ['corruption:Musket', 'corruption:Vilethorn', 'crimson:TheRottedFork', 'crimson:TheUndertaker'],
      npcPairs: ['corruption:CorruptGoldfish', 'crimson:CrimsonGoldfish'],
      itemSourceOwnership: Array.from({ length: 4 }, () => ({ sourceRefType: 'biome_wikitext', sourceProvider: 'terraria.wiki.gg', status: 1, deleted: 0 })),
      storedDecoyCount: 6,
      decoyCount: 0,
    },
  };

  assert.doesNotThrow(() => assertBiomeT1Closure(valid));
  assert.throws(() => assertBiomeT1Closure({ ...valid, readback: { ...valid.readback, decoyCount: 1 } }), /decoy/i);
  assert.throws(() => assertBiomeT1Closure({
    ...valid,
    candidates: { ...valid.candidates, npcBiomeCandidates: [{ biomeCode: 'crimson', npcInternalName: 'CrimsonGoldfish' }] },
  }), /candidate/i);
  assert.throws(() => assertBiomeT1Closure({
    ...valid,
    readback: { ...valid.readback, itemSourceOwnership: [{ sourceRefType: 'npc', sourceProvider: 'wiki_gg', status: 1, deleted: 0 }] },
  }), /ownership/i);
});
