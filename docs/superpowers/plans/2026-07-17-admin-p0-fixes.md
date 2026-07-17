# P0 安全与 Bug 修复批 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 2026-07-17 后台+后端评分审查（docs/audits/2026-07-17-admin-backend-audit/）中的 P0 级 bug 与安全问题，每项独立提交、独立验证。

**Architecture:** 只做最小边界修复，不做架构重写。拦截器改注解式鉴权、AdminCrudService、DTO 全面化均**不在本轮**（列为后续独立计划）。每个任务改动面已核实到具体文件/行。

**Tech Stack:** Spring Boot (back/), Nuxt 4 + pinia 2.3.1 + pnpm (data-query-app/), MyBatis-Plus, node:test

**分支:** 基于当前 `review/front-pages-audit-r2` 所在树继续（工作区已被另一会话合并 main，评审即针对此状态）。执行前先确认 `git branch --show-current`，如需要开新分支 `fix/admin-p0-batch`。

**边界决策记录（review 结论，执行者不得越过）:**
1. 主监控页 `startBaseDomainSampleCrawl`/`cleanupBaseDomainSampleCrawl`（crawler-monitor.vue L2910-2943）**保留不动**——评审核实这两个函数当前在全仓无任何调用点（死代码），本轮不动死代码零风险；清理归入 P1 死代码清扫批，不在本计划。
2. Npc/Buff delete **不做**关系表级联清理——Buff/Projectile 是 `@TableLogic` 逻辑删除，物理清理关系行会破坏可恢复性；此项转后续设计讨论。
3. pinia **不升 3.x**——升级链牵连 @pinia/nuxt、persistedstate 4.x（选项 paths→pick）回归面大；本轮用 pnpm patch 打补丁，`pinia.mjs`/`pinia.cjs`/`pinia.prod.cjs` 三个产物**必须都改**（Nuxt 模块层 require 加载 cjs、生产构建加载 prod.cjs）。
4. secret 相同 → 启动 fail-fast（明确错误配置）；secret 过短 → 仅 WARN 日志（避免打破长度未知的现有部署，本地 dev secret 只有 24 字符）。
5. crawler-monitor-test 页只守卫 **test-state 写路径**（savePayload/resetState）与纯模拟 UI；`loadState()` 不得加守卫——它同时驱动真实 overview 与 domain-smoke 数据链路，是生产运维功能的数据入口。后端 @Profile 隔离转后续。
6. Projectile 只堵 create 路径 `deleted` 注入（update 白名单 L127-148 已核实不含 deleted，无注入面）。

---

### Task 1: pinia patch 修复全站 404→500 + 补 error.vue

**Files:**
- Create: `data-query-app/patches/pinia@2.3.1.patch`（由 pnpm patch 生成）
- Modify: `data-query-app/package.json`（pnpm.patchedDependencies，由 pnpm 自动写入）
- Create: `data-query-app/error.vue`

**根因:** `pinia/dist/pinia.mjs:1212` `shouldHydrate` 直接调 `obj.hasOwnProperty(...)`；404 错误页的 route query 对象来自 ufo `parseQuery` 的 `Object.create(null)`（无原型）→ TypeError → 错误页渲染失败变 500。L1171/L1177 同款写法一并修。

- [ ] **Step 1: 复现 bug（修复前基线）**

注意: 无认证 cookie 的请求会被 `middleware/auth.global.ts` 302 到 /login，测不到错误页。必须带认证 cookie:

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:18191/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).data.token")
EXP=$(node -e "console.log(Date.now()+8*3600*1000)")
curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:13004/no-such-page" \
  -H "Cookie: tp_admin_token=$TOKEN; tp_admin_expires_at=$EXP; tp_admin_user=%7B%22username%22%3A%22admin%22%7D"
```

Expected: `500`（当前任意无匹配路由都 500）

- [ ] **Step 2: 生成 pinia patch**

```bash
cd /home/lolben/TerraPedia/data-query-app
pnpm patch pinia@2.3.1
# 输出一个临时目录路径，如 /tmp/xxx/user/pinia@2.3.1
```

**三个构建产物必须都改**（review 实测均含同款代码，且分别被 dev require / 生产 import 加载）:
- `dist/pinia.mjs` L1171 / L1177 / L1212
- `dist/pinia.cjs` L1173 / L1179 / L1214
- `dist/pinia.prod.cjs` L192 / L198 / L231

三处替换模式相同:

```js
// 原: if (!patchToApply.hasOwnProperty(key))
if (!Object.prototype.hasOwnProperty.call(patchToApply, key))
// 原: target.hasOwnProperty(key) &&
Object.prototype.hasOwnProperty.call(target, key) &&
// 原: return !isPlainObject(obj) || !obj.hasOwnProperty(skipHydrateSymbol);
return !isPlainObject(obj) || !Object.prototype.hasOwnProperty.call(obj, skipHydrateSymbol);
```

```bash
pnpm patch-commit <临时目录路径>
```

- [ ] **Step 3: 创建 error.vue**

Create `data-query-app/error.vue`:

```vue
<template>
  <div class="error-page">
    <section class="error-card">
      <p class="error-card__code">{{ error?.statusCode ?? 500 }}</p>
      <h1 class="error-card__title">{{ isNotFound ? '页面不存在' : '页面出错了' }}</h1>
      <p class="error-card__message">
        {{ isNotFound ? '你访问的路径没有匹配的后台页面。' : (error?.statusMessage || '发生未预期的错误，请重试或返回首页。') }}
      </p>
      <button type="button" class="error-card__action" @click="handleClear">返回仪表盘</button>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const isNotFound = computed(() => props.error?.statusCode === 404)
const handleClear = () => clearError({ redirect: '/' })
</script>

<style scoped>
.error-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-1, #f7f6f3);
}
.error-card {
  text-align: center;
  padding: 3rem 3.5rem;
  border-radius: 16px;
  background: var(--color-surface-2, #fff);
  box-shadow: 0 8px 30px rgb(0 0 0 / 8%);
}
.error-card__code {
  font-size: 3rem;
  font-weight: 700;
  color: var(--color-primary, #0f766e);
  margin: 0;
}
.error-card__title { margin: 0.5rem 0 0.25rem; }
.error-card__message { color: var(--color-text-muted, #6b7280); margin: 0 0 1.5rem; }
.error-card__action {
  padding: 0.6rem 1.4rem;
  border: none;
  border-radius: 999px;
  background: var(--color-primary, #0f766e);
  color: #fff;
  cursor: pointer;
}
</style>
```

注意: error.vue 位于 app 根（`srcDir: '.'`，与 nuxt.config.ts 同级）。

- [ ] **Step 4: 重装依赖并重启 dev server 验证**

```bash
cd /home/lolben/TerraPedia/data-query-app && pnpm install
# 重启 13004 dev server（找到 PID 后 kill，start-local-stack 或手动 pnpm dev 重启）
```

用 Step 1 的带 cookie curl 复测:
- `http://127.0.0.1:13004/no-such-page` → Expected: `404`（不再是 500，渲染 error.vue）
- `http://127.0.0.1:13004/recipes/groups` → Expected: `301`（routeRule 生效）

- [ ] **Step 5: typecheck + 提交**

```bash
cd /home/lolben/TerraPedia/data-query-app && pnpm run check
git add data-query-app/patches data-query-app/package.json data-query-app/pnpm-lock.yaml data-query-app/error.vue
git commit -m "fix(admin): patch pinia null-proto hasOwnProperty crash and add root error page"
```

---

### Task 2: 后端写路径补 @Transactional（Npc/Buff/ArmorSet）

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminNpcController.java`（createNpc L133、updateNpc L157）
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminBuffController.java`（createBuff L115、updateBuff L139）
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminArmorSetController.java`（createArmorSet L296、updateArmorSet L335、deleteArmorSet L399）
- Test: 现有 `back/src/test/java/com/terraria/skills/controller/AdminNpcControllerTest.java` 等回归

**背景:** createNpc 走 `npcMapper.insert` + `syncNpcRelations`（内部对 npc_loot_entries/npc_buff_relations/npc_shop_entries 各做 DELETE+循环 INSERT），中途失败留半写状态。Buff 同型（syncBuffSourceItems）。ArmorSet delete 是两条裸 DELETE。jdbcTemplate 与 mapper 共用同一 DataSource，方法级 `@Transactional` 可覆盖两者。

- [ ] **Step 1: 三个文件加 import**

```java
import org.springframework.transaction.annotation.Transactional;
```

- [ ] **Step 2: 七个方法加注解**

在下列方法的 `@PostMapping`/`@PutMapping`/`@DeleteMapping` 注解下一行加 `@Transactional`:

```java
// AdminNpcController
@PostMapping
@Transactional
@Operation(summary = "Create NPC")
public ResponseEntity<ApiResponse<Map<String, Object>>> createNpc(...)

@PutMapping("/{id}")
@Transactional
@Operation(summary = "Update NPC")
public ResponseEntity<ApiResponse<Map<String, Object>>> updateNpc(...)

// AdminBuffController: createBuff、updateBuff 同样处理
// AdminArmorSetController: createArmorSet、updateArmorSet、deleteArmorSet 同样处理
```

注意: **不改** deleteNpc/deleteBuff（单条语句无需事务；关系表级联清理属边界决策 #2 不做）。

- [ ] **Step 3: 编译 + 回归测试**

```bash
cd /home/lolben/TerraPedia/back
mvn -Dtest=AdminNpcControllerTest,AdminBuffControllerTest,AdminArmorSetControllerTest,AdminNpcRelationControllerTest test
```
Expected: BUILD SUCCESS，全部通过

- [ ] **Step 4: 提交**

```bash
git add back/src/main/java/com/terraria/skills/controller/AdminNpcController.java back/src/main/java/com/terraria/skills/controller/AdminBuffController.java back/src/main/java/com/terraria/skills/controller/AdminArmorSetController.java
git commit -m "fix(back): wrap multi-table admin write paths in transactions"
```

---

### Task 3: Projectile create 阻断 deleted 注入

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminProjectileController.java`（createProjectile L95-110）
- Test: `back/src/test/java/com/terraria/skills/controller/AdminProjectileControllerTest.java`

**背景:** `createProjectile` 直接 `projectileMapper.insert(request)`，客户端可在 body 里带 `"deleted": 1` 创建出带删除标记的幽灵行（`@TableLogic` 字段）。update 路径逐字段白名单拷贝，无此问题（边界决策 #6）。

- [ ] **Step 1: 写失败测试**

在 `AdminProjectileControllerTest.java` 中新增（该文件是 `@ExtendWith(MockitoExtension.class)` + `standaloneSetup` + MockMvc；注意严格桩模式，不要多余 stub）:

```java
@Test
void createProjectileIgnoresClientSuppliedDeletedFlag() throws Exception {
    mockMvc.perform(post("/admin/projectiles")
            .contentType("application/json")
            .content("{\"sourceId\":9999,\"internalName\":\"GhostRow\",\"deleted\":1}"))
        .andExpect(status().isCreated());

    ArgumentCaptor<Projectile> captor = ArgumentCaptor.forClass(Projectile.class);
    verify(projectileMapper).insert(captor.capture());
    assertNull(captor.getValue().getDeleted());
}
```

需补 import: `org.mockito.ArgumentCaptor`、`static org.mockito.Mockito.verify`、`static org.junit.jupiter.api.Assertions.assertNull`、`static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post`（对齐文件现有 import 风格）。
机制说明（review 已核实）: mock 的 `selectCount` 默认返回 null 通过重复检查；insert 后 `request.getId()` 仍为 null → `selectById(null)` 默认 null → 仍返回 201，断言链成立。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd back && mvn -Dtest=AdminProjectileControllerTest test`
Expected: 新用例 FAIL（修复前 `deleted:1` 会被 Jackson 绑定进实体）

- [ ] **Step 3: 修复实现**

`createProjectile` 中 `request.setId(null);`（L104）之后**只插入一行**（下一行已有的 `if (request.getStatus() == null) request.setStatus(1);` 保持原样，不要重复添加）:

```java
request.setDeleted(null);
```

- [ ] **Step 4: 跑测试确认通过并提交**

```bash
cd back && mvn -Dtest=AdminProjectileControllerTest test
git add back/src/main/java/com/terraria/skills/controller/AdminProjectileController.java back/src/test/java/com/terraria/skills/controller/AdminProjectileControllerTest.java
git commit -m "fix(back): prevent client-supplied deleted flag on projectile create"
```

---

### Task 4: 凭证与 JWT 加固

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/controller/AuthController.java`（L55-56 密码比对）
- Create: `back/src/main/java/com/terraria/skills/auth/AuthSecretsGuard.java`
- Test: 手动启动验证 + 现有 AuthController 相关测试回归

- [ ] **Step 1: AuthController 密码比对改恒时**

L55-56 原:

```java
if (!adminAuthProperties.getUsername().equals(username)
    || !adminAuthProperties.getPassword().equals(request.getPassword())) {
```

改为（加 import `java.nio.charset.StandardCharsets` 与 `java.security.MessageDigest`；两个比较都先求值再合并，避免短路 `||` 留下 username 时延侧信道）:

```java
boolean usernameMatches = constantTimeEquals(adminAuthProperties.getUsername(), username);
boolean passwordMatches = constantTimeEquals(adminAuthProperties.getPassword(), request.getPassword());
if (!usernameMatches || !passwordMatches) {
```

类底部加私有方法:

```java
private boolean constantTimeEquals(String expected, String provided) {
    if (expected == null || provided == null) {
        return false;
    }
    return MessageDigest.isEqual(
        expected.getBytes(StandardCharsets.UTF_8),
        provided.getBytes(StandardCharsets.UTF_8)
    );
}
```

- [ ] **Step 2: 新建 AuthSecretsGuard**

Create `back/src/main/java/com/terraria/skills/auth/AuthSecretsGuard.java`:

```java
package com.terraria.skills.auth;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Startup guard for auth secret hygiene.
 * - Admin and user token secrets sharing the same value collapses the two token
 *   domains into one (role claim does not participate in authorization), so the
 *   application refuses to start in that configuration.
 * - Short secrets only log a warning to avoid breaking existing deployments.
 */
@Component
public class AuthSecretsGuard {

    private static final Logger log = LoggerFactory.getLogger(AuthSecretsGuard.class);
    private static final int RECOMMENDED_MIN_SECRET_LENGTH = 32;

    private final AdminAuthProperties adminAuthProperties;
    private final UserAuthProperties userAuthProperties;

    public AuthSecretsGuard(AdminAuthProperties adminAuthProperties, UserAuthProperties userAuthProperties) {
        this.adminAuthProperties = adminAuthProperties;
        this.userAuthProperties = userAuthProperties;
    }

    @PostConstruct
    void validate() {
        String adminSecret = adminAuthProperties.getTokenSecret();
        String userSecret = userAuthProperties.getTokenSecret();

        if (adminSecret != null && adminSecret.equals(userSecret)) {
            throw new IllegalStateException(
                "terraria.auth.admin.token-secret and terraria.auth.user.token-secret must differ: "
                    + "identical secrets collapse the admin/user token domains");
        }
        warnIfShort("terraria.auth.admin.token-secret", adminSecret);
        warnIfShort("terraria.auth.user.token-secret", userSecret);
    }

    private void warnIfShort(String propertyName, String secret) {
        if (secret != null && secret.length() < RECOMMENDED_MIN_SECRET_LENGTH) {
            log.warn("{} is shorter than {} characters; consider rotating to a longer secret",
                propertyName, RECOMMENDED_MIN_SECRET_LENGTH);
        }
    }
}
```

注意: bean 注册已核实成立——`WebConfig.java` L23-36 的 `@EnableConfigurationProperties` 已注册 `AdminAuthProperties`/`UserAuthProperties`，两者均 `@Data`（`getTokenSecret()` 存在），`com.terraria.skills.auth` 包在组件扫描范围内，构造注入 + @PostConstruct 时机可靠。空 secret 场景到不了 guard（AdminAuthProperties 自身 validate 已 fail-fast）。

- [ ] **Step 3: 编译 + 启动冒烟 + 回归**

```bash
cd back && mvn -DskipTests compile
mvn -Dtest=AuthControllerTest test
```
本地栈重启后端确认正常启动（本地 admin secret 24 字符 / user 23 字符且不同：应通过并打两条 WARN）。

- [ ] **Step 4: 提交**

```bash
git add back/src/main/java/com/terraria/skills/controller/AuthController.java back/src/main/java/com/terraria/skills/auth/AuthSecretsGuard.java
git commit -m "fix(back): constant-time admin login compare and auth secret startup guard"
```

---

### Task 5: town-npcs 金币 chip 修复（后端 SQL + 前端 fallback）

**Files:**
- Modify: `back/src/main/resources/mapper/ItemMapper.xml`（selectItemSuggestions L708-718）
- Modify: `data-query-app/composables/useTownNpcMaintenance.ts`（buildPriceVisual L200）

**根因（已实测）:** `/items/suggestions` 的 SQL 未选 `buy`/`sell` 列（DTO/VO 均已有该字段），搜索面板拿到的 item 无任何价格字段，`buildPriceVisual` 恒返回 `[]`。overview 链路的 currentShopItems 用别名 `buyPrice/sellPrice`，两链路字段名不一致，前端需兼容两组。

- [ ] **Step 1: SQL 加列**

`ItemMapper.xml` `selectItemSuggestions` 的 SELECT 列表（L717 `i.rarity_id AS rarityId,` 之后）加:

```xml
            i.buy,
            i.sell,
```

- [ ] **Step 2: 前端 fallback**

`useTownNpcMaintenance.ts` L200 原:

```ts
  const numeric = Number(item?.buyPrice ?? item?.sellPrice)
```

改为:

```ts
  const numeric = Number(item?.buyPrice ?? item?.buy ?? item?.sellPrice ?? item?.sell)
```

- [ ] **Step 3: 验证**

```bash
cd back && mvn -DskipTests compile   # mapper XML preflight 会在启动时校验
# 重启后端后验证。注意: item:suggestions 缓存在 Redis（TTL 2 分钟），重启后端不清 Redis——
# 验证前等 2 分钟让旧缓存过期，或换一个此前没搜过的 keyword:
TOKEN=$(curl -s -X POST http://127.0.0.1:18191/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).data.token")
curl -s "http://127.0.0.1:18191/api/items/suggestions?keyword=platinum&limit=1" -H "Authorization: Bearer $TOKEN" | grep -o '"buy":[0-9]*'
```
Expected: 输出 `"buy":<数值>`

```bash
cd data-query-app && pnpm run check
```

- [ ] **Step 4: 提交**

```bash
git add back/src/main/resources/mapper/ItemMapper.xml data-query-app/composables/useTownNpcMaintenance.ts
git commit -m "fix(admin): surface item buy/sell in suggestions so coin chips render"
```

---

### Task 6: writeLocalDraft 静默失效修复

**Files:**
- Modify: `data-query-app/composables/useArticleEditor.ts`（writeLocalDraft L1260-1272）

**背景:** `localStorage.setItem` 无 try/catch，正文含大 base64 图时 QuotaExceededError 使自动保存静默死亡，状态栏仍显示"本地草稿已更新"。`SaveStatus` 联合类型已含 `'error'`（L18），状态栏对 error 显示"保存失败"（L305）。此函数不在 sanitizeArticleHtml 的 contract 逐字提取范围内，可安全修改。

- [ ] **Step 1: 包 try/catch**

L1260-1272 原函数体中的写入段改为:

```ts
  const writeLocalDraft = useDebounceFn(() => {
    if (!import.meta.client || loading.value || syncingState.value) return
    const payload: LocalDraftPayload = {
      articleId: resolvedArticleId.value,
      savedAt: new Date().toISOString(),
      data: toLocalDraftSnapshot(form),
    }
    try {
      localStorage.setItem(draftStorageKey.value, JSON.stringify(payload))
    } catch (error) {
      console.warn('[article-editor] local draft write failed', error)
      saveStatus.value = 'error'
      return
    }
    lastLocalSavedAt.value = payload.savedAt
    if (isDirty.value && !saving.value) {
      saveStatus.value = 'autosaved'
    }
  }, 800)
```

- [ ] **Step 2: 验证 + 提交**

```bash
cd data-query-app && pnpm run check && node --test tests/admin-article-runtime-preview.test.mjs tests/admin-articles-page-contract.test.mjs
git add data-query-app/composables/useArticleEditor.ts
git commit -m "fix(admin): surface local draft write failures instead of silently dying"
```

---

### Task 7: crawler-monitor-test 模拟器 dev 守卫

**Files:**
- Modify: `data-query-app/pages/operations/crawler-monitor-test.vue`

**边界（决策 #1/#5，review 修订后）:** 该页同时承载「域烟雾测试工作台」（生产运维功能，**保留**）和「test-state 场景模拟器」（纯 dev 工具，**守卫**）。关键红线: **`loadState()`（L1194-1210）不得加守卫**——它同时驱动真实 overview（`loadLiveOverview` L1199）与 domain-smoke 样本（`loadDomainSmokeSamples` L1200），是 onMounted 唯一数据入口（L1162-1164）、自动刷新回调（L1573）与 4 处 smoke 动作后的刷新点。守卫只落在 test-state 的**写路径**与纯模拟 UI。

- [ ] **Step 1: script 侧加守卫（仅写路径）**

在 `<script setup>`（L690 后）import 区之后加:

```ts
const isDevEnvironment = import.meta.dev
```

只在以下函数体首行加 `if (!isDevEnvironment) return`:
- `savePayload`（L1221 附近，PUT /admin/crawler-monitor/test-state）
- `resetState`（L1262 附近，POST /admin/crawler-monitor/test-state/reset）
- `startTimedSimulation`（L1622 附近，定时模拟入口，其 tick 链最终调 savePayload）

**不得改动**: `loadState`、`loadLiveOverview`、`loadDomainSmokeSamples`、任何 test-domain-smoke 相关函数。

- [ ] **Step 2: 模板侧加守卫（三个区块）**

先 Read 对应行段确认嵌套边界后，分别用 `<template v-if="isDevEnvironment">` 包裹:
1. **定时模拟面板**: L459-524 的 section（`startTimedSimulation` 的 UI 入口）
2. **场景快捷区**: L598-618 的 section-card（写固定 payload 的场景按钮）
3. **payload 编辑器 + 动作面板**: L620-686 的 `monitor-layout`（含 L662-685 JSON 编辑器；L622-659 的"动作"只读面板连带隐藏——它只服务模拟器，可接受）

工具栏"重置"按钮（L22-25，调 resetState）同样加 `v-if="isDevEnvironment"`（按钮级，不动工具栏其他控件）。

- [ ] **Step 3: 验证 + 提交**

```bash
cd data-query-app && pnpm run check && node --test tests/crawler-monitor-page-contract.test.mjs tests/crawler-monitor-unified-status.test.mjs tests/admin-ui-chinese-copy-contract.test.mjs
```
（review 已核对: page-contract 对该页的断言 L445-454 与中文文案断言 L176-186 均不在被包裹区块内被删除或改写——预计全绿；若假红，停下按"安全断言保留、行为断言迁移"原则处理，不许为过测试改回守卫。）

冒烟: dev 环境打开 /operations/crawler-monitor-test，确认烟雾测试工作台可用、模拟器面板可见；`pnpm run build` 后（生产 bundle）模拟器面板消失、烟雾工作台仍可用（若本地起生产预览成本高，读构建产物确认 `import.meta.dev` 已被编译为 false 即可）。

```bash
git add data-query-app/pages/operations/crawler-monitor-test.vue
git commit -m "fix(admin): gate crawler test-state simulator behind dev environment"
```

---

### Task 8: users 密码重置去明文回显

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/dto/AdminUserResetPasswordResponseDTO.java`（删 temporaryPassword 字段）
- Modify: `back/src/main/java/com/terraria/skills/service/impl/UserManagementServiceImpl.java`（L183 builder 去掉 temporaryPassword）
- Modify: `data-query-app/stores/users.ts`（L103 删字段）
- Modify: `data-query-app/pages/users.vue`（L163-168 handleResetPassword 删明文 toast）

**背景:** 管理员通过 window.prompt 输入新密码后，后端把明文密码原样回传，前端再用 toast 明文展示。密码是管理员自己刚输入的，回显无价值且入 toast/响应日志。审计日志后端已有（securityAuditService.log），无需补。window.prompt 换 Modal 属 UX 改进，转 P1 不在本轮。

- [ ] **Step 1: 后端删字段**

`AdminUserResetPasswordResponseDTO.java` 删 `private String temporaryPassword;`；
`UserManagementServiceImpl.java` L170-184 的 builder 删 `.temporaryPassword(newPassword)`。

先 grep 确认无其它消费方: `grep -rn temporaryPassword back/src/`（应只剩这两处）。

- [ ] **Step 2: 前端删展示**

`stores/users.ts` resetPassword 返回对象删 `temporaryPassword` 行（保留 userId/email）。
`pages/users.vue` handleResetPassword 改为:

```ts
const handleResetPassword = async (row: AdminUser) => {
  const nextPassword = window.prompt(`请输入 ${row.email} 的新密码（10-64 位，需包含字母和数字）`)
  if (!nextPassword) return
  await usersStore.resetPassword(row.id, nextPassword)
}
```

（store 内已有 `showToast('密码已重置', 'success')`，页面不再二次 toast。）

- [ ] **Step 3: 验证 + 提交**

```bash
cd back && mvn -DskipTests compile   # 注意: AdminUserControllerTest 不存在（review 已核实），勿加 -Dtest 跑它
cd ../data-query-app && pnpm run check
git add back/src/main/java/com/terraria/skills/dto/AdminUserResetPasswordResponseDTO.java back/src/main/java/com/terraria/skills/service/impl/UserManagementServiceImpl.java data-query-app/stores/users.ts data-query-app/pages/users.vue
git commit -m "fix: stop echoing plaintext password in admin reset-password flow"
```

---

### 收尾: 全量验证

- [ ] `cd back && mvn test`（后端全量）
- [ ] `cd data-query-app && pnpm run check && node --test tests/`（管理端全量）
- [ ] 本地栈重启冒烟: 登录后台 → 打开 items/users/crawler-monitor → 404 路由显示 error.vue → town-npcs 搜索面板出现金币 chip
- [ ] 更新 `docs/devlog/current.md` 记录本批修复与验证证据
