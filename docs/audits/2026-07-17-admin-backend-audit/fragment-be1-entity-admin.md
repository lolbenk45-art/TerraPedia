# 后端·实体 Admin 控制器组

评审范围：`/home/lolben/TerraPedia/back/src/main/java/com/terraria/skills/controller/` 下 14 个实体数据管理 Admin 控制器及其 service/mapper 链路。深挖链路：AdminItemRarityController（最简 CRUD、唯一有完整 service 分层的样本）、AdminArmorSetController（最复杂，2214 行）、AdminTownNpcMaintenanceController（指定）、AdminNpcController + AdminNpcRelationController（最可疑：同一资源双 controller 双写路径）。

## 汇总表

| Controller | 接口设计 | 结构 | 架构 | 耦合度 | 维护难度 | 均分 |
|---|---|---|---|---|---|---|
| AdminItemRarityController | 8 | 8 | 9 | 8 | 5 | **7.6** |
| AdminRelationCompatibilityController | 7 | 8 | 8 | 8 | 7 | **7.6** |
| AdminWorldContextController | 7 | 5 | 4 | 7 | 5 | **5.6** |
| AdminBiomeController | 7 | 6 | 5 | 5 | 5 | **5.6** |
| AdminConditionTermController | 7 | 5 | 4 | 7 | 4 | **5.4** |
| AdminArmorAttributeController | 7 | 5 | 4 | 4 | 6 | **5.2** |
| AdminItemGroupController | 7 | 6 | 3 | 4 | 5 | **5.0** |
| AdminBossController | 7 | 4 | 4 | 4 | 4 | **4.6** |
| AdminProjectileController | 7 | 4 | 4 | 4 | 4 | **4.6** |
| AdminNpcRelationController | 7 | 4 | 5 | 3 | 3 | **4.4** |
| AdminTownNpcMaintenanceController | 6 | 5 | 3 | 3 | 4 | **4.2** |
| AdminNpcController | 6 | 3 | 2 | 3 | 3 | **3.4** |
| AdminBuffController | 6 | 3 | 2 | 3 | 3 | **3.4** |
| AdminArmorSetController | 6 | 2 | 2 | 3 | 2 | **3.0** |
| **组均分** | 6.8 | 4.9 | 4.2 | 4.7 | 4.3 | **5.0** |

接口设计是全组最强项（统一 `ApiResponse` + `PaginationParams` 约定执行得很一致）；架构分是全组最弱项（14 个里 12 个没有 service 层）。

## 横向共性问题

### H1. 「无 service 层」是本组的默认架构（12/14）

只有 AdminItemRarityController（→ `ItemRarityService`/`ItemRarityServiceImpl`，接口+实现、`@Transactional(rollbackFor)`、`@CacheEvict`）和 AdminRelationCompatibilityController（→ `RelationCompatibilityService`）走了标准三层。其余 12 个 controller 直接持有 mapper / 裸 `JdbcTemplate`（11 个文件注入 JdbcTemplate）/ 磁盘 JSON 文件，业务逻辑（掉落继承推导、Lua 注释解析、wiki 时长格式化、三级数据源路由）全部内嵌在 controller 私有方法里。讽刺的是同领域的 `PublicBossService`/`PublicBuffService`/`BiomeService`/`PublicArmorSetService` 都存在——**前台有分层、后台没有**。

### H2. 事务边界混乱：三种语义并存，最危险的写路径恰好没有事务

- **有事务**（标在 controller 方法上）：AdminBossController（create/update/delete）、AdminBiomeController（create/update，但 delete 没有）、AdminNpcRelationController（3 个 PUT）。
- **无事务但多表写**：AdminNpcController.`syncNpcRelations`（DELETE+循环 INSERT 跨 3-4 张表，含 `SELECT LAST_INSERT_ID()`）、AdminBuffController.`syncBuffSourceItems`（DELETE+循环 INSERT）、AdminArmorSetController 的 create/update/delete（均 2+ 条写语句）。
- **同一张表两种事务语义**：`npc_loot_entries`/`npc_shop_entries` 被 AdminNpcRelationController 用带 `@Transactional` 的 mapper 版写、又被 AdminNpcController 用无事务的 JdbcTemplate 版写。
- **删除留孤儿**：`deleteBuff` 不清 `buff_source_items`；`deleteBiome` 不清 `item_biomes`/`npc_biomes`/`item_acquisition_sources`；`deleteNpc` 不清任何关系表。

### H3. `Map<String, Object>` 进出 + 零 `@Valid`（约 10/14）

Npc/Boss/Buff/ArmorSet 收 `Map<String,Object>`，NpcRelation 收 `Object`（还兼容"数组或数组的 JSON 字符串"双格式），Projectile 直接绑 entity（`deleted`/`rawJson` 等内部字段可被客户端任意写入——mass assignment）。WorldContext/ConditionTerm 收发裸 entity。全组 `@Valid` 计数为 0，GlobalExceptionHandler 里的 `MethodArgumentNotValidException` 处理器实际永远不会被这组触发。出参侧是手工 `LinkedHashMap` 拼 40-50 个 ad-hoc 键（Npc `toPayload` 80 行）。只有 Biome（请求 DTO）、ItemGroup/ItemRarity（DTO）、TownNpcMaintenance（出参 DTO）例外。

### H4. 重复 CRUD 模板 + 私有工具函数的大规模复制粘贴

- `private String trimToNull(...)` 在 **15 个** admin controller 各有一份；`firstNonBlank` 8 份（且 Boss 版 trim、Buff/Projectile 版不 trim——**同名不同语义**）；`resolveDataFile` 7 份；`toLong` 7 份。
- AdminNpcController 与 AdminNpcRelationController 之间 ~500 行逐字重复（26 列 6-JOIN 的 `loadShopConditions` SQL 两份、loot/buff/shop 查询 SQL 六份）；AdminArmorSetController 与 AdminArmorAttributeController 之间 ~120 行逐字重复；WorldContext 与 ConditionTerm 是整文件级孪生（仅字段名不同）。
- 复制分叉指纹：Boss 的 `firstNonNull(Map, String key)` 是 Buff varargs 版的退化拷贝；Buff 的 wiki 时长格式化器新旧两代并存（一处中文字面量、一处 `专家` 转义）。

### H5. controller 里的文件系统数据管道与 singleton 可变缓存

Npc/Boss/Buff/ArmorSet/ItemGroup/TownNpcMaintenance 六个 controller 在请求路径上读 `data/generated/*.json`（靠 `System.getProperty("user.dir")` 相对路径探测，TownNpcMaintenance 还向上爬目录找 monorepo 根，要求 `back/`+`data-query-app/`+`scripts/` 三目录同在——部署布局硬耦合）。缓存策略不一致：Npc/ItemGroup 有 10 分钟 TTL 的 `volatile TimedValue`；ArmorSet 是**永不失效**的非线程安全实例字段；Boss/Buff/TownNpcMaintenance **每次请求（甚至列表每行）全文件反序列化**——TownNpcMaintenance 对同一 JSON 是 2N 次/请求。这也倒逼测试篡改全局 `user.dir`（4 个测试文件）。ItemGroup 更极端：JSON override 文件就是它的"数据库"，并发写无锁。

### H6. 静默失败与隐式契约

- ~40 处 `catch (Exception) → log.debug/ignored → 返回空` ：ArmorSet 的 projection 表探测失败会**静默回落 legacy 数据源**；TownNpcMaintenance 的报告 JSON 损坏与"无报告"不可区分；爬虫产物字段名一改，页面数据静默消失（与记忆中 cutover-state.json 静默跑 V1 同一类陷阱）。
- 跨库名 `terria_v1_relation` 在 AdminBuffController:51 与 AdminArmorSetController:54 硬编码，而 `RelationCompatibilityProperties.relationDatabase` 配置项就在旁边没人用；AdminArmorAttributeController 硬编码同一库名且**无回退**，新环境缺 schema 三端点全 500。
- 前端隐式契约：`ApiResponse` 的 `@JsonInclude(NON_NULL)` + `success(null)` = "success 无 data"（记忆中的 armor-sets quirk，出处实为 `PublicArmorSetController.java:61-63`，Admin 侧 delete 返回 `success(null,...)` 同样会丢 data 键）；Buff 的 `image`/`imagePath`/`imageOriginalUrl` 三键同值、`sourceItemsJson` 字符串+已解析数组双份返回；HTTP 状态码与 body 内 `statusCode` 双轨并存——且 `ApiResponse.success` 无自定义 statusCode 重载，**POST 返回 HTTP 201 时 body 里 statusCode 恒为 200**；`Pagination` 同值输出 `limit`+`size` 双字段；`common/PageQuery` 是与 `PaginationParams` 并存的第二套分页对象（且混入 Item 专属过滤字段，名为通用实为专用）。ItemRarity/RelationCompatibility 返回裸 `ApiResponse`（错误时 HTTP 恒 200、错误码只在 body），其余返回 `ResponseEntity` 双写——同一组内两种错误码投递方式并存。

### H7. 测试覆盖系统性偏科：只测 GET，写路径裸奔

13/14 有测试（**AdminItemRarityControllerTest 不存在**——最干净的 controller 反而没测试，rarity 链路仅有 service 层缓存驱逐测试间接触及）。形态混杂：9 个 MockMvc standalone + mock mapper/JdbcTemplate（stub 靠 `contains("SQL片段")`，SQL 措辞一改即碎）、ArmorSet 用 490 行自写 FakeJdbcTemplate、Biome 用反射调方法、ItemGroup 直接 new controller 取 `.getBody()` 不经 HTTP 层。**全组没有任何一个 POST/PUT/DELETE 端到端用例覆盖多表写**——`syncNpcRelations`、`syncBuffSourceItems`、`replaceNpcShopEntries`（最复杂的级联替换）、`syncArmorSetItems`、ArmorSet 的 POST/DELETE 全部零测试；ConditionTerm 测试 2 例 100% happy path。

### H8. 鉴权与全局设施（背景事实，非扣分项但影响改造设计）

- Admin 鉴权非 Spring Security、非注解式：`AdminAuthenticationInterceptor` 注册到 `/**`，靠硬编码 `path.startsWith` 白名单判定（`/admin/` 全覆盖，14 个 controller 一致受保护）；但这是**否定式清单**——未列出的路径默认匿名放行，新增受保护前缀需手改拦截器。`@SecurityRequirement(bearerAuth)` 只是 Swagger 文档注解，无运行时效力。
- `GlobalExceptionHandler` 8 个处理器返回结构与 `ApiResponse` 一致（好），但 `MethodArgumentNotValidException`/`BindException` 两个分支因全组无 `@Valid` 而基本闲置；ItemGroup/ItemRarity 的 try-catch `IllegalArgumentException` 与全局 400 分支完全冗余。
- `grep "extends"` 在 66 个 controller 中零命中——全项目无任何 controller 公共基类/泛型 CRUD 抽象。

### 横向统一优化方案

**第一步（止血，1-2 天）**：给所有多语句写路径补 `@Transactional`；delete 补关系表清理；Projectile 换 DTO 或至少屏蔽 `deleted`/`rawJson` 绑定；`terria_v1_relation` 改读 `RelationCompatibilityProperties`。

**第二步（抽公共骨架）**：本组 5 端点 CRUD 的骨架高度同构（resolvePage→resolveLimit→wrapper→selectPage→setPagination / 查重码→400→applyFields→insert→回查），适合抽泛型基类 + 公共工具：

```java
// common/AdminTextUtils.java —— 收编 15 份 trimToNull、8 份 firstNonBlank、7 份 toLong
public final class AdminTextUtils { ... }

// service/AdminCrudSupport.java —— 泛型 CRUD 模板（组合优于继承，避免 controller 基类绑死路由）
public abstract class AdminCrudService<E, ID, REQ, RES> {
    protected abstract BaseMapper<E> mapper();
    protected abstract void applyFields(E target, REQ req, boolean creating);
    protected abstract RES toDto(E entity);
    protected Optional<String> duplicateCheck(REQ req, ID excludeId) { return Optional.empty(); }

    @Transactional(rollbackFor = Exception.class)
    public RES create(REQ req) {
        duplicateCheck(req, null).ifPresent(msg -> { throw new IllegalArgumentException(msg); });
        E entity = newEntity();
        applyFields(entity, req, true);
        mapper().insert(entity);
        afterWrite(entity, req);           // 关系同步钩子，在同一事务内
        return toDto(reload(entity));
    }
    // update/delete/page 同理；page 内统一 PaginationParams + Pagination
}

// controller 退化为薄壳：
@RestController @RequestMapping("/admin/world-contexts")
class AdminWorldContextController {
    private final WorldContextAdminService service;   // extends AdminCrudService<...>
    @PostMapping ResponseEntity<ApiResponse<WorldContextDTO>> create(@Valid @RequestBody WorldContextUpsertDTO req) {
        return ResponseEntity.status(201).body(ApiResponse.success(service.create(req), "created"));
    }
}
```

错误路径统一改为抛 `IllegalArgumentException`/自定义 `NotFoundException` 交给 GlobalExceptionHandler（新增 404 处理器），消灭 controller 内手工 `ApiResponse.error` 与 try-catch。

**第三步（拆上帝 controller）**：Npc/Buff/ArmorSet 各拆出 `XxxAdminService`（CRUD+关系同步，事务在此）与 `XxxEnrichmentService`（文件补充数据、图片解析，统一用一个带 TTL 的 `GeneratedDataFileCache` 组件收编 6 套文件读取/缓存实现，路径来自 `@ConfigurationProperties` 而非 `user.dir` 探测）。`/admin/npcs` 双 controller 合并写路径：关系写全部收敛到 NpcRelation 的带事务实现，AdminNpcController 的 `syncNpcRelations` 删除。

**第四步（测试补位）**：为写路径补 Testcontainers/H2 级集成用例（优先 `replaceNpcShopEntries`、`syncBuffSourceItems`、ArmorSet POST/DELETE）；给 ItemRarity 补上缺失的测试文件；把 `contains("SQL片段")` stub 逐步替换为对行为（DB 终态/响应体）的断言。

---

## AdminItemRarityController（61 行）—— 均分 7.6

**接口设计 8/10**。`/admin/item-rarities` 标准 5 端点，DTO 进出，无分页（字典表可接受）。小瑕疵：返回**裸 `ApiResponse`**——404/400 时 HTTP 状态码恒为 200，错误码只在 body 的 `statusCode` 里，与组内其余 controller 的 `ResponseEntity` 双写风格不一致（前端 `item-rarities.vue` 只读 `success`+`data`，恰好自洽，但这是隐式契约）。优化：全组统一错误码投递方式（建议 ResponseEntity 或全局 handler 二选一）。

**结构 8/10**。全组唯一"controller 只做路由转发"的样本：DTO 进出、无手工 payload、无私有工具函数，最长方法 8 行。缺 `@Valid`（校验在 service 手写 `validate`，尚可）。三个写端点的 try-catch `IllegalArgumentException` 逐字重复且与 GlobalExceptionHandler 的 400 分支冗余。优化：删掉 try-catch 直接让异常上抛。

**架构 9/10**。组内孤例的教科书分层：`ItemRarityService` 接口 + `ItemRarityServiceImpl`（写方法全带 `@Transactional(rollbackFor=Exception.class)`、`@Caching(evict)` 精确清 5 个 item 缓存、`@TableLogic` 软删除、delete 前 `countItems` 引用保护"该品质仍被物品使用"、`ensureUniqueCode` 排除自身查重）。这就是其他 13 个该长成的样子。注意点：create 时 id 由客户端指定并查重（业务上是游戏内固定 id，可辩护）。

**耦合度 8/10**。service 跨领域注入 `ItemMapper` 做引用计数与删除保护，属合理；缓存驱逐清单把 rarity 与 Item 域 5 个缓存名以硬编码字符串耦合（改缓存名会静默失效），且 5 联 `@CacheEvict` 块在 create/update/delete 逐字重复三次。优化：缓存名抽公共常量；`@Caching` 块抽自定义组合注解。

**维护难度 5/10**。**AdminItemRarityControllerTest 不存在**——13/14 有测试，唯独最规范的这个裸奔；整条链路仅 `PublicItemCacheInvalidationTest`（service 层）间接触及缓存驱逐。404 分支、三个 try-catch 转换、路由均零覆盖。优化：补 MockMvc + mock service 的 controller 测试与 service 单测（重复码、引用保护、软删除过滤分支）。

## AdminRelationCompatibilityController（35 行）—— 均分 7.6

**接口设计 7/10**。`GET /admin/relation/compatibility` + `/health` 两个只读诊断端点（爬虫 V1→V2 投影表 cutover 的就绪度面板），专用 DTO 出参，报告缺失作为正常 DTO 状态返回而非错误（运维语义合理）。瑕疵：前缀 `/admin/relation` 单数、全项目独此一家；裸 `ApiResponse` 不套 ResponseEntity；grep 前端三个 app **零消费者**——纯运维/脚本端点却无文档标注。优化：归入 `/admin/relations/*` 或与 crawler-monitor 运维面板同前缀，标注消费方。

**结构 8/10**。两个方法各 1 行委托，零业务逻辑；唯一全套 Swagger 注解（`@Tag`/`@Operation`）的小 controller。

**架构 8/10**。接口 + `RelationCompatibilityServiceImpl`（406 行）；只读无事务问题；service 被 `RelationCompatibilityStartupVerifier`（ApplicationRunner）复用做启动就绪检查（`failOnStartupMismatch` 可阻断启动）——诊断能力同时服务运行时与启动期，设计不俗。瑕疵：impl 用裸 JdbcTemplate 对每个领域全表 `SELECT *` 载入内存做行差对比（数据量增长即内存热点）；领域配置硬编码 static `DOMAINS`。优化：对比改为 count+抽样或流式。

**耦合度 8/10**。**全项目唯一没把 `terria_v1_relation` 硬编码的地方**（走 `RelationCompatibilityProperties.relationDatabase`）；`looksLikeRepoRoot` 向上爬目录找报告与 TownNpcMaintenance 同款布局耦合（已隔离在 service，可容忍）。优化：Buff/ArmorSet 的跨库探测应复用此 service 的能力。

**维护难度 7/10**。controller 测试 120 行/2 用例 + service 测试 231 行/6+ 用例（package-private 构造器注入 `repoRootOverride` 做离线文件测试）——链路覆盖是全组最好的之一。优化：补投影表缺失/跨库不可达分支用例。

## AdminWorldContextController（183 行）—— 均分 5.6

**接口设计 7/10**。标准 5 端点 + `PaginationParams` 统一分页（page 从 1 起、limit/size 双别名、封顶 200）+ 领域守卫（`LOCAL_CONDITION belongs in condition_terms` 400）。POST 返回 HTTP 201 但 body `statusCode` 恒 200（ApiResponse 无 201 工厂）；PUT 实为 PATCH 语义（只覆盖非 null 字段）；排序固定不支持客户端指定；查重 `selectCount` 后 insert 是 TOCTOU。优化：DB 唯一约束兜底；PUT 语义在 API 文档明示。

**结构 5/10**。**裸 entity 进出**（`@RequestBody WorldContext`，列表/详情直接回 entity——`rawJson`/`deleted`/`createdAt` 全部随 JSON 暴露且客户端可写）；无 `@Valid`；`applyFields` 44 行手写 patch（`creating || xxx != null` 条件式逐字段拷贝，且条件顺序自身都不统一，加字段必漏）。优化：拆 UpsertDTO + ResponseDTO，或改用 MapStruct。

**架构 4/10**。无 service（Controller → 空壳 BaseMapper → Entity 三层直连）；"查重→写入→selectById 回读"多次 DB 操作**无事务**；业务规则（LOCAL_CONDITION 边界）以硬编码字符串写在 controller。优化：并入统一 CRUD service 骨架（见横向方案），它就是骨架的天然首批实例。

**耦合度 7/10**。controller 只依赖 `WorldContextMapper`，但该 mapper 被另外 4 个类共享（AdminRecipeConditionController/SupportDomainServiceImpl/WikiImageSyncServiceImpl/RecipeServiceImpl）——字典表被多领域直连而无 service 收口，schema 变更波及面隐蔽。优化：字典读取统一走 SupportDomainService。

**维护难度 5/10**。与 AdminConditionTermController **整文件孪生**（`applyFields`/`trimToNull` 私有副本逐字相同/查重/守卫结构平行，仅字段不同且归一化不对称：本类 code 只 trim 不大写、对方 code 大写——孪生还在分叉）。测试 168 行/4 用例 MockMvc + jsonPath，但 GET `/{id}` 与 DELETE 零覆盖、404×3 与 400 分支零覆盖。优化：收敛到泛型骨架后孪生与分叉一并消失。

## AdminBiomeController（415 行）—— 均分 5.6

**接口设计 7/10**。5 端点规范，`group` 过滤走白名单 switch（防任意值透传，组内少见的输入收窄）、`wikiGroupCode` 匹配自身或父组。POST 201。优化：delete 无级联提示（见架构）；查重 TOCTOU 同上。

**结构 6/10**。组内唯一请求 DTO 化的重型 controller（`AdminBiomeUpsertRequestDTO` + 嵌套 relation/resource DTO，详情回 `BiomeDTO`+5 关系 DTO），**但列表直接回裸 entity `List<Biome>`**——同一资源两种出参边界；无 `@Valid`（DTO 都有了就差注解）。优化：列表补 ListItemDTO；DTO 加 Bean Validation。

**架构 5/10**。无 service（`BiomeService` 存在但只服务前台）；9 个依赖（8 mapper + resolver）注入 controller；`toDetailDto` 127 行聚合（6 次 selectList + 3 次批量回查 + 5 段 stream 组装）是纯 service 逻辑；create/update 有 `@Transactional` 但 **delete 没有**（三条删除非原子），且 delete 只清 relations/resources、不清 `item_biomes`/`npc_biomes`/`item_acquisition_sources` 留孤儿。亮点：批量化认真（`selectBatchIds` + id 集收集），无 N+1。优化：`toDetailDto` + `replaceRelationsAndResources` 迁入 BiomeAdminService；delete 补事务+级联清理。

**耦合度 5/10**。跨领域 mapper（Item/Npc/ItemAcquisitionSource）用于详情富化尚合理，但爬虫来源约定硬编码进查询（`sourceRefType="biome_wikitext"`、`sourceProvider="terraria.wiki.gg" OR NULL`，:308-313）——数据管道契约泄漏进 controller；NPC 富化混用字符串列名 `QueryWrapper` 与 LambdaQueryWrapper 风格分叉。亮点：`missingItem`/`missingNpc` 显式暴露破损引用。优化：来源常量抽配置/常量类。

**维护难度 5/10**。测试 357 行/4 用例但形态最弱：无 MockMvc、直接 new controller，两个列表用例**用反射 `Method.invoke` 调用**且只 `verify(selectPage)` 不断言响应；写路径（含全删全插的 `replaceRelationsAndResources`）零覆盖。优化：改 MockMvc standalone；补 create/update/delete 用例断言关系表终态。

## AdminConditionTermController（173 行）—— 均分 5.4

**接口设计 7/10**。与 WorldContext 完全同构的规范 5 端点，code/termType 统一 trim+大写归一化（比 WorldContext 更严格——孪生间归一化不对称）。同样的 TOCTOU 查重、PUT-as-PATCH、固定排序。termType 是自由字符串大写化，无枚举白名单。优化：termType 白名单化。

**结构 5/10**。裸 entity 进出（`rawJson`/`deleted` 直出可写）、无 `@Valid`、35 行手写 `applyFields` patch——WorldContext 的所有问题原样复现。

**架构 4/10**。无 service、无事务、controller 直连空壳 mapper、业务校验在 controller。优化：同 WorldContext，泛型骨架首批迁移对象。

**耦合度 7/10**。controller 只依赖 `ConditionTermMapper`，但该 mapper 同样被 AdminRecipeConditionController/SupportDomainServiceImpl/RecipeServiceImpl 多领域直连；WorldContext controller 里硬编码的 "LOCAL_CONDITION belongs in condition_terms" 字符串把两表边界规则单向耦合过来。

**维护难度 4/10**。孪生复制的另一半；测试仅 101 行/**2 用例、100% happy path**（GET `/{id}`、PUT、DELETE 三端点零覆盖）——全组测试覆盖最薄。优化：合并到共享骨架后测试参数化复用。

## AdminArmorAttributeController（319 行）—— 均分 5.2

**接口设计 7/10**。只读三端点（`/summary` 聚合 + 分页列表 + `/{itemId}` 详情），自述 read-only 定位清晰。瑕疵：路径参数是 **item id 而非本资源主键**，变体行再用 `attributeRowId` 补选——资源标识两段式；分页约定与全组一致。

**结构 5/10**。无 DTO，手工 `LinkedHashMap` payload（`toAttributePayload`/`toEffectPayload`）；入参全是标量 `@RequestParam`，风险面小。规模健康、方法行数均匀。

**架构 4/10**。无 service、裸 JdbcTemplate；`summary()` 串行 8 条独立 COUNT/GROUP BY，列表 `effect_count` 逐行相关子查询 + `hasEffects` 再叠 EXISTS——数据量增长即热点。`groupedCounts(String columnName)` 把列名拼入 SQL（当前只传常量，但注入面留给了未来调用者）；`toLongObject` 对脏数据抛未捕获 NumberFormatException→500。优化：8 条 COUNT 合并为单条条件聚合 SQL；columnName 改枚举。

**耦合度 4/10**。**硬编码跨库 `` `terria_v1_relation`.projection_* ``（:37-38）且无存在性检测**——新环境缺 schema 三端点全 500（被全局 handler 包成"系统繁忙"）；与 AdminArmorSetController 同一对表却用两套定位策略（硬编码 vs 动态探测）。~120 行与 ArmorSet 逐字重复。优化：库名走 `RelationCompatibilityProperties`；projection 访问抽共享 repository。

**维护难度 6/10**。**测试是全组参照物**：MockMvc + 全 3 端点 + 404 分支 + jsonPath 深断言 + SQL 参数 verify（178 行/5 用例）。短板：mock 按调用顺序吐值，与查询顺序强耦合；与 ArmorSet 的重复代码仍是双份维护。

## AdminItemGroupController（767 行）—— 均分 5.0

**接口设计 7/10**。`/admin/item-groups/{canonicalName}` 以业务键为资源标识（合理，组由文件定义）；DTO 进出；POST 201、404/400 规范；DELETE 对非 override 组返回 400 "Only central item group overrides can be deleted"——语义准确。瑕疵：列表**完全无分页**（仅 keyword/domain 过滤全量返回，靠 10 分钟缓存兜性能）；错误 message 全英文与 ApiResponse 默认中文 message 并存。

**结构 6/10**。有 `ItemGroupDTO`/`ItemGroupMemberDTO` 但 DTO 无校验注解、无 `@Valid`（校验手写在 `normalizeGroup`，违规抛 IAE）；try-catch→400 样板三处逐字重复且与全局 handler 冗余；"写文件+失效两缓存"三连在三个写端点重复；`request==null?null:...` 三目样板 19 次。52 个私有成员/方法。优化：校验上 Bean Validation；写三连抽方法。

**架构 3/10**。**数据库是磁盘 JSON 文件**：写路径 = 读 `data/generated/item-group-overrides.json` → 内存改列表 → 整文件写回，**无文件锁、无原子写**——并发两个 PUT 丢更新；"覆盖文件写入 + invalidateItemGroupSnapshot + recipeTreeService.invalidateCaches" 三步无原子性，失效责任在 controller；`writeCentralOverrideGroups` 抛的 `IllegalStateException` 不被本地 catch，漏给全局 RuntimeException→500"系统繁忙"。同时直接注入 ItemMapper/ItemImageMapper 查库做成员富化（最长方法 `enrichGroupMembers` 82 行：三键收集→三次 selectList→批量图片→回填标记，批量化做得认真）。细节亮点：中央 override 用 `readRootStrict` 防止写操作覆盖损坏文件（普通读则静默空）。优化：文件存取抽 `ItemGroupOverrideRepository`（临时文件+rename 原子写、ReadWriteLock），或迁 DB 表。

**耦合度 4/10**。与 `RecipeTreeService` 缓存失效强耦合（改组必须记得清食谱树，靠 controller 自觉）；**三个类通过共享数据文件耦合**（RecipeTreeServiceImpl:591-593 与 AdminRecipeGroupController:162-163 读同一 JSON）；`isWikiImageProvider` 硬编码只认两个 provider 字符串；`usableImageUrl` 硬编码剔除 `(demo)`/`(placed)` URL 无注释。优化：override 文件读写与失效收敛到单一 service，两个 controller 共用。

**维护难度 5/10**。与 AdminRecipeGroupController 跨文件复制 `TimedValue`/缓存模式/`normalizeKey`/`trimToNull`/`resolveDataFile` 各一份。测试 404 行/9 用例但**不经 HTTP 层**（直接 new controller 取 `.getBody()`）+ 篡改 `user.dir`；**GET 详情与 DELETE 零测试、PUT 无 happy path**；测试文件内有中文乱码（"浠绘剰鏅跺"，编码事故遗留）。优化：改 MockMvc；补 DELETE/PUT 用例与并发写用例。

## AdminBossController（844 行）—— 均分 4.6

**接口设计 7/10**。标准 5 端点、POST 201、分页统一。quirk：`summonConditions`/`mechanicNotes`/`difficultyNotes` 恒空数组占位（测试还锁定了 empty）；`name` 字段实为 `firstNonBlank(nameZh,nameEn,code)` 的展示名计算——展示逻辑下沉到 API。优化：占位字段要么实现要么删掉，展示名交给前端。

**结构 4/10**。`Map<String,Object>` 进出、无 DTO/@Valid；`applyFields` 40 行 containsKey patch，`nameEn` 同时接受 `nameEn`/`name` 双 key；手工三层 payload（base/summary/detail）。

**架构 4/10**。`@Transactional` 在 create/update/delete 上（组内做对的少数）但无 service；两段手写 SQL + `loadNpcSupplementMap` **每请求全量读盘解析** `npc-standardized-map.json`（无缓存，Npc controller 对同一文件有 10 分钟缓存——同文件两种策略）；**列表 N+1**：每行触发 `loadMembers`+`loadReferenceMembers`+`loadLootEntries`，20 条/页 ≈ 40-100 次查询；`syncMembers`/`clearGroupAssignments` 对 Npc 逐条 `updateById`（N+1 写）。优化：列表批量预取（Npc controller 的 `toListPayloads` 已示范）；补充文件走共享缓存组件。

**耦合度 4/10**。Boss 领域直接改写 Npc 实体（`npc.setIsBoss(true)`、清成员时把 `bossRole` 一并置 null——可能抹掉人工标注）；`REFERENCE_BOSS_GROUP_CODES = {MECHDUSA: [...]}` 领域常量硬编码在 controller；依赖 NpcMapper 属数据模型决定（成员关系在 `npcs.boss_group_id` 列上）尚可辩护。优化：成员关系操作抽 service 并批量 UPDATE。

**维护难度 4/10**。`firstNonNull(Map,String)` 名实不符（Buff varargs 版的退化拷贝）；`resolveDataFile`/`toInteger` 等与 Buff 微分叉的复制。测试 469 行/8 用例但**只覆盖 GET**，`when(...).thenReturn(a,b,c,…8 个连续值)` 把 stub 顺序耦合到内部调用次序，且篡改 `user.dir` 喂文件。优化：写路径（syncMembers 的角色保留语义）补测试。

## AdminProjectileController（487 行）—— 均分 4.6

**接口设计 7/10**。5 端点规范；唯一对被抑制图片打结构化 `log.warn` 的（可观测性亮点）。quirk：`nameEn`=`name` 冗余别名、富化命中后同一 URL 写进 3 个 key。

**结构 4/10**。**`@RequestBody Projectile` 直接绑 entity**——组内输入面最宽：`deleted`/`rawJson`/`sourceItemsJson` 客户端可任意写（create 只重置 id，`deleted` 未重置）；update 是 18 个 `if(x!=null) set` 手工拷贝（加字段必漏）；出参手工 Map，`rawJson` 原文直出。优化：最优先换 UpsertDTO。

**架构 4/10**。无 service；`enrichSourceNpcImages` 76 行三键联合索引回填（批量化做得不错）；但 `resolveProjectileNameZh` 解析 `{$ProjectileName.X}` 占位符时**递归逐条 selectOne**，列表每行都可能触发（带环检测不带 N+1 防护）。单表写事务风险小。优化：占位符解析批量化或预计算落库。

**耦合度 4/10**。为爬虫产物 `sourceNpcsJson` 补图而依赖 NpcMapper（展示富化反向跨域）；`hasManagedSourceImage` 要检查 **11 个**可能的图片 key 名——上游 JSON 字段名从未统一的直接证据，controller 在为数据管道的混乱买单。优化：字段名归一化放进爬虫/导入侧。

**维护难度 4/10**。测试 276 行/9 用例 MockMvc + jsonPath，仅 GET；`trimToNull`/`firstNonBlank` 又是私有拷贝。优化：mass assignment 修复后补"内部字段不可写"回归用例。

## AdminNpcRelationController（662 行）—— 均分 4.4

**接口设计 7/10**。子资源风格规范（`/admin/npcs/{id}/loot|buff-relations|shop-entries` GET/PUT），PUT=整体替换是真 PUT 语义（组内少见做对的）。quirk：请求体类型 `Object` 且兼容"JSON 数组或数组的 JSON 字符串"双格式（隐式契约）；非法行**静默丢弃**（缺 itemId/buffId 直接 continue，提交 10 行坏 8 行也返回 success 无任何提示——对照 AdminNpcController 的 shopMutationSummary 有汇报）。优化：返回 skipped 计数或 400。

**结构 4/10**。`Object` 进 `Map` 出，无 DTO/@Valid；读取用 JdbcTemplate 裸 SQL、写入用 MP mapper——同类内读写通道分裂；`replaceNpcLoot` 单方法内 JdbcTemplate 删 + mapper 插混用。

**架构 5/10**。**3 个 PUT 全带 `@Transactional`——NPC 家族唯一有事务保护的写路径**（但注在 controller 上，因为没有 service）。`DELETE_MANAGED_NPC_LOOT_SQL` 的 kind 过滤删除设计保护爬虫来源行不被后台误删且有测试锁定（亮点）。`replaceNpcShopEntries` 54 行级联替换依赖 MP 回填 id。优化：整体迁 NpcRelationAdminService，controller 只留转发。

**耦合度 3/10**。与 AdminNpcController **共享 `/admin/npcs` 路由前缀 + 共管同 4 张关系表但行为不一致**：buff 关系 SQL 少查 `b.buff_type` 列（两个读端点对同一数据返回列集不同）、shop 替换无 mutation summary（对方有）——同一资源双写路径且语义分叉，是本组最危险的耦合形态。~500 行与对方逐字重复（26 列 6-JOIN 的 shopConditions SQL 两份）。优化：写路径唯一化（收敛到本 controller 的带事务实现），读端点列集对齐。

**维护难度 3/10**。测试 306 行/6 用例：**最复杂的 PUT shop-entries（级联替换）零测试**，PUT buff-relations、derived-loot、全部 404 分支也没测；`contains(SQL片段)` stub。log 前缀从 "admin npc" 改成 "admin npc relation" 是复制指纹。优化：优先为两个未测 PUT 补事务终态断言。

## AdminTownNpcMaintenanceController（745 行）—— 均分 4.2

**接口设计 6/10**。745 行**只有 1 个 GET** `/admin/town-npcs/maintenance`；纯只读聚合、职责克制（未混入任务触发/数据修复——那些在脚本侧），报告缺失优雅降级空结构。瑕疵：永远 200，报告损坏与无报告不可区分；全量无分页。优化：payload 里加 `reportStatus: ok|missing|corrupt` 三态。

**结构 5/10**。**组内唯一 typed DTO 出参**（TownNpcOverviewDTO/TownNpcRowDTO/NpcStatBlockDTO，映射抽到独立静态类）——但内部流水线仍是 Map（`enrichTownNpcRow` 原地塞 20+ 键，无抓取时手填 17 个空占位键），最后才 Map→DTO 双重表示；`TownNpcMaintenanceDomainMapper.toOverview` 是 **15 个位置参数**的静态工厂，加错顺序编译期无感。优化：位置参数改 builder；Map 流水线直接产 DTO。

**架构 3/10**。无 service；一个响应聚合 5 类异构源（DB 3 组查询 + 爬虫报告 JSON + 导入报告 JSON + 标准化 JSON + 文件系统 mtime 元数据）。**性能硬伤**：主循环内 `loadNpcImageUrl` 与 `loadNpcBaseStats` 各自完整反序列化 `npc-standardized-map.json`——N 个城镇 NPC = 2N 次全文件解析（同文件在 AdminNpcController 有缓存，这里没有）；`loadCurrentShopItems` 逐行查询 N+1；`loadItemLookup` 全 items 表载入内存。优化：文件解析提到循环外一次；shop items 单条 IN 查询。

**耦合度 3/10**。与爬虫的耦合是**文件路径+JSON 结构双重隐式契约**（生产者 `fetch-wiki-town-npc-maintenance.mjs` → `run-town-npc-sync-pipeline.mjs` → 落盘 → 本端点消费；无 schema 校验，字段改名静默变空）；`resolveRepoRoot` 从 CWD 向上爬目录、靠 `back/`+`data-query-app/`+`scripts/` 三目录同在识别 monorepo 根——**后端与仓库目录布局硬耦合**，独立部署即静默找不到报告；8 处 `catch(ignored)` 吞错。断点续传状态不经过此端点（好事）。优化：报告目录改 `@ConfigurationProperties` 注入；报告加 schemaVersion 字段并校验。

**维护难度 4/10**。死代码 `formatGamePeriodLabel`（被 SupportDomainService 取代后的残留，零调用）；`resolveDataFile` 与 AdminNpcController 逐字重复。测试 278 行/8 用例 MockMvc，但 **mock 了 ObjectMapper 本身**（按文件名 switch 吐预置 Map，绕过真实 JSON 解析）+ TempDir 假 monorepo + 篡改 `user.dir`——测试形态被 controller 的文件设计倒逼变形；快照回退、损坏 JSON、匹配命中路径未覆盖。优化：文件读取抽接口后测试可注入真解析。

## AdminNpcController（1755 行）—— 均分 3.4

**接口设计 6/10**。路径/分页/错误码约定合规，但 **PUT 实为 PATCH 语义**（containsKey 逐字段判断，无 PATCH 端点）；PUT/POST 还承载关系整体替换副作用（body 带 `lootEntries`/`buffRelations`/`shopEntries` 即触发三表重建）——**与 AdminNpcRelationController 的专用子资源 PUT 形成同一数据的双写路径**；`relationSummary`/`shopMutationSummary` 六计数器 `putAll` 混入实体 payload。优化：关系写从 create/update 中剥离，统一走子资源端点。

**结构 3/10**。`Map<String,Object>` 进出、零 DTO/@Valid；`toPayload` 80 行拼 ~50 个 ad-hoc 键（含 `sourceId`/`gameId` 双名冗余）；12 个类型转换私有 helper；`toPayload` 与 `toListPayload` ~50 行逐行重复。优化：NpcAdminDTO + MapStruct，列表/详情共用投影。

**架构 2/10**。1755 行上帝 controller：≥13 段 text-block SQL 涉 12 张表、`"FROM "+tableName` 拼接反模式、5 个磁盘 JSON 源 + 两个 `volatile TimedValue` 缓存、图片策略、掉落继承推导（prototype/same_name 双模式）全在 controller。**最严重：`syncNpcRelations` 跨 3-4 表 DELETE+循环 INSERT（含 `SELECT LAST_INSERT_ID()`）全程无事务**——中途失败留半删半插；同表另一入口（RelationController）却有事务。`deleteNpc` 只删主表留全部关系孤儿；查重 TOCTOU。亮点：`toListPayloads` 的批量预取认真避免了列表 N+1。优化：见横向第三步，本文件是最大受益者。

**耦合度 3/10**。读 items/buffs/biomes/world_contexts/condition_terms/game_period 六域表；中文搜索靠**内存全扫爬虫产物文件快照**再回填 SQL IN；与 RelationController 共享路由+表但列集/汇报行为不一致。优化：中文名索引落库（`name_zh` 列已存在，补齐数据即可去掉文件扫描）。

**维护难度 3/10**。~500 行与 RelationController 逐字重复；未使用参数/import 残留。测试 1375 行/21 用例有 jsonPath 断言（好），但 `contains("SQL片段")` stub + `ReflectionTestUtils` 调私有方法 + 反射构造私有 record + 篡改 `user.dir`——对实现细节四重耦合；**POST/DELETE/404/400 全未覆盖**。优化：拆 service 后测试自然下沉，controller 测试瘦身为路由+序列化验证。

## AdminBuffController（1472 行）—— 均分 3.4

**接口设计 6/10**。5 端点合规。quirk 最多：`image`/`imagePath`/`imageOriginalUrl` 三键输出同一 fallback 值（`resolveBuffFallbackImageUrl` 与 `resolveBuffCachedImageUrl` 是同一函数的两个名字，测试还锁定了这一怪癖）；`categoryId` 恒 null 占位；`sourceItemsJson` 字符串+已解析数组双份返回。优化：响应字段瘦身需与前端协同（有测试锁定，属契约变更）。

**结构 3/10**。Map 进出、无 DTO/@Valid；1472 行的成因是 controller 内装了四台"发动机"：免疫 NPC 三级匹配引擎（~370 行，`loadImmuneNpcSamples` 140 行为全组最长方法）、**新旧两代 wiki 时长格式化器并存**（~170 行+10 个 Pattern，一处"专家/大师"字面量一处 `专家` 转义——不同时期生成的指纹）、linked source items 同步解析（~200 行，含三段仅 WHERE 不同的复制 SQL，第三段疑似 bug：用 sourceItemId 查 `i.id` 而非 source_id）、文件补充源（~90 行）。优化：四台引擎各自成 service/component，旧版格式化器下线。

**架构 2/10**。**`syncBuffSourceItems` DELETE+循环 INSERT 无事务**（Boss/Biome 都带，唯独它没有）；**`deleteBuff` 不清 `buff_source_items` 留孤儿**（组内唯一 delete 完全不管关系表的重型 controller）；`toPayload` 在**列表每行**读盘解析 `buff-standardized-map.json` + 条件性 DB 回查（count≤0 即触发）——20 行/页=20 次全文件反序列化。亮点：免疫 NPC 歧义处理是决定性的（排序选代表元 + `resolutionStatus` 回传，数据质量问题暴露而非掩盖）；SQL 全参数化。优化：事务+级联删除止血；补充文件走共享缓存。

**耦合度 3/10**。JdbcTemplate 裸查 npcs/items/npc_buff_relations 比注入 mapper 更隐蔽；**跨库 `terria_v1_relation` 硬编码 controller 常量**（`RelationCompatibilityProperties` 就在旁边没用）。优化：跨库访问统一走配置化 repository。

**维护难度 3/10**。与 Boss 的 `resolveDataFile`/`loadNpcSupplementMap`/`buildPlaceholders` 微分叉复制（大括号风格、全限定名等复制指纹）；测试 786 行/17 用例断言最细（模板清洗断言到 `not(containsString("{{"))`）但**只覆盖 GET**——syncBuffSourceItems、deleteBuff 孤儿问题均无测试暴露；测试里还有 TDD red 阶段注释残留。优化：写路径测试优先，孤儿清理修复时补回归。

## AdminArmorSetController（2214 行）—— 均分 3.0

**接口设计 6/10**。5 端点表面合规（POST 201、404 规范——记忆中"success 无 data"quirk 出处实为 `PublicArmorSetController:61-63` + `@JsonInclude(NON_NULL)`，Admin 侧反而正确 404）。但**每次列表/详情请求都查 `information_schema` + `COUNT(*)` 做三级数据源路由**（本库 projection → 跨库 projection → legacy），探测异常被 `log.debug` 吞掉——环境配置错误表现为"静默回落 legacy"（与爬虫 V1/V2 静默回退同类陷阱）；另有一个非映射 public 重载纯为测试保留。优化：数据源路由启动时探测一次 + actuator 暴露当前路由；废弃重载删除。

**结构 2/10**。**零 DTO、零 entity、零 @Valid**——`ArmorSet` entity 和 `ArmorSetMapper` 存在但本 controller 完全不用（mapper 唯一消费者是统计 service）；Map 进出 + camelCase/snake_case 双别名兼容遍布；update 不校验任何字段、63 行 UPDATE 嵌 12 个 containsKey 三元表达式；107 个私有方法。优化：这是全组最需要 DTO 化的文件。

**架构 2/10**。2214 行 ≈ 300 行 CRUD 模板 + ~600 行 payload 归一化（`normalizeArmorSetRow` 132 行为最长）+ ~450 行文件数据管道（含**手写 Lua 注释解析器** `parseArmorBenefitStatements` + 正则汉化器 + 硬编码中文映射表——离线管道逻辑跑在 HTTP 请求路径上）+ ~250 行工具复制 + ~150 行数据源路由。**无任何 @Transactional**：create（GeneratedKeyHolder 原生 PreparedStatement + `syncArmorSetItems` DELETE+循环 INSERT 且每 itemId 单独 SELECT——N+1）、delete（两条独立 DELETE）均非原子。**singleton 上两个非线程安全、永不失效的实例字段缓存**——数据文件更新须重启。优化：Lua/wiki 解析迁到离线 enrichment 脚本落库；CRUD 抽 service+事务；缓存换共享 TTL 组件。

**耦合度 3/10**。直查 8 张表（4 张跨库）；运行时依赖 `user.dir` 下 4 个数据文件；跨库名硬编码。不依赖其他 service/mapper（孤岛式自包含，但以复制为代价）。优化：projection 访问与 ArmorAttribute 共享 repository。

**维护难度 2/10**。与 ArmorAttribute ~120 行逐字重复；`trimToNull` 等 10 文件级复制的重灾区。测试 1152 行/21 用例：自写 490 行 FakeJdbcTemplate 按 SQL 内容路由（对 SQL 文本强耦合）+ 篡改 `user.dir`；路由场景覆盖细致（含"projection 有行但当前页空不回退"边界）但 **POST/DELETE 完全未测**。优化：拆层后 FakeJdbcTemplate 可退役，service 层用真 DB 集成测试替代。
