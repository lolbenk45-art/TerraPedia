# P0-P2 收口计划

**日期**: 2026-05-07  
**状态**: 执行中（仅剩真实环境验证与 P3 公开路由决策）  
**前置**: `docs/plans/2026-05-06_source-stability-traceability-execution-plan.md`（已归档，代码交付完成）

---

## 当前状态

P0-P2 全部 34 项代码交付物已合并到 `main`，经 5 轮 GPT 审查修正，验收脚本 `scripts/dev/acceptance-test.ps1` 边界到位。

**已完成**：
- 脚本根路径解析（72 脚本迁移）
- Canonical 候选层（schema + 生成 + 审计，6134 候选）
- 图片源追踪契约（5 实体统一）
- 记录世系追踪（wiki→public 全链路）
- 关系审计重解析（候选生成 + 人工 apply 边界）
- 跨库引用完整性审计（quick/full 双模式）
- Crawler 源码迁移（68 测试通过）
- 新鲜度监控 workflow + Issue 去重
- B1 豁免合规审计
- 验收脚本 + 6 个自校验测试（23/23 pass）

**未完成（3 项）**：

| # | 任务 | 阻塞原因 |
|---|------|---------|
| 1 | 真实 DB 环境验收 | 需要 MySQL（terria_v1_maint / terria_v1_relation / terria_v1_local） |
| 2 | Flyway 迁移 / DB schema 变更 | 需要 MySQL schema 写权限 |
| 3 | P3 公开路由决策 | 见下文 |

---

## 任务 1：真实 DB 环境验收

**目标**：在有真实数据的 MySQL 环境运行 `scripts/dev/acceptance-test.ps1`，Phase 2 全部 6 步通过。

**Phase 2 步骤**：
| 步骤 | 脚本 | 验证内容 |
|------|------|---------|
| lineage-trace-item | `record-lineage-trace.mjs` | `--entity=item --internal-name=Wood` 三库联通查询 |
| lineage-trace-npc | `record-lineage-trace.mjs` | `--entity=npc --internal-name=Guide` 三库联通查询 |
| image-source-lineage | `image-source-lineage-report.mjs` | `--source=db` 跨 5 实体图片溯源 |
| cross-db-integrity | `cross-db-referential-integrity.mjs` | `--mode=quick` 跨库引用完整性 |
| reresolve-candidates | `generate-reresolve-candidates.mjs` | 关系审计候选生成 + 趋势对比 |
| reresolve-dry-run | `apply-reresolve-results.mjs` | 不带 --apply 确认 dry-run 行为 |

**运行命令**：
```powershell
powershell -File scripts/dev/acceptance-test.ps1
```

**验收标准**：
- 全部 6 步 PASS（非 SKIP，非 FAIL）
- 无 blocked 状态
- `reresolve-dry-run` 确认 `apply: false`、无 UPDATE 执行
- 跨库完整性 `mode=quick` 在 3 分钟内完成

**如果 DB 不可用**：
```powershell
powershell -File scripts/dev/acceptance-test.ps1 -SkipDb
```
仅验证 Phase 1（13 步），Phase 2 延后。

---

## 任务 2：Flyway 迁移 / DB Schema 变更

**涉及表**：
| 表 | 变更 | 数据库 |
|------|------|--------|
| `buffs` | 补齐 `image_provider`、`image_source_page`、`image_source_file_title` 等字段 | `terria_v1_local` |
| `maint_items` | 增加 `canonical_version` 字段 | `terria_v1_maint` |
| `maint_npcs` | 增加 `canonical_version` 字段 | `terria_v1_maint` |

**硬边界**：
- 使用下一个可用 Flyway 版本号（不固定版本号）
- 迁移前确认 active-writer 互斥（无其他 DB apply 并行）
- 提供备份/回滚方案
- Flyway 迁移不进入 CI-safe gate、不进入 GitHub Actions schedule

**验收标准**：
- Flyway migrate 成功执行
- 新字段可正确读回
- Buff 表补齐字段后 `image-source-lineage-report.mjs --source=db` 产出 5 实体完整报告
- 原有功能不受影响（schema 向后兼容）

---

## 任务 3：P3 公开路由决策

**当前状态矛盾**：
- 旧计划要求 P0+P1 **全部通过**后才开放 P3 公开路由，且 `accepted-warning` 不得放行公开路由
- 当前 `domain-acceptance-registry.json` 已将 Items、NPCs 设为 `publicRoute`
- 但真实 DB 验收未完成、Flyway 迁移未执行、P1 的 DB 阶段验证状态为"未知"

**两个选项**：

### 选项 A：回退 publicRoute 为 null
- Items、NPCs 的 `publicRoute` 改回 `null`
- 等待任务 1+2 完成后重新评估
- **风险最低**，与旧计划边界一致

### 选项 B：保留 publicRoute + 补例外批准
- 保留 Items/NPCs 的 `publicRoute`
- 补书面例外批准记录（为什么在 DB 验收未完成时提前开放）
- 补验收证据（至少 Phase 1 全绿 + 前端公开路由页面功能验证）
- **有风险**：DB 层数据完整性问题可能在公开后暴露

**建议**：选项 A。Items/NPCs 的代码路由已就绪，回退的是 registry 中的一行配置，等 DB 验收通过后改回来只需改回一个字段。

---

## 任务执行顺序

```
任务 1（DB 验收）
  → 任务 2（Flyway 迁移，依赖 1 确认 DB 可达 + schema 当前状态）
    → 任务 3（P3 公开路由决策，依赖 1+2 全部通过）
```

任务 3 的选项 A（回退）可与其他任务并行，不阻塞。

---

## 不在本计划范围内

- P0.3 `.gitignore` 规则修正清单 — 纯文档活，独立处理
- 新功能开发 — 本计划仅收口
- 自动 apply / 自动刷新 — 需另立 RFC
- 管理端"世系追踪"页面 — 前端开发任务，独立评估
