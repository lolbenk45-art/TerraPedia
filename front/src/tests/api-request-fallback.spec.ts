import { describe, expect, it, vi } from 'vitest'
import { requestWithFallback } from '@/api/requestFallback'

describe('requestWithFallback', () => {
  it('returns the request result when the request succeeds', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const request = vi.fn().mockResolvedValue({ success: true, data: [1, 2, 3] })

    await expect(
      requestWithFallback({
        request,
        fallbackValue: { success: false, data: [] },
        errorMessage: 'Error fetching data:',
      })
    ).resolves.toEqual({ success: true, data: [1, 2, 3] })

    expect(request).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('logs the error and returns the fallback value when the request fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('gateway timeout')
    const request = vi.fn().mockRejectedValue(error)
    const fallbackValue = { success: false, data: [] as number[] }

    await expect(
      requestWithFallback({
        request,
        fallbackValue,
        errorMessage: 'Error fetching data:',
      })
    ).resolves.toBe(fallbackValue)

    expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching data:', error)
  })

  it('uses the injected logger instead of console.error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logger = vi.fn()
    const error = new Error('service unavailable')

    await expect(
      requestWithFallback({
        request: () => Promise.reject(error),
        fallbackValue: [],
        errorMessage: 'Error fetching list:',
        logger,
      })
    ).resolves.toEqual([])

    expect(logger).toHaveBeenCalledWith('Error fetching list:', error)
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('does not rethrow the original error after logging', async () => {
    const logger = vi.fn()
    const error = new Error('network down')

    await expect(
      requestWithFallback({
        request: () => Promise.reject(error),
        fallbackValue: null,
        errorMessage: 'Error fetching record:',
        logger,
      })
    ).resolves.toBeNull()

    expect(logger).toHaveBeenCalledTimes(1)
    expect(logger).toHaveBeenCalledWith('Error fetching record:', error)
  })
})
