# 深色背景层与光泽层统一 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「页面底」与「光」从各页自写收成两套共享层，并在 `/articles/archive` 与 `/npcs` 两页深色下落地。

**Architecture:** 新建 `assets/css/domains/ground-gloss.css`，内含两个互不依赖的层：`.tp-ground` 提供统一的底色与栅格（整条规则只在 `[data-theme="dark"]` 下存在），`.tp-gloss-focus` 让焦点元素**自己发光**（无坐标、无断点）。页面侧成本是两个 class。

**Tech Stack:** 纯 CSS（自定义属性 + `color-mix` + `radial-gradient`）、Nuxt 3 `definePageMeta({ publicScreenClass })`、仓库自有的逐字断言合同脚本。

**依据 spec:** `docs/superpowers/specs/2026-08-01-dark-ground-gloss-design.md`（提交 `01bc7f0b` 及其后续修正）

**分支:** `ux/detail-pages-redesign`，主工作区 `/home/lolben/TerraPedia`

---

## 已定参数（执行时不要再问）

| 项 | 值 | 来源 |
|---|---|---|
| 底色 | `#0b120c` | 采自首页 |
| 光色 | `rgba(214, 177, 90, …)` 金 | 采自首页 |
| 光强 | `.08` | 用户选定 |
| 射程 | `28rem` | 采自首页 |
| 试点页 | `/articles/archive`、`/npcs` | 用户选定 |
| 主题 | 仅深色 | 用户选定 |

## 文件结构

| 文件 | 职责 |
|---|---|
| `front-nuxt/assets/css/domains/ground-gloss.css`（新建） | 两个共享层的**唯一**定义处 |
| `front-nuxt/assets/css/domains/index.css`（改） | 最后导入 ground-gloss.css |
| `front-nuxt/pages/articles/archive.vue`（改） | screenClass 追加 `tp-ground` |
| `front-nuxt/components/article/ArticleArchiveBoard.vue`（改） | 根元素追加 `tp-gloss-focus` |
| `front-nuxt/pages/npcs/index.vue`（改） | screenClass 追加 `tp-ground`；`.entity-main-panel` 追加 `tp-gloss-focus` |
| `front-nuxt/assets/css/domains/detail-pages-redesign.css`（改） | 删除资料库自写的深色屏幕背景 |
| `front-nuxt/scripts/check-public-pages.mjs`（改） | screenClass 断言 + 焦点配额断言 |
| `front-nuxt/scripts/check-front-layout-layering-contract.mjs`（改） | 改写资料库背景断言 + 新增 ground-gloss 结构断言 |

## 红/绿顺序

Task 1 写合同断言，**预期判红**。Task 2–5 实现到绿。Task 6 验收。中途只跑指定脚本，不求全绿。

---

### Task 1: 先写合同断言（预期判红）

**Files:**
- Modify: `front-nuxt/scripts/check-front-layout-layering-contract.mjs`
- Modify: `front-nuxt/scripts/check-public-pages.mjs`

- [ ] **Step 1: 注册 ground-gloss.css 源**

`scripts/check-front-layout-layering-contract.mjs`，找到：

```javascript
const articleArchiveList = readOptional('components/article/ArticleArchiveList.vue')
```

在其下追加：

```javascript
const groundGlossCss = readOptional('assets/css/domains/ground-gloss.css')
const domainsIndexCss = readOptional('assets/css/domains/index.css')
const npcListPage = readOptional('pages/npcs/index.vue')
```

- [ ] **Step 2: 改写资料库背景断言**

同一文件，把这一整块：

```javascript
requireRegex(
  'assets/css/domains/detail-pages-redesign.css',
  detailPageRedesignCss,
  /\[data-theme="dark"\] \.article-archive-approved-screen\s*\{[^}]*background:[^}]*var\(--index-grid-x\),[^}]*var\(--index-grid-y\),[^}]*radial-gradient[^}]*background-attachment:\s*fixed;/m,
  'article archive dark route must use the token-owned grid, radial field, and fixed page ground',
)
```

替换为（覆盖面平移，不净减）：

```javascript
// 统一后：深色底不再由本页自写，改由共享的 .tp-ground 提供。
if (/\[data-theme="dark"\] \.article-archive-approved-screen\s*\{[^}]*background:/m.test(detailPageRedesignCss)) {
  violations.push('assets/css/domains/detail-pages-redesign.css: article archive dark ground must come from .tp-ground, not a page-owned background')
}
```

- [ ] **Step 3: 新增 ground-gloss 结构断言**

同一文件，在上一步之后追加：

```javascript
// 背景层：整条规则只在深色下存在，浅色里 .tp-ground 必须是纯空操作。
requireRegex(
  'assets/css/domains/ground-gloss.css',
  groundGlossCss,
  /\[data-theme="dark"\] \.tp-ground\s*\{[^}]*--tp-ground-base:\s*#0b120c;[^}]*--tp-color-page:\s*var\(--tp-ground-base\);[^}]*isolation:\s*isolate;[^}]*background:[^}]*var\(--index-grid-x\),[^}]*var\(--index-grid-y\),/m,
  'ground layer must be dark-scoped and redefine the page token so derived surfaces follow the lighter ground',
)

// 边界一：层叠上下文必须建在背景层，建错地方光会给焦点元素自己染色。
if (/\.tp-gloss-focus\s*\{[^}]*isolation:/m.test(groundGlossCss)) {
  violations.push('assets/css/domains/ground-gloss.css: isolation must sit on .tp-ground, not on .tp-gloss-focus')
}

// 边界九 + 边界一：焦点元素自带面会盖住身后的光；建层叠上下文会让光失效。
for (const forbidden of ['background', 'transform', 'filter', 'opacity', 'will-change']) {
  if (new RegExp(`\\.tp-gloss-focus\\s*\\{[^}]*${forbidden}:`, 'm').test(groundGlossCss)) {
    violations.push(`assets/css/domains/ground-gloss.css: .tp-gloss-focus must not declare ${forbidden}`)
  }
}

// 边界二：sticky 分页 dock 依赖祖先没有滚动容器。
if (/\.tp-ground\s*\{[^}]*overflow:/m.test(groundGlossCss)) {
  violations.push('assets/css/domains/ground-gloss.css: .tp-ground must not declare overflow; it would break sticky descendants')
}

// 光泽层：唯一令牌 + 浅色不生成。
for (const marker of [
  '--tp-gloss-hue: 214, 177, 90;',
  '--tp-gloss-alpha: .08;',
  '--tp-gloss-reach: 28rem;',
]) {
  requireIncludes('assets/css/domains/ground-gloss.css', groundGlossCss, marker, `gloss layer must own ${marker}`)
}

requireRegex(
  'assets/css/domains/ground-gloss.css',
  groundGlossCss,
  /:where\(\[data-theme="morning-paper"\], \[data-theme="warm-slate"\]\) \.tp-gloss-focus::before\s*\{[^}]*display:\s*none;/m,
  'gloss layer must not render in light themes',
)

requireIncludes(
  'assets/css/domains/index.css',
  domainsIndexCss,
  '@import "./ground-gloss.css";',
  'ground-gloss.css must be imported from the domains barrel',
)
```

- [ ] **Step 4: 新增焦点配额与自写光禁令**

`scripts/check-public-pages.mjs`，在文件中 `const publicShellClasses = new Map([` **之前**插入：

```javascript
// 「不要太过」由配额保证：每个路由至多一个光泽焦点。
// 同时禁止挂了 tp-ground 的页面再自写背景光，防止长出第七套。
const glossFocusPages = [
  'components/article/ArticleArchiveBoard.vue',
  'pages/npcs/index.vue',
]
for (const glossPath of glossFocusPages) {
  const glossSource = existsSync(file(glossPath)) ? readFileSync(file(glossPath), 'utf8') : ''
  const focusCount = glossSource.split('tp-gloss-focus').length - 1
  if (focusCount !== 1) {
    violations.push(`${glossPath}: must declare exactly one tp-gloss-focus anchor; found ${focusCount}`)
  }
}
```

- [ ] **Step 5: screenClass 断言追加 tp-ground**

同一文件，在 `publicShellClasses` 的 Map 里，把：

```javascript
  ['pages/articles/archive.vue', 'article-screen article-archive-approved-screen'],
```

替换为：

```javascript
  ['pages/articles/archive.vue', 'article-screen article-archive-approved-screen tp-ground'],
```

并在 `['pages/items/index.vue', 'catalog-screen'],` 这一行**之后**插入：

```javascript
  ['pages/npcs/index.vue', 'entity-screen tp-ground'],
```

- [ ] **Step 6: 跑两个脚本确认红**

```bash
cd /home/lolben/TerraPedia/front-nuxt && for s in front-layout-layering public-pages; do echo "===== $s ====="; pnpm run --silent "check:$s" 2>&1 | head -20; done
```

Expected: 两个都 FAIL。红的原因只应是「`ground-gloss.css` 尚未创建」「screenClass 未加 `tp-ground`」「焦点数为 0」「资料库仍自写深色背景」。**出现任何与本项无关的失败就停下报告。**

- [ ] **Step 7: 提交**

```bash
cd /home/lolben/TerraPedia && git add front-nuxt/scripts/check-front-layout-layering-contract.mjs front-nuxt/scripts/check-public-pages.mjs && git commit -m "test(front): assert the shared dark ground and gloss layers

Contracts intentionally fail until the two layers land." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 建两个共享层

**Files:**
- Create: `front-nuxt/assets/css/domains/ground-gloss.css`
- Modify: `front-nuxt/assets/css/domains/index.css`

- [ ] **Step 1: 写共享层**

创建 `front-nuxt/assets/css/domains/ground-gloss.css`：

```css
/*
  深色底与光泽的两个共享层。全站唯一定义处。

  背景层 .tp-ground —— 底色与栅格。整条规则只在深色下存在：
  浅色主题里它是纯空操作，各页保持各自原样（/npcs 浅色本来就带栅格，
  一旦在这里"压平"就会被抹掉）。特指度 (0,2,0) 稳赢各页 (0,1,0) 的
  screen 规则，正确性不依赖导入顺序。

  光泽层 .tp-gloss-focus —— 光由焦点元素自己发出，没有坐标、没有断点。
  改版式或换视口时光自己跟上；「每屏至多一个焦点」因此可被合同点数。

  两条不可动的约束(改错都是静默失效,不会报错):
  1. isolation 必须在 .tp-ground 上。若建在焦点元素上,z-index:-1 的
     ::before 会绘制在该元素自身背景之上,变成给它染色而不是照亮它身后。
  2. .tp-ground 不得有 overflow。资料库的分页 dock 是 position:sticky,
     祖先一旦创建滚动容器就失效。因此光只作垂直外溢,水平不外扩。
*/

[data-theme="dark"] .tp-ground {
  --tp-ground-base: #0b120c;
  --tp-color-page: var(--tp-ground-base);
  position: relative;
  isolation: isolate;
  background:
    var(--index-grid-x),
    var(--index-grid-y),
    linear-gradient(var(--tp-ground-base), var(--tp-ground-base));
  background-size: 40px 40px, 40px 40px, auto;
}

:root {
  --tp-gloss-hue: 214, 177, 90;
  --tp-gloss-alpha: .08;
  --tp-gloss-reach: 28rem;
}

.tp-gloss-focus {
  position: relative;
}

.tp-gloss-focus::before {
  content: "";
  position: absolute;
  inset: -140px 0;
  z-index: -1;
  pointer-events: none;
  background: radial-gradient(
    circle at 50% 36%,
    rgba(var(--tp-gloss-hue), var(--tp-gloss-alpha)),
    transparent var(--tp-gloss-reach)
  );
}

:where([data-theme="morning-paper"], [data-theme="warm-slate"]) .tp-gloss-focus::before {
  display: none;
}
```

- [ ] **Step 2: 最后导入**

`front-nuxt/assets/css/domains/index.css`，把：

```css
@import "./detail-pages-redesign.css";
```

替换为：

```css
@import "./detail-pages-redesign.css";
/* 最后导入：共享层覆盖各页自写的 screen 背景 */
@import "./ground-gloss.css";
```

- [ ] **Step 3: 跑分层合同，确认结构类断言转绿**

```bash
cd /home/lolben/TerraPedia/front-nuxt && pnpm run --silent check:front-layout-layering 2>&1 | head -12
```

Expected: 仍 FAIL，但**只剩**「article archive dark ground must come from .tp-ground」一条——ground-gloss 的结构断言与 import 断言均应消失。

- [ ] **Step 4: 提交**

```bash
cd /home/lolben/TerraPedia && git add front-nuxt/assets/css/domains/ground-gloss.css front-nuxt/assets/css/domains/index.css && git commit -m "feat(front): add shared dark ground and gloss layers" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 资料库接入

**Files:**
- Modify: `front-nuxt/pages/articles/archive.vue:2`
- Modify: `front-nuxt/components/article/ArticleArchiveBoard.vue`
- Modify: `front-nuxt/assets/css/domains/detail-pages-redesign.css`

- [ ] **Step 1: screenClass 追加 tp-ground**

`front-nuxt/pages/articles/archive.vue`，把：

```javascript
definePageMeta({ publicScreenClass: 'article-screen article-archive-approved-screen' })
```

替换为：

```javascript
definePageMeta({ publicScreenClass: 'article-screen article-archive-approved-screen tp-ground' })
```

- [ ] **Step 2: Board 根元素挂焦点**

`front-nuxt/components/article/ArticleArchiveBoard.vue`，把：

```html
  <section class="article-archive-page-shell" aria-labelledby="article-archive-page-title">
```

替换为：

```html
  <section class="article-archive-page-shell tp-gloss-focus" aria-labelledby="article-archive-page-title">
```

- [ ] **Step 3: 删掉本页自写的深色底**

`front-nuxt/assets/css/domains/detail-pages-redesign.css`，删除这一整块：

```css
[data-theme="dark"] .article-archive-approved-screen {
  background:
    var(--index-grid-x),
    var(--index-grid-y),
    radial-gradient(760px 380px at 74% 8%, color-mix(in srgb, var(--tp-color-positive) 11%, transparent), transparent 70%),
    linear-gradient(var(--tp-color-page), var(--tp-color-page));
  background-size: 40px 40px, 40px 40px, auto, auto;
  background-attachment: fixed;
}
```

保留其后的 `.article-archive-page { … }` 与浅色覆盖块，不要动。

- [ ] **Step 4: 跑两个脚本**

```bash
cd /home/lolben/TerraPedia/front-nuxt && for s in front-layout-layering public-pages; do echo "===== $s ====="; pnpm run --silent "check:$s" 2>&1 | head -12; done
```

Expected: `front-layout-layering` 全绿；`public-pages` 仍 FAIL，只剩 `/npcs` 相关两条。

- [ ] **Step 5: 提交**

```bash
cd /home/lolben/TerraPedia && git add front-nuxt/pages/articles/archive.vue front-nuxt/components/article/ArticleArchiveBoard.vue front-nuxt/assets/css/domains/detail-pages-redesign.css && git commit -m "feat(article): move the archive dark ground onto the shared layers" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: NPC 列表接入

**Files:**
- Modify: `front-nuxt/pages/npcs/index.vue`

- [ ] **Step 1: screenClass 追加 tp-ground**

`front-nuxt/pages/npcs/index.vue`，把：

```javascript
definePageMeta({ publicScreenClass: 'entity-screen' })
```

替换为：

```javascript
definePageMeta({ publicScreenClass: 'entity-screen tp-ground' })
```

> 若该行写法不同（例如 `definePageMeta({` 多行展开），只改 `publicScreenClass` 的值，保持其余键不动。

- [ ] **Step 2: 主内容列挂焦点**

同一文件，把：

```html
      <section class="entity-main-panel">
```

替换为：

```html
      <section class="entity-main-panel tp-gloss-focus">
```

- [ ] **Step 3: 跑 public-pages，要求全绿**

```bash
cd /home/lolben/TerraPedia/front-nuxt && pnpm run --silent check:public-pages 2>&1 | head -12
```

Expected: `Public page checks passed for N Nuxt routes.`

- [ ] **Step 4: 提交**

```bash
cd /home/lolben/TerraPedia && git add front-nuxt/pages/npcs/index.vue && git commit -m "feat(npc): move the npc list onto the shared dark ground and gloss" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 全量合同与构建

**Files:** 无（仅验证）

- [ ] **Step 1: 全量 check**

```bash
cd /home/lolben/TerraPedia/front-nuxt && pnpm run check > /tmp/gloss-check.log 2>&1; echo "EXIT=$?"; grep -iE "error TS|failed|违规|must" /tmp/gloss-check.log | grep -v "DeprecationWarning\|dbus\|shared_image" | head -20
```

Expected: `EXIT=0`。

若 `check:css-ratchet` 报红，说明有人往 `hifi-preview.css` 加了行——本计划不应有此改动，回查。

- [ ] **Step 2: 构建**

```bash
cd /home/lolben/TerraPedia/front-nuxt && pnpm run build > /tmp/gloss-build.log 2>&1; echo "EXIT=$?"; tail -4 /tmp/gloss-build.log
```

Expected: `EXIT=0`，`Build complete!`

---

### Task 6: 真机验收

**Files:**
- 临时脚本 `front-nuxt/tmp/gloss-verify.mjs`（验收后删除）

- [ ] **Step 1: 写验收脚本**

创建 `front-nuxt/tmp/gloss-verify.mjs`：

```javascript
import { chromium } from '@playwright/test'

const base = process.env.BASE ?? 'http://localhost:15177'
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM })

for (const theme of ['dark', 'morning-paper', 'warm-slate']) {
  for (const [label, path] of [['archive', '/articles/archive'], ['npcs', '/npcs']]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
    await ctx.addCookies([{ name: 'terrapedia-theme', value: theme, url: base }])
    const page = await ctx.newPage()
    await page.goto(base + path, { waitUntil: 'networkidle' })

    const ground = await page.evaluate(() => {
      const el = document.querySelector('.tp-ground')
      if (!el) return null
      const cs = getComputedStyle(el)
      return { bg: cs.backgroundImage.slice(0, 60), isolation: cs.isolation, overflow: cs.overflow }
    })
    const focusCount = await page.locator('.tp-gloss-focus').count()
    const glowShown = await page.evaluate(() => {
      const el = document.querySelector('.tp-gloss-focus')
      return el ? getComputedStyle(el, '::before').display : 'none'
    })
    const overflowX = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth)

    console.log(`${theme}/${label}: focus=${focusCount} glow=${glowShown} isolation=${ground?.isolation} overflow=${ground?.overflow} overflowX=${overflowX}`)

    await page.screenshot({ path: `tmp/gloss-${theme}-${label}.png` })
    await ctx.close()
  }
}

// sticky 分页 dock 必须仍然生效
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addCookies([{ name: 'terrapedia-theme', value: 'dark', url: base }])
const page = await ctx.newPage()
await page.goto(base + '/articles/archive', { waitUntil: 'networkidle' })
const stickyOk = await page.evaluate(() => {
  const dock = document.querySelector('[aria-label="文章资料库分页"]')
  return dock ? getComputedStyle(dock).position : 'missing'
})
console.log(`sticky dock position = ${stickyOk}`)
await ctx.close()

await browser.close()
```

- [ ] **Step 2: 跑验收**

先确认本地栈在跑（`curl -s -o /dev/null -w "%{http_code}" http://localhost:15177/npcs` 应为 200），然后：

```bash
cd /home/lolben/TerraPedia/front-nuxt && PLAYWRIGHT_CHROMIUM=/home/lolben/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome node tmp/gloss-verify.mjs 2>&1 | grep -vE "dbus|shared_image|UPower|GetAll|Fontconfig"
```

Expected：

```
dark/archive: focus=1 glow=block isolation=isolate overflow=visible overflowX=0
dark/npcs: focus=1 glow=block isolation=isolate overflow=visible overflowX=0
morning-paper/archive: focus=1 glow=none isolation=auto overflow=visible overflowX=0
morning-paper/npcs: focus=1 glow=none isolation=auto overflow=visible overflowX=0
warm-slate/archive: focus=1 glow=none isolation=auto overflow=visible overflowX=0
warm-slate/npcs: focus=1 glow=none isolation=auto overflow=visible overflowX=0
sticky dock position = sticky
```

逐项含义：`focus=1` 是配额；`glow=block` 仅深色、浅色必须 `none`；`isolation=isolate` 仅深色（浅色 `auto` 证明整条规则确实没在浅色下生效）；`overflow=visible` 证明没引入滚动容器；`sticky` 证明分页 dock 未被破坏。

**任何一项不符就停下报告，不要自行调参掩盖。**

- [ ] **Step 3: 人工看图**

用 Read 工具逐张看 `tmp/gloss-*.png` 六张，逐条核对：

- 深色两页的**底色一致**，不再一深一浅（本次改动的核心目标）
- 光落在卡区/主内容列上，**不刺眼**；与 `.superpowers/brainstorm/788768-1785522182/content/gloss-home-recipe.html` 台上「统一后 / .08」对照，观感是否接近
- 卡面**仍亮于底**，层次没有反转
- `/npcs` 顶部原来那条向下压暗消失后没有过亮
- 两个浅色主题与改动前**看不出差别**

- [ ] **Step 4: 若光泽观感偏离台上版本**

只调 `--tp-gloss-reach`（射程），**不要动 `--tp-gloss-alpha: .08`**——那是用户定的。调整后重跑 Step 2–3，并把「原值 → 新值 → 原因」写进 devlog 且在最终汇报里说明。若观感已接近则跳过本步。

- [ ] **Step 5: 清理临时文件**

```bash
cd /home/lolben/TerraPedia/front-nuxt && rm -f tmp/gloss-verify.mjs tmp/gloss-*.png
```

- [ ] **Step 6: 写 devlog**

创建 `docs/devlog/entries/2026-08-01-dark-ground-gloss.md`：

```markdown
# 2026-08-01 · 深色底与光泽收成两套共享层

## 做了什么

把「页面底」与「光」从各页自写收成两个共享层，落地 `/articles/archive` 与 `/npcs`（仅深色）：

- **背景层 `.tp-ground`**：底 `#0b120c`（采自首页，比原令牌 `#050806` 亮一档）+ 站点标准 40px 栅格。整条规则只在 `[data-theme="dark"]` 下存在。
- **光泽层 `.tp-gloss-focus`**：金 `rgba(214,177,90,.08)` / `circle 28rem`（全部采自首页），由焦点元素自己发出，无坐标、无断点。

关键一行是 `.tp-ground` 里的 `--tp-color-page: var(--tp-ground-base)`：卡面公式一个字不改，底一提亮，子树内所有由底推导的面自动跟上，层次不会反。

## 为什么不是坐标

原有六套背景全是坐标锚定（`at 74% 8%` 之类），坐标和内容无关，改版式要重调、响应式要再写一套断点——这正是它们各不相同的来路。元素锚定后页面侧成本是一个 class，且「每屏至多一个焦点」变成可点数的合同断言：「不要太过」由规则守，不靠自觉。

## 试点为什么换成 /npcs

原定第二页是 `/items`，实测它有 **9 个 radial + 7 处私有 34px 栅格**（站点标准 40px），分布在卡墙、卡墙 `::after`、多个子对象上。统一它是独立项目；只清一部分会让该页与自身不一致，试点反而证明不了任何事。`/npcs` 的 `entity-screen` 现在完全没有光、域 CSS 零个 radial，正好演示「一个本来没光的页面得到统一的光」。**`/items` 另行立项。**

## 坑（改错都是静默失效，不会报错）

- **`isolation` 必须在 `.tp-ground` 上，不能在焦点元素上。** 建错地方时 `z-index:-1` 的 `::before` 会绘制在焦点元素**自身背景之上**，变成给它染色而不是照亮它身后。
- **焦点元素不得自带不透明面**，否则光被整个盖住，只在 `inset` 外溢处露一圈边缘光。初稿曾选 `.catalog-wall-shell` 作焦点，正是踩了这条。焦点要选自身无背景的布局容器。
- **`.tp-ground` 不得加 `overflow`。** 资料库分页 dock 是 `position: sticky`，祖先一旦创建滚动容器立刻失效。因此光只作垂直外溢，水平不外扩。
- **浅色必须是纯空操作，不是"压平"。** 初稿让浅色压平成 `background: var(--tp-color-page)`，会抹掉 `/npcs` 浅色本来就有的栅格。改成整条规则只在深色下存在后才真正无差异。

## 可见变化（非缺陷）

- `/npcs` 失去顶部那条 `linear-gradient(180deg, …, rgba(5,8,6,.82) 420px)` 压暗带，首屏变亮。
- 资料库去掉 `background-attachment: fixed`，栅格改为随内容滚动。

## 验证

`pnpm run check` 退出码 0；`pnpm run build` 成功；两页 × 三主题共 6 张截图人工核验；脚本实测 `focus=1`、浅色 `glow=none` 且 `isolation=auto`、`overflow=visible`、横向溢出 0、分页 dock `position=sticky` 未被破坏。
```

- [ ] **Step 7: 提交**

```bash
cd /home/lolben/TerraPedia && git add docs/devlog/entries/2026-08-01-dark-ground-gloss.md && git commit -m "docs(front): record the shared dark ground and gloss rollout" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## 自查

**spec 覆盖**：两个共享层（Task 2）、资料库接入含删除自写底（Task 3）、`/npcs` 接入（Task 4）、四条合同改动含配额与结构断言（Task 1）、六条验收含 sticky 与三主题（Task 6）。spec 里「明确不做」的 `/items`、详情页、首页、制作页、错误页、其余 `entity-screen` 页面，本计划均未触碰。

**命名一致性**：`.tp-ground`、`.tp-gloss-focus`、`--tp-ground-base`、`--tp-gloss-hue/alpha/reach` 在 Task 1 断言、Task 2 实现、Task 3/4 接入、Task 6 验收四处写法一致。

**未触碰**：`hifi-preview.css`（css-ratchet 只剩 1 行余量）、`:root` 的 `--tp-color-page`（试点期不动令牌）、任何浅色主题观感。
