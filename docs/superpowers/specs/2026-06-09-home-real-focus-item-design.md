# Home Real Focus Item Design

## Goal

Make the homepage atlas "current focus" item real data while preserving the existing homepage composition.

The selected visual direction is option D from the browser mockup: keep the current right-side atlas structure and table rhythm, but replace the static focus text with a compact real item summary.

## Problem

The homepage currently builds its atlas data in `front-nuxt/composables/useHomeData.ts`. Most lower homepage content is editorial, while only site totals are fetched from `/statistics/overview`.

The atlas focus block is static:

- title: `泰拉刃`
- href: `/items/757`

This is close to real content, but it is still front-end hardcoded. It does not prove that the item exists, has a valid image, or has current category, stage, rarity, and combat fields.

## Decision

Use a dedicated public homepage focus endpoint:

```http
GET /api/public/home/focus-item
```

The endpoint returns one curated item. Version 1 should select item ID `757` on the server and hydrate the response from the existing public item detail data chain.

This is intentionally not a hotness ranking. The homepage needs a stable, recognizable, high-quality focus item more than an unstable automated list.

## User Experience

Keep the homepage atlas in the same location and approximate size. The right column should still read as `公共资料索引`, not as a new large feature card.

The focus block should show:

- item image
- focus label, such as `当前焦点 · 真实物品`
- item display name
- short meta line: `分类 / 游戏阶段 / 稀有度`
- detail link to `/items/{id}`

The atlas table below stays intact:

- `物品图鉴`
- `合成链路`
- `Boss 进度`
- `已发布文章`

If space allows, the focus block may add one compact stat line:

```text
伤害 85 · 使用时间 18
```

Only show numeric fields that exist. Do not render labels with empty values.

## Data Contract

Response payload inside the existing `ApiResponse` envelope:

```json
{
  "id": 757,
  "name": "Terra Blade",
  "nameZh": "泰拉刃",
  "internalName": "TerraBlade",
  "href": "/items/757",
  "image": "http://localhost:9000/terrapedia-images/items/wiki/item-images/76/76d124dc8ea4f07f1e50d69dfa17163cc5788b17-terra-blade-png.png",
  "categoryName": "武器",
  "gamePeriod": "困难模式后",
  "rarity": "浅红色",
  "damage": 85,
  "knockback": 7,
  "useTime": 18,
  "sell": 200000,
  "reasonLabel": "当前焦点 · 真实物品"
}
```

Backend should derive the fields from the current item data chain. The endpoint should not duplicate SQL when existing public item detail selection already provides the necessary values.

## Fallback

The frontend keeps a fallback focus item matching the current display:

- title: `泰拉刃`
- href: `/items/757`
- meta: `武器 / 困难模式后 / 浅红色`

If the endpoint fails, the page remains usable and does not block rendering.

## Out Of Scope

- Automated item ranking.
- Reading user history or favorites to rank items.
- Admin UI for selecting homepage focus items.
- Multiple rotating focus items.
- Layout-wide homepage redesign.
- Database writes or migrations.

## Validation

Backend validation:

- `mvn -DskipTests compile`
- API smoke: `curl http://localhost:18088/api/public/home/focus-item`
- Response contains item ID, display name, href, and at least one visible meta field.

Frontend validation:

- `pnpm --dir front-nuxt run check`
- Contract check confirms `useHomeData.ts` fetches `/public/home/focus-item` and `HomeHero.vue` renders the focus image/meta without removing the atlas table.

## Open Decision

Item ID `757` is fixed for version 1. A future task can move this to configuration or an admin-managed homepage curation table after the single-item pipeline is proven.
