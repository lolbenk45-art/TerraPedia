import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildCanonicalNpcTargets,
  writeCanonicalNpcTargets,
} from './build-canonical-npc-targets.mjs';

function record(id, priority) {
  return {
    id,
    internalName: `Npc${id}`,
    name: `NPC ${id}`,
    flags: {
      boss: priority === 'p0_boss',
      friendly: priority === 'p1_friendly',
    },
    extras: { townNPC: priority === 'p0_town' },
  };
}

function payload() {
  const records = [];
  let id = 1;
  for (const [priority, count] of [
    ['p0_town', 10],
    ['p0_boss', 10],
    ['p1_friendly', 6],
    ['p1_enemy', 10],
  ]) {
    for (let index = 0; index < count; index += 1) records.push(record(id++, priority));
  }
  return { entity: 'npcs', records };
}

test('canonical NPC targets freeze 25 uncrawled rows with balanced exact quotas', () => {
  const sourceBytes = `${JSON.stringify(payload(), null, 2)}\n`;
  const result = buildCanonicalNpcTargets({
    standardizedPayload: JSON.parse(sourceBytes),
    standardizedBytes: sourceBytes,
    crawledEntityIds: ['npc-1'],
    generatedAt: '2026-07-28T02:00:00.000Z',
    targetLimit: 25,
  });

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.operationId, 'canonical-npc-crawler');
  assert.equal(result.source.contentHash, `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`);
  assert.equal(result.targets.length, 25);
  assert.equal(new Set(result.targets.map((target) => target.pageTitle)).size, 25);
  assert.equal(result.targets.some((target) => target.entityId === 'npc-1'), false);
  assert.deepEqual(result.selection.selectedCounts, {
    p0_town: 8,
    p0_boss: 8,
    p1_friendly: 4,
    p1_enemy: 5,
  });
  assert.deepEqual(
    buildCanonicalNpcTargets({
      standardizedPayload: JSON.parse(sourceBytes),
      standardizedBytes: sourceBytes,
      crawledEntityIds: ['npc-1'],
      generatedAt: '2026-07-28T02:00:00.000Z',
      targetLimit: 25,
    }),
    result,
  );
});

test('canonical NPC targets fail closed when the requested bound cannot be filled', () => {
  const standardizedPayload = { entity: 'npcs', records: [record(1, 'p0_town')] };
  assert.throws(
    () => buildCanonicalNpcTargets({
      standardizedPayload,
      standardizedBytes: JSON.stringify(standardizedPayload),
      targetLimit: 25,
    }),
    /requires exactly 25 uncrawled targets/i,
  );
});

test('canonical NPC targets exclude coverage rows without a stable entity identity before quota selection', () => {
  const standardizedPayload = payload();
  standardizedPayload.records.unshift({
    id: 547,
    internalName: 'DD2AttackerTest',
    name: '???',
    flags: { boss: false, friendly: false },
    extras: { townNPC: false },
  });
  const sourceBytes = `${JSON.stringify(standardizedPayload, null, 2)}\n`;

  const result = buildCanonicalNpcTargets({
    standardizedPayload,
    standardizedBytes: sourceBytes,
    generatedAt: '2026-07-28T02:00:00.000Z',
    targetLimit: 25,
  });

  assert.equal(result.targets.length, 25);
  assert.equal(result.targets.some((target) => target.pageTitle === '???'), false);
  assert.equal(result.targets.every((target) => target.entityId.length > 0), true);
  assert.equal(result.targets.every((target) => target.targetEntityIds.length > 0), true);
  assert.deepEqual(result.selection.selectedCounts, {
    p0_town: 8,
    p0_boss: 8,
    p1_friendly: 4,
    p1_enemy: 5,
  });
});

test('canonical NPC target writer emits a private atomic artifact', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-npc-targets-'));
  const sourcePath = path.join(tempDir, 'npcs.standardized.json');
  const outputPath = path.join(tempDir, 'targets.json');
  fs.writeFileSync(sourcePath, `${JSON.stringify(payload(), null, 2)}\n`);
  const result = writeCanonicalNpcTargets({
    sourcePath,
    outputPath,
    generatedAt: '2026-07-28T02:00:00.000Z',
    targetLimit: 25,
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, 'utf8')), result);
  assert.equal(fs.statSync(outputPath).mode & 0o077, 0);
  assert.deepEqual(fs.readdirSync(tempDir).sort(), ['npcs.standardized.json', 'targets.json']);
});
