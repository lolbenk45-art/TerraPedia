import { afterEach, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  document.documentElement.className = ''
})
