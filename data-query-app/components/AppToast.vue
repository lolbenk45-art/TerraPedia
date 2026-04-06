<template>
  <Teleport to="body">
    <Transition name="toast-pop">
      <div
        v-if="toast"
        class="app-toast"
        :class="`app-toast--${toast.type}`"
        role="status"
        aria-live="polite"
      >
        <span class="app-toast__icon">
          <component :is="toastIcon" :size="18" />
        </span>
        <div class="app-toast__copy">
          <strong>{{ toastLabel }}</strong>
          <span>{{ toast.message }}</span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { CheckCircle2, CircleAlert, TriangleAlert } from 'lucide-vue-next'

const { toast } = useToast()

const toastIcon = computed(() => {
  if (toast.value?.type === 'error') return CircleAlert
  if (toast.value?.type === 'warning') return TriangleAlert
  return CheckCircle2
})

const toastLabel = computed(() => {
  if (toast.value?.type === 'error') return '操作失败'
  if (toast.value?.type === 'warning') return '请注意'
  return '操作成功'
})
</script>

<style scoped>
.app-toast {
  position: fixed;
  top: 22px;
  left: 50%;
  z-index: 3000;
  display: inline-flex;
  align-items: center;
  gap: 14px;
  min-width: min(420px, calc(100vw - 32px));
  max-width: min(520px, calc(100vw - 32px));
  padding: 14px 18px;
  border-radius: var(--radius-lg);
  border: 1px solid transparent;
  box-shadow: var(--shadow-xl);
  backdrop-filter: blur(14px);
  transform: translateX(-50%);
}

.app-toast__icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.app-toast__copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.app-toast__copy strong {
  font-size: 0.9rem;
  line-height: 1.2;
}

.app-toast__copy span {
  font-size: 0.875rem;
  line-height: 1.5;
  opacity: 0.92;
}

.app-toast--success {
  background: color-mix(in srgb, var(--color-success) 16%, var(--color-bg-secondary));
  border-color: color-mix(in srgb, var(--color-success) 24%, var(--color-border));
  color: var(--color-text);
}

.app-toast--success .app-toast__icon {
  background: var(--color-success);
  color: #fff;
}

.app-toast--error {
  background: color-mix(in srgb, var(--color-danger) 14%, var(--color-bg-secondary));
  border-color: color-mix(in srgb, var(--color-danger) 24%, var(--color-border));
  color: var(--color-text);
}

.app-toast--error .app-toast__icon {
  background: var(--color-danger);
  color: #fff;
}

.app-toast--warning {
  background: color-mix(in srgb, var(--color-warning) 14%, var(--color-bg-secondary));
  border-color: color-mix(in srgb, var(--color-warning) 24%, var(--color-border));
  color: var(--color-text);
}

.app-toast--warning .app-toast__icon {
  background: var(--color-warning);
  color: #fff;
}

@media (max-width: 640px) {
  .app-toast {
    top: 14px;
    min-width: calc(100vw - 24px);
    max-width: calc(100vw - 24px);
    padding: 12px 14px;
  }
}
</style>
