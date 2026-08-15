// 详情页共享:泰拉瑞亚钱币掉落 token 规整(npcs/bosses 两页原同构复制,WP-5 沉淀)。
// 配套的 .npc-money-coin-mark / .boss-money-coin-mark 视觉在 assets/css/detail-layout.css。
import { resolvePreviewImageUrl } from '~/composables/usePreviewImage'
import { resolveTerrariaPriceUnitLabel, type TerrariaPriceToken } from '~/utils/price'
import { firstDisplayText } from '~/utils/publicCopy'

export type TerrariaMoneyTokenInput = {
  unit?: string | null
  amount?: number | string | null
  label?: string | null
  iconUrl?: string | null
  icon_url?: string | null
}

// 后端 unit 值 → 钱币视觉标记的颜色 class(details CSS 中 is-platinum/is-gold/...)。
export const moneyCoinClass = (unit: unknown) => {
  const key = firstDisplayText(unit).toLowerCase()
  if (key === 'platinum' || key === 'pc' || key === 'platinum coin') return 'platinum'
  if (key === 'gold' || key === 'gc' || key === 'gold coin') return 'gold'
  if (key === 'silver' || key === 'sc' || key === 'silver coin') return 'silver'
  if (key === 'copper' || key === 'cc' || key === 'copper coin') return 'copper'
  return 'unknown'
}

// 后端钱币 token → 展示 token;label 只信任受控 unit 映射,金额非正或单位未知则丢弃。
export const normalizeTerrariaMoneyToken = (token: TerrariaMoneyTokenInput): TerrariaPriceToken | null => {
  const amount = Number(token.amount)
  const unitLabel = resolveTerrariaPriceUnitLabel(token.unit)
  if (!Number.isFinite(amount) || amount <= 0 || !unitLabel) return null

  return {
    unit: firstDisplayText(token.unit),
    amount: Math.trunc(amount),
    label: unitLabel,
    iconUrl: resolvePreviewImageUrl(firstDisplayText(token.iconUrl, token.icon_url)),
  }
}
