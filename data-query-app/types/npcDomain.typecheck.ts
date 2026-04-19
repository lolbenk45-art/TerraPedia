import type { TownNpcEditorDetail, TownNpcOverview, TownNpcRow } from '~/types/npcDomain'

const overview: TownNpcOverview = {
  reportFound: true,
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
  shopEntries: [
    {
      itemId: 8,
      name: 'Torch',
      priceText: '50 copper',
    },
  ],
}

void editorDetail
