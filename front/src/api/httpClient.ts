import axios, { type AxiosInstance } from 'axios'

export interface HttpClientOptions {
  baseURL?: string
  timeout?: number
  withCredentials?: boolean
  errorLabel?: string
}

export const DEFAULT_HTTP_CLIENT_TIMEOUT = 10000
export const DEFAULT_HTTP_CLIENT_WITH_CREDENTIALS = true
export const DEFAULT_HTTP_CLIENT_ERROR_LABEL = 'API Error:'

export const createHttpClient = (options: HttpClientOptions = {}): AxiosInstance => {
  const {
    baseURL,
    timeout = DEFAULT_HTTP_CLIENT_TIMEOUT,
    withCredentials = DEFAULT_HTTP_CLIENT_WITH_CREDENTIALS,
    errorLabel = DEFAULT_HTTP_CLIENT_ERROR_LABEL,
  } = options

  const client = axios.create({
    baseURL,
    timeout,
    withCredentials,
  })

  client.interceptors.response.use(
    response => response,
    error => {
      console.error(errorLabel, error)
      return Promise.reject(error)
    }
  )

  return client
}
