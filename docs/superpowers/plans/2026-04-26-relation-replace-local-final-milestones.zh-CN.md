# Relation 替换 Local 最终里程碑计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 让 `terria_v1_relation` 成为 `terria_v1_local` 的兼容读层来源，并在保留可回滚能力的前提下，把现有消费方从 `local.{items,npcs,projectiles,buffs}` 平滑切到 `relation` 的投影结果。

**架构思路：** 当前最小替换目标不是把所有脚本默认库立刻从 `terria_v1_local` 改成 `terria_v1_relation`，而是先把业务读路径替换掉。实现方式优先采用“保留 `local` 数据库名和对接表名，在 `local` 内部用兼容视图或兼容表承接 `relation.projection_*`”的方案，这样上层消费方无需同时改数据库名和表名。所有切换都必须带本地备份、可重复验证、以及显式回滚脚本。

**技术栈：** Node.js 脚本、MySQL（`terria_v1_local` / `terria_v1_relation` / `terria_v1_maint`）、Markdown/JSON 审计报告、PowerShell 本地栈入口

---

## 一、规划前提

本计划默认采用以下口径：

1. 本轮替换先覆盖**业务读路径**，不是一次性把所有导入/回填脚本默认库都切走。
2. `npcs / projectiles / buffs` 视为当前已具备切换条件。
3. `items` 采用“双口径并行”：
   - `effective replacement`：允许已记录的 13 条例外项存在
   - `strict replacement`：保留为后续收口目标
4. 当前 `local.items.image` fallback 允许保留，但必须被量化、可回退、可逐步退出。
5. 替换动作必须先做 `local` 备份，再做对接表名兼容。

相关参考文档：

- [2026-04-26-relation-replace-local-open-issues.zh-CN.md](G:/ClaudeCode/TerraPedia-dev/docs/superpowers/plans/2026-04-26-relation-replace-local-open-issues.zh-CN.md)
- [2026-04-26-relation-replace-local-tables.zh-CN.md](G:/ClaudeCode/TerraPedia-dev/docs/superpowers/plans/2026-04-26-relation-replace-local-tables.zh-CN.md)

---

## 二、里程碑总览

### M1：冻结替换范围与验收基线

- 目标：明确这次到底替哪些表、按什么口径算通过
- 输出：
  - 切换范围表清单
  - readiness 基线快照
  - strict / effective 两种验收口径

### M2：构建 `local` 备份与回滚能力

- 目标：在真正改对接表名前，先具备可恢复能力
- 输出：
  - `local` 核心表备份脚本
  - 回滚脚本
  - 备份与回滚验证报告

### M3：构建 relation -> local 兼容对接层

- 目标：把 `projection_items -> items` 这类外部表名兼容正式落地
- 输出：
  - `local.items/npcs/projectiles/buffs` 对接层
  - 与 `projection_*` 的字段映射规则
  - 兼容层审计脚本

### M4：完成分域切换与验证

- 目标：按域完成实际切换验证
- 输出：
  - `npcs/projectiles/buffs` 正式可切证明
  - `items` 有效替换证明
  - API / 查询 / 本地栈验证结果

### M5：收口 items 例外项与最终切换状态

- 目标：明确 `items` 的最终切换状态与后续收口边界
- 输出：
  - 当前 `items` 是否按 effective 口径可切
  - strict 口径下还剩什么
  - image fallback 退场计划

### M6：切换完成后的运维与脚本清理规划

- 目标：明确替换完成后哪些入口继续保留 `local`，哪些要迁走
- 输出：
  - 运行入口清单
  - 后续脚本迁移顺序
  - 不在本轮切换范围内的保留项

---

## 三、里程碑细化

### M1：冻结替换范围与验收基线

**涉及文件：**

- 复用：`docs/superpowers/plans/2026-04-26-relation-replace-local-open-issues.zh-CN.md`
- 复用：`docs/superpowers/plans/2026-04-26-relation-replace-local-tables.zh-CN.md`
- 修改：`scripts/data/relation/replacement-readiness-audit.mjs`
- 修改：`project-plan/TerraPedia_relation_replace_local_issue_log_2026-04-25.md`
- 生成：`reports/relation/replacement-readiness-2026-04-26.json`
- 生成：`reports/relation/replacement-readiness-2026-04-26.md`

**执行内容：**

- [ ] 明确当前切换只覆盖：
  - `local.items -> projection_items`
  - `local.npcs -> projection_npcs`
  - `local.projectiles -> projection_projectiles`
  - `local.buffs -> projection_buffs`
- [ ] 在 readiness 报告中保留两种状态：
  - `strictReplacementStatus`
  - `effectiveReplacementStatus`
- [ ] 明确 13 条 item 行差异当前只记录、不阻塞本轮有效替换
- [ ] 固定当前 `local.image fallback` 仍在使用的事实

**退出条件：**

- 后续执行不再争论“到底替哪些表”
- 后续执行不再争论“items 现在算不算能切”

---

### M2：构建 `local` 备份与回滚能力

**目标：**

在改 `local` 对接表名前，先把 `local` 的原始业务表备份到安全位置，并提供可重复执行的回滚能力。

**涉及表：**

- `terria_v1_local.items`
- `terria_v1_local.npcs`
- `terria_v1_local.projectiles`
- `terria_v1_local.buffs`

**涉及文件：**

- 新建：`scripts/data/relation/backup-local-core-tables.mjs`
- 新建：`scripts/data/relation/backup-local-core-tables.test.mjs`
- 新建：`scripts/data/relation/rollback-local-core-tables.mjs`
- 新建：`scripts/data/relation/rollback-local-core-tables.test.mjs`
- 新建：`reports/relation/local-cutover-backup-2026-04-26.json`

**执行内容：**

- [ ] 定义统一备份命名规则，例如：
  - `items_backup_20260426_XXXXXX`
  - `npcs_backup_20260426_XXXXXX`
  - `projectiles_backup_20260426_XXXXXX`
  - `buffs_backup_20260426_XXXXXX`
- [ ] 备份内容必须保留：
  - 表结构
  - 数据
  - 索引
- [ ] 回滚脚本必须支持：
  - 删除当前对接层
  - 恢复原始本地表名
- [ ] 生成备份清单报告

**退出条件：**

- 可以先备份，再改 `local` 对接表名
- 任意时刻都能回滚到替换前状态

---

### M3：构建 relation -> local 兼容对接层

**目标：**

实现你提到的这层兼容含义：

- `projection_items -> items`
- `projection_npcs -> npcs`
- `projection_projectiles -> projectiles`
- `projection_buffs -> buffs`

这里的“改表名”不建议直接改 `terria_v1_relation` 原始投影表名，而是建议在 `terria_v1_local` 中做兼容层，让上层继续按原表名访问。

**推荐实现方向：**

- 在 `terria_v1_local` 中用：
  - 视图，或
  - 兼容镜像表 + 刷新脚本

优先推荐：

- **视图优先**

原因：

- 更轻
- 更清晰
- 更接近“把对接表名改成原表名”
- 上游 `projection_*` 更新后能直接生效

**涉及文件：**

- 新建：`scripts/data/relation/create-local-compat-views.mjs`
- 新建：`scripts/data/relation/create-local-compat-views.test.mjs`
- 新建：`scripts/data/relation/drop-local-compat-views.mjs`
- 新建：`scripts/data/relation/drop-local-compat-views.test.mjs`
- 新建：`reports/relation/local-compat-layer-2026-04-26.json`

**兼容对象：**

- `terria_v1_local.items`
- `terria_v1_local.npcs`
- `terria_v1_local.projectiles`
- `terria_v1_local.buffs`

映射到：

- `terria_v1_relation.projection_items`
- `terria_v1_relation.projection_npcs`
- `terria_v1_relation.projection_projectiles`
- `terria_v1_relation.projection_buffs`

**执行内容：**

- [ ] 先验证当前 `local` 是表，不是视图
- [ ] 先执行备份
- [ ] 再删除或改名原始业务表
- [ ] 在 `terria_v1_local` 内重建同名兼容视图
- [ ] 验证：
  - `SELECT COUNT(*) FROM terria_v1_local.items`
  - `SELECT COUNT(*) FROM terria_v1_local.npcs`
  - `SELECT COUNT(*) FROM terria_v1_local.projectiles`
  - `SELECT COUNT(*) FROM terria_v1_local.buffs`
  能与对应 `projection_*` 对齐

**退出条件：**

- 上层仍访问 `local.items` 这类老表名
- 实际底层结果已经来自 `relation.projection_*`

---

### M4：完成分域切换与验证

**目标：**

先完成当前已经达标域的切换验证，再完成 `items` 的有效替换验证。

**分域顺序：**

1. `npcs`
2. `projectiles`
3. `buffs`
4. `items`

**涉及文件：**

- 修改：`scripts/data/relation/replacement-readiness-audit.mjs`
- 新建：`scripts/data/relation/local-compat-smoke-check.mjs`
- 新建：`scripts/data/relation/local-compat-smoke-check.test.mjs`
- 新建：`reports/relation/local-compat-smoke-check-2026-04-26.json`

**执行内容：**

- [ ] 对每个域跑同名查询验证
- [ ] 对每个域跑字段非空与行数验证
- [ ] 对 `items` 额外验证：
  - 当前 `blockingFields = none`
  - 当前图片兼容来自 `maint + local image fallback`
  - 当前 13 条行差异不阻塞有效替换
- [ ] 记录 smoke check 报告

**退出条件：**

- `npcs/projectiles/buffs` 明确可切
- `items` 明确在 effective 口径下可切

---

### M5：收口 items 例外项与最终切换状态

**目标：**

不在本轮强行解决那 13 条，但要把它们与最终切换结论分离清楚。

**涉及文件：**

- 修改：`project-plan/TerraPedia_relation_replace_local_issue_log_2026-04-25.md`
- 修改：`reports/relation/replacement-readiness-2026-04-26.md`
- 新建：`reports/relation/item-image-fallback-audit-2026-04-26.json`

**执行内容：**

- [ ] 给出 `items` 的两套结论：
  - strict status
  - effective status
- [ ] 明确写出：
  - 13 条例外项不作为当前切换阻塞
  - 但它们仍是 strict 替换未收口项
- [ ] 量化 image fallback 依赖：
  - maint 提供多少
  - local fallback 提供多少
  - 后续还有没有 maint-only 提升空间

**退出条件：**

- 最终报告能一句话明确回答：
  - “现在能不能切”
  - “按什么口径能切”
  - “还欠什么才能 strict 切”

---

### M6：切换完成后的运行与脚本清理规划

**目标：**

把“数据已经能替换”和“整个系统默认入口已经迁移”分成两个阶段，不在本轮混做。

**当前已发现仍默认依赖 `terria_v1_local` 的位置包括：**

- `back/src/main/resources/application.yml`
- `back/src/main/resources/application-legacy.yml`
- `scripts/dev/start-local-stack.ps1`
- 多个 `scripts/data/import/*`
- 多个 `scripts/data/sync/*`
- 多个 `scripts/data/backfill/*`

**涉及文件：**

- 新建：`docs/superpowers/plans/2026-04-26-relation-replace-local-runtime-cutover-followup.zh-CN.md`

**执行内容：**

- [ ] 拆分“读路径切换”与“默认写库迁移”
- [ ] 记录哪些入口本轮不动
- [ ] 记录下一阶段需要迁移的脚本默认库
- [ ] 记录回滚时对这些入口的影响

**退出条件：**

- 本轮里程碑不会因为脚本默认库迁移范围过大而失控
- 后续还有单独的 runtime / script migration 计划可接续

---

## 四、推荐执行顺序

建议按下面顺序推进：

1. `M1` 先冻结替换边界和验收口径
2. `M2` 先把 `local` 备份与回滚打通
3. `M3` 再做 `projection_* -> local 同名表` 兼容层
4. `M4` 做分域 smoke check
5. `M5` 给出 `items` 的最终切换结论
6. `M6` 最后把“后续脚本/运行入口迁移”单独规划出来

原因：

- 先有边界
- 再有安全网
- 再做切换
- 最后再收口系统层迁移

---

## 五、计划完成判定

这份里程碑计划完成的标志不是“所有脚本都改到 relation”，而是：

1. `local.{items,npcs,projectiles,buffs}` 已有可回滚的兼容替换方案
2. `projection_*` 可以通过 `local` 原表名被消费
3. `npcs/projectiles/buffs` 正式可切
4. `items` 至少在 effective 口径下可切
5. strict 与 effective 的边界、13 条例外、image fallback 依赖都被显式记录
