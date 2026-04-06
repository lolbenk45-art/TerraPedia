type RarityTone =
  | 'slate'
  | 'emerald'
  | 'sky'
  | 'violet'
  | 'amber'
  | 'fuchsia'
  | 'rose'
  | 'orange'
  | 'cyan'
  | 'red'

type RarityInput = {
  rarityId?: number | null
  rarity?: string | null
  rare?: string | null
}

type RarityMeta = {
  label: string
  tone: RarityTone
}

type RarityTagClass = {
  badgeClass: string
  tagClass: string
}

export type RarityPresentation = RarityMeta & RarityTagClass & {
  id: number | null
  badgeStyle: Record<string, string>
}

const RARITY_META_BY_ID: Record<number, RarityMeta> = {
  0: { label: '普通', tone: 'slate' },
  1: { label: '常见', tone: 'emerald' },
  2: { label: '稀有', tone: 'sky' },
  3: { label: '史诗', tone: 'violet' },
  4: { label: '传说', tone: 'amber' },
  5: { label: '神话', tone: 'fuchsia' },
  6: { label: '远古', tone: 'rose' },
  7: { label: '圣物', tone: 'orange' },
  8: { label: '天界', tone: 'cyan' },
  9: { label: '终焉', tone: 'red' },
}

const RARITY_NORMAL = RARITY_META_BY_ID[0]!
const RARITY_COMMON = RARITY_META_BY_ID[1]!
const RARITY_RARE = RARITY_META_BY_ID[2]!
const RARITY_EPIC = RARITY_META_BY_ID[3]!
const RARITY_LEGENDARY = RARITY_META_BY_ID[4]!
const RARITY_MYTHIC = RARITY_META_BY_ID[5]!
const RARITY_ANCIENT = RARITY_META_BY_ID[6]!
const RARITY_RELIC = RARITY_META_BY_ID[7]!
const RARITY_CELESTIAL = RARITY_META_BY_ID[8]!
const RARITY_ULTIMATE = RARITY_META_BY_ID[9]!

const RARITY_META_BY_KEY: Record<string, RarityMeta> = {
  normal: RARITY_NORMAL,
  common: RARITY_COMMON,
  uncommon: RARITY_COMMON,
  ordinary: RARITY_COMMON,
  rare: RARITY_RARE,
  epic: RARITY_EPIC,
  legendary: RARITY_LEGENDARY,
  legend: RARITY_LEGENDARY,
  mythic: RARITY_MYTHIC,
  ancient: RARITY_ANCIENT,
  relic: RARITY_RELIC,
  celestial: RARITY_CELESTIAL,
  divine: RARITY_CELESTIAL,
  ultimate: RARITY_ULTIMATE,
  normalcn: RARITY_NORMAL,
  commoncn: RARITY_COMMON,
  rarecn: RARITY_RARE,
  epiccn: RARITY_EPIC,
  legendarycn: RARITY_LEGENDARY,
  mythiccn: RARITY_MYTHIC,
  ancientcn: RARITY_ANCIENT,
}

const TONE_STYLES: Record<RarityTone, { badgeStyle: Record<string, string> } & RarityTagClass> = {
  slate: {
    badgeStyle: {
      backgroundColor: 'rgba(148, 163, 184, 0.16)',
      color: '#475569',
      borderColor: 'rgba(148, 163, 184, 0.32)',
    },
    badgeClass: 'bg-slate-100 text-slate-700',
    tagClass: 'tag--slate',
  },
  emerald: {
    badgeStyle: {
      backgroundColor: 'rgba(16, 185, 129, 0.16)',
      color: '#047857',
      borderColor: 'rgba(16, 185, 129, 0.3)',
    },
    badgeClass: 'bg-emerald-100 text-emerald-700',
    tagClass: 'tag--emerald',
  },
  sky: {
    badgeStyle: {
      backgroundColor: 'rgba(14, 165, 233, 0.16)',
      color: '#0369a1',
      borderColor: 'rgba(14, 165, 233, 0.3)',
    },
    badgeClass: 'bg-sky-100 text-sky-700',
    tagClass: 'tag--sky',
  },
  violet: {
    badgeStyle: {
      backgroundColor: 'rgba(139, 92, 246, 0.16)',
      color: '#6d28d9',
      borderColor: 'rgba(139, 92, 246, 0.3)',
    },
    badgeClass: 'bg-violet-100 text-violet-700',
    tagClass: 'tag--violet',
  },
  amber: {
    badgeStyle: {
      backgroundColor: 'rgba(245, 158, 11, 0.16)',
      color: '#b45309',
      borderColor: 'rgba(245, 158, 11, 0.3)',
    },
    badgeClass: 'bg-amber-100 text-amber-700',
    tagClass: 'tag--amber',
  },
  fuchsia: {
    badgeStyle: {
      backgroundColor: 'rgba(217, 70, 239, 0.16)',
      color: '#a21caf',
      borderColor: 'rgba(217, 70, 239, 0.3)',
    },
    badgeClass: 'bg-fuchsia-100 text-fuchsia-700',
    tagClass: 'tag--fuchsia',
  },
  rose: {
    badgeStyle: {
      backgroundColor: 'rgba(244, 63, 94, 0.16)',
      color: '#be123c',
      borderColor: 'rgba(244, 63, 94, 0.3)',
    },
    badgeClass: 'bg-rose-100 text-rose-700',
    tagClass: 'tag--rose',
  },
  orange: {
    badgeStyle: {
      backgroundColor: 'rgba(249, 115, 22, 0.16)',
      color: '#c2410c',
      borderColor: 'rgba(249, 115, 22, 0.3)',
    },
    badgeClass: 'bg-orange-100 text-orange-700',
    tagClass: 'tag--orange',
  },
  cyan: {
    badgeStyle: {
      backgroundColor: 'rgba(6, 182, 212, 0.16)',
      color: '#0e7490',
      borderColor: 'rgba(6, 182, 212, 0.3)',
    },
    badgeClass: 'bg-cyan-100 text-cyan-700',
    tagClass: 'tag--cyan',
  },
  red: {
    badgeStyle: {
      backgroundColor: 'rgba(239, 68, 68, 0.16)',
      color: '#b91c1c',
      borderColor: 'rgba(239, 68, 68, 0.32)',
    },
    badgeClass: 'bg-red-100 text-red-700',
    tagClass: 'tag--red',
  },
}

function normalizeKey(value?: string | null) {
  if (!value) {
    return ''
  }

  const trimmed = value.trim().toLowerCase()
  const compact = trimmed.replace(/[\s_-]+/g, '')

  if (compact === '普通') return 'normal'
  if (compact === '常见') return 'common'
  if (compact === '稀有') return 'rare'
  if (compact === '史诗') return 'epic'
  if (compact === '传说') return 'legendary'
  if (compact === '神话') return 'mythic'
  if (compact === '远古') return 'ancient'
  if (compact === '圣物') return 'relic'
  if (compact === '天界') return 'celestial'
  if (compact === '终焉') return 'ultimate'

  return compact
}

export function normalizeRarityLabel(input: RarityInput | string | null | undefined) {
  const rarityText = typeof input === 'string' ? input : input?.rarity ?? input?.rare ?? ''
  const rarityId = typeof input === 'string' ? null : input?.rarityId ?? null

  if (rarityId != null && RARITY_META_BY_ID[rarityId]) {
    return RARITY_META_BY_ID[rarityId].label
  }

  const normalized = normalizeKey(rarityText)
  if (normalized && RARITY_META_BY_KEY[normalized]) {
    return RARITY_META_BY_KEY[normalized].label
  }

  return rarityText?.trim() || '未知'
}

export function getRarityPresentation(input: RarityInput | string | null | undefined): RarityPresentation {
  const rarityText = typeof input === 'string' ? input : input?.rarity ?? input?.rare ?? ''
  const rarityId = typeof input === 'string' ? null : input?.rarityId ?? null

  const byId = rarityId != null ? RARITY_META_BY_ID[rarityId] : undefined
  const normalized = normalizeKey(rarityText)
  const byText = normalized ? RARITY_META_BY_KEY[normalized] : undefined

  const fallbackTone = rarityId != null
    ? TONE_STYLES[rarityId >= 9 ? 'red' : rarityId >= 8 ? 'cyan' : rarityId >= 7 ? 'orange' : rarityId >= 6 ? 'rose' : rarityId >= 5 ? 'fuchsia' : rarityId >= 4 ? 'amber' : rarityId >= 3 ? 'violet' : rarityId >= 2 ? 'sky' : rarityId >= 1 ? 'emerald' : 'slate']
    : TONE_STYLES.slate

  const meta = byId ?? byText ?? {
    label: rarityText?.trim() || (rarityId != null ? `等级 ${rarityId}` : '未知'),
    tone: rarityId != null
      ? (rarityId >= 9 ? 'red' : rarityId >= 8 ? 'cyan' : rarityId >= 7 ? 'orange' : rarityId >= 6 ? 'rose' : rarityId >= 5 ? 'fuchsia' : rarityId >= 4 ? 'amber' : rarityId >= 3 ? 'violet' : rarityId >= 2 ? 'sky' : rarityId >= 1 ? 'emerald' : 'slate')
      : 'slate',
  } satisfies RarityMeta

  const tone = TONE_STYLES[meta.tone] ?? fallbackTone

  return {
    id: rarityId,
    label: meta.label,
    tone: meta.tone,
    badgeStyle: tone.badgeStyle,
    badgeClass: tone.badgeClass,
    tagClass: tone.tagClass,
  }
}
