import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockClient = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/api/httpClient', () => ({
  createHttpClient: vi.fn(() => mockClient),
}))

const loadService = async () => import('@/services/categoryManagement')

describe('categoryManagement service contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls the backend validate endpoint without the legacy /categories/validate path', async () => {
    mockClient.get.mockResolvedValueOnce({
      data: { data: true },
    })

    const { validateCategoryHierarchy } = await loadService()

    await expect(validateCategoryHierarchy(42, null)).resolves.toBe(true)

    expect(mockClient.get).toHaveBeenCalledWith('/categories/42/validate')
  })

  it('sends updateCategoryParent requests with the required newParentId query parameter', async () => {
    const updatedCategory = { id: 42, parentId: 7 }
    mockClient.put.mockResolvedValueOnce({
      data: { data: updatedCategory },
    })

    const { updateCategoryParent } = await loadService()

    await expect(updateCategoryParent(42, 7)).resolves.toEqual(updatedCategory)

    expect(mockClient.put).toHaveBeenCalledWith('/categories/42/parent?newParentId=7')
  })

  it('soft-fails updateCategoryParent when newParentId is missing instead of calling an invalid backend path', async () => {
    const { updateCategoryParent } = await loadService()

    await expect(updateCategoryParent(42, null as unknown as number)).resolves.toBeNull()

    expect(mockClient.put).not.toHaveBeenCalled()
  })

  it('returns false without alerting when deleteCategory fails', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockClient.delete.mockRejectedValueOnce({
      response: {
        data: {
          message: 'cannot delete',
        },
      },
    })

    const { deleteCategory } = await loadService()

    await expect(deleteCategory(9)).resolves.toBe(false)

    expect(alertSpy).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to delete category:',
      expect.objectContaining({
        response: {
          data: {
            message: 'cannot delete',
          },
        },
      }),
    )
  })

  it('returns false without alerting when deleteCategoryWithChildren fails', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockClient.delete.mockRejectedValueOnce({
      response: {
        data: {
          message: 'cannot delete subtree',
        },
      },
    })

    const { deleteCategoryWithChildren } = await loadService()

    await expect(deleteCategoryWithChildren(9)).resolves.toBe(false)

    expect(alertSpy).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to delete category subtree:',
      expect.objectContaining({
        response: {
          data: {
            message: 'cannot delete subtree',
          },
        },
      }),
    )
  })
})
