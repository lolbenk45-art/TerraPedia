import type { RouteRecordRaw } from 'vue-router'
import HomePage from '@/views/HomePage.vue'

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: HomePage,
  },
  {
    path: '/items',
    name: 'items',
    component: () => import('@/views/HomeView.vue'),
  },
  {
    path: '/items/:id',
    name: 'item-detail',
    component: () => import('@/views/ItemDetailView.vue'),
  },
  {
    path: '/npcs',
    name: 'npcs',
    component: () => import('@/views/NpcListView.vue'),
  },
  {
    path: '/npcs/:id',
    name: 'npc-detail',
    component: () => import('@/views/NpcDetailView.vue'),
  },
  {
    path: '/bosses',
    name: 'bosses',
    component: () => import('@/views/BossPublicView.vue'),
  },
  {
    path: '/buffs',
    name: 'buffs',
    component: () => import('@/views/BuffPublicView.vue'),
  },
  {
    path: '/projectiles',
    name: 'projectiles',
    component: () => import('@/views/ProjectilePublicView.vue'),
  },
  {
    path: '/armor-sets',
    name: 'armor-sets',
    component: () => import('@/views/ArmorSetPublicView.vue'),
  },
  {
    path: '/about',
    name: 'about',
    component: () => import('@/views/AboutView.vue'),
  },
  {
    path: '/articles',
    name: 'articles',
    component: () => import('@/views/ArticleListView.vue'),
  },
  {
    path: '/articles/write',
    name: 'article-write',
    component: () => import('@/views/ArticleWriteView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/articles/:id',
    name: 'article-detail',
    component: () => import('@/views/ArticleDetailView.vue'),
  },
  {
    path: '/copywriting',
    name: 'copywriting-studio',
    component: () => import('@/views/CopywritingStudioView.vue'),
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/UserLoginView.vue'),
    meta: { guestOnly: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/UserRegisterView.vue'),
    meta: { guestOnly: true },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('@/views/UserForgotPasswordView.vue'),
    meta: { guestOnly: true },
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('@/views/UserProfileView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
  },
]
