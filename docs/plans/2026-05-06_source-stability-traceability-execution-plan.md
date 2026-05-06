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
- CI-safe gate（`quality-gate-ci.ps1`）已到位；本地完整门禁以 `scripts/dev/quality-gate.ps1` 为准，二者不等价（CI 无 DB 连接、无完整 mvn test、无 dry-run）

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

不写 DB、不执行刷新、不迁移源码。允许生成报告 artifact；正式 canonical 晋级需人工签收，不属于 P0 自动执行范围。

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

**阶段 A — 只读候选生成**（只读业务数据，写报告 artifact）:
- 定义 `canonical-schema.mjs`，比 landing 更严格：必须包含 `canonical_version`、`candidate_generated_at`、`source_landing_id`、`content_hash`
- 实现 `scripts/data/canonical/generate-canonical-candidates.mjs`：对 landing 当前记录做 hash 验证、schema 校验、一致性检查后输出候选集到 `reports/canonical/candidates/{domain}/`（不在 `data/` 下，避免被误读为正式数据层）
- 候选集同时生成一致性报告：覆盖率、hash 匹配率、schema 违规清单
- **硬边界**: `reports/canonical/candidates/` 目录不得被 maint/import/domain acceptance 消费；签收前不是 A0 source of truth

**阶段 B — 人工签收晋级**（不属于 P0 自动执行范围，P0 只产出候选集和报告）:
- 人工审核候选集报告，逐领域签收
- 签收后才将候选移动到 `data/canonical/{domain}/`，写入 `audited_by`、`audited_at`
- 此阶段不自动化，属于 P0 之后的人工签收动作

**产出**:
- [ ] `scripts/data/canonical/canonical-schema.mjs` — canonical 数据格式定义
- [ ] `scripts/data/canonical/generate-canonical-candidates.mjs` — 候选生成脚本（只读）
- [ ] `scripts/data/canonical/audit-canonical-consistency.mjs` — A0/A1 一致性审计（只读）
- [ ] `reports/canonical/candidates/item/` — Item 领域首批候选集 + 一致性报告

**验收标准**: Item 领域候选集在 `reports/canonical/candidates/item/` 生成且一致性报告通过（hash 匹配率 = 100%），等待人工签收。

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

**统一 DB 写入硬边界**: P1 中涉及 Flyway 迁移、数据回填、apply 写入的任务必须遵守：
- 明确目标数据库（`terria_v1_maint` / `terria_v1_relation` / `terria_v1_local`）
- 调用前检查 active-writer 互斥（禁止与其他 DB apply 并行）
- 默认 dry-run，显式 `--apply` 才写入；提供 `--dry-run` 预览差异
- 涉及数据修改的必须有备份/回滚方案
- 不得作为 Domain Acceptance 证据生成命令，不进入 CI-safe gate / GitHub Actions schedule

#### P1.1: 统一图片源追踪契约

**现状**: 图片溯源因实体而异：

| 实体 | 源追踪字段 |
|------|-----------|
| Item | `provider`, `source_file_title`, `source_page`, `source_revision_timestamp`, `original_url`, `cached_url`, `last_verified_at` |
| Buff | `image_original_url`, `image_cached_url`, `image_last_verified_at`（无 provider/page） |
| NPC | 仅 `npcs.image`（legacy）+ relation payload 中的原始 JSON fallback |

**方案**:
- 定义 `ImageSourceContract` 统一契约（provider + source_file_title + source_page + source_revision_timestamp + original_url + cached_url + last_verified_at）
- 迁移 Buff 表补齐缺失字段（下一个可用 Flyway 版本号）
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

**阶段 A — 只读候选生成**（只读业务数据，写报告 artifact）:
- 实现 `scripts/data/relation/generate-reresolve-candidates.mjs`（只读）：
  - 对 `audit_status='unresolved'` 的审计行，用最新的 maint 数据重新匹配
  - 输出候选集 JSON：`{audit_id, proposed_match, confidence, evidence}`
  - 统计：可自动匹配数量、仍需人工数量、低置信度数量
- 在 Domain Acceptance 门禁中增加 `unresolvedAuditTrend` 面板：上升中的未解析数 → blocking
- 每周运行一次生成最新候选报告

**阶段 B — 人工确认后 apply**（硬边界）:
- 人工审核候选报告，筛选确认要应用的匹配
- 单独的 `scripts/data/relation/apply-reresolve-results.mjs`
- **硬边界规则**:
  - 默认 dry-run，必须显式 `--apply --confirmed-candidates <file>` 才执行写入
  - 不得进入 CI、GitHub Actions schedule、quality-gate-ci
  - 不得作为 Domain Acceptance 证据生成命令
  - 每次调用前必须有 active-writer 互斥检查
- 已解决的标记 `resolved_manual_confirmed` + `resolved_at`，保留原始审计行不删除

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
- 不进入 CI-safe gate（跨库检查需要 DB 连接，违反 CI-safe 边界）
- 进入 `scripts/dev/quality-gate.ps1`，通过 `-FullDataAudit` 开关控制：默认本地门禁跑快速/抽样检查；完整全域扫描仅作为 release checkpoint 或手动命令执行

**产出**:
- [ ] `scripts/data/audit/cross-db-referential-integrity.mjs` — 支持 `--mode=quick`（默认，最近 7 天抽样）和 `--mode=full`（全域扫描）
- [ ] `scripts/dev/quality-gate.ps1` 增加 `-FullDataAudit` 参数，传入时执行 `--mode=full`，否则执行 `--mode=quick`（本地完整门禁专属，不在 CI 执行）
- [ ] 首次全域扫描报告（release checkpoint 前执行）

**验收标准**: quick 模式 3 分钟内完成，无阻断级孤儿记录；full 模式作为 release checkpoint，全域无阻断级孤儿记录。

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

来源稳定且溯源完备后，建立自动化的数据保鲜监控与告警机制。**本阶段只读业务数据（不写 DB、不执行刷新），允许写报告 artifact 和 GitHub Issue body；不自动提交回仓库。不包含任何自动 apply 逻辑。

#### P2.1: 数据新鲜度自动监控与手动刷新计划

**现状**: 报告新鲜度 TTL=24h，但 `executionMode=manual`、`executionPolicy=plan-only`，无自动监控。老化数据告警仅在 PR/push 时按需运行，无法主动通知。

**核心约束**: 遵守 Phase B 已确立的 `executionMode=manual`、`executionPolicy=plan-only` 边界。本任务只做监控和计划生成，**不做自动 apply**。真正的自动 apply 需另立后续 RFC。

**方案**:
- 通过 **单一** GitHub Actions `schedule` 触发器（每 6 小时），运行只读审计：
  - `domain-acceptance-freshness-audit.mjs --fail-on-blocking-stale=true` — 过期报告
  - `domain-acceptance-refresh-plan.mjs` — 手动操作队列
- 阻断级过期数据通过 `gh issue create` 自动创建 GitHub Issue 告警
- 所有过期记录写入 `reports/domain/staleness-history.jsonl`（唯一趋势记录文件）
- Issue body 和趋势文件作为 GitHub Actions artifact，**不自动提交回仓库**
- 刷新操作本身仍由人工在本地执行——流程不变

**产出**:
- [ ] `.github/workflows/scheduled-staleness-monitor.yml` — 唯一定时监控 workflow（新鲜度审计 + 刷新计划 + Issue 告警）
- [ ] `scripts/data/workflow/create-staleness-alert-issue.mjs` — 生成 GitHub Issue 告警
- [ ] `reports/domain/staleness-history.jsonl` — 过期趋势记录（workflow workspace 临时生成，上传 artifact；**不作为 git tracked 文件**，避免误将运行产物加入版本控制）

**验收标准**: 阻断级过期数据发生后 6 小时内收到 GitHub Issue 告警；无任何自动 apply 逻辑；workflow 和报告文件均唯一、不重复。

#### P2.2: B1 豁免自动审计与过期告警

**现状**: B1 豁免源（NPC bridge、recipe material ref、group overrides）有书面迁移期限，但无自动化强制。

**方案**:
- 实现 `scripts/data/audit/b1-exemption-compliance.mjs`
- 读取 `canonical-migration-boundary.md` 中登记的 B1 源及其迁移截止日期
- 对比当前日期、过期 → blocking；临近（7天内）→ warning
- 自动生成合规报告，由 Domain Acceptance 注册表引用 `reportPath`；UI/API 只消费报告文件，不生成证据、不计算新鲜度、不执行命令

**产出**:
- [ ] `scripts/data/audit/b1-exemption-compliance.mjs`
- [ ] Domain Acceptance 注册表增加 `b1ExemptionCompliance` 面板

**验收标准**: 所有 B1 豁免有明确的迁移状态追踪，过期豁免自动阻断门禁。

---

### P3 — 公开领域/公开路由上线（二周后，依赖 P1 全部完成）

P0+P1 全部通过后，按 Domain Acceptance 面板逐领域开放公开路由。不替代原 Phase B 的 P2-public-domain-readiness 文档——本 P3 是 readiness 文档的执行落地阶段。

#### P3.1: 按领域开放公开路由

**上线前置条件**（必须满足全部）:
- 原 Phase B P2-public-domain-readiness 文档验收通过
- Domain Acceptance 全部面板: sourceReadiness/relationReadiness/imageReadiness/publicReadiness 均为 fresh/pass（无阻断、无 warning）
- **accepted-warning 语义限制**: accepted-warning 只允许 readiness-only 评估通过，**不允许放行公开路由**。带 accepted-warning 的领域不得设为 `publicRoute`，`entityType` 不得标记为 `public`
- A 级门禁通过（`--fail-on-blocked=true --fail-on-warning=true`），即 warning 也算阻断公开路由上线

**上线条件**（每个领域独立判断，全部必须 fresh/pass）:
- sourceReadiness = fresh/pass
- relationReadiness = fresh/pass
- imageReadiness = fresh/pass
- publicReadiness = fresh/pass（无阻断、无 warning、无过期 accepted-warning）

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
| P0-01 CI 质量门禁 | 已有，P1.5 增加结构检查（warning 级别） |
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
| 跨库引用完整性扫描耗时过长 | 低 | 只进本地完整门禁，不进 CI-safe gate；通过后缓存结果 |
| Crawler 源码迁移破坏 workflow | 中 | 独立分支执行 + 回滚方案 + 先在 CI 补充结构检查再迁移 |
| 延迟公开领域与期望不符 | 低 | 逐领域开放，Items/NPCs 可快速通过 |
| GitHub Actions schedule 精度不足 | 低 | 接受 ±10min 调度偏差；告警延迟不超过 1h |

---

## 任务追踪

当前分支 `feature/project-structure-cleanup`。

后续任务按 P0 → P1 → P2 → P3 逐个分支推进，每个 Phase 一个分支：
- `feature/p0-source-stability` — P0.1 根路径修复、P0.2 canonical 候选层、P0.3 生成数据流向
- `feature/p1-traceability` — P1.1 图片溯源统一、P1.2 世系查询、P1.3 重解析候选、P1.4 跨库引用审计、P1.5 crawler 迁移
- `feature/p2-auto-monitoring` — P2.1 新鲜度监控告警（含老化数据告警，已合并）、P2.2 B1 豁免合规
- `feature/p3-public-routes` — P3.1 按领域开放公开路由

P2 全部不包含自动 apply 逻辑。自动 apply 的推进需另立 RFC。
