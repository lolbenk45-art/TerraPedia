# Remaining Closure Item Task: Detailed Decision Checklist

## Status

`active`

这是一份给操作者填写的“闭环 Item 任务决策表”，不是交接报告。每个空白项都代表一个可能让流程暂停的决定。代理只有在对应决定已填写后才继续。

## 先看懂这些词（Plain-language glossary）

| 专有名词 | English | 简单解释 |
| --- | --- | --- |
| 数据源快照 | source snapshot | 某一时刻保存的 Wiki 数据文件；后续不能偷偷换版本。 |
| 来源链 | source chain | 数据从 Wiki 文件到 landing、maint、relation、projection、API 的完整路径。 |
| Landing | source dataset landing | 系统接收原始数据的第一张落地表，不是最终展示数据。 |
| Maint | maintained/master layer | 经过整理、确认并可作为正式来源的数据层。 |
| Relation | relation layer | 维护实体之间关系及来源追踪的数据层。 |
| Projection | read projection | 给页面/API 读取的投影表；只能从 relation 的已确认事实生成。 |
| Parity | projection parity | 本地正式数据和 projection 的关键字段完全一致。 |
| Canonical operation | 规范操作 | 系统登记过、允许写哪些表和字段的正式操作。 |
| Manifest | 清单 | 本次允许处理的精确文件、记录、ID、hash 列表。 |
| Proposal | 提案 | 根据 manifest 计算出的“准备改什么”的计划，尚未授权执行。 |
| Decision | 决策 | 负责人批准或拒绝 proposal 的记录。 |
| Packet | 执行包 | 把 manifest、proposal、decision、代码版本等绑定在一起的执行材料。 |
| Permit | 一次性许可证 | 允许执行一次 mutation（写库）的凭证；不能复用旧的。 |
| Readback | 回读 | 写入后重新从四层数据库和 API 读取，确认实际结果。 |
| DML / mutation | 数据写入 | `INSERT/UPDATE` 等改变数据库的操作。 |
| Quarantine | 隔离 | 暂不接受的数据；保留证据，不能混入正式数据。 |
| Accepted | 接受 | 已有精确 Item ID 和完整来源链，可进入正式处理。 |
| Duplicate | 重复 | 与已有正式身份相同，不新增。 |
| Blocker | 阻断项 | 不满足就不能关闭任务的问题。 |
| Unknown transaction outcome | 未知事务结果 | 命令超时/断线，无法确认数据库到底成功还是失败；必须先查证，不能直接重试。 |

## 0. 已知基线，请先确认

| 事实 | 我的确认 | 如果不一致，填写新值 |
| --- | --- | --- |
| Branch（分支）=`feat/supplementary-domains-readiness` | [1 ] 是 [ ] 否 |  |
| HEAD=`2644d411d2ff48be41b6709dca1bb891cb3d2452` | [1 ] 是 [ ] 否 |  |
| Worktree（工作区）约 509 个 dirty/untracked，0 staged | [1 ] 是 [ ] 否 |  |
| 不允许 `reset/clean/stash/checkout` 或混合提交 | [ 1] 是 [ ] 否 |  |
| Item core projection parity（Item 核心投影一致性）已完成 | [1 ] 是 [ ] 否 |  |
| Item-source 填表基线 `accepted=0, duplicate=1295, quarantine=2022` | [ 1] 是 [ ] 否 | 后续完成 row-level 修正：2354 source rows = 0 accepted + 1295 duplicate + 311 quarantine + 748 blocked |
| Boss smoke 的问题是 source chain（来源链）断裂，不是缺少四个 Pillar 原始记录 | [1 ] 是 [ ] 否 | 生成 snapshot 有记录，旧 landing 没有中文字段 |
| 允许数据库仅 loopback `127.0.0.1:13306` | [1 ] 是 [ ] 否 |  |

## 1. 总体授权（必须先决定）

| 问题 | 我的选择 |
| --- | --- |
| 本轮是否允许任何 governed write（受治理写库）？ | [1 ] 允许 Boss lane [ 1] 允许 Item lane [ ] 两者都不允许 |
| 是否允许启动/重启 local stack（本地服务栈）？ | [ ] 默认不重启；仅服务不可用时再确认 | MySQL 等服务由 root 提供 |
| 是否允许执行 Maven/Admin/Public/quality gate 全量验证？ | [1 ] 是 [ ] 否 |
| 发现新问题时，代理是否可在同一 lane 做一次最小修复？ | [1 ] 是 [ ] 否，必须停下询问 |
| 是否接受任务在 accepted=0 或外部质量门禁失败时保持 blocked（阻断）？ | [1 ] 是 [ ] 否 | 反正阻断都在后面给我处理 |

## 2. 逐步流程决策与常见卡点

### Step 1-2：环境和旧证据核对（Environment and baseline）

要做的事：确认当前分支、HEAD、dirty 文件、服务端口、数据库连接和旧 smoke 报告仍与交接一致。

通常卡住的原因：

- 分支或 HEAD 变化（branch/commit drift）。
- dirty 文件数量或内容变化，无法证明是同一运行。
- MySQL、Redis、Backend、Frontend 端口未监听。
- 旧 smoke 报告 hash 与当前文件不一致（stale evidence）。

你需要决定：

| 情况 | 选择 |
| --- | --- |
| 发现 branch/HEAD drift | [1 ] 建立全新 run root（运行目录）重新开始 [ ] 停止任务 |
| 发现 dirty scope drift | [1 ] 只记录变化并继续只读检查 [ ] 停止任务 |
| 服务未启动 | [1 ] 按批准启动 stack [ ] 只做离线检查 [ ] 停止任务 |
| 旧报告过期 | [1 ] 重新生成 baseline（基线报告） [ ] 接受旧报告仅作历史证据并保持 blocked |

填写本步证据路径/hash：`reports/runtime/local-data-chain-closure/20260824/fresh-042509/closure-index.json`（2026-08-24 05:28 CST 已核对）

### Step 3：冻结 Boss Wiki 快照（Freeze Boss source snapshot）

要做的事：固定 `data/generated/wiki-bosses.latest.json` 的版本、hash、33 条记录、四个 Pillar 中文名和来源 URL，并列出要替换的旧 landing 行。

通常卡住的原因：

- 文件在执行期间被重新生成，hash drift（hash 漂移）。
- 记录少于 33 条或四个 Pillar 缺标题/URL。
- 找到多份同名 snapshot，不知道哪一份是当前来源。
- landing 行有多个版本，无法确定哪些应替换。

你的决定：

- [1 ] 使用交接时已经确认的那份 generated snapshot 作为唯一来源；不重新访问 Wiki。hash 漂移就废弃本轮材料并重新 freeze。
- [ ] 暂不接受 snapshot，保留 Boss blocker。
- [ ] 其他：为什么会hash漂移不是都已经固定好了吗

Snapshot path：`data/generated/wiki-bosses.latest.json`  SHA-256：`sha256:6948ef0e38cee482031ca9c066b54081b6d5469e4b70e8487b7a173016a7b00d`  Freeze path：`reports/runtime/local-data-chain-closure/20260824/fresh-042509/boss-source-chain-post-shimmer.json`

说明：这里的“新鲜度”不是再次爬 Wiki，而是确认执行时仍使用同一份已确认文件。以下情况都算 drift（漂移）：snapshot 文件字节/hash 变化、当前 HEAD 变化、manifest/proposal/packet 内容变化、数据库目标行在执行前被其他任务改变。

### Step 4-5：注册 Boss 规范操作并授权（Canonical operation and authorization）

要做的事：登记只允许 Boss 四层写入的 operation，生成 manifest/proposal/decision/packet/permit。

通常卡住的原因：

- operation ID 未注册或 allow-list（允许表/字段）过宽。
- proposal 包含 snapshot 之外的记录。
- manifest/proposal/packet hash 不一致。
- decision 未批准、permit 已消费、过期或来自旧 run。
- code bundle（执行代码版本）与当前 HEAD 不匹配。

你的决定：

| 授权问题 | 选择/填写 |
| --- | --- |
| 是否允许注册全新的 Boss source-refresh operation？ | [1 ] 是 [ ] 否 |
| allow-list 是否仅 `local.source_dataset_landings`、`maint.maint_bosses`、`relation.relation_bosses`、`relation.projection_bosses`？ | [1 ] 是 [ ] 否 |
| 是否禁止 network（网络访问）？ | [1 ] 是 [ ] 否 | 只使用已确认的本地 snapshot，不去 Wiki 爬取 |
| proposal/hash drift 时是否自动废弃并回 Step 3？ | [1 ] 是 [ ] 否 |
| 是否允许复用任何历史 decision/permit？ | 必须 [ ] 否[1] |

Operation ID：`canonical-boss-source-refresh-offline`  Decision ID：`canonical-boss-source-refresh-offline-20260823-120218-owner-05`  Permit ID：`sha256:a646c15ed16df386aeff9ece790ba480d30f3c5e067a6f8b62575efc4e1f674c`（已消费并撤销）

### Step 6：执行 Boss 刷新和回读（Governed refresh and readback）

要做的事：用已经确认的本地 snapshot 修复旧 landing，再按已有三数据库协议写入 landing -> maint -> relation -> projection，然后独立读取四层和四个 API 响应。这里的 source-refresh（来源刷新）不是重新爬 Wiki，而是把已确认的本地来源重新沿正式链路传递一次。

通常卡住的原因：

- transaction timeout/connection lost，结果未知。
- changed rows 数量与 proposal 不一致。
- landing 有中文名但 maint/relation 没有，说明来源链中断。
- projection 有值但 relation 没有，说明越权写入或错误来源。
- API 仍返回旧缓存或旧中文名。

你的决定：

- [1 ] unknown outcome 只读 fingerprint（指纹）、行数和 source key，禁止盲重试。
- [1 ] 任一层不一致就停止 Boss lane，不进入 parity apply。
- [ 1] 四层和 API 全部一致后才继续。

Readback report：`reports/runtime/local-data-chain-closure/20260824/fresh-042509/boss-source-chain-post-shimmer.json`  changed rows：Boss parity proposal=`0`；四个 Pillar 来源链均已存在且不重放 source-refresh

### Step 7：Boss parity apply（Boss 投影一致性写入）

要做的事：重新生成只含 relation-backed（有 relation 来源支撑）`name_zh` 的 parity proposal，并用新的 decision/permit 应用。

通常卡住的原因：

- proposal 仍引用本地文件而不是 relation。
- 四个 Pillar 的 source key 对不上。
- parity operation 允许更新多余字段。
- permit 与新 proposal hash 不匹配。

你的决定：

- [1 ] 仅允许更新四个 Pillar 的指定中文名字字段。
- [1 ] relation 缺值时 quarantine/block，绝不从 local 直接复制。
- [1 ] parity apply 完成后逐行 readback。

### Step 8：Item-source 分类（Item source classification）

要做的事：把每条 Item source candidate（候选来源）分为 accepted、duplicate、terminal legacy/non-PC exception、quarantine。

通常卡住的原因：

- 只有显示名称，没有精确 Item ID。
- Wiki `旧版:` 页面不是当前 PC Item。
- family/shared 页面对应多个实体，无法唯一归属。
- source page、maint trace 或 relation trace 缺失。
- 1295 duplicate 与新候选混在一起。
- 同一个 stable source identity（稳定来源身份）出现两次。

你的决定：

| 分类规则 | 选择 |
| --- | --- |
| `旧版:`/非 PC 页面是否 terminal exception？ | [ 1] 是 [ ] 否 |
| family/shared 页面是否全部 quarantine？ | [ 1] 是 [ ] 否 |
| 缺 exact Item ID 是否 quarantine？ | [1 ] 是 [ ] 否 |
| 缺 maint/relation trace 是否 quarantine？ | [1 ] 是 [ ] 否 |
| duplicate 是否永不进入 accepted？ | [1 ] 是 [ ] 否 |
| unclassified 必须为 0 才能继续？ | [ 1] 是 [ ] 否 |

最终计数（修正后）：2022 candidate Items；2354 source rows = accepted
`0`、duplicate `1295`、quarantine `311`、blocked `748`、unclassified `0`。
Candidate disposition = 0 accepted + 1190 duplicate-only + 310 quarantine +
522 blocked。另有 terminal exception `5` 个已确认的旧版/non-PC core rows，
不属于 accepted source。

### Step 9：Item-source 是否执行独立写入

请选择：

- [1 ] accepted = 0：只生成 blocker report（阻断报告），不创建 no-op apply，不伪造 permit。
- [ ] accepted > 0：为 accepted 子集创建全新的 Item-source operation、manifest、proposal、decision、packet、permit、backup、transaction 和 readback。
- [ ] 其他：__________________________________________________

常见卡点：accepted 行没有完整来源链、scope hash 漂移、proposal 与数据库现状不一致、写入结果未知。处理决定：`accepted=0`，保留 `item-source-blocker.json`，不创建 operation/proposal/permit/apply。

### Step 10：最终数据链验证（Data-chain validation）

| 验证 | 你是否要求执行 | 失败时你的决定 |
| --- | --- | --- |
| fresh local smoke（Items/NPCs/Bosses/Projectiles/Buffs） | 执行 | 做成错误报告 然后阻挡给我 错误报告写明原因 |
| cross-DB integrity（跨库完整性） | 执行 | 做成错误报告 然后阻挡给我 错误报告写明原因 |
| relation health（关系健康度） | [执行] | 做成错误报告 然后阻挡给我 错误报告写明原因 |
| Boss source-chain audit/API readback | 执行 | 做成错误报告，然后阻挡给我；报告写明断在哪一层 |
| Item-source closure report | [执行] | 做成错误报告 然后阻挡给我 错误报告写明原因 |

### Step 11：代码、前端和质量门禁（Code and quality gates）

| 验证 | 你是否要求执行 | 失败是否允许保持 blocked |
| --- | --- | --- |
| focused tests（聚焦测试） | [ 执行] | [ blocked] |
| Maven full test | [ 执行] | [ blocked] |
| Admin `pnpm run check` | [ 执行] | [ blocked] |
| Public `pnpm run check` | [执行 ] | [blocked ] |
| `platform/local/quality-gate.sh` | [执行 ] | [blocked ] |

常见卡点：公共端 Chromium profile timeout、已有 domain acceptance blocker、Maven 基线红、前端依赖/端口问题。规则已确定为：允许代理在所属 lane 做一次最小修复；若修复后仍失败，生成错误报告并阻挡，不绕过失败。

- [1 ] 修复 owning lane（问题所属代码/数据层）后重跑一次；仍失败则记录 residual blocker（剩余阻断）并明确任务不能关闭。
- [1 ] 记录 residual blocker（剩余阻断）并明确任务不能关闭。
- [ ] 其他决定：__________________________________________________

### Step 12：最终关闭决定（Closure decision）

只有你明确勾选“关闭”且以下条件全部满足，代理才可更新 parent 状态：

- [1 ] Boss 四个 Pillar 四层和 API 中文名、source trace 全部一致。
- [1 ] Item-source 无 unclassified；accepted 已独立受治理处理，或 accepted=0 blocker 已登记。
- [1 ] fresh smoke、cross-DB、relation health 均通过。
- [ 1] 测试和 quality gate 结果已记录；未绕过失败。
- [ 1] 没有未知事务结果、旧 permit 复用或未记录的人工假设。

最终选择：`[1 ] 继续下一步` `[ ] 保持 blocked` `[ ] 关闭 parent`

## 3. 任何时候卡住都填写这里

| 时间 | 卡在哪一步 | 具体现象 | 证据路径/hash | 可能原因 | 你选择的处理 | 是否可继续 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-08-24 05:18 CST | Shimmer owning lane | current generation 缺少匹配 terminal evidence | `shimmer-l1-readback.json` | 旧 canonical result 绑定旧 generation | 走 fresh Owner L1 governed operation | 是，已关闭 Shimmer blocker |
| 2026-08-24 05:24 CST | Step 11 Public | Snap Chromium profile timeout | `public-check-post-shimmer.log` | WSL Snap profile 更新超时 | 一次最小修复：改用本地 Playwright Chromium 重跑 | 是，Public 已通过 |
| 2026-08-24 05:26 CST | Step 11/12 NPC | readiness writer 找不到 canonical input | `npc-readiness-rerun.log` | `canonical-npc-apply.input.json` 不存在 | fail-closed，不伪造输入，保留 blocker | 否，父任务保持 blocked |
| 2026-08-24 05:49 CST | Task 7 stack smoke | 1 pass / 4 fail，backend 返回 HTTP 429 | `reports/local-start/smoke-20260824-054953.json` | 与 fast NPC runtime audit 并发，超过 120/min public-read 限流 | 等审计终态后仅重跑一次 | 是；05:57 fresh smoke 5/5 |
| 2026-08-24 05:53 CST | Task 7 NPC loot | 6 个 `count_parity_only` | `fresh-042509/npc-identity-regression-blocker.json` | relation/projection 是展开概率文本，local/API 是 Wiki modes 模板；旧 permit 已消费，fresh target 已漂移 | owning lane 最小 eligibility check 失败即阻断；不执行 DML | 否，等待 fresh NPC canonical input/operation |
| 2026-08-24 05:47 CST | Task 7 image lineage | 当时报告 3/7 ready，06:26 已因 Biome 假绿失效 | `fresh-042509/image-lineage-final.json` | Items/NPCs/Projectiles projection image ownership未就绪，Armor sets 缺 core/projection rows；当时未识别 Biome 旧 origin | 不再使用该结论；以下一行 2/7 新证据为准 | 否，父任务保持 blocked |
| 2026-08-24 06:03 CST | Task 8 Boss evidence | 当前数据/API pass，但 owner-05 无 terminal result artifact | `fresh-042509/closure-index.json` | 最终 changed-row counts 未被 immutable result 绑定 | 禁止重放；另走 result-reconciliation lane | 否，父任务保持 blocked |
| 2026-08-24 06:26 CST | Task 8 Biome evidence | 原 `47/47` 是假绿；修正审计后为 7/47 managed、40 条旧 `localhost:9000` origin | `fresh-042509/biome-managed-origin-regression-blocker.json` | readiness 默认值没有读当前 `19000` 配置，image-lineage 又无条件放行 Biome fallback | owning lane 一次 TDD 最小修复审计；数据保持阻断，需新精确 operation | 否，父任务保持 blocked |

操作者：`admin（用户授权，Codex 代录证据）`  填写时间：`2026-08-24 05:28 CST`  最终复核：`2026-08-24 06:26 CST by Codex`  备注：`Boss/Shimmer 当前数据通过，但两者都缺 exact changed-row closeout metadata；Task 7/8 复核后为 5 个 blocker group、10 个独立根原因，详见 fresh closure index。`
