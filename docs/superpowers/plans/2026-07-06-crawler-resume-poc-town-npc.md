# 断点续传 PoC（town_npc_maintenance）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 town_npc_maintenance 域上端到端打通"断点续传"的**脚本层核心**：中断后能只抓未完成条目、且绝不跳过结果未落盘的条目，用离线可跑的行为测试证明。

**Architecture:** 新增通用库 `crawler-resume-state.mjs`（读写/校验/skip/markCompleted），并把 town_npc 脚本的结果 I/O 从"结尾一次性写"改为"逐条落盘（partial store）→ 再 markCompleted"的顺序，保证崩溃后已抓结果不丢、未落盘不误标。resume 以 `key(gameId) + inputFingerprint` 为准，不拿 progress.current 当断点。

**Tech Stack:** Node.js ESM(.mjs)、`node:test`、`node:crypto`(sha256)、现有 `writeJsonFile`(原子写 tmp+rename)、离线 mock（`TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML`）。

**Scope note:** 本计划只覆盖**脚本层 PoC（Phase 1）**，它本身可独立跑通、可测试、能证明协议成立。后端派发/DTO/前端按钮的"可操作化接线"是 **Phase 2（另出计划）**，见文末附录，本计划不实现。

**基线:** 分支 `feat/crawler-resume-protocol`（main `3302b4c`）。可行性依据见 `docs/superpowers/specs/2026-07-06-crawler-resume-protocol-feasibility.md`。

---

## 文件结构

| 文件 | 责任 |
|---|---|
| `scripts/data/lib/crawler-resume-state.mjs`（新建） | 通用续传状态库：fingerprint、load/verify/decision、skip、markCompleted、progress 字段 |
| `scripts/data/lib/crawler-resume-state.test.mjs`（新建） | 库的纯单元测试 |
| `scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs`（改） | 结果逐条落盘 + 接入 resume 决策/skip/fingerprint + 新 CLI |
| `scripts/data/fetch/fetch-wiki-town-npc-maintenance-resume.test.mjs`（新建） | 离线 spawn 行为测试：crash→resume→fresh→fingerprint |

**约定路径**（相对 repo root，随 `WORKTREE_ROOT`/`--resume-state` 可覆盖）：
- resume state：`data/generated/resume/domain-source-town-npc-maintenance.resume.json`
- partial store：`data/generated/resume/domain-source-town-npc-maintenance.partial.json`

---

## Task 1: 通用续传状态库 `crawler-resume-state.mjs`

**Files:**
- Create: `scripts/data/lib/crawler-resume-state.mjs`
- Test: `scripts/data/lib/crawler-resume-state.test.mjs`

- [ ] **Step 1: 写失败测试**

Create `scripts/data/lib/crawler-resume-state.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  computeInputFingerprint,
  createResumeState,
  loadResumeState,
  verifyResumeState,
  resolveResumeDecision,
  makeSkipChecker,
  markCompleted,
  buildResumeProgressFields,
} from './crawler-resume-state.mjs';

const ACTION = 'domain-source-town-npc-maintenance';
const MODE = 'keyed_items';

test('fingerprint 与顺序无关、随集合变化', () => {
  const a = computeInputFingerprint([3, 1, 2]);
  const b = computeInputFingerprint([1, 2, 3]);
  const c = computeInputFingerprint([1, 2, 3, 4]);
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('verify: actionId/mode/fingerprint 任一不符即失败', () => {
  const fp = computeInputFingerprint([1, 2]);
  const state = createResumeState({ actionId: ACTION, resumeMode: MODE, inputFingerprint: fp });
  assert.equal(verifyResumeState({ state, actionId: ACTION, resumeMode: MODE, inputFingerprint: fp }).ok, true);
  assert.equal(verifyResumeState({ state, actionId: 'x', resumeMode: MODE, inputFingerprint: fp }).reason, 'actionId-mismatch');
  assert.equal(verifyResumeState({ state, actionId: ACTION, resumeMode: 'index', inputFingerprint: fp }).reason, 'mode-mismatch');
  assert.equal(verifyResumeState({ state, actionId: ACTION, resumeMode: MODE, inputFingerprint: 'zzz' }).reason, 'fingerprint-mismatch');
});

test('decision: fresh 无条件 fresh；resume 校验失败即 fail；auto 校验失败降级 fresh', () => {
  const fp = computeInputFingerprint([1, 2]);
  const good = createResumeState({ actionId: ACTION, resumeMode: MODE, inputFingerprint: fp });
  assert.equal(resolveResumeDecision({ mode: 'fresh', state: good, actionId: ACTION, resumeMode: MODE, inputFingerprint: fp }).action, 'fresh');
  assert.equal(resolveResumeDecision({ mode: 'resume', state: good, actionId: ACTION, resumeMode: MODE, inputFingerprint: fp }).action, 'resume');
  assert.equal(resolveResumeDecision({ mode: 'resume', state: null, actionId: ACTION, resumeMode: MODE, inputFingerprint: fp }).action, 'fail');
  assert.equal(resolveResumeDecision({ mode: 'auto', state: good, actionId: ACTION, resumeMode: MODE, inputFingerprint: 'zzz' }).action, 'fresh');
  assert.equal(resolveResumeDecision({ mode: 'auto', state: good, actionId: ACTION, resumeMode: MODE, inputFingerprint: fp }).action, 'resume');
});

test('skip + markCompleted 落盘且幂等，load 回读一致', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-state-'));
  const statePath = path.join(dir, 'nested', 's.resume.json');
  const fp = computeInputFingerprint([1, 2]);
  const state = createResumeState({ actionId: ACTION, resumeMode: MODE, inputFingerprint: fp });
  const skip0 = makeSkipChecker(state);
  assert.equal(skip0(1), false);
  markCompleted({ statePath, state, key: 1 });
  markCompleted({ statePath, state, key: 1 }); // 幂等
  markCompleted({ statePath, state, key: 2 });
  const reloaded = loadResumeState(statePath);
  assert.deepEqual(reloaded.completedKeys.map(String).sort(), ['1', '2']);
  const skip1 = makeSkipChecker(reloaded);
  assert.equal(skip1(1), true);
  assert.equal(skip1(3), false);
  assert.equal(fs.readdirSync(path.dirname(statePath)).some((n) => n.endsWith('.tmp')), false);
});

test('buildResumeProgressFields 产出 resume 子对象', () => {
  const fp = computeInputFingerprint([1, 2]);
  const state = createResumeState({ actionId: ACTION, resumeMode: MODE, inputFingerprint: fp });
  markCompletedInMemory(state, 1);
  const fields = buildResumeProgressFields(state, 2);
  assert.deepEqual(fields.resume, { mode: MODE, completed: 1, total: 2, inputFingerprint: fp });
});

function markCompletedInMemory(state, key) {
  state.completedKeys.push(key);
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/data/lib/crawler-resume-state.test.mjs`
Expected: FAIL（`Cannot find module './crawler-resume-state.mjs'`）

- [ ] **Step 3: 写最小实现**

Create `scripts/data/lib/crawler-resume-state.mjs`:

```js
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { writeJsonFile } from '../workflow/backend-refresh-runtime-state.mjs';

export function computeInputFingerprint(keys) {
  const normalized = [...keys].map((k) => String(k)).sort();
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function createResumeState({ actionId, resumeMode, inputFingerprint }) {
  return {
    actionId,
    resumeMode,
    inputFingerprint,
    completedKeys: [],
    updatedAt: new Date().toISOString(),
  };
}

export function loadResumeState(statePath) {
  try {
    if (!fs.existsSync(statePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.completedKeys)) parsed.completedKeys = [];
    return parsed;
  } catch {
    return null;
  }
}

export function verifyResumeState({ state, actionId, resumeMode, inputFingerprint }) {
  if (!state) return { ok: false, reason: 'missing' };
  if (state.actionId !== actionId) return { ok: false, reason: 'actionId-mismatch' };
  if (state.resumeMode !== resumeMode) return { ok: false, reason: 'mode-mismatch' };
  if (state.inputFingerprint !== inputFingerprint) return { ok: false, reason: 'fingerprint-mismatch' };
  return { ok: true, reason: 'valid' };
}

export function resolveResumeDecision({ mode, state, actionId, resumeMode, inputFingerprint }) {
  if (mode === 'fresh') return { action: 'fresh', reason: 'requested-fresh' };
  const verdict = verifyResumeState({ state, actionId, resumeMode, inputFingerprint });
  if (verdict.ok) return { action: 'resume', reason: 'valid-state', state };
  if (mode === 'resume') return { action: 'fail', reason: verdict.reason };
  return { action: 'fresh', reason: `auto-downgrade:${verdict.reason}` };
}

export function makeSkipChecker(state) {
  const done = new Set((state?.completedKeys || []).map((k) => String(k)));
  return (key) => done.has(String(key));
}

export function markCompleted({ statePath, state, key }) {
  const strKey = String(key);
  if (!state.completedKeys.map((k) => String(k)).includes(strKey)) {
    state.completedKeys.push(key);
  }
  state.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  writeJsonFile(statePath, state);
  return state;
}

export function buildResumeProgressFields(state, totalKeys) {
  return {
    resume: {
      mode: state?.resumeMode || 'none',
      completed: state?.completedKeys?.length || 0,
      total: totalKeys ?? null,
      inputFingerprint: state?.inputFingerprint || null,
    },
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test scripts/data/lib/crawler-resume-state.test.mjs`
Expected: PASS（5 tests）

- [ ] **Step 5: 提交**

```bash
git add scripts/data/lib/crawler-resume-state.mjs scripts/data/lib/crawler-resume-state.test.mjs
git commit -m "feat(crawler-resume): 通用续传状态库(fingerprint/verify/skip/markCompleted)"
```

---

## Task 2: town_npc 结果改逐条增量落盘（partial store）

**目标**：把 `crawlRecords` 的"内存攒 records、结尾一次写"改成"每抓一条→立刻写 partial store→再回调"。此步先不接 resume 决策，只保证**逐条落盘**这一 R1 前提成立，并用"崩溃注入"证明。

**Files:**
- Modify: `scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs`
- Test: `scripts/data/fetch/fetch-wiki-town-npc-maintenance-resume.test.mjs`（新建，本步先加 1 个用例）

- [ ] **Step 1: 写失败测试（崩溃后 partial 已含已抓项）**

Create `scripts/data/fetch/fetch-wiki-town-npc-maintenance-resume.test.mjs`。先放共享 helper + 第 1 个用例：

```js
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
const scriptPath = path.join(__dirname, 'fetch-wiki-town-npc-maintenance.mjs');

function mockHtml() {
  return `<!DOCTYPE html><html><head>
    <script>var wgArticleId=1;var wgRevisionId=1;</script>
    <title>NPC</title></head>
    <body><div class="mw-parser-output"><p>intro</p></div></body></html>`;
}

function setup(seedIds) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'town-npc-resume-'));
  const worktreeRoot = path.join(dir, 'wt');
  const sourcePath = path.join(dir, 'npc-standardized-map.json');
  const outputPath = path.join(dir, 'generated', 'wiki-town-npc-maintenance.latest.json');
  const snapshotPath = path.join(dir, 'reports', 'snapshot.json');
  const progressPath = path.join(dir, 'progress.json');
  const statePath = path.join(dir, 'resume', 'state.resume.json');
  const mockHtmlPath = path.join(dir, 'npc.html');
  fs.mkdirSync(worktreeRoot, { recursive: true });
  const records = {};
  for (const id of seedIds) {
    records[id] = { gameId: id, internalName: `Npc${id}`, nameZh: `角色${id}`, rawJson: JSON.stringify({ name: `Npc${id}`, extras: { townNPC: true } }) };
  }
  fs.writeFileSync(sourcePath, JSON.stringify({ records }), 'utf8');
  fs.writeFileSync(mockHtmlPath, mockHtml(), 'utf8');
  return { dir, worktreeRoot, sourcePath, outputPath, snapshotPath, progressPath, statePath, mockHtmlPath };
}

function run(ctx, extraArgs = [], extraEnv = {}) {
  return spawnSync(process.execPath, [
    scriptPath,
    `--source=${ctx.sourcePath}`,
    `--output=${ctx.outputPath}`,
    `--snapshot-output=${ctx.snapshotPath}`,
    `--progress-path=${ctx.progressPath}`,
    `--resume-state=${ctx.statePath}`,
    '--delay-ms=0',
    ...extraArgs,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, WORKTREE_ROOT: ctx.worktreeRoot, TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML: ctx.mockHtmlPath, ...extraEnv },
  });
}

function partialPath(statePath) {
  return statePath.replace(/\.resume\.json$/, '.partial.json');
}

test('崩溃后：已抓项写入 partial store、resume state 已标记，无 .tmp 残留', () => {
  const ctx = setup([1, 2, 3]);
  const res = run(ctx, [], { TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '2' });
  assert.notEqual(res.status, 0, '崩溃注入应非零退出');
  const partial = JSON.parse(fs.readFileSync(partialPath(ctx.statePath), 'utf8'));
  assert.deepEqual(Object.keys(partial).map(Number).sort((a, b) => a - b), [1, 2]);
  const state = JSON.parse(fs.readFileSync(ctx.statePath, 'utf8'));
  assert.deepEqual(state.completedKeys.map(Number).sort((a, b) => a - b), [1, 2]);
  assert.equal(fs.readdirSync(path.dirname(ctx.statePath)).some((n) => n.endsWith('.tmp')), false);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/data/fetch/fetch-wiki-town-npc-maintenance-resume.test.mjs`
Expected: FAIL（脚本还没写 partial、也没有 crash-after 钩子）

- [ ] **Step 3: 改脚本——常量、CLI、crawlRecords 逐条落盘**

在 `fetch-wiki-town-npc-maintenance.mjs` 顶部 import 区加入（`import { writeJsonFile } ...` 之后）：

```js
import {
  computeInputFingerprint,
  createResumeState,
  loadResumeState,
  resolveResumeDecision,
  makeSkipChecker,
  markCompleted,
  buildResumeProgressFields,
} from '../lib/crawler-resume-state.mjs';
```

把 `const CLI_OPTIONS = [...]`（当前第 20 行）改为：

```js
const CLI_OPTIONS = ['--source', '--output', '--snapshot-output', '--progress-path', '--delay-ms', '--limit', '--resume-mode', '--resume-state'];
const RESUME_MODE_VALUE = 'keyed_items';
```

**让 `buildProgressPayload` 透传 `resume` 字段**（当前它按固定白名单解构，会丢掉 `resume`）。把它的签名参数 `nextStep = null` 改为 `nextStep = null,\n  resume = null`，并在函数末尾 `if (nextStep) { payload.nextStep = nextStep; }` 之后、`return payload;` 之前加：

```js
  if (resume) {
    payload.resume = resume;
  }
```

把 `async function crawlRecords({ client, seeds, delayMs, progressCallback })` 整个函数替换为下面版本（新增 `resume` 参数：`{ state, statePath, partialPath, partialStore, shouldSkip, onPersist, crashAfter }`；逐条落盘后再 markCompleted，再按需崩溃）：

```js
async function crawlRecords({ client, seeds, delayMs, progressCallback, resume }) {
  const partialStore = resume.partialStore;
  let scraped = 0;
  let skipped = 0;
  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index];
    const key = seed.gameId;
    if (resume.shouldSkip(key)) {
      skipped += 1;
      progressCallback?.(resume.state.completedKeys.length, seeds.length, seed);
      continue;
    }
    if (scraped > 0) {
      await sleep(delayMs + Math.floor(Math.random() * 400));
    }
    progressCallback?.(resume.state.completedKeys.length, seeds.length, seed);
    let record;
    try {
      record = await fetchTownNpcRecord(client, seed);
    } catch (error) {
      record = {
        gameId: seed.gameId,
        internalName: seed.internalName,
        pageTitle: seed.pageTitle,
        pageUrl: buildPageUrl(seed.pageTitle),
        fetchedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        shopItems: [],
        shopItemCount: 0,
        livingPreferences: [],
        moveInConditions: [],
        suggestedGamePeriodId: null,
        suggestedGamePeriodReason: null,
      };
    }
    // 顺序关键：先把结果落盘（partial store），再 markCompleted。崩溃在两者之间只会导致该项被重抓，不会丢数据。
    partialStore[String(key)] = record;
    writeJsonAtomic(resume.partialPath, partialStore);
    markCompleted({ statePath: resume.statePath, state: resume.state, key });
    scraped += 1;
    progressCallback?.(resume.state.completedKeys.length, seeds.length, seed);
    if (resume.crashAfter != null && scraped >= resume.crashAfter) {
      process.exit(137); // 测试用崩溃注入：模拟 SIGKILL
    }
  }
  const records = Object.keys(partialStore)
    .map(Number)
    .sort((a, b) => a - b)
    .map((id) => partialStore[String(id)]);
  return { records, scraped, skipped };
}
```

- [ ] **Step 4: 改 `main()`——组织 resume 决策并调用新 crawlRecords**

在 `main()` 里，把从 `const progressPath = ...` 到 `const records = await crawlRecords({...})` 之间的逻辑替换为下面版本（保留 outputPath/snapshotPath/sourcePath 等已有解析行不变，只替换 seeds 之后的部分）：

```js
    let seeds = loadTownNpcSeeds(sourcePath);
    const limit = toNullableInteger(args.limit);
    if (limit != null) {
      seeds = seeds.slice(0, Math.max(0, limit));
    }

    // ── resume 决策 ──
    const resumeMode = String(args['resume-mode'] ?? 'auto');
    const statePath = path.resolve(String(args['resume-state'] ?? path.join(repoRoot, 'data', 'generated', 'resume', `${ACTION_ID}.resume.json`)));
    const partialPath = statePath.replace(/\.resume\.json$/, '.partial.json');
    const inputFingerprint = computeInputFingerprint(seeds.map((seed) => seed.gameId));
    const priorState = loadResumeState(statePath);
    const decision = resolveResumeDecision({
      mode: resumeMode,
      state: priorState,
      actionId: ACTION_ID,
      resumeMode: RESUME_MODE_VALUE,
      inputFingerprint,
    });
    if (decision.action === 'fail') {
      throw new Error(`resume 校验失败(${decision.reason})：请用 --resume-mode=fresh 重跑，或确认输入未变`);
    }
    const resuming = decision.action === 'resume';
    const state = resuming ? priorState : createResumeState({ actionId: ACTION_ID, resumeMode: RESUME_MODE_VALUE, inputFingerprint });
    const partialStore = resuming && fs.existsSync(partialPath) ? JSON.parse(fs.readFileSync(partialPath, 'utf8')) : {};
    if (!resuming) {
      // fresh：清掉旧 partial，从零开始
      fs.rmSync(partialPath, { force: true });
    }
    const shouldSkip = makeSkipChecker(state);
    const crashAfter = toNullableInteger(process.env.TERRAPEDIA_TOWN_NPC_CRASH_AFTER);

    writeProgress(progressPath, buildProgressPayload({
      status: 'running',
      phase: 'fetch',
      message: `starting town NPC maintenance fetch (${decision.action})`,
      current: state.completedKeys.length,
      total: seeds.length,
      outputPath,
      reportPath: snapshotPath,
      startedAt,
      nextStep: 'fetch town NPC wiki pages',
      ...buildResumeProgressFields(state, seeds.length),
    }), canonicalProgressPath);

    const client = buildClient();
    const { records, scraped, skipped } = await crawlRecords({
      client,
      seeds,
      delayMs: Math.max(0, Number(args['delay-ms'] ?? 1600) || 0),
      resume: { state, statePath, partialPath, partialStore, shouldSkip, crashAfter },
      progressCallback: (current, total, seed) => writeProgress(progressPath, buildProgressPayload({
        status: 'running',
        phase: 'fetch',
        message: `fetching town NPC page ${seed.pageTitle}`,
        current,
        total,
        outputPath,
        reportPath: snapshotPath,
        startedAt,
        nextStep: 'continue town NPC wiki page fetch',
        ...buildResumeProgressFields(state, seeds.length),
      }), canonicalProgressPath),
    });
```

然后把 `const payload = {...}` 里的 `totalTownNpcs: seeds.length,` 保持不变；把结尾 `process.stdout.write(...)` 里的汇总对象加两个字段：`scrapedCount: scraped,` 和 `skippedCount: skipped,`（替换原先的 `scrapedCount: payload.summary.scrapedCount,`）。

> 注：`ACTION_ID` 常量脚本里已存在（进度契约测试断言过 `ACTION_ID = 'domain-source-town-npc-maintenance'`）。若实际是别的名字，用文件里现有的那个常量。

- [ ] **Step 5: 运行 Task2 测试确认通过**

Run: `node --test scripts/data/fetch/fetch-wiki-town-npc-maintenance-resume.test.mjs`
Expected: PASS（"崩溃后 partial 已含已抓项" 用例通过）

- [ ] **Step 6: 跑既有进度契约测试，确认没回归**

Run: `node --test scripts/data/fetch/fetch-wiki-town-npc-maintenance-progress.test.mjs`
Expected: PASS（默认 `--resume-mode=auto` 且无旧 state 时行为等同 fresh，完成态不变）

- [ ] **Step 7: 提交**

```bash
git add scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs scripts/data/fetch/fetch-wiki-town-npc-maintenance-resume.test.mjs
git commit -m "feat(crawler-resume): town_npc 结果逐条落盘 + 接入 resume 决策/skip/fingerprint"
```

---

## Task 3: 端到端行为——resume 只抓剩余 / fresh 忽略旧 state / fingerprint 拒绝

**Files:**
- Modify: `scripts/data/fetch/fetch-wiki-town-npc-maintenance-resume.test.mjs`（追加 4 个用例）

- [ ] **Step 1: 追加失败测试**

在测试文件末尾追加：

```js
test('resume：崩溃后接着爬，只抓剩余、不重抓已落盘项，最终完整', () => {
  const ctx = setup([1, 2, 3]);
  const crash = run(ctx, [], { TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '2' });
  assert.notEqual(crash.status, 0);

  const res = run(ctx, ['--resume-mode=resume']);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  const summary = JSON.parse(res.stdout);
  assert.equal(summary.skippedCount, 2, '应跳过已完成的 2 条');
  assert.equal(summary.scrapedCount, 1, '只抓剩余 1 条');

  const output = JSON.parse(fs.readFileSync(ctx.outputPath, 'utf8'));
  assert.equal(output.totalTownNpcs, 3);
  assert.deepEqual(output.records.map((r) => r.gameId).sort((a, b) => a - b), [1, 2, 3]);
  const progress = JSON.parse(fs.readFileSync(ctx.progressPath, 'utf8'));
  assert.equal(progress.status, 'completed');
  assert.equal(progress.resume.mode, 'keyed_items');
});

test('fresh：即便有旧 state 也从头抓、重置 partial', () => {
  const ctx = setup([1, 2, 3]);
  run(ctx, [], { TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '2' });
  const res = run(ctx, ['--resume-mode=fresh']);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  const summary = JSON.parse(res.stdout);
  assert.equal(summary.skippedCount, 0);
  assert.equal(summary.scrapedCount, 3);
});

test('resume 模式遇 fingerprint 变化：拒绝并非零退出', () => {
  const ctx = setup([1, 2, 3]);
  run(ctx, [], { TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '2' });
  // 改变输入集合（新增 seed 4）→ fingerprint 变
  const changed = setup([1, 2, 3, 4]);
  // 复用同一个 statePath/partialPath（指向已崩溃那次的 state）
  const res = spawnSync(process.execPath, [
    scriptPath,
    `--source=${changed.sourcePath}`,
    `--output=${changed.outputPath}`,
    `--snapshot-output=${changed.snapshotPath}`,
    `--progress-path=${changed.progressPath}`,
    `--resume-state=${ctx.statePath}`,
    '--delay-ms=0',
    '--resume-mode=resume',
  ], { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, WORKTREE_ROOT: changed.worktreeRoot, TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML: changed.mockHtmlPath } });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /resume 校验失败\(fingerprint-mismatch\)/);
});

test('auto 模式遇 fingerprint 变化：降级 fresh、全量抓', () => {
  const ctx = setup([1, 2, 3]);
  run(ctx, [], { TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '2' });
  const changed = setup([1, 2, 3, 4]);
  const res = spawnSync(process.execPath, [
    scriptPath,
    `--source=${changed.sourcePath}`,
    `--output=${changed.outputPath}`,
    `--snapshot-output=${changed.snapshotPath}`,
    `--progress-path=${changed.progressPath}`,
    `--resume-state=${ctx.statePath}`,
    '--delay-ms=0',
    '--resume-mode=auto',
  ], { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, WORKTREE_ROOT: changed.worktreeRoot, TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML: changed.mockHtmlPath } });
  assert.equal(res.status, 0, res.stderr || res.stdout);
  const summary = JSON.parse(res.stdout);
  assert.equal(summary.scrapedCount, 4);
  assert.equal(summary.skippedCount, 0);
});
```

- [ ] **Step 2: 运行确认（先失败或直接通过）**

Run: `node --test scripts/data/fetch/fetch-wiki-town-npc-maintenance-resume.test.mjs`
Expected: 若 Task 2 实现正确，这 4 个新用例应 PASS。若有 FAIL，按报错修 `main()`/`crawlRecords`（常见点：fresh 未清 partial、fingerprint 用了 limit 前的 seeds、skip 计数口径）。

- [ ] **Step 3: 全量脚本测试回归**

Run: `node --test scripts/data/fetch/*.test.mjs scripts/data/lib/crawler-resume-state.test.mjs`
Expected: PASS（无回归）

- [ ] **Step 4: 提交**

```bash
git add scripts/data/fetch/fetch-wiki-town-npc-maintenance-resume.test.mjs
git commit -m "test(crawler-resume): town_npc 端到端续传/fresh/fingerprint 行为覆盖"
```

---

## Task 4: 域规则标注 resume 能力（JS 侧，声明用，不改派发）

**目标**：让 town_npc 的域规则带上 resume 元信息，供后续 Phase 2 后端/前端消费。本步只加字段 + 测试，不动 Java、不动派发。

**Files:**
- Modify: `scripts/data/monitor/wiki-monitor-domain-rules.mjs`
- Test: `scripts/data/monitor/wiki-monitor-domain-rules.test.mjs`

- [ ] **Step 1: 写失败测试**

在 `wiki-monitor-domain-rules.test.mjs` 末尾追加：

```js
test('town_npc 域声明 keyed_items 续传能力', () => {
  const rule = WIKI_MONITOR_DOMAIN_RULES.find((entry) => entry.domain === 'town_npc_maintenance');
  assert.equal(rule.resumeSupported, true);
  assert.equal(rule.resumeMode, 'keyed_items');
  assert.equal(rule.resumeStatePath, 'data/generated/resume/domain-source-town-npc-maintenance.resume.json');
  assert.equal(rule.restartBehavior, 'resume_available');
});

test('未接入续传的域默认 fresh', () => {
  const rule = WIKI_MONITOR_DOMAIN_RULES.find((entry) => entry.domain === 'bosses');
  assert.equal(rule.resumeSupported, false);
  assert.equal(rule.restartBehavior, 'fresh');
});
```

（若测试文件顶部没 import `WIKI_MONITOR_DOMAIN_RULES`，按文件现有 import 风格补上。）

- [ ] **Step 2: 运行确认失败**

Run: `node --test scripts/data/monitor/wiki-monitor-domain-rules.test.mjs`
Expected: FAIL（`resumeSupported` undefined）

- [ ] **Step 3: 给 `rule()` 加可选 resume 字段 + 默认值**

在 `wiki-monitor-domain-rules.mjs` 的 `function rule(...)` 里，给返回对象追加（放在 `pauseReason: null` 后面）默认字段：

```js
    resumeSupported: false,
    resumeMode: 'none',
    resumeStatePath: null,
    restartBehavior: 'fresh',
```

并把 `function rule(...)` 签名末尾加一个可选参数 `resumeOptions = {}`，在返回对象里用它覆盖默认：

```js
function rule(domain, label, sourceKey, locator, recommendedActionId, progressPath, command, resumeOptions = {}) {
  return {
    // ...原有字段不变...
    pauseReason: null,
    resumeSupported: false,
    resumeMode: 'none',
    resumeStatePath: null,
    restartBehavior: 'fresh',
    ...resumeOptions,
  };
}
```

然后给 town_npc 那条 `rule(...)` 调用最后加一个参数：

```js
  rule(
    'town_npc_maintenance',
    'Town NPC maintenance',
    'wiki.domain.town_npc_maintenance',
    'Town NPC maintenance source page',
    'domain-source-town-npc-maintenance',
    'data/generated/domain-source-town-npc-maintenance-progress.latest.json',
    ['node', 'scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs', '--progress-path=data/generated/domain-source-town-npc-maintenance-progress.latest.json'],
    { resumeSupported: true, resumeMode: 'keyed_items', resumeStatePath: 'data/generated/resume/domain-source-town-npc-maintenance.resume.json', restartBehavior: 'resume_available' }
  ),
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test scripts/data/monitor/wiki-monitor-domain-rules.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add scripts/data/monitor/wiki-monitor-domain-rules.mjs scripts/data/monitor/wiki-monitor-domain-rules.test.mjs
git commit -m "feat(crawler-resume): town_npc 域规则声明 keyed_items 续传能力(JS 侧)"
```

---

## PoC 验收（手动，可选）

在 repo root 用 mock 真跑一遍（不联网）：

```bash
mkdir -p /tmp/poc && cp -f data/generated/npc-standardized-map.json /tmp/poc/seeds.json
node scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs \
  --source=/tmp/poc/seeds.json --limit=5 --delay-ms=0 \
  --resume-state=/tmp/poc/state.resume.json \
  --output=/tmp/poc/out.json --snapshot-output=/tmp/poc/snap.json --progress-path=/tmp/poc/progress.json
```
（联网抓取；或设 `TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML` 走离线。）验证：中途 Ctrl-C 后，重跑加 `--resume-mode=resume` 只抓剩余、`out.json` 最终完整；加 `--resume-mode=fresh` 全量重来。

---

## 附录：Phase 2（另出计划，本计划不实现）——可操作化接线

PoC 打通脚本层后，让"接着爬"从监控页可点，需要（每项都要单独 TDD）：

1. **Java 域规则同步**：`CrawlerMonitorServiceImpl` 的 `WIKI_MONITOR_RULES` record 加 `resumeSupported/resumeMode/resumeStatePath/restartBehavior`，与 JS 侧保持一致；经 overview DTO 暴露到前端。
2. **DTO 扩展**：`CrawlerMonitorDispatchRequestDTO` 加可选 `mode`(resume|fresh)。
3. **派发注入**：`buildLaunchRequest` 按 `mode` 往命令数组追加 `--resume-mode=<mode> --resume-state=<rule.resumeStatePath>`。
4. **新控制动作**："接着爬"= 死进程(stalled/failed)时：释放 stale 锁 → 带 `mode=resume` 重新 spawn；与现有"继续"(对 paused 活进程发 SIGCONT)区分。
5. **前端**：`crawler-monitor.vue` 加判据 `canContinueCrawl`(域 `resumeSupported && 状态∈{stalled,failed} && resume state 存在`)；`CrawlerTriageBoard`/`DomainDetailDrawer` 死进程时出"接着爬"按钮，走新 `domain-action`。
6. **buffs 接入**：以 `phase_keyed` 复用本库（immunity 阶段 keyed_items），作为第二个域验证协议通用性。
