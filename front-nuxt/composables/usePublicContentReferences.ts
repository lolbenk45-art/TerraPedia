import type {
  ContentReferenceResolveInput,
  ContentReferenceSearchQuery,
  NormalizedContentReference,
  PublicContentReference,
} from '~/types/public-api'
import { unwrapApiResponse, usePublicApiFetch } from '~/composables/usePublicApi'
import { resolvePreviewImageUrl } from '~/composables/usePreviewImage'

const normalizeText = (value: unknown) => String(value ?? '').trim()

const normalizeType = (value: unknown): 'item' | 'npc' | '' => {
  const type = normalizeText(value).toLowerCase()
  return type === 'item' || type === 'npc' ? type : ''
}

const normalizeId = (value: unknown) => {
  const id = normalizeText(value)
  return /^\d{1,12}$/.test(id) ? id : ''
}

const detailPathFromTypeId = (type: 'item' | 'npc', id: string) => {
  return type === 'item' ? `/items/${id}` : `/npcs/${id}`
}

export const contentReferenceKey = (type: unknown, id: unknown) => {
  const normalizedType = normalizeType(type)
  const normalizedId = normalizeId(id)
  return normalizedType && normalizedId ? `${normalizedType}:${normalizedId}` : ''
}

export const normalizeContentReference = (raw: PublicContentReference): NormalizedContentReference | null => {
  const type = normalizeType(raw.type)
  const id = normalizeId(raw.id)
  if (!type || !id) return null
  const label = normalizeText(raw.label) || `${type} #${id}`

  return {
    key: `${type}:${id}`,
    type,
    id,
    label,
    name: normalizeText(raw.name),
    internalName: normalizeText(raw.internalName),
    imageUrl: resolvePreviewImageUrl(normalizeText(raw.imageUrl ?? raw.image_url)),
    categoryName: normalizeText(raw.categoryName ?? raw.category_name),
    summary: normalizeText(raw.summary),
    detailPath: detailPathFromTypeId(type, id),
    available: raw.available !== false,
  }
}

export const searchPublicContentReferences = async (
  query: ContentReferenceSearchQuery = {},
): Promise<NormalizedContentReference[]> => {
  const q = normalizeText(query.q)
  const types = Array.isArray(query.types) ? query.types.join(',') : normalizeText(query.types) || 'item,npc'
  const response = await usePublicApiFetch<PublicContentReference[]>('/public/content-references', {
    query: {
      q,
      types,
      limit: query.limit ?? 20,
    },
  })
  return (unwrapApiResponse(response) || [])
    .map(normalizeContentReference)
    .filter((item): item is NormalizedContentReference => Boolean(item))
}

export const resolvePublicContentReferences = async (
  refs: ContentReferenceResolveInput[],
): Promise<Record<string, NormalizedContentReference>> => {
  const deduped = Array.from(new Map(
    refs
      .map(ref => ({ type: normalizeType(ref.type), id: normalizeId(ref.id) }))
      .filter((ref): ref is { type: 'item' | 'npc', id: string } => Boolean(ref.type && ref.id))
      .map(ref => [`${ref.type}:${ref.id}`, ref]),
  ).values())

  if (!deduped.length) return {}

  const response = await usePublicApiFetch<PublicContentReference[]>('/public/content-references/resolve', {
    method: 'POST',
    body: { refs: deduped },
  })

  const resolved: Record<string, NormalizedContentReference> = {}
  for (const item of unwrapApiResponse(response) || []) {
    const normalized = normalizeContentReference(item)
    if (normalized) resolved[normalized.key] = normalized
  }
  return resolved
}
