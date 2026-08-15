<script setup lang="ts">
defineProps<{
  codex: {
    title: string
    desc: string
    links: Array<{
      label: string
      href: string
    }>
    routes: Array<{
      index: string
      title: string
      desc: string
      href: string
    }>
    notes: Array<{
      mark: string
      title: string
      desc: string
      href: string
    }>
  }
}>()
</script>

<template>
  <div class="codex-band">
    <article class="codex-scroll">
      <div class="codex-feature">
        <span class="eyebrow">攻略专题</span>
        <h2>{{ codex.title }}</h2>
        <p>{{ codex.desc }}</p>
        <div class="codex-actions">
          <a
            v-for="action in codex.links"
            :key="action.href"
            :href="action.href"
          >
            {{ action.label }}
          </a>
        </div>
      </div>
      <div class="codex-route-list">
        <a v-for="route in codex.routes" :key="route.index" :href="route.href">
          <span>{{ route.index }}</span>
          <p><b>{{ route.title }}</b><em>{{ route.desc }}</em></p>
        </a>
      </div>
    </article>

    <aside class="codex-notes">
      <a v-for="note in codex.notes" :key="note.mark" class="codex-note" :href="note.href">
        <i aria-hidden="true">{{ note.mark }}</i>
        <div><b>{{ note.title }}</b><span>{{ note.desc }}</span></div>
      </a>
    </aside>
  </div>
</template>
