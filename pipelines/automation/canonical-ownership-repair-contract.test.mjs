import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildArmorCanonicalRepairContract,
  buildBuffCanonicalRepairContract,
  buildShimmerCrossOwnerRepairContract,
  assertCanonicalOwnershipRepairBeforeApply,
} from './canonical-ownership-repair-contract.mjs';

test('Armor contract is incremental and exact', () => {
  const contract = buildArmorCanonicalRepairContract();
  assert.equal(contract.mode, 'incremental-update-preserve-unmatched');
  assert.equal(contract.projectionKey, 'text_key+relation_record_key+source_key');
  assert.deepEqual(contract.tables, ['projection_armor_sets']);
  assert.equal(contract.executable, false);
  assert.throws(() => buildArmorCanonicalRepairContract({ tables: ['relation_armor_sets', 'projection_armor_sets'] }), /exact bounded/);
  assert.throws(() => buildArmorCanonicalRepairContract({ projectionKey: 'id' }), /stable source/);
});

test('Buff contract requires immunity and rejects broad scope', () => {
  const contract = buildBuffCanonicalRepairContract();
  assert.equal(contract.requiresPageImmunity, true);
  assert.equal(contract.executable, false);
  assert.equal(contract.managedImagePolicyBinding, 'registered-executor-runtime-config-required');
  assert.throws(() => buildBuffCanonicalRepairContract({ requiresPageImmunity: false }), /page immunity/);
  assert.throws(() => buildBuffCanonicalRepairContract({ tables: ['buffs'] }), /exact bounded/);
});

test('equivalent bounded table sets produce identical planning descriptors', () => {
  const buff = buildBuffCanonicalRepairContract();
  assert.deepEqual(buildBuffCanonicalRepairContract({ tables: [...buff.tables].reverse() }), buff);
  const shimmer = buildShimmerCrossOwnerRepairContract({ ownerApprovals: ['items', 'town_npc_maintenance'] });
  assert.deepEqual(buildShimmerCrossOwnerRepairContract({
    ownerApprovals: ['items', 'town_npc_maintenance'], transformTables: [...shimmer.transformTables].reverse(),
  }), shimmer);
});

test('Shimmer contract requires explicit cross-owner approvals and scopes', () => {
  const contract = buildShimmerCrossOwnerRepairContract({ ownerApprovals: ['items', 'town_npc_maintenance'] });
  assert.equal(contract.crossOwnerScopes.length, 2);
  assert.throws(() => buildShimmerCrossOwnerRepairContract({ ownerApprovals: ['shimmer'] }), /owner approvals/);
  assert.throws(() => buildShimmerCrossOwnerRepairContract({ transformTables: ['world_contexts'] }), /exact bounded/);
});

test('all repair contracts fail closed before apply without fresh packet, owners, or fences', () => {
  const contracts = [buildArmorCanonicalRepairContract(), buildBuffCanonicalRepairContract(), buildShimmerCrossOwnerRepairContract({ ownerApprovals: ['items', 'town_npc_maintenance'] })];
  for (const contract of contracts) {
    assert.throws(() => assertCanonicalOwnershipRepairBeforeApply({ contract }), /fresh ownership/);
  }
  assert.throws(() => assertCanonicalOwnershipRepairBeforeApply({ contract: contracts[2], hasFreshPacket: true, currentOwnerCapabilities: ['shimmer', 'items', 'town_npc_maintenance'], activeFenceScopes: [] }), /active fence/);
});

test('caller-supplied booleans and fence descriptions cannot authorize a draft contract', () => {
  const contract = buildArmorCanonicalRepairContract();
  assert.throws(() => assertCanonicalOwnershipRepairBeforeApply({
    contract,
    hasFreshPacket: true,
    currentOwnerCapabilities: ['armor_sets'],
    activeFenceScopes: contract.tables.map((table) => ({ databaseRole: 'relation', table, fieldGroup: 'all_columns' })),
  }), /registered.*executor|not.*authorization/);
});

test('forged empty scopes cannot turn the draft contract into executable authority', () => {
  assert.throws(() => assertCanonicalOwnershipRepairBeforeApply({
    contract: { domainId: 'unregistered', tables: [], ownerCapability: 'fake' },
    hasFreshPacket: true, currentOwnerCapabilities: ['fake'], activeFenceScopes: [],
  }), /registered.*executor|not.*authorization|invalid/);
});
