# Maint 分类规则层一次性回填文档

日期：2026-04-23  
范围：只在 `maint` 链路内实施，不落 `local`  
主题：以 `maint_categories + maint_item_categories` 为基准，新增一层分类规则化结果表 / 同步脚本

---

## 1. 当前任务口径

### Goal

在 `maint` 库内，把当前仅作为抓取展开结果存在的：

- `maint_categories`
- `maint_item_categories`

继续加工成一层可重复生成、可审计、可作为后续下游基准输入的“分类规则层结果表”。

### Success Criteria

- 结果仍然只写入 `maint_*`
- 新结果明确区分“来源快照”和“规则化产物”
- 同步脚本可重复执行
- 能解释 group node / leaf item / 未匹配 item / 父子层级 的处理口径
- 有最小验证与报告输出

### Out Of Scope

- 不写 `terria_v1_local`
- 不直接改 `category / item_category` 业务表
- 不接前端、不接公开 API
- 不做对 `local` 分类树的覆盖式回填

### Verified Entrypoints

- maint 同步主入口：`scripts/data/maint/sync-landing-to-maint.mjs`
- 分类展开解析：`scripts/data/maint/category-item-structured-parser.mjs`
- maint 表结构生成：`scripts/data/maint/maint-schema.mjs`

---

## 2. 已确认事实

1. `categories_raw` 已经能被展开进：
   - `maint_categories`
   - `maint_item_categories`
2. `maint_categories` 是模板级快照，当前一行对应一个 wiki categories template 结果。
3. `maint_item_categories` 是明细级展开结果，当前行粒度接近：
   - `topLevel`
   - `templateTitle`
   - `sectionTitle`
   - `groupName`
   - `itemName`
   - `parentItemName`
   - `depth`
4. 当前解析阶段已经尝试把 item 名称映射到 `itemInternalName`，但允许为空。
5. 现有项目文档明确说：
   - `categories_raw` 暂时不应直接覆盖 `local.category`
   - 更适合作为规则层或二次标准化输入

---

## 3. 这次需要你一次性拍板的内容

下面每题都给了推荐答案。你可以直接改“你的答案”一列，或者在文末按编号回填。

| 编号 | 问题 | 选项 | 推荐 | 你的答案 |
| --- | --- | --- | --- | --- |
| Q1 | 规则层输出形态做几张表 | `A` 一张总表；`B` 规则头表 + 规则明细表；`C` 规则头表 + 分类节点表 + 物品映射表 | `B` |  |
| Q2 | 规则层主粒度是什么 | `A` 按 template 快照；`B` 按 category path 节点；`C` 按 item-category 归属关系 | `B` |  |
| Q3 | 规则层的主要目标 | `A` 镜像 wiki 分类结构；`B` 产出稳定 category path 规则；`C` 只做审计报表 | `B` |  |
| Q4 | 是否把 group node 视为正式分类节点 | `A` 是；`B` 否，只当展示分组；`C` 保留但单独标记 | `C` |  |
| Q5 | `itemInternalName` 为空的记录如何处理 | `A` 直接丢弃；`B` 保留进规则结果；`C` 不入主结果，只进异常表/报告 | `C` |  |
| Q6 | 父子层级的 canonical key 用什么 | `A` 仅文本路径；`B` template + 文本路径；`C` topLevel + section + group + path | `C` |  |
| Q7 | 每次 apply 的写入策略 | `A` 全量重建该 scope；`B` 按 record_key 幂等 upsert；`C` 先标旧数据删除再写新 current | `C` |  |
| Q8 | 是否保留“来源快照”和“规则结果”的显式关联 | `A` 否；`B` 只保留 `landing_source_id`；`C` 保留到 `maint_categories / maint_item_categories` 的回溯字段 | `C` |  |
| Q9 | 是否需要产出异常/未决表 | `A` 不需要；`B` 只出 markdown/json 报告；`C` 单独 `maint_*_issues` 表并附报告 | `B` |  |
| Q10 | 本轮是否把 item 到 canonical category 的最终映射也一起产出 | `A` 不做，只先产出分类节点规则；`B` 做；`C` 只做样例 | `B` |  |
| Q11 | 一个 item 允许挂多个 canonical category 吗 | `A` 只允许一个；`B` 允许多个；`C` 允许多个但标主次 | `C` |  |
| Q12 | 规则层结果是偏“current 覆盖”还是“历史积累” | `A` 只保 current；`B` 保历史版本；`C` current + 最近一次历史快照 | `A` |  |
| Q13 | 表命名风格 | `A` `maint_category_rules` / `maint_item_category_rules`；`B` `maint_category_nodes` / `maint_item_category_assignments`；`C` 你指定名字 | `B` |  |
| Q14 | 是否把这层结果设计成后续可直接给 `local` 导入用 | `A` 是，结构尽量贴近后续导入；`B` 否，只做 maint 内审计层；`C` 半贴近 | `A` |  |

---

## 4. 我建议的默认落地方案

如果你不想逐题思考，我建议直接按下面这套默认值实施：

- `Q1: B`
- `Q2: B`
- `Q3: B`
- `Q4: C`
- `Q5: C`
- `Q6: C`
- `Q7: C`
- `Q8: C`
- `Q9: B`
- `Q10: B`
- `Q11: C`
- `Q12: A`
- `Q13: B`
- `Q14: A`

对应的含义是：

1. 新增两张主表：
   - `maint_category_nodes`
   - `maint_item_category_assignments`
2. `maint_categories + maint_item_categories` 继续保留为来源快照层，不被替代。
3. `maint_category_nodes` 表示规则化后的分类节点。
4. `maint_item_category_assignments` 表示 item 与 canonical category 的映射结果。
5. group node 保留，但用字段显式标识，不与最终叶子节点混淆。
6. 未能解析到 `itemInternalName` 的项不进入主结果表，只进入报告。
7. 每次同步时，该 scope 的旧 current 结果先失效，再写入新 current 结果。
8. 所有规则结果都保留来源追踪字段，能回到：
   - `landing_source_id`
   - `maint_categories.record_key`
   - `maint_item_categories.record_key`
9. 本轮同时产出 item 到 canonical category 的映射，不只停留在节点层。
10. 一个 item 可以命中多个 category，但要有主次标记。

---

## 5. 建议的新表语义草案

这部分不是最终实现，只是为了让你更容易判断上面的题。

### 5.1 `maint_category_nodes`

建议表达：

- canonical category 节点
- 节点层级与父节点
- 文本路径
- 来源 template / section / group
- 是否来自 group node
- 当前状态与追踪字段

建议关键字段方向：

- `record_key`
- `node_key`
- `top_level`
- `section_title`
- `group_name`
- `node_name`
- `parent_node_key`
- `path_text`
- `depth`
- `is_group_node`
- `source_template_title`
- `source_maint_category_record_key`
- `source_landing_id`
- `status`
- `deleted`

### 5.2 `maint_item_category_assignments`

建议表达：

- item 命中了哪个 canonical category
- 命中方式与优先级
- 是否主分类
- 来源明细回溯

建议关键字段方向：

- `record_key`
- `item_internal_name`
- `item_name`
- `category_node_key`
- `category_path_text`
- `is_primary`
- `assignment_reason`
- `source_template_title`
- `source_item_name`
- `source_parent_item_name`
- `source_maint_item_category_record_key`
- `source_landing_id`
- `status`
- `deleted`

---

## 6. 这次实现前仍需你确认的风险点

1. wiki categories 的 group / section 不一定都适合作为 TerraPedia 的正式 canonical category。
2. 同一个 item 可能出现在多个 template 或多个 group 下。
3. 有些节点是“类目标题”，不是 item，也不是最终业务分类。
4. `itemInternalName` 匹配当前依赖 `standardized/items.standardized.json`，存在漏配。
5. 如果后续要接 `local`，本轮表结构最好提前保留导出友好字段。

---

## 7. 你直接填写的推荐方式

你可以直接改上面的“你的答案”列。  
如果你更喜欢文本回填，就在本文末尾按这个格式补：

```text
Q1: B
Q2: B
Q3: B
Q4: C
Q5: C
Q6: C
Q7: C
Q8: C
Q9: B
Q10: B
Q11: C
Q12: A
Q13: B
Q14: A
```

如果你想补充自由要求，也按下面格式加：

```text
额外要求1:
额外要求2:
命名约束:
不允许做的事:
```

---

## 8. 你填完后我会做什么

你回填后，我会直接进入下一步，不再拆问：

1. 产出正式 design
2. 写 implementation plan
3. 再开始改 `maint-schema.mjs`、`sync-landing-to-maint.mjs` 和测试

---

## 9. 已确认答案

```text
Q1: B
Q2: B
Q3: B
Q4: C
Q5: C
Q6: C
Q7: C
Q8: C
Q9: B
Q10: B
Q11: C
Q12: A
Q13: B
Q14: A
```
