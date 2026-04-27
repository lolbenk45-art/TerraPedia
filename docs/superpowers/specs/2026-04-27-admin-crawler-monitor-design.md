# 后台爬取监控页设计

日期：2026-04-27

## 目标

在 Buff 三层维护实施前，先在管理后台新增一个只读监控页面，用来实时查看数据刷新和爬取链路的运行状态、阶段进度、任务数量、失败样本、日志入口和历史运行情况。

第一版不重写旧爬虫。已有 `scripts/data/fetch/**`、`scripts/data/pipeline/**`、`scripts/data/workflow/run-backend-data-refresh*.mjs` 继续负责实际抓取和同步；新页面只增加统一的监控读取层，让后续 Buff、NPC、Boss、Projectile、Biome、Recipe 等细分任务都能用同一套展示结构。

## 成功标准

- 管理后台出现新页面：`/operations/crawler-monitor`。
- 侧边栏 Operations 分组出现入口，名称为“爬取监控”或同义名称。
- 页面可以读取后端监控接口，展示：
  - daemon / scheduler 主状态
  - 最后心跳、上次运行、下次计划运行
  - 当前或最近 run 的 action 阶段
  - completed / failed / running / pending / timed out 数量
  - action 明细列表
  - lock / heartbeat / state / report 文件状态
  - 最近 history summary 列表
- 页面可手动刷新，并支持前端定时刷新。
- 后端接口只读，不触发爬取、不写数据库、不修改 report 文件。
- 监控展示结构按 `task/action/stage/metric` 动态渲染，不把 Buff、NPC、Boss 等类别硬编码成固定页面结构。
- 数据可靠性原则写清楚：业务事实优先来自 `maint`，规范关系来自 `relation`，展示投影来自 `projection/local`；运行状态来自 run/report/log。

## 不在本轮范围

- 不实现 Buff 三层业务表、relation 生成或 projection 写入。
- 不新增真正的爬虫任务。
- 不把旧爬虫改造成完整 run registry。
- 不提供“立即执行全量/局部任务”的按钮行为。第一版最多展示禁用态或只读说明。
- 不写入数据库中的 `pipeline_run` 表。该表是后续演进方向，不作为第一版依赖。

## 当前事实

后台应用是 Nuxt，位于 `data-query-app`：

- 布局和侧边栏入口：`data-query-app/layouts/default.vue`
- API helper：`data-query-app/composables/useApi.ts`
- 现有只读运维风格页面参考：`data-query-app/pages/recipes/wiki-zh-import.vue`

后端应用是 Spring Boot，位于 `back`：

- Admin API 使用 `ApiResponse<T>` 包装。
- 已有只读报告页面接口参考：`back/src/main/java/com/terraria/skills/controller/AdminWikiZhRecipeImportController.java`
- 可使用 Jackson `ObjectMapper` 读取 JSON 文件。

已有刷新运行态文件：

- `reports/backend-refresh/backend-refresh-daemon.heartbeat.json`
- `reports/backend-refresh/backend-refresh-scheduler.latest.json`
- `reports/backend-refresh/backend-refresh.lock.json`
- `reports/backend-refresh/history/backend-data-refresh-*.summary.json`
- `reports/backend-refresh/history/backend-data-refresh-*.json`

已有刷新脚本能力：

- `scripts/data/workflow/run-backend-data-refresh.mjs`
- `scripts/data/workflow/run-backend-data-refresh-daemon.mjs`
- `scripts/data/workflow/backend-data-refresh-plan.mjs`
- `scripts/data/workflow/backend-refresh-runtime-state.mjs`
- `scripts/data/workflow/backend-refresh-summary.mjs`

## 设计原则

### 复用旧爬虫

旧爬虫继续是抓取和同步的真实执行入口。新监控页不直接调用旧爬虫，也不要求旧爬虫立刻重构。

第一版通过读取现有 report、state、heartbeat、lock 文件建立统一监控视图。后续如果要支持更细的实时日志和指标，再在旧爬虫外层补 `pipeline runner / adapter`，统一登记：

```text
runId
taskType
stage
source
startedAt / endedAt
success / failed / skipped / changed
reportPath
errorSamples
affectedEntityKeys
```

### 数据来源可靠性

监控页必须区分“业务可信来源”和“执行状态来源”：

- `maint`：业务事实和来源证据核心层，适合回答“数据从哪里来、是否可靠”。
- `relation`：规范关系层，适合回答“关系生成了多少、冲突多少、低置信候选多少”。
- `projection/local`：运行时消费层，适合回答“最终投影是否成功写入、前后台是否可消费”。
- `run/report/log`：执行审计层，适合回答“爬虫现在跑到哪、失败在哪里、是否有锁冲突”。

第一版监控页以 `run/report/log` 为主，因为本轮目标是监控执行情况。未来 Buff 三层落地后，再把 `maint/relation/projection` 的业务计数补进同一页面。

### 动态任务结构

页面不按固定类别写死，而按任务数组渲染：

```text
run
  -> actions[]
      -> id
      -> runner
      -> status
      -> timeoutMs
      -> durationMs
      -> heartbeatPath
      -> snapshotPath
      -> updatedAt
```

后续新增 `buff-source-sync`、`npc-attack-buff-sync`、`boss-debuff-sync` 等任务时，只要 report 里有 action，页面就能显示，不需要改页面主体。

## 推荐方案

采用混合方案：

1. 第一版后端读取现有文件系统报告，返回统一 DTO。
2. 第一版前端展示只读监控面板和自动刷新。
3. 后续再把旧爬虫外层逐步接入 run registry，但不阻塞当前页面上线。

这个方案能最快落地，同时不会破坏已有爬虫和三层数据设计。

## 后端接口设计

新增：

```text
GET /admin/crawler-monitor/overview
```

返回结构：

```json
{
  "generatedAt": "2026-04-27T00:00:00Z",
  "repoRoot": "G:/ClaudeCode/TerraPedia-dev",
  "daemon": {
    "found": true,
    "status": "sleeping",
    "generatedAt": "2026-04-22T21:01:09.185Z",
    "pid": 163452,
    "activeChildPid": 0,
    "lastActionId": null,
    "lastOutputPath": null,
    "path": "reports/backend-refresh/backend-refresh-daemon.heartbeat.json"
  },
  "scheduler": {
    "found": true,
    "status": "sleeping",
    "generatedAt": "2026-04-22T18:26:06.668Z",
    "lastTrigger": "scheduled",
    "lastStartedAt": "2026-04-22T18:26:06.471Z",
    "lastCompletedAt": "2026-04-22T18:26:06.664Z",
    "lastExitCode": 0,
    "nextPlannedAt": "2026-04-22T21:26:06.470Z",
    "lastOutputPath": "reports/backend-refresh/history/backend-data-refresh-2026-04-22T18-26-06-471Z.json",
    "lastSummaryPath": "reports/backend-refresh/history/backend-data-refresh-2026-04-22T18-26-06-471Z.summary.json"
  },
  "lock": {
    "found": false,
    "path": "reports/backend-refresh/backend-refresh.lock.json",
    "payload": {}
  },
  "latestRun": {
    "found": true,
    "path": "reports/backend-refresh/history/backend-data-refresh-2026-04-22T18-26-06-471Z.json",
    "summaryPath": "reports/backend-refresh/history/backend-data-refresh-2026-04-22T18-26-06-471Z.summary.json",
    "summary": {
      "totalActions": 10,
      "completedActions": 10,
      "failedActions": 0,
      "runningActions": 0,
      "pendingActions": 0,
      "timedOutActions": 0,
      "totalDurationMs": 120000
    },
    "actions": []
  },
  "history": []
}
```

第一版后端实现细节：

- 用 service 封装文件读取和路径解析，controller 只调用 service。
- 路径解析优先从当前工作目录向上查找 repo root。
- 文件不存在时返回 `found=false`，不抛 500。
- JSON 解析失败时返回 `found=true`、`readable=false`、`errorMessage`，页面展示为异常。
- history summary 限制最近 10 条。
- action 列表优先读取 latest full report 的 `actions`，没有 full report 时使用 summary 的总数。

## 前端页面设计

新增页面：

```text
data-query-app/pages/operations/crawler-monitor.vue
```

页面分区：

- 顶部状态条：daemon 状态、最后心跳、当前 action、下次计划运行、锁状态。
- 阶段概览：从 latest run actions 动态生成 action 卡片。
- 数量卡片：total / completed / failed / running / pending / timed out。
- 当前任务表：action id、runner、status、duration、timeout、updatedAt、snapshot/heartbeat 路径。
- 最近历史：最近 summary 文件列表，展示开始时间、总 action、失败数、耗时、报告路径。
- 文件健康：daemon heartbeat、scheduler state、lock、latest report 是否存在、是否可读。
- 刷新控制：手动刷新按钮、自动刷新开关或固定 10 秒刷新。

UI 风格：

- 使用现有后台的 `section-card`、`workspace-shell`、`btn` 等样式体系。
- 使用 `lucide-vue-next` 图标。
- 保持运维页面信息密度，不做营销式 hero。
- 移动端布局降为单列，表格保留横向滚动。

## 可靠性和错误处理

- 后端接口永远返回结构化 payload；单个文件坏了不影响其他文件读取。
- 前端请求失败时显示错误状态和重试按钮。
- 文件缺失显示“未发现”，不能显示为 0 成功，避免误判。
- 状态颜色不能只靠颜色表达，必须同时有文本。
- stale heartbeat 第一版只展示时间，不强行判断死亡；后续可按阈值增加 stale 状态。

## 验证计划

后端：

- 新增 service 单元测试，覆盖：
  - heartbeat / scheduler / summary / full report 都存在时能聚合。
  - lock 文件不存在时返回 `found=false`。
  - JSON 文件损坏时返回可展示的 read error。
  - history 只返回最近 10 条。
- 新增 controller 测试，确认 `/admin/crawler-monitor/overview` 返回 `success=true` 和核心字段。

前端：

- 新增类型文件或页面内类型，确保 `pnpm run check` 通过。
- 页面空数据、缺失文件、失败 action、运行中 action 都有稳定显示。

最小验证命令：

```powershell
cd back
mvn "-Dtest=AdminCrawlerMonitorControllerTest,CrawlerMonitorServiceImplTest" test

cd ..\data-query-app
pnpm run check
```

## 风险

- 现有 report summary 可能只包含聚合数量，不包含完整 action 明细；页面必须兼容 action 为空。
- 当前 `reports/backend-refresh` 中的样例状态可能已经过期；页面不能把旧时间误报成正在运行。
- 部分已有文件使用绝对路径；接口返回前应尽量相对 repo root 展示，避免页面过长。
- 第一版只读监控不能解决“旧爬虫没有细分指标”的问题，只能把已有运行态统一展示出来。

## 设计结论

第一版应实现一个只读的后台爬取监控页，复用现有爬虫、刷新 daemon、state、heartbeat、summary 和 report 文件。

业务数据可靠性继续由三层结构保证：`maint` 保存事实来源，`relation` 保存规范关系，`projection/local` 保存消费投影。监控页本身不越过三层结构造业务事实，只展示执行审计和已有核心层计数的入口。后续新增更多细分爬取任务时，通过统一 action/run 结构扩展，而不是重写页面。
