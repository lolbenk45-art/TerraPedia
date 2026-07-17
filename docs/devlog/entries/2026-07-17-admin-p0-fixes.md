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
