import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildItemSourceTerminalExemptionPlan,
  parseBuildItemSourceTerminalExemptionPlanArgs,
  writeItemSourceTerminalExemptionPlan
} from './build-item-source-terminal-exemption-plan.mjs';

function terminalRow(overrides = {}) {
  return {
    itemId: 1,
    itemInternalName: 'Darkness',
    internalName: 'Darkness',
    name: 'Darkness',
    categoryCode: 'BUFF',
    categoryName: 'Buff',
    hardBlockLane: 'requires_page_specific_parser',
    terminalClosureStatus: 'non_item_effect',
    terminalClosureReason: 'Effect page, not item acquisition.',
    terminalClosureEvidence: 'buff/debuff evidence',
    recommendedNextAction: 'Move to effect domain.',
    extractedSources: [],
    ...overrides
  };
}

test('parseBuildItemSourceTerminalExemptionPlanArgs rejects mutation flags', () => {
  for (const flag of ['apply', 'write-db', 'sync', 'import', 'backfill', 'crawler', 'fetch', 'pipeline', 'materialize', 'flyway', 'refresh']) {
    assert.throws(
      () => parseBuildItemSourceTerminalExemptionPlanArgs([`--${flag}=true`]),
      /read-only terminal exemption plan refuses mutation flag/
    );
  }
});

test('buildItemSourceTerminalExemptionPlan maps terminal statuses to exemption or required-raw lanes', () => {
  const plan = buildItemSourceTerminalExemptionPlan({
    generatedAt: '2026-06-11T00:00:00.000Z',
    sourceReportPath: 'data/reports/source.json',
    sourceReport: {
      generatedAt: '2026-06-11T00:00:00.000Z',
      hardBlockedRows: [
        terminalRow({ itemId: 1475, itemInternalName: 'Darkness', terminalClosureStatus: 'non_item_effect' }),
        terminalRow({ itemId: 2436, itemInternalName: 'BlueJellyfish', name: 'Blue Jellyfish', terminalClosureStatus: 'enemy_page_identity_mismatch' }),
        terminalRow({ itemId: 3705, itemInternalName: 'Fake_newchest1', name: 'Fake_newchest1', terminalClosureStatus: 'internal_or_unobtainable_identity_review' }),
        terminalRow({ itemId: 8416, itemInternalName: 'ZH_RECIPE_PINK_JELLYFISH_BAIT', name: 'Pink Jellyfish (bait)', terminalClosureStatus: 'missing_bait_raw' })
      ]
    }
  });

  assert.equal(plan.summary.totalTerminalRows, 4);
  assert.equal(plan.summary.exemptionCandidateRows, 3);
  assert.equal(plan.summary.requiredRawEvidenceRows, 1);
  assert.equal(plan.summary.importCandidateRows, 0);
  assert.deepEqual(plan.summary.terminalStatusCounts, {
    enemy_page_identity_mismatch: 1,
    internal_or_unobtainable_identity_review: 1,
    missing_bait_raw: 1,
    non_item_effect: 1
  });
  assert.deepEqual(plan.summary.resolutionLaneCounts, {
    explicit_no_source_exemption_candidate: 3,
    missing_required_raw_evidence: 1
  });

  const byId = new Map(plan.rows.map((row) => [row.itemId, row]));
  assert.equal(byId.get(1475).resolutionLane, 'explicit_no_source_exemption_candidate');
  assert.equal(byId.get(1475).exemptionRule, 'terminal_non_item_effect');
  assert.equal(byId.get(2436).exemptionRule, 'terminal_enemy_page_identity_mismatch');
  assert.equal(byId.get(3705).exemptionRule, 'terminal_internal_or_unobtainable_identity_review');
  assert.equal(byId.get(8416).resolutionLane, 'missing_required_raw_evidence');
  assert.equal(byId.get(8416).exemptionRule, null);
  assert.equal(byId.get(8416).recommendedNextAction, 'Move to effect domain.');
});

test('buildItemSourceTerminalExemptionPlan refuses hard-block rows without terminal closure status', () => {
  assert.throws(
    () => buildItemSourceTerminalExemptionPlan({
      sourceReport: {
        hardBlockedRows: [
          terminalRow({ terminalClosureStatus: null })
        ]
      }
    }),
    /hard-block row missing terminalClosureStatus/
  );
});

test('writeItemSourceTerminalExemptionPlan writes a read-only report', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'item-source-terminal-exemptions-'));
  const inputPath = path.join(root, 'source.json');
  const outputPath = path.join(root, 'plan.json');
  fs.writeFileSync(inputPath, JSON.stringify({
    generatedAt: '2026-06-11T00:00:00.000Z',
    hardBlockedRows: [
      terminalRow()
    ]
  }));

  const result = writeItemSourceTerminalExemptionPlan({ inputPath, outputPath });
  assert.equal(result.outputPath, outputPath);
  assert.equal(result.summary.totalTerminalRows, 1);
  assert.equal(fs.existsSync(outputPath), true);
  const written = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(written.readOnly, true);
  assert.equal(written.rows[0].itemId, 1);
});
