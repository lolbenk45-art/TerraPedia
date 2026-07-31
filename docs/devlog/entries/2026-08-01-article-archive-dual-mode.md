# 2026-08-01 · 文章资料库双模式

## 做了什么

`/articles/archive` 从单一四列紧凑卡改成「共用头部 + 卡片/列表双正文」：

- **卡片视图（默认）**：三列信息卡，150px 顶封面带、两行摘要、页脚分作者与数据两组。
- **列表视图**：62px 索引行，44px 缩略 + 标题 + 单行摘要 + 作者/发布/浏览/互动右对齐列。
- **视图偏好存 cookie** `terrapedia-archive-view`，与 `terrapedia-theme` 同机制，SSR 首屏直出正确正文，无水合闪烁。
- **封面按原生尺寸分流**：最长边 < 400px 的游戏精灵图 `pixelated` 不平滑放大，≥ 400px 的照片/截图走 `cover` 裁切。此前 12 张封面里 8 张被插值拉成马赛克。
- 去掉在 12 张卡上重复 12 次的「公开手札」文本行，收成封面带角标；篇数从三处重复收到标题行一处（`article-archive-page-range` 页脚行随之删除）。

组件按职责拆开：`ArticleArchiveBoard`（工具条 + 视图控件 + 错误/空态）→ `ArticleArchiveCardGrid` / `ArticleArchiveList` 两种正文，封面分流与失败降级抽到共用的 `ArticleArchiveCover`。取数、搜索、分页、302 越界重定向、`article-discovery-archive-compat` 中间件一行未动。

## 明确没做

**排序控件没有做。** 后端 `/articles` 只收 `page/limit/size/keyword`，没有 `sort` 参数，现在画出来就是假控件。已在 `check-front-layout-layering-contract.mjs` 加负向断言锁死：archive 的页面与三个组件出现「排序」`sortBy` `sortOrder` `orderBy` 任一标记即判红。要做排序需单独授权一份后端改动（Controller + Service + Mapper 加白名单排序字段）。

**卡片页脚不再显示点赞/评论/收藏**，只留作者 + 日期 + 浏览；三项互动数移到列表视图的「互动」列。「仅在计数为正时渲染」的合同断言随之从卡片组件迁到列表组件。

**作者头像用装饰性渐变圆点**（`aria-hidden`），没有拉 `authorAvatarUrl`——与设计稿一致，也不新增一条图片失败降级路径。

## 坑

- `public-article-cover-fallback` 的基础样式藏在 `pages/articles/index.vue` 的 scoped 块里，archive 复用同名 class 必须在 `detail-pages-redesign.css` 里自带一份，否则静态合同全绿但页面静默失样。列表视图的 44px 井需要单独一条规则，**不能**和卡片那条合并成逗号选择器——分层合同的正则要求 `.article-archive-card__cover .public-article-cover-fallback` 后面直接跟 `{`。
- 精灵/照片分流依赖 `img.naturalWidth`，服务端量不到，首帧一律按 `sprite`（`contain`）渲染，再在 `@load` 里升级。默认取 `contain` 是因为它永不裁切，猜错也不会切掉画面。
- 分层合同用 `lastIndexOf('@media (max-width: 900px)')` 切 archive 的断点片段，1180/900/640 三块必须按序保留，删掉中间任何一块都会让切片落空、断言静默退化成空字符串匹配。
- 封面降级的逐字断言散在 **两个** 脚本里：`check-preview-image-fallback-contract.mjs` 和 `check-user-module-contract.mjs` 的 `articleIndexPresentationContracts`。抽出 `ArticleArchiveCover` 时两处都要改，只改前者会在 `pnpm run check` 的第二步才炸。
- `check-front-layout-layering-contract.mjs` 原本用 `readFileSync` 直读组件，文件不存在时整个脚本 ENOENT 崩掉、把其余违规一起吞掉。已加 `readOptional`，缺文件现在报成一条条断言违规。

## 遗留（本次未处理）

`pnpm run check:loading-skeleton` 在本分支上**改动前就是红的**：`pages/armor-sets/[id].vue` 缺 8 个 `armor-detail-loading-*` 骨架标记。该脚本没有被挂进 `pnpm run check`，所以一直没人发现。与本次改动无关，未纳入范围。

## 验证

- `pnpm run check` 退出码 0（24 个合同 + `nuxt typecheck` 全绿）
- `pnpm run test:unit` 65/65 通过
- `pnpm run build` 成功
- 1440 与 390 两个视口 × 卡片/列表四张截图人工核验，四种组合横向溢出均为 0
- SSR 直取验证：`Cookie: terrapedia-archive-view=list` 时服务端返回的 HTML 里直接就是列表行、零张卡片，反之亦然——证明没有「先闪卡片再跳列表」
- 三主题（dark / morning-paper / warm-slate）卡面、封面带、角标与页面底色分层正常
