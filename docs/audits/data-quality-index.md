# Data Quality Index

本文件索引长期有效的数据质量、关系健康和图片资产治理入口。运行日志和一次性输出仍放在 `reports/`。

## 当前长期入口

| 类型 | 路径 | 用途 |
| --- | --- | --- |
| 项目稳固主计划 | `docs/plans/2026-05-02_project-stabilization-long-plan_项目稳固长期计划.md` | Phase B 到 Phase C 的执行入口 |
| A/B 数据维护链计划 | `docs/plans/2026-05-03_ab-trusted-data-maintenance-chain-plan.md` | A/B 档可信数据源自动维护整链入口 |
| Canonical 迁移边界 | `docs/audits/canonical-migration-boundary.md` | A/B/X 数据源准入、过渡豁免和禁止规则 |
| 图片资产策略 | `docs/audits/image-asset-pipeline-policy.md` | source/cache/fallback 准入规则 |
| 图片资产状态 | `docs/audits/image-asset-readiness.md` | 当前图片资产稳定性索引 |

## 当前参考报告

| 报告 | 用途 |
| --- | --- |
| `reports/relation/relation-health-2026-04-30.md` | relation blocking/warning 概览 |
| `reports/relation/relation-audit-2026-05-01.md` | relation 规模和 unresolved samples |
| `reports/item-groups/any-item-group-source-audit-2026-05-01.md` | Any Item Group duplicate/blocked/source-backed 状态 |
| `reports/data/npc-buff-relations-backfill-2026-05-01.json` | NPC-Buff relation 回填摘要 |
| `reports/实体数据完整性审计_2026-04-22.json` | 多实体数据完整性基线 |

## 更新规则

- 长期可复用结论进入 `docs/audits/`。
- 一次性运行产物留在 `reports/`。
- 新公开实体页面排期前，必须检查 relation health、source group audit、image asset readiness。
