# TerraPedia 前台页面评分审查报告(第二轮)

- 审查分支:`review/front-pages-audit-r2`(自本地 main `c712372` 拉出,已含上轮 P0+P1 全部修复)
- 审查日期:2026-07-17
- 上轮基线:`docs/audits/2026-07-16-front-pages-audit.md`(综合 6.1/10)
- 证据:56 张全页截图(26 路由 × 1440px/375px 双视口),位于 `front-nuxt/tmp/audit-r2/shots/`;5 路代码级并行审查覆盖列表页/详情页/内容页/用户区/CSS 全局层;SSR HTML 与 HTTP 状态码运行时核验
- 环境:本地栈 front:15177 / back:18191,全部路由 200(404 探针按预期返回真实 404),双视口零水平溢出

## 一、总评

| 维度 | 上轮 | 本轮 | 一句话结论 |
|---|---|---|---|
| 视觉识别与品牌 | 8.5 | **8.5** | 暗金+墨绿风格保持全站最强项,无回归 |
| 设计系统与 CSS 架构 | 4 | **4.5** | 防退化"宪法"(tokens/primitives/domains/合同脚本)已立,但迁移零进度,hifi-preview.css 一周又 +199 行 |
| 布局与响应式 | 6 | **7** | 移动抽屉落地、分页坞遮挡缓解;biomes 双端超长页恶化为全站之最 |
| 排版与对比度 | 7 | **7** | 9-11px 字号全口径 121 处(assets 59 + scoped 62),仍无下限治理 |
| 功能完整性(图鉴) | 6 | **7.5** | 断链/假页/参数断链全修;残留三对同义筛选项、projectiles 死胡同 |
| 数据获取与 SEO | 4 | **7** | 六详情页 SSR+真 404 落地(最大单项进步);新发现 og:image 全站相对路径、文章正文不进 SSR |
| 加载/空/错三态 | 6.5 | **7** | 列表/用户区三态健康;crafting 重试块仍不可达(fetcher 吞错未改) |
| 可访问性 | 6 | **6.5** | 抽屉 Esc/焦点语义好;仍无 skip-link,settings/编辑器 aria-live 缺失 |
| 用户区与表单 | 7.5 | **8** | 草稿自动保存+离开守卫落地;密码可见性切换仍缺,编辑器双胞胎 95% 重复 |
| **综合** | **6.1** | **6.9** | P0+P1 兑现明显;债务收敛到四个焦点:两个巨石文件、CSS 迁移、SSR 收尾 |

## 二、逐页评分卡

评分维度:**视觉 / 结构 / 架构 / 耦合度 / 维护难度**,10 分制。视觉分来自截图证据,代码四维来自代码级审查(证据以 file:line 标注)。

---

### 首页 `/` — 视觉 9 · 结构 9 · 架构 7 · 耦合 6 · 维护 7

- **视觉 9**:全站门面,hero/物品墙/Boss 进度/专题带信息架构清晰,品牌完成度最高。移动端 7988px(上轮 8042)页脚农场仍占两屏半。
- **结构 9**:页面本体仅 40 行纯组装,5 个 home 组件全部拆出,全站结构最佳(`pages/index.vue:21-40`)。
- **架构 7**:双 `useAsyncData` SSR + 完整 og/twitter meta;stats 失败静默回退设计合理,但 `formatCount` 把"图鉴/分类"当计数值显示,语义混用(`useHomeData.ts:115-123`)。
- **耦合 6**:composable 60% 是静态视图数据且被 contract 逐 slug 锁定,改一个专题链接要动三处(`useHomeData.ts:227-337` + `check-home-j1-index.mjs:301-315`)。
- **维护 7**:版本号/焦点物品 757/RGB 字符串等魔法值散布。
- **优化方案**:① 静态专题数据抽 `~/config/home-content.ts`,contract 改锁 config;② **专题 slug 依赖的 V55 种子迁移文件不存在**(`V55__seed_ac_home_original_articles.sql` 被 existsSync 跳过),未跑种子的新环境十个专题链接全 404——补迁移或改由 API 下发;③ 页脚移动端折叠。

### 物品列表 `/items` — 视觉 8 · 结构 5 · 架构 7 · 耦合 6 · 维护 4

- **视觉 8**:墙格+侧栏抽屉成熟,h1 恢复可见(存量 a343bd4 隐藏问题已解);hover 预览、密度切换完整。
- **结构 5**:分类抽屉整块复制两份——移动 `<details>` 版与桌面版 ~90 行逐字重复(`items/index.vue:568-616` vs `618-660`)。
- **架构 7**:三态可达性全站最佳(空态三分),URL 同步最全;扣分:手工预水合与 `useCatalogRouteSync` 的 hydrate 双份 90% 重复且行为不一致(`items/index.vue:138-154` vs `431-446`),预水合副本只读 `q` 不读 `search`。
- **耦合 6**:硬编码后端分类 code 字符串 30+ 处(`items/index.vue:41-117`),后端改 code 前端静默失效。
- **维护 4**:746 行、~25 个 computed 相互引用;`fallbackCatalogItems` 240 条假数据仍作为 `useAsyncData` default 常驻内存(`usePublicItems.ts:131-150`)。
- **优化方案**:① 抽 `CatalogCategoryDrawer.vue` 消 90 行双份;② `useCatalogRouteSync` 提供前置水合入口,删页面级副本;③ **修三对同义筛选项**:机关/电路同指 `TOOL_CIRCUIT`、方块/平台同指 `MATERIAL_BLOCK`、Boss 掉落/宝藏袋同指 `CONSUMABLE_GRAB(_BAG)`(`items/index.vue:62-100`)——用户可感知的功能性混乱;④ 物理删除 fallback 假数据;⑤ 分页派生链抽 `useCatalogPagination`(7 页 ×20 行)。

### 物品详情 `/items/[id]` — 视觉 7.5 · 结构 7 · 架构 8 · 耦合 6 · 维护 5

- **视觉 7.5**:hero+属性表信息密度好;空模块从"假内容"缩为一行空态,但数据贫瘠物品仍堆 5 块空面板。
- **结构 7**:骨架已抽 `DetailItemDetailSkeleton`;7 模块中仅 2 个带 `v-if`,其余 5 个空数据仍常驻(`items/[id].vue:967,993,1039,1061,1143`)。
- **架构 8**:SSR ✅(实测 `/items/1` HTML 含「铁镐」)+ setup 期 `createError` 404 ✅ + bundle 并行 8 端点,取数层六页最完整。
- **耦合 6**:`rawPublicCopyPattern`/safe display 与 npcs/bosses 三份逐字复制;28 条英译中正则表内嵌视图层(`items/[id].vue:66-93`)。
- **维护 5**:script 875 + style 618 行;新增来源字段要动 4 处。
- **优化方案**:① 空模块 `v-if` 折叠,空态汇总进右侧"资料概览"(本就重复);② 抽 `utils/publicCopy.ts` 消三份正则;③ **og:image 改绝对 URL**(全站六页同病,`items/[id].vue:131`——OG 爬虫不认相对路径,分享卡片图全灭)+ 补 canonical;④ 面包屑仍显示裸 ID(六页中仅 biomes 修了),经 `TerraBreadcrumb` 的 `items` prop 注入真实标题。

### NPC 列表 `/npcs` — 视觉 8 · 结构 6 · 架构 6 · 耦合 6 · 维护 6

- **视觉 8**:三栏 rail/main/preview 职责清楚,焦点预览卡是差异化亮点。
- **结构 6**:卡片 meta 内联表达式密集(三函数 join、嵌套三元,`npcs/index.vue:420,449`)。
- **架构 6**:URL 同步完整含 legacy 参数兼容;但 route-sync 在取数**之后**调用,深链先发一次废请求(`npcs/index.vue:112` vs `233`)——bosses/buffs/armor-sets/projectiles 同病,共 5 页。
- **耦合 6**:URL 搜索参数写 `search` 而其余 6 页写 `q`,站内不一致(`npcs/index.vue:238`)。
- **维护 6**:`resetNpcFilters` 漏清 `selectedNpcCategoryId`(`npcs/index.vue:205-210`)——深链进来的隐形过滤点"重置"清不掉,一行修复。
- **优化方案**:① 补 reset 一行;② serialize 统一改 `q`;③ 抽 `NpcCard.vue`;④ 深链双请求随 route-sync 前置水合统一根治。

### NPC 详情 `/npcs/[id]` — 视觉 8 · 结构 6 · 架构 7 · 耦合 6 · 维护 5

- **视觉 8**:商店条件分组、四图资料图像区出色。
- **结构 6**:掉落行 markup 逐字复制 3 次、商店行 2 次(`npcs/[id].vue:634-680,697-743`);**加载态无骨架未修**(上轮 f 项)——静态文字占位,参数切换 refetch 时暴露(`:516-525`)。
- **架构 7**:聚合端点单请求全量,SSR+404 ✅,非数字 id 前置判定。
- **耦合 6**:`'source' + 'Items'` 字符串拼接 hack 规避 contract 提取器缺陷(`npcs/[id].vue:488`)——测试工具缺陷正在污染业务代码(buff composable 也有一处)。
- **维护 5**:style 654 行,其中钱币样式与 bosses ~150 行同构。
- **优化方案**:① 抽 `NpcLootRow.vue` 消 3 份;② 加载态复用 bosses 的 `CommonTpSkeleton` 模式;③ 钱币三件套(normalize/label/CSS)与 bosses 合并 `utils/terrariaMoney.ts`;④ 修 contract 提取器根治拼接 hack。

### Boss 列表 `/bosses` — 视觉 7.5 · 结构 6 · 架构 7 · 耦合 7 · 维护 7

- **视觉 7.5**:✅枚举已中文化(上轮 P0-5);✅分页坞遮挡缓解(12ad4de:不透明度 0.96+72px 余量);hero 左侧留白偏大、右侧 5 块统计瓷砖信息密度低。
- **结构 6**:骨架/列表用 v-for+v-if 同元素反模式(`bosses/index.vue:180`),projectiles 的 `<template>` 写法可直接照抄。
- **架构 7**:URL 同步+legacy `bossType` 兼容;深链双请求同病。
- **耦合 7**:干净;`bossTypeRouteState` 无意义包装残留(`bosses/index.vue:98`)。
- **维护 7**:257 行,新增类型单点;`minimumMs: 320` vs items 180 漂移无注释。
- **优化方案**:① v-if/v-for 改 `<template>` 包裹;② 骨架时长入 `useVisualLoading` 命名预设;③ hero 统计瓷砖合并提密度。

### Boss 详情 `/bosses/[id]` — 视觉 8 · 结构 7 · 架构 8 · 耦合 6 · 维护 6

- **视觉 8**:掉落按 direct/treasureBag/conditional 分组+超 8 条收 `<details>`,是 items 页该学的形态。
- **结构 7**:`<details>` 内外掉落行逐字复制(`bosses/[id].vue:404-445`)。
- **架构 8**:SSR+404+`useVisualLoading` 复用,全套正确。
- **耦合 6**:`rawPublicCopyPattern` 第三份;钱币逻辑与 npcs 重复 ~100 行。
- **维护 6**:健康;style 中 130 行是同构钱币样式。
- **优化方案**:① 抽通用 `DetailRelationRow.vue`(六页 relation-row 高度一致:44px icon+copy+meta);② 钱币合并同 npcs;③ 脏数据过滤下沉 normalize 层。

### Buff 列表 `/buffs` — 视觉 6.5 · 结构 7 · 架构 7 · 耦合 8 · 维护 8

- **视觉 6.5**:末排减益(暗影珠/黑暗/诅咒等)图标仍为空框(上轮 P2-4 未做);增益/减益无类型筛选,搜索是唯一入口。
- **结构 7**:7 页最干净模板,骨架与真实卡镜像。
- **架构 7**:三态齐全;深链双请求同病。
- **耦合 8**:小瑕疵——用中文展示文案 `typeLabel === '增益'` 做样式判断,应比较 `buff.tone`(`buffs/index.vue:154`)。
- **维护 8**:203 行,10 分钟上手,是其余页面应收敛到的形态。
- **优化方案**:① 空图标走 PreviewImage fallback 字形;② 加 typeLabel chip 筛选(serialize 加 `type` 键即可);③ tone 替换文案判断。

### Buff 详情 `/buffs/[id]` — 视觉 7 · 结构 8 · 架构 8 · 耦合 8 · 维护 9

- **视觉 7**:上轮 4.5 的断链重灾区已痊愈;三卡+关系区布局规整,略平淡。
- **结构 8**:关系区配置数组驱动,六页最干净;`slice(0,8)` 截断无展开入口,超 8 条静默丢失(`buffs/[id].vue:77`)。
- **架构 8**:✅**断链已修**——sources→`/items`、inflicters/immuneTargets→`/npcs`,数字 id 守护(`buffs/[id].vue:77-108`);SSR+404 ✅。
- **耦合 8**:composable 里 `source${'Items'}` 拼接 hack 同 npcs 问题。
- **维护 9**:297 行单点改动。
- **优化方案**:① normalize 层收敛 fact 的 image/name 双键,页面 9 键枚举可删;② 超 8 条加 `<details class="detail-group-remainder">`(全局样式已备)。

### 生态列表 `/biomes` — 视觉 7 · 结构 5 · 架构 4 · 耦合 6 · 维护 5

- **视觉 7**:环境图 hero 沉浸感好;但桌面 7497px/移动 25493px 为**全站最长页**,featured+全量列表堆叠无分页。
- **结构 5**:两段独立骨架+featured/列表 4 个 tile 变体重复。
- **架构 4**:**7 页中唯一没接 `useCatalogRouteSync`**——搜索/分组刷新即丢、不可分享(上轮问题原样,`biomes/index.vue:9-10`);`biomeHeroPrimary` 兜底分支永不命中,死代码(`:77`)。
- **耦合 6**:composable 双端点降级封装干净。
- **维护 5**:featured/hero/列表扣除的隐式关系需通读全部 computed。
- **优化方案**:① 接入 route-sync(serialize `{q, group}`,~15 行,7 页中成本最低);② 抽 `BiomeTile.vue` 收 4 变体;③ 列表分组分页治超长;④ 删 `biomeHeroPrimary`。

### 生态详情 `/biomes/[id]` — 视觉 5.5 · 结构 7 · 架构 7 · 耦合 7 · 维护 7

- **视觉 5.5**:桌面 7450px/移动 23725px,数百条掉落平铺+未翻译英文名(Wood/Daybloom…)仍在(上轮问题原样);描述正文整段英文。
- **结构 7**:九分组声明式定义好;概览卡 `<a href="/items">` 泛链接信息价值低。
- **架构 7**:SSR+404 ✅;✅**六页中唯一修复面包屑真实标题的页面**(`biomes/[id].vue:202`)。
- **耦合 7**:5 张领域词典表放页面层,与 items 页同类词典各自漂移。
- **维护 7**:534 行平坦可控;分组算法 O(n²) `indexOf+splice`。
- **优化方案**:① **全部内部链接 `<a href>` 换 NuxtLink**(六页唯一整页刷新导航,`biomes/[id].vue:307-391`);② 掉落区分页/标签页化治超长;③ 名称翻译走数据管线补 nameZh;④ 词典合并 `utils/sourceLabels.ts`。

### 套装列表 `/armor-sets` — 视觉 7 · 结构 4 · 架构 6 · 耦合 5 · 维护 5

- **视觉 7**:卡片含效果 chip 摘要,信息价值高;5064px 中规中矩。
- **结构 4**:卡片模板整块复制——NuxtLink 版与 `<article>` 版 ~65 行近逐字重复+同帧两次 `.filter()`(`armor-sets/index.vue:240-275` vs `277-309`)。
- **架构 6**:URL 同步齐全;composable 用 `MaybeRefOrGetter` 与其余 6 个 watch 风格分叉。
- **耦合 5**:12 项词条映射+效果格式化是领域逻辑,放页面导致与详情页行为分叉。
- **维护 5**:`formatEffectValue` 两分支返回同一空串,未完成残留(`armor-sets/index.vue:89`)。
- **优化方案**:① 抽 `ArmorSetCard.vue` 消双份;② 词条映射迁 `utils/equipmentEffects.ts` 供列表/详情共用;③ 修未完成分支。

### 套装详情 `/armor-sets/[id]` — 视觉 7.5 · 结构 4 · 架构 6 · 耦合 4 · 维护 2

- **视觉 7.5**:数值总览/制作配方/男女展示图布局成熟紧凑(1553px)。
- **结构 4**:~120 行骨架 markup 内联;build 矩阵嵌套 6 层 v-for/v-if;注释当测试锚点的痕迹残留。
- **架构 6**:主详情 SSR+404 ✅,后端"success 无 data" quirk 带注释兜底 ✅;但两个二级取数仍 `server:false` 且是 **N+1 客户端瀑布**——每部件各打 equipment-effects+recipe-tree,10 部件=20 请求批次(`armor-sets/[id].vue:764-791,1912-1926`)。
- **耦合 4**:页面内嵌 ~600 行**中文效果文案正则解析引擎**(`:317-740`)——"后端没解析好 benefit 文本"的债用前端正则扛,措辞一变数值汇总静默漂移,零测试覆盖。
- **维护 2**:**4432 行,比上轮 4425 还多 7 行,重构未发生**。script 2000+style 1961,改一个词条格式要同步 ~6 处。
- **优化方案**(全站单文件最高优先):① 三刀拆解——`utils/armorEffectParsing.ts`(~450 行,顺带可单测)、`composables/useArmorSetBuilds.ts`(~500 行)、`components/detail/ArmorBuildMatrix.vue`+`ArmorRecipeTable.vue`,页面落到 <800 行;② N+1 向后端要 `?include=piece-effects,recipes` 聚合端点;③ 解析引擎长期后移数据管线,前端只留 unparsed 原文展示。

### 射弹列表 `/projectiles` — 视觉 6 · 结构 6 · 架构 6 · 耦合 7 · 维护 6

- **视觉 6**:「伤害未标记 · 击退未标记」meta 行+chip 双重冗余 ×1111 条仍在(上轮 P2-4 未做,`projectiles/index.vue:301-303`)。
- **结构 6**:骨架/列表 `<template>` 写法正确,可作 bosses 修正范本。
- **架构 6**:URL 同步 7 页最全(含排序白名单);**卡片仍是死胡同**——无 `:to`、无 `[id].vue`、composable 无 detailPath(上轮问题原样)。
- **耦合 7**:自包含干净;pageSize 用 dock props 与 items/npcs 侧栏 chip 两种 UI 并存。
- **维护 6**:pageSize 不持久化(items/npcs 有);loadingSlotCount 上限 24/36/48/50 四处漂移。
- **优化方案**:① **动线决策**:补 `[id].vue`+detailPath,或短期按 itemId 关联跳武器详情,至少不再是死胡同;② 缺数据 chip 改"仅有值才显示";③ 抽 `useCatalogPageSize` 统一三页。

### 分类索引 `/categories` + 详情 `/categories/[id]` — 视觉 7.5/7 · 结构 8 · 架构 8 · 耦合 7 · 维护 8

- **视觉 7.5/7**:✅从假占位页重做为真实分类导航(战斗轴/制作建造轴+真实计数),详情页(如 /categories/weapons)子分类卡链到 scoped items,信息架构成立;详情桌面 1228px 偏薄。
- **结构 8**:两页干净;index 底部"推荐入口"band 仍是无落点的硬编码宣传文案(`categories/index.vue:100-118`)。
- **架构 8**:✅真实取数+fail-closed normalizer+未知 slug SSR 404(`[id].vue:15-23`)——上轮 2/10 的假页彻底翻身。注意:**旧数字 id 路由已 404**(slug 制),如站外有旧链接需 redirect 兜底。
- **耦合 7**:分组 `slice(0,3)`+caption 硬编码隐式依赖定义顺序。
- **维护 8**:两页 <130 行。
- **优化方案**:① caption 由 `entries.map(name).join(' / ')` 派生;② 推荐入口接真实落点或删除;③ `[id].vue` 更名 `[slug].vue`(同步 contract 路径清单);④ 数字 id 加 301 redirect。

### 合成路线 `/crafting` — 视觉 8 · 结构 7 · 架构 5 · 耦合 6 · 维护 7

- **视觉 8**:桌面合成树全站最强交互;移动 12432px 未折叠(上轮 12486,持平未治理)。
- **结构 7**:16 个子组件拆分到位;三块骨架 ~100 行仍内联页面;`RecipeHierarchyTree.vue` 865 行是小巨石。
- **架构 5**:**错误重试块仍不可达**(上轮问题原样)——`fetchPublicRecipeTree` 吞错返回 missing,`recipeError` 恒 null,重试块是死 UI(`usePublicRecipeTree.ts:23-40` + `crafting/index.vue:346`);URL 不同步 variantKey/recipeKey,文章嵌入跳转无法深链到具体方案。
- **耦合 6**:`selectRecipeTarget` 用 `document.querySelector` 摸子组件 DOM(`crafting/index.vue:150-152`);默认 itemId '675' 双处硬编码。亮点:`useCraftingRecipeModel` 纯函数被 crafting/article 两页干净共享,是正确范本。
- **维护 7**:model composable 341 行纯函数易测。
- **优化方案**:① 一行激活重试:`v-if="recipeBundle?.source === 'missing' && !recipePending"`;② 移动端树默认折叠层级;③ variantKey/recipeKey 入 query;④ DOM 查询改 `scroll-to-key` prop。

### 全站搜索 `/search` — 视觉 7 · 结构 7 · 架构 7 · 耦合 8 · 维护 8

- **视觉 7**:空态动线好(快捷入口给下一步);但空态页仍 3980px 偏长,「Browse/All/Items」英文与中文文案混排。
- **结构 7**:五态在 console 区和结果区各写一遍,状态文案双份。
- **架构 7**:SSR+fail-closed(只认 `source === 'api'`)正确;✅`/items?search=` 链路已闭合(items 端 hydrate 兼容)。
- **耦合 8**:直调 `fetchPublicItems`,无中间层。
- **维护 8**:数据驱动,意图有注释。
- **优化方案**:① 状态合并单 `searchState` computed 驱动两处;② 全页裸 `<a>` 换 NuxtLink;③ 空态收拢 Browse/资料域重复入口(同一入口出现三遍);④ 文案统一中文。

### 检索原型 `/search-tool` — 视觉 7 · 结构 7 · 架构 5 · 耦合 6 · 维护 6

- **架构 5**:**硬编码计数仍在**('6,131'/'14'/'762'/'388'/'14,746',`search-tool.vue:16-21`),而首页同类入口已用真实统计——同站两套口径;该页已被 check-public-pages 列入 blocked 对照页、不在导航内。
- **优化方案**:留则 5 行改动复用 `useHomeData` stats 消灭全部假计数;废则页面顶部加"对照原型"标注或直接下线。**建议明确定位,别再半悬**。

### 文章列表 `/articles` — 视觉 7.5 · 结构 8 · 架构 8 · 耦合 8 · 维护 8

- **视觉 7.5**:卡片墙成熟;测试文章(FW/??)混在生产列表提醒内容治理。
- **结构 8**:四态线性清晰;作者块 link/span 版双份可抽 chip。
- **架构 8**:SSR+query 分页深链+可达重试,标准做法。
- **优化方案**:抽 `ArticleAuthorChip`;删多余 `articleError` 中间 ref。

### 文章详情 `/articles/[slug]` — 视觉 8 · 结构 3 · 架构 5 · 耦合 2 · 维护 2

- **视觉 8**:阅读体验、TOC、推荐栏保持高水准。
- **结构 3**:**4088 行(上轮 4023,+65)**,净化器/合成树嵌入/引用预览/评论(~800 行)全部内联;评论回复表单逐字两份(`:2486-2510` vs `:2554-2578`)。
- **架构 5**:✅DOMPurify 已落地(hook 复用 sanitizeArticleAttributes,策略单源);❌但**正文根本不进 SSR**——`articleLoading = !articleClientReady` 门控使 SSR 永远输出骨架(`:1977`),"regex 回退作 SSR 路径"的设计理由运行时落空,文章页 SEO 只剩 meta;❌404 返回 200(`notFoundState` 只渲染页内卡片不 throw,`:2299`),与详情页口径不一致。
- **耦合 2**(全站最差):contract 脚本逐字提取 97 个函数进无模块 Chromium 执行,**锁死 ~500 行死代码无法删除**——共享渲染器落地后旧 DOM 图渲染簇(`:858-1327`)已零调用,仅因提取器会 throw 而保留;且 contract 实际验证的是 regex 回退路径,99% 用户走的 DOMPurify 路径反而无运行时覆盖。
- **维护 2**:script 2255 行,死代码占 22%。
- **优化方案**(全站第二优先):① 删 `:858-1327` 死代码簇,contract 改测 `shared/article-runtime/recipeHierarchyGraphRenderer.ts` 真身;② 拆 `useArticleComments()` + `ArticleComments.vue`;③ `notFoundState` 改 `throw createError(404)`;④ 去掉正文分支的 clientReady 门控(hydration 风险用 `<ClientOnly>` 包引用增强),让正文真正 SSR——文章站的核心 SEO 收益。

### 关于 `/about` — 视觉 7 · 结构 8 · 架构 8 · 耦合 9 · 维护 9

- 66 行职责内完成。唯一问题:同级卡片 h2/h3 层级不一致(`about.vue:29` vs `:34-44`),统一即可。

### 认证三页 `/user/login|register|forgot-password` — 视觉 7.5 · 结构 9/8.5/8.5 · 架构 7.5/8/8 · 耦合 9 · 维护 9

- **视觉 7.5**:双栏(价值主张+表单卡)干净利落。
- **结构/耦合/维护**:70-106 行模范认证页;label/autocomplete/inputmode+pattern/aria-live 全齐;校验正确下沉 store。
- **扣分**:密码可见性切换仍缺(上轮遗留,5 处密码框全裸 `type="password"`);验证码缺 `autocomplete="one-time-code"`;发送验证码无重发冷却;register/forgot 的 requestCode 逐字双份。
- **优化方案**:① 抽 `PasswordInput.vue`(带 toggle+aria-pressed)一次修 5 处;② 补 one-time-code;③ 基于 `expiresInSeconds` 做 60s 冷却;④ 抽 `useVerificationCodeRequest`。

### 用户区内页(中心/设置/收藏/通知/路线)— 视觉 7(未复测,需登录) · 结构 8-9 · 架构 6.5-8.5 · 耦合 8-9 · 维护 7-9.5

- **favorites 8.9 / routes 9.0 / notifications 8.4 均分,全站最健康板块**:四态+分页+末页回退+键盘可达+偏好闭环。
- **扣分**:① settings 改密成功后 store 已清会话但页面不跳转,用户处于"看似登录实已登出"悬空态(`settings.vue:96` + `userAuth.ts:253`);② settings/编辑器状态提示无 aria-live(认证三页有,不一致);③ user/index 四个 await 串行拉长 SSR 首字节;④ routes/notifications 裸引用 favorites 的 scoped class,脆弱借用;⑤ "历史通知"实际加载全部通知,与文案不符。
- **优化方案**:① 改密成功 navigateTo 登录页带 redirect;② `.user-form-status` 补 aria-live;③ `Promise.allSettled` 并行;④ favorite-* 样式上移 primitives.css;⑤ 抽 `usePaginatedUserList` 消三份分页样板(低优)。

### 文章编辑器 `/user/articles/new|[id]` — 视觉 7(未复测) · 结构 7 · 架构 7.5 · 耦合 5 · 维护 5.5/5

- **架构 7.5**:✅草稿保护全套落地(d646305)——3s debounce localStorage 暂存、恢复横幅带时间戳、`onBeforeRouteLeave`+`beforeunload` 双守卫、保存后 baseline 重置放行;[id] 版还会在本地副本与服务端一致时自动清除。
- **耦合 5**:❌但**以复制方式落地**——draft 块 ~130 行×2 逐字双份;整体 new.vue 903 行中 854 行与 [id].vue 逐字相同(**95%**),上轮的双胞胎问题反而增重。
- **新缺口**:`beforeunload` 不 flush pending debounce——3s 窗口内关浏览器丢最近输入,与"已自动暂存"文案矛盾(`new.vue:206-211`)。
- **优化方案**:① 抽 `useArticleDraftGuard({storageKey, form, serialize})`,两页各删 ~130 行,handler 内补 `persistArticleDraft()` flush;② 抽 `UserArticleEditorLayout.vue`(~250 行模板+460 行样式),两页退化为薄页面(~300 行);③ `formatReviewStatus` 三份复制收 `~/lib/userArticleStatus.ts`。

### 我的文章列表 `/user/articles` — 视觉 7(未复测) · 结构 7.5 · 架构 6.5 · 耦合 7.5 · 维护 7

- **架构 6.5**:**硬编码 `fetchUserArticles(1, 10)` 且无分页 UI**(`articles/index.vue:112`)——第 11 篇起在"我的文章"不可达,store 分页状态被闲置,功能性缺口。
- **优化方案**:接入分页(favorites 的 nav 直接可抄);表头双份/状态映射三份复制随编辑器重构一并收敛。

### 公开作者页 `/users/[id]` — 视觉 7(未复测) · 结构 8.5 · 架构 6.5 · 耦合 8.5 · 维护 9

- **架构 6.5**:❌SSR 无 404(notFound 只是渲染分支,不存在用户返回 200);网络错误与"用户不存在"折叠同一文案无重试。
- **新发现(P0 级)**:**auth 中间件误伤**——`to.path.startsWith('/user')` 匹配 `/users/*`(`user-auth.global.ts:4`),访客每次打开公开作者页都触发 authStore.init → fetchCurrentUser 失败+refresh 再失败,两次无谓请求阻塞导航。改 `to.path === '/user' || to.path.startsWith('/user/')`,一行修复。
- **优化方案**:① 修中间件前缀;② 补 `createError(404)`;③ error/notFound 拆分+重试。

### 404 页(`/items/99999999` 探针)— 视觉 8

- ✅HTTP 真 404 + 标题排版正常(上轮"未找到没\n有找到"断行已修)+ 返回首页/搜索资料双动线。瑕疵:右下角 Nuxt dev overlay 报错浮层是开发模式伪影,生产无此问题。

---

## 三、全局层与 CSS 架构(非页面维度)

| 条目 | 上轮 | 本轮 | 点评 |
|---|---|---|---|
| CSS 架构 | 4 | **4.5** | tokens/primitives/domains/exceptions 四层骨架+合同脚本已立且 CI 强制;但 hifi-preview.css 10,282 行(+199),4 个 fixes 补丁一行未删,54 处 `!important` 原封;新功能样式(4a744dc 的 62 行、becc71b 抽屉)仍默认流入 hifi,与 domains 注释直接矛盾 |
| 断点体系 | 3 | **3** | 17 种断点、三套"移动端"定义并存(720 tokens/860 nav/721 primitives),无令牌固化 |
| 令牌落地 | 3 | **3.5** | crafting 域范式正确;但页面层 `--tp-*` 占比仅 20.5%、components 4.8%,`--index-line`(117)+`--accent-gold`(94)两个私有变量直连量超全部 tp 用量 |
| 全局组件 | — | **6** | TerraNav 最佳(抽屉 composable 化+Teleport 正确绕 backdrop-filter 坑+a11y 认真);TerraBreadcrumb 最差(残留原型假数据字典+全裸 `<a>` 整页刷新);TerraFooter 统计数字硬编码陈旧;**无 layouts/**,34 页各手抄 Nav/Footer 外壳 |
| 主题体系 | — | **6** | data-theme+SSR 首帧正确无 FOUC;但 816 处 `[data-theme="light"]` 死选择器(store 已归一化该值永不出现)、910 行 contrast-fixes 是补丁式刷色 |

**CSS 优化路线(性价比排序)**:① 合同脚本加 hifi 行数只减不增的**棘轮断言**(唯一能堵回流的手段);② 6 个高频私有变量 sed 换 `--tp-*` 别名(页面 tp 占比 20%→~75%);③ 建 `layouts/default.vue` 一次删 34 处外壳重复;④ sed 删 `[data-theme="light"]` 枚举(-800 行);⑤ catalog-image-fixes(1878 行)整体升格 domains/catalog.css。

## 四、上轮问题追踪总表

### ✅ 已修(11 项)
| 项 | 证据 |
|---|---|
| buffs 详情硬编码 /items 断链(P0-1) | 按类型分发+数字 id 守护 |
| items search??q 参数(P0-2) | hydrate 兼容+serialize 转写,运行时实测回填 |
| 列表→详情 NuxtLink(P0-3) | 7 列表页卡片全改 |
| 分页坞遮挡(P0-4) | 不透明度 0.96+72px 余量(12ad4de) |
| Boss 裸枚举(P0-5) | 已中文化(截图证实) |
| 详情 404 语义+标题断行(P0-6) | 六页 createError,HTTP 实测 404 |
| categories 假页(P0-7) | 彻底重做:真实取数+fail-closed+slug 404 |
| 详情页 SSR 取数(P1-1) | 六页全落地,SSR HTML 实测含真实内容 |
| 共享 composable 抽取(P1-2) | useVisualLoading 7/7、useCatalogRouteSync 6/7 接入 |
| 移动导航重做(P1-4) | 汉堡抽屉+useMobileNavDrawer+Teleport |
| 编辑器保护+净化器替换(P1-5/6) | 草稿三件套+DOMPurify hook 均落地 |

### ❌ 未修(7 项)
| 项 | 现状 |
|---|---|
| 错误通道打通(P1-3) | crafting 重试块仍死 UI,fetcher 吞错未改 |
| biomes 无 URL 同步 | 唯一未接 route-sync 的列表页 |
| items 同义筛选项 | 三对(机关/电路、方块/平台、Boss 掉落/宝藏袋) |
| projectiles 死胡同+缺数据噪声 | 卡片不可点+「未标记」×1111 双重冗余 |
| 密码可见性切换 | 5 处全缺 |
| P2 全线(CSS 分层迁移/断点/令牌/长页治理/小字号/skip-link) | 仅骨架,迁移零进度 |
| fallbackCatalogItems 假数据 | 显示层遮蔽但仍常驻内存 |

### 🆕 新发现(按严重度)
1. **og:image 全站相对路径**——六详情页+首页 OG 分享卡片图全灭;无 canonical(P0,一个 util 函数全修)
2. **auth 中间件误伤 `/users/*` 公开页**——访客两次无谓请求阻塞导航(P0,一行修复)
3. **文章正文不进 SSR + 文章 404 返回 200**——SSR 化最后一块拼图(P1)
4. **深链双请求**——5 个列表页 route-sync 后置于取数,带 query 深链先发废请求(P1)
5. **contract 提取器锁死 ~500 行死代码**([slug].vue)+ 拼接 hack 扩散 2 处(P1)
6. **编辑器双胞胎 95% 重复**且 d646305 以复制落地,复制面扩大(P1)
7. **armor-sets N+1 请求瀑布**——10 部件 20 请求批次(P1)
8. 我的文章无分页(第 11 篇不可达)、改密后会话悬空、beforeunload 丢 3s 输入、npcs reset 漏清 categoryId、V55 种子迁移缺失(P2,各为小修)

## 五、改进路线图

### P0 — 一周内高收益(预计 3d)
| # | 事项 | 位置 | 工作量 |
|---|---|---|---|
| 1 | og:image 绝对 URL util + canonical,六详情页+首页接入 | 各 [id].vue useSeoMeta | 0.5d |
| 2 | auth 中间件前缀修复(/users 误伤) | user-auth.global.ts:4 | 0.5h |
| 3 | crafting 重试块激活(改判 source==='missing') | crafting/index.vue:346 | 0.5h |
| 4 | items 三对同义筛选项去重 | items/index.vue:62-100 | 0.5d |
| 5 | npcs resetFilters 补清 categoryId | npcs/index.vue:205 | 0.5h |
| 6 | 文章 notFound 改 throw createError(404) | articles/[slug].vue:2299 | 0.5h |
| 7 | 我的文章接入分页 | user/articles/index.vue:112 | 0.5d |
| 8 | biomes 接 useCatalogRouteSync | biomes/index.vue | 0.5d |

### P1 — 结构性(1-2 迭代)
1. **armor-sets/[id] 三刀拆解**(4432→<800 行,解析引擎独立可测)
2. **articles/[slug] 死代码清除+评论组件化+正文真 SSR**(contract 改测共享渲染器真身)
3. **编辑器三步抽取**(useArticleDraftGuard/EditorLayout,消 ~700 行重复)+ beforeunload flush
4. **useCatalogRouteSync 前置水合**,根治 5 页深链双请求
5. **详情页共享层沉淀**:DetailRelationRow/terrariaMoney/publicCopy 三件套(消 ~400 行三份复制)
6. armor-sets 聚合端点消 N+1;修 contract 提取器根治拼接 hack
7. PasswordInput.vue 一次修 5 处密码框

### P2 — 设计系统偿债(持续,方向不变)
1. hifi 行数棘轮断言 → 高频变量 sed 换令牌 → layouts/default.vue → 死主题选择器清除 → catalog-fixes 升格 domain
2. 断点收敛四档(430/720/860/1180)入合同白名单
3. 长页治理:biomes 双端(7.5k/25k px)、crafting 移动折叠、首页页脚折叠
4. 数据缺口降噪:projectiles chip、buffs 空图标 fallback
5. 小项:skip-link、9-11px 提升(121 处)、面包屑假数据字典清除+NuxtLink 化、Footer 统计接真值

## 六、评分卡速览

| 页面 | 视觉 | 结构 | 架构 | 耦合 | 维护 | 均分 | 上轮均分参考 |
|---|---|---|---|---|---|---|---|
| / 首页 | 9 | 9 | 7 | 6 | 7 | **7.6** | 8.0 |
| /items | 8 | 5 | 7 | 6 | 4 | **6.0** | 7.8 |
| /items/[id] | 7.5 | 7 | 8 | 6 | 5 | **6.7** | 7.5 |
| /npcs | 8 | 6 | 6 | 6 | 6 | **6.4** | 7.3 |
| /npcs/[id] | 8 | 6 | 7 | 6 | 5 | **6.4** | 7.8 |
| /bosses | 7.5 | 6 | 7 | 7 | 7 | **6.9** | 7.0 |
| /bosses/[id] | 8 | 7 | 8 | 6 | 6 | **7.0** | 7.8 |
| /buffs | 6.5 | 7 | 7 | 8 | 8 | **7.3** | 6.0 |
| /buffs/[id] | 7 | 8 | 8 | 8 | 9 | **8.0** | 5.3 |
| /biomes | 7 | 5 | 4 | 6 | 5 | **5.4** | 6.3 |
| /biomes/[id] | 5.5 | 7 | 7 | 7 | 7 | **6.7** | 6.0 |
| /armor-sets | 7 | 4 | 6 | 5 | 5 | **5.4** | 6.8 |
| /armor-sets/[id] | 7.5 | 4 | 6 | 4 | 2 | **4.7** | 7.0 |
| /projectiles | 6 | 6 | 6 | 7 | 6 | **6.2** | 6.3 |
| /categories | 7.5 | 8 | 8 | 7 | 8 | **7.7** | 3.5 |
| /categories/[id] | 7 | 8 | 8 | 7 | 8 | **7.6** | 3.3 |
| /crafting | 8 | 7 | 5 | 6 | 7 | **6.6** | 7.3 |
| /search | 7 | 7 | 7 | 8 | 8 | **7.4** | 7.0 |
| /search-tool | 7 | 7 | 5 | 6 | 6 | **6.2** | 6.0 |
| /articles | 7.5 | 8 | 8 | 8 | 8 | **7.9** | 7.0 |
| /articles/[slug] | 8 | 3 | 5 | 2 | 2 | **4.0** | 7.8 |
| /about | 7 | 8 | 8 | 9 | 9 | **8.2** | 7.0 |
| /user 认证三页 | 7.5 | 8.7 | 7.8 | 9 | 9 | **8.4** | 7.5 |
| /user 内页五页 | 7* | 8.6 | 7.6 | 8.6 | 8.3 | **8.1** | 7.5 |
| /user/articles 编辑器 | 7* | 7 | 7.5 | 5 | 5.3 | **6.4** | 6.8 |
| /users/[id] | 7* | 8.5 | 6.5 | 8.5 | 9 | **7.9** | — |

\* 需登录页面视觉未复测,沿用上轮估值。
注:上轮均分为"视觉/功能"两维口径,本轮五维口径更严,同分值不可直接比较——重点看结论文字。均分下降的页面(items/armor-sets/articles-detail)多为"上轮只评了视觉+功能,本轮耦合/维护维度首次入表"暴露的存量债,并非回归。

**综合:6.9/10**(上轮 6.1)。P0+P1 承诺全部兑现且质量过硬(SSR/404/categories/抽屉/草稿保护五大项均实测通过);当前债务高度集中:`armor-sets/[id]`(4432 行)与 `articles/[slug]`(4088 行)两个巨石文件贡献了全站最低的 4 项维度分,CSS 迁移与 SSR 收尾(og:image/文章正文)是下一轮的确定性收益。
