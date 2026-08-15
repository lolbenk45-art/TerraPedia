export type ArticleCoverMode = 'sprite' | 'photo'

// 游戏精灵图原生边长普遍在 16–200px；400px 以上才可能是真照片或截图。
// 小图一律 contain + pixelated，绝不平滑插值放大成马赛克。
export const COVER_SPRITE_MAX_EDGE = 400

export const classifyCoverMode = (naturalWidth: unknown, naturalHeight: unknown): ArticleCoverMode => {
  const width = Number(naturalWidth)
  const height = Number(naturalHeight)

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 'sprite'
  }

  return Math.max(width, height) < COVER_SPRITE_MAX_EDGE ? 'sprite' : 'photo'
}
