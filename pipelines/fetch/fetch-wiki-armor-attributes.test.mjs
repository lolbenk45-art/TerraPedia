import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { parseWikiArmorAttributeRows } from './fetch-wiki-armor-attributes.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
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

test('parseWikiArmorAttributeRows resets the armor slot when a level-four slot heading changes', () => {
  const html = `
    <h2>困难模式</h2>
    <h3>头盔</h3>
    <table><tr><th>物品</th><th>防御</th><th>其他奖励</th></tr>
      <tr><td><a title="木头盔">木头盔</a></td><td>1</td><td>+1% 暴击率</td></tr></table>
    <h4>胸甲</h4>
    <table><tr><th>物品</th><th>防御</th><th>其他奖励</th></tr>
      <tr><td><a title="木胸甲">木胸甲</a></td><td>2</td><td>+2% 暴击率</td></tr></table>
    <h4>护腿</h4>
    <table><tr><th>物品</th><th>防御</th><th>其他奖励</th></tr>
      <tr><td><a title="木护胫">木护胫</a></td><td>3</td><td>+3% 暴击率</td></tr></table>`;

  const actual = parseWikiArmorAttributeRows({ html });

  assert.deepEqual(actual.map((row) => [row.itemNameZh, row.slotGroup]), [
    ['木头盔', 'head'],
    ['木胸甲', 'body'],
    ['木护胫', 'legs']
  ]);
});

test('parseWikiArmorAttributeRows understands the live wiki 上衣 and 裤装 section headings', () => {
  const html = `
    <h2>困难模式之前的头盔</h2>
    <table><tr><th>物品</th><th>防御</th><th>其他奖励</th></tr>
      <tr><td><a title="木头盔">木头盔</a></td><td>1</td><td>+1%</td></tr></table>
    <h2>困难模式之前的上衣</h2>
    <table><tr><th>物品</th><th>防御</th><th>其他奖励</th></tr>
      <tr><td><a title="木胸甲">木胸甲</a></td><td>2</td><td>+2%</td></tr></table>
    <h2>困难模式之前的裤装</h2>
    <table><tr><th>物品</th><th>防御</th><th>其他奖励</th></tr>
      <tr><td><a title="木护胫">木护胫</a></td><td>3</td><td>+3%</td></tr></table>`;

  const actual = parseWikiArmorAttributeRows({ html });

  assert.deepEqual(actual.map((row) => [row.itemNameZh, row.slotGroup]), [
    ['木头盔', 'head'],
    ['木胸甲', 'body'],
    ['木护胫', 'legs']
  ]);
});

test('parseWikiArmorAttributeRows preserves the declared image identity as matching evidence', () => {
  const html = `<h2>困难模式之前的护腿</h2><table><tr><th></th><th>物品</th><th>防御</th><th>其他奖励</th></tr>
    <tr><td><img alt="Mining Pants.png" src="https://terraria.wiki.gg/images/Mining_Pants.png?hash" /></td>
    <td><a title="挖矿头盔">挖矿头盔</a></td><td>1</td><td>+10% 挖矿速度</td></tr></table>`;
  const [row] = parseWikiArmorAttributeRows({ html });
  assert.equal(row.imageFileTitle, 'Mining Pants.png');
  assert.equal(row.imageSourceUrl, 'https://terraria.wiki.gg/images/Mining_Pants.png?hash');
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

test('fetcher freezes the raw page and binds parsed output while preserving monitor visibility', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-source-capture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const html = '<h2>困难模式之前的头盔</h2><table><tr><th>物品</th><th>防御</th><th>其他奖励</th></tr>'
    + '<tr><td><a title="木头盔">木头盔</a></td><td>1</td><td>+1%</td></tr></table>';
  const mock = path.join(root, 'api.json');
  fs.writeFileSync(mock, JSON.stringify({ __byRequest: {
    'parse:wikitext|text|sections|revid:盔甲属性表': { parse: { pageid: 123, revid: 456, title: '盔甲属性表', text: html, wikitext: '{{armor table}}' } },
    'query:*:盔甲属性表': { query: { pages: [{ pageid: 123, revisions: [{ revid: 456, timestamp: '2026-09-28T00:00:00Z' }] }] } },
  } }));
  const rawPath = path.join(root, 'evidence', 'page.json');
  const outputDir = path.join(root, 'parsed');
  const progressPath = path.join(root, 'progress.json');
  const args = [scriptPath, `--output-dir=${outputDir}`, `--progress-path=${progressPath}`, `--raw-output=${rawPath}`];
  const options = { cwd: root, encoding: 'utf8', env: {
    ...process.env, NODE_ENV: 'test', WORKTREE_ROOT: root, TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mock,
  } };
  const result = spawnSync(process.execPath, args, options);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(rawPath), 'raw HTML and wikitext evidence must survive parsing');
  const bytes = fs.readFileSync(rawPath);
  const raw = JSON.parse(bytes);
  assert.equal(raw.html, html);
  assert.equal(raw.wikitext, '{{armor table}}');
  assert.equal(raw.revisionTimestamp, '2026-09-28T00:00:00Z');
  const parsed = JSON.parse(fs.readFileSync(path.join(outputDir, 'wiki-armor-attributes.latest.json')));
  assert.deepEqual(parsed.rawSourceArtifact, { path: rawPath, sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}` });
  const progress = JSON.parse(fs.readFileSync(path.join(root, 'data/generated/domain-source-armor-attributes-progress.latest.json')));
  assert.equal(progress.actionId, 'domain-source-armor-attributes');
  assert.equal(progress.status, 'completed');
  assert.ok(progress.lastHeartbeatAt);
  const retry = spawnSync(process.execPath, args, options);
  assert.notEqual(retry.status, 0, 'raw evidence must never be overwritten on retry');
  assert.deepEqual(fs.readFileSync(rawPath), bytes);
  assert.equal(JSON.parse(fs.readFileSync(progressPath)).status, 'failed');
});

function expandedArmorTable({ sentry = false, movement = false } = {}) {
  const professions = ['近战速度', '最大魔力', '魔力消耗', '仆从容量', ...(sentry ? ['哨兵容量'] : [])];
  const values = ['<a title="File:Wrong.png">icon</a>', '<a title="挖矿头盔">挖矿头盔</a>',
    '1%', '2%', '3%', '4%', '5%', '6%', '7%', '8%', '9%', '10%',
    '11%', '+20', '-12%', '+1', ...(sentry ? ['+2'] : []), '2', ...(movement ? ['+10%'] : []), '提供照明'];
  return '<h2>困难模式之前的头盔</h2><table><tr>'
    + '<th rowspan="2"></th><th rowspan="2">物品</th><th colspan="4">伤害</th>'
    + '<th colspan="3">暴击率</th><th colspan="3">伤害+暴击率</th>'
    + `<th colspan="${professions.length}">职业专属</th><th rowspan="2">防御</th>`
    + (movement ? '<th rowspan="2">Movement speed</th>' : '') + '<th rowspan="2">其他奖励</th></tr><tr>'
    + ['近战', '远程', '魔法', '召唤', '近战', '远程', '魔法', '近战', '远程', '魔法', ...professions]
      .map(text => `<th>${text}</th>`).join('')
    + '</tr><tr>' + values.map(value => `<td>${value}</td>`).join('') + '</tr></table>';
}

for (const canonical of [false, true]) {
  test(`rejects raw/progress overlap before writing any evidence (canonical=${canonical})`, (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-path-overlap-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const rawPath = canonical
      ? path.join(root, 'data/generated/domain-source-armor-attributes-progress.latest.json')
      : path.join(root, 'progress.json');
    fs.mkdirSync(path.dirname(rawPath), { recursive: true });
    const original = '{"immutable":"source evidence"}\n';
    fs.writeFileSync(rawPath, original);
    const result = spawnSync(process.execPath, [scriptPath,
      `--output-dir=${root}/parsed`, `--raw-output=${rawPath}`,
      `--progress-path=${root}/progress.json`, '--api-url=http://127.0.0.1:9/api.php'], {
      encoding: 'utf8', env: { ...process.env, NODE_ENV: 'test', WORKTREE_ROOT: root },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /overlap/i);
    assert.equal(fs.readFileSync(rawPath, 'utf8'), original);
  });
}

for (const options of [{}, { sentry: true }, { movement: true }]) {
  test(`expands actual rowspan/colspan armor headers without shifting defense ${JSON.stringify(options)}`, () => {
    const [row] = parseWikiArmorAttributeRows({ html: expandedArmorTable(options) });
    assert.equal(row.itemNameZh, '挖矿头盔', 'the declared item column wins over image links');
    assert.equal(row.defenseValue, 2);
    assert.equal(row.rawCells.meleeCritChance, '5%');
    assert.equal(row.rawCells.meleeDamageCritChance, '8%');
    assert.equal(row.rawCells.classSpecific, '11%');
    assert.equal(row.rawCells.maxMana, '+20');
    assert.equal(row.rawCells.manaCost, '-12%');
    assert.equal(row.rawCells.minionSlots, '+1');
    assert.equal(row.rawCells.sentrySlots, options.sentry ? '+2' : undefined);
    assert.equal(row.rawCells.movementSpeed, options.movement ? '+10%' : undefined);
    assert.equal(row.rawCells.otherBonus, '提供照明');
  });
}

test('armor rows with missing cells fail closed instead of assigning fixed column offsets', () => {
  const html = expandedArmorTable().replace('<td>+20</td>', '');
  assert.throws(() => parseWikiArmorAttributeRows({ html }), /column|cell|header/i);
});

test('a source defense of zero remains distinct from missing defense', () => {
  const html = expandedArmorTable().replace('<td>2</td>', '<td>0</td>');
  assert.equal(parseWikiArmorAttributeRows({ html })[0].defenseValue, 0);
});

test('captures a bounded independent identity page with revision binding and network heartbeat', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-identity-source-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const progressPath = path.join(root, 'progress.json');
  const identityPath = path.join(root, 'identity.json');
  let heartbeatDuringRequest = false;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    response.setHeader('content-type', 'application/json');
    if (url.searchParams.get('action') === 'query') {
      const identity = url.searchParams.get('titles') === 'Mining Pants';
      response.end(JSON.stringify({ query: { pages: [{ pageid: identity ? 124 : 123,
        title: identity ? 'Mining armor' : '盔甲属性表', revisions: [{ revid: identity ? 789 : 456, timestamp: '2026-09-28T00:00:00Z' }] }] } }));
    } else {
      const before = JSON.parse(fs.readFileSync(progressPath));
      await new Promise(resolve => setTimeout(resolve, 150));
      const after = JSON.parse(fs.readFileSync(progressPath));
      heartbeatDuringRequest ||= after.lastHeartbeatAt > before.lastHeartbeatAt;
      const identity = url.searchParams.get('page') === 'Mining Pants';
      if (url.searchParams.has('oldid')) {
        response.end(JSON.stringify({ error: { code: 'oldid-blocked' } }));
        return;
      }
      response.end(JSON.stringify({ parse: { pageid: identity ? 124 : 123, revid: identity ? 789 : 456,
        title: identity ? 'Mining armor' : '盔甲属性表',
        text: identity ? '<p>Mining Pants</p>' : expandedArmorTable(), wikitext: identity ? 'independent item evidence' : 'armor table' } }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const child = spawn(process.execPath, [scriptPath, `--api-url=http://127.0.0.1:${server.address().port}/api.php`,
    `--output-dir=${root}/parsed`, `--raw-output=${root}/raw.json`, `--progress-path=${progressPath}`,
    '--identity-page=Mining Pants', `--identity-raw-output=${identityPath}`], {
    cwd: root, env: { ...process.env, WORKTREE_ROOT: root, TERRAPEDIA_CRAWLER_HEARTBEAT_MS: '20' },
  });
  let stderr = '';
  child.stderr.on('data', bytes => { stderr += bytes; });
  child.stdout.resume();
  const code = await new Promise(resolve => child.once('close', resolve));
  assert.equal(code, 0, stderr);
  assert.equal(heartbeatDuringRequest, true);
  assert.ok(fs.existsSync(identityPath), 'independent identity source must be captured');
  const source = JSON.parse(fs.readFileSync(identityPath));
  assert.equal(source.requestedPageTitle, 'Mining Pants');
  assert.equal(source.pageTitle, 'Mining armor');
  assert.equal(source.revisionId, 789);
  const parsed = JSON.parse(fs.readFileSync(path.join(root, 'parsed/wiki-armor-attributes.latest.json')));
  assert.equal(parsed.identitySourceArtifact.path, identityPath);
  assert.equal(JSON.parse(fs.readFileSync(progressPath)).status, 'completed');
});
