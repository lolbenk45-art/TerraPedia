# 补充域、物品来源与关系表总览

> 用途：说明“补充域”在八域链中的职责、物品来源和掉落到底由谁
> 提供、它们经过哪些表，以及哪些条件满足后才可入库。
>
> 范围：这是当前代码合同和本地完整链计划的关系图，不是一次运行
> 报告，也不表示各链已经验收通过。生产与 L2 自动化不在本文范围内。

## 先给结论

这里的“补充域”严格指 `Bosses`、`Shimmer`、`Audio` 三个域；它们是
八域中的补充信息域，并不是普通物品来源的唯一提供方。

- **普通物品来源**主要由 **Item 页面**提供：掉落、商店和可解析的
  获取叙述进入 Item source 链。
- **“哪个 NPC 掉落/出售”**由 **NPC 域的 crawler facts** 提供并校正；
  NPC 必须能精确匹配，不能按名称猜测。
- **Boss 专属掉落**由 **Boss 域的独立 Boss-loot bundle** 提供，且必须
  和 non-boss loot 分开入库。Boss 基础域入库不等于 Boss loot 已入库。
- **Shimmer**提供“物品/实体怎样互转或拆解”的关系，不提供普通的
  `item_acquisition_sources` 掉落事实。
- **Audio**提供“哪个实体关联哪个音频资产”，不提供物品获得方式。

因此，物品详情页的“获取方式”是多来源汇总；补充域只补其中的特定
分支，不能取代 Item 和 NPC 的来源证据。

## 爬虫监控页面的 15 个 Domain

我核对的是后端
`services/catalog-api/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java`
中的 `defaultActions()`。这 15 个是**操作注册表 domain key**，并不意味着
它们都是同一种“基础实体表”。

| # | domain key | 页面含义 | 主要动作 / 来源 | 实际职责 |
| ---: | --- | --- | --- | --- |
| 1 | `items` | 物品 | `wiki-items-refresh`、`item-pages-refresh` | Item 基础身份、页面来源、物品来源候选、图片和配方前置 |
| 2 | `npcs` | NPC | `wiki-npcs-refresh` | NPC 基础身份；NPC 页面事实由独立 crawler facts lane 补充 |
| 3 | `projectiles` | 射弹 | `wiki-projectiles-refresh` | Projectile 基础实体；Item/NPC 关系只接受 `shoot` / `projectileId` 强证据 |
| 4 | `buffs` | Buff | `buff-page-immunity-refresh` | Buff 基础信息、免疫和 Item/NPC Buff 关系 |
| 5 | `armor_sets` | 盔甲套装 | `domain-source-armor-sets` | 套装、部件和套装效果来源 |
| 6 | `recipes` | 配方 | `recipe-reference-sync`（preview/apply） | 物品制作关系；是关系/支持域，不是独立实体基础域 |
| 7 | `biomes` | 群系 | `biome-preview`、`biome-sync` | 世界/群系、资源与 ItemBiome 来源；可为物品获取方式提供 worldgen 证据 |
| 8 | `bosses` | Boss | `domain-source-bosses` | Boss 身份/分组基础来源；本动作不等于 Boss loot 入库 |
| 9 | `town_npc_maintenance` | 城镇 NPC 维护 | `domain-source-town-npc-maintenance` | 城镇 NPC 页面、商店和维护资料；与普通 NPC base 分区隔离 |
| 10 | `shimmer` | 微光 | `domain-source-shimmer` | Shimmer 页面、物品互转和拆解规则 |
| 11 | `audio` | 音频 | `wiki-audio-assets-refresh`、`wiki-audio-assets-import` | 音频资产目录及实体音频链接，不提供掉落来源 |
| 12 | `npc_loot` | 普通 NPC 掉落 | `npc-loot-backfill`、`npc-loot-apply` | 只处理 non-boss NPC 的掉落分区 |
| 13 | `boss_loot` | Boss 掉落 | `boss-loot-backfill`、`boss-loot-apply` | 只处理 Boss 的 `direct_boss` / `treasure_bag` 分区 |
| 14 | `item_groups` | 规范物品组 | `item-group-canonical-preview`、`item-group-canonical-apply` | landing → maint → relation → local 的规范物品分组支持链 |
| 15 | `npc_crawler_facts` | NPC crawler facts | `npc-crawler-facts-preview`、`npc-crawler-facts-apply` | 冻结并审核 NPC 的 loot/shop/buff 原始事实，供关系处理器使用 |

### 15、8、10、13 的区别

这些数字来自不同的页面/合同，不能混为一谈：

| 数字 | 来源 | 包含内容 | 作用 |
| ---: | --- | --- | --- |
| **15** | `CrawlerMonitorActionRegistry.defaultActions()` 的 domain key | 上表全部 15 个 | 爬虫监控可登记的操作面，包含实体、关系回填和支持域 |
| **8** | `AUTO_DISPATCH_DOMAINS` | `items`、`npcs`、`projectiles`、`armor_sets`、`buffs`、`audio`、`bosses`、`shimmer` | changed-only 自动调度集合；这就是之前“八域”的来源 |
| **10** | `DOMAIN_TEST_MATRIX_DOMAIN_IDS` | 八域中的大部分 + `biomes`、`recipes`、`town_npc_maintenance` | 爬虫页面的基础域样本/编排矩阵，不含 `audio`、loot 和支持 facts |
| **13** | `domain-acceptance-registry.json` | 8 个 product domain + 5 个 `support.*` domain | domain readiness / public readiness 验收注册表 |

所以，若你在爬虫页面看到“15 个域”，应按上表理解：**8 个是自动调度
域，另外 7 个是手动关系、回填或支持域**。`npc_loot`、`boss_loot` 和
`npc_crawler_facts` 不应再被误认为第三套 NPC 基础实体。

## 是否需要全部自动化

结论：**不需要，也不应该把 15 个都做成无人值守自动 apply。**当前合同
只把下面 8 个放进 `AUTO_DISPATCH_DOMAINS`，而且“自动”主要表示
changed-only 来源检查/抓取或受控 L1 操作；关系、投影和破坏性数据库写入
仍需独立 preview、授权和 readback。

| domain | changed-only 来源自动化 | 关系/数据库 apply | 当前建议 |
| --- | --- | --- | --- |
| `items` | 是 | 否，Item base/source/image apply 仍需授权 | 自动检查来源变化；手动完成正式 apply |
| `npcs` | 是 | 否，crawler facts、loot 和 projection 分开 | 自动抓基础源；关系链人工验收 |
| `projectiles` | 是 | 否，尤其 NPC-Projectile 需要强证据 | 自动来源检查；关系 apply 手动 |
| `buffs` | 是 | 否 | 自动抓取可保留，关系投影受控 |
| `armor_sets` | 是 | 否 | 自动抓模块；套装关系 apply 受控 |
| `recipes` | 否 | 手动 preview/apply | 关系写入会影响多个配方表，不进自动调度 |
| `biomes` | 否 | 手动 preview/sync | 会影响世界资源和 Item 来源投影，保持人工确认 |
| `bosses` | 是 | 否；`boss_loot` 独立手动 | 可自动抓 Boss 来源快照，不能顺手写 Boss loot |
| `town_npc_maintenance` | 否 | 手动 | 与城镇 NPC 共享维护分区和商店字段，避免自动混写 |
| `shimmer` | 是 | 仅已授权、幂等 L1；不自动晋级 L2 | 自动检查 generation；新 generation 写入仍需授权 |
| `audio` | 是 | 否；音频 DB import 单独授权 | 可自动抓取并生成冻结 bundle，import 仍受控 |
| `npc_loot` | 否 | 手动 `npc-loot-apply` | non-boss owner scope，必须先过 loot audit |
| `boss_loot` | 否 | 手动 `boss-loot-apply` | Boss 分区、直掉/宝藏袋必须独立核验 |
| `item_groups` | 否 | 手动 canonical apply | 来源派生分组会跨 landing/maint/relation/local |
| `npc_crawler_facts` | 否 | 手动 facts apply | 需要 MATCHED、审查状态和来源 hash，不可无人值守提升 |

### 推荐的自动化边界

```text
8 个 changed-only source/L1 lane
  → 自动检查、抓取、冻结 bundle、记录 progress
  → 发现变化后停在 preview / pending approval

7 个关系、回填、支持 lane
  → 不自动 dispatch
  → 人工生成 preview、operation authorization、apply、rollback/readback
```

“自动化通过”不等于“正式数据库已写入”，也不等于“生产可用”。尤其
`npc_loot`、`boss_loot`、`npc_crawler_facts` 和 Item source relation，必须
等到来源审计、owner scope、relation parity 和 API readback 都通过后才能
宣称完成。

### 为什么不把这 7 个直接做成自动 apply

1. **它们不是单纯的来源抓取。** `recipes`、`biomes`、`item_groups` 和
   `npc_crawler_facts` 会经过 landing/maint/relation/local 多层；一次自动
   动作可能同时改变多个表，不能只用一个 source revision 判断安全。
2. **共享表存在 owner 分区。** `npc_loot_entries` 同时承载 non-boss 与
   Boss；`maint_npcs`、`maint_item_sources` 和商店表也有 NPC、城镇 NPC、
   loot 等不同读写边界。自动任务若 scope 不精确，可能删除另一个 owner
   的行。
3. **来源质量还不是全量确定。** NPC loot 当前仍有 unresolved、ambiguous、
   polluted 和 Mimic 变体审计；自动 apply 会把“未确认”错误提升成正式
   掉落关系，而不是保留 blocked。
4. **投影操作可能是破坏性的。** 当前 local compatibility sync 会按依赖
   顺序重建多张兼容表；它必须先通过 frozen preview、写 fence、快照和
   readback，不能当作普通增量 upsert。
5. **关系有顺序依赖。** 必须先有 Item/NPC/Boss 身份，再有 source facts，
   再有 relation，最后才可投影 local 和 API。上游 hash 漂移或某一层缺失
   时，自动链必须停在 preview，不能继续向下写。
6. **当前自动化合同本身就是窄集合。** `AUTO_DISPATCH_DOMAINS` 只登记
   8 个经过 changed-only/L1 约束的来源域；其余域尚未具备同等的自动
   freshness、rollback、审计和跨表隔离证据。

这不是永久禁止自动化，而是晋级顺序：先把某个域的来源覆盖、审计为零、
owner scope、幂等 apply、回滚和 API parity 做成可重复证据，再把该域加入
自动 dispatch；不能因为 preview 成功或单元测试通过就直接打开无人值守
数据库写入。

## 名词与域边界

八域完整链为：`Items`、`NPCs`、`Projectiles`、`Buffs`、`Armor Sets`、
`Bosses`、`Shimmer`、`Audio`。

| 域 | 是否属于补充域 | 直接提供什么 | 是否直接提供普通物品来源 |
| --- | --- | --- | --- |
| Items | 否 | 物品身份、Item 页面、掉落/商店/叙述性来源候选 | 是，主来源之一 |
| NPCs | 否 | NPC 身份、`wikiCrawler.loot`、`wikiCrawler.shop` | 是，提供 NPC 掉落与商店的精确归属 |
| Projectiles | 否 | Item/NPC 与 Projectile 的强证据关系 | 否 |
| Buffs | 否 | Item/NPC 与 Buff 效果关系 | 否 |
| Armor Sets | 否 | 套装和装备属性关系 | 否 |
| Bosses | **是** | Boss 身份/分组、Boss 专属奖励与掉落输入 | 仅 Boss 专属掉落 |
| Shimmer | **是** | 物品/实体 Shimmer 互转、decraft 规则 | 否；它是转换关系 |
| Audio | **是** | 音频资产及其与实体的链接 | 否 |

`Biomes`、`Recipes` 不是这八域中的补充域，但也是物品来源展示的
辅助证据：前者可以说明世界/生物群系来源，后者说明制作来源。

## 直接关系图

```text
Terraria Wiki / 标准化输入
│
├─ Item 页面 ──掉落、商店、获取叙述──────────────┐
│                                                   │
├─ NPC 页面 / crawler ──wikiCrawler.loot、shop─────┤
│                                                   ▼
├─ Biome / Recipe ──世界、生态、制作证据───────────┤
│                                                   ▼
└─ Item/NPC 来源主链 ─────────────────────────► maint 与 relation 的来源事实
                                                    │
                         ┌──────────────────────────┼──────────────────────────┐
                         ▼                          ▼                          ▼
                item_source_details       item_npc_loot_relations    item_npc_shop_relations
                         │                          │                          │
                         └───────────────► local 兼容投影 ◄───────────┘
                                                    │
                      item_acquisition_sources / npc_loot_entries / npc_shop_entries
                                                    │
                                                    ▼
                         /public/items/{id}/sources 与物品详情页“获取方式”

Boss 域 ──► Boss-loot bundle（直掉 / 宝藏袋）──► Boss `npc_loot_entries` + `boss_item_reward_relations`
Shimmer ──► shimmer_item_transforms / shimmer_decraft_rules（不走上述普通掉落表）
Audio   ──► audio_assets / audio_asset_links（不走上述普通掉落表）
```

## 谁提供哪一种“物品来源”

| 用户看到的来源类型 | 直接证据提供者 | 主要 bundle / 处理器 | 目标关系或投影 |
| --- | --- | --- | --- |
| 普通 NPC 掉落 | Item 页面 + NPC crawler facts | `build-item-relations-bundle.mjs`、`build-npc-item-relations-bundle.mjs`、`item-source-relation-processor.mjs` | `item_npc_loot_relations` → non-boss `npc_loot_entries` |
| Boss 直掉 | Boss 资料和独立 Boss-loot bundle | `generate-boss-loot-bundle.mjs`、`import-boss-loot-to-db.mjs` | Boss `npc_loot_entries`，并由 `boss_item_reward_relations` 服务 Boss 投影 |
| Boss 宝藏袋掉落 | Boss-loot bundle 中的 `treasure_bag` 分支 | 同上 | Boss `npc_loot_entries`，`drop_source_kind='treasure_bag'` |
| NPC 商店 | Item 页面 vendor 信息 + NPC crawler `shop` facts | Item/NPC relation bundle 与 relation processor | `item_npc_shop_relations` → `npc_shop_entries` / `npc_shop_conditions` |
| 宝箱、板条箱、宝藏袋等物品承载来源 | Item 页面来源 | Item relation bundle | `item_source_facts` / `item_source_details` → `item_acquisition_sources` |
| 世界生成、生态、环境 | Item 页面或 Biome 链 | Item relation bundle、Biome relation/projection | `item_acquisition_sources`；也可由 `biome_resources`、`item_biomes` 只读投影补充展示 |
| 制作 | Recipe 链 | Recipe source / projection | `recipes` 及 recipe relation；不是 NPC 掉落 |
| 钓鱼、事件、任务、捕获等 | Item 页面来源 | Item relation bundle | `item_acquisition_sources`，按各自 `source_type` 保留 |
| Shimmer 互转/拆解 | Shimmer 页面 | `run-wiki-shimmer-extraction-pipeline.mjs`、`import-wiki-shimmer-to-db.mjs` | `shimmer_item_transforms`、`shimmer_decraft_rules`；不是普通掉落 |
| 音频关联 | Audio catalog | `fetch-wiki-audio-assets.mjs`、`import-wiki-audio-assets-to-db.mjs` | `audio_assets`、`audio_asset_links`；不是物品来源 |

### 关键的“不是”

- Buff、Projectile、Armor Set、Audio 的成功入库，**不能**证明任何物品
  的掉落或获取来源已完整。
- Shimmer 的输入/输出是“转换前后”的事实，**不能**把输入物品标记为
  通过 Shimmer 获得，也不能替代掉落、制作或世界来源。
- 一个 Boss 已出现在 Boss 列表中，**不能**推导其掉落；只有独立的
  Boss-loot bundle 可以提供该分支。
- `Mimics` 等泛化群组、模糊名称、local 旧值和 Wiki URL 都不是可直接
  提升为 NPC 掉落的证据。

## 三库中的表与职责

### 1. `terria_v1_maint`：可追溯的维护层

| 表 | 内容 | 谁提供 / 谁写入 |
| --- | --- | --- |
| `maint_items` | Item 的稳定身份和原始页面链路 | Items 基础域 |
| `maint_item_sources` | Item 页面提取出的结构化来源行 | Items 域；是普通来源的上游事实 |
| `maint_npcs` | NPC 稳定身份 | NPCs 基础域 |
| `maint_npc_crawler_facts` | 已匹配 NPC 的 loot/shop/buff 原始事实、来源页、revision、hash、审查状态 | NPC crawler facts 能力 |
| `maint_bosses` | Boss 身份和结构化 Boss 信息 | Bosses 补充域 |
| `maint_shimmer_*` | Shimmer 的维护层输入 | Shimmer 补充域 |

`maint_item_sources` 是 Items 能力的写入面；NPC 与 Boss loot lane 对它只读。
`maint_npc_crawler_facts` 记录 `MATCHED/UNMATCHED/AMBIGUOUS/REJECTED`，只有
能被精确匹配且审核合格的事实才能进入可发布的关系链。

### 2. `terria_v1_relation`：规范化关系层

| 表 | 含义 | 关键约束 |
| --- | --- | --- |
| `item_source_facts` | 每个 Item 来源的主事实锚点：来源类型、来源引用、生态、排序、lineage、审查状态 | `record_key` 唯一；Items 是写入 owner |
| `item_source_details` | 主事实的数量、概率、条件、解析出的来源 internal name 等细节 | `source_fact_key` 外键指向 `item_source_facts.record_key` |
| `item_npc_loot_relations` | Item 与精确 NPC 的掉落关系 | `source_fact_key` 外键；保存数量、概率、条件 |
| `item_npc_shop_relations` | Item 与 NPC 商店关系 | `source_fact_key` 外键；保存价格与条件 |
| `item_npc_relation_audits` | 未解析、歧义、污染、被排除的关系审计 | 不能把审计行当作可发布关系 |
| `boss_item_reward_relations` | Boss 与 Item 奖励的关系，供 Boss 投影 | 是 Boss 奖励分支，不替代普通 Item source fact |
| `item_projectile_relations` / `npc_projectile_relations` | Item/NPC 与 Projectile 关系 | 仅接受 `shoot` / `projectileId` 等强证据，不是来源表 |

来源关系的核心外键形状是：

```text
item_source_facts.record_key
  ├─ item_source_details.source_fact_key
  ├─ item_npc_loot_relations.source_fact_key
  └─ item_npc_shop_relations.source_fact_key
```

### 3. `terria_v1_local`：运行时兼容投影层

| 表 | 运行时用途 | 上游来源 |
| --- | --- | --- |
| `item_acquisition_sources` | 物品详情页的通用“获取方式”行 | 已接受的 `item_source_facts` + `item_source_details` |
| `npc_loot_entries` | NPC/Boss 掉落行 | 已接受的 `item_npc_loot_relations`；Boss 独立 importer 也只写其 Boss 分区 |
| `npc_shop_entries` / `npc_shop_conditions` | NPC 商店及条件 | 已接受的 `item_npc_shop_relations` |
| `shimmer_item_transforms` / `shimmer_decraft_rules` | Shimmer 互转和拆解 | Shimmer 域；独立于物品来源表 |
| `audio_assets` / `audio_asset_links` | 音频资产与实体链接 | Audio 域；独立于物品来源表 |
| `biome_resources` / `item_biomes` / `recipes` | API 读取时的补充来源证据 | Biome / Recipe 链 |

`item_acquisition_sources` 没有保存 relation 的 `record_key` 外键。因此它与
relation 层之间必须做**逻辑键、字段、数量和来源 lineage 的 parity 审计**，
不能只凭本地行数相同就认为链路正确。

### “谁提供事实”不等于“谁获准写表”

数据来源责任与 operation 的写入授权是两件事：

| 层面 | 事实提供者 | 当前 ownership / 分区要求 |
| --- | --- | --- |
| `maint_item_sources`、`item_source_facts`、`item_source_details`、Item→NPC relation | Items 页面和 Items relation 链 | Items 是 maint/relation 的写入 owner；NPC/Boss lane 对这些表只读 |
| `maint_npc_crawler_facts` | NPC crawler | `npc_crawler_facts` 能力独立写入；未匹配事实不能被 Items relation 当成已接受来源 |
| local `item_acquisition_sources` | 上游仍是 Item/NPC/Biome 来源事实 | ownership matrix 把该 local 表的写入能力划给 `biomes`，Items 仅为 read；这只定义 write fence，**不代表 Biomes 伪造或提供 Item/NPC 掉落** |
| local `npc_loot_entries` | NPC 或 Boss 事实 | 物理表共享，但以 parent kind 强制分为 `non_boss`（`npc_loot`）与 `boss`（`boss_loot`）两个互斥 owner scope |

所以任何 compatibility materialization 都必须同时满足：来源仍来自正确的
Item/NPC/Boss 证据链，写入又获得目标表对应 capability 的授权；不能因为
一个能力拥有 local 写 fence，就让它越权创造另一域的事实。

## 从来源到 API 的入库条件

所有数据写入都先满足通用门槛，再满足该分支的专用门槛。

### 通用门槛（所有域）

1. 上游抓取或标准化输入必须生成可读的 manifest、稳定 identity set、
   source hash 和终态 progress。
2. 先生成 frozen bundle 并做只读 preview；preview 必须声明目标三库、
   owned tables、owner scope 和预期变更，不能隐式扩域。
3. apply 使用与当前 hash、bundle、目标库指纹和 write fence 绑定的一次性
   operation-level authorization；过期或 hash 漂移即拒绝。
4. 写入在事务内执行，并有最新 writer snapshot、限定 rollback 和写后
   readback；不允许直接 SQL 修复。
5. 每行须保留 `status`、`deleted`、source page/revision、record key 或
   lineage 字段。无来源、无身份或不在 owner scope 的行不写入。
6. 通过 relation/API/readback 后才算该分支完成；测试或 dry-run 本身不是
   正式入库证据。

### Item 来源行进入 relation 的专用门槛

`item-source-relation-processor.mjs` 将 `maint_item_sources` 与 NPC 索引
解析为 source fact、detail 和 NPC relation。至少需要：

- Item 身份可解析；解析失败进入 audit，不能生成可发布关系。
- `source_type` 与 `source_ref_type` 符合 taxonomy；宝箱、板条箱、世界、
  制作、钓鱼、事件、Shimmer 等类型必须保留真实分类。
- 若 `source_ref_type='npc'`，必须解析到唯一 NPC internal name；歧义、
  `no_match`、污染文本和 generic bucket 进入 `item_npc_relation_audits`。
- Boss 归属的掉落不能混入普通 NPC loot；Mimic 等变体必须有精确变体
  identity，不能用总称代替。
- 关系表的审查状态必须是可接受状态，才可能投影到 local。

### relation 投影到 local 的专用门槛

`sync-relation-to-local-compat-tables.mjs` 的可发布筛选要求为：

- source fact：`status=1`、`deleted=0`，且 `review_status` 为
  `accepted`、`resolved` 或 `promoted`；
- 被引用的 Item 必须是 active；
- NPC 来源须有 active NPC，且 source detail 的解析状态为 `resolved`、
  `exact_internal_name` 或 `reviewed_page_level_shared_loot`；
- Item/Container/Crate/Treasure bag 类型须能解析到 active source Item；
- `world` 或无引用类型可按各自事实发布，但不能伪装为 NPC 掉落；
- 应对 `item_acquisition_sources`、`npc_loot_entries`、`npc_shop_entries`、
  `npc_shop_conditions` 分别预览和回读，不能只核一个总数。

**当前安全边界：**现有 compatibility sync 的 apply 路径会重建多张 local
兼容表。完整链执行前必须先证明它被 owner scope 限定，且 dry-run 证明
不会跨分区删除；不能把它当成“只写一条 loot”的安全操作。

### non-boss 与 Boss loot 的额外分区门槛

| 分区 | 可写目标 | 必须满足 | 明确禁止 |
| --- | --- | --- | --- |
| non-boss loot | `npc_loot_entries` 中父 NPC 为 non-boss 且 `drop_source_kind='npc_drop'` 的 owner set | 冻结的 non-boss bundle、精确 NPC/Item、fresh `npc-loot-apply` 授权、写后 Boss 行不变 | 删除或修改 Boss 分区；用 Boss 名称猜普通 NPC 关系 |
| Boss loot | `npc_loot_entries` 中 Boss owner 的分区 | 每个 group 有 owner NPC 或显式 `reference_only`；每个 drop 可解析到 Item；`direct_boss` 与 `treasure_bag` 分开计数；fresh `boss-loot-apply` 授权 | 写入 non-boss 分区；把基础 Boss 同步隐式当成 Boss loot apply |

## 补充域如何影响物品详情页

| 补充域 | 对物品页的直接可见影响 | 与“获取方式”的关系 |
| --- | --- | --- |
| Bosses | 可显示 Boss 直掉、宝藏袋掉落、关联的 Boss 页面/图片 | 是获取方式的一个专属分支，必须通过独立 Boss loot lane |
| Shimmer | 可显示物品能否互转、转成什么、是否可拆解 | 不是原始获取方式；可在 UI 中作为“转换/制作类关系”展示，但不补普通掉落表 |
| Audio | 可显示物品或 NPC 关联的音频 | 与获取方式无关 |

后端入口为 `GET /public/items/{id}/sources`。`ItemSourceServiceImpl` 合并
`item_acquisition_sources` 与 NPC loot/shop、Biome/ItemBiome 等投影证据，
随后 `PublicItemRelationController` 会过滤非托管图片和裸 Wiki URL。前端
`apps/public-web/pages/items/[id].vue` 再按 drop、shop、craft、world 等组别
展示；UI 分组不会把不合格的上游关系变成有效证据。

## 当前完整链状态与验收口径

当前拥有 Item/NPC/Boss/Shimmer/Audio 的脚本入口和表结构，但不能据此说
“物品来源链已完成”。本地完整链仍需满足：

- Item 与 Projectile 真实 apply 不再是 `DRY_RUN`；
- non-boss 与 Boss loot 的 unresolved、ambiguous、polluted、rejected 审计为零；
- Item source 的 maint → relation → local lineage 和字段 parity 全绿；
- `items/imageReadiness`、Projectile source relation 及最终 API/readback 全部通过；
- 每个写入均保留 frozen input、授权、事务、rollback/readback 和 progress 证据。

相关执行边界和当前 blocker 以
`docs/superpowers/plans/2026-08-17-local-eight-domain-complete-chain.zh.md` 与
`docs/devlog/entries/2026-08-17-local-eight-domain-complete-chain.md` 为准。

## 可复用的只读核对入口

以下命令用于检查链路，不执行 crawler、import 或数据库写入：

```bash
node pipelines/audit/audit-items-without-active-sources.mjs
node pipelines/audit/audit-item-source-existing-evidence-layers.mjs
node pipelines/audit/build-item-source-final-closure-status-report.mjs
node pipelines/audit/npc-domain-loot-chain-audit.mjs
node pipelines/audit/npc-loot-runtime-parity-audit.mjs
node pipelines/audit/npc-loot-closure-smoke-check.mjs
```

结构与职责的权威代码入口：

- `pipelines/automation/table-ownership-matrix.mjs`
- `pipelines/maint/maint-schema.mjs`
- `pipelines/relation/relation-schema.mjs`
- `pipelines/relation/item-source-relation-processor.mjs`
- `pipelines/relation/sync-maint-to-relation.mjs`
- `pipelines/relation/sync-relation-to-local-compat-tables.mjs`
- `pipelines/import/import-boss-loot-to-db.mjs`
- `pipelines/import/import-wiki-shimmer-to-db.mjs`
- `pipelines/import/import-wiki-audio-assets-to-db.mjs`
