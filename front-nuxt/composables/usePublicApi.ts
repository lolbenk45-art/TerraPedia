import type { ApiResponse } from '~/types/public-api'

export const unwrapApiResponse = <T>(response: ApiResponse<T> | T): T => {
  if (response && typeof response === 'object' && 'data' in response) {
    return (response as ApiResponse<T>).data as T
  }

  return response as T
}

export const usePublicApiFetch = async <T>(
  path: string,
  options: Record<string, unknown> = {},
): Promise<ApiResponse<T>> => {
  const config = useRuntimeConfig()
  const apiBase = String(config.public.apiBase || '/api').replace(/\/$/, '')
  const apiPath = path.startsWith('/') ? path : `/${path}`

  return await $fetch<ApiResponse<T>>(`${apiBase}${apiPath}`, options)
}
