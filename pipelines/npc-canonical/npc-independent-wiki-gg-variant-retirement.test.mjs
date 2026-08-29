import assert from 'node:assert/strict';
import test from 'node:test';

let INDEPENDENT_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID;
let buildIndependentWikiGgVariantMutationPlan;
let validateIndependentWikiGgVariantInput;
let loadError = null;

try {
  ({
    INDEPENDENT_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID,
    buildIndependentWikiGgVariantMutationPlan,
    validateIndependentWikiGgVariantInput,
  } = await import('./npc-independent-wiki-gg-variant-retirement.mjs'));
} catch (error) {
  loadError = error;
}

const SCOPE = 'sha256:78fa79a468bf72f4c289fc82056e6e250cea41c33da8dbd449e2fae9f93c052c';
const PREVIEW_HASH = `sha256:${'a'.repeat(64)}`;
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

function preview() {
  return {
    applyAllowed: false,
    databaseWrites: false,
    externalRequests: false,
    scopeSha256: SCOPE,
    targetLineage: TARGET_LINEAGE,
    acceptedSurvivorLineage: ACCEPTED_LINEAGE,
    summary: {
      candidateLootRelations: 52,
      candidateSourceFacts: 52,
      acceptedSurvivors: 52,
      localRowsTargeted: 0,
      projectionRowsTargeted: 0,
    },
    rows: Array.from({ length: 52 }, (_, index) => ({
      candidateRecordKey: `target-${index}`,
      sourceFactKey: `fact-${index}`,
      sourceMaintRecordKey: `maint-${index}`,
      stableIdentity: `identity-${index}`,
      candidateLineage: TARGET_LINEAGE,
      expectedAcceptedSurvivors: [{
        recordKey: `survivor-${index}`,
        sourceFactKey: `survivor-fact-${index}`,
        lineage: ACCEPTED_LINEAGE,
      }],
      disposition: 'quarantine_independent_wiki_gg_variant',
    })),
  };
}

function input(overrides = {}) {
  return {
    schemaVersion: 1,
    operationId: 'canonical-npc-independent-wiki-gg-variant-retirement',
    apply: true,
    databaseWrites: true,
    externalRequests: false,
    scopeSha256: SCOPE,
    previewSha256: PREVIEW_HASH,
    expectedCounts: { relationLoot: 52 },
    writeTargets: ['relation.item_npc_loot_relations.independent_wiki_gg_variant'],
    ...overrides,
  };
}

test('independent wiki_gg retirement accepts only the exact relation-only scope', () => {
  if (loadError) assert.fail(`operation module must exist: ${loadError.code ?? loadError.message}`);

  assert.equal(INDEPENDENT_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID, input().operationId);
  assert.doesNotThrow(() => validateIndependentWikiGgVariantInput({ input: input(), preview: preview(), previewSha256: PREVIEW_HASH }));
  assert.deepEqual(buildIndependentWikiGgVariantMutationPlan(preview()), {
    keys: { relationLoot: Array.from({ length: 52 }, (_, index) => `target-${index}`) },
    survivorKeys: Array.from({ length: 52 }, (_, index) => `survivor-${index}`),
    counts: { relationLoot: 52, survivors: 52 },
  });
});

test('independent wiki_gg retirement rejects a local or projection write target before database work', () => {
  if (loadError) assert.fail(`operation module must exist: ${loadError.code ?? loadError.message}`);

  assert.throws(() => validateIndependentWikiGgVariantInput({
    input: input({ writeTargets: ['relation.item_npc_loot_relations.independent_wiki_gg_variant', 'local.npc_loot_entries'] }),
    preview: preview(),
    previewSha256: PREVIEW_HASH,
  }), /write targets drifted/);
});
