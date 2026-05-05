# TerraPedia Phase B 边界选择表 - 2026-05-05

## 目的

本文件把下一阶段任务的关键边界拆成可选择选项。先确定这些选项，再把任务写成最终执行计划。

默认方向：Phase B 继续稳底座，先收 CI、项目管理记录、Data Source Acceptance Drilldown、Domain Acceptance 准入，再做 Item/NPC 公开面验收。Boss/Buff/Projectile/ArmorSet 不进入独立公开页实现。

## 使用方式

可以直接按编号回复选择，例如：

```text
O1=A, O2=A, O3=B, O4=A, O5=A, O6=B, O7=A, O8=A, O9=A, O10=A
```

如果不指定，默认采用每项标记为“推荐”的选项。

## 不可选硬边界

以下规则不建议作为选项开放，除非明确要改变项目风险策略：

- 不自动运行 crawler/import/backfill/load/apply/写库命令。
- Acceptance UI/API 不负责生成 evidence，不负责刷新数据。
- Refresh plan 只展示人工命令，必须保持 `executeMode=manual`、`executionPolicy=plan-only`。
- Any Item Group 的 blocked consumer reference 永远是 blocking。
- missing/stale/unknown/unreadable evidence 至少 warning；public-blocking panel 为 blocking。
- 前台 fallback 不能让 readiness 自动 pass。

---

## O1：CI 运行平台

### A. Windows runner（推荐）

使用 `windows-latest`，workflow 明确调用 PowerShell。

影响：
- 最贴近当前本地脚本环境。
- `mvn.cmd`、`pnpm.cmd`、PowerShell 脚本兼容风险最低。
- CI 较慢，但第一阶段更稳。

适用任务：
- P0-01 CI 质量门禁。

### B. Linux runner

使用 `ubuntu-latest`，把 CI 命令改成跨平台 shell 或 pwsh。

影响：
- 更接近通用 CI 环境。
- 当前 `quality-gate.ps1` 命令解析、路径、`mvn.cmd/pnpm.cmd` 需要额外适配。
- 容易把 CI 接入任务扩大成跨平台改造。

### C. 双 runner

同时跑 Windows 和 Linux。

影响：
- 覆盖最好。
- 第一阶段成本高，容易阻塞 Phase B 主线。

## O2：CI 门禁范围

### A. CI-safe 窄门禁（推荐）

CI 只跑无 DB、无服务启动、无外部依赖的测试和构建。

包含：
- Node workflow tests。
- Front `pnpm run test`。
- Admin `pnpm run test`。
- 后端先跑明确无 DB 的 contract/unit tests。

影响：
- 快速接入，红灯更可信。
- 后端全量 `mvn test` 暂时留在本地 full gate。

### B. 等价本地 full gate

CI 直接跑 `scripts/dev/quality-gate.ps1` 完整门禁。

影响：
- 与本地一致。
- 如果后端测试隐式依赖 MySQL/Redis 或 stale reports，CI 可能持续红。

### C. 分阶段升级

第一批用 A，等无 DB 后端测试边界确认后升级到 B。

影响：
- 最现实，但需要在文档里写清“CI 第一版不是 full local gate”。

建议：选 C 作为实施策略，第一步执行 A。

## O3：`verify-local-stack.ps1` 是否进入 CI

### A. 不进入 CI（推荐）

`verify-local-stack.ps1` 只作为本地启动前预检。

影响：
- CI 不依赖本地 DB TCP、端口和服务状态。
- CI 职责清晰。

### B. CI 可选手动 job

保留一个 disabled/manual job，将来接入服务容器后再启用。

影响：
- 文档复杂度上升。
- 当前没有必要。

### C. 默认进入 CI

每次 CI 都跑本地栈预检。

影响：
- 当前不建议，容易被 DB/端口环境拖垮。

## O4：项目管理记录优先级

### A. P0-00 先建记录骨架（推荐）

先创建：
- `docs/project-management/current-status.md`
- `docs/project-management/risk-register.md`
- `docs/project-management/decision-log.md`
- `docs/project-management/daily/2026-05-05.md`

影响：
- 后续 CI、Acceptance、公开面任务都有风险和决策落点。
- 文档工作先行，但成本很低。

### B. 与 CI 同批

CI 任务完成时一起建项目管理记录。

影响：
- 少一个提交。
- CI 过程中发现的风险可能没有及时记录。

### C. 暂缓

先实现功能，后补记录。

影响：
- 不建议。项目已经进入多链路阶段，后补容易丢上下文。

## O5：Data Source Acceptance Drilldown 样本来源

### A. 只读 reports（推荐）

Drilldown 只从最新 `reports/**.json`、panel `checks`、`rawSummary`、`blockingReasons`、`warningReasons` 提取样本。

影响：
- 不绕过 evidence 链。
- 样本质量取决于已有 report schema。
- 第一版需要通用 fallback。

### B. reports + DB diagnostic

准入状态仍来自 reports，额外 DB 样本只作为诊断，必须标记 `notGateEvidence=true`。

影响：
- 排障更方便。
- 边界更复杂，容易被误用成 gate evidence。

### C. 实时 DB 查询

后端直接查业务表生成 drilldown 和 gate 状态。

影响：
- 不建议。会绕过 manifest/report/freshness/refresh-plan 链。

## O6：Drilldown API 形态

### A. 扩展 overview DTO（推荐第一版）

在 `DataSourceAcceptanceOverviewDTO.AcceptancePanelDTO` 增加 `failureSamples`。

影响：
- 改动小，页面一次请求可展示。
- overview payload 会变大，需要限制样本数量，例如每 panel 50 条。

### B. 新增 panel samples endpoint

新增：

```text
GET /admin/data-source-acceptance/panels/{panelId}/samples?limit=50
```

影响：
- API 更干净，payload 可控。
- 后端和前端交互增加，任务更大。

### C. 两阶段

第一版 A，后续样本多了再拆 B。

影响：
- 推荐实际执行方式。

## O7：Drilldown 样本字段

### A. 统一最小字段（推荐）

字段：
- `entityType`
- `entityId`
- `sourceId`
- `status`
- `reason`
- `evidencePath`
- `recommendedAction`
- `freshnessStatus`
- `reportPath`
- `sampleSource`
- `notGateEvidence`

影响：
- 足够支撑人工验收。
- 不绑定某个 report schema。

### B. 每个 panel 自定义字段

每种 panel 定义独立 sample 类型。

影响：
- 表达力更强。
- 前端和 DTO 复杂度明显上升。

### C. 只显示原始 JSON

直接展示 raw sample。

影响：
- 实现快。
- 管理端可读性差，不利于验收。

## O8：Domain Acceptance 优先级

### A. 升为 P0.5（推荐）

CI 和 Data Source Drilldown 之后，Item/NPC 公开面之前，先收 Domain Acceptance 最小闭环。

影响：
- Boss/Buff/Projectile/ArmorSet 的前置门禁清楚。
- P1 公开面不会自己定义准入口径。

### B. 保持 P1

先做 Item/NPC 公开面，再收 Domain Acceptance。

影响：
- Item/NPC 可更快推进。
- 新公开域准入口径会滞后。

### C. 升为 P0

在 CI 前先做 Domain Acceptance。

影响：
- 不建议。Domain Acceptance 已被 quality gate 引用，CI 边界先定更稳。

## O9：Domain Acceptance 拆分方式

### A. 三段串行（推荐）

拆成：
- P0.5a registry/audit/gate 脚本层
- P0.5b 后端 DTO/service/controller
- P0.5c 管理端页面/types/contract tests

影响：
- 每段可独立验证。
- 避免同一任务横跨脚本、后端、UI。

### B. 一次性收口

一个任务完成所有 Domain Acceptance 改动。

影响：
- 不建议，范围过大。

### C. 只收脚本层

暂不改后端和页面。

影响：
- gate 更稳，但管理端仍缺足够可见性。

## O10：Domain public exposure 策略

### A. B-tier 保持 planned-public（推荐）

Boss/Buff/Projectile/ArmorSet 继续：
- `publicExposure=planned-public`
- `publicRoute=null`

影响：
- 明确还不能公开。
- 只允许做 readiness 和管理端验收。

### B. Boss 提前 public

Boss 先开放 public route。

影响：
- 不建议。前台当前没有 Boss 独立 route/view/API 契约。

### C. Boss 作为 NPC 聚合候选

不新增 Boss 独立公开页，只在后续方案中考虑 NPC list filter/aggregate。

影响：
- 可作为 P2 准备方向。
- 不影响当前 Phase B。

建议：O10=A，P2 记录 C 为候选方案。

## O11：Item/NPC 公开面验收时机

### A. P0.5 后再做（推荐）

Domain Acceptance 最小闭环后，再补 Item/NPC 空态、错误态、source/image fallback 测试。

影响：
- 公开面消费者不自定义准入口径。

### B. 与 P0.5 并行

前台 Item/NPC 验收和 Domain Acceptance 同时做。

影响：
- 可加速。
- 容易出现 readiness 口径还没定，前台先写死假设。

### C. 先做 Item/NPC

优先打磨用户面。

影响：
- 不建议，会弱化 Phase B 稳底座。

## O12：Item/NPC 验收范围

### A. 只补测试和小修（推荐）

范围：
- Item 详情 404、缺图、source 缺失、aggregate module 缺失。
- NPC 详情 loot/shop/buffs 空模块、moduleStatus warning、image fallback。
- 不新增 route。

影响：
- 风险低，符合 30% 低依赖功能。

### B. 同时重构页面结构

重构 Item/NPC 页面组件。

影响：
- 不建议，容易偏离验收目标。

### C. 加 Boss 筛选 UI

NPC list 增 Boss filter。

影响：
- 可作为 P2 candidate，不放入 P1。

## O13：P2 新公开域策略

### A. 只做方案和 readiness 条件（推荐）

P2 只写：
- Boss/NPC 聚合方案
- Buff/Projectile/ArmorSet 进入条件
- 不写代码

影响：
- 保持 Phase B 聚焦。

### B. Boss 先试点公开页

先做 Boss list/detail。

影响：
- 不建议。会绕过现有 planned-public 状态。

### C. Buff 先试点公开页

利用现有 buff 数据先做 Buff 页面。

影响：
- 不建议。Buff 当前只是 NPC detail 子模块，不等于独立公开资源。

## O14：报告 freshness 策略

### A. 默认 24 小时（推荐）

沿用 registry 当前 `staleAfterHours=24`。

影响：
- 与现有脚本一致。
- CI 可能因 stale reports 变 warning 或 blocked，需要 gate 策略配套。

### B. CI 忽略 freshness

CI 不看报告新鲜度。

影响：
- 不建议，会降低 acceptance gate 价值。

### C. CI 只阻断 public-blocking stale

普通 panel stale 为 warning，public-blocking panel stale/missing/unknown 为 blocking。

影响：
- 推荐和 A 配合。

## O15：CI 对 warning 的处理

### A. blocking 才红，warning 不红（推荐第一版）

CI 失败条件：
- blocking > 0
- unsafe command
- writesDatabase generator
- public-blocking missing/unknown

影响：
- 避免初期 CI 因历史 warning 长期红。

### B. warning 也红

任何 warning 都让 CI fail。

影响：
- 严格，但当前 relation warning 和 stale evidence 可能导致无法推进。

### C. 分任务处理

Domain acceptance dry-run warning 红，本地 full gate warning 红，CI 第一版 warning 不红。

影响：
- 更细，但文档复杂。

## O16：并行执行策略

### A. 串行主线 + 只读并行审计（推荐）

实现顺序串行：
P0-00 -> P0-01 -> P0-02a -> P0-02b -> P0.5a/b/c -> P1

只允许 read-only agent 并行审计。

影响：
- 避免同一页面、同一 DTO、同一 gate 脚本冲突。

### B. 多 agent 并行实现

同时实现 CI、Drilldown、Domain Acceptance、Item/NPC。

影响：
- 不建议，文件和契约冲突高。

### C. 分层并行

CI 与项目管理文档并行；Drilldown 后端与 Domain 脚本层并行。

影响：
- 可行但需要明确不碰共享文件。

## O17：提交粒度

### A. 每个任务卡一个提交（推荐）

例如：
- `docs: add phase b project management records`
- `ci: add quality gate workflow`
- `feat: add data source acceptance failure samples`

影响：
- 回滚和 review 简单。

### B. 每个 P0/P0.5 一个大提交

影响：
- 提交少，但 review 困难。

### C. 全部完成后一个提交

影响：
- 不建议，范围过大。

## O18：选项默认组合

推荐默认：

```text
O1=A
O2=C
O3=A
O4=A
O5=A
O6=C
O7=A
O8=A
O9=A
O10=A
O11=A
O12=A
O13=A
O14=A+C
O15=A
O16=A
O17=A
```

含义：
- Windows CI 起步。
- CI 第一版跑 safe gate，逐步靠近 full local gate。
- 先建项目管理记录。
- Drilldown 第一版扩 overview DTO，只读 reports。
- Domain Acceptance 升为 P0.5，三段串行。
- Item/NPC 只补验收测试和小修。
- 新公开域只做 readiness 方案。

---

## 问题汇总

### Q1：CI 是否需要跑完整后端 `mvn test`

风险：
- 后端测试可能隐式依赖 MySQL/Redis。
- 第一版 CI 可能长期红。

建议：
- 第一版先跑无 DB contract/unit tests。
- 本地 full gate 继续跑完整 `quality-gate.ps1`。

对应选项：
- O2=A 或 O2=C。

### Q2：Domain Acceptance dry-run 是否会因 stale reports 让 CI 红

风险：
- `--fail-on-warning=true` 和 24 小时 freshness 可能导致 CI 不稳定。

建议：
- CI 第一版 blocking 才红。
- public-blocking missing/unknown 仍红。

对应选项：
- O14=C，O15=A。

### Q3：Drilldown 样本是否需要实时 DB 查询

风险：
- 实时 DB 查询会绕过 evidence 链。

建议：
- 第一版只读 reports。
- 以后如加 DB diagnostic，必须 `notGateEvidence=true`。

对应选项：
- O5=A，O6=C。

### Q4：Boss 能不能先做公开页

风险：
- 当前 Boss 没有前台 route/view/API 契约。
- domain registry 仍是 `planned-public`。

建议：
- 只能作为 NPC 聚合/筛选候选方案。

对应选项：
- O10=A，O13=A。

### Q5：Buff 是否可以先独立公开

风险：
- Buff 当前主要作为 NPC detail 子模块展示。
- 不等于独立公开域 ready。

建议：
- 等 Domain Acceptance publicReadiness 和 imageReadiness 后再排期。

对应选项：
- O13=A。

### Q6：是否允许多 agent 并行实现

风险：
- CI 和 Domain Acceptance 都会碰 quality gate。
- Data Source 和 Domain 页面都在 operations 区域，页面契约容易冲突。

建议：
- 实现串行，只读审计并行。

对应选项：
- O16=A。

## 选择后的下一步

确认选项后，生成正式执行计划：

```text
docs/plans/2026-05-05_phase-b-stabilization-execution-plan.md
```

正式执行计划会按确认后的边界写成 checkbox 任务，并包含每个任务的：
- 文件范围
- 测试先行步骤
- 实现步骤
- 验证命令
- 提交范围
- 阻断条件
