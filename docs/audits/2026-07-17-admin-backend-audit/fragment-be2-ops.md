# 后端·配方与运维控制器组

评审范围: `/home/lolben/TerraPedia/back` `com.terraria.skills.controller` 下 14 个配方+运维 Admin 控制器。
验证方式: 全部源码通读 + 关键 service 抽查 + 实际登录 `http://127.0.0.1:18191` 对 10+ 个 GET 端点 curl 验证响应形状（未调用任何写端点）+ 日志 `reports/local-start/back-20260717-172449.log` 取证。

## 汇总表

| Controller | 接口设计 | 结构 | 架构 | 耦合度 | 维护难度 | 均分 |
|---|---|---|---|---|---|---|
| AdminItemRecipeController | 9 | 9 | 8 | 9 | 8 | **8.6** |
| AdminRecipeGroupController | 7 | 5 | 3 | 4 | 4 | **4.6** |
| AdminRecipeConditionController | 8 | 7 | 5 | 5 | 6 | **6.2** |
| AdminCraftingStationController | 7 | 5 | 3 | 4 | 5 | **4.8** |
| AdminShimmerController | 6 | 6 | 3 | 4 | 5 | **4.8** |
| AdminWikiZhRecipeImportController | 6 | 6 | 3 | 4 | 5 | **4.8** |
| AdminCrawlerMonitorController | 8 | 8 | 8 | 8 | 8 | **8.0** |
| AdminDataSourceAcceptanceController | 9 | 10 | 9 | 9 | 8 | **9.0** |
| AdminDomainAcceptanceController | 9 | 10 | 9 | 9 | 9 | **9.2** |
| AdminClassificationAuditController | 7 | 7 | 5 | 6 | 7 | **6.4** |
| AdminAudioAssetController | 7 | 7 | 5 | 5 | 7 | **6.2** |
| AdminSupportDomainController | 9 | 10 | 9 | 9 | 8 | **9.0** |
| AdminStorageController | 8 | 9 | 8 | 8 | 7 | **8.0** |
| ItemImportController | 7 | 8 | 8 | 8 | 7 | **7.6** |

组均分 ≈ **6.9 / 10**。两极分化明显: 走"薄控制器 + Service"的一批（8~9 分）与把 SQL/文件 IO/缓存全塞进控制器的一批（4~5 分）共存于同一目录。

## recipe-groups 500 根因

**结论: 后端无 500。`/api/admin/recipe-groups` 全链路（直连 18191 / 经 13004、13009 devProxy）实测均 200，形状正确。500 是前端 dev server 陈旧进程 + 已删除页面 + Nuxt 无 error.vue 三者叠加的纯前端问题。**

复现取证链:

1. **后端排除**: 带 token 直接 curl `GET /api/admin/recipe-groups`、`/{canonicalName}`、`?keyword=` 均 200；18196（worktree 后端）同样 200。最新日志 `back-20260717-172449.log` 中与 recipe-groups 相关的只有 17:44 两条 `NoResourceFoundException: No static resource recipe-groups`（**404 不是 500**）——那是某客户端漏了 `/admin` 前缀直接打 `/api/recipe-groups` 导致的落空请求，与页面 500 无关。日志内真正的 500 只有 `ClientAbortException: Broken pipe`（客户端提前断连，无害）和一条 `GET /items/tree/...` 把字符串 "tree" 喂给 `@PathVariable Long id` 的路由冲突（见共性问题 #6）。
2. **前端复现**: 带管理员 cookie 请求 `http://127.0.0.1:13004/recipes/groups` → HTML 标题 `500 - undefined | Nuxt`，JSON Accept 下真身是 `404 Page not found: /recipes/groups`。
3. **根因定位**:
   - commit `9762905`（2026-07-16）删除了 `pages/recipes/groups.vue`，改为 `nuxt.config.ts` 的 `routeRules: { '/recipes/groups': { redirect: '/item-groups?domain=recipe', 301 } }`。
   - 但 13004 端口 dev server（pid 125117，2026-07-17 17:26 启动）编译出的 `.nuxt/dev/index.mjs` 里 **routeRules 只有 Nuxt 内置三条，自定义 301 规则完全缺失**（`grep 'recipes/groups'` = 0 hits）。dev server 启动瞬间恰逢 `main` 分支 merge 落盘（reflog 17:25:54 merge → config mtime 17:25:55 → server start 17:26:10），nuxt.config 变更未触发完整重建，nitro dev bundle 用了旧配置。
   - 页面文件已删 + 重定向规则未生效 → 路由 404；项目又没有 `error.vue`，Nuxt 4 dev 环境把 404 包成 `500 - undefined` 错误页——这就是"前端 /recipes/groups 渲染 500"的来源。旁证: 13009 端口跑的是**旧 worktree**（`article-engagement-sorting-merge`，仍保留 groups.vue），同一 URL 渲染 200。
4. **修复**: 重启 13004 dev server（或 `rm -rf .nuxt` 后重启）让 routeRule 进 nitro bundle 即可；建议顺手加一个根级 `error.vue` 避免 404 伪装成 500。后端无需改动。

## 横向共性问题

1. **胖控制器直接持有数据访问/文件 IO（本组最大架构债）**。RecipeGroup(433 行)、CraftingStation(853 行)、Shimmer(703 行)、WikiZhRecipeImport(405 行)、ItemGroup(767 行，同模式) 都在 controller 里直接用 JdbcTemplate/Mapper 拼 SQL、读写 JSON 文件、维护私有缓存，与 Acceptance/SupportDomain/CrawlerMonitor 一批的"薄控制器"形成两套并存范式。业务逻辑无法复用（如 recipe-group 合并逻辑前台若要用只能复制），也无法单测（这四个恰好都没有对应的 controller 单测或只有表层测试）。
2. **`resolveRepoRoot`/`resolveDataFile` 多副本且策略不一致**。RecipeGroupController 用 `user.dir` 三候选，WikiZhRecipeImportController 用"向上爬目录找 back+data-query-app+scripts 特征"，CrawlerMonitorServiceImpl 又是第三套。同一进程内三种"仓库根"推断并存，部署形态一变（jar 独立部署、容器化）会在不同端点以不同方式静默失效（`readGroupFile` catch-all 返回空列表——数据文件损坏时表现为"组全没了"而非报错）。应统一为 `TerrapediaRepoLayout` 类型的配置 Bean。
3. **工具方法 15+ 份复制**。`trimToNull` 在 15 个 controller 各有一份，`firstNonBlank`/`normalizeKey`/`containsIgnoreCase`/`TimedValue` record 在 4 个 controller 重复（RecipeGroup、ItemGroup、CraftingStation、Npc）。`TimedValue`+`volatile`+TTL 的手写缓存模式重复实现了 3 次，还都有"多实例不共享、写后其它节点缓存不失效"的隐患。应抽 `common/TextUtils` 与 `common/TtlCache`。
4. **文件写入无并发控制、非原子**。RecipeGroupController 的 `writeOverrideGroups` 与 ItemGroup 同模式: 读-改-写 JSON 文件全程无锁、无临时文件+rename，两个管理员并发编辑会互相覆盖，写一半崩溃会留下损坏文件（又因 #2 的 catch-all 静默变空）。对比 AdminStorage/ItemImport 已有现成的 `AdminJobLockService`，这里完全没用上。
5. **鉴权双轨制**。拦截器只验签+过期，`role` 校验只有 CrawlerMonitorController 自带私有 `requireAdminRole` 在做；其余 13 个 controller 的写端点（recipe-groups POST/PUT/DELETE、shimmer 全 CRUD、crafting-stations 全 CRUD…）任何持有效 token 者即可调。当前 token 只发给 admin 所以未成实害，但角色模型一旦扩展（日志里已出现 EDITOR 概念）就是权限缺口。`requireAdminRole` 应升级为拦截器统一职责或注解（`@RequireRole("ADMIN")`），而不是留在单个 controller 里。
6. **路由前缀拥挤引发实际故障**。`AdminItemRecipeController` 等多控制器共享 `/admin/items`、`/items` 前缀，日志实测 `GET /items/tree/**` 被 `/{id}/recipe-tree` 家族的 `@PathVariable Long` 吞掉抛 NumberFormatException→500。字面量路由（`/items/tree`）必须避开 `/{id}` 通配段，或收敛每个前缀到单一 controller。
7. **测试覆盖与控制器复杂度倒挂**。测试行数/复杂度比: CrawlerMonitor 1135 行测试 vs 219 行控制器（5.2x，健康），而 WikiZhRecipeImport 146/405、Shimmer 191/703、CraftingStation 335/853——最重的 SQL/合并逻辑恰恰是覆盖最薄的（Shimmer 4 个 @Test 根本摸不到动态 SQL 拼接和 JSON 列校验分支）。RecipeGroup、RecipeCondition 两个 controller **完全没有测试文件**。
8. **响应包装不统一**。同组内 `ApiResponse<T>` 裸返回（CrawlerMonitor、Acceptance 系）与 `ResponseEntity<ApiResponse<T>>`（其余）并存；错误路径上 Shimmer 的 `requireDataset` 抛 `IllegalArgumentException` 依赖全局 handler 转 400，而 RecipeGroup 在 controller 里手动 try/catch 转 400，两套错误约定。GET 验证实测形状尚一致（`success/data/message/statusCode`），但分页有的在 `pagination` 顶层字段、ClassificationAudit 又嵌在每个 section 里。

---

## AdminItemRecipeController（66 行）

- **接口设计 9**: 资源路径 `/admin/items/{id}/recipes|recipe-usages|recipe-tree` 语义清晰，PUT 整体替换 + `scopeMode` 参数设计得当，`maxDepth` 有默认值。唯一小瑕疵: PUT 用 query 参数传 `scopeMode` 而非 body 字段，契约上略隐晦。优化: `scopeMode` 挪进 body DTO；替换成功可返回 200+受影响 scope 概览。
- **结构 9**: 四个端点全部单行委托，是本组的范本结构。无优化必要。
- **架构 8**: 事务在 `RecipeServiceImpl.replaceRecipesForResultItemId`（`@Transactional`+`@CacheEvict`）正确落位；但 `recipeTreeService.invalidateCaches()` 在 controller 层事务提交前调用，极端并发下可能缓存先失效后回滚。优化: 把 invalidate 移入 service 事务提交后（`TransactionSynchronization.afterCommit`）。
- **耦合度 9**: 仅依赖两个 service 接口，无 Mapper 直连。
- **维护难度 8**: 有 `AdminItemRecipeControllerTest`(3 test) 但只覆盖 happy path; 与 `/items` 前缀家族共享路径空间（共性 #6 的 500 波及区）。优化: 补 scopeMode 边界测试。

## AdminRecipeGroupController（433 行）

- **接口设计 7**: REST 语义正确（`canonicalName` 作自然键、404/400 分明、created 返 201），keyword 过滤实用。但 PUT 不允许改 canonicalName 却静默用旧值覆盖请求值，客户端无感知；`?keyword=iron` 实测命中 "Env**iron**mental"——子串匹配无排序权重，体验粗糙。
- **结构 5**: 433 行里 CRUD 只占 100 行，其余全是文件解析/合并/enrich/工具方法。`readGroupFile` 里 `readFromReferenceRoot ? root.get("groups") : root.get("groups")` 三目两个分支完全相同——参数是死的，明显是改坏/未完成的残留。
- **架构 3**: 数据源是"generated JSON + overrides JSON 文件合并"，全部读写在 controller: 无锁非原子写（共性 #4）、解析异常 catch-all 静默返回空（数据损坏=界面显示组全没了）、`user.dir` 相对路径推断（共性 #2）、10 分钟 TTL 私有缓存与 `RecipeTreeService` 缓存的双重失效手工编排。`enrichGroupMembers` 每次全量重建时对每组打两次 DB 查询, 组多时 N×2 查询在缓存 miss 时集中爆发。优化: 抽 `RecipeGroupRepository`（封装文件读写+锁+原子写）+ `RecipeGroupService`（合并/enrich, 批量预取 item），controller 减到 80 行。
- **耦合度 4**: 同时耦合 ObjectMapper、ItemMapper、RecipeTreeService、文件系统布局、JSON schema 细节; 与 AdminItemGroupController 是近乎复制的孪生（`TimedValue`/`normalizeKey`/`resolveDataFile` 逐字重复）。
- **维护难度 4**: **无测试文件**; 与 ItemGroup 的复制漂移已在发生（一个 overrides-only 写、一个全量写）。优化: 合并两者为参数化的 group 域服务后共享一套测试。

## AdminRecipeConditionController（180 行）

- **接口设计 8**: GET/PUT 替换语义干净, `refType` 归一化（`MOON_PHASE→WORLD_CONTEXT` 等别名兼容）对导入数据友好; 非法行静默跳过而非报错, 客户端无从得知哪些条件被丢弃。优化: 返回 `skipped` 计数或 400 明细。
- **结构 7**: `loadConditions` 的三路 refType 分支批量预取写得规范; 但 DTO 组装的 if-else 链和 `normalizeRefType` 属于 service 层逻辑。
- **架构 5**: `@Transactional` 直接标在 controller 方法上且 delete-then-insert 全在 Mapper 层编排——事务边界能工作, 但 controller 持有 5 个 Mapper 做写编排违反分层; PUT 替换后没有任何缓存失效（对比 ItemRecipe PUT 会 invalidate recipe tree——recipe 条件变了树缓存却不失效, 疑似遗漏）。优化: 下沉 `RecipeConditionService`, 补 `recipeTreeService.invalidateCaches()`。
- **耦合度 5**: 5 个 Mapper 直连; refType 字符串魔法值散布（"BIOME"/"WORLD_CONTEXT"/"CONDITION_TERM" 应为枚举）。
- **维护难度 6**: 无测试; 但体量小、逻辑线性, 补测成本低。

## AdminCraftingStationController（853 行）

- **接口设计 7**: 列表/详情/usage-items 分页+search+usageState 过滤完整, 删除前双重引用检查防悬挂。但内存分页（全量 snapshot 后 subList）使 `pagination.total` 语义与 DB 分页并存于同一系统; `POST/PUT` 直接收 `CraftingStation` 实体做请求体, 把 `deleted`/`createdAt` 等内部字段暴露进 API 契约。优化: 换专用 Request DTO。
- **结构 5**: 853 行 = CRUD(160) + 五路名称匹配的 snapshot 构建(400+) + combo 站解析(150)。`resolveComboComponentGroups` 用**正则解析站名字符串**（"and"→"+"、复数还原 benches→bench）来推断组合站构成——把游戏领域知识编码成脆弱的文本启发式, 埋在私有方法里无文档无测试。内部还藏了自造 `StreamUtils`（其中 `ofNullable` 根本没被调用）。
- **架构 3**: 数据编排（recipe_stations 五种关联方式: stationId/itemId/internalName/nameRaw-en/nameRaw-zh 逐一查库再合并）是纯粹的 service/repository 职责; 写路径 insert + snapshot invalidate 无事务包裹; 5 分钟 TTL 快照意味着写入后其它实例最长 5 分钟脏读。优化: 匹配逻辑落库（recipe_stations 回填 station_id 的一次性迁移 + 写时维护）, 让运行时只剩单表 join, 整个 snapshot 机制可删。
- **耦合度 4**: 4 个 Mapper + 对 `RecipeStation` 五个字段的隐式契约 + combo 命名约定; combo 解析依赖站点命名风格, 改个显示名就可能破坏组合站统计。
- **维护难度 5**: 335 行测试对 853 行实现, combo 启发式与五路匹配基本裸奔; usage 统计一旦错了很难定位是哪路匹配引入的。

## AdminShimmerController（703 行）

- **接口设计 6**: 四个 dataset 统一 CRUD + overview/context 的元数据驱动设计有想法, URL 一致性好。但 `requireDataset` 对未知 dataset 抛 IAE→400, 而语义上应是 404; PUT `sourceRevisionTimestamp` 处理与其它列不对称（在 update 单独拼接）; 响应是裸 `Map<String,Object>` 无 schema, Swagger 文档退化。
- **结构 6**: `DatasetSpec/ColumnDef/ValueType` 的表驱动设计本身是亮点, 消除了四套 CRUD 复制; 但 703 行里 spec 定义占 80 行、SQL 拼装 100 行、图片 enrich 130 行, 全部同层堆叠。
- **架构 3**: controller 手拼 SQL 字符串（表名/列名来自白名单 spec, 无注入风险, 确认过）+ `@Transactional` 标 controller + `SELECT LAST_INSERT_ID()` 取回插入 id（依赖同连接, JdbcTemplate 事务内成立但属于脆弱惯用法, 应 GeneratedKeyHolder）; `loadImageLookup` 为一次列表渲染打 4 张表的 IN 查询, 且 items/npcs/projectiles/buffs 的列名差异逐一硬编码。优化: 落成 `ShimmerDatasetService` + 统一的 `EntityImageLookupService`（其它 controller 也在做同样的 image 反查）。
- **耦合度 4**: 直接耦合 4 张 shimmer 表 + 4 张实体表列名 + `entity_source_snapshots` 的 manifest 结构 + `ItemImageSql` 公共 SQL 片段; `SOURCE_PAGE="微光"` 中文常量做数据过滤键——wiki 页面改名即数据蒸发。
- **维护难度 5**: 191 行/4 test 对 703 行实现; 表驱动降低了新增 dataset 的成本（好）, 但动态 SQL 无测试保障（坏）。

## AdminWikiZhRecipeImportController（405 行）

- **接口设计 6**: 单一 GET 概览端点, 聚合 14 个统计块+报告文件, 对导入验收场景实用; 但**一个请求打 13 条 SQL（其中 3 条带 EXISTS 子查询全表相关扫描）+ 目录扫描 + 文件解析**, 无任何缓存, 响应体形状是无 schema 的嵌套 Map。实测 200 且形状稳定, `reportFound:false` 时优雅降级。优化: 拆 `?section=` 或加 60s 缓存; 定义 DTO。
- **结构 6**: 方法切分清楚（每统计块一个私有方法）, 但 `loadTopSourcePages(boolean)` 两条几乎相同的 SQL 整段复制（差一个 `AND status=1`）, 应参数拼接; `HIGHER_PRIORITY_RECIPE_PROVIDER_SQL` 用 `String.formatted` 嵌入 SQL, 可读性差。
- **架构 3**: controller 直接持 JdbcTemplate 写 13 条 SQL + 自实现 `resolveRepoRoot`（第 2 套仓库根推断, 共性 #2）+ 扫 `reports/` 目录选最新文件 + Jackson 解析报告——数据访问、文件系统、展示聚合三层职责压在一层。`buildDatabaseSnapshot` 里 `recipeCount` 不过滤 `deleted=0` 而其它计数过滤, 口径不一致会让前端两数字对不上。优化: 下沉 `WikiZhRecipeImportReportService`, 统一 deleted 口径。
- **耦合度 4**: 与 recipes/items/recipe_* 五张表列名、报告文件命名约定 `wiki-zh-recipe-import-*.json`、仓库目录布局三方硬耦合; provider 优先级列表在 SQL 字符串和 CASE WHEN 里重复维护两份。
- **维护难度 5**: 146 行/1 test（只测 shape）; 13 条 SQL 的业务口径（suppressed/gap-only 语义）无一有测试, 也无注释解释业务含义。

## AdminCrawlerMonitorController（219 行）—— 重点

- **接口设计 8**: 18 个端点覆盖 overview/report/dispatch/control/cutover/回滚/epoch 恢复/attempt 日志增量读/SSE 事件/auto-dispatch/test-state, 动词型操作统一 POST、配置统一 GET+PUT, 命名清晰; `attemptLog` 的 `offset+maxBytes` 增量协议设计好。扣分: `/test-state` PUT 收 `Map<String,Object>` 无契约; `report?path=` 暴露文件路径作为 API 参数（虽有服务端白名单, 契约上仍是泄漏抽象）; cutover/rollback/recover 三端点强运维语义却没有 dry-run。
- **结构 8**: 219 行 18 端点, 全部单行委托, `requireAdminRole` 是唯一逻辑。该私有方法应上移为通用注解（它是全后端唯一做 role 校验的地方, 共性 #5）。
- **架构 8**: **分层边界是本组最好的**——与 Node 爬虫进程/文件状态的所有桥接都封装在 `CrawlerMonitorServiceImpl`(6908 行)里: 进程侧用可注入 `ProcessLauncher` 抽象（测试可替身）, PID 重认领走 `/proc/<pid>/cwd+cmdline` 双校验防误杀, 崩溃后 `HandleBackedProcess` 包装孤儿进程收编; 文件侧 `report?path` 有严格白名单（v2 attempt 路径正则 `日期/attempt-*/report.json` 三段校验+双向 symlink 检查+`toRealPath` 复核, 实测 `../../etc/hostname` 被拒绝且**降级为 200+errorMessage 而非 500**）; V1/V2 双引擎经 `queueEngineRouter.withMutationPermit` 门控, legacy 写被 V2 模式显式阻断。扣分点: 6908 行的 service 本身已是巨石（40+ 文件路径常量、队列、SSE、进程、cutover 五个子域挤在一个类）, controller 层无可挑剔但下一层需要拆; SSE 端点手动 `setContentType` 属多余（SseEmitter 自带）。优化: 按子域拆 `DispatchService/CutoverService/ArtifactService/EventStreamService`（crawlerv2 包已有 28 个类的拆分先例, 继续推进即可）。
- **耦合度 8**: 依赖两个 service 接口; 唯一直连的杂项是 `WikiImageLocalizationService.cacheMetrics()` 挂在本 controller 下（`/wiki-image-cache-metrics` 与爬虫监控弱相关, 宜挪走）。
- **维护难度 8**: 1135 行 controller 测试(34 test) + 7739 行 service 测试(187 test) + crawlerv2 包 14 个测试文件, 是全组覆盖最扎实的; 扣分在 service 巨石使回归定位成本高。

## AdminDataSourceAcceptanceController（28 行）/ AdminDomainAcceptanceController（28 行）/ AdminSupportDomainController（28 行）

三者同评: 单端点纯委托, 结构满分。实测三端点 200, 形状统一（`overallStatus/blockingCount/warningCount` 语义化聚合）。
- **接口设计 9**: overview 聚合语义清楚; 唯一改进是 850~1050 行的 service 聚合无分节参数, 全量返回偏重。
- **架构 9 / 耦合 9**: 委托边界干净, 复杂度全部在 `*ServiceImpl`（各 ~850-1050 行, 有独立测试）。
- **维护难度 8-9**: 各有 122/209/115 行测试。DomainAcceptance 测试略厚给 9。
- 优化: 无紧迫项; service 聚合可按 panel 懒加载。

## AdminClassificationAuditController（188 行）

- **接口设计 7**: 只读审计聚合, 五个 section 各带独立 pagination——但**五个 section 共用同一 page/limit 参数**, 翻第 3 页时所有 section 一起翻, 各 section 行数差异大时体验怪异。优化: `?section=` 单节分页。
- **结构 7**: `section(...)` 提取消除了五段重复, SQL 内联但可读。
- **架构 5**: JdbcTemplate 进 controller（共性 #1 轻度版）; 每请求固定 10 条 SQL（5 count + 5 rows）, `missingReferences` 的三路 UNION count 每翻一页都全量重算。优化: 下沉 service + count 短缓存。
- **耦合度 6**: 与 6 张表列名耦合; 纯只读, 风险有限。
- **维护难度 7**: 79 行测试覆盖 shape; SQL 语义（合法 drop_source_kind 白名单）硬编码在两处字符串里, 改枚举需同步 count/rows 两条 SQL。

## AdminAudioAssetController（334 行）

- **接口设计 7**: summary/list/stream 三端点合理; `stream` 支持 Range/206、`Content-Disposition inline`、416 处理规范, 是像样的音频流实现。`matchStatus` 过滤实为对 join 表的过滤但 count 用 `COUNT(DISTINCT aa.id)` 保持了正确性（确认过）; `GROUP_CONCAT` 聚合 match_statuses 返回逗号串而非数组, 契约弱。
- **结构 7**: SQL/DTO 映射/Range 处理分区明确; `toAudioAssetPayload` 15 行逐字段搬运可换 RowMapper。
- **架构 5**: 列表/summary 的 SQL 在 controller（共性 #1）, 但 stream 正确下沉到 `AdminAudioAssetStreamService`(144 行, 含 `safeLocalPath` 路径逃逸防护, 有独立测试)——同一 controller 内两种范式并存恰好自证了应统一的方向。`copyRange` 手写而非用 `ResourceRegion`（Spring 原生支持 Range, 可删 40 行）。
- **耦合度 5**: audio_assets/audio_asset_links 两表列名 + local_path 磁盘布局约定。
- **维护难度 7**: 217 行 controller 测试 + 独立 stream service 测试, Range 分支有覆盖。

## AdminStorageController（52 行）

- **接口设计 8**: 单 POST 同步执行 wiki 图片镜像, `AdminJobLockService` + 409 防并发是本组少有的正确姿势; 扣分: 长任务同步阻塞 HTTP（TTL 秒级配置暗示任务可能很长）, 无进度查询端点。优化: 转异步 job + GET 进度（爬虫监控已有现成 progress 文件模式可复用）。
- **结构 9**: 锁获取-执行-finally 释放, 干净。
- **架构 8**: `@ConditionalOnProperty` 按 MinIO 开关裁剪整个端点, 与存储后端解耦得当; 同步执行占用 Tomcat 线程是唯一architecture扣分。
- **耦合度 8**: 三依赖全部接口化。
- **维护难度 7**: 60 行测试覆盖锁冲突分支; 任务本体在 `WikiImageSyncServiceImpl`(1067 行)有独立覆盖。

## ItemImportController（53 行）

- **接口设计 7**: `?dryRun=` 免锁试算的设计好; 但路径是 `/items/import` 不在 `/admin` 前缀下, 靠拦截器里 `path.startsWith("/items/import")` 的特判纳入鉴权（已实测 401 生效）——规则藏在拦截器字符串比对里, 是"约定优于配置"的反例, 挪到 `/admin/items/import` 可删掉该特判。
- **结构 8**: 与 AdminStorageController 同构的锁模板; 两处 `tryAcquire(...).map(lock -> try/finally)` 已是第二次复制, 该抽 `adminJobLockService.runExclusive(key, ttl, supplier)`。
- **架构 8**: service 接口委托 + dryRun 分流清楚; dryRun 不加锁意味着可与真实导入并发跑, 若 service 内部有共享 staging 状态会互踩（需在 service 层确认, 契约上未声明）。
- **耦合度 8**: 三依赖接口化; log.info 打 request 字段无敏感信息。
- **维护难度 7**: 110 行测试覆盖锁/dryRun 分支。
