# TerraPedia 详情页重做高保真 v1（物品 / NPC）

日期：2026-07-27
分支：`ux/detail-pages-redesign`（基线 `main` @ `ddadd5a0`）

## 入口

- 物品详情：`docs/design/terrapedia-item-detail-hifi-v1.html`（样本：泰拉刃 / item #757）
- NPC 详情：`docs/design/terrapedia-npc-detail-hifi-v1.html`（样本：商人 / npc #17）

两份稿都是自包含 HTML，直接用浏览器打开即可。物品与 NPC 图片走本地对象存储
`http://localhost:9000/terrapedia-images/...`（与既有 `docs/design/hifi-preview.html` 同一约定，
由本地栈的 image-compat 代理提供），所以看图前需要 `bash ./scripts/dev/start-local-stack.sh`。

对比用的线上现状截图（未入库，可随时重拍）：

- `reports/design/detail-redesign/before-items-757.png`
- `reports/design/detail-redesign/before-npcs-17.png`
- `reports/design/detail-redesign/hifi-item-detail-v1.png`
- `reports/design/detail-redesign/hifi-npc-detail-v1.png`

## 定稿方向

用户选择：**令牌内视觉升级**（不换风格，强化材质与层级）+ **双栏 + 粘性属性侧栏**。

- 色值、圆角、间距、字号、动效时长全部取自 `front-nuxt/assets/css/hifi-preview.css` 与
  `tokens.css` 既有令牌。
- 唯一新增语义色是物品稀有度（本例「浅红色」`#ff8f8f`），只用于立台光环与稀有度文本。
- NPC 好感度三色复用既有暖色带（苔绿 / 暖金 / 砖红），未引入新品牌色。
- 图标一律线性 SVG，**不用 emoji**；像素素材统一 `image-rendering: pixelated`，
  30×44 的 NPC 立绘按高度放大而不是拉宽裁切。

## 线上现状的问题（截图取证）

物品页（`front-nuxt/pages/items/[id].vue`）：

1. 六个模块里五个是「暂无 X」的全宽空卡，首屏之后基本是空白。
2. 右侧「资料概览」只是一张写着「可查看 / 暂无」的目录，滚过 hero 就没了。
3. 泰拉刃在库里有 3 层、67 KB 的完整合成树，页面却显示「暂无配方」（见下「待排查」）。
4. 没有「怎么拿到 → 能拿去做什么」的链路表达。

NPC 页（`front-nuxt/pages/npcs/[id].vue`）：

1. 底部「出售相关」6 行与上方「出售物品」是同一批数据的两种画法，纯重复。
2. 掉落物、状态效果对友好 NPC 本就不适用，却各占一张全宽空卡。
3. `behaviorNotes` 的入住条件是一整段掺着分号的文字，玩家没法逐条核对。
4. 生活偏好三列等宽平铺，右两列大量留白。

## 物品详情页改动

- **合成链升格为主线模块**：按 `L3 基础材料 → L2 中间产物 → L1 核心部件 → 成品` 分层平铺，
  制作站随层显示并标注「可替代」，猩红／腐化世界的材料用显式「二选一」分支表达。
- **新增采集清单**：把树摊平成可勾选备料表（11 项）。当前按配方原始数量列出，
  跨层换算（叶绿锭 ×24 折算叶绿矿）留作后续。
- **hero 升级**：稀有度立台 + 阶段轨（前期 / 困难模式前 / 困难模式后）+ 四格核心数值，
  击退做 0–20 刻度条，使用时间给出「≈ 3.3 次 / 秒」的换算。
- **说明缺失时不留白**：描述字段为空时，用合成链自动生成的一行「合成自 A + B + C」占位，
  并明示这行是自动生成的。
- **空模块压成事实条**：来源 / 状态效果 / 装备属性 / 图片各一行，说清「什么状态 + 去哪里」。
- **侧栏从目录变工具**：粘性属性表 + 页面锚点 + 资料完整度环（5/8 模块）+ 来自合成链的相关条目。

## NPC 详情页改动

- **商店按解锁条件分组**：34 项拆成 常驻 13 / 进度 8 / 环境 5 / 持有 3 / 节日 5。
  条件从 `notes` 的附注升为分组依据——玩家问的是「现在能买什么」，不是「一共有什么」；
  分组计数直接做成筛选段控件。价格用金/银/铜币色标呈现。
- **删掉重复陈列**：「出售相关」整段移除，商店只有一处。
- **入住条件变清单**：拆成「有一间空的房屋」「所有玩家物品栏合计 > 50 银币」两条，
  「便携收纳内的钱不计入」作为附注挂在条件下。
- **幸福度先给结论**：左卡直接给「森林 + 公主 / 高尔夫球手 / 护士」的推荐方案，
  以及它换来的商品折扣与森林晶塔；右侧才是喜欢 / 不喜欢 / 讨厌三列明细。
- **四张资料图像做成 hero 切换**：立绘 / 对话像 / 地图标 / 原始图，替代单独一张「资料图像」卡。
- **空模块写「不适用」**：掉落物、状态效果对友好 NPC 是结构性不适用，不是资料待补。

## 动效（静态截图看不到）

- 稀有度光环 5.4 s 呼吸；节点与商品卡 hover 上浮 1 px；层间连接线渐显。
- 锚点切换高亮位移；资产切换 crossfade。
- 全部落在 `--tp-motion-*` 的 120 / 180 / 280 ms 区间，缓动用 `cubic-bezier(.2,.8,.2,1)`。

## 顺带发现的数据与代码问题（不属于本稿范围，需单独立项）

1. **泰拉刃合成树在页面上不显示**：`/api/public/items/757/recipe-tree` 返回 67 KB 完整数据，
   `/recipe-usages` 返回天顶剑，但页面渲染「暂无配方 / 暂无用途」。
   `usePublicItemDetail.ts` 的 `fetchOptionalPublicItemRelation` 用 `catch {}` 静默兜底，
   真实错误被吞掉，先要把这个 catch 加上可观测输出才能定位。
2. **`resultQuantity` 字段被污染**：火山节点 `resultQuantity: 70` 而 `quantityText: "1"`、
   `quantityMin/Max: 1`；断钢剑 200、血腥屠刀 5、魔光剑 30 同类。
   `RecipeHierarchyTree.vue:282` 与 `RecipeCraftingGraph.vue:108` 直接渲染 `resultQuantity`，
   会把「×100」这种错数字显示给用户；`RecipeSummaryCard.vue` 优先取 `quantityMin` 是对的。
   本稿一律按 `quantityText / quantityMin` 呈现。
3. **商人 5 项节日商品的 `imageUrl` 与名称完全不匹配**：情人节戒指→永恒旅者兜帽、
   心箭→浪人浴衣、Wiesnbräu 啤酒→脊椎龙头、火鸡羽毛→细条纹裤、节日大礼帽→蚁狮卵。
   Wiki 抓取错位，需在数据侧修。本稿如实呈现并在商店页脚与事实条里标红。
4. **本地栈预检依赖 snap chromium**：`front-nuxt` 的 runtime 检查脚本会启动 chromium，
   当前环境下 snap 版报 `cannot preserve mount namespace ... chromium.mnt` 导致
   `start-local-stack.sh` 整体失败。用
   `PLAYWRIGHT_CHROMIUM=~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`
   可绕过（只有 2 个脚本读这个变量，其余若也要跑需一并支持）。

## 下一步

高保真定稿后再走 `writing-plans` 出实现计划，然后才动 `.vue`。
实现阶段的已知约束：两个详情页分别 1823 / 1446 行，需要先按模块拆组件；
纯逻辑（分组、摊平、完整度计算）抽到 `.mjs` 做行为测试，不写 `.vue` 源码字符串契约测试。
