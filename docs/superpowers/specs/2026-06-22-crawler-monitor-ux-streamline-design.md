# 爬虫监控界面优化方案（UX 精简 + 修日志）

- 日期：2026-06-22
- 分支：`feature/base-domain-orchestration-validation-2026-06-21`
- 范围：UX 信息分层精简 + 修复日志无法打开；**不含**大文件拆分等结构性重构
- 目标页面：`/operations/crawler-monitor`（`data-query-app/pages/operations/crawler-monitor.vue`）

---

## 1. 背景与目标

当前监控页信息过载，打开后无法一眼判断「系统是否正常 / 现在在跑什么 / 我要不要管」。同时调度日志（`.log`）点击无反应、打不开。

优化后要达到的体验：

1. **首屏 5 秒内可判断**四类关键信息（用户已确认四类全部要突出）：
   - 健康总览 / 告警（守护是否在跑、刷新是否停滞、有无失败/停滞/心跳异常）
   - 运行中任务进度（在爬什么、百分比、速度、ETA、心跳）
   - 派发队列状态（谁在跑、谁排队/被阻塞、最近终态）
   - 待我处理的动作（待确认/待审批的域、推荐恢复动作、一键重爬入口）
2. 次要信息（历史、报告列表、图片指标、自动派发设置、运行文件清单）默认折叠，不抢视觉。
3. **日志可以正常打开**：`.log` 可预览，且队列/动作里的日志路径可点击。

---

## 2. 现状诊断（含代码定位）

### 2.1 臃肿

`crawler-monitor.vue` 单文件 **5180 行**（模板 ~1100 行 / 脚本 ~1830 行 / 样式 ~2240 行）。模板纵向堆叠的顶层区块：

| 区块 | 行号 | 问题 |
| --- | --- | --- |
| 阶段进度 `stage-progress-panel` | 63 | 信息密度合理，应保留为首屏核心 |
| 派发队列与最近结果 | 180 | 应保留为首屏核心 |
| **运行态 `monitor-observability`** | 228 | **一个 section 塞了 8 个块**：运行文件 / 派发状态 / 自动派发设置 / 心跳告警 / 运行历史 / 报告 / 图片指标，全部默认展开、同等权重 —— 主要臃肿来源 |
| 域工作台 / 域进度 / 域详情 / 待确认 / 域快速定位 | 374–955 | 仅在「展开执行」时显示，但展开后同样是长瀑布流 |
| 任务进度明细 | 958 | 与「阶段进度」信息重叠，需确认是否合并 |

首屏摘要卡 `focusedSummaryCards`（`crawler-monitor.vue:1332`）目前是 4 张：当前活动 / 总进度 / 待处理 / 异常 —— 方向对，但「健康总览」维度（守护进程、刷新停滞、调度锁）没有进卡片，被埋在「运行态 > 运行文件」里。

### 2.2 日志打不开（确认为代码缺陷）

根因有三处，缺一不可：

1. **后端白名单不含 `.log`** —— `CrawlerReportArchiver.java:330-333`：
   ```java
   return fileName.endsWith(".json")
       || fileName.endsWith(".md")
       || fileName.endsWith(".xml")
       || fileName.endsWith(".txt");   // 缺 .log
   ```
2. **前端可预览判断不含 `.log`** —— `crawler-monitor.vue:2734` `isPreviewableReportPath` 的 `allowedSuffix` 同样只有 `.json/.md/.xml/.txt`；`openReportPreview`（1596 行）开头：
   ```js
   if (!isPreviewableReportPath(path) && !isPreviewableProgressPath(path) && !isPreviewableGeneratedJsonPath(path)) return
   ```
   `.log` 三个判断都不通过 → 静默 return，点了没反应。
3. **日志路径根本不可点** —— 队列项的路径列表 `queueItemPathEntries`（`crawler-monitor.vue:1898`）返回的「日志/报告/进度/锁」只在模板（200 行）里渲染成纯文本 `<code>`，没有 `@click`。

> 注：日志文件实际产出在 `reports/crawler-monitor/*.log`（后端 `CrawlerMonitorServiceImpl.java:1141/1909/2058`），路径前缀 `reports/` 已在后端 `getReportDetail` 允许的根目录内，**只差后缀白名单**。

---

## 3. 优化方案

分三块：A 信息分层（解决臃肿）、B 修日志、C 降噪折叠。三块相互独立，可分别提交。

### A. 首屏信息分层

**A1. 健康总览条（新增，置顶）**
在标题栏下、摘要卡之前，新增一行紧凑「健康灯」：守护进程、调度、锁、刷新活跃度、心跳告警数、失败任务数。每项一个状态点（绿/黄/红）+ 一句话。数据已存在：
- 守护/调度/锁：`overview.daemon/scheduler/lock`（已有 `runtimeStateCards`）
- 刷新停滞：`refreshStale` / `refreshStaleReason`（模板 3 行已有告警，可复用其判断）
- 心跳告警数：`staleHeartbeatRows.length`
- 失败/停滞任务数：从 `progressRows` 聚合

实现方式：新增 computed `healthSignals`（聚合上述字段为 `{key,label,tone,detail}[]`），模板用一行 `health-strip` 渲染。**纯前端聚合，不需要后端改动。**

**A2. 摘要卡保留并对齐四类**
`focusedSummaryCards` 维持 4 张，但语义对齐用户确认的四类：运行中进度 / 派发队列(在跑+排队) / 待处理动作 / 异常。健康总览由 A1 承载。

**A3. 三段式主区**
首屏从上到下固定为三段，其余全部进 C 的折叠区：
1. 健康总览条（A1）+ 摘要卡（A2）
2. 阶段进度（现有 `stage-progress-panel`，保留）
3. 派发队列与最近结果（现有，保留）

### B. 修复日志打开（核心修复）

**B1. 后端**：`CrawlerReportArchiver.java` 的可预览后缀判断加入 `.log`（330-333 行）。`.log` 走纯文本读取分支（`contentType` 归类为 `text`，复用现有 `readPreviewBytes` + 200KB 截断逻辑，参考 422 行 `.txt` 分支）。

**B2. 前端可预览判断**：`isPreviewableReportPath`（`crawler-monitor.vue:2734`）`allowedSuffix` 加入 `.log`。需限定根目录为 `reports/crawler-monitor/`，避免放开任意 `.log`。

**B3. 日志路径变可点击**：`queueItemPathEntries` 渲染处（模板 199-203 行）把 `<code>` 换成调用 `openReportPreview(entry.path)` 的按钮；对 `.log` 且不可预览的项给禁用态 + tooltip 说明原因。动作行/域详情里同样模式的纯文本路径一并处理。

**B4. 截断提示**：日志通常很大，预览抽屉已有 `truncated` + `maxBytes` 提示（模板 1091 行），`.log` 复用即可；底部加「在文件系统打开完整日志」的路径提示（不引入新接口）。

### C. 降噪与折叠

**C1. 「运行态」拆成可折叠分组**：把当前 8 个块按重要性分两层——
- 默认可见：心跳告警（有告警时）、派发状态
- 默认折叠（`<details>` 或「展开更多」）：运行文件、自动派发设置、运行历史、报告、图片指标

**C2. 任务进度明细 vs 阶段进度**：二者信息重叠。方案：把「任务进度明细」（958 行）降级为折叠区，默认收起；首屏只留「阶段进度」。（实现时确认两者数据源差异，若完全重叠则直接移除明细。）

**C3. 空态收敛**：各 `empty-line` / `empty-block` 在无数据时不占整块高度，合并为一行灰字。

---

## 4. 改动清单

| # | 文件 | 位置 | 改动 |
| --- | --- | --- | --- |
| B1 | `back/.../CrawlerReportArchiver.java` | ~330 | 可预览后缀加 `.log`；contentType 归 text |
| B1 | 后端测试 | `CrawlerReportArchiverTest`（若存在） | 新增 `.log` 可读用例 |
| B2 | `crawler-monitor.vue` | 2734 | `isPreviewableReportPath` 加 `.log`（限 `reports/crawler-monitor/`）|
| B3 | `crawler-monitor.vue` | 199-203 等 | 日志路径渲染为可点按钮，接 `openReportPreview` |
| A1 | `crawler-monitor.vue` | 脚本新增 `healthSignals` computed；模板顶部新增 `health-strip` | |
| A2 | `crawler-monitor.vue` | 1332 | `focusedSummaryCards` 语义对齐四类 |
| C1 | `crawler-monitor.vue` | 228-366 | 「运行态」次要块折叠 |
| C2 | `crawler-monitor.vue` | 958 | 「任务进度明细」降级折叠 / 评估移除 |
| 样式 | `crawler-monitor.vue` `<style>` | 2938+ | 新增 health-strip、折叠区样式 |

---

## 5. 验收标准

- [ ] 打开页面，首屏（不滚动）可同时看到：健康总览条、四类摘要卡、阶段进度、派发队列。
- [ ] 队列项「日志」可点击；点击后预览抽屉显示 `.log` 内容（大文件截断并提示）。
- [ ] `.log` 之外的越权路径仍被拒绝（安全回归）。
- [ ] 「运行态」次要块默认折叠，展开后内容与改动前一致。
- [ ] 现有契约测试通过：`data-query-app/tests/crawler-monitor-page-contract.test.mjs` 及后端 `CrawlerMonitorServiceImplTest`。

## 6. 测试策略

遵循既有偏好（行为测试优先于 .vue 源码匹配；离线/可注入优先于真实网络）：

- 后端：单元测试覆盖 `.log` 读取 + 越权路径拒绝（注入临时 repoRoot）。
- 前端：在 `crawler-monitor-page-contract.test.mjs` 增加行为断言——给定含 `logPath` 的队列项，渲染出可点击日志入口；点击触发 report 接口调用（mock）。
- 不针对样式/排版做源码字符串匹配测试。

## 7. 风险与回滚

- **风险**：放开 `.log` 预览可能读到大日志 → 已有 200KB 截断，限定 `reports/crawler-monitor/` 根。
- **风险**：折叠次要信息后，老用户找不到入口 → 折叠区保留清晰标题 + 计数徽标。
- **回滚**：A/B/C 三块独立提交，任意一块可单独 revert。

## 8. 明确不在本次范围

- 5180 行 `.vue` 拆分为多组件（可作为后续独立方案）。
- 新增后端日志接口 / 流式日志 / 实时 tail。
- 派发队列、自动派发等业务逻辑改动。
