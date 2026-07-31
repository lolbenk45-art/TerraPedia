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

## 晋级路径（未做）

试点代码即最终代码，不返工：其余页面陆续给 screenClass 追加 `tp-ground` 并各指定一个焦点容器；全站铺完后把 `--tp-color-page: #0b120c` 从 `.tp-ground` 上移到 `:root` 深色块，删掉局部覆盖。令牌定义自始至终只有一处。

**全站晋级前必须重做涟漪分析**：全站有 60 处消费 `--tp-color-page`，其中一部分（`--npc-sunken-bg: color-mix(page 62%, transparent)` 等）把它当暗端用，底提亮会让这些「下沉面」反而变亮、层次倒置。这些集中在**详情页**，不在本次试点范围。
