declare module 'nuxt/schema' {
  interface PageMeta {
    headerVariant?: 'default' | 'compact'
  }
}

declare module '#app' {
  interface PageMeta {
    headerVariant?: 'default' | 'compact'
  }
}

export {}
