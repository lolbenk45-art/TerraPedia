<script setup lang="ts">
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  label: string
  inputId: string
}>()

const model = defineModel<string>({ default: '' })

const visible = ref(false)
const toggleVisibility = () => {
  visible.value = !visible.value
}

const inputType = computed(() => (visible.value ? 'text' : 'password'))
const toggleLabel = computed(() => (visible.value ? '隐藏密码' : '显示密码'))
const toggleGlyph = computed(() => (visible.value ? '隐藏' : '显示'))
</script>

<template>
  <label class="password-field">
    <span>{{ props.label }}</span>
    <div class="password-field-control">
      <input
        :id="props.inputId"
        v-model="model"
        v-bind="$attrs"
        :type="inputType"
        data-password-input
      />
      <button
        type="button"
        class="password-visibility-toggle"
        :aria-pressed="visible"
        :aria-label="toggleLabel"
        @click="toggleVisibility"
      >
        <span aria-hidden="true">{{ toggleGlyph }}</span>
      </button>
    </div>
  </label>
</template>

<style scoped>
.password-field-control {
  position: relative;
  display: block;
}

.password-field-control input[data-password-input] {
  width: 100%;
  padding-right: 62px;
}

.password-visibility-toggle {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid var(--index-line);
  border-radius: 6px;
  background: rgba(244, 234, 208, 0.06);
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
}

.password-visibility-toggle:hover {
  color: var(--paper);
  border-color: var(--paper);
}

.password-visibility-toggle:focus-visible {
  outline: 2px solid var(--paper);
  outline-offset: 2px;
}

.password-visibility-toggle[aria-pressed='true'] {
  color: var(--paper);
  border-color: var(--paper);
}
</style>
