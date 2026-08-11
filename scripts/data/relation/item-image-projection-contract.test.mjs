import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ITEM_IMAGE_PROJECTION_CONTRACT_VERSION,
  ITEM_IMAGE_PROJECTION_OPERATION_ID,
  assertItemImageProjectionCompletedResult,
  assertItemImageProjectionFailedResult,
  assertItemImageProjectionInputContract,
  assertItemImageProjectionSnapshot,
  buildItemImageProjectionCompletedResult,
  buildItemImageProjectionFailedResult,
  buildItemImageProjectionInputContract,
  buildItemImageProjectionProposal,
  buildItemImageProjectionSnapshot,
  buildItemImageProjectionAttemptPaths,
  canonicalItemImageProjectionHash,
  deriveItemImageProjectionAttemptId,
  deriveItemImageProjectionAttemptRoot,
  recomputeItemImageProjectionPacketHash,
  assertItemImageProjectionAuthorizationPacket,
  readItemImageProjectionInputContract,
  readItemImageProjectionSnapshot,
  writeItemImageProjectionPrivateJson,
} from './item-image-projection-contract.mjs';

const ITEM_PREFIXES = Object.freeze([
  'http://localhost:9000/terrapedia-images/items/',
]);

test('projection contract builds deterministic exact before and after evidence', () => {
  const first = buildItemImageProjectionProposal(proposalFixture());
  const second = buildItemImageProjectionProposal(proposalFixture({ reverseRows: true }));

  assert.equal(ITEM_IMAGE_PROJECTION_OPERATION_ID, 'canonical-item-image-projection-apply');
  assert.equal(ITEM_IMAGE_PROJECTION_CONTRACT_VERSION, 'item-image-projection-apply-v1');
  assert.deepEqual(second, first);
  assert.equal(first.apply, false);
  assert.notEqual(first.proposalAuthorization.decisionIdentity, first.lineage.decisionIdentity);
  assert.equal(first.attemptId,
    deriveItemImageProjectionAttemptId(first.proposalAuthorization.decisionIdentity));
  assert.equal(first.attemptRoot,
    deriveItemImageProjectionAttemptRoot(first.proposalAuthorization.decisionIdentity));
  assert.equal(first.proposalAuthorization.path,
    `${first.attemptRoot}/proposal-read.owner-input.json`);
  assert.deepEqual(first.keys, ['DirtBlock', 'Wood']);
  assert.equal(first.targetRowCount, 2);
  assert.equal(first.changedRowCount, 2);
  assert.deepEqual(first.projectionAfterRows, [
    {
      id: 2,
      relationRecordKey: 'relation-dirt',
      internalName: 'DirtBlock',
      image: '/terrapedia-images/items/dirt.png',
    },
    {
      id: 1,
      relationRecordKey: 'relation-wood',
      internalName: 'Wood',
      image: '/terrapedia-images/items/wood.png',
    },
  ]);
  assert.equal(first.keySetSha256, canonicalItemImageProjectionHash(first.keys));
  assert.equal(first.relationRowsSha256, canonicalItemImageProjectionHash(first.relationRows));
  assert.equal(first.projectionBeforeSha256, canonicalItemImageProjectionHash(first.projectionBeforeRows));
  assert.equal(first.projectionAfterSha256, canonicalItemImageProjectionHash(first.projectionAfterRows));
  assert.equal(first.snapshotPath, `${first.attemptRoot}/snapshot.json`);
  assert.equal(first.managedUrlPolicy.resolvedPrefixesSha256,
    canonicalItemImageProjectionHash(first.managedUrlPrefixes));
});

test('projection snapshot freezes normalized policy, source, and target rows', () => {
  const fixture = proposalFixture();
  const snapshot = buildItemImageProjectionSnapshot({
    generatedAt: fixture.generatedAt,
    target: fixture.target,
    managedUrlPolicy: fixture.managedUrlPolicy,
    managedUrlPrefixes: fixture.managedUrlPrefixes,
    lineageKeys: fixture.lineageKeys,
    relationRows: fixture.relationRows,
    projectionRows: fixture.projectionRows,
  });

  assert.equal(snapshot.snapshotKind, 'canonical_item_image_projection_snapshot');
  assert.equal(snapshot.target.ownedColumn, 'image');
  assert.doesNotThrow(() => assertItemImageProjectionSnapshot(snapshot));
  assert.throws(
    () => assertItemImageProjectionSnapshot({
      ...snapshot,
      managedUrlPolicy: {
        ...snapshot.managedUrlPolicy,
        resolvedPrefixesSha256: sha('wrong-prefixes'),
      },
    }),
    /policy|source.*hash/i,
  );
});

test('projection relation key may differ from the image evidence record key', () => {
  const proposal = buildItemImageProjectionProposal(proposalFixture({
    relationRows: [
      relationRow({ recordKey: 'image-record-dirt', internalName: 'DirtBlock', cachedUrl: '/terrapedia-images/items/dirt.png' }),
      relationRow({ recordKey: 'image-record-wood', internalName: 'Wood', cachedUrl: '/terrapedia-images/items/wood.png' }),
    ],
    projectionRows: [
      projectionRow({ id: 1, relationRecordKey: 'relation-wood', internalName: 'Wood' }),
      projectionRow({ id: 2, relationRecordKey: 'relation-dirt', internalName: 'DirtBlock' }),
    ],
  }));

  assert.deepEqual(proposal.projectionAfterRows.map((row) => row.relationRecordKey), [
    'relation-dirt',
    'relation-wood',
  ]);
});

test('projection proposal accepts a frozen multi-prefix managed URL policy', () => {
  const managedUrlPrefixes = [
    ...ITEM_PREFIXES,
    'http://localhost:19000/terrapedia-images/items/',
    'http://localhost:19100/terrapedia-images/items/',
  ];
  const proposal = buildItemImageProjectionProposal(proposalFixture({
    managedUrlPrefixes,
    managedUrlPolicy: {
      ...proposalFixture().managedUrlPolicy,
      resolvedPrefixesSha256: canonicalItemImageProjectionHash([...managedUrlPrefixes].sort()),
    },
  }));

  assert.deepEqual(proposal.managedUrlPrefixes, [...managedUrlPrefixes].sort());
});

test('projection packet hash covers every packet field except packetHash', () => {
  const packet = {
    operationId: ITEM_IMAGE_PROJECTION_OPERATION_ID,
    decisionIdentity: 'canonical-item-image-lineage-apply-20260801-02',
    authorizationStatus: 'authorized',
    dataBundleEntries: [{ path: 'reports/audit/item-image-lineage.bundle.json', contentHash: sha('bundle') }],
  };
  const signed = { ...packet, packetHash: recomputeItemImageProjectionPacketHash(packet) };
  assert.doesNotThrow(() => assertItemImageProjectionAuthorizationPacket(signed));
  assert.throws(
    () => assertItemImageProjectionAuthorizationPacket({ ...signed, authorizationStatus: 'revoked' }),
    /content hash|packet/i,
  );
});

test('projection contract rejects missing, extra, duplicate, inactive, and unmanaged rows', () => {
  for (const [database, value] of [
    ['local', 'other_local'],
    ['maint', 'other_maint'],
    ['relation', 'other_relation'],
  ]) {
    const fixture = proposalFixture();
    fixture.target = {
      ...fixture.target,
      databases: { ...fixture.target.databases, [database]: value },
      ...(database === 'relation' ? { ownedDatabase: value } : {}),
    };
    assert.throws(
      () => buildItemImageProjectionProposal(fixture),
      /formal database|database triplet|terria_v1/i,
    );
  }
  assert.throws(
    () => buildItemImageProjectionProposal(proposalFixture({
      snapshotPath: `${proposalFixture().attemptRoot}/other.json`,
    })),
    /snapshot\.json|snapshotPath/i,
  );
  assert.throws(
    () => buildItemImageProjectionProposal(proposalFixture({
      projectionRows: proposalFixture().projectionRows.slice(0, 1),
    })),
    /projection.*key set|missing.*projection/i,
  );
  assert.throws(
    () => buildItemImageProjectionProposal(proposalFixture({
      relationRows: proposalFixture().relationRows.map((row, index) => (
        index === 0 ? { ...row, recordKey: proposalFixture().relationRows[1].recordKey } : row
      )),
    })),
    /duplicate.*recordKey|duplicate.*relation/i,
  );
  assert.throws(
    () => buildItemImageProjectionProposal(proposalFixture({
      projectionRows: proposalFixture().projectionRows.map((row, index) => (
        index === 0 ? { ...row, id: proposalFixture().projectionRows[1].id } : row
      )),
    })),
    /duplicate.*id|projection/i,
  );
  assert.throws(
    () => buildItemImageProjectionProposal(proposalFixture({
      projectionRows: [
        ...proposalFixture().projectionRows,
        projectionRow({ id: 3, internalName: 'StoneBlock', relationRecordKey: 'relation-stone' }),
      ],
    })),
    /projection.*key set|extra.*projection/i,
  );
  assert.throws(
    () => buildItemImageProjectionProposal(proposalFixture({
      relationRows: [
        ...proposalFixture().relationRows,
        relationRow({ recordKey: 'relation-wood-duplicate', internalName: 'Wood' }),
      ],
    })),
    /duplicate.*primary|duplicate.*relation/i,
  );
  assert.throws(
    () => buildItemImageProjectionProposal(proposalFixture({
      relationRows: proposalFixture().relationRows.map((row, index) => (
        index === 0 ? { ...row, status: 0 } : row
      )),
    })),
    /active.*relation|status/i,
  );
  assert.throws(
    () => buildItemImageProjectionProposal(proposalFixture({
      relationRows: proposalFixture().relationRows.map((row, index) => (
        index === 0 ? { ...row, cachedUrl: 'https://terraria.wiki.gg/wood.png' } : row
      )),
    })),
    /managed/i,
  );
});

test('projection input and completed result bind every proposal identity exactly', () => {
  const proposal = buildItemImageProjectionProposal(proposalFixture());
  const inputContract = buildItemImageProjectionInputContract({
    proposal,
    proposalPath: `${proposal.attemptRoot}/proposal.json`,
    proposalSha256: canonicalItemImageProjectionHash(proposal),
  });
  const result = buildItemImageProjectionCompletedResult({
    inputContract,
    inputContractPath: `${proposal.attemptRoot}/input.json`,
    inputContractSha256: canonicalItemImageProjectionHash(inputContract),
    completedAt: '2026-08-04T03:00:00.000Z',
  });

  assert.equal(inputContract.apply, true);
  assert.equal(result.status, 'completed');
  assert.equal(result.apply, true);
  assert.doesNotThrow(() => assertItemImageProjectionInputContract(inputContract));
  assert.doesNotThrow(() => assertItemImageProjectionCompletedResult({ result, inputContract }));
  assert.throws(
    () => assertItemImageProjectionInputContract({ ...inputContract, unexpected: true }),
    /unexpected|keys/i,
  );
  assert.throws(
    () => buildItemImageProjectionInputContract({
      proposal,
      proposalPath: `${proposal.attemptRoot}/other.json`,
      proposalSha256: canonicalItemImageProjectionHash(proposal),
    }),
    /proposal\.json|proposalPath/i,
  );
  assert.throws(
    () => assertItemImageProjectionInputContract({
      ...inputContract,
      projectionAfterSha256: canonicalItemImageProjectionHash([]),
    }),
    /after.*hash|projectionAfterSha256/i,
  );
  assert.throws(
    () => assertItemImageProjectionCompletedResult({
      result: { ...result, changedRowCount: result.changedRowCount - 1 },
      inputContract,
    }),
    /changed.*count/i,
  );
  assert.throws(
    () => buildItemImageProjectionCompletedResult({
      inputContract,
      inputContractPath: `${proposal.attemptRoot}/other.json`,
      inputContractSha256: canonicalItemImageProjectionHash(inputContract),
      completedAt: '2026-08-04T03:00:00.000Z',
    }),
    /input\.json|inputContractPath/i,
  );
});

test('projection failed result freezes transaction and terminal error evidence', () => {
  const proposal = buildItemImageProjectionProposal(proposalFixture());
  const inputContract = buildItemImageProjectionInputContract({
    proposal,
    proposalPath: `${proposal.attemptRoot}/proposal.json`,
    proposalSha256: canonicalItemImageProjectionHash(proposal),
  });
  const result = buildItemImageProjectionFailedResult({
    inputContract,
    inputContractPath: `${proposal.attemptRoot}/input.json`,
    inputContractSha256: canonicalItemImageProjectionHash(inputContract),
    startedAt: '2026-08-04T02:00:00.000Z',
    failedAt: '2026-08-04T02:00:01.000Z',
    transaction: {
      began: true,
      rolledBack: true,
      permitConsumed: true,
      dmlAttempted: true,
    },
    error: { name: 'Error', message: 'after hash drifted' },
  });

  assert.equal(result.status, 'failed');
  assert.doesNotThrow(() => assertItemImageProjectionFailedResult({ result, inputContract }));
  assert.throws(
    () => assertItemImageProjectionFailedResult({
      result: {
        ...result,
        transaction: { ...result.transaction, rolledBack: false },
      },
      inputContract,
    }),
    /rollback/i,
  );
});

test('projection private JSON is 0600, no-overwrite, and rejects unsafe paths', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-item-projection-contract-'));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-item-projection-outside-'));
  try {
    const proposal = buildItemImageProjectionProposal(proposalFixture());
    const paths = buildItemImageProjectionAttemptPaths(proposal.lineage.decisionIdentity);
    const inputContract = buildItemImageProjectionInputContract({
      proposal,
      proposalPath: `${proposal.attemptRoot}/proposal.json`,
      proposalSha256: canonicalItemImageProjectionHash(proposal),
    });
    const written = writeItemImageProjectionPrivateJson({
      repoRoot,
      outputPath: paths.inputPath,
      value: inputContract,
      label: 'projection input contract',
    });
    assert.equal(fs.statSync(written.absolutePath).mode & 0o777, 0o600);
    assert.deepEqual(readItemImageProjectionInputContract({
      repoRoot,
      inputContractPath: paths.inputPath,
      now: '2026-08-04T02:00:00.000Z',
    }), inputContract);
    assert.throws(
      () => readItemImageProjectionInputContract({
        repoRoot,
        inputContractPath: paths.inputPath,
        now: '2026-08-04T00:00:00.000Z',
      }),
      /not yet valid/i,
    );
    assert.throws(
      () => readItemImageProjectionInputContract({
        repoRoot,
        inputContractPath: paths.inputPath,
        now: '2026-08-06T00:00:00.000Z',
      }),
      /expired/i,
    );
    const fixture = proposalFixture();
    const snapshot = buildItemImageProjectionSnapshot({
      generatedAt: fixture.generatedAt,
      target: fixture.target,
      managedUrlPolicy: fixture.managedUrlPolicy,
      managedUrlPrefixes: fixture.managedUrlPrefixes,
      lineageKeys: fixture.lineageKeys,
      relationRows: fixture.relationRows,
      projectionRows: fixture.projectionRows,
    });
      writeItemImageProjectionPrivateJson({
        repoRoot,
        outputPath: paths.snapshotPath,
      value: snapshot,
      label: 'projection snapshot',
    });
    assert.deepEqual(readItemImageProjectionSnapshot({ repoRoot, snapshotPath: paths.snapshotPath }), snapshot);
    assert.throws(
      () => writeItemImageProjectionPrivateJson({
        repoRoot,
        outputPath: paths.inputPath,
        value: inputContract,
      }),
      /already exists|overwrite/i,
    );

    const symlinkPath = path.join(repoRoot, 'reports', 'authorization', 'linked');
    fs.mkdirSync(path.dirname(symlinkPath), { recursive: true });
    fs.symlinkSync(outsideRoot, symlinkPath, 'dir');
    assert.throws(
      () => writeItemImageProjectionPrivateJson({
        repoRoot,
        outputPath: 'reports/authorization/linked/unsafe.json',
        value: inputContract,
      }),
      /symbolic|ancestor|inside.*repository/i,
    );
    assert.throws(
      () => writeItemImageProjectionPrivateJson({
        repoRoot,
        outputPath: path.join(outsideRoot, 'outside.json'),
        value: inputContract,
      }),
      /inside.*repository|repository-relative/i,
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});

function proposalFixture(overrides = {}) {
  const decisionIdentity = 'canonical-item-image-lineage-apply-20260801-02';
  const proposalDecisionIdentity = 'canonical-item-image-projection-proposal-read-20260804-01';
  const attemptPaths = buildItemImageProjectionAttemptPaths(proposalDecisionIdentity);
  const relationRows = overrides.relationRows ?? [
    relationRow({
      recordKey: 'relation-wood',
      internalName: 'Wood',
      cachedUrl: '/terrapedia-images/items/wood.png',
    }),
    relationRow({
      recordKey: 'relation-dirt',
      internalName: 'DirtBlock',
      cachedUrl: '/terrapedia-images/items/dirt.png',
    }),
  ];
  const projectionRows = overrides.projectionRows ?? [
    projectionRow({ id: 1, relationRecordKey: 'relation-wood', internalName: 'Wood' }),
    projectionRow({ id: 2, relationRecordKey: 'relation-dirt', internalName: 'DirtBlock' }),
  ];
  return {
    generatedAt: '2026-08-04T01:00:00.000Z',
    expiresAt: '2026-08-05T01:00:00.000Z',
    attemptId: attemptPaths.attemptId,
    attemptRoot: attemptPaths.attemptRoot,
    proposalAuthorization: {
      path: attemptPaths.proposalReadOwnerInputPath,
      sha256: sha('proposal-read-owner-input'),
      decisionIdentity: proposalDecisionIdentity,
      authorizationHash: sha('proposal-read-owner-authorization'),
    },
    lineage: {
      inputContractPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.input.json',
      inputContractSha256: sha('lineage-input-contract'),
      resultPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.result.json',
      resultSha256: sha('lineage-result'),
      bundlePath: 'reports/audit/item-image-lineage.bundle.json',
      bundleSha256: sha('lineage-bundle'),
      applySnapshotPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.snapshot.json',
      applySnapshotSha256: sha('lineage-apply-snapshot'),
      authorizationPacketPath: 'reports/authorization/canonical/canonical-item-image-lineage-apply.packet.json',
      authorizationPacketSha256: sha('lineage-authorization-packet'),
      decisionIdentity,
      packetHash: sha('lineage-packet-hash'),
      dispatchPermitHash: sha('dispatch-permit-hash'),
      completedRowCount: 2,
    },
    lineageKeys: ['Wood', 'DirtBlock'],
    target: {
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
    },
    snapshotPath: overrides.snapshotPath ?? attemptPaths.snapshotPath,
    snapshotSha256: sha('projection-snapshot'),
    managedUrlPolicy: overrides.managedUrlPolicy ?? {
      sourcePath: 'scripts/data/relation/managed-image-url-policy.mjs',
      sourceSha256: sha('managed-policy-source'),
      resolvedPrefixesSha256: canonicalItemImageProjectionHash(ITEM_PREFIXES),
    },
    managedUrlPrefixes: overrides.managedUrlPrefixes ?? ITEM_PREFIXES,
    relationRows: overrides.reverseRows ? [...relationRows].reverse() : relationRows,
    projectionRows: overrides.reverseRows ? [...projectionRows].reverse() : projectionRows,
  };
}

function relationRow({ recordKey, internalName, cachedUrl = '/terrapedia-images/items/wood.png' }) {
  return {
    recordKey,
    internalName,
    cachedUrl,
    role: 'icon',
    isPrimary: 1,
    status: 1,
    deleted: 0,
  };
}

function projectionRow({ id, relationRecordKey, internalName }) {
  return {
    id,
    relationRecordKey,
    internalName,
    image: `http://localhost:9000/legacy/${internalName}.png`,
    status: 1,
    deleted: 0,
  };
}

function sha(text) {
  return `sha256:${createHash('sha256').update(String(text)).digest('hex')}`;
}
