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
  tagClass: string
}

export const RARITY_FILTER_OPTIONS = [
  '灰色',
  '白色',
  '蓝色',
  '绿色',
  '橙色',
  '浅红色',
  '粉红色',
  '浅紫色',
  '黄绿色',
  '黄色',
  '青色',
  '红色',
  '紫色',
  '任务',
  '专家',
  '大师',
]

const RARITY_META_BY_ID: Record<number, RarityMeta> = {
  [-13]: { label: '大师', tone: 'red' },
  [-12]: { label: '专家', tone: 'orange' },
  [-11]: { label: '任务', tone: 'violet' },
  [-1]: { label: '灰色', tone: 'slate' },
  0: { label: '白色', tone: 'slate' },
  1: { label: '蓝色', tone: 'emerald' },
  2: { label: '绿色', tone: 'sky' },
  3: { label: '橙色', tone: 'violet' },
  4: { label: '浅红色', tone: 'amber' },
  5: { label: '粉红色', tone: 'fuchsia' },
  6: { label: '浅紫色', tone: 'rose' },
  7: { label: '黄绿色', tone: 'orange' },
  8: { label: '黄色', tone: 'cyan' },
  9: { label: '青色', tone: 'red' },
  10: { label: '红色', tone: 'red' },
  11: { label: '紫色', tone: 'red' },
}

const RARITY_GRAY = RARITY_META_BY_ID[-1]!
const RARITY_WHITE = RARITY_META_BY_ID[0]!
const RARITY_BLUE = RARITY_META_BY_ID[1]!
const RARITY_GREEN = RARITY_META_BY_ID[2]!
const RARITY_ORANGE = RARITY_META_BY_ID[3]!
const RARITY_LIGHT_RED = RARITY_META_BY_ID[4]!
const RARITY_PINK = RARITY_META_BY_ID[5]!
const RARITY_LIGHT_PURPLE = RARITY_META_BY_ID[6]!
const RARITY_LIME = RARITY_META_BY_ID[7]!
const RARITY_YELLOW = RARITY_META_BY_ID[8]!
const RARITY_CYAN = RARITY_META_BY_ID[9]!
const RARITY_RED = RARITY_META_BY_ID[10]!
const RARITY_PURPLE = RARITY_META_BY_ID[11]!
const RARITY_QUEST = RARITY_META_BY_ID[-11]!
const RARITY_EXPERT = RARITY_META_BY_ID[-12]!
const RARITY_MASTER = RARITY_META_BY_ID[-13]!

const RARITY_META_BY_KEY: Record<string, RarityMeta> = {
  gray: RARITY_GRAY,
  white: RARITY_WHITE,
  common: RARITY_BLUE,
  blue: RARITY_BLUE,
  rare: RARITY_GREEN,
  green: RARITY_GREEN,
  orange: RARITY_ORANGE,
  epic: RARITY_ORANGE,
  lightred: RARITY_LIGHT_RED,
  light_red: RARITY_LIGHT_RED,
  pink: RARITY_PINK,
  legendary: RARITY_PINK,
  lightpurple: RARITY_LIGHT_PURPLE,
  light_purple: RARITY_LIGHT_PURPLE,
  lime: RARITY_LIME,
  yellow: RARITY_YELLOW,
  cyan: RARITY_CYAN,
  red: RARITY_RED,
  purple: RARITY_PURPLE,
  quest: RARITY_QUEST,
  expert: RARITY_EXPERT,
  master: RARITY_MASTER,
}

const TONE_CLASS_MAP: Record<RarityTone, RarityTagClass> = {
  slate: { tagClass: 'tag--slate' },
  emerald: { tagClass: 'tag--emerald' },
  sky: { tagClass: 'tag--sky' },
  violet: { tagClass: 'tag--violet' },
  amber: { tagClass: 'tag--amber' },
  fuchsia: { tagClass: 'tag--fuchsia' },
  rose: { tagClass: 'tag--rose' },
  orange: { tagClass: 'tag--orange' },
  cyan: { tagClass: 'tag--cyan' },
  red: { tagClass: 'tag--red' },
}

function normalizeKey(value?: string | null) {
  if (!value) {
    return ''
  }

  const trimmed = value.trim().toLowerCase()
  const compact = trimmed.replace(/[\s_-]+/g, '')

  if (compact === '灰色') return 'gray'
  if (compact === '白色') return 'white'
  if (compact === '蓝色' || compact === '常见') return 'blue'
  if (compact === '绿色' || compact === '稀有') return 'green'
  if (compact === '橙色' || compact === '史诗') return 'orange'
  if (compact === '浅红色') return 'light_red'
  if (compact === '粉红色' || compact === '传说') return 'pink'
  if (compact === '浅紫色') return 'light_purple'
  if (compact === '黄绿色') return 'lime'
  if (compact === '黄色') return 'yellow'
  if (compact === '青色') return 'cyan'
  if (compact === '红色') return 'red'
  if (compact === '紫色') return 'purple'
  if (compact === '任务') return 'quest'
  if (compact === '专家') return 'expert'
  if (compact === '大师') return 'master'

  return compact
}

function toneFromId(rarityId: number | null | undefined): RarityTone {
  if (rarityId == null) return 'slate'
  if (rarityId >= 9) return 'red'
  if (rarityId >= 8) return 'cyan'
  if (rarityId >= 7) return 'orange'
  if (rarityId >= 6) return 'rose'
  if (rarityId >= 5) return 'fuchsia'
  if (rarityId >= 4) return 'amber'
  if (rarityId >= 3) return 'violet'
  if (rarityId >= 2) return 'sky'
  if (rarityId >= 1) return 'emerald'
  return 'slate'
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

export function getRarityPresentation(input: RarityInput | string | null | undefined) {
  const rarityText = typeof input === 'string' ? input : input?.rarity ?? input?.rare ?? ''
  const rarityId = typeof input === 'string' ? null : input?.rarityId ?? null

  const byId = rarityId != null ? RARITY_META_BY_ID[rarityId] : undefined
  const normalized = normalizeKey(rarityText)
  const byText = normalized ? RARITY_META_BY_KEY[normalized] : undefined
  const meta = byId ?? byText ?? {
    label: rarityText?.trim() || (rarityId != null ? `等级 ${rarityId}` : '未知'),
    tone: toneFromId(rarityId),
  } satisfies RarityMeta

  return {
    id: rarityId,
    label: meta.label,
    tone: meta.tone,
    tagClass: TONE_CLASS_MAP[meta.tone].tagClass,
  }
}
