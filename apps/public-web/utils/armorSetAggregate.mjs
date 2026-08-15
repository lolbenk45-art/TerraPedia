export const hasOwnArmorAggregateField = (raw, field) => Object.prototype.hasOwnProperty.call(raw ?? {}, field)

/**
 * @template T
 * @param {{
 *   raw: object | null | undefined
 *   field: string
 *   aggregate: () => T | Promise<T>
 *   fallback: () => T | Promise<T>
 * }} options
 * @returns {Promise<T>}
 */
export const resolveArmorAggregateOrFallback = async ({ raw, field, aggregate, fallback }) => {
  return hasOwnArmorAggregateField(raw, field) ? aggregate() : fallback()
}
