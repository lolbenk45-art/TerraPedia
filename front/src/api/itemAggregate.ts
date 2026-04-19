import type { ItemAggregateResponse } from '@/types'

export interface ItemAggregateLogger {
  info?: (event: string, payload: Record<string, unknown>) => void
  warn?: (event: string, payload: Record<string, unknown>) => void
}

export interface CreateItemAggregateFetcherOptions {
  enabled: boolean
  aggregateRequest: (id: number, include: string) => Promise<ItemAggregateResponse>
  fallbackRequest: (id: number, include: string) => Promise<ItemAggregateResponse>
  logger?: ItemAggregateLogger
  now?: () => number
  isValidResponse?: (response: ItemAggregateResponse) => boolean
}

export const isValidItemAggregateResponse = (response: ItemAggregateResponse): boolean =>
  Boolean(response.success && response.data?.item?.id)

const getErrorReason = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export const createItemAggregateFetcher = ({
  enabled,
  aggregateRequest,
  fallbackRequest,
  logger,
  now = Date.now,
  isValidResponse = isValidItemAggregateResponse,
}: CreateItemAggregateFetcherOptions) => {
  return async (
    id: number,
    include = 'images,sources,recipes'
  ): Promise<ItemAggregateResponse> => {
    const startedAt = now()

    if (!enabled) {
      return fallbackRequest(id, include)
    }

    logger?.info?.('aggregate_request_start', { id, include })

    try {
      const response = await aggregateRequest(id, include)

      if (!isValidResponse(response)) {
        throw new Error(response.message || 'Invalid aggregate response')
      }

      logger?.info?.('aggregate_request_success', {
        id,
        source: 'p0',
        latencyMs: now() - startedAt,
        images: response.data.images?.length ?? 0,
        sources: response.data.sources?.length ?? 0,
        recipes: response.data.recipes?.length ?? 0,
      })

      return response
    } catch (error) {
      logger?.warn?.('aggregate_request_fallback', {
        id,
        reason: getErrorReason(error),
        latencyMs: now() - startedAt,
      })

      return fallbackRequest(id, include)
    }
  }
}
