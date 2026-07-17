# P0 收尾（鉴权）+ P2 后端收编 — 事实侦察报告

仓库: `/home/lolben/TerraPedia/back`，包 `com.terraria.skills`（下文路径省略 `src/main/java/com/terraria/skills/` 前缀）。
侦察日期: 2026-07-17。所有行号为当日 HEAD 实测。

---

## 第 1 节：拦截器 role 校验最小加固

### 1.1 AdminAuthenticationInterceptor 现状（auth/AdminAuthenticationInterceptor.java，全文 95 行）

- preHandle：L27–L52。L44–47 解析 claims：

```java
44        try {
45            AdminTokenClaims claims = adminJwtService.parseAndValidate(token);
46            request.setAttribute(ADMIN_CLAIMS_ATTRIBUTE, claims);
47            return true;
```

- **当前无任何 role 校验**。preHandle 只检查 Bearer 头（L32–36）、token 非空（L38–42）、签名/过期/用户名交给 parseAndValidate（L45）。
- **失败路径惯例：不抛异常**。三个失败分支（L34、L40、L49）都调 `writeUnauthorizedResponse`（L89–94）：设 401 状态 + ObjectMapper 写 `ApiResponse.error(401, message)`，然后 `return false`。
- **插入点：L45 与 L46 之间**（解析成功后、放 attribute 前）：

```java
AdminTokenClaims claims = adminJwtService.parseAndValidate(token);
if (!"ADMIN".equalsIgnoreCase(claims.getRole())) {
    writeUnauthorizedResponse(response, "无权访问");  // 沿用 401；如需 403 语义可仿 L89-94 加 writeForbiddenResponse
    return false;
}
request.setAttribute(ADMIN_CLAIMS_ATTRIBUTE, claims);
```

跟随现有惯例写响应 + return false，不抛异常（拦截器内抛异常会落 GlobalExceptionHandler，风格不一致）。

### 1.2 AdminTokenClaims.getRole() 确认

auth/AdminTokenClaims.java（15 行）：`@Getter @Builder`（L6–7），`private final String role` 在 **L12**。getRole() 由 Lombok 生成，已被 AdminCrawlerMonitorController L211 使用，确认可用。

### 1.3 拦截器注册处

config/WebConfig.java `addInterceptors`（L59–66），**L64**：`registry.addInterceptor(adminAuthenticationInterceptor).addPathPatterns("/**")`，无 excludePathPatterns。实际路径过滤在拦截器内部 `requiresAuthentication`（L54–87）：`/auth/me`(L62)、`/statistics/admin/**`(L65)、`/admin/**`(L68)、`/files/**` 写操作(L71–76)、`/items/import`(L77)、`/items` 与 `/categories` 非 GET/HEAD(L80–85)；OPTIONS 一律放行(L58–60)。

### 1.4 requireAdminRole 冗余性（AdminCrawlerMonitorController.java **L209–L218**）

```java
209    private AdminTokenClaims requireAdminRole(HttpServletRequest httpRequest) {
210        Object attribute = httpRequest.getAttribute(AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE);
211        if (!(attribute instanceof AdminTokenClaims claims) || !"ADMIN".equalsIgnoreCase(claims.getRole())) {
212            throw new AdminAccessDeniedException("无权执行该操作");
```

**结论：role 维度冗余，保留不动。** 理由：(a) 它还额外校验 username 非空（L214–216），非拦截器职责；(b) instanceof 空安全写法，attribute 缺失给 403 不 NPE，无害深度防御；(c) 删除要动测试且无收益。

### 1.5 签发路径：恒为 ADMIN，加固 = 深度防御

auth/AdminJwtService.java：常量 `ROLE_ADMIN = "ADMIN"`（L22），**issueToken（L32–43）L39 硬编码 `.role(ROLE_ADMIN)`**。createToken（L45–66）L55 把 role 写进 payload；parseAndValidate L101 解析时缺省回落 ADMIN（`payload.getOrDefault("role", ROLE_ADMIN)`），L94 强校验用户名等于配置的唯一管理员账号。

全仓 grep `issueToken|Jwts.builder|createToken`（排除测试）：admin 侧唯一签发点 controller/AuthController.java:69 → L71。其余命中（UserAuthServiceImpl.java:345-346、UserJwtService.java:32/46）都是用户 token 体系。仓库不用 JJWT。

**结论：role 恒为 "ADMIN"，此加固是深度防御而非行为变更**——现存合法 token 全部通过。唯一理论例外是持 tokenSecret 手工构造 role≠ADMIN 的 payload，正是加固要拦的对象。

---

## 第 2 节：鉴权失败 400→401 统一

### 2.1 getRequiredClaims 私有副本全清单（恰好 10 个，分两种形态）

**形态①：守护式，无效抛 `IllegalArgumentException("Invalid login session")` — 6 个（均 User 侧）**

| 文件 | 方法定义行 | 抛出行 |
|---|---|---|
| controller/ArticleCommentController.java | L149–155 | L154 |
| controller/UserFavoriteController.java | L119–125 | L124 |
| controller/UserNotificationController.java | L75–81 | L80 |
| controller/UserPreferencesController.java | L47–53 | L52 |
| controller/UserReadingHistoryController.java | L77–83 | L82 |
| controller/UserSavedRouteController.java | L73–79 | L78 |

**形态②：裸强转，attribute 为 null 时返回 null（NPE 在调用方）— 4 个**

| 文件 | 方法定义行 |
|---|---|
| controller/AdminArticleController.java | L179–181（强转 L180） |
| controller/AdminArticleCommentController.java | L97–99（L98） |
| controller/UserArticleController.java | L187–189（L188） |
| controller/UserAuthController.java | L329–331（L330） |

> 审计原话"约 10 个副本抛 IllegalArgumentException"不准确：只有 6 个抛异常，4 个裸强转。

### 2.2 GlobalExceptionHandler 映射全表（handler/GlobalExceptionHandler.java，103 行）

| @ExceptionHandler | 行号 | 状态码 |
|---|---|---|
| CrawlerQueueV2Exception | L27–40 | 动态 `exception.httpStatus()`(L37) |
| NoResourceFoundException | L42–47 | 404(L43) |
| CrawlerMonitorRedisUnavailableException | L49–54 | 503(L50) |
| **AdminAccessDeniedException** | **L56–61** | **403**(L57) |
| Exception | L63–68 | 500(L64) |
| **IllegalArgumentException** | **L70–75** | **400**(L71) |
| MethodArgumentNotValidException | L77–85 | 400(L78) |
| BindException | L87–95 | 400(L88) |
| RuntimeException | L97–102 | 500(L98) |

形态① → 400；形态② NPE → RuntimeException handler → 500。

### 2.3 auth/ 下现成异常

只有 `AdminAccessDeniedException.java`（L3，extends RuntimeException）→ **403**（handler L56–61）。**无任何 401 语义异常**；401 目前只由两个拦截器直接写响应产生（AdminAuthenticationInterceptor L89–94、UserAuthenticationInterceptor L108–113），controller 层无 401 通道。

### 2.4 裸强转 NPE 确切行号

**AdminArticleController**（`/admin/articles`，L36）——调用行 → NPE 行：
L75→**L78**(create)、L90→**L92**(update)、L104→**L106**(updateStatus)、L114→**L116**(submitReview)、L128→**L130**(review)、L138→**L140**(publish)、L148→**L150**(offline)，均在 `claims.getUsername()` 处炸。

**UserArticleController**（`/user/articles`，L37）：
L54→**L57**、L69→**L70**、L79→**L82**、L109→**L112**、L128→**L131**、L146→**L148**、L159→**L161**、L172→**L174**。
⚠️ **L97（uploadArticleImage）：`getRequiredClaims(httpRequest);` 返回值被丢弃** —— claims 缺失时不炸也不拦，**无鉴权静默放行**，比 500 更糟，须一并修。

同形态还有 AdminArticleCommentController L85→L86、UserAuthController L162/173/188/200/215/248/261。

### 2.5 attribute-null 何时真的发生

- Admin 侧：`path.startsWith("/admin/")`（拦截器 L68）完全覆盖 `/admin/articles` 与 `/admin/articles/{id}/comments`，注册无 exclude → 正常 HTTP 请求下 attribute 必然已设置，null 仅在测试直调或 servletPath 异常时出现。
- User 侧：requiresAuthentication L63–75 与全部 user controller 基路径一一对应。
- **真实漏网路径**：评论写接口靠正则匹配（L82–85，要求 id 为 `[1-9]\d*`）。如未登录 `POST /articles/0/comments`：正则不匹配→放行→ArticleCommentController L80 取 claims 为 null→抛 IllegalArgumentException→**今天返回 400**。这是 401 统一确实会被触发的现实路径。

**结论**：副本主要是拦截器保证下的兜底；统一 401 的现实收益 = (a) 正则/路径边界漏网请求、(b) L97 静默放行、(c) 防未来路径失配。

### 2.6 方案对比与推荐

**方案 A：新建 UnauthenticatedException + 401 映射 + 副本改抛**

| 改动 | 文件数 | 行数 |
|---|---|---|
| 新建 auth/UnauthenticatedException.java（仿 AdminAccessDeniedException） | 1 新增 | ~8 |
| GlobalExceptionHandler 加 @ExceptionHandler → 401 | 1 | ~7 |
| 形态① 6 文件改抛新异常 | 6 | ~12 |
| 形态② 4 文件裸强转改守护式 | 4 | ~24 |
| **合计** | **12** | **~50** |

**方案 B：统一 HandlerMethodArgumentResolver**：2 个 resolver + WebConfig 注册（~80 行），再改 10 个 controller 约 45 个 handler 签名（150–200 行 diff），且 resolver 缺 claims 时仍需方案 A 的异常类+映射；签名变更波及现有测试。合计 13–14 文件、230+ 行。

**推荐方案 A**：改动面约 B 的 1/4、全部机械局部、不动签名、与现有 attribute 机制契合、顺手修掉 L97 静默放行（守护式副本会在丢弃返回值前抛出）。
待拍板：形态① 6 处 400→401 属对外行为变更（仅影响 2.5 漏网路径），语义上 401 正确。

---

## 第 3 节：trimToNull 收编

### 3.1 完整清单：35 处（审计称 15 份，实际 35）

**A 组 `private String trimToNull(String)` 实例方法 — 20 处**：
AdminConditionTermController:166、AdminWorldContextController:176、AdminRecipeConditionController:173、AdminRecipeGroupController:392、AdminCraftingStationController:216、AdminItemGroupController:718、AdminBiomeController:241（以上 controller/）；MinioWikiImageLocalizationServiceImpl:871、UserAvatarUrlResolver:80、SupportDomainServiceImpl:165、RecipeServiceImpl:816、RecipeTreeServiceImpl:861、ArticleServiceImpl:844、MinioObjectStorageServiceImpl:388、AdminArticleCommentServiceImpl:195、DisabledWikiImageLocalizationService:60、MinioManagedImageUrlPolicy:356、PublicItemServiceImpl:558、WikiImageSyncServiceImpl:1006、CrawlerMonitorServiceImpl:3842（以上 service/impl/）。

**B 组 `private static String trimToNull(String)` — 3 处**：PublicNpcServiceImpl:1406、ItemImageServiceImpl:109、ManagedItemImageResolverImpl:121。

**C 组 `private String trimToNull(Object)` 实例方法 — 11 处**：AdminShimmerController:674、AdminTownNpcMaintenanceController:687、AdminNpcRelationController:655、AdminBossController:837、AdminBuffController:1409、AdminArmorSetController:1965、AdminNpcController:1262、AdminProjectileController:255、PublicBuffServiceImpl:989、PublicArmorSetServiceImpl:486、PublicBossServiceImpl:862。

**D 组 `private static String trimToNull(Object)` — 1 处**：service/BossSummonContractResolver:117。

### 3.2 语义一致性：全部等价

Object 版统一模式（抽查 AdminShimmerController:674-680 等 5 处）：`null→null; String.valueOf(value).trim(); 空串→null`（注意用 String.valueOf 非 instanceof，非 String 对象 toString 后保留）。String 版（抽查 AdminConditionTermController:166-172、ArticleServiceImpl:844-850）是 Object 版在 String 入参下的严格子集。**可安全统一收编为一个 `trimToNull(Object)`（或加 String 重载）**，仅局部变量名有别。

### 3.3 挂靠位置

- `common/` 目录存在但只有 6 个类（ApiResponse、ItemImageSql、PageQuery、Pagination、PaginationParams、RuntimeDropSourceKindLabels），**无字符串工具类**；无 util/ 目录；无自建 StringUtils/TextUtils/StrUtil。
- **pom.xml 无 commons-lang3**（主会话独立复核确认），源码零 `org.apache.commons.lang3` import。Apache `StringUtils.trimToNull` 不可直接用。项目现用 Spring `org.springframework.util.StringUtils`（hasText 等），但 Spring 版无 trimToNull。
- → 收编需在 `common/` 自建工具类（如 `common/Texts.java` 或 `common/StringNormalization.java`），或新增 commons-lang3 依赖。

### 3.4 firstNonBlank：21 处定义（审计称 8 份），五种不同语义

**组 1（3 处）双参、fallback 原样返回**：RelationCompatibilityServiceImpl:390、DomainAcceptanceServiceImpl:903、DataSourceAcceptanceServiceImpl:838 — `first blank ? second : first`，**second 为空白串时原样返回空白串**。

**组 2（2 处）双参、second 归一化为 null**：CrawlerReportArchiver:734-739、CrawlerMonitorServiceImpl:6605-6610 — second blank 时返回 **null**。与组 1 行为不同。

**组 3（7 处）varargs + trimToNull，返回 trim 后值**：AdminRecipeGroupController:418、AdminCraftingStationController:224、AdminItemGroupController:752、AdminBossController:788（此处缺 null 数组守护，其余 6 处有）、RecipeServiceImpl:824、RecipeTreeServiceImpl:960、PublicBossServiceImpl:870。

**组 4（7 处）varargs + isBlank，返回原始未 trim 值**：PublicNpcServiceImpl:1327（唯一 static）、PublicBuffServiceImpl:941、AdminBuffController:1451、AdminArmorSetController:2001、AdminNpcController:1328、AdminProjectileController:261、PublicArmorSetServiceImpl:494。与组 3 差异：**保留首尾空白**。

**组 5（2 处）varargs + 兜底常量 `"image"`**：MinioWikiImageLocalizationServiceImpl:793-800、WikiImageSyncServiceImpl:959-966 — 全 blank 时返回字面量 `"image"`（文件名兜底语义），**不能与其他组合并**。

**收编结论**：trimToNull 35 份可一步统一；firstNonBlank 同名不同义，单一实现会改变部分调用点行为（组 3 vs 组 4 的 trim 差异、组 1 vs 组 2 的 blank-second 差异、组 5 独立），须逐组处理或提供两个明确命名的变体（如 `firstNonBlankTrimmed` / `firstNonBlankRaw`），组 5 保持原地。

---

## 第 4 节：getClientIp 收编

### 4.1 八份私有副本逐字等价

定义行：UserFavoriteController:127、UserArticleController:179、UserReadingHistoryController:85、AdminArticleController:171、AdminArticleCommentController:101、ArticleCommentController:157、UserNotificationController:83、UserSavedRouteController:81。方法体全部为：

```java
String forwardedFor = request.getHeader("X-Forwarded-For");
if (forwardedFor != null && !forwardedFor.isBlank()) {
    return forwardedFor.split(",")[0].trim();
}
return request.getRemoteAddr();
```

唯一差异是局部变量名（3 处用 `forwarded`：UserArticleController:180、AdminArticleController:172、AdminArticleCommentController:102）。逻辑：无条件信任 XFF、取最左元素、fallback getRemoteAddr。

### 4.2 ClientIpResolver（security/ClientIpResolver.java）

- `@Component`（L7），构造器注入 `SecurityNetworkProperties`（L10–14）；实例方法 `public String resolve(HttpServletRequest request)`（L16），无静态方法（依赖配置 bean，也不可能静态）。
- 现有使用者：security/HttpSecurityAuditInterceptor.java:13,18、security/HttpRateLimitInterceptor.java:28,36,45、controller/AuthController.java:43、controller/UserAuthController.java:52。

### 4.3 注入可行性：8 个 controller 全部零成本

8 个类均 `@RestController` + `@RequiredArgsConstructor` 且已有 final 字段注入（@RequiredArgsConstructor 行号：UserFavorite:30、UserArticle:38、UserReadingHistory:28、AdminArticle:37、AdminArticleComment:31、ArticleComment:32、UserNotification:28、UserSavedRoute:31）。加 `private final ClientIpResolver clientIpResolver;` 即自动注入；AuthController:43 / UserAuthController:52 是现成先例。

### 4.4 ⚠️ 收编是行为变更，非等价重构

ClientIpResolver 与副本三点实质差异：
1. **信任模型**：副本无条件信任 XFF；Resolver 仅当 remoteAddr 是受信代理（loopback + 配置白名单，`isTrustedProxy` L41–53）才看 XFF（L22–24）。直连伪造 XFF：副本采信，Resolver 不采信（安全改进，但属行为变化）。
2. **XFF 链方向相反**：副本取 `split(",")[0]`（最左，可伪造）；Resolver 从右向左取第一个非受信代理地址（L31–37）。多级代理下结果不同。
3. **空值处理**：Resolver 对 null request 返回 `""`（L17–19），remoteAddr 经 trimToEmpty；副本可能返回 null。

双方都不查 X-Real-IP，该点无差异。这些 IP 用于评论/收藏/阅读历史等审计记录：收编后记录更可信，但与历史数据口径不同——须在计划中明示为有意的安全修正。

---

## 第 5 节：CategoryManagementController 错误 200

### 5.1 后端证据（controller/CategoryManagementController.java，`@RequestMapping("/admin/categories")` L14）

全类返回裸 `ApiResponse<T>`，**零 ResponseEntity**（对比公开 CategoryController 全用 ResponseEntity）。`ApiResponse.error`（common/ApiResponse.java:46-52）只设置 body 的 success=false 和 statusCode 字段，HTTP 恒 200。错误分支：

| 方法 | 路径 | 错误分支行号 | 形态 |
|---|---|---|---|
| getCategoryById | GET /{id} | **L47-49** | null → `ApiResponse.error(404,...)`，HTTP 200 |
| createCategory | POST | **L112-114** | catch IllegalArgumentException → error(400)，HTTP 200 |
| updateCategory | PUT /{id} | **L128-130** | 同上 |
| updateCategoryParent | PUT /{id}/parent | **L144-146** | 同上 |
| updateCategorySort | PUT /{id}/sort | **L160-162** | 同上 |
| deleteCategory | DELETE /{id} | **L174-176** | 同上 |
| deleteCategoryWithChildren | DELETE /{id}/with-children | **L188-190** | 同上 |

机制：catch 块吞掉 IllegalArgumentException，使 GlobalExceptionHandler L70-75 的真 400 映射永不触发。纯查询端点（L23-101、L196-203）无本地 catch，异常走全局处理器，状态码正确。**最小修法：直接删 7 个 catch 块让全局处理器接管（400），getCategoryById 的 404 需改抛异常或换 ResponseEntity。**

### 5.2 前端影响面：零调用者，改动无破坏面

在 data-query-app、front-nuxt（另查了 front、server/、tests/、后端测试，排除构建产物）grep `admin/categories`：**零命中**。两前端实际用公开 `/categories`（CategoryController.java:29，ResponseEntity 带正确状态码：404 见 L65-66、400 见 L83-84、503 见 L56-57）。

参照（打的是 /categories）：data-query-app stores/categories.ts — fetchCategories:161、fetchItemCategories:177、fetchCategoryById:190、createCategory:201、updateCategory:226、deleteCategory:251；消费页 pages/categories.vue:331,354,356,384。front-nuxt — composables/usePublicCategoryNavigation.ts:7、pages/items/index.vue:186。

判错方式：两前端均用 `$fetch`/ofetch（非 2xx 自动抛错，无 axios）。data-query-app composables/useApi.ts：request 包装 L98-108 → handleApiError L43-62（401 清 cookie 跳登录，其余 rethrow）；responseInterceptor 纯透传（L41），**无 body success=false 统一拦截**。store 层各自补判：fetchCategoryTree 判 `success === false`（stores/categories.ts:151-153）；create/update 判 `response?.data` 空（212-214、236-238）；deleteCategory 只靠 try/catch（249-260）。

**结论：改正确状态码不破坏任何前端**。不存在依赖"200 + success=false"的调用点；deleteCategory（store:251）只靠 try/catch 感知错误，恰恰要求非 2xx——改状态码对它反而是修复。

---

## 第 6 节：/admin/articles commentCount + reviewStatus

### 6.1 列表端点与查询链

- controller/AdminArticleController.java：`@RequestMapping("/admin/articles")` L36；`getArticles` **L44-61**（page/limit/size/keyword/status/sortBy/sortOrder），L57 调 `articleService.getAdminArticles(...)`。
- service/ArticleService.java:11 接口 → service/impl/ArticleServiceImpl.java **L52-61**：构造 MP Page（limit 夹 1-100），L54 调 `articleMapper.selectAdminArticlesPage`，结果过 normalizeArticlePage（L419-425）→ normalizeArticleResponse（L427-448，commentCount null 补 0 在 L441-443）。
- mapper/ArticleMapper.java:14-20 声明；SQL 在 **src/main/resources/mapper/ArticleMapper.xml:5-70**。
- DTO：dto/ArticleDTO.java L10-40，字段含 status(17)、reviewStatus(18)、commentCount(31) 等。

### 6.2 commentCount：**后端已存在，就在列表 SQL 里**

**ArticleMapper.xml:40-45**：`COALESCE((SELECT COUNT(*) FROM article_comments ac WHERE ac.article_id = a.id AND ac.parent_id IS NULL), 0) AS commentCount`，且是默认排序键（XML L58-64；sortBy 白名单 ArticleServiceImpl:788-797，默认值即 commentCount）。

口径差异：admin 版（L40-45）**不过滤 ac.deleted / ac.status**；公开列表版（XML L107-114）加 `deleted = 0 AND status = 'PUBLISHED'`。

ArticleCommentMapper 现成单篇 count：countPublishedArticleComments（接口 :15，XML :5-15）、countAdminArticleComments（接口 :94-99，XML :331-336，可按 status/keyword/authorId 过滤）；**无批量 IN 版本**。

**最小实现点：后端零改动**——列表已返回 per-article commentCount。改动在前端（见 6.4）。若要求与管理端评论页口径一致（含 status/deleted 过滤），才需在 ArticleCommentMapper 加 articleIds IN 批量 count（仿 XML:331-336 过滤块），由 normalizeArticlePage（L419-425）批量回填。

### 6.3 reviewStatus

- 实体：entity/Article.java **L40-41** `@TableField("review_status") private String reviewStatus;`，表 articles（@TableName L14），列 `review_status`。取值常量 dto/ArticleReviewStatus.java:5-8（DRAFT/PENDING_REVIEW/APPROVED/REJECTED）。
- normalizeStatus：ArticleServiceImpl **L804-810**，白名单 = ArticleStatus 的 DRAFT/PUBLISHED/OFFLINE（dto/ArticleStatus.java:5-7），非法抛 IllegalArgumentException；列表走 normalizeStatusAllowNull（L780-786）。独立的 normalizeReviewStatus 在 L812-824（白名单四态），**列表链路不使用**。
- **备忘核实为真**：列表 status 参数 → normalizeStatusAllowNull（L57）→ XML `AND a.status = #{status}`（L53-55），过滤**发布态**；`<where>` 块（L48-56）只有 deleted/keyword/status，**无 review_status 过滤**，controller 也不接收 reviewStatus 参数。传 PENDING_REVIEW 直接 400。加 reviewStatus 过滤需：controller 加参（L46-54）→ service 透传 + normalizeReviewStatus 复用（L812-824）→ XML where 块加条件（L48-56）。

### 6.4 前端现状（data-query-app stores/articles.ts）

- extractArticleCommentCount：**L187-199**，按 commentCount/comment_count/commentsCount/stats.*/metrics.* 等十余候选键提取；normalizeArticle L212 使用。列表来源 fetchArticles → GET /admin/articles（L350-360）。
- fetchArticleCommentTotal：**L448-454** — 单篇 GET `/admin/articles/{id}/comments?page=1&limit=1` 取分页 total。
- refreshArticleCommentCounts：**L456-509** — **确认逐篇请求**：Promise.allSettled 对每篇各打一次上述接口（L465-470，N 篇 = N 个并发请求）；失败置 undefined 并记 commentCountRefreshFailedArticleIds（L472-505）。调用方 pages/article-comments.vue:651。
- 由于列表接口本已返回 commentCount 且 extractArticleCommentCount 能取到，这套逐篇校准的存在理由仅是口径差异（admin 列表 count 不过滤 deleted/status vs 评论接口 total 过滤）。若后端统一口径（6.2 的批量 count 方案），前端可整体删除逐篇刷新。

---

## 第 7 节：AdminCrudService 试点评估

### 7.1 AdminItemRarityController 完整分层（样板）

| 文件 | 行数 |
|---|---|
| controller/AdminItemRarityController.java | 61 |
| service/ItemRarityService.java（接口） | 18 |
| service/impl/ItemRarityServiceImpl.java | 170 |
| mapper/ItemRarityMapper.java（`extends BaseMapper<ItemRarity>` 空接口，L8） | 9 |
| dto/ItemRarityDTO.java | 22 |
| entity/ItemRarity.java | 45 |

Controller 5 端点全薄委托（每方法 1–6 行）：getAll L20-23、getById+404 L25-32、create+catch→400 L34-41、update L43-50、delete L52-60。业务全在 ServiceImpl：校验 L125-141、code 唯一 L143-154、被引用禁删 L113-123、itemCount 另注入 ItemMapper L156-162、@Transactional + 5 个 @CacheEvict（L50-57 等）。**数据访问是 MyBatis-Plus，不是 JdbcTemplate。**

### 7.2 ConditionTerm / WorldContext 孪生程度量化

- AdminConditionTermController.java：173 行，`/admin/condition-terms`（L29），直接注入 MP 的 ConditionTermMapper（L35，BaseMapper 空接口）——**已是 MyBatis-Plus，非 JdbcTemplate**。
- AdminWorldContextController.java：183 行，`/admin/world-contexts`（L29），注入 WorldContextMapper（L35）。
- 各 5 端点一一对应：list（CT :37-66 / WC :37-66）、getById（:68-76 两侧同）、create（:78-93 / :78-96）、update（:95-112 / :98-118）、delete（:114-123 / :120-129）。
- **sed 替换实体名后 diff：173 行中 153 行完全相同（≈88%）**。实质差异仅四类：① WC 独有 LOCAL_CONDITION 拒绝守卫两处（WC :85-87、:105-107）；② CT 用 normalizeCode（trim+大写，CT :161-164），WC 只 trim code、仅 contextType 大写（WC :141-143）；③ WC 实体多 3 字段（iconUrl :147-149、sourceRevisionTimestamp :156-158、lastSyncedAt :159-161）；④ 变量名与 @Tag 措辞。

### 7.3 迁移改动面

mapper 与 entity **零改动**（双方都已是 MP）。每实体：新建 service 接口（参照 18 行的 ItemRarityService）+ ServiceImpl（承接 list 查询构造、code 去重、applyFields、normalize helper，约 130–150 行）；controller 从 173/183 行瘦身到约 60–70 行。可选是否引入 DTO（ItemRarity 有 DTO，CT/WC 现直接暴露 entity——不引入改动更小）。差异点（LOCAL_CONDITION 守卫、大写策略、3 个额外字段）意味着两个 ServiceImpl **不能共用一份泛型实现**，除非做模板方法/策略挂钩——"AdminCrudService 泛型基类"的收益因此有限，建议按 ItemRarity 式各建一套而非强行抽象。

### 7.4 测试现状

- **AdminItemRarityControllerTest 不存在**（find src/test -iname "\*ItemRarity\*"/"\*Rarity\*" 零命中）——样板分层反而是唯一无 controller 测试的，确认审计所述。
- AdminConditionTermControllerTest.java 存在：101 行、2 测试（:46 列表按 termType 过滤、:62 创建归一化 type），@Mock ConditionTermMapper + MockMvc standalone。
- AdminWorldContextControllerTest.java 存在：168 行、4 测试（:48、:70、:107 拒绝 LOCAL_CONDITION、:122），@Mock WorldContextMapper。
- 迁移后这些测试需改为 mock service（或改测 ServiceImpl）——是迁移改动面的一部分。

---

## 第 8 节：replaceNpcShopEntries 测试

### 8.1 两个名字 = 两条独立实现（非"端点+helper"关系）

- **AdminNpcController.syncNpcShopEntries**：private，**L1117-1194（78 行）**，非端点。由 syncNpcRelations（L1031-1046）在请求含 shopEntries 键时调用（L1042-1043）；syncNpcRelations 被 POST /admin/npcs（createNpc L132-155）和 PUT /admin/npcs/{id}（updateNpc L157-188）调用，两端点均 @Transactional（L133、L158）。数据访问 **JdbcTemplate**（字段 L72）。
- **AdminNpcRelationController.replaceNpcShopEntries**：public 端点，**L200-253**，`PUT /admin/npcs/{id}/shop-entries`（L197-199，@Transactional）。走 **MyBatis-Plus mapper**（NpcShopEntryMapper/NpcShopConditionMapper，L63-64），逻辑等价（删条件→删条目→重插+级联）但无 mutation summary。**该端点目前完全无测试。**

syncNpcShopEntries 七步（全 JdbcTemplate）：
1. 查旧 ID：queryForList varargs（L1118）；
2. 删旧条件：拼 IN 占位 + update（L1124-1127）；
3. 删旧条目：update（L1128）；
4. 循环重插：normalizeObjectList（L1196-1215）规整后逐行 update INSERT 6 参（L1149-1161）；双空 itemId 计 skipped（L1138-1141）；带旧 id 计 replaced 否则 inserted（L1142-1148）；
5. 取新主键：queryForObject("SELECT LAST_INSERT_ID()", Long.class) 两参形态（L1162）；
6. 级联插条件：normalizeConditionRefType（L1222-1234）校验，refId 非法跳过（L1168），update INSERT 6 参（L1169-1181）；
7. 汇总 6 计数返回（L1184-1193）。
其他 helper：resolveSortOrder L1217-1220、toLong L1302、toInteger L1272、trimToNull L1262、defaultIfBlank L1236。未用 batchUpdate / NamedParameterJdbcTemplate。

### 8.2 测试基建（src/test AdminNpcControllerTest.java，1375 行）

- **Mockito `@Mock JdbcTemplate`（L88），不是自建 FakeJdbcTemplate**。FakeJdbcTemplate 存在于别的测试且都是文件内 static 内部类未共享：AdminShimmerControllerTest:93（只覆写 queryForObject(String,Class,Object...) 和 queryForList，缺 update）、AdminArmorSetControllerTest:661（三种形态齐全 :687/:775/:786，带 sqlLog+argsLog）。
- setUp 直接 new AdminNpcController(6 依赖) + MockMvc standalone（L93-107）。共 28 个测试。
- 已直接相关的：shouldRoundTripTownNpcMaintenanceFieldsOnUpdate（:1101，stub 查旧 ID :1126 与 LAST_INSERT_ID :1127）；**shouldReportTownNpcShopMutationSummaryOnUpdate（:1173）已验证全部 6 个 summary 计数（:1257-1262）**，含 replaced/inserted/skipped/removed 混合场景；shouldReplaceOnlyNpcDropLootRowsWhenUpdatingNpcLootEntries（:1266）示范 update 逐参数 verify（:1318-1337）。

### 8.3 可覆盖性结论与切入点

**现有 Mockito 基建完全够用，且 summary 计数已被覆盖。** 方法用到的三种 JdbcTemplate 形态（queryForList varargs、update varargs、queryForObject 两参）Mockito 天然全支持，含 `thenReturn(121L, 122L)` 连续主键。真正缺口：**npc_shop_conditions 级联写入路径（L1163-1182）从未被断言**——既有测试请求体都不带 conditions。建议补 3 个用例（沿用 PUT /admin/npcs/7 + mock 模式，前置 stub 同 :1196-1215 那组）：

1. `shouldCascadeInsertNormalizedShopConditionsWhenReplacingShopEntries` — conditions 带 `{refType:"moon_phase", refId:5}`，verify update(contains("INSERT INTO npc_shop_conditions"), eq(99L), eq("WORLD_CONTEXT"), eq(5L), eq("required"), isNull(), eq(1))，验证 refType 归一化（L1227）与 conditionRole 默认值（L1178）；
2. `shouldSkipShopConditionRowsWithInvalidRefTypeOrRefId` — 未知 refType / refId≤0，verify never（对应 L1168 守卫）；
3. `shouldDeleteOldShopConditionsByEntryIdsBeforeDeletingEntries` — 旧条目存在时 verify update(contains("DELETE FROM npc_shop_conditions WHERE shop_entry_id IN"), eq(21L), eq(22L))；为空时 verify never（对应 L1124-1127 分支）。

另：AdminNpcRelationController.replaceNpcShopEntries 独立端点无任何测试；如需覆盖应 mock NpcShopEntryMapper/NpcShopConditionMapper 而非 JdbcTemplate。两条并行实现本身是收编候选（同一业务两套写法），但不在本次最小改动范围。

---

## 总摘要与推荐

| 项 | 关键结论 | 推荐 |
|---|---|---|
| 1 role 校验 | issueToken 恒 ADMIN（AdminJwtService L39），加固=深度防御非行为变更；插入点拦截器 L45/46 间，沿用 writeUnauthorizedResponse 惯例 | 做，~5 行；requireAdminRole 保留不动 |
| 2 400→401 | 10 副本=6 抛 IAE(→400) + 4 裸强转(→NPE 500)；**UserArticleController L97 静默放行**；auth/ 无 401 异常 | **方案 A**（UnauthenticatedException，12 文件 ~50 行）；方案 B 230+ 行且仍需 A 的设施 |
| 3 trimToNull | 实际 **35 份**语义全等价，可一步收编；无 commons-lang3、无 util/，需在 common/ 自建；firstNonBlank 实际 **21 份五种语义**，不能单一合并 | trimToNull 建 common 工具类统一；firstNonBlank 分两个命名变体收编（Trimmed/Raw），组 5("image"兜底) 原地保留 |
| 4 getClientIp | 8 份逐字等价；8 controller 全 @RequiredArgsConstructor 零成本注入；**但 ClientIpResolver 信任模型不等价（XFF 方向相反+代理白名单）** | 收编到 ClientIpResolver，在计划中明示为有意的安全修正（审计 IP 口径变化） |
| 5 Category 200 | 7 个错误分支 HTTP 200 实锤；**/admin/categories 前端零调用** | 删 catch 让 GlobalExceptionHandler 接管，404 处改抛异常；无前端破坏面 |
| 6 articles 列表 | commentCount **列表 SQL 已返回**（XML:40-45）；无 reviewStatus 过滤实锤（XML:48-56）；前端逐篇刷新是口径校准冗余 | 后端加 reviewStatus 过滤参数（三层各几行）+ 统一 count 口径（批量 IN count）；前端删逐篇刷新 |
| 7 CRUD 试点 | CT/WC 88% 孪生但**已是 MyBatis-Plus**；迁移=各建 service 两件套 ~150 行 + controller 瘦身；泛型基类收益有限；**样板 ItemRarity 自己无测试** | 按 ItemRarity 式各建一套（不做泛型抽象）；补 AdminItemRarityControllerTest；CT/WC 既有测试改 mock service |
| 8 NPC shop 测试 | syncNpcShopEntries(私有 L1117-1194) 与 replaceNpcShopEntries(端点 L200-253) 是两条并行实现；Mockito 基建够用，summary 已覆盖 | 补 3 个 conditions 级联用例（8.3 清单）；独立端点无测试待另立项 |
