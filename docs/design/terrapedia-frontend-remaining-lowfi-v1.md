# TerraPedia 前台剩余接口低保真 v1

日期：2026-05-16

分支：`design/public-pages-lowfi-2026-05-16`

文件：`docs/design/terrapedia-frontend-remaining-lowfi-v1.svg`

## 覆盖页面

### 1. 分类图鉴入口

接口边界：

- `GET /categories`
- `GET /categories/items`
- `GET /categories/{id}`
- `GET /statistics/overview`

设计意图：

- 作为前台“图鉴分类导航页”，不是后台分类管理页。
- 左侧承载顶级分类与过滤，中间用谱系/星盘式结构表达分类树，右侧显示当前分类的高密度图鉴预览和入口动作。
- 适合从首页、物品页筛选、搜索建议跳转过来。

### 2. 生态群落图鉴

接口边界：

- `GET /biomes`
- `GET /biomes/{id}`

设计意图：

- 把生态群落做成可探索地图，不做普通列表。
- 左侧是层级/类型筛选，中间是地层切片地图，右侧是当前生态的描述、关系和资源摘要。
- `relations` 和 `resources` 仅作为前台阅读摘要，不做管理端关系维护。

### 3. 公开统计总览

接口边界：

- `GET /statistics/overview`

设计意图：

- 这是前台可信度和导航辅助页，不是后台 dashboard。
- 用总量徽章、分类占比、数据链路状态和推荐入口表达资料站规模。
- 避免出现管理端指标、操作按钮、导入/同步等后台语义。

## 视觉约束

- 继续使用已确认的深绿、苔绿、暖金、纸色。
- 三页都偏“资料站导航”，视觉强度低于首页，但不能变成普通后台表格。
- 高密度内容用图标墙、谱系、地图层表达，不用少量大卡片。
- 所有 SVG 可直接拖入已打开的 Figma 画布。

## Figma 使用方式

将 `terrapedia-frontend-remaining-lowfi-v1.svg` 拖进已打开的 Figma 画布。

也可以通过 `lowfi-preview.html` 逐页查看。
