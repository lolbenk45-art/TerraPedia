# Relation 替换 Local 问题汇总

**日期：** 2026-04-26

**目的：** 在生成 `relation 替换 local` 最终里程碑前，把仍然需要拍板的问题一次性收敛。你统一回答后，再生成最终里程碑，不在执行中途反复打断。

---

## 一、当前已确认事实

### 1. 当前 readiness 状态

- `npcs`：switchable
- `projectiles`：switchable
- `buffs`：switchable
- `items`：字段层面已经无阻塞，但整体仍显示 `blocked`

最新 `items` 状态：

- `blockingFields = none`
- `missingInProjection = 3`
- `extraInProjection = 10`

也就是说：

- 现在的阻塞点不是字段
- 而是**行集合与 `local.items` 不完全一致**

### 2. 当前 item 图片已经靠临时 `local.image` 兜底补齐

已确认：

- `projection_items.image` 当前已能对齐共享行
- 其中一部分不是 `maint_item_images` 提供
- 而是 `local.items.image` 的临时 fallback

这意味着：

- 当前“可切”不等于“纯 maint 架构已经完成”

### 3. 那 13 条 item 行差异已经记入 issue log，且你已口头接受先不处理

当前日志口径是：

- `3 missing` 视为 local-only legacy exceptions
- `10 extra` 视为 weak-source projection exceptions

这可以支持“继续推进 cutover 规划”，但还不等于“最终替换策略已经完全定板”。

### 4. 当前代码和脚本体系里，`terria_v1_local` 仍然是大量默认入口

已确认：

- `back/src/main/resources/application.yml`
- `back/src/main/resources/application-legacy.yml`
- `scripts/dev/start-local-stack.ps1`
- 多个 `scripts/data/import/*`
- 多个 `scripts/data/sync/*`
- 多个 `scripts/data/backfill/*`

这些位置仍默认指向 `terria_v1_local`。

这意味着：

- “relation 替换 local” 不只是数据准备完成
- 还涉及**替换范围到底覆盖哪些读/写/脚本入口**

---

## 二、当前真正需要拍板的问题

下面这些问题，如果不先统一口径，最终里程碑会出现方向分叉。

---

### Q1. 这次“relation 替换 local”到底替换什么范围？

可选理解：

- `A` 只替换业务读路径
  - 后端/查询/API 从 `projection_*` 读
  - 导入、回填、脚本仍允许继续默认写 `terria_v1_local`
- `B` 替换所有面向业务的数据读写主路径
  - 包括部分脚本默认库
- `C` 最终目标是替换整个 `terria_v1_local` 作为主业务库
  - 不只是读路径，也包括绝大多数脚本默认目标

当前推荐默认值：

- `A`

原因：

- 当前最成熟的是“relation 作为 local-compatible 读层”
- 大量脚本仍绑定 `terria_v1_local`
- 如果直接把计划扩大到“替换整个 local 主库”，里程碑范围会明显膨胀

---

### Q2. `items` 的替换验收口径，到底按哪一种？

当前存在两种口径：

- `A` 严格替换
  - `projection_items` 必须与 `local.items` 逐行完全一致
- `B` 有效替换
  - 接受已经记入 issue log 的 13 条例外项
  - 其余行与字段都对齐即可视为可切
- `C` 两种都保留
  - 先按有效替换推进切换
  - 再把严格替换作为后续收口目标

当前推荐默认值：

- `C`

原因：

- 从事实看，字段层面已经达标
- 从严格行集合看，还差 13 条
- 两种状态都值得保留，否则后面的里程碑会失真

---

### Q3. `local.image` 临时 fallback 是否允许成为当前 cutover 的正式前提？

可选口径：

- `A` 允许
  - 当前切换可以建立在 `maint image + local image fallback` 之上
- `B` 不允许
  - 必须等 `maint_item_images` 自己补齐，才能算 items 可切
- `C` 阶段性允许
  - 当前里程碑允许
  - 但最终里程碑必须单独列出退场计划

当前推荐默认值：

- `C`

原因：

- 当前业务可用性已经满足
- 但从架构洁净度看，fallback 不是最终状态

---

### Q4. 这次切换是按域逐步切，还是要求“一次性总切”？

可选口径：

- `A` 分域切换
  - 先切 `npcs/projectiles/buffs`
  - `items` 另行收口
- `B` 一次性总切
  - 必须等所有域都过线才切
- `C` 先技术上具备分域切换能力，再决定是否总切

当前推荐默认值：

- `C`

原因：

- 当前 readiness 已经明确不同域状态不同
- 如果里程碑里不保留分域切换能力，后续切换策略会被锁死

---

### Q5. 那 13 条 item 例外项，是“当前暂时忽略”，还是“长期纳入 policy-exempt 名单”？

可选口径：

- `A` 当前暂时忽略，后续仍要求清零
- `B` 正式纳入 policy-exempt 名单
  - 不再作为 strict cutover 阻塞项
- `C` 拆分处理
  - `3 missing` 一类
  - `10 extra` 一类

当前推荐默认值：

- `C`

原因：

- 这两组问题本质不一样
- `3 missing` 是 local-only legacy 行
- `10 extra` 是 maint weak-source residue 行

---

### Q6. 最终里程碑需要覆盖“代码切换入口”还是只覆盖“数据准备 + readiness”？

可选口径：

- `A` 只规划到数据准备与 readiness
  - 也就是确保 `relation` 已经具备替换能力
- `B` 规划到代码入口切换
  - 包括后端配置、查询默认源、切换顺序、回滚策略
- `C` 分两阶段
  - 第一阶段：数据与 readiness
  - 第二阶段：实际入口切换

当前推荐默认值：

- `C`

原因：

- 当前 readiness 和 projection 已经可以独立规划
- 真正改业务入口又是另一层工程范围

---

## 三、推荐统一答复模板

如果你要一次性回复，建议直接按下面格式回：

```text
Q1: A / B / C
Q2: A / B / C
Q3: A / B / C
Q4: A / B / C
Q5: A / B / C
Q6: A / B / C

额外要求1:
额外要求2:
绝对不能接受的做法:
```

---

## 四、当前默认假设

如果你暂时不回复，我后续生成里程碑时会默认按下面口径展开：

- `Q1 = A`
- `Q2 = C`
- `Q3 = C`
- `Q4 = C`
- `Q5 = C`
- `Q6 = C`

也就是：

- 先把 `relation 替换 local` 收敛为“以读路径替换为主”
- 同时保留 strict / effective 两种 item 验收线
- 当前允许 `local.image` fallback，但必须在里程碑里写明退场路径
- 切换策略先支持分域，再决定是否总切
- 13 条异常项按两类分别处理
- 里程碑分成“数据 readiness”和“代码入口切换”两个阶段

---

## 五、收到统一答复后我会做什么

你统一答复后，我下一步会直接生成：

- 一份中文最终里程碑文档
- 以 `relation 替换 local` 为主线
- 不再混入已完成的 item 字段补全工作
- 明确区分：
  - 数据 readiness 里程碑
  - 代码切换里程碑
  - 回滚与验收里程碑
