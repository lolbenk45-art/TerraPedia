export type NpcArchiveModule = 'residence' | 'arrival' | 'loot' | 'shop'

export type NpcArchiveModuleInput = {
  isTownNpc?: boolean
  name?: string
  shopCount?: number
  lootCount?: number
}

export const splitFeaturedArticleList = <T>(articles: T[]) => ({
  featured: articles[0] ?? null,
  archive: articles.slice(1),
})

export const resolveNpcArchiveModules = (input: NpcArchiveModuleInput): NpcArchiveModule[] => {
  const modules: NpcArchiveModule[] = []
  const name = String(input.name ?? '')
  const isTraveler = /旅商|traveling merchant/i.test(name)

  if (isTraveler) modules.push('arrival')
  if (Number(input.shopCount) > 0) modules.push('shop')
  if (input.isTownNpc && !isTraveler) modules.push('residence')
  if (Number(input.lootCount) > 0) modules.push('loot')

  return modules
}
