import { resolveFrontRuntimeConfig } from './utils/runtimeConfig.mjs'
import tailwindcss from '@tailwindcss/vite'

const {
  backendApiBase,
  backendOrigin: terrapediaBackendOrigin,
  imageOrigin: terrapediaImageOrigin,
  wikiImageGateUrl: terrapediaWikiImageGateUrl,
} = resolveFrontRuntimeConfig()

// Public image origin is resolved in utils/runtimeConfig.mjs from TERRAPEDIA_IMAGE_ORIGIN
// or TERRAPEDIA_MINIO_PUBLIC_ENDPOINT, then exposed as runtimeConfig.public.imageOrigin.
export default defineNuxtConfig({
  srcDir: '.',
  dir: {
    app: '.',
  },
  compatibilityDate: '2024-11-01',
  devtools: { enabled: process.env.NUXT_DEVTOOLS === 'true' },
  modules: ['@pinia/nuxt'],

  devServer: {
    port: 5176,
    host: 'localhost',
  },

  css: [
    '~/assets/css/app.css',
    '~/assets/css/detail-layout.css',
    '~/assets/css/tokens.css',
    '~/assets/css/primitives.css',
    '~/assets/css/domains/index.css',
    '~/assets/css/pages/exceptions.css',
  ],

  vite: {
    plugins: [
      tailwindcss(),
    ],
  },

  runtimeConfig: {
    apiServerBase: backendApiBase,
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
      '/terrapedia-images': {
        target: `${terrapediaImageOrigin}/terrapedia-images`,
        changeOrigin: true,
      },
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: 'TerraPedia 泰拉瑞亚中文资料库',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'TerraPedia 泰拉瑞亚中文资料库，提供物品图鉴、路线攻略和资料索引。' },
      ],
    },
  },
})
