# 文章内嵌合成树多配方选择一致性设计

## 目标

文章中的 `.tp-recipe-tree` 必须和 `/crafting` 一样区分配方版本与同版本内的多个配方根节点；用户能在文章内切换后查看所选配方的完整树，不再静默截取默认版本的第一条配方。

## 已确认根因

- 后端在一个 `variant.roots` 数组中返回同版本的全部配方，`recipeCount` 对应该数组长度。
- 制作页通过 `buildCraftingRecipeModel` 的 `variants → activeVariant.options → activeRecipe` 模型呈现全部选择。
- 文章页的 `recipeTreeRootNodes` 选择默认版本后执行 `slice(0, 1)`；`layoutArticleRecipeTreeGraphForest` 也只接受第一根。现有契约甚至断言其他版本根节点不得显示，因此没有覆盖真实多配方契约。

## 方案

1. 文章页复用 `buildCraftingRecipeModel` 作为版本、配方标签、默认排序和选择键的唯一模型来源。
2. 动态文章树创建与制作页语义一致的两个按钮组：多个版本时显示“配方版本”，当前版本有多条根配方时显示“配方方案”。按钮展示制作页同一 `label/meta/summary` 内容，并带正确的 `aria-pressed`。
3. 选择任一按钮后，只重绘该嵌入块的图、统计和选中态；不重新请求 API，不影响文章其他嵌入树，也不改变文章滚动位置。
4. 图只绘制当前选择的那条根配方，避免把多条配方混为一个错误关系图；统计改为当前版本/当前配方的真实描述，移除“默认路线”。

## 范围

- 修改：`front-nuxt/pages/articles/[slug].vue`、文章树 Chromium 契约、任务 devlog/current 指针。
- 不修改：后端接口、合成页组件/样式、图片可见区居中工具、富文本编辑器和文章存储格式。

## 验证

1. 契约 fixture 含一个有三条根配方的桌面版本及另一个版本。它必须先证明旧实现无法让第二/第三条配方可选，然后验证每次切换仅显示对应根及材料。
2. 运行文章契约、`pnpm run check`、`git diff --check`。
3. 通过本地 API 选择真实 `recipeCount >= 2` 的物品，在文章嵌入与制作页逐一切换同一版本/配方，核对配方标签、根 `recipeId`、材料节点、图片完整性和无水平页面溢出。
