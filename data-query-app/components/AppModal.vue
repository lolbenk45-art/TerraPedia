<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="modelValue"
        class="app-modal-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        @click.self="emit('update:modelValue', false)"
      >
        <div class="app-modal" :style="{ width, maxHeight }">
          <div class="app-modal__header">
            <div class="app-modal__heading">
              <span class="app-modal__eyebrow">Workspace</span>
              <h2 :id="titleId" class="app-modal__title">{{ title }}</h2>
            </div>
            <button
              type="button"
              class="app-modal__close"
              aria-label="关闭弹窗"
              @click="emit('update:modelValue', false)"
            >
              <X :size="18" />
            </button>
          </div>
          <div class="app-modal__body" :style="{ padding: bodyPadding }">
            <slot />
          </div>
          <div v-if="$slots.footer" class="app-modal__footer">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title: string
  width?: string
  maxHeight?: string
  bodyPadding?: string
}>(), {
  width: 'min(720px, 100%)',
  maxHeight: '92dvh',
  bodyPadding: '24px',
})

const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()
const titleId = useId()

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.modelValue) {
    emit('update:modelValue', false)
  }
}

watch(
  () => props.modelValue,
  (isOpen) => {
    if (typeof document === 'undefined') return
    document.body.style.overflow = isOpen ? 'hidden' : ''
  },
  { immediate: true },
)

onMounted(() => {
  if (typeof window === 'undefined') return
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = ''
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeydown)
  }
})
</script>

<style scoped>
.app-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: var(--color-bg-sidebar-scrim);
  backdrop-filter: blur(12px);
}

.app-modal {
  display: flex;
  flex-direction: column;
  max-width: 100%;
  max-height: 92dvh;
  overflow: hidden;
  border-radius: calc(var(--radius-xl) - 2px);
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-secondary) 94%, transparent), var(--color-bg-secondary)),
    radial-gradient(circle at top right, color-mix(in srgb, var(--color-primary) 8%, transparent), transparent 30%);
  box-shadow: var(--shadow-xl);
}

.app-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  background: color-mix(in srgb, var(--color-bg-secondary) 82%, transparent);
}

.app-modal__heading {
  display: grid;
  gap: 6px;
}

.app-modal__eyebrow {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 5px 10px;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg-secondary));
  color: var(--color-primary-dark);
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 800;
}

.dark .app-modal__eyebrow {
  color: var(--color-text-inverse);
}

.app-modal__title {
  margin: 0;
  font-size: 1.18rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-text);
}

.app-modal__close {
  width: 40px;
  height: 40px;
  border: 1px solid color-mix(in srgb, var(--color-border) 90%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-bg-tertiary) 88%, transparent);
  color: var(--color-text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    transform var(--transition-fast) var(--ease-standard),
    border-color var(--transition-fast) var(--ease-standard),
    background-color var(--transition-fast) var(--ease-standard),
    color var(--transition-fast) var(--ease-standard);
}

.app-modal__close:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--color-primary) 22%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg-secondary));
  color: var(--color-primary);
}

.app-modal__body {
  flex: 1;
  overflow-y: auto;
  background: color-mix(in srgb, var(--color-bg) 80%, var(--color-bg-secondary));
}

.app-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 22px;
  border-top: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, transparent);
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity var(--transition-base) var(--ease-emphasis);
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .app-modal,
.modal-fade-leave-to .app-modal {
  transform: translateY(18px) scale(0.98);
}

.modal-fade-enter-active .app-modal,
.modal-fade-leave-active .app-modal {
  transition: transform var(--transition-base) var(--ease-emphasis);
}

@media (max-width: 640px) {
  .app-modal-backdrop {
    align-items: flex-end;
    padding: 12px;
  }

  .app-modal {
    border-radius: 22px 22px 18px 18px;
    max-height: min(88dvh, 720px);
  }

  .app-modal__header,
  .app-modal__footer {
    padding-inline: 16px;
  }
}
</style>
