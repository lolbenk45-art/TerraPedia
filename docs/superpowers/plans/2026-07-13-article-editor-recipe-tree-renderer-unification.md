# 文章与编辑器合成树共享渲染器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让文章正式页和富文本编辑器使用同一套合成树图形渲染、视觉规格和交互逻辑。

**Architecture:** 新的客户端 renderer 模块接收根节点、深度、可用宽度、图片 URL 解析器和 popover owner；它负责图形树的标准化、布局、DOM 与交互。文章页和编辑器保留各自的 embed 生命周期、选择语义与容器宽度，只调用同一 renderer。

**Tech Stack:** Nuxt 4、Vue 3、TypeScript、原生 DOM、Node Chromium 契约检查。

---

### Task 1: 建立双宿主必须共用 renderer 的失败契约

**Files:**

- Modify: `front-nuxt/scripts/check-article-content-references.mjs`
- Modify: `front-nuxt/scripts/check-user-article-editor-dom.mjs`

- [ ] **Step 1: 添加失败源码断言**

两个契约均要求 `from '~/utils/recipeHierarchyGraphRenderer'` 和 `renderRecipeHierarchyGraph`；文章契约拒绝 `ARTICLE_RECIPE_GRAPH_CARD_WIDTH`，编辑器契约拒绝 `EDITOR_RECIPE_GRAPH_CARD_WIDTH`。两个宿主都必须使用 `recipe-hierarchy-tree--article-embed` graph class。

- [ ] **Step 2: 运行 RED**

Run: `cd front-nuxt && pnpm run check:article-content-references && pnpm run check:user-article-editor`

Expected: 契约因共享 renderer 尚不存在而失败。

### Task 2: 创建唯一的图形树 renderer

**Files:**

- Create: `front-nuxt/utils/recipeHierarchyGraphRenderer.ts`
- Modify: `front-nuxt/scripts/check-article-content-references.mjs`

- [ ] **Step 1: 定义 API 和共享规格**

导出 `renderRecipeHierarchyGraph(options)`，其中 `options` 包含 `roots`、`maxDepth`、`availableWidth`、`resolveImageUrl` 和 `popoverOwner`。模块唯一拥有常规 `132×100` 卡片、多配方 `160px` 卡片、`48px` 主/制作站预览、`32px` 替代预览、四像素宽度安全边距与 `0.6–1.8` 手动缩放范围。

- [ ] **Step 2: 迁移所有共同图形逻辑**

把文本提取、同物品归并、替代材料、多配方来源、制作站继承、布局测量/定位、SVG 边、节点 DOM、完整 `contain` 图片、popover、滚轮缩放和拖拽迁入该模块。图片须标记 `data-preview-visible-center="contain-only"`，加载或失败时重置可见中心偏移。

- [ ] **Step 3: 运行 shared fixture GREEN**

文章契约 fixture 调用 renderer，断言两个 `48×48` 制作站、多配方来源、直显名称/数量、缩放/平移以及 `contain-only` 图片。运行 `pnpm run check:article-content-references`，预期通过。

### Task 3: 迁移文章宿主

**Files:**

- Modify: `front-nuxt/pages/articles/[slug].vue`
- Test: `front-nuxt/scripts/check-article-content-references.mjs`

- [ ] **Step 1: 保留文章职责**

保留 content reference hydration、`buildCraftingRecipeModel` 版本/配方选择、宽画布 `resolveArticleRecipeTreeFrameWidth`、shell/header/stats/selectors/链接。

- [ ] **Step 2: 删除私有 graph 管线并调用共享 renderer**

`appendArticleRecipeTreeGraph` 计算好 PC/移动可用宽度后调用 renderer，传入已选择根、`sanitizeArticleUrl(imageUrl, 'src')` 和 owner `'article'`。删除本地 graph constants、归并、布局、DOM、popover 和 interaction helpers。

- [ ] **Step 3: 验证文章契约**

Run: `cd front-nuxt && pnpm run check:article-content-references`

Expected: `article content reference checks passed`。

### Task 4: 迁移编辑器宿主并统一样式

**Files:**

- Modify: `front-nuxt/components/user/UserArticleRichEditor.vue`
- Modify: `front-nuxt/assets/css/domains/crafting.css`
- Modify: `front-nuxt/pages/articles/[slug].vue`
- Test: `front-nuxt/scripts/check-user-article-editor-dom.mjs`

- [ ] **Step 1: 删除 editor 私有 graph 管线并调用共享 renderer**

保留编辑器的 embed 识别、`contenteditable="false"`、shell、fetch 和根节点选择。以 editor surface 可用宽度、`resolvePreviewImageUrl` 和 owner `'editor'` 调用 renderer。

- [ ] **Step 2: 迁移共享 graph 视觉规则**

在 `crafting.css` 的 `.recipe-hierarchy-tree--article-embed` 下定义卡片、预览、制作站、名称、数量和图片 reset。移除 article/editor 内仅服务旧 graph class 的重复图形规则；保留两个宿主的外壳、header、宽画布和容器边框规则。

- [ ] **Step 3: 验证 editor 与类型**

Run: `cd front-nuxt && pnpm run check:user-article-editor && pnpm exec vue-tsc --noEmit`

Expected: 两个命令退出 `0`。

### Task 5: 双宿主验收与交接

**Files:**

- Modify: `docs/devlog/entries/2026-07-12-article-embedded-recipe-tree-light.md`
- Modify: `docs/devlog/current.md`

- [ ] **Step 1: 完整验证**

Run: `cd front-nuxt && pnpm run check && git diff --check`

Expected: 两个命令均退出 `0`。

- [ ] **Step 2: 浏览器核验**

以相同 API fixture 在 editor 和 `/articles/fw` 核验共享 class、常规卡片大小、制作站 frame、名称/数量、节点数和 `contain-only` 标记。文章页还必须保持全部节点在可见图框、无 sidebar overlap、无 document horizontal overflow。

- [ ] **Step 3: 更新 devlog**

记录共享模块路径、移除的私有 graph 管线、双宿主证据、残余风险和验收 URL。用户未要求提交时不提交。
