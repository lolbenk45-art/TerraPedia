# 2026-08-01 · 深色底与光泽收成两套共享层

## 做了什么

把「页面底」与「光」从各页自写收成两个共享层，落地 `/articles/archive` 与 `/npcs`（仅深色）：

- **背景层 `.tp-ground`**：底 `#0b120c`（采自首页，比原令牌 `#050806` 亮一档）+ 站点标准 40px 栅格。整条规则只在 `[data-theme="dark"]` 下存在。
- **光泽层 `.tp-gloss-focus`**：金 `rgba(214,177,90,.08)` / `circle 28rem`（全部采自首页），由焦点元素自己发出，无坐标、无断点。

关键一行是 `.tp-ground` 里的 `--tp-color-page: var(--tp-ground-base)`：卡面公式一个字不改，底一提亮，子树内所有由底推导的面自动跟上，层次不会反。

## 为什么不是坐标

改动前全站有六套互不相同的背景：底色四种来源（`#0b120c` 硬编码 / `--index-bg` / `--tp-color-page` / 125deg 三段 mix）、光的形态四种（radial circle / radial 椭圆 / 斜向 linear / 完全没有）、颜色三种（金 / 绿 / 青）、强度 `.08`–`.18`。对象级还另有一层：`/items` 的卡墙自带两个 radial 与私有 34px 栅格。

它们全是坐标锚定（`at 74% 8%` 之类）。坐标和内容没有关系，改版式要重调、响应式要再写一组断点——这正是它们各不相同的来路。元素锚定后页面侧成本是一个 class，且「每屏至多一个焦点」变成可点数的合同断言：「不要太过」由规则守，不靠后来人的自觉。

## 试点为什么从 /items 换成 /npcs

原定第二页是 `/items`。实测它有 **9 个 radial + 7 处私有 34px 栅格**（站点标准 40px），分布在卡墙、卡墙 `::after` 光晕、多个子对象上，另有浅色镜像。统一它是独立项目而非试点；只清一部分会让该页与自身不一致，试点反而证明不了任何事。

`/npcs` 的 `entity-screen` 改动前完全没有光、域 CSS 零个 radial，正好演示「一个本来没光的页面得到统一的光」，且不牵扯任何旧包裹。**`/items` 另行立项。**

## 坑（改错都是静默失效，不会报错）

- **`isolation` 必须在 `.tp-ground` 上，不能在焦点元素上。** 建错地方时 `z-index:-1` 的 `::before` 会绘制在焦点元素**自身背景之上**，变成给它染色而不是照亮它身后。已加合同断言锁死。
- **焦点元素不得自带不透明面。** 光绘制在焦点身后，自带面会把它整个盖住，只在 `inset` 外溢处露一圈边缘光。初稿曾选 `.catalog-wall-shell` 作焦点，正是踩了这条。焦点要选自身无背景的布局容器（本次取 `.article-archive-page-shell` 与 `.entity-main-panel`）。合同已禁止 `.tp-gloss-focus` 声明 `background` / `transform` / `filter` / `opacity` / `will-change`。
- **`.tp-ground` 不得加 `overflow`。** 资料库分页 dock 是 `position: sticky`，祖先一旦创建滚动容器立刻失效。因此光只作垂直外溢（`inset: -140px 0`），水平不外扩，从根上不需要 `overflow`。合同已断言。
- **浅色必须是纯空操作，不是「压平」。** 初稿让浅色压平成 `background: var(--tp-color-page)`，会抹掉 `/npcs` 浅色本来就有的栅格（`.entity-screen` 没有浅色覆盖）。改成整条规则只在深色下存在后才真正无差异；副作用是特指度升到 `(0,2,0)`，正确性不再依赖导入顺序。
- **`check-public-pages.mjs` 的 `publicShellClasses` 结尾有个展开段**，会把所有未排除的公开页按 `'entity-screen'` 再写一遍。Map 里同 key 后写胜出，所以给 `/npcs` 单独加的条目会被静默覆盖——必须同时把该路径加进那段的排除列表。

## 可见变化（非缺陷）

- `/npcs` 失去顶部那条 `linear-gradient(180deg, …, rgba(5,8,6,.82) 420px)` 压暗带，首屏变亮。
- 资料库去掉 `background-attachment: fixed`，栅格改为随内容滚动；原来的绿色 radial 换成统一的金色。

## 验证

`pnpm run check` 退出码 0；`pnpm run build` 成功；两页 × 三主题共 6 张截图人工核验。脚本实测（1440×1100）：

```
dark/archive:          focus=1 glow=block isolation=isolate overflow=visible overflowX=0
dark/npcs:             focus=1 glow=block isolation=isolate overflow=visible overflowX=0
morning-paper/archive: focus=1 glow=none  isolation=auto    overflow=visible overflowX=0
morning-paper/npcs:    focus=1 glow=none  isolation=auto    overflow=visible overflowX=0
warm-slate/archive:    focus=1 glow=none  isolation=auto    overflow=visible overflowX=0
warm-slate/npcs:       focus=1 glow=none  isolation=auto    overflow=visible overflowX=0
sticky dock position = sticky
```

浅色下 `isolation=auto` 证明整条 `.tp-ground` 规则确实没有生效（而不是生效后被覆盖）；`overflow=visible` 与 `position=sticky` 证明分页 dock 未被破坏。`--tp-gloss-reach` 未做调整，`.08` 观感与设计台一致。

## 第二批：entity-screen 全家（同日追加）

用户在试点后指出真正让页面顺眼的是**栅格而非纯黑**，并点名 `/bosses`「隐约看得出有栅格，但只有上面一小部分，下面就是全黑」。

这条观察精确对应 `.entity-screen` 背景的第一层：

```css
linear-gradient(180deg, rgba(5, 8, 6, 0), rgba(5, 8, 6, 0.82) 420px)
```

从顶部透明渐变到 420px 处的 82% 不透明黑，**然后一直保持 82% 到页面底**。栅格只在最上面那截透得出来，往下被黑幕盖死。`.tp-ground` 接管背景后这层整个消失，栅格自此上下均匀——这不是"调亮了一点"，是把造成分层的那一层删掉了。

因此把 `entity-screen` 全家一起铺完：`/bosses`、`/buffs`、`/armor-sets`、`/biomes`。

**焦点锚点**取各页 `<main>` 下第一个内容 section（`.boss-command`、`.effect-hero-panel`、`.armor-command`、`.biome-command`），四个均已核实自身无背景。**没有**锚 `<main>` 本身：`radial-gradient` 的 `at 50% 36%` 是相对容器高度算的，锚在整页高的元素上会把光沉到页面中部而不是首屏。

`/crafting` 虽然也用 `entity-screen`，但它自带一整套私有变量与双层栅格，与 `/items` 一样另行处理。

第二批实测（1440×1100）：四页深色 `focus=1 glow=block iso=isolate ovf=visible overflowX=0`，浅色 `glow=none iso=auto`。`pnpm run check` 退出码 0。

**再次踩到同一个坑**：`publicShellClasses` 结尾的展开段会把未排除的公开页按 `'entity-screen'` 覆盖，四条新条目必须同时加进排除列表，否则断言静默失效。

## 第三批：全站适配（同日追加）

### 先做涟漪分析

铺全站之前先把之前标为「必须先做」的涟漪分析做掉。60 处消费 `--tp-color-page` 中，**24 处把它当暗端用**：

| 类别 | 数量 | 底提亮后 |
|---|---|---|
| 下沉面 / 井（`--npc-sunken-bg`、`--item-sunken-bg`、`--item-well-bg`、`--item-metric-bg`、`--item-price-bg`） | 5 | **层次倒置**——凹陷反而变亮 |
| 阴影（`0 20px 52px color-mix(page 27%, transparent)` 等） | ~12 | 削弱 |
| 压暗遮罩 | ~7 | 变弱 |

只有第一类是真问题，根因是：**这些「凹陷」把「底色」当成「比面更暗的东西」用**，而这个等式只在底是全站最暗时成立。

修法是给凹陷一个自己的令牌：

```css
/* tokens.css */
--tp-color-recess: var(--bg);   /* 凹陷是"挖到比地面更低"，不随底走 */
```

深色侧 7 处声明改指它（5 个背景 + 2 个配套边框）。因为 `--tp-color-recess` 与 `--tp-color-page` 当时都读 `--bg`，**落地当天零视觉变化**；提亮之后凹陷原地不动。

浅色侧的 4 处**没有**改：浅色底本轮不动，且浅色另有「必须通过既有主题令牌压平」的合同，为此引入新令牌会判红。断言相应收窄到只管混 `transparent` 的深色合成式。

### 底挂到布局层

原计划给每个页面 meta 逐个加 `tp-ground`。实际改在 `layouts/default.vue` 的 `screenClasses`：

```js
const screenClasses = computed(() => ['screen', 'tp-ground', ...routeScreenClass.value.split(/\s+/), 'active'])
```

一行覆盖全站，省掉 28 个页面 meta 和 28 条合同条目。且因为该 `<section>` 包住导航、正文与页脚，`.tp-ground` 里的 `--tp-color-page` 重定义自然作用于整个子树——**等于同时完成了「提升到 :root」和「各页挂载」两步**，不需要再单独改令牌。

`[data-theme="dark"] .tp-ground` 特指度 `(0,2,0)`，压过各页自写的 screen 规则（含详情页的 `[data-theme="dark"] .item-detail-approved-screen`，同为 `(0,2,0)` 但 ground-gloss.css 后导入）。因此详情页的 125deg 斜向渐变、首页的硬编码底、`.entity-screen` 的 420px 黑幕全部自动让位。

之前六页 meta 上的 `tp-ground` 与合同里对应条目已一并还原。

### 全站实测

```
深色: page=#0b120c  recess=#050806  iso=isolate   （凹陷不跟着走）
浅色: page=#f3ead8  recess=#f3ead8  iso=auto      （规则确实未生效）
```

首页 / 物品 / 制作 / 搜索 / 关于 / 三类详情页 均 `http=200`、`overflowX=0`。物品详情页人工核验：核心数值指标块、买入/售出价格块、合成链 L1–L3 井，全部仍明显暗于所在面板，**无倒置**。`pnpm run check` 退出码 0。

### 仍未收编

`/items` 卡墙的 9 个 radial 与 7 处私有 34px 栅格、`/crafting` 的私有双层栅格与它自己那条 420px 82% 黑幕（`--crafting-grid-wash`）——都是**对象级**的光与纹理，不在 screen 层，所以没有被这次接管。它们现在坐在统一底之上，不冲突但仍不统一。另行立项。

## 晋级路径（未做）

试点代码即最终代码，不返工：其余页面陆续给 screenClass 追加 `tp-ground` 并各指定一个焦点容器；全站铺完后把 `--tp-color-page: #0b120c` 从 `.tp-ground` 上移到 `:root` 深色块，删掉局部覆盖。令牌定义自始至终只有一处。

**全站晋级前必须重做涟漪分析**：全站有 60 处消费 `--tp-color-page`，其中一部分（`--npc-sunken-bg: color-mix(page 62%, transparent)` 等）把它当暗端用，底提亮会让这些「下沉面」反而变亮、层次倒置。这些集中在**详情页**，不在本次试点范围。
