import { describe, expect, it, vi } from 'vitest'
import type { ApiResponse, Pagination } from '@/types'
import { requestApiResponseWithFallback } from '@/api/apiResponseFallback'

describe('requestApiResponseWithFallback', () => {
  it('returns the request result when the request succeeds', async () => {
    const response: ApiResponse<number[]> = {
      success: true,
      data: [1, 2, 3],
      message: 'ok',
      statusCode: 200,
    }
    const request = vi.fn().mockResolvedValue(response)
    const logger = vi.fn()

    await expect(
      requestApiResponseWithFallback({
        request,
        fallbackData: [],
        fallbackMessage: 'fallback',
        statusCode: 503,
        logger,
      })
    ).resolves.toBe(response)

    expect(request).toHaveBeenCalledTimes(1)
    expect(logger).not.toHaveBeenCalled()
  })

  it('returns the configured fallback shape when the request fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('gateway timeout')
    const request = vi.fn().mockRejectedValue(error)

    await expect(
      requestApiResponseWithFallback({
        request,
        fallbackData: [],
        fallbackMessage: 'Items temporarily unavailable',
        statusCode: 503,
      })
    ).resolves.toEqual({
      success: false,
      data: [],
      message: 'Items temporarily unavailable',
      statusCode: 503,
    } satisfies ApiResponse<number[]>)

    expect(consoleErrorSpy).toHaveBeenCalledWith('Items temporarily unavailable', error)
  })

  it('includes pagination in the fallback when pagination is provided', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const pagination: Pagination = {
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    }

    await expect(
      requestApiResponseWithFallback({
        request: () => Promise.reject(new Error('service unavailable')),
        fallbackData: [],
        fallbackMessage: 'No results available',
        statusCode: 502,
        pagination,
      })
    ).resolves.toEqual({
      success: false,
      data: [],
      message: 'No results available',
      statusCode: 502,
      pagination,
    } satisfies ApiResponse<number[]>)

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
  })

  it('uses the injected logger and does not rethrow when the request fails', async () => {
    const logger = vi.fn()
    const error = new Error('network down')

    await expect(
      requestApiResponseWithFallback({
        request: () => Promise.reject(error),
        fallbackData: null,
        fallbackMessage: 'Record unavailable',
        statusCode: 500,
        logger,
      })
    ).resolves.toEqual({
      success: false,
      data: null,
      message: 'Record unavailable',
      statusCode: 500,
    } satisfies ApiResponse<null>)

    expect(logger).toHaveBeenCalledTimes(1)
    expect(logger).toHaveBeenCalledWith('Record unavailable', error)
  })
})
