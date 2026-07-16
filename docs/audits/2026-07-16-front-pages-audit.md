# TerraPedia 前台页面评分审查报告

- 审查分支:`review/front-pages-audit`(自本地 main `e2bad1b` 拉出)
- 审查日期:2026-07-16
- 证据:54 张全页截图(27 个路由 × 1440px/375px 两档,另加 4 张 morning-paper 亮色主题),位于 `front-nuxt/tmp/visual-audit-shots/`;代码级审查覆盖 `pages/`、`components/`、`composables/`、`assets/css/`
- 环境:本地栈 front:15177 / back:18191,全部 27 个路由返回 200,双视口均无水平溢出

## 一、总评

| 维度 | 得分 (10) | 一句话结论 |
|---|---|---|
| 视觉识别与品牌 | **8.5** | 暗金+墨绿的泰拉瑞亚风格独特、统一、完成度高,是全站最强项 |
| 设计系统与 CSS 架构 | **4** | 17k 行 CSS,10k 行单体 + 4 层 "fixes" 补丁文件,54 处 `!important`,15 种断点 |
| 布局与响应式 | **6** | 无横向溢出,但无移动端菜单、悬浮分页坞遮挡内容、部分移动页超长 |
| 排版与对比度 | **7** | Noto Sans SC 变量字体,暗色对比达标;存在 10–11px 小字与裸枚举文案 |
| 功能完整性(图鉴) | **6** | 列表页三态/URL 同步完整;但有硬编码断链 bug、假占位页、死胡同列表 |
| 数据获取与 SEO | **4** | 几乎全部 `server: false`,详情页 SSR 输出是空骨架;软 404;模板化 description |
| 加载/空/错三态 | **6.5** | 覆盖面好,但错误分支多数不可达(fetcher 吞错),翻页必闪骨架 |
| 可访问性 | **6** | 172 处 aria-label、菜单 role 语义完整;无 skip-link,焦点样式仅 7 条规则 |
| 用户区与表单 | **7.5** | 表单质量高(label/autocomplete/aria-live 齐全);编辑器无自动保存与离开确认 |
| **综合** | **6.1** | 皮肤优秀、骨架(架构/SEO/一致性)欠账多 |

## 二、视觉评审(证据:截图)

### 2.1 强项
- **品牌一致性**:全站统一暗底(#050806)+ 金色强调(#d6b15a)+ 像素画风资产,首页 hero、物品墙、Boss 卡、合成树视觉语言统一,辨识度远超一般资料站。
- **三主题体系**:dark / morning-paper / warm-slate 通过 `data-theme` 切换(stores/theme.ts),cookie 持久化并同步账号偏好;亮色主题物品墙(light-items-index)整体协调。
- **共享组件质量**:`PreviewImage.vue` 具备 fallback 字形/图标、lazy、`decoding="async"`、width/height 声明、可见区自动居中;`PaginationDock` 页码窗口、跳页、aria 完整。

### 2.2 截图发现的具体问题
1. **悬浮分页坞遮挡内容**(bosses-index、npcs-index、buffs-index、projectiles-index 桌面截图):sticky 分页条悬停在视口中部,直接压在第一行卡片文字上。全页截图暴露它在滚动中会持续遮挡卡片。
2. **裸枚举文案泄漏**:Boss 卡片直接显示 `PRE_HARDMODE` / `HARDMODE` / `EVENT`(bosses-index),筛选按钮却是中文"困难模式前"——同一页面两套文案。
3. **数据缺口以噪声形式暴露**:projectiles 每张卡都挂"伤害未标记 · 击退未标记"双 chip ×1111 条;buffs 列表末排(暗影珠/中毒/黑暗/诅咒等)图片全为空框。缺数据应折叠为占位,而不是重复宣告。
4. **404 体验**:`/items/99999999` 返回 HTTP 200,标题排版断裂("…未找到**没**\n有找到这个物品"),详情缺失页面语义是软 404。
5. **空模块堆叠**:items-detail 中"可用于制作/装备属性/来源分组/状态效果"四个 0 条模块仍各占一整块面板,信息密度低;右侧"资料概览"又把同样的空态复述一遍。
6. **移动端超长页**:crafting 移动端全页高 12486px(合成树未做移动折叠),biomes 详情 7450px(数百条掉落平铺、大量未翻译英文名 Wood/Daybloom/Sunflower),home 移动端 8042px(页脚链接农场占两屏半)。
7. **亮色主题下的暗色残留**:articles 详情在 morning-paper 下,正文中嵌入的合成树面板仍是全暗底块,与米色页面割裂;金色链接在米底上偏浅。
8. **移动导航无菜单**:≤860px 时主链接行变横向滚动(隐藏滚动条),"资料/账号"下拉仍是 hover 优先设计;无汉堡菜单、无移动端专用面板。

### 2.3 CSS 架构(视觉债的根)
- `assets/css/` 共 **17,118 行**:`hifi-preview.css` 单文件 **10,083 行**(含全部主题、组件、页面样式),之上叠着 `catalog-image-fixes.css`(1,866)、`light-theme-contrast-fixes.css`(910)、`mobile-typography-fixes.css`(616)、`discovery-page-fixes.css`(482)四层**补丁文件**——命名即自白:问题不在源头修,靠后置覆盖。
- `!important` 54 处,全部集中在 hifi-preview.css。
- 断点体系失控:CSS + Vue 内联样式合计出现 **430/520/640/720/760/780/820/860/900/960/980/1020/1024/1080/1180** 十五种宽度,主力是 720/1180,其余是各页自造。
- `tokens.css` 定义了完整的 `--tp-*` 语义层(色彩/字号/间距/圆角),但它只是把 hifi-preview 的私有变量转发了一遍;页面 scoped 样式(约 7,548 行)大量直接用底层变量或裸值,语义层没有成为唯一入口。
- 小字号:hifi-preview 中 9–11px 字号 37 处(徽标、chip、eyebrow),移动端可读性风险。
- 正面:`prefers-reduced-motion` 有 4 处处理;图标为 sprite/SVG 体系,无 emoji 图标(仅 `▾` 一处字符箭头)。

## 三、功能评审(代码级)

### 3.1 图鉴/数据页(由专项审查得出,已核实关键点)

**数据获取架构是最大缺陷(5/10)**:所有公开数据 composable(`usePublicItems/Npcs/Bosses/Buffs/Biomes/ArmorSets/Projectiles/RecipeTree` 及全部 Detail)一律 `server: false`。`usePublicApi.ts:17` 明明已配好服务端直连(`apiServerBase`),但只有首页和 search.vue 用了。后果:
- 详情页 SSR HTML 里没有任何实际内容,只有骨架 → SEO 半残;
- `useSeoMeta` 的"动态 title/description"在爬虫视角永远是兜底模板("TerraPedia · 物品 757");
- 无 `createError({ statusCode: 404 })`,全站软 404。

**确认的功能 bug**:
1. `pages/buffs/[id].vue:199` — 来源/施加者/免疫目标条目**全部硬编码 `href="/items"`**,不管条目是物品还是 NPC,点击一律跳物品列表首页。
2. **搜索参数跨页断链**:`search.vue:30`、`categories/[id].vue:29`、`search-tool.vue:26-28` 生成 `/items?search=xxx`,但 `items/index.vue:435` 只读 `q` → 关键词静默丢失(npcs 页兼容两者,items 页不兼容)。
3. `categories/index.vue:32-40` **硬编码假计数**(932/684/1186/1408/318),`categories/[id].vue` **完全忽略路由参数**——任何分类 id 显示同一份静态内容,内链还指向失效的 `?search=` 形式。两页实为占位假页。
4. `crafting/index.vue:346` 错误重试块**不可达**:`fetchPublicRecipeTree` 吞掉所有错误返回 missing,`recipeError` 永不为真;树加载失败时区域直接消失、无重试入口。所有列表/详情页的 `xxxError` 判断同理均为死代码(fetcher 全部 catch 后返回 fallback,永不 reject)。
5. **列表→详情用原生 `<a>` 而非 NuxtLink**(items/bosses/npcs/biomes/buffs 全中招,唯 armor-sets 用对了)——每次进详情整页刷新,丢 SPA 路由、预取和回退滚动位置。
6. items 分类筛选存在重复/挂错映射:"机关"和"电路"同指 `TOOL_CIRCUIT`,"方块"和"平台"同指 `MATERIAL_BLOCK`(items/index.vue:78-79,100-104)——两个按钮结果完全一样。
7. biomes 列表是唯一**无 URL 同步**的列表页(搜索/筛选刷新即丢);npcs 的 `categoryId` 支持 URL 读写但页面上没有任何 UI 能设置它(半成品)。
8. projectiles 卡片不可点击,列表是死胡同。
9. **样板代码复制 10 份**:`visual loading 最小时长`三件套逐字重复于 9 个页面;route-query 同步、防抖、钱币映射等各抄 3–10 份。急需 `useVisualLoading()` / `useCatalogRouteSync()` 收敛。
10. **死数据**:`fallbackCatalogItems` 生成 240 条假物品 + 配套本地筛选逻辑,但 `catalogFallbackUnavailable` 保证该分支永远不展示——整套是不可达代码。

**逐页功能完成度**:items/index 7.5、items/[id] 8、bosses/[id] 7.5、npcs/[id] 7.5、search 7、crafting 6.5、armor-sets/[id] 7(但 4,425 行单文件)、buffs/[id] **4.5**(断链 bug)、categories/index **2**、categories/[id] **1.5**。

### 3.2 用户区与文章(本体核查)

**强项**:
- 认证表单质量高:可见 label、`autocomplete="email/current-password/new-password"`、验证码 `inputmode="numeric" pattern`、密码规则 helper text、`aria-live="polite"` 错误播报、提交中禁用(login.vue:47-53、register.vue:71-94)。
- 路由守卫完整:`middleware/user-auth.global.ts` + 受保护页 `definePageMeta({ requiresUserAuth: true })` 全覆盖(settings/favorites/articles/new 等)。
- routes/favorites/notifications 均为完整实现(三态+分页+重试),不是占位页。
- 文章编辑器支持草稿保存/撤回投稿/删除草稿。

**弱项**:
- 编辑器**无自动保存、无 beforeunload/路由离开确认**(全文 grep 无 `onBeforeRouteLeave`/`beforeunload`)——长文误关即丢。
- 密码框无可见性切换。
- **手写正则 HTML 净化器**:`articles/[slug].vue:406` 起 100+ 行自制白名单 sanitizer 喂给 `v-html`(:2295)。正则解析 HTML 天然脆弱(嵌套/畸形标签、属性边界),虽然做了标签白名单+属性过滤+`on*` 拦截,但这是全站唯一的 XSS 面,建议换 DOMPurify 或在服务端净化。
- `articles/[slug].vue` 4,023 行单文件,渲染管线/TOC/引用预览/合成树嵌入全部内联。

### 3.3 可访问性与触控
- 正面:aria-label 172 处;导航菜单有 `aria-haspopup/aria-expanded/role=radiogroup` 语义;菜单支持 `focusin/focusout` 键盘路径 + Esc 关闭;items 列表有方向键翻页且正确排除输入框。
- 缺失:无 skip-link;`:focus-visible` 规则仅 7 条(相对 17k 行 CSS 覆盖面很小);hover 展开菜单在触屏上依赖点击兜底但无明确触屏交互设计;9–11px 字号 37 处;图片 `loading="lazy"` 主要靠 PreviewImage,页面直写 `<img>` 的位置(如 TerraNav logo、routes 卡片)未统一。

## 四、改进方案(按优先级)

### P0 — 一周内可完成的高收益修复
| # | 事项 | 位置 | 工作量 |
|---|---|---|---|
| 1 | 修复 buffs 详情关联条目硬编码 `/items` 断链,按 type 分发到 `/items/{id}`、`/npcs/{id}` | `buffs/[id].vue:199` | 0.5d |
| 2 | 统一搜索参数:items 页兼容 `search ?? q`(照抄 npcs 的写法) | `items/index.vue:435` | 0.5h |
| 3 | 列表→详情全部改 NuxtLink(items/bosses/npcs/biomes/buffs) | 5 个 index 页 | 0.5d |
| 4 | 悬浮分页坞加避让:限制 sticky 范围或提高 z 序时给卡片留 padding,消除遮挡 | PaginationDock 相关 CSS | 0.5d |
| 5 | Boss 卡枚举 `PRE_HARDMODE` → 中文标签(映射已存在于筛选按钮) | `bosses/index.vue` | 0.5h |
| 6 | 404 语义:详情未找到时 `createError({ statusCode: 404 })`,同时修复标题断行 | 6 个 [id] 页 | 0.5d |
| 7 | categories 两页:短期先把入口从导航"资料"菜单摘除或挂"建设中",移除假计数 | `categories/*` + TerraNav | 0.5d |

### P1 — 结构性改进(1–2 个迭代)
1. **详情页开启 SSR 取数**:去掉 detail composable 的 `server: false`(`apiServerBase` 已就绪),让 title/description/正文进入 SSR HTML;顺带补 canonical 与图鉴类 JSON-LD。这是对 C 端资料站 SEO 收益最大的单项。
2. **抽取共享 composable**:`useVisualLoading()`(最小时长骨架)、`useCatalogRouteSync()`(query 同步 + 防抖 + guard),消灭 10 份复制粘贴,顺带统一 items/npcs 缺失的防回环 guard;删除不可达的 fallback 假数据与本地筛选分支。
3. **错误通道打通**:fetcher 不再吞错(或返回结构化 `{ data, error }`),让页面上已经写好的"载入异常/重试"分支真正可达(crafting 树、各详情页)。
4. **移动导航重做**:≤860px 提供真正的菜单面板(汉堡或底部入口),替代横滚链接行 + hover 下拉;顺带处理触屏下拉交互。
5. **编辑器保护**:localStorage 草稿自动保存 + `onBeforeRouteLeave`/`beforeunload` 离开确认。
6. **净化器替换**:文章 `v-html` 改用 DOMPurify(白名单沿用现配置),或移到服务端净化后下发。

### P2 — 设计系统偿债(持续)
1. **CSS 分层重构**:目标是消化四个 "fixes" 补丁文件——把 light-theme/mobile-typography/catalog-image/discovery 的覆盖规则回并到源头组件样式;hifi-preview.css 按域拆分(nav/home/catalog/detail/article/footer)。
2. **断点收敛**:定为 520 / 720 / 1024 / 1180 四档,页面内自造断点迁移。
3. **令牌落地**:规定页面/组件样式只准引用 `--tp-*` 语义层;`!important` 清零计划。
4. **数据缺口降噪**:projectiles"未标记"chip 改为仅在有值时显示;buffs 空图标用 PreviewImage 的 fallback 字形;items 详情 0 条模块折叠为一行摘要。
5. **移动端长页治理**:crafting 树移动端默认折叠层级;biomes 详情掉落分组分页/标签页;首页页脚移动端折叠。
6. 小项:密码可见性切换、skip-link、`:focus-visible` 全局基线、9–11px 字号提升至 12px 起。

## 五、评分卡(逐页速览)

| 页面 | 视觉 | 功能 | 备注 |
|---|---|---|---|
| / 首页 | 9 | 7 | 全站门面,信息架构清晰;专题区硬编码死链风险 |
| /items | 8 | 7.5 | 三态/URL/键盘翻页最完整;筛选映射重复 |
| /items/[id] | 7 | 8 | 关联数据最丰富;空模块堆叠、面包屑裸 ID |
| /bosses | 7 | 7 | 分页坞遮挡、裸枚举 |
| /bosses/[id] | 8 | 7.5 | 掉落分组出色 |
| /npcs | 7.5 | 7 | 筛选面板完整;categoryId 半成品 |
| /npcs/[id] | 8 | 7.5 | 商店条件分组出色;加载态无骨架 |
| /biomes | 7 | 5.5 | 唯一无 URL 同步 |
| /biomes/[id] | 5 | 7 | 数据平铺过长、英文名未翻译 |
| /buffs | 6 | 6 | 末排空图、无类型筛选 |
| /buffs/[id] | 6 | 4.5 | 关联全断链(P0-1) |
| /armor-sets | 7 | 6.5 | 唯一用对 NuxtLink 的列表 |
| /armor-sets/[id] | 7 | 7 | 4,425 行单文件 |
| /categories, /categories/[id] | 5 | 2 | 假占位页(P0-7) |
| /projectiles | 6 | 6.5 | 死胡同 + 缺数据噪声 |
| /crafting | 8 | 6.5 | 桌面树很强;移动端 12k px、错误分支不可达 |
| /search | 7 | 7 | 唯一 SSR 搜索;`search` 参数自伤 |
| /search-tool | 7 | 5 | 硬编码计数、无错误态 |
| /articles | 7 | 7 | 卡片墙成熟 |
| /articles/[slug] | 8 | 7.5 | 阅读体验好;4k 行单文件 + 手写净化器 |
| /user/*(auth/中心/收藏/通知/路线) | 7 | 7.5 | 表单质量高、守卫完整 |
| /user/articles/*(编辑器) | 7 | 6.5 | 无自动保存/离开确认 |
| /about | 7 | 7 | 职责内完成 |
