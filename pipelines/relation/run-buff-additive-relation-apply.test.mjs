import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BUFF_ADDITIVE_RELATION_APPLY_OWNERSHIP_KEYS,
  BUFF_ADDITIVE_RELATION_OPERATION_ID,
  assertBuffAdditiveRelationApplyAuthorization,
} from './run-buff-additive-relation-apply.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;
const PATHS = {
  proposalPath: `reports/authorization/canonical/${BUFF_ADDITIVE_RELATION_OPERATION_ID}.task-15.proposal.json`,
  resultPath: `reports/authorization/canonical/${BUFF_ADDITIVE_RELATION_OPERATION_ID}.task-15.result.json`,
  journalPath: `reports/authorization/canonical/${BUFF_ADDITIVE_RELATION_OPERATION_ID}.task-15.journal.json`,
};
const TARGET_TABLES = ['relation_buffs', 'npc_buff_relations', 'projection_buffs'];
const WRITE_TARGETS = [
  'relation.relation_buffs.inflicting_npcs_json',
  'relation.relation_buffs.source_evidence_json',
  'relation.npc_buff_relations.inflicts',
  'relation.projection_buffs.inflicting_npcs_json',
  'relation.projection_buffs.source_evidence_json',
];

function proposal(overrides = {}) {
  return {
    schemaVersion: 'buff-additive-relation-proposal/v1',
    operationId: BUFF_ADDITIVE_RELATION_OPERATION_ID,
    executable: false,
    applyAllowed: false,
    databaseWrites: false,
    destructiveClear: false,
    target: {
      database: 'terria_v1_relation',
      tables: TARGET_TABLES,
      writeTargets: WRITE_TARGETS,
      forbiddenTargets: ['landing', 'maint', 'local compatibility', 'immune_npcs_json', 'source_items_json'],
    },
    ...overrides,
  };
}

function context(overrides = {}) {
  return {
    authorizationStatus: 'AUTHORIZED',
    operationId: BUFF_ADDITIVE_RELATION_OPERATION_ID,
    packetHash: HASH,
    decisionIdentity: 'decision-task-15',
    targetDatabases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    requiredTechnicalFields: ['serverFingerprint', 'schemaBundleSha256', 'dataBundleSha256', 'policySetHash', 'executionManifestHash'],
    executionManifestHash: HASH,
    executionManifest: {
      schemaVersion: 1,
      operationId: BUFF_ADDITIVE_RELATION_OPERATION_ID,
      executionClass: 'formal_buff_additive_relation_apply',
      databaseWrites: true,
      networkAccess: false,
      ownershipKeys: [...BUFF_ADDITIVE_RELATION_APPLY_OWNERSHIP_KEYS],
      inputPaths: [PATHS.proposalPath],
      outputPaths: [PATHS.resultPath, PATHS.journalPath],
      buffAdditiveRelation: {
        schemaVersion: 'buff-additive-relation-operation-binding/v1',
        operationId: BUFF_ADDITIVE_RELATION_OPERATION_ID,
        resultLabel: 'task-15',
        runId: 'buff-additive-relation-task-15',
        fenceToken: 'fence:task-15',
        ...PATHS,
      },
    },
    dataBundleEntries: [{ path: PATHS.proposalPath, contentHash: HASH }],
    ...overrides,
  };
}

test('apply authorization accepts the read-only proposal only under the canonical write manifest', () => {
  assert.equal(assertBuffAdditiveRelationApplyAuthorization({
    authorizedContext: context(),
    proposal: proposal(),
    paths: PATHS,
    proposalHash: HASH,
  }), true);
});

test('apply authorization requires the manifest-bound runtime fence identity', () => {
  assert.equal(assertBuffAdditiveRelationApplyAuthorization({
    authorizedContext: context({
      executionManifest: {
        ...context().executionManifest,
        buffAdditiveRelation: {
          ...PATHS,
          schemaVersion: 'buff-additive-relation-operation-binding/v1',
          operationId: BUFF_ADDITIVE_RELATION_OPERATION_ID,
          resultLabel: 'task-15',
          runId: 'buff-additive-relation-test-01',
          fenceToken: 'fence:test-01',
        },
      },
    }),
    proposal: proposal(),
    paths: PATHS,
    proposalHash: HASH,
  }), true);
  assert.throws(() => assertBuffAdditiveRelationApplyAuthorization({
    authorizedContext: context({
      executionManifest: {
        ...context().executionManifest,
        buffAdditiveRelation: { ...PATHS },
      },
    }),
    proposal: proposal(),
    paths: PATHS,
    proposalHash: HASH,
  }), /fence|binding/i);
});

test('apply authorization rejects a read-only or missing execution manifest', () => {
  assert.throws(() => assertBuffAdditiveRelationApplyAuthorization({
    authorizedContext: context({ executionManifest: { ...context().executionManifest, databaseWrites: false } }),
    proposal: proposal(),
    paths: PATHS,
    proposalHash: HASH,
  }), /database-write|manifest/i);
  assert.throws(() => assertBuffAdditiveRelationApplyAuthorization({
    authorizedContext: context({ executionManifest: null }),
    proposal: proposal(),
    paths: PATHS,
    proposalHash: HASH,
  }), /manifest/i);
});

test('apply authorization rejects ownership and artifact path drift', () => {
  assert.throws(() => assertBuffAdditiveRelationApplyAuthorization({
    authorizedContext: context({
      executionManifest: {
        ...context().executionManifest,
        ownershipKeys: [...BUFF_ADDITIVE_RELATION_APPLY_OWNERSHIP_KEYS, 'relation.relation_buffs.immune_npcs_json'],
      },
    }),
    proposal: proposal(),
    paths: PATHS,
    proposalHash: HASH,
  }), /ownership/i);
  assert.throws(() => assertBuffAdditiveRelationApplyAuthorization({
    authorizedContext: context({
      dataBundleEntries: [{ path: PATHS.proposalPath, contentHash: `sha256:${'b'.repeat(64)}` }],
    }),
    proposal: proposal(),
    paths: PATHS,
    proposalHash: HASH,
  }), /hash|proposal/i);
  assert.throws(() => assertBuffAdditiveRelationApplyAuthorization({
    authorizedContext: context({
      executionManifest: { ...context().executionManifest, buffAdditiveRelation: { ...PATHS, proposalPath: 'other.json' } },
    }),
    proposal: proposal(),
    paths: PATHS,
    proposalHash: HASH,
  }), /path/i);
});

test('apply authorization rejects unauthorized packets and expanded proposal targets', () => {
  assert.throws(() => assertBuffAdditiveRelationApplyAuthorization({
    authorizedContext: context({ authorizationStatus: 'AWAITING_OWNER' }),
    proposal: proposal(),
    paths: PATHS,
    proposalHash: HASH,
  }), /authorized|packet/i);
  assert.throws(() => assertBuffAdditiveRelationApplyAuthorization({
    authorizedContext: context(),
    proposal: proposal({ target: { ...proposal().target, tables: [...TARGET_TABLES, 'maint_buffs'] } }),
    paths: PATHS,
    proposalHash: HASH,
  }), /target|table|scope/i);
  assert.throws(() => assertBuffAdditiveRelationApplyAuthorization({
    authorizedContext: context({ targetDatabases: ['terria_v1_relation'] }),
    proposal: proposal(),
    paths: PATHS,
    proposalHash: HASH,
  }), /database/i);
  assert.throws(() => assertBuffAdditiveRelationApplyAuthorization({
    authorizedContext: context({ executionManifestHash: null }),
    proposal: proposal(),
    paths: PATHS,
    proposalHash: HASH,
  }), /manifest.*hash|hash/i);
});
