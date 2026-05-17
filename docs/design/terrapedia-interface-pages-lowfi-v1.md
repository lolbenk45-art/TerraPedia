# TerraPedia 接口态页面低保真 v1

日期：2026-05-16

分支：`design/public-pages-lowfi-2026-05-16`

文件：`docs/design/terrapedia-interface-pages-lowfi-v1.svg`

## 覆盖接口态

### 1. 全站搜索与建议

接口边界：

- `/public/items/suggestions`
- `/public/items`
- `/categories`
- `/statistics/overview`

设计意图：

- 补齐搜索输入后的建议态、分类入口和热门路径。
- 适合首页搜索、物品页搜索和全站快速入口复用。

### 2. 物品聚合详情模块

接口边界：

- `/public/items/:id`
- `/public/items/:id/images`
- `/public/items/:id/sources`
- `/items/:id/recipes`
- `/public/items/:id/recipe-tree`
- `/public/items/:id/aggregate`

设计意图：

- 把图片、来源、配方树、模块状态拆成清晰工作台。
- 保留聚合接口和 legacy fallback 的模块化可视化位置。

### 3. NPC 聚合详情模块

接口边界：

- `/public/npcs/:id/aggregate?include=loot,shop,buffs`

设计意图：

- 单页表达 NPC 基础信息、掉落、商店、状态效果提示、模块状态。
- 强调来源链路和玩家可读信息，而不是后台关系检索。

### 4. Buff 图鉴详情模块

接口边界：

- `/public/buffs`
- `/public/buffs/:id`

设计意图：

- 只表达前台用户需要看的 Buff 效果、类型、持续/触发提示、获取方式摘要和免疫提示。
- 不把后台关系表搬到前台界面。
- 来源和证据只作为轻量摘要出现，不做管理台式关系维护面板。

### 5. 专属列表页组合

接口边界：

- `/public/bosses`
- `/public/projectiles`
- `/public/armor-sets`

设计意图：

- Boss、射弹、盔甲套不完全套普通实体网格。
- 以 Boss 剧场、射弹轨迹、盔甲展架三种专属形态表达差异。

### 6. 创作者审核发布工作流

接口边界：

- `/user/articles`
- `/user/articles/:id`
- `/user/articles/:id/submit-review`
- `/articles`
- `/articles/:id`

设计意图：

- 补齐本地草稿、保存、更新、提交审核、发布状态的工作流页面。
- 保持资料工坊视觉，但突出审核状态和发布检查。

## Figma 使用方式

将 `terrapedia-interface-pages-lowfi-v1.svg` 拖进已打开的 Figma 画布。

也可以通过 `lowfi-preview.html` 逐页查看。
