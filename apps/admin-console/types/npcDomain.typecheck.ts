import type { TownNpcEditorDetail, TownNpcOverview, TownNpcRow } from '~/types/npcDomain'

const overview: TownNpcOverview = {
  reportFound: true,
  summary: {
    totalTownNpcs: 1,
    missingGamePeriodCount: 0,
    missingBehaviorNotesCount: 0,
    missingShopEntriesCount: 1,
    scrapedCount: 1,
    missingScrapeCount: 0,
    suggestedShopCoverageCount: 1,
    unmatchedShopNpcCount: 1,
    unmatchedShopItemCount: 2,
    rowsNeedingAttentionCount: 1,
  },
  records: [
    {
      id: 1,
      gameId: 22,
      name: 'Guide',
      nameZh: '向导',
      isTownNpc: true,
      hasBehaviorNotes: true,
      hasShopEntries: false,
      baseStats: { lifeMax: 250, damage: 10, defense: 30, knockBackResist: 0 },
      wikiAssets: { spriteImage: '/sprite.png', mapIconImage: '/icon.png', dialogPortraitImage: '/portrait.png' },
    } satisfies TownNpcRow,
  ],
}

void overview

const editorDetail: TownNpcEditorDetail = {
  id: 1,
  gameId: 22,
  internalName: 'Guide',
  name: 'Guide',
  nameZh: '鍚戝',
  isTownNpc: true,
  gamePeriodId: 3,
  behaviorNotes: 'Offers advice to new players.',
  lootItemsJson: '[]',
  shopItemsJson: '[]',
  sourceItemsJson: '[]',
  sourceItems: [
    {
      itemId: 8,
      itemName: 'Torch',
      sourceFactKey: 'source-item:torch',
    },
  ],
  shopMutationSummary: {
    submittedCount: 3,
    persistedCount: 2,
    insertedCount: 1,
    replacedCount: 1,
    skippedCount: 1,
    removedCount: 1,
  },
  shopEntries: [
    {
      id: 21,
      itemId: 8,
      name: 'Torch',
      priceText: '50 copper',
    },
  ],
}

void editorDetail
