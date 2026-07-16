// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'node:url'

const terrapediaBackendOrigin = (process.env.TERRAPEDIA_BACKEND_ORIGIN || 'http://localhost:18088').replace(/\/$/, '')
const terrapediaImageOrigin = (process.env.TERRAPEDIA_IMAGE_ORIGIN || process.env.TERRAPEDIA_MINIO_PUBLIC_ENDPOINT || 'http://localhost:19000').replace(/\/$/, '')
const articleRuntimeDir = fileURLToPath(new URL('../shared/article-runtime', import.meta.url))

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },

  devServer: {
    port: 3001,
    host: 'localhost',
  },

  srcDir: '.',

  // `@pinia-plugin-persistedstate/nuxt` is deprecated/unmaintained, but it's currently the only
  // way to get Nuxt-module Pinia persistence on Pinia 2.x: upstream `pinia-plugin-persistedstate`
  // folded its Nuxt support into a `/nuxt` export starting at v4, which requires Pinia 3.
  // The `pnpm.overrides` pin in package.json (`pinia-plugin-persistedstate@^3.2.3`) is what keeps
  // this peer-compatible with our `pinia@^2.3.0`. Once this project upgrades to Pinia 3, drop both
  // this package and the override, and import `pinia-plugin-persistedstate/nuxt` directly instead.
  modules: ['@pinia/nuxt', '@pinia-plugin-persistedstate/nuxt', '@nuxtjs/tailwindcss'],

  alias: {
    '#article-runtime': articleRuntimeDir,
  },

  css: ['../shared/article-runtime/recipeHierarchyGraph.css', '~/assets/css/variables.css', '~/assets/css/main.css'],

  vite: {
    optimizeDeps: {
      include: ['@vueuse/core', 'lucide-vue-next'],
    },
  },

  runtimeConfig: {
    backendOrigin: terrapediaBackendOrigin,
    imageOrigin: terrapediaImageOrigin,
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

  routeRules: {
    '/recipes/groups': { redirect: { to: '/item-groups?domain=recipe', statusCode: 301 } },
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
