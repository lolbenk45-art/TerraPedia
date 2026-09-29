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
