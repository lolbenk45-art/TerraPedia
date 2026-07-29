import type { ApiResponse } from '~/types/public-api'

type PublicApiRuntimeConfig = {
  apiServerBase?: string
  public: {
    apiBase?: string
  }
}

type PublicApiFetchImplementation = <T>(
  request: string,
  options?: Record<string, unknown>,
) => Promise<ApiResponse<T>>

export const unwrapApiResponse = <T>(response: ApiResponse<T> | T): T => {
  if (response && typeof response === 'object' && 'data' in response) {
    return (response as ApiResponse<T>).data as T
  }

  return response as T
}

export const createPublicApiFetcher = (
  config: PublicApiRuntimeConfig,
  fetchImplementation: PublicApiFetchImplementation,
  server = import.meta.server,
) => async <T>(
  path: string,
  options: Record<string, unknown> = {},
): Promise<ApiResponse<T>> => {
  const browserApiBase = config.public.apiBase || '/api'
  const apiBase = String(server ? config.apiServerBase : browserApiBase).replace(/\/$/, '')
  const apiPath = path.startsWith('/') ? path : `/${path}`

  return await fetchImplementation<T>(`${apiBase}${apiPath}`, options)
}

export const usePublicApiFetcher = () => createPublicApiFetcher(
  useRuntimeConfig(),
  $fetch as PublicApiFetchImplementation,
)

export const usePublicApiFetch = async <T>(
  path: string,
  options: Record<string, unknown> = {},
): Promise<ApiResponse<T>> => usePublicApiFetcher()<T>(path, options)
