import { request, type APIRequestContext, type APIResponse, type BrowserContext, type Page, type Response } from '@playwright/test'

const RUN_ID_PATTERN = /^[a-f0-9]{32}$/
const AUTH_COOKIE_NAMES = ['tp_user_access', 'tp_user_refresh'] as const
const AUTH_SUCCESS_STATUS = 200
const REGISTER_DEBUG_CODE_GUARD_ATTRIBUTE = 'data-terrapedia-e2e-register-debug-code-guard'
const REGISTER_DEBUG_CODE_SELECTOR = 'form.user-form-panel > p.user-field-hint'
const REGISTER_DEBUG_CODE_TEXT_PREFIX = '开发验证码：'

type ApiEnvelope = {
  success?: unknown
  statusCode?: unknown
  message?: unknown
  data?: unknown
}

type ApiRecord = Record<string, unknown>

type ApiResponseLike = {
  status: () => number
  json: () => Promise<unknown>
  headersArray: () => Array<{ name: string, value: string }> | Promise<Array<{ name: string, value: string }>>
}

export type RunScopedUser = {
  email: string
  displayName: string
}

export const PASSWORD = 'Password123'

const requireEnvironment = (name: string, secret = false): string => {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(secret ? 'E2E run secret is required' : `${name} is required`)
  }
  return value
}

const e2eBaseUrl = requireEnvironment('E2E_BASE_URL').replace(/\/$/, '')
const e2eBackendBaseUrl = requireEnvironment('E2E_BACKEND_BASE_URL').replace(/\/$/, '')
const e2eRunId = requireEnvironment('E2E_RUN_ID')
const e2eRunSecret = requireEnvironment('E2E_RUN_SECRET', true)

if (!RUN_ID_PATTERN.test(e2eRunId)) {
  throw new Error('E2E_RUN_ID is unsafe')
}

const isRecord = (value: unknown): value is ApiRecord => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const messageOf = (envelope: ApiEnvelope): string => {
  const message = envelope.message
  return typeof message === 'string' && message.trim() ? message.trim() : 'Response message unavailable'
}

const responseError = (caseId: string, response: ApiResponseLike, fieldPath: string, envelope: ApiEnvelope): never => {
  throw new Error(`${caseId}: HTTP ${response.status()} ${fieldPath}: ${messageOf(envelope)}`)
}

const readEnvelope = async (caseId: string, response: ApiResponseLike): Promise<ApiEnvelope> => {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error(`${caseId}: HTTP ${response.status()} $: Response message unavailable`)
  }

  if (!isRecord(body)) {
    throw new Error(`${caseId}: HTTP ${response.status()} $: Response message unavailable`)
  }
  return body
}

const responseMessage = async (response: ApiResponseLike): Promise<string> => {
  try {
    return messageOf(await readEnvelope('AUTH-RESPONSE', response))
  } catch {
    return 'Response message unavailable'
  }
}

const cookieError = async (caseId: string, response: ApiResponseLike, fieldPath: string): Promise<never> => {
  throw new Error(`${caseId}: HTTP ${response.status()} ${fieldPath}: ${await responseMessage(response)}`)
}

export const assertSuccessfulApiResponse = async (
  caseId: string,
  response: ApiResponseLike,
  expectedHttpStatus = AUTH_SUCCESS_STATUS,
  expectedEnvelopeStatus = AUTH_SUCCESS_STATUS,
): Promise<ApiEnvelope> => {
  const envelope = await readEnvelope(caseId, response)
  if (response.status() !== expectedHttpStatus) {
    return responseError(caseId, response, '$.httpStatus', envelope)
  }
  if (envelope.success !== true) {
    return responseError(caseId, response, '$.success', envelope)
  }
  if (Number(envelope.statusCode) !== expectedEnvelopeStatus) {
    return responseError(caseId, response, '$.statusCode', envelope)
  }
  return envelope
}

export const assertFailedApiResponse = async (
  caseId: string,
  response: ApiResponseLike,
  expectedHttpStatus: number,
): Promise<ApiEnvelope> => {
  const envelope = await readEnvelope(caseId, response)
  if (response.status() !== expectedHttpStatus) {
    return responseError(caseId, response, '$.httpStatus', envelope)
  }
  if (envelope.success !== false) {
    return responseError(caseId, response, '$.success', envelope)
  }
  if (Number(envelope.statusCode) !== expectedHttpStatus) {
    return responseError(caseId, response, '$.statusCode', envelope)
  }
  return envelope
}

export const assertResponseMessage = async (
  caseId: string,
  response: ApiResponseLike,
  expectedMessage: string,
): Promise<void> => {
  const envelope = await readEnvelope(caseId, response)
  if (envelope.message !== expectedMessage) {
    return responseError(caseId, response, '$.message', envelope)
  }
}

export const assertSuccessfulAuthResponse = async (
  caseId: string,
  response: ApiResponseLike,
  expectedEmail: string,
  expectedHttpStatus = AUTH_SUCCESS_STATUS,
): Promise<ApiEnvelope> => {
  const envelope = await assertSuccessfulApiResponse(caseId, response, expectedHttpStatus)
  if (!isRecord(envelope.data)) {
    return responseError(caseId, response, '$.data', envelope)
  }
  if (!isRecord(envelope.data.user)) {
    return responseError(caseId, response, '$.data.user', envelope)
  }
  if (envelope.data.user.email !== expectedEmail) {
    return responseError(caseId, response, '$.data.user.email', envelope)
  }
  if (envelope.data.tokenType !== 'Bearer') {
    return responseError(caseId, response, '$.data.tokenType', envelope)
  }
  if (!Number.isFinite(Number(envelope.data.expiresAt)) || Number(envelope.data.expiresAt) <= Date.now()) {
    return responseError(caseId, response, '$.data.expiresAt', envelope)
  }
  return envelope
}

const authCookieHeaders = async (response: ApiResponseLike, name: string): Promise<string[]> =>
  (await response.headersArray())
    .filter((header) => header.name.toLowerCase() === 'set-cookie' && header.value.toLowerCase().startsWith(`${name}=`))
    .map((header) => header.value)

const setCookieHeader = async (response: ApiResponseLike, name: string): Promise<string | undefined> =>
  (await authCookieHeaders(response, name))[0]

const hasRequiredCookieAttributes = (header: string, expectedMaxAge: RegExp): boolean =>
  /;\s*HttpOnly(?:;|$)/i.test(header)
  && /;\s*Path=\/(?:;|$)/i.test(header)
  && /;\s*SameSite=(?:Lax|Strict|None)(?:;|$)/i.test(header)
  && expectedMaxAge.test(header)

export const assertAuthCookies = async (
  caseId: string,
  response: ApiResponseLike,
  context: BrowserContext,
): Promise<void> => {
  const cookies = await context.cookies(e2eBaseUrl)
  for (const name of AUTH_COOKIE_NAMES) {
    const cookie = cookies.find((candidate) => candidate.name === name)
    const header = await setCookieHeader(response, name)
    if (!cookie || cookie.httpOnly !== true || cookie.path !== '/' || cookie.expires <= Date.now() / 1000) {
      await cookieError(caseId, response, `$.cookies.${name}`)
    }
    if (!header || !hasRequiredCookieAttributes(header, /;\s*Max-Age=[1-9]\d*(?:;|$)/i)) {
      await cookieError(caseId, response, `$.cookies.${name}`)
    }
  }
}

export const assertClearedAuthCookies = async (
  caseId: string,
  response: ApiResponseLike,
  context: BrowserContext,
): Promise<void> => {
  const cookies = await context.cookies(e2eBaseUrl)
  for (const name of AUTH_COOKIE_NAMES) {
    const header = await setCookieHeader(response, name)
    if (cookies.some((candidate) => candidate.name === name)) {
      await cookieError(caseId, response, `$.cookies.${name}`)
    }
    if (!header || !hasRequiredCookieAttributes(header, /;\s*Max-Age=0(?:;|$)/i)) {
      await cookieError(caseId, response, `$.cookies.${name}`)
    }
  }
}

const clearsAuthCookie = (header: string): boolean =>
  hasRequiredCookieAttributes(header, /;\s*Max-Age=0(?:;|$)/i)

export const assertNoIssuedAuthCookies = async (
  caseId: string,
  response: ApiResponseLike,
  context: BrowserContext,
): Promise<void> => {
  const cookies = await context.cookies(e2eBaseUrl)
  for (const name of AUTH_COOKIE_NAMES) {
    if (cookies.some((candidate) => candidate.name === name)) {
      await cookieError(caseId, response, `$.cookies.${name}`)
    }
    if ((await authCookieHeaders(response, name)).some((header) => !clearsAuthCookie(header))) {
      await cookieError(caseId, response, `$.cookies.${name}`)
    }
  }
}

export const fillMaskedVerificationCode = async (
  page: Page,
  verificationCode: string,
  caseId: string,
): Promise<{ masked: true, valueMatches: true }> => {
  const input = page.getByLabel('验证码', { exact: true })
  const maskApplied = await input.evaluate((element) => {
    if (!(element instanceof HTMLInputElement)) {
      return false
    }
    element.type = 'password'
    return element.type === 'password'
  })
  if (!maskApplied) {
    throw new Error(`${caseId}: HTTP 0 $.ui.verificationCode: Response message unavailable`)
  }

  await input.fill(verificationCode)
  const inputValue = await input.inputValue()
  const remainsMasked = await input.evaluate((element) =>
    element instanceof HTMLInputElement && element.type === 'password',
  )
  if (!remainsMasked || inputValue !== verificationCode) {
    throw new Error(`${caseId}: HTTP 0 $.ui.verificationCode: Response message unavailable`)
  }
  return { masked: true, valueMatches: true }
}

export const installRegisterDebugCodeSuppression = async (page: Page, _caseId: string): Promise<void> => {
  await page.addInitScript(
    ({ guardAttribute, selector, textPrefix }) => {
      const ensureSuppression = () => {
        document.querySelectorAll(selector).forEach((element) => {
          if (element.textContent?.trim().startsWith(textPrefix)) {
            element.remove()
          }
        })
      }

      const observer = new MutationObserver(ensureSuppression)
      observer.observe(document, { childList: true, subtree: true, characterData: true })
      const installGuard = () => {
        document.documentElement.setAttribute(guardAttribute, 'installed')
        ensureSuppression()
      }
      if (document.documentElement) {
        installGuard()
      } else {
        document.addEventListener('DOMContentLoaded', installGuard, { once: true })
      }
    },
    {
      guardAttribute: REGISTER_DEBUG_CODE_GUARD_ATTRIBUTE,
      selector: REGISTER_DEBUG_CODE_SELECTOR,
      textPrefix: REGISTER_DEBUG_CODE_TEXT_PREFIX,
    },
  )
}

export const assertRegisterDebugCodeSuppressed = async (page: Page, caseId: string): Promise<void> => {
  const state = await page.locator('form.user-form-panel > p.user-field-hint').evaluateAll(
    (elements, { guardAttribute, textPrefix }) => {
      const debugCodeNodePresent = elements.some((element) => element.textContent?.trim().startsWith(textPrefix))
      return {
        guardInstalled: document.documentElement.getAttribute(guardAttribute) === 'installed',
        debugCodeNodePresent,
      }
    },
    {
      guardAttribute: REGISTER_DEBUG_CODE_GUARD_ATTRIBUTE,
      textPrefix: REGISTER_DEBUG_CODE_TEXT_PREFIX,
    },
  )

  if (!state.guardInstalled || state.debugCodeNodePresent) {
    throw new Error(`${caseId}: HTTP 0 $.ui.registerDebugCode: Response message unavailable`)
  }
}

const endpoint = (path: string): string => new URL(path, e2eBackendBaseUrl).toString()

export const getRunScopedUser = (suffix: string): RunScopedUser => {
  if (!/^[a-z0-9-]{1,32}$/.test(suffix)) {
    throw new Error('E2E user suffix is unsafe')
  }
  return {
    email: `e2e-${e2eRunId.slice(0, 24)}-${suffix}@e2e.terrapedia.test`,
    displayName: 'E2E Runner',
  }
}

export const requestRegisterCode = async (api: APIRequestContext, email: string): Promise<APIResponse> =>
  await api.post(endpoint('/api/user-auth/register/code'), { data: { email } })

export const registerUser = async (
  api: APIRequestContext,
  user: RunScopedUser,
  verificationCode: string,
): Promise<APIResponse> =>
  await api.post(endpoint('/api/user-auth/register'), {
    data: {
      email: user.email,
      password: PASSWORD,
      displayName: user.displayName,
      verificationCode,
    },
  })

export const loginUser = async (api: APIRequestContext, user: RunScopedUser): Promise<APIResponse> =>
  await api.post(endpoint('/api/user-auth/login'), { data: { email: user.email, password: PASSWORD } })

export const refreshUserSessionWithPageFetch = async (page: Page, caseId: string): Promise<Response> => {
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST' && response.url().endsWith('/api/user-auth/refresh'),
  )
  const fetchStatus = await page.evaluate(async () => {
    const response = await fetch('/api/user-auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
    return response.status
  })
  const response = await responsePromise
  if (fetchStatus !== response.status()) {
    throw new Error(`${caseId}: HTTP ${response.status()} $.httpStatus: Response message unavailable`)
  }
  return response
}

export const logoutUser = async (api: APIRequestContext): Promise<APIResponse> =>
  await api.post(endpoint('/api/user-auth/logout'))

export const getVerificationCode = async (email: string, caseId: string): Promise<string> => {
  const mailbox = await request.newContext({
    baseURL: e2eBackendBaseUrl,
    extraHTTPHeaders: { 'X-TerraPedia-E2E-Secret': e2eRunSecret },
  })
  try {
    const response = await mailbox.get(`/api/e2e/verification-codes/${encodeURIComponent(email)}`)
    const envelope = await assertSuccessfulApiResponse(caseId, response)
    if (!isRecord(envelope.data) || typeof envelope.data.code !== 'string' || !/^\d{4,8}$/.test(envelope.data.code)) {
      return responseError(caseId, response, '$.data.code', envelope)
    }
    return envelope.data.code
  } finally {
    await mailbox.dispose()
  }
}

let activeUserBootstrap: Promise<RunScopedUser> | undefined

export const bootstrapActiveUser = async (): Promise<RunScopedUser> => {
  if (activeUserBootstrap) {
    return await activeUserBootstrap
  }

  activeUserBootstrap = (async () => {
    const api = await request.newContext({ baseURL: e2eBackendBaseUrl })
    const activeUser = getRunScopedUser('active')
    try {
      const codeResponse = await requestRegisterCode(api, activeUser.email)
      await assertSuccessfulApiResponse('AUTH-BOOTSTRAP', codeResponse)
      const verificationCode = await getVerificationCode(activeUser.email, 'AUTH-BOOTSTRAP')
      const registerResponse = await registerUser(api, activeUser, verificationCode)
      if (registerResponse.status() === 201) {
        await assertSuccessfulAuthResponse('AUTH-BOOTSTRAP', registerResponse, activeUser.email, 201)
        return activeUser
      }
      if (registerResponse.status() === 400) {
        await assertFailedApiResponse('AUTH-BOOTSTRAP', registerResponse, 400)
        const loginResponse = await loginUser(api, activeUser)
        await assertSuccessfulAuthResponse('AUTH-BOOTSTRAP', loginResponse, activeUser.email)
        return activeUser
      }
      await assertSuccessfulAuthResponse('AUTH-BOOTSTRAP', registerResponse, activeUser.email, 201)
      return activeUser
    } finally {
      await api.dispose()
    }
  })()

  return await activeUserBootstrap
}
