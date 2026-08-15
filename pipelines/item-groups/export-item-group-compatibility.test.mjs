import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const compatibility = await import('./export-item-group-compatibility.mjs').catch(() => ({}));

function group(overrides = {}) {
  return {
    canonicalKey: 'any-wood',
    canonicalName: 'Any Wood',
    displayNameEn: 'Any Wood',
    displayNameZh: '任意木材',
    aliases: ['Wood Group'],
    domains: ['recipe'],
    sourceLayer: 'recipe_reference',
    sourcePriority: 100,
    sourceKind: 'generated_recipe_reference',
    sourceProvider: 'terraria.wiki.gg',
    sourcePage: 'Recipes',
    sourceRevisionTimestamp: '2026-07-01T00:00:00Z',
    sourceMetadata: { sourceFile: 'recipe-evidence.json', sourceUrls: ['https://example.test'] },
    status: 'ACTIVE',
    blockReason: null,
    members: [{
      itemId: 9,
      internalName: 'Wood',
      name: 'Wood',
      nameZh: '木材',
    }],
    ...overrides,
  };
}

function canonicalSnapshot() {
  return compatibility.buildItemGroupCompatibilitySnapshot({
    landingRevision: 'landing-revision-17',
    groups: [
      group(),
      group({
        canonicalKey: 'any-pylon',
        canonicalName: 'Any Pylon',
        displayNameEn: 'Any Pylon',
        displayNameZh: '任何晶塔',
        aliases: ['Any Teleportation Pylon'],
        domains: ['shimmer'],
        sourceLayer: 'source_group',
        sourcePriority: 300,
        sourceKind: 'curated_wiki_item_group',
        members: [{ itemId: 4876, internalName: 'TeleportationPylonPurity', name: 'Forest Pylon', nameZh: '森林晶塔' }],
      }),
      group({
        canonicalKey: 'recorded-music-boxes',
        canonicalName: 'Recorded Music Boxes',
        displayNameEn: 'Recorded Music Boxes',
        displayNameZh: '录音后的八音盒',
        aliases: [],
        domains: ['shimmer'],
        sourceLayer: 'source_group',
        sourcePriority: 300,
        sourceKind: 'blocked_consumer_reference',
        status: 'BLOCKED',
        blockReason: 'member list is not source-backed',
        members: [],
      }),
    ],
    exclusions: [{
      canonicalKey: 'any-wood',
      canonicalName: 'Any Wood',
      memberKey: 'BorealWood',
      reason: 'reviewed omission',
      actor: 'bootstrap.recipe_group_overrides',
      evidenceReference: 'evidence://recipe-overrides',
    }],
  });
}

function recipeEvidence(overrides = {}) {
  return {
    landingRevision: 'landing-revision-17',
    generatedAt: '2026-07-01T00:00:00Z',
    sourceType: 'wiki_gg_live_english_recipes',
    sourceUrls: ['https://terraria.wiki.gg/wiki/Recipes'],
    recipeSourcePages: ['Recipes/By Hand'],
    sourcePageSnapshots: [{ pageTitle: 'Recipes/By Hand', revisionId: 17 }],
    supplementalRecipes: [{ result: 'Work Bench' }],
    ...overrides,
  };
}

test('canonical compatibility exports round-trip every governed field and snapshot hash', () => {
  assert.equal(typeof compatibility.exportItemGroupCompatibility, 'function');
  assert.equal(typeof compatibility.parseItemGroupCompatibilityExports, 'function');
  const snapshot = canonicalSnapshot();

  const exported = compatibility.exportItemGroupCompatibility({
    snapshot,
    recipeEvidence: recipeEvidence(),
    exportRunKey: 'export-run-17',
  });
  const reparsed = compatibility.parseItemGroupCompatibilityExports(exported);

  assert.deepEqual(reparsed, snapshot);
  for (const artifact of Object.values(exported)) {
    assert.equal(artifact.artifactRole, 'compat_export');
    assert.equal(artifact.canonicalSnapshotHash, snapshot.snapshotHash);
    assert.equal(artifact.exportRunKey, 'export-run-17');
  }
  assert.deepEqual(exported.recipeMaterialReference.supplementalRecipes, [{ result: 'Work Bench' }]);
  assert.equal(exported.itemGroupOverrides.blockedGroups.length, 1);
  assert.equal(exported.recipeGroupOverrides.exclusions.length, 1);
});

test('compatibility export is deterministic for reordered canonical input', () => {
  const snapshot = canonicalSnapshot();
  const reordered = compatibility.buildItemGroupCompatibilitySnapshot({
    landingRevision: snapshot.landingRevision,
    groups: [...snapshot.groups].reverse(),
    exclusions: [...snapshot.exclusions].reverse(),
  });

  const first = compatibility.exportItemGroupCompatibility({
    snapshot,
    recipeEvidence: recipeEvidence(),
    exportRunKey: 'export-run-17',
  });
  const second = compatibility.exportItemGroupCompatibility({
    snapshot: reordered,
    recipeEvidence: recipeEvidence(),
    exportRunKey: 'export-run-17',
  });

  assert.equal(snapshot.snapshotHash, reordered.snapshotHash);
  assert.deepEqual(first, second);
});

test('recipe compatibility merge blocks unavailable or mismatched non-group evidence', () => {
  const snapshot = canonicalSnapshot();
  assert.throws(
    () => compatibility.exportItemGroupCompatibility({
      snapshot,
      recipeEvidence: recipeEvidence({ landingRevision: 'different-revision' }),
      exportRunKey: 'export-run-17',
    }),
    /landing revision mismatch/i,
  );
  assert.throws(
    () => compatibility.exportItemGroupCompatibility({
      snapshot,
      exportRunKey: 'export-run-17',
    }),
    /recipe non-group evidence is required/i,
  );
});

test('exporter accepts only a read-only snapshot boundary and no database writer credentials', async () => {
  assert.throws(
    () => compatibility.exportItemGroupCompatibility({
      snapshot: canonicalSnapshot(),
      recipeEvidence: recipeEvidence(),
      exportRunKey: 'export-run-17',
      writerCredentials: { password: 'forbidden' },
    }),
    /writer credentials are forbidden/i,
  );

  const source = await readFile(new URL('./export-item-group-compatibility.mjs', import.meta.url), 'utf8').catch(() => '');
  assert.doesNotMatch(source, /mysql|createConnection|DB_PASSWORD|DATABASE_URL/);
});
