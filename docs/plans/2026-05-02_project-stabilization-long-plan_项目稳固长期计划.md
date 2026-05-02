# TerraPedia 项目稳固长期计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` when implementing this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在继续扩展前台公开功能前，把 TerraPedia 的数据来源、关系链路、质量门禁、管理端验收和发布准入收敛成可重复执行、可审计、可并行交付的稳定底座。

**Architecture:** 本计划按“数据可信输入层 -> 关系与投影层 -> 后端/管理端验收层 -> 前台发布准入层 -> 本地/CI 质量门禁”组织。每个工作流都必须有入口文件、验收报告、最小测试命令和可回滚边界；大功能只在对应底座达到准入信号后进入开发。

**Tech Stack:** Spring Boot 3.2 + Java 17 + MyBatis Plus + Flyway, Vue 3 + Vite, Nuxt 4, Node.js data scripts, PowerShell local stack scripts, MySQL `terria_v1_local`, Redis.

---

## 1. 当前判断

### 1.1 阶段结论

当前项目不应进入大规模前台功能扩张。主线应以 Phase B“数据治理与管理闭环”收口为主，同时允许低风险小功能并行。

推荐资源分配：

- 70%：稳固数据来源、关系链路、质量门禁、管理端验收。
- 30%：低依赖功能，包括 NPC 前台体验打磨、SEO/meta、空态/错误态、文章消费链路、管理端只读验收面板。

### 1.2 已稳定的能力

- 三端结构明确：`back/`、`front/`、`data-query-app/`、`scripts/`、`data/`、`docs/`、`project-plan/`、`reports/`。
- 本地入口已存在：`scripts/dev/start-local-stack.ps1`、`scripts/dev/stop-local-stack.ps1`、`scripts/dev/verify-local-stack.ps1`。
- 标准化数据已覆盖核心实体：items 6131、item_pages 6131、item_relations 14746、buffs 388、npcs 762、projectiles 1111、armor_sets 18、biomes 7。
- 后端管理域覆盖较宽：item、recipe、npc、boss、buff、projectile、biome、shimmer、item group、relation compatibility、crawler monitor、article、user。
- 前台已有公开消费主线：物品、NPC、文章、用户。
- 近期关系与来源补洞已有落地：Buff 来源物品显示、NPC-Buff 关系回填、Any Item Group 来源审计。

### 1.3 尚不稳定的能力

- `data/canonical/` 仍是目标结构，历史可信数据尚未完全迁入。
- 关系报告仍有 warning，例如 `unresolved_item_npc_relation_audits = 2602`。
- Any Item Group 仍有 duplicate group keys 和 blocked group。
- 管理端验收面不足，很多质量信号停留在报告或接口层。
- `front` 默认 `test` 不跑 Vitest；`data-query-app` 有 `tests/*.test.mjs` 但没有正式 test 脚本。
- `verify-local-stack.ps1` 只做 compile/typecheck，没有跑后端测试、前台单测、管理端测试、前端 build。
- 仓库未见 CI 门禁，质量主要依赖本地人工执行。

---

## 2. 稳固总原则

1. 数据先于页面：任何公开页面不得绕过数据来源与关系验收。
2. 管理端先于前台：新实体公开前，管理端必须能看见对应数据质量、来源、缺口和样本。
3. 报告先于写库：数据任务必须先 dry-run 或审计报告，再 apply。
4. 快速门禁先于全量门禁：本地开发保留快速预检，但合并前必须有完整质量门禁。
5. 小步功能允许并行：不依赖底座的体验类工作可以推进，但不能掩盖数据 warning。
6. 同一写入目标串行：同一脚本、同一 DB 表、同一页面区块、同一配置入口不得多 agent 同时写。

---

## 3. 文件与职责地图

### 3.1 计划与流程文档

- Modify: `README.md`
  - 增加本地质量门禁、启动、smoke、失败排查入口。
- Modify: `project-plan/00_协作开发标准流程.md`
  - 增加新的质量门禁命令、数据准入规则、前台功能准入规则。
- Create: `docs/runbooks/local-acceptance.md`
  - 固化提交前、启动前、启动后、本地联调、失败排查流程。
- Create: `docs/audits/data-quality-index.md`
  - 索引长期有效的数据质量报告、relation health、source group audit、实体完整性审计。

### 3.2 工程质量门禁

- Create: `scripts/dev/quality-gate.ps1`
  - 一条命令串起后端测试、前台 check/unit/build、管理端 check/unit/build。
- Modify: `scripts/dev/verify-local-stack.ps1`
  - 保留快速预检，新增 `-Full` 完整模式。
- Modify: `scripts/dev/start-local-stack.ps1`
  - 修正 profile 一致性、日志目录、启动后 smoke 接入。
- Create: `scripts/dev/smoke-local-stack.ps1`
  - 启动后验证后端 HTTP、前台首页、管理端首页和关键 API。
- Modify: `front/package.json`
  - 让默认 `test` 包含 typecheck、Vitest、build。
- Modify: `data-query-app/package.json`
  - 增加 `test:unit` 和包含 check/unit/build 的默认 `test`。
- Modify: `back/pom.xml`
  - 固化 Maven test runner；覆盖率阈值先只报告，不作为初始阻断。
- Create: `.github/workflows/quality-gate.yml`
  - CI 使用与本地 `quality-gate.ps1` 等价的命令。

### 3.3 数据治理与来源可信层

- Modify: `data/canonical/README.md`
  - 明确 canonical 迁移边界、可信输入定义、例外流程。
- Create: `docs/audits/canonical-migration-boundary.md`
  - 列出现阶段哪些数据仍允许从 standardized/generated 读取，哪些必须进入 canonical。
- Create: `scripts/data/canonical/audit-canonical-readiness.mjs`
  - 只读审计 canonical 准备度，不写 DB。
- Create: `scripts/data/canonical/audit-canonical-readiness.test.mjs`
  - 覆盖 canonical readiness 输出。
- Modify: `scripts/data/README.md`
  - 把数据写入任务准入条件写成固定清单。
- Modify: `scripts/data/crawler/README.md`
  - 明确 `data/wiki-crawler/src` 到 `scripts/data/crawler` 的迁移顺序和兼容窗口。

### 3.4 Relation 与 source group 稳定层

- Modify: `scripts/data/relation/relation-health-report.test.mjs`
  - 固化 blocking/warning 的断言模型。
- Modify: `scripts/data/relation/relation-report.test.mjs`
  - 增加 unresolved 输出字段契约测试。
- Modify: `scripts/data/audit/audit-any-item-group-sources.mjs`
  - 输出 duplicate group key 的治理建议和 owner source。
- Modify: `scripts/data/audit/audit-any-item-group-sources.test.mjs`
  - 覆盖 duplicate、blocked、source-backed 三类输出。
- Create: `docs/audits/relation-warning-policy.md`
  - 定义哪些 warning 阻塞公开页面，哪些允许带解释上线。

### 3.5 管理端验收入口

- Create: `data-query-app/pages/operations/data-quality.vue`
  - 汇总 relation health、source group audit、crawler monitor、recipe import、shimmer 状态。
- Modify: `data-query-app/pages/entities/[type].vue`
  - 对 projectile、buff、npc 等详情加入来源、空来源、JSON 解析失败、warning 标记。
- Modify: `data-query-app/pages/entities/town-npcs/index.vue`
  - 增加批量校验摘要：缺图、缺入住条件、商店关系缺口、冲突样本。
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminRelationCompatibilityController.java`
  - 为管理端数据质量页提供稳定 JSON payload。
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminRelationCompatibilityControllerTest.java`
  - 覆盖 blocking/warning/count/sample 字段。

### 3.6 前台功能准入

- Modify: `front/src/router/routes.ts`
  - 在新增公开实体页面前检查路由、404、详情 fallback。
- Modify: `front/src/api/index.ts`
  - 对新增公开实体先建立 list/detail/aggregate API 契约。
- Modify: `front/src/api/itemAggregate.ts`
  - 保持 item aggregate 错误处理和 fallback 作为新实体参考。
- Modify: `front/src/api/npcDomain.ts`
  - 作为 NPC 前台准入基线，补充边界样本测试。
- Modify: `front/src/views/NpcListView.vue`
  - 优先做低风险体验打磨和空态/错误态。
- Modify: `front/src/views/NpcDetailView.vue`
  - 补 aggregate 缺字段、404、加载态、移动端溢出验收。
- Create: `docs/runbooks/public-page-readiness.md`
  - 定义公开页面上线前 checklist。

---

## 4. 里程碑总览

### Milestone 0：计划落地与基线冻结

**目标：** 确认当前主线干净、当前数据质量报告可追踪、后续执行有单一计划入口。

**进入条件：**

- `git status --short` 为空，或已有改动与本计划明确无关。
- 当前计划文件已进入 `docs/plans/`。

**任务：**

- [ ] 运行 `git status --short --branch`，确认当前分支和工作区状态。
- [ ] 把本计划作为项目稳固主计划，后续子计划必须引用本文件。
- [ ] 建立 `docs/audits/data-quality-index.md`，索引长期有效报告：
  - `reports/relation/relation-health-2026-04-30.md`
  - `reports/relation/relation-audit-2026-05-01.md`
  - `reports/item-groups/any-item-group-source-audit-2026-05-01.md`
  - `reports/data/npc-buff-relations-backfill-2026-05-01.json`
  - `reports/实体数据完整性审计_2026-04-22.json`

**验证：**

```powershell
git status --short
Test-Path .\docs\plans\2026-05-02_project-stabilization-long-plan_项目稳固长期计划.md
```

**并行性：** 串行，由主线 agent 完成。

---

### Milestone 1：质量门禁收敛

**目标：** 让后端、前台、管理端的检查通过一条本地命令和一条 CI 命令重复执行。

#### Task 1.1：前台默认测试包含 Vitest

**Files:**

- Modify: `front/package.json`
- Test: `front/src/tests/*.spec.ts`

**Steps:**

- [ ] 将 `front/package.json` 的 `test` 改成 `pnpm run check && pnpm run test:unit && pnpm run build`。
- [ ] 保留 `test:unit` 为 `vitest run`。
- [ ] 运行前台默认测试。

**Validation:**

```powershell
cd front
pnpm run test
```

**Expected:** Typecheck、Vitest、Vite build 全部通过。

**Parallel:** 可与 Task 1.2、Task 1.3 并行；只允许一个 agent 写 `front/package.json`。

#### Task 1.2：管理端补正式测试脚本

**Files:**

- Modify: `data-query-app/package.json`
- Test: `data-query-app/tests/*.test.mjs`

**Steps:**

- [ ] 增加 `test:unit`：`node --test tests/*.test.mjs`。
- [ ] 将 `test` 改成 `pnpm run check && pnpm run test:unit && pnpm run build`。
- [ ] 运行管理端默认测试。

**Validation:**

```powershell
cd data-query-app
pnpm run test
```

**Expected:** Nuxt typecheck、Node test、Nuxt build 全部通过。

**Parallel:** 可与 Task 1.1、Task 1.3 并行；只允许一个 agent 写 `data-query-app/package.json`。

#### Task 1.3：后端测试 runner 固化

**Files:**

- Modify: `back/pom.xml`
- Test: `back/src/test/java/**`

**Steps:**

- [ ] 在 `back/pom.xml` 固化 Maven Surefire 配置，使用当前 JUnit/Spring Boot test。
- [ ] 先不设置阻断性覆盖率阈值。
- [ ] 运行后端测试。

**Validation:**

```powershell
cd back
mvn test
```

**Expected:** 后端测试全部通过；失败时按具体 test 拆子任务，不扩大修改范围。

**Parallel:** 可与前端/管理端脚本任务并行；不得同时修改 `back/pom.xml` 的其他构建逻辑。

#### Task 1.4：新增统一质量门禁脚本

**Files:**

- Create: `scripts/dev/quality-gate.ps1`
- Modify: `README.md`
- Modify: `project-plan/00_协作开发标准流程.md`

**Steps:**

- [ ] 脚本依次运行后端 `mvn test`、前台 `pnpm run test`、管理端 `pnpm run test`。
- [ ] 增加 `-SkipBack`、`-SkipFront`、`-SkipAdmin` 参数，便于局部执行。
- [ ] README 写入提交前命令。
- [ ] SOP 写入“提交前最小门禁”和“完整门禁”区别。

**Validation:**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\quality-gate.ps1
```

**Expected:** 三端门禁顺序执行，任一失败立即退出非零码。

**Parallel:** 串行，必须在 Task 1.1、Task 1.2、Task 1.3 的命令稳定后执行。

#### Task 1.5：CI 与本地门禁等价

**Files:**

- Create: `.github/workflows/quality-gate.yml`
- Modify: `README.md`

**Steps:**

- [ ] CI 安装 Java、Node、pnpm。
- [ ] CI 运行与本地等价的后端、前台、管理端测试命令。
- [ ] README 写明 CI 失败时先本地运行 `scripts/dev/quality-gate.ps1`。

**Validation:**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\quality-gate.ps1
```

**Expected:** 本地门禁通过后，CI 命令没有额外隐藏步骤。

**Parallel:** CI 文件草案可并行起草；最终接入必须等 Task 1.4 稳定。

---

### Milestone 2：本地启动链路可观测

**目标：** 本地启动不仅能打开端口，还能明确说明启动了什么、日志在哪、使用哪个 profile、关键 HTTP 是否可访问。

#### Task 2.1：verify-local-stack 增加完整模式

**Files:**

- Modify: `scripts/dev/verify-local-stack.ps1`

**Steps:**

- [ ] 保留默认快速模式：DB TCP、Mapper XML、后端 compile、前台 check、管理端 check。
- [ ] 增加 `-Full`：运行后端 `mvn test`、前台 `pnpm run test`、管理端 `pnpm run test`。
- [ ] 输出每一步的 cwd、cmd、结果。

**Validation:**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\verify-local-stack.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\verify-local-stack.ps1 -Full
```

**Expected:** 默认模式适合启动前快速检查，`-Full` 适合提交前完整检查。

**Parallel:** 串行，避免与启动脚本同时改共享函数。

#### Task 2.2：start-local-stack 修正 profile 与日志目录

**Files:**

- Modify: `scripts/dev/start-local-stack.ps1`
- Modify: `scripts/dev/stop-local-stack.ps1`
- Modify: `README.md`

**Steps:**

- [ ] 将日志目录从 `reports/local-start` 迁移到 `reports/runtime/local-start`。
- [ ] 保持旧目录读取兼容一个版本窗口，避免已有排查习惯断裂。
- [ ] 使用配置解析出的 `$springProfile`，不要在 Maven 命令里写死 `legacy`。
- [ ] 启动输出打印 backend/front/admin/redis 的端口、PID、日志路径。

**Validation:**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\start-local-stack.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\stop-local-stack.ps1
```

**Expected:** 日志写入 `reports/runtime/local-start`，profile 与配置一致，stop 能停掉记录的 PID。

**Parallel:** 串行，涉及端口生命周期和本地进程。

#### Task 2.3：新增启动后 smoke

**Files:**

- Create: `scripts/dev/smoke-local-stack.ps1`
- Modify: `scripts/dev/start-local-stack.ps1`
- Modify: `docs/runbooks/local-acceptance.md`

**Steps:**

- [ ] smoke 检查后端稳定 HTTP endpoint。
- [ ] smoke 检查前台首页。
- [ ] smoke 检查管理端首页。
- [ ] smoke 输出失败 endpoint、HTTP status、日志提示路径。
- [ ] start 脚本启动完成后提示如何运行 smoke，不在默认启动中强制阻断。

**Validation:**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\smoke-local-stack.ps1
```

**Expected:** 服务已启动时 smoke 通过；服务未启动时输出明确失败原因。

**Parallel:** 需等 Task 2.2 后执行。

---

### Milestone 3：Canonical 与数据来源准入

**目标：** 明确“哪些数据已经可信、哪些仍是过渡来源、哪些不能直接支撑公开功能”。

#### Task 3.1：Canonical 边界文档

**Files:**

- Modify: `data/canonical/README.md`
- Create: `docs/audits/canonical-migration-boundary.md`
- Modify: `scripts/data/README.md`

**Steps:**

- [ ] 列出当前可作为可信输入的目录：`data/canonical/`、明确豁免的 `data/standardized/`、明确豁免的 `data/generated/`。
- [ ] 为每个豁免来源写明消费者、迁移目标、验收方式。
- [ ] 写入规则：新写库脚本默认不得直接读取 raw/normalized/generated，除非在边界文档登记。

**Validation:**

```powershell
Test-Path .\docs\audits\canonical-migration-boundary.md
Select-String -Path .\data\canonical\README.md -Pattern "canonical"
```

**Expected:** 后续数据任务能从文档判断输入来源是否合法。

**Parallel:** 可由文档 agent 执行；不得同时修改 `scripts/data/README.md` 的 workflow 命令部分。

#### Task 3.2：Canonical readiness 审计脚本

**Files:**

- Create: `scripts/data/canonical/audit-canonical-readiness.mjs`
- Create: `scripts/data/canonical/audit-canonical-readiness.test.mjs`
- Modify: `scripts/data/canonical/README.md`

**Steps:**

- [ ] 脚本只读扫描 canonical、standardized、generated 的关键数据集。
- [ ] 输出 JSON summary：dataset、currentSource、trustedStatus、recordCount、missingCanonicalReason。
- [ ] 测试覆盖 canonical present、fallback allowed、missing source 三类情况。

**Validation:**

```powershell
node --test scripts/data/canonical/audit-canonical-readiness.test.mjs
node scripts/data/canonical/audit-canonical-readiness.mjs --format=json
```

**Expected:** 审计脚本不写 DB，不修改数据文件，输出可被 docs/audits 索引。

**Parallel:** 可与 Task 3.1 并行起草，最终 README 更新需合并一次。

#### Task 3.3：爬虫源码迁移计划固化

**Files:**

- Modify: `scripts/data/crawler/README.md`
- Create: `docs/plans/wiki-crawler-source-migration-plan.md`

**Steps:**

- [ ] 写清当前源码仍在 `data/wiki-crawler/src` 和 `data/wiki-crawler/tests`。
- [ ] 迁移顺序固定为：路径兼容层、源码迁移、测试迁移、旧目录只保留数据产物。
- [ ] 明确本计划不直接移动爬虫源码，只创建后续迁移准入。

**Validation:**

```powershell
Test-Path .\docs\plans\wiki-crawler-source-migration-plan.md
Select-String -Path .\scripts\data\crawler\README.md -Pattern "data/wiki-crawler"
```

**Expected:** 任何迁移执行前都有独立计划和兼容窗口。

**Parallel:** 可与 canonical 文档并行。

---

### Milestone 4：Relation 与 source group warning 收口

**目标：** 把 relation warning 从“报告里知道”升级为“有分级、有 owner、有管理端可见状态”。

#### Task 4.1：Relation warning policy

**Files:**

- Create: `docs/audits/relation-warning-policy.md`
- Modify: `project-plan/00_项目总览.md`

**Steps:**

- [ ] 定义 blocking：数据会导致公开页面错误、关系冲突、来源不可追踪。
- [ ] 定义 warning：数据可运行但展示需隐藏、降级或加解释。
- [ ] 定义 info：只用于趋势观察。
- [ ] 把 `unresolved_item_npc_relation_audits` 归入 warning，并写清公开功能准入影响。

**Validation:**

```powershell
Test-Path .\docs\audits\relation-warning-policy.md
Select-String -Path .\docs\audits\relation-warning-policy.md -Pattern "unresolved_item_npc_relation_audits"
```

**Expected:** 后续公开页面排期能引用 warning policy 做 go/no-go 判断。

**Parallel:** 可与 Task 4.2 并行。

#### Task 4.2：Relation 报告字段契约测试

**Files:**

- Modify: `scripts/data/relation/relation-health-report.test.mjs`
- Modify: `scripts/data/relation/relation-report.test.mjs`

**Steps:**

- [ ] 测试 relation health 输出包含 blocking count、warning count、check name、status、message。
- [ ] 测试 unresolved 报告输出包含 relation type、trace、sample count。
- [ ] 保留现有报告格式兼容，新增字段不得破坏旧消费者。

**Validation:**

```powershell
node --test scripts/data/relation/relation-health-report.test.mjs
node --test scripts/data/relation/relation-report.test.mjs
```

**Expected:** 报告字段稳定，管理端可安全消费。

**Parallel:** 可由数据脚本 agent 执行；不得同时改 relation processor 写入逻辑。

#### Task 4.3：Any Item Group duplicate/blocked 治理

**Files:**

- Modify: `scripts/data/audit/audit-any-item-group-sources.mjs`
- Modify: `scripts/data/audit/audit-any-item-group-sources.test.mjs`
- Create: `docs/audits/any-item-group-source-policy.md`

**Steps:**

- [ ] 报告 duplicate group key 的两个来源文件。
- [ ] 为 duplicate 输出 recommendedOwner。
- [ ] 对 blocked group 输出 block reason 和需要的 source-backed member list。
- [ ] 文档规定 source-backed 优先级高于 derived-from-source。

**Validation:**

```powershell
node --test scripts/data/audit/audit-any-item-group-sources.test.mjs
node scripts/data/audit/audit-any-item-group-sources.mjs
```

**Expected:** Duplicate 与 blocked 不再只是列表，而是可执行治理项。

**Parallel:** 可与 relation warning policy 并行；不得与 item group 导入脚本同写。

---

### Milestone 5：管理端发布前验收面

**目标：** 让数据质量从报告文件变成管理端可读、可跳转、可决定是否发布的验收入口。

#### Task 5.1：数据质量总览页

**Files:**

- Create: `data-query-app/pages/operations/data-quality.vue`
- Modify: `data-query-app/pages/index.vue`
- Modify: `data-query-app/utils` 或现有 API helper 文件，按现有结构选择落位。

**Steps:**

- [ ] 页面展示 relation health：blocking、warning、info。
- [ ] 页面展示 Any Item Group：total、duplicate、blocked。
- [ ] 页面展示 crawler monitor 当前状态入口。
- [ ] 页面展示 recipe import 与 shimmer 入口链接。
- [ ] 首页增加“数据质量”入口。

**Validation:**

```powershell
cd data-query-app
pnpm run test
```

**Runtime Check:**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\start-local-stack.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\smoke-local-stack.ps1
```

**Expected:** 管理端能看到质量总览；任一 warning 以非成功状态显示。

**Parallel:** 可由管理端 agent 执行；后端 payload 任务独立但接口字段需先约定。

#### Task 5.2：Relation compatibility 稳定 payload

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/controller/AdminRelationCompatibilityController.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminRelationCompatibilityControllerTest.java`

**Steps:**

- [ ] Payload 包含 domain、blockingCount、warningCount、checks、sampleLinks。
- [ ] Controller test 覆盖 pass、warning、blocking 三类状态。
- [ ] 不在 controller 内读取大型原始 JSON；优先读取轻量报告或 service summary。

**Validation:**

```powershell
cd back
mvn "-Dtest=AdminRelationCompatibilityControllerTest" test
```

**Expected:** 管理端可消费稳定字段，不解析报告私有结构。

**Parallel:** 可与 Task 5.1 并行，但字段契约需主线先确认。

#### Task 5.3：Projectile 来源验收强化

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/controller/AdminProjectileController.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminProjectileControllerTest.java`
- Modify: `data-query-app/pages/entities/[type].vue`

**Steps:**

- [ ] 后端详情 payload 返回 sourceItems、sourceNpcs、source counts。
- [ ] JSON 解析失败时返回空数组和 warning 字段，不把原始异常暴露给前端。
- [ ] 管理端详情显示来源 item/npc 数量、空来源、异常 JSON。
- [ ] 样本验收引用 projectile source relation 里程碑。

**Validation:**

```powershell
cd back
mvn "-Dtest=AdminProjectileControllerTest" test
cd ..\data-query-app
pnpm run test
```

**Expected:** Projectile 管理端详情能作为公开页面前置验收入口。

**Parallel:** 后端 controller 与管理端展示可拆 agent，但同一文件不得多人同时写。

#### Task 5.4：城镇 NPC 批量校验摘要

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/controller/AdminTownNpcMaintenanceController.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminTownNpcMaintenanceControllerTest.java`
- Modify: `data-query-app/pages/entities/town-npcs/index.vue`

**Steps:**

- [ ] 后端 summary 返回 total、missingImages、missingHousingConditions、shopRelationGaps、conflictSamples。
- [ ] 管理端列表页展示 summary，并能跳转到对应详情/编辑。
- [ ] 保持现有 town NPC 编辑流程不变。

**Validation:**

```powershell
cd back
mvn "-Dtest=AdminTownNpcMaintenanceControllerTest" test
cd ..\data-query-app
pnpm run test
```

**Expected:** 城镇 NPC Phase B 验收项从文档进入可见界面。

**Parallel:** 可与 relation compatibility 页面并行；后端同一 controller 串行。

---

### Milestone 6：前台公开功能准入

**目标：** 明确哪些前台功能可以做，哪些必须等底座稳定。

#### Task 6.1：公开页面准入 runbook

**Files:**

- Create: `docs/runbooks/public-page-readiness.md`
- Modify: `project-plan/00_协作开发标准流程.md`

**Checklist Content:**

- [ ] `front/src/router/routes.ts` 有列表页、详情页、404 兜底。
- [ ] `front/src/api/index.ts` 或独立 API 文件有 list/detail/aggregate 方法。
- [ ] 详情页优先走 public aggregate endpoint。
- [ ] 对应管理端已有维护入口。
- [ ] 后端有 public controller 或稳定 DTO。
- [ ] 至少验收 1 个普通样本、1 个边界样本、1 个不存在 id。
- [ ] 页面有 title/meta、加载态、空态、404、移动端不溢出。
- [ ] Relation health 无 blocking；warning 已解释或对应模块隐藏。

**Validation:**

```powershell
Test-Path .\docs\runbooks\public-page-readiness.md
Select-String -Path .\docs\runbooks\public-page-readiness.md -Pattern "Relation health"
```

**Expected:** 新公开页面开始前必须引用该 runbook。

**Parallel:** 可与管理端验收面并行。

#### Task 6.2：NPC 前台低风险打磨

**Files:**

- Modify: `front/src/views/NpcListView.vue`
- Modify: `front/src/views/NpcDetailView.vue`
- Modify: `front/src/api/npcDomain.ts`
- Modify: `front/src/tests/npc-domain-contract.spec.ts`
- Modify: `front/src/tests/npc-public-shell.spec.ts`

**Steps:**

- [ ] 补 NPC 列表空态、错误态、加载态。
- [ ] 补 NPC 详情 404 和 aggregate 缺字段降级。
- [ ] 单测覆盖 `/npcs` 和 `/public/npcs/{id}/aggregate` 的空态、404、字段兼容。

**Validation:**

```powershell
cd front
pnpm run test:unit
pnpm run build
```

**Expected:** 不新增大实体公开范围，只稳固已有 NPC 前台入口。

**Parallel:** 可与数据治理并行；同一 front view 串行。

#### Task 6.3：暂缓大功能清单

**Deferred Until Criteria:**

- Boss/Biome 公开详情页：需要 public aggregate controller 或稳定 DTO。
- Projectile 公开页：需要 relation dry-run、projection、controller test、管理端来源验收稳定。
- Buff 公开页：需要来源物品、施加 NPC、免疫 NPC 等关系字段有管理端验收。
- 外部 API、社区贡献、多语言、数据版本：属于 Phase D，在 Phase C 发布质量稳定后启动。

**Validation:**

```powershell
Select-String -Path .\docs\runbooks\public-page-readiness.md -Pattern "public aggregate"
```

**Expected:** 大功能不进入开发队列，直到满足准入信号。

**Parallel:** 不执行代码任务，只作为排期约束。

---

## 5. 多 Agent 执行矩阵

### 5.1 第一批可并行任务

| Agent | 负责范围 | 可写文件 | 禁止触碰 | 验证 |
| --- | --- | --- | --- | --- |
| Engineering Gate Agent | 前台测试脚本 | `front/package.json` | `data-query-app/package.json`, `back/pom.xml` | `cd front; pnpm run test` |
| Admin Test Agent | 管理端测试脚本 | `data-query-app/package.json` | `front/package.json`, `scripts/dev/*` | `cd data-query-app; pnpm run test` |
| Backend Test Agent | 后端 test runner | `back/pom.xml` | controller/service 业务代码 | `cd back; mvn test` |
| Docs Agent | 验收 runbook | `docs/runbooks/local-acceptance.md`, `README.md` | `scripts/dev/*` | `Test-Path docs/runbooks/local-acceptance.md` |
| Data Docs Agent | canonical 边界 | `data/canonical/README.md`, `docs/audits/canonical-migration-boundary.md` | 数据写入脚本 | `Select-String` 文档核对 |

### 5.2 第二批串行任务

1. `scripts/dev/quality-gate.ps1`
   - 等前台、管理端、后端命令稳定后写。
2. `scripts/dev/verify-local-stack.ps1`
   - 等 `quality-gate.ps1` 的命令语义稳定后加 `-Full`。
3. `scripts/dev/start-local-stack.ps1`
   - 等 verify 语义稳定后修 profile、日志目录、smoke 提示。
4. `.github/workflows/quality-gate.yml`
   - 等本地质量门禁稳定后绑定。

### 5.3 第三批可并行任务

| Agent | 负责范围 | 可写文件 | 验证 |
| --- | --- | --- | --- |
| Relation Policy Agent | warning 分级文档 | `docs/audits/relation-warning-policy.md` | `Select-String` |
| Relation Test Agent | relation 报告字段契约 | `scripts/data/relation/relation-health-report.test.mjs`, `scripts/data/relation/relation-report.test.mjs` | `node --test ...` |
| Item Group Audit Agent | source group duplicate/blocked 输出 | `scripts/data/audit/audit-any-item-group-sources.mjs`, `.test.mjs` | `node --test ...` |
| Admin Quality Page Agent | 管理端质量总览页面 | `data-query-app/pages/operations/data-quality.vue` | `cd data-query-app; pnpm run test` |
| Public Readiness Agent | 前台准入 runbook | `docs/runbooks/public-page-readiness.md` | `Select-String` |

### 5.4 禁止并行的目标

- `scripts/dev/start-local-stack.ps1` 与 `scripts/dev/verify-local-stack.ps1` 同时修改。
- 同一 controller 与其 test 被不同 agent 同时修改。
- `data-query-app/pages/entities/[type].vue` 被多个 agent 同时修改。
- 同一 DB 表或同一 relation apply 脚本由多个 agent 同时执行。
- 任意 backfill/import/crawler apply 任务并行写同一数据库。

---

## 6. 验收门槛

### 6.1 Phase B 收口门槛

- [ ] `scripts/dev/quality-gate.ps1` 存在并能跑三端默认测试。
- [ ] `verify-local-stack.ps1 -Full` 存在并能跑完整本地门禁。
- [ ] `docs/audits/data-quality-index.md` 能索引长期有效报告。
- [ ] `docs/audits/canonical-migration-boundary.md` 明确 canonical 例外来源。
- [ ] Relation warning policy 明确 blocking/warning/info。
- [ ] Any Item Group duplicate/blocked 有 owner 或处理策略。
- [ ] 管理端有数据质量总览入口。
- [ ] 公开页面准入 runbook 已生效。

### 6.2 Phase C 启动门槛

- [ ] Relation health 无 blocking。
- [ ] 仍存在的 warning 已能在管理端展示，并有解释或功能隐藏策略。
- [ ] 新公开实体有 public aggregate 或稳定 DTO。
- [ ] 对应管理端维护入口能展示来源和缺口。
- [ ] 前台页面有样本验收：普通、边界、不存在 id。
- [ ] `front`、`data-query-app`、`back` 默认测试都进入质量门禁。

### 6.3 合并前门槛

```powershell
git status --short
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\quality-gate.ps1
git diff --cached --stat
```

提交前必须确认 staged 只包含当前任务相关文件。

---

## 7. 风险与处理

### Risk 1：全量测试初期失败太多

**处理：**

- 不降低目标。
- 先记录失败清单。
- 按模块拆分：后端、前台、管理端、数据脚本。
- 每个失败单独建修复任务，不在质量门禁任务里顺手大改业务逻辑。

### Risk 2：CI 和本地环境不一致

**处理：**

- CI 先运行不依赖本地 DB 的 test/build。
- 依赖 DB 的 smoke 留在本地 runbook。
- 后续再引入服务容器或测试数据库。

### Risk 3：Canonical 迁移范围过大

**处理：**

- 第一轮只做边界文档和 readiness 审计。
- 不直接迁移所有历史数据。
- 对现有 standardized/generated 消费者设豁免和迁移目标。

### Risk 4：管理端质量页过早耦合报告格式

**处理：**

- 后端提供稳定 summary payload。
- 管理端只消费 summary，不解析大型原始 JSON。
- 报告字段契约测试先于页面接入。

### Risk 5：前台功能排期被压住

**处理：**

- 保留 30% 低依赖功能空间。
- 允许 NPC 前台、SEO、空态、错误态、文章体验并行。
- 禁止未达准入的多实体公开详情页进入主线。

---

## 8. 执行顺序建议

### Week 1：门禁与文档基线

- Milestone 0
- Task 1.1
- Task 1.2
- Task 1.3
- Task 3.1
- Task 6.1

### Week 2：统一门禁与本地启动

- Task 1.4
- Task 1.5
- Task 2.1
- Task 2.2
- Task 2.3

### Week 3：数据来源与 relation warning

- Task 3.2
- Task 3.3
- Task 4.1
- Task 4.2
- Task 4.3

### Week 4：管理端验收入口

- Task 5.1
- Task 5.2
- Task 5.3
- Task 5.4

### Week 5：前台准入与低风险体验

- Task 6.2
- Phase B 收口门槛复查
- Phase C 启动门槛评审

---

## 9. 计划自检

- Spec coverage: 覆盖数据来源、canonical、relation warning、source group、工程门禁、本地启动、管理端验收、前台准入、多 agent 并行规则。
- 红旗词扫描: 本计划没有未定义的空白任务；每个任务都有文件范围和验证命令。
- Scope check: 本计划是长期主计划，不直接实现所有代码；执行时应按 milestone 拆成独立子任务或子计划。
- Risk control: 写 DB、crawler apply、同一页面大改、同一脚本生命周期变更均被标记为串行。
