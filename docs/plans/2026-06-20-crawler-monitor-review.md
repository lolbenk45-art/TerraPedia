# 爬虫监控页面审查与加固计划（2026-06-20）

> 审查范围：`feature/main-followup-2026-06-19` 分支当前最新的爬虫监控全栈实现。
> 本文件只做评审与方案设计，**不改动任何代码**。所有"位置"均为评审时的行号，实施前请以最新代码为准。

## 0. 涉及文件

| 层 | 文件 |
| --- | --- |
| Controller | `back/.../controller/AdminCrawlerMonitorController.java` |
| Service | `back/.../service/impl/CrawlerMonitorServiceImpl.java`（3157 行，核心派发/进程控制） |
| Archiver | `back/.../service/impl/CrawlerReportArchiver.java`（报告预览/路径校验） |
| 鉴权 | `back/.../auth/AdminAuthenticationInterceptor.java`、`config/WebConfig.java` |
| CORS | `back/.../config/CorsConfig.java` |
| 限流 | `back/.../security/HttpRateLimitInterceptor.java` |
| 异常 | `back/.../handler/GlobalExceptionHandler.java` |
| 前端 | `data-query-app/pages/operations/crawler-monitor.vue`（3755 行） |

## 1. 已确认安全的部分（无需改动，记录在案）

- **鉴权已生效**：`/admin/**` 由 `AdminAuthenticationInterceptor` 在 `/**` 上拦截并校验 Admin JWT。Controller 上的 `@SecurityRequirement` 只是 Swagger 文档注解，但真正的拦截器存在，端点不裸奔。
- **路径穿越已防护**：`getReportDetail`→`resolvePayloadPathInsideRepo` 做 `normalize()` + `startsWith(repoRoot)`，并通过 `toRealPath()` 防软链逃逸，且白名单限制到 `reports/`、`surefire-reports/`、`data/generated/`、`raw/wiki/*.json`。
- **命令注入不成立**：派发命令来自固定的 `WIKI_MONITOR_RULES` 白名单常量，用户只能传 `domain`/`actionId` 做匹配，无法注入参数；`ProcessBuilder` 不经过 shell。
- **无 XSS**：前端报告预览未使用 `v-html`，纯文本绑定。
- **派发已限流**：`POST /admin/**` 命中 `admin-write` 限流档位。
- **派发并发有原子锁**：`acquireDispatchLock` 用 `CREATE_NEW` 原子创建锁文件，防止同时双发。
- **定时器有清理**：前端 `onUnmounted` 中 `clearRefreshTimer()`。

---

## 2. 发现的问题（按严重度排序）

### 🔴 H1. 子进程无超时/无僵死处理，叠加 2h 锁过期会导致重复并发

- **位置**：`CrawlerMonitorServiceImpl.buildLaunchRequest` / `ProcessBuilderLauncher.launch`（L3142）；`watchDispatchProcess`（L790）阻塞在 `process.waitFor()`；`WIKI_MONITOR_DISPATCH_LOCK_STALE = Duration.ofHours(2)`（L68）；`releaseStaleDispatchLock`（L648）。
- **问题**：派发的爬虫进程没有最大运行时长限制。若进程卡死，watcher 线程会永久 `waitFor`，进程不会被回收；同时 2 小时后 `releaseStaleDispatchLock` 会把锁文件删除，从而允许**再次派发同一 domain**——于是同一任务出现两个并发进程，争抢同一输出文件/产生脏数据。
- **风险**：资源泄漏、重复写入、数据不一致。
- **方案**：
  1. 在 `LaunchRequest` 增加超时（如默认 90min，可按 actionId 配置），watcher 线程用 `process.waitFor(timeout, unit)`，超时则 `destroy()` 全部子孙进程并把状态写为 `failed/timed_out`。
  2. 锁过期时间应 **≥ 进程最大超时**，且过期释放锁前先确认对应进程确实不存活（结合 H2 的归属校验），否则不释放。
  3. watcher 退出 `finally` 中已释放锁，确保超时分支也走到。

### 🔴 H2. `controlWikiMonitorDispatch` 的"遗留进程"扫描会误暂停/误杀无关进程

- **位置**：`controlWikiMonitorDispatch`（L236）→ `processLauncher.findLegacyProcess`（L2992）；`commandMatches`（L3065）；`sendSignal`/`destroy`（L3008-3054）。
- **问题**：当内存中找不到被跟踪进程时，会扫描 `/proc` 下**所有**存活进程，凡 cwd==repoRoot 且 cmdline 含规则关键字（脚本路径+参数）就认定为目标，执行 `kill -STOP/-CONT` 或销毁该进程及其所有子孙。没有"该进程由本后端启动"的归属校验。
- **风险**：开发者手动跑的同名脚本、或恰好匹配关键字的进程会被暂停/杀死；多 worktree/多实例场景误伤面更大。
- **方案**：
  1. 记录派发进程的 PID + 启动时间戳到锁/状态文件，控制时按 PID 精确匹配，而非按 cmdline 模糊扫描。
  2. 保留 `/proc` 扫描作为兜底时，至少校验进程启动时间晚于本派发 `startedAt`，并要求 cmdline 含本派发专属的 `--run-id`/`dispatchId`。
  3. 杀子孙进程前在日志中记录将影响的 PID 列表（审计）。

### 🟠 M1. 重启后运行中的派发会"失联"，控制不可靠

- **位置**：内存态 `activeDispatchProcesses` / `cancellingDispatches`（L118-119）。
- **问题**：进程跟踪只存在内存。后端重启后，正在跑的派发变成孤儿：锁文件仍在（要等 2h），状态仍是 `running`，pause/resume/cancel 找不到进程而退回到 H2 的 `/proc` 扫描，行为不确定。
- **风险**：重启后无法可靠控制在跑任务；UI 显示"运行中"但实际失控。
- **方案**：
  1. 锁/状态文件持久化 PID + 启动时间；启动时做一次"恢复对账"：用 PID 校验进程是否仍存活，存活则重建跟踪记录，不存活则把状态收敛为 `failed/orphaned` 并释放锁。
  2. 中长期：把派发注册表迁到 Redis（项目已有 `StringRedisTemplate`），实现跨实例/跨重启的统一状态。

### 🟠 M2. "终止并清理文件"未真正清理产物（UI 承诺 vs 后端行为不一致）

- **位置**：前端取消面板标题"终止并清理文件"，`cancelCleanupPaths`（vue L1056）列出将清理的路径；后端 `controlWikiMonitorDispatch` 的 `cancel` 分支（L279-312）只做：杀进程→写状态→释放锁，**未删除** report/log/output 文件。
- **风险**：用户以为取消会清理脏产物，实际残留半成品文件，可能被下游误当成有效快照。
- **方案**：确认产品预期。若需清理，在 cancel 分支中按白名单删除本 `dispatchId` 对应的 report/log/output（仅限 `reports/crawler-monitor/<dispatchId>*` 等本任务命名空间，复用 `resolvePayloadPathInsideRepo` 校验）；若不清理，则改前端文案，避免误导。

### 🟠 M3. `/overview` 过重且被高频轮询，磁盘 IO 压力大

- **位置**：`getOverview`（L158）每次调用都做大量磁盘操作；`CrawlerReportArchiver.loadRecentReports`（L86）对 `reports/` 与 `surefire-reports/` 执行 **`Files.walk` 递归遍历**收集全部报告文件再按 mtime 排序；`buildArchitectureLayers`/`buildRegisteredTasks` 读取数十个 JSON。前端 `activeRefreshIntervalMs` 在有活动时 **3 秒**轮询一次（vue L895）。
- **风险**：多管理员同时打开页面时，每 3s 全量遍历 `reports/` 目录树，磁盘/CPU 压力显著，响应变慢。
- **方案**：
  1. 给 `getOverview` 加短 TTL 缓存（如 2–3s），或对 `loadRecentReports` 的目录遍历结果做缓存 + mtime 失效。
  2. `loadRecentReports` 用 `Files.newDirectoryStream`/限定深度替代全树 `Files.walk`；按目录已知结构精确取最近文件，避免全量扫描。
  3. 后端支持 `ETag`/`Last-Modified`，前端带条件请求；活动时也可把最快轮询放宽到 5s。

### 🟠 M4. 前端轮询不随页面隐藏暂停，鉴权失效后无退避

- **位置**：`syncAutoRefresh`（vue L1584）；`loadOverview` 错误分支（vue L1114-1119）。
- **问题**：
  - 标签页切到后台仍按 3–10s 轮询（无 `document.hidden`/`visibilitychange` 处理）。
  - Token 过期后每个轮询周期都报 401 并弹一次 toast，无停止、无退避，造成 toast 轰炸且持续打无效请求。
- **方案**：
  1. 监听 `visibilitychange`，隐藏时暂停定时器，恢复时刷新一次再恢复。
  2. `loadOverview` 命中 401/403 时停止自动刷新并提示重新登录；其它错误用指数退避，连续失败时降频。

### 🟡 L1. CORS 允许携带凭证且来源模式过宽

- **位置**：`CorsConfig`：`addAllowedOriginPattern("http://172.*:*")` 等 + `setAllowCredentials(true)`。
- **问题**：`172.*` 实际覆盖了公网 172.x（私网仅 172.16–31）；`10.*`/`192.168.*` 也较宽。叠加 `allowCredentials(true)`，匹配来源的页面可发起带凭证请求（仍需有效 token，故风险有限）。
- **方案**：把私网段收窄为精确 CIDR 对应的模式（如 `172.(1[6-9]|2[0-9]|3[01]).*`），生产环境用显式白名单 origin，避免通配 + 凭证组合。

### 🟡 L2. 鉴权无角色/权限分级

- **位置**：`AdminAuthenticationInterceptor.requiresAuthentication`（L54）只校验"是否为合法 Admin"，不区分角色。
- **问题**：任何合法 admin 都能派发/取消爬虫、（经 H2）暂停或杀进程。若存在只读/初级管理员，会获得全部高危操作权限。
- **方案**：对派发/控制类端点（`/dispatch`、`/dispatch/control`、`/test-domain-smoke`、`PUT /test-state`）增加角色/权限校验（从 `AdminTokenClaims` 取角色），区分"查看"与"操作"。

### 🟡 L3. 异常信息向客户端泄漏内部细节

- **位置**：`GlobalExceptionHandler` 通用分支返回 `"系统错误：" + e.getMessage()` / `"运行时错误："`；`writeJsonFile`（L835）等抛出的 `IllegalStateException` 内含绝对路径。
- **风险**：向前端泄漏服务器绝对路径、内部实现细节（信息泄露，低危）。
- **方案**：通用 5xx 返回脱敏文案 + 服务端日志保留堆栈与请求 ID（项目已有 `RequestIdFilter`），不把 `e.getMessage()` 直接回传。

### 🟡 L4. 派发日志/产物目录无清理与轮转

- **位置**：`reports/crawler-monitor/*.log`、`wiki-monitor-dispatch-*.log`、每次 smoke 的 `reports/crawler-monitor/<dispatchId>/`。评审时该目录已有 20+ 个 `.log` 文件。
- **风险**：长期运行磁盘只增不减。
- **方案**：增加保留策略（按数量/时长清理旧 dispatch 产物与日志），或纳入现有日志轮转。

### 🟡 L5. `PYTHON` 环境变量作为可执行文件未校验

- **位置**：`resolvePythonExecutable`（L777）直接用 `System.getenv("PYTHON")` 作为 town-npc-maintenance 规则的 argv[0]。
- **风险**：非注入（无 shell），但被污染的环境可指向任意二进制（低危，部署面问题）。
- **方案**：对配置的解释器路径做存在性/白名单校验，或固定为部署内已知路径。

### 🟢 N1. 次要项（记录，可选）

- **N1a TOCTOU**：`isInCooldown` 未持锁读取派发文件，`releaseStaleDispatchLock`+`acquireDispatchLock` 为两步；冷却判断存在竞态（双发由 `CREATE_NEW` 兜底，影响很小）。
- **N1b 线程模型**：每次派发 `new Thread` 起一个 watcher，建议改用命名线程池便于观测/限流（当前全局单锁已串行化，影响小）。
- **N1c 报告预览**：`openReportPreview` 连续切换无请求取消，快速点选可能出现旧响应覆盖；可加请求序号/AbortController。

---

## 3. 分阶段执行清单

> 建议每阶段独立 PR，配套单测（项目已有 `CrawlerMonitorServiceImplTest`、`crawler-monitor-page-contract.test.mjs`，可扩展）。

### 阶段一：安全与正确性（高优先，先做）
- [ ] **H1** 子进程超时回收 + 锁过期时间对齐超时 + 过期前校验存活
- [ ] **H2** 进程控制改为 PID 精确归属匹配，弃用/收紧 `/proc` 模糊扫描
- [ ] **M2** 对齐"终止并清理文件"语义（要么真清理白名单产物，要么改文案）
- [ ] 验收：用慢/卡死的假 runner 验证超时回收；手动起同名脚本验证不被误杀；取消后核对产物状态

### 阶段二：健壮性（重启与失联）
- [ ] **M1** 锁/状态文件持久化 PID+启动时间，启动时做恢复对账（孤儿收敛为 failed）
- [ ] **L4** 日志/产物保留与清理策略
- [ ] 验收：派发运行中重启后端，确认状态收敛、控制可用、锁不会卡 2h

### 阶段三：性能与体验
- [ ] **M3** `getOverview` 加短 TTL 缓存；`loadRecentReports` 去掉全树 `Files.walk`；支持 ETag/条件请求
- [ ] **M4** 前端隐藏标签暂停轮询 + 401 停轮询/失败退避
- [ ] 验收：多页签并发下观察后端磁盘/CPU；切后台无请求；token 过期不再 toast 轰炸

### 阶段四：纵深防御（低优先）
- [ ] **L1** 收窄 CORS 私网模式，生产用显式白名单
- [ ] **L2** 派发/控制端点增加角色权限校验
- [ ] **L3** 5xx 响应脱敏，内部细节仅入日志
- [ ] **L5** 校验 `PYTHON` 解释器路径
- [ ] **N1a/b/c** 视情况处理

---

## 4. 一句话结论

核心安全面（鉴权、路径穿越、命令注入、XSS、限流）已守住；**真正的风险集中在运行时进程生命周期管理**——无超时回收（H1）、进程控制归属过宽（H2）、重启后失联（M1），以及**高频轮询下 `/overview` 的磁盘开销**（M3）。建议按"阶段一 → 阶段二 → 阶段三"的顺序推进。
