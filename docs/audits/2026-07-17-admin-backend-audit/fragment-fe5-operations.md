# 运维域页面组

## 汇总表

| 页面 | 视觉 | 结构 | 架构 | 耦合度 | 维护难度 | 均分 |
|---|---|---|---|---|---|---|
| operations/crawler-monitor.vue (4445行) | 7 | 4 | 6 | 5 | 4 | 5.2 |
| operations/crawler-monitor-test.vue (2879行) | 6.5 | 3.5 | 5 | 4 | 3 | 4.4 |
| operations/audio-assets.vue (1380行) | 8 | 6 | 7 | 6 | 7 | 6.8 |
| operations/domain-acceptance.vue (1123行) | 6 | 5 | 6 | 7 | 6 | 6.0 |
| operations/data-source-acceptance.vue (867行) | 7 | 6 | 6 | 6 | 6 | 6.2 |
| operations/armor-attributes.vue (635行) | 7 | 8 | 6 | 6 | 7 | 6.8 |
| operations/classification-audit.vue (432行) | 4 | 7 | 5 | 3 | 5 | 4.8 |

组均分: 5.7。整组特征: 配色令牌纪律整体过关(仅个别渐变/终端色板漏网),交互工程质量(轮询退避、blob 生命周期)有亮点,但巨型单文件、死代码沉积、跨页工具函数重复(statusTone/statusLabel/formatNumber/getErrorMessage 在 7+ 页各写一份)和 crawler-monitor 双页职责重叠是全组共性债。

## pages/operations/crawler-monitor.vue — 数据采集与同步监控台

**视觉 7/10**
截图整体与全站暖色主题(奶油底 `--color-bg: #f6f4ef` + teal 主色 `#0d9488`)一致,KPI 行、需处理卡片、状态点的红/绿/蓝语义色全部走 `variables.css` 令牌,页面 `<style>` 段(3958-4445 行)零硬编码 hex,这点是过关的。但截图暴露两个真实问题:一是"需要处理"卡片把 `reports/backend-refresh/history/backend-data-refresh-wiki-monitor-2026-07-08T13-19-53-…` 这种超长原始路径直接铺三行,淹没了"进度 0/1"等真正的分诊信息,应折叠为"复制路径"或尾部截断;二是顶部琥珀色警示条悬浮在面包屑与内容之间,与页头视觉层级冲突。另外 `components/crawler-monitor/CrawlerLogViewer.vue` 的 style 段有 13 处硬编码 hex(267-340 行,`#1b2320`/`#2b3a36`/`#f0968c` 等自造暗色终端色板)加一处 `rgba(220,38,38,0.1)`(与现成的 `--color-danger-muted` 重复),是组件群里唯一绕开令牌体系的地方,暗色主题下无法联动。

**结构 4/10**
4445 行里模板只有 241 行(重 UI 已抽到 CrawlerTriageBoard 等 6 个组件,职责切分本身合理:Board 管分诊视图、DomainDetailDrawer 管域详情+日志、LogViewer 被 Drawer 复用而非页面直挂),但 script 段约 3700 行堆了 ~90 个 computed + ~150 个函数,其中存在一整片"面板 Tab 时代"的死代码:`monitorPanels`(908)、`activeMonitorPanelMeta`(950)、`v4StatusStrip`(833)、`v4MetricCards`(862)、`crawlerHealthCards`(566)、`healthSignals`(533)、`runtimeDialogSummaryCards`(660)、`selectBlockedDomainFocus`(1838)、`wikiDomainTestMatrixRows`(437)、`baseDomainOrchestrationRows`(463)、`heartbeatKey`/`runStatus`/`runSummary`/`dispatchPlanSummary`(3363-3385)等,grep 确认在模板与其他函数中零消费——page-contract 测试甚至显式断言旧面板 `v-show="activeMonitorPanel === 'queue'"` 已删,但对应的派生状态图谱(估计 800-1000 行)原样留下。页面级"操作目录" section(31-77 行)与 DomainDetailDrawer 内的操作目录(其 74 行起)还是两份近似 UI。优化方案:先做一轮死代码清扫(可用 contract 测试保护端点断言),再把 statusLabel/statusTone/formatXxx 等 ~30 个纯格式化函数(3190-3955)搬进 `utils/crawlerMonitorDisplay.mjs`(该模块已存在),单文件可直接砍到 ~2000 行以内。

**架构 6/10**
关键点确认:stores/ 下没有任何 crawler store,`overview`、40+ 个 ref、抽屉开关、日志游标全部塞在页面本地,路由离开即全灭,通知中心的 crawler source 只能另起炉灶重新 diff overview。但不能只按"没有 store"扣死:纯逻辑抽取做得相当到位——同目录 `crawler-monitor.control/events/v2-state/state.mjs`(共 ~640 行)加 utils/ 下 8 个 `crawlerMonitor*.mjs`,全部有独立单测。轮询实现是本页最强的部分:降级 setInterval 带可见性暂停(3151-3161 `document.hidden` 检查 + 3170 `handleVisibilityChange`)、卸载全清(1254-1266)、并发防抖(1277 `if (loading.value) return`)、指数退避(688-693 `2**refreshFailureStreak` 封顶 16 倍/60s)、活跃任务时 3s 静默时 10s 自适应(687);V2 走自研 SSE 客户端(events.mjs)带 cursor 续传、断线回落轮询、401/403 fail-closed 熔断。硬伤:SSE 事件并不增量应用——`handleV2StreamEvent`(1357-1376)拿 `applyCrawlerV2Event` 只算 decision,然后 100ms debounce 后整页 `loadOverview()` 全量重拉,SSE 退化成"刷新触发器",事件风暴时等于 10Hz 轮询上限。状态机方面:`resolveDomainState`(state.mjs)确实是干净的后端权威 + `state_missing` fail-closed 抽象,但它只覆盖 V1 域行的一条读路径;页面里仍有 `wikiDomainFlowStatus`(1898)、`wikiDomainControlStatus`(1892)、`canCancelWikiDomain` 硬编码状态数组(1881)、`isCurrentProgressRow`(3483)等 ~20 处散落的字符串比较,V1/V2 双模式 if 分支贯穿全文。

**耦合度 5/10**
有 `~/types/crawlerMonitor` 类型定义,归一化层也部分存在(`buildTriageWorkbench`/`buildDomainDetailViewModel`/`buildCrawlerUnifiedStatus`),但逃逸口太多:`overviewWithPlanBFields = computed<any>(() => overview.value || {})`(626-627)直接把类型系统关掉;`(response?.data ?? response) || null` 这个后端信封解包模式在文件里重复约 20 次(414、1439、1757、2303、2411……),应收敛为一个 `unwrap()`;`v2DomainRows`(707-766)在页面内联拼 30+ 字段的 ad-hoc 行对象,`attempt?.messageZh || domainState.messageZh` 这类后端字段名直接铺展。业务硬编码更重:`town_npc_maintenance`/`domain-source-town-npc-maintenance` 域名与动作 id 写死在 `makeResumeFailureDomainTableRow`(2319)和 `failCurrentDomainTableRow`(2346),`backfillDomainForRow`(2872-2877)维护 id→domain 映射,`progressRowTitle`(3397-3415)把 12 个后端 actionId 硬映射中文名——这些应由后端 catalog 返回 label(操作目录部分已经这么做了,`labelZh` 来自后端,说明团队知道正确方向,存量没迁完)。

**维护难度 4/10**
对新人最致命的是"三层历史地质沉积":V1 wiki-monitor 路径、V2 attempt/queue 路径、已删面板 UI 的死派生层同时在场,改一个状态显示要先判断走的是 `domainRowState`(双读)、`progressRowEffectiveStatus`(unified)还是 `wikiDomainFlowStatus`(纯前端猜测)三条链中的哪条。缓解项:纯函数已抽出且有 98 个真实单测兜底,`crawler-monitor.state.mjs` 注释明确标了"P3 删旧调解器"的演进路线,页面顶部 import 分组清晰。拆分可行性明确:①死代码清扫(零风险,先做);②`statusLabel/statusTone/format*` 并入 crawlerMonitorDisplay.mjs;③V1 的 wikiDomain* 函数群(1864-2117,约 60 个)整体抽成 `useLegacyWikiMonitor()` composable,V2 抽成 `useCrawlerV2()`,让 P3 删 V1 时可以整文件删除;④overview + 轮询/SSE 传输层落成 pinia store,顺带解决通知 source 重复拉取。按此路径页面可收敛到 ~1200 行且 V1 退役成本从"梳理 4445 行"降为"删一个文件"。

**均分: 5.2**

**测试现状**(8 个文件分类;判定标准:是否以输入→断言输出的方式执行被测代码,还是 readFileSync 读 .vue 源码后 assert.match 文本)
- `crawler-monitor-data-quality.test.mjs` — 行为测试(4 例,直调 `buildDataQualitySignals` 断言 tone/reportPath)
- `crawler-monitor-domain-table.test.mjs` — 行为测试(12 例,直调 `buildDomainTableRows` 断言状态调解结果)
- `crawler-monitor-execution-overview.test.mjs` — 行为测试(11 例,队列/进度去重与主状态判定)
- `crawler-monitor-notification-source.test.mjs` — 行为测试(6 例,`diffCrawlerMonitorEvents` 状态迁移含防重触发与畸形输入)
- `crawler-monitor-operation-catalog.test.mjs` — 行为测试(3 例,分组/估算缺省文案)
- `crawler-monitor-page-contract.test.mjs` — **100% regex-against-.vue**(54 例,readFileSync 读入 8 个 .vue 后全程 `assert.match`/`doesNotMatch` 源码文本,甚至用正则截取函数体再二次 match,属已知反模式)
- `crawler-monitor-triage-workbench.test.mjs` — 行为测试(55 例,分诊视图模型/日志过滤/历史合并)
- `crawler-monitor-unified-status.test.mjs` — 行为测试(7 例,queue-vs-progress 冲突裁决)

即 7 行为 : 1 regex,比例健康;但两点需注明:7 个行为测试全部针对抽出的纯 .mjs 模块,没有任何一个真正挂载 Vue 组件(全仓 grep 无 `@vue/test-utils`/`mount`),.vue 渲染与交互层的唯一"覆盖"就是那 54 条正则;另有 3 个同目录协作测试(`crawler-monitor.control/events/v2-state.test.mjs`,共 830 行)也是行为测试,不在本次 8 文件清单内但值得计入资产。

## pages/operations/crawler-monitor-test.vue — 测试页(生产路由存在性审查)

**判定**:该页面**确实存在于生产路由,且这是有意为之,不是泄漏**——但它的名字撒了谎。`nuxt.config.ts` 全文无 `ignore`/`pages:extend` hook/排除性 `routeRules`(唯一的 routeRule 是 61-63 行的 `/recipes/groups` 重定向);页面自身 `definePageMeta`(L727)只有 title/navSection/headerVariant,**无任何 dev-only 守卫**,仅受全局 `auth.global.ts` 登录墙保护。它被 `layouts/default.vue:317` 正式注册进侧边栏("数据运维 > 监控测试页",Beaker 图标),git 最后一次改动是 **2026-07-17 当天凌晨**(`3234cc0 feat(crawler): complete V2 operation workflow`),历史 6+ 提交、两个 contract 测试文件和 4 份设计计划文档引用它——这是一个**活跃维护的运维工具页,不是死代码**。它也**不是复制粘贴分叉**:与 crawler-monitor.vue(4445 行)相比,函数名交集仅 9/66,行级重复约 174/1697 非空行(约 10%),长行重复仅 41 行;API 清单几乎不相交(它独占 `test-state`/`test-state/reset`,主页独占 `dispatch`/`auto-dispatch`/`attempts/*/log`)。所有调用都是经 `~/composables/useApi` 带 Bearer token 打到**真实后端**(`AdminCrawlerMonitorController.java` L156-202 有全部对应端点),`test-domain-smoke` 会触发**真实下载**并写真实产物文件——不是 mock。建议处置:**不删除、不移 playground**(会砍断在用的运维流程),而是:① 改名为 `crawler-monitor-lab` 或按职责拆成"场景模拟器"(纯开发调试,建议加 `import.meta.dev` 守卫或角色守卫)与"域烟雾测试工作台"(正经运维功能,保留)两页;② 收敛与主页的功能重复——主页 L2916/L2933 也在调 `test-domain-smoke(/cleanup)`,直接违反 2026-06-15 计划文档"主监控页不得出现烟雾测试"的定稿决议,二者必须择一;③ 把已漂移的复制小工具函数(`statusLabel`/`statusTone`/`formatDate`——测试页用 `toLocaleString('zh-CN')`,主页用 `formatShanghaiDate`,时区行为已分叉)提到共享模块。

**视觉 6.5/10**(无截图,基于代码推断)
全程使用 `var(--color-*)` + `color-mix` 设计令牌(L2055 起),复用 `workspace-shell`/`section-card`/`status-pill` 全局骨架,与管理端主题一致,不会视觉突兀。扣分点:状态标签中英双写(`'已完成 completed'`,statusLabel 全表)是调试腔而非产品文案,与主页纯中文标签不一致;单页塞状态卡、域选择器、进度表、JSON 编辑器、业务 JSON 检索五块面板,信息密度过载。优化:统一 statusLabel 文案源,把 JSON 编辑器折叠进抽屉。

**结构 3.5/10**
2879 行单文件:模板 ~726 行、script ~1330 行、scoped style ~820 行,**零子组件**——而同目录主页在分诊 UX 重做中已拆出 `CrawlerTriageBoard`/`DomainDetailDrawer` 等 6 个组件(contract 测试 L17-22 可证),本页完全没跟上同一套演进。~40 个顶层 ref(L810-849)混住模拟器状态与烟雾测试状态,互相 `disabled` 交叉引用(如 L1286 `runSelectedDomainSmoke` 检查 `simulationRunning`)。优化:按"场景模拟器 / 烟雾工作台 / 业务 JSON 预览"三块拆组件,各自收拢状态。

**架构 5/10**
好的一面:场景模拟走后端 `test-state` 持久化而非前端 mock,主页读的 `overview` 与之隔离,不污染真实监控;定时模拟的并发控制(L1620-1700 的 token + `simulationWriteInFlight` + 延迟 finish)写得意外严谨。坏的一面:一页两产品(纯 dev 的状态模拟器 vs 真实运维的烟雾测试)是根本性的职责混装,导致"该不该上生产"这个问题本身无法整页回答;`test-state` 写端点无环境隔离地暴露在生产后端,任何持 token 的管理员都能往里灌伪造状态。优化:按前述拆页,模拟器加 dev 守卫,后端 `test-state` 端点加 profile 开关。

**耦合度 4/10**
与主页存在三处隐性耦合:烟雾测试触发端点两页各接一份(违反已定稿的单一入口决议);`statusLabel`/`statusTone`/`formatDate` 等 9 个同名函数已复制漂移;`tests/crawler-monitor-page-contract.test.mjs` L446-450 和 `admin-ui-chinese-copy-contract.test.mjs` L40 **用正则逐字钉死本页源码**,任何重构都要连改测试正则。优化:小工具函数提取到 `utils/crawlerMonitorLabels` 共享;contract 测试改为行为断言。

**维护难度 3/10**
虽然它今天还在被维护(V2 工作流提交刚碰过),但维护成本极高:近 2900 行无组件边界的单文件、regex 契约测试对源码的逐字锁定、与主页的三处漂移点意味着每次爬虫协议变更都要在两个巨型文件里做两遍且容易漏一边(formatDate 时区分叉就是已发生的实例)。名字带 `-test` 还会持续误导后来者以为可随手删除。优化:拆分 + 共享工具提取后,本项可回到 6 分以上。

**均分: 4.4**

## pages/operations/audio-assets.vue — 音频资产

**视觉 8/10**
截图上信息层级干净利落:hero 标题+四张统计卡("未匹配链接 230"用 warning 色高亮边框,与顶部告警横幅形成呼应,L656-659 的 `summary-mini--warning` 全部走 `color-mix(var(--color-warning))` 令牌)、筛选栏、预听面板、表格四段节奏分明,teal 主色贯穿 chip/徽章/选中行,style 块内未发现任何跑偏的硬编码 hex。扣分点:表格"资产"列内已渲染分片/类型徽章(L230-235),紧邻的"分片 / 类型"列(L239-242)又重复一遍同样的徽章,9 列表格 `min-width: 1320px`(L1063)横向滚动压力大,砍掉冗余列即可缓解;预听空态占 118px 高度略空。优化:删除 shard-cell 冗余列;空态可与表格合并为行内提示。

**结构 6/10**
1380 行中 style 占约 740 行(54%),template 276 行、script 360 行,单文件明显过重。预听面板(L92-178)是一个自洽的展示块,表格行内的"徽章组+播放按钮"也有清晰边界,均可抽成 `AudioPreviewPanel` / 行组件——尤其项目 components/ 下已有 `AdminDataTable.vue`、`AdminTableShell.vue` 却未复用。好的一面是 script 组织很整齐:fetch、播放生命周期、格式化三组函数各自聚簇,computed(L368-385)职责单一。优化:抽预听面板组件 + 把 status-badge/cell-badge/state-panel 这类跨页重复样式(armor-attributes.vue 等页有同名类)沉淀到全局层,可砍掉一半 style。

**架构 7/10**
数据获取走手写 `get()` + `onMounted`(L632)而非 `useAsyncData`,无 SSR、首屏必闪加载态;筛选与分页也未同步 URL query——composables/ 下现成的 `usePagedCollectionSync` 没有用上,刷新页面即丢失筛选现场。但音频预听链路是全页亮点:`loadAudio`(L455-503)用 AbortController + `audioRequestGeneration` 代际计数双保险防竞态,blob URL 在换页(`resetAudioPlaybackState`, L533)和 `onBeforeUnmount`(L636)都做了 revoke,内存卫生教科书级。只读页不进 store 是合理决策(grep 确认 stores/ 无对应模块,无需复用)。优化:列表接 `useAsyncData` + `usePagedCollectionSync` 同步 query。

**耦合度 6/10**
`ApiResponse`/`AudioAssetRow` 等 6 个接口全部内联在页面里(L283-334),而隔壁 domain-acceptance 已示范了 `types/` 抽离模式;`Pagination` 同时带 `limit` 和 `size`(L291-297)是把后端字段冗余原样照搬。`joinApiUrl`(L509-513)重复实现了 useApi.ts 已导出的 `resolveApiUrl`;分片/状态枚举硬编码在 template 下拉里(L40-44、L59-62),后端加分片就要改模板。`matchStatusTone` 靠 `includes('matched')` 且需先排除 `'unmatched'`(L590-591)——字符串包含匹配对后端取值顺序极其脆弱。优化:接口移入 `types/audioAssets.ts`;复用 `resolveApiUrl`;枚举改为常量表驱动下拉与 label。

**维护难度 7/10**
函数普遍 5-15 行、单一职责,`statusLabel`/`formatBytes` 等纯函数可测性好,TS 类型覆盖完整,可读性高。瑕疵:`.pill`/`.pill--muted`(L1087-1103)在 template 中无任何引用,是死样式;`formatDateTime`(L621-623)只是 `replace('T',' ')`,把 UTC 时间当本地时间展示,审计页看"校验时间"会差 8 小时;`getErrorMessage` 与 domain-acceptance 页各写了一份不同实现。优化:删死样式;formatDateTime 换 `Intl.DateTimeFormat`;错误提取函数收进 useApi。

**均分: 6.8**

## pages/operations/domain-acceptance.vue — 域验收

**视觉 6/10**
配色令牌纪律整体尚可(status-pill、accepted-warning-block 全走 `color-mix` + 令牌),截图上警告态总状态卡、橙色告警横幅与主题一致。但问题不少:eyebrow 与 h1 文案完全相同(L6-7 都是"B 档域验收"),层级白白浪费一层;hero 四张统计卡在截图中折成 3+1("缺失"孤行);"下一步手动动作 45 项"全量平铺无折叠/分页,往下是 metric-list、raw-summary-list、accepted-warning-list 三种视觉上几乎无差别的 key-value 灰块墙,信息密度极高但扫读层级坍平。且 L675/680/685/690 的图标渐变混入硬编码 hex(`#0f9f6e`、`#b7791f`、`#b91c1c`、`#64748b`——最后一个就是 `--color-secondary` 的值却没引用令牌)。优化:动作队列默认只展开"可执行"并折叠其余;渐变第二色改 `color-mix(var(--color-success) 80%, black)` 类令牌派生;删重复 eyebrow。

**结构 5/10**
1123 行里 template 占 349 行,核心是 L139-346 的三层嵌套 v-for(domain → panel → checks),单个 `domain-panel`(L215-343)就 128 行,是全项目最该抽组件的块之一;`acceptedWarningForPanel(panel, domain)` 在 template 里对同一 panel 连调 3 次(L293、L301、L302),每次渲染重复执行 find。style 里 `.path-block`/`.freshness-block` 等 5 个块共享样式靠长选择器组(L957-964)维系,牵一发动全身。优化:抽 `DomainPanelCard.vue` 接收 `panel` + 预计算好的 `acceptedWarning` prop,template 可减 40%。

**架构 6/10**
单接口 `/admin/domain-acceptance/overview` 一次拉全量,加载态设计是同类页中较好的:`isInitialLoading`(L391)区分首载与刷新、失败时保留旧数据 + toast 提示(L432-436)、loading/error/empty 三态齐全。扣分:`get` 未显式 import(对比 audio-assets L279 有显式导入),纯靠 Nuxt 自动导入,同目录两页风格割裂;45 个动作 + 11 域 × 45 面板的 payload 无渐进加载;`renderValue` 对对象直接 `JSON.stringify`(L572)把原始 JSON 怼进 UI,属于调试态残留。types/ 下已有 `domainAcceptance.typecheck.ts` 契约检查是加分项。优化:域卡片改按需展开 + 懒渲染面板明细。

**耦合度 7/10**
本组页面中最好:143 行的 `types/domainAcceptance.ts` 独立类型层 + typecheck 契约文件 + `unwrapOverviewResponse` 解包函数(L485-487),面板指标用 `panelMetricRows`/`rawSummaryRows` 做成通用 key-value 渲染(L526-544),后端加字段前端零改动。扣分点:`statusTone`/`statusLabel`(L442-466)内联枚举了十余个后端状态词,甚至包括带空格的 `'read error'`——这套词表散落两个函数,后端改一个状态字符串前端静默降级为 muted;本地又定义了 `DomainAcceptanceOverviewResponse`(L377-382)而没复用统一的 ApiResponse 泛型。优化:状态词表提为 `Record<string, {tone, label}>` 常量并挪进 types 文件,与后端枚举同源维护。

**维护难度 6/10**
辅助函数短小纯粹、命名达意,无死代码;但 `statusLabel`/`publicExposureLabel`/`publicGateLabel`/`freshnessLabel` 四个映射函数(L458-513)已成"switch 农场",每新增状态词要人肉同步 tone/label/icon 三处;样式里 `border-radius: 8px` 通篇硬写(L611/639/655 等约 20 处)而非 `--radius-md`,status-pill 的 `999px`(L1069)也没用现成的 `--radius-full`;template 的深嵌套使定位某个字段的渲染位置需要来回滚动。优化:映射表化四个 label 函数;圆角统一切令牌。

**均分: 6.0**

## pages/operations/data-source-acceptance.vue — 数据源验收

**视觉 7/10**
信息层级完整:hero 汇总卡 → 总状态大卡(红色图标+"阻断") → 阻断/警告原因双栏 → 面板网格,状态色(success/warning/danger/muted)贯穿 pill 与图标,空态/加载态都有专门面板(L28-47)。主要扣分点:原因面板直接输出后端拼接串 `replacementReadiness: blockingCount=13`、`entitySourceCoverage: warningCount=6980`(截图中可见),英文内部键名裸露给运维者,应在前端映射为面板中文名;另外四个状态渐变的第二色硬编码 hex——L532 `#0f9f6e`、L537 `#b7791f`、L542 `#b91c1c`、L547 `#64748b`,绕开了令牌体系(暗色模式下不会跟随切换)。优化:原因串按 `panelItems` 的 key→label 映射改写;渐变第二色改 `color-mix(in srgb, var(--color-success) 80%, black)` 之类的令牌派生。

**结构 6/10**
配比 210 行 template / 226 行 script / 427 行 style,style 占近一半。核心问题是 L89-206 的面板 `<article>` 是一个 117 行的巨型块,内含 metrics、path、freshness、generator、nextEvidence、executionPolicy、failureSamples、sampleReports、rawSummary、checks 十余个条件段——这是典型的应抽 `AcceptancePanelCard.vue` 子组件的场景,抽出后 style 里 L652-808 的大片面板样式也随之内聚。加分项:状态卡/原因面板用 `v-for` + computed 驱动,没有复制粘贴块。

**架构 6/10**
手写 `onMounted + get()`(L281-300),纯客户端拉取,未用 `useAsyncData`——同目录 `crawler-monitor.vue:423` 已示范了 `useAsyncData` 用法,本页没有跟进,刷新时会先闪加载面板。加载/错误/空态处理是同组三个小页中最完备的:区分首次加载(L28)、无数据错误(L36)、有旧数据时的内联错误(L61)、空态(L44)。全部本地 state、无 store,对只读页可接受。优化:改 `useAsyncData('data-source-acceptance', ...)` 获得 SSR 与去重,`refresh()` 替代手写 loadOverview。

**耦合度 6/10**
小页三个中唯一把响应类型放进 `~/types/dataSourceAcceptance.ts` 的,有 `unwrapOverviewResponse`(L326)做了一层解包。但 `statusTone`(L302-308)要同时兼容 `'pass'/'success'/'ok'/'readable'` 四种同义状态、`'blocked'/'error'/'fail'/'failed'/'read error'` 五种失败态,说明后端状态枚举不稳定,前端在用防御性别名硬扛;`metrics`/`rawSummary` 直接 `Object.entries` 裸转(L386-404),键名原样上屏。URL `'/admin/data-source-acceptance/overview'` 内联硬编码。优化:在 types 层收敛 `AcceptanceStatus` 归一化函数(现在 `statusTone`/`statusLabel` 两处维护同一张别名表,L304 与 L320 已经出现同步负担)。

**维护难度 6/10**
函数命名清晰、helper 单一职责,可读性不差。魔法值:L372 `slice(0, 50)` 无注释;`formatNumber`/`formatDate`/`getErrorMessage` 与其他管理页各自重复实现(全库 `statusTone` 在 7 个页面出现),该沉淀进 `composables/useAdminFormatters` 之类的共享层。`sampleKey`(L375-384)拼接键在字段全空时退化为 `'sample'`,同面板多条空样本会 key 冲突。无明显死代码。

**均分: 6.2**

## pages/operations/armor-attributes.vue — 盔甲属性

**视觉 7/10**
hero 汇总 → 筛选面板 → 表格三段式清晰,筛选器五字段+操作按钮对齐良好,表格用 badge 区分部位/阶段、双行主列(中文名+内部名)符合审计页密度需求。空态/错误托管给 `AdminTableShell`(L65-73,含 empty-title/description)。扣分:表头把 `meleeDamage`/`meleeCritChance`/`classSpecific` 英文字段名直接混排进中文列名(L318-320),截图里显得杂乱——审计页保留原始键可理解,但建议移到 tooltip 或次行;style 块全程使用 `var(--color-*)` 令牌,无硬编码 hex,这点是同组最干净的。

**结构 8/10**
配比 210/240/182,三段均衡,是同组组织最好的:复用 `AdminTableShell` + `AdminDataTable` + `AppPagination` 共享组件,列定义收敛为 `armorAttributeColumns` 数组(L313-324),筛选用单个 reactive 对象。小疵:L491-499 `.filter-actions` 选择器重复声明两次(第二块只为加 `justify-content`,应合并);L141-208 详情抽屉 67 行可抽成独立组件。

**架构 6/10**
手写 fetch,且有一个实际缺陷:`fetchSummary`(L343-346)没有 try/catch,而 `onMounted` 里 `Promise.all([fetchSummary(), fetchRows(1)])`(L449)——summary 接口一旦失败就是未捕获的 rejection,汇总卡静默显示 `--` 且无任何错误提示。筛选与页码不同步到 URL query,刷新即丢失检索状态。抽屉的加载/错误态有处理(L152-153),但无 Esc 关闭、无焦点管理、未用 Teleport,且 L533 `inset: ... var(--sidebar-width)` 与侧栏展开宽度硬绑——侧栏折叠(`--sidebar-collapsed-width: 104px`)时抽屉左缘会悬空 184px。优化:fetchSummary 包 try/catch 并给汇总卡失败态;filters/page 用 `useRoute().query` 双向同步;抽屉改 `<Teleport to="body">` + Esc 监听。

**耦合度 6/10**
有完整的本地 interface 层(L218-293,ApiResponse/Pagination/Row/Effect/Detail 全部显式建模),比裸 `Record` 强得多;但这些类型留在页面文件里而非 `~/types/`(对比 data-source-acceptance 已有先例),无法被后续消费方复用。`armorRow(row)` 强转(L408-410)暴露 `AdminDataTable` 插槽未泛型化的缺口——每个 cell 模板都要过一次 cast。`rawCells` 直接按后端键名取值渲染(L412-415),列定义与后端 rawCells 键名硬绑。URL 硬编码两处(L344、L353)。

**维护难度 7/10**
整体可读,helper 短小。两个具体问题:L147 详情抽屉副标题兜底值写死 `'HallowedMask'`——这是开发时的示例数据残留,任何 internalName 缺失的装备都会显示"神圣面具"的内部名,属于会误导运维的魔法值,应改为 `'--'`;`getErrorMessage`(L442-446)、`formatNumber`(L425-427)又是一份本地重复实现(`composables/useTownNpcMaintenance.ts:173` 已有一份 formatNumber)。无死代码。

**均分: 6.8**

## pages/operations/classification-audit.vue — 分类审计

**视觉 4/10**
截图证实了裸渲染疑虑,且源码坐实:`rowFields`(L263-267)就是 `Object.entries(row)` 全量倾倒,卡片里 `id / name / internalName` 后端字段名直接当 UI 标签(截图中 OgreMask 卡片三行 dt/dd 全是原始键)。更糟的是 `rowTitle` 取 `name`、`rowSubtitle` 取 `internalName`(L238-261),两者常为同值,截图里 "OgreMask" 在同一卡片出现三次(标题、右上角副标题、字段行);分组头部 L65-66 `section.label` 与 `config.title` 也在多数情况下渲染同一文案两遍。空态处理反而不错(L88-91 绿勾+文案)。优化:为五个分组各定义字段白名单+中文标签映射(sectionConfigs 里已有现成挂载点),标题去重。

**结构 7/10**
配比 101/170/156,最紧凑的一页。`sectionConfigs` as const 配置驱动五个分组(L146-177),`auditSections` computed 统一容错归一(L186-196),模板单循环无重复块,组织思路是对的——问题只在渲染内容层没做映射,骨架本身是好的。

**架构 5/10**
手写 `onMounted + get`(L214-227),加载/错误/空态齐全(L34-53,含双态错误处理)。硬伤:后端明确返回分页(`AuditPagination`,L117-123),页脚也展示"第 X 页 / 每页 X 条 / 共 X 条"(L93-97),但没有任何翻页控件——21 条的分组永远只能看第一页,分页信息成了摆设。单接口一次拉五个分组,无单组刷新能力。优化:接 `AppPagination`(armor-attributes 已在用)并给接口加 per-section 分页参数,或至少隐藏无法交互的页脚。

**耦合度 3/10**
本组最差。`type AuditRow = Record<string, unknown>`(L125)——零 schema;`rowTitle` 用 7 个字段名链式猜测(`nameZh ?? name ?? itemName ?? npcName ?? displayName ?? title ?? id`,L239-248),`rowSubtitle` 再猜 6 个(L252-260),这是对后端响应形状的最大化耦合:后端任何改名不会报错,只会静默渲染成别的东西;`stringValue` 对对象兜底 `JSON.stringify`(L271)意味着嵌套对象会以 JSON 串上屏。URL 硬编码(L219)。优化:按五个 section 各建 interface(后端形状显然是稳定枚举的),把猜测链换成每组明确的 title/subtitle 字段。

**维护难度 5/10**
代码短、逻辑直白,但 style 块有一处静默缺陷:L336/342/367/369/384/407 引用的 `var(--text-muted)`、`var(--text)`、`var(--border)`、`var(--surface-muted)` 在全库无任何定义(令牌实名是 `--color-text-muted`/`--color-border`/`--color-surface-muted`)——这些声明在计算值阶段失效,muted 文本和边框颜色实际全靠继承兜底,是复制自其他项目命名习惯的残留 bug。另有硬编码色值:L306 `#b91c1c`、L291/307/354 三处 rgba 字面量,均有现成令牌(`--color-danger`、`--color-info-muted`、`--color-danger-muted`)可替换。优化:批量替换为实名令牌并加 stylelint 自定义属性校验规则。

**均分: 4.8**

## 跨页共性问题(供全局汇总)

1. **crawler-monitor 双页职责重叠且已漂移**:主页 L2916/L2933 与 crawler-monitor-test 页各接一份 `test-domain-smoke` 端点,违反 2026-06-15 计划文档"主监控页不得出现烟雾测试"的定稿决议;`statusLabel/statusTone/formatDate` 等 9 个同名函数复制漂移,时区行为已分叉(主页 `formatShanghaiDate` vs 测试页 `toLocaleString('zh-CN')`)。
2. **数据获取范式分裂**:除 crawler-monitor 用 `useAsyncData` 外,其余 6 页全部 `onMounted + 手写 get`,无 SSR、无 query 同步,筛选/分页状态刷新即丢(audio-assets、armor-attributes 尤甚,`usePagedCollectionSync` 现成未用)。
3. **工具函数重复造轮子**:`statusTone/statusLabel/formatNumber/formatDate/getErrorMessage` 在 7+ 页面各写一份且实现不一致,应沉淀进 `composables/useAdminFormatters` 或 utils 共享层。
4. **令牌漏网点集中在渐变与终端色板**:domain-acceptance L675-690 与 data-source-acceptance L532-547 用同一组硬编码渐变 hex(明显复制来源相同),CrawlerLogViewer L267-340 自造 13 处暗色 hex;classification-audit 更引用了 6 处全库不存在的令牌名(`--text-muted` 等),属静默失效 bug。
5. **组件层测试缺位**:crawler-monitor 系 7 个行为测试全部打在抽出的纯 .mjs 模块上,全仓无 `@vue/test-utils`;.vue 渲染层唯一"覆盖"是 page-contract 的 54 条 regex-against-source(已知反模式),重构任何模板都要连改正则。
