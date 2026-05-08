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
- `maint_npc_images` 当前已有 758 行；当前问题不是 maint 为空，而是 maint / relation / projection 中的历史图片引用仍指向错误的 `items/...` managed prefix。
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

---

## 当前执行状态快照（2026-05-08）

本节记录当前分支已经完成与尚未完成的真实状态，作为后续执行入口，避免重新从零判断。

执行分支：

- 工作树：`G:\ClaudeCode\TerraPedia-dev\.worktrees\fix-npc-projectile-minio-image-normalization`
- 分支：`fix/npc-projectile-minio-image-normalization`

已完成：

- 后端上传接口已经支持 `entityDomain`，NPC / Projectile 新上传可以写入 `npcs/...` / `projectiles/...`。
- 后端 managed image URL policy 已支持 `items,npcs,projectiles` 多前缀。
- Node 脚本侧 `minio-image-upload`、`run-image-sync`、`sync-standardized-entities-to-db` 已接入实体域上下文。
- `image-source-lineage-report` 已能统计 relation/projection 层的 `rowsWithWrongManagedPrefix`。
- 已新增或更新对应 Java / Node 测试。

已验证：

- `mvn "-Dtest=MinioManagedImageUrlPolicyTest,FileStorageControllerTest,MinioObjectStorageServiceImplTest" test`
- `node --test scripts/data/relation/managed-image-url-policy.test.mjs`
- `node --test scripts/data/audit/image-source-lineage-report.test.mjs`
- `node --test scripts/data/lib/minio-image-upload.test.mjs scripts/data/workflow/run-image-sync.test.mjs`

当前真实基线：

- `reports/audit/image-source-lineage-2026-05-08-minio-phase0.json`
- NPC：
  - `relation_npc_images.rowCount = 758`
  - `relation_npc_images.rowsWithWrongManagedPrefix = 758`
  - `projection_npcs.rowsWithImage = 758`
  - `projection_npcs.rowsWithManagedImage = 0`
  - `projection_npcs.rowsWithWrongManagedPrefix = 758`
- Projectile：
  - `relation_projectile_images.rowCount = 1110`
  - `relation_projectile_images.rowsWithWrongManagedPrefix = 1110`
  - `projection_projectiles.rowsWithImage = 1110`
  - `projection_projectiles.rowsWithManagedImage = 0`
  - `projection_projectiles.rowsWithWrongManagedPrefix = 1110`
  - 当前仍有 `missing_core_image_evidence`
- 标准化文件：
  - `data/standardized/npcs.standardized.json` 仍有 758 条 `items/...`，4 条缺图。
  - `data/standardized/projectiles.standardized.json` 仍有 1110 条 `items/...`，1 条缺图。
  - `data/generated/npc-standardized-map.json` 仍有 758 条 `items/...`，4 条缺图。
- `reports/workflow-image-sync-2026-05-08.json` dry-run 显示：
  - NPC：`candidates=758`，`alreadyManaged=0`，`changed=758`，`missingSource=4`
  - Projectile：`candidates=1110`，`alreadyManaged=0`，`changed=1110`，`missingSource=1`

结论：

- 代码层已经进入“可防止新增错误前缀”的状态。
- 历史数据尚未完成回写，不能宣称图片链路闭环。

---

## 继续执行计划：从代码修复到真实数据闭环

### 执行目标

把 NPC / Projectile 历史图片引用从错误的 `items/...` 前缀推进到规范前缀，并让 standardized、generated、maint、relation、projection、business table 的审计结果一致。

本阶段不做：

- 不删除 MinIO legacy `items/...` 对象。
- 不把 wiki 直链作为最终修复结果。
- 不扩大到 Items、Buffs、Bosses、ArmorSets 等非目标域。

受控允许：

- 当 dry-run 与对象样本审计已经证明 source URL 可追溯时，允许通过上传接口为 NPC / Projectile 生成 canonical `npcs/...` / `projectiles/...` 新对象。
- 该动作只允许新增 canonical 对象，不允许删除、覆盖、移动 legacy `items/...` 对象。

### 串行写入边界

以下步骤必须串行执行，不允许多个 Agent 同时写同一目标：

- `data/standardized/npcs.standardized.json`
- `data/standardized/projectiles.standardized.json`
- `data/generated/npc-standardized-map.json`
- `terria_v1_local.npcs`
- `terria_v1_local.projectiles`
- `terria_v1_relation.relation_npc_images`
- `terria_v1_relation.relation_projectile_images`
- `terria_v1_relation.projection_npcs`
- `terria_v1_relation.projection_projectiles`

允许并行：

- 只读审查报告。
- 监控字段设计。
- 测试入口盘点。
- 审计结果复核。

### Step 1：重新确认标准化图片 URL 回写候选

进入条件：

- 后端、MinIO、DB 均可访问。
- `reports/workflow-image-sync-2026-05-08.json` dry-run 仍显示 NPC `changed=758`、Projectile `changed=1110`，或重新 dry-run 后解释差异。

命令：

```powershell
node scripts/data/workflow/run-image-sync.mjs --apply=false --scopes=npcs,projectiles --output=reports/workflow-image-sync-2026-05-08-pre-apply-dry-run.json
```

预期：

- `apply=false`
- NPC `changed=758`。
- Projectile `changed=1110`。
- `missingSource` 保持 NPC `4`、Projectile `1`，除非 dry-run 基线变化并有报告解释。

失败停止条件：

- `changed` 与当前基线大幅不一致且无法解释。
- dry-run 输出包含目标域以外的写入范围。
- `managedUrlPrefixes` 缺少 `npcs/...` 或 `projectiles/...`。

### Step 2：对象样本与 source-gap 审计放行

目的：

- 证明即将上传的 source URL 对应真实 NPC / Projectile 图片，而不是继续把错误对象搬到 canonical 前缀。
- 证明不能上传的 source-gap 记录有明确 gap reason，不会在 apply 后被误认为已修复。
- 这一步只抽样验证，不写数据库，不删除对象。

抽样规则：

- NPC 从 Step 1 `changed` 候选中抽 20 条 object-backed 样本。
- Projectile 从 Step 1 `changed` 候选中抽 20 条 object-backed 样本。
- NPC 从 Step 1 `missingSource` / `wiki_only` / `empty` 候选中抽 4 条 source-gap 样本；当前基线只有 4 条时必须全量审计。
- Projectile 从 Step 1 `missingSource` / `wiki_only` / `empty` 候选中抽 1 条 source-gap 样本；当前基线只有 1 条时必须全量审计。
- 如果候选不足 20 条，则审计全部候选并记录不足原因。

object-backed 样本必须记录：

- entity type
- id / internalName
- current source URL
- expected canonical prefix
- source URL 来源字段
- 审计结论：`source-provable` / `source-not-provable` / `wrong-source`

source-gap 样本必须记录：

- entity type
- id / internalName
- 当前图片字段状态：`wiki_only` / `empty` / `missingSource`
- 尝试解析过的 source 字段
- gap reason：`missing_source_url` / `source_not_provable` / `image_missing_expected`
- 是否允许保持缺图

放行条件：

- 两个目标域 object-backed 样本中没有 `wrong-source`。
- `source-not-provable` 样本必须登记 gap reason，且不得进入自动上传。
- source-gap 样本必须全部有 gap reason；没有 gap reason 时不得进入 Step 3。
- 样本报告保存到 `reports/audit/`。

### Step 3：执行标准化图片 URL 回写

进入条件：

- Step 2 样本审计通过。
- 允许通过上传接口新增 canonical 对象。

命令：

```powershell
node scripts/data/workflow/run-image-sync.mjs --apply=true --scopes=npcs,projectiles --output=reports/workflow-image-sync-2026-05-08-apply.json
```

预期：

- `apply=true`
- NPC `changed=758` 或与 pre-apply dry-run 差异可解释。
- Projectile `changed=1110` 或与 pre-apply dry-run 差异可解释。
- `uploaded` 等于实际新增 canonical 对象数。
- 不删除、不覆盖 legacy `items/...` 对象。

失败停止条件：

- 任一 NPC / Projectile 新 URL 仍写入 `terrapedia-images/items/...`。
- 脚本尝试写入非目标域。
- 上传或鉴权失败导致部分记录状态不明。

### Step 4：验证标准化文件与生成物

命令：

```powershell
node scripts/data/workflow/run-image-sync.mjs --apply=false --scopes=npcs,projectiles --output=reports/workflow-image-sync-2026-05-08-post-apply-dry-run.json
```

验收：

- NPC `changed=0` 或仅剩有明确 gap reason 的记录。
- Projectile `changed=0` 或仅剩有明确 gap reason 的记录。
- `alreadyManaged` 应从 `0` 上升到对应可生成候选数。
- `data/standardized/npcs.standardized.json` 不再包含 NPC 图片的 `terrapedia-images/items/...`。
- `data/standardized/projectiles.standardized.json` 不再包含 Projectile 图片的 `terrapedia-images/items/...`。

如果 `alreadyManaged` 仍为 `0`，停止执行，回查 managed prefix 判定，不进入 DB 回写。

### Step 5：同步标准化数据到本地业务库

进入条件：

- Step 4 已确认标准化文件前缀正确。
- DB 目标为 `terria_v1_local`。

先 dry-run：

```powershell
node scripts/data/sync/sync-standardized-entities-to-db.mjs --apply=false --scopes=npcs,projectiles
```

再 apply：

```powershell
node scripts/data/sync/sync-standardized-entities-to-db.mjs --apply=true --scopes=npcs,projectiles
```

验收：

- `npcs.image_url` 对 image-bearing rows 指向 `terrapedia-images/npcs/...` 或有明确缺图原因。
- `projectiles.image_url` 对 image-bearing rows 指向 `terrapedia-images/projectiles/...` 或有明确缺图原因。
- `data/generated/npc-standardized-map.json` 与 `npcs.standardized.json` 的 NPC 图片前缀一致。

失败停止条件：

- 出现 `npcs.image_url` 或 `projectiles.image_url` 批量回退到 wiki URL。
- 出现新的 `terrapedia-images/items/...` 非 item 图片引用。

### Step 6：同步 maint 图片来源层

进入条件：

- Step 5 已完成 local DB 同步。
- 目标 maint DB 为 `terria_v1_maint`。
- 必须先确认 `run-image-sync --apply=true` 与 `sync-standardized-entities-to-db --apply=true` 均不写 `terria_v1_maint`；当前代码核实结果是二者不写 maint。

NPC maint 同步：

```powershell
node scripts/data/maint/sync-standardized-npc-images-to-maint.mjs --apply=false --maint-database=terria_v1_maint --standardized-path=data/standardized/npcs.standardized.json
node scripts/data/maint/sync-standardized-npc-images-to-maint.mjs --apply=true --maint-database=terria_v1_maint --standardized-path=data/standardized/npcs.standardized.json
```

NPC 验收：

- `maint_npc_images.rowCount` 等于 Step 1 的 NPC `candidates`，或每个短缺项都有 gap reason。
- `maint_npc_images.cached_url` 不再包含 NPC 图片的 `terrapedia-images/items/...`。

Projectile maint 阻断检查：

当前仓库没有专用的 `sync-standardized-projectile-images-to-maint.mjs`。Projectile maint 图片来源经 `maint_projectiles.raw_json.image` / `raw_json.imageUrl` 被 relation 层消费，因此 Step 6 必须先用只读检查确认 `maint_projectiles.raw_json` 已包含 canonical `projectiles/...` 或可追溯 source 字段。

只读检查命令：

```powershell
node scripts/data/audit/image-source-lineage-report.mjs --source=db --local-database=terria_v1_local --maint-database=terria_v1_maint --relation-database=terria_v1_relation --output=reports/audit/image-source-lineage-2026-05-08-minio-maint-pre-relation.json
```

Projectile 放行条件：

- 如果 `maint_projectiles` 仍引用 `terrapedia-images/items/...` 或缺少可让 relation 生成 canonical cached URL 的字段，则停止执行，不进入 Step 7。
- 停止后必须新增或扩展 maint 同步脚本，让 `maint_projectiles.raw_json.imageUrl` 与标准化 projectile canonical URL 对齐，再重新运行 Step 6。
- 不允许用 Step 7 的 relation 同步去掩盖 maint 层过时。

### Step 7：重建 relation 与 projection 链路

先 dry-run relation：

```powershell
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation --scopes=npc,projectile
```

再 apply relation：

```powershell
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --maint-database=terria_v1_maint --local-database=terria_v1_local --relation-database=terria_v1_relation --scopes=npc,projectile
```

先 dry-run projection-to-local：

```powershell
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=false --local-database=terria_v1_local --relation-database=terria_v1_relation --domains=npcs,projectiles
```

再 apply projection-to-local：

```powershell
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=true --local-database=terria_v1_local --relation-database=terria_v1_relation --domains=npcs,projectiles
```

验收：

- `relation_npc_images.rowsWithWrongManagedPrefix = 0`
- `relation_projectile_images.rowsWithWrongManagedPrefix = 0`
- `projection_npcs.rowsWithWrongManagedPrefix = 0`
- `projection_projectiles.rowsWithWrongManagedPrefix = 0`
- Projectile 的 `missing_core_image_evidence` 消失，或只剩明确 gap reason。

失败停止条件：

- relation dry-run 显示 projection 将被清空或目标 row count 异常下降。
- projection-to-local apply 前发现 projection 表为空。
- 任一目标域出现大规模 `image_url = null` 且没有 gap reason。

### Step 8：重跑 lineage 审计并形成证据

命令：

```powershell
node scripts/data/audit/image-source-lineage-report.mjs --source=db --local-database=terria_v1_local --maint-database=terria_v1_maint --relation-database=terria_v1_relation --output=reports/audit/image-source-lineage-2026-05-08-minio-post-normalization.json
```

验收：

- NPC `contractReady = true`，或只剩明确非本阶段阻塞的 gap reason。
- Projectile `contractReady = true`，或只剩明确非本阶段阻塞的 gap reason。
- NPC / Projectile 的 relation 与 projection wrong-prefix 均为 `0`。
- Items、Buffs、Bosses、ArmorSets 不因本次修复退化。

### Step 9：接入 crawler-monitor 只读监控

目标入口：

- `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- `back/src/main/java/com/terraria/skills/controller/AdminCrawlerMonitorController.java`
- `data-query-app/pages/operations/crawler-monitor.vue`
- `data-query-app/types/crawlerMonitor.ts`

最小实现：

- 复用最新 `reports/audit/image-source-lineage-*.json`。
- 在 `/admin/crawler-monitor/overview` 返回 NPC / Projectile 图片规范化指标。
- 页面展示：
  - `npcWrongPrefixCount`
  - `projectileWrongPrefixCount`
  - `npcWikiOnlyCount`
  - `projectileWikiOnlyCount`
  - `latestImageLineageReport`
  - `lastCanonicalSyncAt`
  - `legacyExemptionCount`

验收：

- 管理端页面能看到上述指标。
- 指标来自审计报告或同一套后端统计口径。
- 不新增写 DB 的监控接口。

### Step 10：最终验证与提交前检查

必跑：

```powershell
mvn "-Dtest=MinioManagedImageUrlPolicyTest,FileStorageControllerTest,MinioObjectStorageServiceImplTest" test
node --test scripts/data/relation/managed-image-url-policy.test.mjs
node --test scripts/data/audit/image-source-lineage-report.test.mjs
node --test scripts/data/lib/minio-image-upload.test.mjs scripts/data/workflow/run-image-sync.test.mjs
git status --short
```

如修改 crawler-monitor，再补跑：

```powershell
mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest" test
cd data-query-app
pnpm run check
```

提交范围必须排除：

- `scripts/dev/config/local-stack.config.json`
- `scripts/dev/config/credentials.json`
- 任何本地密钥、密码、token。

### 最终完成定义

本分支可以进入提交/合并前，必须同时满足：

- 新写入契约已由测试证明不会继续产出 NPC / Projectile `items/...`。
- 标准化文件、generated map、本地业务表、relation、projection 的 NPC / Projectile wrong-prefix 为 `0`。
- 审计报告保留在 `reports/audit/`，能解释剩余缺图项。
- crawler-monitor 能看到同一套指标。
- legacy MinIO 对象未被删除或覆盖；如仍存在，只作为 Phase 4C 后续对象审计任务处理。
