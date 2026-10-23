# PC 版本更新候选清单实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task with focused validation. Track task progress with checkboxes.

**Goal:** 监测 Terraria Desktop/PC 新版本，并在后台生成临时更新候选，让人工确认各项是否已处理。

**Architecture:** 独立的 PC 版本探针读取 Wiki 当前版本和 Desktop 历史页面，只解析新发布的 PC 版本，不调用任何域爬虫。后端维护可跨重启保留的临时状态文件，管理端在爬取监控页单独展示；现有爬虫指纹检查继续独立运行。

**Tech Stack:** Node.js ESM、共享 Wiki 请求门、Spring Boot、现有 Nuxt 管理端。

---

## 工作区与分支

- 分支：`feat/pc-version-update-triage`
- Worktree：`/home/lolben/TerraPedia/.worktrees/pc-version-update-triage`
- 基线：`main@42ab9d1a7bcd939b2831bff20773e90383b78902`（创建时与 `origin/main` 相同）
- 新分支当前 HEAD 与 `main` 基线一致。原工作区未提交的数据、报告、计划和 devlog 改动仍留在原工作区，没有带入本分支。
- 后续实施和验证都在上述 worktree 进行；不要切换原工作区，也不要复制原工作区的未提交文件。
- 会话分工：本功能只在此分支/worktree 实施；用户另开 `main` 会话继续 V2 自动化入库问题。两项任务分别维护自己的分支和 devlog，不交叉编辑工作文件。本任务不启动/停止共享本地服务，不操作共享数据库。

## 已确认需求与默认值

- 只监测 Desktop/PC 版本。主机、移动端及其他平台版本不生成候选。
- 是否生成新候选只由 PC 版本号推进决定。页面 revision、时间戳、内容 hash 和来源指纹只作为出处，不触发本功能；版本号未变时，页面编辑不创建新版本候选。
- 每 6 小时检查当前版本页和 Desktop 历史页；另提供管理员手动检查入口，两者共用同一探针和互斥锁。这个调度只读版本/公告页并写入临时候选，和普通爬虫自动派发调度分离。
- 初始游标固定为已核实的 Desktop `1.4.5.8`（计划编写时当前版本页 revision `1032950`）。首次运行时按顺序补查之后发布的 PC 版本，不把部署时碰巧读到的版本直接当作基线。
- 人工状态按“公告条目 × 映射目标”分别记录。管理员可以标记为 `handled`，也可以撤销误标回到 `pending`。处理人来自已认证管理员身份，时间由服务端生成；备注可选。
- 新版本到来不能覆盖旧版本尚未处理的候选，也不能清除既有人工状态。
- `handled` 只代表人工确认，不代表正式数据库已有对应修改，也不启动爬虫。
- 未映射和非八域数据公告仍在后台可见并带来源链接，但不附域/实体目标；不提供域派发操作。
- 不发送外部通知，不写正式域数据，不新增数据库 schema。
- 只使用有证据的精确实体映射：公告中的 Wiki 链接目标必须在维护的域身份目录中唯一命中。目标身份歧义或不在目录中时不猜测，保留为未映射信息。只有公告明确说明字段时才标字段；未说明时显示“公告未注明”，仍可由人工确认实体更新是否已处理。任何匹配都不触发域任务。

## 已核实的来源证据

- Wiki `Template:Current versions` 的 revision `1032950` 声明 Desktop/PC 版本为 `1.4.5.8`。
- Wiki 版本页 `1.4.5.8` 的 page ID 为 `80144`、revision 为 `1029883`。Desktop version-history revision `1023996` 将其列为 `2026-08-23` 发布的 hotfix。
- 该版本页有 2 项内容变更和 12 项修复。初步精确名称匹配涉及 Items、Projectiles、NPCs；这些仍需逐条通过映射测试。没有发现明显直接涉及 Audio、Armor Sets 或 Shimmer 结构化数据的条目。
- 先前的限量采样证据位于另一 worktree 的本地忽略文件中。实施时需重新读取 Wiki 或创建新的 fixture，不得依赖另一个 worktree 的忽略文件。

## 数据来源与消费链

```text
Wiki Template:Current versions + Desktop version history + 新 PC 版本详情页
  -> 共享 Wiki 请求门串行读取
  -> PC 版本解析 + 公告 Wiki 链接到维护域身份目录的精确匹配
  -> 每版本只读报告 + 合并后的临时候选状态
  -> 受管理员认证保护的 Catalog API
  -> 爬取监控页中的独立 PC 版本候选面板
```

现有普通爬虫链保持独立：

```text
Wiki 来源页/模块 -> pipelines/monitor/check-source-updates.mjs
  -> 来源状态与指纹 -> 普通 wiki-sync 计划/派发
```

PC 版本探针不得写普通来源状态或 manifest，不得调用 `run-wiki-sync`、`dispatchWikiMonitorTask` 或普通 auto-dispatch，不得创建 V2 派发，也不得修改域表。候选上的域名仅供人工查看，不能作为派发授权。

## 临时状态约定

- 进度：`reports/crawler-monitor/pc-version-update-triage/progress.latest.json`
- 游标和候选状态：`reports/crawler-monitor/pc-version-update-triage/state.json`
- 每版本不可变来源报告：`reports/crawler-monitor/pc-version-update-triage/releases/<version>-r<revision>-<run-id>.json`
- 后端是游标与人工状态的唯一写入者。探针进程只返回已校验报告；后端通过临时文件加原子替换发布。探针互斥锁在一次检查期间阻止手动/定时探针重叠；独立的短状态事务锁只保护游标/候选合并或人工确认，网络请求期间不持有状态锁。
- 公告 ID 根据版本、章节、规范化公告原文及相同公告的出现序号确定，不使用列表位置；每个目标候选再组合稳定域/实体身份。未映射/非域公告使用无目标标识作为信息行；只有已映射的目标行可标记处理状态。相同版本内容重排后 ID 不变，完全相同的重复公告按出现序号保持不同 ID。
- 默认身份目录只读来自仓库已有目录：Items `data/standardized/item_pages.standardized.json`；NPCs `data/standardized/npcs.standardized.json`；Projectiles `data/standardized/projectiles.standardized.json`；Buffs `data/standardized/buffs.standardized.json`；Armor Sets `data/generated/wiki-armor-sets.latest.json`；Bosses `data/generated/wiki-bosses.latest.json`；Shimmer `data/generated/shimmer/wiki-shimmer-item-transforms.importable.latest.json`。目录快照来源与生成时间作为候选 provenance。Audio 当前没有仓库内实体目录，除非后续加入可审计来源，否则其条目保留未映射。
- 只按公告中的 Wiki 链接目标精确查目录，不从普通句子中的相似词推断目标。只有该标题在全目录命中一个域身份时才成为人工候选；若同一标题命中多个域/实体身份，整条对应目标不产生处理按钮并显示歧义。若公告未说明结构化字段，`impactFields=[]` 且 `impactStatus=unspecified_by_release_note`，管理端明确显示“公告未注明”，仍允许人工标记已处理/撤销。
- 状态包含 schema 版本、单调递增的 `stateRevision`、`lastEvaluatedDesktopVersion`、候选行及发布时间。状态更新带上读取时的 revision；过期更新返回冲突，不能静默覆盖并发修改。
- 只有所有待补查的 release 页面均已获取、解析、分类、报告并成功合并后，才推进版本游标。缺页、版本歧义、解析失败、状态损坏或发布失败时保留旧游标，并在监控中显示失败。
- 探针报告同时记录 `plannedReleaseVersions`；后端要求它与实际 `releases[].version` 完全一致，并要求最新 release 页等于当前 PC 版本，防止不完整报告推进游标。
- 每条有效未映射/非域公告都必须先进入可见报告和状态，之后才可推进游标；它不会重复派发域任务。
- 新版本不能从当前清单移除旧的 pending 候选；已处理候选保留在已处理/历史视图。
- 所有路径必须限制在仓库根目录内并拒绝符号链接状态路径。进度符合爬虫进度契约，至少包括 `actionId`、`status`、`generatedAt`、`lastHeartbeatAt`、`childStatusPath`、`phase`、`message`、`current`、`total`。

## 范围

### 本次包含

- PC 专用版本探针、每 6 小时检查和管理员手动检查。
- 从固定 `1.4.5.8` 基线按版本顺序补查。
- 公告条目规范化，以及有测试覆盖的八域实体/字段映射。
- 临时候选状态、监控进度、来源报告和可跨后端重启保留的人工处理状态。
- 查询与状态更新 API，以及 `/operations/crawler-monitor` 中单独的候选面板。
- 覆盖来源解析、映射、状态合并、状态操作、API 权限和 UI 状态的 fixture 测试。

### 本次不包含

- 候选产生后再抓取实体页面或模块作为快速刷新。
- 生成标准化/域数据或导入数据。
- Landing、maint、relation、projection、正式数据库写入或 schema migration。
- 从候选或人工处理状态派发域、队列项、V2 attempt 或调度任务。
- 修改普通爬虫的 hash、指纹、revision 判定或 `run-wiki-sync`。
- 其他平台版本和外部通知。

## 实施文件

- 新建 `pipelines/monitor/pc-version-update-probe.mjs`：串行读取来源页、PC 版本排序、可注入 fixture 的解析、稳定 `actionId` 和符合进度契约的进度发布；探针只产出报告。
- 新建 `pipelines/monitor/pc-version-update-mapping.mjs`：公告分类及明确的稳定实体/字段目标规则。
- 新建 `pipelines/monitor/pc-version-update-identity-catalog.mjs`：只读已登记的域身份快照，构建精确 Wiki 链接目标索引；不运行爬虫，不改源数据。
- 新建 `pipelines/monitor/pc-version-update-probe.test.mjs`、`pipelines/monitor/pc-version-update-mapping.test.mjs`、`pipelines/monitor/pc-version-update-identity-catalog.test.mjs`：离线探针、目录和映射测试；状态合并由 Java `PcVersionUpdateStateStoreTest` 覆盖。
- 扩展 `services/catalog-api/src/main/java/com/terraria/skills/service/CrawlerMonitorService.java` 与 `services/catalog-api/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`：独立定时/手动探针、监控任务注册、状态读取和人工状态更新。不得把该动作加入 `WIKI_MONITOR_RULES` 或域派发逻辑。
- 新建 `services/catalog-api/src/main/java/com/terraria/skills/service/impl/PcVersionUpdateStateStore.java`，负责状态校验、锁、合并和原子发布。
- 新建 `services/catalog-api/src/test/java/com/terraria/skills/service/impl/PcVersionUpdateStateStoreTest.java`，覆盖状态校验、合并、冲突和重启后读取。
- 在 `services/catalog-api/src/main/java/com/terraria/skills/dto/` 下新增版本候选请求/响应 DTO。
- 扩展 `services/catalog-api/src/main/java/com/terraria/skills/controller/AdminCrawlerMonitorController.java`，增加需要管理员身份的读取、手动探针和状态更新路由。
- 扩展 `services/catalog-api/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`、`services/catalog-api/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`。
- 新建 `apps/admin-console/components/crawler-monitor/PcVersionUpdateTriagePanel.vue`；扩展 `apps/admin-console/pages/operations/crawler-monitor.vue` 和 `apps/admin-console/types/crawlerMonitor.ts`，让候选面板与爬虫队列分开。
- 新建 `apps/admin-console/tests/crawler-monitor-version-updates.test.mjs`，覆盖 pending、handled、未映射、加载/错误和状态更新。
- 实施时只更新本计划及其 devlog。只有当这类临时状态成为项目级持久事实时，才改 `docs/project-governance/00_CURRENT_SPEC.md`。

## 实施任务

### 任务 1：定义 PC 版本解析与映射

**文件：**
- 新建 `pipelines/monitor/pc-version-update-probe.mjs`
- 新建 `pipelines/monitor/pc-version-update-mapping.mjs`
- 新建 `pipelines/monitor/pc-version-update-identity-catalog.mjs`
- 新建 `pipelines/monitor/pc-version-update-probe.test.mjs`
- 新建 `pipelines/monitor/pc-version-update-mapping.test.mjs`
- 新建 `pipelines/monitor/pc-version-update-identity-catalog.test.mjs`

- [x] 先写离线测试：只选 Desktop/PC、固定基线、版本排序、同版本不生成候选、跨多个版本补查、来源缺失/版本歧义失败；已验证 RED 后实现。
- [x] 为目录写离线 fixture 测试：每个已登记域快照输出稳定 ID、别名与 provenance；缺文件/损坏结构不伪造实体；同一链接指向多身份时返回歧义；Audio 缺目录时明确 unavailable。
- [x] 写映射测试：公告 Wiki 链接唯一精确命中稳定身份、单条公告映射多个目标、链接身份歧义、无链接/未知目标、普通句子同名词不自动匹配；无明确字段时 `impactFields=[]`、`impactStatus=unspecified_by_release_note` 且目标仍可人工确认。
- [x] 为 `actionId=pc-version-update-probe` 增加进度测试：默认路径、显式 `--progress-path`、必需字段、首个请求前写入 `running`、逐请求 heartbeat、成功/失败终态；用临时 `WORKTREE_ROOT` 隔离。
- [x] 实现身份目录和映射。身份目录读取只读已登记的源文件，不修改它们；映射输入使用公告的原始 Wiki 链接目标，并允许注入测试目录/显式规则。未知或歧义身份没有 target；字段未注明以显式状态保存。
- [x] 实现探针和进度写入；使用 `buildActionProgressPayload` 与 `writeJsonFile`（`pipelines/workflow/backend-refresh-runtime-state.mjs`），默认写入 `reports/crawler-monitor/pc-version-update-triage/progress.latest.json`。使用 `pipelines/lib/wiki-item-utils.mjs` 的 revision-bound `fetchWikiPagePayload`，确保每个 Wiki 请求通过共享请求门。请求顺序执行，只对游标之后的新版本抓详情页。
- [x] 规范化公告条目，保存版本、章节、位置、原文、来源 URL/page/revision/timestamp、分类和稳定目标身份。Revision 信息只用于来源证据。
- [x] 运行 `node --test pipelines/monitor/pc-version-update-probe.test.mjs pipelines/monitor/pc-version-update-mapping.test.mjs pipelines/monitor/pc-version-update-identity-catalog.test.mjs`；42/42 通过且不访问实时网络。

### 任务 2：接入进度、状态合并和独立探针调度

**文件：**
- 新建 `services/catalog-api/src/main/java/com/terraria/skills/service/impl/PcVersionUpdateStateStore.java`
- 新建 `services/catalog-api/src/test/java/com/terraria/skills/service/impl/PcVersionUpdateStateStoreTest.java`
- 修改 `services/catalog-api/src/main/java/com/terraria/skills/service/CrawlerMonitorService.java`
- 修改 `services/catalog-api/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- 修改 `services/catalog-api/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

- [x] 先写状态合并测试：新版本到来后旧 pending 和信息行仍在；重复发布没有重复行；同版本公告重排不重复生成候选或重置人工状态；重试保留人工状态；状态损坏或 release 版本列表不完整时游标不推进。新增不完整列表测试先验证失败，再加入报告计划版本校验。
- [x] 在 `reports/crawler-monitor/pc-version-update-triage/` 实现受仓库路径约束的状态存储；使用符号链接检查、跨进程探针互斥锁、短状态事务锁、schema 校验及原子替换。网络请求期间不占用状态事务锁；进度/报告读取和日志启动路径也拒绝符号链接。
- [x] 通过监控服务启动固定 `actionId=pc-version-update-probe` 的独立动作，并将该进度文件注册到 monitor overview。手动与定时启动共用探针互斥锁；进度文件不可读时不会启动。
- [x] 注册为非域监控任务。增加 `@Scheduled(fixedDelayString = "${terrapedia.crawler-monitor.pc-version-update-triage.poll-ms:21600000}")` 的六小时调度，以及共用同一锁和探针路径的管理员单次触发入口。两者均不调用普通 auto-dispatch。
- [x] 后端仅在 probe 完成后短暂获取状态事务锁，校验计划版本和实际公告页一致后合并并推进 `lastEvaluatedDesktopVersion`；以确定性 ID upsert 时保留现有人工状态。
- [x] 运行状态存储与监控服务的定向 Maven 测试；完整探针报告/状态契约由 Node 探针测试和 Java `PcVersionUpdateStateStoreTest` 覆盖。

### 任务 3：增加候选读取和人工处理 API

**文件：**
- 在 `services/catalog-api/src/main/java/com/terraria/skills/dto/` 下新建版本候选请求/响应 DTO
- 修改 `services/catalog-api/src/main/java/com/terraria/skills/controller/AdminCrawlerMonitorController.java`
- 修改 `services/catalog-api/src/test/java/com/terraria/skills/controller/AdminCrawlerMonitorControllerTest.java`
- 修改 `services/catalog-api/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`

- [x] 增加 `GET /admin/crawler-monitor/pc-version-updates`，返回候选、未映射信息行、版本游标、探针状态和来源证据。
- [x] 增加 `POST /admin/crawler-monitor/pc-version-updates/probe`，要求管理员身份并返回监控动作/run 标识；不会创建域派发数据。
- [x] 增加 `PUT /admin/crawler-monitor/pc-version-updates/{candidateId}/handling`，接受 `pending`/`handled`、预期 `stateRevision` 和可选备注。`handledBy` 从认证管理员 claims 获取，`handledAt` 由服务端时钟生成。
- [x] 测试 ADMIN 授权、拒绝 VIEWER、旧 revision 冲突、新 service 实例重新读取状态，以及不会调用任何域派发服务。
- [x] 运行 `cd services/catalog-api && mvn "-Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest,PcVersionUpdateStateStoreTest" test`；路径安全回归加入后 347/347 通过。

### 任务 4：增加后台候选面板

**文件：**
- 新建 `apps/admin-console/components/crawler-monitor/PcVersionUpdateTriagePanel.vue`
- 修改 `apps/admin-console/pages/operations/crawler-monitor.vue`
- 修改 `apps/admin-console/types/crawlerMonitor.ts`
- 新建 `apps/admin-console/tests/crawler-monitor-version-updates.test.mjs`

- [x] 增加类型化 API 状态：pending/handled 行、PC 版本信息、来源链接、探针进度和状态 revision。
- [x] 在独立面板展示版本/来源、映射目标、pending/handled 状态和未映射/非域信息行；不放入现有爬虫队列或域控制区。
- [x] 为已映射目标提供“标记已处理”和“撤销为待处理”操作。成功后刷新；旧状态冲突时显示并刷新最新服务端状态。
- [x] 增加手动探针操作及进度/错误状态；该按钮只启动 PC 版本探针，不提供域派发操作。
- [x] 运行 `cd apps/admin-console && pnpm run check && node --test tests/crawler-monitor-version-updates.test.mjs tests/crawler-monitor-page-contract.test.mjs`；typecheck 通过，62/62 通过。

### 任务 5：隔离验证与交接

**文件：**
- 修改 `docs/devlog/entries/2026-10-23-pc-version-update-triage.md`
- 修改 `docs/devlog/current.md`

- [x] 运行探针和映射 fixture、状态存储和 controller 测试、新面板测试及管理端 typecheck。
- [x] 运行回归 `node --test pipelines/monitor/check-source-updates.test.mjs pipelines/workflow/run-wiki-sync.test.mjs`；28/28 通过。定向监控服务 Maven 测试包含 347/347 后端回归。隔离测试确认专用 PC action 不注册到普通域动作表、不创建来源监控或 wiki 派发状态；未启动共享数据库或访问域数据库。
- [x] 用 MockMvc/controller 测试 GET/手动探针/状态更新授权与冲突响应；另用临时仓库根创建新 monitor service/store 实例，确认人工状态跨实例读回。符号链接测试确认运行目录链接会阻止启动、进度链接被报告为不可读。没有启动共享本地栈或数据库。
- [x] 用户授权后运行一次实时、只读 PC 版本页探针。报告 `reports/crawler-monitor/pc-version-update-triage/runs/task2-live-readonly.json` 确认版本仍为 `1.4.5.8`，只读当前版本页和 Desktop 历史页，未抓版本详情页；没有派发域、导入数据或写正式表。
- [x] 运行 `git diff --check`、`git status --short` 和 `git diff --cached --stat`；仅暂存本功能 22 个明确文件并提交，未推送。
- [x] 在已关闭 devlog 记录测试输出、映射剩余风险、分支/worktree 和提交状态。Feature commit `742901e5` 已 fast-forward 合并到本地 `main`。

## 验收标准

- 高于 `1.4.5.8` 的版本推进会为所有中间 PC 版本各生成一份候选；重复探针不产生重复行。
- PC 版本未推进时，即使公告页 revision、时间戳或 fingerprint 改变，也不创建新版本候选。
- 只接受 Desktop/PC 版本。
- 已映射行具有精确域、稳定实体身份、身份目录来源和公告来源证据；公告明确给出字段时显示字段，未给出时显示“公告未注明”并允许人工确认。证据不足/身份歧义的条目显示为未映射，不触发域。
- 新版本不会隐藏旧的 pending 项或重置人工确认状态。
- 管理员可将已映射目标标为 handled 或撤销回 pending。操作人/时间来自服务端，API reload 和 backend restart 后状态仍保留。
- 过期状态更新会被拒绝，不能覆盖更新的候选状态。
- 获取、解析、报告发布或状态发布失败时，版本游标保持不变，监控显示终态失败。
- 生成候选或确认状态都不能产生爬虫派发、修改来源监控 `changed` 值、调用 importer、创建 V2 work 或写正式域表。
- 普通爬虫指纹测试和 `run-wiki-sync` 行为不变，原爬虫队列视图语义不变。

## 还需要用户处理什么

当前不需要你补充技术决定。公告里的 Wiki 链接只有唯一命中现有域身份目录时才映射；字段没写就明确留空，不需要你逐条提供边界规则。Audio 暂无仓库内身份目录，因此相关条目先显示未映射。测试授权只包括 fixture 测试和一次只读 PC 版本页探针，不包括域爬取、派发、导入或正式数据写入。

## 执行门槛

用户已于 2026-10-23 授权开始实施并运行计划内测试。实施只在本计划列出的分支/worktree 进行；授权包括 fixture 测试和一次实时、只读 PC 版本页探针，不包括域爬取、派发、导入或正式数据写入。按上述任务推进，不再逐个边界案例询问；只有发现事实会改变既定边界或使映射不安全时，才暂停并更新计划。
