const terrapediaBackendOrigin = (process.env.TERRAPEDIA_BACKEND_ORIGIN || 'http://localhost:18088').replace(/\/$/, '')

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },

  devServer: {
    port: 5176,
    host: 'localhost',
  },

  css: ['~/assets/css/hifi-preview.css'],

  runtimeConfig: {
    public: {
      apiBase: '/api',
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
