import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseWikiArmorAttributeRows } from './fetch-wiki-armor-attributes.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const scriptPath = path.join(__dirname, 'fetch-wiki-armor-attributes.mjs');

test('parseWikiArmorAttributeRows extracts linked item identity and structured stat cells', () => {
  const html = `
    <h2>困难模式</h2>
    <h3>头盔</h3>
    <table><tbody>
      <tr>
        <th>物品</th><th>伤害</th><th>暴击率</th><th>职业专属</th><th>防御</th><th>其他奖励</th>
      </tr>
      <tr>
        <td><a href="/zh/wiki/神圣面具" title="神圣面具">神圣面具</a></td>
        <td>+10% 近战伤害</td>
        <td>+10% 暴击率</td>
        <td>+10% 近战速度</td>
        <td>24</td>
        <td></td>
      </tr>
    </tbody></table>`;

  const actual = parseWikiArmorAttributeRows({
    html,
    sourceRevisionTimestamp: '2026-05-30T00:00:00Z'
  });

  assert.deepEqual(actual.map((row) => ({
    sectionCode: row.sectionCode,
    slotGroup: row.slotGroup,
    itemPageTitle: row.itemPageTitle,
    itemHref: row.itemHref,
    itemNameZh: row.itemNameZh,
    defenseValue: row.defenseValue,
    rawCells: row.rawCells
  })), [{
    sectionCode: 'hardmode',
    slotGroup: 'head',
    itemPageTitle: '神圣面具',
    itemHref: '/zh/wiki/神圣面具',
    itemNameZh: '神圣面具',
    defenseValue: 24,
    rawCells: {
      damage: '+10% 近战伤害',
      critChance: '+10% 暴击率',
      classSpecific: '+10% 近战速度',
      otherBonus: ''
    }
  }]);
});

test('fetcher writes monitor-visible progress to an explicit path before network failure', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-armor-attributes-'));
  const outputDir = path.join(tempDir, 'generated');
  const progressPath = path.join(tempDir, 'domain-source-armor-attributes-progress.latest.json');

  const result = spawnSync(process.execPath, [
    scriptPath,
    '--api-url=http://127.0.0.1:9/api.php',
    `--output-dir=${outputDir}`,
    `--progress-path=${progressPath}`
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test'
    }
  });

  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(progressPath), true);

  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.actionId, 'domain-source-armor-attributes');
  assert.equal(progress.status, 'failed');
  assert.equal(progress.childStatusPath, progressPath);
  assert.equal(progress.outputPath, path.join(outputDir, 'wiki-armor-attributes.latest.json'));
  assert.equal(typeof progress.generatedAt, 'string');
  assert.equal(typeof progress.lastHeartbeatAt, 'string');
});
