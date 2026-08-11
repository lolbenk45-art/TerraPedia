import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  buildItemImageProjectionInputContract,
  buildItemImageProjectionAttemptPaths,
  buildItemImageProjectionProposal,
  canonicalItemImageProjectionHash,
} from './item-image-projection-contract.mjs';
import {
  executeItemImageProjectionTransaction,
  readItemImageProjectionSnapshot,
} from './item-image-projection-db.mjs';

test('projection snapshot reader is read-only and selects the exact active source and target rows', async () => {
  const input = inputFixture();
  const database = databaseFixture();
  const connection = recordingConnection(database);
  const snapshot = await readItemImageProjectionSnapshot(connection, {
    keys: input.keys,
    target: input.target,
  });

  assert.deepEqual(snapshot.relationRows, database.relationRows);
  assert.deepEqual(snapshot.projectionRows, database.projectionRows);
  assert.ok(connection.sql.every((statement) => /^SELECT/i.test(statement.trim())));
  assert.ok(connection.sql.some((statement) => /relation_item_images/i.test(statement)));
  assert.ok(connection.sql.some((statement) => /projection_items/i.test(statement)));
  assert.ok(connection.sql.some((statement) => /role` = 'icon'/i.test(statement)));
  assert.ok(connection.sql.some((statement) => /is_primary` = 1/i.test(statement)));
  assert.ok(connection.sql.every((statement) => !/FOR UPDATE/i.test(statement)));
});

test('projection apply locks and rechecks before permit, updates only image, and verifies before commit', async () => {
  const input = inputFixture();
  const connection = recordingConnection(databaseFixture());
  const outcome = await executeItemImageProjectionTransaction({
    connection,
    inputContract: input,
    consumeDispatchPermit: async () => connection.events.push('consume-permit'),
  });

  assert.deepEqual(connection.events, [
    'begin',
    'lock-relation',
    'lock-projection',
    'verify-fingerprint',
    'consume-permit',
    'update-image-only',
    'read-after',
    'commit',
  ]);
  assert.equal(outcome.changedRowCount, input.changedRowCount);
  const dml = connection.sql.filter((statement) => /^(?:INSERT|UPDATE|DELETE|REPLACE)/i.test(statement.trim()));
  assert.equal(dml.length, 1);
  assert.match(dml[0], /^UPDATE `terria_v1_relation`\.`projection_items`/i);
  assert.match(dml[0], /SET `image` = CASE/i);
  assert.match(dml[0], /WHERE `deleted` = 0 AND `status` = 1/i);
  assert.doesNotMatch(dml[0], /\bINSERT\b|\bDELETE\b|\blocal\b|\bmaint\b|\blanding\b/i);
  assert.equal(assignments(dml[0]).every((column) => column === 'image'), true);
  assert.ok(connection.sql.filter((statement) => /FOR UPDATE/i.test(statement)).length >= 2);
});

test('projection apply rejects stale locked rows before permit or DML and rolls back', async () => {
  const input = inputFixture();
  const database = databaseFixture();
  database.projectionRows[0] = { ...database.projectionRows[0], image: '/unexpected.png' };
  const connection = recordingConnection(database);
  let permits = 0;

  await assert.rejects(
    executeItemImageProjectionTransaction({
      connection,
      inputContract: input,
      consumeDispatchPermit: async () => { permits += 1; },
    }),
    /before.*hash|snapshot.*drift/i,
  );
  assert.equal(permits, 0);
  assert.equal(connection.events.includes('update-image-only'), false);
  assert.equal(connection.events.at(-1), 'rollback');
});

test('projection apply rolls back affected-row and after-hash mismatches', async () => {
  for (const mode of ['affected-row-mismatch', 'after-hash-mismatch']) {
    const input = inputFixture();
    const connection = recordingConnection(databaseFixture(), { mode });
    await assert.rejects(
      executeItemImageProjectionTransaction({
        connection,
        inputContract: input,
        consumeDispatchPermit: async () => connection.events.push('consume-permit'),
      }),
      mode === 'affected-row-mismatch' ? /affected.*row/i : /after.*hash|after.*drift/i,
    );
    assert.equal(connection.events.includes('commit'), false, mode);
    assert.equal(connection.events.at(-1), 'rollback', mode);
  }
});

test('projection apply attaches exact rollback evidence to every transaction failure', async () => {
  const cases = [
    {
      label: 'stale snapshot',
      connection: () => {
        const database = databaseFixture();
        database.projectionRows[0] = { ...database.projectionRows[0], image: '/unexpected.png' };
        return recordingConnection(database);
      },
      permit: async () => {},
      expected: { began: true, rolledBack: true, permitConsumed: false, dmlAttempted: false },
    },
    {
      label: 'permit failure',
      connection: () => recordingConnection(databaseFixture()),
      permit: async () => { throw new Error('permit rejected'); },
      expected: { began: true, rolledBack: true, permitConsumed: false, dmlAttempted: false },
    },
    {
      label: 'SQL failure',
      connection: () => recordingConnection(databaseFixture(), { mode: 'sql-error' }),
      permit: async () => {},
      expected: { began: true, rolledBack: true, permitConsumed: true, dmlAttempted: true },
    },
  ];
  for (const fixture of cases) {
    const error = await executeItemImageProjectionTransaction({
      connection: fixture.connection(),
      inputContract: inputFixture(),
      consumeDispatchPermit: fixture.permit,
    }).then(
      () => null,
      (failure) => failure,
    );
    assert.ok(error instanceof Error, fixture.label);
    assert.deepEqual(error.itemImageProjectionTransaction, fixture.expected, fixture.label);
  }
});

function inputFixture() {
  const proposalDecisionIdentity = 'canonical-item-image-projection-proposal-read-20260804-01';
  const attemptPaths = buildItemImageProjectionAttemptPaths(proposalDecisionIdentity);
  const proposal = buildItemImageProjectionProposal({
    attemptId: attemptPaths.attemptId,
    attemptRoot: attemptPaths.attemptRoot,
    generatedAt: '2026-08-04T01:00:00.000Z',
    expiresAt: '2026-08-05T01:00:00.000Z',
    proposalAuthorization: {
      path: attemptPaths.proposalReadOwnerInputPath,
      sha256: sha('proposal-read-owner-input'),
      decisionIdentity: proposalDecisionIdentity,
      authorizationHash: sha('proposal-read-owner-authorization'),
    },
    lineage: {
      inputContractPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.input.json',
      inputContractSha256: sha('lineage-input'),
      resultPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.result.json',
      resultSha256: sha('lineage-result'),
      bundlePath: 'reports/audit/item-image-lineage.bundle.json',
      bundleSha256: sha('lineage-bundle'),
      applySnapshotPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.snapshot.json',
      applySnapshotSha256: sha('lineage-apply-snapshot'),
      authorizationPacketPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.packet.json',
      authorizationPacketSha256: sha('lineage-packet'),
      decisionIdentity: 'canonical-item-image-lineage-apply-20260801-02',
      packetHash: sha('packet-hash'),
      dispatchPermitHash: sha('dispatch-permit'),
      completedRowCount: 2,
    },
    lineageKeys: ['DirtBlock', 'Wood'],
    target: target(),
    snapshotPath: attemptPaths.snapshotPath,
    snapshotSha256: sha('projection-snapshot'),
    managedUrlPolicy: {
      sourcePath: 'scripts/data/relation/managed-image-url-policy.mjs',
      sourceSha256: sha('managed-policy-source'),
      resolvedPrefixesSha256: canonicalItemImageProjectionHash([
        'http://localhost:9000/terrapedia-images/items/',
      ]),
    },
    managedUrlPrefixes: ['http://localhost:9000/terrapedia-images/items/'],
    relationRows: databaseFixture().relationRows,
    projectionRows: databaseFixture().projectionRows,
  });
  return buildItemImageProjectionInputContract({
    proposal,
    proposalPath: attemptPaths.proposalPath,
    proposalSha256: canonicalItemImageProjectionHash(proposal),
  });
}

function databaseFixture() {
  return {
    serverUuid: 'projection-server-uuid',
    relationRows: [
      relationRow('relation-dirt', 'DirtBlock', '/terrapedia-images/items/dirt.png'),
      relationRow('relation-wood', 'Wood', '/terrapedia-images/items/wood.png'),
    ],
    projectionRows: [
      projectionRow(2, 'relation-dirt', 'DirtBlock', 'http://localhost:9000/legacy/DirtBlock.png'),
      projectionRow(1, 'relation-wood', 'Wood', 'http://localhost:9000/legacy/Wood.png'),
    ],
  };
}

function recordingConnection(database, options = {}) {
  let projectionReads = 0;
  const connection = {
    sql: [],
    events: [],
    async beginTransaction() {
      this.events.push('begin');
    },
    async commit() {
      this.events.push('commit');
    },
    async rollback() {
      this.events.push('rollback');
    },
    async query(statement) {
      this.sql.push(statement);
      if (/relation_item_images/i.test(statement)) {
        if (/FOR UPDATE/i.test(statement)) this.events.push('lock-relation');
        return [database.relationRows.map(toSqlRelationRow), []];
      }
      if (/projection_items/i.test(statement)) {
        projectionReads += 1;
        const locked = /FOR UPDATE/i.test(statement);
        if (locked) this.events.push(projectionReads === 1 ? 'lock-projection' : 'read-after');
        let rows = database.projectionRows;
        if (projectionReads > 1 && options.mode !== 'after-hash-mismatch') {
          rows = rows.map((row) => ({
            ...row,
            image: row.internalName === 'DirtBlock'
              ? '/terrapedia-images/items/dirt.png'
              : '/terrapedia-images/items/wood.png',
          }));
        } else if (projectionReads > 1) {
          rows = rows.map((row) => ({ ...row, image: '/terrapedia-images/items/wrong.png' }));
        }
        return [rows.map(toSqlProjectionRow), []];
      }
      if (/@@server_uuid/i.test(statement)) {
        if (this.events.includes('lock-projection')) this.events.push('verify-fingerprint');
        return [[{ server_uuid: database.serverUuid }], []];
      }
      throw new Error(`unexpected query: ${statement}`);
    },
    async execute(statement) {
      this.sql.push(statement);
      this.events.push('update-image-only');
      if (options.mode === 'sql-error') throw new Error('update failed');
      return [{
        affectedRows: options.mode === 'affected-row-mismatch' ? 1 : 2,
      }, []];
    },
  };
  return connection;
}

function target() {
  return {
    host: '127.0.0.1',
    port: 13306,
    serverUuid: 'projection-server-uuid',
    databases: {
      local: 'terria_v1_local',
      maint: 'terria_v1_maint',
      relation: 'terria_v1_relation',
    },
    ownedDatabase: 'terria_v1_relation',
    ownedTable: 'projection_items',
    ownedColumn: 'image',
  };
}

function relationRow(recordKey, internalName, cachedUrl) {
  return { recordKey, internalName, cachedUrl, role: 'icon', isPrimary: 1, status: 1, deleted: 0 };
}

function projectionRow(id, relationRecordKey, internalName, image) {
  return { id, relationRecordKey, internalName, image, status: 1, deleted: 0 };
}

function toSqlRelationRow(row) {
  return {
    record_key: row.recordKey,
    item_internal_name: row.internalName,
    cached_url: row.cachedUrl,
    role: row.role,
    is_primary: row.isPrimary,
    status: row.status,
    deleted: row.deleted,
  };
}

function toSqlProjectionRow(row) {
  return {
    id: row.id,
    relation_record_key: row.relationRecordKey,
    internal_name: row.internalName,
    image: row.image,
    status: row.status,
    deleted: row.deleted,
  };
}

function assignments(sql) {
  const match = sql.match(/\bSET\s+([\s\S]+?)\s+WHERE\b/i);
  return [...(match?.[1] ?? '').matchAll(/`([a-z_]+)`\s*=/gi)].map((entry) => entry[1]);
}

function sha(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}
