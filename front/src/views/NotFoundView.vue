<template>
  <div class="min-h-[70vh] px-4 py-16">
    <div class="mx-auto max-w-3xl rounded-3xl border p-10 text-center shadow-sm" style="background-color: var(--bg-secondary); border-color: var(--border-color);">
      <div class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl text-4xl" style="background: color-mix(in srgb, var(--accent-primary) 12%, var(--bg-primary));">
        404
      </div>
      <h1 class="text-3xl font-bold" style="color: var(--text-primary);">页面不存在</h1>
      <p class="mx-auto mt-4 max-w-xl text-sm leading-7" style="color: var(--text-secondary);">
        当前地址没有对应页面。你可以返回首页，或进入物品列表继续浏览。
      </p>
      <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
        <router-link
          to="/"
          class="inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold text-white"
          style="background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));"
        >
          返回首页
        </router-link>
        <router-link
          to="/items"
          class="inline-flex items-center justify-center rounded-2xl border px-5 py-3 text-sm font-semibold"
          style="border-color: var(--border-color); color: var(--text-primary); background-color: var(--bg-primary);"
        >
          浏览物品
        </router-link>
      </div>
    </div>
  </div>
</template>
