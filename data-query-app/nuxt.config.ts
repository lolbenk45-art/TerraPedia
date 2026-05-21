// https://nuxt.com/docs/api/configuration/nuxt-config
const terrapediaBackendOrigin = (process.env.TERRAPEDIA_BACKEND_ORIGIN || 'http://localhost:18088').replace(/\/$/, '')
const terrapediaMinioPublicOrigin = (process.env.TERRAPEDIA_MINIO_PUBLIC_ENDPOINT || 'http://localhost:9000').replace(/\/$/, '')

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },

  devServer: {
    port: 3001,
    host: 'localhost',
  },

  srcDir: '.',

  modules: ['@pinia/nuxt', '@nuxtjs/tailwindcss'],

  css: ['~/assets/css/variables.css', '~/assets/css/main.css'],

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
      '/terrapedia-images': {
        target: `${terrapediaMinioPublicOrigin}/terrapedia-images`,
        changeOrigin: true,
      },
    },
  },

  app: {
    pageTransition: {
      name: 'page-shell',
      mode: 'out-in',
    },
    layoutTransition: {
      name: 'page-shell',
      mode: 'out-in',
    },
    head: {
      title: '后台管理系统',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: '后台管理系统 - 物品与分类管理' },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap',
        },
      ],
    },
  },

  components: [{ path: '~/components', pathPrefix: false }],
  imports: { dirs: ['composables', 'stores'] },
})
