<template>
  <section class="automation-panel automation-risk" aria-labelledby="automation-risk-title">
    <header><div><small>自动入库风险台</small><h2 id="automation-risk-title">先处理断路、审批与异常域</h2></div>
      <button type="button" :disabled="loading" :aria-busy="loading" @click="$emit('refresh')">刷新</button></header>
    <p v-if="readOnly" class="automation-readonly" role="status">T2 只读模式：所有变更操作已禁用。</p>
    <div class="automation-metrics" role="list">
      <article role="listitem"><strong>{{ overview?.openCircuitBreakers ?? 0 }}</strong><span>断路器</span></article>
      <article role="listitem"><strong>{{ overview?.pendingOwnerApprovals ?? 0 }}</strong><span>待 Owner 审批</span></article>
      <article role="listitem"><strong>{{ overview?.abnormalDomains ?? 0 }}</strong><span>异常域</span></article>
    </div>
  </section>
</template>
<script setup lang="ts">
defineProps<{ overview?: any; readOnly: boolean; loading?: boolean }>()
defineEmits<{ refresh: [] }>()
</script>

