# P0-P2 收口计划 — 执行结果

**日期**: 2026-05-07  
**状态**: 已执行（1a/2/1b/3a 完成，3b 选择 B，P3 保持关闭）  
**前置**: `docs/plans/2026-05-06_source-stability-traceability-execution-plan.md`（已归档，代码交付完成）

---

## 执行结果

P0-P2 全部 34 项代码交付物已合并到 `main`，验收脚本 `scripts/dev/acceptance-test.ps1` 经 5 轮 GPT 审查边界到位。

| # | 任务 | 结果 |
|---|------|------|
| 1a | DB 可达/现状 smoke | 19/19 pass（`acceptance-test.ps1`） |
| 2 | Flyway 迁移 | V42 执行成功（`V42__add_p1_traceability_schema_fields.sql`）：buffs 补齐 image_source 字段（`terria_v1_local`），maint_items/maint_npcs 增加 canonical_version（`terria_v1_maint`） |
| 1b | 迁移后复验 | 19/19 pass |
| 3a | P3 临时回退 | Items/NPCs → `planned-public` + `publicRoute=null` |
| 3b | P3 公开路由决策 | **选择 B**：保持关闭。A-grade gate 45 evidence fresh 但全部 6 产品域产生 `plannedRouteMissing` warning，Domain Acceptance 正式 evidence 缺失 |

**P3 未开放的当前阻塞条件**：
- 6 产品域 evidence 虽已生成（45/45 fresh），但 A-grade gate `public.plannedRouteMissing` warning 未消除
- 直接恢复 `publicExposure=public` + `publicRoute` 后需跑 `--fail-on-warning=true` 强门禁通过
- Buffs/Projectiles image lineage `contractReady=false`，Bosses 缺 projection 层

**不在本计划范围内**：
- P0.3 `.gitignore` 规则修正清单
- 自动 apply / 自动刷新 RFC
- 管理端"世系追踪"页面
- Buffs/Projectiles/Bosses/ArmorSets 图片溯源 parity 补齐

---

## 执行分支

`feature/p0-p2-closeout-execution`（worktree `G:\ClaudeCode\TerraPedia-dev-closeout`），已合并到 `main`。
