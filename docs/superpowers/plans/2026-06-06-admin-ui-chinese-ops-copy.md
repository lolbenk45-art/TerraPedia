# Admin UI Chinese Ops Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `data-query-app` admin operator interface Chinese-first for Chinese users while preserving English game terms, schema keys, enum values, and data values where they are intentionally part of the domain or API.

**Architecture:** This is an in-place copy localization pass, not an i18n framework migration. Each task owns disjoint files and updates both UI copy and copy contract tests together. A final reviewer runs an English-copy scan against an explicit allowlist so typecheck cannot pass while obvious operator-facing English remains.

**Tech Stack:** Nuxt 4, Vue 3 SFCs, Pinia stores, Node built-in test runner, `pnpm`, `rg`.

---

## User Problem And Closure

The user-visible problem is that the admin backend contains many English operator-facing labels. English data values are acceptable, but Chinese users should not need English to operate pages, filters, buttons, workflow actions, empty states, toasts, modals, and navigation.

Closure means:

- Shared admin chrome, page titles, workflow controls, table headers, loading/empty/error states, toast copy, and confirmation prompts are Chinese-first.
- Every visible admin surface under `data-query-app/layouts`, `data-query-app/pages`, `data-query-app/components`, and user-facing store fallback/toast copy has been inventoried or assigned to an owner.
- English survivors are either raw data/API tokens or explicit domain terms listed in the allowlist below.
- Existing tests that assert English copy are updated intentionally.
- `data-query-app` passes focused contract tests and the full `pnpm run test` gate.

Out of scope:

- No backend, database, crawler, data refresh, or API response structure changes.
- No route path changes.
- No production data value translation.
- No full i18n library or locale switcher.
- No `front-nuxt` changes.

## Source Of Truth

Source of truth for this task is the current admin UI source under `data-query-app`, not database content. English raw identifiers and enum values remain source-of-truth tokens when they are posted to or received from APIs.

Primary surfaces:

- `data-query-app/layouts/default.vue`
- `data-query-app/pages/**`
- `data-query-app/components/**`
- `data-query-app/stores/**`
- `data-query-app/tests/*.test.mjs`

Known second-review repairs:

- Whole-admin pages such as `pages/index.vue`, `pages/categories.vue`, `pages/item-rarities.vue`, `pages/query.vue`, `pages/login.vue`, `pages/article-editor-design.vue`, and `pages/entities/town-npcs/**` are in scope.
- Common components such as `AdminItemLookupInput.vue`, `AppToast.vue`, and `TownNpcWorkbenchModal.vue` are in scope when they expose visible copy.
- Shared copy contract tests must be run by subtest pattern during intermediate tasks, or only in full at final review.
- Broad Nuxt page changes require the final `pnpm run test` gate, including build.

## Cross-Agent Review Summary

Galileo, read-only copy inventory:

- Highest risk areas are `pages/articles.vue`, `stores/articles.ts`, `pages/users.vue`, `stores/users.ts`, `layouts/default.vue`, `pages/operations/crawler-monitor.vue`, `pages/operations/data-source-acceptance.vue`, `pages/operations/domain-acceptance.vue`, `pages/entities/[type].vue`, `pages/operations/armor-attributes.vue`, and `components/ItemRecipeEditor.vue`.
- Translate workflow/UI verbs and states such as `Search`, `Reset`, `Loading`, `No users found`, `Approve`, `Reject`, `Publish`, `Unpublish`, `Created`, `Updated`, `Deleted`, and `Submit failed`.
- Keep raw identifiers, enums, paths, route names, JSON keys, and API route strings. Prefer Chinese plus field name for operator-facing technical labels.

Maxwell, read-only validation review:

- `data-query-app/package.json` uses `node --test tests/*.test.mjs`; there is no Vitest or Playwright setup.
- Tests currently assert English copy, especially `tests/admin-articles-page-contract.test.mjs`.
- Focused operation tests are `tests/admin-table-components-contract.test.mjs`, `tests/admin-armor-attributes-page-contract.test.mjs`, `tests/audio-assets-page-contract.test.mjs`, `tests/crawler-monitor-page-contract.test.mjs`, `tests/data-source-acceptance-page-contract.test.mjs`, and `tests/domain-acceptance-page-contract.test.mjs`.
- Add a focused contract check for stale English admin chrome and operation labels while excluding allowlisted domain/API tokens.

Halley, read-only plan audit:

- Plan needed repair until an explicit English allowlist and scan gate existed.
- Do not split `pages/entities/[type].vue`, `stores/items.ts`, `layouts/default.vue`, or article tests across agents.
- Final smoke should include `/`, `/articles`, `/users`, `/recipes/shimmer`, `/entities/npcs`, `/entities/projectiles`, and key `/operations/*` pages.

## English Survivor Allowlist

Allowed as visible text when domain-appropriate:

- Game/domain terms: `NPC`, `Boss`, `Buff`, `Projectile`, `Shimmer`, `Armor Set`, `Wiki`, `BGM`.
- Technical display tokens: `ID`, `JSON`, `API`, `URL`, `Code`, `MinIO`, `JWT`.
- Raw field names when paired with Chinese labels: `internalName`, `sourcePage`, `sourceProvider`, `sourceItemsJson`, `statKey`, `classScope`, `valueDecimal`, `parseStatus`, `rawJson`.
- Enum/provider values and API payload values: `manual_admin`, `wiki_gg`, `wiki_zh`, `BIOME`, `WORLD_CONTEXT`, `PRE_HARDMODE`, `HARDMODE`, `APPROVE`, `REJECT`, `DRAFT`, `PUBLISHED`, `OFFLINE`.
- File paths, route paths, package names, CSS class names, test names, imports, and implementation identifiers.

Preferred operator label style:

- `来源页 sourcePage`
- `来源提供方 sourceProvider`
- `内部标识 internalName`
- `来源物品 JSON sourceItemsJson`
- `属性键 statKey`
- `职业范围 classScope`
- `数值 valueDecimal`
- `解析状态 parseStatus`
- `原始 JSON rawJson`

Not allowed as operator-facing standalone copy after this pass:

- `Workspace`, `Admin Workspace`, `Catalog`, `Crafting`, `Entities`, `World`, `Operations`
- `Article Management`, `Write Article`, `View Content`, `Read-only Editor`, `Continue Writing`
- `Search`, `Reset`, `Loading`, `No articles found`, `No users found`
- `Approve`, `Reject`, `Publish`, `Unpublish`, `Submitting...`, `Publishing...`, `Unpublishing...`
- `Submit failed`, `Delete failed`, `Confirm delete`
- `Refresh State`, `TASKS`, `RUNNING`, `QUEUED`, `FAILED`, `No progress message yet.`, `No active queue state yet.`
- Stylistic standalone English badges such as `Overview`, `ITEM CATALOG`, `CATEGORY CONTROL`, `RARITY MANAGER`, `RECIPE FLOW`, `CRAFTING STATIONS`, `TOWN NPC WORKBENCH`, `SHOP ITEMS`, `MATCHED`, `UNMATCHED`, `Document First`, `Production Desk`, and `Review Studio`, unless they are replaced by Chinese-first labels or explicitly justified in the final review note.

## Copy Scan Gate

Run this before implementation to establish a baseline, after every batch, and at final review:

```bash
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/feat-admin-ui-chinese-ops-copy-2026-06-06
rg -n "Workspace|Admin Workspace|Catalog|Crafting|Entities|Operations|Article Management|Write Article|View Content|Read-only Editor|Continue Writing|No articles found|No users found|Submit failed|Delete failed|Confirm delete|Refresh State|No progress message yet|No active queue state yet|\\b(Search|Reset|Loading|Approve|Reject|Publish|Unpublish|Actions|Timeline|State|Cover|Article)\\b" \
  data-query-app/layouts data-query-app/pages data-query-app/components data-query-app/stores data-query-app/tests \
  --glob '!node_modules'
```

Expected final state: any remaining matches are either test negative assertions, implementation identifiers, or allowlisted domain/API tokens documented in the final review note.

Also run this broader visible-string inventory before implementation and at final review:

```bash
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/feat-admin-ui-chinese-ops-copy-2026-06-06
rg -n ">([^<]*[A-Za-z]{3,}[^<]*)<|placeholder=\"[^\"]*[A-Za-z]{3,}|title=\"[^\"]*[A-Za-z]{3,}|aria-label=\"[^\"]*[A-Za-z]{3,}|label:\s*'[^']*[A-Za-z]{3,}|name:\s*'[^']*[A-Za-z]{3,}|hint:\s*'[^']*[A-Za-z]{3,}|badge:\s*'[^']*[A-Za-z]{3,}|subtitle:\s*'[^']*[A-Za-z]{3,}|description:\s*'[^']*[A-Za-z]{3,}|helper:\s*'[^']*[A-Za-z]{3,}|eyebrow:\s*'[^']*[A-Za-z]{3,}|shortLabel:\s*'[^']*[A-Za-z]{3,}|showToast\('[^']*[A-Za-z]{3,}|new Error\('[^']*[A-Za-z]{3,}" \
  data-query-app/layouts data-query-app/pages data-query-app/components data-query-app/stores \
  --glob '*.vue' --glob '*.ts' --glob '!node_modules'
```

This inventory is not a blind failure gate. Each match must be classified as:

```text
Chinese-first already
allowlisted domain/API/data token
implementation-only string
test negative assertion
needs localization
```

## Multi-Agent Ownership

Use one writer per file. Agents are not alone in the codebase; each must avoid reverting or reshaping unrelated work, and must adapt to changes made by other agents.

Agent 1, shared shell and common components:

- Owns `data-query-app/layouts/default.vue`
- Owns simple shared/admin chrome pages: `data-query-app/pages/index.vue`, `pages/login.vue`, `pages/categories.vue`, `pages/item-rarities.vue`, `pages/query.vue`
- Owns visible-only common component copy in `data-query-app/components/AppModal.vue`, `AppEmptyState.vue`, `AppPagination.vue`, `AdminTableShell.vue`, `AdminDataTable.vue`, `AdminItemLookupInput.vue`, `AppToast.vue`
- Owns shared chrome/common component contract assertions, including `admin-table-components-contract.test.mjs`
- Must not edit article, entity, recipe, item, or operation pages

Agent 2, article and user workflow:

- Owns `data-query-app/pages/articles.vue`
- Owns `data-query-app/pages/article-editor-design.vue`
- Owns `data-query-app/stores/articles.ts`
- Owns `data-query-app/pages/users.vue`
- Owns `data-query-app/stores/users.ts`
- Owns `data-query-app/components/article/ArticleEditorWorkspace.vue` only for visible copy
- Owns `data-query-app/tests/admin-articles-page-contract.test.mjs`

Agent 3, entity workspace:

- Owns `data-query-app/pages/entities/[type].vue`
- Owns `data-query-app/pages/entities/town-npcs/**`
- Owns `data-query-app/components/TownNpcWorkbenchModal.vue`
- Owns entity-specific contract tests: `biome-admin-detail-contract.test.mjs`, `boss-detail-p2-contract.test.mjs`, `buff-inflicting-npc-visibility.test.mjs`, `npc-projection-json-visibility.test.mjs`, `world-context-admin-contract.test.mjs`
- Must not split `pages/entities/[type].vue` with another writer

Agent 4, recipes and item-group technical fields:

- Owns `data-query-app/pages/recipes/**`
- Owns `data-query-app/pages/items.vue`
- Owns `data-query-app/pages/item-groups.vue`
- Owns `data-query-app/components/ItemRecipeEditor.vue`
- Owns recipe/item-group contract tests
- May edit `data-query-app/stores/items.ts` and `data-query-app/stores/itemGroups.ts` only if store toast/error copy is required; no other agent may edit those files in parallel

Agent 5, operations pages:

- Owns `data-query-app/pages/operations/**`
- Owns operation tests: `admin-armor-attributes-page-contract.test.mjs`, `audio-assets-page-contract.test.mjs`, `crawler-monitor-page-contract.test.mjs`, `data-source-acceptance-page-contract.test.mjs`, `domain-acceptance-page-contract.test.mjs`
- Does not own `admin-table-components-contract.test.mjs` unless Agent 1 explicitly hands over a single assertion tied to an operation page.

Reviewer agent, read-only:

- Runs copy scan gate.
- Checks allowlist.
- Runs focused tests, then full `pnpm run test`.
- Does not edit files.

## Task 0: Baseline And Guardrails

**Files:**

- Read: `data-query-app/package.json`
- Read: `data-query-app/tests/*.test.mjs`
- No code writes

- [ ] **Step 1: Verify branch and worktree**

Run:

```bash
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/feat-admin-ui-chinese-ops-copy-2026-06-06
git status --short --branch
```

Expected: branch is `feat/admin-ui-chinese-ops-copy-2026-06-06` and worktree has only intentional plan/doc edits or is clean before implementation.

- [ ] **Step 2: Run baseline copy scan**

Run the command from `Copy Scan Gate`.

Expected: current output shows known English operator copy in article, user, shared layout, entity, recipe, and operations areas.

- [ ] **Step 3: Run targeted baseline contract tests**

Run:

```bash
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/feat-admin-ui-chinese-ops-copy-2026-06-06/data-query-app
node --test \
  tests/admin-articles-page-contract.test.mjs \
  tests/admin-table-components-contract.test.mjs \
  tests/admin-armor-attributes-page-contract.test.mjs \
  tests/audio-assets-page-contract.test.mjs \
  tests/crawler-monitor-page-contract.test.mjs \
  tests/data-source-acceptance-page-contract.test.mjs \
  tests/domain-acceptance-page-contract.test.mjs
```

Expected: tests pass on baseline before copy changes. If not, record existing failures before editing.

## Task 1: Add Shared Copy Contract

**Files:**

- Create: `data-query-app/tests/admin-ui-chinese-copy-contract.test.mjs`

- [ ] **Step 1: Create a contract test for stale English chrome**

Create `data-query-app/tests/admin-ui-chinese-copy-contract.test.mjs` with this complete content:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

const layout = read('layouts/default.vue')
const articles = read('pages/articles.vue')
const users = read('pages/users.vue')
const crawlerMonitor = read('pages/operations/crawler-monitor.vue')

test('admin shell uses Chinese section labels and workspace copy', () => {
  assert.match(layout, /label: '资料目录'/)
  assert.match(layout, /label: '制作管理'/)
  assert.match(layout, /label: '实体管理'/)
  assert.match(layout, /label: '世界数据'/)
  assert.match(layout, /label: '运营维护'/)
  assert.doesNotMatch(layout, />Workspace</)
  assert.doesNotMatch(layout, />Admin Workspace</)
  assert.doesNotMatch(layout, /label: 'Catalog'/)
  assert.doesNotMatch(layout, /label: 'Crafting'/)
  assert.doesNotMatch(layout, /label: 'Entities'/)
  assert.doesNotMatch(layout, /label: 'World'/)
  assert.doesNotMatch(layout, /label: 'Operations'/)
})

test('article and user workflows expose Chinese operator copy', () => {
  assert.match(articles, /文章管理/)
  assert.match(articles, /查看正文/)
  assert.match(articles, /提交审核/)
  assert.match(articles, /取消发布/)
  assert.match(users, /用户管理/)
  assert.match(users, /暂无用户/)
  assert.doesNotMatch(articles, /Article Management/)
  assert.doesNotMatch(articles, /View Content/)
  assert.doesNotMatch(articles, /No articles found/)
  assert.doesNotMatch(users, /No users found/)
})

test('crawler monitor primary operation labels are Chinese-first', () => {
  assert.match(crawlerMonitor, /爬取监控/)
  assert.match(crawlerMonitor, /刷新状态/)
  assert.match(crawlerMonitor, /暂无进度消息/)
  assert.match(crawlerMonitor, /暂无活动队列状态/)
  assert.doesNotMatch(crawlerMonitor, /Refresh State/)
  assert.doesNotMatch(crawlerMonitor, /No progress message yet\./)
  assert.doesNotMatch(crawlerMonitor, /No active queue state yet\./)
})
```

- [ ] **Step 2: Run the new test and confirm it fails before implementation**

Run:

```bash
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/feat-admin-ui-chinese-ops-copy-2026-06-06/data-query-app
node --test tests/admin-ui-chinese-copy-contract.test.mjs
```

Expected before implementation: FAIL because current UI still contains English copy.

## Task 2: Shared Shell And Common Components

**Files:**

- Modify: `data-query-app/layouts/default.vue`
- Modify only if needed: `data-query-app/components/AppModal.vue`
- Modify only if needed: `data-query-app/components/AppEmptyState.vue`
- Modify only if needed: `data-query-app/components/AppPagination.vue`
- Modify only if needed: `data-query-app/components/AdminTableShell.vue`
- Modify only if needed: `data-query-app/components/AdminDataTable.vue`
- Modify: `data-query-app/pages/index.vue`
- Modify: `data-query-app/pages/login.vue`
- Modify: `data-query-app/pages/categories.vue`
- Modify: `data-query-app/pages/item-rarities.vue`
- Modify: `data-query-app/pages/query.vue`
- Test: `data-query-app/tests/admin-table-components-contract.test.mjs`
- Test: `data-query-app/tests/admin-ui-chinese-copy-contract.test.mjs`

- [ ] **Step 1: Localize shared layout chrome**

Use these exact copy decisions:

```text
Workspace -> 工作台
Admin Workspace -> 管理工作台
Catalog -> 资料目录
Crafting -> 制作管理
Entities -> 实体管理
World -> 世界数据
Operations -> 运营维护
Shimmer Data -> Shimmer 数据
Projectile 管理 -> 射弹 / Projectile 管理
Armor Set 管理 -> Armor Set 管理
Overview -> 概览
ITEM CATALOG -> 物品目录
CATEGORY CONTROL -> 分类控制台
RARITY MANAGER -> 品质管理
```

Keep `TerraPedia Admin`, `NPC`, `Boss`, `Buff`, `Shimmer`, `Armor Set`, and `Projectile` where they are domain/product terms.

- [ ] **Step 2: Run only the shared-shell subtest**

Run:

```bash
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/feat-admin-ui-chinese-ops-copy-2026-06-06/data-query-app
node --test --test-name-pattern "admin shell uses Chinese section labels and workspace copy" tests/admin-ui-chinese-copy-contract.test.mjs
```

Expected after this task only: shell assertions pass. Do not run the full shared copy contract until all owners have completed their pages.

## Task 3: Article And User Workflow Copy

**Files:**

- Modify: `data-query-app/pages/articles.vue`
- Modify: `data-query-app/pages/article-editor-design.vue`
- Modify: `data-query-app/stores/articles.ts`
- Modify: `data-query-app/pages/users.vue`
- Modify: `data-query-app/stores/users.ts`
- Modify only visible copy: `data-query-app/components/article/ArticleEditorWorkspace.vue`
- Test: `data-query-app/tests/admin-articles-page-contract.test.mjs`
- Test: `data-query-app/tests/admin-ui-chinese-copy-contract.test.mjs`

- [ ] **Step 1: Localize article list workflow**

Use these copy decisions in `pages/articles.vue`:

```text
Article Management -> 文章管理
{total} articles -> {total} 篇文章
Manage review, publishing, and quick content inspection. -> 管理审核、发布和正文快速检查。
Search by title or summary -> 按标题或摘要搜索
All article status -> 全部文章状态
Draft -> 草稿
Published -> 已发布
Offline -> 已下线
Search -> 搜索
Reset -> 重置
Write Article -> 写文章
Loading... -> 加载中...
Cover -> 封面
Article -> 文章
State -> 状态
Timeline -> 时间线
Actions -> 操作
No cover -> 无封面
Review: -> 审核意见：
Submitted -> 提交
Published -> 发布
Updated -> 更新
View Content -> 查看正文
Send for Review -> 提交审核
Submitting... -> 提交中...
Approve -> 通过
Approving... -> 通过中...
Reject -> 驳回
Publish -> 发布
Publishing... -> 发布中...
Unpublish -> 取消发布
Unpublishing... -> 取消发布中...
Logs -> 日志
No articles found -> 暂无文章
Reject Article Review -> 驳回文章审核
Article: -> 文章：
Please enter reject reason -> 请输入驳回原因
Cancel -> 取消
Submit Reject -> 提交驳回
Article Content -> 文章正文
Loading article content... -> 正文加载中...
No article content -> 暂无文章正文
Review Logs -> 审核日志
Action -> 操作
From -> 原状态
To -> 新状态
Reviewer -> 审核人
Comment -> 备注
Created At -> 创建时间
No review logs -> 暂无审核日志
```

- [ ] **Step 2: Localize article status/action functions**

Use these labels:

```text
DRAFT -> 草稿
PENDING_REVIEW -> 待审核
APPROVED -> 已通过
REJECTED -> 已驳回
Read-only Editor -> 只读编辑器
Continue Writing -> 继续写作
Submit Review -> 提交审核
Review Approve -> 审核通过
Review Reject -> 审核驳回
Legacy Direct Publish -> 旧版直接发布
Reset To Draft -> 退回草稿
```

- [ ] **Step 3: Localize article store toasts and fallbacks**

Use these copy decisions in `stores/articles.ts`:

```text
Failed to load articles -> 加载文章失败
Article created -> 文章已创建
Article updated -> 文章已更新
Article status updated -> 文章状态已更新
Article submitted for review -> 文章已提交审核
Article approved -> 文章审核已通过
Article rejected -> 文章已驳回
Article published -> 文章已发布
Article taken offline -> 文章已下线
Upload response missing public URL -> 上传响应缺少公开 URL
Image upload failed -> 图片上传失败
```

- [ ] **Step 4: Localize user workflow copy**

Use these copy decisions in `pages/users.vue`:

```text
User Management -> 用户管理
Manage accounts, roles, and access state. -> 管理账号、角色与访问状态。
Search by username, nickname, or email -> 按用户名、昵称或邮箱搜索
All user status -> 全部用户状态
All roles -> 全部角色
Search -> 搜索
Reset -> 重置
Create User -> 新增用户
Loading... -> 加载中...
User -> 用户
Email -> 邮箱
Role -> 角色
Status -> 状态
Created At -> 创建时间
Actions -> 操作
Edit -> 编辑
Disable -> 禁用
Enable -> 启用
Delete -> 删除
No users found -> 暂无用户
User Form -> 用户表单
Username -> 用户名
Nickname -> 昵称
Password -> 密码
Cancel -> 取消
Submit -> 提交
Confirm delete -> 确认删除
```

Use these copy decisions in `stores/users.ts`:

```text
Failed to load users -> 加载用户失败
User created -> 用户已创建
User updated -> 用户已更新
User status updated -> 用户状态已更新
User deleted -> 用户已删除
```

Keep role/status enum payload values unchanged.

- [ ] **Step 5: Localize article design-board copy**

Use these copy decisions in `pages/article-editor-design.vue` and matching assertions in `tests/admin-articles-page-contract.test.mjs`:

```text
Article Editor Structure Drafts -> 文章编辑结构稿
Live Article Data -> 真实文章数据
Document First -> 正文优先
Production Desk -> 生产工作台
Review Studio -> 审核工作室
```

- [ ] **Step 6: Update article contract tests**

Update `tests/admin-articles-page-contract.test.mjs` so it asserts the new Chinese labels instead of preserving English:

```text
View Content -> 查看正文
Read-only Editor -> 只读编辑器
Continue Writing -> 继续写作
Unpublishing... -> 取消发布中...
Unpublish -> 取消发布
Cover -> 封面
Article -> 文章
State -> 状态
Timeline -> 时间线
Document First -> 正文优先
Production Desk -> 生产工作台
Review Studio -> 审核工作室
```

- [ ] **Step 7: Run article/user tests**

Run:

```bash
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/feat-admin-ui-chinese-ops-copy-2026-06-06/data-query-app
node --test tests/admin-articles-page-contract.test.mjs
node --test --test-name-pattern "article and user workflows expose Chinese operator copy" tests/admin-ui-chinese-copy-contract.test.mjs
```

Expected: PASS after this task and Task 2 are complete.

## Task 4: Operations Pages Copy

**Files:**

- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/pages/operations/crawler-monitor-test.vue`
- Modify: `data-query-app/pages/operations/data-source-acceptance.vue`
- Modify: `data-query-app/pages/operations/domain-acceptance.vue`
- Modify: `data-query-app/pages/operations/audio-assets.vue`
- Modify: `data-query-app/pages/operations/armor-attributes.vue`
- Test: matching operation contract tests

- [ ] **Step 1: Localize crawler monitor operator labels**

Use these copy decisions:

```text
CRAWLER MONITOR -> 爬取监控
live refresh -> 实时刷新
Active task -> 活动任务
Progress -> 进度
Pending -> 待处理
ETA -> 预计剩余
Queue -> 队列
Recent runs -> 最近运行
Refresh State -> 刷新状态
TASKS -> 任务
RUNNING -> 运行中
QUEUED -> 队列中
FAILED -> 失败
No progress message yet. -> 暂无进度消息。
No active queue state yet. -> 暂无活动队列状态。
completed / failed -> 已完成 / 失败
```

Keep backend status values when they are raw payload text, but translate visible labels around them.

- [ ] **Step 2: Localize acceptance and asset page headings**

Use these copy decisions:

```text
DATA SOURCE ACCEPTANCE -> 数据源验收
DOMAIN ACCEPTANCE -> B 档域验收
Execution policy -> 执行策略
AUDIO PROFILE -> 音频档案
Raw Cells -> 原始单元格
statKey -> 属性键 statKey
classScope -> 职业范围 classScope
valueDecimal -> 数值 valueDecimal
unit -> 单位 unit
rawText -> 原始文本 rawText
parseStatus -> 解析状态 parseStatus
```

- [ ] **Step 3: Update operation contract tests**

Update tests that intentionally assert old English copy:

```bash
tests/admin-armor-attributes-page-contract.test.mjs
tests/audio-assets-page-contract.test.mjs
tests/crawler-monitor-page-contract.test.mjs
tests/data-source-acceptance-page-contract.test.mjs
tests/domain-acceptance-page-contract.test.mjs
```

Keep tests that assert raw source keys or backend status enum behavior.

- [ ] **Step 4: Run operation contract tests**

Run:

```bash
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/feat-admin-ui-chinese-ops-copy-2026-06-06/data-query-app
node --test \
  tests/admin-armor-attributes-page-contract.test.mjs \
  tests/audio-assets-page-contract.test.mjs \
  tests/crawler-monitor-page-contract.test.mjs \
  tests/data-source-acceptance-page-contract.test.mjs \
  tests/domain-acceptance-page-contract.test.mjs \
  tests/admin-ui-chinese-copy-contract.test.mjs
```

Expected: PASS.

## Task 5: Entity Workspace Copy

**Files:**

- Modify: `data-query-app/pages/entities/[type].vue`
- Modify: `data-query-app/pages/entities/town-npcs/**`
- Modify: `data-query-app/components/TownNpcWorkbenchModal.vue`
- Test: entity-related contract tests

- [ ] **Step 1: Localize visible helper and action copy**

Use these representative decisions:

```text
English name retained -> 保留英文名
Internal name preserved -> 保留内部标识
Format JSON -> 格式化 JSON
Raw JSON -> 原始 JSON rawJson
Invalid JSON -> JSON 格式无效
Submit failed -> 提交失败
Confirm delete # -> 确认删除 #
Delete failed -> 删除失败
Preview available -> 可预览
Source Page -> 来源页 sourcePage
Source Provider -> 来源提供方 sourceProvider
Source Revision Timestamp -> 来源修订时间 sourceRevisionTimestamp
AI Style -> AI 样式 aiStyle
Source Items JSON -> 来源物品 JSON sourceItemsJson
Immune NPC Sample JSON -> 免疫 NPC 样例 JSON immuneNpcSample
```

Visible badge copy must be Chinese-first. Replace stylistic standalone badges such as `BUFF SYSTEM`, `BIOME ATLAS`, `NPC DIRECTORY`, `BOSS ARCHIVE`, `PROJECTILE LAB`, and `WORLD CONTEXT` with labels like `Buff 系统`, `群系图谱`, `NPC 目录`, `Boss 档案`, `射弹实验室`, and `世界条件`.

- [ ] **Step 2: Localize town NPC workspace badges**

Use these copy decisions in `pages/entities/town-npcs/**` and `components/TownNpcWorkbenchModal.vue`:

```text
TOWN NPC WORKBENCH -> 城镇 NPC 工作台
TOWN NPC EDITOR -> 城镇 NPC 编辑器
TOWN NPC DETAIL -> 城镇 NPC 详情
SHOP ITEMS -> 商店物品
MATCHED -> 已匹配
UNMATCHED -> 未匹配
Current Shop Items -> 当前商店物品
Wiki Suggestions -> Wiki 建议
No matched items -> 暂无匹配物品
```

- [ ] **Step 3: Run entity contract tests**

Run:

```bash
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/feat-admin-ui-chinese-ops-copy-2026-06-06/data-query-app
node --test \
  tests/biome-admin-detail-contract.test.mjs \
  tests/boss-detail-p2-contract.test.mjs \
  tests/buff-inflicting-npc-visibility.test.mjs \
  tests/npc-projection-json-visibility.test.mjs \
  tests/world-context-admin-contract.test.mjs \
  tests/admin-ui-chinese-copy-contract.test.mjs
```

Expected: PASS.

## Task 6: Recipe, Item, And Item Group Copy

**Files:**

- Modify: `data-query-app/pages/recipes/**`
- Modify: `data-query-app/pages/item-groups.vue`
- Modify: `data-query-app/pages/items.vue`
- Modify: `data-query-app/components/ItemRecipeEditor.vue`
- Modify only if needed: `data-query-app/stores/items.ts`
- Modify only if needed: `data-query-app/stores/itemGroups.ts`
- Test: recipe/item tests

- [ ] **Step 1: Localize operator labels while preserving recipe domain tokens**

Use these decisions:

```text
ITEM CATALOG -> 物品目录
Total Items -> 物品总数
Visible -> 当前可见
Selection -> 已选择
Keyword -> 关键词
Rarity -> 品质
Period -> 时期
Category -> 分类
Collection -> 收藏
Desktop version only -> 仅桌面版
Any Wood -> 任意木材
Iron Bar -> 铁锭
Environment -> 环境
Alternative -> 替代配方
Legacy -> 旧版
required -> 必需
optional -> 可选
Canonical Name -> 标准名称 Canonical Name
Create Row -> 新增记录
Enabled -> 启用
Disabled -> 禁用
Invalid JSON -> JSON 格式无效
```

Keep provider values such as `manual_admin` unchanged.

- [ ] **Step 2: Run recipe/item contract tests**

Run:

```bash
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/feat-admin-ui-chinese-ops-copy-2026-06-06/data-query-app
node --test \
  tests/item-groups-page-contract.test.mjs \
  tests/items-progress-column.test.mjs \
  tests/admin-ui-chinese-copy-contract.test.mjs
```

Expected: PASS.

## Task 7: Final Review And Integration Validation

**Files:**

- Read-only review over `data-query-app/**`
- No new feature files unless a failed check requires a plan repair

- [ ] **Step 1: Run final copy scan**

Run the command from `Copy Scan Gate`.

Expected: no non-allowlisted visible English. Any remaining result must be classified as one of:

```text
allowlisted domain term
allowlisted schema/API token
test negative assertion
implementation identifier
needs fix before completion
```

- [ ] **Step 2: Run targeted contract tests**

Run:

```bash
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/feat-admin-ui-chinese-ops-copy-2026-06-06/data-query-app
node --test \
  tests/admin-ui-chinese-copy-contract.test.mjs \
  tests/admin-articles-page-contract.test.mjs \
  tests/admin-table-components-contract.test.mjs \
  tests/admin-armor-attributes-page-contract.test.mjs \
  tests/audio-assets-page-contract.test.mjs \
  tests/crawler-monitor-page-contract.test.mjs \
  tests/data-source-acceptance-page-contract.test.mjs \
  tests/domain-acceptance-page-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run full admin quality gate**

Run:

```bash
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/feat-admin-ui-chinese-ops-copy-2026-06-06/data-query-app
pnpm run test
```

Expected: PASS. This includes `pnpm run check`, `pnpm run test:unit`, and `pnpm run build`.

- [ ] **Step 4: Manual smoke targets**

If the local stack is already running from this worktree or the user asks for runtime verification, smoke these routes:

```text
/
/login
/items
/categories
/item-rarities
/articles
/article-editor-design
/users
/recipes/shimmer
/item-groups
/entities/npcs
/entities/projectiles
/entities/town-npcs
/operations/crawler-monitor
/operations/data-source-acceptance
/operations/domain-acceptance
/operations/audio-assets
/operations/armor-attributes
```

Expected: operator chrome and workflow labels are Chinese-first; allowlisted terms remain readable and intentional.

## Gap Handling

If an agent finds a surface with significant English copy not covered by its file ownership:

1. Do not edit outside ownership.
2. Record exact file path and representative copy.
3. Ask coordinator to assign it to the owning agent or repair this plan.
4. Re-run the affected task tests and final copy scan after repair.

If a test fails because it asserts old English copy:

1. Confirm the copy is intentionally localized under Approach A.
2. Update the test literal to the new Chinese copy.
3. Keep structural assertions intact.

If a term is ambiguous:

1. Use Chinese-first plus field token, for example `来源页 sourcePage`.
2. Add the survivor token to the final review allowlist note only if visible English remains.

## Pre-Commit Checklist

Before committing implementation, run:

```bash
cd /home/lolben/.config/superpowers/worktrees/TerraPedia/feat-admin-ui-chinese-ops-copy-2026-06-06
git status --short
git diff --cached --stat
```

Only stage files touched for this localization task. Do not use `git add .`.
