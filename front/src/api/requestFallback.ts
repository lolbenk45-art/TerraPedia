export type RequestFallbackLogger = (message: string, error: unknown) => void

export interface RequestWithFallbackOptions<T> {
  request: () => Promise<T> | T
  fallbackValue: T
  errorMessage: string
  logger?: RequestFallbackLogger
}

export const requestWithFallback = async <T>({
  request,
  fallbackValue,
  errorMessage,
  logger = console.error,
}: RequestWithFallbackOptions<T>): Promise<T> => {
  try {
    return await request()
  } catch (error) {
    logger(errorMessage, error)
    return fallbackValue
  }
}
