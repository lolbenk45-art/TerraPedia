<template>
  <footer class="app-footer">
    <div class="page-wrap app-footer__inner">
      <div class="app-footer__brand">
        <div class="app-footer__mark" aria-hidden="true">TP</div>
        <div>
          <div class="app-footer__title">TerraPedia</div>
          <p class="app-footer__copy">A crafted field guide for Terraria items, articles, and player workflows.</p>
        </div>
      </div>

      <nav class="app-footer__nav" aria-label="Footer">
        <router-link to="/" :class="{ 'is-active': route.path === '/' }">Home</router-link>
        <router-link to="/items" :class="{ 'is-active': route.path.startsWith('/items') }">Items</router-link>
        <router-link to="/articles" :class="{ 'is-active': route.path.startsWith('/articles') }">Articles</router-link>
        <router-link to="/about" :class="{ 'is-active': route.path === '/about' }">About</router-link>
      </nav>

      <div class="app-footer__meta">
        <span>Public front-end</span>
        <span>V1 atlas</span>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<style scoped>
.app-footer {
  position: relative;
  margin-top: clamp(2.5rem, 5vw, 4rem);
  border-top: 1px solid color-mix(in srgb, var(--border-color) 88%, transparent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 64%, transparent), color-mix(in srgb, var(--bg-primary) 96%, transparent));
}

.app-footer::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  width: min(16rem, calc(100% - 2rem));
  height: 1px;
  transform: translateX(-50%);
  background: linear-gradient(90deg, transparent, var(--border-color), transparent);
}

.app-footer__inner {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) auto auto;
  gap: 1.25rem;
  align-items: center;
  padding-top: 1.4rem;
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
  width: 2.8rem;
  height: 2.8rem;
  border-radius: 0.95rem;
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 92%, white 8%), color-mix(in srgb, var(--accent-secondary) 70%, var(--accent-primary)));
  color: #f8f2e8;
  font-family: var(--font-heading);
  font-size: 0.9rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  box-shadow: 0 10px 24px color-mix(in srgb, var(--accent-primary) 12%, transparent);
}

.app-footer__title {
  font-family: var(--font-heading);
  font-size: 1rem;
  font-weight: 700;
}

.app-footer__copy {
  margin: 0.25rem 0 0;
  max-width: 28rem;
  color: var(--text-secondary);
  font-size: 0.88rem;
  line-height: 1.72;
}

.app-footer__nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.app-footer__nav a {
  padding: 0.55rem 0.85rem;
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
}

.app-footer__nav a:hover,
.app-footer__nav a.is-active {
  background: color-mix(in srgb, var(--accent-primary) 8%, transparent);
  color: var(--accent-primary);
}

.app-footer__meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.2rem;
  color: var(--text-muted);
  font-size: 0.8rem;
}

@media (max-width: 900px) {
  .app-footer__inner {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .app-footer__meta {
    align-items: flex-start;
  }
}
</style>
