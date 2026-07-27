import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const bootstrap = await import('./item-group-bootstrap.mjs').catch(() => ({}));

const artifactUrls = {
  recipeReference: new URL('../../../data/generated/recipe-material-reference.json', import.meta.url),
  recipeOverrides: new URL('../../../data/generated/recipe-group-overrides.json', import.meta.url),
  itemOverrides: new URL('../../../data/generated/item-group-overrides.json', import.meta.url),
};

async function loadFrozenArtifacts() {
  const artifacts = {};
  for (const [key, url] of Object.entries(artifactUrls)) {
    const raw = await readFile(url, 'utf8');
    artifacts[key] = { raw, payload: JSON.parse(raw), sourceLocator: url.href };
  }
  return artifacts;
}

function clone(value) {
  return structuredClone(value);
}

test('frozen bootstrap deduplicates 33 recipe groups and reconciles 27 redundant rows plus 2 exclusions', async () => {
  assert.equal(typeof bootstrap.buildItemGroupBootstrap, 'function');
  const result = bootstrap.buildItemGroupBootstrap({
    artifacts: await loadFrozenArtifacts(),
    producerRunKey: 'task-3-frozen-baseline',
  });

  const recipeGroups = result.groups.filter((group) => group.sourceLayer === 'recipe_reference');
  assert.equal(recipeGroups.length, 33);
  for (const group of recipeGroups) {
    assert.equal(new Set(group.members.map((member) => member.internalName)).size, group.members.length);
    assert.ok(group.members.every((member) => member.nameZh));
  }
  assert.equal(result.reconciliation.redundantOverrideCount, 27);
  assert.equal(result.reconciliation.exclusionCount, 2);
  assert.equal(result.reconciliation.addedMemberGroupCount, 0);
  assert.equal(result.reconciliation.orphanOverrideGroupCount, 0);
  assert.equal(result.exclusions.length, 2);
  assert.deepEqual(
    result.exclusions.map((row) => [row.canonicalName, row.memberKey]),
    [
      ['Any Guide to Critter Companionship', 'DontHurtCrittersBookInactive'],
      ['Any Guide to Environmental Preservation', 'DontHurtNatureBookInactive'],
    ],
  );
  assert.equal(result.unresolvedCount, 0);
  assert.equal(result.ambiguousCount, 0);

  const pylon = result.groups.find((group) => group.canonicalName === 'Any Pylon');
  const musicBoxes = result.groups.find((group) => group.canonicalName === 'Recorded Music Boxes');
  assert.equal(pylon.sourceLayer, 'source_group');
  assert.equal(pylon.status, 'ACTIVE');
  assert.equal(musicBoxes.sourceLayer, 'source_group');
  assert.equal(musicBoxes.status, 'BLOCKED');
  assert.equal(musicBoxes.members.length, 0);
});

test('recipe override reconciliation blocks added members and orphan groups', async () => {
  const baseline = await loadFrozenArtifacts();
  const added = clone(baseline);
  added.recipeOverrides.payload.groups[0].members.push({
    internalName: 'InventedMember',
    name: 'Invented Member',
    nameZh: 'invented',
  });
  added.recipeOverrides.raw = JSON.stringify(added.recipeOverrides.payload);
  assert.throws(
    () => bootstrap.buildItemGroupBootstrap({ artifacts: added, producerRunKey: 'added-member' }),
    /adds members.*InventedMember/i,
  );

  const orphan = clone(baseline);
  orphan.recipeOverrides.payload.groups.push({
    canonicalName: 'Orphan Group',
    members: [{ internalName: 'Wood', name: 'Wood', nameZh: 'wood' }],
  });
  orphan.recipeOverrides.raw = JSON.stringify(orphan.recipeOverrides.payload);
  assert.throws(
    () => bootstrap.buildItemGroupBootstrap({ artifacts: orphan, producerRunKey: 'orphan-group' }),
    /no matching reference group.*Orphan Group/i,
  );
});

test('bootstrap rejects unknown source kinds, duplicate aliases, and empty active groups', async () => {
  const baseline = await loadFrozenArtifacts();

  const unknownKind = clone(baseline);
  unknownKind.itemOverrides.payload.groups[0].sourceKind = 'unreviewed_group_kind';
  unknownKind.itemOverrides.raw = JSON.stringify(unknownKind.itemOverrides.payload);
  assert.throws(
    () => bootstrap.buildItemGroupBootstrap({ artifacts: unknownKind, producerRunKey: 'unknown-kind' }),
    /unknown item group sourceKind.*unreviewed_group_kind/i,
  );

  const duplicateAlias = clone(baseline);
  duplicateAlias.itemOverrides.payload.groups[0].aliases.push(' ANY   PYLON ');
  duplicateAlias.itemOverrides.raw = JSON.stringify(duplicateAlias.itemOverrides.payload);
  assert.throws(
    () => bootstrap.buildItemGroupBootstrap({ artifacts: duplicateAlias, producerRunKey: 'duplicate-alias' }),
    /duplicate normalized alias.*any pylon/i,
  );

  const empty = clone(baseline);
  empty.itemOverrides.payload.groups[0].members = [];
  empty.itemOverrides.raw = JSON.stringify(empty.itemOverrides.payload);
  assert.throws(
    () => bootstrap.buildItemGroupBootstrap({ artifacts: empty, producerRunKey: 'empty-group' }),
    /active group.*Any Pylon.*no members/i,
  );
});

test('landing descriptors retain full-file lineage but only expose group payloads', async () => {
  const artifacts = await loadFrozenArtifacts();
  const result = bootstrap.buildItemGroupBootstrap({
    artifacts,
    producerRunKey: 'group-only-payloads',
  });

  assert.deepEqual(
    result.landingEntries.map((entry) => entry.sourceKey),
    [
      'admin.item_group_overrides',
      'admin.recipe_group_overrides',
      'wiki.recipe_material_groups',
      'wiki.shimmer_item_groups',
    ],
  );
  for (const entry of result.landingEntries) {
    assert.equal(entry.datasetType, 'item_groups_raw');
    assert.equal(entry.artifactRole, 'bootstrap_input');
    assert.match(entry.fullFileContentHash, /^[a-f0-9]{64}$/);
    assert.ok(entry.fullFileByteSize > 0);
    assert.equal(Object.hasOwn(entry.payload, 'supplementalRecipes'), false);
    assert.equal(Object.hasOwn(entry.payload, 'sourcePageSnapshots'), false);
  }
  const recipeLanding = result.landingEntries.find(
    (entry) => entry.sourceKey === 'wiki.recipe_material_groups',
  );
  assert.equal(recipeLanding.fullFileByteSize, Buffer.byteLength(artifacts.recipeReference.raw, 'utf8'));
  assert.equal(recipeLanding.payload.groups.length, 33);

  assert.throws(
    () => bootstrap.validateItemGroupLandingPayload(artifacts.recipeReference.payload),
    /non-group section.*supplementalRecipes/i,
  );
});

test('bootstrap implementation remains pure and independent of current working directory', async () => {
  const source = await readFile(new URL('./item-group-bootstrap.mjs', import.meta.url), 'utf8').catch(() => '');
  assert.doesNotMatch(source, /node:fs|mysql|fetch\s*\(|process\.cwd\s*\(|writeFile/);
});
