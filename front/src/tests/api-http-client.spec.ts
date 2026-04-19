import { describe, expect, it, vi } from 'vitest'
import { createHttpClient } from '@/api/httpClient'

describe('createHttpClient', () => {
  it('uses the default timeout and withCredentials values', () => {
    const client = createHttpClient({
      baseURL: '/api',
    })

    expect(client.defaults.baseURL).toBe('/api')
    expect(client.defaults.timeout).toBe(10000)
    expect(client.defaults.withCredentials).toBe(true)
  })

  it('allows admin clients to disable withCredentials', () => {
    const client = createHttpClient({
      baseURL: '/api/admin',
      withCredentials: false,
      errorLabel: 'Admin API Error:',
    })

    expect(client.defaults.baseURL).toBe('/api/admin')
    expect(client.defaults.timeout).toBe(10000)
    expect(client.defaults.withCredentials).toBe(false)
  })

  it('rejects the original response error and logs the configured label', async () => {
    const client = createHttpClient({
      errorLabel: 'Admin API Error:',
    })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('network down')

    await expect(
      client.get('/categories', {
        adapter: async () => {
          throw error
        },
      })
    ).rejects.toBe(error)

    expect(consoleErrorSpy).toHaveBeenCalledWith('Admin API Error:', error)
  })
})
