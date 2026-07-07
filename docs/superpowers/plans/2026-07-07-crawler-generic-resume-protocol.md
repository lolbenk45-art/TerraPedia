# 通用爬虫断点续传协议实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已验证的 Town NPC 断点续传 PoC 收敛成可复用协议，并接入第二条真实高收益 action：`buff-page-immunity-refresh`，让监控页能按统一元数据触发“接着爬 / 重新爬”。

**Architecture:** 续传状态仍以独立 `data/generated/resume/*.resume.json` 为 source of truth，progress 只展示运行态。通用库负责 fingerprint、state 校验、partial store 校验、skip 和 progress resume 字段；每个脚本负责把业务结果先增量写入 partial store，再调用 `markCompleted`。Java monitor 只对 `resumeSupported=true` 的规则注入 `--resume-mode/--resume-state`，前端只读 overview 元数据，不写域名硬编码。

**Tech Stack:** Node.js ESM、`node:test`、Java/Spring service tests with Maven、Nuxt/Vue admin monitor page contract tests、existing `buildActionProgressPayload` / `writeJsonFile` atomic writes.

---

## 目标与边界

本计划关闭的问题是：断点续传目前只在 `town_npc_maintenance` 可用，协议可复用性和监控入口仍不完整；`buff-page-immunity-refresh` 这类慢爬虫仍只能重跑或依赖易变 progress。

**本次做：**

- 泛化 `scripts/data/lib/crawler-resume-state.mjs`，去掉 partial record 必须有 `gameId` 的隐含假设。
- 保持 Town NPC 现有行为和测试不退化。
- 给 `fetch-wiki-buffs.mjs` 的 `buff-page-immunities` 阶段接入 `keyed_items` 续传。
- 在 Java monitor 规则中把 `buffs` 标为 resumable direct rule，并让 dispatch 统一注入 resume 参数。
- 在 JS monitor rule mirror、DTO/overview、前端 domain table 中按 `resumeSupported/resumeStatePath/restartBehavior` 泛化展示和操作。
- 增加 crash -> resume 的离线测试，证明不会跳过未落盘条目，也不会重复抓已完成条目。

**本次不做：**

- 不迁移 backendRefresh 域的 Java 内部爬取循环。
- 不迁移 item-page batch 的 offset resume。
- 不迁移 audio assets manifest resume。
- 不给 domain smoke lane 做续传。
- 不跑真实 wiki 网络抓取、不写真实数据库、不提交 `data/generated/**` 运行产物。

## 文件结构

| 文件 | 责任 |
| --- | --- |
| `scripts/data/lib/crawler-resume-state.mjs` | 通用续传状态库，支持自定义 record key 和 fingerprint normalizer |
| `scripts/data/lib/crawler-resume-state.test.mjs` | 续传库兼容 Town NPC 与 Buff key 的单元测试 |
| `scripts/data/fetch/fetch-wiki-buffs.mjs` | 为 buff page immunity 阶段接入 `--resume-mode/--resume-state`、partial store、crash hooks |
| `scripts/data/fetch/fetch-wiki-buffs-resume.test.mjs` | Buff crash/resume/fresh/changed-input 离线行为测试 |
| `scripts/data/fetch/fetch-wiki-town-npc-maintenance-resume.test.mjs` | 回归 Town NPC 既有续传语义 |
| `scripts/data/monitor/wiki-monitor-domain-rules.mjs` | JS mirror 增加 resume 元数据，避免与 Java overview 语义分裂 |
| `scripts/data/monitor/wiki-monitor-domain-rules.test.mjs` | JS rule resume metadata contract |
| `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java` | 将 `buffs` 注册为 resumable direct rule，保持统一 resume 参数注入 |
| `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java` | Java dispatch/overview/queue resume 元数据测试 |
| `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java` | API body 只信任 `resumeMode`，`resumeStatePath` 由 rule 注入 |
| `data-query-app/pages/operations/crawler-monitor.vue` | 删除 POST body 里的 `resumeStatePath` 字段，改为委托 `buildResumeDispatchPayload`（guard 判断本身已是 capability-based，不需要改） |
| `data-query-app/pages/operations/crawler-monitor.control.mjs` | 新增 `buildResumeDispatchPayload`，抽出 continue-crawl 的 guard + payload 构造，可被直接 import 测试 |
| `data-query-app/pages/operations/crawler-monitor.control.test.mjs` | `buildResumeDispatchPayload` 的 behavior test |
| `data-query-app/utils/crawlerMonitorTriageWorkbench.mjs` | 生成 `continue-crawl` / validation 动作的真实来源（本计划不改代码，只加 Buff 回归测试用例） |
| `data-query-app/tests/crawler-monitor-page-contract.test.mjs` | 只加一行最小 wiring smoke，不再正则提取函数体；真实 payload 行为放到 `crawler-monitor.control.test.mjs` |
| `data-query-app/tests/crawler-monitor-domain-table.test.mjs` | domain row 保留 resume capability metadata |
| `data-query-app/tests/crawler-monitor-triage-workbench.test.mjs` | `continue-crawl` 动作 capability 回归测试 |

## 全局执行规则

1. 每个实现 task 先写失败测试，再改实现。
2. 任一脚本设置 `resumeSupported=true` 前，必须已有测试证明：partial store 写入成功后才 `markCompleted`；crash between partial and mark 不会被 skip；resume 校验失败和脚本异常会写 `status=failed` progress。
3. `resume` 模式遇到 state/fingerprint/partial 不一致必须失败；`auto` 可降级 fresh；`fresh` 必须忽略旧 state 并覆盖为新 state。
4. progress 只能展示 resume 摘要，不能成为 completedKeys 的 source of truth。
5. 测试必须使用临时 `WORKTREE_ROOT` 或 mock write 函数，不能污染真实 `data/generated/**`。
6. `resumeMode` 指外部启动模式：`fresh/resume/auto`；state 内部协议用 `resumeProtocol` 命名或在代码中保持 `RESUME_MODE_VALUE = 'keyed_items'`，不要把两者互传。
7. 每个阶段完成后运行 `git status --short`，确认只有代码/测试/计划文件变更；提交前还必须运行 `git diff --cached --stat`。

## Task 1: 泛化 resume state library

**Files:**
- Modify: `scripts/data/lib/crawler-resume-state.mjs`
- Modify: `scripts/data/lib/crawler-resume-state.test.mjs`

- [ ] **Step 1: 写 Buff key 和 decision 失败测试**

在 `scripts/data/lib/crawler-resume-state.test.mjs` 增加测试，证明 partial store 可以用 Buff parser 真实返回的 `buffId` 而不是 `gameId`，且 `resolveResumeDecision(...)` 会把 `getRecordKey` 透传给 partial 校验：

```js
test('partial consistency supports custom record keys for buff records', () => {
  const fp = computeInputFingerprint([
    { id: 21, internalName: 'Poisoned', pageTitle: 'Poisoned' },
    { id: 22, internalName: 'OnFire', pageTitle: 'On Fire!' },
  ], {
    normalizeEntry: (entry) => ({
      id: String(entry.id ?? ''),
      internalName: String(entry.internalName ?? ''),
      pageTitle: String(entry.pageTitle ?? ''),
    }),
  });
  const state = createResumeState({
    actionId: 'buff-page-immunity-refresh',
    resumeMode: 'keyed_items',
    inputFingerprint: fp,
    metadata: { phase: 'buff-page-immunities' },
  });
  state.completedKeys.push(21);
  const partialStore = {
    21: { buffId: 21, sourceEvidence: { parseStatus: 'parsed' } },
  };
  const verdict = verifyResumePartialStore({
    state,
    partialStore,
    validKeys: [21, 22],
    getRecordKey: (record) => record.buffId,
    isValidRecord: (record) => record?.sourceEvidence?.parseStatus === 'parsed',
  });
  assert.equal(verdict.ok, true);
  assert.equal(resolveResumeDecision({
    mode: 'resume',
    state,
    actionId: 'buff-page-immunity-refresh',
    resumeMode: 'keyed_items',
    inputFingerprint: fp,
    partialStore,
    validKeys: [21, 22],
    getRecordKey: (record) => record.buffId,
    isValidRecord: (record) => record?.sourceEvidence?.parseStatus === 'parsed',
  }).action, 'resume');
  const shouldSkip = makeSkipChecker(state, partialStore, {
    getRecordKey: (record) => record.buffId,
    isValidRecord: (record) => record?.sourceEvidence?.parseStatus === 'parsed',
  });
  assert.equal(shouldSkip(21), true);
  assert.equal(shouldSkip(22), false);
});
```

- [ ] **Step 2: 确认测试失败**

Run:

```bash
node --test scripts/data/lib/crawler-resume-state.test.mjs
```

Expected: FAIL，原因是 `computeInputFingerprint` 不支持 options，`verifyResumePartialStore` 仍强制读取 `record.gameId`，或 `resolveResumeDecision` 没有转发 `getRecordKey`。

- [ ] **Step 3: 实现通用 key/fingerprint**

修改 `crawler-resume-state.mjs`：

```js
export function computeInputFingerprint(entries, options = {}) {
  const normalizeEntry = typeof options.normalizeEntry === 'function'
    ? options.normalizeEntry
    : normalizeFingerprintEntry;
  const normalized = [...entries].map((entry) => {
    const normalizedEntry = normalizeEntry(entry);
    return typeof normalizedEntry === 'string' ? normalizedEntry : JSON.stringify(normalizedEntry);
  }).sort();
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function createResumeState({ actionId, resumeMode, inputFingerprint, metadata = {} }) {
  return {
    schemaVersion: 1,
    actionId,
    resumeMode,
    inputFingerprint,
    metadata,
    completedKeys: [],
    updatedAt: new Date().toISOString(),
  };
}

function recordKeyFor(record, fallbackKey, getRecordKey) {
  if (typeof getRecordKey === 'function') return String(getRecordKey(record));
  return String(record?.gameId ?? fallbackKey ?? '');
}
```

这三个函数目前的真实实现（已读取当前 `crawler-resume-state.mjs` 确认）分别在 `verifyResumePartialStore` 的 key 校验行、`resolveResumeDecision` 转发给 `verifyResumePartialStore` 的调用、`makeSkipChecker` 的 key 校验行硬编码 `record.gameId`。改法是最小 diff，只动这三处：

```js
export function verifyResumePartialStore({
  state,
  partialStore,
  isValidRecord = defaultIsValidPartialRecord,
  validKeys = null,
  getRecordKey, // 新增
}) {
  // ...前面的 partialStore/completedKeys/validKeys 校验逻辑不变...
  for (const key of completedKeys) {
    const record = partialStore[key];
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return { ok: false, reason: 'partial-invalid-record', missingKeys: [] };
    }
    if (recordKeyFor(record, key, getRecordKey) !== key) { // 原为 String(record.gameId ?? '') !== key
      return { ok: false, reason: 'partial-key-mismatch', missingKeys: [] };
    }
    if (!isValidRecord(record, key)) {
      return { ok: false, reason: 'partial-invalid-record', missingKeys: [] };
    }
  }
  return { ok: true, reason: 'valid', missingKeys: [] };
}

export function resolveResumeDecision({
  mode, state, actionId, resumeMode, inputFingerprint, partialStore, isValidRecord, validKeys,
  getRecordKey, // 新增
}) {
  // ...mode 校验、verifyResumeState 分支不变...
  const partialVerdict = verifyResumePartialStore({ state, partialStore, isValidRecord, validKeys, getRecordKey }); // 新增 getRecordKey 转发
  // ...其余分支不变...
}

// 旧签名 makeSkipChecker(state, partialStore, isValidRecordFn) 与新签名
// makeSkipChecker(state, partialStore, { getRecordKey, isValidRecord }) 必须都可用：
export function makeSkipChecker(state, partialStore = {}, isValidRecordOrOptions = defaultIsValidPartialRecord) {
  const { getRecordKey, isValidRecord = defaultIsValidPartialRecord } = typeof isValidRecordOrOptions === 'function'
    ? { isValidRecord: isValidRecordOrOptions }
    : (isValidRecordOrOptions ?? {});
  const done = new Set((state?.completedKeys || []).map((key) => String(key)));
  return (key) => {
    const strKey = String(key);
    const record = partialStore?.[strKey];
    return Boolean(
      done.has(strKey)
        && record
        && typeof record === 'object'
        && !Array.isArray(record)
        && recordKeyFor(record, strKey, getRecordKey) === strKey // 原为 String(record.gameId ?? '') === strKey
        && isValidRecord(record, strKey)
    );
  };
}
```

默认 fingerprint normalizer 返回字符串时不得二次 stringify，避免旧 Town NPC resume state 无故失效。

**已知遗留风险（不在本计划内修，仅记录）：** 当前 `normalizeFingerprintEntry` 默认实现只读 `gameId/internalName/pageTitle/nameZh` 四个字段。任何调用方如果忘记传 `normalizeEntry`（比如照抄 Town NPC 现有的零参数调用风格），传入形状不同的 record（比如只有 `id/internalName/pageTitle` 的 Buff-like 记录）会被默认 normalizer 静默退化成只按 `internalName+pageTitle` 计算指纹——两份 `id` 完全不同但 `internalName/pageTitle` 恰好相同的数据集会算出相同指纹，静默判定"输入未变"。Task 2 通过总是显式传入自己的 `normalizeEntry`（见 Step 5）规避了这个坑，但这是本次生成的公共库 API 上一个未加防护的陷阱，留给下一个调用方。本计划只用 characterization test 把这个坑钉成可见行为；后续若继续扩大通用化，再考虑把 `normalizeEntry` 变成必填或加运行时警告。

- [ ] **Step 4: 无条件补旧签名兼容测试**

在 `crawler-resume-state.test.mjs` 增加旧签名回归测试：

```js
test('makeSkipChecker keeps legacy isValidRecord signature', () => {
  const fp = computeInputFingerprint([1]);
  const state = createResumeState({ actionId: ACTION, resumeMode: MODE, inputFingerprint: fp });
  state.completedKeys.push(1);
  const partialStore = { 1: { gameId: 1, payload: 'complete' } };
  const shouldSkip = makeSkipChecker(
    state,
    partialStore,
    (record, key) => String(record.gameId) === String(key) && record.payload === 'complete'
  );
  assert.equal(shouldSkip(1), true);
});

test('default fingerprint normalizer silently collapses non-Town-NPC-shaped entries that only differ by id', () => {
  // characterization test：钉死已知陷阱，不是要修复它。证明"忘记传 normalizeEntry"
  // 对 Buff-like record 是不安全的，任何新调用方都必须像 Task 2 一样显式传 normalizeEntry。
  const fpA = computeInputFingerprint([
    { id: 1, internalName: 'Poisoned', pageTitle: 'Poisoned' },
    { id: 2, internalName: 'OnFire', pageTitle: 'On Fire!' },
  ]);
  const fpB = computeInputFingerprint([
    { id: 99, internalName: 'Poisoned', pageTitle: 'Poisoned' },
    { id: 100, internalName: 'OnFire', pageTitle: 'On Fire!' },
  ]);
  assert.equal(fpA, fpB, 'documents the trap: default normalizer is blind to id, so id-only changes are invisible without a custom normalizeEntry');
});
```

- [ ] **Step 5: 跑库测试**

Run:

```bash
node --test scripts/data/lib/crawler-resume-state.test.mjs
```

Expected: PASS。

## Task 2: 为 `fetch-wiki-buffs.mjs` 接入 keyed resume

**Files:**
- Modify: `scripts/data/fetch/fetch-wiki-buffs.mjs`
- Create: `scripts/data/fetch/fetch-wiki-buffs-resume.test.mjs`
- Test: `scripts/data/fetch/fetch-wiki-buffs.test.mjs`

- [ ] **Step 1: 写函数级 crash-before-mark 行为测试**

创建 `scripts/data/fetch/fetch-wiki-buffs-resume.test.mjs`，优先测试 exported `collectBuffPageImmunityFacts(...)`，用注入的 `fetchPagePayload` / `fetchRenderedHtml` 和临时 state/partial 文件离线模拟。测试必须断言第一轮在 partial 写入后崩溃、state 没有错误标完成，第二轮 `resume` context 会重新处理该 buff 而不是 skip。

核心断言：

```js
await assert.rejects(
  () => runCollectWithResumeContext(ctx, {
    mode: 'fresh',
    crashPoint: 'after-partial-before-mark',
    crashAfter: 1,
  }),
  /intentional buff resume crash/
);
assert.equal(JSON.parse(fs.readFileSync(partialPath, 'utf8'))['1'].buffId, 1);
assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf8')).completedKeys.includes(1), false);

await runCollectWithResumeContext(ctx, { mode: 'resume' });
assert.deepEqual(readJson(statePath).completedKeys.map(String).sort(), ['1', '2']);
assert.equal(fetchLog.filter((entry) => entry.buffId === 1).length, 2);
```

- [ ] **Step 2: 写函数级 crash-after-mark 行为测试**

同一测试文件增加断言：第一轮 crash after mark 后，第二轮只抓剩余 buff；mock fetch counter 不应包含已完成 key。

核心断言：

```js
assert.equal(fetchLog.filter((entry) => entry.buffId === 1).length, 1);
assert.equal(fetchLog.filter((entry) => entry.buffId === 2).length, 1);
assert.deepEqual(readJson(statePath).completedKeys.map(String).sort(), ['1', '2']);
```

- [ ] **Step 3: 写 fresh/changed-input 和 CLI contract 测试**

覆盖：

- `--resume-mode=fresh` 忽略旧 state，重新处理所有 buff。
- `--resume-mode=resume` 遇到 buff id 集合或 page title 变化失败。
- `--resume-mode=auto` 遇到 fingerprint mismatch 降级 fresh。
- `fresh` 和 `auto` 降级 fresh 时必须清空旧 state/partial；旧 partial 中的额外 key 不能混入新运行。
- 单个 buff 页面抓取或解析失败时，该 key 不能 `markCompleted`；如果 enabled seed 最终未全部完成，主脚本必须写 `status: 'failed'` progress（复用既有 failed 语义，不新增状态字面量），`message` 里报告 `${completed}/${total} buffs 完成，其余抓取或解析失败`。这个值不是随便选的：前端 `crawlerMonitorTriageWorkbench.mjs` 的 `CONTINUE_CRAWL_STATUSES = new Set(['failed', 'stalled'])`（已存在，不在本计划改动范围内）只认 `failed`/`stalled` 两种状态显示"接着爬"按钮；如果这里写成别的状态字面量（例如 `partial`），断点续爬在 UI 上就没有入口。断言：`assert.equal(progress.status, 'failed'); assert.match(progress.message, /\d+\/\d+/);`。
- 静态读取 `fetch-wiki-buffs.mjs` 源码，断言存在 `--resume-mode`、`--resume-state`、`DEFAULT_BUFF_RESUME_STATE_PATH`、`derivePartialPath`、`buildResumeProgressFields`。不要在这个测试里 spawn 脚本；当前脚本没有网络 mock CLI，spawn 会触发真实 wiki 请求。

Expected failure before implementation: 源码中没有 `--resume-mode/--resume-state` 处理，函数级 resume context 也不会创建 progress `resume` 字段。

- [ ] **Step 4: 实现 CLI 和默认路径 contract**

在 `fetch-wiki-buffs.mjs` 顶部引入通用库，并新增常量：

```js
import {
  buildResumeProgressFields,
  computeInputFingerprint,
  createResumeState,
  derivePartialPath,
  loadResumeState,
  makeSkipChecker,
  markCompleted,
  resolveResumeDecision,
} from '../lib/crawler-resume-state.mjs';

const ACTION_ID = 'buff-page-immunity-refresh';
const RESUME_MODE_VALUE = 'keyed_items';
const DEFAULT_BUFF_RESUME_STATE_PATH = path.join(repoRoot, 'data', 'generated', 'resume', `${ACTION_ID}.resume.json`);
```

解析：

```js
const requestedResumeMode = String(options['resume-mode'] ?? 'fresh');
const statePath = path.resolve(process.cwd(), options['resume-state'] ?? DEFAULT_BUFF_RESUME_STATE_PATH);
const partialPath = derivePartialPath(statePath);
```

这一步只增加 CLI 解析和默认路径，不新增真实网络 mock。端到端行为用 `collectBuffPageImmunityFacts(...)` 的 dependency injection 测，避免测试访问 wiki。
`repoRoot` 来自 `getProjectRoot()`，必须尊重临时 `WORKTREE_ROOT`；不能用 `sharedDataPath(...)`，否则会把 resume state 写到共享数据根。

- [ ] **Step 5: 在 immunity 阶段创建 resume context**

在 `baseBuffs/localizedByLang` 可用后，计算参与 immunity 抓取的 key 集合：

```js
const immunitySeeds = baseBuffs
  .filter((buff) => Number.isInteger(buff?.id))
  .map((buff) => ({
    id: buff.id,
    internalName: buff.internalName,
    pageTitle: pickBuffPageTitle(buff, localizedByLang),
  }));
const inputFingerprint = computeInputFingerprint(immunitySeeds, {
  normalizeEntry: (entry) => ({
    id: String(entry.id ?? ''),
    internalName: String(entry.internalName ?? ''),
    pageTitle: String(entry.pageTitle ?? ''),
  }),
});
```

读取 state/partial，调用 `resolveResumeDecision`。Buff 校验必须传入 `getRecordKey: record => record.buffId`、`validKeys`、`isValidRecord`。`resume` 失败时抛出明确错误：

```js
throw new Error(`resume 校验失败(${decision.reason})：请用 --resume-mode=fresh 重跑，或确认输入未变`);
```

如果 `decision.action !== 'resume'`，必须与 Town NPC 保持同构：删除旧 `statePath` 和 `partialPath`，创建新 state 和空 partial store。`fresh` 和 `auto-downgrade:*` 都走这条路径。

**"同构"的范围仅限于此处（fresh/auto-downgrade 清理旧 state/partial）**，对照的是 `fetch-wiki-town-npc-maintenance.mjs:107-110` 的 `fs.rmSync(statePath,{force:true})`/`fs.rmSync(partialPath,{force:true})`。Step 6 的单条抓取失败语义**不是**同构，见 Step 6 说明。

- [ ] **Step 6: 改造 `collectBuffPageImmunityFacts` 增量落盘**

当前 `collectBuffPageImmunityFacts`（`fetch-wiki-buffs.mjs:245-299`）循环体里已经有一段 try/catch（约 274-295 行），逻辑是：优先调用注入的 `fetchPagePayload({ pageTitle })`，否则走 `fetchDefaultBuffPagePayload({ fetchRenderedHtml })`，再 `parseBuffPageEvidence(...)`；`catch` 只是 `console.warn` 然后什么都不设置。这段异常边界已经是对的（只包住抓取+解析，不包住任何落盘/mark 逻辑），**不要重写它，原样抽成一个函数**：

```js
async function fetchBuffPageImmunityFact({ buff, pageTitle, fetchPagePayload, fetchRenderedHtml, sampleLimit }) {
  try {
    const pagePayload = fetchPagePayload
      ? await fetchPagePayload({ pageTitle })
      : await fetchDefaultBuffPagePayload({ pageTitle, fetchRenderedHtml });
    return parseBuffPageEvidence({
      buffId: buff.id,
      buffName: buff.englishName ?? pageTitle,
      pageTitle: pagePayload.pageTitle ?? pageTitle,
      canonicalPageTitle: pagePayload.canonicalPageTitle ?? pagePayload.pageTitle ?? pageTitle,
      revisionId: pagePayload.revisionId ?? null,
      revisionTimestamp: pagePayload.revisionTimestamp ?? null,
      html: pagePayload.html,
      wikitext: pagePayload.wikitext,
      sections: pagePayload.sections,
      sampleLimit,
    });
  } catch (error) {
    console.warn(`Failed to parse buff page immunities for ${pageTitle}: ${error.message}`);
    return null; // 和今天的行为一致：不设置 map entry，调用方 if(facts) 处理
  }
}
```

再给 `collectBuffPageImmunityFacts` 增加 `resume` 参数，并允许测试注入 `crashIfConfigured`。循环内顺序（在现有 `pageTitle`/`current`/`progressCallback` 逻辑之后插入 resume 分支，不改动前面的 skip-empty-title 分支）：

```js
let attempted = 0; // 本轮实际尝试抓取的 buff 数，不含 skip 项 —— 局部变量，
                    // 和 fetch-wiki-town-npc-maintenance.mjs:342,380 的 scraped/attempted 是同一种做法，
                    // 不要挂在 resume 对象上（那样没有地方真正自增它）。

if (resume?.shouldSkip(buff.id)) {
  factsByBuffId.set(buff.id, resume.partialStore[String(buff.id)]);
  continue;
}

const facts = await fetchBuffPageImmunityFact({ buff, pageTitle, fetchPagePayload, fetchRenderedHtml, sampleLimit });
if (facts) {
  attempted += 1;
  factsByBuffId.set(buff.id, facts);
  resume.partialStore[String(buff.id)] = facts;
  writeJsonFile(resume.partialPath, resume.partialStore);
  crashIfConfigured('after-partial-before-mark', { buffId: buff.id, attempted });
  markCompleted({ statePath: resume.statePath, state: resume.state, key: buff.id });
  crashIfConfigured('after-mark', { buffId: buff.id, attempted });
}
```

这一步不能把 `markCompleted` 放到 `writeJsonFile(partialPath, ...)` 前面。`writeJsonFile(partialPath, ...)`、`crashIfConfigured(...)`、`markCompleted(...)` 的异常必须冒泡到 `main()`，不能被任何 catch 吞掉——上面 `fetchBuffPageImmunityFact` 内部的 catch 已经把边界收窄到只包住抓取/解析，这三行不在那个 catch 里面，天然满足这条约束，不需要再加一层 try/catch。

**这里和 Town NPC 不是同构，是有意的行为分歧，必须在实现 PR 里写清楚：** Town NPC 的 `crawlRecords`（`fetch-wiki-town-npc-maintenance.mjs:358-384`）单条抓取失败时，`catch` 里会拼一个带 `error` 字段的降级记录，这个记录仍然会被写入 partial 并无条件 `markCompleted`（没有 `if` 判断）——所以 Town NPC 对"抓过一次、哪怕失败"就永久视为完成，除非显式 `--resume-mode=fresh` 否则不会重试。这次 Buffs 故意反过来：`fetchBuffPageImmunityFact` 失败时返回 `null`，外层 `if (facts)` 不成立，不写 partial、不 `markCompleted`，下次 `--resume-mode=resume` 会重新尝试这个 buff。这是合理的（wiki 单页抓取失败更可能是瞬时网络问题，值得重试），但和"必须与 Town NPC 保持同构"的说法矛盾，需要单独说明，不要让读者以为两边语义一致。

**已知遗留风险，本计划接受、不修：** 如果某个 buff 的页面是永久性抓不到/解析不出结构（不是瞬时失败），它会在每次 `--resume-mode=resume` 时被无限重试，脚本永远到不了 100% 完成，永远写上面 Step 3 定义的 `status:'failed'`。运维能从 `resume.completed/total` 摘要看出同一批 key 一直卡住从而人工介入；本计划不做重试次数上限或"标记为永久失败"的策略，留作后续。

- [ ] **Step 7: 写 resume progress 字段**

`writeBuffFetchProgress(...)` 增加 `resumeFields = null` 参数，并把 `buildResumeProgressFields(state, total)` 合并进 progress payload：

```js
const payload = buildActionProgressPayload({
  actionId: ACTION_ID,
  status,
  phase,
  message,
  current,
  total,
  startedAt,
  overallCurrent,
  overallTotal,
  generatedAt,
  lastHeartbeatAt: generatedAt,
  childStatusPath: progressPath,
});
if (resumeFields) Object.assign(payload, resumeFields);
```

running 和 completed progress 都要包含 `resume` 摘要，便于 monitor UI 判断。

- [ ] **Step 8: 写 failed progress 合同**

`main()` 的 resume 校验失败、partial 写失败、crash hook 和其它顶层异常必须写最终 failed progress，而不是只写 Redis heartbeat。新增测试覆盖默认和显式 `--progress-path` 的 payload shape：

```js
assert.equal(progress.status, 'failed');
assert.equal(progress.actionId, 'buff-page-immunity-refresh');
assert.equal(typeof progress.generatedAt, 'string');
assert.equal(typeof progress.lastHeartbeatAt, 'string');
assert.equal(progress.childStatusPath.endsWith('fetch-wiki-buffs-progress.latest.json'), true);
assert.equal(progress.resume.mode, 'keyed_items');
```

该测试可以通过抽出 `writeFailedBuffFetchProgress({ progressPath, startedAt, error, resumeFields })` 来离线验证；不要为了测试失败 progress 去跑真实 wiki。

- [ ] **Step 9: 跑 Buff resume 测试**

Run:

```bash
node --test scripts/data/fetch/fetch-wiki-buffs-resume.test.mjs
```

Expected: PASS。

- [ ] **Step 10: 跑现有 Buff 测试**

Run:

```bash
node --test scripts/data/fetch/fetch-wiki-buffs.test.mjs scripts/data/fetch/refresh-target-buff-page-evidence.test.mjs
```

Expected: PASS。

## Task 3: 保持 Town NPC PoC 不退化

**Files:**
- Modify only if needed: `scripts/data/fetch/fetch-wiki-town-npc-maintenance.mjs`
- Test: `scripts/data/fetch/fetch-wiki-town-npc-maintenance-resume.test.mjs`

- [ ] **Step 1: 运行 Town NPC resume 测试**

Run:

```bash
node --test scripts/data/fetch/fetch-wiki-town-npc-maintenance-resume.test.mjs
```

Expected: PASS。若因 Task 1 的兼容层失败，先修兼容层，不改 Town NPC 行为语义。

- [ ] **Step 2: 补兼容回归测试**

无条件在 `crawler-resume-state.test.mjs` 增加旧签名测试，防止 Task 1 泛化破坏 Town NPC PoC（这条和 Task 1 Step 4 的旧签名测试不是重复：那条验证的是 `payload === 'complete'` 复合谓词场景，这条验证最简单的两参数谓词——两条都留着，不要把其中一条当冗余删掉）：

```js
const shouldSkip = makeSkipChecker(state, partialStore, (record, key) => String(record.gameId) === String(key));
assert.equal(shouldSkip(1), true);
```

Run:

```bash
node --test scripts/data/lib/crawler-resume-state.test.mjs scripts/data/fetch/fetch-wiki-town-npc-maintenance-resume.test.mjs
```

Expected: PASS。

## Task 4: 同步 JS/Java monitor resume metadata

**Dependency:** 只有 Task 1 和 Task 2 的窄测试通过后，才能把 `buffs` 暴露为 `resumeSupported=true`。并行执行时，Monitor agent 只能先写失败测试或准备不启用 capability 的草案；不能先合入启用规则。

**Files:**
- Modify: `scripts/data/monitor/wiki-monitor-domain-rules.mjs`
- Modify/Create: `scripts/data/monitor/wiki-monitor-domain-rules.test.mjs`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`

- [ ] **Step 1: 写 JS rule metadata 测试**

在 `wiki-monitor-domain-rules.test.mjs` 中断言：

```js
const townNpc = WIKI_MONITOR_DOMAIN_RULES.find((rule) => rule.domain === 'town_npc_maintenance');
assert.equal(townNpc.resumeSupported, true);
assert.equal(townNpc.resumeMode, 'fresh');
assert.equal(townNpc.resumeStatePath, 'data/generated/resume/domain-source-town-npc-maintenance.resume.json');
assert.equal(townNpc.restartBehavior, 'resume-dispatch');

const buffs = WIKI_MONITOR_DOMAIN_RULES.find((rule) => rule.domain === 'buffs');
assert.equal(buffs.resumeSupported, true);
assert.equal(buffs.resumeMode, 'fresh');
assert.equal(buffs.resumeStatePath, 'data/generated/resume/buff-page-immunity-refresh.resume.json');
assert.equal(buffs.restartBehavior, 'resume-dispatch');

const bosses = WIKI_MONITOR_DOMAIN_RULES.find((rule) => rule.domain === 'bosses');
assert.equal(bosses.resumeSupported, false);
assert.equal(bosses.resumeStatePath, null);
assert.equal(bosses.restartBehavior, 'fresh');
```

- [ ] **Step 2: 实现 JS rule helper**

把 `rule(...)` 扩展为接受 options：

```js
function rule(domain, label, sourceKey, locator, recommendedActionId, progressPath, command, options = {}) {
  return {
    domain,
    label,
    sourceKey,
    locator,
    actionId: recommendedActionId,
    recommendedActionId,
    progressPath,
    command,
    requiresApproval: true,
    autoEligible: false,
    dispatchMode: 'manual',
    cooldownMinutes: 30,
    maxConcurrent: 1,
    failureCircuitBreaker: 'disabled until auto dispatch is enabled',
    lastAutoRunAt: null,
    pauseReason: null,
    resumeSupported: Boolean(options.resumeSupported),
    resumeMode: options.resumeMode ?? 'fresh',
    resumeStatePath: options.resumeStatePath ?? null,
    restartBehavior: options.restartBehavior ?? 'fresh',
  };
}
```

给 Town NPC 和 Buffs 传入 resume options。

- [ ] **Step 3: 写 Java buff resume dispatch 测试**

在 `CrawlerMonitorServiceImplTest.java` 增加：

```java
@Test
void shouldLaunchBuffDispatchWithResumeArgumentsWhenRequested() throws Exception {
    RecordingProcessLauncher launcher = new RecordingProcessLauncher(new BlockingProcess());
    CrawlerMonitorServiceImpl service = new CrawlerMonitorServiceImpl(
        new ObjectMapper(),
        repoRoot,
        Clock.fixed(Instant.parse("2026-06-14T01:05:00Z"), ZoneOffset.UTC),
        launcher
    );
    CrawlerMonitorDispatchRequestDTO request = dispatchRequest("buffs", "buff-page-immunity-refresh");
    request.setResumeMode("resume");

    CrawlerMonitorDispatchResultDTO result = service.dispatchWikiMonitorTask(request);

    assertTrue(result.isAccepted());
    assertTrue(launcher.lastRequest.command().contains("--resume-mode=resume"));
    assertTrue(launcher.lastRequest.command().contains("--resume-state=data/generated/resume/buff-page-immunity-refresh.resume.json"));
}
```

再增加这些 Java 测试：

- `shouldPreserveResumeModeWhenQueuedBuffDispatchStartsLater`
  - 先用 blocking process 占住 `buffs` lane，再提交 `resumeMode=resume` 的 Buff dispatch。
  - 断言 response、queue mirror item、dedupe key 包含 `resumeMode:resume` 和 `resumeStatePath:data/generated/resume/buff-page-immunity-refresh.resume.json`。
  - 释放 lane 后 drain queue，断言 launch command 包含 `--resume-mode=resume` 和对应 `--resume-state`。
- `shouldRetryResumeDispatchWithOriginalResumeMetadata`
  - seed failed dispatch payload 带 `resumeMode=resume`、`resumeStatePath`。
  - `controlAction=retry` 后新 launch 必须继承 `--resume-mode=resume --resume-state=...`。
  - 同时写一条 fresh case：失败 payload 是 `resumeMode=fresh` 时 retry 只传 `--resume-mode=fresh`，不传 `--resume-state`。
- `shouldHandleResumeModeMatrixForResumableAndNonResumableRules`
  - `buffs + fresh`：accepted，传 `--resume-mode=fresh`，不传 `--resume-state`。
  - `buffs + auto`：accepted，传 `--resume-mode=auto` 和 `--resume-state`。
  - `bosses + resume`：rejected（`resumeDispatchMetadata` 已有覆盖：`shouldRejectResumeModeForDispatchWithoutResumeSupport`，`CrawlerMonitorServiceImplTest.java:2741-2752`，新矩阵测试里这一格不用重新证明,只是把它纳入同一张矩阵表述)。
  - `bosses + fresh`：**当前真实行为是 bug 级隐患，必须先修再写测试锁住正确行为**。`resumeDispatchMetadata`（`CrawlerMonitorServiceImpl.java:382-403`）在 `resumeMode` 缺省时返回 `Map.of()`，但在非 resumable rule 收到显式 `fresh` 时返回 `Map.of("resumeMode", "fresh")`——两者应该是同一个逻辑操作，却产出不同的 metadata，而 `WikiMonitorQueueItem.dedupeKeyPart()`（`WikiMonitorQueueItem.java:62-68`）把 `resumeMode` 拼进 dedupe key，于是 `bosses`（缺省 resumeMode）和 `bosses+fresh` 会产生两个不同的 dedupe key（`standard:domain-source-bosses` vs `standard:domain-source-bosses:resumeMode:fresh`），同一个非续传任务可能被并发派发两次。修法是一行改动，见 Step 4。新矩阵测试必须断言 dedupe key **相同**（parity），不能只断言"产生了某个 key"。
- `overviewDeclaresResumeCapabilityForSupportedDomains`
  - Town NPC 和 Buffs：`resumeSupported=true`、`resumeMode=fresh`、各自 `resumeStatePath`、`restartBehavior=resume-dispatch`。
  - Bosses：`resumeSupported=false`、`resumeStatePath=null`、`restartBehavior=fresh`。
- `AdminCrawlerMonitorControllerTest.shouldPassBuffResumeModeWithoutClientStatePath`
  - request body 只传 `{"domain":"buffs","actionId":"buff-page-immunity-refresh","resumeMode":"resume"}`。
  - 验证 controller 传给 service 的 request 只依赖 `resumeMode`；response JSON 暴露 service 返回的 `resumeMode/resumeStatePath`。
  - 不把客户端 `resumeStatePath` 作为 API source of truth。

- [ ] **Step 4: 实现 Java resumable rule**

在 `CrawlerMonitorServiceImpl.java` 添加：

```java
private static final String BUFF_RESUME_STATE_PATH = "data/generated/resume/buff-page-immunity-refresh.resume.json";
```

常量放在 `TOWN_NPC_RESUME_STATE_PATH` 附近，并确保 JS rule mirror 使用完全同一个字符串。把 `buffs` 的 `directRule(...)` 改为 `resumableDirectRule(...)`，命令仍保持：

```java
List.of("node", "scripts/data/fetch/fetch-wiki-buffs.mjs", "--progress-path=data/generated/fetch-wiki-buffs-progress.latest.json")
```

**修复 1 — dedupe key 双花（对应上面 Step 3 的 `bosses + fresh` 发现）：** `resumeDispatchMetadata`（`:382-403`）里非 resumable rule 分支现在是：

```java
if (!rule.resumeSupported()) {
    if ("fresh".equals(resumeMode)) {
        return Map.of("resumeMode", resumeMode); // 改前：非空 map，会被拼进 dedupe key
    }
    throw new IllegalArgumentException("动作 " + rule.actionId() + " 不支持断点续爬。");
}
```

改成：

```java
if (!rule.resumeSupported()) {
    if ("fresh".equals(resumeMode)) {
        return Map.of(); // 改后：和"resumeMode 缺省"产出完全一样的（空）metadata，dedupe key 不再分裂
    }
    throw new IllegalArgumentException("动作 " + rule.actionId() + " 不支持断点续爬。");
}
```

只改一行返回值，`resume/auto` 仍然 `throw`（`bosses+resume` 的 rejected 语义不变）。

**修复 2 — retry 不继承原始 resume 参数：** `retryWikiMonitorDispatch(...)`（`:1707-1731`）今天对**所有域**都不读 `latestPayload` 里的 `resumeMode`/`resumeStatePath`，只塞 `retryOf/retryCount/retryReason/controlAction/controlledAt/message` 就直接 `dispatchWikiMonitorTask(repoRoot, rule, metadata)`——这不是”Town NPC 专用逻辑需要泛化”，是这条能力对任何域都还没实现过。已有的正确参照是 `resumeMetadataFromQueueItem(WikiMonitorQueueItem)`（`:2825-2843`，服务”排队任务稍后启动”路径），逻辑是从 queue item 读 `resumeMode`/`resumeStatePath`/`failureMode`，没有任何域名判断。在 `retryWikiMonitorDispatch` 里按同样思路读 `latestPayload`（普通 `Map<String,Object>`，用方法里已经在用的 `asString(...)`），插在 `retryOf`/`retryCount` 之前：

```java
LinkedHashMap<String, Object> metadata = new LinkedHashMap<>();
String inheritedResumeMode = trimToNull(asString(latestPayload.get("resumeMode")));
if (inheritedResumeMode != null) {
    metadata.put("resumeMode", inheritedResumeMode);
    String inheritedResumeStatePath = trimToNull(asString(latestPayload.get("resumeStatePath")));
    if (inheritedResumeStatePath != null) {
        metadata.put("resumeStatePath", inheritedResumeStatePath);
    }
}
metadata.put("retryOf", failedDispatchId);
metadata.put("retryCount", retryCount + 1);
metadata.put("retryReason", firstNonBlank(asString(latestPayload.get("message")), "previous dispatch failed"));
metadata.put("controlAction", "retry");
metadata.put("controlledAt", Instant.now(clock).toString());
metadata.put("message", "retrying failed dispatch " + failedDispatchId);
return dispatchWikiMonitorTask(repoRoot, rule, metadata);
```

`resumeDispatchMetadata` 本身只在 `resumeMode != 'fresh'` 时才写 `resumeStatePath`（`:398-400`），所以一个 `resumeMode=fresh` 失败的 dispatch，`latestPayload` 里本来就没有 `resumeStatePath`，上面的嵌套 `if` 自然只传 `--resume-mode=fresh`——这正是 Step 3 里 fresh case 那条测试要断言的行为，不需要额外分支。”重新爬”（用户主动点”重新爬”按钮）必须走普通 `/dispatch` + `resumeMode=fresh`，不要复用 `retry`（`retry` 只用于重放失败 dispatch 的原始参数，语义上是”续着刚才失败的那次”，不是”我要重新开始”）。

- [ ] **Step 5: 跑 monitor metadata 测试**

Run:

```bash
node --test scripts/data/monitor/wiki-monitor-domain-rules.test.mjs
cd back && mvn -o test -Dtest='CrawlerMonitorServiceImplTest#shouldLaunchTownNpcMaintenanceDispatchWithResumeArgumentsWhenRequested+shouldLaunchBuffDispatchWithResumeArgumentsWhenRequested+shouldPreserveResumeModeWhenQueuedBuffDispatchStartsLater+shouldRetryResumeDispatchWithOriginalResumeMetadata+shouldHandleResumeModeMatrixForResumableAndNonResumableRules+overviewDeclaresResumeCapabilityForSupportedDomains,AdminCrawlerMonitorControllerTest#shouldPassBuffResumeModeWithoutClientStatePath'
```

Expected: PASS。`overviewDeclaresTownNpcResumeCapabilityOnlyForResumeSupportedDomain` 必须重命名为 `overviewDeclaresResumeCapabilityForSupportedDomains`，并同步 Maven selector。

## Task 5: 前端 monitor UI 泛化续传入口

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`（只删一行 POST body 字段 + 接入下面的新函数，见 Step 4）
- Create: `data-query-app/pages/operations/crawler-monitor.control.test.mjs`（behavior test，import 新函数，不碰 .vue 源码）
- Modify: `data-query-app/pages/operations/crawler-monitor.control.mjs`（新增 `buildResumeDispatchPayload`）
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`（只加一行最小 wiring smoke，不再正则提取函数体）
- Modify: `data-query-app/tests/crawler-monitor-domain-table.test.mjs`
- Modify: `data-query-app/tests/crawler-monitor-triage-workbench.test.mjs`

**执行前必读（本轮核查推翻的前提）：** 经过多轮只读核查，原计划对 Step 1/4 的问题描述本身是错的——`continueDomainTableRow`（`crawler-monitor.vue:1655-1681`）今天已经是纯 capability-based 判断（`if (!domainId || !actionId || !domain?.resumeSupported || !resumeStatePath)`），**没有** `town_npc_maintenance` 硬编码。硬编码只存在于 `makeResumeFailureDomainTableRow`（`:1688`）和 `failCurrentDomainTableRow`（`:1715`），这两个是 QA/断点失败注入专用操作，计划本身也说了不能泛化（后端 `failureMode: 'townNpcCrashAfterPartial'` 就是 Town-NPC-only）。同理 `crawlerMonitorTriageWorkbench.mjs` 的 `canContinueDomainOperation`（`:131-136`）和 `buildDomainOperationModel` 里的 `continue-crawl` 生成（`:214-215`）也已经是纯泛化逻辑，从未按域名判断——Step 3 的新测试对这个文件而言是**回归锁**，证明”第二个域也能用”，不是新增能力，不需要改 `crawlerMonitorTriageWorkbench.mjs` 本身一行代码。这次 Task 5 真正要做的实现工作，从头到尾只有一处：删掉 POST body 里的 `resumeStatePath` 字段（`crawler-monitor.vue:1671`）。

- [ ] **Step 1: 为待删的 `resumeStatePath` 字段写行为测试（不正则提取 .vue 函数体）**

`continueDomainTableRow` 的 guard 判断和 payload 构造目前是内联在 `.vue` 里的，只能靠正则读源码测；这类测试容易通过字符串存在性而漏掉真实行为。当前 `crawler-monitor-page-contract.test.mjs` 已经有大量源码字符串断言，本轮不再继续扩大这种模式。把 `continueDomainTableRow` 的 guard + payload 构造抽成一个纯函数，放进这个页面已经在用的同款 sibling 模块 `crawler-monitor.control.mjs`（该文件已导出 `buildDispatchControlPayload`，是这个抽取模式的现成先例）：

```js
// data-query-app/pages/operations/crawler-monitor.control.mjs（新增，紧跟在 buildDispatchControlPayload 后面）
export function buildResumeDispatchPayload(row = {}) {
  const domain = row.sourceDomain || null
  const domainId = domain?.domain || row.domain || ''
  const actionId = domain?.recommendedActionId || row.actionId || ''
  const resumeStatePath = domain?.resumeStatePath || row.resumeStatePath || ''
  if (!domainId || !actionId || !domain?.resumeSupported || !resumeStatePath) {
    return { ok: false }
  }
  return {
    ok: true,
    domainId,
    payload: { domain: domainId, actionId, resumeMode: 'resume' }, // 注意：不含 resumeStatePath
  }
}
```

新建 `crawler-monitor.control.test.mjs`，import 这个函数直接测行为：

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildResumeDispatchPayload } from './crawler-monitor.control.mjs'

test('buildResumeDispatchPayload omits resumeStatePath from the dispatch payload', () => {
  const decision = buildResumeDispatchPayload({
    sourceDomain: {
      domain: 'buffs',
      recommendedActionId: 'buff-page-immunity-refresh',
      resumeSupported: true,
      resumeStatePath: 'data/generated/resume/buff-page-immunity-refresh.resume.json',
    },
  })
  assert.equal(decision.ok, true)
  assert.deepEqual(decision.payload, {
    domain: 'buffs',
    actionId: 'buff-page-immunity-refresh',
    resumeMode: 'resume',
  })
  assert.equal('resumeStatePath' in decision.payload, false)
})

test('buildResumeDispatchPayload rejects a domain without resume capability, regardless of domain name', () => {
  const decision = buildResumeDispatchPayload({
    sourceDomain: { domain: 'bosses', recommendedActionId: 'domain-source-bosses', resumeSupported: false },
  })
  assert.equal(decision.ok, false)
})
```

这两个测试目前会 FAIL（`buildResumeDispatchPayload` 还不存在），符合先写失败测试的规则。`crawler-monitor-page-contract.test.mjs` 只加一行最小 smoke（不用正则抠函数体）：

```js
test('continue crawl dispatch delegates to buildResumeDispatchPayload', () => {
  assert.match(page, /buildResumeDispatchPayload/);
});
```

- [ ] **Step 2: 写 domain table metadata 保留测试**

在 `crawler-monitor-domain-table.test.mjs` 增加 Buff row，只断言 row 保留 `sourceDomain.resumeSupported/resumeStatePath/restartBehavior`，不要断言 `rows[0].actions`（`buildDomainTableRows` 任何返回行都不会有 `actions`/`primaryAction`/`secondaryActions` 字段——这些字段是下游 `crawlerMonitorTriageWorkbench.mjs` 的 `decorateDomainRow` 才加的，不是这一层的产物）。`buildDomainTableRows(...)`（`crawlerMonitorDomainTable.mjs:442`）的 `sourceDomain` 是对输入 `domains[]` 里对应对象的逐字段透传（`:504`），这个测试对实现来说是纯回归锁，写完预期直接 PASS，不需要改 `crawlerMonitorDomainTable.mjs`：

```js
const rows = buildDomainTableRows({
  domains: [{
    domain: 'buffs',
    label: 'Buffs',
    recommendedActionId: 'buff-page-immunity-refresh',
    resumeSupported: true,
    resumeStatePath: 'data/generated/resume/buff-page-immunity-refresh.resume.json',
    restartBehavior: 'resume-dispatch',
    state: { status: 'failed', nextAction: 'continue_crawl' },
  }],
  progressRows: [],
  dispatchQueue: [],
});
assert.equal(rows[0].sourceDomain.resumeSupported, true);
assert.equal(rows[0].sourceDomain.resumeStatePath, 'data/generated/resume/buff-page-immunity-refresh.resume.json');
assert.equal(rows[0].sourceDomain.restartBehavior, 'resume-dispatch');
```

- [ ] **Step 3: 写 triage workbench action 测试**

在 `crawler-monitor-triage-workbench.test.mjs` 增加 failed Buff resumable case，验证真实按钮生成。这个测试同样是回归锁：`canContinueDomainOperation`（`crawlerMonitorTriageWorkbench.mjs:131-136`）从未按域名判断，只看 `CONTINUE_CRAWL_STATUSES.has(status) && sourceDomain.resumeSupported === true && Boolean(sourceDomain.resumeStatePath)`，写完预期直接 PASS：

```js
const view = buildTriageWorkbench({
  domainRows: [{
    domain: 'buffs',
    label: 'Buffs',
    status: 'failed',
    risk: 'failed',
    diagnosisGroup: 'attention',
    recommendedActionId: 'buff-page-immunity-refresh',
    sourceDomain: {
      domain: 'buffs',
      recommendedActionId: 'buff-page-immunity-refresh',
      resumeSupported: true,
      resumeStatePath: 'data/generated/resume/buff-page-immunity-refresh.resume.json',
      restartBehavior: 'resume-dispatch',
      state: { status: 'failed', nextAction: 'continue_crawl' },
    },
  }],
});
const operation = view.allRows.find((row) => row.domain === 'buffs');
assert.equal(operation.primaryAction.action, 'continue-crawl');
assert.equal(operation.secondaryActions.some((action) => action.action === 'make-resume-failure'), false);
assert.equal(operation.secondaryActions.some((action) => action.action === 'fail-current'), false);
```

**`restartBehavior` 的问题这次不再留作条件判断，已核查确定：** repo 里 `.mjs`/`.vue` 逻辑文件对 `restartBehavior` 的引用是 0 处——它只在 `types/crawlerMonitor.ts` 里作为类型声明存在，从未被任何判断逻辑读取。`continue-crawl` 的判据就是上面那一行（`resumeSupported + resumeStatePath + status ∈ {failed, stalled}`），不包含 `restartBehavior`。**不要**加 `restartBehavior:'fresh'` 的负例测试——没有代码读这个字段做门禁，加了也测不出任何行为差异，只会造成”这个字段参与判断”的错误印象。

- [ ] **Step 4: 实现前端泛化**

`continueDomainTableRow` 唯一的改动是委托给 Step 1 新增的纯函数，不需要”删除 town_npc_maintenance 判断”（那里从来没有）：

```ts
async function continueDomainTableRow(row: any) {
  selectDomainTableRow(row)
  const decision = buildResumeDispatchPayload(row)
  if (!decision.ok) {
    showToast('当前域缺少续传状态，不能接着爬', 'warning')
    return
  }
  wikiDispatchLoading.value = decision.domainId
  try {
    const response: any = await post('/admin/crawler-monitor/dispatch', decision.payload)
    latestDispatchResult.value = (response?.data ?? response) || null
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || '已提交接着爬', latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '提交接着爬失败', 'error')
  } finally {
    wikiDispatchLoading.value = ''
  }
}
```

在文件顶部现有 `import { buildDispatchControlPayload } from './crawler-monitor.control.mjs'`（或等价导入行）旁边加上 `buildResumeDispatchPayload`。**不要碰** `makeResumeFailureDomainTableRow` 和 `failCurrentDomainTableRow` 的 Town NPC 专用判断（`:1688`、`:1715`）——它们对应的 crash validation hook 仍然只有 Town NPC 有，泛化这两个函数不在本计划范围内，泛化了反而会让 UI 对 Buffs 展示出实际不存在的”制造断点失败”能力。

- [ ] **Step 5: 跑前端 contract 测试**

Run:

```bash
cd data-query-app && node --test pages/operations/crawler-monitor.control.test.mjs tests/crawler-monitor-page-contract.test.mjs tests/crawler-monitor-domain-table.test.mjs tests/crawler-monitor-triage-workbench.test.mjs
```

Expected: PASS。

## Task 6: 集成验证与状态清理

**Files:**
- No implementation files unless previous task failed.

- [ ] **Step 1: 跑脚本层续传测试**

Run:

```bash
node --test scripts/data/lib/crawler-resume-state.test.mjs
node --test scripts/data/fetch/fetch-wiki-town-npc-maintenance-resume.test.mjs
node --test scripts/data/fetch/fetch-wiki-buffs-resume.test.mjs
```

Expected: PASS。

- [ ] **Step 2: 跑 monitor/backend/frontend contract**

Run:

```bash
node --test scripts/data/monitor/wiki-monitor-domain-rules.test.mjs
cd back && mvn -o test -Dtest='CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest'
cd data-query-app && node --test pages/operations/crawler-monitor.control.test.mjs tests/crawler-monitor-page-contract.test.mjs tests/crawler-monitor-domain-table.test.mjs tests/crawler-monitor-triage-workbench.test.mjs
```

Expected: PASS。

- [ ] **Step 3: 检查没有真实 generated 产物脏文件**

Run:

```bash
git status --short
git diff --cached --stat
```

Expected: 只出现本计划涉及的源码、测试、文档文件；不出现 `data/generated/**`、`data/standardized/**`、`reports/**` 的测试产物。

若出现测试产物，先确认路径来自临时测试或误写真实工作区；真实工作区产物必须清理后再提交代码。提交策略：实现完成且 Task 6 通过后做一个 focused commit；如果只完成计划修订、不执行实现，则只提交计划文档或保持未提交并在交接中明确。

## 多 agent 拆分建议

- **Agent A - Resume library:** Task 1 和 Task 3。默认只碰 `scripts/data/lib/**` 与 resume tests；如果必须改 `fetch-wiki-town-npc-maintenance.mjs`，停止并交给 lead 串行决策。
- **Agent B - Buff script:** Task 2，只碰 `fetch-wiki-buffs.mjs`、`fetch-wiki-buffs.test.mjs`、`fetch-wiki-buffs-resume.test.mjs`。
- **Agent C - Monitor metadata:** Task 4 的测试草案可并行准备，但启用 `buffs.resumeSupported=true` 必须等 Agent A/B 窄测试通过后串行执行。
- **Agent D - Frontend UI contract:** Task 5，只碰 `crawler-monitor.vue`、`crawler-monitor.control.mjs`、新增/相关前端测试；`crawlerMonitorTriageWorkbench.mjs` 本轮不改代码，只通过测试锁住现有行为。
- **Lead agent:** 每个 agent 完成后先跑对应窄测试，再由 lead 跑 Task 6。Agent B 和 Agent C 不再并行合入 capability；CLI 参数名或 resume state path 变化时，由 lead 统一同步 Java/JS/UI 三处。

## 验收方式

用户验收时不用跑真实 wiki 网络任务。通过以下事实即可验收第一版通用断点续传：

1. Town NPC 旧续传测试仍通过，证明 PoC 未退化。
2. Buff 新测试证明 crash -> resume 只抓剩余项，且 crash after partial before mark 不会误 skip。
3. Java dispatch 测试证明 Town NPC 和 Buffs 都会收到 `--resume-mode=resume` 与各自 `--resume-state`。
4. Overview + triage workbench 测试证明 UI 不再只认 Town NPC，`resumeSupported=true` 且有 state path 的 Buff 终态 action 会显示“接着爬”，同时不会显示 Town NPC 专用 failure validation。
5. `git status --short` 没有真实数据产物，`git diff --cached --stat` 的 staged 范围只含本任务文件。

## Plan Auditor 自审

**Verdict**
- Status: execution-ready after review repairs (round 2)。
- Main goal: 将续传协议从单 action PoC 推进到可复用协议，并用 Buffs 作为第二个真实 action 证明泛化。
- Closure definition: 上述验收 1-5 全部成立。

**Blocking Plan Defects（round 1 结论）**
- Critical: none.
- Important: none.

**Round 2 — 对着真实代码核查后的结论：round 1 "Important: none" 过于乐观，以下问题当时没查代码就通过了**

用多轮只读审查分别对 Task 1-3（JS resume 库 + Town NPC/Buff 脚本）、Task 4（JS/Java monitor 元数据）、Task 5（前端）逐行核对真实源码后发现：

- Critical（已修进对应 Task，非阻断但必须在实现前就位）：
  - Task 4：`resumeDispatchMetadata` 对 `非 resumable rule + resumeMode=fresh` 和 `非 resumable rule + resumeMode 缺省` 返回不同 metadata（前者非空、后者 `Map.of()`），导致 `WikiMonitorQueueItem.dedupeKeyPart()` 产生两个不同 dedupe key，同一个非续传任务（如 `bosses`）可能被并发派发两次。修法是一行改动，已写进 Task 4 Step 4。
  - Task 5：Step 1 原计划的前提是错的——它要删除的 `town_npc_maintenance` 硬编码根本不在 `continueDomainTableRow` 里（该函数已经是纯 capability-based），而且提出的测试是对 `.vue` 源码做正则匹配，只证明字符串存在，不证明 payload 行为。已重写为抽取 + behavior test。
- Important：
  - Task 4：`retryWikiMonitorDispatch` 今天对任何域都不继承失败 dispatch 的 `resumeMode`/`resumeStatePath`（不是"Town NPC 逻辑需要泛化"，是这个能力还没实现过）；已有现成的泛化实现可参照（`resumeMetadataFromQueueItem`），已写进 Task 4 Step 4。
  - Task 2：Buff 单条抓取失败时"不 markCompleted、下次 resume 重新尝试"和 Town NPC"无条件 markCompleted（哪怕失败）"是相反语义，原计划用"同构"描述会误导；且"最终未全部完成时写什么 status"原计划没给出具体值。已在 Task 2 Step 3/5/6 里明确为 `status:'failed'`（并解释为什么必须复用这个字面量——前端 `CONTINUE_CRAWL_STATUSES` 只认 `failed/stalled`）、显式标注这是有意的行为分歧、并写明"页面永久解析失败会导致无限重试、永远到不了 100%"是本轮接受的已知风险。
  - Task 2：Step 6 原计划用"只捕获...异常边界必须收窄"这类描述性文字表达关键的 crash-safety 逻辑，没有给出真正的 try/catch 代码——已核实这段异常边界其实已经在 `fetch-wiki-buffs.mjs:274-296` 里正确实现，只需要原样抽取，不需要重新发明；同时 `resume.attempted` 在原 pseudocode 里被读取但从未被赋值，已改为局部 `attempted` 计数器（对照 Town NPC 的 `scraped`/`attempted` 局部变量做法）。
  - Task 1：`computeInputFingerprint` 的默认 normalizer 只认 `gameId/internalName/pageTitle/nameZh`，调用方一旦忘记传 `normalizeEntry`，形状不同的 record（比如 Buff）会被静默退化成只按其中重合的字段（`internalName+pageTitle`）算指纹，两份 `id` 完全不同的数据集可能算出相同指纹。Task 2 本身通过显式传 `normalizeEntry` 规避了，但公共库 API 上这个陷阱本身没有防护。已在 Task 1 Step 4 加一条 characterization test 钉死这个坑，供后续调用方参考。
  - Task 1：`verifyResumePartialStore`/`resolveResumeDecision`/`makeSkipChecker` 的具体 diff 原计划只有文字描述（"把 key 比较改为使用 recordKeyFor(...)"），没有对照真实当前实现给出代码——已读取真实源码后补上准确的最小 diff（Task 1 Step 3）。
- Minor：Task 3 Step 2 和 Task 1 Step 4 的旧签名测试看起来相似，已加注释说明两条都要保留、不是重复；Task 4 新增的 `bosses+resume→rejected` 矩阵测试用例和已有测试重叠，已加引用说明。

**Plan Repairs（round 1）**
- Change: 把 item-page/backendRefresh/audio/domain smoke 明确列为 out of scope。
- Reason: 这些续传来源与 keyed partial store 协议不同，塞进第一版会扩大风险。
- Validation added: Task 6 只验收 Town NPC + Buffs + monitor capability。
- Change: 补上 multi-agent 交叉审查发现的阻断项：`resolveResumeDecision` key 转发、Buff failed progress、fresh 清理旧 state/partial、retry 继承 resume metadata、frontend triage action 层测试、Task 4 串行启用 capability。
- Reason: 这些缺口会导致计划通过内部测试但真实 resume dispatch、失败可见性或 UI 操作不可用。
- Validation added: Task 1/2/4/5/6 均新增对应红绿测试和最终 gate。

**Execution-Ready Plan**
- Scope: resume library, Town NPC regression, Buff script migration, JS/Java monitor metadata, frontend capability UI。
- Agent split: 按文件所有权拆为 library、buff script、monitor metadata、frontend 四组；monitor capability 启用依赖脚本窄测试通过。
- Smoke test: Buff crash after partial before mark -> resume 不能 skip；crash after mark -> resume 只抓剩余。
- Final validation: Node tests + Maven monitor/controller tests + frontend page/domain/triage tests + clean git status/staged scope。

**Residual Risk**
- Risk: Buff 主脚本仍需先重取 Template/GetBuffInfo 和 localized expansion 后才能验证 fingerprint；第一版只节省最慢的 per-buff immunity 页面抓取。
- Follow-up trigger: 如果 module/expand 阶段也成为瓶颈，再单独设计 `phase_keyed` 或 phase-level checkpoint，不在本计划内混做。
- Risk（round 2 新增）: 某个 buff 页面若永久无法解析（不是瞬时网络失败），会在每次 `--resume-mode=resume` 时被无限重试，脚本永远到不了 100% 完成、状态永远是 `failed`。
- Follow-up trigger: 如果实际运行中出现同一批 key 反复卡住，再设计重试次数上限或"标记为永久失败"策略，不在本计划内做。
- Risk（round 2 新增）: `computeInputFingerprint` 默认 normalizer 对非 Town-NPC 形状的 record 静默退化（见上）；本计划的两个调用方（Town NPC、Buffs）都不受影响，但公共库 API 本身没有防护。
- Follow-up trigger: 下一个接入续传协议的脚本如果照抄 Town NPC 的零参数调用风格而不是 Task 2 的显式 `normalizeEntry` 风格，会重新踩坑；届时应该给 `computeInputFingerprint` 加运行时警告或必填校验，而不是只靠 characterization test 记录。
