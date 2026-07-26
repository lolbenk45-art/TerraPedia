# 详情页重做 · 高保真定稿（物品 / NPC）

- 日期：2026-07-27
- 分支：`ux/detail-pages-redesign`（基线 `main` @ `ddadd5a0`）
- 状态：高保真稿已产出，**尚未写实现计划，未动 `.vue`**

## 目标

重做前台「物品详情页」与「NPC 详情页」的信息架构与视觉，先出可对比的高保真稿，
定稿后再走 `writing-plans`。

## 用户决策

- 视觉尺度：**令牌内视觉升级**（不换风格，强化材质与层级）。
- 页面骨架：**双栏 + 粘性属性侧栏**。

## 产出

- `docs/design/terrapedia-item-detail-hifi-v1.html`（样本 泰拉刃 #757）
- `docs/design/terrapedia-npc-detail-hifi-v1.html`（样本 商人 #17）
- `docs/design/terrapedia-detail-redesign-hifi-v1.md`（改动说明与设计标准）
- 对比截图（未入库，可重拍）：`reports/design/detail-redesign/`

两份稿全部使用本地 API 拉取的真实数据与本地对象存储的真实图片，无灰条占位。

## 验证

- 两份稿的全部图片 URL 逐个 curl 校验为 200。
- 1440px 全页截图已核对；NPC 立绘按高度放大不再裁切；无 emoji 充当图标。
- 色值取自 `hifi-preview.css` / `tokens.css`，新增语义色仅物品稀有度一项。

## 顺带发现（各自需单独立项，本分支未修）

1. 泰拉刃合成树／用途在 API 有数据，页面显示「暂无配方／暂无用途」；
   `usePublicItemDetail.ts` 的 `fetchOptionalPublicItemRelation` 用 `catch {}` 吞错，
   需先加可观测输出再定位。
2. `resultQuantity` 字段被污染（火山 70 / 断钢剑 200 / 血腥屠刀 5 / 魔光剑 30），
   而同节点 `quantityText`、`quantityMin/Max` 均为 1。
   `RecipeHierarchyTree.vue:282`、`RecipeCraftingGraph.vue:108` 直接渲染该字段。
3. 商人 5 项节日商品的 `imageUrl` 指向完全无关的物品（Wiki 抓取错位），需数据侧修。
4. `start-local-stack.sh` 预检依赖 snap chromium，当前环境报
   `cannot preserve mount namespace ... chromium.mnt` 导致整体失败；
   设 `PLAYWRIGHT_CHROMIUM` 指向 playwright 自带 chromium 可绕过，
   但只有 2 个 check 脚本读这个变量。

## 下一步

1. 用户确认高保真方向。
2. `writing-plans` 出实现计划：先拆组件（两页分别 1823 / 1446 行），
   纯逻辑（商店分组、合成树摊平、完整度计算）抽 `.mjs` 做行为测试。
3. 上述 4 条发现分别立项，不混进本次 UI 改造。
