# TerraPedia HTML 高保真预览

日期：2026-05-16

入口：`docs/design/hifi-preview.html`

## 覆盖页面

- 首页：`/?page=home`
- 物品列表：`/?page=catalog`
- 物品详情：`/?page=detail`
- 文章页：`/?page=articles`

## 设计标准

- 使用真实中文内容，不再使用灰条占位。
- 使用静态 HTML/CSS 呈现接近真实前端的组件状态、间距、层级和信息密度。
- 已接入本地 MinIO 中的部分真实物品图片作为静态测试素材；数据和图片仅用于设计预览，不代表生产数据已收口。
- 少量非核心位置仍保留 CSS 像素风图标，用于表达类别和布局节奏。
- 首页参照已定完整首页骨架高保真化：左侧改为极简数据索引面板，用留白、细线、数字和真实条目密度建立高级感；右侧标题搜索，底部统计、探索地图、精选路线、Boss 事件条、图鉴卷轴、独立索引台和官网页脚。首页下半段统一延续顶层深绿网格背景，探索地图、精选路线、Boss、资料手札、资料索引台和页脚全部使用同一套低亮金色边框和低明度表面，不再使用浅色功能卡或偏亮渐变。页脚承担品牌宣传、产品入口、资源入口、社区入口、联系合作和版权信息。
- 内页延续深绿、苔绿、暖金、纸色体系；图鉴页保持高密度图标墙，详情页强调合成与来源链，文章页采用资料手札和路线攻略系统。
- 四张核心页面用于锁定前端实现方向，不再作为 Figma/SVG 线框稿使用。

## 预览方式

本地预览：

`http://localhost:5175/docs/design/hifi-preview.html`

可通过 URL 参数直接进入：

- `http://localhost:5175/docs/design/hifi-preview.html?page=home`
- `http://localhost:5175/docs/design/hifi-preview.html?page=catalog`
- `http://localhost:5175/docs/design/hifi-preview.html?page=detail`
- `http://localhost:5175/docs/design/hifi-preview.html?page=articles`
