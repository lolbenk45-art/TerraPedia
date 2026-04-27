# 三层结构替换 Local 旧数据实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以 `maint -> relation -> projection` 三层结构稳定 TerraPedia 数据来源，逐步把 `terria_v1_local` 从历史业务主库降级为兼容层与备份层，直到核心域不再依赖 `local` 作为事实来源或默认读写入口。

**Architecture:** `maint` 只承接抓取/回填后的可追溯事实，`relation` 只承接规范化实体与关系，`projection` 只承接对后端与查询稳定的消费口径。`local` 只允许保留过渡兼容、备份、回滚用途，不再承载长期业务真相。

**Tech Stack:** Node.js data scripts, MySQL (`terria_v1_local` / `terria_v1_maint` / `terria_v1_relation`), Spring Boot backend, PowerShell local stack, Markdown/JSON audit reports

---

## 当前基线

### 已完成的运行时状态

- `terria_v1_local.items`
- `terria_v1_local.npcs`
- `terria_v1_local.projectiles`
- `terria_v1_local.buffs`

以上四张 `local` 核心表当前仍然是 `BASE TABLE`。已完成的是两件事：

- `terria_v1_relation` 侧同名兼容 `VIEW`
- `terria_v1_local` 四张核心基表已用 relation/projection 数据做过一次就地物化替换

relation 侧 compat `VIEW` 为：

- `terria_v1_relation.items`
- `terria_v1_relation.npcs`
- `terria_v1_relation.projectiles`
- `terria_v1_relation.buffs`

它们分别指向：

- `projection_items`
- `projection_npcs`
- `projection_projectiles`
- `projection_buffs`

这意味着当前仓库已经具备 relation 侧兼容读口径，同时当前 runtime 的 `local` 核心数据也已经不是旧快照，而是 relation/projection 的物化结果。

### 已完成的安全保护

- 已存在物理备份：
  - `terria_v1_local.items_backup_20260426_131200`
  - `terria_v1_local.npcs_backup_20260426_131200`
  - `terria_v1_local.projectiles_backup_20260426_131200`
  - `terria_v1_local.buffs_backup_20260426_131200`
- 已存在切换与回滚脚本：
  - `scripts/data/relation/backup-local-core-tables.mjs`
  - `scripts/data/relation/cutover-local-core-tables-to-relation-views.mjs`
  - `scripts/data/relation/drop-local-compat-views.mjs`
  - `scripts/data/relation/rollback-local-core-tables.mjs`

### 当前最重要的风险

- relation 兼容读层已经打通，`local` 核心数据也已物化替换，但默认运行入口和大量脚本仍然直接使用 `terria_v1_local` 基表
- 当前“数据已替换”不等于“所有 legacy 写路径都已迁移”，历史 import/backfill/sync 脚本仍可能把 local core 再次写脏
- 当前 `replacement-readiness-2026-04-26.md` 反映的是“切换后兼容状态”，不是“原始 local 旧表与新三层口径的历史差异”
- `scripts/data/relation/sync-maint-to-relation.mjs` 仍存在 `reconcileProjectionItemImageFromLocal(...)` 这种过渡性 `local` 回补依赖，说明来源链尚未完全脱离 `local`

### 当前规划边界

- 本计划处理的是“长期三层替换路线”
- 本计划不重复定义一次性 cutover 脚本
- 历史 item 行级例外继续记录在：
  - `project-plan/TerraPedia_relation_replace_local_issue_log_2026-04-25.md`
  - `reports/relation/item-row-set-audit-2026-04-26.md`
- 上述历史例外不作为本计划的启动阻塞项，但必须持续留档

---

## 三层职责与落位规则

### `maint` 层

- 唯一职责：保存抓取、导入、桥接、人工校正后的“可追溯事实”
- 允许内容：
  - 原始抓取字段
  - 来源页结构化字段
  - 明确可审计的 override / bridge 数据
  - 来源时间、来源页面、来源提供者
- 禁止内容：
  - 面向前端的拼装展示结果
  - 脱离来源链的猜测值

### `relation` 层

- 唯一职责：把 `maint` 中的事实规范化为实体、关系、字典、资源层
- 允许内容：
  - `relation_items / relation_npcs / relation_projectiles / relation_buffs`
  - 正式关系表、桥接表、support domain、asset domain
  - 保留 `raw` 与 `normalized` 并行字段
- 禁止内容：
  - 直接把 `local` 当作事实来源长期回填
  - 为了对齐旧表而写入无来源证据字段

### `projection` 层

- 唯一职责：给后端、查询接口、兼容层提供稳定消费口径
- 允许内容：
  - `projection_items / projection_npcs / projection_projectiles / projection_buffs`
  - 基于 `relation` 的派生字段
  - 为兼容查询而保留的字段命名
- 禁止内容：
  - 直接写入
  - 从 `local` 读取正式业务真相

### `local` 层

- 唯一职责：过渡兼容、运行时兜底、历史备份、紧急回滚
- 允许内容：
  - `*_backup_20260426_131200`
  - 过渡期的兼容视图
- 禁止内容：
  - 作为长期主库
  - 新增“只存在于 local”的业务事实

---

## 涉及的核心表与运行入口

### 事实来源链

- `maint_items`
- `maint_npcs`
- `maint_projectiles`
- `maint_buffs`
- `maint_item_pages`
- `maint_item_images`
- `maint_item_sources`
- `maint_item_recipes`
- `maint_item_biomes`
- `maint_bosses`
- `maint_biomes`
- `maint_armor_sets`
- `maint_categories`
- `maint_item_categories`
- `maint_shimmer_pages`

### 规范层 / 投影视图层

- `relation_items`
- `relation_npcs`
- `relation_projectiles`
- `relation_buffs`
- `relation_item_images`
- `relation_npc_images`
- `relation_projectile_images`
- `relation_buff_images`
- `item_recipe_heads`
- `item_recipe_ingredients`
- `item_recipe_stations`
- `item_recipe_group_expansions`
- `item_npc_shop_relations`
- `item_npc_loot_relations`
- `item_buff_relations`
- `item_biome_relations`
- `boss_item_reward_relations`
- `boss_effect_relations`
- `npc_series_nodes`
- `npc_series_memberships`
- `npc_series_item_relations`
- `projection_items`
- `projection_npcs`
- `projection_projectiles`
- `projection_buffs`

### 当前兼容 / 备份层

- `terria_v1_local.items`
- `terria_v1_local.npcs`
- `terria_v1_local.projectiles`
- `terria_v1_local.buffs`
- `terria_v1_local.items_backup_20260426_131200`
- `terria_v1_local.npcs_backup_20260426_131200`
- `terria_v1_local.projectiles_backup_20260426_131200`
- `terria_v1_local.buffs_backup_20260426_131200`

### 默认运行入口

- 后端：
  - `back/src/main/resources/application.yml`
  - `back/src/main/resources/application-legacy.yml`
- 本地栈：
  - `scripts/dev/start-local-stack.ps1`
  - `scripts/dev/config/local-stack.config.example.json`
- 维护导入：
  - `scripts/data/maint/sync-landing-to-maint.mjs`
- 规范层同步：
  - `scripts/data/relation/sync-maint-to-relation.mjs`
- 切换与回滚：
  - `scripts/data/relation/create-local-compat-views.mjs`
  - `scripts/data/relation/local-compat-smoke-check.mjs`
  - `scripts/data/relation/replacement-readiness-audit.mjs`
- 仍默认指向 `local` 的脚本族：
  - `scripts/data/import/*`
  - `scripts/data/sync/*`
  - `scripts/data/backfill/*`
  - `scripts/data/audit/*`
  - `scripts/data/landing/*`

---

## 总体执行规则

- [ ] 所有新增事实先落 `maint`，不允许新增“只存在于 local”的字段值
- [ ] 所有正式消费字段必须能追到 `maint` 或明确记录为过渡桥接
- [ ] `relation` 与 `projection` 不得长期直接读取 `local`
- [ ] 所有 parity / readiness 对比必须区分“历史旧表基线”与“切换后兼容状态”
- [ ] 当前 `local` 已被视图替代的四个核心域，后续任何写入改造必须先改脚本再改默认库名
- [ ] 所有阻塞、缺口、临时兜底都写入 `project-plan/TerraPedia_relation_replace_local_issue_log_2026-04-25.md`
- [ ] 每个里程碑结束都必须产出：
  - 报告
  - 样例证据链
  - 风险清单
  - 回滚点

---

## 里程碑总览

| 里程碑 | 目标 | 核心产出 | 退出条件 |
| --- | --- | --- | --- |
| M1 | 稳定 `maint` 来源链 | 来源映射、bridge 清单、字段归属表 | 核心域不再新增 `local-only` 事实 |
| M2 | 补齐 `relation` 规范层 | 实体/关系/资源层口径补全 | `relation` 成为正式规范源 |
| M3 | 固化 `projection` 消费契约 | 投影字段口径、兼容边界、历史差异基线 | `projection_*` 成为唯一正式查询口径 |
| M4 | 迁移只读消费入口 | 后端与只读脚本切换到 `relation/projection` | 运行时主读路径脱离 `local` |
| M5 | 迁移写路径与运维入口 | import/sync/backfill/landing 改写 | 核心写路径脱离 `local` |
| M6 | `local` 退场与治理收口 | 兼容层收缩、文档封版、监控回滚 | `local` 仅保留备份和短期兼容 |

---

## M1: 稳定 `maint` 来源链

**目标：** 所有核心域与下一批成熟域的“事实来源”先收敛进 `maint`，后续不再允许 `local` 继续偷偷补业务值。

**Files:**
- Modify: `scripts/data/maint/maint-schema.mjs`
- Modify: `scripts/data/maint/sync-landing-to-maint.mjs`
- Modify: `scripts/data/maint/sync-local-item-tooltip-zh-to-maint.mjs`
- Modify: `scripts/data/maint/item-field-coverage-audit.mjs`
- Modify: `project-plan/TerraPedia_relation_replace_local_issue_log_2026-04-25.md`
- Create/Modify: `reports/relation/*coverage*.json`
- Create/Modify: `reports/relation/*coverage*.md`

- [ ] 盘点 `items / npcs / projectiles / buffs` 当前仍依赖 `local` 桥接的字段，按“正式来源 / 过渡 bridge / 待上游补数 / 永不猜测”四类归档
- [ ] 把允许保留的 `local -> maint` 过渡桥接显式化，只允许作为一次性迁移或短期同步脚本存在，不允许直接进入 `relation` 常态依赖
- [ ] 为图片、中文、tooltip、stack、rarity、raw-json flags 建立字段来源矩阵，要求每个字段能指出来自哪张 `maint_*` 表
- [ ] 补全并固定覆盖率审计报告，后续所有迁移都以 `maint` 覆盖率为起点，不再以 `local` 覆盖率充当事实定义
- [ ] 将尚未稳定的上游缺口继续沉淀到 issue log，而不是让 `projection` 或后端绕过 `maint`

**Validation:**

```powershell
node --test scripts/data/maint/maint-schema.test.mjs scripts/data/maint/sync-standardized-item-numeric-to-maint.test.mjs scripts/data/maint/sync-local-item-tooltip-zh-to-maint.test.mjs
node scripts/data/maint/sync-landing-to-maint.mjs --apply=false --scopes=items,npcs,projectiles,buffs,item_pages,item_images,item_sources,item_recipes,item_biomes,bosses,biomes,armor_sets,categories,shimmer --output=reports/maint-sync-$(Get-Date -Format yyyy-MM-dd).json
node scripts/data/maint/item-field-coverage-audit.mjs
```

**M1 完成标准：**

- 核心域生产字段没有新的 `local-only` 事实
- 所有允许存在的 `local -> maint` bridge 都有脚本、有报告、有退场说明
- `maint` 成为唯一被承认的事实承接层

---

## M2: 补齐 `relation` 规范层

**目标：** 让 `relation` 真正成为三层结构中的规范真相层，而不是“为了兼容 local 临时拼起来的一层”。

**Files:**
- Modify: `scripts/data/relation/base-entity-processor.mjs`
- Modify: `scripts/data/relation/buff-entity-processor.mjs`
- Modify: `scripts/data/relation/image-processor.mjs`
- Modify: `scripts/data/relation/item-source-relation-processor.mjs`
- Modify: `scripts/data/relation/boss-series-processor.mjs`
- Modify: `scripts/data/relation/npc-series-processor.mjs`
- Modify: `scripts/data/relation/relation-table-catalog.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.mjs`
- Modify: `docs/superpowers/specs/2026-04-25-relation-table-catalog.md`

- [ ] 逐个确认 `relation_items / relation_npcs / relation_projectiles / relation_buffs` 的必需字段都只来自 `maint`
- [ ] 把核心关系表的规则固化为“显式证据优先、raw 保留、不可证实不写正式结果”
- [ ] 删除或隔离任何长期读取 `local` 的关系层逻辑，尤其是 `sync-maint-to-relation.mjs` 中的 `reconcileProjectionItemImageFromLocal(...)` 这类过渡依赖
- [ ] 让 `relation` 层的字典、图片、support domain 与正式实体表都能独立解释，不需要用 `local` 做语义补充
- [ ] 补完 relation catalog，使后续后端与脚本迁移能明确“该读哪一层、为什么读这一层”

**Validation:**

```powershell
node --test scripts/data/relation/base-entity-processor.test.mjs scripts/data/relation/projection-sync.test.mjs scripts/data/relation/sync-maint-to-relation.test.mjs
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --maint-database=terria_v1_maint --relation-database=terria_v1_relation
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --maint-database=terria_v1_maint --relation-database=terria_v1_relation
```

**M2 完成标准：**

- `relation` 的实体、关系、资产层不再长期依赖 `local`
- 每一张正式 `relation_*` / 关系表都能解释其来源链
- `relation` 可独立作为规范层供 `projection` 使用

---

## M3: 固化 `projection` 消费契约

**目标：** 把 `projection_*` 固化为正式消费口径，并且把“兼容 local”从短期字段对齐，升级为长期契约治理。

**Files:**
- Modify: `scripts/data/relation/projection-schema.mjs`
- Modify: `scripts/data/relation/projection-sync.mjs`
- Modify: `scripts/data/relation/replacement-readiness-audit.mjs`
- Modify: `scripts/data/relation/local-compat-smoke-check.mjs`
- Modify: `scripts/data/relation/create-local-compat-views.mjs`
- Modify: `reports/relation/replacement-readiness-*.md`
- Modify: `reports/relation/local-compat-smoke-check-*.json`

- [ ] 定义 `projection_items / projection_npcs / projection_projectiles / projection_buffs` 的正式字段合同，明确哪些字段是强保证，哪些字段允许留空
- [ ] 新增“历史旧表基线”口径：后续 parity 不再直接拿当前 `terria_v1_local.items` 视图做旧表对比，而是必须对照备份表或历史报告
- [ ] 保留兼容视图，但把兼容视图定位为过渡输出，而不是事实定义
- [ ] 将 accepted exceptions 固定为 issue log / audit 资产，不再散落在业务逻辑里
- [ ] 为后端与脚本提供“优先读 projection_*，不再读 local 旧表”的明确契约文档

**Validation:**

```powershell
node --test scripts/data/relation/projection-schema.test.mjs scripts/data/relation/projection-sync.test.mjs scripts/data/relation/replacement-readiness-audit.test.mjs scripts/data/relation/local-compat-smoke-check.test.mjs
node scripts/data/relation/replacement-readiness-audit.mjs
node scripts/data/relation/local-compat-smoke-check.mjs --local-database=terria_v1_local --relation-database=terria_v1_relation
```

**M3 完成标准：**

- `projection_*` 成为唯一正式查询口径
- 兼容层与历史基线被明确区分
- readiness 报告可以解释“现在能不能切”和“历史差了什么”这两件不同的事

---

## M4: 迁移只读消费入口

**目标：** 先把所有只读或以查询为主的运行入口切到 `relation/projection`，减少 `local` 继续承载运行时读流量。

**Files:**
- Modify: `back/src/main/resources/application.yml`
- Modify: `back/src/main/resources/application-legacy.yml`
- Modify: `scripts/dev/start-local-stack.ps1`
- Modify: `scripts/dev/config/local-stack.config.example.json`
- Modify: `scripts/data/audit/*.mjs`
- Modify: `scripts/data/generate/*.mjs`
- Modify: `scripts/data/transform/*.mjs`

- [ ] 梳理后端只读接口、审计脚本、生成脚本的默认库名与表名，优先改到 `terria_v1_relation`
- [ ] 运行时查询入口原则上只切库名，不切领域语义；能直接读 `projection_*` 的不再绕回 `local`
- [ ] 在后端文档中明确：“默认业务查询库”为 `relation/projection`，`local` 只用于备份回溯与兼容
- [ ] 为只读入口保留回滚开关，确保切换失败时可以回退到备份或兼容口径

**Validation:**

```powershell
git diff -- back/src/main/resources/application.yml back/src/main/resources/application-legacy.yml scripts/dev/start-local-stack.ps1 scripts/dev/config/local-stack.config.example.json
node scripts/data/relation/local-compat-smoke-check.mjs --local-database=terria_v1_local --relation-database=terria_v1_relation
cd back
mvn test
```

**M4 完成标准：**

- 后端默认读路径与主要只读脚本不再以 `local` 为主
- 线上/本地查询语义统一指向 `projection_*`
- 切库后仍有清晰回滚口径

---

## M5: 迁移写路径与运维入口

**目标：** 把所有仍默认写 `local` 的导入、回填、同步、落地脚本重新分流到 `landing -> maint -> relation -> projection` 链路。

**Files:**
- Modify: `scripts/data/import/*.mjs`
- Modify: `scripts/data/sync/*.mjs`
- Modify: `scripts/data/backfill/*.mjs`
- Modify: `scripts/data/landing/*.mjs`
- Modify: `scripts/data/relation/backup-local-core-tables.mjs`
- Modify: `scripts/data/relation/rollback-local-core-tables.mjs`
- Modify: `project-plan/TerraPedia_relation_replace_local_issue_log_2026-04-25.md`

- [ ] 把所有写路径脚本分为三类：
  - 只该写 landing / maint
  - 只该触发 relation/projection 重建
  - 只该读兼容层但不得写兼容层
- [ ] 去掉“默认主库必须是 `terria_v1_local`”这种硬编码保护，改为按分层职责校验目标库是否合法
- [ ] 明确禁止任何脚本继续把 `projection_*` 当写模型
- [ ] 为需要保留的历史桥接脚本增加退场时间点和替代脚本
- [ ] 让运维入口文档明确说明每类脚本该跑在哪一层，避免再次回流写 `local`

**Validation:**

```powershell
rg -n "terria_v1_local" scripts/data/import scripts/data/sync scripts/data/backfill scripts/data/landing
 node --test scripts/data/relation/backup-local-core-tables.test.mjs scripts/data/relation/rollback-local-core-tables.test.mjs scripts/data/relation/cutover-local-core-tables-to-relation-views.test.mjs
git diff -- scripts/data/import scripts/data/sync scripts/data/backfill scripts/data/landing
```

**M5 完成标准：**

- 核心写路径脱离 `local`
- 导入/回填/同步脚本职责按三层重分流
- `local` 不再作为默认写入目标

---

## M6: `local` 退场与治理收口

**目标：** 让 `local` 从“历史主库”真正退场为“备份与短期兼容层”，并完成文档、审计、回滚、监控收口。

**Files:**
- Modify: `docs/superpowers/plans/*.md`
- Modify: `project-plan/TerraPedia_relation_replace_local_issue_log_2026-04-25.md`
- Modify: `reports/relation/*.md`
- Modify: `reports/relation/*.json`
- Modify: `scripts/data/relation/create-local-compat-views.mjs`
- Modify: `scripts/data/relation/drop-local-compat-views.mjs`

- [ ] 明确声明 `local` 的最终角色：仅保留备份表、短期兼容视图、回滚脚本
- [ ] 关闭已经完成退场的 bridge，并在 issue log 中逐项归档
- [ ] 给“仍未脱离 `local` 的例外路径”建立独立剩余清单，不允许混在主流程里
- [ ] 将三层结构、默认入口、回滚流程、审计流程写入正式运行文档
- [ ] 决定兼容视图的保留时长与最终删除条件

**Validation:**

```powershell
node scripts/data/relation/local-compat-smoke-check.mjs --local-database=terria_v1_local --relation-database=terria_v1_relation
node scripts/data/relation/replacement-readiness-audit.mjs
git status --short
```

**M6 完成标准：**

- `local` 被正式降级为备份与兼容层
- 默认业务链路只认 `maint -> relation -> projection`
- 所有剩余例外都有文档、有负责人、有回滚说明

---

## 风险清单

### 风险 1：切换后审计口径失真

- 现象：当前 `local` 核心表已经是视图，再拿它与 `projection_*` 对比会得到“全绿”，但那只是切换后的兼容状态
- 处理：后续所有历史 parity 必须对照 `*_backup_20260426_131200` 或既有 baseline 报告

### 风险 2：写路径误写视图

- 现象：大量脚本默认库仍是 `terria_v1_local`
- 处理：M5 前，禁止新增任何继续写 `local` 四张核心视图的逻辑；M5 中集中改写

### 风险 3：过渡 bridge 永久化

- 现象：为了补图片、tooltip、中文等字段，可能长期保留 `local -> relation` 或 `local -> projection` 兜底
- 处理：所有 bridge 必须先落 `maint`，再设退场节点

### 风险 4：后端表名与层级语义混淆

- 现象：如果只改库名不改心智模型，很容易继续把兼容视图当真相层
- 处理：文档中统一强调“后端最终消费的是 `projection_*`，不是 `local`”

---

## 回滚原则

- 任何数据库切换前都先保留最新审计报告
- 任何兼容视图调整前都先确认备份表仍可读
- `local` 回滚优先使用：
  - `scripts/data/relation/rollback-local-core-tables.mjs`
- `relation` 兼容视图回滚优先使用：
  - `scripts/data/relation/drop-local-compat-views.mjs`
- 若回滚后继续执行迁移，必须先更新 issue log，避免重复踩同一问题

---

## 最终验收口径

- `maint` 是唯一事实承接层
- `relation` 是唯一规范化真相层
- `projection_*` 是唯一正式消费层
- `local` 不再承载核心业务真相，也不再是默认读写入口
- 所有剩余例外都留在 issue log 与审计报告中，而不是留在业务实现里
