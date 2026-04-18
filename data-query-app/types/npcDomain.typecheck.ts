import type { TownNpcOverview, TownNpcRow } from '~/types/npcDomain'

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
