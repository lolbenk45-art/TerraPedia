const FRONT_BASE_URL = (process.env.FRONT_BASE_URL || 'http://localhost:5176').replace(/\/$/, '')
const API_BASE_URL = (process.env.API_BASE_URL || 'http://localhost:18088/api').replace(/\/$/, '')
const TEST_EMAIL = process.env.TERRAPEDIA_TEST_USER_EMAIL || ''
const TEST_PASSWORD = process.env.TERRAPEDIA_TEST_USER_PASSWORD || ''
const TARGET_DATABASE = process.env.TERRAPEDIA_DB_NAME || 'terria_v1_local'

const timeoutMs = Number(process.env.TERRAPEDIA_USER_SMOKE_TIMEOUT_MS || 8000)

const failures = []
const cookies = new Map()

const withTimeout = async (work, label) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await work(controller.signal)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${label} failed: ${message}`)
  } finally {
    clearTimeout(timer)
  }
}

const fetchText = async (url, options = {}) => withTimeout(async (signal) => {
  const response = await fetch(url, {
    redirect: 'manual',
    ...options,
    signal,
  })
  return {
    response,
    text: await response.text(),
  }
}, url)

const assert = (condition, message) => {
  if (!condition) failures.push(message)
}

const assertTextIncludes = (text, marker, context) => {
  assert(text.includes(marker), `${context} must include marker: ${marker}`)
}

const recordCookies = (headers) => {
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [headers.get('set-cookie')].filter(Boolean)

  for (const value of values) {
    for (const cookie of String(value).split(/,\s*(?=[^;,]+=)/)) {
      const [pair] = cookie.split(';')
      const index = pair.indexOf('=')
      if (index > 0) {
        cookies.set(pair.slice(0, index), pair.slice(index + 1))
      }
    }
  }
}

const cookieHeader = () => [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ')

const run = async () => {
  let loginPage
  try {
    loginPage = await fetchText(`${FRONT_BASE_URL}/user/login`)
    assert(loginPage.response.status >= 200 && loginPage.response.status < 400, '/user/login must render or redirect successfully')
    assertTextIncludes(loginPage.text, '账号登录', '/user/login')
    assertTextIncludes(loginPage.text, 'autocomplete="email"', '/user/login')
  } catch (error) {
    failures.push(error.message)
  }

  try {
    const registerPage = await fetchText(`${FRONT_BASE_URL}/user/register`)
    assert(registerPage.response.status >= 200 && registerPage.response.status < 400, '/user/register must render or redirect successfully')
    assertTextIncludes(registerPage.text, '验证码', '/user/register')
    assertTextIncludes(registerPage.text, 'autocomplete="new-password"', '/user/register')
  } catch (error) {
    failures.push(error.message)
  }

  try {
    const settingsPage = await fetchText(`${FRONT_BASE_URL}/user/settings`)
    assert(
      [301, 302, 303, 307, 308].includes(settingsPage.response.status)
      || settingsPage.text.includes('/user/login')
      || settingsPage.text.includes('redirect=%2Fuser%2Fsettings')
      || settingsPage.text.includes('账号登录'),
      '/user/settings without cookies must redirect or render a login target',
    )
  } catch (error) {
    failures.push(error.message)
  }

  try {
    const invalidCookieLogin = await fetchText(`${FRONT_BASE_URL}/user/login`, {
      headers: { Cookie: 'tp_user_access=invalid' },
    })
    assert(invalidCookieLogin.response.status < 500, '/user/login with invalid cookie must not server-error')
    assertTextIncludes(invalidCookieLogin.text, '账号登录', '/user/login invalid-cookie render')
  } catch (error) {
    failures.push(error.message)
  }

  if (!TEST_EMAIL || !TEST_PASSWORD) {
    failures.push('TERRAPEDIA_TEST_USER_EMAIL and TERRAPEDIA_TEST_USER_PASSWORD are required for authenticated runtime smoke')
  } else {
    try {
      const loginResponse = await withTimeout(async (signal) => fetch(`${API_BASE_URL}/user-auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
        redirect: 'manual',
        signal,
      }), `${API_BASE_URL}/user-auth/login`)

      assert(loginResponse.status >= 200 && loginResponse.status < 300, `login endpoint must return 2xx, got ${loginResponse.status}`)
      recordCookies(loginResponse.headers)
      assert(cookieHeader().includes('tp_user_access='), 'login endpoint must set tp_user_access cookie')

      const authenticatedHeaders = { Cookie: cookieHeader() }

      const userPage = await fetchText(`${FRONT_BASE_URL}/user`, { headers: authenticatedHeaders })
      assert(userPage.response.status < 500, '/user with auth cookies must not server-error')
      assertTextIncludes(userPage.text, '用户中心', '/user authenticated render')
      assertTextIncludes(userPage.text, '我的文章', '/user authenticated render')

      const accountPage = await fetchText(`${FRONT_BASE_URL}/user/settings`, { headers: authenticatedHeaders })
      assert(accountPage.response.status < 500, '/user/settings with auth cookies must not server-error')
      assertTextIncludes(accountPage.text, '账号设置', '/user/settings authenticated render')
      assertTextIncludes(accountPage.text, '修改密码', '/user/settings authenticated render')

      const articlesPage = await fetchText(`${FRONT_BASE_URL}/user/articles`, { headers: authenticatedHeaders })
      assert(articlesPage.response.status < 500, '/user/articles with auth cookies must not server-error')
      assertTextIncludes(articlesPage.text, '我的文章', '/user/articles authenticated render')
      assertTextIncludes(articlesPage.text, '新建文章', '/user/articles authenticated render')
    } catch (error) {
      failures.push(error.message)
    }
  }

  if (failures.length) {
    console.error([
      'User module runtime smoke failed:',
      ...failures.map((failure) => `- ${failure}`),
      '',
      `front=${FRONT_BASE_URL}`,
      `api=${API_BASE_URL}`,
      `database=${TARGET_DATABASE}`,
      `testUser=${TEST_EMAIL || '<missing>'}`,
    ].join('\n'))
    process.exit(1)
  }

  console.log([
    'User module runtime smoke passed.',
    `front=${FRONT_BASE_URL}`,
    `api=${API_BASE_URL}`,
    `database=${TARGET_DATABASE}`,
    `testUser=${TEST_EMAIL}`,
  ].join('\n'))
}

run()
