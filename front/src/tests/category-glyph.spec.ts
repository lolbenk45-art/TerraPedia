import { describe, expect, it } from 'vitest'
import { getCategoryGlyph } from '@/utils/categoryGlyph'

describe('category glyph mapping', () => {
  it('returns deterministic letter glyphs for common English and Chinese categories', () => {
    expect(getCategoryGlyph('Weapons')).toBe('WP')
    expect(getCategoryGlyph('Armor')).toBe('AR')
    expect(getCategoryGlyph('Materials')).toBe('MT')
    expect(getCategoryGlyph('消耗品')).toBe('AL')
    expect(getCategoryGlyph('电线')).toBe('MC')
  })

  it('falls back to AT for unknown category labels', () => {
    expect(getCategoryGlyph('Unknown Category')).toBe('AT')
    expect(getCategoryGlyph('')).toBe('AT')
  })
})
