import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runNpcCoverageAudit } from '../src/coverage/run-npc-coverage-audit.mjs';

test('runNpcCoverageAudit writes coverage target and audit reports from standardized npcs', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-coverage-audit-'));
  const sourceStandardizedDir = path.join(tempRoot, 'source-standardized');
  const crawlerOutputRoot = path.join(tempRoot, 'crawler-output');
  const outputRoot = path.join(tempRoot, 'wiki-crawler');

  await fs.mkdir(sourceStandardizedDir, { recursive: true });
  await fs.mkdir(path.join(crawlerOutputRoot, 'normalized-light', 'npc'), { recursive: true });

  await fs.writeFile(path.join(sourceStandardizedDir, 'npcs.standardized.json'), JSON.stringify({
    entity: 'npcs',
    records: [
      { id: 17, internalName: 'Merchant', name: 'Merchant', flags: { friendly: true }, extras: { townNPC: true } },
      { id: 125, internalName: 'Retinazer', name: 'Retinazer', flags: { boss: true } }
    ]
  }, null, 2));
  await fs.writeFile(path.join(crawlerOutputRoot, 'normalized-light', 'npc', 'merchant.latest.json'), JSON.stringify({
    entityId: 'merchant',
    source: { pageTitle: 'Merchant' }
  }, null, 2));

  const result = await runNpcCoverageAudit({
    sourceStandardizedDir,
    crawlerOutputRoot,
    outputRoot,
    fetchWikiPageMetadataBatchImpl: async ({ titles }) => titles.map((title) => ({
      requestedTitle: title,
      pageTitle: title === 'Retinazer' ? 'The Twins' : title,
      pageId: title === 'Merchant' ? 17 : 125,
      missing: false
    }))
  });

  assert.ok(result.targetsPath);
  assert.ok(result.auditPath);
  assert.equal(result.audit.summary.totalTargets, 2);
  assert.equal(result.audit.summary.eligibleBatchTargets, 1);

  const audit = JSON.parse(await fs.readFile(result.auditPath, 'utf8'));
  const targets = JSON.parse(await fs.readFile(result.targetsPath, 'utf8'));

  assert.equal(audit.summary.redirectTargets, 1);
  assert.equal(targets.targets.length, 2);
});
