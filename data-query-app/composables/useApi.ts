type ApiFetchOptions = Record<string, any>

type ApiFetchHook = (context: any) => void | Promise<void>

const TOKEN_COOKIE_KEY = 'tp_admin_token'
const USER_COOKIE_KEY = 'tp_admin_user'
const EXPIRES_AT_COOKIE_KEY = 'tp_admin_expires_at'

const clearAuthCookies = () => {
  useCookie<string | null>(TOKEN_COOKIE_KEY).value = null
  useCookie<any>(USER_COOKIE_KEY).value = null
  useCookie<number | null>(EXPIRES_AT_COOKIE_KEY).value = null
}

const requestInterceptor = (options: ApiFetchOptions = {}) => {
  const headers: Record<string, string> = {}

  if (options.headers instanceof Headers) {
    options.headers.forEach((value: string, key: string) => {
      headers[key] = value
    })
  } else if (Array.isArray(options.headers)) {
    options.headers.forEach(([key, value]: [string, string]) => {
      headers[key] = value
    })
  } else if (typeof options.headers === 'object' && options.headers !== null) {
    Object.assign(headers, options.headers)
  }

  const token = useCookie<string | null>(TOKEN_COOKIE_KEY).value
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`
  }

  return {
    ...options,
    headers
  }
}

const responseInterceptor = <T>(response: T) => response

const errorHandler = (error: unknown) => {
  const statusCode = Number(
    (error as any)?.statusCode ??
    (error as any)?.response?.status ??
    (error as any)?.data?.statusCode ??
    0
  )

  if (statusCode === 401) {
    clearAuthCookies()

    if (import.meta.client && window.location.pathname !== '/login') {
      const redirect = `${window.location.pathname}${window.location.search}${window.location.hash}`
      window.location.assign(`/login?redirect=${encodeURIComponent(redirect)}`)
    }
  }

  console.error('API Error:', error)
  throw error
}

const normalizeUrl = (url: string) => {
  if (/^https?:\/\//.test(url)) return url
  return url.startsWith('/') ? url : `/${url}`
}

const getBaseURL = () => {
  const config = useRuntimeConfig()
  return config.public.apiBase || ''
}

const callHook = (hooks: ApiFetchHook | ApiFetchHook[] | undefined, context: any) => {
  if (!hooks) return
  if (Array.isArray(hooks)) {
    hooks.forEach(hook => hook(context))
    return
  }
  hooks(context)
}

const request = async <T = any>(url: string, options: ApiFetchOptions = {}) => {
  try {
    const response = await $fetch<T>(normalizeUrl(url), {
      baseURL: getBaseURL(),
      ...requestInterceptor(options)
    })
    return responseInterceptor(response)
  } catch (err) {
    return errorHandler(err)
  }
}

export const get = <T = any>(url: string, params?: Record<string, any>) =>
  request<T>(url, {
    method: 'GET',
    params
  })

export const post = <T = any>(url: string, body?: Record<string, any>) =>
  request<T>(url, {
    method: 'POST',
    body
  })

export const put = <T = any>(url: string, body?: Record<string, any>) =>
  request<T>(url, {
    method: 'PUT',
    body
  })

export const patch = <T = any>(url: string, body?: Record<string, any>) =>
  request<T>(url, {
    method: 'PATCH',
    body
  })

export const del = <T = any>(url: string) =>
  request<T>(url, {
    method: 'DELETE'
  })

export const useApiFetch = <T = any>(url: string, options: ApiFetchOptions = {}) => {
  const {
    onRequest,
    onResponse,
    onRequestError,
    onResponseError,
    ...rest
  } = options

  return useFetch<T>(normalizeUrl(url), {
    baseURL: getBaseURL(),
    ...rest,
    onRequest(context: any) {
      Object.assign(context.options, requestInterceptor(context.options))
      callHook(onRequest, context)
    },
    onResponse(context: any) {
      callHook(onResponse, context)
      const response = context.response
      if (response) {
        const data = responseInterceptor(response._data as T)
        response._data = data
      }
    },
    onRequestError(context: any) {
      callHook(onRequestError, context)
      return errorHandler(context.error)
    },
    onResponseError(context: any) {
      callHook(onResponseError, context)
      return errorHandler(context.error)
    }
  })
}
