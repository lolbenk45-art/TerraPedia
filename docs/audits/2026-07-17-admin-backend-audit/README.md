# TerraPedia 后台页面与后端 API 评分审查（总报告）

- 日期: 2026-07-17
- 范围: data-query-app 全部 31 个页面（32 路由截图实测）+ back/ 全部 64 个 controller
- 方法: 本地栈实机启动（backend=18191, admin=13004），Playwright 登录后逐页截图评视觉；8 个并行评审组逐文件读源评分；关键疑点用 curl/日志/对照实验实证
- 评分: 10 分制 × 5 维度。前端: 视觉/结构/架构/耦合度/维护难度；后端: 接口设计/结构/架构/耦合度/维护难度
- 分项明细: 见同目录 fragment-*.md（每页/每 controller 均有逐维度点评+优化方案）
- 视觉分注: 首轮截图缺 CJK 字体已修复重截；核心/文章/实体组视觉分采用复核值（fragment-visual-recheck.md），运维组采用组内评审值

## 总览

| 端 | 对象数 | 总均分 |
|---|---|---|
| 前端（后台页面） | 25 个评分单元 | **6.2 / 10** |
| 后端（API controller） | 64 个 | **6.5 / 10** |

两端共同画像：**读路径/展示层质量中上，写路径/巨石文件/横向复制是主要债务**。高分对象普遍是"薄页面/薄委托 + 有类型层 + 有行为测试"，低分对象全部命中"巨石 + 散装分支 + 零测试"。

## 前端页面排名（按均分）

| # | 页面 | 视觉 | 结构 | 架构 | 耦合 | 维护 | 均分 |
|---|---|---|---|---|---|---|---|
| 1 | login.vue | 7 | 9 | 8 | 6 | 8 | **7.6** |
| 2 | users.vue | 7 | 8 | 7 | 7 | 8 | **7.4** |
| 3 | recipes/wiki-zh-import.vue | 7 | 8 | 7 | 8 | 7 | **7.4** |
| 4 | articles.vue | 7.5 | 7 | 7.5 | 7 | 6 | **7.0** |
| 5 | item-rarities.vue | 8.5 | 7 | 6 | 6 | 7 | **6.9** |
| 6 | index.vue（仪表盘） | 8 | 7 | 7 | 6 | 6 | **6.8** |
| 7 | categories.vue | 7 | 8 | 7 | 6 | 6 | **6.8** |
| 8 | operations/audio-assets.vue | 8 | 6 | 7 | 6 | 7 | **6.8** |
| 9 | operations/armor-attributes.vue | 7 | 8 | 6 | 6 | 7 | **6.8** |
| 10 | query.vue | 7.5 | 7 | 6 | 6 | 6 | **6.5** |
| 11 | article-comments.vue | 7 | 6 | 7 | 6.5 | 5.5 | **6.4** |
| 12 | article-editor（new+[id]+composable+组件） | 7.5 | 6 | 6.5 | 6.5 | 5.5 | **6.4** |
| 13 | entities/town-npcs 工作台 | 8 | 6 | 6.5 | 5.5 | 6 | **6.4** |
| 14 | recipes/tree.vue | 7.5 | 7 | 6 | 5 | 6 | **6.3** |
| 15 | recipes/shimmer.vue | 7 | 7 | 6 | 6 | 5 | **6.2** |
| 16 | operations/data-source-acceptance.vue | 7 | 6 | 6 | 6 | 6 | **6.2** |
| 17 | item-groups.vue | 6 | 6 | 7 | 6 | 6 | **6.2** |
| 18 | operations/domain-acceptance.vue | 6 | 5 | 6 | 7 | 6 | **6.0** |
| 19 | items.vue | 6.5 | 5 | 7 | 6 | 5 | **5.9** |
| 20 | recipes/index.vue | 8 | 6 | 5 | 5 | 4 | **5.6** |
| 21 | operations/crawler-monitor.vue (4445行) | 7 | 4 | 6 | 5 | 4 | **5.2** |
| 22 | operations/classification-audit.vue | 4 | 7 | 5 | 3 | 5 | **4.8** |
| 23 | operations/crawler-monitor-test.vue (2879行) | 6.5 | 3.5 | 5 | 4 | 3 | **4.4** |
| 24 | recipes/stations.vue (2090行) | 7 | 4 | 4 | 3 | 2 | **4.0** |
| 25 | entities/[type].vue (5603行, 8实体) | 7.5 | 3 | 4 | 3 | 2.5 | **4.0** |

已删除页（不评分）: recipes/groups.vue、article-editor-design.vue（commit 9762905 正确退役；.output 旧构建产物中仍残留 chunk）。

## 后端 Controller 排名（Top / Bottom，全量 64 个见 fragment-be*）

**Top 10**

| Controller | 均分 | 亮点 |
|---|---|---|
| AdminDomainAcceptanceController | 9.2 | 薄委托范本 |
| AdminDataSourceAcceptanceController | 9.0 | 薄委托范本 |
| AdminSupportDomainController | 9.0 | 薄委托范本 |
| AdminItemRecipeController | 8.6 | 分层完整 |
| PublicItemAggregateController | 8.6 | 标准 410 退役范本 |
| E2eVerificationMailboxController | 8.1 | 多层防激活设计扎实 |
| AdminCrawlerMonitorController | 8.0 | 进程桥接边界全组最佳（可注入 ProcessLauncher、/proc 双校验、路径白名单实测有效） |
| AdminStorageController | 8.0 | — |
| ArticleController | 8.0 | — |
| PublicBoss/Buff/Biome/Projectile/Home/ContentReference | 7.9 | 统一薄委托家族 |

**Bottom 10**

| Controller | 均分 | 主因 |
|---|---|---|
| AdminArmorSetController (2214行) | 3.0 | 上帝 controller、写路径无事务 |
| AdminNpcController | 3.4 | 无 service、与 NpcRelation 双写同表 |
| AdminBuffController | 3.4 | 同上模式 |
| AdminTownNpcMaintenanceController | 4.2 | 架构 3 分 |
| AdminNpcRelationController | 4.4 | 与 Npc ~500 行逐字重复 |
| AdminBoss / AdminProjectileController | 4.6 | Projectile 直绑 entity（mass assignment） |
| AdminRecipeGroupController | 4.6 | controller 内 JSON 文件当数据库、并发写无锁 |
| AdminCraftingStation / AdminShimmer / AdminWikiZhImport | 4.8 | 胖 controller：SQL/文件 IO/私有缓存全塞 controller |

组均分: 实体 Admin 组 **5.0**（14 个）、配方运维组 **6.9**（14 个）、内容/用户/公共组 **7.0**（36 个）。

## P0 — 立即修（bug/安全实锤）

1. **全站 404 → 500 白屏**（pinia 2.3.1 `shouldHydrate` 对 null-proto query 对象调 `obj.hasOwnProperty` 抛 TypeError，对照实验证实任意 404 均复现）。修复: 升级 pinia（新版已用 `Object.prototype.hasOwnProperty.call`）+ 补根级 `error.vue`。注: /recipes/groups "500" 即此机制 + dev server 陈旧 bundle 所致，后端零改动，重启 dev server 即恢复 301。
2. **后端写路径无事务**: `syncNpcRelations`（跨 3-4 表 DELETE+循环 INSERT）、`syncBuffSourceItems`、ArmorSet 全部写路径。同一关系表被 NpcRelationController（有事务）与 NpcController（无事务）双写。delete 普遍留孤儿行。
3. **鉴权 fail-open 结构**: 三拦截器各自硬编码路径前缀+正则，新增端点漏配即公开；`/items`/`/categories`/`/files` 靠"非 GET 才鉴权"；配方运维组 13/14 controller 写端点只验 token 不验 role（仅 CrawlerMonitor 自带 `requireAdminRole`）。建议改注解声明式鉴权。
4. **Projectile mass assignment**: 直接绑定 entity，`deleted`/`rawJson` 可被客户端写入；全组零 `@Valid`。
5. **JWT 治理缺口**: admin/user 双域隔离全押在两个 secret 相异上（role claim 不参与鉴权、无校验阻止配成同值）；secret 无长度下限；admin 密码明文配置 + 非恒时比对；鉴权失败返回 400/500 而非 401。
6. **town-npcs 搜索面板真 bug**: `buildPriceVisual` 读 `buyPrice/sellPrice`，接口返回 `buy/sell`，金币 chip 永不渲染（regex contract 测试测不出）。
7. **编辑器草稿静默失效**: `writeLocalDraft` 无 try/catch，大图触发 QuotaExceededError 时自动保存静默死亡而状态栏仍显示"已更新"。
8. **crawler-monitor 主页违反定稿决议**: L2916/L2933 接入 `test-domain-smoke`（2026-06-15 计划明确"主监控页不得出现烟雾测试"）；crawler-monitor-test 的 `test-state` 场景模拟器写端点无环境隔离暴露在生产路由。

## P1 — 结构债（重构路线已在分报告给出）

1. **五大巨石文件**（合计 ~17k 行）: entities/[type].vue 5603（159 处 entityType 硬编码触点，加一实体要改 20-28 处；四阶段拆分路线图见 fragment-fe4）、crawler-monitor.vue 4445（含 ~800-1000 行"面板 Tab 时代"死代码可零风险清扫；V1 函数群抽 `useLegacyWikiMonitor()` 让 P3 退役变"删一个文件"）、crawler-monitor-test 2879（拆"域烟雾工作台"与"dev 模拟器"两页）、stations.vue 2090（三工作区一页扛 + `v-if="false"` 死代码）、AdminArmorSetController 2214。
2. **后端 12/14 实体 controller 无 service 层**（讽刺: 前台 PublicXxxService 都存在）；ItemRarity 是唯一教科书样本，建议以 `AdminCrudService<E,ID,REQ,RES>` 泛型骨架收口。
3. **横向复制风暴**: 后端 `trimToNull` 15 份、`getClientIp` ~8 份（无条件信任 X-Forwarded-For，正确的 ClientIpResolver 已存在没人用）、`TimedValue` 手写缓存 3 份、Npc↔NpcRelation ~500 行逐字重复；前端 `formatNumber`/`statusTone` 等 6+ 页重复且空值语义相反（'--' vs '0'）、10 字段"制作站返回上下文" query 协议在 3 页逐字复制、四文件各拷 coin-chip 样式 ~160 行。
4. **共享设施采用率≈0**: AdminDataTable/AdminTableShell/AppPagination 质量不错但 8 个核心页全部手写 table；`.data-table` CSS 至少四份逐字拷贝。
5. **僵尸代码**: town-npcs 旧 detail/edit 页 ~1050 行零入口且已行为漂移（edit 提交 `''` vs 模态提交 `null`）；items.vue 内联 300 行编辑器 modal + `Object.assign(form, item)` 全字段回传。
6. **controller 内文件数据管道**: 6 个 controller 请求路径上读 data/generated/*.json，仓库根推断三副本，缓存策略三种并存；建议统一 `GeneratedDataFileCache` + `@ConfigurationProperties`。

## P2 — 一致性与测试

1. **响应契约不统一**: 201/200 混用；not-found 四种投递方式并存；armor-sets "success 无 data" 实锤 = PublicArmorSetController:61-63 + `@JsonInclude(NON_NULL)`；POST 201 时 body statusCode 恒 200；CategoryManagementController 所有错误以 HTTP 200 发出。
2. **接口语义缺口**: `/admin/articles?status=` 只过滤发布态，审核队列只能全量拉取（前端为此做了 N+1 补偿: 每篇文章发 limit=1 请求取评论数——应后端直接返回 commentCount）。
3. **测试倒挂**: 写路径全组零测试（最复杂的 `replaceNpcShopEntries` 级联替换零覆盖）；配方域前端零命中；RecipeGroup/RecipeCondition 零测试；而 regex-against-.vue contract 测试锁死 class 名/CSS 字面量构成重构税（正确范式项目里已有: vm+transpile 跑 store、happy-dom 真执行 sanitizer）。重构顺序必须"先补最小行为测试 → 迁移 → 退役 regex 断言"。
4. **视觉三类结构性缺陷**（字体修复后依然存在，与字体无关）: ① 窄列逐字竖排折行（entities-npcs 最重 5.5 分、items/users/armor-sets/condition-terms）；② 容器右缘硬裁切（query 表格、article-comments 主按钮、condition-terms 操作列整列被裁）；③ 图标豆腐块（login Logo 首屏、categories 树图标）。另: 顶部橙色告警条全页常驻抢焦点；`--font-sans` 无 CJK 字重导致混排发虚；classification-audit 引用 6 处不存在的 CSS 令牌名（`--text-muted` 实名 `--color-text-muted`）静默失效。
5. **legacy 双家族**: `/items`/`/npcs`/`/categories` 与 `/public/*` 大面积重叠且净化强度不同，应照 PublicItemAggregate 的 410 墓碑范本退役。
6. **双净化器漂移**: 前台已切 DOMPurify，管理端仍手写白名单 sanitizer，同一内容两套语义。

## 建议执行顺序

1. 一周内: P0 全部（pinia 升级 + error.vue 是半天工作量；事务注解补齐一天；拦截器改注解式 2-3 天）
2. 两周: 死代码清扫（crawler-monitor ~1000 行、stations 死块、town-npcs 僵尸页、items modal 抽离）——全部零行为变更
3. 一月: AdminCrudService 骨架落地 + 工具函数收编（AdminTextUtils / utils/adminFormat.ts / useRouteSyncedFilters）
4. 之后: [type].vue 四阶段拆分（前置: 行为测试补齐）、legacy API 家族 410 退役
