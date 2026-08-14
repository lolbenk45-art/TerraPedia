# Devlog: supplementary-domains-readiness 交接

## Status
`active`

## Context

- 目标：将三个附加域（biomes / audio / shimmer）完成入库，前端适配，并为下一会话补全自动化路径留下交接记录。
- 分支：`feat/supplementary-domains-readiness`
- 工作区：`/home/lolben/TerraPedia`
- 关联记忆：`[[project_crawler-v2-scheduler-activation-review]]`、`[[project_entity-zh-backfill]]`
- 续作设计：`docs/superpowers/specs/2026-08-14-supplementary-domains-l1-automation-design.md`
- 续作计划：`docs/superpowers/plans/2026-08-14-supplementary-domains-l1-automation.md`
- 已确认边界：Shimmer、Audio、Bosses 采用 `L1/ACTIVE`；每次正式 apply 仍需 Owner 单次批准；不包含 L2 和 Boss loot。

---

## 已完成工作（本 session 2026-08-13）

### biomes
- 手动入库：`run-biome-sync-pipeline.mjs --apply=true TERRAPEDIA_DB_PORT=13306`
- 报告：`reports/biome-db-import-2026-08-13.json`（biomes=48, itemBiomes=364）
- 自动化：`crawler_automation_policy` L2 ACTIVE，最近2次 AUTHORIZED_L1 COMPLETED（2026-08-05）
- ✅ 手动 + 自动 均已就位

### audio
- 手动入库：`import-wiki-audio-assets-to-db.mjs --apply=true TERRAPEDIA_DB_PORT=13306`
- 报告：`reports/audio-db-import-apply-2026-08-13.json`（428 assets，DB: `audio_assets=428`）
- 自动化：❌ 无 automation policy、无 scheduler eligible op
- ⚠️ 仅手动；auto 路径是下一步开口工作

### shimmer（规范授权链全流程）
- canonical-shimmer-generation：提取6 shards，generationId `f50a05d7b12082f623edca3f6fd8a438cbf6b5ec49652720dd59421a9c618900`
- canonical-shimmer-import：三数据库提交协议，4张表写入完成
  - `shimmer_item_transforms` = 279
  - `shimmer_decraft_rules` = 248
  - `shimmer_entity_transforms` = 121
  - `shimmer_npc_transforms` = 29
- 授权记录：`reports/authorization/canonical/used-decisions.json`（2条）
- 结果：`reports/authorization/canonical/canonical-shimmer-import.result.json`（status: completed）
- 自动化：❌ scheduler activation proposal（2026-08-11）早于 shimmer 注册时间，`domain-source-shimmer` 未进入 eligible ops 列表
- ⚠️ 仅手动（canonical 授权链）；auto 路径是下一步开口工作

---

## 本次提交变更

| 文件 | 原因 |
|---|---|
| `scripts/dev/start-local-stack.sh` | 追加 `--skip-front` 至 `verify-local-stack.sh` 调用；WSL2 下 snap Chromium 无法挂载 namespace，`check:user-article-editor-runtime` 崩溃 |
| `data/standardized/armor_sets.standardized.json` | 2026-08-13 domain readiness audit 期间时间戳刷新（内容无实质变化） |

---

## 开口工作（下一会话续做）

### G1 — shimmer 自动路径（用户明确要求"手动和自动都要存在"）

**现状**：`domain-source-shimmer` 已在 crawler monitor action registry 注册（commit `9aa13235`），但 scheduler eligible ops 列表是在 2026-08-11T11:48:53 的 preflight 里固化的，shimmer 不在其中。

**补全步骤**：
1. 重新跑 preflight（`build-canonical-crawler-v2-scheduler-activation-proposal.mjs`），确认 shimmer 现在出现在 `eligibleDomains`
2. 若 preflight OK → 走新一轮 `--mode=request` → `--mode=authorize` → `run-authorized-canonical-operation.mjs` 的 scheduler re-activation 链
3. 在 `crawler_automation_policy` 中确认 shimmer 行（参考 biomes 的 L0→L1→L2 promotion 路径）

**阻塞判断**：在 scheduler 当前已永久启用（2026-08-12T01:52Z, commit `340d196c`）的前提下，re-activation 是否只需更新 eligible ops 配置，还是需要完整重走 canonical 授权链 — 需要检查 `crawler-v2-scheduler-activation-preflight.mjs` 是否有 diff-only 模式。

### G2 — audio 自动路径

**现状**：audio 仅有手动 import 脚本，无 scheduler op，无 automation policy。

**补全步骤**：
1. 决策：audio 是否需要 scheduler changed-only 自动派发（同 biomes L1-level automation？还是仅维持手动）
2. 若需要：在 crawler monitor action registry 增加 audio 的 auto-eligible op，走 scheduler re-activation

### G3 — bosses 无 scheduler coverage（可选）

bosses 在 preflight eligible 列表中（join OK），但不在 `isAutoEligibleRule` 的5域集合里，scheduler 不会自动派发。如需补，需修改 `CrawlerMonitorServiceImpl.isAutoEligibleRule()` 并重走 scheduler 认证流程。

---

## 下一会话起点

1. 读本文件 + `[[project_crawler-v2-scheduler-activation-review]]`
2. 启动 stack：`bash scripts/dev/start-local-stack.sh`（WSL2 下已加 `--skip-front`，无需额外参数）
   - 默认端口（`scripts/dev/config/local-stack.config.json`）：redis=16380, back=18188, front=15174, admin=13001, DB=13306
3. 检查 scheduler 当前 eligible ops 是否包含 shimmer：`GET http://localhost:18188/admin/crawler-monitor/v2/automation/preflight`
4. 决策：G1/G2 需要走新 canonical 授权还是仅配置变更
5. 所有脚本需要 DB 端口时用 `TERRAPEDIA_DB_PORT=13306`（config 已是 13306，但命令行运行脚本时须显式传入）

## Validation

- DB 行数核实：audio_assets=428, shimmer_item_transforms=279, biomes=48 ✅
- 三附加域 API 可达（stack 运行中）：`GET /public/shimmer/context`, `/public/audio`, `/public/biomes` ✅
- `used-decisions.json` 双条目写入完整 ✅

## Commits

- 原交接提交：`5aee5cd1`
- 端口修正提交：`ae74ae76`
- L1 自动化设计提交：`6b8d3083`

## 2026-08-14 续作基线

- 当前 `AUTO_DISPATCH_DOMAINS` 仍只有 items、npcs、projectiles、armor_sets、buffs 五域。
- Shimmer、Audio、Bosses 当前默认 action 仍止于 source/generation 工作，尚未生成受治理的 L1 frozen bundle。
- eligibility 与安全 preview command 必须在同一检查点落地，避免 scheduler 派发 source-only 假自动入库。
- 开始实施时工作区除本计划文件外干净，未发现占用三个目标 progress/output family 的 crawler/import writer。
- See git for code-level diff details.

## 2026-08-14 Task 6 调度预览接线

- Shimmer、Audio、Bosses 的 changed-only 默认 action 已统一指向 governed L1 preview orchestrator；Boss resume 参数继续透传。
- V2 attempt 启动环境携带 queue `requestedBy`，Shimmer 仅在完整 `v2-automation` attempt identity 下允许 scheduler-owned generation；手动运行仍需原 canonical generation authorization。
- `AUTO_DISPATCH_DOMAINS` 精确扩展为原五域加 Shimmer、Audio、Bosses；未加入 Boss loot、NPC loot 或任何 apply action。
- 解除验证阻塞的最小修复：report archiver 忽略原子写 `.tmp` 在惰性目录遍历期间消失产生的 `UncheckedIOException`。
- 验证：Task 6 后端聚焦集 351/351，scheduler/preflight/Shimmer Node 集 28/28，preview/Shimmer 集 15/15；`git diff --check` 通过。
- 正式运行顺序更正为 L0 bootstrap → L1/ACTIVE promotion → governed preview → 单次 Owner-approved apply；正式 DB apply、scheduler re-activation 与最终数据核验仍未执行。
- 正式运行预检发现共享 bootstrap CLI 仍仅接受 Biomes，尽管 catalog/manifest 已注册三个新 L0 operation；已用精确 operation→domain allowlist 补齐 Audio、Bosses、Shimmer，保留 Biomes 兼容，治理回归 115/115 通过。该修复必须先提交，随后生成的 canonical packet 才能绑定稳定代码哈希。
- 三域 L0 bootstrap 与 L1/ACTIVE promotion 已分别通过 canonical request→Owner authorize→runner 执行，Owner 为数据库现有 ACTIVE `admin`；六个 decision identity 均已单次消费。Audio 首次真实 preview 在候选枚举后因 crawler 默认 12 条 cap 安全失败，未写数据库；preview command 现显式使用既有 full-corpus opt-in 与 bounded 600 条 cap，preview/crawler 回归 27/27 通过，等待代码 checkpoint 后重跑。
- Audio real preview 已完成（200 bounded candidates，0 failed，全部复用既有哈希文件）；Bosses real preview 已完成（33 bosses、4 groups、0 unresolved）。Shimmer direct crawl 正确拒绝缺失 canonical generation authorization；首次 L1 bootstrap 改为显式复用 2026-08-13 已授权 generation，并仍通过 current pointer/manifest/input-contract proposal verifier，scheduler changed-only 默认联网路径不变；相关回归 17/17 通过。
- Shimmer verified-generation 复用首次运行暴露已有 canonical proposal 的 no-overwrite 冲突；修复后的复用分支不再抓取或重写 proposal，而是读取私有 current pointer、input contract 与 proposal，并要求 generation ID、manifest path/hash、data bundle hash 及 proposal input contract 精确一致。正常 scheduler 新抓取路径仍生成新 proposal。RED 测试先稳定复现写入冲突，GREEN 回归 `prepare-supplementary-domain-l1-preview` + Shimmer extraction pipeline 17/17 通过；首次 Shimmer L1 preview 与三域 Owner apply 尚未执行。
- Shimmer first-L1 首次 Owner apply 在 dispatch 后、DML 前因 frozen source 副本路径不满足 canonical input-contract 固定路径而回滚；decision identity `automation-shimmer-first-l1-20260814-01` 已单次消费，run/apply 行均为 0，四张 Shimmer 表仍为 279/248/121/29。根因修复保留固定 canonical 路径限制：先要求 frozen source 内容与私有 canonical contract 精确一致，再由原 verifier 从 canonical 路径解析 generation。RED/GREEN 后 supplementary runner、Shimmer importer 与 preview 回归 58/58 通过；等待代码 checkpoint 后生成 retry-02，Audio/Bosses apply 尚未执行。
- See git for code-level diff details.
