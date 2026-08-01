# 详情页重做 · 高保真定稿（物品 / NPC）

- 日期：2026-07-27
- 分支：`ux/detail-pages-redesign`（基线 `main` @ `ddadd5a0`）
- 状态：物品与 NPC 高保真方向均已获用户确认；正式接入实施计划见 `docs/superpowers/plans/2026-07-29-approved-public-pages-production.md`。

## Status

`closed`

## 目标

重做前台「物品详情页」与「NPC 详情页」的信息架构与视觉，先出可对比的高保真稿，
定稿后再走 `writing-plans`。

## 用户决策

- 视觉尺度：**令牌内视觉升级**（不换风格，强化材质与层级）。
- 页面骨架：**双栏 + 粘性属性侧栏**。
- 物品详情与 NPC 详情视觉方向均已定稿；正式实现前先对照真实运行页面确认差距。
- NPC 页面采用能力驱动模块：常驻商人显示入住与完整商店，临时商人显示出现/离开与完整货池，功能型 NPC 显示专属服务，缺失能力不渲染空模块。
- 高保真样本中的旅商商品仅为视觉代表项；正式接入必须展示接口返回的完整货池，并区分完整货池与单次来访的 4–10 件商品。

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
- NPC 扩展视觉样本覆盖商人、向导、海盗与旅商；1440×1000 和 390×844 共 8 个浏览器场景无图片失败、脚本异常或页面级横向溢出。

## 真实运行态核对

- `PLAYWRIGHT_CHROMIUM=... bash ./scripts/dev/start-local-stack.sh --reuse-existing` 启动成功，项目自带验证报告全部通过。
- 当前工作区运行端口：前台 `15177`、后端 `18191`、管理端 `13004`、Redis `16380`、MinIO `19100`、图片兼容服务 `9000`。
- 真实 NPC 列表及商人 `17`、向导 `22`、海盗 `229`、旅商 `368` 详情页均返回 HTTP 200，并已完成桌面浏览器渲染核对。
- 当前聚合接口分别返回：商人 34 项商店；向导 1 项掉落；海盗 9 项商店；旅商 35 项商店与 1 项掉落。
- 旅商当前接口不是 Wiki 完整货池；正式实现“完整货池”前必须先明确并补齐数据来源，不能把当前 35 项误当完整数据。

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

1. 正式路由的物品、城镇 NPC、旅商与文章浏览器验收已在 1440px/390px 完成；实施状态见 `2026-07-29-approved-public-pages-production.md`。
2. 上述 4 条发现分别立项，不混进本次 UI 改造。

## Closeout

高保真阶段已完成并交接到 `2026-07-29-approved-public-pages-production.md`；正式页面接入的运行态验收与数据覆盖限制由后者记录。
