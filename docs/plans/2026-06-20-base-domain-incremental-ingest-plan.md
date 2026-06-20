# 基础域（terria_v1_local）数据稳定化与行级增量入库执行计划

- 日期：2026-06-20
- 范围：**仅 `terria_v1_local` 基础域**。`terria_v1_maint`、`terria_v1_relation` 两库及其同步链**不在本次范围**。
- 目标：让所有写基础域的入库脚本/服务做到 **"只动真正改变的行，不动未改动的数据"**（需求⑦），并补齐基础域写入的安全护栏，使基础数据"稳"。
- 约束：本计划阶段不改代码；执行阶段每项改动需 **编译 + 现有测试 + 新增幂等测试** 全绿方可合入。

---

## 1. 背景与问题定性

调研覆盖全部写 `terria_v1_local` 的入口（17 个脚本 + 1 个后端服务）。核心病灶：**大多数入库是"无条件覆盖式写入"**——命中行每轮都被 UPDATE 且 `updated_at=NOW()`，即使内容一字未变；部分关系表每轮 DELETE 后整组重插。后果：

- `updated_at` 噪声化，无法用它判断"数据真的变了没"。
- 触发下游（缓存失效、maint/relation 投影、前端 ETag）无谓刷新。
- 大表（items/npcs）每轮全量写，放大 I/O 与锁。

**已有正确范式存在**：`import-wiki-town-npcs-to-db.mjs` 已在实体行 UPDATE 前做值比对跳过（`:304/:316/:421/:426`）；`backfill-item-periods-from-wiki.mjs`（`:146-150`）、`sync-item-rarity-period-to-primary-db.mjs`（`:148-151`）用 SQL `WHERE <> ` 差异守卫。**本计划即把这套范式推广到所有基础域写入。**

### 1.1 写入模式三分类（决定改造手法）

| 类别 | 含义 | 脚本（file:line 见附录 A） | 改造手法 |
|---|---|---|---|
| **A. 键控 upsert** | 按自然键 INSERT/UPDATE 单行 | world-contexts、biomes 实体、independent-entities 实体、standardized items、`ItemImportServiceImpl` | 写前比对"入参 vs 现有行"，相同则跳过（含跳过 `updated_at`） |
| **B. 关系表 delete+reinsert** | 每轮 DELETE 父键下整组再重插 | buffs.buff_source_items、independent.armor_set_items、boss 成员、town-npc shop、boss-loot | 集合级 reconcile：算 add/remove/update 差集，无差异不写 |
| **C. 作用域 broad-DELETE / 整域重灌** | 一条 DELETE 清掉整个 provider/scope 再重灌 | normal-npc-loot（最危险）、shimmer 四表、wiki-zh-recipes、recipes-from-external | 作用域内容哈希门控：scope 哈希未变则整段跳过 |

### 1.2 安全缺口（必须先补）

- **缺主库守卫 `assertPrimaryDb`**：`sync-standardized-entities-to-db.mjs`、`import-wiki-zh-recipes-to-db.mjs`、`import-recipes-from-external-data.mjs`。这些脚本能误写到非 local 库且无拦截。
- **缺 dry-run**：`import-buffs-to-db.mjs`（总是 commit）、`import-standardized-to-db.mjs`（无 dry-run，无法安全预演）。
- **最强无条件churn**：`sync-standardized-entities-to-db.mjs`（`npcs:135`、`projectiles:260` 无差异守卫且无主库守卫）——列为 P0。

> **范围更正（交叉审查后）**：基础域写入口远不止 14 个 import 脚本。另有 `scripts/data/sync/`、`scripts/data/backfill/`、`scripts/data/landing/` 下约 16 个 `.mjs`，以及后端 `WikiImageSyncServiceImpl.java` 也写基础域表（见 §附录 B）。且**"daemon 不触发任何基础域写脚本"的早期判断是错的**：daemon plan → `run-support-sync-pipeline.mjs:27` → `sync-item-categories-from-wiki-pages.mjs`（写 `items`/`category`/`item_category_rel`），`run-wiki-zh-recipe-sync-pipeline.mjs:30` → `backfill-recipe-zh-display-names.mjs`（写 recipe 系表）。本计划范围 = **附录 A + 附录 B 全集**。

---

## 2. 非目标（明确排除）

- 不动 `terria_v1_maint`、`terria_v1_relation` 的任何脚本/表。
- 不运行/不改 `scripts/data/relation/*-to-local` / `materialize-*-into-local` / `cutover-*`（relation 反向写基础域的入口，本次一律不碰）。
- 不改 daemon 调度编排（需求③）、不改 retry/补爬（需求⑤）——另立计划。
- 不改表结构语义；仅在确有必要时为"内容指纹"加列（见 4.2，作为可选项）。

---

## 3. 统一改造原则

1. **判等而非判键**：命中已有行后，比较"将写入值"与"现有值"的归一化快照；**全等 ⇒ 跳过本行所有写（含 `updated_at`）**，计入 `skipped`。
2. **判等比较"DB 实际会存的值"，而非原始入参**：比较对象必须是"按列类型/长度归一化后、即将落库的投影"对 vs "从 DB 读回的现有行"，否则 `VARCHAR(n)` 截断、charset 折叠会造成**永久假差异**（每轮都判为变）或**永久假相等**（漏更）。
3. **共享、由 schema 驱动的归一化库（强制）**：不允许各脚本各写一套 trim/null 逻辑。建一个按**列类型**归一化的公共库，至少覆盖：
   - **JSON/text 列**：parse 后**深比较**（忽略 key 顺序/空白），禁止字符串直比；
   - **DECIMAL/FLOAT**：按列精度做容差比较，禁止 JS `===`（避免 `1.0` vs `1`、`0.1+0.2`）；
   - **DATETIME/timestamp**：固定单一时区（pin `time_zone`）后比较，避免 TZ 假匹配/假差异；
   - **charset/collation**：明确按列 collation 判等（大小写/重音等价），且**真实差异不得因 collation 折叠被跳过**；
   - **NULL ≠ '' ≠ 0**：禁止把 `NULL` 折叠成 `''`——`NULL→''` 本身是必须写入的真实变更。
4. **排除计算列**：`NOW()`、`generatedAt` 等每轮必变列不进比较集。
5. **集合级 reconcile（类别 B）**：以父键加载现有子行集合，与目标集合做差集；只 INSERT 新增、只 DELETE 消失、只 UPDATE 变更，**无差异不发语句**。改造前**逐表声明**：父键、子行唯一自然键、是否含 `sort_order`/顺序语义、该键在父作用域内是否真唯一（防"近似重复子行被粗键合并误删"）。顺序列必须进比较集，否则重排被静默丢弃。
6. **跨表副作用纳入差集**：如 boss 成员（`npcs.boss_group_id/boss_role`）reconcile 必须覆盖**离开该组的 NPC**（清角色标志），不能只处理当前成员，否则留下孤儿标志。
7. **作用域哈希门控（类别 C）**：对一个 provider/scope 的目标数据算 sha256，与上轮存档比对；未变则整段跳过 DELETE+INSERT。规则：
   - **哈希输入 = 即将写库的投影对象本身（序列化后的 INSERT payload）**，不得手挑字段列表（加列时会漂移导致漏更）；
   - **哈希加版本前缀**（如 `v2:`），算法/投影变更时使旧哈希全失效，避免升级后"全部看似未变"；
   - **外部副作用单独成哈**：MinIO 图片、音频二进制等**不在行内容里**的资产，其字节 sha256 必须并入门控，或**资产上传不受门控**（行未变但图片变了，不能被跳过导致 MinIO 留旧对象）。
8. **幂等 + 漏更双向可证**（见 §5）：仅"跑两遍 0 写"只能证明无多余写，**证明不了无漏更**；必须配"逐列扰动可检出"测试。
9. **可回滚**：改动前 `mysqldump` 相关表；保留 `--force-rewrite` 开关临时退回旧"无条件覆盖"行为应急。

---

## 4. 分阶段执行

### 阶段 0：安全网（先做，零行为变更）
- [ ] 0.1 给 `sync-standardized-entities-to-db.mjs`、`import-wiki-zh-recipes-to-db.mjs`、`import-recipes-from-external-data.mjs` 补 `assertPrimaryDb`（照搬 `import-wiki-bosses-to-db.mjs:745-749` 模式）。
- [ ] 0.2 给 `import-buffs-to-db.mjs`、`import-standardized-to-db.mjs` 补 `--dry-run`（事务末 `rollback`），与其它脚本口径一致。
- [ ] 0.3 落一份基线脚本：对全部基础域表 `mysqldump` 备份；记录各表 `COUNT(*)` 与 `MAX(updated_at)` 作为前后对照基准。
- **验收**：所有现有测试绿；dry-run 不写库；非 local 库被拒写。
- **回滚**：纯增量护栏，删除新增分支即可。

### 阶段 1：建立共享判等/对账工具 + 样板
- [ ] 1.1 抽公共 `lib`：`buildRowSnapshot(fields)`、`rowsEqual(a,b)`、`reconcileChildRows({existing,target,key})`，配单测。
- [ ] 1.2 以 `import-wiki-town-npcs-to-db.mjs` 现有值比对为参照基准，确认新工具与之等价（回归对照）。
- **验收**：工具单测覆盖 null/类型/大小写/数字边界；town-npc 行为不回归。

### 阶段 2：类别 A —— 键控 upsert 加"跳过未改"
按"易→难/影响面"顺序：
- [ ] 2.1 `import-world-contexts-to-db.mjs`（`world_contexts` ODKU `:72-89`）——最简单，先试点跑通范式。
- [ ] 2.2 `import-biomes-to-db.mjs`（`biomes:324-356` 及其 junction）。
- [ ] 2.3 `import-independent-entities-to-db.mjs`（buffs/npcs/projectiles/armor_sets ODKU `:284/:403/:597/:664`）。
- [ ] 2.4 `import-standardized-to-db.mjs` items 路径：**先扩 `loadItemLookup`（`:314-339`）的 SELECT 列**至全部 UPDATE 列，再在 `:407` UPDATE 前比对；`upsertItemRecord`（`:543`）同改。
- [ ] 2.5 `ItemImportServiceImpl.java`：在 `applyPayload`（`:172`）前对 `existing.item()` 拍快照，与应用后比对；相等则跳过 `setUpdatedAt`（`:173`）+`updateById`（`:175`），计 skipped。
- **验收（每脚本）**：连续两次 apply，第二次 `updated=0`；首次跑前后 `COUNT(*)` 不变、仅真实变更行 `updated_at` 前进。
- **回滚**：`--force-rewrite` 退回旧行为。

### 阶段 3：类别 B —— 关系表集合级 reconcile
- [ ] 3.1 `import-buffs-to-db.mjs` `buff_source_items`（DELETE `:300`+reinsert）。
- [ ] 3.2 `import-independent-entities-to-db.mjs` `buff_source_items`/`armor_set_items`（`:336`/`:694`）。
- [ ] 3.3 `import-wiki-bosses-to-db.mjs` 成员关系（`clearExistingMembersForGroup:636-643` + 重设 `:224-234`）：改为差集，仅变动成员才动 `npcs.boss_group_id/boss_role`。
- [ ] 3.4 `import-wiki-town-npcs-to-db.mjs` shop conditions/entries（`:360-366`）改集合 reconcile。
- [ ] 3.5 `import-boss-loot-to-db.mjs` `npc_loot_entries` per-owner（DELETE `:186`）改差集。
- **验收**：第二次 apply 对关系表 `deleted=0/inserted=0`；关系内容真变时只动差集行。
- **回滚**：`--force-rewrite` 退回 delete+reinsert。

### 阶段 4：类别 C —— 整域重灌改"作用域哈希门控"
- [ ] 4.1 `import-normal-npc-loot-to-db.mjs`（broad DELETE `:397-407`，**最危险**）：对 managed scope 目标集算哈希，未变跳过整段；变了才在事务内重灌。
- [ ] 4.2 `import-wiki-shimmer-to-db.mjs` 四表 scope 重灌（`replaceSourceScopedRows:650-666`）同法。
- [ ] 4.3 `import-wiki-zh-recipes-to-db.mjs`（provider 级 DELETE `:805-807`）+`import-recipes-from-external-data.mjs`（`deleteRecipeRows :363-368`）：按 result_item/provider 分组哈希门控。
- [ ] 4.4 `import-wiki-audio-assets-to-db.mjs`：**修正**——此脚本的 sha256（`:92/:135/:488`，写入 `audio_assets.sha256 :504/:514`）是**音频字节校验列，已在使用，不是闲置的 scope 指纹**。改造手法应为：upsert 前比对"现有行（含 sha256 列）vs 目标行"，sha256 相同且其它列相同则跳过 upsert（`audio_assets` ODKU `:485`、`audio_asset_links` ODKU `:527`）。这正是 §3.7 第三条"资产字节哈希并入判等"的范例。
- **验收**：scope 内容未变时第二次 apply 对该域 0 写；scope 变更时仅该 scope 重灌，其它 scope 不受影响。
- **回滚**：`--force-rewrite`。

### 阶段 5：验证已"看似安全"的脚本（仅核验，不改逻辑）
- [ ] 5.1 复核 `backfill-item-periods`、`sync-item-rarity-period`、`backfill-npc-flags`、`consolidate-recipe-provider-priority`、`import-wiki-town-npcs` 的现有跳过是否真覆盖所有写路径（含 lookup-seed 的无条件 `updated_at=NOW()`，如 `sync-item-rarity-period:369/383`）。
- **验收**：补一条幂等测试即可，不改主逻辑。

---

## 5. 跨阶段统一验收（"基础数据稳"的硬指标）

> 关键认知：**"跑两遍 0 写"只证明"无多余写"，证明不了"无漏更"。** 一个永远返回"相等"的坏比较器能完美通过幂等测试却丢掉所有更新。因此漏更方向必须单独证。

1. **幂等性（防多余写）**：每个入库脚本/服务 `apply` 跑两遍，第二遍三计数（updated/inserted/deleted）全 0、仅 skipped 增长。做成 CI 门禁 `verify-ingest-idempotency.mjs`。
2. **逐列扰动可检出（防漏更，强制）**：对比较集中的**每一列**（循环遍历，非抽样），在源数据中扰动该列后 apply，断言**恰好**该行/该列被更新。这是唯一能证明"无静默漏更"的测试。
3. **schema 漂移门禁**：CI 断言"比较集/哈希投影字段 == 该表实际可写列集合"；新增一列若未纳入比较集则 CI 失败，从源头防"加列后漏更"。
4. **首轮等价对照**：干净库上，旧"无条件覆盖"路径与新路径跑完后，各表 `COUNT(*)` 与全表内容哈希一致（证明新路径不少写）。
5. **`updated_at` 单调真实**：一轮真实无变更的 refresh 后，全表 `MAX(updated_at)` 不前进。
6. **主库锁死**：所有基础域写脚本均有 `assertPrimaryDb`，非 `terria_v1_local` 拒写。
7. **持续对账兜底（具体化，不只是口号）**：落一个**定时对账作业**——从源重算目标投影并与 DB 全量 diff，**任何 delta 即告警**。这是唯一能在线发现"比较器坏了导致漏更"的手段；须定义 cadence（如每日）、负责人、告警出口，并产出 diff 报告。`--force-rewrite` 仅作人工应急，不计入兜底（漏更无人察觉，没人会主动跑它）。
8. **测试全绿**：新增上述测试 + 现有 `.test.mjs`/后端测试（参照各脚本同名 `*.test.mjs`）。

---

## 6. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 判等遗漏字段 → 真实变更被当"未变"跳过（静默漏更） | 高（数据陈旧） | 比较集必须 = UPDATE 列全集；阶段 5 加"故意改一列"测试验证能检出；保留周期性 `--force-rewrite` 全量对账兜底 |
| 归一化不当 → 假差异，跳过失效 | 中（白干但不丢数据） | 工具层统一归一化 + 单测覆盖类型/大小写/null |
| 类别 C 哈希门控漏掉边界变更 | 高 | scope 哈希纳入全部参与重灌的字段；变更检出测试 |
| 大表扩列查询（items `loadItemLookup`）增内存 | 中 | 分页/分批加载；只取需要比较的列 |
| 关系 reconcile 误删 | 高 | 差集仅作用于本父键作用域；事务包裹；dry-run 预演 diff |

---

## 7. 执行顺序建议

P0 `sync-standardized-entities`（阶段0安全 + 阶段2判等，最脏）→ 阶段0其余 → 阶段1工具 → 阶段2（items 优先，影响最大）→ 阶段3 → 阶段4（normal-npc-loot 优先，最危险）→ 阶段5 核验。每脚本独立 PR、独立验收，互不阻塞。

---

## 附录 A：基础域写入清单（file:line 证据）

**无条件 `updated_at=NOW()`（类别 A，需加判等）**
- `import-standardized-to-db.mjs` items UPDATE `:430` / `:567`；`loadItemLookup` 仅取部分列 `:314-339`
- `back/.../ItemImportServiceImpl.java` `setUpdatedAt(now):173` → `updateById:175`
- `import-biomes-to-db.mjs` `:356`（biomes ODKU）等
- `import-biome-wikitext-resolved-to-db.mjs` `:265/:284/:310/:331`
- `import-independent-entities-to-db.mjs` `:304/:435/:619/:678`
- `import-world-contexts-to-db.mjs` `:89`
- `sync/sync-standardized-entities-to-db.mjs` `:135`(npcs)/`:260`(projectiles)〔无 assertPrimaryDb〕

**关系 delete+reinsert（类别 B，需集合 reconcile）**
- `import-buffs-to-db.mjs` `buff_source_items` DELETE `:300`〔无 dry-run〕
- `import-independent-entities-to-db.mjs` `:336`/`:694`
- `import-wiki-bosses-to-db.mjs` `:636-643` + `:224-234`
- `import-wiki-town-npcs-to-db.mjs` shop `:360-366`
- `import-boss-loot-to-db.mjs` `:186`

**整域 broad-DELETE（类别 C，需哈希门控）**
- `import-normal-npc-loot-to-db.mjs` `:397-407`（最危险）
- `import-wiki-shimmer-to-db.mjs` `:650-666`
- `import-wiki-zh-recipes-to-db.mjs` `:805-807`〔无 assertPrimaryDb〕
- `import-recipes-from-external-data.mjs` `:361-368`〔无 assertPrimaryDb〕
- `import-wiki-audio-assets-to-db.mjs` 已有 sha256 未用 `:594-608`

**已具备跳过（阶段 5 仅核验）**
- `import-wiki-town-npcs-to-db.mjs` 实体行 `:304/:316/:421/:426`
- `backfill/backfill-item-periods-from-wiki.mjs` `:146-150`
- `sync/sync-item-rarity-period-to-primary-db.mjs` `:148-151`
- `backfill/backfill-npc-flags-from-standardized.mjs` JS 侧 `:39-45`
- `sync/consolidate-recipe-provider-priority.mjs` JS 侧 `:133-143`

**安全缺口汇总**
- 缺 `assertPrimaryDb`：`sync-standardized-entities`、`import-wiki-zh-recipes`、`import-recipes-from-external-data`
- 缺 dry-run：`import-buffs`、`import-standardized`
- **daemon plan 确含基础域写脚本**（更正早期判断）：经 `run-support-sync-pipeline.mjs:27`→`sync-item-categories-from-wiki-pages.mjs`、`run-wiki-zh-recipe-sync-pipeline.mjs:30`→`backfill-recipe-zh-display-names.mjs`。稳定化须覆盖 daemon 内外两条路径。

---

## 附录 B：交叉审查补充的基础域写入口（须纳入同等改造）

> 审查发现 Appendix A 之外仍有约 16 个 `.mjs` + 1 个后端服务写 `terria_v1_local`。按类别归并如下，改造手法同 §3。

**类别 A（键控 UPDATE，多为无条件 `updated_at=NOW()`）— `scripts/data/sync/`、`backfill/`**
- `sync/backfill-entity-zh-descriptions.mjs:646/660/673/686`（boss_groups/biomes/items/world_contexts）
- `sync/backfill-item-page-descriptions.mjs:194`（items）
- `sync/disable-extra-items-not-in-standardized.mjs:75`（items status=0）
- `sync/sync-item-bilingual-fields.mjs:84`（items）
- `sync/migrate-existing-image-urls-to-current-minio.mjs:109/150/191/225`（items/buffs/biomes/armor_sets）
- `sync/localize-boss-images-to-minio.mjs:135`（boss_groups）
- `backfill/backfill-item-categories-from-standardized.mjs:92`、`backfill-missing-item-images.mjs:137`、`backfill-missing-item-images-from-standardized-and-wiki.mjs:144`、`backfill-missing-item-zh-names.mjs:108`（items）
- `backfill/backfill-npc-categories.mjs:88`、`backfill-npc-zh-names-from-generated.mjs:84`（npcs）
- `backfill/backfill-missing-standardized-items.mjs:81/101/288`（INSERT category/items）

**类别 B/C（关系 delete+reinsert / 整域）**
- `sync/sync-item-categories-from-wiki-pages.mjs:238`（UPDATE items）、`:405/:418`（category）、`:893/:900`（`item_category_rel` DELETE+INSERT）— **daemon 驱动，优先**
- `backfill/backfill-recipe-zh-display-names.mjs:375/396/413/440/460/475/508`（recipe_ingredients/crafting_stations/recipe_stations）— **pipeline 驱动**

**基础域内的 staging 表（落地层，注意它在 local 库内）**
- `landing/import-source-dataset-landings.mjs:346/383/412/437`（`source_dataset_landings` INSERT/UPDATE/DELETE，已有 assertPrimaryDb）。本表已是哈希跳过的样板，可作类别 C 设计参考。

**后端 Java 写基础域（除 `ItemImportServiceImpl` 外）**
- `WikiImageSyncServiceImpl.java`：`:288`(items updateById)、`:364/:388`(buffs)、`:442`(biomes)、`:491`(world_contexts)、`:187/:227/:246/:253`(item_images)、`:670`(armor_sets 图)、`:796`(original_url/cached_url)。**须同等加判等**。
- Admin CRUD 控制器（`AdminBossController`/`AdminNpcController`/`AdminBiomeController`/`AdminBuffController`/`AdminProjectileController`/`AdminWorldContextController`/`AdminCraftingStationController`）：交互式写入、无条件 `updated_at`——本计划**列为观察项**，是否纳入由后续决定（人工 CRUD 与批量入库诉求不同）。
- Flyway 数据播种迁移（`V2__seed_categories`、`V14__seed_core_biomes`、`V23/V24` 等）：一次性版本化，**明确排除**。
- `AdminWikiZhRecipeImportController.java`：只读（`jdbcTemplate.query*`），**非写入口，排除**。

**执行顺序补充**：附录 B 中 daemon/pipeline 驱动者（`sync-item-categories-from-wiki-pages`、`backfill-recipe-zh-display-names`）与 `WikiImageSyncServiceImpl` 提到 P1 优先；纯手动 backfill/sync 脚本可在阶段 2/3 批量随同改造。
