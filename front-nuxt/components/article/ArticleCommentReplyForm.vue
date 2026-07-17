<script setup lang="ts">
const props = defineProps<{
  formId: string
  label: string
  submitting: boolean
  canSubmit: boolean
}>()

const replyText = defineModel<string>({ required: true })

const emit = defineEmits<{
  submit: []
  cancel: []
}>()
</script>

<template>
  <form
    class="article-comment-reply-form article-comment-reply-form--inline"
    @submit.prevent="emit('submit')"
  >
    <label :for="props.formId">
      {{ props.label }}
    </label>
    <textarea
      :id="props.formId"
      v-model="replyText"
      maxlength="1000"
      rows="3"
      placeholder="写下你的补充或问题。"
    ></textarea>
    <div class="article-comment-form-actions">
      <span>{{ replyText.trim().length }} / 1000</span>
      <div class="article-comment-reply-buttons">
        <button class="article-comment-delete" type="button" @click="emit('cancel')">取消</button>
        <button class="article-comment-submit" type="submit" :disabled="!props.canSubmit">
          {{ props.submitting ? '回复中' : '发布回复' }}
        </button>
      </div>
    </div>
  </form>
</template>
