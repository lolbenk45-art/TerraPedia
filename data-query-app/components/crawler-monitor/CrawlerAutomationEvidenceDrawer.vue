<template>
  <aside v-if="open" class="automation-evidence" role="dialog" aria-modal="true" aria-labelledby="automation-evidence-title">
    <header><h2 id="automation-evidence-title">运行证据</h2><button type="button" aria-label="关闭运行证据" @click="$emit('close')">关闭</button></header>
    <dl v-if="run"><div><dt>Run ID</dt><dd><code>{{ run.runId }}</code></dd></div><div><dt>策略集</dt><dd><code>{{ run.policySetHash }}</code></dd></div><div><dt>基线</dt><dd><code>{{ run.baselineFingerprint }}</code></dd></div><div><dt>决策</dt><dd>{{ run.decision?.decisionType || '未生成' }}</dd></div></dl>
  </aside>
</template>
<script setup lang="ts">
defineProps<{ open: boolean; run?: any }>()
defineEmits<{ close: [] }>()
</script>
