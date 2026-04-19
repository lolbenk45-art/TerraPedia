import type { NpcPublicAggregateDomain } from '@/types/npcDomain'

const aggregate: NpcPublicAggregateDomain = {
  npc: {
    id: 1,
    gameId: 22,
    internalName: 'Guide',
    name: 'Guide',
    nameZh: 'Guide Zh',
    isTownNpc: true,
    imageUrl: 'https://cdn.example.com/npcs/guide.png',
    behaviorNotes: 'Offers advice to new players.',
  },
  loot: [],
  shopEntries: [
    {
      id: 21,
      itemId: 8,
      itemName: 'Torch',
      priceText: '50 copper',
    },
  ],
  buffRelations: [],
  moduleStatus: {
    loot: 'empty',
    shop: 'ok',
    buffs: 'skipped',
  },
  aggregatedAt: '2026-04-19T00:00:00Z',
}

void aggregate
