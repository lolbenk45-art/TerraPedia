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
    }>
    notes: Array<{
      mark: string
      title: string
      desc: string
    }>
  }
}>()
</script>

<template>
  <div class="codex-band">
    <article class="codex-scroll">
      <div class="codex-feature">
        <span class="eyebrow">资料手札</span>
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
        <div v-for="route in codex.routes" :key="route.index">
          <span>{{ route.index }}</span>
          <p><b>{{ route.title }}</b><em>{{ route.desc }}</em></p>
        </div>
      </div>
    </article>

    <aside class="codex-notes">
      <div v-for="note in codex.notes" :key="note.mark" class="codex-note">
        <i aria-hidden="true">{{ note.mark }}</i>
        <div><b>{{ note.title }}</b><span>{{ note.desc }}</span></div>
      </div>
    </aside>
  </div>
</template>
