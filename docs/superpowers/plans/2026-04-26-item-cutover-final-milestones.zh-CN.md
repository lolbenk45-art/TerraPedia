# Item Final Cutover 里程碑计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 把 `projection_items` 从“字段已补齐但行集合未完全对齐”推进到可用于替换 `local.items` 的最终状态，并明确区分“严格替换”和“有效替换”两种验收模式。

**架构思路：** 维持 `maint` 作为长期事实来源，不重新打开已经完成的字段补全工作；当前剩余工作只处理 `3 missing + 10 extra` 的行集合问题、`local.image` 临时兜底的收口方式，以及最终 cutover 验收口径。短期允许保留窄范围的 local 兼容覆盖，长期仍以 maint-only 为收敛目标。

**技术栈：** Node.js 脚本、MySQL（`terria_v1_local` / `terria_v1_maint` / `terria_v1_relation`）、Markdown/JSON 报告、PowerShell 入口

---

## 一、里程碑总览

### M1：冻结并审计剩余 13 条行差异

- 目标：把 `3 missing + 10 extra` 的现状、来源强度、默认处理方向一次性固定下来
- 成功标准：
  - 每一条异常行都有明确分类
  - 每一条异常行都有证据
  - 不再存在“未知原因的 missing/extra”

### M2：显式拆分 strict / effective 两种 cutover 模式

- 目标：让 readiness 报告不再只给一个笼统的 blocked/switchable 结论
- 成功标准：
  - 报告里能区分字段完成度、行集合完成度、临时 local fallback 使用情况
  - 可以单独回答“严格替换是否可行”和“有效替换是否可行”

### M3：处理 10 条 extra projection 行

- 目标：让这 10 条弱来源残留不再阻塞 strict cutover
- 成功标准：
  - 10 条 extra 行被过滤、降级，或被提升为正式实体
  - readiness 不再把它们作为未解释 extra 留在报告里

### M4：处理 3 条 missing local 行

- 目标：决定这 3 条 local-only 行在 cutover 中的最终归宿
- 成功标准：
  - 3 条 missing 行被恢复、豁免，或被显式移出 strict 验收口径
  - readiness 不再把它们作为未解释 missing 留在报告里

### M5：复盘 image fallback 依赖并给出最终 cutover 结论

- 目标：在不阻塞当前 cutover 推进的前提下，量化当前对 `local.image` 的依赖，并保留回到 maint-only 的路径
- 成功标准：
  - 当前 fallback 覆盖范围有量化报告
  - 后台 wiki 刷新完成后能重新评估 maint-only image 覆盖
  - 最终报告明确给出 `items` 的 strict/effective 切换结论

---

## 二、里程碑细化

### M1：冻结并审计剩余 13 条行差异

**范围：**

- `3 missing`
  - `ZH_RECIPE_BLUE_JELLYFISH_BAIT`
  - `ZH_RECIPE_GREEN_JELLYFISH_BAIT`
  - `ZH_RECIPE_PINK_JELLYFISH_BAIT`
- `10 extra`
  - `Fake_newchest1`
  - `Fake_newchest2`
  - `OgreMask`
  - `GoblinMask`
  - `GoblinBomberCap`
  - `EtherianJavelin`
  - `KoboldDynamiteBackpack`
  - `BoringBow`
  - `BossBagOgre`
  - `BossBagDarkMage`

**涉及文件：**

- 新建：`reports/relation/item-row-set-audit-2026-04-26.json`
- 新建：`reports/relation/item-row-set-audit-2026-04-26.md`
- 修改：`project-plan/TerraPedia_relation_replace_local_issue_log_2026-04-25.md`

**执行内容：**

- [ ] 固定 3 条 `missing` 的事实：
  - local 有
  - maint 无
  - standardized 无
  - recipe maint 表无
- [ ] 固定 10 条 `extra` 的事实：
  - maint 有
  - standardized 无
  - local 无
  - 来源是 `Module:Iteminfo/data`
  - `raw_json` 大多只有 `id + internalName`
- [ ] 给每条异常行写出 `classification`
  - `local_legacy_only`
  - `weak_source_residue`
  - `promotable`
  - `exclude_from_strict_cutover`
- [ ] 给每条异常行写出 `recommendedAction`
  - `restore`
  - `filter`
  - `promote`
  - `policy_exempt`

**产出要求：**

- JSON 适合后续脚本消费
- Markdown 适合人工审核
- issue log 中同步追加结论摘要

**退出条件：**

- 13 条行不再属于“未解释异常”

---

### M2：显式拆分 strict / effective 两种 cutover 模式

**涉及文件：**

- 修改：`scripts/data/relation/replacement-readiness-audit.mjs`
- 修改：`reports/relation/replacement-readiness-2026-04-26.json`
- 修改：`reports/relation/replacement-readiness-2026-04-26.md`
- 新建：`reports/relation/item-image-fallback-audit-2026-04-26.json`

**执行内容：**

- [ ] 在 readiness 中拆出三层结论：
  - 字段完成度
  - 行集合完成度
  - local fallback 依赖度
- [ ] 增加 `effectiveReplacementStatus`
  - 忽略策略性豁免行后是否可替换
- [ ] 保留 `strictReplacementStatus`
  - 不做豁免时是否可替换
- [ ] 增加 image fallback 审计：
  - `maint_image_present_count`
  - `local_fallback_image_count`
  - `still_missing_image_count`

**默认口径：**

- `strict`：要求 projection 与 local 行集合严格对齐
- `effective`：允许使用文档化例外名单

**退出条件：**

- 任何一份 readiness 报告都能独立回答：
  - 字段是否齐
  - 行是否齐
  - 当前是否依赖 local fallback

---

### M3：处理 10 条 extra projection 行

**涉及文件：**

- 修改：`scripts/data/relation/sync-maint-to-relation.mjs`
- 修改：`scripts/data/relation/sync-maint-to-relation.test.mjs`
- 修改：`project-plan/TerraPedia_relation_replace_local_issue_log_2026-04-25.md`

**默认处理方向：**

- 先不删 maint 事实行
- 只在 local-compatible projection 层做过滤

**执行内容：**

- [ ] 建立 explicit filter list，按 `internal_name` 过滤这 10 条
- [ ] 过滤逻辑只作用于 `projection_items`
- [ ] relation 基础表保留原始 maint 事实，避免丢审计线索
- [ ] 单测覆盖：
  - 过滤名单内行不进入 `projection_items`
  - 非名单行不受影响

**退出条件：**

- readiness 中 `extraInProjection` 清零，或只剩明确 policy-exempt 行

---

### M4：处理 3 条 missing local 行

**涉及文件：**

- 修改：`scripts/data/relation/sync-maint-to-relation.mjs`
- 修改：`scripts/data/relation/sync-maint-to-relation.test.mjs`
- 修改：`project-plan/TerraPedia_relation_replace_local_issue_log_2026-04-25.md`

**默认处理方向：**

- 优先采用窄范围 compatibility overlay
- 只对这 3 条 local-only 行生效

**执行内容：**

- [ ] 明确 overlay 来源：
  - `terria_v1_local.items`
- [ ] overlay 范围限定为这 3 条 `internal_name`
- [ ] overlay 只补 projection，不反写 maint
- [ ] 单测覆盖：
  - 这 3 条行在开启 overlay 后进入 `projection_items`
  - 非这 3 条行不被误补
- [ ] 如后续决定不保留 overlay，则要把它们改为 strict 验收豁免项并更新 readiness

**退出条件：**

- readiness 中 `missingInProjection` 清零，或只剩明确 policy-exempt 行

---

### M5：复盘 image fallback 依赖并给出最终 cutover 结论

**涉及文件：**

- 复用：`scripts/data/maint/refresh-item-pages-from-wiki.mjs`
- 复用：`scripts/data/maint/sync-item-page-images-to-maint.mjs`
- 修改：`scripts/data/relation/sync-maint-to-relation.mjs`（仅当 image fallback 策略需要调整）
- 修改：`reports/relation/replacement-readiness-2026-04-26.md`

**执行内容：**

- [ ] 等待当前后台 image refresh 跑完
- [ ] 重跑：
  - `sync-item-page-images-to-maint`
  - `sync-maint-to-relation`
  - `replacement-readiness-audit`
- [ ] 输出 image 依赖复盘：
  - 多少行已被 maint 接管
  - 多少行仍依赖 local fallback
  - 是否还有 image null 行
- [ ] 在最终报告中分别给出：
  - strict replacement 结论
  - effective replacement 结论
  - maint-only image readiness 结论

**退出条件：**

- `items` 的最终替换状态能够被一句话明确表达

---

## 三、默认执行顺序

建议按以下顺序推进：

1. `M1` 先把 13 条异常行冻结
2. `M2` 先把验收模型写清楚
3. `M3` 处理 10 条 extra
4. `M4` 处理 3 条 missing
5. `M5` 最后复盘 image fallback 与最终切换状态

这样做的原因是：

- 先定异常清单，再定规则，再改 projection
- 能避免在未定义 strict/effective 之前反复返工

---

## 四、当前默认假设

为保证不被中断，当前规划采用以下默认假设：

1. `3 missing` 先按 local 兼容 overlay 方向处理
2. `10 extra` 先按 projection 过滤方向处理
3. `local.image` fallback 当前允许保留
4. 不重新打开已完成的 item numeric/text/rarity/stack 字段补全工作
5. 后续最终报告必须能独立回答 strict 与 effective 两种切换状态

---

## 五、计划完成判定

这份里程碑计划的完成标准是：

1. `3 missing + 10 extra` 都有落地去向
2. readiness 能区分 strict / effective / image fallback 三类状态
3. `projection_items` 至少能达到：
   - strict switchable，或
   - effective switchable 且例外名单文档化
4. 当前 local image fallback 的依赖范围可量化、可回退、可替换
