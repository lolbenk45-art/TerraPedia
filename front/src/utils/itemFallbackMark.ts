import { getCategoryGlyph } from '@/utils/categoryGlyph'

type ItemFallbackInput = {
  id?: number | null
  name?: string | null
  category?: string | null
}

function nameInitials(name?: string | null): string {
  const value = name?.trim() || ''
  if (!value) return 'IT'

  const words = value.split(/\s+/).filter(Boolean)
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase()
  }

  return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase() || 'IT'
}

export function getItemFallbackMark(input: ItemFallbackInput): string {
  const categoryGlyph = getCategoryGlyph(input.category)
  if (categoryGlyph !== 'AT') {
    return categoryGlyph
  }

  return nameInitials(input.name)
}
