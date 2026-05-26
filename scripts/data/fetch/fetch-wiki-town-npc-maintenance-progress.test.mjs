import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const scriptPath = path.join(__dirname, 'fetch-wiki-town-npc-maintenance.py');
const pythonBin = process.env.PYTHON || 'python3';

test('town npc maintenance script declares stable progress contract constants', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');

  assert.match(source, /ACTION_ID\s*=\s*["']domain-source-town-npc-maintenance["']/);
  assert.match(source, /PROGRESS_FILE_NAME\s*=\s*["']domain-source-town-npc-maintenance-progress\.latest\.json["']/);
  assert.match(source, /LATEST_FILE_NAME\s*=\s*["']wiki-town-npc-maintenance\.latest\.json["']/);
  assert.match(source, /--progress-path/);
  assert.match(source, /TERRAPEDIA_CRAWLER_PROGRESS_PATH/);
  assert.match(source, /TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML/);
  assert.match(source, /time\.time_ns\(\)/);
  assert.match(source, /tmp_path\.replace\(path\)/);
});

test('town npc maintenance fetch writes completed progress to explicit path without network', { skip: missingPythonRuntimeReason() }, () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-town-npc-maintenance-'));
  const worktreeRoot = path.join(tempDir, 'feature-worktree');
  const sourcePath = path.join(tempDir, 'npc-standardized-map.json');
  const outputPath = path.join(tempDir, 'generated', 'wiki-town-npc-maintenance.latest.json');
  const snapshotPath = path.join(tempDir, 'reports', 'wiki-town-npc-maintenance-snapshot.json');
  const progressPath = path.join(tempDir, 'progress.json');
  const mockHtmlPath = path.join(tempDir, 'wizard.html');

  fs.mkdirSync(worktreeRoot, { recursive: true });
  fs.writeFileSync(sourcePath, JSON.stringify({
    records: {
      108: {
        gameId: 108,
        internalName: 'Wizard',
        nameZh: '巫师',
        rawJson: JSON.stringify({
          name: 'Wizard',
          extras: { townNPC: true }
        })
      }
    }
  }), 'utf8');
  fs.writeFileSync(mockHtmlPath, buildMockNpcHtml(), 'utf8');

  const result = spawnSync(pythonBin, [
    scriptPath,
    `--source=${sourcePath}`,
    `--output=${outputPath}`,
    `--snapshot-output=${snapshotPath}`,
    `--progress-path=${progressPath}`,
    '--limit=1',
    '--delay-ms=0'
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      WORKTREE_ROOT: worktreeRoot,
      TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML: mockHtmlPath
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(progressPath), true);
  assert.equal(fs.readdirSync(path.dirname(progressPath)).some((name) => name.endsWith('.tmp')), false);

  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  const canonicalProgressPath = path.join(worktreeRoot, 'data', 'generated', 'domain-source-town-npc-maintenance-progress.latest.json');
  const canonicalProgress = JSON.parse(fs.readFileSync(canonicalProgressPath, 'utf8'));
  assert.equal(progress.actionId, 'domain-source-town-npc-maintenance');
  assert.equal(progress.status, 'completed');
  assert.equal(progress.phase, 'write');
  assert.match(progress.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(progress.lastHeartbeatAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(path.resolve(progress.childStatusPath), progressPath);
  assert.equal(progress.current, 1);
  assert.equal(progress.total, 1);
  assert.equal(path.resolve(progress.outputPath), outputPath);
  assert.equal(path.resolve(progress.reportPath), snapshotPath);
  assert.match(progress.message, /finished town NPC maintenance fetch/);
  assert.equal(canonicalProgress.status, 'completed');
  assert.equal(path.resolve(canonicalProgress.childStatusPath), canonicalProgressPath);
  assert.equal(path.resolve(canonicalProgress.outputPath), outputPath);

  const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(output.entity, 'wiki_town_npc_maintenance');
  assert.equal(output.totalTownNpcs, 1);
  assert.equal(output.summary.scrapedCount, 1);
  assert.equal(output.records[0].internalName, 'Wizard');
  assert.deepEqual(output.records[0].livingPreferences, [
    { targetType: 'biome', preference: 'like', targetName: 'Forest', targetNameZh: null, sourceText: 'Likes Forest' },
    { targetType: 'npc', preference: 'like', targetName: 'Princess', targetNameZh: null, sourceText: 'Likes Princess' },
    { targetType: 'npc', preference: 'hate', targetName: 'Angler', targetNameZh: null, sourceText: 'Hates Angler' },
  ]);
});

test('default town npc maintenance progress path follows WORKTREE_ROOT when omitted', { skip: missingPythonRuntimeReason() }, () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-town-npc-maintenance-default-'));
  const worktreeRoot = path.join(tempDir, 'feature-worktree');
  const sourcePath = path.join(tempDir, 'npc-standardized-map.json');
  const outputPath = path.join(tempDir, 'generated', 'wiki-town-npc-maintenance.latest.json');
  const snapshotPath = path.join(tempDir, 'reports', 'wiki-town-npc-maintenance-snapshot.json');
  const mockHtmlPath = path.join(tempDir, 'wizard.html');
  const defaultProgressPath = path.join(worktreeRoot, 'data', 'generated', 'domain-source-town-npc-maintenance-progress.latest.json');

  fs.mkdirSync(worktreeRoot, { recursive: true });
  fs.writeFileSync(sourcePath, JSON.stringify({
    records: {
      108: {
        gameId: 108,
        internalName: 'Wizard',
        rawJson: JSON.stringify({ name: 'Wizard', extras: { townNPC: true } })
      }
    }
  }), 'utf8');
  fs.writeFileSync(mockHtmlPath, buildMockNpcHtml(), 'utf8');

  const result = spawnSync(pythonBin, [
    scriptPath,
    `--source=${sourcePath}`,
    `--output=${outputPath}`,
    `--snapshot-output=${snapshotPath}`,
    '--limit=1',
    '--delay-ms=0'
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      WORKTREE_ROOT: worktreeRoot,
      TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML: mockHtmlPath
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const progress = JSON.parse(fs.readFileSync(defaultProgressPath, 'utf8'));
  assert.equal(progress.actionId, 'domain-source-town-npc-maintenance');
  assert.equal(progress.status, 'completed');
  assert.equal(path.resolve(progress.childStatusPath), defaultProgressPath);
});

test('town npc maintenance progress path can be supplied by env', { skip: missingPythonRuntimeReason() }, () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-town-npc-maintenance-env-'));
  const worktreeRoot = path.join(tempDir, 'feature-worktree');
  const sourcePath = path.join(tempDir, 'npc-standardized-map.json');
  const outputPath = path.join(tempDir, 'generated', 'wiki-town-npc-maintenance.latest.json');
  const snapshotPath = path.join(tempDir, 'reports', 'wiki-town-npc-maintenance-snapshot.json');
  const progressPath = path.join(tempDir, 'env-progress.json');
  const mockHtmlPath = path.join(tempDir, 'wizard.html');

  fs.mkdirSync(worktreeRoot, { recursive: true });
  fs.writeFileSync(sourcePath, JSON.stringify({
    records: {
      108: {
        gameId: 108,
        internalName: 'Wizard',
        rawJson: JSON.stringify({ name: 'Wizard', extras: { townNPC: true } })
      }
    }
  }), 'utf8');
  fs.writeFileSync(mockHtmlPath, buildMockNpcHtml(), 'utf8');

  const result = spawnSync(pythonBin, [
    scriptPath,
    `--source=${sourcePath}`,
    `--output=${outputPath}`,
    `--snapshot-output=${snapshotPath}`,
    '--limit=1',
    '--delay-ms=0'
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      WORKTREE_ROOT: worktreeRoot,
      TERRAPEDIA_CRAWLER_PROGRESS_PATH: progressPath,
      TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML: mockHtmlPath
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.status, 'completed');
  assert.equal(path.resolve(progress.childStatusPath), progressPath);
});

function missingPythonRuntimeReason() {
  const probe = spawnSync(pythonBin, ['-c', 'import bs4'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  if (probe.error) {
    return `${pythonBin} unavailable: ${probe.error.message}`;
  }
  if (probe.status !== 0) {
    return 'python3 dependency missing: bs4';
  }
  return false;
}

function buildMockNpcHtml() {
  return `<!doctype html>
    <html>
      <head>
        <title>巫师 - 官方中文泰拉瑞亚维基</title>
        <script>var wgArticleId=123; var wgRevisionId=456;</script>
      </head>
      <body>
        <div class="mw-parser-output">
          <table class="infobox npc">
            <tr><td><div class="section images"><img alt="巫师" src="/images/Wizard.png" /></div></td></tr>
            <tr><th>类型</th><td><span class="tag">城镇 NPC</span></td></tr>
            <tr><th>环境</th><td><span class="tag">地表</span></td></tr>
          </table>
          <p>巫师是困难模式的城镇 NPC。</p>
          <ul><li>困难模式中在洞穴层找到。</li></ul>
          <h2><span class="mw-headline">出售物品</span></h2>
          <table>
            <tr><th>物品</th><th>价格</th><th>可用性</th></tr>
            <tr><td><a href="/wiki/Ice_Rod" title="Ice Rod">冰雪魔杖</a></td><td>50金币</td><td>总是</td></tr>
          </table>
          <h2><span id="Living_preferences" class="mw-headline">Living preferences</span></h2>
          <table class="terraria living-preferences">
            <tr class="like"><th>Likes</th><td><a href="/wiki/Forest" title="Forest">Forest</a></td><td><a href="/wiki/Princess" title="Princess">Princess</a></td></tr>
            <tr class="hate"><th>Hates</th><td><span class="na">n/a</span></td><td><a href="/wiki/Angler" title="Angler">Angler</a></td></tr>
          </table>
        </div>
      </body>
    </html>`;
}
