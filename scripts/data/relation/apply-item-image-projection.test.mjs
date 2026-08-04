import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ITEM_IMAGE_PROJECTION_OPERATION_ID,
  ITEM_IMAGE_PROJECTION_POLICY_PATH,
  assertItemImageProjectionCompletedResult,
  assertItemImageProjectionFailedResult,
  buildItemImageProjectionInputContract,
  buildItemImageProjectionAttemptPaths,
  buildItemImageProjectionProposal,
  buildItemImageProjectionSnapshot,
  canonicalItemImageProjectionHash,
  recomputeItemImageProjectionPacketHash,
} from './item-image-projection-contract.mjs';
import { runItemImageProjectionApply } from './apply-item-image-projection.mjs';

test('projection apply verifies every frozen artifact before authorization and connection', async () => {
  const fixture = applyFixture();
  const events = [];
  const result = await runItemImageProjectionApply({
    repoRoot: '/fixture',
    inputContractPath: fixture.paths.inputPath,
    outputPath: fixture.paths.resultPath,
    apply: true,
    now: '2026-08-04T02:00:00.000Z',
  }, dependencies(fixture, events));

  const lastArtifact = events.lastIndexOf('artifact:scripts/data/relation/managed-image-url-policy.mjs');
  assert.ok(lastArtifact >= 0);
  assert.ok(lastArtifact < events.indexOf('authorization'));
  assert.ok(events.indexOf('authorization') < events.indexOf('connect'));
  assert.deepEqual(events.slice(-5), [
    'connect',
    'transaction',
    'consume-permit',
    'write-result:completed',
    'end',
  ]);
  assert.equal(result.status, 'completed');
  assert.doesNotThrow(() => assertItemImageProjectionCompletedResult({
    result,
    inputContract: fixture.inputContract,
  }));
});

test('projection apply dry-run validates static evidence without authorization, DB, or permit', async () => {
  const fixture = applyFixture();
  const events = [];
  const result = await runItemImageProjectionApply({
    repoRoot: '/fixture',
    inputContractPath: fixture.paths.inputPath,
    apply: false,
    now: '2026-08-04T02:00:00.000Z',
  }, dependencies(fixture, events));

  assert.equal(result.apply, false);
  assert.equal(events.includes('authorization'), false);
  assert.equal(events.includes('connect'), false);
  assert.equal(events.includes('consume-permit'), false);
});

test('projection apply static or expired input drift fails before authorization and connection', async () => {
  for (const mode of [
    'snapshot-drift',
    'snapshot-content-drift',
    'proposal-drift',
    'not-yet-valid',
    'expired',
  ]) {
    const fixture = applyFixture();
    const events = [];
    if (mode === 'snapshot-drift') {
      fixture.artifacts.set(
        fixture.paths.snapshotPath,
        Buffer.from(`${JSON.stringify({ ...fixture.snapshot, targetRowCount: 1 }, null, 2)}\n`),
      );
    }
    if (mode === 'proposal-drift') {
      fixture.artifacts.set(
        fixture.paths.inputPath,
        jsonBytes({ ...fixture.inputContract, expiresAt: '2026-08-05T02:00:00.000Z' }),
      );
    }
    if (mode === 'snapshot-content-drift') {
      const relationRows = fixture.snapshot.relationRows.map((row, index) => (
        index === 0 ? { ...row, cachedUrl: '/terrapedia-images/items/other.png' } : row
      ));
      const snapshot = {
        ...fixture.snapshot,
        relationRows,
        relationRowsSha256: canonicalItemImageProjectionHash(relationRows),
      };
      const snapshotBytes = jsonBytes(snapshot);
      const proposal = {
        ...fixture.proposal,
        snapshotSha256: shaBytes(snapshotBytes),
      };
      const proposalBytes = jsonBytes(proposal);
      const inputContract = buildItemImageProjectionInputContract({
        proposal,
        proposalPath: fixture.paths.proposalPath,
        proposalSha256: shaBytes(proposalBytes),
      });
      fixture.artifacts.set(fixture.paths.snapshotPath, snapshotBytes);
      fixture.artifacts.set(fixture.paths.proposalPath, proposalBytes);
      fixture.artifacts.set(fixture.paths.inputPath, jsonBytes(inputContract));
    }
    await assert.rejects(
      runItemImageProjectionApply({
        repoRoot: '/fixture',
        inputContractPath: fixture.paths.inputPath,
        outputPath: fixture.paths.resultPath,
        apply: true,
        now: mode === 'expired'
          ? '2026-08-06T00:00:00.000Z'
          : mode === 'not-yet-valid'
            ? '2026-08-04T00:00:00.000Z'
            : '2026-08-04T02:00:00.000Z',
      }, dependencies(fixture, events)),
      mode === 'expired'
        ? /expired/i
        : mode === 'not-yet-valid'
          ? /not yet valid/i
          : mode === 'proposal-drift'
            ? /proposal.*drift|input.*proposal/i
            : mode === 'snapshot-content-drift'
              ? /snapshot.*content|snapshot.*input/i
            : /snapshot.*hash|snapshot.*drift/i,
    );
    assert.equal(events.includes('authorization'), false, mode);
    assert.equal(events.includes('connect'), false, mode);
  }
});

test('projection apply requires expanded authorization bundle validation before connection', async () => {
  const fixture = applyFixture();
  const events = [];
  const deps = dependencies(fixture, events);
  delete deps.assertAuthorizedDataBundle;
  await assert.rejects(
    runItemImageProjectionApply({
      repoRoot: '/fixture',
      inputContractPath: fixture.paths.inputPath,
      outputPath: fixture.paths.resultPath,
      apply: true,
      now: '2026-08-04T02:00:00.000Z',
    }, deps),
    /data bundle.*validator|required/i,
  );
  assert.equal(events.includes('connect'), false);
  assert.equal(events.includes('consume-permit'), false);
});

test('projection apply writes strict failed evidence after an authorized transaction failure', async () => {
  const fixture = applyFixture();
  const events = [];
  const error = new Error('projection after hash drifted');
  error.itemImageProjectionTransaction = {
    began: true,
    rolledBack: true,
    permitConsumed: true,
    dmlAttempted: true,
  };
  const deps = dependencies(fixture, events, { transactionError: error });

  await assert.rejects(
    runItemImageProjectionApply({
      repoRoot: '/fixture',
      inputContractPath: fixture.paths.inputPath,
      outputPath: fixture.paths.resultPath,
      apply: true,
      now: '2026-08-04T02:00:00.000Z',
    }, deps),
    /after hash drifted/i,
  );
  assert.equal(deps.writtenResults.length, 1);
  const [failed] = deps.writtenResults;
  assert.equal(failed.status, 'failed');
  assert.doesNotThrow(() => assertItemImageProjectionFailedResult({
    result: failed,
    inputContract: fixture.inputContract,
  }));
  assert.equal(events.at(-1), 'end');
});

test('projection apply default reader rejects public or symbolic-link attempt evidence', async () => {
  for (const mode of ['public-input', 'symlink-proposal']) {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'item-projection-apply-'));
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'item-projection-outside-'));
    try {
      const fixture = applyFixture();
      for (const [relativePath, bytes] of fixture.artifacts) {
        const absolutePath = path.join(repoRoot, relativePath);
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
        fs.writeFileSync(absolutePath, bytes, { mode: 0o600 });
      }
      if (mode === 'public-input') {
        fs.chmodSync(path.join(repoRoot, fixture.paths.inputPath), 0o644);
      } else {
        const proposalPath = path.join(repoRoot, fixture.paths.proposalPath);
        const outsideProposal = path.join(outsideRoot, 'proposal.json');
        fs.writeFileSync(outsideProposal, fixture.artifacts.get(fixture.paths.proposalPath), { mode: 0o600 });
        fs.rmSync(proposalPath);
        fs.symlinkSync(outsideProposal, proposalPath);
      }
      await assert.rejects(
        runItemImageProjectionApply({
          repoRoot,
          inputContractPath: fixture.paths.inputPath,
          apply: false,
          now: '2026-08-04T02:00:00.000Z',
        }),
        /private|ordinary|symbolic/i,
        mode,
      );
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  }
});

function dependencies(fixture, events, options = {}) {
  const writtenResults = [];
  return {
    writtenResults,
    readArtifactBytes: ({ relativePath }) => {
      events.push(`artifact:${relativePath}`);
      const bytes = fixture.artifacts.get(relativePath);
      if (!bytes) throw new Error(`missing fixture artifact ${relativePath}`);
      return bytes;
    },
    assertOutputAvailable: () => events.push('output-preflight'),
    loadAuthorizedContext: async () => {
      events.push('authorization');
      return {
        operationId: ITEM_IMAGE_PROJECTION_OPERATION_ID,
        dataBundleSha256: fixture.dataBundleSha256,
      };
    },
    assertAuthorizedDataBundle: ({ authorizedContext }) => {
      assert.equal(authorizedContext.dataBundleSha256, fixture.dataBundleSha256);
      events.push('data-bundle');
    },
    connect: async () => {
      events.push('connect');
      return { end: async () => events.push('end') };
    },
    consumeDispatchPermit: async () => events.push('consume-permit'),
    executeTransaction: async ({ consumeDispatchPermit }) => {
      events.push('transaction');
      await consumeDispatchPermit();
      if (options.transactionError) throw options.transactionError;
      return {
        targetRowCount: fixture.inputContract.targetRowCount,
        changedRowCount: fixture.inputContract.changedRowCount,
        projectionAfterSha256: fixture.inputContract.projectionAfterSha256,
      };
    },
    writeResult: ({ result }) => {
      writtenResults.push(result);
      events.push(`write-result:${result.status}`);
    },
  };
}

function applyFixture() {
  const proposalDecisionIdentity = 'canonical-item-image-projection-proposal-read-20260804-01';
  const paths = buildItemImageProjectionAttemptPaths(proposalDecisionIdentity);
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
  const prefixes = ['http://localhost:9000/terrapedia-images/items/'];
  const policyBytes = Buffer.from('managed policy source fixture\n');
  const policy = {
    sourcePath: ITEM_IMAGE_PROJECTION_POLICY_PATH,
    sourceSha256: shaBytes(policyBytes),
    resolvedPrefixesSha256: canonicalItemImageProjectionHash(prefixes),
  };
  const relationRows = [
    relationRow('relation-dirt', 'DirtBlock', '/terrapedia-images/items/dirt.png'),
    relationRow('relation-wood', 'Wood', '/terrapedia-images/items/wood.png'),
  ];
  const projectionRows = [
    projectionRow(2, 'relation-dirt', 'DirtBlock'),
    projectionRow(1, 'relation-wood', 'Wood'),
  ];
  const snapshot = buildItemImageProjectionSnapshot({
    generatedAt: '2026-08-04T01:00:00.000Z',
    target,
    managedUrlPolicy: policy,
    managedUrlPrefixes: prefixes,
    lineageKeys: ['DirtBlock', 'Wood'],
    relationRows,
    projectionRows,
  });
  const snapshotBytes = jsonBytes(snapshot);

  const lineageBundle = {
    entity: 'item_image_lineage_bundle',
    datasetType: 'item_image_sources_raw',
    counters: { total: 2 },
    itemImages: [{ itemInternalName: 'DirtBlock' }, { itemInternalName: 'Wood' }],
  };
  const lineageBundleBytes = jsonBytes(lineageBundle);
  const lineageInput = {
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
      databases: Object.values(target.databases),
    },
  };
  const lineageInputBytes = jsonBytes(lineageInput);
  const lineageApplySnapshot = {
    operationId: 'canonical-item-image-lineage-apply',
    takenAt: '2026-08-01T00:14:36.738Z',
    rowCount: 8,
    layers: { landing: [], maint: [], relation: [], local: [] },
  };
  const lineageApplySnapshotBytes = jsonBytes(lineageApplySnapshot);
  const lineageResult = {
    schemaVersion: 1,
    resultKind: 'canonical_item_image_lineage_apply_result',
    operationId: 'canonical-item-image-lineage-apply',
    status: 'COMPLETED',
    expectedIdentityCount: 2,
    snapshot: {
      snapshotId: 'reports/authorization/canonical/canonical-item-image-lineage-apply.snapshot.json',
      rowCount: 8,
      takenAt: lineageApplySnapshot.takenAt,
    },
    stages: ['landing', 'maint', 'relation', 'local'].map((name) => ({
      name,
      status: 'applied',
      rowCount: 2,
    })),
    counts: { landing: 2, maint: 2, relation: 2, local: 2 },
  };
  const lineageResultBytes = jsonBytes(lineageResult);
  const packetPayload = {
    operationId: 'canonical-item-image-lineage-apply',
    authorizationStatus: 'AUTHORIZED',
    targetDatabases: Object.values(target.databases),
    dataBundleEntries: [{
      path: 'reports/authorization/canonical/canonical-item-image-lineage-apply.input.json',
      contentHash: shaBytes(lineageInputBytes),
    }],
    decisionIdentity: 'canonical-item-image-lineage-apply-20260801-02',
  };
  const packet = {
    ...packetPayload,
    packetHash: recomputeItemImageProjectionPacketHash(packetPayload),
  };
  const packetBytes = jsonBytes(packet);
  const dispatchPermitHash = shaBytes(Buffer.from('dispatch permit'));
  const proposalAuthorization = {
    schemaVersion: 1,
    authorizationKind: 'canonical_read_only_proposal_authorization',
    operationId: ITEM_IMAGE_PROJECTION_OPERATION_ID,
    action: 'read-only-proposal',
    actor: 'owner',
    reason: 'build exact projection proposal',
    authorizationReference: 'owner-approval-20260804-01',
    decisionIdentity: proposalDecisionIdentity,
    authorizedAt: '2026-08-04T00:30:00.000Z',
    expiresAt: '2026-08-04T03:00:00.000Z',
    targetDatabases: Object.values(target.databases),
    noWrite: true,
  };
  proposalAuthorization.authorizationHash = canonicalItemImageProjectionHash(proposalAuthorization);
  const proposalAuthorizationBytes = jsonBytes(proposalAuthorization);
  const proposal = buildItemImageProjectionProposal({
    attemptId: paths.attemptId,
    attemptRoot: paths.attemptRoot,
    generatedAt: snapshot.generatedAt,
    expiresAt: '2026-08-05T01:00:00.000Z',
    proposalAuthorization: {
      path: paths.proposalReadOwnerInputPath,
      sha256: shaBytes(proposalAuthorizationBytes),
      decisionIdentity: proposalDecisionIdentity,
      authorizationHash: proposalAuthorization.authorizationHash,
    },
    lineage: {
      inputContractPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.input.json',
      inputContractSha256: shaBytes(lineageInputBytes),
      resultPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.result.json',
      resultSha256: shaBytes(lineageResultBytes),
      bundlePath: lineageInput.lineageBundle.path,
      bundleSha256: shaBytes(lineageBundleBytes),
      applySnapshotPath: lineageResult.snapshot.snapshotId,
      applySnapshotSha256: shaBytes(lineageApplySnapshotBytes),
      authorizationPacketPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.packet.json',
      authorizationPacketSha256: shaBytes(packetBytes),
      decisionIdentity: packet.decisionIdentity,
      packetHash: packet.packetHash,
      dispatchPermitHash,
      completedRowCount: 2,
    },
    lineageKeys: snapshot.keys,
    target,
    snapshotPath: paths.snapshotPath,
    snapshotSha256: shaBytes(snapshotBytes),
    managedUrlPolicy: policy,
    managedUrlPrefixes: prefixes,
    relationRows,
    projectionRows,
  });
  const proposalBytes = jsonBytes(proposal);
  const inputContract = buildItemImageProjectionInputContract({
    proposal,
    proposalPath: paths.proposalPath,
    proposalSha256: shaBytes(proposalBytes),
  });
  const inputBytes = jsonBytes(inputContract);
  const artifacts = new Map([
    [paths.inputPath, inputBytes],
    [paths.proposalPath, proposalBytes],
    [paths.snapshotPath, snapshotBytes],
    [paths.proposalReadOwnerInputPath, proposalAuthorizationBytes],
    [ITEM_IMAGE_PROJECTION_POLICY_PATH, policyBytes],
    [inputContract.lineage.inputContractPath, lineageInputBytes],
    [inputContract.lineage.resultPath, lineageResultBytes],
    [inputContract.lineage.bundlePath, lineageBundleBytes],
    [inputContract.lineage.applySnapshotPath, lineageApplySnapshotBytes],
    [inputContract.lineage.authorizationPacketPath, packetBytes],
  ]);
  return {
    artifacts,
    inputContract,
    proposal,
    snapshot,
    paths,
    dataBundleSha256: shaBytes(Buffer.from([...artifacts.keys()].join('\n'))),
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

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function shaBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
