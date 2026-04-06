import type { Ref } from 'vue'

type PaginationState = {
  page: number
  size: number
  total: number
  totalPages: number
}

type WithId = {
  id: number | string
}

export function usePagedCollectionSync<T extends WithId>(
  list: Ref<T[]>,
  pagination: Ref<PaginationState>
) {
  const recalcTotalPages = () => {
    const size = Math.max(pagination.value.size || 1, 1)
    pagination.value.totalPages = pagination.value.total > 0
      ? Math.ceil(pagination.value.total / size)
      : 0
  }

  const replaceById = (item: T) => {
    const index = list.value.findIndex(entry => entry.id === item.id)
    if (index >= 0) {
      list.value.splice(index, 1, item)
      return true
    }
    return false
  }

  const prependOnFirstPage = (item: T) => {
    if (pagination.value.page !== 1) return
    list.value.unshift(item)
    if (list.value.length > pagination.value.size) {
      list.value.splice(pagination.value.size)
    }
  }

  const syncCreated = (item: T) => {
    pagination.value.total += 1
    recalcTotalPages()
    prependOnFirstPage(item)
  }

  const syncUpdated = (item: T) => {
    replaceById(item)
  }

  const syncDeleted = (id: T['id']) => {
    const index = list.value.findIndex(entry => entry.id === id)
    if (index >= 0) {
      list.value.splice(index, 1)
    }
    pagination.value.total = Math.max(0, pagination.value.total - 1)
    recalcTotalPages()
  }

  return {
    replaceById,
    syncCreated,
    syncUpdated,
    syncDeleted
  }
}
