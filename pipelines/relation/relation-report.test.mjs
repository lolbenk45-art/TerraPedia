import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildRelationAuditMarkdown,
  writeRelationReports
} from './relation-report.mjs';

test('buildRelationAuditMarkdown includes required domain sections', () => {
  const markdown = buildRelationAuditMarkdown({
    generatedAt: '2026-04-24T00:00:00Z',
    domainSummary: {
      base: 10,
      image: 11,
      category: 1,
      recipe: 2,
      npc: 3,
      buff: 4,
      biome: 5,
      projectile: 6,
      boss: 7,
      npcSeries: 8
    },
    entityBreakdown: {
      item: 4,
      npc: 2,
      projectile: 3,
      buff: 1
    },
    imageBreakdown: {
      item: 5,
      npc: 0,
      projectile: 4,
      buff: 2
    },
    unresolvedSamples: [
      { reason: 'npc_source_unresolved', sourceMaintRecordKey: 'abc' }
    ]
  });

  assert.match(markdown, /## Base Entities/);
  assert.match(markdown, /item: 4/);
  assert.match(markdown, /npc: 2/);
  assert.match(markdown, /projectile: 3/);
  assert.match(markdown, /buff: 1/);
  assert.match(markdown, /## Images/);
  assert.match(markdown, /item: 5/);
  assert.match(markdown, /npc: 0/);
  assert.match(markdown, /projectile: 4/);
  assert.match(markdown, /buff: 2/);
  assert.match(markdown, /## Category/);
  assert.match(markdown, /## Recipe/);
  assert.match(markdown, /## NPC Source/);
  assert.match(markdown, /## Buff/);
  assert.match(markdown, /## Biome/);
  assert.match(markdown, /## Projectile/);
  assert.match(markdown, /## Boss/);
  assert.match(markdown, /## NPC Series/);
  assert.match(markdown, /npc_source_unresolved \| trace=abc/);
});

test('writeRelationReports writes json and markdown reports', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'relation-report-'));
  const paths = await writeRelationReports({
    repoRoot,
    dateTag: '2026-04-24',
    summary: {
      generatedAt: '2026-04-24T00:00:00Z',
      domainSummary: {
        category: 1,
        recipe: 1,
        npc: 1,
        buff: 1,
        biome: 1,
        projectile: 1,
        boss: 1,
        npcSeries: 1
      }
    },
    issues: [
      { reason: 'npc_source_unresolved', reviewStatus: 'unresolved', sourceMaintRecordKey: 'abc' }
    ],
    conflicts: [
      { reason: 'conflict_example' }
    ]
  });

  const auditJson = JSON.parse(await fs.readFile(paths.auditJsonPath, 'utf8'));
  const auditMd = await fs.readFile(paths.auditMdPath, 'utf8');
  const conflictsJson = JSON.parse(await fs.readFile(paths.conflictsPath, 'utf8'));
  const unresolvedJson = JSON.parse(await fs.readFile(paths.unresolvedPath, 'utf8'));

  assert.equal(auditJson.issuesCount, 1);
  assert.match(auditMd, /Relation Audit/);
  assert.equal(conflictsJson.length, 1);
  assert.equal(unresolvedJson.length, 1);
});
