import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildItemImageProjectionAttemptPaths,
  buildItemImageProjectionInputContract,
  canonicalItemImageProjectionHash,
  readItemImageProjectionInputContract,
  recomputeItemImageProjectionPacketHash,
} from './item-image-projection-contract.mjs';
import {
  materializeItemImageProjectionInputContract,
  readItemImageProjectionProposal,
  runItemImageProjectionProposal,
} from './build-item-image-projection-proposal.mjs';

test('projection proposal runner binds exact lineage bytes and injected read-only snapshot', async () => {
  const fixture = evidenceFixture();
  const calls = [];
  const sql = [];
  const connection = {
    async query(statement) {
      sql.push(statement);
      calls.push('start-read-only');
      return [[], []];
    },
    async rollback() { calls.push('rollback'); },
    async end() { calls.push('end'); },
  };
  const proposal = await runItemImageProjectionProposal({
    ...fixture.options,
    generatedAt: '2026-08-04T01:00:00.000Z',
    expiresAt: '2026-08-05T01:00:00.000Z',
  }, {
    readReadOnlyAuthorizationBytes: () => {
      calls.push('read-only-authorization');
      return fixture.readOnlyAuthorizationBytes;
    },
    readLineageResultBytes: () => {
      calls.push('lineage-result');
      return fixture.lineageResultBytes;
    },
    readLineageInputContractBytes: () => {
      calls.push('lineage-input-contract');
      return fixture.lineageInputContractBytes;
    },
    readLineageBundleBytes: () => {
      calls.push('lineage-bundle');
      return fixture.lineageBundleBytes;
    },
    readLineageApplySnapshotBytes: () => fixture.lineageApplySnapshotBytes,
    readLineageAuthorizationPacketBytes: () => fixture.lineageAuthorizationPacketBytes,
    readUsedDecisionsBytes: () => fixture.usedDecisionsBytes,
    loadManagedUrlPolicy: () => fixture.managedUrlPolicy,
    resolveRuntimeConfig: () => fixture.runtimeConfig,
    openConnection: async () => {
      calls.push('connect');
      return connection;
    },
    readDatabaseSnapshot: async (_connection, { keys }) => {
      calls.push(`snapshot:${keys.join(',')}`);
      return fixture.snapshot;
    },
    writeSnapshot: ({ snapshot }) => {
      calls.push('write-snapshot');
      return { snapshot, sha256: shaBytes(Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`)) };
    },
    writeProposal: ({ proposal: value }) => {
      calls.push('write-proposal');
      return value;
    },
  });

  assert.deepEqual(calls, [
    'read-only-authorization',
    'lineage-input-contract',
    'lineage-result',
    'lineage-bundle',
    'connect',
    'start-read-only',
    'snapshot:DirtBlock,Wood',
    'rollback',
    'end',
    'write-snapshot',
    'write-proposal',
  ]);
  assert.match(sql[0], /START TRANSACTION READ ONLY/i);
  assert.equal(proposal.apply, false);
  assert.deepEqual(proposal.keys, ['DirtBlock', 'Wood']);
  assert.equal(proposal.lineage.resultSha256, shaBytes(fixture.lineageResultBytes));
  assert.equal(proposal.lineage.inputContractSha256, shaBytes(fixture.lineageInputContractBytes));
  assert.equal(proposal.lineage.bundleSha256, shaBytes(fixture.lineageBundleBytes));
  assert.equal(
    proposal.lineage.decisionIdentity,
    JSON.parse(fixture.lineageAuthorizationPacketBytes).decisionIdentity,
  );
  assert.equal(proposal.lineage.packetHash, JSON.parse(fixture.lineageAuthorizationPacketBytes).packetHash);
  assert.equal(proposal.lineage.dispatchPermitHash, fixture.dispatchPermitHash);
  assert.equal('usedDecisionsPath' in proposal.lineage, false);
  assert.equal('usedDecisionsSha256' in proposal.lineage, false);
  assert.equal(proposal.attemptId, fixture.attemptPaths.attemptId);
  assert.equal(proposal.attemptRoot, fixture.attemptPaths.attemptRoot);
  assert.equal(proposal.snapshotPath, fixture.attemptPaths.snapshotPath);
  assert.equal(proposal.target.fingerprintSha256, fixture.snapshot.target.fingerprintSha256 ?? proposal.target.fingerprintSha256);
});

test('projection proposal rejects non-proposal options before reading evidence', async () => {
  const fixture = evidenceFixture();
  let reads = 0;
  const dependencies = {
    readReadOnlyAuthorizationBytes: () => { reads += 1; return fixture.readOnlyAuthorizationBytes; },
    readLineageInputContractBytes: () => { reads += 1; return fixture.lineageInputContractBytes; },
    readLineageResultBytes: () => { reads += 1; return fixture.lineageResultBytes; },
    readLineageBundleBytes: () => { reads += 1; return fixture.lineageBundleBytes; },
    readLineageApplySnapshotBytes: () => { reads += 1; return fixture.lineageApplySnapshotBytes; },
    readLineageAuthorizationPacketBytes: () => { reads += 1; return fixture.lineageAuthorizationPacketBytes; },
    readUsedDecisionsBytes: () => { reads += 1; return fixture.usedDecisionsBytes; },
    loadManagedUrlPolicy: () => fixture.managedUrlPolicy,
    resolveRuntimeConfig: () => fixture.runtimeConfig,
    openConnection: async () => { reads += 1; throw new Error('must not connect'); },
  };
  for (const [name, value] of [
    ['apply', true],
    ['packet', 'packet.json'],
    ['permit', 'permit.json'],
    ['network', true],
  ]) {
    await assert.rejects(
      runItemImageProjectionProposal({ ...fixture.options, [name]: value }, dependencies),
      new RegExp(`does not accept ${name}`, 'i'),
    );
  }
  assert.equal(reads, 0);

  const expiredBase = {
    ...JSON.parse(fixture.readOnlyAuthorizationBytes),
    expiresAt: '2026-08-04T00:59:59.000Z',
  };
  delete expiredBase.authorizationHash;
  const expiredAuthorization = Buffer.from(JSON.stringify({
    ...expiredBase,
    authorizationHash: canonicalItemImageProjectionHash(expiredBase),
  }));
  await assert.rejects(runItemImageProjectionProposal(fixture.options, {
    ...dependencies,
    readReadOnlyAuthorizationBytes: () => expiredAuthorization,
  }), /expired/i);
  assert.equal(reads, 0);

  await assert.rejects(runItemImageProjectionProposal({
    ...fixture.options,
    readOnlyAuthorizationPath: undefined,
  }, dependencies), /read.?only.*authorization/i);
  assert.equal(reads, 0);

  await assert.rejects(runItemImageProjectionProposal({
    ...fixture.options,
    usedDecisionsPath: 'reports/authorization/canonical/used-decisions-alias.json',
  }, dependencies), /canonical.*ledger|usedDecisionsPath/i);
  assert.equal(reads, 0);

  const invalidAuthorization = Buffer.from(JSON.stringify({
    ...JSON.parse(fixture.readOnlyAuthorizationBytes),
    noWrite: false,
  }));
  await assert.rejects(runItemImageProjectionProposal(fixture.options, {
    ...dependencies,
    readReadOnlyAuthorizationBytes: () => invalidAuthorization,
  }), /noWrite|no-write/i);
  assert.equal(reads, 0);
});

test('projection proposal fails closed on lineage and snapshot drift', async () => {
  const fixture = evidenceFixture();
  const run = (overrides) => runItemImageProjectionProposal({
    ...fixture.options,
    generatedAt: '2026-08-04T01:00:00.000Z',
    expiresAt: '2026-08-05T01:00:00.000Z',
  }, {
    readReadOnlyAuthorizationBytes: () => fixture.readOnlyAuthorizationBytes,
    readLineageResultBytes: () => overrides.lineageResultBytes ?? fixture.lineageResultBytes,
    readLineageInputContractBytes: () => overrides.lineageInputContractBytes ?? fixture.lineageInputContractBytes,
    readLineageBundleBytes: () => overrides.lineageBundleBytes ?? fixture.lineageBundleBytes,
    readLineageApplySnapshotBytes: () => overrides.lineageApplySnapshotBytes ?? fixture.lineageApplySnapshotBytes,
    readLineageAuthorizationPacketBytes: () => overrides.lineageAuthorizationPacketBytes ?? fixture.lineageAuthorizationPacketBytes,
    readUsedDecisionsBytes: () => overrides.usedDecisionsBytes ?? fixture.usedDecisionsBytes,
    loadManagedUrlPolicy: () => overrides.managedUrlPolicy ?? fixture.managedUrlPolicy,
    resolveRuntimeConfig: () => overrides.runtimeConfig ?? fixture.runtimeConfig,
    openConnection: async () => ({
      query: async () => [[], []],
      rollback: async () => {},
      end: async () => {},
    }),
    readDatabaseSnapshot: async () => overrides.snapshot ?? fixture.snapshot,
    writeSnapshot: ({ snapshot }) => ({ snapshot, sha256: shaBytes(Buffer.from(JSON.stringify(snapshot))) }),
    writeProposal: ({ proposal }) => proposal,
  });

  const failedResult = Buffer.from(JSON.stringify({
    ...JSON.parse(fixture.lineageResultBytes),
    status: 'FAILED',
  }));
  await assert.rejects(run({ lineageResultBytes: failedResult }), /lineage.*completed/i);

  const driftedInput = Buffer.from(JSON.stringify({
    ...JSON.parse(fixture.lineageInputContractBytes),
    lineageBundle: {
      ...JSON.parse(fixture.lineageInputContractBytes).lineageBundle,
      sha256: shaBytes(Buffer.from('other-bundle')),
    },
  }));
  await assert.rejects(run({ lineageInputContractBytes: driftedInput }), /bundle.*hash|lineage.*bundle/i);

  const unusedDecision = Buffer.from(JSON.stringify([]));
  await assert.rejects(run({ usedDecisionsBytes: unusedDecision }), /consumed.*decision|used decision/i);

  const packet = JSON.parse(fixture.lineageAuthorizationPacketBytes);
  const driftedPacket = Buffer.from(JSON.stringify({ ...packet, actor: 'different-owner' }));
  await assert.rejects(
    run({ lineageAuthorizationPacketBytes: driftedPacket }),
    /packet.*hash|content.*hash/i,
  );

  const wrongPolicy = {
    ...fixture.managedUrlPolicy,
    prefixes: ['https://evil.example.test/items/'],
  };
  await assert.rejects(run({ managedUrlPolicy: wrongPolicy }), /managed.*policy|prefix|cachedUrl.*managed/i);

  const missingProjection = {
    ...fixture.snapshot,
    projectionRows: fixture.snapshot.projectionRows.slice(0, 1),
  };
  await assert.rejects(run({ snapshot: missingProjection }), /projection.*key set|missing.*projection/i);

  const wrongFingerprint = {
    ...fixture.snapshot,
    target: { ...fixture.snapshot.target, serverUuid: 'other-server' },
  };
  await assert.rejects(run({ snapshot: wrongFingerprint }), /fingerprint|server/i);
});

test('projection proposal accepts an expired historical packet and freezes only its ledger entry', async () => {
  const fixture = evidenceFixture();
  const initialProposal = await runWithFixture(fixture);
  const appendedLedger = Buffer.from(JSON.stringify([
    ...JSON.parse(fixture.usedDecisionsBytes),
    {
      decisionIdentity: 'later-unrelated-decision',
      dispatchPermitHash: shaBytes(Buffer.from('later-dispatch-permit')),
    },
  ]));
  let ledgerReads = 0;
  const proposalAfterAppend = await runWithFixture(fixture, {
    readUsedDecisionsBytes: () => {
      ledgerReads += 1;
      return appendedLedger;
    },
  });
  const initialInput = buildItemImageProjectionInputContract({
    proposal: initialProposal,
    proposalPath: fixture.attemptPaths.proposalPath,
    proposalSha256: shaBytes(Buffer.from('same-proposal-bytes')),
  });
  const inputAfterAppend = buildItemImageProjectionInputContract({
    proposal: proposalAfterAppend,
    proposalPath: fixture.attemptPaths.proposalPath,
    proposalSha256: shaBytes(Buffer.from('same-proposal-bytes')),
  });

  assert.equal(ledgerReads, 1);
  assert.deepEqual(proposalAfterAppend, initialProposal);
  assert.deepEqual(inputAfterAppend, initialInput);
  assert.equal(proposalAfterAppend.lineage.dispatchPermitHash, fixture.dispatchPermitHash);
  assert.equal('usedDecisionsPath' in proposalAfterAppend.lineage, false);
  assert.equal('usedDecisionsSha256' in proposalAfterAppend.lineage, false);
  assert.ok(Date.parse(JSON.parse(fixture.lineageAuthorizationPacketBytes).expiresAt)
    < Date.parse(fixture.options.now));
});

test('projection proposal rejects attempt and read-only authorization path drift before connection', async () => {
  const fixture = evidenceFixture();
  let connections = 0;
  const dependencies = fixtureDependencies(fixture, {
    openConnection: async () => {
      connections += 1;
      throw new Error('must not connect');
    },
  });
  const otherAttempt = buildItemImageProjectionAttemptPaths('other-read-only-decision');

  await assert.rejects(
    runItemImageProjectionProposal({
      ...fixture.options,
      attemptRoot: otherAttempt.attemptRoot,
    }, dependencies),
    /attempt.*root|read.?only.*decision/i,
  );
  await assert.rejects(
    runItemImageProjectionProposal({
      ...fixture.options,
      readOnlyAuthorizationPath: otherAttempt.proposalReadOwnerInputPath,
    }, dependencies),
    /read.?only.*authorization.*attempt|attempt.*path/i,
  );
  assert.equal(connections, 0);
});

test('projection proposal rejects runtime host, port, or database drift before snapshot reads', async () => {
  const fixture = evidenceFixture();
  for (const [label, runtimeConfig] of [
    ['host', {
      ...fixture.runtimeConfig,
      database: { ...fixture.runtimeConfig.database, host: '127.0.0.2' },
    }],
    ['port', {
      ...fixture.runtimeConfig,
      database: { ...fixture.runtimeConfig.database, port: 23306 },
    }],
    ['database', {
      ...fixture.runtimeConfig,
      database: { ...fixture.runtimeConfig.database, name: 'other_local' },
    }],
  ]) {
    let connections = 0;
    let snapshotReads = 0;
    await assert.rejects(
      runItemImageProjectionProposal({
        ...fixture.options,
        generatedAt: '2026-08-04T01:00:00.000Z',
        expiresAt: '2026-08-05T01:00:00.000Z',
      }, fixtureDependencies(fixture, {
        resolveRuntimeConfig: () => runtimeConfig,
        openConnection: async () => {
          connections += 1;
          return {
            query: async () => [[], []],
            rollback: async () => {},
            end: async () => {},
          };
        },
        readDatabaseSnapshot: async () => {
          snapshotReads += 1;
          return fixture.snapshot;
        },
      })),
      new RegExp(`runtime.*${label}|${label}.*drift`, 'i'),
    );
    assert.equal(connections, 0, `${label} drift must fail before connecting`);
    assert.equal(snapshotReads, 0, `${label} drift must fail before snapshot reads`);
  }
});

test('projection proposal and input materializer write private evidence once', async () => {
  const fixture = evidenceFixture();
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-item-projection-proposal-'));
  try {
    await runItemImageProjectionProposal({
      ...fixture.options,
      repoRoot,
      generatedAt: '2026-08-04T01:00:00.000Z',
      expiresAt: '2026-08-05T01:00:00.000Z',
    }, {
      readReadOnlyAuthorizationBytes: () => fixture.readOnlyAuthorizationBytes,
      readLineageResultBytes: () => fixture.lineageResultBytes,
      readLineageInputContractBytes: () => fixture.lineageInputContractBytes,
      readLineageBundleBytes: () => fixture.lineageBundleBytes,
      readLineageApplySnapshotBytes: () => fixture.lineageApplySnapshotBytes,
      readLineageAuthorizationPacketBytes: () => fixture.lineageAuthorizationPacketBytes,
      readUsedDecisionsBytes: () => fixture.usedDecisionsBytes,
      loadManagedUrlPolicy: () => fixture.managedUrlPolicy,
      resolveRuntimeConfig: () => fixture.runtimeConfig,
      openConnection: async () => ({
        query: async () => [[], []],
        rollback: async () => {},
        end: async () => {},
      }),
      readDatabaseSnapshot: async () => fixture.snapshot,
    });

    const proposalPath = path.join(repoRoot, fixture.attemptPaths.proposalPath);
    const snapshotPath = path.join(repoRoot, fixture.attemptPaths.snapshotPath);
    assert.equal(fs.statSync(snapshotPath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(proposalPath).mode & 0o777, 0o600);
    const proposal = readItemImageProjectionProposal({
      repoRoot,
      proposalPath: fixture.attemptPaths.proposalPath,
    });
    assert.equal(proposal.operationId, 'canonical-item-image-projection-apply');

    const materialized = materializeItemImageProjectionInputContract({
      repoRoot,
      proposalPath: fixture.attemptPaths.proposalPath,
      inputContractPath: fixture.attemptPaths.inputPath,
    });
    assert.equal(materialized.relativePath, fixture.attemptPaths.inputPath);
    assert.equal(fs.statSync(materialized.absolutePath).mode & 0o777, 0o600);
    assert.deepEqual(readItemImageProjectionInputContract({
      repoRoot,
      inputContractPath: fixture.attemptPaths.inputPath,
      now: fixture.options.now,
    }), materialized.inputContract);
    assert.throws(
      () => materializeItemImageProjectionInputContract({
        repoRoot,
        proposalPath: fixture.attemptPaths.proposalPath,
        inputContractPath: fixture.attemptPaths.inputPath,
      }),
      /already exists|overwrite/i,
    );
    const otherAttempt = buildItemImageProjectionAttemptPaths('other-read-only-decision');
    assert.throws(
      () => materializeItemImageProjectionInputContract({
        repoRoot,
        proposalPath: fixture.attemptPaths.proposalPath,
        inputContractPath: otherAttempt.inputPath,
      }),
      /input.*attempt|attempt.*root/i,
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

function runWithFixture(fixture, dependencyOverrides = {}) {
  return runItemImageProjectionProposal({
    ...fixture.options,
    generatedAt: '2026-08-04T01:00:00.000Z',
    expiresAt: '2026-08-05T01:00:00.000Z',
  }, fixtureDependencies(fixture, dependencyOverrides));
}

function fixtureDependencies(fixture, overrides = {}) {
  return {
    readReadOnlyAuthorizationBytes: () => fixture.readOnlyAuthorizationBytes,
    readLineageResultBytes: () => fixture.lineageResultBytes,
    readLineageInputContractBytes: () => fixture.lineageInputContractBytes,
    readLineageBundleBytes: () => fixture.lineageBundleBytes,
    readLineageApplySnapshotBytes: () => fixture.lineageApplySnapshotBytes,
    readLineageAuthorizationPacketBytes: () => fixture.lineageAuthorizationPacketBytes,
    readUsedDecisionsBytes: () => fixture.usedDecisionsBytes,
    loadManagedUrlPolicy: () => fixture.managedUrlPolicy,
    resolveRuntimeConfig: () => fixture.runtimeConfig,
    openConnection: async () => ({
      query: async () => [[], []],
      rollback: async () => {},
      end: async () => {},
    }),
    readDatabaseSnapshot: async () => fixture.snapshot,
    writeSnapshot: ({ snapshot }) => ({
      snapshot,
      sha256: shaBytes(Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`)),
    }),
    writeProposal: ({ proposal }) => proposal,
    ...overrides,
  };
}

function evidenceFixture() {
  const lineageBundle = {
    schemaVersion: 1,
    entity: 'item_image_lineage_bundle',
    datasetType: 'item_image_sources_raw',
    counters: { total: 2 },
    itemImages: [
      { itemInternalName: 'Wood', role: 'icon', isPrimary: true },
      { itemInternalName: 'DirtBlock', role: 'icon', isPrimary: true },
    ],
  };
  const lineageResult = {
    schemaVersion: 1,
    resultKind: 'canonical_item_image_lineage_apply_result',
    operationId: 'canonical-item-image-lineage-apply',
    status: 'COMPLETED',
    expectedIdentityCount: 2,
    counts: { landing: 2, maint: 2, relation: 2, local: 2 },
    snapshot: {
      snapshotId: 'reports/authorization/canonical/canonical-item-image-lineage-apply.snapshot.json',
      rowCount: 8,
      takenAt: '2026-08-01T00:14:36.738Z',
    },
    stages: ['landing', 'maint', 'relation', 'local'].map((name) => ({
      name,
      status: 'applied',
      rowCount: 2,
    })),
  };
  const target = {
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
  const lineageBundleBytes = Buffer.from(JSON.stringify(lineageBundle));
  const lineageInputContract = {
    operationId: 'canonical-item-image-lineage-apply',
    lineageBundle: {
      path: 'reports/audit/item-image-lineage.bundle.json',
      sha256: shaBytes(lineageBundleBytes),
    },
    expectedIdentityCount: 2,
    serverFingerprint: {
      host: target.host,
      port: target.port,
      serverUuid: target.serverUuid,
      databases: [target.databases.local, target.databases.maint, target.databases.relation],
    },
  };
  const lineageInputContractBytes = Buffer.from(JSON.stringify(lineageInputContract));
  const lineageApplySnapshotBytes = Buffer.from(JSON.stringify({
    operationId: 'canonical-item-image-lineage-apply',
    takenAt: lineageResult.snapshot.takenAt,
    rowCount: lineageResult.snapshot.rowCount,
    layers: { landing: [], maint: [], relation: [], local: [] },
  }));
  const packetPayload = {
    schemaVersion: 1,
    authorizationStatus: 'AUTHORIZED',
    operationId: 'canonical-item-image-lineage-apply',
    generatedAt: '2026-07-31T00:00:00.000Z',
    expiresAt: '2026-08-02T00:00:00.000Z',
    authorizedAt: '2026-08-01T00:00:00.000Z',
    actor: 'admin',
    targetDatabases: [target.databases.local, target.databases.maint, target.databases.relation],
    dataBundleEntries: [{
      path: 'reports/authorization/canonical/canonical-item-image-lineage-apply.input.json',
      contentHash: shaBytes(lineageInputContractBytes),
    }],
    decisionIdentity: 'canonical-item-image-lineage-apply-20260801-02',
  };
  const packet = {
    ...packetPayload,
    packetHash: recomputeItemImageProjectionPacketHash(packetPayload),
  };
  const lineageAuthorizationPacketBytes = Buffer.from(JSON.stringify(packet));
  const dispatchPermitHash = shaBytes(Buffer.from('dispatch-permit'));
  const usedDecisionsBytes = Buffer.from(JSON.stringify([{
    decisionIdentity: packet.decisionIdentity,
    dispatchPermitHash,
  }]));
  const readOnlyAuthorizationBase = {
    schemaVersion: 1,
    authorizationKind: 'canonical_read_only_proposal_authorization',
    operationId: 'canonical-item-image-projection-apply',
    action: 'read-only-proposal',
    actor: 'admin',
    reason: 'Build the exact no-write item image projection proposal.',
    authorizationReference: 'devlog://item-image-projection/read-only-proposal-test',
    decisionIdentity: 'canonical-item-image-projection-proposal-read-20260804-01',
    authorizedAt: '2026-08-04T00:30:00.000Z',
    expiresAt: '2026-08-05T00:30:00.000Z',
    targetDatabases: [target.databases.local, target.databases.maint, target.databases.relation],
    noWrite: true,
  };
  const readOnlyAuthorizationBytes = Buffer.from(JSON.stringify({
    ...readOnlyAuthorizationBase,
    authorizationHash: canonicalItemImageProjectionHash(readOnlyAuthorizationBase),
  }));
  const attemptPaths = buildItemImageProjectionAttemptPaths(readOnlyAuthorizationBase.decisionIdentity);
  const runtimeConfig = {
    database: {
      host: target.host,
      port: target.port,
      name: target.databases.local,
    },
    serverFingerprint: {
      host: target.host,
      port: target.port,
      serverUuid: target.serverUuid,
      databases: [target.databases.local, target.databases.maint, target.databases.relation],
    },
  };
  return {
    attemptPaths,
    dispatchPermitHash,
    lineageBundleBytes,
    lineageInputContractBytes,
    lineageApplySnapshotBytes,
    lineageAuthorizationPacketBytes,
    usedDecisionsBytes,
    readOnlyAuthorizationBytes,
    runtimeConfig,
    managedUrlPolicy: {
      sourcePath: 'scripts/data/relation/managed-image-url-policy.mjs',
      sourceBytes: Buffer.from('managed policy fixture'),
      prefixes: ['http://localhost:9000/terrapedia-images/items/'],
    },
    lineageResultBytes: Buffer.from(JSON.stringify(lineageResult)),
    options: {
      attemptRoot: attemptPaths.attemptRoot,
      readOnlyAuthorizationPath: attemptPaths.proposalReadOwnerInputPath,
      now: '2026-08-04T01:00:00.000Z',
      lineageInputContractPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.input.json',
      lineageResultPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.result.json',
      lineageBundlePath: 'reports/audit/item-image-lineage.bundle.json',
      lineageApplySnapshotPath: lineageResult.snapshot.snapshotId,
      lineageAuthorizationPacketPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.packet.json',
      usedDecisionsPath: 'reports/authorization/canonical/used-decisions.json',
      expectedTarget: target,
      managedUrlPrefixes: ['http://localhost:9000/terrapedia-images/items/'],
    },
    snapshot: {
      target,
      relationRows: [
        relationRow('relation-wood', 'Wood', '/terrapedia-images/items/wood.png'),
        relationRow('relation-dirt', 'DirtBlock', '/terrapedia-images/items/dirt.png'),
      ],
      projectionRows: [
        projectionRow(1, 'relation-wood', 'Wood'),
        projectionRow(2, 'relation-dirt', 'DirtBlock'),
      ],
    },
  };
}

function relationRow(recordKey, internalName, cachedUrl) {
  return { recordKey, internalName, cachedUrl, role: 'icon', isPrimary: 1, status: 1, deleted: 0 };
}

function projectionRow(id, relationRecordKey, internalName) {
  return {
    id,
    relationRecordKey,
    internalName,
    image: `http://localhost:9000/legacy/${internalName}.png`,
    status: 1,
    deleted: 0,
  };
}

function shaBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
