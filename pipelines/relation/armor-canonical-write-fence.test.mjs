import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  ARMOR_CANONICAL_POLICY_OWNER_SCOPES,
  armorCanonicalGenerationScopeHash,
  assertArmorCanonicalPolicyScopeCoverage,
  assertArmorCanonicalWriteFenceBindings,
  buildArmorCanonicalWriteFenceBindings,
  buildArmorCanonicalFenceCommit,
  assertArmorCanonicalFenceBindingCoverage,
  normalizeArmorCanonicalFenceScopes,
} from './armor-canonical-write-fence.mjs';

const hash = (char) => `sha256:${char.repeat(64)}`;

function scopes() {
  return [
    { databaseRole: 'local', table: 'source_dataset_landings', fieldGroup: 'canonical_owned_rows', logicalPredicateHash: hash('a') },
    { databaseRole: 'maint', table: 'maint_armor_sets', fieldGroup: 'canonical_owned_rows', logicalPredicateHash: hash('b') },
    { databaseRole: 'maint', table: 'maint_armor_set_images', fieldGroup: 'canonical_owned_rows', logicalPredicateHash: hash('c') },
    { databaseRole: 'relation', table: 'relation_armor_sets', fieldGroup: 'canonical_owned_rows', logicalPredicateHash: hash('d') },
    { databaseRole: 'relation', table: 'relation_armor_set_items', fieldGroup: 'canonical_owned_rows', logicalPredicateHash: hash('e') },
    { databaseRole: 'relation', table: 'relation_armor_set_images', fieldGroup: 'canonical_owned_rows', logicalPredicateHash: hash('f') },
    { databaseRole: 'relation', table: 'projection_armor_sets', fieldGroup: 'canonical_owned_rows', logicalPredicateHash: hash('1') },
  ];
}

function generations(values = [0, 1, 4, 7, 0, 2, 9]) {
  return scopes().map((scope, index) => ({ ...scope, generation: values[index] }));
}

test('normalizes the exact Armor owner scopes and rejects duplicate scope identities', () => {
  const result = normalizeArmorCanonicalFenceScopes(scopes());
  assert.equal(result.length, 7);
  assert.deepEqual(result, [...result].sort((left, right) => (
    `${left.databaseRole}\0${left.table}\0${left.fieldGroup}\0${left.logicalPredicateHash}`
      .localeCompare(`${right.databaseRole}\0${right.table}\0${right.fieldGroup}\0${right.logicalPredicateHash}`)
  )));
  assert.throws(() => normalizeArmorCanonicalFenceScopes([...scopes(), scopes()[0]]), /duplicated/i);
});

test('builds one unique generation-bound fence and commit marker for every Armor owner scope', () => {
  let token = 0;
  let marker = 0;
  const result = buildArmorCanonicalWriteFenceBindings({
    ownerScopes: scopes(),
    generations: generations(),
    tokenFactory: () => `fence:${String(++token).padStart(64, '0')}`,
    markerFactory: () => String(++marker).padStart(64, '0'),
  });

  assert.equal(result.length, scopes().length);
  assert.deepEqual([...result].map((fence) => fence.beforeGeneration).sort((a, b) => a - b), [0, 0, 1, 2, 4, 7, 9]);
  assert.deepEqual([...result].map((fence) => fence.committedGeneration).sort((a, b) => a - b), [1, 1, 2, 3, 5, 8, 10]);
  assert.equal(new Set(result.map((fence) => fence.fenceToken)).size, result.length);
  assert.equal(new Set(result.map((fence) => fence.commitMarker)).size, result.length);
  assert.ok(result.every((fence) => fence.generationScopeHash === armorCanonicalGenerationScopeHash(fence)));
});

test('rejects missing, extra, duplicate, or generation-drifted Armor write fences', () => {
  const bindings = buildArmorCanonicalWriteFenceBindings({
    ownerScopes: scopes(),
    generations: generations(),
    tokenFactory: (() => { let n = 0; return () => `fence:${String(++n).padStart(64, '0')}`; })(),
    markerFactory: (() => { let n = 0; return () => String(++n).padStart(64, '0'); })(),
  });

  assert.doesNotThrow(() => assertArmorCanonicalWriteFenceBindings({ ownerScopes: scopes(), writeFences: bindings }));
  assert.throws(() => assertArmorCanonicalWriteFenceBindings({ ownerScopes: scopes(), writeFences: bindings.slice(1) }), /cover every/i);
  assert.throws(() => assertArmorCanonicalWriteFenceBindings({ ownerScopes: scopes().slice(1), writeFences: bindings }), /cover every/i);
  const drifted = structuredClone(bindings);
  drifted[0].committedGeneration += 1;
  assert.throws(() => assertArmorCanonicalWriteFenceBindings({ ownerScopes: scopes(), writeFences: drifted }), /drifted/i);
});

test('rejects a current owner scope with no generation baseline', () => {
  assert.throws(() => buildArmorCanonicalWriteFenceBindings({
    ownerScopes: scopes(),
    generations: generations().slice(1),
    tokenFactory: () => `fence:${'a'.repeat(64)}`,
    markerFactory: () => 'b'.repeat(64),
  }), /cover every|missing/i);
});

test('rejects an Armor execution manifest that omits a current policy-owned table', () => {
  const policy = scopes();
  const ownership = policy.slice(0, -1).map((scope) => `${scope.databaseRole}.${scope.table}`);
  assert.throws(() => assertArmorCanonicalPolicyScopeCoverage({
    policyOwnedTables: policy,
    executionOwnershipKeys: ownership,
  }), /missing policy scopes.*projection_armor_sets/i);
  assert.deepEqual(assertArmorCanonicalPolicyScopeCoverage({
    policyOwnedTables: policy,
    executionOwnershipKeys: policy.map((scope) => `${scope.databaseRole}.${scope.table}`),
  }), { policyScopeCount: 7, executionOwnershipKeyCount: 7 });
});

test('builds and validates the complete nine-scope Armor fence commit contract', () => {
  const commit = buildArmorCanonicalFenceCommit({
    runId: 'armor-run-09',
    expiresAt: '2030-10-27T10:00:00Z',
    generations: ARMOR_CANONICAL_POLICY_OWNER_SCOPES.map(scope => ({ ...scope, generation: 3 })),
    tokenFactory: (() => { let i = 0; return () => `fence:${String(++i).padStart(64, '0')}`; })(),
    markerFactory: (() => { let i = 0; return () => String(++i).padStart(64, '0'); })(),
  });
  assert.equal(commit.bindings.length, 9);
  assert.equal(commit.runId, 'armor-run-09');
  const localParent = commit.bindings.find(scope => scope.databaseRole === 'local' && scope.table === 'armor_sets');
  assert.match(localParent.mutationGenerationScopeHash, /^sha256:[0-9a-f]{64}$/);
  assert.doesNotThrow(() => assertArmorCanonicalFenceBindingCoverage({ writeFences: commit.bindings }));
  assert.throws(() => assertArmorCanonicalFenceBindingCoverage({ writeFences: commit.bindings.slice(1) }), /cover every|incomplete/i);
});
