import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildBiomeWikitextUnresolvedReport,
  classifyUnresolvedRow,
  parseArgs,
  validateUnresolvedReportContract,
  writeUnresolvedReport
} from './biome-wikitext-unresolved-report.mjs';

function sampleSourceReport() {
  return {
    entity: 'biome_wikitext_linkage_dry_run',
    generatedAt: '2026-06-02T03:51:10.835Z',
    summary: {
      item: { total: 2, resolved: 1, ambiguous: 0, missing: 1 },
      npc: { total: 3, resolved: 1, ambiguous: 1, missing: 1 }
    },
    results: [
      {
        biome: { code: 'forest', pageTitle: 'Forest' },
        wiki: { pageTitle: 'Forest' },
        entries: [
          { matchType: 'item', matchStatus: 'resolved', section: 'Unique Drops', source: 'From Slimes', name: 'Gel', note: null, matches: [{ entityType: 'item', id: 23, internalName: 'Gel', name: 'Gel', nameZh: '凝胶' }] },
          { matchType: 'item', matchStatus: 'missing', section: 'Unique Drops', source: 'From King Slime', name: 'Ninja armor', note: null, matches: [] },
          { matchType: 'npc', matchStatus: 'ambiguous', section: 'Characters', source: 'During the night', name: 'Zombie', note: null, matches: [{ entityType: 'npc', id: 3, internalName: 'Zombie', name: 'Zombie', nameZh: '僵尸' }, { entityType: 'npc', id: 430, internalName: 'BigZombie', name: 'Zombie', nameZh: '僵尸' }] },
          { matchType: 'npc', matchStatus: 'missing', section: 'Characters', source: 'Critters', name: 'Mallard Duck', note: null, matches: [] }
        ]
      }
    ]
  };
}

test('buildBiomeWikitextUnresolvedReport extracts only missing and ambiguous rows with stable schema', () => {
  const report = buildBiomeWikitextUnresolvedReport({
    sourceReport: sampleSourceReport(),
    sourceReportPath: '/tmp/source.json'
  });

  assert.equal(report.entity, 'biome_wikitext_unresolved_report');
  assert.match(report.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(report.sourceReportPath, '/tmp/source.json');
  assert.equal(report.sourceGeneratedAt, '2026-06-02T03:51:10.835Z');
  assert.deepEqual(report.summary, {
    total: 3,
    item: { missing: 1, ambiguous: 0 },
    npc: { missing: 1, ambiguous: 1 },
    byReviewCategory: {
      item_collection_or_set: 1,
      ambiguous_variant_group_needs_user_decision: 1,
      local_npc_missing_or_critter_gap: 1
    }
  });
  assert.deepEqual(report.rows.map((row) => row.index), [1, 2, 3]);
  assert.deepEqual(report.rows.map((row) => row.name), ['Ninja armor', 'Zombie', 'Mallard Duck']);
  assert.deepEqual(report.rows.map((row) => row.needsUserDecision), [true, true, true]);
  assert.equal(report.rows[0].rowKey, 'forest:item:missing:ninja_armor:1');
  assert.deepEqual(report.rows[1].candidateMatches, [
    { entityType: 'npc', id: 3, internalName: 'Zombie', name: 'Zombie', nameZh: '僵尸' },
    { entityType: 'npc', id: 430, internalName: 'BigZombie', name: 'Zombie', nameZh: '僵尸' }
  ]);
  assert.equal(validateUnresolvedReportContract(report).valid, true);
});

test('classifyUnresolvedRow returns review categories without deciding aliases', () => {
  assert.equal(classifyUnresolvedRow({ matchType: 'item', matchStatus: 'missing', name: 'Ninja armor' }), 'item_collection_or_set');
  assert.equal(classifyUnresolvedRow({ matchType: 'item', matchStatus: 'missing', name: 'Treasure Bag' }), 'generic_item_name_needs_context');
  assert.equal(classifyUnresolvedRow({ matchType: 'npc', matchStatus: 'missing', source: 'Critters', name: 'Mallard Duck' }), 'local_npc_missing_or_critter_gap');
  assert.equal(classifyUnresolvedRow({ matchType: 'npc', matchStatus: 'ambiguous', name: 'Zombie', matches: [{}, {}] }), 'ambiguous_variant_group_needs_user_decision');
});

test('validateUnresolvedReportContract rejects writable-looking or malformed rows', () => {
  const report = buildBiomeWikitextUnresolvedReport({ sourceReport: sampleSourceReport(), sourceReportPath: '/tmp/source.json' });
  const invalid = structuredClone(report);
  invalid.rows[1].matchStatus = 'resolved';

  const result = validateUnresolvedReportContract(invalid);

  assert.equal(result.valid, false);
  assert.match(result.issues.join('\n'), /unsupported matchStatus/);
});

test('validateUnresolvedReportContract rejects extra candidate match fields', () => {
  const report = buildBiomeWikitextUnresolvedReport({ sourceReport: sampleSourceReport(), sourceReportPath: '/tmp/source.json' });
  report.rows[1].candidateMatches[0].rawTemplate = '{{npc|Zombie}}';

  const result = validateUnresolvedReportContract(report);

  assert.equal(result.valid, false);
  assert.match(result.issues.join('\n'), /unexpected candidate match field/);
});

test('parseArgs requires report path and rejects unknown args', () => {
  assert.throws(() => parseArgs([]), /--report is required/);
  assert.throws(() => parseArgs(['--report=a.json', '--bad=true']), /Unknown option: --bad/);
  assert.deepEqual(parseArgs(['--report=a.json', '--output=b.json']), {
    report: 'a.json',
    output: 'b.json'
  });
});

test('writeUnresolvedReport writes JSON only to the requested output path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biome-unresolved-report-'));
  const sourcePath = path.join(dir, 'source.json');
  const outputPath = path.join(dir, 'out.json');
  fs.writeFileSync(sourcePath, `${JSON.stringify(sampleSourceReport())}\n`, 'utf8');

  const result = writeUnresolvedReport({ reportPath: sourcePath, outputPath });
  const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

  assert.equal(result.outputPath, outputPath);
  assert.equal(output.summary.total, 3);
  assert.equal(output.rows.length, 3);
});

test('script source has no DB, crawler, fetch, child process, or apply path', () => {
  const source = fs.readFileSync(new URL('./biome-wikitext-unresolved-report.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /mysql|createConnection|execute\(|INSERT|UPDATE|DELETE|--apply|fetch\(|child_process|crawler|import-biome-wikitext-resolved-to-db/i);
});
