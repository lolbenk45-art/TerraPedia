# TerraPedia 公开页面低保真 v1

日期：2026-05-16

分支：`design/public-pages-lowfi-2026-05-16`

文件：`docs/design/terrapedia-public-pages-lowfi-v1.svg`

## 覆盖页面

### 1. 统一实体列表页

适用路由：

- `/items`
- `/npcs`
- `/bosses`
- `/buffs`
- `/projectiles`
- `/armor-sets`

接口边界：

- `/public/items`
- `/npcs`
- `/public/bosses`
- `/public/buffs`
- `/public/projectiles`
- `/public/armor-sets`

设计意图：

- 顶部保持图鉴式页头。
- 左侧是资料域筛选、排序和密度控制。
- 右侧改为高密度图鉴墙，一屏表达大量物品，避免 6000+ 数据靠少量大卡片翻页。
- 右侧保留选中实体速览，兼顾快速扫图标和查看摘要。
- 内页比首页克制，但信息密度必须明显高于普通卡片列表。

### 2. 统一实体详情页

适用路由：

- `/items/:id`
- `/npcs/:id`
- `/bosses/:id`
- `/buffs/:id`

接口边界：

- `/public/items/:id/aggregate`
- `/public/npcs/:id/aggregate`
- `/public/bosses/:id`
- `/public/buffs/:id`

设计意图：

- 首屏保留强实体识别：图标/主信息/属性摘要。
- Tabs 承载概览、合成、掉落、关系、来源证据。
- 下方模块对应可追溯关系、来源和证据链。

### 3. 文章/指南页

适用路由：

- `/articles`
- `/articles/:id`

接口边界：

- `/articles`
- `/articles/:id`

设计意图：

- 使用资料手札/编辑部风格，不做普通博客卡片。
- 顶部是专题卷轴，主区是精选手札和文章堆叠。
- 右侧承载专题索引、阅读路径、推荐和项目说明。
- 底部加入横向阅读路径，让文章区更像资料站的导览系统。

## 视觉约束

- 延续完整首页低保真的深绿、苔绿、暖金、纸色。
- 实体页比首页更克制，优先检索和信息密度。
- 详情页允许更强的图鉴感，但不能抢过首页首屏。
- 所有 SVG 可直接拖入已打开的 Figma 画布。
