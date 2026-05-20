const terrapediaBackendOrigin = (process.env.TERRAPEDIA_BACKEND_ORIGIN || 'http://localhost:18088').replace(/\/$/, '')
const terrapediaImageOrigin = (
  process.env.TERRAPEDIA_IMAGE_ORIGIN
  || process.env.TERRAPEDIA_MINIO_PUBLIC_ENDPOINT
  || (process.env.NODE_ENV === 'development' ? 'http://localhost:9000' : '')
).replace(/\/$/, '')
const terrapediaWikiImageGateUrl = (
  process.env.TERRAPEDIA_IMAGE_FETCH_GATE_URL
  || 'http://127.0.0.1:18099/fetch-image'
).replace(/\/$/, '')
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  srcDir: '.',
  dir: {
    app: '.',
  },
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  modules: ['@pinia/nuxt'],

  devServer: {
    port: 5176,
    host: 'localhost',
  },

  css: ['~/assets/css/app.css'],

  vite: {
    plugins: [
      tailwindcss(),
    ],
  },

  runtimeConfig: {
    apiServerBase: `${terrapediaBackendOrigin}/api`,
    wikiImageGateUrl: terrapediaWikiImageGateUrl,
    public: {
      apiBase: '/api',
      imageOrigin: terrapediaImageOrigin,
    },
  },

  nitro: {
    devProxy: {
      '/api': {
        target: `${terrapediaBackendOrigin}/api`,
        changeOrigin: true,
      },
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: 'TerraPedia 中文资料库',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'TerraPedia 泰拉瑞亚中文资料库，提供物品图鉴、路线攻略和资料索引。' },
      ],
    },
  },
})
