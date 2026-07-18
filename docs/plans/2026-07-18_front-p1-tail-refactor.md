# 前台 P1 残尾拆分实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 WP-1 第三刀与 WP-3 编辑器布局抽取，在不改变页面行为和视觉的前提下收掉两个 P1 残尾。

**Architecture:** armor 详情页保留取数与页面编排，把加载骨架、构筑矩阵、配方表格及其样式迁入独立 detail 组件，剩余页面样式通过 scoped 外部样式文件保持原作用域。文章新建/编辑页保留页面级 `<main>` 与稳定 `form id`，只把 form 内部的共享编辑区迁入 `UserArticleEditorLayout.vue`；页面继续拥有提交、审核、草稿和上传行为。

**Tech Stack:** Nuxt 4 / Vue 3 / TypeScript / node:test 风格合同脚本 / `pnpm run check`

---

## 任务边界

- 范围内：`front-nuxt/pages/armor-sets/[id].vue`、三个 armor detail 组件、armor 页面样式文件、两份 armor 合同；两份用户文章编辑页、`UserArticleEditorLayout.vue`、相关用户模块合同。
- 范围外：视觉改版、armor N+1/聚合端点、文章编辑器新功能、API/后端/数据改动、P2 工作包。
- 稳定合同：armor 矩阵内四条注释锚点随模板迁移；文章页的 `<main class="tp-page-shell user-article-editor-page">` 与 `new-user-article-form` / `edit-user-article-form` 留在页面文件。
- 完成标准：armor 页面 `<800` 行；文章 new/edit 页面各 `<400` 行；拆分前后现有合同语义不变；`pnpm run check` 退出码 0。

### Task 1: WP-1 armor 详情第三刀

**Files:**

- Create: `front-nuxt/components/detail/DetailArmorSetSkeleton.vue`
- Create: `front-nuxt/components/detail/ArmorBuildMatrix.vue`
- Create: `front-nuxt/components/detail/ArmorRecipeTable.vue`
- Create: `front-nuxt/assets/css/domains/armor-set-detail-page.css`
- Modify: `front-nuxt/pages/armor-sets/[id].vue`
- Modify: `front-nuxt/scripts/check-armor-stat-visuals.mjs`
- Modify: `front-nuxt/scripts/check-detail-layout-contract.mjs`
- Modify: `front-nuxt/scripts/check-public-pages.mjs`

- [x] **Step 1: 写失败合同**

  把三个新组件加入 `contractSourcePaths` / `combinedArmorSource`，并断言页面使用 `DetailArmorSetSkeleton`、`ArmorBuildMatrix`、`ArmorRecipeTable` 且总行数小于 800。合同源仍包含 `utils/armorEffectParsing.ts` 与 `composables/useArmorSetBuilds.ts`。`check-public-pages` 同步采用页面断言组件引用、组件文件断言内部 skeleton/effect marker 的所有权模式。

- [x] **Step 2: 验证 RED**

  Run: `cd front-nuxt && pnpm run check:armor-stat-visuals && pnpm run check:detail-layout`

  Expected: FAIL，原因是新组件尚不存在或页面尚未引用，不能是语法错误或环境错误。

- [x] **Step 3: 等价抽取骨架**

  将原页面加载分支迁到 `DetailArmorSetSkeleton.vue`。组件只接收 `detailModuleClass`，保留既有骨架节点、aria 语义、key 和 class；骨架专属样式及移动端规则一并迁移。

- [x] **Step 4: 等价抽取构筑矩阵**

  将 `armorSetBuildCards`、`armorHasVariantBuilds`、`armorFixedBonusLines`、`armorFixedBonusGroups` 作为只读 props，将展开动作作为 `toggle-piece` 事件。保留 `CommonPreviewImage`、`armorHighlightedTextSegments` 的真实渲染路径与四条合同注释锚点；矩阵专属样式及交互媒体规则迁入组件 scoped style。

- [x] **Step 5: 等价抽取配方表格**

  将可见/隐藏配方行、总数、空态文案和 `detailModuleClass` 作为 props。保留三列表格、相同制作站 rowspan、折叠溢出区、材料共享组件及空态 aria；配方专属样式与移动端规则迁入组件 scoped style。

- [x] **Step 6: 收口页面样式和行数**

  页面保留取数、SEO、效果分组、构筑 composable 调用和配方请求。非组件专属样式原样迁到 `assets/css/domains/armor-set-detail-page.css`，页面用 scoped `style src` 加载；不得把规则并入五个 CSS 棘轮文件。

- [x] **Step 7: 验证 GREEN**

  Run: `cd front-nuxt && pnpm run check:armor-stat-visuals && pnpm run check:detail-layout && pnpm run check:armor-builds && pnpm exec nuxt typecheck`

  Expected: PASS；`wc -l pages/armor-sets/[id].vue` 小于 800。

- [x] **Step 8: 自检并提交**

  检查 props/事件边界、模板锚点、scoped 样式归属和 `git diff --check`，提交 `refactor(front): extract armor detail presentation components`。

### Task 2: WP-3 编辑器内部布局抽取

**Files:**

- Create: `front-nuxt/components/user/UserArticleEditorLayout.vue`
- Create: `front-nuxt/assets/css/domains/user-article-editor-page.css`
- Modify: `front-nuxt/pages/user/articles/new.vue`
- Modify: `front-nuxt/pages/user/articles/[id].vue`
- Modify: `front-nuxt/scripts/check-user-module-contract.mjs`
- Modify: `front-nuxt/scripts/check-user-article-editor-runtime.mjs`
- Validate only: `front-nuxt/scripts/check-front-layout-layering-contract.mjs`

- [x] **Step 1: 写失败合同**

  让用户模块合同读取共享 layout 源，断言两页均引用 `UserArticleEditorLayout`，同时继续逐页断言稳定 `<main>` 与各自 `form id`。内部字段、草稿恢复、封面裁剪、状态文案可在“页面 + layout”拼接源上检查。运行时合同中对 aside/reference target/writing-mode CSS 的断言也改读“页面 + layout”，不得用页面注释或重复 CSS 维持旧 regex。

- [x] **Step 2: 验证 RED**

  Run: `cd front-nuxt && pnpm run check:user-module && pnpm run check:front-layout-layering`

  Expected: FAIL，原因是共享 layout 不存在或未接入。

- [x] **Step 3: 抽取 form 内部共享布局**

  `UserArticleEditorLayout.vue` 负责 form 内的导航、正文/元数据/封面区、草稿恢复区、引用面板目标和右侧状态容器；通过 typed props、事件与状态 slot 承接 create/edit 差异。页面继续拥有提交/审核/删除、上传与草稿 guard，不把 `<main>` 或 `<form>` 移入组件。

- [x] **Step 4: 收敛重复样式**

  将两个页面逐字相同的编辑器内部样式迁到共享 layout；page-owned compact head 与 form shell 规则放入两页以 scoped `style src` 共用的 domain CSS。写作模式通过 typed prop 驱动组件本地 modifier class，避免 child CSS 全局选择页面祖先；runtime 合同使用 `vue/compiler-sfc` 的编译后 CSS 验证 scoped/slotted/deep 语义。不得改变断点、颜色、尺寸或文案。

- [x] **Step 5: 验证 GREEN**

  Run: `cd front-nuxt && pnpm run check:user-module && pnpm run check:front-layout-layering && pnpm run check:user-article-editor && pnpm run check:user-article-editor-runtime && pnpm exec nuxt typecheck`

  Expected: PASS；`wc -l pages/user/articles/new.vue pages/user/articles/[id].vue` 均小于 400。

- [x] **Step 6: 自检并提交**

  核对 create/edit 禁用态、草稿恢复、封面裁剪、审核动作和 form submit 仍由原页面控制，提交 `refactor(article): share user editor form layout`。

### Task 3: 集成验收与收口

**Files:**

- Modify: `docs/devlog/entries/2026-07-18-front-p1-tail-refactor.md`
- Modify: `docs/devlog/current.md`

- [x] **Step 1: 完整前台门禁**

  Run: `cd front-nuxt && pnpm run check`

  Expected: 所有合同与 Nuxt typecheck 通过。

- [x] **Step 2: 结构与差异检查**

  Run: `git diff --check`、目标页 `wc -l`、目标组件/合同定向扫描。

  Expected: 无空白错误，文件阈值与合同拼接清单均满足。

- [x] **Step 3: 复核并收口 devlog**

  记录验证、双阶段 review 发现与处置、残余风险；显式暂不处理 WP-10/P2。按仓库提交清单检查 staged 范围后创建最终收口提交。
