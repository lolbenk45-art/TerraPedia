# 深色底与光泽的统一 · 设计说明

**日期：** 2026-08-01
**分支：** `ux/detail-pages-redesign`
**状态：** 已定稿，待实施计划

## 问题

页面大多是黑的，信息密度够但重要元素凸显不出来。根因有两条，且都不是"光泽不够"：

**一、唯一的景深线索是个空操作。** 深色底是 `#050806`，而阴影令牌是 `0 24px 70px rgba(0,0,0,.34)`。在近黑底上黑色阴影不可见，所以真正还在区分层次的只有金色描边的 `.18` / `.26` 两档。深色界面要立体靠的不是投影，是光。

**二、每个页面各写各的背景，四个维度全在打架。** 实测：

| 页面 | 底色来源 | 光的形态 | 落点 | 颜色 |
|---|---|---|---|---|
| 首页 `.home-screen` | `#0b120c` 硬编码 | radial circle 28rem | `16% 8%` | 金 `.08` |
| 物品/NPC 列表 `.entity-screen` | `var(--index-bg)` | 无光，仅向下压暗 | — | — |
| 文章列表 `.article-screen` | `var(--index-bg)` | 无光 | — | — |
| 文章资料库 | `var(--tp-color-page)` | radial 椭圆 760×380 | `74% 8%` | 绿 `.11` |
| 物品/NPC 详情 | 125deg 三段 mix | 斜向 linear，非 radial | 全幅 | moss + accent |
| 错误页 | 三段 180deg | 两个 radial | `22%18%`+`78%10%` | 金 `.12` + 青 `.10` |

底色四种来源、光的形态四种、落点各异、颜色三种、强度 `.08`–`.18`。制作页另有一整套私有栅格变量。

**还不止 screen 层。** 对象级也各自带光——`/items` 的卡墙 `.catalog-wall-shell` 自带两个 radial（金 `.10` @ `72% 28%` + 绿 `.08` @ `18% 72%`）与一套自己的栅格。所以"每页不一样"实际比上表更严重：同一页里 screen 与卡墙可能各有一套互不相干的光。

改一次光要动 6 处 CSS × 3 个主题，且没有任何机制拦得住第七套出现。

## 目标

背景一套、光泽一套，两层各自独立管理，全站统一。光的作用是把眼睛引到每页的重要元素上。

## 已定决策

| 项 | 决定 | 依据 |
|---|---|---|
| 统一配方来源 | **首页** | 首页底 `#0b120c` 比令牌 `#050806` 亮一档，是全站最不闷的一页 |
| 光的颜色 | 金 `rgba(214,177,90, …)` | 采自首页 |
| 光强 | **`.08`** | 用户选定，即首页原值 |
| 光的射程 | `circle … 28rem` | 采自首页 |
| 锚定方式 | **元素锚定**，非坐标锚定 | 见下 |
| 落地范围 | **仅试点两页**：`/items`、`/articles/archive`，仅深色 | 用户选定，零风险可回退 |
| 令牌提升 | 试点期**不动** `:root` | 同上 |

### 为什么是元素锚定

「光跟着重要元素走」这件事本身不贵，贵的是**锚是什么**：

- **锚是坐标**（`at 74% 8%`）→ 贵。坐标和内容无关，改版式要重调，响应式要再写一套断点。现有六套背景全是这么长出来的。
- **锚是元素** → 便宜。光由焦点元素自己发出，页面侧成本是**一个 class**，没有坐标、没有断点、没有主题分支；改版式、换断点、移动端重排，光自己跟上。

元素锚定还额外带来一件事：「每屏至多一个焦点」变成**可断言的**——数一下 `tp-gloss-focus` 出现几次即可。「不要太过」由规则守住，不靠后来人的自觉。坐标锚定做不到，因为光和元素没有关系，数不出来。

## 设计

### 两层结构

新建 `assets/css/domains/ground-gloss.css`。`css-ratchet` 只剩 1 行余量，禁止再往 `hifi-preview.css` 加行。

**背景层**

```css
.tp-ground {
  position: relative;
  isolation: isolate;
  background:
    var(--index-grid-x),
    var(--index-grid-y),
    linear-gradient(var(--tp-ground-base), var(--tp-ground-base));
  background-size: 40px 40px, 40px 40px, auto;
}

[data-theme="dark"] .tp-ground {
  --tp-ground-base: #0b120c;
  --tp-color-page: var(--tp-ground-base);
}

/* 浅色主题整体压平：不上栅格、不改底，保持改动前逐像素一致 */
:where([data-theme="morning-paper"], [data-theme="warm-slate"]) .tp-ground {
  background: var(--tp-color-page);
}
```

**层叠顺序**：`ground-gloss.css` 必须在 `assets/css/domains/index.css` 里**最后**导入。`.tp-ground` 的特指度是 `(0,1,0)`，与 `.screen`、`:where(…) .article-archive-approved-screen` 相同（`:where()` 特指度为 0），只能靠源序取胜。

那行 `--tp-color-page` 重定义是整套方案能被试点的关键：卡面公式一个字不改，底一提亮，子树内所有由底推导的面自动跟上，层次不会反。

`isolation: isolate` 建在**背景层**而不是焦点元素上——这决定了绘制顺序的正确性，见「边界」一节。

**光泽层**

```css
:root {
  --tp-gloss-hue: 214, 177, 90;
  --tp-gloss-alpha: .08;
  --tp-gloss-reach: 28rem;
}

.tp-gloss-focus {
  position: relative;
}

.tp-gloss-focus::before {
  content: "";
  position: absolute;
  inset: -140px 0;
  z-index: -1;
  pointer-events: none;
  background: radial-gradient(
    circle at 50% 36%,
    rgba(var(--tp-gloss-hue), var(--tp-gloss-alpha)),
    transparent var(--tp-gloss-reach)
  );
}

:where([data-theme="morning-paper"], [data-theme="warm-slate"]) .tp-gloss-focus::before {
  display: none;
}
```

`inset` 取**纯垂直**溢出（`-140px 0`）：水平不外扩就不会产生横向滚动，因而 `.tp-ground` 不需要任何 `overflow` 声明——这一点对保住 sticky 分页 dock 至关重要，见「边界二」。

### 试点落地

| 页面 | screenClass 改动 | 焦点容器 | 需一并清理 |
|---|---|---|---|
| `pages/items/index.vue` | `catalog-screen` → `catalog-screen tp-ground` | `.catalog-wall-shell` | 删除该元素自带的两个 radial 与私有栅格 |
| `pages/articles/archive.vue` | 追加 ` tp-ground` | `.article-archive-page-shell`（Board 根元素，卡片与列表两种视图共用） | 删除 screen 上的绿色 radial 与 `background-attachment: fixed` |

焦点容器选的都是**稳定存在**的外层，不是条件渲染的网格本身（`.catalog-wall-grid` 在加载态/空态下不存在，光会跟着消失）。

### 晋级路径

试点代码即最终代码，不返工：

1. 其余页面陆续给 screenClass 追加 `tp-ground`，并各自指定一个焦点容器。
2. 全站铺完后，把 `--tp-color-page: #0b120c` 从 `.tp-ground` 上移到 `:root` 的深色块，删掉 `.tp-ground` 里的局部覆盖。
3. 各页自写的 radial / 斜向 linear 背景随之删除。

令牌定义自始至终只有一处，晋级不需要改动令牌值。

## 边界与越界分析

以下十条逐条核过。**第六至第十条是 spec 初稿写完后 review 挖出来的**，初稿有实质缺陷，已修正。

**一、绘制顺序：`isolation` 必须在背景层，不能在焦点元素上。**
若把 `isolation: isolate` 建在 `.tp-gloss-focus` 上，`z-index: -1` 的 `::before` 会绘制在该元素**自身背景之上**、内容之下——光会给焦点元素本身染色，而不是洒在它背后的页面上。正确顺序要求焦点元素**不建立层叠上下文**，由 `.tp-ground` 建立：此时绘制顺序为「底与栅格 → 负层级的光 → 内容」，光落在栅格之上、卡片之下，与首页现有观感一致。

推论（实施与合同都要守）：焦点元素不得带 `transform`、`filter`、`opacity < 1`、`will-change` 等会创建层叠上下文的属性，否则光会失效。

**二、不得给 `.tp-ground` 加 `overflow: hidden`。**
资料库的分页 dock 是 `position: sticky`。祖先一旦 `overflow: hidden` 就会创建滚动容器，sticky 立即失效。因此光泽层改用**纯垂直**溢出 `inset: -140px 0`：水平方向不外扩，天然不产生横向滚动，也就不需要任何 `overflow` 声明。这条要在验收里实测 sticky 仍生效。

**三、`--tp-color-page` 重定义的涟漪已实测封闭。**
全站有 60 处消费该令牌，其中一部分（`--npc-sunken-bg: color-mix(page 62%, transparent)` 等）是把它当**暗端**用的——底提亮会让这些"下沉面"反而变亮，层次倒置。逐文件核查试点两页的子树：

- `assets/css/domains/catalog.css`（物品列表）：**0 处**
- `assets/css/domains/public-layout.css`、`assets/css/primitives.css`（导航与页脚）：**0 处**
- 资料库段落：**4 处**，方向全部符合预期——`--article-archive-plate` 跟着提亮；卡面由 `color-mix(surface 72%, transparent)` 半透明合成，底一亮自动跟上；角标 scrim `color-mix(page 72%, transparent)` 略微提亮，可接受。

倒置风险集中在**详情页**（npc/item），不在试点范围。全站晋级前必须重做本项分析。

**四、浅色主题必须完全不受影响。**
`#0b120c` 打到 morning-paper 上是灾难。因此底色覆盖**只在 `[data-theme="dark"]` 下生效**，浅色的 `--tp-ground-base` 回落到未改动的 `--tp-color-page`；光泽层在两个浅色主题下 `display: none`。验收需覆盖三主题。

**五、`background-attachment: fixed` 被移除。**
资料库现有背景用了 fixed（栅格不随滚动移动）。首页配方不含 fixed，统一后一并去掉。这是可见的观感变化：栅格改为随内容滚动。同时也去掉了 fixed 在长页上的合成开销。

**六、【review 修正】浅色主题差点被破坏。**
初稿只让 `--tp-ground-base` 在浅色下回落到 `--tp-color-page`，但 `.tp-ground` 的 `background` 简写仍会把**栅格铺到浅色主题上**。而现有合同明确要求「article archive light routes must flatten to the shared page token」——浅色是刻意压平、不上栅格的。初稿会同时违反该合同和本 spec 自己「浅色逐像素无差异」的验收条件。已改为在浅色下整体压平 `background: var(--tp-color-page)`。

**七、【review 修正】层叠顺序原本未定义。**
`.tp-ground`、`.screen`、`:where(…) .article-archive-approved-screen` 特指度全是 `(0,1,0)`，胜负只由源序决定，而初稿没写导入位置。已明确：`ground-gloss.css` 在 `domains/index.css` 中最后导入。实施时需实测确认，不能只靠推理。

**八、【review 披露】`/items` 会新增栅格纹，这超出「提亮 + 加光」的字面范围。**
`.catalog-screen` 自身没有任何背景规则，该页现在吃的是通用 `.screen { background: #050806 }`——**平的，没有栅格**。套上 `.tp-ground` 后该页会首次出现栅格纹。这是统一的应有之义（首页配方含栅格，多数页面也有），但属于可见变化，必须事先声明而不是夹带。

**九、【review 修正】初稿低估了 `/items` 的工作量。**
初稿把试点描述成"每页加两个 class"。实际 `.catalog-wall-shell` 自带两个 radial 与一套私有栅格：若不清理，卡墙自己的背景会盖住身后的统一光（该元素 `position: relative` 且 `z-index: auto`，不建立层叠上下文，`::before` 会逃逸到 `.tp-ground` 层绘制在卡墙**之后**），最终只在卡墙四周露出一圈边缘光——既不是批准的观感，又是三套光叠在一起，正是要消灭的"太过"。因此 `/items` 的清理工作已写入落地表。

**十、【review 披露】光泽几何与你批准的台上版本不同。**
台上「统一后」用的是 `inset: -52% -22%`（含水平外扩），spec 为规避横向滚动风险改成了 `inset: -140px 0`。发光盒子变窄会改变观感——同样 `.08` 在更小的盒子里读起来更集中。实施后必须与台上版本对照；若明显偏强或偏弱，调 `--tp-gloss-reach`（射程），**不调 `--tp-gloss-alpha`**，因为 `.08` 是你定的。调整结果需回报，不自行拍板。

## 合同改动

| 脚本 | 改动 |
|---|---|
| `check-public-pages.mjs` | `publicShellClasses` 中 `pages/items/index.vue` 与 `pages/articles/archive.vue` 两条追加 `tp-ground` |
| `check-front-layout-layering-contract.mjs` | 「archive dark route 必须使用 token-owned grid、radial field 与 fixed page ground」这条断言要求页面自写 radial 背景，与新系统直接冲突，须**改写而非删除**——替换为等价强度的新断言：该路由的深色底必须由 `.tp-ground` 提供。覆盖面只可平移，不可净减 |
| 新增断言 | ① 每个路由 `tp-gloss-focus` 至多出现 1 次；② 带 `tp-ground` 的页面不得在其 screen 选择器里自写 `radial-gradient`；③ `ground-gloss.css` 中 `isolation: isolate` 必须在 `.tp-ground` 上而非 `.tp-gloss-focus` 上 |

前两条断言把「不要太过」和「不再长出第七套背景」变成机器可查的规则；第三条锁住上面「边界一」那个一旦写错就静默失效的绘制顺序。

## 验收

- `pnpm run check` 退出码 0
- 试点两页 × 三主题（dark / morning-paper / warm-slate）截图人工核验；两个浅色主题下与改动前**逐像素无差异**
- 实测资料库分页 dock 的 sticky 仍生效
- 实测两页在 1440 与 390 视口下横向溢出为 0
- 对比试点前后：卡面与底的明度关系不得反转（面仍亮于底）
- 实测 `.tp-ground` 确实赢得层叠（边界七不能只靠推理）
- 与台上批准版本对照光泽观感（边界十）；如需调 `--tp-gloss-reach` 须回报，不自行拍板

## 明确不做

- **不动 `:root` 令牌**：底色提亮在试点期只作用于 `.tp-ground` 子树。
- **不碰详情页、首页、制作页、错误页**：它们各自的背景保持现状，本轮不统一。
- **不加元素级光泽**（描边高光、表面渐变、外发光晕）：本轮只做背景层的光。这些是另一个议题，需要时单独立项。
- **不改浅色主题的任何观感**。
