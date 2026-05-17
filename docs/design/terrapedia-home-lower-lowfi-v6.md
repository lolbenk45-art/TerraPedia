# TerraPedia 首页下半部分低保真 v6

日期：2026-05-16

文件：`docs/design/terrapedia-home-lower-lowfi-v6.svg`

## 定稿方向

首页下半部分承接首屏 v2.5 的“游戏图鉴型”方向，但不继续做强 Hero，而是进入可探索的资料世界。

结构分为四段：

1. 探索地图
   - 用地图节点承载公开资料域。
   - 对应接口：`/public/items`、`/npcs`、`/public/bosses`、`/public/buffs`、`/public/armor-sets`。

2. 精选路线
   - 主推一个高辨识度实体，再配合若干精选条目。
   - 对应接口：`/public/items`。

3. Boss 事件条
   - 用横向事件条展示 Boss 与掉落预览。
   - 对应接口：`/public/bosses`。

4. 图鉴卷轴 + 独立索引台
   - 图鉴卷轴承载文章/指南。
   - 索引台承载统计信息，与上方内容保持清晰区分。
   - 对应接口：`/articles`、`/statistics/overview`。

## 视觉约束

- 主色控制在深绿、苔绿、暖金、纸色。
- 不使用多色进度条，避免显脏。
- 底部统计是独立索引台，不混进纸面，也不做突兀黑条。
- 后续高保真时，节点和实体图标可以替换为真实游戏资产。

## Figma 使用方式

将 `terrapedia-home-lower-lowfi-v6.svg` 拖进已打开的 Figma 画布，不要在 Figma 首页用 Import to Drafts。
