import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeNpcFanoutFiles } from '../src/output/npc-file-fanout.mjs';

test('writeNpcFanoutFiles writes normalized, canonical, and audit latest files', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-fanout-'));
  const result = await writeNpcFanoutFiles({
    entityId: 'goblin-tinkerer',
    outputRoot: tempRoot,
    normalized: { display: { name: 'Goblin Tinkerer' } },
    canonical: { summary: 'Goblin Tinkerer is a helpful NPC.' },
    audit: { status: 'pass', reasons: [] }
  });

  assert.equal(
    result.normalizedPath,
    path.join(tempRoot, 'normalized-light', 'npc', 'goblin-tinkerer.latest.json')
  );
  assert.equal(
    result.canonicalPath,
    path.join(tempRoot, 'canonical', 'npc', 'goblin-tinkerer.latest.json')
  );
  assert.equal(
    result.auditPath,
    path.join(tempRoot, 'audit', 'npc', 'goblin-tinkerer.latest.json')
  );

  const normalized = JSON.parse(await fs.readFile(result.normalizedPath, 'utf8'));
  const canonical = JSON.parse(await fs.readFile(result.canonicalPath, 'utf8'));
  const audit = JSON.parse(await fs.readFile(result.auditPath, 'utf8'));

  assert.equal(normalized.display.name, 'Goblin Tinkerer');
  assert.equal(canonical.summary, 'Goblin Tinkerer is a helpful NPC.');
  assert.equal(audit.status, 'pass');
});
