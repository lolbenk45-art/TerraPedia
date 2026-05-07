<template>
  <header :class="['navbar', { 'navbar--home': route.path === '/' }]">
    <div class="navbar__shell surface-panel">
      <div class="navbar__inner">
        <router-link to="/" class="brand" aria-label="TerraPedia home">
          <span class="brand__crest" aria-hidden="true">
            <span class="brand__crest-core">TP</span>
          </span>
          <span class="brand__text">
            <strong>TerraPedia</strong>
            <small>冒险图鉴</small>
          </span>
        </router-link>

        <nav class="nav nav--desktop" aria-label="Primary">
          <router-link to="/" :class="linkClass('/')">Home</router-link>
          <router-link to="/items" :class="linkClass('/items')">Items</router-link>
          <router-link to="/npcs" :class="linkClass('/npcs')">NPCs</router-link>
          <router-link to="/bosses" :class="linkClass('/bosses')">Bosses</router-link>
          <router-link to="/articles" :class="linkClass('/articles')">Articles</router-link>
          <router-link to="/about" :class="linkClass('/about')">About</router-link>
        </nav>

        <div class="actions">
          <ThemeSwitcher />

          <template v-if="authStore.isAuthenticated">
            <div ref="accountMenuRef" class="account-menu">
              <button
                type="button"
                class="btn btn-soft btn--profile"
                :aria-expanded="accountMenuOpen"
                aria-haspopup="menu"
                @click="toggleAccountMenu"
              >
                <span>{{ authStore.displayName }}</span>
                <span class="account-menu__caret" aria-hidden="true">v</span>
              </button>

              <div v-if="accountMenuOpen" class="account-menu__panel surface-panel" role="menu" aria-label="User menu">
                <router-link to="/profile" role="menuitem" @click="closeAccountMenu">My Profile</router-link>
                <router-link to="/articles/write" role="menuitem" @click="closeAccountMenu">Article Writer</router-link>
                <router-link to="/copywriting" role="menuitem" @click="closeAccountMenu">Copywriting Studio</router-link>
                <router-link to="/articles" role="menuitem" @click="closeAccountMenu">My Articles</router-link>
                <button type="button" role="menuitem" class="account-menu__logout" @click="handleLogout">Sign out</button>
              </div>
            </div>
          </template>

          <template v-else>
            <router-link to="/login" class="btn btn-soft nav-cta">Sign in</router-link>
            <router-link to="/register" class="btn btn-brand nav-cta">Register</router-link>
          </template>

          <button
            type="button"
            class="menu-toggle"
            :aria-expanded="mobileOpen"
            aria-label="Toggle menu"
            @click="mobileOpen = !mobileOpen"
          >
            <span>{{ mobileOpen ? 'X' : '|||' }}</span>
          </button>
        </div>
      </div>

      <div v-if="mobileOpen" class="nav nav--mobile surface-card surface-card--soft">
        <router-link to="/" @click="closeMobile">Home</router-link>
        <router-link to="/items" @click="closeMobile">Items</router-link>
        <router-link to="/npcs" @click="closeMobile">NPCs</router-link>
        <router-link to="/bosses" @click="closeMobile">Bosses</router-link>
        <router-link to="/articles" @click="closeMobile">Articles</router-link>
        <router-link to="/about" @click="closeMobile">About</router-link>

        <template v-if="authStore.isAuthenticated">
          <div class="mobile-group-title">Creator</div>
          <router-link to="/articles/write" @click="closeMobile">Article Writer</router-link>
          <router-link to="/copywriting" @click="closeMobile">Copywriting Studio</router-link>
          <router-link to="/profile" @click="closeMobile">My Profile</router-link>
          <button type="button" class="mobile-logout" @click="handleLogout">Sign out</button>
        </template>

        <template v-else>
          <router-link to="/login" @click="closeMobile">Sign in</router-link>
          <router-link to="/register" @click="closeMobile">Register</router-link>
        </template>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ThemeSwitcher from './ThemeSwitcher.vue'
import { useUserAuthStore } from '@/stores/userAuth'

const route = useRoute()
const router = useRouter()
const authStore = useUserAuthStore()

const mobileOpen = ref(false)
const accountMenuOpen = ref(false)
const accountMenuRef = ref<HTMLElement | null>(null)

const linkClass = (path: string) => {
  const active = path === '/' ? route.path === '/' : route.path.startsWith(path)
  return ['nav__link', active ? 'nav__link--active' : '']
}

const closeMobile = () => {
  mobileOpen.value = false
}

const closeAccountMenu = () => {
  accountMenuOpen.value = false
}

const toggleAccountMenu = () => {
  accountMenuOpen.value = !accountMenuOpen.value
}

const handleOutsidePointerDown = (event: PointerEvent) => {
  if (!accountMenuOpen.value) return
  const menu = accountMenuRef.value
  const target = event.target as Node | null
  if (!menu || !target || menu.contains(target)) return
  closeAccountMenu()
}

const handleLogout = async () => {
  closeAccountMenu()
  await authStore.logout()
  closeMobile()
  await router.replace('/')
}

onMounted(async () => {
  document.addEventListener('pointerdown', handleOutsidePointerDown)
  if (!authStore.initialized) {
    await authStore.init()
  }
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleOutsidePointerDown)
})

watch(
  () => route.fullPath,
  () => {
    closeAccountMenu()
    closeMobile()
  }
)
</script>

<style scoped>
.navbar {
  position: sticky;
  top: 0;
  z-index: 40;
  padding: 0.85rem 1rem 0;
  isolation: isolate;
}

.navbar::before,
.navbar::after {
  content: '';
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;
  z-index: -1;
}

.navbar::before {
  top: 0;
  width: min(1240px, calc(100vw - 1rem));
  height: 5.4rem;
  border-radius: 0 0 2rem 2rem;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--bg-primary) 62%, transparent), transparent 100%);
}

.navbar::after {
  top: 0.75rem;
  width: min(1120px, calc(100vw - 5rem));
  height: 3.6rem;
  border-radius: 999px;
  background:
    radial-gradient(circle, color-mix(in srgb, var(--accent-primary) 18%, transparent), transparent 66%);
  filter: blur(30px);
  opacity: 0.72;
}

.navbar__shell {
  width: min(1180px, calc(100vw - 2rem));
  margin: 0 auto;
  padding: 0.42rem 0.55rem;
  border: 1px solid color-mix(in srgb, var(--border-color) 44%, transparent);
  border-radius: 1.5rem;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, white 18%, transparent),
      color-mix(in srgb, var(--surface-elevated) 34%, transparent) 16%,
      color-mix(in srgb, var(--surface-panel) 72%, var(--bg-secondary)) 100%
    );
  box-shadow:
    0 18px 42px color-mix(in srgb, black 14%, transparent),
    0 10px 24px color-mix(in srgb, var(--accent-primary) 8%, transparent),
    inset 0 1px 0 rgb(255 255 255 / 0.22);
  backdrop-filter: blur(14px);
  overflow: visible;
}

.navbar--home::before {
  background:
    linear-gradient(180deg, rgb(16 21 18 / 0.92), rgb(16 21 18 / 0.18) 72%, transparent 100%);
}

.navbar--home::after {
  background:
    radial-gradient(circle, rgb(147 193 106 / 0.16), transparent 66%);
  opacity: 0.55;
}

.navbar--home .navbar__shell {
  position: relative;
  border-color: rgb(240 233 208 / 0.09);
  border-bottom-color: rgb(240 233 208 / 0.04);
  border-radius: 1.75rem 1.75rem 0 0;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.08), rgb(255 255 255 / 0.03) 12%, rgb(23 31 26 / 0.84) 100%);
  box-shadow:
    0 14px 32px rgb(0 0 0 / 0.16),
    0 10px 24px rgb(154 194 107 / 0.08),
    inset 0 1px 0 rgb(255 255 255 / 0.16);
}

.navbar--home .navbar__shell::after {
  content: '';
  position: absolute;
  inset: auto 0 -1px;
  height: 2rem;
  background:
    linear-gradient(180deg, transparent 0%, rgb(23 31 26 / 0.46) 58%, rgb(23 31 26 / 0.86) 100%);
  pointer-events: none;
}

.navbar__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-width: 0;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.9rem;
  min-width: 0;
  text-decoration: none;
}

.brand__crest {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: 1rem;
  background: linear-gradient(145deg, color-mix(in srgb, var(--accent-primary) 72%, white 28%), color-mix(in srgb, var(--accent-secondary) 40%, var(--accent-primary)));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.34),
    0 10px 22px color-mix(in srgb, var(--accent-primary) 12%, transparent);
}

.brand__crest-core {
  color: #fffdf7;
  font-family: 'Outfit', 'Segoe UI', sans-serif;
  font-size: 0.92rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.brand__text {
  display: inline-flex;
  flex-direction: column;
  gap: 0.1rem;
  line-height: 1.05;
}

.brand__text strong {
  font-size: 1.06rem;
  letter-spacing: 0.02em;
  color: color-mix(in srgb, var(--text-primary) 92%, #f6f0da);
}

.brand__text small {
  color: color-mix(in srgb, var(--text-muted) 90%, #d6dfcc);
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.navbar--home .brand__text strong {
  color: #f0efdf;
}

.navbar--home .brand__text small {
  color: color-mix(in srgb, var(--text-muted) 84%, #d6dfcc);
}

.nav {
  display: flex;
  align-items: center;
}

.nav--desktop {
  gap: 0.35rem;
  padding: 0.22rem;
  border: 1px solid color-mix(in srgb, var(--border-color) 28%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-primary) 14%, transparent);
}

.navbar--home .nav--desktop {
  border-color: rgb(240 233 208 / 0.08);
  background: rgb(255 255 255 / 0.03);
}

.nav__link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.45rem;
  padding: 0.58rem 0.88rem;
  border-radius: 999px;
  text-decoration: none;
  color: color-mix(in srgb, var(--text-secondary) 84%, var(--text-primary));
  font-size: 0.92rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  transition: background-color 160ms ease, color 160ms ease, transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
  border: 1px solid transparent;
}

.navbar--home .nav__link {
  color: #c5cfba;
}

.nav__link:hover {
  color: color-mix(in srgb, var(--text-primary) 96%, white 4%);
  background: color-mix(in srgb, var(--surface-elevated) 34%, transparent);
  border-color: color-mix(in srgb, var(--border-color) 28%, transparent);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08);
}

.navbar--home .nav__link:hover {
  color: #edf3de;
  background: rgb(255 255 255 / 0.05);
  border-color: rgb(240 233 208 / 0.08);
  box-shadow: none;
}

.nav__link--active {
  color: color-mix(in srgb, var(--text-primary) 94%, white 6%);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--accent-primary) 22%, transparent),
      color-mix(in srgb, var(--accent-primary) 12%, transparent)
    );
  border-color: color-mix(in srgb, var(--accent-primary) 28%, var(--border-color));
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08);
}

.navbar--home .nav__link--active {
  color: #eaf5dc;
  background: rgb(147 193 106 / 0.12);
  border-color: rgb(147 193 106 / 0.18);
  box-shadow: none;
}

.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.6rem;
  min-width: 0;
}

.nav-cta {
  min-width: 5.9rem;
}

.account-menu {
  position: relative;
}

.btn--profile {
  min-width: 8rem;
}

.account-menu__caret {
  font-size: 0.76rem;
}

.account-menu__panel {
  position: absolute;
  right: 0;
  top: calc(100% + 0.7rem);
  width: 13rem;
  display: grid;
  gap: 0.3rem;
  padding: 0.5rem;
}

.account-menu__panel a,
.account-menu__logout {
  border: 0;
  border-radius: 0.95rem;
  padding: 0.8rem 0.9rem;
  text-align: left;
  color: #f0efdf;
  background: transparent;
  text-decoration: none;
  font: inherit;
  font-size: 0.92rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 160ms ease, transform 160ms ease;
}

.account-menu__panel a:hover,
.account-menu__logout:hover {
  background: rgb(255 255 255 / 0.05);
  transform: translateX(1px);
}

.menu-toggle {
  display: none;
  width: 2.8rem;
  height: 2.8rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--border-color) 44%, transparent);
  background: color-mix(in srgb, var(--surface-panel) 76%, transparent);
  color: color-mix(in srgb, var(--text-primary) 92%, white 8%);
  cursor: pointer;
}

.navbar--home :deep(.theme-switcher__button),
.navbar--home .btn-soft,
.navbar--home .menu-toggle {
  border-color: rgb(240 233 208 / 0.12);
  background: rgb(255 255 255 / 0.05);
  color: #f0efdf;
  box-shadow: none;
}

.navbar--home :deep(.theme-switcher__button:hover),
.navbar--home .btn-soft:hover,
.navbar--home .menu-toggle:hover {
  background: rgb(255 255 255 / 0.08);
  border-color: rgb(240 233 208 / 0.16);
}

.navbar--home .btn-brand {
  box-shadow: 0 10px 20px color-mix(in srgb, var(--accent-primary) 16%, transparent);
}

.menu-toggle span {
  font-size: 0.95rem;
  font-weight: 800;
  line-height: 1;
}

.nav--mobile {
  display: none;
}

.mobile-group-title {
  margin-top: 0.35rem;
  padding: 0.4rem 0.2rem 0;
  color: var(--text-muted);
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

@media (max-width: 980px) {
  .navbar {
    padding: 0.75rem 0.75rem 0;
  }

  .navbar::after {
    width: calc(100vw - 3rem);
  }

  .nav--desktop,
  .actions .nav-cta,
  .account-menu {
    display: none;
  }

  .navbar--home .navbar__shell {
    border-radius: 1.5rem 1.5rem 0 0;
  }

  .menu-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .nav--mobile {
    display: grid;
    gap: 0.45rem;
    margin-top: 0.75rem;
    padding: 0.75rem;
  }

  .nav--mobile a,
  .mobile-logout {
    display: flex;
    align-items: center;
    min-height: 2.9rem;
    padding: 0.85rem 0.95rem;
    border-radius: 1rem;
    border: 1px solid var(--border-color);
    background: color-mix(in srgb, var(--bg-secondary) 92%, transparent);
    color: var(--text-primary);
    text-decoration: none;
    font-size: 0.94rem;
    font-weight: 700;
    text-align: left;
  }

  .mobile-logout {
    cursor: pointer;
  }
}

@media (max-width: 640px) {
  .brand__text small {
    display: none;
  }

  .navbar::before {
    width: calc(100vw - 0.75rem);
  }

  .navbar__inner {
    gap: 0.6rem;
  }
}
</style>
