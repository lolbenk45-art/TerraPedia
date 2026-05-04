import { describe, expect, it, vi } from 'vitest'
import type { ItemAggregateResponse } from '@/types'
import { createItemAggregateFetcher } from '@/api/itemAggregate'
import { normalizeItemAggregateData } from '@/api'

const buildResponse = (overrides: Partial<ItemAggregateResponse> = {}): ItemAggregateResponse => ({
  success: true,
  data: {
    item: {
      id: 100,
      name: 'Zenith',
    },
    images: [{ id: 1, imageUrl: '/zenith.png' }],
    sources: [{ id: 2, sourceType: 'drop' }],
    recipes: [{ id: 3, resultItemId: 100, ingredients: [], stations: [] }],
    moduleStatus: {
      images: 'ok',
      sources: 'ok',
      recipes: 'ok',
    },
    aggregatedAt: '2026-04-12T00:00:00Z',
  },
  message: 'ok',
  statusCode: 200,
  ...overrides,
})

describe('createItemAggregateFetcher', () => {
  it('falls back immediately when aggregate is disabled', async () => {
    const aggregateRequest = vi.fn()
    const fallbackResponse = buildResponse({
      data: {
        ...buildResponse().data,
        item: {
          id: 7,
          name: 'Legacy Zenith',
        },
      },
    })
    const fallbackRequest = vi.fn().mockResolvedValue(fallbackResponse)

    const fetchAggregate = createItemAggregateFetcher({
      enabled: false,
      aggregateRequest,
      fallbackRequest,
    })

    await expect(fetchAggregate(7, 'images')).resolves.toEqual(fallbackResponse)
    expect(aggregateRequest).not.toHaveBeenCalled()
    expect(fallbackRequest).toHaveBeenCalledWith(7, 'images')
  })

  it('returns aggregate result and emits success logs when request succeeds', async () => {
    const aggregateResponse = buildResponse()
    const aggregateRequest = vi.fn().mockResolvedValue(aggregateResponse)
    const fallbackRequest = vi.fn()
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    }
    const now = vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(1125)

    const fetchAggregate = createItemAggregateFetcher({
      enabled: true,
      aggregateRequest,
      fallbackRequest,
      logger,
      now,
    })

    await expect(fetchAggregate(100)).resolves.toEqual(aggregateResponse)
    expect(fallbackRequest).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenNthCalledWith(1, 'aggregate_request_start', {
      id: 100,
      include: 'images,sources,recipes',
    })
    expect(logger.info).toHaveBeenNthCalledWith(2, 'aggregate_request_success', {
      id: 100,
      source: 'p0',
      latencyMs: 125,
      images: 1,
      sources: 1,
      recipes: 1,
    })
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('falls back and emits failure logs when aggregate request rejects', async () => {
    const aggregateRequest = vi.fn().mockRejectedValue(new Error('gateway timeout'))
    const fallbackResponse = buildResponse({
      data: {
        ...buildResponse().data,
        item: {
          id: 8,
          name: 'Fallback Item',
        },
      },
    })
    const fallbackRequest = vi.fn().mockResolvedValue(fallbackResponse)
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    }
    const now = vi.fn().mockReturnValueOnce(200).mockReturnValueOnce(260)

    const fetchAggregate = createItemAggregateFetcher({
      enabled: true,
      aggregateRequest,
      fallbackRequest,
      logger,
      now,
    })

    await expect(fetchAggregate(8, 'images,sources')).resolves.toEqual(fallbackResponse)
    expect(fallbackRequest).toHaveBeenCalledWith(8, 'images,sources')
    expect(logger.warn).toHaveBeenCalledWith('aggregate_request_fallback', {
      id: 8,
      reason: 'gateway timeout',
      latencyMs: 60,
    })
  })

  it('falls back when aggregate response is invalid', async () => {
    const aggregateRequest = vi.fn().mockResolvedValue(
      buildResponse({
        success: false,
        message: 'bad payload',
        statusCode: 502,
      })
    )
    const fallbackResponse = buildResponse({
      data: {
        ...buildResponse().data,
        item: {
          id: 9,
          name: 'Legacy Item',
        },
      },
    })
    const fallbackRequest = vi.fn().mockResolvedValue(fallbackResponse)
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    }
    const now = vi.fn().mockReturnValueOnce(500).mockReturnValueOnce(515)

    const fetchAggregate = createItemAggregateFetcher({
      enabled: true,
      aggregateRequest,
      fallbackRequest,
      logger,
      now,
    })

    await expect(fetchAggregate(9)).resolves.toEqual(fallbackResponse)
    expect(fallbackRequest).toHaveBeenCalledWith(9, 'images,sources,recipes')
    expect(logger.warn).toHaveBeenCalledWith('aggregate_request_fallback', {
      id: 9,
      reason: 'bad payload',
      latencyMs: 15,
    })
  })
})

describe('normalizeItemAggregateData', () => {
  it('drops item source NPC provenance from normalized public aggregate data', () => {
    const rawSourceNpcsJson = JSON.stringify([
      {
        npcId: 17,
        npcName: 'Guide',
        npcNameZh: 'Guide CN',
        relationType: 'source',
        sourceFactKey: 'npc:guide',
        sourceProvider: 'terraria.wiki.gg',
        sourcePage: 'Guide',
        sourceRevisionTimestamp: '2026-04-12T00:00:00Z',
      },
    ])

    const result = normalizeItemAggregateData({
      item: {
        id: 100,
        name: 'Torch',
        sourceNpcsJson: rawSourceNpcsJson,
      },
      images: [],
      sources: [],
      recipes: [],
    } as any)

    expect(result.item).not.toHaveProperty('sourceNpcsJson')
    expect(result.item).not.toHaveProperty('sourceNpcs')
  })

  it('drops direct source NPC arrays from normalized public aggregate data', () => {
    const rawSourceNpcsJson = JSON.stringify([
      {
        npcId: 17,
        npcName: 'Guide',
        sourceFactKey: 'npc:guide',
      },
    ])

    const result = normalizeItemAggregateData({
      item: {
        id: 100,
        name: 'Torch',
        sourceNpcs: 'not-an-array',
        sourceNpcsJson: rawSourceNpcsJson,
      },
      images: [],
      sources: [],
      recipes: [],
    } as any)

    expect(result.item).not.toHaveProperty('sourceNpcs')
    expect(result.item).not.toHaveProperty('sourceNpcsJson')
  })
})
