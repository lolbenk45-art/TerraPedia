# P0-P2 交付物汇总 — 真实环境测试就绪

**日期**: 2026-05-07  
**分支**: `main`（截至 latest main）  
**状态**: 33 项交付物已合并到 main / 本文档 + acceptance-test.ps1 已提交；待真实环境验证

---

## 背景

4 月 06 日制定 P0-P3 执行计划，在 Phase B 稳定化框架下补齐 10 项数据来源稳定性与溯源的结构性缺口。33 项代码交付物已合并到 main；本文档和 acceptance-test.ps1 已提交。

---

## 已交付清单（34 项）

### P0.1 — 脚本根路径解析

| 文件 | 说明 |
|------|------|
| `scripts/data/lib/project-root.mjs` | 4 级回退：ENV → cwd 上溯 → git rev-parse → 相对路径 |
| `scripts/data/lib/project-root.test.mjs` | 单元测试 |
| `docs/audits/project-root-migration-checklist.md` | 72 个脚本迁移清单 |
| `scripts/dev/verify-local-stack.ps1` | 增加 WORKTREE_ROOT 检查 |

### P0.2 — Canonical Candidate 候选层

| 文件 | 说明 |
|------|------|
| `scripts/data/canonical/canonical-schema.mjs` + `.test.mjs` | 严格 schema 定义（canonical_version, content_hash 等） |
| `scripts/data/canonical/generate-canonical-candidates.mjs` + `.test.mjs` | 只读候选生成，输出到 reports/canonical/candidates/ |
| `scripts/data/canonical/audit-canonical-consistency.mjs` + `.test.mjs` | A0/A1 一致性审计 |

已验证：6134 条 Item 候选，coverageRate=1，hashMatchRate=1，零 schema 违规（历史运行结果，commit a290e99；待 acceptance-test 复验）。

### P0.3 — 生成数据流向锁定

| 文件 | 说明 |
|------|------|
| `docs/audits/generated-data-consumer-map.md` | data/generated/ 和 data/standardized/ 全部消费者标注 |
| `.gitignore` 规则修正清单 | 待补（2% 缺口） |

### P1.1 — 图片源追踪契约

| 文件 | 说明 |
|------|------|
| `docs/contracts/image-source-contract.md` | 统一 6 字段契约 |
| `scripts/data/audit/image-source-lineage-report.mjs` + `.test.mjs` | 跨 5 实体（Item/Buff/NPC/Projectile/Biome）图片溯源报告 |

### P1.2 — 全局记录世系查询

| 文件 | 说明 |
|------|------|
| `scripts/data/audit/record-lineage-trace.mjs` + `.test.mjs` | 输入 record_key → 输出 wiki→public 全链路 JSON（7 层） |

### P1.3 — 关系审计重解析

| 文件 | 说明 |
|------|------|
| `scripts/data/relation/generate-reresolve-candidates.mjs` + `.test.mjs` | 只读候选生成（exact + fuzzy 匹配） |
| `scripts/data/relation/apply-reresolve-results.mjs` + `.test.mjs` | 手动 apply，默认 dry-run，需 --apply + --confirmed-candidates |

### P1.4 — 跨库引用完整性审计

| 文件 | 说明 |
|------|------|
| `scripts/data/audit/cross-db-referential-integrity.mjs` + `.test.mjs` | quick (7 天抽样) / full (全域扫描) 双模式 |
| `scripts/dev/quality-gate.ps1` | 增加 -FullDataAudit 开关 |

### P1.5 — Crawler 源码迁移

| 文件 | 说明 |
|------|------|
| `scripts/data/crawler/src/` + `tests/` | 源码从 data/wiki-crawler/src/ 迁移，68 个测试通过 |
| `scripts/data/crawler/source-layout-check.mjs` | 文件放置规则检查（warning 级别） |
| `docs/plans/crawler-source-migration-plan.md` | 迁移方案文档 |

旧目录 `data/wiki-crawler/src/` 已删除。

### P2.1 — 数据新鲜度自动监控

| 文件 | 说明 |
|------|------|
| `.github/workflows/scheduled-staleness-monitor.yml` | 每 6h 运行，单一 workflow |
| `scripts/data/workflow/create-staleness-alert-issue.mjs` + `.test.mjs` | 生成 GitHub Issue 告警 |

### P2.2 — B1 豁免合规审计

| 文件 | 说明 |
|------|------|
| `scripts/data/audit/b1-exemption-compliance.mjs` + `.test.mjs` | 4 个支持域合规检查 |

### 边界加固

| 文件 | 说明 |
|------|------|
| `scripts/data/workflow/domain-acceptance-registry.json` | Item/NPC publicRoute 已设置，其余为 null |
| `scripts/dev/quality-gate-ci.ps1` | CI-safe gate 范围明确 |
| `scripts/dev/quality-gate.test.mjs` | 门禁自校验 |

---

## 新增测试脚本

`scripts/dev/acceptance-test.ps1` — 最多 19 步真实环境验收测试：

- **Phase 1 (13 步，无需 DB)**：B1 合规 (4域) → 新鲜度审计 → 刷新计划 → 过期告警 → Crawler 布局 → Canonical 候选 → Canonical 一致性 → 审计→计划→告警链路 (3 步)
- **Phase 2 (6 步，需 DB)**：世系追踪 (item+npc) → 图片溯源 → 跨库完整性 → 重解析候选 → 重解析 dry-run

无 DB 写入、无 --apply（DB 阶段传入 --write-report=true 为只读查询报告；链路文件为本地 artifact）。DB 不可用且未传 -AllowDbSkip 时 Phase 2 步骤 FAIL（exit 1）；传 -AllowDbSkip 则 SKIP。

---

## 待验证项（需要真实 DB）

| 项目 | 依赖 | 验证方式 |
|------|------|---------|
| `record-lineage-trace.mjs` | maint + relation + local 三库联通 | `--entity=item --internal-name=Wood` |
| `image-source-lineage-report.mjs` | local + maint + relation | `--source=db` |
| `cross-db-referential-integrity.mjs` | 同上 | `--mode=quick` |
| `generate-reresolve-candidates.mjs` | relation DB + 有 unresolved 审计行 | 对比前次报告 delta |
| `apply-reresolve-results.mjs` | 同上 | 不带 --apply 确认 dry-run |
| Flyway 迁移（Buff 表 / canonical_version） | MySQL schema 写权限 | 下一个可用版本号 |

---

## 未完成项

| 项目 | 原因 |
|------|------|
| P0.3 `.gitignore` 规则修正清单 | 纯文档活，无环境依赖，可随时补 |
| **P3 公开路由上线** | 依赖 P1 全部验证通过 + 前端联调，已延迟 |
| Flyway 迁移执行 | 需要 MySQL 连接 |

---

## 关键边界（GPT 审查重点）

1. **无自动 apply** — 所有脚本默认 dry-run，写操作需显式 `--apply`。P2 scheduled-staleness-monitor workflow 为只读查询，但会在阻断时通过 `gh issue create` 创建 GitHub Issue（外部写入副作用）。
2. **CI-safe vs local gate** — CI 不连 DB、不跑完整 mvn test、不执行 --fail-on-warning
3. **accepted-warning 不放行公开路由** — 仅 readiness-only 可用
4. **active-writer 互斥** — apply-reresolve 调用前需检查
5. **SQL 注入防护** — record-lineage-trace 使用 quoteIdentifier() 校验所有表名/库名
