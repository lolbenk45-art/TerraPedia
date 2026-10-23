<template>
  <section class="pc-version-triage" aria-labelledby="pc-version-triage-title">
    <header class="pc-version-triage__head">
      <div>
        <small>Desktop / PC</small>
        <h2 id="pc-version-triage-title">版本更新候选</h2>
        <p v-if="state">游标 {{ state.lastEvaluatedDesktopVersion }} <span v-if="state.updatedAt">· 更新 {{ formatTime(state.updatedAt) }}</span></p>
      </div>
      <button
        type="button"
        class="pc-version-triage__probe"
        :disabled="loading || probeLoading || probeProgress?.status === 'running'"
        :aria-busy="probeLoading || probeProgress?.status === 'running'"
        @click="$emit('probe')"
      >
        <RefreshCw :size="16" aria-hidden="true" />
        <span>{{ probeProgress?.status === 'running' ? '检查中' : probeLoading ? '提交中' : '检查 PC 版本' }}</span>
      </button>
    </header>

    <p v-if="error" class="pc-version-triage__error" role="alert">{{ error }}</p>
    <div v-if="probeProgress" class="pc-version-triage__progress" :class="`pc-version-triage__progress--${probeProgress.status || 'unknown'}`" aria-live="polite">
      <span class="pc-version-triage__progress-mark" aria-hidden="true"></span>
      <div>
        <strong>{{ progressLabel(probeProgress.status) }}</strong>
        <p>{{ probeProgress.message || probeProgress.phase || '暂无探针进度说明' }}</p>
      </div>
      <small v-if="probeProgress.lastHeartbeatAt">{{ formatTime(probeProgress.lastHeartbeatAt) }}</small>
    </div>

    <div class="pc-version-triage__counts" aria-label="候选数量">
      <span><strong>{{ pendingCandidates.length }}</strong> 待处理</span>
      <span><strong>{{ handledCandidates.length }}</strong> 已处理</span>
      <span><strong>{{ informationalCandidates.length }}</strong> 未映射</span>
    </div>

    <div v-if="loading && !state" class="pc-version-triage__empty" aria-live="polite">正在读取版本候选</div>
    <div v-else-if="!state" class="pc-version-triage__empty" role="status">候选状态暂不可用</div>
    <div v-else-if="state.candidates.length === 0" class="pc-version-triage__empty" role="status">暂无 PC 版本更新候选</div>

    <div v-if="pendingCandidates.length" class="pc-version-triage__group">
      <h3>待处理</h3>
      <article v-for="candidate in pendingCandidates" :key="candidate.candidateId" class="pc-version-candidate">
        <div class="pc-version-candidate__body">
          <div class="pc-version-candidate__meta">
            <strong>{{ candidate.releaseVersion }}</strong>
            <span>{{ candidate.sectionTitle || '公告' }}</span>
            <span>{{ domainName(candidate.target?.domain) }}</span>
            <span v-if="candidate.target?.impactStatus === 'unspecified_by_release_note'" class="pc-version-candidate__impact">公告未注明</span>
            <span v-else-if="candidate.target?.impactFields?.length" class="pc-version-candidate__impact">{{ candidate.target.impactFields.join(' · ') }}</span>
          </div>
          <p class="pc-version-candidate__text">{{ candidate.text }}</p>
          <div class="pc-version-candidate__identity">
            <span>{{ candidate.target?.displayName }}</span>
            <code>{{ candidate.target?.stableIdentity?.value }}</code>
            <a v-if="candidate.releaseSource?.pageUrl" :href="candidate.releaseSource.pageUrl" target="_blank" rel="noreferrer">
              {{ candidate.releaseSource.pageTitle || '版本公告' }}
              <ExternalLink :size="13" aria-hidden="true" />
            </a>
          </div>
        </div>
        <button
          type="button"
          class="pc-version-candidate__action"
          :disabled="handlingId === candidate.candidateId"
          :aria-label="`标记 ${candidate.target?.displayName || candidate.text} 已处理`"
          :title="`标记 ${candidate.target?.displayName || '候选'} 已处理`"
          @click="$emit('handling', candidate, 'handled')"
        >
          <Check :size="16" aria-hidden="true" />
          <span>{{ handlingId === candidate.candidateId ? '保存中' : '标记已处理' }}</span>
        </button>
      </article>
    </div>

    <div v-if="informationalCandidates.length" class="pc-version-triage__group">
      <h3>未映射 / 信息项</h3>
      <article v-for="candidate in informationalCandidates" :key="candidate.candidateId" class="pc-version-candidate pc-version-candidate--informational">
        <div class="pc-version-candidate__body">
          <div class="pc-version-candidate__meta">
            <strong>{{ candidate.releaseVersion }}</strong>
            <span>{{ candidate.sectionTitle || '公告' }}</span>
            <span>{{ candidate.mappingReason || '无唯一实体匹配' }}</span>
          </div>
          <p class="pc-version-candidate__text">{{ candidate.text }}</p>
          <a v-if="candidate.releaseSource?.pageUrl" :href="candidate.releaseSource.pageUrl" target="_blank" rel="noreferrer">
            {{ candidate.releaseSource.pageTitle || '版本公告' }}
            <ExternalLink :size="13" aria-hidden="true" />
          </a>
        </div>
        <span class="pc-version-candidate__read-only">仅供查看</span>
      </article>
    </div>

    <div v-if="handledCandidates.length" class="pc-version-triage__group">
      <h3>已处理</h3>
      <article v-for="candidate in handledCandidates" :key="candidate.candidateId" class="pc-version-candidate pc-version-candidate--handled">
        <div class="pc-version-candidate__body">
          <div class="pc-version-candidate__meta">
            <strong>{{ candidate.releaseVersion }}</strong>
            <span>{{ domainName(candidate.target?.domain) }}</span>
            <span>{{ candidate.target?.displayName }}</span>
          </div>
          <p class="pc-version-candidate__text">{{ candidate.text }}</p>
          <small v-if="candidate.handledBy || candidate.handledAt">{{ candidate.handledBy || '管理员' }} · {{ formatTime(candidate.handledAt) }}</small>
          <small v-if="candidate.handlingNote">{{ candidate.handlingNote }}</small>
        </div>
        <button
          type="button"
          class="pc-version-candidate__action pc-version-candidate__action--secondary"
          :disabled="handlingId === candidate.candidateId"
          :aria-label="`撤销 ${candidate.target?.displayName || candidate.text} 的已处理状态`"
          :title="`撤销 ${candidate.target?.displayName || '候选'} 的已处理状态`"
          @click="$emit('handling', candidate, 'pending')"
        >
          <Undo2 :size="16" aria-hidden="true" />
          <span>{{ handlingId === candidate.candidateId ? '保存中' : '撤销' }}</span>
        </button>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Check, ExternalLink, RefreshCw, Undo2 } from 'lucide-vue-next'
import type { PcVersionUpdateCandidate, PcVersionUpdateState } from '~/types/crawlerMonitor'

const props = defineProps<{
  state?: PcVersionUpdateState | null
  loading?: boolean
  probeLoading?: boolean
  handlingId?: string
  error?: string
}>()

defineEmits<{
  probe: []
  handling: [candidate: PcVersionUpdateCandidate, status: 'pending' | 'handled']
}>()

const candidates = computed(() => Array.isArray(props.state?.candidates) ? props.state.candidates : [])
const pendingCandidates = computed(() => candidates.value.filter((candidate) => candidate.handlingAllowed && candidate.handlingStatus === 'pending'))
const handledCandidates = computed(() => candidates.value.filter((candidate) => candidate.handlingAllowed && candidate.handlingStatus === 'handled'))
const informationalCandidates = computed(() => candidates.value.filter((candidate) => !candidate.handlingAllowed || candidate.handlingStatus === 'informational'))
const probeProgress = computed(() => props.state?.probeProgress || null)

function domainName(domain?: string) {
  return ({ items: '物品', npcs: 'NPC', projectiles: '射弹', armor_sets: '盔甲套装', buffs: '增益', audio: '音频', bosses: 'Boss', shimmer: '微光' } as Record<string, string>)[domain || ''] || '未映射'
}

function progressLabel(status?: unknown) {
  return ({ running: '版本检查中', completed: '版本检查完成', failed: '版本检查失败', locked: '版本检查已在运行' } as Record<string, string>)[String(status || '')] || '尚无检查记录'
}

function formatTime(value?: unknown) {
  if (!value) return '时间未记录'
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false })
}
</script>

<style scoped>
.pc-version-triage { margin: 20px 0 24px; border-top: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); }
.pc-version-triage__head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding: 18px 0; }
.pc-version-triage__head h2 { margin: 3px 0 0; font-size: 20px; line-height: 1.25; }
.pc-version-triage__head p { margin: 6px 0 0; color: var(--color-text-secondary); font-size: 13px; }
.pc-version-triage__head small { color: var(--color-text-muted); }
.pc-version-triage__probe, .pc-version-candidate__action { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; gap: 8px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-surface); color: var(--color-text); padding: 0 12px; font: inherit; cursor: pointer; }
.pc-version-triage__probe:hover:not(:disabled), .pc-version-candidate__action:hover:not(:disabled) { border-color: var(--color-primary); color: var(--color-primary); }
.pc-version-triage__probe:disabled, .pc-version-candidate__action:disabled { cursor: wait; opacity: .6; }
.pc-version-triage__progress { display: flex; align-items: center; gap: 10px; border: 1px solid var(--color-border); border-radius: 6px; padding: 10px 12px; }
.pc-version-triage__progress-mark { width: 9px; height: 9px; flex: 0 0 auto; border-radius: 50%; background: var(--color-text-muted); }
.pc-version-triage__progress--running .pc-version-triage__progress-mark { background: var(--color-warning); }
.pc-version-triage__progress--completed .pc-version-triage__progress-mark { background: var(--color-success); }
.pc-version-triage__progress--failed .pc-version-triage__progress-mark { background: var(--color-danger); }
.pc-version-triage__progress div { min-width: 0; flex: 1; }
.pc-version-triage__progress p { margin: 2px 0 0; color: var(--color-text-secondary); overflow-wrap: anywhere; }
.pc-version-triage__progress small { color: var(--color-text-muted); }
.pc-version-triage__counts { display: flex; flex-wrap: wrap; gap: 20px; padding: 12px 0; color: var(--color-text-secondary); font-size: 13px; }
.pc-version-triage__counts strong { color: var(--color-text); font-variant-numeric: tabular-nums; }
.pc-version-triage__empty { padding: 18px 0; color: var(--color-text-secondary); }
.pc-version-triage__error { border-left: 3px solid var(--color-danger); padding: 8px 12px; color: var(--color-danger); overflow-wrap: anywhere; }
.pc-version-triage__group { margin: 12px 0 18px; }
.pc-version-triage__group h3 { margin: 0; padding: 8px 0; font-size: 14px; }
.pc-version-candidate { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px; border-top: 1px solid var(--color-border-subtle, var(--color-border)); padding: 13px 0; }
.pc-version-candidate__body { min-width: 0; }
.pc-version-candidate__meta, .pc-version-candidate__identity { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; color: var(--color-text-secondary); font-size: 12px; }
.pc-version-candidate__meta strong { color: var(--color-text); font-variant-numeric: tabular-nums; }
.pc-version-candidate__impact { color: var(--color-warning); }
.pc-version-candidate__text { margin: 6px 0; color: var(--color-text); line-height: 1.5; overflow-wrap: anywhere; }
.pc-version-candidate__identity code { color: var(--color-text-muted); overflow-wrap: anywhere; }
.pc-version-candidate a { display: inline-flex; align-items: center; gap: 4px; color: var(--color-primary); text-decoration: none; }
.pc-version-candidate a:hover { text-decoration: underline; }
.pc-version-candidate__action { min-width: 44px; }
.pc-version-candidate__action--secondary { color: var(--color-text-secondary); }
.pc-version-candidate__read-only { color: var(--color-text-muted); font-size: 12px; }
.pc-version-candidate--handled { opacity: .8; }
.pc-version-candidate--handled small { display: inline-block; margin: 3px 12px 0 0; color: var(--color-text-muted); }
@media (max-width: 680px) {
  .pc-version-triage__head { align-items: flex-start; flex-direction: column; }
  .pc-version-candidate { align-items: flex-start; grid-template-columns: minmax(0, 1fr); }
  .pc-version-candidate__action { justify-self: start; }
  .pc-version-triage__progress { align-items: flex-start; flex-wrap: wrap; }
  .pc-version-triage__progress small { margin-left: 19px; }
}
</style>
