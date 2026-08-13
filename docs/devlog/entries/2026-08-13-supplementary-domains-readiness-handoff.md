# Devlog: supplementary-domains-readiness 交接

## Status
`closed`

## Context

- 目标：将三个附加域（biomes / audio / shimmer）完成入库，前端适配，并为下一会话补全自动化路径留下交接记录。
- 分支：`feat/supplementary-domains-readiness`
- 工作区：`/home/lolben/TerraPedia`
- 关联记忆：`[[project_crawler-v2-scheduler-activation-review]]`、`[[project_entity-zh-backfill]]`

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

- `commit SHA pending in final response`
