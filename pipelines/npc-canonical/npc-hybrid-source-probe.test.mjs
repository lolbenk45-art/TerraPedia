import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runNpcHybridSourceProbe } from './npc-hybrid-source-probe.mjs';

test('NPC hybrid probe writes terminal completed progress and local-unchanged decision', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-hybrid-probe-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const progressPath = path.join(root, 'progress.json');
  const decisionPath = path.join(root, 'decision.json');
  const result = await runNpcHybridSourceProbe({
    progressPath,
    decisionPath,
    localSource: {
      standardizedPath: path.join(process.cwd(), 'data/standardized/npcs.standardized.json'),
      viewMetaPath: path.join(process.cwd(), 'data/standardized-view/npcs/_meta.json'),
      mapPath: path.join(process.cwd(), 'data/generated/npc-standardized-map.json'),
      wikiManifestRecord: {
        sourceKey: 'wiki.module.npcinfo',
        pageId: 18065,
        revisionId: 123,
        revisionTimestamp: '2026-02-13T13:47:32Z',
        contentHash: 'a'.repeat(64),
      },
    },
    fetchMetadata: async () => [{
      pageId: 18065,
      pageTitle: 'Module:Npcinfo/data',
      revisionId: 123,
      revisionTimestamp: '2026-02-13T13:47:32Z',
      missing: false,
    }],
  });
  assert.equal(result.mode, 'local-unchanged');
  assert.equal(result.actionId, 'domain-source-npcs');
  assert.equal(result.recordCount, 762);
  const progress = JSON.parse(fs.readFileSync(progressPath));
  assert.equal(progress.actionId, 'domain-source-npcs');
  assert.equal(progress.status, 'completed');
  assert.equal(JSON.parse(fs.readFileSync(decisionPath)).mode, 'local-unchanged');
  assert.equal(fs.statSync(decisionPath).mode & 0o777, 0o600);
});

test('NPC hybrid probe records failed progress and does not select local data on probe failure', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-hybrid-probe-failure-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await assert.rejects(() => runNpcHybridSourceProbe({
    progressPath: path.join(root, 'progress.json'),
    decisionPath: path.join(root, 'decision.json'),
    localSource: {
      standardizedPath: path.join(process.cwd(), 'data/standardized/npcs.standardized.json'),
      viewMetaPath: path.join(process.cwd(), 'data/standardized-view/npcs/_meta.json'),
      mapPath: path.join(process.cwd(), 'data/generated/npc-standardized-map.json'),
      wikiManifestRecord: { pageId: 18065, revisionTimestamp: '2026-02-13T13:47:32Z', contentHash: 'a'.repeat(64) },
    },
    fetchMetadata: async () => { throw new Error('HTTP 502 Bad Gateway'); },
  }), /HTTP 502/);
  const progress = JSON.parse(fs.readFileSync(path.join(root, 'progress.json')));
  assert.equal(progress.actionId, 'domain-source-npcs');
  assert.equal(progress.status, 'failed');
  const decision = JSON.parse(fs.readFileSync(path.join(root, 'decision.json')));
  assert.equal(decision.actionId, 'domain-source-npcs');
  assert.equal(decision.status, 'probe_unavailable');
  assert.equal(fs.statSync(path.join(root, 'decision.json')).mode & 0o777, 0o600);
});
