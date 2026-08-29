import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXPECTED_TARGETS,
  PROJECTION_GAP_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID,
  PROJECTION_GAP_WIKI_GG_VARIANT_SCOPE,
  buildProjectionGapWikiGgVariantMutationPlan,
  hashProjectionGapWikiGgVariantScope,
  validateProjectionGapWikiGgVariantInput,
} from './npc-projection-gap-wiki-gg-variant-retirement.mjs';
import {
  CANONICAL_CUTOVER_OPERATION_IDS,
  CANONICAL_OPERATION_DATA_PATHS,
  CANONICAL_OPERATION_ENTRYPOINTS,
} from '../automation/canonical-operation-catalog.mjs';

const PREVIEW_HASH = `sha256:${'a'.repeat(64)}`;
const CANDIDATE_LINEAGE = {
  sourceProvider: 'wiki_gg',
  landingContentHash: 'bc037276bafe2c0df0f2526301140580cd1894a11167d6bf534044c164aa5818',
  landingSourceKey: 'generated.item_relations_bundle:chunk:0001',
  sourceMaintTable: 'maint_item_sources',
};
const SURVIVOR_LINEAGE = {
  sourceProvider: 'terraria.wiki.gg',
  landingContentHash: 'febde906014e59a8cbbcec8d04bf6083c1562d94b9fdcca5cc0a29c61bde6f05',
  landingSourceKey: 'generated.npc_item_relations_bundle',
  sourceMaintTable: 'maint_item_sources',
};

function preview() {
  return {
    schemaVersion: 1,
    operationId: PROJECTION_GAP_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID,
    applyAllowed: false,
    databaseWrites: false,
    externalRequests: false,
    scopeSha256: PROJECTION_GAP_WIKI_GG_VARIANT_SCOPE,
    candidateLineage: CANDIDATE_LINEAGE,
    acceptedSurvivorLineage: SURVIVOR_LINEAGE,
    summary: {
      relationLoot: 4,
      acceptedSurvivors: 4,
      localRowsTargeted: 0,
      projectionRowsTargeted: 0,
    },
    rows: EXPECTED_TARGETS.map((target) => ({
      ...target,
      candidateLineage: CANDIDATE_LINEAGE,
      survivorLineage: SURVIVOR_LINEAGE,
      disposition: 'quarantine_projection_gap_wiki_gg_variant',
    })),
  };
}

function input(overrides = {}) {
  return {
    schemaVersion: 1,
    operationId: PROJECTION_GAP_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID,
    apply: true,
    databaseWrites: true,
    externalRequests: false,
    scopeSha256: PROJECTION_GAP_WIKI_GG_VARIANT_SCOPE,
    previewSha256: PREVIEW_HASH,
    expectedCounts: { relationLoot: 4 },
    writeTargets: ['relation.item_npc_loot_relations.projection_gap_wiki_gg_variant'],
    ...overrides,
  };
}

test('projection-gap wiki_gg retirement freezes the exact four old relation rows', () => {
  const value = preview();
  assert.doesNotThrow(() => validateProjectionGapWikiGgVariantInput({ input: input(), preview: value, previewSha256: PREVIEW_HASH }));
  assert.deepEqual(buildProjectionGapWikiGgVariantMutationPlan(value), {
    keys: { relationLoot: EXPECTED_TARGETS.map((target) => target.candidateRecordKey) },
    counts: { relationLoot: 4 },
  });
});

test('projection-gap scope is deterministic and catalogued', () => {
  assert.equal(hashProjectionGapWikiGgVariantScope(), PROJECTION_GAP_WIKI_GG_VARIANT_SCOPE);
  assert.equal(new Set(EXPECTED_TARGETS.map((target) => target.candidateRecordKey)).size, 4);
  assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(PROJECTION_GAP_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID));
  assert.equal(CANONICAL_OPERATION_ENTRYPOINTS[PROJECTION_GAP_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID], 'pipelines/npc-canonical/npc-projection-gap-wiki-gg-variant-retirement.mjs');
  assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS[PROJECTION_GAP_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID], [
    'reports/authorization/canonical/canonical-npc-projection-gap-wiki-gg-variant-retirement.input.json',
    'reports/runtime/local-data-chain-closure/20260819/post-parent-conflict/npc-projection-gap-wiki-gg-variant-retirement-preview.json',
  ]);
});

test('projection-gap retirement rejects a non-wiki_gg or non-survivor lineage', () => {
  const value = preview();
  value.rows[0].candidateLineage = { ...CANDIDATE_LINEAGE, sourceProvider: 'terraria.wiki.gg' };
  assert.throws(() => validateProjectionGapWikiGgVariantInput({ input: input(), preview: value, previewSha256: PREVIEW_HASH }), /drifted/);

  const survivorDrift = preview();
  survivorDrift.rows[0].survivorRecordKey = 'f'.repeat(64);
  assert.throws(() => validateProjectionGapWikiGgVariantInput({ input: input(), preview: survivorDrift, previewSha256: PREVIEW_HASH }), /survivorRecordKey drifted|duplicate projection gap survivor/);
});

test('projection-gap retirement rejects any local or projection write target', () => {
  assert.throws(() => validateProjectionGapWikiGgVariantInput({
    input: input({ writeTargets: ['local.npc_loot_entries'] }),
    preview: preview(),
    previewSha256: PREVIEW_HASH,
  }), /write targets drifted/);
});
