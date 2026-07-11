import { expect, test, type Page } from '@playwright/test'
import {
  assertAuthCookies,
  assertClearedAuthCookies,
  assertSuccessfulApiResponse,
  assertSuccessfulAuthResponse,
  bootstrapActiveUser,
  fillMaskedVerificationCode,
  getRunScopedUser,
  getVerificationCode,
  installRegisterDebugCodeSuppression,
  PASSWORD,
  assertRegisterDebugCodeSuppressed,
  type RunScopedUser,
} from './support/auth-fixtures'

let activeUser: RunScopedUser

test.beforeAll(async () => {
  activeUser = await bootstrapActiveUser()
})

const loginThroughUi = async (page: Page, user: RunScopedUser, caseId: string) => {
  await page.goto('/user/login')
  await page.getByLabel('邮箱', { exact: true }).fill(user.email)
  await page.getByLabel('密码', { exact: true }).fill(PASSWORD)

  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST' && response.url().endsWith('/api/user-auth/login'),
  )
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const response = await responsePromise
  await assertSuccessfulAuthResponse(caseId, response, user.email, 200)
  await assertAuthCookies(caseId, response, page.context())
  await expect(page).toHaveURL(/\/user$/)
}

test('AUTH-LOGIN-001 P0 logs in the run-scoped active user through the login form', async ({ page }) => {
  await loginThroughUi(page, activeUser, 'AUTH-LOGIN-001')
  await expect(page.getByText('已登录', { exact: true })).toBeVisible()
})

test('AUTH-REGISTER-001 P0 registers through the form after retrieving the E2E mailbox code', async ({ page }) => {
  const newUser = getRunScopedUser('register-smoke')

  await installRegisterDebugCodeSuppression(page, 'AUTH-REGISTER-001')
  await page.goto('/user/register')
  await page.getByLabel('昵称', { exact: true }).fill('E2E Runner')
  await page.getByLabel('邮箱', { exact: true }).fill(newUser.email)
  await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
  await assertRegisterDebugCodeSuppressed(page, 'AUTH-REGISTER-001')

  const sendCodeResponsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST' && response.url().endsWith('/api/user-auth/register/code'),
  )
  await page.getByRole('button', { name: '发送验证码', exact: true }).click()
  const sendCodeResponse = await sendCodeResponsePromise
  await assertSuccessfulApiResponse('AUTH-REGISTER-001', sendCodeResponse, undefined, 200)
  await assertRegisterDebugCodeSuppressed(page, 'AUTH-REGISTER-001')

  const verificationCode = await getVerificationCode(newUser.email, 'AUTH-REGISTER-001')
  const verificationCodeState = await fillMaskedVerificationCode(page, verificationCode, 'AUTH-REGISTER-001')
  expect(verificationCodeState.masked && verificationCodeState.valueMatches).toBe(true)

  const registerResponsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST' && response.url().endsWith('/api/user-auth/register'),
  )
  await page.getByRole('button', { name: '注册', exact: true }).click()
  const registerResponse = await registerResponsePromise
  await assertSuccessfulAuthResponse('AUTH-REGISTER-001', registerResponse, newUser.email, 201)
  await assertAuthCookies('AUTH-REGISTER-001', registerResponse, page.context())
  await expect(page).toHaveURL(/\/user$/)
})

test('AUTH-SESSION-002 P0 logs out, clears auth cookies, and redirects protected settings to login', async ({ page }) => {
  await loginThroughUi(page, activeUser, 'AUTH-SESSION-002')
  await page.goto('/user/settings')
  await expect(page).toHaveURL(/\/user\/settings$/)

  await page.locator('.account-menu').hover()
  const logoutResponsePromise = page.waitForResponse((response) =>
    response.request().method() === 'POST' && response.url().endsWith('/api/user-auth/logout'),
  )
  await page.getByRole('link', { name: '退出登录', exact: true }).click()
  const logoutResponse = await logoutResponsePromise
  await assertSuccessfulApiResponse('AUTH-SESSION-002', logoutResponse, undefined, 200)
  await assertClearedAuthCookies('AUTH-SESSION-002', logoutResponse, page.context())
  await expect(page).toHaveURL(/\/user\/login/)

  await page.goto('/user/settings')
  await expect(page).toHaveURL(/\/user\/login/)
})
