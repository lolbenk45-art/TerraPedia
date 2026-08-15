// 绝对化 SEO 资源地址:og:image/canonical 需要绝对 URL,站内相对路径爬虫不识别。
// siteUrl 未配置(TERRAPEDIA_SITE_URL)时回退当前请求 origin,dev 环境免配置。
export const useAbsoluteSiteUrl = () => {
  const { public: { siteUrl } } = useRuntimeConfig()
  const requestOrigin = useRequestURL().origin

  return (path: string | null | undefined) => {
    const value = String(path ?? '').trim()
    if (!value) return undefined
    if (/^https?:\/\//i.test(value)) return value
    const base = (siteUrl || requestOrigin).replace(/\/$/, '')
    return `${base}${value.startsWith('/') ? value : `/${value}`}`
  }
}
