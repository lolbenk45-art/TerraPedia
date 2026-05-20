const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const previewProxyUserAgent = 'TerraPedia-preview-proxy/2.0 (+https://terraria.wiki.gg/api.php)'

const fallbackSvg = (rawPath: string) => {
  const filename = rawPath.split('/').filter(Boolean).at(-1) ?? 'asset'
  const label = filename.replace(/\.[^.]+$/, '').slice(0, 2).toUpperCase() || 'TP'

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">',
    '<rect width="160" height="160" rx="18" fill="#101a10"/>',
    '<path d="M18 112 54 72l26 28 22-18 40 44v16H18z" fill="#314027"/>',
    '<circle cx="112" cy="48" r="17" fill="#d6b15a"/>',
    `<text x="80" y="89" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#f4ead0">${escapeXml(label)}</text>`,
    '<rect x="8" y="8" width="144" height="144" rx="14" fill="none" stroke="#d6b15a" stroke-opacity=".35"/>',
    '</svg>',
  ].join('')
}

export default defineEventHandler(async (event) => {
  const rawPath = String(getRouterParam(event, 'path') ?? '')
  const safePath = rawPath
    .split('/')
    .filter((segment) => segment && segment !== '..' && !segment.includes('\\'))
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
    .join('/')

  const imageOrigin = String(useRuntimeConfig(event).public.imageOrigin || '').replace(/\/$/, '')
  const wikiImageGateUrl = String(useRuntimeConfig(event).wikiImageGateUrl || '').replace(/\/$/, '')
  const wikiFileName = safePath.startsWith('wiki-files/') ? safePath.slice('wiki-files/'.length) : ''

  if (wikiFileName && wikiImageGateUrl) {
    try {
      const sourceUrl = `https://terraria.wiki.gg/wiki/File:${wikiFileName}`
      const response = await $fetch.raw(wikiImageGateUrl, {
        method: 'POST',
        responseType: 'arrayBuffer',
        body: { url: sourceUrl },
        headers: {
          accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'user-agent': previewProxyUserAgent,
        },
      })
      const contentType = response.headers.get('content-type')

      if (contentType) {
        setHeader(event, 'content-type', contentType)
      }
      setHeader(event, 'cache-control', 'public, max-age=86400')

      return new Uint8Array(response._data as ArrayBuffer)
    } catch {
      // Fall through to the stable placeholder when wiki.gg is unavailable.
    }
  }

  if (imageOrigin && safePath) {
    try {
      const response = await $fetch.raw(`${imageOrigin}/${safePath}`, {
        responseType: 'arrayBuffer',
      })
      const contentType = response.headers.get('content-type')

      if (contentType) {
        setHeader(event, 'content-type', contentType)
      }
      setHeader(event, 'cache-control', 'public, max-age=3600')

      return new Uint8Array(response._data as ArrayBuffer)
    } catch {
      // Fall through to a stable preview placeholder when the configured image service is unavailable.
    }
  }

  setHeader(event, 'content-type', 'image/svg+xml; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=300')

  return fallbackSvg(rawPath)
})
