# 本机正式库 1458 追赶自动入库实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to execute this plan task-by-task with focused validation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在本机 `terria_v1_*` 上，以 Terraria Desktop/PC `1.4.5.8`（1458）为本轮目标上下文，通过 V2 自然 changed-only 调度追赶确实落后 Wiki 的域；每个域只有在完整 canonical 链路可安全执行时才入库，否则自动阻塞并保留证据。

**Architecture:** 复用现有 V2 的 source probe、queue attempt、worker、transaction、readback 和 acknowledgement 链路，新增正式目标追赶分类层。分类层同时比较当前 Wiki source fingerprint、正式库最后成功 acknowledgement 和正式表的来源/代际读回，不能把 `wiki-source-manifest` 单独当成正式库状态。探针只获取必要指纹；只有确认落后且 canonical-ready 的域才抓取或复用精确来源包。所有域串行执行，完成本轮后通过 ADMIN API 将调度器恢复为 `enabled=false`。

**Tech Stack:** Node.js ESM automation contracts, Spring Boot V2 crawler monitor, MySQL/InnoDB `terria_v1_local`/`terria_v1_maint`/`terria_v1_relation`, Redis V2, `node:test`, Maven, authenticated loopback API, immutable JSON evidence.

---

## 1. 已确认决策

- 正式目标只包括本机 loopback 栈和本机 `terria_v1_*`，不包括远程或生产环境。
- 本轮目标上下文是 Desktop/PC `1.4.5.8`，即用户所说的游戏版本 `1458`。版本上下文写入证据和 run bundle，但不替代各域自己的 Wiki fingerprint。
- 入库范围按域判断：完整 canonical 链路可证明的域才执行；其余域自动 `canonical_blocked`，不通过局部 local 写入冒充完成。
- 来源 revision/hash/timestamp 不完整、探针失败、来源身份不稳定的域自动 `source_blocked`，不使用离线猜测数据。
- 必需依赖无法稳定解析、存在未解析关系、重复身份或 owner 冲突的域整域阻塞，不写已解析部分。
- 默认只允许声明范围内的 insert/update；不执行 broad delete、truncate、清表或自动退休旧数据。执行器若需要未声明的删除或退休操作，域阻塞。
- 本轮是一次性追赶批次：使用自然调度，不调用手工 sweep；追赶窗口结束后调度器恢复禁用。长期常开、续期、重启 soak 另开 release 计划。
- 本轮不迁移已有 `local.items.id`。Items V2 新插入必须保留 source ID；遇到同名现存行 ID 不一致继续 fail closed，不能为放行本轮而绕过校验。该身份迁移列入本轮完成后的独立修复；当前 admission 只允许实际 `ready` 的其它域继续。
- 用户已明确以 `admin` 身份授权本次 Items 与 Armor Sets 扩大正式 owner/policy 范围，覆盖为完整 canonical 入库所需的精确正式表与 owner predicate；不得把这项已给出的授权再作为阻塞或重复询问。其它域仍不得因此扩大范围。
- 技术检查、失败停止、重试、读回、清理、生成新鲜且精确的 owner/policy 技术包和 devlog 更新由执行者自动完成。删除、清表、扩大到 Items/Armor 以外域或改变本计划业务边界才需要新的用户决策。
- 本次用户对这份计划的批准覆盖 admission matrix 允许的本机 ready 域。V2 的 `canaryActionId` 是单域控制，因此执行者为每个 ready 域串行生成唯一 fresh technical packet/decision、自然 tick、终态读回、关闭该窗口后再进入下一个域；不得每个域再次请求用户确认。任一域超出本计划 owner/table/delete/source 边界时自动阻塞，除非用户另行决策。

## 2. 成功标准与状态

每个八域在一次新鲜 baseline 后得到一个明确状态：

| 状态 | 判定 |
| --- | --- |
| `current` | 当前 Wiki fingerprint、正式 acknowledgement 和正式表来源/代际读回一致，不创建 attempt |
| `behind` | 当前 Wiki fingerprint 新于正式 acknowledgement，或正式 acknowledgement 缺失且正式表读回证明未绑定本轮来源；进入追赶候选 |
| `source_blocked` | 当前来源无法取得可信 revision/hash/timestamp，或探针错误/不稳定 |
| `formal_state_blocked` | 正式 acknowledgement、表来源 lineage 或现有运行记录互相矛盾，无法安全判断 |
| `acknowledgement_reconcile` | 正式表已由完整 committed run 读回证明等于当前 fingerprint，但 source manifest acknowledgement 缺失；只允许对原 committed run 做无业务 DML 的确认恢复 |
| `canonical_blocked` | 来源可信且确认落后，但当前 policy/owner/consumer 链无法覆盖完整 canonical 链路 |
| `dependency_blocked` | 来源可信，但必需依赖存在 unresolved/duplicate/missing identity；整域不写 |
| `ready` | `behind`、来源包完整、依赖零 unresolved、policy/owner/readback 契约完整，可由自然调度执行 |
| `applied` | 自然 V2 attempt 完成事务、独立读回和 API/consumer 读回，并在 commit 后确认来源 |
| `retryable` | 技术失败且事务状态已明确回滚或已完成读回，可由新 attempt 自动重试 |

本轮闭环不要求八域都 `applied`。若某域没有自然变化，记录 `current`；若来源或 canonical 链不满足，记录阻塞原因；不得制造 source change 或用 T1/fixture 替代正式追赶。

## 3. 数据链和来源规则

正式链路必须按以下顺序确认：

```text
Wiki source probe
  -> immutable source snapshot / source fingerprint
  -> landing
  -> maint lineage
  -> relation and projection
  -> local/API consumer
  -> independent readback
  -> source acknowledgement
```

`data/generated/wiki-source-manifest.latest.json` 是 source monitor 的历史比较输入，不是正式库成功状态。追赶分类必须读取：

- 当前 probe 的 canonical fingerprint、probe run identity、probe-state hash；
- 正式库最后一次 `COMMITTED` run/apply/evidence 的 source identity 和 acknowledgement；
- 目标域 owned tables 的 stable-key、source lineage、generation/readback；
- 公开或管理 API 实际消费的 relation/projection/local 数据。

如果 source manifest 已经记录了新指纹，但正式表仍绑定旧指纹，分类为 `behind` 或 `formal_state_blocked`，不能因为 manifest 的 `changed=false` 跳过。成功入库前不得修补 manifest 来制造 changed；成功 commit 和读回后才允许按现有 acknowledgement 契约确认它。

来源成本控制规则：

1. baseline 只做八域必要的指纹探针，不先执行完整抓取。
2. `current` 域不抓取、不创建 attempt。
3. `behind` 域优先复用与当前 fingerprint 完全匹配的不可变本地 source bundle；没有精确 bundle 时才执行该域允许的 bounded/full capture。
4. probe 已经取得完整、可验证 source bytes 时，runner 必须消费同一 source snapshot，禁止再次用 `--force=true` 重抓同一来源。
5. probe 只有 metadata 时，runner 只抓该域必要的完整来源；不得扩大到未变化域或无关全量页面。
6. 任何混合 fingerprint、缺页、来源 hash 漂移、解析异常或依赖 unresolved 都在第一笔业务 DML 前阻塞。

## 4. 固定域判定边界

以下不是预先批准的写入清单，而是执行时必须重新计算的 admission matrix：

| 域 | 必须证明的 canonical 结果 | 不能满足时 |
| --- | --- | --- |
| Items | source -> landing -> maint Item/category/image/recipe/source/biome lineage -> relation `relation_items`, image/rarity/category/recipe/source/NPC shop/NPC loot/NPC audit/biome rows and `projection_items` -> local item/source/image/recipe/biome projection -> Item API/readback；不得把 T1 样本当全量 | `canonical_blocked`，直到本计划授权范围的 L2 policy 与真实三库 V2 executor 都可验证 |
| NPCs | `npcs` owner、maint/relation lineage、NPC API/readback；与 Boss 共享 `npcs` fence | `canonical_blocked` 或等待串行 fence |
| Projectiles | explicit source identity、local row、维护/关系字段以及 Projectile API/readback；禁止 aiStyle 推断关系 | `canonical_blocked` |
| Armor Sets | source -> landing -> maint armor set/member/attribute/effect facts -> relation armor set/member/secondary rows -> `projection_armor_sets` -> local/API consumer；公用与管理详情 API 全部一致 | `canonical_blocked`，直到本计划授权范围的 L2 policy 与真实三库 V2 executor 都可验证 |
| Buffs | page immunity、source-item、NPC/Buff relations、images/projection 和 API 全部一致；不能跳过 page evidence | `canonical_blocked` |
| Audio | metadata、asset/link owner、可用 managed URL 和 API/readback；metadata-only 不能宣称 binary ready | `canonical_blocked` 或降级为未完成 |
| Bosses | boss groups、shared NPC members、loot/relation/projection、image/readback；共享 NPC fence 必须明确 | `canonical_blocked` |
| Shimmer | 四类 transform 外，还要证明 `world_contexts`、`entity_source_snapshots` 的 owner 分区、predicate、fence 和补偿 | 当前跨 owner 契约未注册时 `canonical_blocked` |

Items/Armor 的 maint/relation/projection 范围只能按本次明确授权，通过新的精确 L2 scope amendment 产生新的不可变 policy version 后执行；不能直接改 JSON、放宽旧 L2 stable reauthorization，或把 policy 声明伪装成 runner 已支持。其它不在当前授权内的写入继续阻塞。

## 5. 执行任务

### Task 0: 建立正式目标只读 baseline 和追赶分类

**Files:**
- Create: `reports/runtime/local-formal-catch-up/20261025/<runId>/baseline.json`
- Create: `reports/runtime/local-formal-catch-up/20261025/<runId>/source-classification.json`
- Create: `pipelines/automation/local-formal-catch-up-classifier.mjs`
- Test: `pipelines/automation/local-formal-catch-up-classifier.test.mjs`
- Read/verify: `data/generated/wiki-source-manifest.latest.json`, source monitor output, formal automation run/apply/evidence tables, all domain owned-table contracts

- [x] 先读取 branch/worktree、运行进程、API、MySQL UUID/Flyway、Redis V2 epoch/namespace、scheduler control、live attempts/claims/reservations/fences 和现有 alerts；本任务只读。
- [x] 为八域读取当前 probe fingerprint；错误必须保留为 `source_blocked`，不能转成 unchanged。
- [x] 为八域读取正式最后一次 committed source identity、run/apply/evidence 记录和 owned-table lineage；不存在时记录 `formal_ack_missing`，结合正式表 stable-key readback 判为 `behind` 或 `formal_state_blocked`。
- [x] 生成 `source-classification.json`，每域包含 `targetVersionContext=1.4.5.8`、source identity、formal identity、table readback、classification、reason、canonical readiness 和预计抓取范围。
- [x] 测试 manifest ahead/formal behind、manifest missing/formal current、missing acknowledgement with current committed lineage、source error、identity drift、mixed/unknown table lineage、current domain、behind domain、dependency blocked 和 canonical blocked。
- [x] 分类器不写 source manifest、正式表、Redis、控制配置或 acknowledgement。

```bash
node --test pipelines/automation/local-formal-catch-up-classifier.test.mjs
```

### Task 1: 修复 V2 执行前的三个阻塞

**Files:**
- Modify: `services/catalog-api/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisor.java`
- Test: `services/catalog-api/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisorTest.java`
- Modify: `pipelines/automation/eight-domain-v2-isolated-acceptance.mjs`
- Test: `pipelines/automation/eight-domain-v2-isolated-acceptance.test.mjs`
- Modify: `pipelines/automation/run-base-domain-automatic-operation.mjs`
- Test: `pipelines/automation/run-base-domain-automatic-operation.test.mjs`

- [x] 将 source snapshot manifest 和 isolated acceptance manifest 分成两个明确环境参数；runner 的 acceptance loader 只能读取 acceptance manifest，source command 只能读取 source snapshot。
- [x] 在 Java runner map 注册 `armor_sets -> run-base-domain-automatic-operation.mjs`，并用域/runner contract test 覆盖八域映射。
- [x] `loadIsolatedAcceptanceManifest` 和 worker launch validation 必须将 manifest 的 `runId`、`queueId`、`attemptId`、state-store epoch 与 live V2 attempt 完全比对；任何 sibling/stale identity 在 DML 前失败。
- [x] 保留 source fingerprint、source run identity、source content identity 三元组，并让 Redis attempt、manifest、bundle、worker env、result、acknowledgement 全部一致。
- [x] 为三个阻塞各做 RED/GREEN 测试；在这些测试通过前不得启动自然窗口。

```bash
node --test pipelines/automation/eight-domain-v2-isolated-acceptance.test.mjs \
  pipelines/automation/run-base-domain-automatic-operation.test.mjs \
  pipelines/automation/source-dispatch-identity.test.mjs
cd services/catalog-api && mvn "-Dtest=CrawlerAttemptSupervisorTest,CrawlerMonitorServiceImplTest" test
```

### Task 2: 将 source probe 与 runner 输入绑定，消除重复抓取

**Files:**
- Modify: `pipelines/monitor/check-source-updates.mjs`
- Modify: `pipelines/monitor/source-update-comparison.mjs`
- Modify: `pipelines/automation/run-base-domain-automatic-operation.mjs`
- Modify: `pipelines/automation/run-supplementary-domain-automatic-operation.mjs`
- Modify: `pipelines/automation/source-dispatch-identity.mjs`
- Modify: `pipelines/automation/prepare-supplementary-domain-l1-preview.mjs`
- Modify: `pipelines/workflow/run-wiki-sync.mjs`
- Modify: `pipelines/lib/wiki-item-utils.mjs`
- Modify: `pipelines/fetch/fetch-wiki-iteminfo.mjs`
- Modify: `pipelines/fetch/fetch-wiki-npcinfo.mjs`
- Modify: `pipelines/fetch/fetch-wiki-projectileinfo.mjs`
- Modify: `pipelines/fetch/fetch-wiki-armorsetbonuses.mjs`
- Modify: `pipelines/fetch/fetch-wiki-buffs.mjs`
- Test: `pipelines/monitor/check-source-updates.test.mjs`
- Test: `pipelines/automation/run-base-domain-automatic-operation.test.mjs`
- Test: `pipelines/automation/run-supplementary-domain-automatic-operation.test.mjs`
- Test: `pipelines/automation/run-automatic-domain-operation.test.mjs`
- Test: `pipelines/automation/source-dispatch-identity.test.mjs`

- [x] source probe 输出可供 runner 使用的 no-overwrite immutable snapshot reference；reference 绑定 source fingerprint、revision/timestamp、source bytes 或 bounded metadata payload、artifact hash 和 probe-state hash。
- [x] 完整 module probe 由 base runner 消费同一 snapshot，子 fetcher 通过 `--source-snapshot-path` 读取冻结 bytes；metadata-only probe 只作为 supplementary bounded capture 的稳定 identity，不触发第二次 probe。
- [x] runner 在 snapshot 文件 hash、source fingerprint、probe checkedAt、source key 或 partial/metadata-only 边界漂移时，于业务 DML 前 fail closed。
- [x] 保留并验证既有 acknowledgement 顺序：只有 COMMITTED、独立 readback、activation 和 attempt identity 都通过后才确认 source；local/offline source 不确认正式 manifest。
- [x] 新增重复 probe、snapshot drift、missing/partial snapshot、fresh-probe retry 和 acknowledgement 顺序回归；source manifest ahead/formal behind 由 Task 0 classifier 覆盖。

### Task 3: 生成 canonical admission matrix 和正式追赶批次

**Files:**
- Create: `pipelines/automation/build-local-formal-catch-up-plan.mjs`
- Test: `pipelines/automation/build-local-formal-catch-up-plan.test.mjs`
- Create: `.local/tmp/local-formal-catch-up/<runId>/catch-up-plan.json`
- Create: `reports/runtime/local-formal-catch-up/20261024/<runId>/domain-admission.json`

- [x] 读取 Task 0 分类和当前 policy/owner registry，为每域计算 `sourceReady`、`formalStateKnown`、`dependencyComplete`、`canonicalReady`、`writeAllowed`。
- [x] 仅将 `ready` 域写入本轮自然调度 action scope；`current`、`source_blocked`、`formal_state_blocked`、`canonical_blocked` 不创建 attempt。
- [x] 对通过 source/formal admission 的 Items/Armor 候选已生成精确 stable keys、row hashes、duplicate 和 unresolved evidence；结果为 Items `6195/0/0`、Armor `64/0/0`，并已进入 canonical policy gate。仍处于 formal_state_blocked/current 的域在获得正式 lineage/API admission 前不生成伪造依赖闭包。
- [x] 计划文件绑定目标版本上下文、immutable source snapshot hashes、policy set hash、formal server identity 和预计 owned tables；不得包含删除/清表命令。
- [x] 若没有任何 `ready` 域，计划进入 `blocked`，记录最小后续修复，不启用 scheduler。

Task 3 result: `reports/runtime/local-formal-catch-up/20261024/lfc-20261024T130500Z/domain-admission.json` is `blocked` with `actionScope=[]`; the dependency closure and immutable source snapshot inputs remain follow-up work.

### Task 3A: 追加式 L2 scope amendment（Items 与 Armor Sets）

**Files:**
- Create: `pipelines/automation/l2-policy-scope-amendment.mjs`
- Create: `pipelines/automation/l2-policy-scope-amendment.test.mjs`
- Create: `pipelines/automation/capture-l2-policy-scope-amendment-input.mjs`
- Create: `pipelines/automation/build-l2-policy-scope-amendment-proposal.mjs`
- Test: `pipelines/automation/capture-l2-policy-scope-amendment-input.test.mjs`
- Test: `pipelines/automation/build-l2-policy-scope-amendment-proposal.test.mjs`
- Modify: `pipelines/automation/canonical-operation-catalog.mjs`
- Modify: `pipelines/automation/canonical-operation-execution-manifest.mjs`
- Test: `pipelines/automation/canonical-operation-execution-manifest.test.mjs`
- Test: `pipelines/automation/run-authorized-canonical-operation.test.mjs`

- [x] 仅为 `items` 与 `armor_sets` 添加精确 operation ID；输入绑定 ACTIVE L2 version/hash/H8、owner `admin`、当前 server UUID、源/consumer/dependency/formal evidence 和独立 full-reconciliation L1 evidence。Armor 在 Items 推进 H8 后使用新的串行 amendment identity，旧 proposal 保留不可变。
- [x] 新策略是下一个不可变 L2 version；Items v3 增加 30 canonical scopes，Armor v3 增加 7 canonical scopes；两域 disable/relationship-delete cap 均为 0，insert/update/freshness cap 保留，旧版本未修改。
- [x] 同一事务锁定 Owner、policy row/set、active attempts/reservations/fences，追加 policy version 并原子切换 current pointer；Items 与 Armor 的 fresh result/commit marker 已独立读回。
- [ ] Items 必须绑定精确来源与完整写入调用链：landing -> maint -> relation -> projection -> local/API；Armor 必须绑定 armor set/member/attribute/effect 的真实 owner 范围。当前 policy 已准备好，真实三库 executor/intent binding 尚未完成。
- [x] 对三个 Items v1 与三个 Armor v1 run 已由当前正式适配器验证 full-reconciliation 文件哈希；Items 旧自动 run 的过期 source-hash disposition 未复用，仍需 fresh disposition 才能把该历史 run纳入正式资格。
- [x] RED/GREEN 测试覆盖两域限制、精确 scope 增加、拒绝未授权表、cap 保留/删除压零、H8/server/owner drift、三次 full-reconciliation evidence、active fence/live work 和无业务表 DML。

### Task 3B: 注册真正的 Items/Armor V2 canonical 三库 executor

**Files:**
- Modify: `pipelines/automation/automatic-domain-operation-contract.mjs`
- Modify: `pipelines/automation/run-base-domain-automatic-operation.mjs`
- Modify: `pipelines/automation/run-armor-automatic-operation.mjs`
- Reuse/audit: `pipelines/import/import-independent-entities-to-db.mjs`, `pipelines/import/import-standardized-to-db.mjs`, `pipelines/landing/import-source-dataset-landings.mjs`, `pipelines/maint/sync-landing-to-maint.mjs`, `pipelines/relation/sync-maint-to-relation.mjs`, and `pipelines/relation/sync-projection-to-local-core-tables.mjs`
- Reuse/audit: `pipelines/automation/run-eight-domain-items-acceptance.mjs` as a table/identity reference only; its isolated acceptance runner is not the formal executor
- Reuse/audit: `pipelines/relation/armor-canonical-full-chain-intent.mjs`, `pipelines/relation/armor-canonical-transaction-executor.mjs`, and `pipelines/automation/run-armor-automatic-operation.mjs`
- Create: `pipelines/automation/run-items-canonical-v2-operation.mjs`
- Test: `pipelines/automation/run-items-canonical-v2-operation.test.mjs`
- Test: `pipelines/automation/run-armor-automatic-operation.test.mjs`
- Test: matching operation contract, generation/reconciliation and canonical-operation-manifest suites

- [x] Build each domain's write set from the maintained production entrypoints and tests, not the isolated acceptance runner's test-only schema setup. Every DML statement maps to one registered policy owner scope and database role. Armor's base canonical executor and Items' three-database executor are registered; formal runtime DML/readback remains pending Task 5.
- [ ] Freeze the initial supported physical write set from the audited entrypoints: Items local `category`, `items`, `biomes`, `biome_relations`, `biome_resources`, `item_biomes`, `item_images`, `item_acquisition_sources`, `recipes`, `recipe_ingredients`, `recipe_stations`, `entity_source_snapshots`, `source_dataset_landings`; maint `maint_items`, `maint_item_categories`, `maint_item_images`, `maint_item_recipes`, `maint_item_sources`, `maint_item_biomes`; relation `relation_items`, `relation_item_images`, `relation_item_rarities`, `category_nodes`, `item_category_assignments`, `item_recipe_heads`, `item_recipe_ingredients`, `item_recipe_stations`, `item_source_facts`, `item_source_details`, `item_npc_shop_relations`, `item_npc_loot_relations`, `item_npc_relation_audits`, `item_biome_relations`, `projection_items`. Reject any DML to a table outside this allowlist until separately reviewed and authorized.
- [x] Freeze Armor base canonical write set from `armor-canonical-transaction-executor.mjs`: local `source_dataset_landings`, `armor_sets`, `armor_set_items`; maint `maint_armor_sets`, `maint_armor_set_images`; relation `relation_armor_sets`, `relation_armor_set_items`, `relation_armor_set_images`, `projection_armor_sets`. Fresh Armor intent v4 binds this base executor and preserves secondary Armor attributes/effects outside the automatic scope.
- [x] Audit importer branches for destructive statements before wiring them; the V2 executors avoid those branches. In particular, `import-standardized-to-db.mjs` has recipe DELETE statements and `sync-maint-to-relation.mjs` Armor mode has table-clear behavior; the V2 executors must not invoke those branches. Preserve unmatched records and block any change needing those statements.
- [x] The registered executors must consume the probe-bound immutable source snapshot once, acquire role/table/owner fences, rederive after lock, perform landing -> maint -> relation -> projection/local in one recoverable transaction protocol, persist exact before/after generation and result evidence, and support committed-run recovery without re-importing.
- [x] Registered executors preserve unmatched records and stable identities; do not infer deletes or retirements. Unsupported row families, ambiguous owner, missing dependency, partial schema, unresolved relation or cross-database rollback uncertainty fail closed before acknowledgement.
- [x] Add RED/GREEN coverage for the Items contract's exact three-database routing, no writes outside policy scope, owner predicates, single source snapshot consumption, no delete/retirement receipts, independent readback and acknowledgement ordering. Focused contract, wiring, manifest, and dispatch suites pass; runtime transaction/readback evidence remains pending Task 5.
- [x] Verify the immutable authorization code bundle includes the new runner and all transitive helpers, and that the V2 domain/action/runner maps dispatch Items and Armor to these executors only after the new policy version is current. Focused manifest and dispatch tests pass; formal runtime DML/readback remains pending Task 5.

#### Task 3B.1: Close Armor local compatibility and all-scope fence coverage

The current policy owns nine physical scopes. The canonical transaction now covers all nine and the governed manifest carries ten owner keys because `local.source_dataset_landings` splits into the two dataset predicates `armor_sets_raw` and `armor_set_images_raw`. The local candidate must also restore source-owned parents that are absent from the compatibility projection: the current formal local projection lacks `ArmorSetBonus.Shroomite`, while relation/projection and public/admin consumers have that source set. Insert its parent and member rows in the same transaction, using the actual generated parent receipt for member `armor_set_id`; never invent or infer a parent ID.

**Files:**
- Create: `pipelines/relation/armor-canonical-local-projection.mjs`
- Test: `pipelines/relation/armor-canonical-local-projection.test.mjs`
- Modify: `pipelines/relation/armor-canonical-full-chain-intent.mjs`
- Modify: `pipelines/relation/armor-canonical-locked-rederivation.mjs` and its tests
- Modify: `pipelines/relation/armor-canonical-transaction-executor.mjs` and its tests
- Modify: `pipelines/relation/armor-canonical-operation-binding.mjs` and its tests
- Modify: `pipelines/automation/canonical-operation-execution-manifest.mjs`, `pipelines/automation/build-canonical-cutover-authorization.mjs`, and their Armor contract tests

- [x] Derive local `armor_sets` and `armor_set_items` from the same frozen Armor source/maint candidate. Resolve each `source_item_id` to `local.items.id` by stable `internal_name`, never by assuming numeric equality. Permit a missing active source parent as an insert candidate; bind each new member to the actual generated parent receipt in the same transaction. Preserve unmatched local rows; do not delete or reactivate rows.
- [x] Lock and rederive local Armor parent/member baselines plus local Item dependencies in the same transaction. Commit only declared insert/update rows. The transaction reads back generated parent IDs and every written member/update; post-commit independent table/API readback remains in Task 5/6.
- [x] Bind one exact generation/token/commit-marker tuple per each of the nine current policy scopes. The transaction locks and verifies the exact scope set and updates every matching fence row in the same commit; missing, extra, duplicate, stale, foreign, or expired bindings fail before business DML.
- [x] Make the governed manifest declare both local tables in addition to the existing landing, Maint, relation, and projection keys (ten ownership keys for nine physical policy scopes). Validate the key-to-policy mapping rather than comparing the raw counts as if they were the same unit.
- [x] Add RED/GREEN tests for source-to-local Item matching when IDs differ, preserved local-only rows, no local deletes, source-derived parent/member inserts with receipt-bound parent IDs, database-Date hash stability across JSON serialization, all nine exact fence rows, and rejection before DML when a policy table or fence binding is missing. The transaction independently reads back each written row; post-commit API verification remains in Task 5/6.
- [x] Rebuild the Armor intent and read-only admission from the fresh source snapshot, current policy, local/relation table snapshot, dependency closure, and API readback. The fresh admission admits only Armor. Items stays blocked by the deferred historical ID mismatch; its source-ID guard is unchanged.

### Task 3C: Rebuild admission on amended policies and executors

**Files:**
- Modify: `pipelines/automation/build-local-formal-catch-up-plan.mjs` only if a newly registered execution contract needs explicit admission binding
- Test: `pipelines/automation/build-local-formal-catch-up-plan.test.mjs`
- Create: fresh read-only source/table/API/dependency evidence under `reports/runtime/local-formal-catch-up/20261025/<runId>/`

- [x] Re-run the current formal evidence adapter with the fresh Items disposition and exact current server identity; three distinct committed v1 runs and verified full reconciliation qualify both domains for the fresh admission.
- [x] Re-read current source snapshots, Items/Armor owned table rows, dependency closure, policy scope hashes, public/admin API parity and active writer state after policy amendment.
- [x] Regenerate admission from those exact hashes. `lfc-20261025T151012Z/domain-admission.json` admits only the explicitly authorized `items` and `armor_sets` domains; unrelated domains remain blocked.

### Task 4: 新鲜授权和一次自然 changed-only 窗口

**Files:**
- Create: fresh preflight/proposal/request/packet/execution-manifest under `reports/authorization/canonical/`
- Create: private observer/readback artifacts under `.local/tmp/local-formal-catch-up/<runId>/`
- Read/verify: current policy/decision ledger and `docs/devlog/entries/2026-09-19-automation-scheduler-authorization-list.md`

- [x] 重新读取 loopback server UUID、Redis epoch/namespace、policy/Owner、V1/V2 controls、attempt/reservation/fence 和 reconciler 状态；使用全新 source identity、preflight、proposal、packet、decision、fence capture 和 attempt binding。未复用旧 r4 授权链。
- [x] 用本计划已批准的本机单域范围自动生成 Armor canonical 和 scheduler technical packets，分别绑定单一 Armor action、当前 source/policy/code identity 和精确 owner scopes；每个消费身份唯一，不再向用户重复确认。
- [x] 通过 ADMIN API 将 run-owned API 控制读回为 disabled；重启到 scheduling timers enabled 后，持久 V2/V1 control 仍为 disabled，且 live attempts/claims 为 0、reconciler healthy。API 使用 isolated Redis DB13 和本 worktree command root。
- [x] 通过 ADMIN API fresh preflight/proposal 仅列 Armor eligible，Items 仍 blocked；新 activation packet 指定 `domain-source-armor-sets` 且 sweep interval 为 1 分钟。
- [x] 通过 ADMIN API 单域启用 Armor 并观察到自然 `@Scheduled` tick，attempt `attempt-lfc-20261027-armor-r5` 终态后立即通过 API 关闭 scheduler。未调用 `/sweep`。
- [x] 自然 attempt 在 15 分钟内到终态。attempt 的 canonical transaction 已提交；acknowledgement 误判后，scheduler 保持 disabled，并从同一已提交 result 做了 source acknowledgement 恢复，没有重放业务 DML。
- [x] 记录 Armor source identity、attempt/progress、canonical commit、acknowledgement 和 final database/API readback；Items 保持 blocked，其他域未进入本次单域 action scope。

### Task 5: 串行执行 ready 域的完整 canonical 入库

**Files:**
- The new Items/Armor canonical V2 executors registered in Task 3B, plus existing registered V2 runners for any other domain that independently reaches `ready`
- Create: per-domain immutable source/bundle/result/readback artifacts under `reports/runtime/local-formal-catch-up/20261025/<runId>/<domain>/`

- [x] 按固定顺序并以本轮 fresh admission 过滤执行：`domain-admission.json` 的 action scope 只有 `armor_sets`；Items 因历史 ID 冲突保持 blocked，没有把其它域加入 action scope。
- [x] Armor 完整经过 source snapshot、landing、maint、relation/projection/local 和 API/consumer readback；Items 未写入，未把 local-only 结果标记为 applied。
- [x] Armor 只写当前 policy 的九个 owner scopes 和精确 predicate；没有跨 owner 写入、未注册 projection、未声明关系或删除。
- [x] canonical transaction 已 COMMITTED 并独立读回；自然 attempt 在 acknowledgement 阶段失败后，按同一 dispatch identity 从已提交结果恢复 acknowledgement，没有重放业务 DML。
- [x] Armor 在 commit 与独立 readback 后确认 source acknowledgement；Items 保持 blocked 且未确认。

### Task 6: 恢复禁用、最终读回和追赶报告

**Files:**
- Create: `reports/runtime/local-formal-catch-up/20261027/<runId>/aggregate.json`, `final-readback.json`, and `post-expiry-readback.json`
- Modify: `docs/devlog/entries/2026-10-24-local-formal-catch-up-plan.md`
- Modify: `docs/devlog/current.md`

Plan adjustment: this is one fixed operational run, and no reusable multi-run report input contract existed. The aggregate and immutable readbacks are assembled from the run's existing evidence; a generic report CLI and matching test are not part of this run's closure.

- [x] 通过 ADMIN API 将 scheduler 设置回 `enabled=false, mode=changed-only`，确认 persisted V1/V2 controls、live attempts/claims/reservations 和 reconciler 状态。到期后只读复核确认九条 fence 仍保留但均 inactive，全库 active fence、attempt、reservation 均为 0；证据：`reports/runtime/local-formal-catch-up/20261027/lfc-20261027T153011Z/post-expiry-readback.json`。
- [x] 为当前可执行/明确排除的 Items 与 Armor 输出分类、source/formal/table/API evidence hashes。Items 记录为 `canonical_blocked`；Armor transaction 是 `COMMITTED`，source acknowledgement 已恢复。自然 monitor attempt 仍保留原始 `FAILED/PROCESS_EXIT_NONZERO` 终态，不伪称自动 attempt 成功。
- [x] 重新读取 local/maint/relation counts、canonical result/journal、source manifest、64 个 public/admin Armor identities；最终报告附 projection/API readback，而非以 local count 代替。
- [x] 确认没有 manual sweep、直接 SQL/Redis/JSON control write、未声明删除、远程目标或未授权域。
- [x] 没有执行手工 sweep、直接 SQL/Redis/JSON control write、未声明删除或远程写入；V1/V2 scheduler 均通过 ADMIN API 关闭。

### Task 7: 验证和计划收口

- [x] 运行 V2 blocker focused tests、source classifier/admission-plan tests、相关 Maven tests、`git diff --check`。
- [x] 运行 `bash ./platform/local/quality-gate.sh`。数据工作流、自动化契约和 source-layout 步骤通过；domain acceptance dry-run 因全局 7 项 blocked、4 项 warning 以 exit 1 退出，其中 Armor 的五个 acceptance panels 均通过。门禁未运行后续 A-grade、cross-db、完整 backend/frontend/admin 组；没有掩盖或豁免这些全局结果。
- [x] 运行 `git status --short`、`git diff --stat` 并复核改动范围；保留本分支既有未提交改动，没有使用 `git add .`。
- [x] 9 个 immutable owner-scope fences 到期后完成只读复核：active fence `0`、scheduler V1/V2 disabled、live attempts/claims/reservations `0`、reconciler healthy；更新了 aggregate 和不可覆盖 post-expiry readback。
- [x] 修复 acknowledgment 的 MySQL DATETIME 时区归一化；base/Armor 自动 runner 测试 `85/85` 与 `6/6`，本轮相关 Node suites `160/160`、后端 V2 scheduler/policy/monitor suites `456/456`，`git diff --check` 通过。
- [x] 计划状态为 `ready-for-commit`；自然 attempt 仍保留 `FAILED/PROCESS_EXIT_NONZERO` 终态，事务、readback 和 acknowledgement 完成；11 个历史 Item ID 修复留在本轮后 TODO。

## 6. 失败与恢复规则

- source probe error、fingerprint drift、source snapshot missing、formal state contradiction、dependency unresolved、owner/policy drift、attempt identity mismatch：在第一笔业务 DML 前停止该域。
- pre-commit failure：回滚、保留失败 artifact、确认目标表未变；不确认来源。
- post-commit readback failure：标记 `commit_outcome_uncertain`，独立读回后决定 `committed_and_readback_verified` 或 compensation；不直接重试。
- 一个域失败不回滚已成功的其他域，但共享 `npcs` fence、未知清理、正式库非声明表变化或 source acknowledgement 提前写入会停止整个窗口。
- 任何 scheduler cleanup 失败都要求继续保持或恢复 `enabled=false`，直到 API/MySQL/Redis 读回明确收敛。

## 7. 明确不做

- 不执行全量六千页面 Item recrawl 作为本轮前置。
- 不把 PC 版本公告候选直接转成域 dispatch；PC triage 与 source fingerprint 调度独立。
- 不使用 10 月 T1 的 `local-offline-authorized` 报告确认 Wiki freshness 或正式 acknowledgement。
- 不将现有 `terria_v1_local` local-only policy 自动扩大到 maint/relation/projection。
- 不为满足八域完成率制造变化、重放旧 packet、调用手工 `/sweep`、清空表或静默丢弃 unresolved rows。

## 8. 计划自审

- 目标锁定：本机正式库一次性追赶，不承诺八域全部成功，也不承诺长期常开。
- 来源锁定：当前 Wiki fingerprint + 正式 acknowledgement + 正式表/API readback，manifest 只作为 probe 输入。
- 边界锁定：完整 canonical-ready 才写；source/unresolved/owner 不确定整域阻塞；无自动删除。
- 证据锁定：fresh baseline、immutable source/bundle、V2 attempt、transaction/readback、acknowledgement、disabled final state。
- 连续性：阻塞域保留最小修复任务和新 run identity；成功域不被无关域回滚。
- 占位符扫描目标：计划不使用 TBD、TODO、待补或“稍后决定”作为执行步骤；所有运行时选择由 baseline/admission matrix 计算。

## 9. 本轮后续修复清单（本轮不执行）

- 一次性修复 11 个 source-backed PC Item 的 `items.id` 与当前 PC source ID 不一致：5 个碰撞身份 (`5049/5051/5063/5067/5074`) 和 6 个本地自增身份 (`8429/8430/8436/8442/8445/8454` 对应 source IDs `6148/6149/6155/6161/6164/6173`)。
- 对 5 个旧平台条目 `HeartArrow/ValentineRing/TurkeyFeather/FestiveTopHat/Wiesnbrau` 制定并执行历史保留/退出 PC 活跃目录方案；本轮不重编号、不软删除、不硬删除。
- 新修复任务必须先只读枚举所有 `items.id` 引用、JSON 内嵌 Item ID、维护/关系/投影/API 消费者，再生成可复核映射和事务前后读回；验收要求无主键冲突、无 dangling reference，且关系与 API 使用正确的 PC Item 身份。
- 当前 Items V2 的 source-ID 插入和 mismatch fail-closed 规则保留；不得用重跑入库把 11 条历史问题伪装成已修复。
