export const globalSearchInputSelector = '#home-hero-search, #global-search-input'

const isEditableElement = (target: EventTarget | null) => {
  const element = target as HTMLElement | null

  return Boolean(
    element
    && (
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
      || element.isContentEditable
    ),
  )
}

export const focusGlobalSearchInput = async () => {
  await nextTick()

  const input = document.querySelector<HTMLInputElement>(globalSearchInputSelector)
  if (input) {
    input.focus()
    input.select()
    return true
  }

  return false
}

export const useGlobalSearchShortcut = () => {
  const route = useRoute()

  const focusSearchFromShortcut = async (event: KeyboardEvent) => {
    if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) {
      return
    }

    const target = event.target as HTMLElement | null
    if (target?.matches(globalSearchInputSelector) && isEditableElement(target)) {
      return
    }

    event.preventDefault()

    if (await focusGlobalSearchInput()) {
      return
    }

    await navigateTo('/search')
    await nextTick()
    await focusGlobalSearchInput()
  }

  onMounted(() => window.addEventListener('keydown', focusSearchFromShortcut))

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', focusSearchFromShortcut)
  })

  watch(
    () => route.path,
    async (path) => {
      if (path === '/search') {
        await focusGlobalSearchInput()
      }
    },
    { flush: 'post' },
  )
}
