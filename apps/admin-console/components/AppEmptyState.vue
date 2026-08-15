<template>
  <div class="empty-state">
    <div class="empty-state__icon" aria-hidden="true">
      {{ icon }}
    </div>
    <h3 class="empty-state__title">{{ title }}</h3>
    <p v-if="description" class="empty-state__description">{{ description }}</p>

    <div v-if="primaryText || secondaryText" class="empty-state__actions">
      <button v-if="primaryText" type="button" class="empty-state__btn empty-state__btn--primary" @click="$emit('primary')">
        {{ primaryText }}
      </button>
      <button v-if="secondaryText" type="button" class="empty-state__btn empty-state__btn--secondary" @click="$emit('secondary')">
        {{ secondaryText }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  icon?: string
  title: string
  description?: string
  primaryText?: string
  secondaryText?: string
}>(), {
  icon: '📦',
  description: '',
  primaryText: '',
  secondaryText: ''
})

defineEmits<{
  (e: 'primary'): void
  (e: 'secondary'): void
}>()
</script>

<style scoped>
.empty-state {
  min-height: 240px;
  padding: 32px 24px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  background:
    linear-gradient(180deg, var(--color-primary-muted), transparent 42%),
    var(--color-bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  text-align: center;
}

.empty-state__icon {
  width: 72px;
  height: 72px;
  margin-bottom: 18px;
  border-radius: 22px;
  background: var(--color-bg-tertiary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  box-shadow: var(--shadow-inset);
}

.empty-state__title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-text);
}

.empty-state__description {
  max-width: 460px;
  margin: 10px 0 0;
  font-size: 0.9375rem;
  color: var(--color-text-secondary);
}

.empty-state__actions {
  margin-top: 20px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

.empty-state__btn {
  height: 40px;
  padding: 0 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s ease;
}

.empty-state__btn--primary {
  border-color: transparent;
  background: var(--color-primary);
  color: #fff;
}

.empty-state__btn--primary:hover {
  background: var(--color-primary-dark);
}

.empty-state__btn--secondary {
  background: var(--color-bg-secondary);
  color: var(--color-text);
}

.empty-state__btn--secondary:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-muted);
}
</style>
