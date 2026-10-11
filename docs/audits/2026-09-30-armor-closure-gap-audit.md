# Armor 全链路缺口审计

日期：2026-09-30 CST。代码基线：`da0f516a`，分支 `feat/automation-domain-armor`。
本轮只做只读核查、离线诊断和文档，不执行爬取、业务 DML、许可消费或服务重启。

## 结论与边界

Armor 自动入库尚未闭环。此前完成的是受控 source-only 执行器和 typed effect
只读派发，不能据此认定成员完整、语义正确、消费者兼容或调度自动化已完成。
本轮发现源解析、已存成员、源证据绑定、API/UI 和自动恢复的跨层缺口。
应先按[修复计划](../superpowers/plans/2026-09-30-armor-closure-repair-order.md)
固化契约和回归用例，再逐层补齐。

所有计数均为指定源版本或数据库快照的范围，不是 Terraria 最新 Armor 全量比例。
本报告穷举本轮确认的问题和待验证边界，不保证不存在未知缺陷。
紧凑可追溯证据见 [JSON](2026-09-30-armor-closure-gap-evidence.json)；原始大文件留在
Armor worktree 的 `.local/tmp/`，JSON 保存文件哈希、时间、复现结果。

## 链路与覆盖分母

```text
revision-bound page / Iteminfo / ArmorSetBonuses / attributes / images
  -> raw landing(local, maint) -> maint facts
  -> relation sets, members, attributes, item/set effects, images
  -> projections -> public/admin APIs -> item/set UI
  -> scheduler source identity -> publication -> acknowledgement / reconciliation
```

| 本轮基准 | 结果 | 含义 |
| --- | --- | --- |
| ArmorSetBonuses rev964993 完整 Initialize 定义 | 64 textKeys / 243 个非零部件 ID | 该模块版本范围；不是全量 Armor |
| 当前解析器对同一源的输出 | 63 textKeys / 238 个部件 ID | 首条 Shroomite 被遗漏 |
| 活跃 DB 套装 / 去重成员 | 63 / 233 | 另有 15 条旧组合错位，少 5 个腿部 ID |
| relation 属性 / 效果行 | 246 / 320 | 行数不是正确成员数；含重复/旧语义 |
| projection 属性 / 效果行 | 223 / 290 | 243 个模块成员中有 20 个没有属性投影 |
| typed source local / maint landing | 0 / 0 | source-only 操作尚未真实执行 |

模块成员缺失 ID：`375,380,404,1505,1546,1547,1548,1549,1550,2202`。
已有成员但缺 relation 属性的 ID：`411,954,955,5524,5588,5589,5590,5591,5592,5593`。
两组并集为该模块范围内缺属性投影的 20 个 ID。其余 223 个有行也不表示语义通过。

现有属性另有 12 个模块外装备：`37,205,268,867,879,1135,1136,2277,3109,3770,5001,5068`。
模块成员与现存属性的观察并集是 255 个 ID；它仍不能证明目标版本全量覆盖。
单件装备、雨具等展示套装必须独立列入范围台账，不能因为无套装加成而从 Armor 中消失。

## 确认问题

### F01 · 严重：解析器丢失第一条套装定义

`pipelines/fetch/fetch-wiki-armorsetbonuses.mjs:216` 的 `extractInitializeBlock`
保留函数声明；`:224` 的 `splitStatements` 在第一个分号前将声明和第一条 Create
拼成一句，前缀判断不通过，整句被丢弃。固定源的首条正是 Shroomite。

离线 VM 仅加载该文件的纯函数声明，没有 import/执行爬虫。原输入得到 63 条；
仅在诊断输入中移除 Initialize 声明后得到 64 条，新增且仅新增：
`ArmorSetBonus.Shroomite` 的 `[1548,1549,1550]`、`[1546,1549,1550]`、
`[1547,1549,1550]`。源文件和生产解析器均未修改。
现有 fetch 测试在第一条 Add 前放 `ArmorSetBonuses.Wood = true;`，掩盖了首句遗漏。
`pipelines/generate/armor-set-definition-source.mjs:9` 还把蘑菇矿标记为
“without Module:ArmorSetBonuses definition”；这与固定源冲突，应随源映射修复。

### F02 · 严重：已存 15 条组合错位，当前覆盖基准漏项

只读查询确认 maint 和 relation 都持有旧组合，例如 CobaltCaster
`[[0,371,374]]`，而固定源为 `[[371,374,375]]`。
受影响 textKeys：BeetleDamage/Defense、SpectreHealing/Damage、
ChlorophyteMelee/Summon、Cobalt/Mythril/Adamantite 各 Caster/Melee/Ranged，共 15 条。
这些 item 均存在于活跃 maint_items，缺成员不能归因于 item 身份不存在。
五个腿部 ID 在 relation 成员中连 inactive 行也没有；叶绿腿由其他变体覆盖，故去重分母仅少五个。

当前纯解析函数已能正确处理这 15 条；旧错位数据的历史写入原因未在本轮证明。
应重新从源推导并受控迁移，而非重复修改已经正确的 Add 参数处理。
独立候选 `armor-canonical-projection-candidate.mjs:373` 要求 typed owner 是当前
成员，因此先前三个 typed effects 的离线成功并不证明真实候选可以通过。

### F03 · 严重：源证据绑定不校验套装组合

`pipelines/fetch/armor-set-source-evidence.mjs:31` 的 `assertRecords` 只返回
textKey/benefitExpression；源哈希没有参与从 raw module 重新推导组合。
合成诊断中 raw/parsed Wood 为 `[727,728,729]`，standardized 改成
`[1546,1549,1550]`，`buildArmorSetSourceEvidence` 仍成功。
这是证据 helper 的确定缺口，不代表绕过了所有执行器的其他检查。
修复必须绑定完整有序组合、primaryPart、计数、版本和 raw 重推导结果，不能只比较输出文件之间一致。

### F04 · 严重：版本与完整语义契约尚未收敛

中文属性 rev199734 为 2023-10-23；Shroomite 页面 rev1027106 为
2026-09-02，当前 adapter 目标为 Desktop 1.4.5.8；Iteminfo rev1023241 自报
1.4.5.7，ArmorSetBonuses rev964993 自报 1.4.5.3。
较旧模块目前只用于身份/成员证据，不能自动证明 1.4.5.8 的所有数值。

当前 adapter 仅证明三头件的特定武器/弹药 `multiply/1.12/multiplier`。
尚需同版本单件防御、其他单件效果和 set-owned stealth 的证据；stealth 在 1.4.5.7
由 60% 改为 50%，不能沿用旧模块数值。整套装备的 13/25/20/12 汇总不能再记为额外套装加成。

活跃 relation 仍有 1546/47/48 无条件 `add15 percent`，ID123/125/127；
目前这几个 item 的效果投影为空，不能声称旧 15% 已在公开页面显示。
MiningHelmet/item88 有两条活跃属性（12/338），旧 raw sentrySlots 为 2/1；
固定 Iteminfo 证明 MiningPants 是 item411，不能继续按旧表错误链接归给 Helmet。
全量旧列位错读和所有缺源项都应进入覆盖台账，不能只处理三条 multiplier。

### F05 · 严重：可写范围分裂，尚无完整发布协议

`armor-canonical-transaction-executor.mjs:8` 只拥有 landing、套装、成员、图片和
套装 projection；不拥有 typed maint、relation 属性/效果及两个 secondary projection。
新 source-only runner 只写上游；旧 secondary operation 只拥有
`armor_attribute_cell`。`sync-maint-to-relation.mjs:1518` 会在发现 typed 行时拒绝
general apply。这是有意保护，不能删 guard 来“打通”。

提前入 typed maint 后，general apply 会被阻止，而效果仍无受控发布路径。
必须先明确字段/行 ownership、历史来源退役、stable IDs、受控事务边界、失败恢复和
跨阶段对账，再允许真实 upstream DML。source persistence 不得标记为 published。

### F06 · 重要：API 会过滤来源或丢条件

- `AdminArmorAttributeController.java:52,99,141,206` 和
  `AdminArmorSetController.java:878,919` 把效果限定为 `armor_attribute_cell`，
  新 `armor_item_page` 会在结果和计数中被漏掉。这里是静态 SQL 证据，未做新源的真实 admin readback。
- `PublicItemServiceImpl.java:104` 的效果 SQL 不选 condition_text；
  `PublicItemEquipmentEffectDTO.java` 和 mapper 也不传 conditionText。
  `PublicArmorSetAggregateService.java:89` 的 piece effects 复用这个接口，连带受影响。
  set-owned effect 接口已有条件字段，不要混淆两条链路。
- 2026-09-30 CST 只读 HTTP：`/api/public/items/{1546,1547,1548}/equipment-effects`
  均 200+空数组，`/api/public/items/411/armor-attributes` 也是空数组，和数据库快照相符。
  基础 `/items/{id}` 不返回效果，不能拿它证明效果链路。

### F07 · 重要：前端丢适用条件，乘法值被加总

`useArmorSetBuilds.ts:181`、`utils/armorSetPresentation.ts:40` 的 item effect
摘要没有保留 condition；同 composable 的 `:935,990,1020` 按加法累加数值。
调用原 composable、注入合成 ×1.12 和 ×1.20，得到 `×2.3200000000000003`；
属性分组还显示 `+1.12/+1.2`。这是原代码离线复现，非真实浏览器数据。
同适用范围、确有乘法叠加规则时结果才是 1.344；条件不同不能无条件合并。
`pages/items/[id].vue:612` 优先显示 rawText，数值 fallback 一位小数且未处理 multiplier，
效果 chip 映射也未带条件。API 加字段后仍需改 UI 和计算模型。

### F08 · 严重：自动入口仍是旧 L1，注册不等于调度集成

`automatic-domain-operation-contract.mjs:11`、`run-governed-l1-operation.mjs:69`
仍将 armor_sets 派发给 `automation-armor-sets-l1`，local armor_sets/armor_set_items。
`run-base-domain-automatic-operation.mjs:483,519` 只抓/确认 ArmorSetBonuses。
新 source-only operation 没有进入完整 automatic dispatch。
需要绑定页面、Iteminfo、成员、属性、图片的复合源身份，以及完整发布后的 acknowledgement。
旧 L1 成功、readiness eligible 或测试通过都不算 L2 全链路自动入库。

### F09 · 严重：有 uncertain 状态，缺集成恢复入口

`armor-item-effect-source-transaction.mjs:142,163` 持久化 PREPARED 和
COMMIT_UNKNOWN/COMMITTED_READBACK_REQUIRED；runner 要求新路径且 CLI 为 apply。
未发现该 operation 专属 recover/resume/reconcile 入口；既有 canonical recovery journal
耦合套装/图片 intent。不能据“有异常状态”认定自动恢复可用。
必须覆盖 PREPARED 后被杀、permit 消费不确定、commit 回执丢失、result 写失败、
完整/部分/冲突读回，禁止盲重试或复用旧许可。

### F10 · 严重：live landing 不是 canonical source evidence，无法生成修复 proposal

2026-09-30 CST 对真实 loopback DB 做了 `START TRANSACTION READ ONLY` dry-run，服务端
UUID 为 `b4ae6728-4f72-11f1-bcc9-00155d37eadf`，没有 DML。当前两个 Armor landing
分别是：

- `armor_sets_raw` id=1，`artifact_role=legacy_compat`、`parse_status=ok`、
  `source_revision_timestamp=NULL`，source page 还是旧大小写 `Module:Armorsetbonuses`；
- `armor_set_images_raw` id=12437，`artifact_role=legacy_compat`、`parse_status=partial`、
  `source_revision_timestamp=NULL`。

把这两个 live landing 和 63 条 maint set/175 条 maint image 交给现有
`buildArmorCanonicalMaintCandidate`，在任何行差异计算前即失败：
`Armor landing must retain immutable source_evidence history`。
因此当前不能从 live baseline 生成可信的 64-set/243-member 修复 proposal；必须先
完成 revision-bound canonical landing（包括 images），再重新读取 maint/relation
基线。旧 landing 只能作为兼容历史，不能被升级标记冒充 source evidence。

### F11 · 严重：图片 cache 结果没有绑定进 canonical landing

历史 source-evidence proposal `.a63-20260927-23` 确实记录过 419 条缺 cache 的
阻断，但后续 `.a63-20260927-33` 已完成 315/315 文件上传和 MinIO 字节读回，结果
payload 的 419 条记录都有 `cachedUrl` 和逐文件 revision。不能重复执行这次缓存操作，
也不能把旧 `.23` proposal 当作当前证据。

真正剩下的是把 `.33` 的完整结果 payload 作为新的 `armor_set_images_raw` canonical
source-evidence landing，并以 transition 保留旧 `legacy_compat` 行。当前 maint 仍只有
175 条、全部缺 source revision，且有 1 条缺 cache；因此没有这次 landing transition
之前的可信图片 baseline。`armor-canonical-maint-candidate` 的 managed-path 校验
必须继续保留，不能用空 cache 或 Wiki URL 绕过。

### F12 · 严重：494 个源 tuple 与 470 个 relation tuple 不一致

2026-09-30 CST 用 `START TRANSACTION READ ONLY` 在同一 server UUID
`b4ae6728-4f72-11f1-bcc9-00155d37eadf` 重跑了成员盘点。源输入为
`.local/tmp/a63-20260929-armor-source-02/module-armorsetbonuses.json`，revision
`964993`，content hash 为
`sha256:823915f0c6410b515189396b737324df89fc11d3e58d30879c213a00a8e6b996`。
源 tuple 定义为每个非零 `(textKey, set_variant_index, part_index, item_source_id)`，
共 `494`；relation 侧读取 `status=1 AND deleted=0` 的成员行，共 `470`。

这次映射先选出 `maint_armor_sets.record_key`，再以
`relation_armor_sets.source_maint_record_key` 归属 relation set，最后把
`relation_armor_set_items.armor_set_record_key` 映射回该 maint key；63 个现有
set owner 全部能以该 key 对齐，未用 `source_maint_id` 猜测归属。完整只读证据在
`.local/tmp/armor-source-relation-tuple-delta-20260930-01.json`。

结果为 `440` 个 tuple 相同、`54` 个源 tuple 缺失、`30` 个 relation tuple 多出，
无重复 relation tuple key。缺失的 `54` 个由 Shroomite 的 `9` 个变体/部件 tuple
和 15 个旧组合各自应补回的 `45` 个 tuple 组成；多出的 `30` 个正是这些 15 组
旧的 zero-head 组合中保留的 body/legs tuple。因此 `470 + 54 - 30 = 494`，
不能把当前 `470` 当作完整成员分母。

Shroomite 当前没有 maint set、relation set 或 relation member；源明确包含：
`[1548,1549,1550]`、`[1546,1549,1550]`、`[1547,1549,1550]`，共 9 个 tuple。
这只确认成员缺口，不授权 landing、maint 或 relation 写入。

当前 maint 中发现 17 个含 zero-head 或 zero-leg 的历史组，必须逐组审计后才能
决定保留、替换或退役：

`BeetleDamage`, `BeetleDefense`, `Wizard`, `MagicHat`, `SpectreHealing`,
`SpectreDamage`, `ChlorophyteMelee`, `ChlorophyteSummon`,
`CobaltCaster`, `CobaltMelee`, `CobaltRanged`, `MythrilCaster`,
`MythrilMelee`, `MythrilRanged`, `AdamantiteCaster`, `AdamantiteMelee`,
`AdamantiteRanged`。

其中源本身只声明 `Wizard` 与 `MagicHat` 的 16 个 zero-leg 槽位；其余 15 组的
zero-head 组合与 fixed source 不同，不能当作合法空槽处理。该 tuple 差异仍阻塞
Phase 2 的 canonical 243-member proposal，以及后续 typed effect/API/UI 验收。

### F13 · 严重：全成员覆盖仍未闭合，typed effect 尚无下游行

2026-10-01 CST 对同一只读 server 重跑了成员覆盖盘点，报告为
`.local/tmp/armor-member-coverage-20261001-01.json`。固定 revision 的 243 个
唯一正部件 ID 中，relation 只有 233 个唯一成员；缺失
`375, 380, 404, 1505, 1546, 1547, 1548, 1549, 1550, 2202`，对应 54 个
缺失 tuple。relation 属性为 246 行/245 个 owner，仍有 10 个目标部件无属性；
projection 属性为 223 行，20 个目标部件无投影。

relation effect 共有 320 行，但 typed source-kind 行为 `0`；projection effect
共有 290 行，typed 行同样为 `0`。当前仍只有 `armor_attribute_cell` 的 generic
effect，不能据这些行证明 Shroomite 条件乘法或 set-owned effect 已发布。

Mining 页面 revision `1003045` 的 Set 明确绑定 `88=Mining Helmet`、
`410=Mining Shirt`、`411=Mining Pants`，因此身份映射已得到源证据；但 item 88
仍有两个 active accepted attribute owner（relation IDs 12/338，均为
`2023-10-23T04:15:47Z`，`sentrySlots=2` 与 `sentrySlots=1`），而 item 411
没有 relation attribute 或 projection attribute。身份事实不能替代属性来源决策，
该重复 owner 与缺行仍阻塞 canonical proposal。

### F14 · 重要：typed relation owner 已形成候选契约，但尚无生产受控 executor

为避免继续把 typed 行塞进 general sync，新增了纯函数候选契约
`pipelines/relation/armor-typed-effect-publication.mjs`。它的唯一写入边界是
`relation.relation_equipment_effect_attributes.item_effect_sources`：只接收
`source_kind=armor_item_page` 的 active item effect，保留 generic
`armor_attribute_cell` 行，并绑定 owner/source maint/landing lineage、条件、操作、
值、单位、revision tuple 和 stable `record_key`。stale typed key 只进入显式
`retire`，不触碰 generic history。

该模块当前输出 `databaseWrites=false`、`applyAllowed=false` 的 proposal。隔离的
SQL executor 已在 F15 建立测试级 locked transaction 骨架，但尚未接入授权
manifest、真实 permit ledger、projection readback 或 prepared/commit recovery。
因此它收敛了 ownership contract，却没有清除 F05；在生产 executor、projection
readback 和完整 243-member/Mining gate 之前仍不得生成 apply packet。

### F15 · 重要：executor 仅完成隔离事务骨架，尚未形成生产授权链

2026-10-01 CST 新增的
`pipelines/relation/armor-typed-effect-publication-db.mjs` 已实现隔离的 SQL
事务骨架：锁定完整 relation effect snapshot，在 permit 前用同一 proposal
重算并比对 hash，写入 `PREPARED` 后才消费 permit，执行 typed insert/update/
retire，读回 active typed rows 与 generic preservation，提交后再次读回并写入
`COMMITTED`。锁定 proposal 漂移会在 permit/DML 前 rollback；commit/rollback
不确定性沿用 `COMMIT_UNKNOWN`、`COMMITTED_READBACK_REQUIRED` 和
`requiresReadbackReconciliation` 标记。

该模块没有注册到 operation manifest、授权 packet、真实 permit ledger、
projection executor 或 recovery/reconcile 入口，测试使用 fake connection，
不能作为生产 apply 许可。它只把 F05 从“无事务 owner”收敛为“缺少授权/投影/
恢复集成”。新的 focused regression 为 `163/163`，全 Armor-labelled pipeline
suite 为 `742/742`；未连接真实数据库、未消费
permit、未执行 DML、未上传图片，也未生成 apply packet。

### F16 · 严重：Mining 属性源与当前行存在三方冲突

2026-10-01 CST 的只读审计证据为
`.local/tmp/armor-mining-identity-audit-20261001-01.json`。源 revision
`199734` 的三条 Mining 记录由图片和 slot 明确区分：Helmet `88` 为头部防御
2、仅有照明奖励；Shirt `410` 为身体防御 2、挖矿速度 `+10%`；Pants
`411` 为腿部防御 1、挖矿速度 `+10%`。但是 Pants 源行的中文标题仍误写为
`挖矿头盔`，必须使用独立身份页证据修正后才能进入 candidate。

当前 maint/relation 的 item 88 有两个 active owner：旧行 `12` 是无防御/
`sentrySlots=2`，旧行 `552` 是防御 10/`sentrySlots=1`；两者都不符合这次
源行，不能通过选择 1 或 2 解阻。Item 410 的 maint item/relation 防御是 1，
却与属性源的 2 冲突；item 411 没有 relation/projection attribute。当前
projection 仍复制旧 generic 行。该冲突阻塞 Mining candidate、typed effect
publication 和 Phase 2/3 完整覆盖验收。

### F17 · 严重：Mining read-only candidate 已绑定身份但仍不可执行

2026-10-01 CST 新增纯函数 candidate
`pipelines/relation/armor-mining-attribute-candidate.mjs`，使用既有
`applyArmorSourceIdentityCorrections` 保留 `Mining Pants.png` 的独立身份修正，
并把三条 source fact 绑定到 `88/410/411`、source revision `199734` 和独立
Mining armor 页面 receipts。私有输出为
`.local/tmp/armor-mining-attribute-candidate-20261001-01.json`。

candidate 明确标记 `databaseWrites=false`、`executable=false`、
`applyAllowed=false`，`maint/relation/projection` change arrays 为空，因此不
能被旧的 semantic repair proposal 当作执行计划。它从当前只读快照重算出四个
阻塞码：`duplicate_relation_attribute_owner`（item 88，relation 12/338）、
`maint_item_defense_conflict`（item 410，source 2 vs maint 1）、
`relation_attribute_semantics_drift`（items 88/410）和
`missing_relation_attribute_owner`（item 411）。修正后的 Pants fact 为
`MiningPants` / `挖矿裤` / legs / defense 1，但这只清除身份歧义，不能替代
owner 决策或补写 relation/projection lineage。

该 candidate 的 focused test 首先以缺失模块失败，随后通过 `4/4`；全 Armor-labelled
pipeline suite 通过 `749/749`，`node --check` 和 `git diff --check` 也通过。本轮仍未
执行 DML、landing/import、图片上传、permit、Redis 或 scheduler 操作。Mining owner、
494/470 tuple delta、243-member coverage 和 typed-effect production owner 继续阻塞
apply packet。

### F18 · 严重：历史 zero-slot 组合仍需逐组 owner review

2026-10-01 CST 对固定 revision `964993` 的 17 个当前 zero-head/zero-leg
maint 组完成了只读 canonical review，证据为
`.local/tmp/armor-zero-slot-canonical-review-20261001-01.json`。只有
`ArmorSetBonus.Wizard` 与 `ArmorSetBonus.MagicHat` 的 zero-leg 位置也由 source
明确声明；另外 15 组的当前 zero-head tuple 在 source 中都有正的 head ID，且
body/legs 组合也与 source 不同，属于历史 composition drift。报告逐组保留
current tuple、source tuple、缺失正 tuple 和 review action，不生成 repair rows。

该 review 同时绑定 Shroomite 的 9 个缺失 tuple、全量 `494` source / `470`
relation 计数，状态为 `blocked`，阻塞码为
`historical_zero_slot_owner_review_required`、`shroomite_member_gap` 和
`source_relation_tuple_delta`。因此不能把 zero slot 当作合法空槽自动保留，也
不能在没有 owner decision 的情况下生成 canonical apply packet。

## 本轮未建立的证据

- 没有 1.4.5.8 全 Armor 权威清单，243/255 只能作固定样本下界；所有排除项须具名。
- 图片过去已做治理，不等于新增成员/变体都具有正确 managed image；最终需逐项 readback 和渲染核验。
- 没有新源真实入库、完整 admin/API/browser 验收、崩溃恢复或 scheduler 自动接受结果。
- 先前 preflight 在 2026-09-29T16:10:02Z 确认 scheduler disabled、0 live/claims、reconciler healthy；
  本轮 DB/HTTP 查询更新了数据证据，未重新探活 Redis/scheduler，不把旧 preflight 当执行许可。
- 本轮不运行 full quality gate：文档核查与只读复现足以证明所列缺口；不宣称链路稳定或 feature-ready。

## 复核处置

本模型串行复核；F01–F11 都由 Armor owner 按新计划具名承接，F08 的共享调度/策略修改由
coordinator 接收契约后负责。生产缺陷保持 open，文档交付不代表解决它们。
旧专项计划的历史完成记录保留，新计划替代其“下一步执行顺序”。
新增问题必须先更新问题矩阵和依赖、重审相关验收，再实施，避免边补边改变完成口径。

## F19 · 严重：API 只读回读仍重现 tuple 缺口，不能视为正式录用

2026-10-01 CST 在关闭 Flyway 与 Spring scheduling 的临时 catalog-api 进程上执行了
GET-only readback，证据为
`reports/runtime/armor-review-20261001/armor-api-verification-read-only.json`。
共记录 76 个端点：Armor set list、现有 63 个 set detail，以及 88/410/411/1546/1547/1548
的 attribute/effect 端点均返回 HTTP 200；没有执行 DML、landing/import、图片上传、permit
消耗或 scheduler dispatch。

API 当前仍返回 470 个 relation tuple，而固定 revision 964993 的 source 为 494 个：440
相同、54 缺失、30 多余。缺口覆盖已由用户口头确认的 15 组历史错位，以及尚无 owner 的
Shroomite。Mining readback 仍显示 item 88/410/411 的冲突或缺失，六个 Shroomite effect
端点为空，typed effect 行数为 0。

最终临时进程显式关闭邮件 health probe，`/api/actuator/health` 和记录的 Armor 端点均返回
200。artifact 仍为 `completed_with_drift`，原因只剩 API 暴露的 54/30 tuple drift，因此
不是 API acceptance。HTML 已嵌入同一状态并链接该只读证据；用户人工审核结论仍不能替代
owner、lineage、projection readback 和受控 operation gate。
## API contract continuation — 2026-10-01

The read-side Armor contract now carries typed item-effect semantics and
lineage through public and admin readers. `projection_equipment_effect_attributes`
queries select `value_max_decimal`, `variant_label`, `condition_text`, the
operation and the maint/landing/source trace fields. Public item equipment
effects and admin Armor attribute/set readers accept exactly the governed
Armor source kinds `armor_attribute_cell` and `armor_item_page`; unrelated
source kinds remain outside the Armor effect views. Admin payloads expose
source kind plus maint/landing/source lineage for audit review.

Focused verification is green: Java Maven selection `54/54`, and the Mining /
typed-publication Node contracts `15/15`. This is read/API contract evidence
only. Canonical image receipts remain `315/431`, Shroomite has no valid maint
owner, Mining identity/attribute blockers remain, and typed publication still
lacks registered operation, real permit/recovery integration and projection
readback. No database/API write, image upload, permit, Redis or scheduler
operation was run.

## F20 · 严重：typed-effect operation 已注册但仍保持 fail-closed

2026-10-01 CST 将 typed item-effect 下游 owner 注册为
`canonical-armor-typed-effect-publication`，以便后续授权链能够绑定唯一的
relation ownership。catalog/manifest 固定了
`pipelines/relation/run-armor-typed-effect-publication.mjs`、按 retry label
隔离的 proposal/PREPARED/result 路径，以及唯一写入边界
`relation.relation_equipment_effect_attributes.item_effect_sources`；契约标记
`databaseWrites=true`、`networkAccess=false`，并把 proposal 作为 manifest-bound
private input。伪造 ownership、命令、路径或 code bundle 的 manifest 会被拒绝。

该 runner 当前只做 fail-closed gate：source、owner、projection 和 recovery
门未全部关闭时，在连接数据库、读取 proposal、消费 permit 或执行 DML 之前直接
退出。因而“已注册”不等于“可执行”，也没有生成真实 proposal、授权 packet、permit
或 apply packet。`build-canonical-cutover-authorization` 已为将来启用的
private proposal 增加 exact manifest-bound input 解析，但本轮没有调用它产出授权。

### 验证

- typed-effect operation registration, proposal identity/no-write/hash gate,
  explicit `executionReady=false` gate, and fail-closed runner tests: `4/4`。
- canonical authorization/manifest focused tests: `110/110`；complete
  automation Node suite: `1111/1111`。
- Armor typed-effect、Mining candidate、secondary focused tests: `65/65`。
- `node --check` 与 `git diff --check` 通过。

### 当前仍阻塞

- 真实 permit/recovery ledger、projection readback 和 production runner owner
  尚未接入；494 source tuples 对 470 relation tuples 的 54 缺失/30 多余仍未修复。
- Shroomite 没有合法 `maint_armor_sets.record_key`；Mining item 88 重复 owner、
  item 410 defense 冲突、item 411 relation 缺行仍未得到 owner 决策。
- canonical image receipts 仍为 `315/431`，243-member complete coverage 未
  验收。因此 candidate/proposal 继续保持 `databaseWrites=false`、
  `executable=false`、`applyAllowed=false`，不生成 apply packet；manifest
  中的 `databaseWrites=true` 仅表示未来受控事务的预声明，不表示当前可执行。

## F21 · 2026-10-03 bounded source recrawl and full value comparison

本轮按 monitor-visible progress contract 重新抓取了
`Module:ArmorSetBonuses` 和中文 `盔甲属性表`，并对 Mining 三件发起独立英文
页面请求。证据目录为 `.local/tmp/armor-recrawl-20261003-01/`：module
revision `964993`、`64/494/243`（sets/positive tuples/unique IDs），属性表
revision `199734`、`230` rows。英文三次请求都解析到 revision `1003045` 的同一
`Mining armor` page；三个中文独立标题没有 revision identity，按缺失证据处理。
没有覆盖 canonical generated source，也没有数据库写入、图片上传或 permit 消耗。

全量 `START TRANSACTION READ ONLY` 比较报告为
`.local/tmp/armor-db-source-compare-20261003-01.json`，事务已 rollback，服务器
UUID `b4ae6728-4f72-11f1-bcc9-00155d37eadf`。结果为 source/relation tuples
`494/470`，`440` matched、`54` missing、`30` extra；active attribute rows
为 maint/relation/projection `230/246/223`。source 230 行均能解析到 item ID，
但历史 `sentrySlots` 位移、4 个 item defense 差异、relation duplicate owner
和 projection 缺行仍需人工/owner 处置。source set benefits 为 `64`，relation
和 projection set typed-effect 为 `0/0`。

Mining 明确差异：ID 88 source defense `2`，有两个 accepted relation owner
（`sentrySlots=2` 与 `sentrySlots=1`）；ID 410 source defense `2`，当前
maint/item/relation/projection 为 `10/1/1/1`；ID 411 source image 为
`Mining Pants.png`、defense `1`，但 source 中文标题错成 `挖矿头盔`，relation
和 projection 均缺失。Wiki 不返回 TerraPedia `record_key`；key 必须由本地
maint owner/lineage 确定性选择后，再经 API/DB/projection readback。

新的图片审核页为
`http://127.0.0.1:8788/armor-review-latest-20261003.html`；原兼容地址
`http://127.0.0.1:8788/armor-review-latest-20261001.html` 也已同步为同一内容，包含全部 230
属性行、64 套结构、54/30 元组、图片 URL、ID、internalName 和三层数值；
record_key 仅保留在只读 JSON 证据中，不放入主视图。人工审核不产生 owner
decision，也不解除正式 API/permit/operation gate。

## F22 · readable review surface and port binding — 2026-10-03

审核页已改为默认展示图片、item ID、`internalName`、中文/英文名、部位、
source defense、maint/relation/projection defense 和非零 raw cells；主表不再
展示 hash 或 `record_key`。元组差异只显示套装、变体、部位和 item ID。

原服务只监听 `127.0.0.1:8788`，外部查看端无法访问；现已改为监听
`0.0.0.0:8788`。本机和 LAN 地址均对新页面返回 HTTP 200，页面大小
`451675` bytes。页面仍为只读，不代表任何数据库修复已执行。

## F23 · 2026-10-04 historical tuple repair and readback

F12/F19 的 `494/470`、`440/54/30` 是 attempt `20261004-05` 执行前的
快照。该受控操作已对 15 个有确定 maint owner 的历史错位组提交：插入
45 条正确 relation member、退役 30 条旧错位 member，并同步 15 条 maint
父记录、15 条 relation 父记录和 15 条 public projection。操作结果为
`COMMITTED`；proposal hash 为
`sha256:5b029936785a7f1064f7beeaeceeaf14bf020cded371bbf83e138c89e3ae2b91`。

2026-10-04 在同一 MySQL server UUID 上重新执行只读事务，并按
`maint_armor_sets.record_key -> relation_armor_sets.source_maint_record_key
-> relation_armor_set_items.armor_set_record_key` 映射 owner。固定 source
revision `964993` 共 494 个非零 tuple；当前 63 个 maint/relation/projection
owner、485 个活动 relation tuple 中，485 个与 source 匹配、9 个缺失、0 个
多余。缺失项只有 `ArmorSetBonus.Shroomite` 的三个头部变体，共 9 个 tuple、
5 个唯一 item ID；它目前没有 maint owner。30 条旧行均 inactive，45 条新行
均 active；无重复或 orphan child，15 组父记录/部件及 projection 均与 source
一致。

公开 detail API 对 63 个现有 projection owner 逐个 GET，并以 source tuple
直接比对，63/63 通过。更新后的只读审核页面在
`http://127.0.0.1:8788/armor-review-latest-20261003.html`，顶部显示
`485/9/0`，15 个已修复组显示 DB/API 回读，Shroomite 卡片显示待 owner 的
9 条部件 tuple；旧的 `54/30` 候选提示已移除。机器可读回读摘要为
`reports/runtime/armor-review-20261001/armor-tuple-repair-readback-20261004.json`。

这不代表 Armor 全链路验收：Shroomite canonical owner、typed set-effect
relation/projection 发布与恢复、完整属性覆盖、64 套图片 cache 的
`AWAITING_OWNER` 请求都仍未关闭，也没有生成 Shroomite apply packet。
