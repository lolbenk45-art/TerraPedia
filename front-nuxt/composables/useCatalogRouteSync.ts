import type { Ref, WatchSource } from 'vue'
import type { LocationQuery } from 'vue-router'

export const firstQueryValue = (value: unknown) => Array.isArray(value) ? value[0] : value

export const parsePositiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number(firstQueryValue(value))
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

const catalogSearchDebounceMs = 300

type CatalogRouteQueryPatch = Record<string, string | undefined>

type UseCatalogRouteSyncOptions = {
  /** Maps page state to route query params; `undefined` values remove the param. */
  serialize: () => CatalogRouteQueryPatch
  /** Restores page state from the route query (initial load and external navigation). */
  hydrate: (query: LocationQuery) => void
  /** State sources whose changes rewrite the route query. */
  watchSources: WatchSource<unknown>[]
  /** Optional shared search debounce that resets pagination on input. */
  search?: {
    input: Ref<string>
    debounced: Ref<string>
    page: Ref<number>
  }
}

/**
 * Shared catalog list URL sync: hydrates page state from the route query once at
 * setup, debounces search input, rewrites the query on state changes, and guards
 * against the rewrite feeding back into hydration (input race, REVIEW §3.1-A).
 */
export const useCatalogRouteSync = ({ serialize, hydrate, watchSources, search }: UseCatalogRouteSyncOptions) => {
  const route = useRoute()
  const router = useRouter()
  let syncingRouteQuery = false
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

  const updateCatalogRouteQuery = () => {
    syncingRouteQuery = true
    void router.replace({ query: { ...route.query, ...serialize() } }).finally(() => {
      syncingRouteQuery = false
    })
  }

  const hydrateCatalogStateFromRoute = () => {
    if (syncingRouteQuery) return
    hydrate(route.query)
  }

  hydrateCatalogStateFromRoute()

  if (search) {
    watch(search.input, () => {
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer)
      }

      // 页码重置必须等防抖落定:同步重置会先用旧搜索词发一次 page=1 请求。
      searchDebounceTimer = setTimeout(() => {
        search.page.value = 1
        search.debounced.value = search.input.value
      }, catalogSearchDebounceMs)
    }, { flush: 'sync' })
  }

  watch(watchSources, updateCatalogRouteQuery, { flush: 'post' })
  watch(() => route.query, hydrateCatalogStateFromRoute)

  onBeforeUnmount(() => {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer)
    }
  })

  return { updateCatalogRouteQuery, hydrateCatalogStateFromRoute }
}
