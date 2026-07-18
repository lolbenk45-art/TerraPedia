# P0 收尾 + P1 + P2 修复批 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在当前 `main` 的独立任务分支上完成审计遗留的 P1 死代码清扫与视觉快修、P2 可安全落地的收编项，并完成尚未被 P0 B 版覆盖的鉴权收尾。

**Architecture:** 延续最小边界原则。事实基线来自三份已入库侦察报告（`docs/audits/2026-07-17-admin-backend-audit/scout-*.md`）；报告行号基于旧基线，只作符号定位提示，执行每个 task 前必须在当前代码重新定位。每 task 独立提交。

**Tech Stack:** Spring Boot (back/), Nuxt 4 + pnpm (data-query-app/), node:test

**分支:** `fix/admin-p1-p2-batch`，基于本地 `main@218dfc0`（包含 P0 B 版与抢救文档）。废弃档案分支 `fix/admin-p0-batch` 只允许读取交接说明，不得 cherry-pick 或复制实现。

**2026-07-18 接续修正:**

- `2cbcf99` 是 `218dfc0` 的直接祖先；新增的 `218dfc0` 只修改 crawler V2 cutover 脚本，与本计划目标文件无交集。
- Task A1 已由 P0 B 版提交 `4db4df8` 的注解式鉴权和拦截器 ADMIN role 校验覆盖；新基线聚焦测试 `AdminAuthenticationInterceptorTest,AuthControllerTest` 为 13/13 通过。本分支不重复实现或取档案分支 `6cd6457`。
- 本轮实际执行范围为 A2–D6，共 14 个 task；A1 仅保留为已验证的历史前置。

**边界决策记录（执行者不得越过）:**
1. `/admin/npcs` 双写收口**不做**——syncNpcShopEntries(AdminNpcController) 与 replaceNpcShopEntries(AdminNpcRelationController) 是两条并行实现，唯一化是行为变更需独立设计；本轮只补测试（Task D5）。
2. items.vue 编辑 modal **不抽组件**（重构风险大、regex 测试锁中文文案），只修 `Object.assign(form, {...item})` 全量展开的白名单化（Task C5）。
3. formatNumber 收编**不做**——11 处定义空值语义刻意相反（'--' vs '0'），统一需产品决策；本轮只收编 formatDateTime（7 处逐字相同）。
4. firstNonBlank 收编**只收语义等价组**——21 份分 5 种语义，`"image"` 兜底组原地保留。
5. ClientIpResolver 接入是**有意的安全修正**（副本无条件信任 XFF 取最左，Resolver 是受信代理白名单+从右取）——审计日志 IP 口径会变，属预期改进。
6. AdminCrudService 泛型基类**不做**（侦察结论：CT/WC 三处业务差异使收益有限）；ConditionTerm/WorldContext 分层试点也推迟——两者已是 MyBatis-Plus 薄封装，收益低于风险。
7. uploadArticleImage 定性修正：拦截器 L74 已覆盖 `/user/articles` 前缀，**不是鉴权绕过**；Task A2 顺带把它改成守护式（纵深防御）。
8. crawler-monitor 死代码第二批候选（runtimeDialogSummaryCards 链 ~100 行）**不动**，只删已核实的 32 符号 ~293 行。

---

## 批次 A: P0 鉴权收尾（后端）

### Task A1: 拦截器 role 深度防御（已由 P0 B 版覆盖）

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/auth/AdminAuthenticationInterceptor.java`（L44-47）

侦察已证实 `AdminJwtService.issueToken` L39 恒签 `role=ADMIN` 且是唯一签发路径——此改动是纯深度防御，现存合法 token 全部通过。

- [x] **Step 1: preHandle 的 try 块内加 role 判断**（`4db4df8` 已覆盖）

原 L44-47:

```java
        try {
            AdminTokenClaims claims = adminJwtService.parseAndValidate(token);
            request.setAttribute(ADMIN_CLAIMS_ATTRIBUTE, claims);
            return true;
```

改为:

```java
        try {
            AdminTokenClaims claims = adminJwtService.parseAndValidate(token);
            if (!"ADMIN".equalsIgnoreCase(claims.getRole())) {
                writeUnauthorizedResponse(response, "无权访问管理端接口");
                return false;
            }
            request.setAttribute(ADMIN_CLAIMS_ATTRIBUTE, claims);
            return true;
```

- [x] **Step 2: 编译 + 回归 + 冒烟**（接续基线聚焦测试 13/13 通过；运行态冒烟留待最终验收）

```bash
cd back && mvn -DskipTests compile && mvn -Dtest=AdminAuthenticationInterceptorTest,AuthControllerTest test
# 注意: AuthControllerTest 是 standalone MockMvc 不经过拦截器，真正覆盖 preHandle 的是
# AdminAuthenticationInterceptorTest（含 shouldAllowProtectedWriteRequestWithValidToken 用真 token 走 preHandle）
# 重启后端后: 正常 token 仍可访问 /api/admin/* (200)
```

- [x] **Step 3: 提交**（沿用主线 `4db4df8`；本分支不重复提交）

```bash
git add back/src/main/java/com/terraria/skills/auth/AdminAuthenticationInterceptor.java
git commit -m "fix(back): enforce ADMIN role claim in admin auth interceptor"
```

### Task A2: 鉴权失败 400/500 → 401 统一（方案 A）

**Files:**
- Create: `back/src/main/java/com/terraria/skills/auth/UnauthenticatedException.java`
- Modify: `back/src/main/java/com/terraria/skills/handler/GlobalExceptionHandler.java`（在 AdminAccessDeniedException 条目 L56-61 旁加 401 条目）
- Modify: 10 个 controller 的 `getRequiredClaims` 私有副本（侦察报告 scout-p2-backend.md 项 2 有逐文件行号）: 6 个 User 侧抛 IllegalArgumentException 的改抛新异常；4 个裸强转的（含 AdminArticleController/UserArticleController）改守护式
- Modify: `back/src/test/java/com/terraria/skills/controller/UserReadingHistoryControllerTest.java`（**L115-120 `shouldRejectMissingClaimsWithSanitizedBadRequest` 显式锁缺 claims→400，必须迁移断言为 401**，测试名同步改）
- Modify: `UserArticleController.java` L97 `getRequiredClaims(httpRequest);` 保持调用但确保新实现缺 claims 即抛（守护式后自动生效）

**不触碰**: `ArticleCommentController.getOptionalUserId`（L141-147）是唯一"故意容忍无 token"路径，保持原样。

- [x] **Step 1: 新建异常类**

```java
package com.terraria.skills.auth;

public class UnauthenticatedException extends RuntimeException {
    public UnauthenticatedException(String message) {
        super(message);
    }
}
```

- [x] **Step 2: GlobalExceptionHandler 加条目**（**照抄 L56-61 AdminAccessDeniedException 条目的实际风格: `@ResponseStatus` + 裸 ApiResponse**，不是 ResponseEntity——先读该条目再写）

```java
    @ExceptionHandler(UnauthenticatedException.class)
    @ResponseStatus(HttpStatus.UNAUTHORIZED)
    public ApiResponse<Void> handleUnauthenticated(UnauthenticatedException exception) {
        return ApiResponse.error(HttpStatus.UNAUTHORIZED.value(), exception.getMessage());
    }
```

- [x] **Step 3: 统一 getRequiredClaims 副本为守护式**

User 侧模板（**保留现有 6 个副本的 `getUserId() != null` 守卫，不得弱化**）:

```java
    private UserTokenClaims getRequiredClaims(HttpServletRequest request) {
        Object attribute = request.getAttribute(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE);
        if (!(attribute instanceof UserTokenClaims claims) || claims.getUserId() == null) {
            throw new UnauthenticatedException("未登录或登录状态已失效");
        }
        return claims;
    }
```

（Admin 侧把类型换成 AdminTokenClaims/常量换成 AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE，无 userId 条件。）

逐文件清单见 scout-p2-backend.md 项 2（10 个 controller）。改完 `grep -rn "getRequiredClaims" controller/ | grep -c private` 应仍为 10（只改实现不合并，合并属后续 ArgumentResolver 项）。

- [x] **Step 4: 验证 + 提交**

```bash
cd back && mvn -DskipTests compile && mvn test -Dtest='*Article*,*User*' 2>&1 | grep -E "Tests run.*Fail|BUILD"
# 无 token 请求 /api/user/favorites → 401（原 400）
git add back/src/main/java/com/terraria/skills/auth/UnauthenticatedException.java back/src/main/java/com/terraria/skills/handler/GlobalExceptionHandler.java back/src/main/java/com/terraria/skills/controller/ back/src/test/java/com/terraria/skills/controller/UserReadingHistoryControllerTest.java
git commit -m "fix(back): unify missing-claims auth failures to HTTP 401"
```

---

## 批次 B: P1 死代码清扫（零行为变更）

### Task B1: crawler-monitor.vue 面板时代死链（32 符号 ~293 行）

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor.vue`
- Modify: `data-query-app/tests/crawler-monitor-page-contract.test.mjs`（**只删 L625** `assert.match(page, /monitorPanels\.value\[0\]/)`；L33-36 负向断言保留）

- [x] **Step 1: 按 scout-p1-deadcode.md 项 1 的符号清单删除**

核心链: `monitorPanels`(L908-949)、`activeMonitorPanelMeta`(L950)、`activeMonitorPanel`(L346)、`setActiveMonitorPanel`(L957-969)、`v4StatusStrip`(L833-861)、`v4MetricCards`(L862-907)、`crawlerHealthCards`(L566-625)、`blockedDomainFocus`(L1067-1096)、`selectBlockedDomainFocus`(L1838-1850)、4 个 helper(L3483-3499)、类型 MonitorPanelMeta/MonitorPanelKey(L330-339)。删除顺序: 先删消费端再删定义端，每删一组 grep 确认无残余引用。

- [x] **Step 2: 将旧正向 contract 改为 whole-symbol 负向断言并验证**

```bash
cd data-query-app && pnpm run check && node --test tests/crawler-monitor-page-contract.test.mjs tests/crawler-monitor-unified-status.test.mjs tests/crawler-monitor-triage-workbench.test.mjs tests/crawler-monitor-execution-overview.test.mjs
```

- [x] **Step 3: 提交**

```bash
git add data-query-app/pages/operations/crawler-monitor.vue data-query-app/tests/crawler-monitor-page-contract.test.mjs
git commit -m "refactor(admin): remove panel-era dead code from crawler monitor"
```

### Task B2: stations.vue 死块 + town-npcs 僵尸页 + audio-assets 死 CSS

**Files:**
- Modify: `data-query-app/pages/recipes/stations.vue`（删 L409-411 死块；连带 `showInlineBindingEditor` L620、`showBindingEditor` L584+L691+L1220、`ItemRecipeEditor` import L520、`.binding-editor` CSS L1902-1905）
- Delete: `data-query-app/pages/entities/town-npcs/[id]/index.vue`（601 行）、`[id]/edit.vue`（445 行）
- Modify: `data-query-app/tests/npc-projection-json-visibility.test.mjs`（**硬前置**: 删两文件的 readFileSync L11-12、detail-portrait test 块 **L63-70**、town-npc 中文文案 entry **L188-189**、收窄 **L38 与 L195 两处循环**——共 3 类改动点，不改会在加载阶段崩；行号可能漂移，按符号名定位）
- Modify: `data-query-app/composables/useTownNpcMaintenance.ts`（删独占导出 `buildWikiTagLine`；其余导出有 Workbench 消费者不动）
- Modify: `data-query-app/pages/operations/audio-assets.vue`（删 `.pill` L1087-1099、`.pill--muted` L1100-1103、`.audio-asset-table th` 重复 sticky 段 L1066-1071）

- [x] **Step 1: 按上述清单删除，每文件删后 grep 确认无残余引用**
- [x] **Step 2: 验证**

```bash
cd data-query-app && pnpm run check && pnpm run test:unit 2>&1 | grep -E "^ℹ (pass|fail)"
```

- [x] **Step 3: 提交**

```bash
git add -A data-query-app/pages/recipes/stations.vue data-query-app/pages/entities/town-npcs data-query-app/tests/npc-projection-json-visibility.test.mjs data-query-app/composables/useTownNpcMaintenance.ts data-query-app/pages/operations/audio-assets.vue
git commit -m "refactor(admin): remove dead binding editor, zombie town-npc pages, orphan css"
```

---

## 批次 C: P1 视觉与杂项快修

### Task C1: 字体栈 CJK+emoji + 图标去 emoji 化

**Files:**
- Modify: `data-query-app/assets/css/variables.css` L4-5
- Modify: `data-query-app/pages/login.vue` L8（📦 emoji → lucide `Package` 图标）
- Modify: `data-query-app/components/CategoryTreeNode.vue` L14（📁/📄 emoji → lucide `Folder`/`FileText`）

**评审修正**: 本机 fc-list emoji 字体命中 0——只改字体栈在本环境（及同类无 emoji 字体的部署环境）仍是豆腐块。采用双保险: 字体栈补回退（对有字体的环境生效）+ 首屏品牌位/树图标改 lucide 图标（本项目已广泛使用 lucide-vue-next，彻底消除字体依赖）。

- [x] **Step 1: 改 --font-sans**

```css
  --font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji';
```

（--font-display L5 继承 var(--font-sans) 无需改。）

- [x] **Step 2: login.vue Logo 与 CategoryTreeNode 图标换 lucide**（对齐两文件现有 import 风格；login 的 `.login-card__logo` 容器样式保留，内容物换 `<Package :size="24" />`；树节点按 hasChildren 分支 `<Folder>`/`<FileText>`）

- [x] **Step 3: 截图验证 login 品牌位与 categories 树图标为清晰图标（非方框），typecheck，提交**

```bash
cd data-query-app && pnpm run check
git add data-query-app/assets/css/variables.css data-query-app/pages/login.vue data-query-app/components/CategoryTreeNode.vue
git commit -m "fix(admin): CJK/emoji font fallbacks and lucide icons for brand/tree glyphs"
```

### Task C2: 表格裁切与竖排折行

**2026-07-18 执行状态:** `completed`。`b825ecc`、`02ee0a7`、`635f5ba` 与
`fd3689e` 已完成局部横滚、操作列单行、分级可读布局、brace-bounded contract
和 44px 高特异性控件规则；规格复审与质量复审均通过，七个 1280–760px
视口的运行态盒模型确认无页面级横滚且全部工具栏控件实际高度为 44px。

**Files:**
- Modify: `data-query-app/pages/query.vue`（L107 `data-table-wrap` 孤儿类——在该页 scoped style 补 `.data-table-wrap { overflow-x: auto; }`）
- Modify: `data-query-app/pages/entities/[type].vue` L5016 附近、`pages/items.vue` L786 附近、`pages/users.vue` L228 附近

**评审修正**: 三处 `.row-actions` 是 **flex 容器**（`display:flex; flex-wrap:wrap`），`white-space: nowrap` 对 flex 换行无效。正确修法: `.row-actions { flex-wrap: nowrap; }` + 操作列 td 加 `min-width`（参照 users.vue L224 已有的 `min-width:210px`）; 若列宽预算不够导致横向溢出，配合表格容器的 overflow-x:auto 横滚，不允许竖排折行。

- Modify: `data-query-app/pages/article-comments.vue`（L801-820 toolbar 溢出: 命令栏槽位改 minmax(0,1.2fr)→auto 或按钮 max-content 改 100%，以实测为准）

- [x] **Step 1: 逐处修改，截图对比验证**（重截 query/items/users/entities-npcs/article-comments/entities-condition-terms）
- [x] **Step 2: 验证 + 提交**

```bash
cd data-query-app && pnpm run check && node --test tests/items-progress-column.test.mjs
git add data-query-app/pages/query.vue "data-query-app/pages/entities/[type].vue" data-query-app/pages/items.vue data-query-app/pages/users.vue data-query-app/pages/article-comments.vue
git commit -m "fix(admin): stop action-column wrapping and right-edge table clipping"
```

### Task C3: classification-audit 令牌修复 + 翻页

**2026-07-18 执行状态:** `completed`。`c20d7b2` 完成令牌与初始分页，
`dcf214c` 将页状态改为请求成功后事务式提交，并在页数收缩或零结果时重取
clamp 后页面；可执行行为合同覆盖失败重试与 2→1 收缩。规格与质量复审均通过。

**Files:**
- Modify: `data-query-app/pages/operations/classification-audit.vue`

- [x] **Step 1: 修 7 处失效令牌**（L336/L342/L355/L367/L369/L384/L407）: `--text`→`--color-text`、`--text-muted`→`--color-text-muted`、`--border`→`--color-border`、`--surface-muted`→`--color-surface-muted`
- [x] **Step 2: 加翻页**——后端 L33-40 已支持 page/limit；页面加 `page` ref，请求带 `{ page, limit: 20 }`，复用 `AppPagination` 组件（components/AppPagination.vue）接 pagination 响应
- [x] **Step 3: 验证 + 提交**

```bash
cd data-query-app && pnpm run check && node --test tests/classification-audit-page-contract.test.mjs
git add data-query-app/pages/operations/classification-audit.vue
git commit -m "fix(admin): repair css tokens and add pagination to classification audit"
```

### Task C4: 硬编码颜色 → 令牌（login/index/categories）

**2026-07-18 执行状态:** `completed`。`3a1d178` 完成初始 token 迁移，
`06d655b` 修复双主题小字号 tag / login 文案与按钮对比度、info/warning KPI
渐变跨色域及合同覆盖；最终 focused 21/21、typecheck、light/dark 布局与独立
WCAG 核算通过，五组彩虹色及现有 token 层保持不变。fresh 规格与质量复审均
允许进入 C5。

**Files:**
- Modify: `data-query-app/pages/login.vue`（11 行 hex + 12 处 rgba，映射表见 scout-p1p2-frontend.md 项 4）
- Modify: `data-query-app/pages/index.vue`（tag 类 L987-997 + script 渐变 L324/332/340/348）
- Modify: `data-query-app/pages/categories.vue`（删 L600-651 重定义的 .btn/.input，依赖全局样式）

- [x] **Step 1: 按侦察映射表逐处替换为 var(--color-*) 或 color-mix 派生**

**评审修正两点**: ① 这是**有意的主题统一**（slate→stone 色相迁移），不是等值替换——验收标准为"主题统一、无布局回归"，不是"视觉一致"。② index.vue 的 violet/fuchsia/rose/orange/cyan 五个 tag 色**无现成令牌也无源可派**——决策: 这五色保留 hex 原样不动（它们是数据分类彩虹色板，不属主题色域；收编它们需要新增 palette 令牌层，超出本轮范围），只替换有令牌对应的部分。

- [x] **Step 2: 截图对比（login/index/categories 三页主题统一、无布局回归），typecheck + admin-layout 测试，提交**

```bash
cd data-query-app && pnpm run check && node --test tests/admin-layout-layering-contract.test.mjs tests/admin-ui-chinese-copy-contract.test.mjs
git add data-query-app/pages/login.vue data-query-app/pages/index.vue data-query-app/pages/categories.vue
git commit -m "refactor(admin): replace hardcoded colors with design tokens"
```

### Task C5: audio-assets 精确匹配 + cookie 常量收编 + items 白名单

**2026-07-18 执行状态:** `completed`。`630ddb5` 完成 cookie/URL 单一来源、
精确音频状态 token 与 items 24 字段白名单；`02df27b` 修复 pending submit、
stale request 与可执行 handler 合同；`2e101c9` 为 edit 提供失败可区分的 strict
配方读取并保持其它调用方的数组回退。最终 focused 28/28、typecheck、规格与质量
复审通过，全部 Critical/Important/Minor findings 清零。

**Files:**
- Modify: `data-query-app/composables/useApi.ts` L5（`const` → `export const TOKEN_COOKIE_KEY`）
- Modify: `data-query-app/pages/operations/audio-assets.vue`（L588-593 matchStatuses 子串嗅探改 split 精确比较、L603-608 label 版同改；L348 硬编码 cookie 名改 import；L509-513 joinApiUrl 删掉改用 useApi 的 resolveApiUrl）
- Modify: `data-query-app/pages/items.vue`（L514-519 `Object.assign(form, {...item})` 改为按 resetForm L504 的 25 字段白名单显式 pick）

- [x] **Step 1: matchStatuses 改法**

```ts
const statusSet = new Set(normalized.split(/[\s,|/]+/).filter(Boolean))
// matched: statusSet.has('matched')；unmatched: statusSet.has('unmatched')
```

（以现场语义为准——先读上下文确认 normalized 的来源格式再定分隔符。）

- [x] **Step 2: items.vue 白名单 pick**

**评审修正**: `resetFormDefaults` 常量不存在（L504 是内联字面量），需先把 resetForm 的字面量抽成模块级常量（24 字段）。且 handleEdit L514-519 有**三个显式变换必须保留**，白名单循环后叠加:

```ts
const FORM_DEFAULTS = { /* 从 resetForm L504 内联字面量原样抽出, 24 字段 */ }
const FORM_FIELDS = Object.keys(FORM_DEFAULTS) as (keyof typeof FORM_DEFAULTS)[]

// handleEdit 中:
for (const key of FORM_FIELDS) {
  if (key in item) (form as any)[key] = (item as any)[key]
}
// 保留原有三个变换（不可丢）:
form.rarity = getRarityInfo(item).label
form.relatedCategoryIds = (item.relatedCategoryIds ?? []).filter((id: number) => id !== item.categoryId)
form.imageUrl = item.imageUrl ?? ''
```

（以现场 L510-522 实际代码为准，目标: 不再把 id/时间戳等非表单字段混入 form。）

- [x] **Step 3: 验证 + 提交**

```bash
cd data-query-app && pnpm run check && node --test tests/audio-assets-page-contract.test.mjs tests/items-progress-column.test.mjs
git add data-query-app/composables/useApi.ts data-query-app/pages/operations/audio-assets.vue data-query-app/pages/items.vue
git commit -m "fix(admin): exact status matching, shared cookie constant, item form whitelist"
```

---

## 批次 D: P2 收编

### Task D1: 后端 AdminTextUtils（trimToNull 35 份收编）

**Files:**
- Create: `back/src/main/java/com/terraria/skills/common/AdminTextUtils.java`
- Modify: 35 个含 `private ... trimToNull` 的文件（清单见 scout-p2-backend.md 项 3；侦察确认语义全部等价）

- [ ] **Step 1: 新建工具类**

```java
package com.terraria.skills.common;

public final class AdminTextUtils {

    private AdminTextUtils() {
    }

    public static String trimToNull(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }
}
```

（签名统一为 Object 入参——侦察确认 String 入参版调用点传 String 也兼容。）

- [ ] **Step 2: 机械替换**——每文件删私有副本、调用点改 `AdminTextUtils.trimToNull(...)`（static import 亦可，对齐各文件风格）。**35 份副本中 20+ 份在 service/、service/impl/（如 ArticleServiceImpl:844、PublicNpcServiceImpl:1406、CrawlerMonitorServiceImpl:3842、BossSummonContractResolver:117），不止 controller/**。8 处 `this::trimToNull` 方法引用改 `AdminTextUtils::trimToNull`（评审已验证 Stream 泛型兼容）。每改 5 个文件跑一次 `mvn -DskipTests compile`。firstNonBlank **不动**（边界决策 #4）。
- [ ] **Step 3: 全量回归 + 提交**

```bash
cd back && mvn test -Dtest='Admin*Test,*Article*,Public*Test' 2>&1 | grep -E "Tests run.*Fail|BUILD"
git add back/src/main/java/com/terraria/skills/
git commit -m "refactor(back): consolidate 35 trimToNull copies into AdminTextUtils"
```

（git add 整个 skills/ 包——改动横跨 controller/service/impl 多目录；提交前 `git status` 核对无越界文件。）

### Task D2: ClientIpResolver 接入 8 处

**Files:**
- Modify: 8 个含 getClientIp 副本的 controller（清单见 scout-p2-backend.md 项 4；全部 @RequiredArgsConstructor 直接加 `private final ClientIpResolver clientIpResolver;` 字段）
- Modify: **8 个对应测试文件（blocker 修正——它们全部用显式 `new` 构造 controller，加构造参数后必编译崩）**: UserSavedRouteControllerTest:42、UserFavoriteControllerTest:30、AdminArticleCommentControllerTest:43、ArticleCommentControllerTest:46、UserReadingHistoryControllerTest:37、UserNotificationControllerTest:35、AdminArticleControllerTest:33、UserArticleControllerTest:65——每个仿 `UserAuthControllerTest:36` 的现成先例: `mock(ClientIpResolver.class)` 并传入构造器（需要时 stub `resolve` 返回固定 IP）。

- [ ] **Step 1: 逐文件删副本、注入 resolver、调用点改 `clientIpResolver.resolve(request)`**
- [ ] **Step 2: 8 个测试文件补 mock 构造参数**
- [ ] **Step 3: 验证 + 提交**（commit message 注明 IP 口径变化）

```bash
cd back && mvn test -Dtest='*Article*,*User*,*Auth*' 2>&1 | grep -E "Tests run.*Fail|BUILD"
git add back/src/main/java/com/terraria/skills/controller/ back/src/test/java/com/terraria/skills/controller/
git commit -m "fix(back): use trusted-proxy ClientIpResolver in place of naive XFF copies

Audit-log client IPs now honor the trusted proxy chain instead of blindly
trusting the leftmost X-Forwarded-For value."
```

### Task D3: CategoryManagementController 错误走全局 handler

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/controller/CategoryManagementController.java`（7 个错误分支 L47-49/112-114/128-130/144-146/160-162/174-176/188-190）

侦察确认 `/admin/categories` 前端零调用，无破坏面。

- [ ] **Step 1: 错误路径改造（评审修正——分两类处理）**
  - 6 处 try/catch 包裹（L112-114/128-130/144-146/160-162/174-176/188-190）: 删 catch 让异常上抛给 GlobalExceptionHandler（业务校验失败继续抛 IllegalArgumentException→400，意外异常→500，不再一律 200）
  - **L47-49 是裸 `if (category == null) return ApiResponse.error(404, ...)` 没有 try/catch 可删**——新建轻量异常 `common/ResourceNotFoundException`（RuntimeException 子类）+ GlobalExceptionHandler 加 `@ResponseStatus(HttpStatus.NOT_FOUND)` 条目（照抄 AdminAccessDeniedException 风格），该分支改抛此异常

- [ ] **Step 2: 验证 + 提交**

```bash
cd back && mvn -DskipTests compile
git add back/src/main/java/com/terraria/skills/controller/CategoryManagementController.java back/src/main/java/com/terraria/skills/common/ResourceNotFoundException.java back/src/main/java/com/terraria/skills/handler/GlobalExceptionHandler.java
git commit -m "fix(back): let category management errors surface real HTTP status codes"
```

### Task D4: /admin/articles reviewStatus 过滤 + 前端删 N+1

**Files:**
- Modify: `back/src/main/resources/mapper/ArticleMapper.xml`（where 块 L48-56 加 reviewStatus 条件）
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminArticleController.java`（列表端点加 `@RequestParam(required=false) String reviewStatus`）+ 对应 service/mapper 接口传参
- Modify: `back/src/main/java/com/terraria/skills/service/impl/ArticleServiceImpl.java`——**评审警告: `normalizeReviewStatus`（在此文件 L812-824，不在 controller）空白输入返回 DRAFT 而非 null，直接复用会把"不传 reviewStatus"的列表强制过滤成只剩草稿**。必须仿同文件 `normalizeStatusAllowNull`（L780-786）新写 allow-null 包装（空白→null→不过滤）供列表过滤用
- Modify: `data-query-app/stores/articles.ts`（删 `refreshArticleCommentCounts` L456-509 与 `extractArticleCommentCount` L187-199，列表直接用后端已返回的 commentCount 字段——ArticleMapper.xml L40-45 内联子查询已存在）
- Modify: `data-query-app/pages/article-comments.vue`（唯一调用方 L651，改用列表自带 commentCount；同步清理 L517-519 消费的 `commentCountRefreshing/commentCountFailedArticleIds`）
- Modify: `data-query-app/tests/articles-comment-count-refresh-behavior.test.mjs`（行为断言迁移: 改写为"commentCount 直接取列表响应、零 /comments 调用"）
- Modify: `data-query-app/tests/admin-global-comment-management-contract.test.mjs`（**评审修正——L61/L71/L72 正向锁定被删符号 `extractArticleCommentCount`/`refreshArticleCommentCounts`/`fetchArticleCommentTotal`，必须同步删/改这些断言，否则 test:unit 全量门禁必红**）

- [ ] **Step 1: 后端三层加 reviewStatus 过滤（TDD：先在现有 AdminArticleControllerTest 风格下加过滤断言用例）**
- [ ] **Step 2: 前端删 N+1 补偿，改读 commentCount 字段**；注意口径：admin 子查询是"根评论数"未过滤 deleted，如 article-comments 页显示语义需要总数，保持现字段并在 UI 文案注明"评论"即可，不做后端口径改动
- [ ] **Step 3: 验证 + 提交**

```bash
cd back && mvn test -Dtest='*Article*' 2>&1 | grep -E "Tests run.*Fail|BUILD"
cd ../data-query-app && pnpm run check && node --test tests/articles-comment-count-refresh-behavior.test.mjs tests/admin-articles-page-contract.test.mjs tests/admin-global-comment-management-contract.test.mjs
git add back/src/main/resources/mapper/ArticleMapper.xml back/src/main/java/com/terraria/skills/controller/AdminArticleController.java back/src/main/java/com/terraria/skills/service/ data-query-app/stores/articles.ts data-query-app/pages/article-comments.vue data-query-app/tests/articles-comment-count-refresh-behavior.test.mjs data-query-app/tests/admin-global-comment-management-contract.test.mjs
git commit -m "feat(admin): reviewStatus filter for admin articles; drop comment-count N+1"
```

### Task D5: syncNpcShopEntries conditions 级联测试补齐

**Files:**
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminNpcControllerTest.java`

- [ ] **Step 1: 按 scout-p2-backend.md 项 8 给出的 3 个用例名与 verify 断言补测试**（Mockito @Mock JdbcTemplate 基建已支持；覆盖 L1163-1182 conditions 级联写入）
- [ ] **Step 2: 验证 + 提交**

```bash
cd back && mvn -Dtest=AdminNpcControllerTest test
git add back/src/test/java/com/terraria/skills/controller/AdminNpcControllerTest.java
git commit -m "test(back): cover npc shop entry conditions cascade"
```

### Task D6: 前端小收编（formatDateTime + coin-chip CSS）

**Files:**
- Create: `data-query-app/utils/adminFormat.ts`
- Modify: 消费页改 import
- Modify: coin-chip/price-pill CSS 下沉 `assets/css/main.css`

**评审修正三点**:
1. formatDateTime 逐字相同的是 **6 处**（users:195 / articles:280 / article-comments / item-rarities / ArticleReviewWorkspace / [type].vue），**tree.vue:192 是 2-digit 选项版（与 items.vue:415 同组）不得并入**——并了会改变 tree 页时间显示格式。本 task 只收编 6 处组。
2. statusTone 两处（domain-acceptance:442 / data-source-acceptance:302）**非逐字等价**（前者 success 集多 'ready'、warning 集多 'needs_confirmation'）——合并取超集，行为是可接受的扩张，commit message 注明。
3. coin-chip CSS: Task B2 已删掉 town-npcs 两个僵尸页的两份副本，**本 task 实际只剩 2 份**（town-npcs/index.vue L633-668 + TownNpcWorkbenchModal L1435-1484，约 86 行）。

- [ ] **Step 1: 建 utils、6 处 formatDateTime + 2 处 statusTone 替换、2 份 coin-chip CSS 下沉**
- [ ] **Step 2: 验证 + 提交**

```bash
cd data-query-app && pnpm run check && pnpm run test:unit 2>&1 | grep -E "^ℹ (pass|fail)"
git add data-query-app/utils/adminFormat.ts data-query-app/assets/css/main.css data-query-app/pages/ data-query-app/components/
git commit -m "refactor(admin): consolidate formatDateTime and coin-chip styles"
```

---

## 收尾

- [ ] 后端: `mvn test -Dtest='Admin*Test,Auth*Test,*Article*'`（存量 7 失败已知，对照 devlog 基线不新增）
- [ ] 管理端: `pnpm run check` + `pnpm run test:unit` 全绿
- [ ] 重截关键页截图对比（query/items/users/login/categories/classification-audit）
- [ ] devlog 记录 + 决定是否合 main（用户裁决）

**明确不做清单（转后续）**: 10 字段制作站协议 composable（stations 重构时一并做）、legacy API 410 退役、DOMPurify 对齐、[type].vue 拆分、AdminItemRarityControllerTest 补齐、firstNonBlank 语义组收编、window.prompt 换 Modal。
