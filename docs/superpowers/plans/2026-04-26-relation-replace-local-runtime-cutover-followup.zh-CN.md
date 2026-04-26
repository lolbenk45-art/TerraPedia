# Relation 替换 Local 运行入口后续迁移计划

**日期：** 2026-04-26

**目的：** 这份文档只处理“当前读路径切换完成后，后续哪些入口还要继续迁移”。它不是本轮 cutover 的阻塞项，而是下一阶段的运行/脚本迁移清单。

---

## 当前已完成范围

本轮已完成的是：

- `terria_v1_relation` 内创建了同名兼容视图：
  - `items`
  - `npcs`
  - `projectiles`
  - `buffs`
- 它们分别指向：
  - `projection_items`
  - `projection_npcs`
  - `projection_projectiles`
  - `projection_buffs`
- `terria_v1_local` 核心四表已做物理备份：
  - `items_backup_20260426_131200`
  - `npcs_backup_20260426_131200`
  - `projectiles_backup_20260426_131200`
  - `buffs_backup_20260426_131200`

这意味着：

- relation 侧已经具备“切库但不改表名”的兼容能力
- 但默认运行入口和大量脚本仍然把 `terria_v1_local` 当主库

---

## 本轮不动的入口

以下入口当前不在本轮替换动作内，先保留：

### 后端默认数据库入口

- `back/src/main/resources/application.yml`
- `back/src/main/resources/application-legacy.yml`

### 本地栈默认数据库入口

- `scripts/dev/start-local-stack.ps1`
- `scripts/dev/config/local-stack.config.example.json`

### 大量默认写 `terria_v1_local` 的数据脚本

- `scripts/data/import/*`
- `scripts/data/sync/*`
- `scripts/data/backfill/*`
- `scripts/data/audit/*` 中部分默认连 `terria_v1_local` 的脚本

原因：

- 这些入口很多不仅是“读”
- 还带 `INSERT / UPDATE / DELETE`
- relation 当前仍以 projection 兼容读层为主，不适合直接承接这些写路径

---

## 下一阶段需要迁移的入口

下一阶段如果继续推进 relation 替换 local，建议按下面顺序迁移：

### 第一批：只读或主要读路径

- 后端公开查询接口
- 后端详情查询接口
- 数据查询工具中只读查询
- 管理端中只读展示型页面

目标：

- 优先把明确依赖 `items/npcs/projectiles/buffs` 读表的入口切到 `terria_v1_relation`
- 保持表名不变，利用 relation 内的兼容视图

### 第二批：读多写少的辅助入口

- 局部管理端查询
- 部分审计脚本
- 部分验证脚本

目标：

- 让更多只读或弱写路径脱离 `terria_v1_local`

### 第三批：默认写 local 的导入/回填脚本

- standardized/import/backfill/sync 系列脚本

目标：

- 重新定义这些脚本的职责边界：
  - 哪些继续写 `local`
  - 哪些要改成写 `maint`
  - 哪些不该再直接碰 `local`

注意：

- 这一批不是简单“把数据库名从 local 改成 relation”
- 因为 relation 中很多表不是写模型，而是派生模型

---

## 推荐迁移策略

### 策略 1：先切数据库名，不改表名

适用对象：

- 只读消费方

做法：

- 从 `terria_v1_local` 切到 `terria_v1_relation`
- 表名仍然继续访问：
  - `items`
  - `npcs`
  - `projectiles`
  - `buffs`

前提：

- relation 内同名兼容视图存在

### 策略 2：写路径继续保留 local / maint，不写 projection

适用对象：

- import / backfill / sync / 运维脚本

做法：

- 继续写 `maint` 或 `local`
- 不允许把 projection 视为正式写目标

原因：

- projection 是派生层，不是权威写模型

---

## 回滚策略

如果后续某个读入口切到 `terria_v1_relation` 后需要回滚：

### relation 侧回滚

- 可删除 relation 内的同名兼容视图：
  - `items`
  - `npcs`
  - `projectiles`
  - `buffs`

脚本：

- `scripts/data/relation/drop-local-compat-views.mjs`

### local 侧回滚

- 当前 local 原始表并未被替换，只是做了备份
- 如果未来真的动了 local 原表，再用回滚脚本恢复

脚本：

- `scripts/data/relation/rollback-local-core-tables.mjs`

---

## 当前结论

这轮 relation 替换 local 的本质是：

- **已经完成 relation 侧同名兼容读层建设**
- **还没有迁移所有默认运行入口**
- **后续迁移应该按“只读先行，写路径后移”推进**

所以：

- 当前可以把 relation 当作下一阶段读路径切换的候选主库
- 但不能把它误判成“所有 local 默认入口都已经迁完”
