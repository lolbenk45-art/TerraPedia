import { describe, expect, it } from 'vitest'
import { getItemFallbackMark } from '@/utils/itemFallbackMark'

describe('item fallback mark', () => {
  it('uses deterministic category marks instead of emoji for categorized items', () => {
    expect(getItemFallbackMark({ id: 1, category: 'Weapons', name: 'Copper Shortsword' })).toBe('WP')
    expect(getItemFallbackMark({ id: 2, category: 'Materials', name: 'Gel' })).toBe('MT')
  })

  it('falls back to item-name initials when the category is not mapped', () => {
    expect(getItemFallbackMark({ id: 3, name: 'Magic Mirror' })).toBe('MM')
    expect(getItemFallbackMark({ id: 4, name: 'gel' })).toBe('GE')
    expect(getItemFallbackMark({ id: 5, name: '' })).toBe('IT')
  })
})
