<template>
  <section class="automation-panel" aria-labelledby="automation-pipeline-title">
    <h3 id="automation-pipeline-title">最近运行管线</h3>
    <p v-if="!runs?.length" role="status">暂无自动化运行记录。</p>
    <ol v-else class="automation-list">
      <li v-for="run in runs" :key="run.runId">
        <button type="button" @click="$emit('open-evidence', run)"><strong>{{ run.primaryDomainId }}</strong><span>{{ run.status }}</span><code>{{ run.runId }}</code></button>
      </li>
    </ol>
  </section>
</template>
<script setup lang="ts">
defineProps<{ runs?: any[] }>()
defineEmits<{ 'open-evidence': [run: any] }>()
</script>

