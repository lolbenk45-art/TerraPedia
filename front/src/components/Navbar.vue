<template>
  <header class="navbar">
    <div class="navbar__shell surface-panel">
      <div class="navbar__inner">
        <router-link to="/" class="brand" aria-label="TerraPedia home">
          <span class="brand__crest" aria-hidden="true">
            <span class="brand__crest-core">TP</span>
          </span>
          <span class="brand__text">
            <strong>TerraPedia</strong>
            <small>Terraria Field Guide</small>
          </span>
        </router-link>

        <nav class="nav nav--desktop" aria-label="Primary">
          <router-link to="/" :class="linkClass('/')">Home</router-link>
          <router-link to="/items" :class="linkClass('/items')">Items</router-link>
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
}

.navbar__shell {
  width: min(1180px, calc(100vw - 2rem));
  margin: 0 auto;
  padding: 0.42rem 0.55rem;
  backdrop-filter: blur(10px);
  overflow: visible;
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
  background: linear-gradient(145deg, color-mix(in srgb, var(--accent-primary) 82%, white 18%), color-mix(in srgb, var(--accent-secondary) 56%, var(--accent-primary)));
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.38), 0 10px 22px color-mix(in srgb, var(--accent-primary) 16%, transparent);
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
  color: var(--text-primary);
}

.brand__text small {
  color: var(--text-muted);
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.nav {
  display: flex;
  align-items: center;
}

.nav--desktop {
  gap: 0.35rem;
}

.nav__link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.45rem;
  padding: 0.58rem 0.88rem;
  border-radius: 999px;
  text-decoration: none;
  color: var(--text-secondary);
  font-size: 0.92rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  transition: background-color 160ms ease, color 160ms ease, transform 160ms ease;
}

.nav__link:hover {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--bg-secondary) 82%, white 18%);
}

.nav__link--active {
  color: var(--accent-primary);
  background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-primary) 12%, transparent);
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
  color: var(--text-primary);
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
  background: color-mix(in srgb, var(--bg-secondary) 84%, transparent);
  transform: translateX(1px);
}

.menu-toggle {
  display: none;
  width: 2.8rem;
  height: 2.8rem;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-secondary) 84%, white 16%);
  color: var(--text-primary);
  cursor: pointer;
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

  .nav--desktop,
  .actions .nav-cta,
  .account-menu {
    display: none;
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

  .navbar__inner {
    gap: 0.6rem;
  }
}
</style>
