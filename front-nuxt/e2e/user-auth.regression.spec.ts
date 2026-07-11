import { expect, test, type Page } from '@playwright/test'
import {
  assertClearedAuthCookies,
  assertFailedApiResponse,
  assertResponseMessage,
  assertNoIssuedAuthCookies,
  assertSuccessfulApiResponse,
  bootstrapActiveUser,
  fillMaskedVerificationCode,
  getRunScopedUser,
  getVerificationCode,
  installRegisterDebugCodeSuppression,
  PASSWORD,
  refreshUserSessionWithPageFetch,
  assertRegisterDebugCodeSuppressed,
  type RunScopedUser,
} from './support/auth-fixtures'

let activeUser: RunScopedUser

test.beforeAll(async () => {
  activeUser = await bootstrapActiveUser()
})

const loginRequest = (url: string, method: string) =>
  method === 'POST' && url.endsWith('/api/user-auth/login')

const registerRequest = (url: string, method: string) =>
  method === 'POST' && url.endsWith('/api/user-auth/register')

const fillRegistrationForm = async (page: Page, user: RunScopedUser) => {
  await page.getByLabel('昵称', { exact: true }).fill(user.displayName)
  await page.getByLabel('邮箱', { exact: true }).fill(user.email)
  await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
}

test('AUTH-LOGIN-002 rejects a wrong valid-shaped password without auth cookies', async ({ page }) => {
  await page.goto('/user/login')
  await page.getByLabel('邮箱', { exact: true }).fill(activeUser.email)
  await page.getByLabel('密码', { exact: true }).fill('WrongPass123')

  const responsePromise = page.waitForResponse((response) => loginRequest(response.url(), response.request().method()))
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const response = await responsePromise

  await assertFailedApiResponse('AUTH-LOGIN-002', response, 400)
  await assertNoIssuedAuthCookies('AUTH-LOGIN-002', response, page.context())
  await expect(page).toHaveURL(/\/user\/login$/)
  await expect(page.locator('.user-form-error')).toBeVisible()
})

test('AUTH-LOGIN-003 blocks a malformed email in the browser before a login request', async ({ page }) => {
  let loginRequests = 0
  page.on('request', (request) => {
    if (loginRequest(request.url(), request.method())) {
      loginRequests += 1
    }
  })

  await page.goto('/user/login')
  await page.getByLabel('邮箱', { exact: true }).fill('not-an-email')
  await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
  await expect(page.getByLabel('邮箱', { exact: true }).evaluate((input) => (input as HTMLInputElement).validity.valid)).resolves.toBe(false)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForTimeout(150)

  expect(loginRequests).toBe(0)
})

test('AUTH-REGISTER-002 rejects a duplicate account without auth cookies', async ({ page }) => {
  await page.goto('/user/register')
  await fillRegistrationForm(page, activeUser)
  const duplicateCodeState = await fillMaskedVerificationCode(page, '1234', 'AUTH-REGISTER-002')
  expect(duplicateCodeState.masked && duplicateCodeState.valueMatches).toBe(true)

  const responsePromise = page.waitForResponse((response) => registerRequest(response.url(), response.request().method()))
  await page.getByRole('button', { name: '注册', exact: true }).click()
  const response = await responsePromise

  await assertFailedApiResponse('AUTH-REGISTER-002', response, 400)
  await assertResponseMessage('AUTH-REGISTER-002', response, 'Email is already registered')
  await assertNoIssuedAuthCookies('AUTH-REGISTER-002', response, page.context())
  await expect(page).toHaveURL(/\/user\/register$/)
  await expect(page.locator('.user-form-error')).toBeVisible()
})

test('AUTH-REGISTER-003 blocks a 9-character submission and caps native password input at 64 characters', async ({ page }) => {
  let registrationRequests = 0
  page.on('request', (request) => {
    if (registerRequest(request.url(), request.method())) {
      registrationRequests += 1
    }
  })

  await page.goto('/user/register')
  await page.getByLabel('昵称', { exact: true }).fill('E2E Runner')
  await page.getByLabel('邮箱', { exact: true }).fill(getRunScopedUser('password-boundary').email)
  const boundaryCodeState = await fillMaskedVerificationCode(page, '1234', 'AUTH-REGISTER-003')
  expect(boundaryCodeState.masked && boundaryCodeState.valueMatches).toBe(true)

  const passwordInput = page.getByLabel('密码', { exact: true })
  await passwordInput.pressSequentially('Abcdefg12')
  await expect(passwordInput.evaluate((input) => (input as HTMLInputElement).validity.valid)).resolves.toBe(false)
  await page.getByRole('button', { name: '注册', exact: true }).click()
  await page.waitForTimeout(150)

  await passwordInput.fill('')
  await passwordInput.pressSequentially('Abcdefg123')
  await expect(passwordInput).toHaveValue('Abcdefg123')
  await expect(passwordInput.evaluate((input) => (input as HTMLInputElement).validity.valid)).resolves.toBe(true)

  await passwordInput.fill('')
  await passwordInput.pressSequentially(`A1${'x'.repeat(62)}`)
  await expect(passwordInput).toHaveValue(`A1${'x'.repeat(62)}`)
  await expect(passwordInput.evaluate((input) => (input as HTMLInputElement).validity.valid)).resolves.toBe(true)
  await passwordInput.pressSequentially('x')
  await expect(passwordInput.evaluate((input) => (input as HTMLInputElement).value.length)).resolves.toBe(64)

  expect(registrationRequests).toBe(0)
})

test('AUTH-REGISTER-004 blocks malformed codes in the browser and rejects wrong valid-shaped codes without auth cookies', async ({ page }) => {
  const user = getRunScopedUser('wrong-code')
  let registrationRequests = 0
  page.on('request', (request) => {
    if (registerRequest(request.url(), request.method())) {
      registrationRequests += 1
    }
  })

  await installRegisterDebugCodeSuppression(page, 'AUTH-REGISTER-004')
  await page.goto('/user/register')
  await page.getByLabel('昵称', { exact: true }).fill(user.displayName)
  await page.getByLabel('邮箱', { exact: true }).fill(user.email)
  await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
  await assertRegisterDebugCodeSuppressed(page, 'AUTH-REGISTER-004')

  const verificationCodeInput = page.getByLabel('验证码', { exact: true })
  const malformedCodeState = await fillMaskedVerificationCode(page, '123', 'AUTH-REGISTER-004')
  expect(malformedCodeState.masked && malformedCodeState.valueMatches).toBe(true)
  await expect(verificationCodeInput.evaluate((input) => (input as HTMLInputElement).validity.valid)).resolves.toBe(false)
  await expect(verificationCodeInput.evaluate((input) => (input as HTMLInputElement).validationMessage)).resolves.toBeTruthy()
  await page.getByRole('button', { name: '注册', exact: true }).click()
  await page.waitForTimeout(150)
  expect(registrationRequests).toBe(0)

  const codeResponsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST' && response.url().endsWith('/api/user-auth/register/code'),
  )
  await page.getByRole('button', { name: '发送验证码', exact: true }).click()
  const codeResponse = await codeResponsePromise
  await assertSuccessfulApiResponse('AUTH-REGISTER-004', codeResponse)
  await assertRegisterDebugCodeSuppressed(page, 'AUTH-REGISTER-004')

  const issuedCode = await getVerificationCode(user.email, 'AUTH-REGISTER-004')
  const wrongCode = issuedCode.replace(/^./, (character) => character === '0' ? '1' : '0')
  const wrongCodeState = await fillMaskedVerificationCode(page, wrongCode, 'AUTH-REGISTER-004')
  expect(wrongCodeState.masked && wrongCodeState.valueMatches).toBe(true)

  const responsePromise = page.waitForResponse((response) => registerRequest(response.url(), response.request().method()))
  await page.getByRole('button', { name: '注册', exact: true }).click()
  const response = await responsePromise

  await assertFailedApiResponse('AUTH-REGISTER-004', response, 400)
  await assertNoIssuedAuthCookies('AUTH-REGISTER-004', response, page.context())
  await expect(page).toHaveURL(/\/user\/register$/)
  await expect(page.locator('.user-form-error')).toBeVisible()
})

test('AUTH-SESSION-001 clears missing and invalid refresh cookies before protected-page redirect', async ({ page }) => {
  await page.goto('/user/login')
  const missingCookieNames = (await page.context().cookies(process.env.E2E_BASE_URL!))
    .filter((cookie) => cookie.name === 'tp_user_access' || cookie.name === 'tp_user_refresh')
    .map((cookie) => cookie.name)
  expect(missingCookieNames).toEqual([])

  const missingResponse = await refreshUserSessionWithPageFetch(page, 'AUTH-SESSION-001')
  await assertFailedApiResponse('AUTH-SESSION-001', missingResponse, 401)
  await assertClearedAuthCookies('AUTH-SESSION-001', missingResponse, page.context())
  await page.goto('/user/settings')
  await expect(page).toHaveURL(/\/user\/login/)

  await page.context().clearCookies()
  await page.context().addCookies([
    { name: 'tp_user_access', value: 'invalid-session', url: process.env.E2E_BASE_URL!, httpOnly: true },
    { name: 'tp_user_refresh', value: 'invalid-session', url: process.env.E2E_BASE_URL!, httpOnly: true },
  ])
  const invalidCookieNames = (await page.context().cookies(process.env.E2E_BASE_URL!))
    .filter((cookie) => cookie.name === 'tp_user_access' || cookie.name === 'tp_user_refresh')
    .map((cookie) => cookie.name)
  expect(invalidCookieNames).toEqual(expect.arrayContaining(['tp_user_access', 'tp_user_refresh']))

  const invalidResponse = await refreshUserSessionWithPageFetch(page, 'AUTH-SESSION-001')
  await assertFailedApiResponse('AUTH-SESSION-001', invalidResponse, 401)
  await assertClearedAuthCookies('AUTH-SESSION-001', invalidResponse, page.context())
  await page.goto('/user/settings')
  await expect(page).toHaveURL(/\/user\/login/)
})
