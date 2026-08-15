import type { Ref } from 'vue'

type UseVisualLoadingOptions = {
  /** useAsyncData pending ref that drives the skeleton state. */
  pending: Ref<boolean>
  /** When provided, existing data (for example an SSR payload) short-circuits the skeleton entirely. */
  hasData?: () => boolean
  /** Minimum time the skeleton stays visible once it has been shown. */
  minimumMs?: number
}

/**
 * Shared "minimum duration skeleton" state used by catalog list and detail pages:
 * `clientReady` flips after hydration so SSR markup stays stable, and
 * `visualLoading` keeps the skeleton visible for at least `minimumMs` to avoid flicker.
 */
export const useVisualLoading = ({ pending, hasData, minimumMs = 180 }: UseVisualLoadingOptions) => {
  const clientReady = ref(false)
  let visualLoadingTimer: ReturnType<typeof setTimeout> | null = null
  let visualLoadingStartedAt = Date.now()

  const rawLoading = computed(() => {
    const waitingForData = !clientReady.value || pending.value
    return hasData ? !hasData() && waitingForData : waitingForData
  })
  const visualLoading = ref(rawLoading.value)

  const clearVisualLoadingTimer = () => {
    if (visualLoadingTimer) {
      clearTimeout(visualLoadingTimer)
      visualLoadingTimer = null
    }
  }

  const syncVisualLoading = (isLoading: boolean) => {
    clearVisualLoadingTimer()

    if (isLoading) {
      visualLoadingStartedAt = Date.now()
      visualLoading.value = true
      return
    }

    const elapsed = Date.now() - visualLoadingStartedAt
    const remaining = Math.max(0, minimumMs - elapsed)

    visualLoadingTimer = setTimeout(() => {
      visualLoading.value = false
      visualLoadingTimer = null
    }, remaining)
  }

  watch(rawLoading, syncVisualLoading, { immediate: true })

  onMounted(() => {
    clientReady.value = true
  })

  onBeforeUnmount(clearVisualLoadingTimer)

  return { clientReady, visualLoading }
}
