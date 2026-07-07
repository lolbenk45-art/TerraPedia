# 断点续传 PoC（town_npc_maintenance）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 town_npc_maintenance 域上端到端打通"断点续传"的**脚本层核心**：中断后能只抓未完成条目、且绝不跳过结果未落盘的条目，用离线可跑的行为测试证明。

**Architecture:** 新增通用库 `crawler-resume-state.mjs`（读写/校验/partial 路径/partial 一致性/skip/markCompleted），并把 town_npc 脚本的结果 I/O 从"结尾一次性写"改为"逐条落盘（partial store）→ 再 markCompleted"的顺序，保证崩溃后已抓结果不丢、未落盘不误标。resume 以 `key(gameId) + inputFingerprint(seed 描述)` 为准，不拿 progress.current 当断点；skip 必须同时满足 state 已完成和 partial store 已有结果。

**Tech Stack:** Node.js ESM(.mjs)、`node:test`、`node:crypto`(sha256)、现有 `writeJsonFile`(原子写 tmp+rename)、离线 mock（`TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML`）。

**Scope note:** 本计划只覆盖**脚本层 PoC（Phase 1）**，它本身可独立跑通、可测试、能证明协议成立。Phase 1 必做任务只有 Task 1-3；Task 4 是 post-PoC/Phase 2 预备 metadata，默认不执行，除非用户在执行时明确确认。后端派发/DTO/前端按钮的"可操作化接线"是 **Phase 2（另出计划）**，见文末附录，本计划不实现。

**基线:** 分支 `feat/crawler-resume-protocol`（main `3302b4c`）。可行性依据见 `docs/superpowers/specs/2026-07-06-crawler-resume-protocol-feasibility.md`。

---

## 文件结构

| 文件 | 责任 |
|---|---|
| `scripts/data/lib/crawler-resume-state.mjs`（新建） | 通用续传状态库：fingerprint、load/verify/decision、partial 路径、partial 一致性、skip、markCompleted、progress 字段 |
| `scripts/data/lib/crawler-resume-state.test.mjs`（新建） | 库的纯单元测试 |
| `scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs`（改） | 结果逐条落盘 + 接入 resume 决策/skip/fingerprint + 新 CLI |
| `scripts/data/fetch/fetch-wiki-town-npc-maintenance-resume.test.mjs`（新建） | 离线 spawn 行为测试：crash→resume→fresh→fingerprint |

**约定路径**（默认相对 `WORKTREE_ROOT`，随 `--resume-state` 可覆盖）：
- resume state：`data/generated/resume/domain-source-town-npc-maintenance.resume.json`
- partial store：`data/generated/resume/domain-source-town-npc-maintenance.partial.json`

**执行边界与提交治理：**
- fingerprint 基于实际参与抓取的 seeds 集合计算；`--limit` 通过裁剪 seeds 间接影响 fingerprint。若 `--limit=999` 与不传 limit 得到同一 seeds 集合，则 fingerprint 相同；若实际 seed 范围不同，`resume` 应拒绝、`auto` 可降级 fresh。
- 本计划不刷新、不提交 `data/generated/**`、`data/standardized/**`、数据库或运行中服务；当前工作区若已有 generated/standardized dirty 文件，必须保持 unstaged，除非用户另行明确批准。
- 每个 commit 前必须运行：

```bash
git status --short
git diff --cached --stat
```

Expected: staged 范围只包含该任务 `git add` 明确列出的文件；不得包含 `data/generated/wiki-bosses.latest.json`、`data/generated/wiki-town-npc-maintenance.latest.json`、`data/standardized/armor_sets.standardized.json`。

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
  derivePartialPath,
  verifyResumePartialStore,
  makeSkipChecker,
  markCompleted,
  buildResumeProgressFields,
} from './crawler-resume-state.mjs';

const ACTION = 'domain-source-town-npc-maintenance';
const MODE = 'keyed_items';

test('fingerprint 与顺序无关、随 seed 集合或描述变化', () => {
  const a = computeInputFingerprint([
    { gameId: 3, internalName: 'C', pageTitle: 'C', nameZh: '三' },
    { gameId: 1, internalName: 'A', pageTitle: 'A', nameZh: '一' },
    { gameId: 2, internalName: 'B', pageTitle: 'B', nameZh: '二' },
  ]);
  const b = computeInputFingerprint([
    { gameId: 1, internalName: 'A', pageTitle: 'A', nameZh: '一' },
    { gameId: 2, internalName: 'B', pageTitle: 'B', nameZh: '二' },
    { gameId: 3, internalName: 'C', pageTitle: 'C', nameZh: '三' },
  ]);
  const c = computeInputFingerprint([
    { gameId: 1, internalName: 'A', pageTitle: 'A', nameZh: '一' },
    { gameId: 2, internalName: 'B', pageTitle: 'B', nameZh: '二' },
    { gameId: 3, internalName: 'C', pageTitle: 'C', nameZh: '三' },
    { gameId: 4, internalName: 'D', pageTitle: 'D', nameZh: '四' },
  ]);
  const d = computeInputFingerprint([
    { gameId: 1, internalName: 'A', pageTitle: 'A-renamed', nameZh: '一' },
    { gameId: 2, internalName: 'B', pageTitle: 'B', nameZh: '二' },
    { gameId: 3, internalName: 'C', pageTitle: 'C', nameZh: '三' },
  ]);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
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
  assert.equal(resolveResumeDecision({ mode: 'resume', state: good, actionId: ACTION, resumeMode: MODE, inputFingerprint: fp, partialStore: {} }).action, 'resume');
  assert.equal(resolveResumeDecision({ mode: 'resume', state: null, actionId: ACTION, resumeMode: MODE, inputFingerprint: fp }).action, 'fail');
  assert.equal(resolveResumeDecision({ mode: 'auto', state: good, actionId: ACTION, resumeMode: MODE, inputFingerprint: 'zzz' }).action, 'fresh');
  assert.equal(resolveResumeDecision({ mode: 'auto', state: good, actionId: ACTION, resumeMode: MODE, inputFingerprint: fp, partialStore: {} }).action, 'resume');
  assert.deepEqual(resolveResumeDecision({ mode: 'bogus', state: good, actionId: ACTION, resumeMode: MODE, inputFingerprint: fp, partialStore: {} }), { action: 'fail', reason: 'invalid-mode' });
  assert.equal(resolveResumeDecision({ mode: 'resume', state: good, actionId: ACTION, resumeMode: MODE, inputFingerprint: fp }).reason, 'partial-missing-store');
});

test('derivePartialPath 不会把非 .resume.json state 覆盖成同一路径', () => {
  assert.equal(derivePartialPath('/tmp/state.resume.json'), '/tmp/state.partial.json');
  assert.equal(derivePartialPath('/tmp/state.json'), '/tmp/state.json.partial.json');
});

const completeRecord = (record, key) => record && record.gameId === Number(key) && record.payload === 'complete';

test('partial consistency: state 标完成但 partial 缺结果时校验失败，skip 不跳过', () => {
  const fp = computeInputFingerprint([1, 2]);
  const state = createResumeState({ actionId: ACTION, resumeMode: MODE, inputFingerprint: fp });
  state.completedKeys.push(1, 2);
  const verdict = verifyResumePartialStore({ state, partialStore: { 1: { gameId: 1, payload: 'complete' } }, isValidRecord: completeRecord });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'partial-missing-completed-key');
  assert.deepEqual(verdict.missingKeys, ['2']);
  assert.equal(resolveResumeDecision({ mode: 'resume', state, actionId: ACTION, resumeMode: MODE, inputFingerprint: fp, partialStore: { 1: { gameId: 1, payload: 'complete' } }, isValidRecord: completeRecord }).action, 'fail');
  assert.equal(resolveResumeDecision({ mode: 'auto', state, actionId: ACTION, resumeMode: MODE, inputFingerprint: fp, partialStore: { 1: { gameId: 1, payload: 'complete' } }, isValidRecord: completeRecord }).action, 'fresh');
  const shouldSkip = makeSkipChecker(state, { 1: { gameId: 1, payload: 'complete' } }, completeRecord);
  assert.equal(shouldSkip(1), true);
  assert.equal(shouldSkip(2), false);
});

test('partial consistency: key 存在但记录为空、字段不完整或 gameId 错配时校验失败，skip 不跳过', () => {
  const fp = computeInputFingerprint([1, 2]);
  const state = createResumeState({ actionId: ACTION, resumeMode: MODE, inputFingerprint: fp });
  state.completedKeys.push(1, 2);
  assert.equal(verifyResumePartialStore({ state, partialStore: { 1: { gameId: 1, payload: 'complete' }, 2: null }, isValidRecord: completeRecord }).reason, 'partial-invalid-record');
  assert.equal(verifyResumePartialStore({ state, partialStore: { 1: { gameId: 1 }, 2: { gameId: 2, payload: 'complete' } }, isValidRecord: completeRecord }).reason, 'partial-invalid-record');
  assert.equal(verifyResumePartialStore({ state, partialStore: { 1: { gameId: 1, payload: 'complete' }, 2: { gameId: 999, payload: 'complete' } }, isValidRecord: completeRecord }).reason, 'partial-key-mismatch');
  const shouldSkip = makeSkipChecker(state, { 1: { gameId: 1 }, 2: { gameId: 999, payload: 'complete' } }, completeRecord);
  assert.equal(shouldSkip(1), false);
  assert.equal(shouldSkip(2), false);
});

test('skip + markCompleted 落盘且幂等，load 回读一致', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-state-'));
  const statePath = path.join(dir, 'nested', 's.resume.json');
  const fp = computeInputFingerprint([1, 2]);
  const state = createResumeState({ actionId: ACTION, resumeMode: MODE, inputFingerprint: fp });
  const partialStore = {};
  const skip0 = makeSkipChecker(state, partialStore);
  assert.equal(skip0(1), false);
  partialStore[1] = { gameId: 1, payload: 'complete' };
  markCompleted({ statePath, state, key: 1 });
  partialStore[2] = { gameId: 2, payload: 'complete' };
  markCompleted({ statePath, state, key: 1 }); // 幂等
  markCompleted({ statePath, state, key: 2 });
  const reloaded = loadResumeState(statePath);
  assert.deepEqual(reloaded.completedKeys.map(String).sort(), ['1', '2']);
  const skip1 = makeSkipChecker(reloaded, partialStore, completeRecord);
  assert.equal(skip1(1), true);
  assert.equal(skip1(3), false);
  assert.equal(fs.readdirSync(path.dirname(statePath)).some((n) => n.endsWith('.tmp')), false);
});

test('partial consistency: state completedKeys 含当前 seeds 外键时拒绝', () => {
  const fp = computeInputFingerprint([1, 2]);
  const state = createResumeState({ actionId: ACTION, resumeMode: MODE, inputFingerprint: fp });
  state.completedKeys.push(1, 999);
  const verdict = verifyResumePartialStore({
    state,
    partialStore: {
      1: { gameId: 1, payload: 'complete' },
      999: { gameId: 999, payload: 'complete' },
    },
    isValidRecord: completeRecord,
    validKeys: [1, 2],
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'completed-key-out-of-scope');
  assert.deepEqual(verdict.extraKeys, ['999']);
});

test('buildResumeProgressFields 产出 resume 子对象', () => {
  const fp = computeInputFingerprint([1, 2]);
  const state = createResumeState({ actionId: ACTION, resumeMode: MODE, inputFingerprint: fp });
  markCompletedInMemory(state, 1);
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

export function computeInputFingerprint(entries) {
  const normalized = [...entries].map(normalizeFingerprintEntry).sort();
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function normalizeFingerprintEntry(entry) {
  if (entry && typeof entry === 'object') {
    return JSON.stringify({
      gameId: String(entry.gameId ?? ''),
      internalName: String(entry.internalName ?? ''),
      pageTitle: String(entry.pageTitle ?? ''),
      nameZh: String(entry.nameZh ?? ''),
    });
  }
  return String(entry);
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

export function resolveResumeDecision({ mode, state, actionId, resumeMode, inputFingerprint, partialStore, isValidRecord, validKeys }) {
  if (!['fresh', 'resume', 'auto'].includes(mode)) return { action: 'fail', reason: 'invalid-mode' };
  if (mode === 'fresh') return { action: 'fresh', reason: 'requested-fresh' };
  const verdict = verifyResumeState({ state, actionId, resumeMode, inputFingerprint });
  if (!verdict.ok) {
    if (mode === 'resume') return { action: 'fail', reason: verdict.reason };
    return { action: 'fresh', reason: `auto-downgrade:${verdict.reason}` };
  }
  const partialVerdict = verifyResumePartialStore({ state, partialStore, isValidRecord, validKeys });
  if (!partialVerdict.ok) {
    if (mode === 'resume') return { action: 'fail', reason: partialVerdict.reason, missingKeys: partialVerdict.missingKeys };
    return { action: 'fresh', reason: `auto-downgrade:${partialVerdict.reason}` };
  }
  return { action: 'resume', reason: 'valid-state', state };
}

export function derivePartialPath(statePath) {
  const raw = String(statePath);
  return raw.endsWith('.resume.json') ? raw.replace(/\.resume\.json$/, '.partial.json') : `${raw}.partial.json`;
}

export function verifyResumePartialStore({ state, partialStore, isValidRecord = defaultIsValidPartialRecord, validKeys = null }) {
  if (partialStore == null) return { ok: false, reason: 'partial-missing-store', missingKeys: [] };
  if (!partialStore || typeof partialStore !== 'object' || Array.isArray(partialStore)) {
    return { ok: false, reason: 'partial-invalid', missingKeys: [] };
  }
  const completedKeys = [...new Set((state?.completedKeys || []).map((key) => String(key)))];
  if (validKeys != null) {
    const validKeySet = new Set([...validKeys].map((key) => String(key)));
    const extraKeys = completedKeys.filter((key) => !validKeySet.has(key));
    if (extraKeys.length > 0) {
      return { ok: false, reason: 'completed-key-out-of-scope', missingKeys: [], extraKeys };
    }
  }
  const missingKeys = completedKeys.filter((key) => !Object.prototype.hasOwnProperty.call(partialStore, key));
  if (missingKeys.length > 0) {
    return { ok: false, reason: 'partial-missing-completed-key', missingKeys };
  }
  for (const key of completedKeys) {
    const record = partialStore[key];
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return { ok: false, reason: 'partial-invalid-record', missingKeys: [] };
    }
    if (String(record.gameId ?? '') !== key) {
      return { ok: false, reason: 'partial-key-mismatch', missingKeys: [] };
    }
    if (!isValidRecord(record, key)) {
      return { ok: false, reason: 'partial-invalid-record', missingKeys: [] };
    }
  }
  return { ok: true, reason: 'valid', missingKeys: [] };
}

export function makeSkipChecker(state, partialStore = {}, isValidRecord = defaultIsValidPartialRecord) {
  const done = new Set((state?.completedKeys || []).map((k) => String(k)));
  const hasValidPartial = (key) => {
    const strKey = String(key);
    const record = partialStore[strKey];
    return Boolean(record && typeof record === 'object' && !Array.isArray(record) && String(record.gameId ?? '') === strKey && isValidRecord(record, strKey));
  };
  return (key) => done.has(String(key)) && hasValidPartial(key);
}

function defaultIsValidPartialRecord(record) {
  return Boolean(record && typeof record === 'object' && !Array.isArray(record));
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
  const completed = new Set((state?.completedKeys || []).map((key) => String(key))).size;
  return {
    resume: {
      mode: state?.resumeMode || 'none',
      completed: totalKeys == null ? completed : Math.min(completed, totalKeys),
      total: totalKeys ?? null,
      inputFingerprint: state?.inputFingerprint || null,
    },
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test scripts/data/lib/crawler-resume-state.test.mjs`
Expected: PASS（9 tests）

- [ ] **Step 5: 提交**

```bash
git add scripts/data/lib/crawler-resume-state.mjs scripts/data/lib/crawler-resume-state.test.mjs
git status --short
git diff --cached --stat
git commit -m "feat(crawler-resume): 通用续传状态库(fingerprint/verify/skip/markCompleted)"
```

---

## Task 2: town_npc 结果改逐条增量落盘（partial store）

**目标**：把 `crawlRecords` 的"内存攒 records、结尾一次写"改成"每抓一条→立刻写 partial store→再 markCompleted→再回调"，同时接入 resume 决策。此步必须证明两种 R1 关键路径：正常崩溃后 state/partial 都已写；以及崩溃夹在 partial 与 markCompleted 之间时，该条会被重抓、不被误 skip。

测试崩溃注入必须同时设置 `TERRAPEDIA_TOWN_NPC_ENABLE_CRASH_HOOK=1` 和 `TERRAPEDIA_TOWN_NPC_CRASH_AFTER=N`，避免真实 crawler 继承测试变量后异常退出。`TERRAPEDIA_TOWN_NPC_CRASH_AFTER=N` 的计数口径是“本次进程中新抓取完成/尝试写 partial 的第 N 条”，不包含已 skip 的历史完成项，也不按全局 seed 序号计数。

**Files:**
- Modify: `scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs`
- Test: `scripts/data/fetch/fetch-wiki-town-npc-maintenance-resume.test.mjs`（新建，本步先加 3 个用例）

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
import { derivePartialPath } from '../lib/crawler-resume-state.mjs';

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
    env: {
      ...process.env,
      WORKTREE_ROOT: ctx.worktreeRoot,
      TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML: ctx.mockHtmlPath,
      TERRAPEDIA_TOWN_NPC_ENABLE_CRASH_HOOK: '',
      TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '',
      TERRAPEDIA_TOWN_NPC_CRASH_POINT: '',
      ...(extraEnv.TERRAPEDIA_TOWN_NPC_CRASH_AFTER != null ? { TERRAPEDIA_TOWN_NPC_ENABLE_CRASH_HOOK: '1' } : {}),
      ...extraEnv,
    },
  });
}

test('崩溃后：已抓项写入 partial store、resume state 已标记，无 .tmp 残留', () => {
  const ctx = setup([1, 2, 3]);
  const res = run(ctx, [], { TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '2' });
  assert.notEqual(res.status, 0, '崩溃注入应非零退出');
  const partial = JSON.parse(fs.readFileSync(derivePartialPath(ctx.statePath), 'utf8'));
  assert.deepEqual(Object.keys(partial).map(Number).sort((a, b) => a - b), [1, 2]);
  const state = JSON.parse(fs.readFileSync(ctx.statePath, 'utf8'));
  assert.deepEqual(state.completedKeys.map(Number).sort((a, b) => a - b), [1, 2]);
  assert.equal(fs.readdirSync(path.dirname(ctx.statePath)).some((n) => n.endsWith('.tmp')), false);
  const progress = JSON.parse(fs.readFileSync(ctx.progressPath, 'utf8'));
  assert.equal(progress.status, 'failed');
  assert.equal(progress.resume.mode, 'keyed_items');
  assert.equal(progress.current, 2);
  assert.equal(progress.total, 3);
});

test('崩溃夹在 partial 与 markCompleted 之间：该条不被 skip，resume 后最终完整', () => {
  const ctx = setup([1, 2, 3]);
  const crash = run(ctx, [], {
    TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '2',
    TERRAPEDIA_TOWN_NPC_CRASH_POINT: 'after-partial-before-mark',
  });
  assert.notEqual(crash.status, 0, '崩溃注入应非零退出');

  const partial = JSON.parse(fs.readFileSync(derivePartialPath(ctx.statePath), 'utf8'));
  assert.deepEqual(Object.keys(partial).map(Number).sort((a, b) => a - b), [1, 2]);
  const state = JSON.parse(fs.readFileSync(ctx.statePath, 'utf8'));
  assert.deepEqual(state.completedKeys.map(Number).sort((a, b) => a - b), [1]);
  const progress = JSON.parse(fs.readFileSync(ctx.progressPath, 'utf8'));
  assert.equal(progress.status, 'failed');
  assert.equal(progress.resume.mode, 'keyed_items');
  assert.equal(progress.current, 1);
  assert.equal(progress.total, 3);

  const resumed = run(ctx, ['--resume-mode=resume']);
  assert.equal(resumed.status, 0, resumed.stderr || resumed.stdout);
  const summary = JSON.parse(resumed.stdout);
  assert.equal(summary.skippedCount, 1, '只应跳过 state 与 partial 都安全的第 1 条');
  assert.equal(summary.fetchedCount, 2, '第 2 条 partial 已写但未 markCompleted，必须重抓');
  const output = JSON.parse(fs.readFileSync(ctx.outputPath, 'utf8'));
  assert.deepEqual(output.records.map((row) => row.gameId).sort((a, b) => a - b), [1, 2, 3]);
});

test('resume：state 存在但 partial store 缺失时拒绝，auto 降级 fresh', () => {
  const ctx = setup([1, 2, 3]);
  const crash = run(ctx, [], { TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '2' });
  assert.notEqual(crash.status, 0, '崩溃注入应非零退出');
  fs.rmSync(derivePartialPath(ctx.statePath), { force: true });

  const refused = run(ctx, ['--resume-mode=resume']);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /resume 校验失败\(partial-missing-store\)/);

  const auto = run(ctx, ['--resume-mode=auto']);
  assert.equal(auto.status, 0, auto.stderr || auto.stdout);
  const summary = JSON.parse(auto.stdout);
  assert.equal(summary.skippedCount, 0);
  assert.equal(summary.fetchedCount, 3);
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
  derivePartialPath,
  loadResumeState,
  resolveResumeDecision,
  makeSkipChecker,
  markCompleted,
  buildResumeProgressFields,
} from '../lib/crawler-resume-state.mjs';
```

把 `const CLI_OPTIONS = [...]`（当前第 20 行）改为（该常量只用于 usage/静态契约测试展示；现有 `parseCliArgs` 不用它做白名单，所以真正的 CLI 行为必须由 spawn 测试证明）：

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

把 `async function crawlRecords({ client, seeds, delayMs, progressCallback })` 整个函数替换为下面版本（新增 `resume` 参数：`{ state, statePath, partialPath, partialStore, shouldSkip, crashAfter, crashPoint }`；逐条落盘后再 markCompleted，并支持两个确定性崩溃点）。Phase 1 的 crash hook 必须通过 `throw` 进入 `catch`，从而写出 `failed` final progress；真实 SIGKILL/OS kill/stale 检测属于 Phase 2 监控接线，不放进本 PoC 必过协议：

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
    const attempted = scraped + 1;
    if (resume.crashPoint === 'after-partial-before-mark' && resume.crashAfter != null && attempted >= resume.crashAfter) {
      crashForTest('test crash after partial before markCompleted');
    }
    markCompleted({ statePath: resume.statePath, state: resume.state, key });
    scraped += 1;
    progressCallback?.(resume.state.completedKeys.length, seeds.length, seed);
    if ((resume.crashPoint == null || resume.crashPoint === 'after-mark') && resume.crashAfter != null && scraped >= resume.crashAfter) {
      crashForTest('test crash after markCompleted');
    }
  }
  const missingOutputKeys = seeds
    .map((seed) => String(seed.gameId))
    .filter((key) => !Object.prototype.hasOwnProperty.call(partialStore, key));
  if (missingOutputKeys.length > 0) {
    throw new Error(`partial store missing fetched records: ${missingOutputKeys.join(', ')}`);
  }
  const records = seeds.map((seed) => partialStore[String(seed.gameId)]);
  return { records, scraped, skipped };
}

function crashForTest(message) {
  throw new Error(message);
}
```

- [ ] **Step 4: 改 `main()`——组织 resume 决策并调用新 crawlRecords**

在 `main()` 里，`const startedAt = ...` 后、`try {` 前新增一个外层变量，让 catch 也能写出最近一次 resume 字段：

```js
  let lastResumeProgressFields = {};
  let lastProgressCurrent = 0;
  let lastProgressTotal = 0;
```

然后把从 `const progressPath = ...` 到 `const records = await crawlRecords({...})` 之间的逻辑替换为下面版本（保留 outputPath/snapshotPath/sourcePath 等已有解析行不变，只替换 seeds 之后的部分）：

```js
    let seeds = loadTownNpcSeeds(sourcePath);
    const limit = toNullableInteger(args.limit);
    if (limit != null) {
      seeds = seeds.slice(0, Math.max(0, limit));
    }

    // ── resume 决策 ──
    const resumeMode = String(args['resume-mode'] ?? 'fresh');
    const statePath = path.resolve(String(args['resume-state'] ?? path.join(worktreeRoot(), 'data', 'generated', 'resume', `${ACTION_ID}.resume.json`)));
    const partialPath = derivePartialPath(statePath);
    const inputFingerprint = computeInputFingerprint(seeds);
    const priorState = loadResumeState(statePath);
    const priorPartialStore = fs.existsSync(partialPath) ? loadJsonObject(partialPath) : null;
    lastResumeProgressFields = buildResumeProgressFields(
      priorState ?? createResumeState({ actionId: ACTION_ID, resumeMode: RESUME_MODE_VALUE, inputFingerprint }),
      seeds.length
    );
    lastProgressCurrent = priorState?.completedKeys?.length || 0;
    lastProgressTotal = seeds.length;
    const decision = resolveResumeDecision({
      mode: resumeMode,
      state: priorState,
      actionId: ACTION_ID,
      resumeMode: RESUME_MODE_VALUE,
      inputFingerprint,
      partialStore: priorPartialStore,
      isValidRecord: isCompleteTownNpcPartialRecord,
      validKeys: seeds.map((seed) => seed.gameId),
    });
    if (decision.action === 'fail') {
      throw new Error(`resume 校验失败(${decision.reason})：请用 --resume-mode=fresh 重跑，或确认输入未变`);
    }
    const resuming = decision.action === 'resume';
    const state = resuming ? priorState : createResumeState({ actionId: ACTION_ID, resumeMode: RESUME_MODE_VALUE, inputFingerprint });
    const partialStore = resuming ? priorPartialStore : {};
    if (!resuming) {
      // fresh：清掉旧 state/partial，从零开始，避免旧 state + 新 partial 混合影响排障和后续 resume。
      fs.rmSync(statePath, { force: true });
      fs.rmSync(partialPath, { force: true });
    }
    const shouldSkip = makeSkipChecker(state, partialStore, isCompleteTownNpcPartialRecord);
    const crashHookEnabled = process.env.TERRAPEDIA_TOWN_NPC_ENABLE_CRASH_HOOK === '1';
    const crashAfter = crashHookEnabled ? toNullableInteger(process.env.TERRAPEDIA_TOWN_NPC_CRASH_AFTER) : null;
    const crashPoint = normalizeText(process.env.TERRAPEDIA_TOWN_NPC_CRASH_POINT) || 'after-mark';
    lastResumeProgressFields = buildResumeProgressFields(state, seeds.length);

    lastProgressCurrent = state.completedKeys.length;
    lastProgressTotal = seeds.length;
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
      ...lastResumeProgressFields,
    }), canonicalProgressPath);

    const client = buildClient();
    const { records, scraped, skipped } = await crawlRecords({
      client,
      seeds,
      delayMs: Math.max(0, Number(args['delay-ms'] ?? 1600) || 0),
      resume: { state, statePath, partialPath, partialStore, shouldSkip, crashAfter, crashPoint },
      progressCallback: (current, total, seed) => {
        lastProgressCurrent = current;
        lastProgressTotal = total;
        lastResumeProgressFields = buildResumeProgressFields(state, seeds.length);
        writeProgress(progressPath, buildProgressPayload({
          status: 'running',
          phase: 'fetch',
          message: `fetching town NPC page ${seed.pageTitle}`,
          current,
          total,
          outputPath,
          reportPath: snapshotPath,
          startedAt,
          nextStep: 'continue town NPC wiki page fetch',
          ...lastResumeProgressFields,
        }), canonicalProgressPath);
      },
    });
```

在 `parseJsonObject(...)` 附近新增脚本本地 helper（不要用它替换现有 wiki rawJson 解析逻辑）：

```js
function loadJsonObject(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isCompleteTownNpcPartialRecord(record, key) {
  return Boolean(
    record
      && typeof record === 'object'
      && !Array.isArray(record)
      && String(record.gameId ?? '') === String(key)
      && typeof record.internalName === 'string'
      && typeof record.pageTitle === 'string'
      && typeof record.pageUrl === 'string'
      && typeof record.fetchedAt === 'string'
      && Array.isArray(record.shopItems)
      && typeof record.shopItemCount === 'number'
      && Array.isArray(record.livingPreferences)
      && Array.isArray(record.moveInConditions)
      && Object.prototype.hasOwnProperty.call(record, 'suggestedGamePeriodId')
      && Object.prototype.hasOwnProperty.call(record, 'suggestedGamePeriodReason')
  );
}
```

然后把 `const payload = {...}` 里的 `totalTownNpcs: seeds.length,` 保持不变；把结尾 `process.stdout.write(...)` 里的汇总对象保持 `scrapedCount: payload.summary.scrapedCount,` 的旧语义（成功记录数），并新增 `fetchedCount: scraped,`（本次新处理数量）和 `skippedCount: skipped,`。

最后把 completed/failed 两处 `writeProgress(...buildProgressPayload(...))` 也加上 resume 字段，否则最后一次 progress 会覆盖 running 阶段的 `resume` 子对象。completed 用最新 state 重新计算；failed 用外层 `lastResumeProgressFields`：

```js
    writeProgress(progressPath, buildProgressPayload({
      status: 'completed',
      phase: 'write',
      message: 'finished town NPC maintenance fetch',
      current: seeds.length,
      total: seeds.length,
      outputPath,
      reportPath: snapshotPath,
      startedAt,
      ...buildResumeProgressFields(state, seeds.length),
    }), canonicalProgressPath);
```

```js
    writeProgress(progressPath, buildProgressPayload({
      status: 'failed',
      phase: 'error',
      message: `town NPC maintenance fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      current: lastProgressCurrent,
      total: lastProgressTotal,
      outputPath,
      reportPath: snapshotPath,
      startedAt,
      nextStep: 'inspect error and rerun the town NPC maintenance fetch',
      ...lastResumeProgressFields,
    }), canonicalProgressPath);
```

> 注：`ACTION_ID` 常量脚本里已存在（进度契约测试断言过 `ACTION_ID = 'domain-source-town-npc-maintenance'`）。若实际是别的名字，用文件里现有的那个常量。

- [ ] **Step 5: 运行 Task2 测试确认通过**

Run: `node --test scripts/data/fetch/fetch-wiki-town-npc-maintenance-resume.test.mjs`
Expected: PASS（"崩溃后 partial 已含已抓项"、"partial 已写但未 markCompleted 会重抓"、"state 存在但 partial 缺失时 resume 拒绝/auto fresh" 三个用例通过）

- [ ] **Step 6: 跑既有进度契约测试，确认没回归**

Run: `node --test scripts/data/fetch/fetch-wiki-town-npc-maintenance-progress.test.mjs`
Expected: PASS（默认 `--resume-mode=fresh`，普通运行不会静默复用旧 partial，完成态不变）

- [ ] **Step 7: 提交**

```bash
git add scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs scripts/data/fetch/fetch-wiki-town-npc-maintenance-resume.test.mjs
git status --short
git diff --cached --stat
git commit -m "feat(crawler-resume): town_npc 结果逐条落盘 + 接入 resume 决策/skip/fingerprint"
```

---

## Task 3: 端到端行为——resume 只抓剩余 / fresh 忽略旧 state / fingerprint 拒绝

**Files:**
- Modify: `scripts/data/fetch/fetch-wiki-town-npc-maintenance-resume.test.mjs`（追加 11 个用例；总计 14 个 spawn 行为用例）

- [ ] **Step 1: 追加端到端行为测试**

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
  assert.equal(summary.fetchedCount, 1, '只抓剩余 1 条');
  assert.equal(summary.scrapedCount, 3, 'scrapedCount 保持成功记录总数旧语义');

  const output = JSON.parse(fs.readFileSync(ctx.outputPath, 'utf8'));
  assert.equal(output.totalTownNpcs, 3);
  assert.deepEqual(output.records.map((r) => r.gameId).sort((a, b) => a - b), [1, 2, 3]);
  const progress = JSON.parse(fs.readFileSync(ctx.progressPath, 'utf8'));
  assert.equal(progress.status, 'completed');
  assert.equal(progress.resume.mode, 'keyed_items');
  assert.equal(progress.resume.completed, 3);
  assert.equal(progress.resume.total, 3);
  assert.equal(progress.current, 3);
  assert.equal(progress.total, 3);
  for (const row of output.records) {
    assert.equal(typeof row.internalName, 'string');
    assert.equal(typeof row.pageUrl, 'string');
    assert.equal(Array.isArray(row.shopItems), true);
    assert.equal(Array.isArray(row.livingPreferences), true);
  }
});

test('resume：state/partial 已全量完成但最终 output 未写出时，只组装输出不重抓', () => {
  const ctx = setup([1, 2, 3]);
  const crash = run(ctx, [], { TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '3' });
  assert.notEqual(crash.status, 0);
  const state = JSON.parse(fs.readFileSync(ctx.statePath, 'utf8'));
  assert.deepEqual(state.completedKeys.map(Number).sort((a, b) => a - b), [1, 2, 3]);

  const res = run(ctx, ['--resume-mode=resume']);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  const summary = JSON.parse(res.stdout);
  assert.equal(summary.skippedCount, 3);
  assert.equal(summary.fetchedCount, 0);
  assert.equal(summary.scrapedCount, 3);
  const output = JSON.parse(fs.readFileSync(ctx.outputPath, 'utf8'));
  assert.deepEqual(output.records.map((row) => row.gameId).sort((a, b) => a - b), [1, 2, 3]);
});

test('fresh：即便有旧 state 也从头抓、重置 partial', () => {
  const ctx = setup([1, 2, 3]);
  run(ctx, [], { TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '2' });
  const res = run(ctx, ['--resume-mode=fresh']);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  const summary = JSON.parse(res.stdout);
  assert.equal(summary.skippedCount, 0);
  assert.equal(summary.fetchedCount, 3);
  assert.equal(summary.scrapedCount, 3);
});

test('resume：partial store 中 completed key 的记录不完整或 gameId 错配时拒绝', () => {
  const ctx = setup([1, 2, 3]);
  const crash = run(ctx, [], { TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '2' });
  assert.notEqual(crash.status, 0);
  const partialPath = derivePartialPath(ctx.statePath);
  const partial = JSON.parse(fs.readFileSync(partialPath, 'utf8'));
  const validPartial = { ...partial };
  partial[2] = { gameId: 2 };
  fs.writeFileSync(partialPath, JSON.stringify(partial), 'utf8');

  const incomplete = run(ctx, ['--resume-mode=resume']);
  assert.notEqual(incomplete.status, 0);
  assert.match(incomplete.stderr, /resume 校验失败\(partial-invalid-record\)/);

  validPartial[2] = { ...validPartial[2], gameId: 999 };
  fs.writeFileSync(partialPath, JSON.stringify(validPartial), 'utf8');
  const mismatch = run(ctx, ['--resume-mode=resume']);
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /resume 校验失败\(partial-key-mismatch\)/);
});

test('resume：忽略 partial store 中不属于当前 seeds 的历史脏记录', () => {
  const ctx = setup([1, 2, 3]);
  const crash = run(ctx, [], { TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '2' });
  assert.notEqual(crash.status, 0);
  const partialPath = derivePartialPath(ctx.statePath);
  const partial = JSON.parse(fs.readFileSync(partialPath, 'utf8'));
  partial[999] = { gameId: 999, internalName: 'StaleNpc', shopItems: [], livingPreferences: [] };
  fs.writeFileSync(partialPath, JSON.stringify(partial), 'utf8');

  const res = run(ctx, ['--resume-mode=resume']);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  const output = JSON.parse(fs.readFileSync(ctx.outputPath, 'utf8'));
  assert.deepEqual(output.records.map((row) => row.gameId).sort((a, b) => a - b), [1, 2, 3]);
});

test('无效 resume-mode：非零退出并写 failed progress.resume', () => {
  const ctx = setup([1, 2, 3]);
  const res = run(ctx, ['--resume-mode=bogus']);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /resume 校验失败\(invalid-mode\)/);
  const progress = JSON.parse(fs.readFileSync(ctx.progressPath, 'utf8'));
  assert.equal(progress.status, 'failed');
  assert.equal(progress.resume.mode, 'keyed_items');
  assert.equal(progress.current, 0);
  assert.equal(progress.total, 3);
});

test('默认 resume-state 路径跟随 WORKTREE_ROOT，不写入真实仓库 data/generated/resume', () => {
  const ctx = setup([1]);
  const res = spawnSync(process.execPath, [
    scriptPath,
    `--source=${ctx.sourcePath}`,
    `--output=${ctx.outputPath}`,
    `--snapshot-output=${ctx.snapshotPath}`,
    `--progress-path=${ctx.progressPath}`,
    '--delay-ms=0',
  ], { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, WORKTREE_ROOT: ctx.worktreeRoot, TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML: ctx.mockHtmlPath } });
  assert.equal(res.status, 0, res.stderr || res.stdout);
  const defaultStatePath = path.join(ctx.worktreeRoot, 'data', 'generated', 'resume', 'domain-source-town-npc-maintenance.resume.json');
  const defaultPartialPath = path.join(ctx.worktreeRoot, 'data', 'generated', 'resume', 'domain-source-town-npc-maintenance.partial.json');
  assert.equal(fs.existsSync(defaultStatePath), true);
  assert.equal(fs.existsSync(defaultPartialPath), true);
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

test('resume 模式遇同一 gameId 的 seed 描述变化：拒绝并非零退出', () => {
  const ctx = setup([1, 2, 3]);
  run(ctx, [], { TERRAPEDIA_TOWN_NPC_CRASH_AFTER: '2' });
  const changed = setup([1, 2, 3]);
  const payload = JSON.parse(fs.readFileSync(changed.sourcePath, 'utf8'));
  payload.records[3].rawJson = JSON.stringify({ name: 'Npc3Renamed', extras: { townNPC: true } });
  fs.writeFileSync(changed.sourcePath, JSON.stringify(payload), 'utf8');

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
  assert.equal(summary.fetchedCount, 4);
  assert.equal(summary.scrapedCount, 4);
  assert.equal(summary.skippedCount, 0);
});
```

- [ ] **Step 2: 运行确认（先失败或直接通过）**

Run: `node --test scripts/data/fetch/fetch-wiki-town-npc-maintenance-resume.test.mjs`
Expected: 若 Task 2 实现正确，这 11 个新用例应 PASS。若有 FAIL，按报错修 `main()`/`crawlRecords`（常见点：fresh 未清 state/partial、fingerprint 用了 limit 前的 seeds、skip 计数口径、completed/failed progress 漏掉 `resume` 字段或主 `current/total`、partial 脏 key 进入 output、partial 记录不完整或 gameId 错配未拒绝、state completedKeys 含当前 seed 外键未拒绝、默认 state path 未跟随 `WORKTREE_ROOT`、普通默认运行误用了 auto resume、crash hook 未加显式测试开关）。

- [ ] **Step 3: 全量脚本测试回归**

Run: `node --test scripts/data/fetch/*.test.mjs scripts/data/lib/crawler-resume-state.test.mjs`
Expected: PASS（无回归）

- [ ] **Step 4: 提交**

```bash
git add scripts/data/fetch/fetch-wiki-town-npc-maintenance-resume.test.mjs
git status --short
git diff --cached --stat
git commit -m "test(crawler-resume): town_npc 端到端续传/fresh/fingerprint 行为覆盖"
```

---

## Task 4: 域规则标注 resume 能力（默认跳过；post-PoC/Phase 2 预备 metadata）

**执行门:** Phase 1 脚本层 PoC 默认到 Task 3 即闭环；Task 4 不属于 Phase 1 必做项。只有用户在执行时明确说“执行 Task 4/JS metadata”时才做本任务，否则把它整体移入 Phase 2。

**目标**：让 town_npc 的 JS 域规则带上 resume 元信息，供后续 Phase 2 后端/前端消费。本步只加 JS metadata 字段 + 测试，不动 Java、不动 DTO、不动派发、不承诺监控页已可点击"接着爬"。它不会证明 Java `CrawlerMonitorServiceImpl`、overview DTO、dispatch 或前端 runtime 已支持 resume；这些都在附录 Phase 2 另出计划。

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

并把 `function rule(...)` 签名末尾加一个可选参数 `resumeOptions = {}`，只白名单接收 resume 字段，避免未来误传对象覆盖 `command/progressPath/actionId` 等核心字段：

```js
function rule(domain, label, sourceKey, locator, recommendedActionId, progressPath, command, resumeOptions = {}) {
  const {
    resumeSupported = false,
    resumeMode = 'none',
    resumeStatePath = null,
    restartBehavior = 'fresh',
  } = resumeOptions;
  return {
    // ...原有字段不变...
    pauseReason: null,
    resumeSupported,
    resumeMode,
    resumeStatePath,
    restartBehavior,
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
git status --short
git diff --cached --stat
git commit -m "feat(crawler-resume): town_npc 域规则声明 keyed_items 续传能力(JS 侧)"
```

---

## PoC 验收（必做，离线）

在 repo root 用 mock 和确定性 crash hook 真跑一遍（不联网、不靠人工中断时机）：

```bash
mkdir -p /tmp/poc && cp -f data/generated/npc-standardized-map.json /tmp/poc/seeds.json
cat > /tmp/poc/npc.html <<'HTML'
<!doctype html><html><head><script>var wgArticleId=1;var wgRevisionId=1;</script><title>NPC</title></head><body><div class="mw-parser-output"><p>intro</p></div></body></html>
HTML
set +e
TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML=/tmp/poc/npc.html \
TERRAPEDIA_TOWN_NPC_ENABLE_CRASH_HOOK=1 \
TERRAPEDIA_TOWN_NPC_CRASH_AFTER=2 \
node scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs \
  --source=/tmp/poc/seeds.json --limit=5 --delay-ms=0 \
  --resume-state=/tmp/poc/state.resume.json \
  --output=/tmp/poc/out.json --snapshot-output=/tmp/poc/snap.json --progress-path=/tmp/poc/progress.json
test "$?" -ne 0
set -e
TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML=/tmp/poc/npc.html \
node scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs \
  --source=/tmp/poc/seeds.json --limit=5 --delay-ms=0 --resume-mode=resume \
  --resume-state=/tmp/poc/state.resume.json \
  --output=/tmp/poc/out.json --snapshot-output=/tmp/poc/snap.json --progress-path=/tmp/poc/progress.json
TERRAPEDIA_TOWN_NPC_MAINTENANCE_MOCK_HTML=/tmp/poc/npc.html \
node scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs \
  --source=/tmp/poc/seeds.json --limit=5 --delay-ms=0 --resume-mode=fresh \
  --resume-state=/tmp/poc/state.resume.json \
  --output=/tmp/poc/out-fresh.json --snapshot-output=/tmp/poc/snap-fresh.json --progress-path=/tmp/poc/progress-fresh.json
```

Expected: 第一次非零退出且 `/tmp/poc/state.resume.json`、`/tmp/poc/state.partial.json` 已存在；第二次 `--resume-mode=resume` 成功并只抓剩余；第三次 `--resume-mode=fresh` 成功并全量重来。

最终必跑命令：

```bash
node --test scripts/data/lib/crawler-resume-state.test.mjs
node --test scripts/data/fetch/fetch-wiki-town-npc-maintenance-resume.test.mjs
node --test scripts/data/fetch/fetch-wiki-town-npc-maintenance-progress.test.mjs
node --test scripts/data/fetch/*.test.mjs scripts/data/lib/crawler-resume-state.test.mjs
git status --short
git diff --cached --stat
```

Expected: 全部 PASS；`git status --short` 可显示既有 generated/standardized dirty 文件，但它们必须保持 unstaged；`git diff --cached --stat` 不得包含 `data/generated/wiki-bosses.latest.json`、`data/generated/wiki-town-npc-maintenance.latest.json`、`data/standardized/armor_sets.standardized.json`。

如果执行了 Task 4，再额外运行：

```bash
node --test scripts/data/monitor/wiki-monitor-domain-rules.test.mjs
```

---

## 附录：Phase 2（另出计划，本计划不实现）——可操作化接线

PoC 打通脚本层后，让"接着爬"从监控页可点，需要（每项都要单独 TDD）：

1. **Java 域规则同步**：`CrawlerMonitorServiceImpl` 的 `WIKI_MONITOR_RULES` record 加 `resumeSupported/resumeMode/resumeStatePath/restartBehavior`，与 JS 侧保持一致；经 overview DTO 暴露到前端。
2. **DTO 扩展**：`CrawlerMonitorDispatchRequestDTO` 加可选 `mode`(resume|fresh)。
3. **派发注入**：`buildLaunchRequest` 按 `mode` 往命令数组追加 `--resume-mode=<mode> --resume-state=<rule.resumeStatePath>`。
4. **新控制动作**："接着爬"= 死进程(stalled/failed)时：释放 stale 锁 → 带 `mode=resume` 重新 spawn；与现有"继续"(对 paused 活进程发 SIGCONT)区分。
5. **前端**：`crawler-monitor.vue` 加判据 `canContinueCrawl`(域 `resumeSupported && 状态∈{stalled,failed} && resume state 存在`)；`CrawlerTriageBoard`/`DomainDetailDrawer` 死进程时出"接着爬"按钮，走新 `domain-action`。
6. **buffs 接入**：以 `phase_keyed` 复用本库（immunity 阶段 keyed_items），作为第二个域验证协议通用性。
