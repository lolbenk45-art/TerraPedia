export type PublicLayoutStats = {
  itemTotalLabel: string
  linkNodeLabel: string
  bossTotalLabel: string
  npcTotalLabel: string
  buffTotalLabel: string
  articleTotalLabel: string
}

const fallbackStats = (): PublicLayoutStats => ({
  itemTotalLabel: '待同步',
  linkNodeLabel: '待同步',
  bossTotalLabel: '待同步',
  npcTotalLabel: '待同步',
  buffTotalLabel: '待同步',
  articleTotalLabel: '精选',
})

const formatCount = (value: number | null | undefined, fallback: string) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0
    ? numberValue.toLocaleString('zh-CN')
    : fallback
}

export const usePublicLayoutState = () => {
  // Keep the WP-11.2 string channel marker for contracts/SSR continuity.
  const itemTotalLabel = useState<string>('public-layout-item-total-label', () => '待同步')
  const stats = useState<PublicLayoutStats>('public-layout-stats', fallbackStats)

  const publishHomeStats = (input: {
    totalItems?: number | null
    totalBosses?: number | null
    totalNpcs?: number | null
    totalBuffs?: number | null
    totalPublishedArticles?: number | null
    totalProjectiles?: number | null
  } | null | undefined) => {
    const next = {
      itemTotalLabel: formatCount(input?.totalItems, '待同步'),
      linkNodeLabel: formatCount(input?.totalProjectiles, '待同步'),
      bossTotalLabel: formatCount(input?.totalBosses, '待同步'),
      npcTotalLabel: formatCount(input?.totalNpcs, '待同步'),
      buffTotalLabel: formatCount(input?.totalBuffs, '待同步'),
      articleTotalLabel: formatCount(input?.totalPublishedArticles, '精选'),
    }
    stats.value = next
    itemTotalLabel.value = next.itemTotalLabel
  }

  return {
    itemTotalLabel,
    stats,
    publishHomeStats,
  }
}
