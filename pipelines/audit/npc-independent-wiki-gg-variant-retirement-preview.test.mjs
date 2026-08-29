import assert from 'node:assert/strict';
import test from 'node:test';

let buildIndependentWikiGgVariantRetirementPreview;
let loadError = null;

try {
  ({ buildIndependentWikiGgVariantRetirementPreview } = await import('./npc-independent-wiki-gg-variant-retirement-preview.mjs'));
} catch (error) {
  loadError = error;
}

const TARGET_LINEAGE = {
  sourceProvider: 'wiki_gg',
  landingContentHash: 'bc037276bafe2c0df0f2526301140580cd1894a11167d6bf534044c164aa5818',
  landingSourceKey: 'generated.item_relations_bundle:chunk:0001',
  sourceMaintTable: 'maint_item_sources',
};
const ACCEPTED_LINEAGE = {
  sourceProvider: 'terraria.wiki.gg',
  landingContentHash: 'febde906014e59a8cbbcec8d04bf6083c1562d94b9fdcca5cc0a29c61bde6f05',
  landingSourceKey: 'generated.npc_item_relations_bundle',
  sourceMaintTable: 'maint_item_sources',
};

function target(index, overrides = {}) {
  return {
    recordKey: `target-${index}`,
    sourceFactKey: `target-fact-${index}`,
    sourceMaintRecordKey: `target-maint-${index}`,
    npcInternalName: `Npc${index}`,
    itemInternalName: `Item${index}`,
    quantityText: '1',
    chanceText: '5%',
    conditions: 'Normal mode row',
    ...TARGET_LINEAGE,
    status: 1,
    deleted: 0,
    ...overrides,
  };
}

function survivor(index, overrides = {}) {
  return {
    recordKey: `survivor-${index}`,
    sourceFactKey: `survivor-fact-${index}`,
    sourceMaintRecordKey: `survivor-maint-${index}`,
    npcInternalName: `Npc${index}`,
    itemInternalName: `Item${index}`,
    quantityText: '1',
    chanceText: '5%',
    conditions: null,
    ...ACCEPTED_LINEAGE,
    quantityMin: 1,
    quantityMax: 1,
    chanceValue: 0.05,
    status: 1,
    deleted: 0,
    ...overrides,
  };
}

function targetFact(index, overrides = {}) {
  return {
    recordKey: `target-fact-${index}`,
    ...TARGET_LINEAGE,
    status: 1,
    deleted: 0,
    ...overrides,
  };
}

test('independent wiki_gg preview freezes only active relation identities with one accepted survivor', () => {
  if (loadError) assert.fail(`preview module must exist: ${loadError.code ?? loadError.message}`);

  const preview = buildIndependentWikiGgVariantRetirementPreview({
    targetRelations: Array.from({ length: 52 }, (_, index) => target(index)),
    acceptedRelations: Array.from({ length: 52 }, (_, index) => survivor(index)),
    sourceFacts: Array.from({ length: 52 }, (_, index) => targetFact(index)),
    generatedAt: '2026-08-19T00:00:00.000Z',
  });

  assert.equal(preview.applyAllowed, false);
  assert.equal(preview.databaseWrites, false);
  assert.equal(preview.externalRequests, false);
  assert.equal(preview.summary.candidateLootRelations, 52);
  assert.equal(preview.summary.candidateSourceFacts, 52);
  assert.equal(preview.summary.acceptedSurvivors, 52);
  assert.equal(preview.summary.localRowsTargeted, 0);
  assert.equal(preview.summary.projectionRowsTargeted, 0);
  assert.deepEqual(preview.rows.map((row) => row.candidateRecordKey), Array.from({ length: 52 }, (_, index) => `target-${index}`).sort());
  assert.match(preview.scopeSha256, /^sha256:[a-f0-9]{64}$/);
});

test('independent wiki_gg preview rejects ambiguous survivors and source-fact lineage drift', () => {
  if (loadError) assert.fail(`preview module must exist: ${loadError.code ?? loadError.message}`);

  const preview = buildIndependentWikiGgVariantRetirementPreview({
    targetRelations: [target(1), target(2)],
    acceptedRelations: [survivor(1), survivor(1, { recordKey: 'survivor-duplicate' }), survivor(2)],
    sourceFacts: [targetFact(1), targetFact(2, { sourceProvider: 'wrong-provider' })],
  });

  assert.deepEqual(preview.rows, []);
  assert.deepEqual(preview.quarantine.ambiguousSurvivor.map((row) => row.candidateRecordKey), ['target-1']);
  assert.deepEqual(preview.quarantine.sourceFactLineageDrift.map((row) => row.candidateRecordKey), ['target-2']);
});
