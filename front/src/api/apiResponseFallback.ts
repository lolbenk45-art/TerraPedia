import type { ApiResponse, Pagination } from '@/types'

export type ApiResponseFallbackLogger = (message: string, error: unknown) => void

export interface RequestApiResponseWithFallbackOptions<T> {
  request: () => Promise<ApiResponse<T>> | ApiResponse<T>
  fallbackData: T
  fallbackMessage: string
  statusCode: number
  pagination?: Pagination
  logger?: ApiResponseFallbackLogger
}

const logRequestFailure = (
  logger: ApiResponseFallbackLogger | undefined,
  message: string,
  error: unknown
) => {
  try {
    ;(logger ?? console.error)(message, error)
  } catch {
    // Swallow logger failures so the request still soft-fails.
  }
}

export const requestApiResponseWithFallback = async <T>({
  request,
  fallbackData,
  fallbackMessage,
  statusCode,
  pagination,
  logger,
}: RequestApiResponseWithFallbackOptions<T>): Promise<ApiResponse<T>> => {
  try {
    return await request()
  } catch (error) {
    logRequestFailure(logger, fallbackMessage, error)

    return {
      success: false,
      data: fallbackData,
      message: fallbackMessage,
      statusCode,
      ...(pagination ? { pagination } : {}),
    }
  }
}
