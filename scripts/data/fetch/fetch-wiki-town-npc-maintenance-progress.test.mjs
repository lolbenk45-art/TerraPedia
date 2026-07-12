import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const scriptPath = path.join(__dirname, 'fetch-wiki-town-npc-maintenance.mjs');

test('town npc maintenance script declares stable progress contract constants', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');

  assert.match(source, /ACTION_ID\s*=\s*['"]domain-source-town-npc-maintenance['"]/);
  assert.match(source, /PROGRESS_FILE_NAME\s*=\s*['"]domain-source-town-npc-maintenance-progress\.latest\.json['"]/);
  assert.match(source, /LATEST_FILE_NAME\s*=\s*['"]wiki-town-npc-maintenance\.latest\.json['"]/);
  assert.match(source, /--progress-path/);
  assert.match(source, /TERRAPEDIA_CRAWLER_PROGRESS_PATH/);
  assert.match(source, /TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML/);
  assert.match(source, /writeJsonAtomic/);
  assert.match(source, /writeJsonFile/);
});

test('town npc maintenance fetch writes V2 identity in running and completed progress without network', async () => {
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
      },
      17: {
        gameId: 17,
        internalName: 'Merchant',
        nameZh: '商人',
        rawJson: JSON.stringify({
          name: 'Merchant',
          extras: { townNPC: true }
        })
      }
    }
  }), 'utf8');
  fs.writeFileSync(mockHtmlPath, buildMockNpcHtml(), 'utf8');

  const childRun = spawnWithResult(process.execPath, [
    scriptPath,
    `--source=${sourcePath}`,
    `--output=${outputPath}`,
    `--snapshot-output=${snapshotPath}`,
    `--progress-path=${progressPath}`,
    '--limit=2',
    '--delay-ms=500'
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      WORKTREE_ROOT: worktreeRoot,
      TERRAPEDIA_CRAWLER_QUEUE_ID: 'queue-town-npc-1',
      TERRAPEDIA_CRAWLER_ATTEMPT_ID: 'attempt-town-npc-1',
      TERRAPEDIA_CRAWLER_FENCE_TOKEN: '142',
      TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH: 'epoch-town-npc-1',
      TERRAPEDIA_CRAWLER_INITIAL_STATE_VERSION: '3',
      TERRAPEDIA_CRAWLER_PROGRESS_SEQUENCE: '7',
      TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML: mockHtmlPath,
      TERRAPEDIA_TOWN_NPC_ENABLE_CRASH_HOOK: '',
      TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '',
      TERRAPEDIA_TOWN_NPC_CRASH_POINT: ''
    }
  });

  const runningProgress = await waitForProgress(progressPath, (progress) => progress.status === 'running');
  const canonicalProgressPath = path.join(worktreeRoot, 'data', 'generated', 'domain-source-town-npc-maintenance-progress.latest.json');
  const canonicalRunningProgress = await waitForProgress(canonicalProgressPath, (progress) => progress.status === 'running');
  assertCrawlerAttemptIdentity(runningProgress);
  assertCrawlerAttemptIdentity(canonicalRunningProgress);

  const result = await childRun.result;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(progressPath), true);
  assert.equal(fs.readdirSync(path.dirname(progressPath)).some((name) => name.endsWith('.tmp')), false);

  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  const canonicalProgress = JSON.parse(fs.readFileSync(canonicalProgressPath, 'utf8'));
  assert.equal(progress.actionId, 'domain-source-town-npc-maintenance');
  assert.equal(progress.status, 'completed');
  assert.equal(progress.phase, 'write');
  assert.match(progress.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(progress.lastHeartbeatAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(path.resolve(progress.childStatusPath), progressPath);
  assert.equal(progress.current, 2);
  assert.equal(progress.total, 2);
  assert.equal(path.resolve(progress.outputPath), outputPath);
  assert.equal(path.resolve(progress.reportPath), snapshotPath);
  assert.match(progress.message, /finished town NPC maintenance fetch/);
  assertCrawlerAttemptIdentity(progress);
  assert.equal(canonicalProgress.status, 'completed');
  assert.equal(path.resolve(canonicalProgress.childStatusPath), canonicalProgressPath);
  assert.equal(path.resolve(canonicalProgress.outputPath), outputPath);
  assertCrawlerAttemptIdentity(canonicalProgress);
  assert.equal(canonicalProgress.progressSequence, progress.progressSequence);

  const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(output.entity, 'wiki_town_npc_maintenance');
  assert.equal(output.totalTownNpcs, 2);
  assert.equal(output.summary.scrapedCount, 2);
  const wizard = output.records.find((record) => record.internalName === 'Wizard');
  assert.ok(wizard);
  assert.deepEqual(wizard.livingPreferences, [
    { targetType: 'biome', preference: 'like', targetName: 'Forest', targetNameZh: null, sourceText: 'Likes Forest' },
    { targetType: 'npc', preference: 'like', targetName: 'Princess', targetNameZh: null, sourceText: 'Likes Princess' },
    { targetType: 'biome', preference: 'dislike', targetName: '沙漠', targetNameZh: null, sourceText: '反感 沙漠' },
    { targetType: 'npc', preference: 'dislike', targetName: '税收官', targetNameZh: null, sourceText: '反感 税收官' },
    { targetType: 'npc', preference: 'hate', targetName: 'Angler', targetNameZh: null, sourceText: 'Hates Angler' },
  ]);
});

function assertCrawlerAttemptIdentity(progress) {
  assert.equal(progress.queueId, 'queue-town-npc-1');
  assert.equal(progress.attemptId, 'attempt-town-npc-1');
  assert.equal(progress.fenceToken, 142);
  assert.equal(progress.stateStoreEpoch, 'epoch-town-npc-1');
  assert.equal(progress.stateVersion, 3);
  assert.ok(progress.progressSequence > 7);
}

function spawnWithResult(command, args, options) {
  const child = spawn(command, args, options);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  return {
    result: new Promise((resolve) => {
      child.on('close', (status) => resolve({ status, stdout, stderr }));
      child.on('error', (error) => resolve({ status: 1, stdout, stderr: `${stderr}${error.stack || error.message}` }));
    })
  };
}

async function waitForProgress(filePath, predicate) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const progress = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (predicate(progress)) {
        return progress;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for progress: ${filePath}`);
}

test('default town npc maintenance progress path follows WORKTREE_ROOT when omitted', () => {
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

  const result = spawnSync(process.execPath, [
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
      TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML: mockHtmlPath,
      TERRAPEDIA_TOWN_NPC_ENABLE_CRASH_HOOK: '',
      TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '',
      TERRAPEDIA_TOWN_NPC_CRASH_POINT: ''
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const progress = JSON.parse(fs.readFileSync(defaultProgressPath, 'utf8'));
  assert.equal(progress.actionId, 'domain-source-town-npc-maintenance');
  assert.equal(progress.status, 'completed');
  assert.equal(path.resolve(progress.childStatusPath), defaultProgressPath);
});

test('town npc maintenance progress path can be supplied by env', () => {
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

  const result = spawnSync(process.execPath, [
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
      TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML: mockHtmlPath,
      TERRAPEDIA_TOWN_NPC_ENABLE_CRASH_HOOK: '',
      TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '',
      TERRAPEDIA_TOWN_NPC_CRASH_POINT: ''
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.status, 'completed');
  assert.equal(path.resolve(progress.childStatusPath), progressPath);
});

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
            <tr class="dislike"><th>反感</th><td>沙漠</td><td>税收官</td></tr>
            <tr class="hate"><th>Hates</th><td><span class="na">n/a</span></td><td><a href="/wiki/Angler" title="Angler">Angler</a></td></tr>
          </table>
        </div>
      </body>
    </html>`;
}
