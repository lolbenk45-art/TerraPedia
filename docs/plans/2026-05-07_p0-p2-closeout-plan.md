# P0-P2 收口计划

**日期**: 2026-05-07  
**状态**: 执行中（待 DB 可达/Flyway 迁移/迁移后复验 + P3 公开路由决策）  
**前置**: `docs/plans/2026-05-06_source-stability-traceability-execution-plan.md`（已归档，代码交付完成）

---

## 当前状态

P0-P2 全部 34 项代码交付物已合并到 `main`，经 5 轮 GPT 审查修正，验收脚本 `scripts/dev/acceptance-test.ps1` 边界到位。

**已完成（无需 DB，生产就绪）**：
- 脚本根路径解析（72 脚本迁移）
- Canonical 候选层（schema + 生成 + 审计，6134 候选）
- Crawler 源码迁移（68 测试通过）
- 新鲜度监控 workflow + Issue 去重
- B1 豁免合规审计

**代码交付完成/待真实 DB 验收**：
- 图片源追踪契约（5 实体统一）
- 记录世系追踪（wiki→public 全链路）
- 关系审计重解析（候选生成 + 人工 apply 边界）
- 跨库引用完整性审计（quick/full 双模式）
- 验收脚本 + 6 个自校验测试（23/23 pass）

**未完成（5 项）**：

| # | 任务 | 阻塞原因 |
|---|------|---------|
| 1a | DB 可达/现状 smoke（迁移前基线） | 需要 MySQL（terria_v1_maint / terria_v1_relation / terria_v1_local） |
| 2 | Flyway 迁移 / DB schema 变更 | 需要 MySQL schema 写权限 |
| 1b | 迁移后复验 | 依赖任务 2 完成 |
| 3a | P3 临时回退 publicRoute → null | 立即可执行，降低风险 |
| 3b | P3 最终公开路由决策 | 依赖任务 1b 全部通过 |

---

## 任务 1a：DB 可达/现状 Smoke（迁移前）

**目标**：在 Flyway 迁移前验证 DB 可达 + 当前 schema 下脚本可运行，作为迁移前基线。

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
- Buff 字段可正确读回
- `image-source-lineage-report.mjs --source=db` 报告显式暴露剩余 gap（buffs/projectiles/biomes 预计 `contractReady=false`，因缺 maint/relation lineage parity，见 `docs/contracts/image-source-contract.md:60`）
- 原有功能不受影响（schema 向后兼容）

---
## 任务 1b：迁移后复验

**目标**：Flyway 迁移完成后，重新运行受影响脚本确认 schema 变更未破坏现有功能。

**复验范围**：
- `scripts/dev/acceptance-test.ps1` Phase 2 全部 6 步（或至少受影响步骤）
- `image-source-lineage-report.mjs --source=db` 确认 Buff 新字段可读、gap 显式暴露
- 原有功能回归（Item/NPC 世系追踪不受影响）

**验收标准**：
- 复验步骤全部 PASS
- Buff 字段可读回且报告 gap 与 `docs/contracts/image-source-contract.md:60` 一致
- 无回归

---

## 任务 3：P3 公开路由决策

### 任务 3a：临时回退（立即可执行，降低风险）

- Items、NPCs 的 `publicRoute` 改回 `null`，同时 `publicExposure` 回退为 `planned-public`
- 仅禁用路由而保留 `publicExposure=public` 会使 A-grade gate 产生 route-missing warning；同时回退两者才能完整对齐旧计划"P0+P1 全部通过后才开放"的边界，gate 零 warning
- 不阻塞其他任务，与任务 1a/2/1b 并行
- 代码路由已就绪，回退仅改 registry 配置，等最终验收通过后恢复

### 任务 3b：最终公开决策（依赖任务 1b 全部通过）

**当前状态矛盾**：
- 旧计划要求 P0+P1 **全部通过**后才开放 P3 公开路由，且 `accepted-warning` 不得放行公开路由
- 当前 `domain-acceptance-registry.json` 已将 Items、NPCs 设为 `publicRoute`
- 但真实 DB 验收未完成、Flyway 迁移未执行、P1 的 DB 阶段验证状态为"未知"

**前置条件**：任务 1b 迁移后复验全部 PASS，`image-source-lineage-report.mjs --source=db` 显式暴露剩余 gap 与契约一致。

**两个选项**：

### 选项 A：迁移复验通过后恢复 publicRoute
- 任务 1b 全绿后，将 Items、NPCs 的 `publicRoute` 从 `null` 恢复为路由配置
- 补充验收证据（Phase 1+2 全绿 + 前端公开路由页面功能验证）
- **与旧计划边界一致**：P0+P1 全部通过后才开放

### 选项 B：保持 publicRoute = null，等待额外条件
- 即使迁移复验通过，也暂不开放公开路由
- 等待补充条件（如 buffs/projectiles/biomes 的 maint/relation lineage parity 补齐、全域 full 模式跨库审计）
- **更保守**，但延迟公开领域上线

---

## 任务执行顺序

```
任务 3a（临时回退 publicRoute → null，立即可执行，降低风险）
  ‖（并行，不阻塞）
任务 1a（DB 可达/现状 smoke）
  → 任务 2（Flyway 迁移，依赖 1a 确认 DB 可达 + schema 当前状态）
    → 任务 1b（迁移后复验，依赖 2 完成）
      → 任务 3b（最终公开决策，依赖 1b 全部通过）
```

---

## 不在本计划范围内

- P0.3 `.gitignore` 规则修正清单 — 纯文档活，独立处理
- 新功能开发 — 本计划仅收口
- 自动 apply / 自动刷新 — 需另立 RFC
- 管理端"世系追踪"页面 — 前端开发任务，独立评估
