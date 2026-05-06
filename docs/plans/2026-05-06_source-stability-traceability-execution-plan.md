# 数据来源稳定性与溯源执行计划

**日期**: 2026-05-06  
**状态**: 执行中  
**依赖**: Phase B 稳定化计划 (2026-05-05)  
**优先原则**: 先保证来源稳定性 → 再强化溯源能力 → 最后推进公开领域/公开路由

---

## 背景

基于项目全面审计，当前 Phase B 稳定化聚焦于 Domain Acceptance（领域验收）功能建设。但在推进公开领域/公开路由之前，存在 **10 项数据来源稳定性与溯源的结构性缺口**需要优先解决。

### 现状诊断

**已有能力（强项）**:
- 7 层数据管线已建成，每层都有 SHA-256 哈希 + 双时态追踪 + 来源修订时间戳
- Landing → Maint → Relation → Local 应用层链路字段（`landing_source_id`、`landing_content_hash`、`source_maint_id`）基本完整
- 每层保留 `payload_json`/`raw_json` 完整原始载荷
- 9 个领域已配置 Domain Acceptance 门禁
- CI 质量门禁和本地完整门禁均已到位

**结构性缺口**:
1. **`data/canonical/` 基本为空** — A0 可信输入层只存在目标结构，没有已审计数据
2. **无全局记录 UUID** — 各层使用各自 ID，无法单次查询追踪一条记录从 wiki 到公开页面
3. **跨数据库无 DB 层引用完整性约束** — Landing/Maint/Relation 跨库链路应用层链路字段已完整，但 MySQL 层面无跨库 FK 约束，孤儿记录只能靠应用层审计发现
4. **B1 豁免审计命令手动执行** — 没有自动化强制豁免源按期限迁移
5. **关系审计行无重新解析管道** — 2602+ 条未解析审计永远等待人工审查
6. **图片源追踪碎片化** — Item/Buff/NPC 各有不同的 source/cache/fallback 语义
7. **Crawler 源码在 `data/wiki-crawler/src/`** — 违反"data/ 不存长期源码"规则
8. **脚本根路径对 worktree 不稳定** — `__dirname` 相对路径在 worktree 中可能读到错误数据
9. **报告新鲜度 24h TTL 但无自动刷新** — 执行模式为 manual，策略为 plan-only
10. **老化数据无自动告警** — 仅在 PR/push 时按需检查新鲜度

---

## 执行阶段

### P0 — 来源稳定性基础（本周，阻塞后续溯源与公开领域）

必须完成的只读审计和基础设施修复，不涉及任何数据写入或源码迁移。

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

#### P0.2: 建立 Canonical Candidate 候选层

**现状**: `data/canonical/` 目录存在但没有已审计数据。A1（landing 证据）是事实上的可信输入层。直接从 landing 复制到 canonical 会混淆"事实输入"和"已审计可信"的边界。

**方案**（两阶段，先建立候选层再人工晋级）:

**阶段 A — 只读候选生成**:
- 定义 `canonical-schema.mjs`，比 landing 更严格：必须包含 `canonical_version`、`candidate_generated_at`、`source_landing_id`、`content_hash`
- 实现 `scripts/data/canonical/generate-canonical-candidates.mjs`：对 landing 当前记录做 hash 验证、schema 校验、一致性检查后输出候选集到 `data/canonical/candidates/{domain}/`
- 候选集同时生成一致性报告：覆盖率、hash 匹配率、schema 违规清单

**阶段 B — 人工签收晋级**:
- 人工审核候选集报告，逐领域签收
- 签收后才将候选移动到 `data/canonical/{domain}/`，写入 `audited_by`、`audited_at`
- 此阶段不自动化——每个领域都需要人工确认

**产出**:
- [ ] `scripts/data/canonical/canonical-schema.mjs` — canonical 数据格式定义
- [ ] `scripts/data/canonical/generate-canonical-candidates.mjs` — 候选生成脚本（只读）
- [ ] `scripts/data/canonical/audit-canonical-consistency.mjs` — A0/A1 一致性审计（只读）
- [ ] Item 领域首批候选集 + 一致性报告

**验收标准**: Item 领域候选集生成且一致性报告通过（hash 匹配率 = 100%），等待人工签收。

#### P0.3: 锁定 Generation/View 目录流向

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

### P1 — 溯源能力强化（下周，阻塞公开领域/公开路由上线）

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

#### P1.3: 关系审计重解析候选报告

**现状**: 2602+ 条 `unresolved_item_npc_relation_audits` 永远等待人工审查。没有自动化重解析候选生成机制。

**方案**（两阶段，先生成候选报告，人工确认后再单独 apply）:

**阶段 A — 只读候选生成**:
- 实现 `scripts/data/relation/generate-reresolve-candidates.mjs`（只读）：
  - 对 `audit_status='unresolved'` 的审计行，用最新的 maint 数据重新匹配
  - 输出候选集 JSON：`{audit_id, proposed_match, confidence, evidence}`
  - 统计：可自动匹配数量、仍需人工数量、低置信度数量
- 在 Domain Acceptance 门禁中增加 `unresolvedAuditTrend` 面板：上升中的未解析数 → blocking
- 每周运行一次生成最新候选报告

**阶段 B — 人工确认后 apply**:
- 人工审核候选报告，筛选确认要应用的匹配
- 单独的 `scripts/data/relation/apply-reresolve-results.mjs`，只对人工确认的记录执行写入
- 已解决的标记 `resolved_manual_confirmed` + `resolved_at`，保留原始审计行不删除、不自动标记

**产出**:
- [ ] `scripts/data/relation/generate-reresolve-candidates.mjs`（只读）
- [ ] `scripts/data/relation/apply-reresolve-results.mjs`（独立 apply，需人工确认后才能调用）
- [ ] Domain Acceptance 注册表增加 `unresolvedAuditTrend` 面板
- [ ] `domain-acceptance-registry.json` 更新

**验收标准**: 候选生成的匹配率 > 50% 且无误匹配；apply 脚本仅在人工签收候选集后才能执行写入。

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

#### P1.5: Crawler 源码迁移计划（独立迁移任务）

**现状**: Crawler 源码在 `data/wiki-crawler/src/`，违反 `docs/architecture/file-placement-rules.md` 中"data/ 不存长期源码"的规则。但改动面大，容易影响 crawler workflow，不应阻塞 P0。

**方案**（作为独立迁移任务，不与 P0/P1/P2 串行）:
- 先补充 CI 文件放置规则检查脚本，标记当前违规但不阻断
- 编写迁移计划（路径映射、引用更新清单、回滚方案）
- 在独立分支执行迁移：`data/wiki-crawler/src/` → `scripts/data/crawler/`
- 保留 `data/wiki-crawler/` 中数据和 fixture

**产出**:
- [ ] CI 增加文件放置规则检查（标记违规，warning 级别）
- [ ] `docs/plans/crawler-source-migration-plan.md` — 迁移方案与路径映射
- [ ] 迁移完成后删除旧目录

**验收标准**: `data/wiki-crawler/src/` 不再存在；crawler 测试全部通过；CI 结构检查通过。

---

### P2 — 自动化监控与告警（两周后）

来源稳定且溯源完备后，建立自动化的数据保鲜监控与告警机制。**本阶段所有产出均为只读监控，不包含自动 apply。

#### P2.1: 数据新鲜度自动监控与手动刷新计划

**现状**: 报告新鲜度 TTL=24h，但 `executionMode=manual`、`executionPolicy=plan-only`，无自动监控。

**核心约束**: 遵守 Phase B 已确立的 `executionMode=manual`、`executionPolicy=plan-only` 边界。本任务只做监控和计划生成，**不做自动 apply**。真正的自动 apply 需另立后续 RFC。

**方案**:
- 通过 GitHub Actions `schedule` 触发器，定期运行只读审计：
  - `domain-acceptance-freshness-audit.mjs` — 生成过期报告（只读）
  - `domain-acceptance-refresh-plan.mjs` — 生成手动操作队列（只读）
- 将过期清单和刷新计划写入 `reports/domain/staleness-{date}.json`，通过 GitHub Issue 自动推送到项目管理
- 刷新操作本身仍由人工在本地执行——流程不变，新增的是**自动感知过期 + 自动生成操作计划**

**产出**:
- [ ] `.github/workflows/scheduled-staleness-monitor.yml` — 定时运行新鲜度审计 + 刷新计划生成
- [ ] `scripts/data/workflow/create-staleness-alert-issue.mjs` — 生成 GitHub Issue 告警
- [ ] `reports/domain/staleness-history.jsonl` — 过期趋势记录

**验收标准**: 过期数据发生后 6 小时内生成告警 Issue + 刷新计划文本；无任何自动 apply 逻辑。

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

### P3 — 公开领域/公开路由上线（二周后，依赖 P1 全部完成）

P0+P1 全部通过后，按 Domain Acceptance 面板逐领域开放公开路由。不替代原 Phase B 的 P2-public-domain-readiness 文档——本 P3 是 readiness 文档的执行落地阶段。

#### P3.1: 按领域开放公开路由

**上线前置条件**（必须满足全部）:
- 原 Phase B P2-public-domain-readiness 文档验收通过
- Domain Acceptance 面板状态: sourceReadiness/relationReadiness/imageReadiness/publicReadiness 均为 pass
- 已接受的警告在有效期范围内且不超过 readinessOnly 语义
- A 级门禁通过（`--fail-on-blocked=true --fail-on-warning=true`）

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
| P0-01 CI 质量门禁 | 已有，P1.4/P1.5 增加检查项 |
| P0-02a/02b 数据源验收 | 已有，P2.2 补充 B1 豁免合规 |
| P0-5a/5b/5c 领域验收 | 已有，P1.3 补充审计重解析面板 |
| P1 物品/NPC 公开验收 | **被本计划 P0-P1 阻塞** — 先修复基础再公开 |
| P2 公开领域就绪 | 本计划 P3 作为 readiness 文档的执行落地，不替代原文档 |

**核心决策**: 原 Phase B 的 P1（公开验收）和 P2（公开领域就绪）暂停，直到本计划的 P0（来源稳定）和 P1（溯源强化）完成。代码层面的 Domain Acceptance 功能开发可以继续，但公开路由开关必须等待本计划的 P1 验收通过。P3 不替代原 Phase B 的 P2 readiness 文档，而是在其基础上执行落地。

---

## 风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| Canonical 候选数据误标可行 | 中 | 候选层只读生成 + hash 验证 + schema 校验 + 人工签收后才晋级 |
| 重解析候选误匹配审计行 | 中 | apply 脚本与生成脚本分离；人工确认后才执行写入；原始审计行不删除 |
| 跨库引用完整性扫描耗时过长 | 低 | CI 中只检查最近 7 天；完整扫描仅本地运行 |
| Crawler 源码迁移破坏 workflow | 中 | 独立分支执行 + 回滚方案 + 先在 CI 补充结构检查再迁移 |
| 延迟公开领域与期望不符 | 低 | 逐领域开放，Items/NPCs 可快速通过 |
| GitHub Actions schedule 精度不足 | 低 | 接受 ±10min 调度偏差；告警延迟不超过 1h |

---

## 任务追踪

当前分支 `feature/project-structure-cleanup`。

后续任务按 P0 → P1 → P2 → P3 逐个分支推进，每个 Phase 一个分支：
- `feature/p0-source-stability` — P0.1 根路径修复、P0.2 canonical 候选层、P0.3 生成数据流向
- `feature/p1-traceability` — P1.1 图片溯源统一、P1.2 世系查询、P1.3 重解析候选、P1.4 跨库引用审计、P1.5 crawler 迁移
- `feature/p2-auto-monitoring` — P2.1 新鲜度监控告警、P2.2 B1 豁免合规、P2.3 老化数据告警
- `feature/p3-public-routes` — P3.1 按领域开放公开路由

P2 全部不包含自动 apply 逻辑。自动 apply 的推进需另立 RFC。
