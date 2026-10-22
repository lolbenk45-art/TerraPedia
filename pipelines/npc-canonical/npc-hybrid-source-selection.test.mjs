import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildLocalNpcSourceBinding,
  buildNpcOfflineLocalDecision,
  decideNpcHybridSource,
  assertNpcHybridSourceDecision,
} from './npc-hybrid-source-selection.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;

function writeLocalFixture(t, { count = 762, duplicate = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-hybrid-source-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const records = Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    internalName: `Npc${index + 1}`,
    name: `NPC ${index + 1}`,
  }));
  if (duplicate) records[1].id = records[0].id;
  const standardized = { entity: 'npcs', generatedAt: '2026-03-28T11:24:36.383Z', records };
  const standardizedPath = path.join(root, 'npcs.standardized.json');
  const viewMetaPath = path.join(root, '_meta.json');
  const mapPath = path.join(root, 'npc-standardized-map.json');
  fs.writeFileSync(standardizedPath, JSON.stringify(standardized));
  fs.writeFileSync(viewMetaPath, JSON.stringify({ entity: 'npcs', totalRecords: count }));
  fs.writeFileSync(mapPath, JSON.stringify({ count, records: Object.fromEntries(records.map((row) => [row.id, row])) }));
  return { standardizedPath, viewMetaPath, mapPath };
}

test('unchanged Wiki fingerprint selects the complete local NPC source', (t) => {
  const files = writeLocalFixture(t);
  const local = buildLocalNpcSourceBinding({
    ...files,
    wikiManifestRecord: {
      sourceKey: 'wiki.module.npcinfo',
      pageId: 18065,
      revisionId: 123,
      revisionTimestamp: '2026-02-13T13:47:32Z',
      contentHash: HASH.slice('sha256:'.length),
    },
  });
  const decision = decideNpcHybridSource({
    remoteFingerprint: { status: 'ok', pageId: 18065, revisionId: 123, revisionTimestamp: '2026-02-13T13:47:32Z' },
    localBinding: local,
  });
  assert.equal(decision.mode, 'local-unchanged');
  assert.equal(decision.recordCount, 762);
  assert.equal(assertNpcHybridSourceDecision(decision).mode, 'local-unchanged');
});

test('changed Wiki fingerprint requires a private live capture', (t) => {
  const files = writeLocalFixture(t);
  const local = buildLocalNpcSourceBinding({
    ...files,
    wikiManifestRecord: { pageId: 18065, revisionId: 123, revisionTimestamp: '2026-02-13T13:47:32Z', contentHash: HASH.slice(7) },
  });
  const decision = decideNpcHybridSource({
    remoteFingerprint: { status: 'ok', pageId: 18065, revisionId: 124, revisionTimestamp: '2026-10-21T00:00:00Z' },
    localBinding: local,
    privateCapture: { path: '.local/tmp/npcs/source/module.json', contentHash: HASH, recordCount: 762 },
  });
  assert.equal(decision.mode, 'wiki-changed');
  assert.equal(decision.privateCapture.path, '.local/tmp/npcs/source/module.json');
});

test('probe unavailable is fail-closed and cannot select local data', (t) => {
  const files = writeLocalFixture(t);
  const local = buildLocalNpcSourceBinding({ ...files, wikiManifestRecord: { pageId: 18065, revisionTimestamp: '2026-02-13T13:47:32Z', contentHash: HASH.slice(7) } });
  assert.throws(
    () => decideNpcHybridSource({ remoteFingerprint: { status: 'probe_unavailable', reason: 'timeout' }, localBinding: local }),
    /probe_unavailable/,
  );
});

test('user-directed offline decision binds the failed Wiki probe and complete local source', (t) => {
  const files = writeLocalFixture(t);
  const localBinding = buildLocalNpcSourceBinding({
    ...files,
    wikiManifestRecord: {
      sourceKey: 'wiki.module.npcinfo',
      pageId: 18065,
      revisionTimestamp: '2026-02-13T13:47:32Z',
      contentHash: HASH.slice(7),
    },
  });
  const failedProbe = {
    status: 'probe_unavailable',
    actionId: 'domain-source-npcs',
    phase: 'wiki-revision-probe',
    artifactPath: '.local/tmp/npc/source-decision.json',
    artifactSha256: HASH,
    reason: 'HTTP 502 Bad Gateway',
    localBinding: {
      sourceKey: localBinding.sourceKey,
      mode: localBinding.mode,
      recordCount: localBinding.recordCount,
      stableIdCount: localBinding.stableIdCount,
      standardizedSha256: localBinding.standardizedSha256,
      sourceIdentity: localBinding.sourceIdentity,
      sourceManifestContentHash: localBinding.sourceManifestContentHash,
    },
  };
  const decision = buildNpcOfflineLocalDecision({
    localBinding,
    failedProbe,
    authorization: 'user-directed-local-offline',
  });
  assert.equal(decision.mode, 'local-offline-authorized');
  assert.equal(decision.recordCount, 762);
  assert.equal(decision.failedProbe.artifactSha256, HASH);
  assert.equal(assertNpcHybridSourceDecision(decision), decision);
});

test('duplicate stable NPC IDs invalidate the local source binding', (t) => {
  const files = writeLocalFixture(t, { duplicate: true });
  assert.throws(() => buildLocalNpcSourceBinding({ ...files, wikiManifestRecord: {} }), /stable NPC IDs|duplicate/i);
});

test('offline local decision requires a source map with the exact NPC stable ID set', (t) => {
  const files = writeLocalFixture(t);
  const map = JSON.parse(fs.readFileSync(files.mapPath, 'utf8'));
  delete map.records['762'];
  map.records['9999'] = { id: 9999, internalName: 'WrongNpc' };
  fs.writeFileSync(files.mapPath, JSON.stringify(map));
  assert.throws(() => buildLocalNpcSourceBinding({
    ...files,
    wikiManifestRecord: {
      pageId: 18065,
      revisionTimestamp: '2026-02-13T13:47:32Z',
      contentHash: HASH.slice(7),
    },
  }), /exact stable source ID set/i);
});
