import { defineStore } from 'pinia'
import { del, get, post, put } from '~/composables/useApi'
import { showToast } from '~/composables/useToast'

export interface ItemGroupMember {
  itemId?: number | null
  internalName?: string
  name?: string
  nameZh?: string
  image?: string
  imageUrl?: string
  resolved?: boolean
  resolutionStatus?: string
  resolutionReason?: string
}

export interface ItemGroup {
  canonicalName: string
  displayNameEn?: string
  displayNameZh?: string
  aliases: string[]
  domains: string[]
  sourceKind?: string
  sourceProvider?: string
  sourcePage?: string
  sourceRevisionTimestamp?: string
  sourceUpdatedAt?: string
  sourceLabel?: string
  sourceFile?: string
  sourceUrls: string[]
  manualOnly?: boolean
  members: ItemGroupMember[]
}

function normalizeImageUrl(raw: any) {
  const value = String(raw?.imageUrl ?? raw?.image_url ?? raw?.image ?? '')
  if (!value) return ''
  if (/^(https?:|data:)/.test(value)) return value
  if (value.startsWith('/')) return value
  return ''
}

function normalizeStringList(raw: any): string[] {
  if (!Array.isArray(raw)) return []
  return Array.from(new Set(raw.map((value: any) => String(value ?? '').trim()).filter(Boolean)))
}

function normalizeItemGroupMember(raw: any): ItemGroupMember {
  return {
    itemId: raw?.itemId ?? raw?.item_id ?? null,
    internalName: raw?.internalName ?? raw?.internal_name ?? '',
    name: raw?.name ?? '',
    nameZh: raw?.nameZh ?? raw?.name_zh ?? '',
    image: raw?.image ?? '',
    imageUrl: normalizeImageUrl(raw),
    resolved: typeof raw?.resolved === 'boolean' ? raw.resolved : raw?.isResolved ?? raw?.is_resolved,
    resolutionStatus: raw?.resolutionStatus ?? raw?.resolution_status ?? '',
    resolutionReason: raw?.resolutionReason ?? raw?.resolution_reason ?? '',
  }
}

function normalizeItemGroup(raw: any): ItemGroup {
  return {
    canonicalName: raw?.canonicalName ?? raw?.canonical_name ?? '',
    displayNameEn: raw?.displayNameEn ?? raw?.display_name_en ?? '',
    displayNameZh: raw?.displayNameZh ?? raw?.display_name_zh ?? '',
    aliases: normalizeStringList(raw?.aliases),
    domains: normalizeStringList(raw?.domains),
    sourceKind: raw?.sourceKind ?? raw?.source_kind ?? '',
    sourceProvider: raw?.sourceProvider ?? raw?.source_provider ?? '',
    sourcePage: raw?.sourcePage ?? raw?.source_page ?? '',
    sourceRevisionTimestamp: raw?.sourceRevisionTimestamp ?? raw?.source_revision_timestamp ?? '',
    sourceUpdatedAt: raw?.sourceUpdatedAt ?? raw?.source_updated_at ?? '',
    sourceLabel: raw?.sourceLabel ?? raw?.source_label ?? '',
    sourceFile: raw?.sourceFile ?? raw?.source_file ?? '',
    sourceUrls: normalizeStringList(raw?.sourceUrls ?? raw?.source_urls),
    manualOnly: Boolean(raw?.manualOnly ?? raw?.manual_only),
    members: Array.isArray(raw?.members) ? raw.members.map(normalizeItemGroupMember) : [],
  }
}

function normalizePayload(group: ItemGroup): ItemGroup {
  return {
    canonicalName: group.canonicalName.trim(),
    displayNameEn: group.displayNameEn?.trim() || group.canonicalName.trim(),
    displayNameZh: group.displayNameZh?.trim() || '',
    aliases: normalizeStringList(group.aliases),
    domains: normalizeStringList(group.domains).map((domain) => domain.toLowerCase().replace(/-/g, '_')),
    sourceKind: group.sourceKind?.trim() || 'manual_wiki_source',
    sourceProvider: group.sourceProvider?.trim() || '',
    sourcePage: group.sourcePage?.trim() || '',
    sourceRevisionTimestamp: group.sourceRevisionTimestamp?.trim() || '',
    sourceUpdatedAt: group.sourceUpdatedAt?.trim() || '',
    sourceLabel: group.sourceLabel?.trim() || '',
    sourceFile: group.sourceFile?.trim() || '',
    sourceUrls: normalizeStringList(group.sourceUrls),
    manualOnly: Boolean(group.manualOnly),
    members: (group.members || []).map((member) => ({
      itemId: member.itemId ?? null,
      internalName: member.internalName?.trim() || '',
      name: member.name?.trim() || '',
      nameZh: member.nameZh?.trim() || '',
      image: member.image?.trim() || member.imageUrl?.trim() || '',
      imageUrl: member.imageUrl?.trim() || member.image?.trim() || '',
    })),
  }
}

export const useItemGroupsStore = defineStore('itemGroups', () => {
  const fetchItemGroups = async (keyword = '', domain = ''): Promise<ItemGroup[]> => {
    try {
      const response = await get('/admin/item-groups', {
        keyword: keyword || undefined,
        domain: domain && domain !== 'all' ? domain : undefined,
      })
      const source = response?.data ?? response
      return Array.isArray(source) ? source.map(normalizeItemGroup) : []
    } catch (error: any) {
      console.error('Failed to fetch item groups:', error)
      showToast(error?.data?.message || error?.message || '获取任意物品组失败', 'error')
      throw error
    }
  }

  const fetchItemGroupDetail = async (canonicalName: string): Promise<ItemGroup | null> => {
    try {
      const response = await get(`/admin/item-groups/${encodeURIComponent(canonicalName)}`)
      const source = response?.data ?? response
      return source ? normalizeItemGroup(source) : null
    } catch (error: any) {
      console.error('Failed to fetch item group detail:', error)
      showToast(error?.data?.message || error?.message || '获取任意物品组详情失败', 'error')
      return null
    }
  }

  const createItemGroup = async (payload: ItemGroup): Promise<ItemGroup | null> => {
    try {
      const response = await post('/admin/item-groups', normalizePayload(payload) as any)
      const source = response?.data ?? response
      showToast('任意物品组已创建', 'success')
      return source ? normalizeItemGroup(source) : null
    } catch (error: any) {
      console.error('Failed to create item group:', error)
      showToast(error?.data?.message || error?.message || '创建任意物品组失败', 'error')
      return null
    }
  }

  const updateItemGroup = async (canonicalName: string, payload: ItemGroup): Promise<ItemGroup | null> => {
    try {
      const response = await put(`/admin/item-groups/${encodeURIComponent(canonicalName)}`, normalizePayload(payload) as any)
      const source = response?.data ?? response
      showToast('任意物品组已更新', 'success')
      return source ? normalizeItemGroup(source) : null
    } catch (error: any) {
      console.error('Failed to update item group:', error)
      showToast(error?.data?.message || error?.message || '更新任意物品组失败', 'error')
      return null
    }
  }

  const deleteItemGroup = async (canonicalName: string): Promise<boolean> => {
    try {
      await del(`/admin/item-groups/${encodeURIComponent(canonicalName)}`)
      showToast('任意物品组已删除', 'success')
      return true
    } catch (error: any) {
      console.error('Failed to delete item group:', error)
      showToast(error?.data?.message || error?.message || '删除任意物品组失败', 'error')
      return false
    }
  }

  return {
    fetchItemGroups,
    fetchItemGroupDetail,
    createItemGroup,
    updateItemGroup,
    deleteItemGroup,
  }
})
