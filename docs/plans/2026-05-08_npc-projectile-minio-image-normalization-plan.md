# NPC / Projectile MinIO 图片路径规范与内容审计计划

**日期**: 2026-05-08  
**状态**: 规划中  
**来源**: `docs/todo/backlog.md` 中的 `NPC / Projectile MinIO Path Normalization And Legacy Object Audit`

---

## 目标

把 `npc` / `projectile` 图片问题拆成可验证的三条链并闭环：

1. 修正非 `item` 实体被写入 `terrapedia-images/items/...` 的路径规范问题。
2. 让标准化产物、维护表、关系表、投影表、业务表对同一图片来源达成一致。
3. 用对象级审计区分“只是路径错位”与“对象内容确实陈旧/错误”，避免误判。

---

## 当前已确认事实

- MinIO 当前全局配置仍使用单一 `object-prefix: items`。
- `data/standardized/npcs.standardized.json`、`data/generated/npc-standardized-map.json`、`data/standardized/projectiles.standardized.json` 中，已经存在大量 `http://localhost:9000/terrapedia-images/items/...` 的非 `item` 图片 URL。
- `npcs.image_url` 当前主要仍是 wiki URL，不是本地托管 URL。
- `projectiles.image_url` 当前基本为空。
- `maint_npc_images` 当前为空。
- 这轮只读核查已经证明“路径不规范”是真问题。
- 这轮只读核查还没有证明“MinIO 对象内容本身就是旧图或错图”。

---

## 不在本计划内

- 不把“页面先显示出来”作为成功标准。
- 不接受继续用 wiki 直链或爬虫临时产物掩盖本地图链缺口。
- 不在未完成对象级审计前批量删除旧 MinIO 对象。
- 不把 `npc/projectile` 问题顺手扩散成全实体图片系统大重构。

---

## 方案选择

### 方案 A：只修读取侧，继续接受 `items/...` 旧路径

优点：

- 改动最小。
- 页面短期最容易恢复。

缺点：

- 不能解决写入契约错误。
- 以后还会继续产出新的错误前缀。
- 只会把“历史脏数据”合法化，不能形成可审计闭环。

### 方案 B：先固定规范，再迁移数据，再做对象内容审计

优点：

- 先把新增写错路径的问题关掉。
- 可以明确区分“新写入必须正确”与“历史对象如何迁移”。
- 最适合后续补 gate、补 monitor、补数据库一致性审计。

缺点：

- 需要分阶段推进，不能只靠一次热修。

### 方案 C：直接全量重传 NPC / Projectile 图片并覆盖旧对象

优点：

- 表面上最快看到“路径和对象都更新了”。

缺点：

- 风险最高。
- 在未证明对象错误来源之前，容易误覆盖正确对象。
- 一旦同步链路仍有错，等于把错误批量扩大。

**推荐**: 方案 B。  
先封住错误写入，再补齐维护/投影链路，再对历史对象做内容审计和定向迁移。

---

## 执行分层

本计划按三层问题拆分：

### Layer 1：路径契约层

要回答：

- `npc` / `projectile` 新写入是否还会落到 `items/...`
- managed URL 的“合法前缀”是不是仍然只有 `items/...`

成功标准：

- 新生成的 NPC / Projectile managed URL 不再落到 `terrapedia-images/items/...`
- 读取侧能够识别迁移后的规范前缀

### Layer 2：数据一致性层

要回答：

- 标准化文件、maint、relation、projection、业务表是否引用同一张托管图片
- 哪一层还停留在 wiki URL、空值、或历史错误路径

成功标准：

- 每个目标实体域都能给出分层计数：`managed-correct-prefix` / `managed-wrong-prefix` / `wiki-only` / `empty`
- projection 和 business table 的每条图片记录都能关联到 maint/relation 来源，或输出明确 gap reason

### Layer 3：对象内容层

要回答：

- 历史 `items/...` 路径下的 NPC / Projectile 对象是否只是“放错目录”
- 还是对象内容本身已经和 wiki 源图不一致

成功标准：

- 每个实体类型至少 20 条对象样本完成内容审计；可用样本不足 20 条时审计全部可用样本并记录不足原因
- 只有 `correct-object-wrong-path` 和 `wrong-object` 结论允许进入 Phase 4C 迁移/重传候选集

---

## Phase 0：冻结基线

### 0.1 产物与数据库基线

冻结以下事实并写入审计文档：

- `npcs.standardized.json`
- `projectiles.standardized.json`
- `npc-standardized-map.json`
- `npcs.image_url`
- `projectiles.image_url`
- `maint_npc_images`
- `relation_npc_images`
- `relation_projectile_images`
- `projection_npcs.image_url`
- `projection_projectiles.image_url`

### 0.2 路径分类基线

至少输出四类计数：

- `managed_correct_prefix`
- `managed_wrong_prefix`
- `wiki_only`
- `empty`

计数必须按以下层分别输出：

- standardized
- generated map
- maint
- relation
- projection
- business table

### 0.2A 可生成图片候选数口径

Phase 0 必须同时输出 `generatable_image_candidate_count`，供 Phase 3 验收使用。

NPC 计数规则：

- 输入层：`npcs.standardized.json`
- 计入条件：记录存在 `internalName`，且 `imageFileTitle`、`imageUrl`、`rawJson.imageFileTitle`、`rawJson.imageUrl` 中至少一个能解析出可追溯 source URL
- 排除条件：无 `internalName`，或所有 source 字段为空，或 source URL 无法归属到该 NPC 记录

Projectile 计数规则：

- 输入层：`projectiles.standardized.json`
- 计入条件：记录存在 `internalName`，且 `imageFileTitle`、`imageUrl`、`extras.image`、`rawJson.imageFileTitle`、`rawJson.imageUrl` 中至少一个能解析出可追溯 source URL
- 排除条件：无 `internalName`，或所有 source 字段为空，或 source URL 无法归属到该 Projectile 记录

每个被排除的 image-bearing 记录必须输出 gap reason，例如 `missing_internal_name`、`missing_source_url`、`source_not_provable`。

### 0.3 MinIO 对象基线

至少输出以下对象层统计：

- `terrapedia-images/items/` 下疑似 NPC / Projectile 对象数量
- `terrapedia-images/npcs/` 对象数量
- `terrapedia-images/projectiles/` 对象数量
- 按对象 key 抽样的 `lastModified`、`size`、`contentType`

如果当前环境无法直接读取 MinIO 对象列表，Phase 0 必须把该状态记录为 `object_inventory_unavailable`，并阻断 Phase 4C 的 legacy 对象迁移/清理。

### 0.4 样本基线

为 `npc` 和 `projectile` 各抽样：

- 20 条 object-backed 样本：优先来自 `managed_wrong_prefix`，不足时补 `managed_correct_prefix`
- 10 条 source-gap 样本：来自 `wiki_only` 或 `empty`

object-backed 样本必须记录：

- entity type
- entity id / internal name
- source URL
- managed URL
- object key
- content type
- 文件大小

source-gap 样本必须记录：

- entity type
- entity id / internal name
- source URL
- managed URL 状态，允许为空
- gap reason
- owning table or artifact

Phase 0 验收：

- 基线统计和样本清单完整。
- relation 层和 MinIO 对象层均有基线，或明确记录对象层不可达并阻断对象迁移/清理。
- 后续每个 Phase 都必须能与该基线对比。

---

## Phase 1：固定路径契约

### 1.1 定义实体级 canonical prefix

本计划采用以下 canonical prefix 契约：

- `items` -> `terrapedia-images/items/...`
- `npcs` -> `terrapedia-images/npcs/...`
- `projectiles` -> `terrapedia-images/projectiles/...`

### 1.2 固定写入侧

需要排查并修正：

- 上传工具默认前缀
- workflow image sync
- wiki image sync
- 任何复用统一上传接口但未传实体上下文的脚本/服务

### 1.3 固定 managed URL 判定侧

读取契约必须区分两件事：

- 新 canonical prefix 是合法 managed URL
- 历史错误前缀在迁移完成前是否临时视为“legacy managed URL”

执行边界：

- 写入侧立即禁止继续新增 `npc/projectile -> items/...`
- 读取侧在迁移窗口内允许识别 legacy 错误前缀，但必须可审计、可计数

Phase 1 验收：

- 新写入测试样本不再落到 `items/...`
- managed URL policy 测试覆盖 `npcs/...` 和 `projectiles/...`
- 没有任何新增 NPC / Projectile managed URL 继续生成到 item 前缀

---

## Phase 2：补齐分层一致性审计

### 2.1 新增只读审计脚本

审计至少覆盖：

- standardized
- generated map
- maint
- relation
- projection
- business table

### 2.2 输出分层 gap reasons

至少支持这些口径：

- `wrong_managed_prefix`
- `missing_maint_rows`
- `missing_relation_rows`
- `projection_image_not_managed`
- `business_table_wiki_only`
- `business_table_empty`
- `content_audit_pending`

### 2.3 接入现有链路

优先接入：

- `image-source-lineage-report`
- readiness / gate 所依赖的图片契约报告
- 如果 `image-source-lineage-report` 无法承载 standardized/generated/business/MinIO 对象层统计，则必须新增独立 `npc-projectile-image-path-audit` 报告

Phase 2 验收：

- 单次执行能清楚回答“错在标准化、维护、关系、投影、业务表的哪一层”
- `npc` 和 `projectile` 不再只是“页面现象判断”
- 审计报告必须输出 `wrong_managed_prefix`、`wiki_only`、`empty`、`canonical_managed` 四类计数，且按 standardized、generated map、maint、relation、projection、business table 分层

---

## Phase 3：历史引用回填与候选登记

### 3.1 先回填链路，再登记对象候选

顺序必须是：

1. 先修写入契约
2. 再回填 maint / relation / projection / business references
3. 再登记 legacy 对象候选
4. 最后在 Phase 4C 才允许迁移或清理 legacy 对象

### 3.2 NPC 链路

目标：

- `maint_npc_images` 不再为空
- `relation_npc_images` 可追踪到规范化 managed URL
- `projection_npcs.image_url` 与 `npcs.image_url` 的来源边界明确

### 3.3 Projectile 链路

目标：

- `maint_projectiles.raw_json.image` 与 `relation_projectile_images` 可审计
- `projection_projectiles.image_url` 与业务表图片记录能关联到 maint/relation 来源，或输出明确 gap reason

### 3.4 legacy 候选登记

Phase 3 只允许登记 legacy 候选，不允许迁移或清理对象。候选清单至少包含：

- entity type
- entity id / internal name
- current URL
- expected canonical prefix
- source URL
- owning table or artifact
- next required audit action

禁止：

- 在 Phase 4 对象内容审计前复制、删除、覆盖或重传 MinIO 对象
- 直接把业务表继续指向 wiki 作为“最终修复”

Phase 3 验收：

- `maint_npc_images.row_count` 等于 Phase 0 的 NPC `generatable_image_candidate_count`，或每个短缺项都有 gap reason
- `relation_npc_images.row_count` 等于 Phase 0 的 NPC `generatable_image_candidate_count`，或每个短缺项都有 gap reason
- `relation_projectile_images.row_count` 等于 Phase 0 的 Projectile `generatable_image_candidate_count`，或每个短缺项都有 gap reason
- `projection_npcs.image_url` 和 `projection_projectiles.image_url` 对所有 image-bearing rows 都能关联到 maint/relation 来源，或输出明确 gap reason
- 此阶段不得清理或覆盖 legacy MinIO 对象，只允许建立可追溯引用

---

## Phase 4：对象内容审计

### 4.1 抽样规则

按实体分别抽样，两类样本必须分开记录：

- object-backed 样本：高访问/高曝光记录、已迁移对象、仍在 legacy 错误前缀下的对象
- source-gap 样本：仍为 wiki-only 或 empty 的记录

### 4.2 审计口径

object-backed 样本至少验证：

- source URL 是否与实体记录匹配
- object key 是否落在预期前缀
- content type 是否合理
- 渲染结果是否与 wiki 页面主图一致

source-gap 样本至少验证：

- 是否存在可追溯 source URL
- 缺少 managed URL 的原因是否落入明确 gap reason
- 是否允许继续作为缺图状态，或必须进入后续重传/补源任务

### 4.3 审计结论分类

- `correct-object-wrong-path`
- `correct-object-correct-path`
- `wrong-object`
- `source-not-provable`

Phase 4 验收：

- 没有“只看路径就假设对象内容错”的误判
- 每个实体类型至少完成 20 条 object-backed 样本审计；可用 object-backed 样本不足 20 条时必须审计全部可用样本并记录不足原因
- 每个实体类型至少完成 10 条 source-gap 样本审计；可用 source-gap 样本不足 10 条时必须审计全部可用样本并记录不足原因
- 所有进入 legacy 对象迁移/清理候选集的对象都必须有 `correct-object-wrong-path` 或 `wrong-object` 结论，`source-not-provable` 不得进入自动迁移/清理

---

## Phase 4C：legacy 对象迁移与清理

**前置**: Phase 4 已完成对象内容审计，且候选对象没有 `source-not-provable`。

### 4C.1 迁移策略

对历史 `items/...` 的非 item 图片，只允许两种处理结论：

- `rename/copy to canonical prefix`：对象内容正确，只是路径错
- `re-upload from verified source`：对象内容错误或无法信任

禁止：

- 在未分类前直接批量删除历史对象
- 直接把业务表继续指向 wiki 作为“最终修复”

### 4C.2 验收口径

- `npc` 和 `projectile` 的对外输出层 `managed_wrong_prefix_count = 0`，除非存在显式 legacy 豁免清单
- legacy 豁免清单必须包含 entity type、entity id/internal name、legacy URL、保留原因、到期处理动作
- 自动迁移/清理后重新运行 Phase 2 审计，确认 `wrong_managed_prefix` 未回升

---

## Phase 5：门禁与监控

### 5.1 门禁

新增或补强以下阻断条件：

- 新生成的 NPC / Projectile managed URL 落到 `items/...` 时直接失败
- 投影/业务表对 image-bearing rows 继续输出 wiki URL 时失败，除非该实体有明确 `image_missing` 或 `source_not_provable` gap reason
- 迁移完成后，投影/业务表继续输出 legacy `terrapedia-images/items/...` 的 NPC / Projectile URL 时失败，除非命中显式 legacy 豁免清单
- 对象内容审计未完成前，不允许宣称链路闭环

### 5.2 监控

以下指标必须接入 `crawler-monitor` 或同类只读监控，作为闭环必选项：

- NPC wrong-prefix count
- Projectile wrong-prefix count
- NPC wiki-only count
- Projectile wiki-only count
- latest object-audit snapshot
- last successful canonical sync timestamp
- legacy exemption count

Phase 5 验收：

- 问题能够被持续观察，而不是再次靠页面截图发现
- 监控 API 或报告在连续两次执行中都能输出上述 7 个指标，字段名和类型保持一致
- gate 与 monitor 读取同一份审计结果或同一套统计口径，不允许各自独立推导

---

## 串并行边界

### 可以并行

- 只读基线统计
- 样本清单收集
- 现有报告/脚本/测试入口盘点
- 监控字段设计

### 必须串行

- 共享 managed URL 契约定义
- 上传路径生成逻辑
- managed URL policy
- 共享 image sync 服务
- 对同一张表的批量回填
- 对 legacy 对象的迁移与清理

---

## 多 Agent 分工建议

### Lane 1：路径契约

负责：

- MinIO prefix 契约
- managed URL policy
- 写入侧禁止继续产出错误前缀

### Lane 2：数据分层审计

负责：

- standardized / generated / maint / relation / projection / business 统计
- gap reason 设计
- 报告输出格式

### Lane 3：历史迁移

负责：

- NPC / Projectile 历史引用迁移方案
- 错误前缀对象分类
- 回滚策略

### Lane 4：监控与门禁

负责：

- 监控页面指标
- gate / warning / blocked 口径
- 样本证据沉淀

---

## 硬边界

- 不允许把 wiki 直链重新包装成“已修复”。
- 不允许在写入契约未修复前先做大规模历史迁移。
- 不允许在未完成对象级样本审计前批量删除 legacy 对象。
- 不允许用页面显示正常替代分层一致性证明。
- 不允许让 `items` 域因为这次 NPC / Projectile 修复被误伤。

---

## 回滚策略

- 写入侧改动先做 fail-closed：发现 prefix 不合法时阻断新增，而不是静默回退到 `items/...`
- 读取侧在迁移窗口内保留 legacy prefix 识别能力
- 历史对象清理必须滞后于引用迁移，且必须可重放、可审计

---

## 最终验收口径

全部满足才算这条链闭环：

- 新生成的 NPC / Projectile managed URL 不再落到 `terrapedia-images/items/...`
- `npc` / `projectile` 的 standardized、maint、relation、projection、business 均能给出一致的 managed-image 去向
- `projection_npcs`、`projection_projectiles`、业务表对外输出层 `managed_wrong_prefix_count = 0`，除非存在显式 legacy 豁免清单
- legacy 错误前缀对象已被分类为“仅路径错误”或“对象内容错误”
- 每个实体类型至少 20 条 object-backed 样本证明对象内容与源图一致，或给出明确重传证据；可用 object-backed 样本不足 20 条时必须审计全部可用样本并记录不足原因
- 每个实体类型至少 10 条 source-gap 样本有明确 gap reason；可用 source-gap 样本不足 10 条时必须审计全部可用样本并记录不足原因
- gate / monitor 能持续发现回归

---

## 推荐执行顺序

1. Phase 0 冻结基线  
2. Phase 1 固定路径契约  
3. Phase 2 补分层审计  
4. Phase 3 回填历史引用并登记 legacy 候选  
5. Phase 4 做对象内容审计  
6. Phase 4C 迁移或清理 legacy 对象  
7. Phase 5 接入门禁与监控

先关住“继续写错”，再处理“历史为什么错”，最后才处理“哪些旧对象该清”。这是本计划最重要的边界。
