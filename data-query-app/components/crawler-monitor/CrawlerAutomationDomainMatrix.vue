<template>
  <section class="automation-panel" aria-labelledby="automation-domain-title">
    <h3 id="automation-domain-title">域能力矩阵</h3>
    <div class="automation-table-wrap" role="region" aria-label="域自动化状态" tabindex="0">
      <table>
        <thead>
          <tr><th>域</th><th>等级</th><th>状态</th><th>最近运行</th><th>禁用原因</th></tr>
        </thead>
        <tbody>
          <tr v-for="domain in domains || []" :key="domain.domainId">
            <th>{{ domain.domainId }}</th>
            <td>{{ domain.automationLevel }}</td>
            <td>{{ domain.operationalState }}</td>
            <td>{{ domain.lastRunStatus || '未运行' }}</td>
            <td>
              <ul v-if="domain.disabledReasons?.length" class="automation-disabled-reasons">
                <li v-for="reason in domain.disabledReasons" :key="reason.code">
                  {{ reason.messageZh }}
                </li>
              </ul>
              <span v-else>无</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
<script setup lang="ts">
interface DisabledReason {
  code: string
  messageZh: string
}

interface AutomationDomainSummary {
  domainId: string
  automationLevel: string
  operationalState: string
  lastRunStatus?: string | null
  disabledReasons?: DisabledReason[]
}

defineProps<{ domains?: AutomationDomainSummary[] }>()
</script>
