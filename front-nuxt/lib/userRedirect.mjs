export const buildUserRedirectTarget = (raw, fallback = '/user') => {
  if (typeof raw !== 'string') return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback

  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return fallback
  }

  if (!decoded.startsWith('/') || decoded.startsWith('//') || decoded.includes('\\')) return fallback
  if (/[\u0000-\u001f\u007f]/.test(decoded)) return fallback

  try {
    const url = new URL(decoded, 'http://terrapedia.local')
    if (url.origin !== 'http://terrapedia.local') return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}

export const buildUserPostAuthRedirectTarget = (raw, fallback = '/user') => {
  const target = buildUserRedirectTarget(raw, fallback)
  const path = target.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/'
  return path === '/user/login' || path === '/user/register' ? fallback : target
}
