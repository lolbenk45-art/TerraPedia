# Maint Item 关系链长任务问题汇总
日期：2026-04-23

范围：以 `terria_v1_maint` 的 `maint_*` 数据为核心，核查 `item` 与 `npc / projectiles / recipe / buff / biome / category / image / source snapshot` 等数据之间的真实关联，再决定后续规划。

目标：把需要用户拍板的问题集中到本文档。用户统一回答后，再进入正式 design 与 implementation plan。

---

## 1. 当前已核实事实

### 1.1 数据库现状

| 库 | 已核实内容 | 证据 |
| --- | --- | --- |
| `terria_v1_local` | 业务表存在 `items / npcs / projectiles / buffs`，以及旧关系表 `item_acquisition_sources / item_biomes / recipes / recipe_ingredients / recipe_stations / npc_loot_entries / npc_shop_entries / npc_buff_relations / buff_source_items` | 本地 `SHOW TABLES LIKE ...` 查询 |
| `terria_v1_local` | `items=6134`，`npcs=762`，`projectiles=1111`，`buffs=388` | 本地数据库计数查询 |
| `terria_v1_maint` | `maint_items=6146`，`maint_npcs=762`，`maint_projectiles=1111`，`maint_buffs=388` | 本地数据库计数查询 |
| `terria_v1_maint` | `maint_item_pages=6131`，`maint_item_page_recipes=1171`，`maint_item_images=4001`，`maint_recipe_pages=41`，`maint_recipe_page_recipes=3663`，`maint_item_recipes=3203`，`maint_item_sources=3187`，`maint_item_biomes=364`，`maint_source_snapshots=6138` | 本地数据库计数查询 |
| `terria_v1_maint` | `maint_categories=6`，`maint_item_categories=2047` | 本地数据库计数查询 |
| `terria_v1_maint` | `maint_category_nodes / maint_item_category_assignments` 目前不存在 | 本地数据库计数查询报 `Table ... doesn't exist` |

### 1.2 现有同步来源链

| scope | landing dataset | maint 表 | 证据 |
| --- | --- | --- | --- |
| `items` | `items_raw` | `maint_items` | `scripts/data/maint/sync-landing-to-maint.mjs` 的 `SCOPE_TO_DATASETS / SCOPE_TO_TABLE` |
| `npcs` | `npcs_raw` | `maint_npcs` | 同上 |
| `projectiles` | `projectiles_raw` | `maint_projectiles` | 同上 |
| `buffs` | `buffs_raw` | `maint_buffs` | 同上 |
| `item_pages` | `item_pages_raw` | `maint_item_pages` | 同上 |
| `item_images` | `item_relations_bundle_raw` | `maint_item_images` | 同上 |
| `item_recipes` | `item_relations_bundle_raw` | `maint_item_recipes` | 同上 |
| `item_sources` | `item_relations_bundle_raw` | `maint_item_sources` | 同上 |
| `item_biomes` | `item_relations_bundle_raw` | `maint_item_biomes` | 同上 |
| `source_snapshots` | `item_relations_bundle_raw` | `maint_source_snapshots` | 同上 |
| `categories` | `categories_raw` | `maint_categories / maint_item_categories`，脚本中也定义了规则层输出 | 同上 |

### 1.3 已发现的证据链风险

| 风险 | 事实 | 证据 |
| --- | --- | --- |
| maint 与 local 数量不一致 | `maint_items=6146`，`local.items=6134`，`data/standardized/items.standardized.json` 为 `6131` 条 | 本地 DB 查询与 JSON 解析 |
| 分类规则层未真正落库 | 脚本与测试里有 `maint_category_nodes / maint_item_category_assignments`，但 `terria_v1_maint` 中表不存在 | `maint-schema.mjs`、`sync-landing-to-maint.test.mjs`、本地 DB 查询 |
| `maint_item_sources` 表字段比原始关系少 | 原始 `tmp-item-relations-acorn.json` 有 `quantityMin / quantityMax / quantityText / chanceValue / chanceText / sourceRefInternalName / sourceRefResolution`，但 `maint_item_sources` 只展开了 `item / sourceType / sourceRefType / sourceRefName / sortOrder / biomeCode` 等 | `reports/tmp-item-relations-acorn.json` 与 `maint-schema.mjs` |
| `source_ref_type='npc'` 不等于一定能关联到 NPC | 样例里 `Acorn` 的 `source_ref_name` 包含 `Ash tree / Shaking / Boreal tree / Forest tree / Pearlwood tree / Dryad for`，这些不一定都是 `npcs` 表里的实体 | `maint_item_sources` 样例查询与 `reports/tmp-item-relations-acorn.json` |
| recipe 有多条来源链 | `maint_item_recipes` 来自 `item_relations_bundle_raw`，`maint_item_page_recipes` 来自 item 页面 markup，`maint_recipe_page_recipes` 来自 recipe 页面；`local` 则有 `recipes / recipe_ingredients / recipe_stations` | `maint-schema.mjs` 与本地表结构 |
| buff 关系在 local 已有但不完整 | `buff_source_items=245`，`npc_buff_relations=0` | 本地 DB 计数查询 |
| projectile 目前主要是独立实体 | `local.projectiles` 存在，`local.items` 表结构没有 `projectile_id` 等直接字段；后端 `Item` 实体也没有 projectile/buff 外键字段 | `SHOW COLUMNS FROM items` 与 `back/src/main/java/.../Item.java` |

---

## 2. 请统一回答的问题

你可以直接在每题的“你的答案”列填写，也可以在文档末尾按 `Q1: ...` 格式回复。

### A. 总范围与落库策略

| 编号 | 问题 | 可选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q1 | 本长任务第一阶段是否只以 `terria_v1_maint` 为写入目标，不写 `terria_v1_local`？ | `A` 只写 maint；`B` maint 与 local 同步规划一起做但先 dry-run；`C` 直接规划写 local | `A` |  |
| Q2 | `maint` 后续是否作为所有 item 关系映射的唯一事实入口？ | `A` 是，local 只做下游投影；`B` maint 与 local 双事实源并行；`C` 仍以 local 为主，maint 只是补充 | `A` |  |
| Q3 | 第一阶段是否需要先补齐 `maint_category_nodes / maint_item_category_assignments`？ | `A` 先补齐；`B` 暂不做分类规则，优先 npc/recipe/buff/projectile；`C` 只写计划不执行 | `A` |  |
| Q4 | `maint_items` 多于 `local.items` 和 standardized 文件的差异是否要作为阻断项？ | `A` 是，先出差异报告再规划映射；`B` 否，映射时记录缺口；`C` 只阻断写 local，不阻断 maint 内加工 | `C` |  |
| Q5 | 是否允许新增 maint 关系表，而不是强行复用现有 `maint_item_sources / maint_item_recipes`？ | `A` 允许；`B` 不允许，只扩字段；`C` 尽量不新增，除非有证据证明现表无法承载 | `C` |  |

### B. 证据链与来源优先级

| 编号 | 问题 | 可选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q6 | 同一事实有多个来源时，优先级怎么排？ | `A` maint 原始 raw/snapshot > landing > local > standardized > 历史报告；`B` local > maint；`C` 逐域单独定 | `A` |  |
| Q7 | 每条加工后的关系是否必须保留可回溯字段？ | `A` 必须回溯到 maint record_key 和 landing_source_id；`B` 只保留 landing_source_id；`C` 只保留 raw_json | `A` |  |
| Q8 | 错误或可疑关系是否必须入异常报告？ | `A` 必须，Markdown + JSON；`B` 只写 Markdown；`C` 只在日志里输出 | `A` |  |
| Q9 | 异常是否需要入库成 `maint_*_issues`？ | `A` 本阶段不入库，只出报告；`B` 建统一 `maint_relation_issues`；`C` 每类关系一张 issue 表 | `A` |  |
| Q10 | 证据不足的关系是否允许推断生成？ | `A` 不允许，只标记 unresolved；`B` 允许低置信推断但必须带 reason/confidence；`C` 允许按名称匹配直接落关系 | `B` |  |

### C. item 身份与匹配口径

| 编号 | 问题 | 可选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q11 | item 的主匹配键优先使用什么？ | `A` `internal_name`；`B` `source_id`；`C` `source_id + internal_name` 双校验 | `C` |  |
| Q12 | `source_id` 冲突或缺失时如何处理？ | `A` 阻断该条关系；`B` 降级 internal_name 匹配并入 issue；`C` 直接按名称匹配 | `B` |  |
| Q13 | `maint_items` 中存在但 `local.items` 不存在的 item，是否参与 maint 内关系加工？ | `A` 参与；`B` 不参与；`C` 参与但标记为 local_missing | `C` |  |
| Q14 | 名称匹配是否允许作为最终关系键？ | `A` 不允许，只能辅助；`B` 允许但必须低置信；`C` 允许并作为正式键 | `A` |  |

### D. recipe 关系

| 编号 | 问题 | 可选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q15 | recipe 的 maint 基准来源优先用哪条？ | `A` `maint_item_recipes`；`B` `maint_recipe_page_recipes`；`C` 三类 recipe 表合并去重并按来源优先级选 canonical | `C` |  |
| Q16 | recipe 是否拆成规范化关系表？ | `A` 继续 JSON 存 ingredients/stations；`B` 新增 maint recipe 头表 + ingredient 表 + station 表；`C` 只生成下游报告不入库 | `B` |  |
| Q17 | recipe 去重主键怎么定？ | `A` result + ingredients + stations + version_scope；`B` source_page + sort_order；`C` record_key 原样 | `A` |  |
| Q18 | ingredient 或 station 无法匹配 item 时如何处理？ | `A` 保留 raw name，关系 item_id/internal_name 为空并入 issue；`B` 丢弃该 ingredient/station；`C` 用名称强行建 item | `A` |  |
| Q19 | `version_scope` 是否作为不同 recipe 版本保留？ | `A` 保留并参与去重；`B` 保留但不参与去重；`C` 忽略 | `A` |  |
| Q20 | 后续映射到 local `recipes` 时，是否允许覆盖现有 8539 条 recipe？ | `A` 不覆盖，只规划 maint；`B` 只 dry-run 差异；`C` 可覆盖但必须先备份和验收 | `B` |  |

### E. item 与 npc 的来源/掉落/商店关系

| 编号 | 问题 | 可选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q21 | `maint_item_sources.source_ref_type='npc'` 是否直接视为 NPC 关系？ | `A` 不直接视为，必须能匹配 `maint_npcs/local.npcs`；`B` 直接视为；`C` shop 直接视为，drop 必须匹配 | `A` |  |
| Q22 | 无法匹配 NPC 的 `source_ref_name` 如何处理？ | `A` 保留为 unresolved source，并入 issue；`B` 丢弃；`C` 自动改为 environment/object 来源类型 | `A` |  |
| Q23 | `sourceType=shop` 后续是否映射到 `npc_shop_entries`？ | `A` 是，但必须匹配 NPC；`B` 不映射，只保留 item source；`C` 只出建议报告 | `A` |  |
| Q24 | `sourceType=drop` 后续是否映射到 `npc_loot_entries`？ | `A` 是，但必须匹配 NPC 且保留掉率/数量；`B` 不映射；`C` 分 NPC drop 与环境 drop 两路 | `C` |  |
| Q25 | 当前 `maint_item_sources` 缺少掉率/数量展开字段，是否需要扩展？ | `A` 必须扩展；`B` 不扩展，从 raw_json 读取；`C` 新增规范化 source detail 表 | `C` |  |
| Q26 | `Dryad for` 这类明显解析污染的 source_ref_name 如何处理？ | `A` 入 issue，不自动修正；`B` 用规则清洗为 Dryad；`C` 规则清洗但必须保存原值与清洗 reason | `C` |  |

### F. item 与 buff 的关系

| 编号 | 问题 | 可选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q27 | buff 关系以哪个方向建模为主？ | `A` buff -> source items；`B` item -> granted buffs；`C` 双向视图，底层保留一套规范关系 | `C` |  |
| Q28 | 现有 `local.buff_source_items=245` 是否作为比 maint 更高优先级的数据？ | `A` 否，只作对照；`B` 是；`C` 二者合并并出冲突报告 | `C` |  |
| Q29 | NPC 与 buff 关系目前 `npc_buff_relations=0`，是否纳入本阶段？ | `A` 不纳入；`B` 纳入但只做审计；`C` 纳入映射规划 | `B` |  |
| Q30 | buff duration、chance、conditions 这类字段缺失时如何处理？ | `A` 留空并记录来源不足；`B` 从 tooltip 推断；`C` 不建关系 | `A` |  |

### G. item 与 projectile 的关系

| 编号 | 问题 | 可选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q31 | item -> projectile 关系是否纳入第一阶段？ | `A` 暂不纳入，只审计可用字段；`B` 纳入，新增 maint_item_projectiles；`C` 直接写 local 关系 | `A` |  |
| Q32 | 若纳入 projectile，关系来源以什么为准？ | `A` 只用已有 maint/raw 明确字段；`B` 允许从图片名/页面名推断；`C` 从游戏机制字段推断 | `A` |  |
| Q33 | `projectiles` 当前是独立实体，是否允许新增 item-projectile 关系表？ | `A` 允许但必须先出审计报告；`B` 不允许；`C` 等 local schema 统一重构时再做 | `A` |  |

### H. category / biome / image / snapshot

| 编号 | 问题 | 可选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q34 | 分类是否采用已确认的旧问卷默认值继续推进？ | `A` 是；`B` 重新确认；`C` 本阶段跳过分类 | `A` |  |
| Q35 | `maint_item_biomes` 是否作为 item-biome canonical 来源？ | `A` 是；`B` 只作辅助；`C` 与 local.item_biomes 合并对照 | `C` |  |
| Q36 | `maint_item_images` 是否也纳入 item 关系规划？ | `A` 纳入，但只处理 item-image；`B` 不纳入；`C` 仅出覆盖率报告 | `C` |  |
| Q37 | `maint_source_snapshots` 的用途是什么？ | `A` 只做证据回溯；`B` 做重新解析输入；`C` 两者都做，但加工表只保存 snapshot 引用 | `C` |  |

### I. 验证与输出

| 编号 | 问题 | 可选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q38 | 规划后第一批交付物应是什么？ | `A` 审计报告 + design；`B` 直接建表脚本；`C` 直接写同步实现 | `A` |  |
| Q39 | 每类关系是否都要有样例证据链？ | `A` 必须，每类至少 5 条样例；`B` 每类 1 条；`C` 只统计不抽样 | `A` |  |
| Q40 | dry-run 报告格式需要哪些？ | `A` JSON + Markdown；`B` 只 JSON；`C` 只控制台输出 | `A` |  |
| Q41 | 是否需要在规划里包含“禁止项”？ | `A` 需要，明确不胡编、不直接覆盖 local、不丢原始证据；`B` 不需要 | `A` |  |
| Q42 | 后续执行是否按关系域拆任务？ | `A` 按 recipe / npc-source / buff / projectile / category / validation 拆；`B` 一个大任务做完；`C` 先 recipe+npc，其他后置 | `A` |  |

---

## 3. 推荐默认答案

如果你不想逐题回复，我建议默认使用：

```text
Q1: A
Q2: A
Q3: A
Q4: C
Q5: C
Q6: A
Q7: A
Q8: A
Q9: A
Q10: B
Q11: C
Q12: B
Q13: C
Q14: A
Q15: C
Q16: B
Q17: A
Q18: A
Q19: A
Q20: B
Q21: A
Q22: A
Q23: A
Q24: C
Q25: C
Q26: C
Q27: C
Q28: C
Q29: B
Q30: A
Q31: A
Q32: A
Q33: A
Q34: A
Q35: C
Q36: C
Q37: C
Q38: A
Q39: A
Q40: A
Q41: A
Q42: A
```

---

## 4. 你可以补充的自由要求

```text
额外要求1:
额外要求2:
命名约束:
不允许做的事:
必须优先处理的关系域:
可接受的低置信推断范围:
```

---

## 5. 回答后下一步

收到你的统一答案后，再做：

1. 写正式 design 文档，明确 `maint` 关系链的目标表、数据流、证据链、异常处理和验证口径。
2. 写 implementation plan，拆成可执行任务。
3. 在实施前先出 dry-run/audit，不直接覆盖 `terria_v1_local`。

---

## 6. 本轮已确认答案

```text
Q1: A
Q2: A
Q3: A
Q4: C
Q5: C
Q6: A
Q7: A
Q8: A
Q9: A
Q10: B
Q11: C
Q12: B
Q13: C
Q14: A
Q15: C
Q16: B
Q17: A
Q18: A
Q19: A
Q20: B
Q21: A
Q22: A
Q23: A
Q24: C
Q25: C
Q26: C
Q27: C
Q28: C
Q29: B
Q30: A
Q31: A
Q32: A
Q33: A
Q34: A
Q35: C
Q36: C
Q37: C
Q38: A
Q39: A
Q40: A
Q41: A
Q42: A
```

额外要求：

- 新建数据库保存处理后的关系结果
- 处理结果不和 `terria_v1_local`、`terria_v1_maint` 混在一起
