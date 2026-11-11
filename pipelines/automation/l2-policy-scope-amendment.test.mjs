import assert from 'node:assert/strict';
import test from 'node:test';

import { computePolicyHash } from './bootstrap-automation-policy.mjs';
import { computePolicySetHash } from './policy-set-hash.mjs';
import {
  assertL2PolicyScopeAmendmentProposal,
  buildL2PolicyScopeAmendmentProposal,
} from './l2-policy-scope-amendment.mjs';

const H = (letter) => `sha256:${letter.repeat(64)}`;
const BASE_CEILING = Object.freeze({
  level: 'L2',
  ownedTables: [],
  anomalyAction: 'CIRCUIT_OPEN',
  schemaVersion: 1,
  ratioInsertCap: 0.1,
  ratioUpdateCap: 0.1,
  ratioDisableCap: 0.005,
  requireSnapshot: true,
  absoluteInsertCap: 500,
  absoluteUpdateCap: 500,
  absoluteDisableCap: 20,
  ratioRelationshipDeleteCap: 0.05,
  sourceFreshnessMaxAgeMinutes: 60,
  absoluteRelationshipDeleteCap: 200,
});

function currentScopes(domainId) {
  return domainId === 'items'
    ? [{ databaseRole: 'local', table: 'items', fieldGroup: 'all_columns' }]
    : [
        { databaseRole: 'local', table: 'armor_set_items', fieldGroup: 'all_columns' },
        { databaseRole: 'local', table: 'armor_sets', fieldGroup: 'all_columns' },
      ];
}

function fixture(domainId) {
  const otherDomain = domainId === 'items' ? 'armor_sets' : 'items';
  const currentJson = { ...BASE_CEILING, ownedTables: currentScopes(domainId) };
  const otherJson = { ...BASE_CEILING, ownedTables: currentScopes(otherDomain) };
  const rows = [
    { domainId, policyVersion: 2, policyHash: computePolicyHash(currentJson) },
    { domainId: otherDomain, policyVersion: 2, policyHash: computePolicyHash(otherJson) },
  ];
  const currentPolicySetHash = computePolicySetHash(rows);
  const sourceIdentity = {
    schemaVersion: 1,
    sourceSnapshotHash: H('a'),
    dependencyEvidenceHash: H('b'),
    formalReadbackHash: H('c'),
    consumerReadbackHash: H('d'),
  };
  const serverFingerprint = {
    host: '127.0.0.1',
    port: 13306,
    serverUuid: 'b4ae6728-4f72-11f1-bcc9-00155d37eadf',
    databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
  };
  const predecessorL1Evidence = {
    policyVersion: 1,
    policyHash: H('e'),
    policySetHash: H('f'),
    runs: ['run-01', 'run-02', 'run-03'].map((runId, index) => ({
      runId,
      bundleFileSha256: H(String(index + 1)),
      reconciliationSha256: H(String(index + 4)),
      fullReconciliation: true,
    })),
  };
  return {
    domainId,
    currentPolicy: {
      domainId,
      policyVersion: 2,
      policyHash: rows.find((row) => row.domainId === domainId).policyHash,
      policySetHash: currentPolicySetHash,
      level: 'L2',
      operationalState: 'ACTIVE',
      policyJson: currentJson,
    },
    currentPolicyRows: rows,
    targetPolicyVersion: 3,
    sourceIdentity,
    serverFingerprint,
    predecessorL1Evidence,
    authorizationReference: 'user://conversation/2026-10-25/local-formal-catch-up/items-armor-scope',
    generatedAt: '2026-10-25T10:00:00.000Z',
  };
}

for (const domainId of ['items', 'armor_sets']) {
  test(`${domainId} proposal appends only its registered canonical scopes and preserves the L2 ceiling`, () => {
    const input = fixture(domainId);
    const proposal = buildL2PolicyScopeAmendmentProposal(input);

    assert.equal(proposal.domainId, domainId);
    assert.equal(proposal.currentPolicy.policyVersion, 2);
    assert.equal(proposal.targetPolicy.policyVersion, 3);
    assert.equal(proposal.targetPolicy.level, 'L2');
    assert.deepEqual(proposal.targetPolicy.policyJson, {
      ...input.currentPolicy.policyJson,
      ratioDisableCap: 0,
      absoluteDisableCap: 0,
      ratioRelationshipDeleteCap: 0,
      absoluteRelationshipDeleteCap: 0,
      ownedTables: proposal.targetPolicy.policyJson.ownedTables,
    });
    assert.deepEqual(
      proposal.targetPolicy.policyJson.ownedTables.slice(0, input.currentPolicy.policyJson.ownedTables.length),
      input.currentPolicy.policyJson.ownedTables,
    );
    assert.equal(proposal.currentPolicySetHash, computePolicySetHash(input.currentPolicyRows));
    assert.deepEqual(proposal.serverFingerprint, input.serverFingerprint);
    assert.match(proposal.serverFingerprintHash, /^sha256:[a-f0-9]{64}$/);
    assert.notEqual(proposal.targetPolicySetHash, proposal.currentPolicySetHash);
    assert.equal(proposal.targetPolicy.policyHash, computePolicyHash(proposal.targetPolicy.policyJson));
    for (const field of ['ratioDisableCap', 'absoluteDisableCap', 'ratioRelationshipDeleteCap', 'absoluteRelationshipDeleteCap']) {
      assert.equal(proposal.targetPolicy.policyJson[field], 0, `${domainId} must not authorize deletes or disables`);
    }
    for (const field of ['ratioInsertCap', 'ratioUpdateCap', 'absoluteInsertCap', 'absoluteUpdateCap', 'sourceFreshnessMaxAgeMinutes']) {
      assert.equal(proposal.targetPolicy.policyJson[field], BASE_CEILING[field], `${domainId} must preserve ${field}`);
    }
    const added = proposal.targetPolicy.policyJson.ownedTables.slice(input.currentPolicy.policyJson.ownedTables.length);
    assert.equal(added.length, domainId === 'items' ? 30 : 7);
    assert.ok(added.every((scope) => scope.fieldGroup === 'canonical_owned_rows'
      && /^sha256:[a-f0-9]{64}$/.test(scope.logicalPredicateHash)));
    const expected = domainId === 'items'
      ? [
          'local.source_dataset_landings', 'local.category', 'local.item_images',
          'local.item_acquisition_sources', 'local.recipes', 'local.recipe_ingredients',
          'local.recipe_stations', 'local.item_biomes', 'local.biome_resources',
          'maint.maint_items', 'maint.maint_item_categories',
          'maint.maint_item_images', 'maint.maint_item_recipes', 'maint.maint_item_sources',
          'maint.maint_item_biomes', 'relation.relation_items', 'relation.relation_item_images',
          'relation.relation_item_rarities', 'relation.category_nodes',
          'relation.item_category_assignments', 'relation.item_recipe_heads',
          'relation.item_recipe_ingredients', 'relation.item_recipe_stations',
          'relation.item_source_facts', 'relation.item_source_details',
          'relation.item_npc_shop_relations', 'relation.item_npc_loot_relations',
          'relation.item_npc_relation_audits', 'relation.item_biome_relations',
          'relation.projection_items',
        ]
      : [
          'local.source_dataset_landings', 'maint.maint_armor_sets', 'maint.maint_armor_set_images',
          'relation.relation_armor_sets', 'relation.relation_armor_set_items',
          'relation.relation_armor_set_images', 'relation.projection_armor_sets',
        ];
    assert.deepEqual(added.map(({ databaseRole, table }) => `${databaseRole}.${table}`), expected);
    assert.equal(proposal.predecessorL1Evidence.runs.length, 3);
    assert.equal(proposal.amendmentHash.startsWith('sha256:'), true);
    assert.equal(assertL2PolicyScopeAmendmentProposal(proposal), true);

    const tampered = structuredClone(proposal);
    tampered.targetPolicy.policyJson.ownedTables.push({
      databaseRole: 'local', table: 'buffs', fieldGroup: 'canonical_owned_rows', logicalPredicateHash: H('9'),
    });
    assert.throws(() => assertL2PolicyScopeAmendmentProposal(tampered), /hash drifted|exact registered scope/i);
  });
}

test('scope amendment is limited to Items and Armor Sets', () => {
  assert.throws(
    () => buildL2PolicyScopeAmendmentProposal({ ...fixture('items'), domainId: 'buffs' }),
    /unsupported.*domain|domain.*unsupported/i,
  );
});

test('scope amendment rejects a current policy whose persisted table set is not the expected L2 v2 base', () => {
  const input = fixture('items');
  input.currentPolicy.policyJson.ownedTables.push({
    databaseRole: 'relation', table: 'projection_items', fieldGroup: 'all_columns',
  });
  input.currentPolicy.policyHash = computePolicyHash(input.currentPolicy.policyJson);
  input.currentPolicyRows[0].policyHash = input.currentPolicy.policyHash;
  input.currentPolicy.policySetHash = computePolicySetHash(input.currentPolicyRows);
  assert.throws(() => buildL2PolicyScopeAmendmentProposal(input), /current.*scope|base.*policy/i);
});

test('scope amendment rejects policy-set drift and stale source, dependency, or consumer hashes', () => {
  const policyDrift = fixture('items');
  policyDrift.currentPolicyRows[1].policyHash = H('9');
  assert.throws(() => buildL2PolicyScopeAmendmentProposal(policyDrift), /policy set|policy-set/i);

  const sourceDrift = fixture('items');
  sourceDrift.sourceIdentity.consumerReadbackHash = null;
  assert.throws(() => buildL2PolicyScopeAmendmentProposal(sourceDrift), /consumer.*hash|required/i);

  const dependencyDrift = fixture('armor_sets');
  dependencyDrift.sourceIdentity.dependencyEvidenceHash = 'unverified';
  assert.throws(() => buildL2PolicyScopeAmendmentProposal(dependencyDrift), /dependency.*hash/i);

  const remoteServer = fixture('items');
  remoteServer.serverFingerprint.host = '192.0.2.10';
  assert.throws(() => buildL2PolicyScopeAmendmentProposal(remoteServer), /loopback|host/i);
});

test('scope amendment accepts legacy v2 scope rows that omitted default all_columns metadata', () => {
  const input = fixture('items');
  input.currentPolicy.policyJson.ownedTables = [{ databaseRole: 'local', table: 'items' }];
  input.currentPolicy.policyHash = computePolicyHash(input.currentPolicy.policyJson);
  input.currentPolicyRows[0].policyHash = input.currentPolicy.policyHash;
  input.currentPolicy.policySetHash = computePolicySetHash(input.currentPolicyRows);
  const proposal = buildL2PolicyScopeAmendmentProposal(input);
  assert.equal(proposal.targetPolicy.policyJson.ownedTables[0].fieldGroup, undefined);
  assert.equal(assertL2PolicyScopeAmendmentProposal(proposal), true);
});

test('scope amendment requires three distinct committed full-reconciliation predecessor runs', () => {
  const tooFew = fixture('items');
  tooFew.predecessorL1Evidence.runs.pop();
  assert.throws(() => buildL2PolicyScopeAmendmentProposal(tooFew), /three.*L1|three.*run/i);

  const duplicate = fixture('items');
  duplicate.predecessorL1Evidence.runs[2].runId = duplicate.predecessorL1Evidence.runs[0].runId;
  assert.throws(() => buildL2PolicyScopeAmendmentProposal(duplicate), /duplicate.*run/i);

  const partial = fixture('armor_sets');
  partial.predecessorL1Evidence.runs[0].fullReconciliation = false;
  assert.throws(() => buildL2PolicyScopeAmendmentProposal(partial), /full reconciliation/i);
});
