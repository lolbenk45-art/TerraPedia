# 数据来源稳定性与溯源执行计划

**日期**: 2026-05-06  
**状态**: 执行中  
**依赖**: Phase B 稳定化计划 (2026-05-05)  
**优先原则**: 先保证来源稳定性 → 再强化溯源能力 → 最后推进公开域名

---

## 背景

基于项目全面审计，当前 Phase B 稳定化聚焦于 Domain Acceptance（领域验收）功能建设。但在推进公开域名之前，存在 **10 项数据来源稳定性与溯源的结构性缺口**需要优先解决。

### 现状诊断

**已有能力（强项）**:
- 7 层数据管线已建成，每层都有 SHA-256 哈希 + 双时态追踪 + 来源修订时间戳
- Landing → Maint → Relation → Local 逐层 FK 链条完整
- 每层保留 `payload_json`/`raw_json` 完整原始载荷
- 9 个领域已配置 Domain Acceptance 门禁
- CI 质量门禁和本地完整门禁均已到位

**结构性缺口**:
1. **`data/canonical/` 基本为空** — A0 可信输入层只存在目标结构，没有已审计数据
2. **无全局记录 UUID** — 各层使用各自 ID，无法单次查询追踪一条记录从 wiki 到公开页面
3. **跨数据库无引用完整性** — Landing/Maint/Relation 跨库链路仅靠约定和应用代码维护
4. **B1 豁免审计命令手动执行** — 没有自动化强制豁免源按期限迁移
5. **关系审计行无重新解析管道** — 2602+ 条未解析审计永远等待人工审查
6. **图片源追踪碎片化** — Item/Buff/NPC 各有不同的 source/cache/fallback 语义
7. **Crawler 源码在 `data/wiki-crawler/src/`** — 违反"data/ 不存长期源码"规则
8. **脚本根路径对 worktree 不稳定** — `__dirname` 相对路径在 worktree 中可能读到错误数据
9. **报告新鲜度 24h TTL 但无自动刷新** — 执行模式为 manual，策略为 plan-only
10. **老化数据无自动告警** — 仅在 PR/push 时按需检查新鲜度

---

## 执行阶段

### P0 — 来源稳定性基础（本周，阻塞后续所有工作）

必须完成的基础设施修复，否则后续溯源和自动化都建立在脆弱基础上。

#### P0.1: 修复脚本根路径解析

**现状**: `scripts/data/lib/wiki-item-utils.mjs` 使用 `path.resolve(__dirname, '..', '..', '..', '..')` 推导工作区根目录，worktree 中路径偏移会导致读取错误数据。

**方案**:
- 创建 `scripts/data/lib/project-root.mjs`，统一通过 Git 根目录解析（`git rev-parse --show-toplevel` + 环境变量 fallback）
- 迁移所有使用 `__dirname` 相对回退的脚本到统一入口
- 在 `verify-local-stack.ps1` 中增加 worktree 根路径一致性检查

**产出**:
- [ ] `scripts/data/lib/project-root.mjs` — 统一根路径解析工具
- [ ] 迁移清单：所有 `__dirname` 回退路径 → `getProjectRoot()`
- [ ] `verify-local-stack.ps1` 增加 `WORKTREE_ROOT` 检查项

**验收标准**: 在 worktree 和主工作区分别运行 `domain-acceptance-a-grade-gate.mjs`，结果一致。

#### P0.2: 迁移 Crawler 源码到 scripts/

**现状**: Crawler 源码在 `data/wiki-crawler/src/`，违反 `docs/architecture/file-placement-rules.md` 中"data/ 不存长期源码"的规则。

**方案**:
- 将 `data/wiki-crawler/src/` → `scripts/data/crawler/`
- 保留 `data/wiki-crawler/` 中数据和 fixture
- 更新所有引用路径
- 在质量门禁中增加文件放置规则检查

**产出**:
- [ ] crawler 源码迁移到 `scripts/data/crawler/`
- [ ] 路径引用全部更新
- [ ] CI 门禁增加结构规则检查脚本

**验收标准**: `data/wiki-crawler/src/` 不再存在；crawler 测试全部通过。

#### P0.3: 完成 Canonical A0 层初始化

**现状**: `data/canonical/` 目录存在但没有已审计数据。A1（landing 证据）是事实上的可信输入层，这意味着数据在进入 maint 之前没有经过 A0 审计。

**方案**:
- 选取已完成 Domain Acceptance 的领域（先选 Item），从 landing 提取当前记录作为第一批 A0 候选
- 实现 `scripts/data/canonical/seed-canonical-from-landing.mjs`，对 landing 当前记录做 hash 验证后复制到 canonical
- 定义 canonical 的格式规范（`canonical-schema.mjs`），比 landing 更严格：必须包含 `audited_by`、`audited_at`、`canonical_version`
- 未来新增的 landing 记录，需先通过 canonical-import 才能进入 maint

**产出**:
- [ ] `scripts/data/canonical/canonical-schema.mjs` — canonical 数据格式定义
- [ ] `scripts/data/canonical/seed-canonical-from-landing.mjs` — 首次播种脚本
- [ ] `scripts/data/canonical/audit-canonical-consistency.mjs` — A0/A1 一致性审计
- [ ] `data/canonical/item/` — 首批 canonical 数据

**验收标准**: Item 领域的 canonical 数据存在且通过一致性审计。

#### P0.4: 锁定 Generation/View 目录流向

**现状**: `data/generated/`（155+ 追踪文件）和 `data/standardized/` 是历史输出但仍在活跃消费，`.gitignore` 又部分忽略。无法明确区分源数据、中间产物和可消费输出。

**方案**:
- 审计 `data/generated/` 和 `data/standardized/` 的全部消费者
- 标记每个文件的流向（→ canonical / → maint / → deprecated）
- 对 deprecated 文件添加迁移路径或归档
- 在 `.gitignore` 中按目录明确规则，禁止模糊的通配忽略

**产出**:
- [ ] `docs/audits/generated-data-consumer-map.md` — 生成数据的消费关系图
- [ ] 清理 `.gitignore` 中生成数据的忽略规则
- [ ] 废弃文件归档或标注迁移路径

**验收标准**: 每个 `data/generated/` 文件都有明确的消费方和生命周期标注。

---

### P1 — 溯源能力强化（下周，阻塞公开域名上线）

在来源稳定的基础上，建立完整的端到端溯源能力。

#### P1.1: 统一图片源追踪契约

**现状**: 图片溯源因实体而异：

| 实体 | 源追踪字段 |
|------|-----------|
| Item | `provider`, `source_file_title`, `source_page`, `source_revision_timestamp`, `original_url`, `cached_url`, `last_verified_at` |
| Buff | `image_original_url`, `image_cached_url`, `image_last_verified_at`（无 provider/page） |
| NPC | 仅 `npcs.image`（legacy）+ relation payload 中的原始 JSON fallback |

**方案**:
- 定义 `ImageSourceContract` 统一契约（provider + source_file_title + source_page + source_revision_timestamp + original_url + cached_url + last_verified_at）
- 迁移 Buff 表补齐缺失字段（Flyway V41）
- NPC 图片统一走契约，从 relation raw_json 回填
- 实现 `image-source-lineage-report.mjs` 生成图片溯源报告

**产出**:
- [ ] `docs/contracts/image-source-contract.md` — 图片溯源统一契约
- [ ] Flyway V41: 补齐 Buff 表缺失的 source 字段
- [ ] NPC 图片回填脚本
- [ ] `scripts/data/audit/image-source-lineage-report.mjs`

**验收标准**: 所有 5 个图片实体 (Item/Buff/NPC/Projectile/Biome) 都有完整溯源链。

#### P1.2: 实现全局记录世系查询

**现状**: 无法单次查询追踪一条记录从 wiki → landing → maint → relation → local。必须跨 `terria_v1_maint`、`terria_v1_relation`、`terria_v1_local` 三个数据库手动拼接。

**方案**:
- 实现 `scripts/data/audit/record-lineage-trace.mjs` — 输入 `record_key`，输出完整世系 JSON
- 利用现有的 `landing_source_id`、`landing_content_hash`、`source_maint_id` 逐层回溯
- 在 `maint_*` 表增加 `canonical_version` 字段（当源来自 canonical A0 时）
- 不引入新的 UUID 系统（避免过度工程化），利用现有 hash + id 链

**产出**:
- [ ] `scripts/data/audit/record-lineage-trace.mjs`
- [ ] Flyway 迁移：maint 表增加 `canonical_version` 字段
- [ ] 管理端增加"世系追踪"页面入口

**验收标准**: 输入任意 Item/NPC 的 ID，可输出完整的 wiki → public 全链路 JSON。

#### P1.3: 关系审计自动重解析管道

**现状**: 2602+ 条 `unresolved_item_npc_relation_audits` 永远等待人工审查。没有自动化重解析机制。

**方案**:
- 实现 `scripts/data/relation/reresolve-relation-audits.mjs`：
  - 对 `audit_status='unresolved'` 的审计行，用最新的 maint 数据重新匹配
  - 已解决的自动标记为 `resolved_auto` + `reresolved_at`
  - 仍无法解决的标记 `reresolve_attempted_at`，避免重复计算
- 在 Domain Acceptance 门禁中增加 `unresolvedAuditTrend` 面板：上升中的未解析数 → blocking
- 每周运行一次作为预检（不自动 apply，仅 dry-run）

**产出**:
- [ ] `scripts/data/relation/reresolve-relation-audits.mjs`
- [ ] Domain Acceptance 注册表增加 `unresolvedAuditTrend` 面板
- [ ] `domain-acceptance-registry.json` 更新

**验收标准**: 运行重解析后，`unresolved` 审计行减少 > 50%，无新增误匹配。

#### P1.4: 跨数据库引用完整性审计

**现状**: Landing ↔ Maint ↔ Relation 跨库 FK 没有数据库层的引用完整性约束。孤儿记录只能靠应用层审计发现。

**方案**:
- 实现 `scripts/data/audit/cross-db-referential-integrity.mjs`
- 检查模式:
  - Landing 当前记录 → Maint 对应行是否存在
  - Maint 记录 → Relation 对应行是否存在
  - Relation 记录 → Local 对应行是否存在
  - 反向检查：Local 中的记录是否能回溯到有效的 Landing
- 输出孤儿记录清单，包含置信度和修复建议
- 在 CI 门禁中增加快速版（只检查最近 7 天的记录）

**产出**:
- [ ] `scripts/data/audit/cross-db-referential-integrity.mjs`
- [ ] CI 门禁增加引用完整性快速检查
- [ ] 首次全域扫描报告

**验收标准**: 全域扫描无阻断级孤儿记录；快速版在 CI 中 3 分钟内完成。

---

### P2 — 自动化维护（两周后，开启持续稳定）

来源稳定且溯源完备后，建立自动化的数据保鲜机制。

#### P2.1: 数据新鲜度自动刷新调度

**现状**: 报告新鲜度 TTL=24h，但 `executionMode=manual`、`executionPolicy=plan-only`，无自动刷新。

**方案**:
- 将 `domain-acceptance-refresh-plan.mjs` 的输出按 `autoMaintenanceEligible=true` 过滤
- 实现 `scripts/data/workflow/auto-refresh-eligible-sources.mjs`，执行符合条件的刷新
- 通过 GitHub Actions 的 `schedule` 触发器每天运行一次
- 安全规则: 只允许 `plan-only` 标记为 `autoMaintenanceEligible` 的源进入自动刷新
- 首次上线: dry-run 模式运行 3 天 → 人工审核结果 → 开启 apply

**产出**:
- [ ] `scripts/data/workflow/auto-refresh-eligible-sources.mjs`
- [ ] `.github/workflows/scheduled-freshness-refresh.yml`
- [ ] Domain Acceptance 注册表增加 `autoMaintenanceEligible` 字段

**验收标准**: 自动刷新在 dry-run 模式下连续 3 天输出正确操作队列；开启 apply 后无数据损坏。

#### P2.2: B1 豁免自动审计与过期告警

**现状**: B1 豁免源（NPC bridge、recipe material ref、group overrides）有书面迁移期限，但无自动化强制。

**方案**:
- 实现 `scripts/data/audit/b1-exemption-compliance.mjs`
- 读取 `canonical-migration-boundary.md` 中登记的 B1 源及其迁移截止日期
- 对比当前日期、过期 → blocking；临近（7天内）→ warning
- 自动生成合规报告，注入到 Domain Acceptance 面板

**产出**:
- [ ] `scripts/data/audit/b1-exemption-compliance.mjs`
- [ ] Domain Acceptance 注册表增加 `b1ExemptionCompliance` 面板

**验收标准**: 所有 B1 豁免有明确的迁移状态追踪，过期豁免自动阻断门禁。

#### P2.3: 老化数据自动告警

**现状**: 新鲜度检查仅在 PR/push 时按需运行，无法在数据实际过期时主动通知。

**方案**:
- 创建 `.github/workflows/data-staleness-monitor.yml`，通过 `schedule` 每 6 小时运行
- 运行 `domain-acceptance-freshness-audit.mjs --fail-on-blocking-stale=true`
- 发现阻断级过期数据时，通过 GitHub Issue 自动创建告警
- 非阻断级过期数据记录到 `reports/domain/staleness-history.jsonl` 做趋势分析

**产出**:
- [ ] `.github/workflows/data-staleness-monitor.yml`
- [ ] `scripts/data/workflow/create-staleness-alert-issue.mjs`（通过 `gh issue create`）
- [ ] `reports/domain/staleness-history.jsonl` 趋势记录

**验收标准**: 阻断级过期数据发生后 6 小时内收到 GitHub Issue 告警。

---

### P3 — 公开域名上线（二周后，依赖 P1 全部完成）

P0+P1 全部通过后，按 Domain Acceptance 面板逐领域开放公开路由。

#### P3.1: 按领域开放公开路由

**上线条件**（每个领域独立判断）:
- sourceReadiness = pass
- relationReadiness = pass
- imageReadiness = pass
- publicReadiness = pass（无阻断）
- 已接受的警告在有效期范围内
- A 级门禁通过（`--fail-on-blocked=true --fail-on-warning=true`）

**上线顺序**（风险从低到高）:
1. Items（已是最完整领域）→ 公开路由 `entityType=public`
2. NPCs → 公开路由 `entityType=public`
3. Buffs → 公开路由 `entityType=public`
4. Bosses / Projectiles / ArmorSets → 公开路由 `entityType=public`

**产出**:
- [ ] 每个领域的公开路由配置（Nuxt 路由 + 前端页面）
- [ ] Domain Acceptance `publicRoute` 字段更新
- [ ] P2-public-domain-readiness.md 验收清单逐项清除

---

## 与现有 Phase B 计划的对接

本计划与 `2026-05-05_phase-b-stabilization-execution-plan` 的关系：

| 现有的 P0-P2 | 本计划对应 |
|-------------|----------|
| P0-01 CI 质量门禁 | 已有，P0.2/P1.4 增加检查项 |
| P0-02a/02b 数据源验收 | 已有，P2.2 补充 B1 豁免合规 |
| P0-5a/5b/5c 领域验收 | 已有，P1.3 补充审计重解析面板 |
| P1 物品/NPC 公开验收 | **被本计划 P0-P1 阻塞** — 先修复基础再公开 |
| P2 公开域名就绪 | **被本计划 P3 替代** — 按领域逐批开放 |

**核心决策**: P1（公开验收）和 P2（公开就绪）暂停，直到 P0（来源稳定）和 P1（溯源强化）完成。代码层面的 Domain Acceptance 功能开发可以继续，但公开路由开关必须等待本计划的 P1 验收通过。

---

## 风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| Crawler 源码迁移导致路径破坏 | 中 | 分步迁移 + 全量测试后删除旧目录 |
| Canonical 播种选错数据 | 中 | dry-run 模式 + hash 验证 + 人工抽查 |
| 自动刷新 apply 模式引入数据损坏 | 高 | dry-run 运行 3 天 + 人工审核 + active-writer 互斥检查 |
| 重解析管道误匹配审计行 | 中 | 仅标记 `resolved_auto`，保留原始审计记录不删除 |
| 跨库引用完整性扫描耗时过长 | 低 | CI 中只检查最近 7 天；完整扫描仅本地运行 |
| 延迟公开域名与期望不符 | 低 | 逐领域开放，Items/NPCs 可快速通过 |

---

## 任务追踪

当前分支 `feature/project-structure-cleanup` 上的未提交工作（Domain Acceptance 后端+管理端）先提交。后续任务按 P0 → P1 → P2 → P3 逐个分支推进，每个 Phase 一个分支。

**当前未提交工作（优先提交）**:
- `back/` — DomainAcceptanceServiceImpl、DTO、Controller 测试
- `data-query-app/` — domain-acceptance.vue 页面、类型定义、测试
- `scripts/data/workflow/` — domain-acceptance-* 系列脚本
