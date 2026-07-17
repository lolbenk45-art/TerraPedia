# 2026-07-17 后台+后端 P0 安全与 Bug 修复批

Branch: `fix/admin-p0-batch`（基于 main `6825435`）
Plan: `docs/superpowers/plans/2026-07-17-admin-p0-fixes.md`
Audit source: `docs/audits/2026-07-17-admin-backend-audit/`

## Scope

2026-07-17 后台页面+后端 API 全量评分审查（前端 6.2 / 后端 6.5）产出的 P0 修复批。
最小边界原则：不做拦截器注解式重写、不做 AdminCrudService、不升 pinia 3.x。
计划经独立评审（1 blocker + 4 major 发现）修订后执行。

## Commits

| Commit | 内容 |
|---|---|
| `4556ca7` | 审计报告（10 份 fragment + README）+ 执行计划入库 |
| `82f51f0` | pinia 2.3.1 pnpm patch（mjs/cjs/prod.cjs 三产物 9 处 hasOwnProperty）+ 根级 error.vue；修复全站 404 渲染成 500 白屏 |
| `5e1e796` | AdminNpc/AdminBuff/AdminArmorSet 7 个多表写方法补 @Transactional |
| `40b0c83` | Projectile create 阻断客户端 deleted 注入（TDD：ArgumentCaptor 失败测试先行） |
| `b1a993e` | 管理员登录恒时比对（双 boolean 无短路）+ AuthSecretsGuard（admin/user secret 同值 fail-fast、<32 字符 WARN） |
| `32d34e9` | selectItemSuggestions 加 buy/sell 列 + buildPriceVisual 兼容 buy/sell 字段；修复 town-npcs 搜索面板金币 chip 永不渲染 |
| `e43a70b` | writeLocalDraft 包 try/catch，QuotaExceeded 时 saveStatus='error' 显示"保存失败" |
| `08b8b36` | crawler-monitor-test 模拟器 dev 守卫：仅 savePayload/resetState/startTimedSimulation 写路径 + 三模板区块 + 工具栏重置按钮；loadState 数据链路不动（review blocker 修正） |
| `6497848` | 密码重置去明文回显（DTO/service/store/page 四处删 temporaryPassword） |

## Validation Evidence

- 后端定向回归: AdminNpc/AdminBuff/AdminArmorSet/AdminProjectile/Auth/AdminNpcRelation 共 86 测试 0 失败
- 管理端: `pnpm run check` 通过；`pnpm run test:unit` 350/350
- crawler contract: page-contract + unified-status + chinese-copy 68/68（dev 守卫未假红）
- 浏览器冒烟: 404 渲染 error.vue（截图 tmp/admin-audit/shots/smoke-404.png）；/recipes/groups 301；suggestions API 实测返回 buy/sell
- 后端全量 `mvn test`: 1401 测试 6 failures + 1 error，**全部为存量失败与本批无关**——
  ItemMapperPreferredImageSqlTest 3 项经"回退 ItemMapper.xml 到改动前重跑仍失败"隔离验证；
  LegacyLocalBackendPortCleanerTest×2 / AdminAudioAssetControllerTest×1 / AdminWikiZhRecipeImportControllerTest×1 为环境依赖类，与本批文件零交集

## Residual Risks / Handoff

- 存量 7 个全量套件失败需另立任务排查（疑与 main 上其它合并相关）
- P0 计划中 2 项经边界决策**有意不做**: Npc/Buff delete 级联清理（逻辑删除语义待设计）、后端 test-state @Profile 隔离（转后续）
- 后续批次: P1 死代码清扫（crawler-monitor ~1000 行、stations 死块、town-npcs 僵尸页）、拦截器注解式鉴权专项、AdminCrudService 骨架——见审计 README 的优先级路线
- dev server 13004 已重启加载 pinia patch；后端 18191 已重启加载新 mapper

## 2026-07-18 续: P1+P2 批进行中

计划: `docs/superpowers/plans/2026-07-17-admin-p1-p2-batch.md`（已按独立评审 1 blocker + 8 major 修订，评审发现全部内嵌在计划正文的"评审修正"标注里）。事实基线: `docs/audits/2026-07-17-admin-backend-audit/scout-*.md` 三份侦察报告（行号已实地核实）。

进度（15 task）:

- [x] A1 拦截器 ADMIN role 深度防御（`6cd6457`，AdminAuthenticationInterceptorTest 9/9 绿）
- [ ] A2 鉴权失败统一 401（UnauthenticatedException + 10 副本守护式 + **UserReadingHistoryControllerTest L115-120 断言须迁移 400→401**）
- [ ] B1 crawler-monitor 32 符号 ~293 行死链（+删 contract 测试 L625 正向锁定）
- [ ] B2 stations 死块 L409-411+连带 / town-npcs 两僵尸页 1046 行（**硬前置: npc-projection-json-visibility.test.mjs 三处收窄**）/ audio-assets 死 CSS
- [ ] C1 字体栈 CJK+emoji + login/CategoryTreeNode 换 lucide（本机无 emoji 字体，纯字体栈方案验收不了）
- [ ] C2 表格裁切（query.vue `data-table-wrap` 孤儿类一行修）+ 竖排折行（**须 flex-wrap:nowrap 非 white-space**）
- [ ] C3 classification-audit 7 处失效令牌 + AppPagination 翻页
- [ ] C4 硬编码颜色→令牌（index 五彩 tag 保留 hex，验收是"主题统一"非"视觉一致"）
- [ ] C5 matchStatuses split 精确匹配 + TOKEN_COOKIE_KEY 导出 + items 白名单（**保留 rarity/relatedCategoryIds/imageUrl 三变换**）
- [ ] D1 trimToNull 35 份收编（**20+ 在 service/ 侧，git add 覆盖整个 skills/**）
- [ ] D2 ClientIpResolver 接入 8 处（**blocker 修正: 8 个测试文件构造器须补 mock，仿 UserAuthControllerTest:36**）
- [ ] D3 CategoryManagement 真实状态码（6 处删 catch + L47 须新建 ResourceNotFoundException）
- [ ] D4 reviewStatus 过滤（**须 allow-null 包装，normalizeReviewStatus 空值→DRAFT 会误过滤**）+ 删 N+1（**admin-global-comment-management-contract L61/71/72 正向锁定须同步改**）
- [ ] D5 syncNpcShopEntries conditions 级联 3 用例
- [ ] D6 formatDateTime 收编（**只并逐字相同的 6 处，tree.vue:192 是 2-digit 版不并**）+ coin-chip 2 份下沉（B2 删掉两份后只剩 2）

执行约定: 按 task 顺序做、每 task 独立提交（commit message 风格照前 12 个）、每 task 跑计划里列的验证命令。B2 依赖先于 D6（coin-chip 份数）。全部完成后收尾: 后端 `mvn test -Dtest='Admin*Test,Auth*Test,*Article*'`（存量 7 失败为已知基线不新增即可）+ `pnpm run check` + `pnpm run test:unit` + 关键页重截图，然后由用户裁决是否合 main。
