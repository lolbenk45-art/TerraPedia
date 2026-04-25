# Relation 替代 Local 长任务问卷

日期：2026-04-25

目标：围绕 `terria_v1_relation` 替代 `terria_v1_local` 的长期任务，先把必须拍板的问题一次性收拢。你统一答复后，再进入正式 design 和 milestone 拆分。

原则：
- 不胡编乱造
- 所有关系都要求可溯源
- `relation` 不是简单复制 `local`，而是要比 `local` 更全面、更稳定、更可审计
- 任何“替代”都以真实来源链和证据链为前提

---

## 1. 当前已核实事实

### 1.1 当前 `local` 和 `relation` 的定位还不对等

- `local` 更像业务实体库
- `relation` 当前更像基础快照 + 关系库 + 审计库

已核实字段差异：

- `local.items` 有：`slug / image / category_id / rarity_id / description / description_zh / tooltip / tooltip_zh / buy / sell`
- `relation_items` 目前没有这些业务字段，主要是：`source_id / internal_name / english_name / name_zh / 基础数值 / flags_json / raw_json / trace`
- `local.npcs` 有：`is_boss / is_town_npc / life_max / knock_back_resist / category_id / sub_name_zh`
- `relation_npcs` 目前没有对应正式列，很多信息仍在 `flags_json / raw_json`
- `local.buffs` 是完整实体表
- `relation` 目前没有 `relation_buffs`，只有：
  - `relation_buff_images`
  - `item_buff_relations`

### 1.2 当前覆盖率差异

- `local.items = 6134`
- `relation_items = 6146`
- `local.npcs = 762`
- `relation_npcs = 762`
- `local.projectiles = 1111`
- `relation_projectiles = 1111`
- `local.buffs = 388`
- `relation` 当前没有 `relation_buffs`

中文覆盖已核实：

- `local.items.name_zh = 6134 / 6134`
- `relation_items.name_zh = 0 / 6146`
- `local.npcs.name_zh = 757 / 762`
- `relation_npcs.name_zh = 0 / 762`
- `local.projectiles.name_zh = 1006 / 1111`
- `relation_projectiles.name_zh = 0 / 1111`
- `local.buffs.name_zh = 340 / 388`

### 1.3 当前 `relation` 已有的优势

- recipe 已规范化：
  - `item_recipe_heads`
  - `item_recipe_ingredients`
  - `item_recipe_stations`
- NPC 商店/掉落已有关系候选层：
  - `item_npc_shop_candidates = 126`
  - `item_npc_loot_candidates = 166`
- buff 关系已有：
  - `item_buff_relations = 245`
- biome 关系已有：
  - `item_biome_relations = 364`
- 图片已经独立镜像：
  - `relation_item_images = 4001`
  - `relation_npc_images = 758`
  - `relation_projectile_images = 1110`
  - `relation_buff_images = 388`
- 每条记录可回溯到：
  - `source_maint_table`
  - `source_maint_record_key`
  - `landing_source_id`
  - `landing_source_key`
  - `landing_content_hash`

### 1.4 当前阻塞“直接替代 local”的核心缺口

- 缺完整 `buff` 基表
- 缺业务投影字段
- 缺中文字段补齐
- 缺 `local` 口径兼容层
- 缺“可直接供业务查询”的统一实体视图
- 缺部分复杂关系的正式化：
  - NPC 售卖条件
  - NPC 掉落环境/模式/条件
  - boss / npc 系列与相关物品关系
  - 配方组展开与替代材料枚举

---

## 2. 本轮需要你拍板的问题

你可以直接在文档最后按 `Q1: A` 这种格式统一回答。

### A. 替代策略总方向

| 编号 | 问题 | 选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q1 | `relation` 的替代目标是什么？ | `A` 成为新的主事实库，未来直接替代 `local`；`B` 成为事实库 + 由它投影生成新的业务库；`C` 只替代 `local` 的部分数据来源，不替代整体业务库 | `B` |  |
| Q2 | 是否接受 `relation` 内部同时存在“规范化事实层”和“面向业务的投影层”？ | `A` 接受；`B` 不接受，只保留规范化层；`C` 不接受，只做与 `local` 同构的库 | `A` |  |
| Q3 | 后续是否允许在 `relation` 内新增一组“兼容 local 口径”的 projection tables / views？ | `A` 允许；`B` 只允许 views 不允许 tables；`C` 不允许，必须直接改现有 relation 表 | `A` |  |
| Q4 | 对齐 `local` 时，优先级应是什么？ | `A` 先保证真实性与溯源，再补业务字段；`B` 先对齐 `local` 的字段结构；`C` 两边并行 | `A` |  |

### B. 实体层建模方式

| 编号 | 问题 | 选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q5 | `items / npcs / projectiles / buffs` 是否都要在 `relation` 里有完整实体基表？ | `A` 都要；`B` 只补 items/npcs/projectiles；`C` 继续保持部分关系型存储 | `A` |  |
| Q6 | `buff` 域是否明确要求补 `relation_buffs` 基表？ | `A` 必须补；`B` 暂不补，只保留关系和图片；`C` 先做设计不落库 | `A` |  |
| Q7 | `biome / bosses / armor_sets` 这些域是否也要逐步进入 `relation` 的实体层，而不是只做辅助关系？ | `A` 要；`B` 只做 biome；`C` 暂不纳入本阶段 | `A` |  |
| Q8 | `relation` 实体层是否要尽量补齐 `local` 的业务字段，但来源必须可证明？ | `A` 要；`B` 只保留基础字段；`C` 仅在 projection 层补 | `A` |  |

### C. 中文、描述、业务字段来源

| 编号 | 问题 | 选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q9 | 中文名是否允许继续参考 `local`，还是必须改为仅接受爬取/标准化来源？ | `A` 只能用爬取/标准化/maint 可证实来源；`B` 可拿 `local` 作为过渡来源；`C` 按域决定 | `A` |  |
| Q10 | `slug` 是否要作为 relation/local 替代层的正式字段？ | `A` 要；`B` 可由查询层实时生成；`C` 暂不需要 | `A` |  |
| Q11 | `description / tooltip / description_zh / tooltip_zh` 这类业务文本是否要纳入替代范围？ | `A` 要；`B` 只做 name/image/relations；`C` 延后单独做 | `A` |  |
| Q12 | `buy / sell / rarity_id / category_id` 这类业务字段是否要进入 relation 的目标范围？ | `A` 要；`B` 只做部分；`C` 暂不纳入 | `A` |  |

### D. 图片与媒体口径

| 编号 | 问题 | 选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q13 | 图片最终口径是保留独立图片表，还是还要把主图回填到实体层？ | `A` 两者都要；`B` 只保留图片表；`C` 只在实体层保留主图 | `A` |  |
| Q14 | 主图选择是否统一采用“首选 cached_url，其次 original_url，其次空值”的规则？ | `A` 是；`B` 统一 original_url；`C` 按域单独定义 | `A` |  |
| Q15 | 剩余缺图实体是否进入 issue/report，而不是静默为空？ | `A` 必须；`B` 可空不报；`C` 只做统计不列明细 | `A` |  |

### E. 配方与替代材料/替代制作站

| 编号 | 问题 | 选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q16 | 配方组材料如 `Any Iron Bar / Any Wood` 是否要在 relation 中继续保留组语义？ | `A` 保留组语义；`B` 全展开成具体材料；`C` 同时保留组和展开结果 | `C` |  |
| Q17 | 替代制作站如 `Mythril Anvil / Orichalcum Anvil` 是否维持当前多站点显式记录？ | `A` 维持；`B` 合并成站点组；`C` 只保留一个主站点 | `A` |  |
| Q18 | 后续是否要增加“配方展开层”，把组材料展开成具体可枚举替代关系？ | `A` 要；`B` 不要；`C` 只对部分重点物品做 | `A` |  |

### F. NPC 售卖 / 掉落 / 环境条件

| 编号 | 问题 | 选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q19 | 当前 `item_npc_shop_candidates` 是否要升级成正式规范表，而不再叫 candidate？ | `A` 要；`B` 保持 candidate 命名；`C` 只做 view 别名 | `A` |  |
| Q20 | 当前 `item_npc_loot_candidates` 是否也要升级成正式规范表？ | `A` 要；`B` 暂不；`C` 只做审计层 | `A` |  |
| Q21 | NPC 售卖条件是否要建模为结构化条件，而不是只留文本 conditions？ | `A` 要，逐步结构化；`B` 只留文本；`C` 文本为主，部分结构化 | `C` |  |
| Q22 | NPC 掉落环境条件是否要拆分这些维度？ | `A` biome / difficulty / event / time / weather / special flags 都尽量拆；`B` 只留原文；`C` 先拆 biome+difficulty | `A` |  |
| Q23 | NPC 售卖/掉落关系是否必须保留“来源页面 + 来源版本 + 解析原因 + 置信度”？ | `A` 必须；`B` 只留来源页面；`C` 只留 raw_json | `A` |  |

### G. boss / npc 系列 / 物品系列关系

| 编号 | 问题 | 选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q24 | boss、npc 与“相关物品系列”是否纳入 relation 长任务范围？ | `A` 纳入；`B` 只纳入 boss；`C` 延后 | `A` |  |
| Q25 | “系列”关系是否接受先以显式证据链为准，不做无证据推断？ | `A` 接受；`B` 可允许弱推断；`C` 由人工白名单补充 | `A` |  |
| Q26 | boss 召唤物、专家/大师掉落、纪念品、圣物、宠物等奖励是否要单独分层建模？ | `A` 要；`B` 统一并入一般掉落；`C` 只做 boss summon / loot 两类 | `A` |  |

### H. local 兼容与切换方式

| 编号 | 问题 | 选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q27 | 最终替代是“直接改现有服务查询 relation”，还是“先从 relation 投影出新 local-compatible 层”？ | `A` 先投影，再切换；`B` 直接改服务查 relation；`C` 两条路都准备 | `A` |  |
| Q28 | 是否要求 relation 投影层尽量兼容 `local` 当前主表字段名？ | `A` 是；`B` 否，只要语义兼容；`C` 只兼容关键字段 | `A` |  |
| Q29 | `local` 中已有但来源不稳定的字段，是否允许在 relation 替代层中先留空，直到找到可靠来源？ | `A` 允许；`B` 不允许，必须先补齐再替代；`C` 关键字段不允许，其它允许 | `C` |  |

### I. 真实性、审计与验收

| 编号 | 问题 | 选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q30 | 是否要求每个域都输出“覆盖率 + 缺口明细 + 样例证据链”报告？ | `A` 要；`B` 只输出汇总；`C` 只在最终切换前输出 | `A` |  |
| Q31 | 是否接受“字段级验收”，例如先验收 items 的 image/name/category，再验收更复杂关系？ | `A` 接受；`B` 不接受，必须整域一起验收；`C` 视域而定 | `A` |  |
| Q32 | 对无法证实的关系/字段，是否一律不落正式结果，只进 issue/report？ | `A` 一律如此；`B` 允许低置信落正式结果；`C` 由域决定 | `A` |  |
| Q33 | 里程碑执行时，是否以“先实体、再关系、再投影、再替换验证”的顺序推进？ | `A` 是；`B` 先补关系；`C` 先补 projection | `A` |  |

---

## 3. 建议默认答案

如果你想直接统一拍板，我建议默认采用：

```text
Q1: B
Q2: A
Q3: A
Q4: A
Q5: A
Q6: A
Q7: A
Q8: A
Q9: A
Q10: A
Q11: A
Q12: A
Q13: A
Q14: A
Q15: A
Q16: C
Q17: A
Q18: A
Q19: A
Q20: A
Q21: C
Q22: A
Q23: A
Q24: A
Q25: A
Q26: A
Q27: A
Q28: A
Q29: C
Q30: A
Q31: A
Q32: A
Q33: A
```

---

## 4. 自由补充

你也可以额外补这几类要求：

```text
额外要求1:
额外要求2:
必须优先替代的域:
必须最后处理的域:
不能接受的做法:
可以接受的过渡方案:
```

---

## 5. 你回复后我会做什么

收到你的统一答复后，下一步我会：

1. 写正式 design 文档，明确 relation 替代 local 的目标结构、分层模型、来源链、禁止项、验收口径
2. 再创建 milestone 文档
3. 后续严格按 milestone 执行，不再来回散问
