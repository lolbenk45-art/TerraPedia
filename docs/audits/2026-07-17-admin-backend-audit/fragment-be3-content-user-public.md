# 后端·内容/用户/公共控制器组

> 评审范围: `back/src/main/java/com/terraria/skills/controller/` 下 内容管理 / 认证与用户 / 公共查询 三个子组共 36 个控制器。
> 深挖对象: PublicItemAggregateController、AuthController + JWT 链路、AdminArticleController、FileStorageController、E2eVerificationMailboxController。
> 评分维度(10 分制): 接口设计 / 结构 / 架构 / 耦合度 / 维护难度(分数越高越好, 维护难度高分=易维护)。

## 汇总表

| Controller | 接口设计 | 结构 | 架构 | 耦合度 | 维护难度 | 均分 |
|---|---|---|---|---|---|---|
| **A. 内容管理** | | | | | | |
| AdminArticleController | 6.5 | 7 | 7 | 6 | 6 | **6.5** |
| AdminArticleCommentController | 7.5 | 7.5 | 7.5 | 6.5 | 7.5 | **7.3** |
| ArticleController | 8 | 8 | 8 | 8 | 8 | **8.0** |
| ArticleCommentController | 7 | 7 | 6 | 6 | 6 | **6.4** |
| UserArticleController | 7 | 7.5 | 6.5 | 6.5 | 7 | **6.9** |
| **B. 认证与用户** | | | | | | |
| AuthController | 7 | 8 | 6 | 7 | 7 | **7.0** |
| UserAuthController | 7.5 | 6.5 | 7 | 7 | 6.5 | **6.9** |
| AdminUserController | 7 | 8 | 7.5 | 8 | 8 | **7.7** |
| PublicUserController | 7 | 5.5 | 6 | 5.5 | 6 | **6.0** |
| UserFavoriteController | 7.5 | 7 | 7.5 | 6.5 | 7.5 | **7.2** |
| UserNotificationController | 7.5 | 7 | 7.5 | 6.5 | 7.5 | **7.2** |
| UserPreferencesController | 7.5 | 7 | 7.5 | 6.5 | 7.5 | **7.2** |
| UserReadingHistoryController | 7.5 | 7 | 7.5 | 6.5 | 7.5 | **7.2** |
| UserSavedRouteController | 7.5 | 7 | 7.5 | 6.5 | 7.5 | **7.2** |
| E2eVerificationMailboxController | 8 | 8 | 8.5 | 8 | 8 | **8.1** |
| **C. 公共查询 API** | | | | | | |
| PublicItemController | 7.5 | 7.5 | 7.5 | 7.5 | 7.5 | **7.5** |
| PublicItemAggregateController | 8 | 9 | 8 | 9 | 9 | **8.6** |
| PublicItemRecipeController | 7 | 5.5 | 5 | 6 | 5 | **5.7** |
| PublicItemRelationController | 7.5 | 6 | 5.5 | 6 | 5.5 | **6.1** |
| PublicNpcAggregateController | 8 | 7 | 6.5 | 7 | 7 | **7.1** |
| PublicBossController | 7.5 | 8 | 8 | 8 | 8 | **7.9** |
| PublicBuffController | 7.5 | 8 | 8 | 8 | 8 | **7.9** |
| PublicBiomeController | 7.5 | 8 | 8 | 8 | 8 | **7.9** |
| PublicArmorSetController | 5.5 | 7.5 | 7 | 7.5 | 6.5 | **6.8** |
| PublicProjectileController | 7.5 | 8 | 8 | 8 | 8 | **7.9** |
| PublicHomeController | 7.5 | 8 | 8 | 8 | 8 | **7.9** |
| PublicContentReferenceController | 7.5 | 8 | 8 | 8 | 8 | **7.9** |
| CategoryController | 6 | 6 | 5.5 | 6 | 5.5 | **5.8** |
| CategoryManagementController | 5.5 | 6 | 6 | 6 | 5.5 | **5.8** |
| StatisticsController | 6 | 8 | 6.5 | 8 | 8 | **7.3** |
| ItemController | 6 | 6 | 5.5 | 6.5 | 5.5 | **5.9** |
| ItemRecipeController | 6 | 6 | 5.5 | 6.5 | 5.5 | **5.9** |
| ItemSourceController | 6 | 6 | 5.5 | 6.5 | 5.5 | **5.9** |
| NpcController | 6 | 6 | 5.5 | 6.5 | 5.5 | **5.9** |
| ItemImageController | 6 | 6 | 5.5 | 6.5 | 5.5 | **5.9** |
| FileStorageController | 7 | 7.5 | 7 | 7.5 | 7 | **7.2** |

## 安全发现

按严重度排序 (均为已读源码验证, 非推测):

1. **[中] 手写 JWT 的密钥治理缺口** (`auth/AdminJwtService.java`, `auth/UserJwtService.java`): 两套 JWT 均为手工 Base64URL+HmacSHA256 实现。做对的: 验签用 `MessageDigest.isEqual` 恒时比较、exp 校验、admin 侧额外校验 `sub==配置用户名`、启动时 `@PostConstruct` 拒绝空 secret/空密码 (fail-fast)。缺口: ① secret 无最小长度校验 (弱 HS256 密钥可离线爆破); ② **无任何校验阻止 admin/user 两个 secret 配成相同值**——两 token 域的隔离完全押在 secret 相异上, role claim 解析出来后不参与任何鉴权判断; ③ 不校验 header `alg` (因签名恒按 HS256 重算, alg 混淆实际打不通, 属侥幸安全); ④ admin 密码为配置明文 + 非恒时 `equals` 比对。**建议**: 启动校验 secret ≥32 字符且 admin≠user; 密码改哈希存储; 换标准 JWT 库。

2. **[中] 鉴权失败返回 400 而非 401**: 约 8 个用户资源 controller 的 `getRequiredClaims` 兜底抛 `IllegalArgumentException`, 被 `GlobalExceptionHandler` 统一映射为 **400**。正常路径由拦截器先挡 (401 正确), 但一旦拦截器路径清单漏配某个新端点, 未登录请求会以 400 "Invalid login session" 泄漏到业务层——语义错误且掩盖了配置缺陷。UserArticleController/AdminArticleController 的版本更糟: 裸强转, claims 缺失时直接 NPE→500。

3. **[中] 拦截器路径清单 = 影子路由表** (`auth/AdminAuthenticationInterceptor.java` L54-87, `auth/UserAuthenticationInterceptor.java` L55-86, `auth/UserWriteOriginInterceptor.java` L45-71): admin/user/origin 三个拦截器各自维护硬编码路径前缀+正则清单来决定"谁需要什么鉴权"。评论写接口的 4 条正则在 UserAuthenticationInterceptor 和 UserWriteOriginInterceptor **重复两份**。新增受保护端点需要同步 2-3 处, 漏配即成公开接口 (fail-open)。`/items`、`/categories`、`/files` 的 admin 写保护依赖"非 GET/HEAD 才鉴权"规则, 同前缀新增任何 GET 敏感端点都会默认公开。**建议**: 改为注解声明式 (`@RequireAdmin`/`@RequireUser`) + 拦截器读 handler 注解, 未标注的写方法默认拒绝。

4. **[中] `getClientIp` 手写复制无条件信任 X-Forwarded-For**: AdminArticle/AdminArticleComment/ArticleComment/UserArticle/UserFavorite/UserNotification/UserReadingHistory/UserSavedRoute 等 ~8 处私有复制的 `getClientIp` 直接取 XFF 第一段——该头客户端可任意伪造, 这些 IP 进入审计日志与评论/收藏记录, **审计溯源可被污染**。而 `security/ClientIpResolver` (可信代理链感知, 从右向左找第一个非可信地址) 已存在且被 AuthController/UserAuthController/限流器正确使用。**建议**: 全量替换为 ClientIpResolver。

5. **[低] FileStorageController 路径安全: 结论为扎实, 但有三处纵深欠账** (`controller/FileStorageController.java` + `service/impl/MinioObjectStorageServiceImpl.java`): 读路径 `normalizeReadableObjectKey` 做反斜杠归一→剥前导斜杠→拒 `..`→**七前缀白名单**, 遍历不可行; 上传强制魔数校验 (JPEG/PNG/WebP, content-type 须与魔数一致, SVG 被排除), 对象键服务端 UUID 生成。欠账: ① 响应无 `X-Content-Type-Options: nosniff`; ② 死代码 `buildObjectKey(originalFilename, contentType, entityDomain)` + `resolveExtension` (含 .svg/.gif 分支) 是旧的信任客户端类型路径的残骸, 复活即绕过魔数校验, 应删除; ③ 存储未配置时 `DisabledObjectStorageService` 抛 IllegalStateException → 所有 /files 请求 500 而非 404。

6. **[低] E2eVerificationMailboxController 生产暴露评估: 实际不可达, 可留在生产代码树**: `@Profile("e2e")` + `E2eEnvironmentPostProcessor` 多重硬闸 (e2e 激活时强制: 仅 e2e 单 profile、数据源必须 `terria_v1_e2e_<runId>` loopback、Redis loopback db15、`server.address` 必须 loopback、run-secret ≥24 字符)——误激活时服务只能绑本机连一次性库。residual risk: controller 的 `secretMatches` 对 `runSecret=""` + 空串头会通过 (`MessageDigest.isEqual` 两空相等), 当前被 PostProcessor 的长度校验兜住, 但防御依赖 260 行外的另一个类, 建议 controller 本地加 `runSecret.isBlank() → false`。

7. **[低] CORS 全私网通配 + `allowCredentials(true)`** (`config/CorsConfig.java`): 允许 192.168.*/10.*/172.16-31.* 任意端口携凭证跨域。局域网部署场景合理, 但意味着**同一内网的任何设备上的任何网页都可携用户 Cookie 调 API**; 写操作靠 UserWriteOriginInterceptor 二次把关, 而它只放行 localhost/127.0.0.1——两层配置语义打架 (CORS 放行了 origin 但 Origin 拦截器又拒绝写), 内网非 localhost 前端的写请求实际会被 403。建议将允许 origin 收敛为单一配置源。

8. **[低] 其他**: UserAuthController 的 `cookieSecure` 默认 false, 生产 HTTPS 需显式配置, 建议生产 profile 启动校验; AdminUserController 的 reset-password 在响应中回传新密码且无 SecurityAudit 记录; 管理端 token 无吊销机制 (8h TTL 内泄漏即有效)。

## 横向共性问题

1. **样板三件套复制 (~10 份)**: `getRequiredClaims` (两种变体: 裸强转会 NPE / instanceof 抛 400) + `getClientIp` (XFF 可伪造版) + 分页装配 (resolvePage/resolveLimit/setPagination 五行) 在几乎每个 controller 重复。一个 `HandlerMethodArgumentResolver` (注入 claims)、统一 ClientIpResolver、一个 `ApiResponse.page(Page)` 工厂即可全部消灭。

2. **HTTP 状态语义不一致**: POST 创建 201 (AdminArticle/AdminUser/Category) vs 200 (评论/收藏/路线); not-found 404 (Boss/Buff/PublicItem) vs 200+success:null (**armor-sets, 且 NON_NULL 序列化导致 data 键整个消失**) vs 400 (FileStorage 对象不存在) vs message 字符串分派 (PublicUser); CategoryManagementController 全部错误以 HTTP 200 携带 `statusCode:400/404` 发出。前端/监控无法建立统一的错误处理。

3. **接口语义与实现脱节的已验证 quirk**: ① `/admin/articles?status=` 过滤发布态 (DRAFT/PUBLISHED/OFFLINE) 而非审核态, `reviewStatus` 无过滤参数, 与管理端"审核队列"的核心诉求错位; ② armor-sets 详情 200-null; ③ `/statistics/overview` 与 `/statistics/admin/overview` 返回相同数据, 保护版是空壳。

4. **legacy 与 public 双家族并存**: `/items`、`/npcs`、`/categories` (读写混合) 与 `/public/items`、`/public/npcs` 大面积重叠, 且净化强度不同 (public 有 controller 级图片白名单净化, legacy 只有全局 Advice 兜底)。PublicItemAggregateController 的 410 墓碑证明团队会做退役, 但 legacy 家族没有同等待遇, 双入口继续发散。

5. **展示层净化逻辑散布三层**: controller 内联 (PublicItemRecipe 120 行递归拷贝+剥离、PublicItemRelation 80 行映射)、`ManagedImageUrlPolicy` 组件、全局 `WikiImageResponseSanitizerAdvice` (反射遍历所有响应 bean)。一张图片 URL 的最终形态取决于三处逻辑的叠加顺序, 是全组最大的可维护性债; 全局反射 Advice 还对每个响应做深拷贝, 有性能与"读法优先"的隐性契约风险。

6. **异常处理反模式群**: controller 本地 try-catch IllegalArgumentException (Category 双 controller、Item、PublicUser) 与全局 handler 并存; PublicUser 按异常 message 字符串分派状态码; 业务未找到/未登录/参数错误共用 IllegalArgumentException 一个异常类型, 全局 handler 只能一刀切 400。缺一套 `NotFoundException/UnauthorizedException/BusinessException` 层级。

7. **风格漂移**: 返回 `ResponseEntity<ApiResponse>` vs 裸 `ApiResponse` (CategoryManagement/Statistics/PublicHome); 中英文错误消息混用 (admin 链路中文, user 链路英文, GlobalExceptionHandler 中文); Category/Item 每请求 log.info 全参数产生日志噪音; `import *` (CategoryManagementController)。

## A. 内容管理子组

### AdminArticleController (182 行, `/admin/articles`)

| 维度 | 分数 | 点评 |
|---|---|---|
| 接口设计 | 6.5 | 状态机动作 (`submit-review`/`review`/`publish`/`offline`) 用动词子资源 POST, 语义清晰; 但 **已验证的语义陷阱**: `GET /admin/articles?status=` 过滤的是**发布态** (DRAFT/PUBLISHED/OFFLINE, 见 `ArticleServiceImpl.normalizeStatusAllowNull` → `normalizeStatus` 白名单), 而审核工作流的核心维度 `reviewStatus` (DRAFT/PENDING_REVIEW/APPROVED/REJECTED) **没有任何过滤参数**——管理端想看"待审核列表"只能拉全量前端过滤。同时保留 `PATCH /{id}/status` 这个 legacy 直发通道 (service 里叫 `DIRECT_PUBLISH_COMPAT`), 与新审核流并存, 一个资源两套状态语义。 |
| 结构 | 7 | 方法级结构整齐一致: 取 claims → 调 service → 包 ApiResponse。分页样板 (resolvePage/resolveLimit + setPagination) 逐方法重复。 |
| 架构 | 7 | 纯委托给 `ArticleService`, 无业务逻辑泄漏进 controller; 审计参数 (username + ip) 逐层手工透传是架构选择的代价。 |
| 耦合度 | 6 | 直接依赖 `AdminAuthenticationInterceptor.ADMIN_CLAIMS_ATTRIBUTE` 常量并做裸强转; `getClientIp` 私有复制 (X-Forwarded-For 手工解析), 与已存在的 `ClientIpResolver` bean 重复且行为不一致 (不校验可信代理)。 |
| 维护难度 | 6 | 单个文件好读; 但 status/reviewStatus 双状态机 + legacy compat 路径的语义只能读 service 800 行实现才能搞懂, 接口层完全没有暴露这个复杂度。 |

**优化方案**: ① 给列表接口加 `reviewStatus` 过滤参数, 并在 OpenAPI `@Operation` 里写明 `status` 是发布态; ② 废弃 `PATCH /{id}/status` legacy 通道 (加 `@Deprecated` + 文档), 收敛到审核流; ③ `getClientIp`/`getRequiredClaims` 抽成共享组件 (统一用 `ClientIpResolver`, claims 用 HandlerMethodArgumentResolver 注入)。

### AdminArticleCommentController (108 行, `/admin/articles/{articleId}/comments`)

| 维度 | 分数 | 点评 |
|---|---|---|
| 接口设计 | 7.5 | 嵌套资源路径正确; 列表过滤参数齐全 (status/keyword/authorId/sort); PATCH status 带 reason 合理。 |
| 结构 | 7.5 | 三个端点, 干净。分页样板重复同上。 |
| 架构 | 7.5 | 有独立的 `AdminArticleCommentService`, 与用户端评论 service 分离, 职责清楚。 |
| 耦合度 | 6.5 | 同样复制了 `getClientIp` + claims 裸强转。 |
| 维护难度 | 7.5 | 小而直白。 |

**优化方案**: 复用共享的 IP/claims 解析; `resolveLimit(…, 20, 100)` 的 max 参数这里传了、AdminArticleController 没传, 统一分页上限约定。

### ArticleController (56 行, `/articles`, 公开只读)

| 维度 | 分数 | 点评 |
|---|---|---|
| 接口设计 | 8 | id + slug 双查询入口, 只暴露 published, 面向 SSR 友好。 |
| 结构 | 8 | 三端点, 无冗余。 |
| 架构 | 8 | 只读委托, 与 Admin/User 视图在 service 层按方法名前缀 (`getPublished*`) 分离。 |
| 耦合度 | 8 | 仅依赖 service + 公共分页工具。 |
| 维护难度 | 8 | 几乎零维护成本。 |

**优化方案**: 公开列表接口无 Cache-Control/ETag; 对 SSR 高频读可加 HTTP 缓存头。

### ArticleCommentController (164 行, `/articles/{articleId}/comments`, 公开读+登录写)

| 维度 | 分数 | 点评 |
|---|---|---|
| 接口设计 | 7 | like/unlike 用 POST/DELETE 同一路径, 正确; 但**写操作成功返回 200 而非 201**, 与 AdminArticle 的 POST 返回 201 不一致。 |
| 结构 | 7 | `getOptionalUserId` vs `getRequiredClaims` 双模式处理"游客可读/登录可写"清晰。 |
| 架构 | 6 | **鉴权边界外置到拦截器的正则**: `UserAuthenticationInterceptor.isArticleCommentWrite` 用 4 条硬编码正则匹配本 controller 的写路径。controller 加一个写端点而忘改拦截器正则 = 未登录可打 (`getRequiredClaims` 只兜底抛 `IllegalArgumentException`, 会被全局 handler 映射成 4xx 但语义是 500 级配置错误)。这是拦截器路径清单模式最脆的一处。 |
| 耦合度 | 6 | 与拦截器正则隐式强耦合 (双向都改才安全); getClientIp 又一份复制。 |
| 维护难度 | 6 | 端点多但模式统一; 隐式正则契约无测试护栏的话极易腐化。 |

**优化方案**: ① 把"该路径需要登录"改为声明式 (自定义 `@RequireUser` 注解 + 拦截器读注解), 消灭正则清单; ② 兜底 `getRequiredClaims` 抛专用 401 异常而非 IllegalArgumentException; ③ 写操作统一 201。

### UserArticleController (190 行, `/user/articles`)

| 维度 | 分数 | 点评 |
|---|---|---|
| 接口设计 | 7 | 用户侧状态机动作 (submit-review/withdraw/offline/delete) 完整对称; `POST /user/articles/images` 把图片上传挂在文章资源下但实际调 `objectStorageService.uploadItemImage(file, "articles")`——**"ItemImage"命名的通用上传被文章复用**, 语义错位。 |
| 结构 | 7.5 | 与 AdminArticleController 同构, 一致性好。 |
| 架构 | 6.5 | 同时注入 `ArticleService` + `ObjectStorageService` 两个职责; 图片上传端点放这里主要是为了蹭 `/user/**` 的登录拦截, 是鉴权模型 (路径前缀) 反过来决定 API 归属的例子。 |
| 耦合度 | 6.5 | claims 裸强转 + getClientIp 复制同上。 |
| 维护难度 | 7 | 直白, 但与 Admin 版的行为差异 (哪些状态可删/可撤回) 全在 service 里。 |

**优化方案**: 上传语义改为 `objectStorageService.upload(file, domain)` 通用命名; 或独立 `/user/uploads` 资源。

**A 组小结**: 5 个 controller 都是薄委托层, 单体质量尚可; 系统性问题是 ① status/reviewStatus 双状态机语义只在 service 深处可见, ② 鉴权靠拦截器路径清单与 controller 隐式耦合, ③ getClientIp/claims 提取样板复制了 5 份。

## B. 认证与用户子组

### AuthController (93 行, `/auth`, 管理端登录) — 深挖: JWT 链路

| 维度 | 分数 | 点评 |
|---|---|---|
| 接口设计 | 7 | login/me 两端点, 简单正确; 无 logout/refresh (管理端 token 8h 一次性, 可接受但前端无法主动失效)。 |
| 结构 | 8 | 登录流程线性清晰: 限流检查 → 凭证比对 → 发 token → 审计, 每步都落审计日志, 是全组审计做得最完整的 controller。 |
| 架构 | 6 | **单管理员账号架构**: 凭证来自配置 (`AdminAuthProperties.username/password`), 无 admin 用户表。JWT 链路为**手写 JWT** (`AdminJwtService`): 手工 Base64URL + HmacSHA256, 验签用 `MessageDigest.isEqual` 恒时比较 ✓, 校验 exp ✓ 和 sub==配置用户名 ✓。但手写实现**不校验 header 的 `alg` 字段** (虽然因为签名始终按 HS256 重算, alg 混淆攻击实际打不通, 属"侥幸安全"而非"设计安全"); 无 jti/无吊销能力。 |
| 耦合度 | 7 | 正确使用 `ClientIpResolver` (信任代理链感知)——与内容组手写 X-Forwarded-For 形成对比, 说明好组件存在但未被推广。 |
| 维护难度 | 7 | 逻辑集中好读; 手写 JWT 意味着未来加 claim/换算法都要自己保证正确性。 |

**JWT 链路安全结论**: ① `AdminAuthProperties.password` **明文常量比对** (`equals`, 非恒时, 且配置里存明文密码而非哈希)——单管理员场景下可接受但密码泄露面大, 建议至少存 bcrypt 哈希 + 恒时比较; ② `application.yml` 中 `TERRAPEDIA_ADMIN_PASSWORD:` 和 `TERRAPEDIA_AUTH_TOKEN_SECRET:` **默认值为空**, 由 `@PostConstruct` 的 `requireText` 拒绝启动 ✓ (fail-fast 做对了); ③ token secret 无长度下限校验——弱 HS256 密钥可被暴力破解, 建议 requireText 之外加 `length >= 32`; ④ admin/user 双 token 域靠**不同 secret + 不同拦截器**隔离: user token 打到 `/admin/**` 会因 Admin secret 验签失败被拒 ✓, 前提是两个 secret 不同——**没有任何启动校验阻止两者配成相同值**, 若相同, user JWT 伪造 admin 只差 payload 里的 sub 字段 (仍会被 `sub==admin用户名` 挡住, 但 role 字段完全不参与校验, 纵深不足)。

**优化方案**: 换用 jjwt/nimbus 标准库; secret 长度校验 + admin/user secret 相异校验; 密码改哈希存储。

### UserAuthController (332 行, `/user-auth`) 

| 维度 | 分数 | 点评 |
|---|---|---|
| 接口设计 | 7.5 | 注册/登录/刷新/改密/重置/注销/头像全生命周期完整; 双 token (access+refresh) HttpOnly Cookie 模式对 XSS 免疫, 改密/注销后 `clearAuthCookies` 正确; 但 `/refresh` 在 controller 里 try-catch 手工处理 401, 与其他端点靠全局 handler 的风格分裂。 |
| 结构 | 6.5 | 332 行为本组最大 controller, cookie 读写 60 行样板占近 1/5; `writeAuthCookies`/`clearAuthCookies`/`readCookie` 应抽成 `AuthCookieManager` 组件。 |
| 架构 | 7 | 委托 `UserAuthService` 干净; 验证码投递用 `VerificationCodeDelivery` 接口 (SMTP/E2E 双实现) 是本组最好的抽象。 |
| 耦合度 | 7 | 用了 `ClientIpResolver` ✓; 但也依赖拦截器 attribute 裸强转。 |
| 维护难度 | 6.5 | 端点多且 cookie 逻辑内联, 改 cookie 策略要动 3 个私有方法。 |

**安全注**: `cookieSecure` 默认 `false`、SameSite=Lax——生产若 HTTPS 未显式配 `cookie-secure: true`, token 可被中间人读取。refresh token 有服务端存储 (`UserRefreshTokenStoreService`), 可吊销 ✓, 比 admin token 的纯无状态强。

**优化方案**: 抽 cookie 管理组件; `/refresh` 异常处理并入全局 handler (定义专用异常); 生产 profile 强制 cookieSecure=true 校验。

### AdminUserController (86 行, `/admin/users`)

| 维度 | 分数 | 点评 |
|---|---|---|
| 接口设计 | 7 | 列表/创建/封禁/重置密码齐; **无 GET /{id} 详情端点**, 前端只能从列表页取; reset-password 由管理员直接设新密码并返回 (响应里含密码), 审计上是敏感值出网。 |
| 结构 | 8 | 全组唯一不需要 claims/IP 的 admin controller, 干净。 |
| 架构 | 7.5 | 独立 `UserManagementService`, 与 UserAuthService 分离合理。 |
| 耦合度 | 8 | 仅依赖 service。 |
| 维护难度 | 8 | 86 行无坑。 |

**优化方案**: 补 GET /{id}; reset-password 改为生成一次性重置链接而非回传明文新密码; 该 controller 的操作没有落 SecurityAudit (对比 AuthController), 管理员改用户状态应审计。

### PublicUserController (46 行, `/users/{id}`)

| 维度 | 分数 | 点评 |
|---|---|---|
| 接口设计 | 7 | 公开主页资料+作品分页, 合理。 |
| 结构 | 5.5 | **controller 内 try-catch + 按异常 message 字符串分派 404/400** (`"User not found".equals(exception.getMessage())`)——把 HTTP 语义耦合到异常文案, service 改个文案就 404→400。全组独一份的反模式。 |
| 架构 | 6 | 应由专用 `NotFoundException` + 全局 handler 处理。 |
| 耦合度 | 5.5 | 与 service 的异常 message 字符串强耦合。 |
| 维护难度 | 6 | 文件小, 但暗坑典型。 |

**优化方案**: 引入 `ResourceNotFoundException`, 全局 handler 映射 404, 删掉本地 try-catch。

### UserFavoriteController (134) / UserNotificationController (90) / UserPreferencesController (54) / UserReadingHistoryController (92) / UserSavedRouteController (88)

五个"用户自有资源" controller 高度同构, 合并点评:

| 维度 | 分数 | 点评 |
|---|---|---|
| 接口设计 | 7.5 | 收藏 PUT/DELETE 幂等 ✓; 通知 unread-count/read-all ✓; 历史 POST/DELETE 按 (targetType, targetId) ✓; 批量状态查询 `?ids=` 为前端省 N 次请求 ✓。小瑕疵: SavedRoute 的 POST 实为 upsert (返回消息 "Saved route updated"), 语义该用 PUT; ReadingHistory 的 `targetType` 路径段无枚举约束, 校验全押 service。 |
| 结构 | 7 | 模式统一; 每个都复制 `getRequiredClaims` + `getClientIp` (本子组 5 份 × 全评审范围 ~10 份)。 |
| 架构 | 7.5 | 每资源一 service, 所有权 (userId) 在 service 层强制, 正确。 |
| 耦合度 | 6.5 | 全部依赖拦截器路径清单 `/user/**` 才有 claims——本组恰好都在 `/user/` 前缀下, 是拦截器清单模式里最安全的一批; 但 `getRequiredClaims` 失败抛 `IllegalArgumentException` → 全局 handler 映射 **400** 而非 401, 鉴权失败语义错误。 |
| 维护难度 | 7.5 | 同构性让新资源可照抄; 代价是样板继续繁殖。 |

**优化方案**: `@AuthenticationPrincipal` 式的 ArgumentResolver 一次性消灭 10 份 claims 样板; 定义 `UnauthorizedException` 修正 400/401 语义; targetType 用枚举绑定。

### E2eVerificationMailboxController (60 行, `/e2e/verification-codes`) — 深挖: 是否该在生产代码里

| 维度 | 分数 | 点评 |
|---|---|---|
| 接口设计 | 8 | 单端点, 按 email 取最新验证码, 带 secret 头。 |
| 结构 | 8 | 恒时比较 secret (`MessageDigest.isEqual`) ✓。 |
| 架构 | 8.5 | 多层防激活设计**明显是有意为之且做得扎实**: ① `@Profile("e2e")` 控制 bean 注册; ② `E2eEnvironmentPostProcessor` 在 e2e profile 激活时强制: 只允许 e2e 单 profile、`terrapedia.e2e.enabled` 字面 true、run-secret ≥24 字符、数据源必须是 `terria_v1_e2e_<runId>` 且 loopback、Redis 必须 loopback db15、`server.address` 必须 loopback——**即使误激活 e2e profile, 服务也只能绑本机、连一次性数据库**; ③ 无 secret → 403。 |
| 耦合度 | 8 | 只依赖同 profile 的 mailbox bean。 |
| 维护难度 | 8 | 自洽。 |

**结论: 可以留在生产代码树里。** 生产暴露需同时满足: 显式激活 e2e profile + enabled=true + 数据源改名成 e2e 格式 + server.address 改回 loopback 之外(会被拒), 实际不可达。两个改进: ① `runSecret` 构造时未拒空串, controller 里 `secretMatches` 对 `runSecret=""` + 空头会… `suppliedSecret == null` 拒, 但**攻击者送空字符串头**时 `MessageDigest.isEqual("", "")` 为 true——被 PostProcessor 的 ≥24 字符校验兜住, 但 controller 自身应加 `runSecret.isBlank() → false` 的本地防御, 不要依赖 60 行外的另一个类; ② mailbox 无淘汰策略 (ConcurrentHashMap 只增不减), e2e 长跑会缓慢泄漏, 加个容量上限更稳。若组织洁癖要求彻底隔离, 可移到 `src/e2e/java` 源集, 但收益边际。

**B 组小结**: 双认证域 (admin 配置账号 + user 数据库账号) 边界清晰, refresh token 有服务端吊销, E2E 隔离是全后端做得最认真的防护; 短板是手写 JWT 的密钥治理 (长度/相异性无校验)、鉴权失败 400 语义、以及 claims/IP 样板的第 N 次复制。

## C. 公共查询 API 子组

### PublicItemAggregateController (24 行, `/public/items/{id}/aggregate`) — 深挖

| 维度 | 分数 | 点评 |
|---|---|---|
| 接口设计 | 8 | 这是一个 **410 GONE 墓碑**: 旧聚合端点已拆分, 返回 410 + 明确的迁移指引消息 ("Use split public item detail, images, sources, and recipe-tree endpoints")。用 410 而非直接删路由, 让旧客户端拿到可操作的错误而非裸 404——是整个 controller 目录里最标准的 API 退役操作。 |
| 结构 | 9 | 24 行零依赖。 |
| 架构 | 8 | 佐证了"聚合端点 → 拆分端点"的演进已完成; 对比 PublicNpcAggregateController (聚合模式仍在用), 物品域选择拆分是因为 recipe-tree 深度可变、payload 过大, 决策合理。 |
| 耦合度 | 9 | 无 service 依赖。 |
| 维护难度 | 9 | 唯一欠缺: 没有注释/issue 标注墓碑的移除时限, 容易永久滞留。 |

**优化方案**: 加 `@Deprecated` + 代码注释标注预定删除版本; 前端确认无调用后 (SSR Task 8 已迁移) 排期移除。

### PublicItemController (115 行, `/public/items`)

| 维度 | 分数 | 点评 |
|---|---|---|
| 接口设计 | 7.5 | list/detail-shell/suggestions 三端点; `categoryIds` 同时支持重复参数和逗号分隔, `parseCategoryIds` 对坏 token 容错跳过而非整体丢弃 (有注释说明意图), 细节到位。默认 limit=100 偏大 (其他列表 20), 对"轻量列表"来说单页 payload 不轻。 |
| 结构 | 7.5 | 干净; detail 正确返回 404。 |
| 架构 | 7.5 | PageQuery 对象封装查询参数, 比散参传递好。 |
| 耦合度 | 7.5 | 只依赖 service。 |
| 维护难度 | 7.5 | 无坑。 |

**优化方案**: 默认 limit 与全站对齐 (20); suggestions 的 `limit` 参数未 clamp (依赖 service 内部约束, 应在边界处 clamp)。

### PublicItemRecipeController (178 行, `/public/items/{id}/recipe-tree|recipe-usages`)

| 维度 | 分数 | 点评 |
|---|---|---|
| 接口设计 | 7 | recipe-tree 带 maxDepth (service 侧 clamp 到 ABSOLUTE_MAX_DEPTH ✓); recipe-usages 无分页 (高扇出物品如"木材"会返回巨量记录)。 |
| 结构 | 5.5 | **120/178 行是递归深拷贝 (copyTree/copyVariant/copyNode 全用 BeanUtils.copyProperties) + 递归图片剥离**——展示层净化逻辑长在 controller 里。 |
| 架构 | 5 | 深拷贝的存在暴露了根因: service 返回的树可能是**共享/缓存对象**, controller 不敢原地改所以整树反射拷贝。正确做法是 service 提供 public 视图方法或专用 DTO mapper; 现在是 controller 承担 service 的投影职责。BeanUtils 反射拷贝对深树也有实际性能成本。 |
| 耦合度 | 6 | 与 RecipeTree DTO 结构逐字段耦合, DTO 加字段拷贝逻辑不用改 (BeanUtils 兜住) 但剥离逻辑要手工同步——`keepOnlyManagedImages` 漏掉新图片字段就是泄漏。 |
| 维护难度 | 5 | 三个互递归私有方法 + 两个重载剥离方法, 改 DTO 必须审两处。 |

**优化方案**: 净化下沉为 `PublicRecipeTreeAssembler` 组件; 或让 service 直接产出 public 形状的 DTO; recipe-usages 加分页。

### PublicItemRelationController (170 行, `/public/items/{id}/images|sources|buff-effects|armor-attributes|equipment-effects|treasure-bag-loot`)

| 维度 | 分数 | 点评 |
|---|---|---|
| 接口设计 | 7.5 | 六个细粒度子资源支撑详情页分块加载, 与前端 SSR 拆分策略匹配; 图片排序 (primary 优先 → sortOrder → id) 在此实现, 稳定。 |
| 结构 | 6 | 与 RecipeController 同病: ~80 行 DTO→PublicDTO 映射 + wiki 引用剥离 (`terraria.wiki.gg`/`static.wikia.nocookie.net` 硬编码域名黑名单) 长在 controller。 |
| 架构 | 5.5 | 有趣的分裂: images/sources 走 controller 手工净化, buff-effects 等四个直接透传 service——**同一 controller 内两套净化策略**; 而全局还有 `WikiImageResponseSanitizerAdvice` (对所有响应做反射式 wiki 图片替换) 兜底, 三层净化机制叠加, 职责边界模糊。 |
| 耦合度 | 6 | `managedImageUrl` 私有 helper 在本文件、PublicItemRecipeController、ItemController 三处复制。 |
| 维护难度 | 5.5 | 要理解一张图片 URL 最终形态需读 controller 净化 + ManagedImageUrlPolicy + 全局 Advice 三处。 |

**优化方案**: 统一净化到一处 (推荐 service 出口或专用 Assembler), 让全局 Advice 只做兜底告警而非常规路径; 硬编码 wiki 域名黑名单挪进 ManagedImageUrlPolicy。

### PublicNpcAggregateController (105 行, `/public/npcs/{id}/aggregate`)

| 维度 | 分数 | 点评 |
|---|---|---|
| 接口设计 | 8 | `include=loot,shop,buffs|all` 模块化聚合 + `moduleStatus`(ok/empty/skipped) 元数据是全组最讲究的响应设计, 前端可按需省流量; 404 语义正确。 |
| 结构 | 7 | parseRequestedModules 解析健壮 (大小写/空白/未知值容错)。 |
| 架构 | 6.5 | 聚合编排 (三次 service 调用 + 状态装配) 放 controller——与物品域"拆分"哲学相反, NPC 域选聚合。编排本身应在 service 层, 便于复用与测试。 |
| 耦合度 | 7 | 单 service 依赖。 |
| 维护难度 | 7 | 加新模块要改 常量+解析+编排 三处, 但模式明显。 |

**优化方案**: 编排下沉 `PublicNpcAggregateService`; 模块名用 enum。

### PublicBossController (71) / PublicBuffController (68) / PublicBiomeController (42) / PublicProjectileController (55)

四个同构"档案库列表"controller, 合并点评:

| 维度 | 分数 | 点评 |
|---|---|---|
| 接口设计 | 7.5 | list+detail 双端点, detail 404 语义正确 (Boss/Buff/Biome); **Projectile 只有列表没有 detail** (前端弹窗展示够用, 但不对称); Biome 无分页 (数据集小, 可接受)。 |
| 结构 | 8 | Query 对象模式统一。 |
| 架构 | 8 | 每域独立 service。 |
| 耦合度 | 8 | 干净。 |
| 维护难度 | 8 | 照模板维护。 |

### PublicArmorSetController (66 行, `/public/armor-sets`) — 已验证 quirk

| 维度 | 分数 | 点评 |
|---|---|---|
| 接口设计 | 5.5 | **quirk 实锤**: detail 端点在查无记录时返回 `ResponseEntity.ok(ApiResponse.success(null))` (L61-63)——HTTP 200 + `success:true`, 且因 `ApiResponse` 类标注 `@JsonInclude(NON_NULL)`, **`data` 字段整个从 JSON 里消失**, 前端拿到 `{success:true,message:"操作成功",statusCode:200}` 无 data 键。同目录 PublicBossController/PublicBuffController 同场景返回 404+error——三个平级档案域两种 not-found 语义, 前端被迫为 armor-sets 写特判 (详情页 SSR Task 8 已确认此坑)。列表端点本身正常。 |
| 结构 | 7.5 | 除 quirk 外与 Boss/Buff 同模板。 |
| 架构 | 7 | service 用 jdbcTemplate 查投影表 (与其他域 MyBatis-Plus 不同, 属实现层选择)。 |
| 耦合度 | 7.5 | 干净。 |
| 维护难度 | 6.5 | quirk 是隐性契约, 改成 404 是 breaking change, 需协调前端同步。 |

**优化方案**: 改 `if (armorSet == null) return 404 + ApiResponse.error(...)` 对齐兄弟域; 与前端约一个窗口同步发布; ApiResponse 的 NON_NULL 序列化考虑对 `data` 字段豁免 (显式 null 优于字段缺失)。

### PublicHomeController (26 行) / PublicContentReferenceController (72 行)

| 维度 | 分数 | 点评 |
|---|---|---|
| 接口设计 | 7.5 | Home focus-item 单端点; ContentReference 的 search+resolve 双端点为文章内嵌引用服务, resolve 容忍空 body。 |
| 结构 | 8 | 都很小。 |
| 架构 | 8 | 合理。 |
| 耦合度 | 8 | 干净。 |
| 维护难度 | 8 | PublicHomeController 直接返回 `ApiResponse` 而非 `ResponseEntity<ApiResponse>`, 是风格分裂的又一例 (功能等价)。ContentReference 的 `limit` 未 clamp。 |

### CategoryController (140 行, `/categories`) 与 CategoryManagementController (204 行, `/admin/categories`)

| 维度 | CategoryController | CategoryManagementController |
|---|---|---|
| 接口设计 | 6 — **公共读与管理写混在 `/categories` 一个前缀下** (POST/PUT/DELETE 靠拦截器"非 GET 才要 admin"规则保护); navigation 503 降级语义好。 | 5.5 — 端点丰富 (tree/path/descendants/search/move/sort/级联删) 但**方法返回裸 `ApiResponse` 而非 ResponseEntity: `ApiResponse.error(404,...)`/`error(400,...)` 全部以 HTTP 200 发出**, 客户端和监控按 HTTP 状态判断全部失真。 |
| 结构 | 6 — 每个写方法各自 try-catch IllegalArgumentException, 与全局 handler 重复; 递归 DTO→VO 转换 (convertTree/convertChildren) 长在 controller。 | 6 — 逐方法 log.info + try-catch 样板; `import *` 通配导入。 |
| 架构 | 5.5 — **两个 controller 是同一 `CategoryManagementService` 的双重暴露**: create/update/delete 在 `/categories` 和 `/admin/categories` 各一份, 行为微差 (一个转 VO 一个不转、一个 201 一个 200), 是历史遗留未收敛。 | 6 |
| 耦合度 | 6 | 6 |
| 维护难度 | 5.5 — 改一个分类写逻辑要记得两个入口。 | 5.5 |

**优化方案**: `/categories` 收敛为纯公共只读 (GET), 写操作全部并入 `/admin/categories`; CategoryManagementController 改返回 ResponseEntity 修正 HTTP 状态; 删除本地 try-catch。

### StatisticsController (36 行)

| 维度 | 分数 | 点评 |
|---|---|---|
| 接口设计 | 6 | `/statistics/overview` (公开) 与 `/statistics/admin/overview` (拦截器保护) **调用同一个 service 方法返回完全相同的数据**——保护版端点没有任何额外信息, 是"为了给管理端一个带鉴权的 URL"而生的冗余。 |
| 结构 | 8 | 极简。 |
| 架构 | 6.5 | 若未来管理端统计要加敏感字段, 现状是合理占位; 若不会, 删掉一个。 |
| 耦合度 | 8 | 干净。 |
| 维护难度 | 8 | 无坑。 |

### ItemController (193 行, `/items`) 及 ItemRecipeController (49) / ItemSourceController (30) / ItemImageController (30) / NpcController (77)

legacy 端点家族, 合并点评:

| 维度 | 分数 | 点评 |
|---|---|---|
| 接口设计 | 6 | **与 `/public/*` 家族大面积重叠**: `/items/{id}/recipe-tree`≈`/public/items/{id}/recipe-tree`、`/items/{id}/sources`≈`/public/items/{id}/sources`、`/items/{id}/images`≈`/public/items/{id}/images`、`/npcs`(list)≈`/public/npcs`(aggregate 域)。差异在于 public 版有 controller 级图片/wiki 引用净化, legacy 版只靠全局 Advice 兜底——**同一数据两个公开 GET 入口、两档净化强度**, 数据泄漏面以最弱的那个为准。ItemController 还承担 admin 写 (POST/PUT/DELETE 靠拦截器"非 GET"规则), 读写混合同 Category 问题。 |
| 结构 | 6 | ItemController 里 `toItemVO` 做 `rare`/`rarity`、`category`/`categoryName` 双字段兼容别名——legacy 前端契约以 controller 代码形式存在; 每请求 log.info 全参数, 生产日志噪音。 |
| 架构 | 5.5 | legacy 与 public 并行演进, 没有明确的废弃计划 (对比 PublicItemAggregateController 的 410 墓碑, 这批该同样处理)。 |
| 耦合度 | 6.5 | ItemController 又一份 managedImageOrNull 复制。 |
| 维护难度 | 5.5 | 改物品展示逻辑要同时想两个家族; recipe-usages 逻辑在 ItemRecipeController 和 PublicItemRecipeController 各一份。 |

**优化方案**: 明确 legacy 家族退役路线: 前端全量切 `/public/*` 后, legacy GET 改 410 墓碑 (复用 aggregate 的模式); admin 写迁到 `/admin/items`; 删除双字段别名。

### FileStorageController (54 行, `/files`) — 深挖: 安全性

| 维度 | 分数 | 点评 |
|---|---|---|
| 接口设计 | 7 | 上传 (admin-only, 拦截器 `/files/` 前缀) + 公开读 `/files/objects/{*objectKey}`; 读接口带 Cache-Control ✓。缺陷: 对象不存在时 service 抛 IllegalArgumentException → 全局 handler 映射 **400** 而非 404。 |
| 结构 | 7.5 | 薄; 逻辑全在 `MinioObjectStorageServiceImpl`。 |
| 架构 | 7 | `@ConditionalOnProperty(..., matchIfMissing = true)` 让 controller 在 **minio.enabled 未配置时仍注册**, 而 Minio 实现类 `matchIfMissing = false` 不注册, 由 `DisabledObjectStorageService` 顶上并抛 IllegalStateException → 所有 `/files/**` 请求变 **500**。三个条件注解的默认值互相矛盾, 未配置存储时应是 404 而非 500。 |
| 耦合度 | 7.5 | 单依赖。 |
| 维护难度 | 7 | 依赖 service 侧安全逻辑, controller 本身无坑。 |

**路径校验安全评估 (结论: 扎实)**: ① `normalizeReadableObjectKey`: 反斜杠归一 → 剥前导 `/` → 拒绝任何 `..` → **前缀白名单** (avatars/items/npcs/projectiles/buffs/bosses/articles) 才放行——遍历攻击 (含 URL 编码后被 Spring 解码的 `..`) 被拒; MinIO 对象键本身非文件系统路径, 双重保险; ② 上传经 `UserAvatarValidator` **魔数校验** (JPEG/PNG/WebP 三种, content-type 必须与魔数一致, WebP 结构校验, 其余走 ImageIO 解码验证), **SVG 不在白名单** (杜绝 SVG-XSS), 对象键服务端生成 UUID (用户文件名不进入键), `entityDomain` 白名单化——上传链无用户可控路径成分; ③ 读响应 Content-Type 来自上传时校验过的类型, 但**响应未加 `X-Content-Type-Options: nosniff`**, 纵深上建议补; ④ 死代码隐患: `buildObjectKey(originalFilename, contentType, entityDomain)` 三参重载 + `resolveExtension` (含 `.svg`/`.gif` 分支) **已无调用方**, 是旧的"信任客户端 content-type"路径的残骸, 若被复活会绕过魔数校验, 建议删除。

**优化方案**: 补 nosniff 头; 对象不存在改 404 (专用异常); 统一三个 ConditionalOnProperty 的 matchIfMissing; 删除死代码重载。

**C 组小结**: 新一代 `/public/*` 家族 (Query 对象 + 404 语义 + 净化) 质量整体良好, armor-sets 的 200-null 是家族内唯一语义叛徒; 真正的债在 legacy 家族 (`/items`/`/categories`/`/npcs`) 与 public 家族的并行共存, 以及净化逻辑散布在 controller/全局 Advice/Policy 三层。
