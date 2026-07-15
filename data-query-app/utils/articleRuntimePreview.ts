export const MAX_RECIPE_TREE_REQUESTS = 3

export const parseRecipeTreeDepth = (value: unknown): number | null => {
  const text = String(value ?? '').trim()
  const depth = Number(text)
  return /^\d+$/.test(text) && Number.isInteger(depth) && depth >= 1 && depth <= 5 ? depth : null
}

export const recipeTreeKey = (itemId: string, maxDepth: number) => `${itemId}:${maxDepth}`

export const createRecipeTreeRequestQueue = <T>(loader: (itemId: number, maxDepth: number) => Promise<T>) => {
  const pending = new Map<string, Promise<T>>()
  const queue: Array<() => void> = []
  let running = 0
  const startNext = () => {
    while (running < MAX_RECIPE_TREE_REQUESTS && queue.length) queue.shift()?.()
  }
  return (itemId: number, maxDepth: number) => {
    const key = recipeTreeKey(String(itemId), maxDepth)
    const existing = pending.get(key)
    if (existing) return existing
    const request = new Promise<T>((resolve, reject) => {
      queue.push(() => {
        running += 1
        loader(itemId, maxDepth).then(resolve, reject).finally(() => {
          running -= 1
          pending.delete(key)
          startNext()
        })
      })
      startNext()
    })
    pending.set(key, request)
    return request
  }
}
