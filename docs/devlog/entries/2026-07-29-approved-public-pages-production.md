# 已确认公共页面正式接入

## Status

`active`

## Goal

将已确认的物品详情、NPC 详情与文章页高保真稿接入 `front-nuxt` 正式路由，保持现有公开接口和三主题令牌契约。

## Scope

- 物品：`pages/items/[id].vue`，以 `item-complete-page-terra-blade-approved-v2.html` 为定稿来源。
- NPC：`pages/npcs/[id].vue`，以已确认 NPC 样本为定稿来源；按接口能力渲染居住、到访、掉落和商店模块。
- 文章：`pages/articles/index.vue`，以 `articles-story-led-v22.html` 的“精选首屏 + 高密度文章库”结构为定稿来源。
- 实施计划：`docs/superpowers/plans/2026-07-29-approved-public-pages-production.md`。
- 保真重建计划：`docs/superpowers/plans/2026-07-29-public-pages-fidelity-rebuild.md`；该计划替代旧计划的“在共享 detail-layout 上叠加版式”实施方向。

## Boundaries

- 不修改 API、数据库、爬虫、`reports/` 或未确认的 `docs/design/terrapedia-*-detail-hifi-v1.html`。
- 不把当前旅商接口的 35 项可用商店数据称为完整 Wiki 货池。
- 不处理合成树数量污染、商人节日图像错配或后端/数据库数据修复；这些保持独立立项。

## Validation plan

- 纯展示派生先通过 Node 单测红绿验证。
- 运行 detail/public-page/visual-system 定向契约与 `pnpm run check`。
- 在 1440px 和 390px 实测物品、城镇 NPC、旅商 NPC 与文章列表。

## Result

- 已接入物品、NPC 与文章正式页面展示层：物品和 NPC 复用现有实时详情字段及共享 detail-layout；文章以实时已发布列表的首条作为精选，余项进入高密度资料库。
- NPC 模块按能力决定是否展示；旅商的商店区明确为当前接口可用数据，不声明为完整 Wiki 货池。
- 新增纯展示 helper 及红绿单测；新页面域样式只使用既有三主题语义令牌和冻结响应式断点。See git for code-level diff details.
- 本轮按确认稿进一步收敛：实体页手机端保留缩略图与事实并列；商人/旅商以商店作为首个工作模块；旅商身份优先于错误的城镇标记；文章精选 fold 改为标题、编号和元数据优先，封面仅作辅助识别。See git for code-level diff details.
- 物品详情的关系数据在 SSR 中已恢复：在第一个请求前捕获公开 API 客户端，避免异步边界后的 Nuxt 上下文丢失使可选关系被吞为空值；泰拉刃现显示真实合成树和制作用途。See git for code-level diff details.

## Validation

- `cd front-nuxt && node --test tests/unit/detailPagePresentation.test.mjs`：3/3 通过，覆盖异步边界后仍可使用已捕获 API 客户端、商店优先与旅商优先于城镇标记。
- `cd front-nuxt && pnpm exec nuxt typecheck`：通过；环境已有重复 auto-import 与 Node 弃用警告不影响退出码。
- `cd front-nuxt && pnpm run check`：通过，包含公共页面、详情布局、视觉令牌、断点与 `nuxt typecheck` 全量契约；Chromium DBus/GPU 与 Node 弃用提示不影响退出码。
- 运行态：`/items/757`、`/npcs/17` 和 `/articles` 在 1440×1000 与 390×844 均为 `overflowX: 0`，无 console/request errors；泰拉刃 SSR 已显示真实合成树与用途。

## Residual risk

- 合成树恢复后其数量、版本命名和递归深度仍完全以既有 API 为准；本任务不修正数据质量。
- 已明确排除的合成树数量污染、商人节日图像错配、旅商完整 Wiki 货池仍待独立任务。

## Follow-up

- Owner: data/API follow-up only for data质量问题；当前 UI 的关系装配已恢复。

## Review

- Reviewer: Codex read-only implementation review.
- Scope: approved item/NPC/article production integration and its presentation contracts.
- Findings resolved: NPC 的城镇入住与旅商到访模块现在按能力实际渲染；文章库不再宣称未经排序契约保证的“最新”；移除了禁止的装饰圆环；high-fidelity 与 production devlog 状态已对齐。
- Re-review: focused presentation test、detail/public-page/visual/breakpoint contracts和完整 `pnpm run check` 均通过。

## Fidelity rebuild direction

- 用户指出运行态与定稿仍有明显结构差距。已冻结新的逐区验收计划：以运行时截图对照定稿，而不是以 CSS 标记或通用详情卡片通过为完成条件；物品先重建配方层级，NPC 重建条件分段商店，文章重建 v22 完整 fold 与 archive shell。See plan for implementation details.
- 计划 review 发现旧版会与既有 detail/public-page/loading/preview/article-layering 合同冲突，并遗漏共享布局、断点白名单、数据降级和截图工具边界。保真计划已修订为“合同先红后绿、每 slice 跑完整 `pnpm run check`、保留共享兼容壳、新组件拆入 `components/detail/`、串行执行”的版本；实施前先执行 Task 0 基线与 SHA 锚定。
- 第二轮 review 已把存量半成品、SSR 关系加载修复、合同迁移权限、gitignored 设计稿、截图落盘和双计划归属收紧为明确边界：先做存量裁定表和用户授权的回滚锚点，再按“Articles → NPC → Item”执行；合同只能精确迁移或增加，不能放宽匹配；全量与补充守门在每个 slice 收尾执行。See fidelity rebuild plan for the executable checklist.
