# Dual-Path Domain Ingestion Acceptance Review Plan / 双路径域入库验收评审方案

**Date / 日期:** 2026-08-15
**Status / 状态:** draft for owner review / 待 Owner 评审
**Target / 目标环境:** WSL local only, `terria_v1_local` / 仅 WSL 本地环境
**Branch / 分支:** `feat/supplementary-domains-readiness`

## 1. Goal / 目标

验证剩余八个 changed-only 域同时具备可控的手动入口和自动入口，并证明自动写库只在当前 canonical automation activation 已授权、V2 scheduler 已启用且 preflight 通过时发生。

Validate that the eight changed-only domains have both controlled manual and automatic entry paths, and prove that automatic database writes occur only while the current canonical automation activation is authorized, the V2 scheduler is enabled, and its preflight passes.

本轮取消每次 apply 的独立 Owner 批准。自动化 activation authorization 成为自动写库总闸门；它未启用、过期、identity 不匹配或 preflight 不合格时，自动链必须在写库前 fail closed。手动链仍要求显式域、显式 `apply` 和本地数据库保护。

This acceptance removes per-apply Owner approval. The automation activation authorization becomes the global gate for automatic writes. A disabled, stale, identity-mismatched, or ineligible activation must fail closed before database mutation. The manual path still requires an explicit domain, explicit apply intent, and the local-database guard.

## 2. Approved Decisions / 已批准决策

- Only WSL processes and the configured local MySQL at `127.0.0.1:13306` may be used. Windows services and databases are excluded.
- 只使用 WSL 进程及 `127.0.0.1:13306` 的本地 MySQL；禁止使用 Windows 服务或数据库。
- The user authorizes enabling and starting the local automation gate for this acceptance run.
- 用户已授权本轮启用并启动本地自动化总闸门。
- Per-run automatic apply authorization is removed; canonical scheduler activation remains mandatory.
- 自动 apply 不再逐次申请授权，但 canonical scheduler activation 仍是强制前提。
- `boss_loot`, `npc_loot`, L2 promotion, production databases, Redis reset, and unrelated data repair remain out of scope.
- `boss_loot`、`npc_loot`、L2 晋级、生产数据库、Redis reset 和无关数据修复均不在范围内。

## 3. Domain Matrix / 域矩阵

| Domain / 域 | Local size / 本地数量 | Source mode / 来源方式 | Manual DB / 手动写库 | Automatic DB / 自动写库 |
| --- | ---: | --- | --- | --- |
| Items | 6131 | Local standardized data + real probe / 本地标准化数据 + 真实探针 | Dry-run only / 仅 dry-run | Gate, dispatch, dedupe, dry-run only / 仅验证门禁、派发、去重和 dry-run |
| Projectiles | 1111 | Local standardized data + real probe / 本地标准化数据 + 真实探针 | Dry-run only / 仅 dry-run | Gate, dispatch, dedupe, dry-run only / 仅验证门禁、派发、去重和 dry-run |
| NPCs | 762 | Real bounded source refresh / 真实受限来源刷新 | Real local transaction / 真实本地事务 | Real local transaction / 真实本地事务 |
| Buffs | 388 | Real resumable crawl / 真实可恢复抓取 | Real local transaction / 真实本地事务 | Real local transaction / 真实本地事务 |
| Armor Sets | 63 | Real single-module refresh / 真实单模块刷新 | Real local transaction / 真实本地事务 | Real local transaction / 真实本地事务 |
| Bosses | 33 | Real bounded resumable crawl / 真实受限可恢复抓取 | Real local transaction / 真实本地事务 | Real local transaction / 真实本地事务 |
| Audio | <=600 | Real complete four-prefix catalog and downloads / 真实四前缀完整目录与下载 | Real local transaction / 真实本地事务 | Real local transaction / 真实本地事务 |
| Shimmer | bounded / 受限 | Real generation extraction / 真实 generation 提取 | Real local transaction / 真实本地事务 | Real local transaction / 真实本地事务 |

Items and Projectiles must not perform a full network crawl or commit database changes in this acceptance. Their automatic tests consume existing local standardized inputs plus the real source probe and must stop at an importer dry-run.

Items 与 Projectiles 不得在本轮执行全量网络抓取或提交数据库变更；自动测试使用既有本地标准化输入和真实 source probe，并停在 importer dry-run。

## 4. Chosen Architecture / 选定架构

```text
canonical automation activation
  -> enabled + current identity + eligible preflight
  -> real source probe
  -> changed-only + active-attempt dedupe
  -> monitor-visible L1 source/preview action
  -> stable pre/post fingerprint + readable frozen output
  -> domain validation and owned-table fence
  -> local transaction apply or governed dry-run
  -> DB counts, sample verification, audit/result evidence
  -> source acknowledgement
```

Manual and automatic paths must call the same domain importer and validation contract. The trigger differs; table ownership, transaction handling, input hashes, progress, result evidence, and failure behavior do not.

手动和自动路径必须复用同一 domain importer 与校验合同。两者仅触发方式不同；表归属、事务、输入哈希、进度、结果证据和失败行为必须一致。

The manual pass uses a frozen real source bundle and an explicit local apply command. It does not manufacture an upstream hash. The automatic pass consumes the real outstanding source fingerprint through the scheduler. If the manual pass already made the database current, the automatic apply may be an idempotent zero-change transaction, but it must still prove the real gate, transaction, audit, progress, and acknowledgement path.

手动阶段使用冻结的真实来源 bundle 和显式本地 apply，不伪造上游哈希。自动阶段由 scheduler 消费真实待处理 fingerprint。若手动阶段已使数据库最新，自动 apply 可以是幂等零变更事务，但仍必须真实验证总闸门、事务、审计、进度和 acknowledgement。

## 5. Activation And Authorization Contract / 启用与授权合同

Automatic database apply is allowed only when every condition is true:

自动写库仅在以下条件全部成立时允许：

1. The canonical scheduler activation request/packet/result is current and matches the exact eight-domain eligible set.
2. V2 automation is enabled in `changed-only` mode.
3. The activation preflight reports every required domain eligible and no unexpected domain eligible.
4. The source probe succeeds and reports a stable changed fingerprint.
5. No live attempt owns the domain or its output/progress family.
6. The L1 action completes successfully and the pre/post fingerprints match.
7. The frozen bundle, owned-table list, baseline, and target database identity validate.

1. canonical scheduler activation 的 request/packet/result 当前有效，并精确绑定八域集合。
2. V2 automation 以 `changed-only` 模式启用。
3. activation preflight 中所有目标域合格，且没有意外域被纳入。
4. source probe 成功并返回稳定的 changed fingerprint。
5. 没有 live attempt 占用该域或同一输出/进度族。
6. L1 action 成功结束，且前后 fingerprint 一致。
7. frozen bundle、owned-table、baseline 和目标数据库 identity 全部通过校验。

Any failed condition blocks automatic apply before the first database mutation. Manual apply does not require the scheduler to be enabled, but it must retain the explicit local-only and transaction safeguards.

任一条件失败都必须在首次数据库 mutation 前阻断自动 apply。手动 apply 不要求 scheduler 启用，但必须保留显式 local-only 与事务保护。

## 6. Execution Order / 执行顺序

The executable plan must serialize all work in this order:

执行计划必须按以下顺序串行：

1. Baseline: active writers, ports, canonical authorization identity, source manifest hash, Git status, and pre-write DB counts.
2. Local-only lanes: Items, then Projectiles; manual dry-run followed by automatic-gate dry-run.
3. Small real lanes: Armor Sets, Bosses, Shimmer, Buffs, NPCs, then Audio.
4. For each real lane: probe and freeze -> manual transaction -> verification -> automatic activation path -> verification -> unchanged/no-duplicate observation.
5. Final cross-domain audit, stack state, generated-artifact inventory, and devlog closeout.

1. 基线：active writers、端口、canonical authorization identity、source manifest hash、Git 状态和写前 DB 计数。
2. 本地数据链：Items 后 Projectiles；先手动 dry-run，再自动门禁 dry-run。
3. 小体量真实链：Armor Sets、Bosses、Shimmer、Buffs、NPCs，最后 Audio。
4. 每个真实域：probe/freeze -> 手动事务 -> 核验 -> 自动 activation 链 -> 核验 -> unchanged/无重复观察。
5. 最终跨域审计、服务状态、生成 artifact 清单和 devlog 收尾。

Audio runs last because it has the largest bounded network and filesystem surface. No two crawler or database writers run concurrently.

Audio 因网络与文件写入面最大而最后执行。任何两个 crawler 或数据库 writer 不得并行。

## 7. Per-Domain Acceptance / 单域验收标准

Each real-write domain must produce all of the following evidence:

每个真实写库域必须产生以下证据：

- pre-write and post-write row counts for owned tables;
- owned-table and database identity confirmation;
- source fingerprint and frozen input hash;
- terminal monitor-visible progress with action and attempt IDs;
- manual transaction result and automatic transaction result;
- representative row samples checked against the frozen input;
- idempotent repeat result or a documented, source-backed delta;
- no mutation in unrelated tables;
- source acknowledgement only after stable success.

Items and Projectiles replace row mutation evidence with importer dry-run summaries, real probe identity, dispatch/dedupe evidence, and proof that database counts remain unchanged.

Items 与 Projectiles 以 importer dry-run 摘要、真实 probe identity、派发/去重证据以及数据库计数不变证明替代写库证据。

## 8. Infinite-Run And Failure Fences / 无限运行与失败保护

- Same completed source fingerprint is not dispatched again.
- A live V2 attempt is never duplicated.
- Resumable crawler failure retries at most three times, then pauses for human review.
- Automatic database apply does not retry after a partial or ambiguous write; transaction rollback and a blocked result are required.
- Audio fails before download or manifest output on file 601, unfinished pagination, or more than 100 pages per prefix.
- Probe failure, pre/post drift, unreadable frozen output, stale activation, target DB mismatch, or owned-table drift prevents acknowledgement and apply.
- After each domain, a second changed-only observation must create zero new attempt for the acknowledged fingerprint.

- 相同已完成 source fingerprint 不再次派发。
- live V2 attempt 不重复创建。
- 可恢复 crawler 失败最多重试三次，之后暂停人工审查。
- 自动数据库 apply 遇到部分或不明确写入不得自动重试，必须事务回滚并记录 blocked 结果。
- Audio 在第 601 个文件、分页未完成或单前缀超过 100 页时，必须在下载和 manifest 输出前失败。
- probe 失败、前后漂移、冻结输出不可读、activation 过期、目标库不匹配或 owned-table 漂移均阻止 acknowledgement 和 apply。
- 每个域完成后再次 changed-only 观察，同一已确认 fingerprint 必须产生零新 attempt。

## 9. Approaches Considered / 方案比较

**Chosen / 采用：Activation-gated shared importer.** One canonical automation authorization gates all automatic applies, while manual and automatic triggers share the same importer and transaction contract. This gives the strongest equivalence and the clearest fail-closed boundary.

**Rejected / 拒绝：Per-run Owner approval.** It is safer but contradicts the approved requirement to remove per-apply authorization.

**Rejected / 拒绝：Unconditional automatic apply.** It is simpler but allows writes while automation is disabled or activation identity is stale.

**Rejected / 拒绝：Fixture-only acceptance.** It cannot prove network source, transaction, audit, and real local database behavior for the small domains.

## 10. Deliverables / 交付物

After this review plan is approved, create a separate bilingual executable plan under `docs/superpowers/plans/`. It must name exact commands, progress/output/report paths, database tables and count queries, authorization/preflight checks, per-domain stop conditions, rollback actions, and focused validation commands.

本 Review Plan 批准后，在 `docs/superpowers/plans/` 下创建独立的双语可执行计划。计划必须列出准确命令、进度/输出/report 路径、数据库表与计数查询、authorization/preflight 检查、逐域停止条件、回滚动作和集中验证命令。

No crawler, scheduler mutation, or database write is authorized merely by committing this review document. Execution begins only after the written review and executable plan are approved.

提交本 Review Plan 本身不等于授权运行 crawler、scheduler mutation 或数据库写入；必须先完成书面评审并批准可执行计划，之后才开始执行。
