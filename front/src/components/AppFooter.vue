<template>
  <footer class="app-footer">
    <div class="app-footer__veil" aria-hidden="true"></div>
    <div class="page-wrap app-footer__inner">
      <article class="app-footer__card app-footer__card--brand">
        <div class="app-footer__brand">
          <div class="app-footer__mark" aria-hidden="true">TP</div>
          <div>
            <div class="app-footer__title">TerraPedia</div>
            <p class="app-footer__copy">以物品知识、构筑线索与探索笔记收束这次旅程，并为下一次冒险保留入口。</p>
          </div>
        </div>

        <div class="app-footer__links" aria-hidden="true">
          <span>Home</span>
          <span>Items</span>
          <span>Articles</span>
          <span>About</span>
        </div>
      </article>

      <article class="app-footer__card app-footer__card--nav">
        <div class="app-footer__section">
          <span class="app-footer__eyebrow">Camp Exit</span>
          <nav class="app-footer__nav" aria-label="Footer">
            <RouterLink to="/" :class="{ 'is-active': route.path === '/' }">Home</RouterLink>
            <RouterLink to="/items" :class="{ 'is-active': route.path.startsWith('/items') }">Items</RouterLink>
            <RouterLink to="/npcs" :class="{ 'is-active': route.path.startsWith('/npcs') }">NPCs</RouterLink>
            <RouterLink to="/articles" :class="{ 'is-active': route.path.startsWith('/articles') }">Articles</RouterLink>
            <RouterLink to="/about" :class="{ 'is-active': route.path === '/about' }">About</RouterLink>
          </nav>
        </div>

        <div class="app-footer__meta">
          <span>冒险图鉴</span>
          <span>Public front end</span>
        </div>
      </article>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()
</script>

<style scoped>
.app-footer {
  position: relative;
  margin-top: clamp(3rem, 5vw, 4.4rem);
  padding: 1.2rem 0 1.4rem;
  border-top: 1px solid color-mix(in srgb, var(--border-strong) 58%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 58%, transparent), color-mix(in srgb, var(--bg-primary) 94%, transparent)),
    radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--accent-primary) 10%, transparent), transparent 30%),
    radial-gradient(circle at 82% 0%, color-mix(in srgb, var(--accent-gold) 10%, transparent), transparent 24%);
  overflow: hidden;
}

.app-footer::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.28), transparent 18%),
    linear-gradient(90deg, transparent, color-mix(in srgb, var(--border-color) 36%, transparent), transparent);
  opacity: 0.34;
  pointer-events: none;
}

.app-footer__veil {
  position: absolute;
  inset: auto 0 0;
  height: 6.5rem;
  background:
    linear-gradient(180deg, transparent, color-mix(in srgb, var(--bg-primary) 88%, var(--bg-secondary))),
    radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--accent-primary) 10%, transparent), transparent 46%);
  opacity: 0.72;
  pointer-events: none;
}

.app-footer__inner {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(18rem, 0.85fr);
  gap: 1rem;
  align-items: stretch;
}

.app-footer__card {
  position: relative;
  display: grid;
  gap: 1rem;
  padding: 1.15rem 1.2rem;
  border: 1px solid color-mix(in srgb, var(--border-color) 84%, transparent);
  border-radius: 1.4rem;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-panel) 92%, white 8%), color-mix(in srgb, var(--surface-soft) 96%, transparent));
  box-shadow:
    0 18px 36px color-mix(in srgb, var(--bg-primary) 8%, transparent),
    inset 0 1px 0 rgb(255 255 255 / 0.34);
}

.app-footer__card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--accent-gold) 10%, transparent), transparent 30%),
    radial-gradient(circle at bottom left, color-mix(in srgb, var(--accent-primary) 8%, transparent), transparent 28%);
  pointer-events: none;
}

.app-footer__card--nav {
  align-content: space-between;
}

.app-footer__brand,
.app-footer__section,
.app-footer__meta,
.app-footer__links {
  position: relative;
  z-index: 1;
}

.app-footer__brand {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.app-footer__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.9rem;
  height: 2.9rem;
  border-radius: 0.95rem;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 44%, transparent);
  background:
    radial-gradient(circle at 28% 20%, rgb(255 255 255 / 0.34), transparent 54%),
    linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 84%, white 16%), color-mix(in srgb, var(--accent-secondary) 70%, var(--accent-primary)));
  color: #f8f2e8;
  font-family: var(--font-heading);
  font-size: 0.92rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  box-shadow: 0 12px 28px color-mix(in srgb, var(--accent-primary) 14%, transparent);
}

.app-footer__title {
  font-family: var(--font-heading);
  font-size: 1rem;
  font-weight: 700;
}

.app-footer__copy {
  margin: 0.28rem 0 0;
  max-width: 32rem;
  color: var(--text-secondary);
  font-size: 0.88rem;
  line-height: 1.75;
}

.app-footer__links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.app-footer__links span,
.app-footer__nav a {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0.45rem 0.78rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--border-color) 88%, transparent);
  background: color-mix(in srgb, var(--bg-secondary) 72%, transparent);
  color: var(--text-secondary);
  font-size: 0.82rem;
  font-weight: 600;
  text-decoration: none;
  transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease, transform 160ms ease;
}

.app-footer__eyebrow {
  display: inline-flex;
  margin-bottom: 0.7rem;
  color: var(--accent-primary);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.app-footer__nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.app-footer__nav a:hover,
.app-footer__nav a.is-active {
  border-color: color-mix(in srgb, var(--accent-primary) 28%, transparent);
  background: color-mix(in srgb, var(--accent-primary) 11%, transparent);
  color: color-mix(in srgb, var(--accent-primary) 86%, #2b432f);
  transform: translateY(-1px);
}

.app-footer__meta {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  color: color-mix(in srgb, var(--text-muted) 92%, var(--accent-primary));
  font-size: 0.8rem;
  letter-spacing: 0.03em;
}

@media (max-width: 900px) {
  .app-footer__inner {
    grid-template-columns: 1fr;
  }
}
</style>
