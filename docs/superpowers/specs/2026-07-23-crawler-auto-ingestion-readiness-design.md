# Crawler 全面自动化入库准备设计

日期：2026-07-23

状态：待用户复核

需求来源：`2026-07-23-crawler-auto-ingestion-readiness-questionnaire.md`

适用范围：Crawler Monitor、V2 attempt 编排、抓取到正式入库、策略门禁、审批、回滚、通知和管理端风险工作台

> 本文是获批需求的技术设计，不是执行命令，也不授权真实 crawler、formal apply、Redis 重置、数据库回滚或生产部署。

---

## 1. 目标

在不创建第二套队列、不让前端推断风险、不一次性开放所有写库动作的前提下，把当前注册操作纳入统一自动化治理：

```text
变化检测 / 定时触发
  -> V2 child attempts 执行抓取、标准化和 dry-run
  -> 后端按域策略和证据判定 L0 / L1 / L2
  -> L0 阻止写库
  -> L1 等待 System Owner 批准 exact run
  -> L2 在策略范围内自动 snapshot + apply
  -> post-apply 验收
  -> 完成，或熔断 / 降级 / 受保护回滚
```

最终目标覆盖当前全部注册操作及其维护域，但每个域独立晋级。覆盖范围不等于同时开启 L2。

---

## 2. 现状结论与实施前阻断

### 已具备

- Redis V2 是实时队列、attempt、租约、心跳和精确控制权威。
- 后端拥有稳定操作目录，当前管理端可展示 19 个操作。
- attempt 已能记录计划、进度、结果、日志和产物路径。
- 现有 crawler progress contract 要求稳定 `actionId`、首请求前进度、心跳和终态。
- 数据链已有 manifest、freshness、manual refresh plan 和部分幂等/作用域 reconcile 工具。

### Foundation blockers

1. Plan A 幂等门禁当前为 156/157；Town NPC 测试受主 worktree MinIO 端口配置影响，不是环境无关测试。
2. 数据维护链审计在 clean worktree 因默认 relation report 缺失而退出。
3. 现有 backend refresh 动作有的默认 `apply=true`，有的拆成 preview/apply，风险语义不统一。
4. 当前只有配置型单一 `ADMIN` 身份，没有 System Owner 持久化映射或高风险重新认证凭证。
5. 当前邮件发送组件面向验证码，需要独立的自动化告警投递边界。
6. 不是每个可写域都有完整的 preview action、apply action、owned scope、snapshot、post-verify 和 rollback capability 声明。

任何域进入 L1/L2 前，以上与该域相关的 blocker 必须关闭。全局 L2 开关不存在。

---

## 3. 核心术语和状态边界

### 3.1 自动化等级

| 等级 | 自动执行 | 写库规则 |
| --- | --- | --- |
| L0 | 检测、抓取、标准化、dry-run、证据生成 | 禁止 formal apply |
| L1 | L0 全流程、快照计划、审批材料 | System Owner 批准 exact run 后 apply |
| L2 | 完整预演、策略判定、快照、apply、验收 | 证据与阈值全绿时自动 apply |

等级是域策略，不是 V2 attempt 状态。V2 仍使用 queued/running/paused/completed/failed 等运行状态。

### 3.2 域运行状态

域另有独立 operational state：

- `ACTIVE`：允许按当前等级运行。
- `AWAITING_APPROVAL`：run 已通过预演但需要 Owner 决策。
- `CIRCUIT_BROKEN`：阻止新 apply；允许安全的只读诊断。
- `ROLLBACK_REQUIRED`：自动恢复条件不满足，需要 Owner 处理。
- `DISABLED`：域未启用或 V2/能力清单不满足。

不得用最近一次 attempt 终态替代域当前 operational state。

### 3.3 自动化 run 与 V2 attempt

一次 automation run 是持久化父记录；每个真实执行步骤是独立 V2 child attempt：

```text
automationRunId
  -> detectionAttemptId (optional)
  -> previewAttemptId
  -> snapshotAttemptId
  -> applyAttemptId
  -> verifyAttemptId
  -> rollbackAttemptId (only when needed)
```

dry-run 与 apply 不允许在同一个 attempt 内通过运行中参数切换。审批必须绑定父 run、preview evidence hash、规范化 policy-set hash 和计划的 apply actionId。

preview 必须额外生成冻结、内容寻址的 `apply-input.bundle.json`。approval 绑定 bundle SHA-256；apply child 只能消费该 exact bundle，不得重新 fetch、normalize 或读取可变的 `latest` 输入。apply 在事务内根据当前数据库重新计算 actual diff，并与 approved diff、bundle hash 和 policy-set hash 再次比较。L2 还必须重新满足策略阈值；L1 则必须命中同一份已批准 decision 的有界例外规则。任一身份或逻辑差异不一致必须在 commit 前 rollback。

---

## 4. 权威边界

| 权威 | 负责内容 | 不负责内容 |
| --- | --- | --- |
| 后端代码操作目录 | actionId、命令、能力、默认超时、preview/apply 配对 | 运行时等级和审批 |
| Redis V2 | queue、attempt、lease、heartbeat、实时日志游标 | 长期策略和审批事实 |
| MySQL | 域等级、策略版本、run、判定、审批、告警、证据索引 | 大体积快照内容 |
| 私有持久化目录 | diff、snapshot、apply、verify、rollback 证据及哈希 | 实时队列状态 |
| 管理端 | 展示后端判定、收集 Owner 明确操作 | 推断命令、风险、等级或可执行性 |

私有证据根目录默认位于 worktree 外，例如：

```text
~/.local/share/terrapedia/automation/<environment-id>/<automation-run-id>/
```

目录权限必须为 `0700`，证据/快照文件为 `0600`。不得把数据库快照放入 Git、普通 `reports/` 跟踪范围或图片 MinIO bucket。

每个 run 必须绑定不可变 `environmentId`，其指纹至少包含 repo/worktree identity、数据库 host/port/name、Redis host/port/logical DB、V2 epoch 和运行用途分类。数据库名称、用途分类、配置、环境指纹或 V2 模式不匹配时一律 fail-closed。local + isolated acceptance 属于本计划，生产启用另立任务。

### 4.1 数据库用途隔离

数据库按用途分为三层，禁止用同一连接配置跨层复用：

| 层级 | 允许数据库 | 用途 | 写入边界 |
| --- | --- | --- | --- |
| T0 自动测试 | 一次性 `terria_v1_automation_test_<runId>` | 单元、DAO、迁移、trigger、apply/rollback 自动测试 | 仅测试进程；测试结束销毁 |
| T1 集成验收 | 隔离 `terria_v1_automation_acceptance_<runId>` | 从 `terria_v1_local` 的受控快照构建隔离副本，验证完整 preview/apply/verify/rollback | 仅隔离环境；不得与日常服务共享 writer 凭据 |
| T2 正式本地运行 | 显式配置的 `terria_v1_local` | L0 shadow、逐次授权的 L1 验收，以及未来完成晋级后的正式 L2 运行 | 默认只读；写入必须通过正式 run、激活、策略、快照和 fence 门禁 |

所有测试和验收入口必须先执行数据库防误写 preflight：

- runId 用于库名前必须规范化为仅含小写字母、数字和下划线的不可逆短标识，并保留原始 runId 到规范化标识的审计映射；禁止把未校验输入直接拼进 SQL identifier。
- `test` profile 只接受完整匹配 `^terria_v1_automation_test_[a-z0-9_]+$` 的库名；连接 `terria_v1_local` 或 acceptance 库立即退出。
- `acceptance` profile 只接受完整匹配 `^terria_v1_automation_acceptance_[a-z0-9_]+$` 的库名；连接 `terria_v1_local` 或 test 库立即退出。
- 除库名外，同时校验 DB host/port/server UUID、用途 token、凭据角色和 `environmentId`；任一不匹配都在首条 DDL/DML 前退出。
- T0/T1 使用独立最小权限凭据和独立 Redis logical DB/epoch，不得复用 T2 writer 凭据或队列状态。
- T1 副本只能由显式快照任务使用 T2 只读凭据创建，源连接不得拥有 DDL/DML 权限；若含敏感数据必须在导入 T1 前或导入事务内脱敏。验收完成后删除副本，保留哈希、计数和非敏感证据，不保留散落 dump。

`terria_v1_local` 上的 L0 只允许只读 preview/shadow。逐 operation 的 L1 runtime acceptance 必须由用户另行授权；未来 L2 晋级后的自动 apply 是正式运行，不得伪装成测试命令或借用测试授权。

---

## 5. 操作能力清单

现有 19 操作目录扩展为后端唯一能力清单。每个可自动化域必须声明：

- `domainId`
- `previewActionId`
- `applyActionId`（不可写域可为空）
- `postVerifyActionId`
- `rollbackActionId` 或明确 `rollbackMode`
- `ownedTables`
- `ownedScopes` / parent-key 规则
- `changeKinds`：insert/update/relationDelete/softDisable/hardDelete/rebuild
- `snapshotMode`
- `checkpointCapability`
- `defaultTimeout`
- `freshnessClass`：core/extended
- `requiresV2=true`

缺任一必需能力时，该域强制 L0/`DISABLED`，页面显示具体缺项，不允许前端兜底。

V1 环境必须 fail-closed。V1 代码保留作为独立历史兼容范围，但不接入本系统；V1 删除另立任务。

### 5.1 当前 19 操作能力矩阵

下表是实施计划的固定基线。`artifact` 表示只验证原子输出、进度和 schema；`frozen scope` 表示未来 automation apply 必须消费 preview bundle。所有当前 apply action 在完成冻结输入和 mutation generation 改造前均保持 L0-disabled，不因已经支持手工写库而获得 L1/L2 资格。

| 域 | operationId / actionId | 当前 DB | 覆盖 scope | Snapshot / verify / rollback | 初始自动化状态 |
| --- | --- | --- | --- | --- | --- |
| items | `check` / `wiki-items-refresh` | none | item module artifacts | none / artifact / none | L0，默认关闭 |
| items | `force` / `wiki-items-force-refresh` | none | item module artifacts | none / artifact / none | L0，Owner 单操作激活 |
| npcs | `check` / `wiki-npcs-refresh` | none | NPC module artifacts | none / artifact / none | L0，默认关闭 |
| npcs | `force` / `wiki-npcs-force-refresh` | none | NPC module artifacts | none / artifact / none | L0，Owner 单操作激活 |
| projectiles | `check` / `wiki-projectiles-refresh` | none | projectile module artifacts | none / artifact / none | L0，默认关闭 |
| projectiles | `force` / `wiki-projectiles-force-refresh` | none | projectile module artifacts | none / artifact / none | L0，Owner 单操作激活 |
| buffs | `fresh` / `buff-page-immunity-refresh` | none | Buff source/progress/checkpoint artifacts | none / artifact + checkpoint / none | L0，默认关闭 |
| armor_sets | `fresh` / `domain-source-armor-sets` | none | armor-set source artifacts | none / artifact / none | L0，默认关闭 |
| recipes | `preview` / `recipe-reference-sync` | read | `(result_item_id, source_provider)` recipe groups | none / frozen diff bundle / none | L0 preview，默认关闭 |
| recipes | `apply` / `recipe-reference-apply` | write | `recipes`, `recipe_ingredients`, `recipe_stations` by recipe group | frozen scope / DB+API / scope restore | L0-disabled；必须拆出 bundle-only apply |
| biomes | `preview` / `biome-preview` | none | wiki_gg biome entities and owned relations | none / frozen diff bundle / none | L0 preview，默认关闭 |
| biomes | `apply` / `biome-sync` | write | `biomes`, `biome_relations`, `biome_resources`, `item_biomes` for declared wiki scopes | frozen scope / DB+relation+API / scope restore | L0-disabled；当前 apply 会重新抓取，必须拆分 |
| bosses | `fresh` / `domain-source-bosses` | none | Boss source/progress/checkpoint artifacts | none / artifact + checkpoint / none | L0，默认关闭 |
| town_npc_maintenance | `fresh` / `domain-source-town-npc-maintenance` | none | Town NPC source/progress/checkpoint artifacts | none / artifact + checkpoint / none | L0，默认关闭 |
| shimmer | `fresh` / `domain-source-shimmer` | none | Shimmer source artifacts | none / artifact / none | L0，默认关闭 |
| npc_loot | `preview` / `npc-loot-backfill` | read | non-boss `npc_loot_entries` where `drop_source_kind=npc_drop` | none / frozen diff bundle / none | L0 preview，默认关闭 |
| npc_loot | `apply` / `npc-loot-apply` | write | same non-boss NPC owner scopes | frozen owner scope / DB+relation+API / scope restore | L0-disabled；必须消费 frozen bundle |
| boss_loot | `preview` / `boss-loot-backfill` | read | boss-owner `npc_loot_entries` for declared boss groups | none / frozen diff bundle / none | L0 preview，默认关闭 |
| boss_loot | `apply` / `boss-loot-apply` | write | same boss owner scopes | frozen owner scope / DB+relation+API / scope restore | L0-disabled；必须消费 frozen bundle |

当前 19 操作之外的 `town-npc-sync`、independent entity、Shimmer import、audio import、support sync 等下游写入只能作为后续 capability onboarding 项进入本系统。每项必须先新增独立 preview/apply pair 和完整矩阵行，不得借用同名抓取操作直接写库。

若未来一个 action 覆盖多个 domain，run 必须列出排序、去重后的全部 `coveredDomains`，联合评估所有策略、获取全部 fence，并按稳定顺序锁定；任一域不允许即阻止整个 apply。系统把每个 covered domain 的 `domainId`、policy version 和 policy hash 按 `domainId` 排序后规范化序列化并计算 `policySetHash`；run、decision、approval、snapshot、frozen bundle 和 apply 都必须持久化或引用同一 policy set，不能用单个主域策略代替。

---

## 6. 策略与判定

### 6.1 版本化策略

每次策略变更创建不可变版本，至少包含：

- domainId、level、version、policyHash
- insert/update 的绝对和比例上限
- relationship delete 的绝对和比例上限
- entity soft-disable 的绝对和比例上限
- hard delete / rebuild 永久转 L1 的规则
- 必需 gate 列表及版本
- snapshot / post-verify 要求
- 并发、重试、超时引用
- 创建者、批准者、原因和时间

历史趋势只能额外阻止，不得自动提高阈值或修改策略版本。

### 6.2 初始阈值

默认 ceiling：

| 变更类型 | 上限 |
| --- | --- |
| entity insert | `min(10%, 500)` |
| entity update | `min(10%, 500)` |
| scoped relationship delete | `min(5%, 200)` |
| entity soft-disable | `min(0.5%, 20)` |
| hard delete | 永远 L1 |
| whole-domain rebuild | 永远 L1 |

每类阈值使用：

```text
allowedCount = min(floor(baselineCount * ratioLimit), absoluteLimit)
```

actualCount `<= allowedCount` 才在界内；等于上限允许，任一计数超限即转 L1。计数来自 preview diff 中去重后的逻辑 entity/relation key，不使用 JDBC/MySQL affected-row 数。entity insert/update/soft-disable 的分母是 action owned scope 内现有唯一 entity 数；relation delete 的分母是 exact parent scope 内现有唯一 relation 数。多 scope 必须逐 scope 检查并同时检查聚合绝对上限。

基线为零时自动上限为零，首次导入必须 L1。Owner 不得修改已生成 decision；只能批准 exact run 的冻结 L1 差异，或创建新策略版本后重新 preview。

### 6.3 L1 有界例外语义

Owner 对 L1 的批准是对不可变 exact run 的一次性有界例外，不是放宽全局策略。它只在下列条件同时满足时授权 apply：

- decision 是 `REQUIRES_OWNER_L1`，且原因仅为可解释的阈值超限、zero-baseline 首次导入、hard delete 或 whole-domain rebuild；任何 anomaly 均不可批准绕过。
- approval 绑定 runId、decisionHash、evidenceHash、bundle SHA-256、policySetHash、plannedApplyActionId、完整逻辑 diff hash/key sets/counts、Owner reauth 和原因。
- apply 事务内重算结果与获批内容逐项完全相等，baselineFingerprint、mutation generation、schema、capability 和 gate 仍有效。
- approval 只消费一次；失败、过期、输入变化或策略变化后必须重新 preview 和审批。

因此事务校验分为两种模式：`AUTO_APPLY_L2` 必须同时满足 exact equality 和当前策略 ceiling；`APPROVED_OWNER_L1` 必须满足 exact equality 与批准边界，但不再次要求该已知超限 diff 满足 L2 ceiling。Owner 若希望长期放宽 ceiling，必须创建新策略版本并重新 preview，不能复用一次性 L1 approval。

### 6.4 判定输出

策略服务输出结构化 decision：

- `BLOCKED_L0`
- `REQUIRES_OWNER_L1`
- `AUTO_APPLY_L2`
- `CIRCUIT_BREAK`

输出必须包含 reason codes、policySetHash、逐域 policy versions/hashes、evidenceHash、counts、ratios、gate results、snapshot requirement 和 plannedApplyActionId。

可解释、schema 正确且仅超过版本化业务阈值的 diff 是 `REQUIRES_OWNER_L1`，不是 circuit breaker。scope mismatch、非法负数/重复 key、evidence/hash 不一致、无法解释的历史异常、gate 失败或 apply/verify 失败属于 anomaly，输出 `CIRCUIT_BREAK` 并降 L0。

### 6.5 晋级和降级

- L0 -> L1：foundation gates 完整，至少一次真实 isolated shadow 通过，由 Owner批准。
- L1 -> L2：至少连续 3 次 L1 成功，且包含 1 次周全量对账；系统只提出建议，Owner 批准。
- L2 -> L1：阈值超限、策略变更、证据新鲜度异常或普通可恢复风险。
- 任意 -> L0：gate 失败、apply 失败、post-verify 失败、快照损坏、身份/版本冲突或自动恢复失败。
- 熔断恢复、首次 L2 和阈值放宽均需 Owner批准。

---

## 7. 数据模型

建议新增独立表，而不是把结构化判定塞入 `security_audit_log.details`：

### 7.1 配置与身份

- `crawler_automation_owner`
  - singleton owner username、status、version、bootstrappedAt、updatedAt
- `crawler_automation_policy`
  - domainId、currentVersion、currentLevel、operationalState、circuit metadata
- `crawler_automation_policy_version`
  - immutable policy JSON/hash、reason、createdBy、approvedBy、timestamps

### 7.2 运行与证据

- `crawler_automation_run`
  - runId、primaryDomainId、coveredDomains、policySetHash、trigger、status、baselineFingerprint、timestamps
- `crawler_automation_run_policy`
  - runId、domainId、policyVersion、policyHash；`(runId, domainId)` 唯一，完整保存该 run 的规范化 policy set
- `crawler_automation_run_attempt`
  - runId、stage、ordinal、automationDedupeKey、queueContractVersion、stateStoreEpoch、queueId、attemptId、fenceToken、stateVersion、domain、coveredDomains、operationId、actionId、retryOf、status
- `crawler_automation_evidence`
  - runId、kind、privatePath、sha256、size、schemaVersion、frozenInput flag、createdAt、retentionUntil
- `crawler_automation_decision`
  - runId、decision、reasonCodes、counts/ratios JSON、policySetHash、evidenceHash、logicalDiffHash/key/count identity

### 7.3 审批、告警和恢复

- `crawler_automation_approval`
  - runId、decisionHash、policySetHash、evidenceHash、bundleHash、logicalDiffHash/key/count identity、plannedApplyActionId、actor、action、reason、reauthId、consumedAt、createdAt
- `crawler_automation_alert`
  - severity、dedupeKey、status、firstSeenAt、lastSeenAt、acknowledgedBy/At
- `crawler_automation_snapshot`
  - runId、scope descriptor、path/hash、policySetHash、baselineFingerprint、integrity status、retentionUntil
- `crawler_automation_write_fence`
  - environmentId、domain/scope、latestRunId、beforeGeneration、committedGeneration、commit marker、updatedAt
- `crawler_automation_mutation_generation`
  - environmentId、table/scope key、generation、lastWriterRunId、schemaHash、updatedAt

所有表通过 Flyway 新迁移创建；当前最新迁移为 V54，执行时使用下一个可用版本并先核对 main 是否已有新迁移。

`security_audit_log` 继续记录安全事件摘要；自动化专用表提供可查询、可绑定 exact run 的结构化事实。

`baselineFingerprint` 定义为 environmentId、全部 covered scope 的 mutation generation、owned-table schema hashes 和规范化当前 DB projection hash 的 SHA-256。preview、approval、snapshot 和 apply 必须引用同一 fingerprint 与 policySetHash；任一组成变化都使旧 decision stale。

---

## 8. 安全与 System Owner

### 8.1 Owner 初始化

当前系统只有一个配置型 ADMIN，没有多管理员 principal/session 模型。因此初始实现中该 configured ADMIN 就是唯一 Owner；“普通 ADMIN 提交建议”只作为未来多 principal 扩展契约，本计划不虚构第二类当前用户。首次迁移通过仅本机命令把当前 `terraria.auth.admin.username` 显式写为唯一 Owner：

- 不创建或保存新明文密码。
- 配置用户名与已登记 Owner 不一致时，高风险接口 fail-closed。
- 未来引入真实多管理员 principal 后，非 Owner ADMIN 才可查看证据和提交建议；在此之前不存在可登录的普通 ADMIN。
- `TERRAPEDIA_AUTOMATION_OWNER_EMAIL` 必须显式配置并通过投递验证；缺失或邮件关闭时 scheduler 和所有域 activation 保持关闭。

### 8.2 高风险重新认证

高风险操作采用两步协议：

1. Owner 向 re-auth endpoint 提交当前管理员密码；后端直接与配置密码进行恒定时间比较。
2. 成功后签发短时、一次性、仅服务端存储哈希的 reauth challenge，绑定 username、当前 bearer token 的服务端 SHA-256 指纹、IP、action kind 和过期时间。当前 JWT 没有 sessionId，不得在设计或实现中假设存在。
3. approve 请求必须携带 challenge、reason、runId、policySetHash、evidenceHash/decisionHash 和 bundle hash。
4. challenge 消费后立即失效；密码、challenge 明文不得写日志或证据。

禁止高风险批量批准。

### 8.3 Break-glass

提供仅 loopback/本机 CLI 可执行的 Owner 恢复流程：

- 需要一次性令牌和当前配置管理员凭据。
- 默认关闭，必须显式环境开关进入短窗口。
- 只允许恢复 Owner 映射或解除身份锁，不直接批准数据写入。
- 全程写 security audit 和自动化审计表。

---

## 9. 编排流程

### 9.0 默认关闭与激活

数据库迁移后全局 scheduler 默认 `disabled`，所有 domain/operation 均为 L0 + `DISABLED`，启动应用不得创建 crawler 或 apply intent。Owner 必须先完成 environment/V2 epoch、Owner email、capability、gate 和 evidence-store preflight，再逐 domain/operation 记录 activation authorization。全局 scheduler enable 和每域 activation 缺一不可。

实现与离线验收不得代替真实 operation-level activation。V2 epoch、environmentId 或 policy/capability hash 变化时 activation 自动失效并 fail-closed。

任何 test/acceptance profile 不得创建 T2 activation，也不得把测试成功自动转换为 `terria_v1_local` 的 scheduler/domain activation。T2 激活记录必须由正式本地 profile 在独立审批流程中创建。

### 9.1 创建 intent

触发源包括 source-change、core 6h、extended daily、weekly full reconciliation 和管理员手工 request。

同域已有 active run 时，新触发合并为一个 pending intent，保留全部 trigger reasons、最高 freshness urgency 和最新 source fingerprint。不得无界排队，也不得静默丢弃。

### 9.2 Preview

orchestrator 创建父 run，并通过 V2 启动 preview child attempt。preview 必须：

- 在首个网络请求/长循环前写进度。
- 输出标准化 diff schema。
- 声明 planned/actual/skipped/failed、insert/update/delete/soft-disable counts。
- 输出代表样本和完整 evidence hash。
- 输出冻结 `apply-input.bundle.json`、bundle schema version 和 SHA-256；bundle 内包含所有 apply 所需源记录，不引用可变 `latest` 文件。
- 不写业务数据库。

### 9.3 Decision

PolicyService 验证 operation capability、evidence freshness/schema/hash、gates、thresholds、baselineFingerprint 和 V2 engine mode。

- L0：run 终止为 blocked，保留修复建议。
- L1：进入 awaiting approval，邮件/页面通知 Owner。
- L2：进入 snapshot。

### 9.4 Snapshot + Apply

- 获取 domain/scope write fence；同一时刻全局最多一个 DB apply。
- 再次确认 policySetHash、逐域 policy versions/hashes、evidenceHash、frozen bundle hash、mutation generation 和 preview 未过期。
- 创建 owned table/parent scope 快照并校验 hash。
- 启动独立 apply child attempt；apply 不自动重试，且禁止网络访问、重新 normalize 或读取可变 source/latest 文件。
- apply 连接设置当前 automationRunId，在事务内读取 frozen bundle、重新计算 normalized logical diff；actual diff hash、key sets、counts 和 baselineFingerprint 必须与 decision 完全一致。`AUTO_APPLY_L2` 再检查所有 covered domains 的当前 ceiling；`APPROVED_OWNER_L1` 检查一次性 approval 未消费且批准身份完全相等，不要求已知的 L1 diff 回落到 L2 ceiling。任一检查失败立即 rollback。
- 脚本必须事务化或提供被批准的 scope reconcile 原子边界。

### 9.4.1 V2 child 身份与所有权

每个 stage 先在 MySQL 预留 run-attempt row 和唯一 `automationDedupeKey=<environmentId>:<runId>:<stage>:<ordinal>`，再请求 V2 enqueue。返回后以条件更新事务保存完整 queue/attempt identity。跨 Redis/MySQL 不伪称原子事务；enqueue 成功而 DB attach 失败时 run fail-closed，由 reconciler 以 dedupe key 收敛孤儿，禁止启动后续 stage。

V2 enqueue/lookup 返回已有 attempt 时，只有其 immutable metadata 中的 automationRunId、dedupe key、domain、operationId 和 coveredDomains 全部匹配才可 attach。手工 attempt、其他 run 或部分 domain 匹配均拒绝，不得借用 deduped attempt。

### 9.5 Verify

post-apply 必须同时验证：

- expected vs actual row/diff counts
- relation/referential integrity
- domain representative samples
- maintained public/admin read-only API
- cache visibility or explicit cache invalidation result

全部通过后更新 write fence 和 run completed。公共 API 契约本项目不变。

---

## 10. 回滚与人工冲突

### 10.0 可执行 mutation generation

仅记录 automation write fence 不能证明没有外部写入。每个进入 L1/L2 的 owned table 必须安装并验证 MySQL INSERT/UPDATE/DELETE trigger：trigger 在同一事务内递增 `crawler_automation_mutation_generation`，并读取连接 session 中的 automationRunId；普通管理端、脚本或手工 SQL 没有该 session 标识时也会递增 generation，但 writerRunId 为空/不同。

trigger 不覆盖 MySQL `TRUNCATE TABLE`，DDL 也不能依赖 DML generation 检测。因此应用 runtime、automation apply、普通管理端及包括 Owner 在内的所有日常人工 writer 身份必须在数据库权限层明确禁止 `TRUNCATE`、`ALTER`、`DROP`、`CREATE`、`RENAME` 及其他 DDL；Flyway/DBA 使用独立、仅在受控维护窗口提供的 privileged identity，运行中的应用不得持有该凭据。每次 privileged identity 使用都会使 environment activation 与未完成 run 失效。preflight 和验收必须核对实际 grants，并用隔离库证明 runtime/manual writer 的 TRUNCATE/DDL 被拒绝。任一日常 writer 身份权限无法证明或存在绕过路径时，该环境所有域的 post-commit 自动回滚保持 disabled，只允许 Owner 人工处置。

可稳定解析 parent key 的表使用 scope generation；无法稳定解析的表使用更保守的 table-level generation。apply 记录 before generation 和由自身事务产生的 committed generation。随后任何外部写都会改变 generation，从而禁止自动 snapshot restore。schema hash 或 trigger health 不匹配时，该域不能进入 L2，且 post-commit rollback 一律转 Owner。

尚未由 trigger 覆盖的表/域可以做 L0/L1 手工 apply，但不得宣称可自动 post-commit rollback。

### 10.1 自动回滚允许条件

提交后验收失败时，RollbackCoordinator 只有同时满足以下条件才自动恢复：

- failed run 是 domain/scope latest writer
- write fence 的 beforeGeneration、schema hashes 和 snapshot baselineFingerprint 一致
- mutation generation 等于 failed run 的 committed generation，且 lastWriterRunId 匹配
- 没有更新的 automation run
- 没有检测到人工/其他服务写入
- snapshot schema/hash/integrity 全部通过
- rollback action capability 已声明
- runtime/manual writer 的 TRUNCATE/DDL deny grant 仍通过 preflight，且当前 schema hash 与触发器健康检查未变化

条件不满足：域进入 `ROLLBACK_REQUIRED`，停止自动 apply，通知 Owner。

### 10.2 人工写入冲突

发现 baselineFingerprint 任一组成改变时：

- 禁止使用旧 snapshot 自动回滚。
- 禁止基于旧 preview 继续 apply。
- 当前 run 标记 stale/conflicted。
- 重新 preview 后才能再次判定。

### 10.3 自动恢复失败

自动恢复只尝试一次。失败后保留现场，域降 L0，critical alert 立即发送，不再自动尝试。

---

## 11. 调度、并发、重试和保留

### 11.1 调度

- core domains：每 6 小时 change detection。
- extended domains：每日 change detection。
- all domains：每周错峰 full reconciliation。
- source-change signal：可提前创建/合并 pending intent。

以上频率仅在全局 scheduler 和对应 domain/operation activation 都有效时生效；默认部署状态不会执行任何真实任务。

核心域初始定义：items、npcs、projectiles、buffs、bosses、biomes 和 category support。其余为 extended；能力清单是唯一机器可读定义。

### 11.2 并发

- 同域 active run：1
- 全局 fetch/transform attempts：2
- 全局 DB apply：1
- snapshot/rollback 与同 scope apply 共享互斥 fence

### 11.3 重试

| 阶段 | 自动重试 |
| --- | --- |
| fetch | 初次失败后最多 3 个 retry child attempts，指数退避 + jitter，遵守 request gate |
| transform / dry-run | 初次失败后最多 1 个 retry child attempt |
| formal apply | 0 次 |
| post-verify | 初次失败后最多 1 次只读重试；仍失败才进入回滚判定 |
| automatic rollback | 0 次追加重试 |

超时由操作目录逐动作声明；heartbeat deadline 可先于 wall timeout 熔断。

### 11.4 保留

- rollback snapshots：30 天，且每域/scope 至少最近 10 次
- execution evidence：90 天
- policy/approval/security audit：365 天

GC 只删除超过时间且超过最低保留数、未被 active incident/legal hold 引用的文件。删除前后都记录审计。

---

## 12. 管理端体验

保留 `/operations/crawler-monitor`，增加三个 tabs：

### 12.1 风险控制台（默认）

排序固定为：

1. circuit broken / rollback failed
2. pending System Owner approvals
3. L0/L1 abnormal or stale evidence
4. healthy L2

首屏显示全局安全状态、待处理数、L2 覆盖数、运行中 apply 数和最后一次完整对账。

### 12.2 流水线控制塔

按 detection、preview、approval、snapshot、apply、verify、rollback 展示父 run 和 child attempt，不改变 V2 精确控制语义。

### 12.3 全域矩阵

按域展示 level、operational state、policy version、latest decision、freshness、next schedule 和 current run。

### 12.4 Evidence drawer

审批前必须展示：

- exact run/attempt identities（可复制，显示可缩短）
- policySetHash 和全部 covered-domain policy versions/hashes
- diff totals and ratios
- deletion/disable representative samples
- gate results and freshness
- snapshot plan/integrity
- expected impact、apply action、post-verify plan、rollback point

按钮文案表达真实动作。危险操作使用单独确认区域，不与普通控制并排；所有 controls 至少 44px、支持键盘、焦点可见、状态不只靠颜色。

---

## 13. Admin API 边界

保留现有 `/admin/crawler-monitor/**` monitor/control API。新增独立 namespace，例如 `/admin/crawler-automation/**`：

- `GET /overview`
- `GET /domains/{domainId}/policy`
- `POST /domains/{domainId}/policy-revisions`
- `POST /domains/{domainId}/promotion-recommendations/{id}/approve`
- `GET /runs/{runId}`
- `GET /runs/{runId}/evidence`
- `POST /runs/{runId}/approve`
- `POST /runs/{runId}/reject`
- `POST /runs/{runId}/rollback`
- `POST /reauth/challenges`
- `POST /alerts/{alertId}/acknowledge`

具体路径可在实现计划中按现有 controller 风格微调，但必须保持：

- query/read 与 mutation 分离
- exact run/policy-set/evidence identity 必填
- mutation 支持幂等 request key
- stale version 返回 conflict，不静默采用最新值
- 前端不直接提交命令文本或证据路径

---

## 14. 通知

新增通用 automation alert mail sender，复用现有 `JavaMailSender` 和 `MailProperties`，不复用验证码业务语义。

- critical：立即发送，Owner 必须 acknowledge；未确认则继续提醒但不自动解锁。
- warning：每小时按 dedupeKey 聚合。
- info：每日摘要。
- 页面通过现有 SSE 思路接收实时状态；邮件失败不能改变数据决策，但必须形成可见 delivery failure alert。

邮件不得包含密码、token、快照内容或完整敏感路径；提供 runId 和管理端 deep link。

---

## 15. 实施分期边界

具体执行任务由后续计划拆解，但采用以下固定六阶段，顺序依赖不得跳过：

1. **Foundation**：修复 156/157、clean-clone evidence、落地 19-operation matrix、冻结 bundle-only apply、mutation generation 和 fail-closed gates。
2. **Policy + Evidence**：数据表、策略服务、Owner、reauth、私有证据存储。
3. **Orchestration**：parent run、child V2 attempts、intent merge、scheduler、decision flow。
4. **Rollback**：snapshot、write fence、post-verify、受保护自动恢复和 retention GC。
5. **UI + Alerts**：三视图、evidence drawer、Owner workflow、SSE/email。
6. **Shadow / L1 acceptance**：全域 L0 shadow、分批 L1、逐域 L2 recommendation。

首批 L1 顺序：

1. 核心实体和纯作用域写入。
2. 关系、分类和配方。
3. 掉落、Town NPC、整域 rebuild 风险动作。

每个可独立验证的任务一个 focused commit；阶段末做集成验收。

---

## 16. 验证策略

### 16.1 自动化测试

所有会执行 migration、trigger、INSERT/UPDATE/DELETE、apply、restore、TRUNCATE 拒绝验证或 DDL 权限验证的自动化测试都必须在 T0 一次性库运行。测试夹具不得把 `terria_v1_local` 作为默认值或 fallback；临时库创建失败时测试必须失败，不能降级连接真实库。

- operation capability manifest 完整性和 preview/apply 配对
- 19-operation matrix 与 registry 逐项一致、写动作默认 L0-disabled
- frozen apply bundle hash、bundle-only apply、事务内 diff recheck 和 changed-source rejection
- policy hash/version、规范化 multi-domain policySetHash、双阈值、zero-baseline 和 reason codes
- L2 ceiling enforcement 与 approved-L1 exact-equality 分支；L1 approval 只消费一次，任何 diff/policy/evidence 变化均拒绝
- L0/L1/L2 promotion/demotion/circuit state machine
- exact run/attempt/evidence binding 和 stale conflict
- Owner identity、reauth expiry/one-time use、权限拒绝和 audit
- intent merge、domain/global concurrency、retry budget 和 timeout
- snapshot integrity、write fence、manual collision 和 rollback allow/deny
- mutation triggers/generation、外部写检测、trigger 缺失时禁止自动 rollback
- 隔离库中 runtime/manual writer 的 TRUNCATE/DDL 拒绝测试；grant 无法证明时禁止 post-commit 自动 rollback
- full V2 identity、automation dedupe ownership、manual-attempt collision、multi-domain policy-set identity 和 joint fencing
- alert dedupe、ack、email delivery failure
- admin page risk ordering、tabs、evidence completeness、disabled reason 和 accessibility contracts
- test/acceptance profile 的 protected-database rejection、用途 token、server UUID、凭据角色和 environmentId 防误写门禁

### 16.2 必需门禁

- Plan A idempotency suite 全绿
- acceptance/freshness/manual refresh plan 全绿
- clean worktree 可运行 maintenance chain audit
- focused V2 backend tests and crawler/workflow tests
- admin unit/typecheck/build
- backend compile/test-compile and focused services/controllers
- 自动化测试日志证明使用唯一 T0 库，集成验收日志证明使用唯一 T1 库；任何日志出现 T2 writer 连接即失败
- `git diff --check`

### 16.3 Runtime acceptance

默认验证只运行 isolated/no-network fixtures：写库测试在 T0，完整集成验收在 T1。T2 `terria_v1_local` 默认只执行只读 L0 shadow；任何真实 crawler 或 T2 local apply 必须停在显式用户授权 checkpoint，逐 operation 授权，不得由“继续执行计划”或测试授权泛化授权。

T1 验收通过只证明候选版本具备进入 T2 L0/L1 流程的资格，不授权 T2 写入。T2 的 L1 验收必须先生成并展示目标库指纹、exact diff、snapshot 和回滚点，再由用户单次批准。L2 仅在后续满足连续 L1、周对账和 Owner 晋级条件后作为正式运行启用。

生产启用另立任务。

---

## 17. 完成定义

实现任务只有同时满足以下条件才可宣称完成：

- foundation blockers 关闭
- 离线门禁全绿
- clean-clone evidence 可复现
- T0 自动测试和 T1 isolated runtime 通过，且防误写测试证明两者拒绝 `terria_v1_local`
- T2 全域只读 L0 shadow 通过
- 版本化策略、审批、快照、回滚和页面证据可追踪
- 用户另行授权的 L1 runtime acceptance 完成或明确留作后续 owner/checkpoint
- 没有域因“操作已注册”而被错误标记为 L2-ready

---

## 18. 明确排除

- V1 删除
- 生产部署或生产自动入库
- 新外部数据源
- 公共 API 行为调整
- 把所有域一次性提升 L1/L2
- 自动 hard delete 或 whole-domain rebuild
- formal apply 自动重试
- 前端推断命令、风险、阈值或审批权限

---

## 19. 主要风险

- 当前 `CrawlerMonitorServiceImpl` 体量大；新增策略/证据/回滚必须独立 service，避免继续集中职责。
- 配置型单 ADMIN 使 Owner 身份与账号生命周期耦合；映射不一致必须 fail-closed。
- scope ownership 声明错误会导致快照或回滚越界；每域 capability 必须有 contract tests。
- post-commit 自动恢复可能覆盖后续写入；mutation generation、write fence 和 baselineFingerprint 是硬门禁。
- 本地多 worktree 共享 Redis/数据库；environmentId、slot 和 state-store identity 必须进入 run/fence。
- 报告路径和证据可能包含敏感数据；只能通过 allowlisted evidence service 读取，不暴露任意文件路径。

---

## 20. 用户复核点

请确认本文准确表达以下最终要求：

1. 新系统只支持 V2，V1 保留但不接入，删除另立任务。
2. Q1-Q32 除 Q2 文字澄清外全部采用推荐 A。
3. L0/L1/L2 是域策略；automation run 通过多个 exact V2 child attempts 执行。
4. System Owner 是固定身份，高风险操作要求短时一次性 reauth。
5. 私有快照和证据不进入 Git 或图片对象存储。
6. 真实 crawler/apply 必须在执行计划中逐 operation 获得额外授权。
