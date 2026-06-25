<template>
  <div class="page-wrap page-workspace crawler-monitor">
    <section v-if="refreshStale" class="section-card stale-alert">
      <span class="stale-alert__icon">
        <AlertTriangle :size="20" />
      </span>
      <div>
        <strong>backend-refresh 监控链路已过期</strong>
        <p>{{ overview?.refreshStaleReason || '最近没有 backend-refresh 活动；请优先查看当前域进度、心跳和报告入口。' }}</p>
        <code>最后活动：{{ formatDate(overview?.refreshLastActivityAt) }}</code>
      </div>
    </section>

    <section class="recovery-board single-screen-board crawler-workbench" aria-label="Wiki 数据变化 / 手动执行">
      <div class="recovery-main">
        <header class="focused-topbar single-screen-toolbar crawler-workbench-topbar">
          <div>
            <p class="eyebrow">Crawler Monitor</p>
            <h1 class="page-head__title">域爬取监控</h1>
            <p class="page-head__subtitle">
              优先定位异常、停滞、堵塞、运行和排队域；点击行查看实时进度、恢复动作和证据。
            </p>
          </div>
          <div class="toolbar-top action-cluster toolbar-top--hero monitor-actions">
            <button type="button" class="btn btn-secondary" :disabled="loading" @click="loadOverview">
              <RefreshCw :size="16" :class="{ 'spin': loading }" />
              <span>{{ loading ? '刷新中' : '刷新' }}</span>
            </button>
            <button
              type="button"
              class="btn"
              :class="autoRefresh ? 'btn-primary' : 'btn-secondary'"
              @click="autoRefresh = !autoRefresh"
            >
              <TimerReset :size="16" />
              <span>{{ autoRefresh ? '自动刷新开' : '自动刷新关' }}</span>
            </button>
          </div>
        </header>

        <div class="monitor-tab-panel">
        <div v-if="healthSignals.length" class="health-strip">
          <span
            v-for="sig in healthSignals"
            :key="sig.key"
            class="health-signal"
            :class="sig.tone"
            :title="sig.detail"
          >{{ sig.label }}</span>
        </div>

        <section class="section-card monitor-panel domain-table-panel crawler-domain-card" aria-label="域监控表">
          <div class="section-head">
            <div>
              <h2 class="section-card__title">域监控表</h2>
              <p class="section-card__subtitle">正式域 {{ domainTableRows.length }} 个 · 10 域样本已隔离</p>
            </div>
            <span class="status-pill" :class="statusTone(selectedDomainTableRow?.risk || selectedDomainTableRow?.status || 'missing')">
              {{ selectedDomainTableRow?.diagnosisTitle || statusLabel(selectedDomainTableRow?.status || 'missing') }}
            </span>
          </div>

          <div class="single-screen-table-frame">
            <div class="table-scroll">
              <table class="monitor-table domain-monitor-table">
              <thead>
                <tr>
                  <th>域</th>
                  <th>状态</th>
                  <th>进度</th>
                  <th>心跳</th>
                  <th>队列/占用</th>
                  <th>阻塞者</th>
                  <th>判断</th>
                  <th>证据</th>
                  <th>动作</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in domainTableRows"
                  :key="selectedDomainTableRowKey(row)"
                  :class="[`domain-monitor-table__row--${row.diagnosisGroup}`, { 'is-selected': selectedDomainTableRow && selectedDomainTableRowKey(selectedDomainTableRow) === selectedDomainTableRowKey(row) }]"
                  @click="selectDomainTableRow(row)"
                >
                  <td>
                    <strong>{{ row.label }}</strong>
                    <small>{{ row.domain || row.actionId || '未知域' }}</small>
                  </td>
                  <td>
                    <span class="status-pill" :class="statusTone(row.risk || row.status)">{{ row.diagnosisTitle }}</span>
                    <small>{{ statusLabel(row.status) }}</small>
                  </td>
                  <td>
                    <strong>{{ row.progressLabel }}</strong>
                    <small>{{ row.actionId || '无动作' }}</small>
                    <div class="progress-track">
                      <span :style="{ width: rowProgress(row.progressRow) }" :class="statusTone(row.status)" />
                    </div>
                  </td>
                  <td><strong>{{ row.heartbeatAt ? formatDate(row.heartbeatAt) : '暂无心跳' }}</strong></td>
                  <td>
                    <strong>{{ row.queueSummary }}</strong>
                    <small>{{ row.ownerLabel }}</small>
                    <small v-if="row.pid">PID {{ row.pid }}</small>
                  </td>
                  <td>
                    <strong>{{ row.blockerIdentity || row.blockerLabel || '无' }}</strong>
                    <small v-if="row.dispatchId">{{ row.dispatchId }}</small>
                  </td>
                  <td>
                    <strong>{{ row.rankReason }}</strong>
                    <small>{{ row.reason || '暂无异常判断' }}</small>
                    <small>{{ row.sourceSummary }}</small>
                  </td>
                  <td>
                    <small>{{ row.evidenceSummary }}</small>
                    <div v-if="row.files.length" class="progress-path-list">
                      <button
                        v-for="file in row.files"
                        :key="`${row.domain}-${file.label}`"
                        type="button"
                        class="inline-report-button inline-report-button--compact"
                        :class="{ 'inline-report-button--not-previewable': !isPreviewableReportPath(file.path) && !isPreviewableProgressPath(file.path) && !isPreviewableGeneratedJsonPath(file.path) }"
                        :disabled="!isPreviewableReportPath(file.path) && !isPreviewableProgressPath(file.path) && !isPreviewableGeneratedJsonPath(file.path)"
                        :title="file.path"
                        @click.stop="openReportPreview(file.path)"
                      >
                        <span>{{ file.label }}</span>
                      </button>
                    </div>
                  </td>
                  <td>
                    <button
                      v-if="canCancelDomainTableQueuedRow(row)"
                      type="button"
                      class="inline-report-button inline-report-button--compact inline-report-button--danger"
                      :disabled="queueControlLoading === row.queueId"
                      @click.stop="cancelDomainTableQueuedRow(row)"
                    >
                      <CircleStop :size="14" />
                      <span>{{ queueControlLoading === row.queueId ? '取消中' : '取消排队' }}</span>
                    </button>
                    <button
                      v-else-if="canCancelDomainTableRunningRow(row)"
                      type="button"
                      class="inline-report-button inline-report-button--compact inline-report-button--danger"
                      :disabled="queueControlLoading === row.queueId"
                      @click.stop="cancelDomainTableRunningRow(row)"
                    >
                      <CircleStop :size="14" />
                      <span>{{ queueControlLoading === row.queueId ? '终止中' : '终止运行' }}</span>
                    </button>
                    <button v-else type="button" class="inline-report-button inline-report-button--compact" @click.stop="selectDomainTableRow(row)">
                      <Eye :size="14" />
                      <span>{{ row.nextActionLabel || '查看' }}</span>
                    </button>
                  </td>
                </tr>
                <tr v-if="!domainTableRows.length">
                  <td colspan="9" class="table-empty">暂无域状态。</td>
                </tr>
              </tbody>
              </table>
            </div>
          </div>
        </section>
        <section
          v-if="selectedDomainTableRow"
          class="selected-domain-inline wiki-workbench selected-domain-workbench"
          aria-label="选中域排障"
        >
            <header class="selected-domain-drawer__head">
              <div>
                <span class="ops-card__label">选中域排障</span>
                <h2>{{ selectedDomainDisplayName }} · {{ selectedDomainStatusLabel }}</h2>
                <p>{{ selectedDomainOperatorSummary }}</p>
              </div>
              <button type="button" class="icon-close-button" aria-label="关闭选中域排障" @click="closeSelectedDomainDrawer">
                <X :size="16" />
              </button>
            </header>
            <div class="wiki-live-panel live-focus">
            <div class="wiki-live-panel__head">
              <div>
                <span class="ops-card__label">实时进度</span>
                <h3>{{ selectedDomainNextActionLabel }}</h3>
                <p>{{ selectedWikiDomainProgressCopy }}</p>
              </div>
              <strong class="wiki-live-percent">{{ rowProgressLabel(selectedWikiProgressRow) }}</strong>
            </div>
            <div class="progress-track">
              <span :style="{ width: rowProgress(selectedWikiProgressRow) }" :class="statusTone(rowStatus(selectedWikiProgressRow))" />
            </div>
            <div class="wiki-live-metrics">
              <span><small>状态</small><strong>{{ selectedDomainStatusLabel }}</strong></span>
              <span><small>下一步建议</small><strong>{{ selectedDomainNextActionLabel }}</strong></span>
              <span><small>当前/总数</small><strong>{{ selectedWikiProgressNumbers }}</strong></span>
              <span><small>最后心跳</small><strong>{{ selectedDomainHeartbeatMessage }}</strong></span>
              <span><small>心跳状态</small><strong>{{ selectedDomainHeartbeatState }}</strong></span>
              <span><small>开始时间</small><strong>{{ selectedDomainStartedAtLabel }}</strong></span>
              <span><small>运行时长</small><strong>{{ selectedDomainElapsedLabel }}</strong></span>
              <span><small>更新时间</small><strong>{{ selectedWikiUpdatedAtLabel }}</strong></span>
              <span><small>待处理</small><strong>{{ rowPendingLabel(selectedWikiProgressRow) }}</strong></span>
              <span><small>速度</small><strong>{{ rowSpeedLabel(selectedWikiProgressRow) }}</strong></span>
              <span><small>预计剩余</small><strong>{{ rowEtaLabel(selectedWikiProgressRow) }}</strong></span>
            </div>
            <div v-if="selectedDomainCooldownExplanation" class="wiki-workbench__cooldown">
              <span>Wiki 保护冷却</span>
              <p>{{ selectedDomainCooldownExplanation }}</p>
            </div>
            <div v-if="selectedWikiActionDisabledReason" class="wiki-workbench__warning">
              <span>为什么不能执行</span>
              <p>{{ selectedWikiActionDisabledReason }}</p>
            </div>
            <div class="wiki-path-strip">
              <span>运行文件</span>
              <code>{{ selectedWikiPathSummary }}</code>
            </div>
            <div class="wiki-run-control-panel" aria-label="当前域操作">
              <div>
                <strong>当前域操作</strong>
                <small>{{ selectedWikiOperationHint }}</small>
              </div>
              <div
                v-if="selectedWikiDomain"
                class="wiki-run-control-buttons"
                :class="{ 'wiki-run-control-buttons--disabled': !selectedWikiCanExecute }"
              >
                <button
                  type="button"
                  class="inline-report-button"
                  :disabled="loading"
                  @click="loadOverview"
                >
                  <RefreshCw :size="14" :class="{ 'spin': loading }" />
                  <span>{{ loading ? '刷新中' : '刷新状态' }}</span>
                </button>
                <button
                  type="button"
                  class="wiki-run-control-button--primary"
                  :class="{ 'wiki-run-control-button--disabled': !selectedWikiCanExecute }"
                  :disabled="!selectedWikiCanExecute || wikiDispatchLoading === selectedWikiDomain.domain"
                  :title="selectedWikiActionDisabledReason || selectedWikiOperationHint"
                  @click="openDispatchConfirm(selectedWikiDomain)"
                >
                  <RefreshCw :size="16" :class="{ 'spin': wikiDispatchLoading === selectedWikiDomain.domain }" />
                  <span>{{ selectedWikiReCrawlButtonLabel }}</span>
                </button>
                <button
                  v-if="canRetryWikiDomain(selectedWikiDomain)"
                  type="button"
                  class="inline-report-button inline-report-button--warning"
                  :disabled="wikiDispatchLoading === selectedWikiDomain.domain"
                  @click="retryWikiDomain(selectedWikiDomain)"
                >
                  <RefreshCw :size="14" :class="{ 'spin': wikiDispatchLoading === selectedWikiDomain.domain }" />
                  <span>{{ wikiDispatchLoading === selectedWikiDomain.domain ? '重试中' : '重试' }}</span>
                </button>
                <button
                  type="button"
                  class="inline-report-button"
                  :disabled="!canPauseWikiDomain(selectedWikiDomain) || wikiControlLoading === selectedWikiDomain.domain"
                  @click="controlWikiMonitorTask(selectedWikiDomain, 'pause')"
                >
                  <Pause :size="14" />
                  <span>{{ canPauseWikiDomain(selectedWikiDomain) ? (wikiControlLoading === selectedWikiDomain.domain ? '处理中' : '暂停任务') : '暂停不可用' }}</span>
                </button>
                <button
                  type="button"
                  class="inline-report-button"
                  :disabled="!canResumeWikiDomain(selectedWikiDomain) || wikiControlLoading === selectedWikiDomain.domain"
                  @click="controlWikiMonitorTask(selectedWikiDomain, 'resume')"
                >
                  <Play :size="14" />
                  <span>{{ canResumeWikiDomain(selectedWikiDomain) ? (wikiControlLoading === selectedWikiDomain.domain ? '处理中' : '继续任务') : '继续不可用' }}</span>
                </button>
                <button
                  type="button"
                  class="inline-report-button inline-report-button--danger"
                  :disabled="!canCancelWikiDomain(selectedWikiDomain) || wikiControlLoading === selectedWikiDomain.domain"
                  @click="openCancelConfirm(selectedWikiDomain)"
                >
                  <CircleStop :size="14" />
                  <span>{{ canCancelWikiDomain(selectedWikiDomain) ? (wikiControlLoading === selectedWikiDomain.domain ? '处理中' : '终止并清理文件') : '终止不可用' }}</span>
                </button>
              </div>
              <div v-else class="wiki-run-control-buttons">
                <button
                  v-if="canCancelDomainTableQueuedRow(selectedDomainTableRow)"
                  type="button"
                  class="inline-report-button inline-report-button--danger"
                  :disabled="queueControlLoading === selectedDomainTableRow.queueId"
                  @click="cancelDomainTableQueuedRow(selectedDomainTableRow)"
                >
                  <CircleStop :size="14" />
                  <span>{{ queueControlLoading === selectedDomainTableRow.queueId ? '取消中' : '取消排队' }}</span>
                </button>
                <button
                  v-if="canCancelDomainTableRunningRow(selectedDomainTableRow)"
                  type="button"
                  class="inline-report-button inline-report-button--danger"
                  :disabled="queueControlLoading === selectedDomainTableRow.queueId"
                  @click="cancelDomainTableRunningRow(selectedDomainTableRow)"
                >
                  <CircleStop :size="14" />
                  <span>{{ queueControlLoading === selectedDomainTableRow.queueId ? '终止中' : '终止运行' }}</span>
                </button>
                <button type="button" class="inline-report-button" :disabled="loading" @click="loadOverview">
                  <RefreshCw :size="14" :class="{ 'spin': loading }" />
                  <span>{{ loading ? '刷新中' : '刷新状态' }}</span>
                </button>
              </div>
            </div>
            </div>

            <aside class="wiki-recovery-panel recovery-panel selected-domain-table-evidence">
            <div>
              <span class="ops-card__label">当前域证据</span>
              <h3>{{ selectedWikiRecoveryTitle }}</h3>
              <p>{{ selectedWikiRecoveryCopy }}</p>
            </div>
            <div class="selected-domain-detail-grid">
              <span><small>诊断</small><strong>{{ selectedDomainTableRow ? selectedDomainTableRow.rankReason : '无异常排序原因' }}</strong></span>
              <span><small>标准队列</small><strong>{{ selectedDomainTableRow ? selectedDomainTableRow.queueSummary : '无标准队列' }}</strong></span>
              <span><small>queueId</small><strong>{{ selectedDomainTableEvidence.queueId || '无' }}</strong></span>
              <span><small>dispatchId</small><strong>{{ selectedDomainTableEvidence.dispatchId || '无' }}</strong></span>
              <span><small>PID</small><strong>{{ selectedDomainTableEvidence.pid || '无' }}</strong></span>
              <span><small>阻塞者</small><strong>{{ selectedDomainTableRow ? selectedDomainTableRow.blockerIdentity || selectedDomainTableEvidence.blockerLabel || '无' : selectedDomainTableEvidence.blockerLabel || '无' }}</strong></span>
              <span><small>数据识别</small><strong>{{ selectedDomainTableRow ? selectedDomainTableRow.sourceSummary : '未记录' }}</strong></span>
              <span><small>下一步</small><strong>{{ selectedDomainTableRow ? selectedDomainTableRow.nextActionLabel : selectedDomainNextActionLabel }}</strong></span>
            </div>
            <div v-if="selectedDomainTableEvidence.files.length" class="progress-path-list">
              <button
                v-for="file in selectedDomainTableEvidence.files"
                :key="`selected-domain-evidence-${file.label}-${file.path}`"
                type="button"
                class="inline-report-button inline-report-button--compact"
                :class="{ 'inline-report-button--not-previewable': !isPreviewableReportPath(file.path) && !isPreviewableProgressPath(file.path) && !isPreviewableGeneratedJsonPath(file.path) }"
                :disabled="!isPreviewableReportPath(file.path) && !isPreviewableProgressPath(file.path) && !isPreviewableGeneratedJsonPath(file.path)"
                :title="file.path"
                @click="openReportPreview(file.path)"
              >
                <span>{{ file.label }}</span>
              </button>
            </div>
            <div v-if="selectedWikiDomain" class="wiki-recovery-actions">
              <button
                type="button"
                class="btn btn-primary"
                :disabled="!selectedWikiCanExecute || wikiDispatchLoading === selectedWikiDomain.domain"
                :title="selectedWikiActionDisabledReason || selectedWikiOperationHint"
                @click="openDispatchConfirm(selectedWikiDomain)"
              >
                <RefreshCw :size="16" :class="{ 'spin': wikiDispatchLoading === selectedWikiDomain.domain }" />
                <span>{{ wikiDomainPrimaryActionLabel(selectedWikiDomain) }}</span>
              </button>
              <button
                v-if="canRetryWikiDomain(selectedWikiDomain)"
                type="button"
                class="inline-report-button inline-report-button--warning"
                :disabled="wikiDispatchLoading === selectedWikiDomain.domain"
                @click="retryWikiDomain(selectedWikiDomain)"
              >
                <RefreshCw :size="14" :class="{ 'spin': wikiDispatchLoading === selectedWikiDomain.domain }" />
                <span>{{ wikiDispatchLoading === selectedWikiDomain.domain ? '重试中' : '重试' }}</span>
              </button>
              <button
                v-if="canPauseWikiDomain(selectedWikiDomain)"
                type="button"
                class="inline-report-button"
                :disabled="wikiControlLoading === selectedWikiDomain.domain"
                @click="controlWikiMonitorTask(selectedWikiDomain, 'pause')"
              >
                <Pause :size="14" />
                <span>{{ wikiControlLoading === selectedWikiDomain.domain ? '处理中' : '暂停占用' }}</span>
              </button>
              <button
                v-if="canResumeWikiDomain(selectedWikiDomain)"
                type="button"
                class="inline-report-button"
                :disabled="wikiControlLoading === selectedWikiDomain.domain"
                @click="controlWikiMonitorTask(selectedWikiDomain, 'resume')"
              >
                <Play :size="14" />
                <span>{{ wikiControlLoading === selectedWikiDomain.domain ? '处理中' : '继续任务' }}</span>
              </button>
              <button
                v-if="isPreviewableReportPath(selectedWikiReportPath)"
                type="button"
                class="inline-report-button"
                :disabled="isPreviewLoading(selectedWikiReportPath)"
                @click="openReportPreview(selectedWikiReportPath)"
              >
                <Eye :size="14" />
                <span>打开报告</span>
              </button>
              <button
                v-if="isPreviewableProgressPath(selectedWikiProgressPath)"
                type="button"
                class="inline-report-button"
                :disabled="isPreviewLoading(selectedWikiProgressPath)"
                @click="openReportPreview(selectedWikiProgressPath)"
              >
                <FileJson :size="14" />
                <span>查看进度文件</span>
              </button>
              <button
                v-if="isPreviewableGeneratedJsonPath(selectedWikiOutputPath)"
                type="button"
                class="inline-report-button"
                :disabled="isPreviewLoading(selectedWikiOutputPath)"
                @click="openReportPreview(selectedWikiOutputPath)"
              >
                <FileJson :size="14" />
                <span>打开爬取文件</span>
              </button>
              <button type="button" class="inline-report-button" @click="toggleCommandPreview(selectedWikiDomain)">
                <FileStack :size="14" />
                <span>查看命令</span>
              </button>
            </div>
            <p class="wiki-recovery-hint">{{ selectedWikiOperationHint }}</p>
            <p v-if="selectedWikiDomain && canPauseWikiDomain(selectedWikiDomain)" class="wiki-recovery-hint wiki-recovery-hint--warning">
              暂停会保留执行锁，后续队列不会自动接上；如需让下一个域执行，请使用终止并清理文件。
            </p>
            <div v-if="selectedWikiDomain && selectedWikiCommandOpen" class="wiki-command-preview">
              <span>命令预览</span>
              <code>domain: {{ selectedWikiDomain.domain || '未配置' }}
actionId: {{ selectedWikiDomain.recommendedActionId || '无白名单动作' }}
progressPath: {{ selectedWikiProgressPath || selectedWikiDomain.progressPath || '未生成' }}
command: {{ wikiDispatchForDomain(selectedWikiDomain)?.commandPreview || '由后端白名单动作派发' }}</code>
            </div>
            <div v-if="latestDispatchResult && (latestDispatchBelongsToSelected || !latestDispatchMatchedDomain)" class="wiki-dispatch-feedback">
              <span>{{ latestDispatchBelongsToSelected ? '当前域派发反馈' : '最新派发反馈' }}</span>
              <strong>{{ dispatchFeedbackMessage(latestDispatchResult) }}</strong>
              <dl>
                <div><dt>派发编号</dt><dd>{{ latestDispatchResult.dispatchId || '未返回' }}</dd></div>
                <div><dt>派发状态</dt><dd>{{ statusLabel(latestDispatchResult.status) }}</dd></div>
                <div v-if="latestDispatchResult.blockedByDispatchId || latestDispatchResult.blockedByActionId">
                  <dt>阻塞任务</dt>
                  <dd>{{ dispatchBlockerLabel(latestDispatchResult) }}</dd>
                </div>
                <div v-if="latestDispatchResult.blockedSince">
                  <dt>阻塞开始</dt>
                  <dd>{{ formatDate(latestDispatchResult.blockedSince) }}</dd>
                </div>
                <div><dt>进度文件</dt><dd>{{ dispatchResultPath('progress') || '未返回' }}</dd></div>
                <div><dt>报告文件</dt><dd>{{ dispatchResultPath('report') || '未返回' }}</dd></div>
                <div v-if="latestDispatchResult.lockPath"><dt>锁文件</dt><dd>{{ latestDispatchResult.lockPath }}</dd></div>
              </dl>
              <div class="wiki-dispatch-feedback__actions">
                <button
                  v-if="isPreviewableReportPath(dispatchResultPath('report'))"
                  type="button"
                  class="inline-report-button inline-report-button--compact"
                  @click="openReportPreview(dispatchResultPath('report'))"
                >
                  打开派发报告
                </button>
                <button
                  v-if="isPreviewableProgressPath(dispatchResultPath('progress'))"
                  type="button"
                  class="inline-report-button inline-report-button--compact"
                  @click="openReportPreview(dispatchResultPath('progress'))"
                >
                  打开派发进度
                </button>
              </div>
            </div>
            <div v-else-if="latestDispatchResult" class="wiki-dispatch-feedback wiki-dispatch-feedback--muted">
              <span>上一条派发</span>
              <strong>{{ latestDispatchResult.domain || latestDispatchResult.actionId || '未归属派发' }} · {{ statusLabel(latestDispatchResult.status) }}</strong>
              <button
                v-if="latestDispatchMatchedDomain"
                type="button"
                class="inline-report-button inline-report-button--compact"
                @click="selectLatestDispatchDomain"
              >
                切到该域
              </button>
            </div>
            </aside>
            <section v-if="selectedWikiDomain" class="panel recovery-detail selected-domain-config">
              <div>
                <h2>{{ selectedDomainDisplayName }} 域详情</h2>
                <p>{{ selectedWikiDomainDetailCopy }}</p>
                <div class="reason-list">
                  <div class="reason-row">
                    <span>Wiki</span>
                    <strong>{{ wikiDomainManualHint(selectedWikiDomain) }}</strong>
                    <button
                      v-if="isPreviewableProgressPath(selectedWikiProgressPath)"
                      type="button"
                      class="inline-report-button inline-report-button--compact"
                      @click="openReportPreview(selectedWikiProgressPath)"
                    >
                      打开文件
                    </button>
                  </div>
                  <div class="reason-row">
                    <span>心跳</span>
                    <strong>{{ wikiDomainHeartbeatLabel(selectedWikiDomain) }}</strong>
                    <button
                      v-if="isPreviewableReportPath(selectedWikiReportPath)"
                      type="button"
                      class="inline-report-button inline-report-button--compact"
                      @click="openReportPreview(selectedWikiReportPath)"
                    >
                      打开报告
                    </button>
                  </div>
                  <div class="reason-row">
                    <span>状态</span>
                    <strong>{{ selectedWikiOperationHint }}</strong>
                    <button type="button" class="inline-report-button inline-report-button--compact" @click="toggleCommandPreview(selectedWikiDomain)">
                      查看命令
                    </button>
                  </div>
                </div>
                <details v-if="selectedDomainSmokeRow" open class="selected-domain-detail-block">
                  <summary>
                    <strong>样本爬取验收</strong>
                    <span>{{ statusLabel(rowStatus(selectedDomainSmokeRow)) }}</span>
                  </summary>
                  <div class="selected-domain-detail-grid">
                    <span><small>状态</small><strong>{{ statusLabel(rowStatus(selectedDomainSmokeRow)) }}</strong></span>
                    <span><small>进度</small><strong>{{ rowProgressNumbers(selectedDomainSmokeRow) }}</strong></span>
                    <span><small>心跳</small><strong>{{ rowHeartbeatLabel(selectedDomainSmokeRow) }}</strong></span>
                    <span><small>进度文件</small><strong>{{ rowSourcePath(selectedDomainSmokeRow) || '--' }}</strong></span>
                  </div>
                </details>
                <details v-else open class="selected-domain-detail-block">
                  <summary>
                    <strong>样本爬取验收</strong>
                    <span>暂无样本</span>
                  </summary>
                  <p class="empty-line">当前域暂无样本爬取结果。</p>
                </details>
                <details v-if="selectedDomainValidationSummary" open class="selected-domain-detail-block">
                  <summary>
                    <strong>基础项检查</strong>
                    <span>
                      正式 {{ selectedDomainValidationSummary.formal.ready }}/{{ selectedDomainValidationSummary.formal.total }}
                      · 样本 {{ selectedDomainValidationSummary.sample.ready }}/{{ selectedDomainValidationSummary.sample.total }}
                    </span>
                  </summary>
                  <div class="selected-domain-validation-groups">
                    <section>
                      <h3>正式域状态</h3>
                      <div class="domain-test-items domain-test-items--selected">
                        <span v-for="item in selectedDomainValidationSummary.formal.items" :key="`${selectedDomainValidationSummary.id}-formal-${item.label}`">
                          <small>{{ item.label }}</small>
                          <strong>{{ item.value }}</strong>
                        </span>
                      </div>
                    </section>
                    <section>
                      <h3>样本测试状态</h3>
                      <div class="domain-test-items domain-test-items--selected">
                        <span v-for="item in selectedDomainValidationSummary.sample.items" :key="`${selectedDomainValidationSummary.id}-sample-${item.label}`">
                          <small>{{ item.label }}</small>
                          <strong>{{ item.value }}</strong>
                        </span>
                      </div>
                    </section>
                  </div>
                </details>
              </div>
              <div class="wiki-domain-detail-grid health-stack">
                <article class="wiki-detail-card"><span>数据来源键</span><strong>{{ selectedWikiDomain.sourceKey || '未配置' }}</strong></article>
                <article class="wiki-detail-card"><span>定位规则</span><strong>{{ selectedWikiDomain.locator || '未配置' }}</strong></article>
                <article class="wiki-detail-card"><span>上次检查</span><strong>{{ formatDate(selectedWikiDomain.lastCheckedAt) }}</strong></article>
                <article class="wiki-detail-card"><span>白名单动作 ID</span><strong>{{ selectedWikiDomain.recommendedActionId || '无白名单动作' }}</strong></article>
                <article class="wiki-detail-card"><span>最大并发</span><strong>{{ domainMaxConcurrentLabel(selectedWikiDomain) }}</strong></article>
                <article class="wiki-detail-card"><span>熔断</span><strong>{{ domainFailureCircuitBreakerLabel(selectedWikiDomain) }}</strong></article>
                <article class="wiki-detail-card"><span>进度文件</span><strong>{{ selectedWikiProgressPath || selectedWikiDomain.progressPath || '未生成' }}</strong></article>
                <article class="wiki-detail-card"><span>报告文件</span><strong>{{ selectedWikiReportPath || '等待生成' }}</strong></article>
                <article class="wiki-detail-card"><span>爬取文件</span><strong>{{ selectedWikiOutputPath || '等待生成' }}</strong></article>
                <article class="wiki-detail-card"><span>技术标识</span><strong>{{ selectedWikiDomain.domain || selectedWikiDomain.recommendedActionId || '未配置' }}</strong></article>
              </div>
            </section>
            <section v-if="pendingWikiDispatches.length" class="panel wiki-pending-compact">
              <div class="wiki-approval-list__head">
                <strong>待确认</strong>
                <span>{{ pendingWikiDispatches.length }} 个域需要处理</span>
              </div>
              <article v-for="dispatch in pendingWikiDispatches" :key="`pending-${dispatch.domain || dispatch.actionId}`" class="wiki-approval-row">
                <button type="button" class="wiki-pending-select" @click="selectWikiDomain(wikiDispatchDomain(dispatch) || undefined)">
                  <strong>{{ wikiDispatchDomain(dispatch)?.label || dispatch.domain || '未知域' }}</strong>
                  <small>{{ dispatch.message || wikiDispatchDomain(dispatch)?.locator || '等待手动确认' }}</small>
                  <code>{{ dispatch.progressPath || '未生成进度文件' }}</code>
                </button>
                <button
                  type="button"
                  class="btn btn-primary"
                  :disabled="!canExecuteWikiDispatch(dispatch) || wikiDispatchLoading === dispatch.domain"
                  :title="wikiDispatchDisabledReason(dispatch)"
                  @click="openDispatchConfirm(wikiDispatchDomain(dispatch))"
                >
                  <RefreshCw :size="16" :class="{ 'spin': wikiDispatchLoading === dispatch.domain }" />
                  <span>{{ wikiDispatchLoading === dispatch.domain ? '启动中' : '启动重爬' }}</span>
                </button>
              </article>
            </section>
        </section>
        </div>
      </div>
    </section>

    <section class="single-screen-diagnostics diagnostics-zone" aria-label="辅助监控信息">
      <div class="single-screen-diagnostics__body">
      <div class="monitor-tab-panel">
      <section class="section-card monitor-panel stage-progress-panel">
        <header class="section-head">
          <div>
            <h2 class="section-card__title">执行总览</h2>
            <p class="section-card__subtitle">合并真实队列与实时进度；域表格已经优先展示域状态，这里保留跨域执行项。</p>
            <small class="section-card__subtitle-note">执行项 {{ executionOverviewRows.length }} 项 · 详情交给当前选中域和任务进度明细</small>
          </div>
          <span class="status-pill" :class="statusTone(executionOverviewStatusLabel)">{{ statusLabel(executionOverviewStatusLabel) }}</span>
        </header>

        <div v-if="executionOverviewRows.length" class="action-rail action-rail--execution">
          <article v-for="row in executionOverviewRows" :key="row.key" class="action-card action-card--execution">
            <div class="action-card__head">
              <strong>{{ row.primaryLabel }}</strong>
              <div class="noise-actions">
                <span class="status-pill" :class="statusTone(row.displayStatus || row.status)">{{ statusLabel(row.displayStatus || row.status) }}</span>
                <button type="button" class="inline-report-button inline-report-button--compact" @click="selectExecutionOverviewRow(row)">
                  <Eye :size="14" />
                  <span>查看</span>
                </button>
              </div>
            </div>
            <div class="action-card__meta">
              <span>{{ row.secondaryLabel }}</span>
              <span v-if="row.queuePosition">队列 #{{ row.queuePosition }}</span>
              <span v-else>{{ row.kind === 'queue' ? '队列任务' : '进度任务' }}</span>
              <span v-if="executionOverviewProgressNumbers(row) !== '--'">{{ executionOverviewProgressNumbers(row) }}</span>
            </div>
            <p v-if="row.message" class="action-card__message">{{ row.message }}</p>
            <p v-if="row.heartbeatSummary" class="action-card__message action-card__message--warning">{{ row.heartbeatSummary }}</p>
            <div class="progress-track">
              <span :style="{ width: executionOverviewProgress(row) }" :class="statusTone(row.displayStatus || row.status)" />
            </div>
          </article>
        </div>

        <div v-else class="empty-block">
          <Activity :size="24" />
          <strong>暂无需关注执行项</strong>
          <span>当前没有运行、排队、阻塞、停滞或失败的执行项。</span>
        </div>
      </section>

      <section class="section-card monitor-panel">
        <header class="section-head">
          <div>
            <h2 class="section-card__title">全局队列和任务明细</h2>
            <p class="section-card__subtitle">全局排队、运行、堵塞和历史进度；当前域证据优先看上方选中域。</p>
          </div>
          <span class="status-pill" :class="activeDispatchQueueRows.length ? 'warning' : 'muted'">{{ activeDispatchQueueRows.length }} 项</span>
        </header>

        <section class="panel wiki-monitor-dispatch-queue" aria-label="wiki-monitor-dispatch-queue">
          <div class="panel-head">
            <div>
              <h2>队列明细</h2>
              <p>只显示正在排队、运行或堵塞的队列项；终态结果和运行文件统一进入任务进度明细。</p>
            </div>
            <span class="status-pill" :class="activeDispatchQueueRows.length ? 'warning' : 'muted'">{{ activeDispatchQueueRows.length }} 项</span>
          </div>
            <div v-if="activeDispatchQueueRows.length" class="dispatch-queue-list">
              <article v-for="item in dispatchQueueRows" :key="item.queueId || item.dispatchId || `${item.domain}-${item.actionId}`" class="dispatch-queue-row">
                <button type="button" class="dispatch-queue-row__main" @click="selectQueueItemDomain(item)">
                  <span>
                    <strong>{{ queueItemDomainLabel(item) }}</strong>
                    <em class="status-pill" :class="statusTone(queueItemStatus(item))">{{ statusLabel(queueItemStatus(item)) }}</em>
                  </span>
                  <small>{{ queueItemMessage(item) }}</small>
                  <small v-if="queueItemBlockerLabel(item)" class="dispatch-queue-row__blocker">{{ queueItemBlockerLabel(item) }}</small>
                  <code>{{ queueItemIdentityLabel(item) }}</code>
                </button>
                <div class="dispatch-queue-row__meta">
                  <span><small>通道</small><strong>{{ queueItemLaneLabel(item) }}</strong></span>
                  <span><small>位置</small><strong>{{ queueItemPositionLabel(item) }}</strong></span>
                  <span><small>动作</small><strong>{{ item.actionId || '未命名动作' }}</strong></span>
                  <span v-if="item.pid"><small>PID</small><strong>{{ item.pid }}</strong></span>
                </div>
                <button
                  v-if="canCancelQueuedItem(item)"
                  type="button"
                  class="inline-report-button inline-report-button--compact inline-report-button--danger"
                  :disabled="queueControlLoading === item.queueId"
                  @click="cancelQueuedDispatchItem(item)"
                >
                  <X :size="14" />
                  <span>{{ queueControlLoading === item.queueId ? '处理中' : '取消排队' }}</span>
                </button>
                <button
                  v-if="canCancelRunningQueueItem(item)"
                  type="button"
                  class="inline-report-button inline-report-button--compact inline-report-button--danger"
                  :disabled="queueControlLoading === item.queueId"
                  @click="cancelRunningDispatchItem(item)"
                >
                  <CircleStop :size="14" />
                  <span>{{ queueControlLoading === item.queueId ? '处理中' : '终止运行' }}</span>
                </button>
              </article>
            </div>
            <div v-else class="empty-block empty-block--compact">
              <Activity :size="20" />
              <span>尚无正在排队、运行或堵塞的队列项。</span>
            </div>
        </section>

        <section class="monitor-layout">
      <div class="monitor-main">
        <section class="section-card monitor-panel">
          <header class="section-head">
            <div>
              <h2 class="section-card__title">任务进度明细</h2>
              <p class="section-card__subtitle">汇总可操作的进度行、心跳、速度和运行文件；已完成与仅报告行不再挤占上方阶段进度。</p>
            </div>
          </header>
          <div class="table-scroll">
            <table class="monitor-table">
              <thead>
                <tr>
                  <th>任务</th>
                  <th>通道</th>
                  <th>状态</th>
                  <th>进度</th>
                  <th>待处理</th>
                  <th>速度</th>
                  <th>预计剩余</th>
                  <th>开始时间</th>
                  <th>运行时长</th>
                  <th>心跳</th>
                  <th>运行文件</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in progressDetailRowsByPriority" :key="`row-${row.rowKey}`">
                  <td>
                    <strong>{{ row.label || row.id || '未知任务' }}</strong>
                    <small>{{ row.id || safeActionFallbackLabel(row.action) }}</small>
                  </td>
                  <td>{{ progressRowLaneLabel(row) }}</td>
                  <td><span class="status-pill" :class="statusTone(rowStatus(row))">{{ statusLabel(rowStatus(row)) }}</span></td>
                  <td>
                    <strong>{{ rowProgressLabel(row) }}</strong>
                    <small v-if="row.progressKind || row.action?.phase || row.queueState">{{ [row.progressKind, row.action?.phase, row.queueState].filter(Boolean).join(' · ') }}</small>
                    <small v-if="row.progressStaleReason">{{ row.progressStaleReason }}</small>
                  </td>
                  <td>{{ rowPendingLabel(row) }}</td>
                  <td>{{ rowSpeedLabel(row) }}</td>
                  <td>{{ rowEtaLabel(row) }}</td>
                  <td>{{ formatDate(rowStartedAt(row)) }}</td>
                  <td>{{ formatElapsedDuration(taskElapsedMs(row)) }}</td>
                  <td>{{ rowHeartbeatLabel(row) }}</td>
                  <td>
                    <div v-if="progressRowPathEntries(row).length" class="progress-path-list">
                      <button
                        v-for="entry in progressRowPathEntries(row)"
                        :key="`${row.rowKey}-${entry.label}`"
                        type="button"
                        class="inline-report-button inline-report-button--compact"
                        :class="{ 'inline-report-button--not-previewable': !isPreviewableReportPath(entry.path) && !isPreviewableProgressPath(entry.path) }"
                        :disabled="!isPreviewableReportPath(entry.path) && !isPreviewableProgressPath(entry.path)"
                        :title="(!isPreviewableReportPath(entry.path) && !isPreviewableProgressPath(entry.path)) ? '此路径不支持预览' : entry.path"
                        @click="openReportPreview(entry.path)"
                      >
                        <span>{{ entry.label }}</span>
                      </button>
                    </div>
                    <span v-else>--</span>
                  </td>
                </tr>
                <tr v-if="!progressDetailRowsByPriority.length">
                  <td colspan="11" class="table-empty">暂无进度行</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

        </section>
      </section>
      </div>
      <div class="monitor-tab-panel">

      <section class="section-card monitor-panel">
        <header class="section-head">
          <div>
            <h2 class="section-card__title">质量和验收</h2>
            <p class="section-card__subtitle">数据质量、基础域 10x10、样本测试和当前域详细配置集中在这里，避免挤占主排障路径。</p>
          </div>
          <span class="status-pill" :class="dataQualityAttentionCount ? 'danger' : 'success'">
            {{ dataQualityAttentionCount ? `${dataQualityAttentionCount} 项待查` : '质量正常' }}
          </span>
        </header>

        <section class="panel data-quality-panel" aria-label="data-quality">
          <div class="panel-head">
            <div>
              <h2>数据质量核查</h2>
              <p>图片归一化异常、漏爬、关系健康与覆盖率；红色表示数据错误，黄色表示漏爬或缺检查。</p>
            </div>
            <span class="status-pill" :class="dataQualityAttentionCount ? 'danger' : 'success'">
              {{ dataQualityAttentionCount ? `${dataQualityAttentionCount} 项待查` : '全部正常' }}
            </span>
          </div>
            <div v-if="dataQualitySignals.length" class="data-quality-grid">
              <button
                v-for="sig in dataQualitySignals"
                :key="sig.key"
                type="button"
                class="data-quality-cell"
                :class="sig.tone"
                :disabled="!sig.reportPath || !isPreviewableReportPath(sig.reportPath)"
                :title="sig.reportPath || '无核查报告'"
                @click="openReportPreview(sig.reportPath)"
              >
                <small>{{ sig.label }}</small>
                <strong>{{ sig.value }}</strong>
              </button>
            </div>
            <p v-else class="empty-line">暂无数据质量信号。</p>
        </section>

        <section class="panel recovery-domain-panel">
          <div class="panel-head">
            <div>
              <h2>基础域验收</h2>
              <p>保留 10x10 样本和基础域编排；正式域实时排障以主表格和选中域抽屉为准。</p>
            </div>
            <span class="status-pill info">{{ baseDomainOrchestrationRows.length }} 个基础域</span>
          </div>
          <div class="base-domain-validation-summary">
            <strong>基础域验收</strong>
            <span>{{ baseDomainOrchestrationRows.length }} 域 · 正式域 / 样本测试双通道</span>
          </div>
            <div class="base-domain-orchestration" aria-label="基础域顺序编排">
              <div class="base-domain-orchestration__head">
                <div>
                  <strong>基础域顺序编排</strong>
                  <span>按来源检测、队列、样本爬取、清理样本、验收逐项检查；每域 10 条，可控删除，不写正式数据。</span>
                </div>
                <em>{{ baseDomainOrchestrationRows.length }} 个基础域</em>
              </div>
              <div class="base-domain-orchestration__rows">
                <article v-for="domain in baseDomainOrchestrationRows" :key="`base-domain-orchestration-${domain.id}`" class="base-domain-flow-row">
                  <button type="button" class="base-domain-flow-row__domain" @click.stop="selectWikiDomain(domain.domain)">
                    <small>#{{ domain.order }}</small>
                    <strong>{{ wikiDomainChineseName(domain.domain) }}</strong>
                    <span class="status-pill" :class="statusTone(domain.status)">{{ wikiDomainFlowLabel(domain.domain) }}</span>
                  </button>
                  <div class="base-domain-flow-steps">
                    <div v-for="step in domain.steps" :key="`${domain.id}-${step.key}`" class="base-domain-flow-step" :class="`base-domain-flow-step--${step.key}`">
                      <span class="base-domain-flow-step__label">{{ step.label }}</span>
                      <strong>{{ step.value }}</strong>
                      <small>{{ step.detail }}</small>
                      <button
                        v-if="step.key === 'sample-crawl'"
                        type="button"
                        class="inline-report-button inline-report-button--compact"
                        :disabled="step.disabled"
                        @click.stop="startBaseDomainSampleCrawl(domain)"
                      >
                        样本爬取
                      </button>
                      <button
                        v-if="step.key === 'sample-cleanup'"
                        type="button"
                        class="inline-report-button inline-report-button--compact"
                        :disabled="step.disabled"
                        @click.stop="cleanupBaseDomainSampleCrawl(domain)"
                      >
                        清理样本
                      </button>
                    </div>
                  </div>
                </article>
              </div>
            </div>
            <div class="domain-test-matrix" aria-label="10 域基础项测试">
              <div class="domain-test-matrix__head">
                <strong>10 域基础项测试</strong>
                <span>{{ wikiDomainTestMatrixRows.length }} 域 · 正式域 {{ BASIC_DOMAIN_TEST_ITEMS.length }} 项 / 样本测试 5 项</span>
              </div>
              <div class="domain-test-matrix__grid">
                <article v-for="domain in wikiDomainTestMatrixRows" :key="`domain-test-${domain.id}`" class="domain-test-card">
                  <div class="domain-test-card__head">
                    <strong>{{ domain.label }}</strong>
                    <span class="status-pill" :class="statusTone(domain.status)">{{ statusLabel(domain.status) }}</span>
                  </div>
                  <div class="domain-test-channel">
                    <strong>正式域</strong>
                    <div class="domain-test-items">
                      <span v-for="item in domain.formalItems" :key="`${domain.id}-formal-${item.label}`">
                        <small>{{ item.label }}</small>
                        <strong>{{ item.value }}</strong>
                      </span>
                    </div>
                  </div>
                  <div class="domain-test-channel">
                    <strong>样本测试</strong>
                    <div class="domain-test-items">
                      <span v-for="item in domain.sampleItems" :key="`${domain.id}-sample-${item.label}`">
                        <small>{{ item.label }}</small>
                        <strong>{{ item.value }}</strong>
                      </span>
                    </div>
                  </div>
                </article>
              </div>
            </div>
        </section>

      </section>
      </div>

      </div>
    </section>

    <section v-if="dispatchConfirmDomain" class="cancel-confirm-panel" role="dialog" aria-modal="true" aria-label="启动重爬确认">
      <div class="cancel-confirm-panel__body">
        <span class="ops-card__label">重爬确认</span>
        <h2>确认启动重爬：{{ wikiDomainChineseName(dispatchConfirmDomain) }}</h2>
        <p>该操作会启动对应 Wiki 域的真实爬取/刷新任务，不只是刷新当前页面状态。为防止误触，请先确认当前心跳、进度文件和已下载文件。</p>
        <ul>
          <li><code>动作：{{ dispatchConfirmDomain.recommendedActionId || '未配置' }}</code></li>
          <li><code>进度：{{ wikiDomainProgressPath(dispatchConfirmDomain) || '未生成' }}</code></li>
          <li><code>输出：{{ wikiDomainOutputPath(dispatchConfirmDomain) || '等待生成' }}</code></li>
        </ul>
        <div class="cancel-confirm-panel__actions">
          <button type="button" class="inline-report-button" @click="closeDispatchConfirm">暂不派发</button>
          <button
            type="button"
            class="inline-report-button inline-report-button--danger"
            :disabled="wikiDispatchLoading === dispatchConfirmDomain.domain"
            @click="confirmWikiDomainDispatch"
          >
            确认启动重爬
          </button>
        </div>
      </div>
    </section>

    <section v-if="cancelConfirmDomain" class="cancel-confirm-panel" role="dialog" aria-modal="true" aria-label="终止并清理文件确认">
      <div class="cancel-confirm-panel__body">
        <span class="ops-card__label">危险操作确认</span>
        <h2>终止并清理文件：{{ wikiDomainChineseName(cancelConfirmDomain) }}</h2>
        <p>会停止当前任务，并可能删除已经下载的临时文件、进度文件、报告文件或锁文件。确认前请核对下面的路径。</p>
        <ul v-if="cancelCleanupPaths.length">
          <li v-for="path in cancelCleanupPaths" :key="path"><code>{{ path }}</code></li>
        </ul>
        <p v-else>当前没有返回具体清理路径，但取消仍可能清理该任务的运行产物。</p>
        <div class="cancel-confirm-panel__actions">
          <button type="button" class="inline-report-button" @click="closeCancelConfirm">暂不取消</button>
          <button
            type="button"
            class="inline-report-button inline-report-button--danger"
            :disabled="wikiControlLoading === cancelConfirmDomain.domain"
            @click="confirmWikiDomainCancel"
          >
            确认终止并清理
          </button>
        </div>
      </div>
    </section>

    <section class="section-card monitor-panel system-diagnostics-inline system-diagnostics-card" aria-label="系统诊断">
        <header class="section-head">
          <div>
            <h2 class="section-card__title">系统诊断</h2>
            <p class="section-card__subtitle">10 域运行态、运行文件、派发、心跳、历史、报告与图片指标，全部平铺展开。</p>
          </div>
        </header>

        <section class="runtime-domain-index runtime-domain-index--primary" aria-label="10 域运行态">
          <div class="observability-block__head">
            <strong>10 域运行态</strong>
            <span>{{ domainRuntimeSummaryRows.length }} 域</span>
          </div>
          <div v-if="domainRuntimeSummaryRows.length" class="runtime-domain-table">
            <table>
              <thead>
                <tr>
                  <th>域</th>
                  <th>状态</th>
                  <th>判断</th>
                  <th>推荐动作</th>
                  <th>原因</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="domain in domainRuntimeSummaryRows"
                  :key="`runtime-domain-index-${domain.domain}`"
                  class="runtime-domain-row"
                  @click="selectRuntimeDomain(domain.sourceDomain)"
                >
                  <td>
                    <button type="button" class="runtime-domain-row__select" @click.stop="selectRuntimeDomain(domain.sourceDomain)">
                      {{ domain.label }}
                    </button>
                  </td>
                  <td><em class="status-pill domain-flow-pill" :class="statusTone(domain.status)">{{ domain.flowLabel }}</em></td>
                  <td>{{ domain.changeLabel }} · {{ domain.autoEligibleLabel }}</td>
                  <td><code>{{ domain.actionLabel }}</code></td>
                  <td><span class="runtime-domain-index__reason">{{ domain.reason }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="empty-line">暂无域基础信息。</p>
        </section>

        <div class="runtime-auxiliary-details">
          <div class="observability-block__head runtime-auxiliary-details__head">
            <strong>辅助运行信息</strong>
            <span>运行文件 / 派发 / 心跳 / 历史 / 报告</span>
          </div>
          <div class="observability-grid observability-grid--dialog">
            <details open class="obs-collapsible observability-block">
              <summary class="observability-block__head">
                <strong>运行文件</strong>
                <span>{{ runtimeStateCards.length }} 项</span>
              </summary>
              <div class="state-list">
                <div v-for="card in runtimeStateCards" :key="card.key" class="state-row">
                  <span>{{ card.label }}</span>
                  <strong><em class="status-pill" :class="statusTone(card.status)">{{ statusLabel(card.status) }}</em></strong>
                  <small>{{ card.detail }}</small>
                  <code>{{ card.path }}</code>
                </div>
              </div>
            </details>

            <article class="observability-block">
              <div class="observability-block__head">
                <strong>派发状态</strong>
                <span>{{ wikiPendingApprovalCount }} 待审批</span>
              </div>
              <div class="compact-metrics">
                <span><small>派发模式</small><strong>{{ wikiDispatchModeLabel }}</strong></span>
                <span><small>自动派发</small><strong>{{ wikiAutoDispatchLabel }}</strong></span>
                <span><small>待审批</small><strong>{{ wikiPendingApprovalCount }}</strong></span>
              </div>
              <div v-if="dispatchPlanRows.length" class="state-list state-list--compact">
                <div v-for="plan in dispatchPlanRows" :key="plan.actionId || plan.priority || plan.reason" class="state-row">
                  <span>派发计划</span>
                  <strong>{{ plan.actionId || '未命名动作' }}</strong>
                  <small>{{ dispatchPlanSummary(plan) }}</small>
                </div>
              </div>
              <p v-else class="empty-line">暂无派发计划</p>
            </article>

            <details open class="obs-collapsible auto-dispatch-card">
              <summary class="observability-block__head">
                <strong>自动派发设置</strong>
                <span>{{ autoDispatchForm.enabled ? '已开启' : '已关闭' }}</span>
              </summary>
              <div class="auto-dispatch-controls">
                <label class="auto-dispatch-toggle">
                  <input v-model="autoDispatchForm.enabled" type="checkbox">
                  <span>有变化时自动派发</span>
                </label>
                <label class="auto-dispatch-interval">
                  <span>扫描间隔</span>
                  <input v-model.number="autoDispatchForm.sweepIntervalMinutes" type="number" min="1" max="1440">
                  <small>分钟</small>
                </label>
                <button
                  type="button"
                  class="inline-report-button inline-report-button--compact"
                  :disabled="autoDispatchSaving"
                  @click="saveAutoDispatchSettings"
                >
                  <RefreshCw :size="14" :class="{ 'spin': autoDispatchSaving }" />
                  <span>{{ autoDispatchSaving ? '保存中' : '保存设置' }}</span>
                </button>
              </div>
              <div class="state-list state-list--compact">
                <div class="state-row">
                  <span>最近自动派发</span>
                  <strong>{{ statusLabel(lastAutoDispatchSweep?.status || 'missing') }}</strong>
                  <small>{{ autoDispatchSweepSummary }}</small>
                </div>
              </div>
            </details>

            <article class="observability-block">
              <div class="observability-block__head">
                <strong>心跳告警</strong>
                <span>{{ staleHeartbeatRows.length }} 条</span>
              </div>
              <div v-if="staleHeartbeatRows.length" class="state-list state-list--compact">
                <div v-for="heartbeat in staleHeartbeatRows" :key="heartbeatKey(heartbeat)" class="state-row">
                  <span>{{ heartbeat.label || heartbeat.id || heartbeat.domain || '心跳' }}</span>
                  <strong>{{ statusLabel(heartbeat.status || 'stalled') }}</strong>
                  <small>{{ heartbeat.reason || heartbeat.progressStaleReason || heartbeat.message || formatDate(heartbeat.lastHeartbeatAt || heartbeat.progressHeartbeatAt) }}</small>
                </div>
              </div>
              <p v-else class="empty-line">暂无心跳告警</p>
            </article>

            <details open class="obs-collapsible observability-block">
              <summary class="observability-block__head">
                <strong>运行历史</strong>
                <span>{{ historyRows.length }} 条</span>
              </summary>
              <div v-if="historyRows.length" class="state-list state-list--compact">
                <div v-for="run in historyRows" :key="run.path || run.generatedAt || run.summaryPath" class="state-row">
                  <span>{{ statusLabel(runStatus(run)) }}</span>
                  <strong>{{ formatDate(run.generatedAt || run.updatedAt) }}</strong>
                  <small>{{ runSummary(run) }}</small>
                </div>
              </div>
              <p v-else class="empty-line">暂无历史</p>
            </details>

            <details open class="obs-collapsible observability-block">
              <summary class="observability-block__head">
                <strong>报告</strong>
                <span>{{ recentReportRows.length }} 个</span>
              </summary>
              <div v-if="recentReportRows.length" class="state-list state-list--compact">
                <button
                  v-for="report in recentReportRows"
                  :key="report.path || report.name"
                  type="button"
                  class="state-row state-row--button runtime-report-row"
                  :class="{ 'inline-report-button--not-previewable': !isPreviewableReportPath(report.path) }"
                  :disabled="!isPreviewableReportPath(report.path)"
                  :title="isPreviewableReportPath(report.path) ? report.path : '此报告不支持预览'"
                  @click="openReportPreview(report.path)"
                >
                  <span>{{ report.category || '报告' }}</span>
                  <strong>{{ report.name || report.path || '未命名报告' }}</strong>
                  <small>{{ formatDate(report.updatedAt) }} · {{ formatBytes(report.sizeBytes) }}</small>
                </button>
              </div>
              <p v-else class="empty-line">暂无报告</p>
            </details>

            <details open class="obs-collapsible observability-block">
              <summary class="observability-block__head">
                <strong>图片指标</strong>
                <span>{{ imageNormalizationRows.length }} 项</span>
              </summary>
              <div v-if="imageNormalizationRows.length" class="compact-metrics">
                <span v-for="metric in imageNormalizationRows" :key="metric.label">
                  <small>{{ metric.label }}</small>
                  <strong>{{ metric.value }}</strong>
                </span>
              </div>
              <p v-else class="empty-line">暂无图片指标</p>
            </details>
          </div>
        </div>
    </section>

    <div
      v-if="selectedReportPath || reportPreview || reportPreviewError"
      class="report-preview-shell"
      @click.self="closeReportPreview"
    >
      <aside class="report-preview report-preview-drawer" role="dialog" aria-modal="true" aria-label="报告预览">
        <div class="report-preview__head">
          <div>
            <strong>{{ reportPreview?.name || selectedReportPath || '报告预览' }}</strong>
            <small>
              {{ reportPreview?.path || selectedReportPath }}
              <template v-if="reportPreview?.sizeBytes"> - {{ formatBytes(reportPreview.sizeBytes) }}</template>
            </small>
          </div>
          <button type="button" class="icon-close-button" aria-label="关闭报告预览" @click="closeReportPreview">
            <X :size="16" />
          </button>
        </div>

        <div class="report-preview__meta">
          <span class="status-pill" :class="reportTone(reportPreview?.category)">{{ reportPreview?.category || '报告' }}</span>
          <span class="status-pill" :class="reportPreview?.readable ? 'success' : reportPreviewError ? 'danger' : 'muted'">
            {{ reportPreviewStatusLabel }}
          </span>
          <span v-if="reportPreview?.truncated" class="status-pill warning">已截断 {{ formatBytes(reportPreview.maxBytes) }}</span>
        </div>

        <pre v-if="reportPreview?.readable" class="report-preview__content">{{ reportPreview.content || '' }}</pre>
        <div v-else class="report-preview__empty">
          {{ reportPreviewEmptyMessage }}
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Activity,
  AlertTriangle,
  CircleStop,
  Eye,
  FileJson,
  FileStack,
  Pause,
  Play,
  RefreshCw,
  TimerReset,
  X,
} from 'lucide-vue-next'
import { get, post, put } from '~/composables/useApi'
import { showToast } from '~/composables/useToast'
import {
  hasLiveSourceSnapshotProgress,
  progressRowsFromOverview,
  rowStatus,
  sourceSnapshotRowsFromOverview,
} from '~/utils/crawlerMonitorProgressRows.mjs'
import {
  BASE_DOMAIN_ORCHESTRATION_STEPS,
  BASIC_DOMAIN_TEST_ITEMS,
  DOMAIN_TEST_MATRIX_DOMAIN_IDS,
  buildBaseDomainOrchestrationRow,
  buildSelectedDomainValidationSummary,
  buildWikiDomainTestMatrixRow,
} from '~/utils/baseDomainOrchestration.mjs'
import { buildDataQualitySignals } from '~/utils/crawlerMonitorDataQuality.mjs'
import {
  buildDomainTableEvidence,
  buildDomainTableRows,
} from '~/utils/crawlerMonitorDomainTable.mjs'
import { buildExecutionOverviewRows, executionOverviewStatus } from '~/utils/crawlerMonitorExecutionOverview.mjs'
import {
  crawlerStatusChineseLabel,
  wikiCooldownExplanation,
  wikiDomainChineseName,
  wikiHeartbeatSummary,
} from '~/utils/crawlerMonitorDisplay.mjs'
import type {
  CrawlerMonitorAction,
  CrawlerMonitorAutoDispatchSettings,
  CrawlerMonitorDispatchResult,
  CrawlerMonitorOverview,
  CrawlerMonitorRegisteredTask,
  CrawlerMonitorReportDetail,
  CrawlerMonitorRun,
  CrawlerMonitorWikiDispatch,
  CrawlerMonitorWikiDomain,
  CrawlerMonitorWikiQueueItem,
} from '~/types/crawlerMonitor'

definePageMeta({ title: '爬取监控', navSection: '/operations/crawler-monitor', headerVariant: 'compact' })

type ProgressRow = CrawlerMonitorRegisteredTask & {
  rowKey: string
  action?: CrawlerMonitorAction | null
  sourceQueueItem?: CrawlerMonitorWikiQueueItem | null
}

const overview = ref<CrawlerMonitorOverview | null>(null)
const loading = ref(false)
const autoRefresh = ref(true)
const selectedReportPath = ref<string | null>(null)
const reportPreview = ref<CrawlerMonitorReportDetail | null>(null)
const reportPreviewLoading = ref(false)
const reportPreviewError = ref('')
const lastOverviewRefreshAt = ref<string | null>(null)
const wikiDispatchLoading = ref('')
const wikiControlLoading = ref('')
const progressControlLoading = ref('')
const queueControlLoading = ref('')
const autoDispatchSaving = ref(false)
const autoDispatchForm = reactive<CrawlerMonitorAutoDispatchSettings>({
  enabled: false,
  mode: 'changed-only',
  sweepIntervalMinutes: 60,
})
const hiddenNoiseKeys = ref<Set<string>>(new Set())
const selectedWikiDomainKey = ref('')
const selectedDomainTableKey = ref('')
const hasAutoSelectedDomain = ref(false)
const latestDispatchResult = ref<CrawlerMonitorDispatchResult | null>(null)
const commandPreviewDomainKey = ref('')
const cancelConfirmDomainKey = ref('')
const dispatchConfirmDomainKey = ref('')
let refreshTimer: ReturnType<typeof setInterval> | null = null
const refreshFailureStreak = ref(0)
const authRefreshHalted = ref(false)

async function fetchCrawlerMonitorOverview() {
  const response: any = await get('/admin/crawler-monitor/overview')
  return (response?.data ?? response) || null
}

const {
  data: initialOverview,
  pending: initialOverviewPending,
  refresh: refreshOverview,
} = await useAsyncData<CrawlerMonitorOverview | null>(
  'crawler-monitor-overview',
  fetchCrawlerMonitorOverview,
  { default: () => null }
)

overview.value = initialOverview.value
loading.value = Boolean(initialOverviewPending.value)
if (initialOverview.value) {
  lastOverviewRefreshAt.value = new Date().toISOString()
}

const wikiMonitor = computed(() => overview.value?.wikiMonitor || null)
const wikiDomainRows = computed<CrawlerMonitorWikiDomain[]>(() => Array.isArray(wikiMonitor.value?.domains) ? wikiMonitor.value!.domains! : [])
const wikiDomainTestMatrixRows = computed(() => DOMAIN_TEST_MATRIX_DOMAIN_IDS.map((domainId) => {
  const domain = wikiDomainRows.value.find((row) => row.domain === domainId) || { domain: domainId, label: domainId }
  const progress = wikiDomainProgressRow(domain)
  const smokeRow = smokeRowForDomain(domainId)
  return buildWikiDomainTestMatrixRow({
    id: domainId,
    label: wikiDomainChineseName(domain),
    status: wikiDomainFlowStatus(domain),
    sourceValue: domain.currentValue || domain.previousValue || '未记录',
    previousValue: domain.previousValue,
    changed: domain.changed,
    recommendedActionId: domain.recommendedActionId,
    progressPath: wikiDomainProgressPath(domain),
    heartbeatLabel: wikiDomainHeartbeatLabel(domain),
    flowLabel: wikiDomainFlowLabel(domain),
    coolingDown: isWikiDomainCoolingDown(domain),
    cooldownMinutes: domain.cooldownMinutes,
    outputPath: wikiDomainOutputPath(domain) || progress?.outputPath || '',
    reportPath: wikiDomainReportPath(domain),
    canExecute: canExecuteWikiDomain(domain),
    sampleStatusLabel: smokeRow ? statusLabel(rowStatus(smokeRow)) : '未运行样本',
    sampleHeartbeatLabel: smokeRow ? rowHeartbeatLabel(smokeRow) : '未运行样本',
    sampleProgressPath: smokeRow ? rowSourcePath(smokeRow) || '' : '',
    sampleCleanupLabel: '可控删除',
  })
}))
const baseDomainOrchestrationRows = computed(() => DOMAIN_TEST_MATRIX_DOMAIN_IDS.map((domainId, index) => {
  const domain = wikiDomainRows.value.find((row) => row.domain === domainId) || { domain: domainId, label: domainId }
  const progress = wikiDomainProgressRow(domain)
  return buildBaseDomainOrchestrationRow({
    id: domainId,
    order: index + 1,
    domain,
    flowStatus: wikiDomainFlowStatus(domain),
    queueRow: baseDomainQueueRow(domain),
    queuePending: pendingWikiDispatches.value.some((dispatch) => dispatch.domain === domain.domain),
    smokeRow: domainSmokeProgressRow.value,
    progress,
    outputPath: wikiDomainOutputPath(domain) || progress?.outputPath || '',
    reportPath: wikiDomainReportPath(domain) || progress?.reportPath || '',
    progressPath: wikiDomainProgressPath(domain),
    sampleCrawlLoading: wikiDispatchLoading.value === 'wiki-monitor-domain-smoke',
    sampleCleanupLoading: wikiDispatchLoading.value === 'wiki-monitor-domain-smoke-cleanup',
    statusLabel,
  })
}))
const visibleWikiDomainRows = computed(() => wikiDomainRows.value.filter((domain) => !isNoiseHidden(noiseKey('wiki-domain', domain.domain || domain.label))))
const pendingWikiDispatches = computed<CrawlerMonitorWikiDispatch[]>(() =>
  Array.isArray(wikiMonitor.value?.pendingDispatches) ? wikiMonitor.value!.pendingDispatches! : []
)
const latestRun = computed<CrawlerMonitorRun>(() => overview.value?.latestRun || {})
const actions = computed<CrawlerMonitorAction[]>(() => Array.isArray(latestRun.value.actions) ? latestRun.value.actions : [])
const registeredTasks = computed<CrawlerMonitorRegisteredTask[]>(() => Array.isArray(overview.value?.registeredTasks) ? overview.value!.registeredTasks! : [])
const progressRows = computed<ProgressRow[]>(() => progressRowsFromOverview(overview.value))
const domainSmokeProgressRow = computed<ProgressRow | null>(() => progressRows.value.find((row) => row.id === 'wiki-monitor-domain-smoke') || null)
const executionOverviewRows = computed(() => buildExecutionOverviewRows(overview.value || {}))
const executionOverviewStatusLabel = computed(() => executionOverviewStatus(executionOverviewRows.value))
const sourceSnapshotRows = computed<ProgressRow[]>(() => sourceSnapshotRowsFromOverview(overview.value))
const liveSourceSnapshotActive = computed(() => hasLiveSourceSnapshotProgress(overview.value))
const visibleProgressRows = computed<ProgressRow[]>(() => progressRows.value
  .filter(isActiveProgressRow)
  .filter(isOperationalProgressRow)
  .filter((row) => !isDomainSmokeAggregateRow(row))
  .filter((row) => isDomainSmokeProgressRow(row) || rowStatus(row) !== 'completed')
  .filter((row) => isDomainSmokeProgressRow(row) || rowStatus(row) !== 'report-only')
  .filter((row) => !isNoiseHidden(noiseKey('progress', row.rowKey || row.id || row.label)))
)
const rawDispatchQueueRows = computed<CrawlerMonitorWikiQueueItem[]>(() => {
  const rows = Array.isArray(wikiMonitor.value?.dispatchQueue) ? wikiMonitor.value!.dispatchQueue! : []
  return [...rows]
})
const activeDispatchQueueRows = computed<CrawlerMonitorWikiQueueItem[]>(() =>
  rawDispatchQueueRows.value.filter((item) => !isTerminalQueueItem(item)).sort(compareQueueItems)
)
const dispatchQueueHistoryRows = computed<CrawlerMonitorWikiQueueItem[]>(() =>
  rawDispatchQueueRows.value.filter((item) => isTerminalQueueItem(item)).sort(compareQueueItems)
)
const progressDetailRows = computed<ProgressRow[]>(() => progressRows.value
  .filter(isSignalTask)
  .filter((row) => !isAnyDomainSmokeProgressRow(row))
  .filter((row) => !isNoiseHidden(noiseKey('progress', row.rowKey || row.id || row.label)))
  .concat(dispatchQueueHistoryRows.value.map((item) => queueItemAsProgressRow(item)))
)
const visibleProgressRowsByPriority = computed<ProgressRow[]>(() => sortRowsByPriority(visibleProgressRows.value))
const progressDetailRowsByPriority = computed<ProgressRow[]>(() => sortRowsByPriority(progressDetailRows.value))
const dispatchQueueRows = computed<CrawlerMonitorWikiQueueItem[]>(() => activeDispatchQueueRows.value)
const visibleWikiDomainRowsByPriority = computed<CrawlerMonitorWikiDomain[]>(() => sortWikiDomainsByPriority(visibleWikiDomainRows.value))
const runtimeStateCards = computed(() => [
  runtimeStateCard('daemon', '守护', overview.value?.daemon),
  runtimeStateCard('scheduler', '调度', overview.value?.scheduler),
  runtimeStateCard('lock', '锁', overview.value?.lock),
])
const healthSignals = computed(() => {
  const signals: Array<{key: string, label: string, tone: string, detail: string}> = []
  for (const card of runtimeStateCards.value) {
    signals.push({
      key: card.key,
      label: card.label,
      tone: statusTone(card.status),
      detail: card.detail,
    })
  }
  if (refreshStale.value) {
    signals.push({
      key: 'refresh',
      label: '刷新停滞',
      tone: 'warning',
      detail: overview.value?.refreshStaleReason || '最近无 refresh 活动',
    })
  }
  const heartbeatCount = staleHeartbeatRows.value.length
  if (heartbeatCount > 0) {
    signals.push({
      key: 'heartbeat',
      label: `心跳告警 ${heartbeatCount}`,
      tone: 'danger',
      detail: '有任务心跳超时',
    })
  }
  return signals
})
const overviewWithPlanBFields = computed<any>(() => overview.value || {})
const wikiMonitorWithPlanBFields = computed<any>(() => wikiMonitor.value || {})
const lastAutoDispatchSweep = computed(() => wikiMonitor.value?.lastSweep || null)
const staleHeartbeatRows = computed<any[]>(() => Array.isArray(overview.value?.staleHeartbeats || overviewWithPlanBFields.value.staleHeartbeats) ? (overview.value?.staleHeartbeats || overviewWithPlanBFields.value.staleHeartbeats) : [])
const historyRows = computed<any[]>(() => Array.isArray(overview.value?.history) ? overview.value!.history!.slice(0, 5) : [])
const recentReportRows = computed<any[]>(() => Array.isArray(overview.value?.recentReports) ? overview.value!.recentReports!.slice(0, 5) : [])
const imageNormalizationRows = computed(() => imageNormalizationMetricRows(overview.value?.imageNormalization))
const dataQualitySignals = computed(() => buildDataQualitySignals(overview.value || {}))
const dataQualityAttentionCount = computed(() =>
  dataQualitySignals.value.filter((signal) => ['danger', 'warning'].includes(String(signal.tone || ''))).length)
const dispatchPlanRows = computed<any[]>(() => Array.isArray(wikiMonitor.value?.dispatchPlan || wikiMonitorWithPlanBFields.value.dispatchPlan) ? (wikiMonitor.value?.dispatchPlan || wikiMonitorWithPlanBFields.value.dispatchPlan) : [])
const wikiDispatchModeLabel = computed(() => statusLabel(wikiMonitor.value?.dispatchMode || 'manual'))
const wikiAutoDispatchLabel = computed(() => wikiMonitor.value?.autoDispatchEnabled ? '已开启' : '已关闭')
const domainRuntimeSummaryRows = computed(() => wikiDomainRows.value
  .map((domain) => domainRuntimeSummaryRow(domain))
  .sort((left, right) => domainRuntimeSummaryRank(left) - domainRuntimeSummaryRank(right) || left.label.localeCompare(right.label, 'zh-CN')))
const autoDispatchSweepSummary = computed(() => {
  const sweep = lastAutoDispatchSweep.value
  if (!sweep) return '暂无自动扫描记录'
  const detected = Array.isArray(sweep.detected) ? sweep.detected.length : 0
  const dispatched = Array.isArray(sweep.dispatched) ? sweep.dispatched.length : 0
  const skipped = Array.isArray(sweep.skipped) ? sweep.skipped.length : 0
  return `${formatDate(sweep.checkedAt)} · 检测 ${detected} · 派发 ${dispatched} · 跳过 ${skipped}`
})
const wikiPendingApprovalCount = computed(() => formatNumber(wikiMonitor.value?.summary?.pendingApprovalCount ?? pendingWikiDispatches.value.length))
const runtimeDialogSummaryCards = computed(() => [
  {
    key: 'files',
    label: '运行文件',
    value: `${runtimeStateCards.value.length} 项`,
    detail: runtimeStateCards.value.map((card) => `${card.label}:${statusLabel(card.status)}`).join(' / ') || '暂无文件状态',
  },
  {
    key: 'dispatch',
    label: '派发',
    value: wikiAutoDispatchLabel.value,
    detail: `${wikiDispatchModeLabel.value} · ${wikiPendingApprovalCount.value} 待审批`,
  },
  {
    key: 'heartbeat',
    label: '心跳告警',
    value: formatNumber(staleHeartbeatRows.value.length),
    detail: staleHeartbeatRows.value.length ? '有任务心跳超时' : '暂无心跳告警',
  },
  {
    key: 'reports',
    label: '报告/历史',
    value: `${formatNumber(recentReportRows.value.length)} / ${formatNumber(historyRows.value.length)}`,
    detail: autoDispatchSweepSummary.value,
  },
])
const liveProgressActive = computed(() => progressRows.value.some((row) => ['running', 'stalled'].includes(rowStatus(row))))
const activeRefreshIntervalMs = computed(() => liveProgressActive.value ? 3000 : 10000)
const effectiveRefreshIntervalMs = computed(() => {
  const base = activeRefreshIntervalMs.value
  if (refreshFailureStreak.value <= 0) return base
  const factor = Math.min(2 ** refreshFailureStreak.value, 16)
  return Math.min(base * factor, 60000)
})
const refreshStale = computed(() => Boolean(overview.value?.refreshStale))
const domainTableRows = computed(() => buildDomainTableRows({
  domains: visibleWikiDomainRows.value,
  progressRows: progressRows.value,
  dispatchQueue: dispatchQueueRows.value,
}))
const selectedDomainTableRow = computed(() => {
  const rows = domainTableRows.value
  if (!rows.length) return null
  const selected = rows.find((row) => selectedDomainTableRowKey(row) === selectedDomainTableKey.value)
  return selected || rows[0]
})
const selectedDomainTableEvidence = computed(() => buildDomainTableEvidence(selectedDomainTableRow.value))

const selectedWikiDomain = computed<CrawlerMonitorWikiDomain | null>(() => {
  const tableRow = selectedDomainTableRow.value
  if (tableRow && !tableRow.sourceDomain) return null
  const rows = visibleWikiDomainRowsByPriority.value
  if (!rows.length) return null
  const selected = rows.find((domain) => wikiDomainKey(domain) === selectedWikiDomainKey.value)
  return selected || tableRow?.sourceDomain || rows[0] || null
})
const selectedWikiProgressRow = computed<ProgressRow | null>(() => {
  if (selectedDomainTableRow.value?.progressRow) return selectedDomainTableRow.value.progressRow
  return selectedWikiDomain.value ? wikiDomainProgressRow(selectedWikiDomain.value) : null
})
const selectedDomainSmokeRow = computed<ProgressRow | null>(() => {
  const domain = selectedWikiDomain.value?.domain
  return domain ? smokeRowForDomain(domain) : null
})
const selectedWikiProgressPath = computed(() => selectedWikiProgressRow.value
  ? rowSourcePath(selectedWikiProgressRow.value)
  : selectedDomainTableRow.value?.queueItem?.progressPath || selectedWikiDomain.value?.progressPath || ''
)
const selectedWikiReportPath = computed(() => selectedWikiProgressRow.value?.reportPath || selectedDomainTableRow.value?.queueItem?.reportPath || '')
const selectedWikiOutputPath = computed(() => selectedWikiProgressRow.value?.outputPath || selectedWikiProgressRow.value?.progressPayload?.outputPath || selectedDomainTableRow.value?.queueItem?.outputPath || '')
const selectedWikiProgressNumbers = computed(() => rowProgressNumbers(selectedWikiProgressRow.value))
const selectedWikiUpdatedAtLabel = computed(() => rowUpdatedAtLabel(selectedWikiProgressRow.value))
const reportPreviewStatusLabel = computed(() => {
  if (reportPreviewLoading.value) return '加载中'
  if (reportPreview.value?.readable) return '可读'
  const message = reportPreview.value?.errorMessage || reportPreviewError.value
  if (isMissingReportError(message)) return '报告未找到'
  if (message) return '读取错误'
  return '待处理'
})
const reportPreviewEmptyMessage = computed(() => {
  if (reportPreviewLoading.value) return '正在加载报告预览...'
  const message = reportPreview.value?.errorMessage || reportPreviewError.value
  if (isMissingReportError(message)) return `报告未找到：${message}。请先确认任务是否已生成报告，或复制路径在本地检查。`
  if (message) return `报告读取失败：${message}。请复制路径在本地检查，或确认该路径是否允许预览。`
  return '未加载报告内容。'
})
const selectedWikiPathSummary = computed(() => {
  const parts = [
    selectedWikiProgressPath.value ? `进度 ${selectedWikiProgressPath.value}` : '',
    selectedWikiReportPath.value ? `报告 ${selectedWikiReportPath.value}` : '',
    selectedWikiOutputPath.value ? `爬取文件 ${selectedWikiOutputPath.value}` : '',
  ].filter(Boolean)
  return parts.join(' / ') || '未生成进度或报告文件'
})
const selectedDomainDisplayName = computed(() => selectedWikiDomain.value ? wikiDomainChineseName(selectedWikiDomain.value) : selectedDomainTableRow.value?.label || '暂无可选任务')
const selectedDomainStatusLabel = computed(() => selectedWikiDomain.value ? crawlerStatusChineseLabel(wikiDomainFlowStatus(selectedWikiDomain.value)) : statusLabel(selectedDomainTableRow.value?.status || 'unknown'))
const selectedDomainCooldownExplanation = computed(() => selectedWikiDomain.value && isWikiDomainCoolingDown(selectedWikiDomain.value) ? wikiCooldownExplanation(selectedWikiDomain.value) : '')
const selectedDomainHeartbeatRaw = computed(() => wikiHeartbeatSummary(selectedWikiProgressRow.value))
const selectedDomainHeartbeatMessage = computed(() => {
  const summary = selectedDomainHeartbeatRaw.value
  if (!summary.time) return summary.message
  const localTime = formatDate(summary.time)
  return summary.age ? `最后心跳：${localTime}（${summary.age}）` : `最后心跳：${localTime}`
})
const selectedDomainHeartbeatState = computed(() => selectedDomainHeartbeatRaw.value.state)
const selectedDomainStartedAtLabel = computed(() => formatDate(rowStartedAt(selectedWikiProgressRow.value)))
const selectedDomainElapsedLabel = computed(() => formatElapsedDuration(taskElapsedMs(selectedWikiProgressRow.value)))
const selectedDomainNextActionLabel = computed(() => {
  const domain = selectedWikiDomain.value
  if (!domain) return selectedDomainTableRow.value?.nextActionLabel || '查看任务'
  if (canRetryWikiDomain(domain)) return '手动重新重爬'
  if (canResumeWikiDomain(domain)) return '继续任务'
  if (canPauseWikiDomain(domain)) return '暂停任务'
  if (canExecuteWikiDomain(domain)) return '启动重爬'
  if (isWikiDomainCoolingDown(domain)) return '等待冷却'
  return '暂不可执行'
})
const selectedWikiReCrawlButtonLabel = computed(() => {
  const domain = selectedWikiDomain.value
  if (!domain) return '不能重爬'
  if (wikiDispatchLoading.value === domain.domain) return '启动中'
  if (canRetryWikiDomain(domain)) return '重新重爬'
  if (!canExecuteWikiDomain(domain)) return '不能重爬'
  return '启动重爬'
})
const selectedDomainOperatorSummary = computed(() => {
  const domain = selectedWikiDomain.value
  if (!domain) {
    const row = selectedDomainTableRow.value
    if (!row) return '请选择一条任务查看详情。'
    const blocker = row.blockerIdentity || row.blockerLabel || ''
    return `${row.label || row.domain || row.actionId || '未归属任务'} 当前${statusLabel(row.status)}，${row.rankReason || row.reason || '查看队列和证据'}${blocker ? `；阻塞者：${blocker}` : ''}。`
  }
  const reason = selectedWikiActionDisabledReason.value
  if (reason) return `${selectedDomainDisplayName.value} 当前${selectedDomainStatusLabel.value}，${reason}。${selectedDomainHeartbeatMessage.value}。`
  return `${selectedDomainDisplayName.value} 当前${selectedDomainStatusLabel.value}，可以执行：${selectedDomainNextActionLabel.value}。${selectedDomainHeartbeatMessage.value}。`
})
const selectedWikiRecoveryTitle = computed(() => selectedWikiDomain.value ? wikiDomainRecoveryTitle(selectedWikiDomain.value) : selectedDomainTableRow.value?.diagnosisTitle || '任务详情')
const selectedWikiRecoveryCopy = computed(() => selectedWikiDomain.value ? wikiDomainRecoveryCopy(selectedWikiDomain.value) : selectedDomainTableRow.value?.reason || selectedDomainTableRow.value?.rankReason || '当前任务没有绑定正式域，请优先查看 queueId、阻塞者、日志和进度文件。')
const selectedWikiOperationHint = computed(() => selectedWikiDomain.value ? wikiDomainOperationHint(selectedWikiDomain.value) : selectedDomainTableRow.value?.rankReason || '未归属任务只能通过队列控制或证据文件排查。')
const selectedWikiDomainProgressCopy = computed(() => {
  const domain = selectedWikiDomain.value
  if (!domain) {
    const row = selectedDomainTableRow.value
    const source = selectedWikiProgressPath.value || row?.queueItem?.progressPath || '未生成进度文件'
    return `${row?.diagnosisTitle || statusLabel(row?.status)}；${row?.queueSummary || '无队列'}；进度来源 ${source}。`
  }
  const row = selectedWikiProgressRow.value
  const source = selectedWikiProgressPath.value || domain.progressPath || '未生成进度文件'
  return `${wikiDomainFlowLabel(domain)}；${wikiDomainHeartbeatLabel(domain)}；进度来源 ${source}。`
})
const selectedWikiDomainDetailCopy = computed(() => {
  const domain = selectedWikiDomain.value
  if (!domain) return '暂无详情。'
  const current = domain.currentValue || '未记录'
  const previous = domain.previousValue || '未记录'
  return `${domain.locator || domain.sourceKey || domain.domain || '当前域'} 当前值 ${current}，上次值 ${previous}。${wikiDomainRecoveryCopy(domain)}`
})
const selectedDomainValidationSummary = computed(() => {
  const domain = selectedWikiDomain.value
  if (!domain?.domain) return null
  const matrixRow = wikiDomainTestMatrixRows.value.find((row) => row.id === domain.domain)
  if (!matrixRow) return null
  return buildSelectedDomainValidationSummary(matrixRow)
})
const selectedWikiActionDisabledReason = computed(() => selectedWikiDomain.value ? wikiDomainDisabledReason(selectedWikiDomain.value) : '暂无可操作域')
const selectedWikiCanExecute = computed(() => Boolean(selectedWikiDomain.value && canExecuteWikiDomain(selectedWikiDomain.value)))
const selectedWikiCommandOpen = computed(() => Boolean(selectedWikiDomain.value && commandPreviewDomainKey.value === wikiDomainKey(selectedWikiDomain.value)))
const latestDispatchBelongsToSelected = computed(() => {
  const selected = selectedWikiDomain.value
  const result = latestDispatchResult.value
  if (!selected || !result) return false
  if (selected.domain && result.domain) return selected.domain === result.domain
  const selectedProgressPath = selectedWikiProgressPath.value
  if (selectedProgressPath && result.progressPath) return selectedProgressPath === result.progressPath
  if (selected.recommendedActionId && result.actionId) return selected.recommendedActionId === result.actionId
  return false
})
const latestDispatchMatchedDomain = computed(() => {
  const result = latestDispatchResult.value
  if (!result) return null
  return visibleWikiDomainRows.value.find((domain) => {
    const row = wikiDomainProgressRow(domain)
    const progressPath = row ? rowSourcePath(row) : domain.progressPath || ''
    if (domain.domain && result.domain && domain.domain === result.domain) return true
    if (progressPath && result.progressPath && progressPath === result.progressPath) return true
    return Boolean(domain.recommendedActionId && result.actionId && domain.recommendedActionId === result.actionId)
  }) || null
})
const cancelConfirmDomain = computed(() => {
  if (!cancelConfirmDomainKey.value) return null
  return visibleWikiDomainRows.value.find((domain) => wikiDomainKey(domain) === cancelConfirmDomainKey.value) || null
})
const dispatchConfirmDomain = computed(() => {
  if (!dispatchConfirmDomainKey.value) return null
  return visibleWikiDomainRows.value.find((domain) => wikiDomainKey(domain) === dispatchConfirmDomainKey.value) || null
})
const matchingPendingDispatch = computed(() => {
  const domain = cancelConfirmDomain.value
  if (!domain) return null
  const key = wikiDomainKey(domain)
  return pendingWikiDispatches.value.find((dispatch) => {
    if (dispatch.domain && dispatch.domain === domain.domain) return true
    if (dispatch.actionId && dispatch.actionId === domain.recommendedActionId) return true
    const row = wikiDomainProgressRow(domain)
    const progressPath = row ? rowSourcePath(row) : domain.progressPath
    if (dispatch.progressPath && dispatch.progressPath === progressPath) return true
    return wikiDomainKey({ domain: dispatch.domain || '', label: dispatch.domain || '' }) === key
  }) || null
})
const cancelCleanupPaths = computed(() => {
  const domain = cancelConfirmDomain.value
  if (!domain) return []
  const row = wikiDomainProgressRow(domain)
  const pending = matchingPendingDispatch.value
  const latest = latestDispatchBelongsToSelected.value ? latestDispatchResult.value : null
  const values = [
    row ? rowSourcePath(row) : domain.progressPath,
    row?.reportPath,
    pending?.progressPath,
    pending?.reportPath,
    pending?.lockPath,
    latest?.progressPath,
    latest?.reportPath,
    latest?.lockPath,
  ]
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
})

watch(domainTableRows, (rows) => {
  if (!rows.length) {
    selectedDomainTableKey.value = ''
    selectedWikiDomainKey.value = ''
    return
  }
  const firstRow = rows[0]
  if (!firstRow) return
  if (!rows.some((row) => selectedDomainTableRowKey(row) === selectedDomainTableKey.value)) {
    selectedDomainTableKey.value = selectedDomainTableRowKey(firstRow)
  }
  if (!rows.some((row) => wikiDomainKey(row.sourceDomain) === selectedWikiDomainKey.value)) {
    const firstDomain = firstRow.sourceDomain as CrawlerMonitorWikiDomain | null | undefined
    selectedWikiDomainKey.value = wikiDomainKey(firstDomain)
  }
}, { immediate: true })

watch(() => wikiMonitor.value?.autoDispatchSettings, (settings) => {
  autoDispatchForm.enabled = Boolean(settings?.enabled)
  autoDispatchForm.mode = settings?.mode || 'changed-only'
  autoDispatchForm.sweepIntervalMinutes = Math.max(1, Number(settings?.sweepIntervalMinutes || 60))
}, { immediate: true })

onMounted(async () => {
  if (!overview.value) {
    await refreshOverview()
    overview.value = initialOverview.value
    if (overview.value) {
      lastOverviewRefreshAt.value = new Date().toISOString()
    }
  }
  syncAutoRefresh()
  if (import.meta.client) {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }
})

onUnmounted(() => {
  clearRefreshTimer()
  if (import.meta.client) {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
})

watch(autoRefresh, () => {
  syncAutoRefresh()
})

watch(effectiveRefreshIntervalMs, () => {
  syncAutoRefresh()
})

async function loadOverview() {
  loading.value = true
  try {
    await refreshOverview()
    overview.value = initialOverview.value
    lastOverviewRefreshAt.value = new Date().toISOString()
    refreshFailureStreak.value = 0
    authRefreshHalted.value = false
  } catch (error: any) {
    console.error('Failed to load crawler monitor overview:', error)
    const statusCode = Number(error?.statusCode ?? error?.response?.status ?? error?.data?.statusCode ?? 0)
    if (statusCode === 401 || statusCode === 403) {
      authRefreshHalted.value = true
      autoRefresh.value = false
      clearRefreshTimer()
      showToast('登录已失效或无访问权限，已停止自动刷新，请重新登录', 'error')
      return
    }
    refreshFailureStreak.value = Math.min(refreshFailureStreak.value + 1, 6)
    showToast(error?.data?.message || error?.message || '加载爬取监控失败', 'error')
  } finally {
    loading.value = false
  }
}

async function saveAutoDispatchSettings() {
  autoDispatchSaving.value = true
  try {
    const payload = {
      enabled: Boolean(autoDispatchForm.enabled),
      mode: 'changed-only',
      sweepIntervalMinutes: Math.max(1, Number(autoDispatchForm.sweepIntervalMinutes || 60)),
    }
    const response: any = await put('/admin/crawler-monitor/auto-dispatch', payload)
    const saved = (response?.data ?? response) || payload
    autoDispatchForm.enabled = Boolean(saved.enabled)
    autoDispatchForm.mode = saved.mode || 'changed-only'
    autoDispatchForm.sweepIntervalMinutes = Math.max(1, Number(saved.sweepIntervalMinutes || payload.sweepIntervalMinutes))
    showToast('自动派发设置已保存', 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '保存自动派发设置失败', 'error')
  } finally {
    autoDispatchSaving.value = false
  }
}

async function openReportPreview(path?: string | null) {
  if (!isPreviewableReportPath(path) && !isPreviewableProgressPath(path) && !isPreviewableGeneratedJsonPath(path)) return
  selectedReportPath.value = path || null
  reportPreviewLoading.value = true
  reportPreviewError.value = ''
  try {
    const response: any = await get('/admin/crawler-monitor/report', { path })
    reportPreview.value = (response?.data ?? response) || null
    if (reportPreview.value?.errorMessage) {
      reportPreviewError.value = reportPreview.value.errorMessage
    }
  } catch (error: any) {
    console.error('Failed to load crawler monitor report preview:', error)
    reportPreview.value = null
    reportPreviewError.value = error?.data?.message || error?.message || '加载报告预览失败'
    showToast(reportPreviewError.value, 'error')
  } finally {
    reportPreviewLoading.value = false
  }
}

function closeSelectedDomainDrawer() {
  selectedDomainTableKey.value = ''
  selectedWikiDomainKey.value = ''
  hasAutoSelectedDomain.value = true
}

function wikiDomainKey(domain: CrawlerMonitorWikiDomain | null | undefined) {
  return String(domain?.domain || domain?.label || '').trim()
}

function selectWikiDomain(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain) return
  selectedWikiDomainKey.value = wikiDomainKey(domain)
  const domainKeyValue = domain.domain || wikiDomainKey(domain)
  const matchedRow = domainTableRows.value.find((row) => row.domain === domainKeyValue || wikiDomainKey(row.sourceDomain) === domainKeyValue)
  selectedDomainTableKey.value = matchedRow ? selectedDomainTableRowKey(matchedRow) : `domain:${domainKeyValue}`
  hasAutoSelectedDomain.value = true
}

function selectDomainTableRow(row: any) {
  if (!row) return
  selectedDomainTableKey.value = selectedDomainTableRowKey(row)
  if (row.sourceDomain) {
    selectedWikiDomainKey.value = wikiDomainKey(row.sourceDomain)
  }
  hasAutoSelectedDomain.value = true
}

function selectedDomainTableRowKey(row: any) {
  return [
    row?.queueId ? `queue:${row.queueId}` : '',
    row?.dispatchId ? `dispatch:${row.dispatchId}` : '',
    row?.domain ? `domain:${row.domain}` : '',
    row?.actionId ? `action:${row.actionId}` : '',
  ].find(Boolean) || 'domain-table-row:unknown'
}

function selectRuntimeDomain(domain: CrawlerMonitorWikiDomain | null | undefined) {
  selectWikiDomain(domain)
}

// 首屏默认选中最严重的域，使内联排障面板默认展示（对齐设计稿）
watch(
  domainTableRows,
  (rows) => {
    if (!hasAutoSelectedDomain.value && !selectedDomainTableKey.value && rows.length) {
      selectedDomainTableKey.value = selectedDomainTableRowKey(rows[0])
      hasAutoSelectedDomain.value = true
    }
  },
  { immediate: true },
)

function canExecuteWikiDomain(domain: CrawlerMonitorWikiDomain) {
  return !wikiDomainDisabledReason(domain)
}

function canExecuteWikiDispatch(dispatch: CrawlerMonitorWikiDispatch) {
  return !wikiDispatchDisabledReason(dispatch)
}

function canPauseWikiDomain(domain: CrawlerMonitorWikiDomain) {
  return wikiDomainControlStatus(domain) === 'running'
}

function canResumeWikiDomain(domain: CrawlerMonitorWikiDomain) {
  return wikiDomainControlStatus(domain) === 'paused'
}

function canCancelWikiDomain(domain: CrawlerMonitorWikiDomain) {
  return ['starting', 'running', 'paused', 'stalled', 'blocked_cooldown', 'queued'].includes(wikiDomainControlStatus(domain))
}

function canRetryWikiDomain(domain: CrawlerMonitorWikiDomain) {
  return wikiDomainFlowStatus(domain) === 'failed' && Boolean(domain.recommendedActionId)
}

function activeQueueControlStatuses() {
  return ['queued', 'starting', 'running', 'blocked_cooldown']
}

function wikiDomainControlStatus(domain: CrawlerMonitorWikiDomain) {
  const activeQueueStatus = queueItemStatus(activeQueueItemForDomain(domain))
  if (activeQueueControlStatuses().includes(activeQueueStatus)) return activeQueueStatus
  return String(wikiDomainProgressRow(domain)?.status || domain.status || '').toLowerCase()
}

function wikiDomainFlowStatus(domain: CrawlerMonitorWikiDomain) {
  if (wikiDispatchLoading.value === domain.domain) return 'running'
  const activeQueueStatus = queueItemStatus(activeQueueItemForDomain(domain))
  if (activeQueueControlStatuses().includes(activeQueueStatus)) return activeQueueStatus
  const row = wikiDomainProgressRow(domain)
  const status = String(rowStatus(row) || domain.status || '').toLowerCase()
  if (['failed', 'error', 'stalled', 'paused', 'running', 'blocked', 'completed', 'cancelled'].includes(status)) return status
  if (domain.changed && domain.requiresApproval) return 'pending'
  if (domain.recommendedActionId) return 'ready'
  return status || 'missing'
}

function wikiDomainFlowLabel(domain: CrawlerMonitorWikiDomain) {
  const status = wikiDomainFlowStatus(domain)
  if (status === 'running') return wikiDispatchLoading.value === domain.domain ? '启动中' : '运行中'
  if (status === 'stalled') return '心跳过期'
  if (status === 'failed' || status === 'error') return '需人工重派'
  if (status === 'paused') return '已暂停'
  if (status === 'cancelled') return '已取消'
  if (status === 'pending') return '待确认'
  if (status === 'ready') return '可手动执行'
  if (status === 'completed') return '已完成'
  if (status === 'blocked') return '已阻断'
  if (status === 'missing') return '缺失'
  return statusLabel(status)
}

function wikiDomainHeartbeatStatus(domain: CrawlerMonitorWikiDomain) {
  const row = wikiDomainProgressRow(domain)
  if (!row) return 'missing'
  if (row.progressStale || rowStatus(row) === 'stalled') return 'stale'
  if (rowHeartbeatAt(row) || row.updatedAt) return 'ok'
  return 'missing'
}

function wikiDomainHeartbeatTone(domain: CrawlerMonitorWikiDomain) {
  const status = wikiDomainHeartbeatStatus(domain)
  if (status === 'ok') return 'success'
  if (status === 'stale') return 'warning'
  return 'muted'
}

function wikiDomainHeartbeatLabel(domain: CrawlerMonitorWikiDomain) {
  const status = wikiDomainHeartbeatStatus(domain)
  const heartbeat = rowHeartbeatLabel(wikiDomainProgressRow(domain))
  if (status === 'ok') return `心跳正常 ${heartbeat}`
  if (status === 'stale') return `心跳过期 ${heartbeat}`
  return '无运行心跳'
}

function wikiDomainPrimaryActionLabel(domain: CrawlerMonitorWikiDomain) {
  if (wikiDispatchLoading.value === domain.domain) return '启动中'
  if (canRetryWikiDomain(domain)) return '重新重爬'
  if (!canExecuteWikiDomain(domain)) return '不能重爬'
  return '启动重爬'
}

function wikiDomainRecoveryTitle(domain: CrawlerMonitorWikiDomain) {
  const status = wikiDomainFlowStatus(domain)
  if (status === 'running') return '继续观察运行'
  if (status === 'stalled') return '心跳过期，人工确认后重派'
  if (status === 'failed' || status === 'error') return '失败，人工确认后重派'
  if (status === 'paused') return '继续执行'
  if (status === 'pending' || status === 'ready' || status === 'changed') return '手动启动重爬'
  if (status === 'blocked') return '已阻断，查看原因'
  if (status === 'completed') return '打开报告复核'
  return '缺少进度，先启动重爬'
}

function wikiDomainRecoveryCopy(domain: CrawlerMonitorWikiDomain) {
  const reason = wikiDomainDisabledReason(domain)
  const message = domain.message || wikiDomainManualHint(domain)
  const progress = wikiDomainProgressRow(domain)
  const path = progress ? rowSourcePath(progress) : domain.progressPath
  if (reason) return `${message}。当前不可执行：${reason}。`
  if (path) return `${message}。进度文件：${path}。`
  return `${message}。该域尚未生成可读进度文件。`
}

function wikiDomainOperationHint(domain: CrawlerMonitorWikiDomain) {
  if (canPauseWikiDomain(domain)) return '当前运行中，可暂停；也可以继续观察心跳和进度。'
  if (canResumeWikiDomain(domain)) return '当前已暂停，可继续执行。'
  if (canExecuteWikiDomain(domain)) return `${wikiDomainManualHint(domain)}。这里会启动该域重爬，不只是刷新页面状态。`
  return wikiDomainDisabledReason(domain) || '当前没有可用的运行控制。'
}

function wikiDomainReportPath(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain) return ''
  return wikiDomainProgressRow(domain)?.reportPath || ''
}

function wikiDomainOutputPath(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain) return ''
  const row = wikiDomainProgressRow(domain)
  return row?.outputPath || row?.progressPayload?.outputPath || ''
}

function wikiDomainProgressPath(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain) return ''
  const row = wikiDomainProgressRow(domain)
  return row ? rowSourcePath(row) : domain.progressPath || ''
}

function wikiDispatchForDomain(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain?.domain) return null
  return pendingWikiDispatches.value.find((dispatch) => dispatch.domain === domain.domain) || null
}

function toggleCommandPreview(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain) return
  const key = wikiDomainKey(domain)
  commandPreviewDomainKey.value = commandPreviewDomainKey.value === key ? '' : key
}

function selectLatestDispatchDomain() {
  if (latestDispatchMatchedDomain.value) {
    selectWikiDomain(latestDispatchMatchedDomain.value)
  }
}

function openCancelConfirm(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain || !canCancelWikiDomain(domain)) return
  selectWikiDomain(domain)
  cancelConfirmDomainKey.value = wikiDomainKey(domain)
}

function openDispatchConfirm(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain || !canExecuteWikiDomain(domain)) return
  selectWikiDomain(domain)
  dispatchConfirmDomainKey.value = wikiDomainKey(domain)
}

function closeCancelConfirm() {
  cancelConfirmDomainKey.value = ''
}

function closeDispatchConfirm() {
  dispatchConfirmDomainKey.value = ''
}

async function confirmWikiDomainDispatch() {
  const domain = dispatchConfirmDomain.value
  if (!domain) return
  await executeWikiMonitorTask(domain)
  closeDispatchConfirm()
}

async function confirmWikiDomainCancel() {
  const domain = cancelConfirmDomain.value
  if (!domain) return
  await controlWikiMonitorTask(domain, 'cancel')
  closeCancelConfirm()
}

function dispatchResultPath(kind: 'progress' | 'report' | 'lock') {
  const result = latestDispatchResult.value
  if (!result) return ''
  if (kind === 'progress') return result.progressPath || ''
  if (kind === 'report') return result.reportPath || ''
  return result.lockPath || ''
}

function wikiDispatchDomain(dispatch: CrawlerMonitorWikiDispatch) {
  return wikiDomainRows.value.find((domain) => domain.domain === dispatch.domain) || null
}

function wikiDispatchDisabledReason(dispatch: CrawlerMonitorWikiDispatch) {
  const domain = wikiDispatchDomain(dispatch)
  if (!dispatch.domain || !dispatch.actionId) return '缺少派发域或动作'
  if (!domain) return '未找到对应域规则'
  if (domain.recommendedActionId !== dispatch.actionId) return '待确认动作与白名单不匹配'
  return wikiDomainDisabledReason(domain)
}

function queueItemStatus(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  return String(item?.status || '').toLowerCase() || 'missing'
}

function queueItemDomain(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  if (!item) return null
  const domainKey = String(item.domain || '').toLowerCase()
  const coveredDomains = Array.isArray(item.coveredDomains) ? item.coveredDomains.map((value) => String(value).toLowerCase()) : []
  return wikiDomainRows.value.find((domain) => {
    const key = String(domain.domain || '').toLowerCase()
    if (domainKey && key === domainKey) return true
    return Boolean(key && coveredDomains.includes(key))
  }) || null
}

function queueItemDomainLabel(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  const domain = queueItemDomain(item)
  return domain ? wikiDomainChineseName(domain) : item?.domain || item?.actionId || '未知队列项'
}

function queueItemLaneLabel(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  if (item?.lane === 'domain_smoke') return '10 域样本'
  if (item?.lane === 'standard') return '标准派发'
  return item?.lane || '未知通道'
}

function queueItemPositionLabel(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  if (isTerminalQueueItem(item)) return '已结束'
  const lanePosition = Number(item?.lanePosition || 0)
  const position = Number(item?.position || 0)
  if (lanePosition > 0) return `通道第 ${lanePosition} 位`
  if (position > 0) return `总队列第 ${position} 位`
  return '已启动'
}

function queueItemMessage(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  if (!item) return '暂无队列信息'
  if (item.message) return item.message
  if (isTerminalQueueItem(item) && item.completedAt) return `${statusLabel(queueItemStatus(item))}于 ${formatDate(item.completedAt)}`
  if (item.cooldownUntil) return `冷却到 ${formatDate(item.cooldownUntil)}`
  const blocker = queueItemBlockerLabel(item)
  if (blocker) return `被 ${blocker} 占用，等待释放锁`
  return statusLabel(queueItemStatus(item))
}

function queueItemBlockerLabel(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  if (!item) return ''
  return [
    item.blockedByDomain ? `域 ${item.blockedByDomain}` : '',
    item.blockedByActionId ? `动作 ${item.blockedByActionId}` : '',
    item.blockedByDispatchId ? `派发 ${item.blockedByDispatchId}` : '',
  ].filter(Boolean).join(' / ')
}

function queueItemIdentityLabel(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  if (!item) return 'queueId: 未返回'
  return [
    `queueId: ${item.queueId || '未返回'}`,
    item.dispatchId ? `dispatchId: ${item.dispatchId}` : '',
    item.pid ? `pid: ${item.pid}` : '',
  ].filter(Boolean).join(' · ')
}

function queueItemCompletedAtLabel(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  return item?.completedAt ? formatDate(item.completedAt) : ''
}

function isTerminalQueueItem(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  return ['completed', 'failed', 'timed_out', 'cancelled'].includes(queueItemStatus(item))
}

function queueItemPathEntries(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  return [
    { label: '日志', path: item?.logPath || '' },
    { label: '报告', path: item?.reportPath || '' },
    { label: '进度', path: item?.progressPath || '' },
    { label: '锁', path: item?.lockPath || '' },
  ].filter((entry) => Boolean(entry.path))
}

function queueItemSortTime(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  const raw = item?.completedAt || item?.startedAt || item?.requestedAt || ''
  const time = raw ? Date.parse(raw) : 0
  return Number.isFinite(time) ? time : 0
}

function compareQueueItems(a: CrawlerMonitorWikiQueueItem, b: CrawlerMonitorWikiQueueItem) {
  const aTerminal = isTerminalQueueItem(a)
  const bTerminal = isTerminalQueueItem(b)
  if (aTerminal !== bTerminal) return aTerminal ? 1 : -1
  if (!aTerminal || !bTerminal) {
    const aPosition = Number(a.lanePosition || a.position || 999999)
    const bPosition = Number(b.lanePosition || b.position || 999999)
    if (aPosition !== bPosition) return aPosition - bPosition
  }
  return queueItemSortTime(b) - queueItemSortTime(a)
}

function canCancelQueuedItem(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  return Boolean(item?.queueId && ['queued', 'blocked_cooldown'].includes(queueItemStatus(item)))
}

function canCancelRunningQueueItem(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  return Boolean(item?.queueId && queueItemStatus(item) === 'running')
}

function canCancelDomainTableQueuedRow(row: any) {
  return Boolean(row?.queueItem && canCancelQueuedItem(row.queueItem))
}

function canCancelDomainTableRunningRow(row: any) {
  return Boolean(row?.queueItem && canCancelRunningQueueItem(row.queueItem))
}

function cancelDomainTableQueuedRow(row: any) {
  selectDomainTableRow(row)
  if (row?.queueItem) return cancelQueuedDispatchItem(row.queueItem)
}

function cancelDomainTableRunningRow(row: any) {
  selectDomainTableRow(row)
  if (row?.queueItem) return cancelRunningDispatchItem(row.queueItem)
}

function activeQueueItemForDomain(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain) return null
  const key = String(domain.domain || '').toLowerCase()
  const actionId = String(domain.recommendedActionId || '').toLowerCase()
  return activeDispatchQueueRows.value.find((item) => {
    if (item.lane && item.lane !== 'standard') return false
    const itemDomain = String(item.domain || '').toLowerCase()
    const itemAction = String(item.actionId || '').toLowerCase()
    const coveredDomains = Array.isArray(item.coveredDomains) ? item.coveredDomains.map((value) => String(value).toLowerCase()) : []
    if (key && itemDomain === key) return true
    if (key && coveredDomains.includes(key)) return true
    if (actionId && itemAction === actionId) return true
    return false
  }) || null
}

function queueItemAsProgressRow(item: CrawlerMonitorWikiQueueItem): ProgressRow {
  const status = queueItemStatus(item)
  return {
    id: item.actionId || item.queueId || null,
    label: `${queueItemDomainLabel(item)} · 队列历史`,
    status,
    lane: 'wiki-monitor-queue',
    queueState: queueItemMessage(item),
    reportPath: item.reportPath || null,
    progressPath: item.progressPath || null,
    outputPath: item.outputPath || null,
    progressSource: item.logPath || item.progressPath || item.reportPath || item.lockPath || null,
    progressKind: status,
    progressUpdatedAt: item.completedAt || item.startedAt || item.requestedAt || null,
    updatedAt: item.completedAt || item.startedAt || item.requestedAt || null,
    progressPayload: {
      domain: item.domain || null,
      actionId: item.actionId || null,
      startedAt: item.startedAt || item.requestedAt || null,
      completedAt: item.completedAt || null,
      logPath: item.logPath || null,
      reportPath: item.reportPath || null,
      progressPath: item.progressPath || null,
      lockPath: item.lockPath || null,
    },
    rowKey: `queue-history:${item.queueId || item.dispatchId || item.domain || item.actionId || 'unknown'}`,
    action: null,
    sourceQueueItem: item,
  }
}

function selectQueueItemDomain(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  const domain = queueItemDomain(item)
  if (domain) selectWikiDomain(domain)
}

function selectExecutionOverviewRow(row: any) {
  if (row?.domain) {
    const domain = wikiDomainRows.value.find((candidate) => candidate.domain === row.domain)
    if (domain) {
      selectWikiDomain(domain)
      return
    }
  }
  if (row?.sourceQueueItem) {
    const domain = queueItemDomain(row.sourceQueueItem)
    if (domain) {
      selectWikiDomain(domain)
      return
    }
  }
  const previewPath = row?.reportPath || row?.progressPath || row?.logPath
  if (isPreviewableReportPath(previewPath) || isPreviewableProgressPath(previewPath) || isPreviewableGeneratedJsonPath(previewPath)) {
    openReportPreview(previewPath)
    return
  }
  showToast('该执行项无可定位的域，可在任务进度明细中查看', 'warning')
}

function executionOverviewProgressNumbers(row: any) {
  const current = finiteNumber(row?.current)
  const total = finiteNumber(row?.total)
  if (current == null || total == null || total <= 0) return '--'
  return `${formatNumber(current)} / ${formatNumber(total)}`
}

function executionOverviewProgress(row: any) {
  const percent = finiteNumber(row?.percent)
  if (percent != null) return `${clampPercent(percent)}%`
  const current = finiteNumber(row?.current)
  const total = finiteNumber(row?.total)
  if (current != null && total != null && total > 0) return `${clampPercent((current / total) * 100)}%`
  if ((row?.displayStatus || row?.status) === 'completed') return '100%'
  return '0%'
}

function smokeRowForDomain(domainId: string | null | undefined) {
  const key = String(domainId || '')
  if (!key) return null
  return progressRows.value.find((row) => String(row.id || '') === `wiki-monitor-domain-smoke:${key}`) || null
}

function isWikiDispatchTarget(target: CrawlerMonitorWikiDomain | CrawlerMonitorWikiDispatch): target is CrawlerMonitorWikiDispatch {
  return Object.prototype.hasOwnProperty.call(target, 'actionId')
}

function wikiDomainDisabledReason(domain: CrawlerMonitorWikiDomain) {
  if (!domain.recommendedActionId) return '没有可执行的白名单动作'
  if (domain.status === 'running') return '该域已有任务运行中'
  if (domain.status === 'blocked') return '该域任务被阻断'
  if (domain.status === 'failed') return ''
  if (domain.pauseReason) return domain.pauseReason
  if (isWikiDomainCoolingDown(domain)) return `冷却中：${domain.cooldownMinutes} 分钟`
  return ''
}

function isWikiDomainCoolingDown(domain: CrawlerMonitorWikiDomain) {
  const minutes = Number(domain.cooldownMinutes || 0)
  if (!minutes || !domain.lastAutoRunAt) return false
  const lastMs = Date.parse(domain.lastAutoRunAt)
  if (!Number.isFinite(lastMs)) return false
  return Date.now() < lastMs + minutes * 60000
}

function wikiDomainManualHint(domain: CrawlerMonitorWikiDomain) {
  if (domain.changed && domain.requiresApproval) return '检测到变化，可手动执行'
  if (domain.changed) return '检测到变化，可手动执行'
  return '未检测到变化，可手动执行'
}

function wikiDomainProgressRow(domain: CrawlerMonitorWikiDomain): ProgressRow | null {
  const progressPath = String(domain.progressPath || '')
  const actionId = String(domain.recommendedActionId || '')
  const domainKey = String(domain.domain || domain.label || '').toLowerCase()
  const domainLabel = String(domain.label || '').toLowerCase()
  return progressRows.value.find((row) => {
    if (isDomainSmokeProgressRow(row)) return false
    const payload = row.progressPayload || {}
    const rowPath = String(row.progressPath || row.progressSource || row.action?.childStatusPath || row.progressPayload?.childStatusPath || '')
    const rowActionId = String(row.progressPayload?.actionId || row.action?.id || row.id || '')
    if (actionId && rowActionId && actionId === rowActionId) return true
    if (progressPath && rowPath && (rowPath === progressPath || rowPath.endsWith(progressPath))) return true
    const rowDomain = String(payload.domain || payload.sourceKey || '').toLowerCase()
    const rowLabel = String(row.label || payload.label || '').toLowerCase()
    if (domainKey && [rowDomain, rowLabel].some((value) => value === domainKey || value.endsWith(`:${domainKey}`))) return true
    return Boolean(domainLabel && [rowDomain, rowLabel].some((value) => value === domainLabel))
  }) || null
}

function progressRowPriorityScore(row: ProgressRow) {
  const status = rowStatus(row)
  if (status === 'running') return 0
  if (status === 'stalled') return 1
  if (status === 'failed' || status === 'error') return 2
  if (status === 'queued' || status === 'pending') return 3
  if (status === 'warning' || status === 'blocked') return 4
  if (row.progressHeartbeatAt || row.action?.lastHeartbeatAt) return 5
  return 6
}

function domainPriorityScore(domain: CrawlerMonitorWikiDomain) {
  const status = wikiDomainFlowStatus(domain)
  if (status === 'running') return 0
  if (status === 'stalled') return 1
  if (status === 'failed' || status === 'error') return 2
  if (status === 'pending' || status === 'ready' || status === 'changed') return 3
  if (status === 'paused') return 4
  return 5
}

function sortRowsByPriority(rows: ProgressRow[]) {
  return rows
    .slice()
    .sort((a, b) => progressRowPriorityScore(a) - progressRowPriorityScore(b) || compareProgressRows(a, b))
}

function sortWikiDomainsByPriority(rows: CrawlerMonitorWikiDomain[]) {
  return rows
    .slice()
    .sort((a, b) => domainPriorityScore(a) - domainPriorityScore(b) || wikiDomainKey(a).localeCompare(wikiDomainKey(b), 'zh-CN'))
}

function compareProgressRows(a: ProgressRow, b: ProgressRow) {
  return wikiDomainKeyFromRow(a).localeCompare(wikiDomainKeyFromRow(b), 'zh-CN')
}

function wikiDomainKeyFromRow(row: ProgressRow) {
  return String(row.label || row.id || row.rowKey || '').trim()
}

function rowProgressNumbers(row: ProgressRow | null | undefined) {
  if (!row) return '--'
  const basis = rowProgressBasis(row)
  if (!basis) return '--'
  return `${formatNumber(basis.current)} / ${formatNumber(basis.total)}`
}

function rowHeartbeatAtLabel(row: ProgressRow | null | undefined) {
  if (!row) return '--'
  return formatDate(rowHeartbeatAt(row))
}

function rowUpdatedAtLabel(row: ProgressRow | null | undefined) {
  if (!row) return '--'
  return formatDate(row.progressUpdatedAt || row.updatedAt || row.progressPayload?.generatedAt || row.progressPayload?.lastHeartbeatAt || row.action?.updatedAt)
}

function progressRowControlActionId(row: ProgressRow) {
  if (isAnyDomainSmokeProgressRow(row)) return 'wiki-monitor-domain-smoke'
  return String(
    row.progressPayload?.actionId
      || row.action?.id
      || row.id
      || ''
  ).trim()
}

function progressRowControlKey(row: ProgressRow) {
  return progressRowControlActionId(row) || row.rowKey || row.label || ''
}

function canPauseProgressRow(row: ProgressRow) {
  return rowStatus(row) === 'running' && Boolean(progressRowControlActionId(row))
}

function canResumeProgressRow(row: ProgressRow) {
  return rowStatus(row) === 'paused' && Boolean(progressRowControlActionId(row))
}

function canTriggerBackfillRow(row: ProgressRow) {
  const status = rowStatus(row)
  return String(row.lane || '').toLowerCase() === 'backfill'
    && Boolean(row.id)
    && Boolean(backfillDomainForRow(row))
    && !['running', 'paused', 'stalled'].includes(status)
}

function canCancelProgressRow(row: ProgressRow) {
  return ['running', 'paused', 'stalled'].includes(rowStatus(row)) && Boolean(progressRowControlActionId(row))
}

function backfillDomainForRow(row: ProgressRow) {
  const id = String(row.id || '')
  if (id === 'npc-loot-backfill') return 'npc_loot'
  if (id === 'boss-loot-backfill') return 'boss_loot'
  return ''
}

function baseDomainQueueRow(domain: CrawlerMonitorWikiDomain | null | undefined) {
  return activeQueueItemForDomain(domain)
}

function baseDomainBackfillRow(domain: CrawlerMonitorWikiDomain | null | undefined) {
  const key = String(domain?.domain || '').toLowerCase()
  if (key === 'npcs') return progressRows.value.find((row) => row.id === 'npc-loot-backfill') || null
  if (key === 'bosses') return progressRows.value.find((row) => row.id === 'boss-loot-backfill') || null
  return null
}

function baseDomainBackfillHint(domain: CrawlerMonitorWikiDomain | null | undefined) {
  const key = String(domain?.domain || '').toLowerCase()
  if (key === 'npcs') return 'NPC loot backfill'
  if (key === 'bosses') return 'Boss loot backfill'
  return '该域暂无补数据动作'
}

function baseDomainReCrawlActionLabel(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain) return '不可重爬'
  if (wikiDispatchLoading.value === domain.domain) return '启动中'
  return canExecuteWikiDomain(domain) ? '可启动重爬' : '不可重爬'
}

async function triggerBaseDomainBackfill(domainRow: { domain?: CrawlerMonitorWikiDomain | null } | CrawlerMonitorWikiDomain | null | undefined) {
  const domain = domainRow && 'domain' in domainRow && typeof domainRow.domain === 'object' ? domainRow.domain : domainRow as CrawlerMonitorWikiDomain | null | undefined
  const row = baseDomainBackfillRow(domain)
  if (!row) return
  await triggerBackfillRow(row)
}

async function startBaseDomainSampleCrawl(domainRow: { domain?: CrawlerMonitorWikiDomain | null } | CrawlerMonitorWikiDomain | null | undefined) {
  const domain = domainRow && 'domain' in domainRow && typeof domainRow.domain === 'object' ? domainRow.domain : domainRow as CrawlerMonitorWikiDomain | null | undefined
  if (wikiDispatchLoading.value === 'wiki-monitor-domain-smoke') return
  if (domain) selectWikiDomain(domain)
  wikiDispatchLoading.value = 'wiki-monitor-domain-smoke'
  try {
    const response: any = await post('/admin/crawler-monitor/test-domain-smoke', {})
    latestDispatchResult.value = (response?.data ?? response) || null
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || '已启动 10 域样本爬取，每域 10 条', latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '启动样本爬取失败', 'error')
  } finally {
    wikiDispatchLoading.value = ''
  }
}

async function cleanupBaseDomainSampleCrawl(domainRow: { domain?: CrawlerMonitorWikiDomain | null } | CrawlerMonitorWikiDomain | null | undefined) {
  const domain = domainRow && 'domain' in domainRow && typeof domainRow.domain === 'object' ? domainRow.domain : domainRow as CrawlerMonitorWikiDomain | null | undefined
  if (wikiDispatchLoading.value === 'wiki-monitor-domain-smoke-cleanup') return
  if (domain) selectWikiDomain(domain)
  wikiDispatchLoading.value = 'wiki-monitor-domain-smoke-cleanup'
  try {
    const response: any = await post('/admin/crawler-monitor/test-domain-smoke/cleanup', {})
    latestDispatchResult.value = (response?.data ?? response) || null
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || '已清理 10 域样本产物', latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '清理样本产物失败', 'error')
  } finally {
    wikiDispatchLoading.value = ''
  }
}

async function executeWikiMonitorTask(target: CrawlerMonitorWikiDomain | CrawlerMonitorWikiDispatch) {
  let domain: CrawlerMonitorWikiDomain | null = null
  let actionId: string | null | undefined = null
  if (isWikiDispatchTarget(target)) {
    if (wikiDispatchDisabledReason(target)) return
    domain = wikiDispatchDomain(target)
    actionId = target.actionId
  } else {
    domain = target
    actionId = target.recommendedActionId
  }
  if (!domain?.domain || !actionId || !canExecuteWikiDomain(domain)) return
  selectWikiDomain(domain)
  wikiDispatchLoading.value = domain.domain
  try {
    const response: any = await post('/admin/crawler-monitor/dispatch', {
      domain: domain.domain,
      actionId,
    })
    latestDispatchResult.value = (response?.data ?? response) || null
    showToast(dispatchFeedbackMessage(latestDispatchResult.value), latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '启动重爬任务失败', 'error')
  } finally {
    wikiDispatchLoading.value = ''
  }
}

async function retryWikiDomain(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain || !canRetryWikiDomain(domain)) return
  await executeWikiMonitorRetry(domain)
}

async function executeWikiMonitorRetry(domain: CrawlerMonitorWikiDomain) {
  if (!domain.domain || !domain.recommendedActionId) return
  selectWikiDomain(domain)
  wikiDispatchLoading.value = domain.domain
  try {
    const response: any = await post('/admin/crawler-monitor/dispatch/control', {
      domain: domain.domain,
      actionId: domain.recommendedActionId,
      controlAction: 'retry',
    })
    latestDispatchResult.value = (response?.data ?? response) || null
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || '已提交重试', latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '重试任务失败', 'error')
  } finally {
    wikiDispatchLoading.value = ''
  }
}

async function controlProgressTask(row: ProgressRow, controlAction: 'pause' | 'resume' | 'cancel') {
  const actionId = progressRowControlActionId(row)
  if (!actionId) return
  if (controlAction === 'cancel' && import.meta.client && !window.confirm('确认终止当前阶段任务？运行中的进程会被停止。')) return
  const controlKey = progressRowControlKey(row)
  progressControlLoading.value = controlKey
  try {
    const response: any = await post('/admin/crawler-monitor/dispatch/control', {
      actionId,
      controlAction,
    })
    latestDispatchResult.value = (response?.data ?? response) || null
    const fallbackMessage = controlAction === 'pause' ? '已暂停任务' : controlAction === 'resume' ? '已继续任务' : '已终止任务'
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || fallbackMessage, latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '控制任务失败', 'error')
  } finally {
    progressControlLoading.value = ''
  }
}

async function triggerBackfillRow(row: ProgressRow) {
  if (!canTriggerBackfillRow(row)) return
  if (import.meta.client && !window.confirm('确认触发补爬 dry-run 预览？本次不会 apply 写库。')) return
  const controlKey = progressRowControlKey(row)
  progressControlLoading.value = controlKey
  try {
    const response: any = await post('/admin/crawler-monitor/dispatch', {
      domain: backfillDomainForRow(row),
      actionId: row.id,
    })
    latestDispatchResult.value = (response?.data ?? response) || null
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || '已触发补爬 dry-run 预览', latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '触发补爬失败', 'error')
  } finally {
    progressControlLoading.value = ''
  }
}

async function controlWikiMonitorTask(domain: CrawlerMonitorWikiDomain, controlAction: 'pause' | 'resume' | 'cancel' | 'retry') {
  if (!domain.domain || !domain.recommendedActionId) return
  if (controlAction === 'pause' && !canPauseWikiDomain(domain)) return
  if (controlAction === 'resume' && !canResumeWikiDomain(domain)) return
  if (controlAction === 'cancel' && !canCancelWikiDomain(domain)) return
  if (controlAction === 'retry' && !canRetryWikiDomain(domain)) return
  selectWikiDomain(domain)
  wikiControlLoading.value = domain.domain
  try {
    const activeQueueItem = activeQueueItemForDomain(domain)
    const activeQueueItemId = activeQueueItem?.queueId
    const effectiveControlAction = controlAction === 'cancel' && activeQueueItem && canCancelQueuedItem(activeQueueItem)
      ? 'cancelQueued'
      : controlAction
    const response: any = await post('/admin/crawler-monitor/dispatch/control', {
      domain: domain.domain,
      actionId: domain.recommendedActionId,
      controlAction: effectiveControlAction,
      queueId: activeQueueItemId,
    })
    latestDispatchResult.value = (response?.data ?? response) || null
    const fallbackMessage = controlAction === 'pause' ? '已暂停任务' : controlAction === 'resume' ? '已继续任务' : controlAction === 'retry' ? '已提交重试' : '已取消任务'
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || fallbackMessage, latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '控制任务失败', 'error')
  } finally {
    wikiControlLoading.value = ''
  }
}

async function cancelQueuedDispatchItem(item: CrawlerMonitorWikiQueueItem) {
  if (!canCancelQueuedItem(item) || !item.queueId) return
  queueControlLoading.value = item.queueId
  try {
    const response: any = await post('/admin/crawler-monitor/dispatch/control', {
      controlAction: 'cancelQueued',
      queueId: item.queueId,
    })
    latestDispatchResult.value = (response?.data ?? response) || null
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || '已取消排队任务', latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '取消排队任务失败', 'error')
  } finally {
    queueControlLoading.value = ''
  }
}

async function cancelRunningDispatchItem(item: CrawlerMonitorWikiQueueItem) {
  if (!canCancelRunningQueueItem(item) || !item.queueId) return
  if (import.meta.client && !window.confirm(`确认终止正在运行的队列任务：${queueItemDomainLabel(item)}？`)) return
  queueControlLoading.value = item.queueId
  try {
    const response: any = await post('/admin/crawler-monitor/dispatch/control', {
      controlAction: 'cancel',
      queueId: item.queueId,
      domain: item.domain,
      actionId: item.actionId,
    })
    latestDispatchResult.value = (response?.data ?? response) || null
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || '已终止运行任务', latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '终止运行任务失败', 'error')
  } finally {
    queueControlLoading.value = ''
  }
}

function closeReportPreview() {
  selectedReportPath.value = null
  reportPreview.value = null
  reportPreviewError.value = ''
  reportPreviewLoading.value = false
}

function isPreviewLoading(path?: string | null) {
  return reportPreviewLoading.value && selectedReportPath.value === path
}

function dismissWikiDomain(domain: CrawlerMonitorWikiDomain) {
  dismissNoiseItem('wiki-domain', domain.domain || domain.label)
}

function dismissNoiseItem(...parts: Array<string | null | undefined>) {
  const key = noiseKey(...parts)
  hiddenNoiseKeys.value = new Set([...hiddenNoiseKeys.value, key])
}

function isNoiseHidden(key: string) {
  return hiddenNoiseKeys.value.has(key)
}

function noiseKey(...parts: Array<string | null | undefined>) {
  return parts.map((part) => String(part || '').trim()).filter(Boolean).join(':')
}

function syncAutoRefresh() {
  clearRefreshTimer()
  if (!autoRefresh.value || authRefreshHalted.value || !import.meta.client) return
  if (typeof document !== 'undefined' && document.hidden) return
  refreshTimer = setInterval(() => {
    if (!loading.value) {
      loadOverview()
    }
  }, effectiveRefreshIntervalMs.value)
}

function clearRefreshTimer() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

function handleVisibilityChange() {
  if (typeof document === 'undefined') return
  if (document.hidden) {
    clearRefreshTimer()
    return
  }
  if (autoRefresh.value && !authRefreshHalted.value) {
    if (!loading.value) {
      loadOverview()
    }
    syncAutoRefresh()
  }
}

function statusLabel(status?: string | null) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'manual') return '人工'
  if (normalized === 'auto' || normalized === 'automatic') return '自动'
  if (normalized === 'enabled') return '已开启'
  if (normalized === 'disabled') return '已关闭'
  if (normalized === 'idle') return '空闲'
  if (normalized === 'sleeping') return '休眠'
  if (normalized === 'active') return '活跃'
  if (normalized === 'free') return '空闲'
  if (normalized === 'completed') return '已完成'
  if (normalized === 'failed') return '失败'
  if (normalized === 'running') return '运行中'
  if (normalized === 'paused') return '已暂停'
  if (normalized === 'pending') return '等待中'
  if (normalized === 'queued') return '队列中'
  if (normalized === 'blocked_cooldown') return '冷却排队'
  if (normalized === 'starting') return '启动中'
  if (normalized === 'timed_out') return '已超时'
  if (normalized === 'stalled') return '停滞'
  if (normalized === 'missing') return '缺失'
  if (normalized === 'readable') return '可读取'
  if (normalized === 'read error') return '读取错误'
  if (normalized === 'report-only') return '仅报告'
  if (normalized === 'blocked') return '已阻断'
  if (normalized === 'warning') return '需注意'
  if (normalized === 'locked') return '被占用'
  if (normalized === 'cancelled') return '已取消'
  if (normalized === 'cooldown') return '冷却中'
  if (normalized === 'accepted') return '已接收'
  return normalized || '未知'
}

function runtimeStateCard(key: string, label: string, file: any) {
  const payload = file?.payload || {}
  const status = payload.status || file?.status || fileStateText(file)
  const time = payload.generatedAt || payload.updatedAt || file?.updatedAt
  const next = payload.nextPlannedAt || payload.nextRunAt
  return {
    key,
    label,
    status,
    detail: next ? `下次 ${formatDate(next)}` : `更新 ${formatDate(time)}`,
    path: file?.path || '--',
  }
}

function fileStateText(file: any) {
  if (!file) return 'missing'
  if (file.readable) return 'readable'
  if (file.found === false) return 'missing'
  if (file.errorMessage) return 'read error'
  return 'unknown'
}

function imageNormalizationMetricRows(summary: any) {
  if (!summary || typeof summary !== 'object') return []
  return [
    { label: 'NPC 前缀', value: formatNumber(summary.npcWrongPrefixCount) },
    { label: '射弹前缀', value: formatNumber(summary.projectileWrongPrefixCount) },
    { label: 'NPC Wiki-only', value: formatNumber(summary.npcWikiOnlyCount) },
    { label: '射弹 Wiki-only', value: formatNumber(summary.projectileWikiOnlyCount) },
    { label: '豁免', value: formatNumber(summary.legacyExemptionCount) },
    { label: '最近同步', value: formatDate(summary.lastCanonicalSyncAt) },
  ]
}

function domainRuntimeSummaryRow(domain: CrawlerMonitorWikiDomain) {
  const progress = wikiDomainProgressRow(domain)
  const flowStatus = wikiDomainFlowStatus(domain)
  const currentValue = shortFingerprint(domain.currentValue)
  const previousValue = shortFingerprint(domain.previousValue)
  const autoEligible = Boolean(domain.autoEligible)
  const reason = domain.autoDispatchReason || domain.message || wikiDomainManualHint(domain)
  return {
    domain: domain.domain || wikiDomainKey(domain),
    label: wikiDomainChineseName(domain),
    status: flowStatus,
    flowLabel: wikiDomainFlowLabel(domain),
    currentValue,
    previousValue,
    changeLabel: domain.changed ? '有变化' : '无变化',
    autoEligible,
    autoEligibleLabel: autoEligible ? '可自动派发' : '需人工判断',
    actionLabel: domain.recommendedActionId || '无推荐动作',
    progressLabel: rowSourcePath(progress) || domain.progressPath || '无进度文件',
    reason,
    sourceDomain: domain,
  }
}

function domainRuntimeSummaryRank(row: ReturnType<typeof domainRuntimeSummaryRow>) {
  if (row.status === 'running' || row.status === 'stalled') return 0
  if (row.changeLabel === '有变化' && row.autoEligible) return 1
  if (row.changeLabel === '有变化') return 2
  if (row.status === 'pending' || row.status === 'ready') return 3
  return 10
}

function shortFingerprint(value: string | null | undefined) {
  const raw = String(value || '').trim()
  if (!raw) return '未记录'
  return raw.length > 12 ? `${raw.slice(0, 12)}...` : raw
}

function heartbeatKey(heartbeat: any) {
  return String(heartbeat?.id || heartbeat?.domain || heartbeat?.label || heartbeat?.progressPath || heartbeat?.lastHeartbeatAt || Math.random())
}

function runStatus(run: any) {
  if (!run?.found) return 'missing'
  if (Number(run.failedActions || 0) > 0) return 'failed'
  if (Number(run.runningActions || 0) > 0) return 'running'
  if (Number(run.pendingActions || 0) > 0) return 'pending'
  return 'completed'
}

function runSummary(run: any) {
  const total = formatNumber(run?.totalActions)
  const completed = formatNumber(run?.completedActions)
  const failed = formatNumber(run?.failedActions)
  return `总 ${total} / 完成 ${completed} / 失败 ${failed}`
}

function dispatchPlanSummary(plan: any) {
  const domains = Array.isArray(plan?.coveredDomains) ? plan.coveredDomains.join('、') : ''
  return [plan?.reason, domains, plan?.advisoryNote].filter(Boolean).join(' · ') || `优先级 ${plan?.priority ?? '--'}`
}

function domainMaxConcurrentLabel(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain || domain.maxConcurrent == null) return '--'
  return formatNumber(domain.maxConcurrent)
}

function domainFailureCircuitBreakerLabel(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain) return '未配置'
  return String(domain.failureCircuitBreaker || '未配置')
}

function progressRowTitle(row: ProgressRow) {
  const id = String(row.id || '')
  if (id === 'wiki-monitor-domain-smoke') return '10 域样本爬取'
  if (id.startsWith('wiki-monitor-domain-smoke:')) {
    const domain = domainSmokeProgressDomain(row)
    return `样本爬取：${domain ? wikiDomainChineseName({ domain, label: domain }) : row.label || '基础域'}`
  }
  if (id === 'buff-page-immunity-refresh') return 'Buff 免疫页面刷新'
  if (id === 'crawler-output-standardize') return '爬取结果标准化'
  if (id === 'item-page-retry-queue') return '物品页重试队列'
  if (id === 'wiki-core-refresh') return 'Wiki 核心刷新'
  if (id === 'item-pages-refresh') return '物品页面爬取'
  if (id === 'wiki-audio-assets-refresh') return 'Wiki 音频资源刷新'
  if (id === 'domain-source-bosses') return 'Boss 来源快照'
  if (id === 'domain-source-armor-sets') return '盔甲套装来源快照'
  if (id === 'domain-source-shimmer') return '微光来源快照'
  if (id === 'domain-source-town-npc-maintenance') return '城镇 NPC 维护快照'
  return row.label || row.id || '未知任务'
}

function progressRowLaneLabel(row: ProgressRow) {
  const lane = String(row.lane || row.action?.runner || '').toLowerCase()
  if (row.sourceQueueItem || lane === 'wiki-monitor-queue') return '队列历史'
  if (isAnyDomainSmokeProgressRow(row)) return '样本测试'
  if (lane === 'fetch') return '爬取'
  if (lane === 'transform') return '转换'
  if (lane === 'crawl') return '爬虫'
  if (lane === 'backfill') return '回填'
  if (lane === 'backend-refresh') return '后端刷新'
  if (lane === 'validation') return '校验'
  return lane || '未知执行器'
}

function isDomainSmokeProgressRow(row: ProgressRow | null | undefined) {
  const id = String(row?.id || '')
  return id.startsWith('wiki-monitor-domain-smoke:')
}

function isDomainSmokeAggregateRow(row: ProgressRow | null | undefined) {
  return String(row?.id || '') === 'wiki-monitor-domain-smoke'
}

function isAnyDomainSmokeProgressRow(row: ProgressRow | null | undefined) {
  return isDomainSmokeAggregateRow(row) || isDomainSmokeProgressRow(row)
}

function domainSmokeProgressDomain(row: ProgressRow | null | undefined) {
  const id = String(row?.id || '')
  if (id.startsWith('wiki-monitor-domain-smoke:')) return id.slice('wiki-monitor-domain-smoke:'.length)
  return String(row?.progressPayload?.domain || '')
}

function progressRowMessageLabel(row: ProgressRow) {
  const raw = String(row.queueState || row.action?.message || row.action?.phase || '').trim()
  if (!raw) return ''
  const normalized = raw.toLowerCase()
  if (normalized === 'pending') return '等待执行'
  if (normalized === 'completed') return '已完成'
  if (normalized === 'dispatch paused') return '任务已暂停'
  if (normalized === 'backend refresh action') return '后端刷新动作等待执行'
  if (normalized.startsWith('expanding localized fields')) return raw.replace('expanding localized fields', '正在扩展本地化字段').replace('for', '共').replace('buff(s)', '个 Buff').replace('across', '覆盖').replace('language(s)', '种语言')
  if (normalized.startsWith('scraping rendered immunity pages')) return raw.replace('scraping rendered immunity pages', '正在爬取免疫页面')
  return raw
}

function canDismissProgressRow(row: ProgressRow) {
  const status = rowStatus(row)
  return ['missing', 'pending', 'queued', 'report-only', 'completed'].includes(status)
}

function isSignalTask(row: ProgressRow) {
  const status = rowStatus(row)
  if (['running', 'stalled', 'failed', 'error', 'blocked', 'warning'].includes(status)) return true
  if (rowProgressLabel(row) !== '--') return true
  if (row.progressStaleReason) return true
  return false
}

function isActiveProgressRow(row: ProgressRow) {
  const status = rowStatus(row)
  if (isDomainSmokeProgressRow(row)) return true
  if (['completed', 'report-only'].includes(status)) return false
  if (['running', 'stalled', 'paused', 'queued', 'pending', 'failed', 'error', 'blocked', 'warning'].includes(status)) return true
  return Boolean(row.progressStaleReason || rowHeartbeatAt(row))
}

function isOperationalProgressRow(row: ProgressRow) {
  if (row.lane === 'validation') return false
  if (row.id === 'replacement-readiness') return false
  return true
}

function statusTone(status?: string | null) {
  const normalized = String(status || '').toLowerCase()
  if (['completed', 'success', 'ok', 'readable', 'free'].includes(normalized)) return 'success'
  if (['failed', 'error', 'missing', 'read error', 'blocked', 'timed_out'].includes(normalized)) return 'danger'
  if (['running', 'active'].includes(normalized)) return 'info'
  if (['pending', 'sleeping', 'locked', 'queued', 'blocked_cooldown', 'starting', 'stalled', 'warning', 'paused'].includes(normalized)) return 'warning'
  return 'muted'
}

function reportTone(category?: string | null) {
  const normalized = String(category || '').toLowerCase()
  if (normalized === 'test') return 'success'
  if (normalized === 'crawler') return 'info'
  if (normalized === 'audit') return 'warning'
  return 'muted'
}

function rowProgress(row: ProgressRow | null | undefined) {
  if (!row) return '0%'
  return taskProgress(row)
}

function rowProgressLabel(row: ProgressRow | null | undefined) {
  if (!row) return '--'
  return taskProgressLabel(row)
}

function rowPendingLabel(row: ProgressRow | null | undefined) {
  if (!row) return '--'
  return taskPendingLabel(row)
}

function rowSpeedLabel(row: ProgressRow | null | undefined) {
  if (!row) return '--'
  const speed = taskSpeedPerMinute(row)
  if (speed == null) return '--'
  const rounded = speed >= 10 ? Math.round(speed) : Math.round(speed * 10) / 10
  return `${rounded.toLocaleString('zh-CN')}/min`
}

function rowEtaLabel(row: ProgressRow | null | undefined) {
  if (!row) return '--'
  const remaining = taskRemaining(row)
  if (remaining == null) return '--'
  if (remaining <= 0) return '0s'
  const speed = taskSpeedPerMinute(row)
  if (speed == null || speed <= 0) return '--'
  return formatEtaDuration((remaining / speed) * 60_000)
}

function rowHeartbeatLabel(row: ProgressRow | null | undefined) {
  if (!row) return '--'
  return formatDate(rowHeartbeatAt(row))
}

function rowSourcePath(row: ProgressRow | null | undefined) {
  if (!row) return ''
  if (row.sourceQueueItem) {
    return row.sourceQueueItem.logPath || row.sourceQueueItem.reportPath || row.sourceQueueItem.progressPath || row.sourceQueueItem.lockPath || ''
  }
  return row.progressSource || row.progressPath || row.action?.childStatusPath || row.reportPath || row.outputPath || ''
}

function progressRowPathEntries(row: ProgressRow | null | undefined) {
  if (!row) return []
  if (row.sourceQueueItem) return queueItemPathEntries(row.sourceQueueItem)
  const entries = [
    { label: '进度', path: row.progressSource || row.progressPath || row.action?.childStatusPath || '' },
    { label: '报告', path: row.reportPath || '' },
    { label: '输出', path: row.outputPath || row.progressPayload?.outputPath || '' },
  ].filter((entry) => entry.path)
  if (!entries.length && rowSourcePath(row)) return [{ label: '来源', path: rowSourcePath(row) }]
  return entries
}

function taskProgress(task: CrawlerMonitorRegisteredTask) {
  const percent = taskProgressPercent(task)
  if (percent != null) return `${percent}%`
  const status = String(task.status || '').toLowerCase()
  if (status === 'completed') return '100%'
  if (['blocked', 'failed', 'warning'].includes(status)) return '100%'
  if (taskProgressLabel(task) === '--') return '0%'
  return '0%'
}

function taskProgressPercent(task: CrawlerMonitorRegisteredTask) {
  const explicit = finiteNumber(task.percent)
  if (explicit != null) return clampPercent(explicit)
  const overallCurrent = finiteNumber(task.overallCurrent)
  const overallTotal = finiteNumber(task.overallTotal)
  if (overallCurrent != null && overallTotal != null && overallTotal > 0) {
    return clampPercent((overallCurrent / overallTotal) * 100)
  }
  const current = finiteNumber(task.current)
  const total = finiteNumber(task.total)
  if (current != null && total != null && total > 0) {
    return clampPercent((current / total) * 100)
  }
  return null
}

function taskProgressLabel(task: CrawlerMonitorRegisteredTask) {
  const overallCurrent = finiteNumber(task.overallCurrent)
  const overallTotal = finiteNumber(task.overallTotal)
  if (overallCurrent != null && overallTotal != null && overallTotal > 0) {
    return `${formatNumber(overallCurrent)}/${formatNumber(overallTotal)}`
  }
  const current = finiteNumber(task.current)
  const total = finiteNumber(task.total)
  if (current != null && total != null && total > 0) {
    return `${formatNumber(current)}/${formatNumber(total)}`
  }
  const percent = taskProgressPercent(task)
  return percent == null ? '--' : formatPercent(percent)
}

function taskPendingLabel(task: CrawlerMonitorRegisteredTask) {
  const pending = finiteNumber(task.pending)
  if (pending != null) return formatNumber(pending)
  const overallCurrent = finiteNumber(task.overallCurrent)
  const overallTotal = finiteNumber(task.overallTotal)
  if (overallCurrent != null && overallTotal != null) return formatNumber(Math.max(0, overallTotal - overallCurrent))
  const current = finiteNumber(task.current)
  const total = finiteNumber(task.total)
  if (current != null && total != null) return formatNumber(Math.max(0, total - current))
  return '--'
}

function rowProgressBasis(row: ProgressRow | CrawlerMonitorAction | null | undefined) {
  if (!row) return null
  const payload = 'progressPayload' in row ? row.progressPayload || {} : {}
  const overallCurrent = finiteNumber(row.overallCurrent ?? payload.overallCurrent)
  const overallTotal = finiteNumber(row.overallTotal ?? payload.overallTotal)
  if (overallCurrent != null && overallTotal != null && overallTotal >= 0) {
    return {
      current: Math.min(Math.max(0, overallCurrent), overallTotal),
      total: overallTotal,
    }
  }

  const current = finiteNumber(row.current ?? payload.current)
  const total = finiteNumber(row.total ?? payload.total)
  if (current != null && total != null && total >= 0) {
    return {
      current: Math.min(Math.max(0, current), total),
      total,
    }
  }
  return null
}

function rowStartedAt(row: ProgressRow | null | undefined) {
  if (!row) return ''
  if (row.sourceQueueItem) return row.sourceQueueItem.startedAt || row.sourceQueueItem.requestedAt || ''
  return row.progressPayload?.startedAt || row.action?.startedAt || ''
}

function rowHeartbeatAt(row: ProgressRow | null | undefined) {
  if (!row) return ''
  if (row.sourceQueueItem) {
    return row.sourceQueueItem.completedAt || row.sourceQueueItem.startedAt || row.sourceQueueItem.requestedAt || ''
  }
  return row.progressHeartbeatAt
    || row.action?.lastHeartbeatAt
    || row.progressPayload?.lastHeartbeatAt
    || row.progressPayload?.generatedAt
    || row.progressUpdatedAt
    || row.updatedAt
    || row.action?.updatedAt
    || ''
}

function taskElapsedMs(row: ProgressRow | null | undefined) {
  if (!row) return null
  const startedAt = timestampMs(rowStartedAt(row))
  const heartbeatAt = timestampMs(rowHeartbeatAt(row))
  if (startedAt != null && heartbeatAt != null && heartbeatAt > startedAt) {
    return heartbeatAt - startedAt
  }
  return row.action ? actionElapsedMs(row.action) : null
}

function taskSpeedPerMinute(row: ProgressRow | null | undefined) {
  const basis = rowProgressBasis(row)
  if (!basis || basis.current <= 0) return null
  const elapsedMs = taskElapsedMs(row)
  if (elapsedMs == null || elapsedMs <= 0) return null
  return basis.current / (elapsedMs / 60_000)
}

function taskRemaining(row: ProgressRow | null | undefined) {
  const basis = rowProgressBasis(row)
  if (!basis) return null
  return Math.max(0, basis.total - basis.current)
}

function isPreviewableReportPath(path?: string | null) {
  const normalized = String(path || '').replace(/\\/g, '/').toLowerCase()
  if (!normalized) return false
  if (normalized.includes('*') || normalized.includes('?')) return false
  if (normalized.startsWith('reports/crawler-monitor/') && normalized.endsWith('.log')) return true
  const allowedRoot = normalized.startsWith('reports/') || normalized.startsWith('back/target/surefire-reports/')
  const allowedSuffix = ['.json', '.md', '.xml', '.txt'].some((suffix) => normalized.endsWith(suffix))
  return allowedRoot && allowedSuffix
}

function isPreviewableProgressPath(path?: string | null) {
  const normalized = String(path || '').replace(/\\/g, '/').toLowerCase()
  if (!normalized || normalized.startsWith('redis://')) return false
  if (normalized.includes('*') || normalized.includes('?')) return false
  return isPreviewableReportPath(path) || isPreviewableGeneratedJsonPath(path)
}

function isPreviewableGeneratedJsonPath(path?: string | null) {
  const normalized = String(path || '').replace(/\\/g, '/').toLowerCase()
  if (!normalized || normalized.startsWith('redis://')) return false
  if (normalized.includes('*') || normalized.includes('?')) return false
  if (normalized === 'data/generated/buff-page-evidence-cache') return true
  return normalized.endsWith('.json') && (
    normalized.startsWith('data/generated/')
    || normalized.startsWith('data/terrapedia/raw/wiki/')
  )
}

function dispatchBlockerLabel(result?: CrawlerMonitorDispatchResult | null) {
  if (!result) return '未返回阻塞者'
  return [
    result.blockedByDomain ? `域 ${result.blockedByDomain}` : '',
    result.blockedByActionId ? `动作 ${result.blockedByActionId}` : '',
    result.blockedByDispatchId ? `派发 ${result.blockedByDispatchId}` : '',
  ].filter(Boolean).join(' / ') || '未返回阻塞者'
}

function dispatchFeedbackMessage(result?: CrawlerMonitorDispatchResult | null) {
  if (!result) return ''
  if (result.status === 'locked') {
    const since = result.blockedSince ? `，开始于 ${formatDate(result.blockedSince)}` : ''
    const lock = result.lockPath ? `，锁文件 ${result.lockPath}` : ''
    return `已有 Wiki 监控任务占用：${dispatchBlockerLabel(result)}${since}${lock}。心跳过期不会自动重试，请先确认阻塞任务状态，必要时取消清理后再手动重新重爬。`
  }
  if (result.status === 'cooldown') {
    return '当前处于 Wiki 保护冷却期，页面只会在冷却条件真实命中时阻止派发。'
  }
  return result.message || statusLabel(result.status) || '已收到派发反馈'
}

function isMissingReportError(message?: string | null) {
  const normalized = String(message || '').toLowerCase()
  return normalized.includes('not found') || normalized.includes('missing') || normalized.includes('不存在') || normalized.includes('未找到')
}

function actionProgressPercent(action: CrawlerMonitorAction) {
  const explicit = Number(action.percent)
  if (Number.isFinite(explicit)) return clampPercent(explicit)
  const current = Number(action.current)
  const total = Number(action.total)
  if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
    return clampPercent((current / total) * 100)
  }
  return null
}

function actionSpeedLabel(action: CrawlerMonitorAction) {
  const speed = actionSpeedPerMinute(action)
  if (speed == null) return '--'
  const rounded = speed >= 10 ? Math.round(speed) : Math.round(speed * 10) / 10
  return `${rounded.toLocaleString('zh-CN')}/min`
}

function actionEtaLabel(action: CrawlerMonitorAction) {
  const remaining = actionRemaining(action)
  if (remaining == null) return '--'
  if (remaining <= 0) return '0s'
  const speed = actionSpeedPerMinute(action)
  if (speed == null || speed <= 0) return '--'
  return formatEtaDuration((remaining / speed) * 60_000)
}

function actionRemaining(action: CrawlerMonitorAction) {
  const basis = actionProgressBasis(action)
  if (!basis) return null
  return Math.max(0, basis.total - basis.current)
}

function actionProgressBasis(action: CrawlerMonitorAction) {
  const current = finiteNumber(action.current)
  const total = finiteNumber(action.total)
  if (current != null && total != null && total >= 0) {
    return {
      current: Math.min(Math.max(0, current), total),
      total,
    }
  }

  const overallCurrent = finiteNumber(action.overallCurrent)
  const overallTotal = finiteNumber(action.overallTotal)
  if (overallCurrent != null && overallTotal != null && overallTotal >= 0) {
    return {
      current: Math.min(Math.max(0, overallCurrent), overallTotal),
      total: overallTotal,
    }
  }
  return null
}

function actionSpeedPerMinute(action: CrawlerMonitorAction) {
  const basis = actionProgressBasis(action)
  if (!basis || basis.current <= 0) return null
  const elapsedMs = actionElapsedMs(action)
  if (elapsedMs == null || elapsedMs <= 0) return null
  return basis.current / (elapsedMs / 60_000)
}

function actionElapsedMs(action: CrawlerMonitorAction) {
  const startedAt = timestampMs(action.startedAt)
  const heartbeatAt = timestampMs(action.lastHeartbeatAt || action.updatedAt)
  if (startedAt != null && heartbeatAt != null && heartbeatAt > startedAt) {
    return heartbeatAt - startedAt
  }
  const durationMs = finiteNumber(action.durationMs)
  return durationMs != null && durationMs > 0 ? durationMs : null
}

function finiteNumber(value: number | string | null | undefined) {
  if (value == null || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function timestampMs(value: number | string | null | undefined) {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value))
}

function formatPercent(value: number) {
  const rounded = Math.round(value * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`
}

function formatNumber(value: number | string | null | undefined) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed.toLocaleString('zh-CN') : '0'
}

function formatDate(value: number | string | null | undefined) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatEtaDuration(value: number) {
  const ms = Number(value || 0)
  if (!Number.isFinite(ms) || ms <= 0) return '--'
  const seconds = Math.ceil(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  if (hours < 24) return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours ? `${days}d ${restHours}h` : `${days}d`
}

function formatElapsedDuration(value: number | null | undefined) {
  const ms = Number(value || 0)
  if (!Number.isFinite(ms) || ms <= 0) return '--'
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  if (hours < 24) return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours ? `${days}d ${restHours}h` : `${days}d`
}

function formatBytes(value: number | string | null | undefined) {
  const bytes = Number(value || 0)
  if (!Number.isFinite(bytes) || bytes <= 0) return '--'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`
}

function safeActionFallbackLabel(action?: CrawlerMonitorAction | null) {
  return action?.id || action?.runner || '--'
}
</script>

<style scoped>
.crawler-monitor {
  display: grid;
  gap: 12px;
}

.monitor-hero {
  align-items: flex-start;
}

.monitor-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px 12px;
  align-items: center;
}

.recovery-board {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  min-width: 0;
}

.recovery-main {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.focused-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg) 92%, var(--color-bg-secondary));
  box-shadow: 0 8px 24px rgb(15 23 42 / 5%);
}

.focused-topbar > div:first-child {
  min-width: 0;
}

.focused-topbar .page-head__title {
  margin: 1px 0 0;
  font-size: 22px;
  line-height: 1.12;
}

.focused-topbar .page-head__subtitle {
  max-width: 760px;
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.35;
}

.panel {
  min-width: 0;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-bg) 84%, var(--color-bg-secondary));
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
}

.panel-head h2,
.recovery-detail h2 {
  margin: 0;
  color: var(--color-text);
  font-size: 18px;
  line-height: 1.25;
}

.panel-head p,
.recovery-detail p {
  margin: 4px 0 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.48;
  overflow-wrap: anywhere;
}

.spin {
  animation: spin 1s linear infinite;
}

.stale-alert {
  display: flex;
  gap: 14px;
  padding: 16px;
  border: 1px solid #fecaca;
  border-radius: 16px;
  background: linear-gradient(135deg, #fff1f2, #fff7ed);
  color: #7f1d1d;
}

.stale-alert__icon {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 12px;
  background: #fee2e2;
  color: #b91c1c;
}

.stale-alert strong,
.stale-alert p,
.stale-alert code {
  display: block;
}

.stale-alert p {
  margin: 4px 0 0;
  color: #991b1b;
}

.stale-alert code {
  margin-top: 6px;
  color: #92400e;
  overflow-wrap: anywhere;
}

.auto-dispatch-card {
  align-content: start;
}

.auto-dispatch-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.auto-dispatch-toggle,
.auto-dispatch-interval {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  color: var(--color-text);
  font-size: 13px;
  font-weight: 800;
}

.auto-dispatch-toggle input {
  width: 18px;
  height: 18px;
  accent-color: var(--color-primary, #2563eb);
}

.auto-dispatch-interval input {
  width: 76px;
  min-height: 34px;
  padding: 5px 8px;
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 8px;
  color: var(--color-text);
  background: var(--color-bg);
  font: inherit;
}

.auto-dispatch-interval small {
  color: var(--color-text-secondary);
}

.wiki-workbench {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.wiki-live-panel,
.wiki-recovery-panel,
.wiki-detail-card,
.wiki-dispatch-feedback,
.wiki-command-preview {
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-bg) 82%, var(--color-bg-secondary));
}

.wiki-live-panel {
  display: grid;
  align-content: start;
  gap: 14px;
  padding: 16px;
}

.wiki-live-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.wiki-live-panel h2,
.wiki-live-panel h3,
.wiki-recovery-panel h3 {
  margin: 3px 0 0;
  color: var(--color-text);
  font-size: 22px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.wiki-live-panel p {
  margin: 8px 0 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.wiki-live-panel small {
  display: block;
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.wiki-live-percent {
  flex: 0 0 auto;
  color: var(--color-primary);
  font-size: 34px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.wiki-live-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.wiki-live-metrics span,
.wiki-path-strip {
  min-width: 0;
  padding: 9px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 76%, transparent);
}

.wiki-live-metrics small,
.wiki-live-metrics strong,
.wiki-path-strip span,
.wiki-path-strip code {
  display: block;
}

.wiki-live-metrics small,
.wiki-path-strip span {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 800;
}

.wiki-live-metrics strong,
.wiki-path-strip code {
  margin-top: 4px;
  color: var(--color-text);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.wiki-run-control-panel {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--color-primary, #2563eb) 34%, var(--color-border));
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-primary, #2563eb) 8%, var(--color-bg));
}

.wiki-run-control-panel strong,
.wiki-run-control-panel small {
  display: block;
}

.wiki-run-control-panel strong {
  color: var(--color-text);
  font-size: 14px;
}

.wiki-run-control-panel small {
  margin-top: 3px;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.35;
}

.wiki-run-control-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.wiki-run-control-buttons--disabled {
  padding: 8px;
  border: 1px dashed color-mix(in srgb, var(--color-warning, #d97706) 34%, var(--color-border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-warning, #d97706) 6%, transparent);
}

.wiki-run-control-button--primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--color-primary, #2563eb) 72%, transparent);
  border-radius: 8px;
  background: var(--color-primary, #2563eb);
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  font-weight: 900;
  gap: 6px;
  line-height: 1.2;
  transition: background 0.18s ease, border-color 0.18s ease, opacity 0.18s ease;
}

.wiki-run-control-button--primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-primary, #2563eb) 86%, #111827);
}

.wiki-run-control-button--primary:disabled,
.wiki-run-control-button--disabled {
  border-color: color-mix(in srgb, var(--color-border) 88%, transparent);
  background: color-mix(in srgb, var(--color-bg-secondary) 82%, var(--color-bg));
  color: var(--color-text-secondary);
  cursor: not-allowed;
  opacity: 0.72;
}

.wiki-recovery-panel {
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 16px;
  border-color: color-mix(in srgb, var(--color-primary) 22%, var(--color-border));
}

.wiki-recovery-panel p {
  margin: 7px 0 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.52;
  overflow-wrap: anywhere;
}

.wiki-recovery-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.wiki-recovery-hint {
  padding: 9px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg));
}

.wiki-command-preview,
.wiki-dispatch-feedback {
  padding: 11px;
}

.wiki-command-preview span,
.wiki-dispatch-feedback span {
  display: block;
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 800;
}

.wiki-command-preview code,
.wiki-dispatch-feedback dd {
  color: var(--color-text);
  font-size: 12px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.wiki-dispatch-feedback {
  display: grid;
  gap: 8px;
  border-color: color-mix(in srgb, #0ea5e9 28%, var(--color-border));
  background: color-mix(in srgb, #e0f2fe 34%, var(--color-bg));
}

.wiki-dispatch-feedback--muted {
  border-color: color-mix(in srgb, var(--color-border) 88%, transparent);
  background: color-mix(in srgb, var(--color-bg-secondary) 70%, var(--color-bg));
}

.wiki-dispatch-feedback strong {
  color: var(--color-text);
  font-size: 13px;
}

.wiki-dispatch-feedback dl {
  display: grid;
  gap: 6px;
  margin: 0;
}

.wiki-dispatch-feedback__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.wiki-dispatch-feedback div {
  min-width: 0;
}

.wiki-dispatch-feedback dt,
.wiki-dispatch-feedback dd {
  margin: 0;
}

.wiki-dispatch-feedback dt {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 800;
}

.wiki-domain-health-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  min-width: 0;
}

.wiki-domain-health-metrics span {
  min-width: 0;
  padding: 0;
  background: transparent;
}

.wiki-domain-health-metrics small,
.wiki-domain-health-metrics strong {
  display: block;
}

.wiki-domain-health-metrics small {
  color: var(--color-text-secondary);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0;
}

.wiki-domain-health-metrics strong {
  margin-top: 2px;
  color: var(--color-text);
  font-size: 10px;
  line-height: 1.18;
  overflow-wrap: anywhere;
}

.wiki-domain-detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.base-domain-orchestration {
  display: grid;
  gap: 12px;
  margin-top: 14px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--color-primary, #2563eb) 22%, var(--color-border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary, #2563eb) 5%, var(--color-bg));
}

.base-domain-orchestration__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.base-domain-orchestration__head strong,
.base-domain-orchestration__head span {
  display: block;
}

.base-domain-orchestration__head strong {
  color: var(--color-text);
  font-size: 15px;
}

.base-domain-orchestration__head span,
.base-domain-orchestration__head em {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-style: normal;
  font-weight: 800;
}

.base-domain-orchestration__rows {
  display: grid;
  gap: 8px;
}

.base-domain-flow-row {
  display: grid;
  grid-template-columns: minmax(168px, 0.28fr) minmax(0, 1fr);
  gap: 10px;
  min-width: 0;
}

.base-domain-flow-row__domain {
  display: grid;
  align-content: start;
  gap: 6px;
  min-width: 0;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
}

.base-domain-flow-row__domain small {
  color: var(--color-text-secondary);
  font-size: 10px;
  font-weight: 900;
}

.base-domain-flow-row__domain strong {
  overflow-wrap: anywhere;
  font-size: 13px;
}

.base-domain-flow-steps {
  display: grid;
  grid-template-columns: repeat(5, minmax(116px, 1fr));
  gap: 8px;
  min-width: 0;
}

.base-domain-flow-step {
  display: grid;
  align-content: start;
  gap: 5px;
  min-width: 0;
  min-height: 112px;
  padding: 9px;
  border: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 70%, var(--color-bg));
}

.base-domain-flow-step__label {
  color: var(--color-text-secondary);
  font-size: 10px;
  font-weight: 900;
}

.base-domain-flow-step strong,
.base-domain-flow-step small {
  min-width: 0;
  overflow-wrap: anywhere;
}

.base-domain-flow-step strong {
  color: var(--color-text);
  font-size: 12px;
}

.base-domain-flow-step small {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 1.35;
}

.base-domain-flow-step .inline-report-button {
  align-self: end;
  justify-self: start;
  min-height: 30px;
}

.domain-test-matrix {
  display: grid;
  gap: 12px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
}

.domain-test-matrix__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.domain-test-matrix__head strong {
  color: var(--color-text);
  font-size: 15px;
}

.domain-test-matrix__head span {
  flex: 0 0 auto;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 800;
}

.domain-test-matrix__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 10px;
}

.domain-test-card {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-surface) 78%, var(--color-bg));
}

.domain-test-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.domain-test-card__head strong {
  min-width: 0;
  color: var(--color-text);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.domain-test-card__head .status-pill {
  flex: 0 0 auto;
}

.domain-test-items {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.domain-test-items span {
  min-width: 0;
  padding: 7px 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 68%, transparent);
}

.domain-test-items small,
.domain-test-items strong {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
}

.domain-test-items small {
  color: var(--color-text-secondary);
  font-size: 10px;
  font-weight: 800;
}

.domain-test-items strong {
  margin-top: 3px;
  color: var(--color-text);
  font-size: 12px;
  font-weight: 800;
}

.domain-test-channel {
  display: grid;
  gap: 8px;
}

.domain-test-channel > strong {
  color: var(--color-text);
  font-size: 12px;
}

.base-domain-validation-collapsible {
  display: block;
  margin-top: 14px;
}

.base-domain-validation-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
  border-radius: 8px;
  background: var(--color-surface);
  cursor: pointer;
}

.base-domain-validation-summary strong,
.base-domain-validation-summary span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.base-domain-validation-summary strong {
  color: var(--color-text);
  font-size: 14px;
}

.base-domain-validation-summary span {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 800;
}

.data-quality-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.data-quality-cell {
  display: grid;
  gap: 3px;
  min-width: 0;
  min-height: 58px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
}

.data-quality-cell:disabled {
  cursor: default;
  opacity: 0.82;
}

.data-quality-cell small,
.data-quality-cell strong {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
}

.data-quality-cell small {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 800;
}

.data-quality-cell strong {
  color: var(--color-text);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.data-quality-cell.success {
  border-color: color-mix(in srgb, #059669 26%, var(--color-border));
  background: color-mix(in srgb, #d1fae5 54%, var(--color-bg));
}

.data-quality-cell.warning {
  border-color: color-mix(in srgb, #d97706 30%, var(--color-border));
  background: color-mix(in srgb, #fef3c7 62%, var(--color-bg));
}

.data-quality-cell.danger {
  border-color: color-mix(in srgb, #dc2626 32%, var(--color-border));
  background: color-mix(in srgb, #fee2e2 64%, var(--color-bg));
}

.data-quality-cell.muted {
  border-color: color-mix(in srgb, var(--color-border) 86%, transparent);
  background: color-mix(in srgb, var(--color-bg-secondary) 72%, var(--color-bg));
}

.recovery-detail {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
  gap: 14px;
}

.reason-list {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}

.reason-row {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 64%, transparent);
}

.reason-row span {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 800;
}

.reason-row strong {
  min-width: 0;
  color: var(--color-text);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.selected-domain-detail-block {
  margin-top: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 58%, transparent);
}

.selected-domain-detail-block > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px;
  cursor: pointer;
  list-style: none;
}

.selected-domain-detail-block > summary::-webkit-details-marker {
  display: none;
}

.selected-domain-detail-block > summary strong,
.selected-domain-detail-block > summary span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.selected-domain-detail-block > summary strong {
  color: var(--color-text);
  font-size: 13px;
}

.selected-domain-detail-block > summary span {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 800;
}

.selected-domain-detail-grid,
.selected-domain-validation-groups {
  display: grid;
  gap: 8px;
  padding: 0 10px 10px;
}

.selected-domain-detail-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.selected-domain-detail-grid span {
  min-width: 0;
  padding: 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg) 84%, transparent);
}

.selected-domain-detail-grid small,
.selected-domain-detail-grid strong {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
}

.selected-domain-detail-grid small {
  color: var(--color-text-secondary);
  font-size: 10px;
  font-weight: 800;
}

.selected-domain-detail-grid strong {
  margin-top: 3px;
  color: var(--color-text);
  font-size: 12px;
}

.selected-domain-validation-groups section {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.selected-domain-validation-groups h3 {
  margin: 0;
  color: var(--color-text);
  font-size: 13px;
}

.domain-test-items--selected {
  grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
}

.health-stack {
  align-content: start;
}

.wiki-detail-card {
  display: grid;
  gap: 5px;
  padding: 11px 12px;
}

.wiki-detail-card span {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 800;
}

.wiki-detail-card strong {
  color: var(--color-text);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.wiki-pending-compact {
  display: grid;
  gap: 10px;
}

.domain-table-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 8px;
  height: calc(100dvh - 132px);
  min-height: 560px;
  padding: 12px;
  overflow: hidden;
}

.single-screen-table-frame {
  min-height: 0;
  border: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent);
  border-radius: 8px;
  overflow: hidden;
}

.single-screen-table-frame .table-scroll {
  height: 100%;
  overflow: auto;
}

.domain-monitor-table {
  min-width: 1180px;
  border-collapse: separate;
  border-spacing: 0;
}

.domain-monitor-table tbody tr {
  cursor: pointer;
}

.domain-monitor-table tbody tr:hover,
.domain-monitor-table tbody tr.is-selected {
  background: color-mix(in srgb, var(--color-primary, #2563eb) 8%, var(--color-bg));
}

.domain-monitor-table__row--attention {
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--color-danger, #dc2626) 82%, transparent);
}

.domain-monitor-table__row--blocked,
.domain-monitor-table__row--queued {
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--color-warning, #d97706) 82%, transparent);
}

.domain-monitor-table__row--active {
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--color-info, #0284c7) 82%, transparent);
}

.domain-monitor-table td {
  vertical-align: top;
  padding-top: 8px;
  padding-bottom: 8px;
}

.domain-monitor-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: color-mix(in srgb, var(--color-bg-secondary) 88%, var(--color-bg));
}

.domain-monitor-table td:first-child {
  width: 150px;
}

.domain-monitor-table td:nth-child(3) {
  width: 130px;
}

.domain-monitor-table td:nth-child(4) {
  width: 170px;
}

.domain-monitor-table td:nth-child(5),
.domain-monitor-table td:nth-child(6) {
  width: 160px;
}

.domain-monitor-table td:nth-child(8) {
  width: 155px;
}

.domain-monitor-table .progress-track {
  margin-top: 5px;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-border) 72%, transparent);
}

.domain-monitor-table .progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.domain-monitor-table .progress-path-list {
  gap: 4px;
  margin-top: 4px;
}

.domain-monitor-table .inline-report-button--compact {
  min-height: 26px;
  padding: 3px 7px;
  border-radius: 6px;
  font-size: 11px;
}

.selected-domain-drawer__head {
  position: sticky;
  top: -18px;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  min-width: 0;
  padding: 0 0 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent);
  background: var(--color-bg);
}

.selected-domain-drawer__head h2 {
  margin: 3px 0 0;
  color: var(--color-text);
  font-size: 20px;
  line-height: 1.22;
  overflow-wrap: anywhere;
}

.selected-domain-drawer__head p {
  margin: 6px 0 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.selected-domain-config {
  grid-template-columns: minmax(0, 1fr);
}

.selected-domain-table-evidence {
  border-color: color-mix(in srgb, var(--color-primary) 18%, var(--color-border));
}

.single-screen-diagnostics {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.single-screen-diagnostics > details {
  min-width: 0;
}

.single-screen-diagnostics > details[open],
.single-screen-diagnostics__body {
  display: grid;
  gap: 12px;
}

.single-screen-diagnostics__entry {
  padding: 12px 14px;
}

.single-screen-diagnostics__entry > summary {
  min-height: 44px;
}

.single-screen-diagnostics__body {
  margin-top: 12px;
}

.wiki-pending-select {
  min-width: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.wiki-monitor-dispatch-queue {
  display: grid;
  gap: 12px;
}

.dispatch-queue-list {
  display: grid;
  gap: 10px;
}

.dispatch-queue-row {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(220px, 0.8fr) auto;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 80%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg) 80%, transparent);
}

.dispatch-queue-row__main {
  display: grid;
  gap: 5px;
  min-width: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.dispatch-queue-row__main > span {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.dispatch-queue-row__main strong,
.dispatch-queue-row__main small,
.dispatch-queue-row__main code {
  min-width: 0;
  overflow-wrap: anywhere;
}

.dispatch-queue-row__main strong {
  color: var(--color-text);
  font-size: 14px;
}

.dispatch-queue-row__main small,
.dispatch-queue-row__main code {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.dispatch-queue-row__blocker {
  color: var(--color-warning);
  font-weight: 700;
}

.dispatch-queue-row__meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  min-width: 0;
}

.dispatch-queue-row__meta span {
  min-width: 0;
  padding: 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 82%, transparent);
}

.dispatch-queue-row__meta small,
.dispatch-queue-row__meta strong {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
}

.dispatch-queue-row__meta small {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 800;
}

.dispatch-queue-row__meta strong {
  margin-top: 3px;
  color: var(--color-text);
  font-size: 12px;
}

.monitor-observability {
  display: grid;
  gap: 14px;
}

.runtime-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  min-width: 0;
}

.runtime-summary-card {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 72%, var(--color-bg));
}

.runtime-summary-card small,
.runtime-summary-card strong,
.runtime-summary-card em {
  min-width: 0;
  overflow-wrap: anywhere;
}

.runtime-summary-card small {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 800;
}

.runtime-summary-card strong {
  color: var(--color-text);
  font-size: 16px;
}

.runtime-summary-card em {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-style: normal;
}

.observability-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.observability-grid--dialog {
  align-content: start;
  overflow: auto;
  padding-right: 4px;
}

.runtime-domain-index {
  display: grid;
  gap: 10px;
  min-width: 0;
  min-height: 0;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 70%, var(--color-bg));
}

.runtime-domain-index--primary {
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
}

.runtime-domain-table {
  min-width: 0;
  max-height: 420px;
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent);
  border-radius: 8px;
  background: var(--color-bg);
}

.runtime-domain-index--primary .runtime-domain-table {
  height: 100%;
  max-height: none;
}

.runtime-domain-table table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
}

.runtime-domain-table th,
.runtime-domain-table td {
  padding: 8px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 68%, transparent);
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.35;
  text-align: left;
  vertical-align: top;
}

.runtime-domain-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: color-mix(in srgb, var(--color-bg-secondary) 88%, var(--color-bg));
  color: var(--color-text);
  font-size: 11px;
  font-weight: 800;
}

.runtime-domain-row {
  cursor: pointer;
}

.runtime-domain-row:hover {
  background: color-mix(in srgb, var(--color-primary) 7%, var(--color-bg));
}

.runtime-domain-row__select {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  font-weight: 800;
  text-align: left;
}

.runtime-domain-table code,
.runtime-domain-index__reason {
  color: var(--color-text-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.runtime-domain-index__reason {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.runtime-auxiliary-details {
  display: grid;
  min-width: 0;
  max-height: min(320px, 40vh);
  overflow: auto;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 48%, var(--color-bg));
}

.runtime-auxiliary-details:not([open]) {
  overflow: hidden;
}

.runtime-auxiliary-details[open] {
  gap: 12px;
}

.observability-block,
.auto-dispatch-card {
  display: grid;
  align-content: start;
  gap: 10px;
  min-width: 0;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 70%, var(--color-bg));
}

.observability-block__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.observability-block__head strong {
  color: var(--color-text);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.observability-block__head span {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.state-list {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.state-list--compact {
  max-height: 176px;
  overflow: auto;
}

.state-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px 8px;
  min-width: 0;
  padding: 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg) 76%, transparent);
}

.state-row--button {
  width: 100%;
  border: 0;
  cursor: pointer;
  text-align: left;
}

.state-row--button:hover {
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg));
}

.state-row--button:disabled {
  cursor: default;
  opacity: 0.64;
}

.runtime-report-row {
  min-height: 44px;
}

.state-row span,
.state-row small,
.state-row code {
  min-width: 0;
  color: var(--color-text-secondary);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.state-row span {
  font-weight: 800;
}

.state-row strong {
  min-width: 0;
  color: var(--color-text);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.state-row small,
.state-row code {
  grid-column: 1 / -1;
}

.compact-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  gap: 8px;
  min-width: 0;
}

.compact-metrics span {
  min-width: 0;
  padding: 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg) 76%, transparent);
}

.compact-metrics small,
.compact-metrics strong {
  display: block;
  overflow-wrap: anywhere;
}

.compact-metrics small {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 800;
}

.compact-metrics strong {
  margin-top: 3px;
  color: var(--color-text);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.wiki-monitor-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
}

.wiki-approval-list,
.wiki-domain-grid {
  display: grid;
  gap: 10px;
}

.wiki-approval-list__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.wiki-approval-row,
.wiki-domain-card {
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 78%, var(--color-bg));
}

.wiki-approval-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px;
}

.wiki-approval-row div,
.wiki-domain-card {
  min-width: 0;
}

.wiki-approval-row small,
.wiki-domain-card p,
.wiki-domain-card small {
  color: var(--color-text-secondary);
}

.wiki-approval-row code,
.wiki-domain-card code {
  display: block;
  margin-top: 6px;
  overflow-wrap: anywhere;
  color: var(--color-text-muted);
  white-space: normal;
}

.noise-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 1 auto;
  flex-wrap: wrap;
  max-width: 100%;
  min-width: 0;
  gap: 6px;
}

.noise-delete-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-height: 28px;
  max-width: 100%;
  padding: 3px 8px;
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  border-radius: 999px;
  color: var(--color-text-secondary);
  background: color-mix(in srgb, var(--color-bg) 82%, transparent);
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.2;
  white-space: nowrap;
}

.noise-delete-button:hover {
  color: var(--color-danger);
  border-color: color-mix(in srgb, var(--color-danger) 36%, var(--color-border));
  background: color-mix(in srgb, var(--color-danger) 10%, var(--color-bg));
}

.wiki-domain-grid {
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
}

.wiki-domain-card {
  display: grid;
  gap: 10px;
  min-width: 0;
  overflow: hidden;
  padding: 12px;
}

.wiki-domain-card__head,
.wiki-domain-card__actions,
.wiki-domain-card__progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.wiki-domain-card__head > div:first-child {
  min-width: 0;
}

.wiki-domain-card__head > div:first-child strong,
.wiki-domain-card__head > div:first-child small {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
}

.wiki-domain-card__flow {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  min-width: 0;
}

.wiki-domain-card__flow-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  min-height: 34px;
  padding: 7px 9px;
  border: 1px solid color-mix(in srgb, currentColor 22%, var(--color-border));
  border-radius: 8px;
  background: color-mix(in srgb, currentColor 7%, var(--color-bg));
  font-size: 12px;
  font-weight: 800;
  line-height: 1.25;
}

.wiki-domain-card__flow-item svg {
  flex: 0 0 auto;
}

.wiki-domain-card__flow-item span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.wiki-domain-card__meta-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
  margin: 0;
}

.wiki-domain-card__meta-item {
  display: inline-flex;
  align-items: baseline;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  padding: 5px 8px;
  border: 1px solid color-mix(in srgb, var(--color-border) 76%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--color-bg-secondary) 60%, transparent);
}

.wiki-domain-card__meta-item--wide {
  flex: 1 1 100%;
}

.wiki-domain-card__meta-item dt,
.wiki-domain-card__meta-item dd {
  margin: 0;
}

.wiki-domain-card__meta-item dt {
  flex: 0 0 auto;
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 800;
}

.wiki-domain-card__meta-item dt::after {
  content: ":";
  margin: 0 4px 0 2px;
}

.wiki-domain-card__meta-value {
  min-width: 0;
  color: var(--color-text);
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.wiki-domain-card__progress {
  display: grid;
  gap: 8px;
}

.wiki-domain-card__progress-head {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.wiki-domain-card__reason {
  min-width: 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.wiki-domain-card__path {
  display: -webkit-box;
  min-width: 0;
  overflow: hidden;
  overflow-wrap: anywhere;
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.ops-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.ops-card__label {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.ops-card__title {
  color: var(--color-text);
  font-size: 18px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.ops-card__text {
  min-height: 38px;
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.ops-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.ops-metrics span {
  min-width: 0;
  padding: 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg) 74%, transparent);
}

.ops-metrics small,
.ops-metrics strong {
  display: block;
}

.ops-metrics small {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.ops-metrics strong {
  margin-top: 3px;
  color: var(--color-text);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.task-list,
.path-list {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.task-list,
.path-list {
  max-height: 220px;
  overflow: auto;
  padding-right: 2px;
}

.task-row,
.path-row {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg) 78%, transparent);
}

.task-row {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
}

.task-row strong,
.task-row small,
.path-row strong,
.path-row small,
.path-row code {
  display: block;
  overflow-wrap: anywhere;
}

.task-row strong,
.path-row strong {
  color: var(--color-text);
  font-size: 13px;
}

.task-row small,
.path-row small,
.path-row code {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.path-token {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.path-token code {
  min-width: 0;
  flex: 1 1 180px;
}

.empty-line {
  padding: 12px;
  border: 1px dashed color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 8px;
  color: var(--color-text-secondary);
  font-size: 13px;
  text-align: center;
}

.monitor-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

.monitor-main {
  display: grid;
  align-content: start;
  gap: 16px;
}

.monitor-panel {
  min-width: 0;
}

.action-rail {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.action-card {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 86%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-bg) 82%, var(--color-bg-secondary));
}

.action-card__head,
.action-card__meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.action-card__head {
  align-items: flex-start;
  flex-wrap: wrap;
}

.action-card__meta {
  align-items: center;
}

.action-card__head strong {
  min-width: 0;
  flex: 1 1 160px;
  overflow-wrap: anywhere;
}

.action-card__meta {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.action-card__queue {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  gap: 8px;
}

.action-card__queue span {
  min-width: 0;
  padding: 8px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-bg-secondary) 82%, transparent);
}

.action-card__queue small,
.action-card__queue strong {
  display: block;
}

.action-card__queue small {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.action-card__queue strong {
  margin-top: 3px;
  color: var(--color-text);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.action-card__source {
  display: block;
  color: var(--color-text-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
  white-space: normal;
}

.action-card__paths {
  display: grid;
  gap: 4px;
}

.action-card__message {
  min-height: 18px;
  margin: -4px 0 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.action-card__message span {
  display: inline-flex;
  margin-right: 6px;
  color: var(--color-text);
  font-weight: 800;
}

.progress-track {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-border) 72%, transparent);
}

.progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  min-height: 28px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.domain-flow-pill {
  flex-shrink: 0;
  min-width: max-content;
  white-space: nowrap;
}

.success {
  color: #166534;
  background: #dcfce7;
}

.danger {
  color: #b91c1c;
  background: #fee2e2;
}

.warning {
  color: #92400e;
  background: #fef3c7;
}

.info {
  color: #075985;
  background: #e0f2fe;
}

.muted {
  color: #475569;
  background: #e2e8f0;
}

.table-scroll {
  overflow-x: auto;
}

.monitor-table {
  width: 100%;
  min-width: 1040px;
  border-collapse: collapse;
}

.monitor-table th,
.monitor-table td {
  padding: 13px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  text-align: left;
  vertical-align: top;
}

.monitor-table th {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.monitor-table td strong,
.monitor-table td small,
.monitor-table td code {
  display: block;
}

.monitor-table td small,
.monitor-table td code {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
  white-space: normal;
}

.progress-path-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-width: 320px;
}

.progress-path-list .inline-report-button {
  min-height: 30px;
  padding: 5px 8px;
}

.table-empty {
  color: var(--color-text-secondary);
  text-align: center;
}

.inline-report-button,
.icon-close-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  border: 1px solid color-mix(in srgb, var(--color-border) 86%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg) 90%, transparent);
  color: var(--color-text);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.inline-report-button {
  flex-shrink: 0;
  padding: 0 10px;
}

.inline-report-button--compact {
  margin-top: 8px;
  min-height: 32px;
}

.inline-report-button--danger {
  border-color: color-mix(in srgb, #dc2626 34%, var(--color-border));
  color: #b91c1c;
  background: color-mix(in srgb, #fef2f2 72%, var(--color-bg));
}

.inline-report-button--warning {
  border-color: color-mix(in srgb, #d97706 36%, var(--color-border));
  color: #92400e;
  background: color-mix(in srgb, #fffbeb 76%, var(--color-bg));
}

.inline-report-button:disabled {
  cursor: wait;
  opacity: 0.62;
}

.icon-close-button {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  padding: 0;
}

.report-preview-shell {
  position: fixed;
  inset: var(--header-height) 0 0 var(--sidebar-width);
  z-index: var(--z-page-popover);
  display: flex;
  justify-content: flex-end;
  background: rgb(15 23 42 / 42%);
}

.runtime-dialog-shell {
  position: fixed;
  inset: var(--header-height) 0 0 var(--sidebar-width);
  z-index: var(--z-page-popover);
  display: flex;
  justify-content: flex-end;
  background: rgb(15 23 42 / 42%);
}

.report-preview {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.runtime-dialog {
  display: grid;
  gap: 14px;
  width: min(980px, calc(100vw - 24px));
  height: 100%;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
}

.report-preview-drawer {
  width: min(760px, calc(100vw - 24px));
  height: 100%;
  grid-template-rows: auto auto minmax(0, 1fr);
  padding: 20px;
  border-left: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  background: var(--color-bg);
  box-shadow: -24px 0 48px rgb(15 23 42 / 22%);
}

.runtime-dialog.report-preview-drawer {
  width: min(980px, calc(100vw - 24px));
}

.report-preview__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.report-preview__head > div {
  min-width: 0;
}

.report-preview__head strong,
.report-preview__head small {
  display: block;
  overflow-wrap: anywhere;
}

.report-preview__head strong {
  color: var(--color-text);
}

.report-preview__head small {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.report-preview__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.report-preview__content,
.report-preview__empty {
  min-height: 0;
  overflow: auto;
  margin: 0;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 64%, var(--color-bg));
  color: var(--color-text);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.report-preview__empty {
  color: var(--color-text-secondary);
  white-space: normal;
}

.wiki-workbench__cooldown,
.wiki-workbench__warning {
  display: grid;
  gap: 6px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 68%, var(--color-bg));
}

.wiki-workbench__cooldown span,
.wiki-workbench__warning span {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 800;
}

.wiki-workbench__cooldown p,
.wiki-workbench__warning p {
  margin: 0;
  color: var(--color-text);
  line-height: 1.55;
}

.cancel-confirm-panel {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.48);
}

.cancel-confirm-panel__body {
  width: min(620px, 100%);
  display: grid;
  gap: 16px;
  padding: 22px;
  border: 1px solid color-mix(in srgb, var(--color-danger) 34%, transparent);
  border-radius: 8px;
  background: var(--color-bg);
  box-shadow: var(--shadow-xl);
}

.cancel-confirm-panel__body h2,
.cancel-confirm-panel__body p {
  margin: 0;
}

.cancel-confirm-panel__body p {
  color: var(--color-text);
  line-height: 1.6;
}

.cancel-confirm-panel__body ul {
  display: grid;
  gap: 8px;
  margin: 0;
  padding-left: 18px;
}

.cancel-confirm-panel__body code {
  overflow-wrap: anywhere;
}

.cancel-confirm-panel__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.empty-block {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 28px;
  border: 1px dashed color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 16px;
  color: var(--color-text-secondary);
  text-align: center;
}

.empty-block strong {
  color: var(--color-text);
}

.empty-block--compact {
  padding: 18px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1180px) {
  .recovery-board {
    grid-template-columns: 1fr;
  }

  .wiki-workbench {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 980px) {
  .runtime-dialog-shell,
  .report-preview-shell {
    inset: var(--header-height) 0 0 0;
  }

  .focused-topbar,
  .wiki-workbench {
    grid-template-columns: 1fr;
  }

  .focused-topbar {
    display: grid;
  }

  .wiki-live-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .recovery-detail {
    grid-template-columns: 1fr;
  }

  .wiki-approval-row {
    grid-template-columns: 1fr;
  }

  .dispatch-queue-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .panel-head,
  .wiki-live-panel__head {
    display: grid;
  }

  .wiki-live-percent {
    font-size: 28px;
  }

  .wiki-live-metrics,
  .wiki-domain-detail-grid,
  .dispatch-queue-row__meta {
    grid-template-columns: 1fr;
  }

  .reason-row {
    grid-template-columns: 1fr;
  }

  .monitor-actions {
    width: 100%;
  }

  .monitor-actions .btn {
    flex: 1 1 100%;
  }

  .report-preview-drawer {
    width: 100vw;
    padding: 16px;
  }
}

.inline-report-button--not-previewable {
  cursor: default;
  opacity: 0.45;
}

.health-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 0 2px;
}

.health-signal {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: default;
  white-space: nowrap;
}

.health-signal.success { background: var(--color-success-bg, #d1fae5); color: var(--color-success, #065f46); }
.health-signal.warning { background: var(--color-warning-bg, #fef3c7); color: var(--color-warning, #92400e); }
.health-signal.danger  { background: var(--color-danger-bg,  #fee2e2); color: var(--color-danger,  #991b1b); }
.health-signal.info    { background: var(--color-info-bg,    #dbeafe); color: var(--color-info,    #1e40af); }
.health-signal.muted   { background: var(--color-muted-bg,   #f3f4f6); color: var(--color-muted,   #6b7280); }

.obs-collapsible > summary {
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.obs-collapsible > summary::-webkit-details-marker {
  display: none;
}

.obs-collapsible > summary::before {
  content: '▶';
  font-size: 0.7em;
  opacity: 0.5;
  flex-shrink: 0;
  width: 1em;
}

.obs-collapsible[open] > summary::before {
  content: '▼ ';
}

.monitor-detail-collapsible > summary {
  padding: 0;
  margin-bottom: 0;
}

.monitor-detail-collapsible[open] > summary {
  margin-bottom: 16px;
}

/* =====================================================================
   紧凑工作台重皮层 (compact workbench redesign)
   只新增、不删除：靠后写覆盖前写，保留全部布局与契约锁定规则。
   目标：暖纸青绿主题一致、密度更紧、表面更干净、层级更清晰。
   ===================================================================== */

/* —— 状态色：暖色对齐主题，告别冷蓝/冷灰 —— */
.success { color: #0f7a52; background: rgba(5, 150, 105, 0.13); }
.danger  { color: #b3261e; background: rgba(220, 38, 38, 0.11); }
.warning { color: #9a5b06; background: rgba(217, 119, 6, 0.16); }
.info    { color: #06699e; background: rgba(2, 132, 199, 0.13); }
.muted   { color: #5f594f; background: #ebe6dd; }

/* —— 状态药丸：统一加圆点标识 + 更紧凑（保留契约锁定的省略号/不换行）—— */
.status-pill {
  gap: 5px;
  min-height: 24px;
  padding: 2px 9px;
  font-size: 11.5px;
}
.status-pill::before {
  content: "";
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

/* —— 进度条：实色填充，轨道更暖，看得清 —— */
.progress-track { background: #e6e0d6; }
.progress-track span.success { background: var(--color-success); }
.progress-track span.danger  { background: var(--color-danger); }
.progress-track span.warning { background: var(--color-warning); }
.progress-track span.info    { background: var(--color-info); }
.progress-track span.muted   { background: var(--color-text-muted); }

/* —— 顶栏 / 主面板：干净白面 + 暖阴影 + 统一圆角 —— */
.focused-topbar {
  border-color: var(--color-border);
  border-radius: 12px;
  background: var(--color-surface-2);
  box-shadow: var(--shadow-sm);
}
.focused-topbar .page-head__title { font-size: 20px; }
.panel {
  border-color: var(--color-border);
  border-radius: 12px;
  background: var(--color-surface-2);
}
.panel-head h2,
.recovery-detail h2 { font-size: 16px; }
.stale-alert { border-radius: 12px; }

/* —— Wiki 选中域工作台：干净白卡 + 收紧标题字号 —— */
.wiki-live-panel,
.wiki-recovery-panel,
.wiki-detail-card,
.wiki-dispatch-feedback,
.wiki-command-preview {
  border-color: var(--color-border);
  border-radius: 12px;
  background: var(--color-surface-2);
}
.wiki-live-panel h2,
.wiki-live-panel h3,
.wiki-recovery-panel h3 { font-size: 16px; }
.wiki-live-percent { font-size: 28px; }
.wiki-recovery-panel {
  border-color: color-mix(in srgb, var(--color-primary) 26%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 5%, var(--color-surface-2));
}
.wiki-dispatch-feedback {
  border-color: color-mix(in srgb, var(--color-info) 26%, var(--color-border));
  background: color-mix(in srgb, var(--color-info) 7%, var(--color-surface-2));
}
.wiki-dispatch-feedback--muted {
  border-color: var(--color-border);
  background: var(--color-surface-muted);
}
.selected-domain-drawer__head h2 { font-size: 18px; }

/* —— 内嵌指标格 / 元数据格 / 行块：统一暖灰底 —— */
.wiki-live-metrics span,
.wiki-path-strip,
.selected-domain-detail-grid span,
.dispatch-queue-row__meta span,
.compact-metrics span,
.action-card__queue span,
.ops-metrics span,
.domain-test-items span,
.state-row,
.reason-row,
.task-row,
.path-row {
  border: 1px solid var(--color-border-light);
  border-radius: 8px;
  background: var(--color-surface-muted);
}

/* —— 卡片类容器：干净白面 + 统一圆角 —— */
.dispatch-queue-row,
.runtime-summary-card,
.observability-block,
.auto-dispatch-card,
.runtime-domain-index,
.domain-test-card,
.base-domain-flow-row__domain,
.selected-domain-detail-block {
  border-color: var(--color-border);
  border-radius: 10px;
  background: var(--color-surface-2);
}
.action-card {
  border-color: var(--color-border);
  border-radius: 12px;
  background: var(--color-surface-2);
}
.base-domain-flow-step { background: var(--color-surface-muted); }

/* —— 数据质量格：暖色 tone —— */
.data-quality-cell {
  border: 1px solid var(--color-border);
  background: var(--color-surface-2);
}
.data-quality-cell.success {
  border-color: color-mix(in srgb, var(--color-success) 24%, var(--color-border));
  background: color-mix(in srgb, var(--color-success) 9%, var(--color-surface-2));
}
.data-quality-cell.warning {
  border-color: color-mix(in srgb, var(--color-warning) 26%, var(--color-border));
  background: color-mix(in srgb, var(--color-warning) 11%, var(--color-surface-2));
}
.data-quality-cell.danger {
  border-color: color-mix(in srgb, var(--color-danger) 26%, var(--color-border));
  background: color-mix(in srgb, var(--color-danger) 9%, var(--color-surface-2));
}
.data-quality-cell.muted {
  border-color: var(--color-border);
  background: var(--color-surface-muted);
}

/* —— 按钮：统一干净 chrome + 悬停反馈，更紧凑 —— */
.inline-report-button,
.icon-close-button {
  min-height: 30px;
  border-color: var(--color-border);
  border-radius: 8px;
  background: var(--color-surface-2);
  font-weight: 700;
  transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}
.inline-report-button:hover:not(:disabled),
.icon-close-button:hover { background: var(--color-bg-hover); }
.icon-close-button { width: 34px; height: 34px; }
.inline-report-button--danger {
  border-color: color-mix(in srgb, var(--color-danger) 36%, var(--color-border));
  color: #b3261e;
  background: color-mix(in srgb, var(--color-danger) 8%, var(--color-surface-2));
}
.inline-report-button--warning {
  border-color: color-mix(in srgb, var(--color-warning) 36%, var(--color-border));
  color: #9a5b06;
  background: color-mix(in srgb, var(--color-warning) 10%, var(--color-surface-2));
}

/* —— 数据表：更紧凑、表头更克制 —— */
.monitor-table th,
.monitor-table td { padding: 10px 12px; }
.monitor-table th { font-size: 11px; letter-spacing: 0.04em; }
.domain-monitor-table td { padding-top: 8px; padding-bottom: 8px; }
.ops-card__title { font-size: 16px; }
.base-domain-orchestration__head strong,
.domain-test-matrix__head strong { font-size: 14px; }

/* —— 报告预览抽屉：暖阴影 —— */
.report-preview-drawer { box-shadow: -24px 0 48px rgba(28, 25, 23, 0.18); }
.report-preview__content,
.report-preview__empty {
  border-color: var(--color-border);
  background: var(--color-surface-muted);
}

/* —— 次级"诊断与验收"区：轻微压暗，和主排障区分层 —— */
.single-screen-diagnostics__entry { background: var(--color-surface-muted); }

/* =====================================================================
   内联工作台结构层（抽屉/弹层/折叠 → 内联平铺，对齐设计稿）
   ===================================================================== */

/* 域表格去单屏固定高，改为自然流 */
.domain-table-panel {
  grid-template-rows: auto auto;
  height: auto;
  min-height: 0;
  max-height: none;
  overflow: visible;
}
.single-screen-table-frame { overflow: visible; }

/* 诊断区与各内联区之间留白 */
.recovery-main { gap: 12px; }
.single-screen-diagnostics { gap: 12px; margin-top: 4px; }
.single-screen-diagnostics__body { display: grid; gap: 12px; }

/* 选中域内联面板：青绿强调卡（替代原抽屉） */
.selected-domain-inline {
  margin-top: 2px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 28%, var(--color-border));
  border-radius: 12px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 8%, var(--color-surface-2)), var(--color-surface-2) 42%);
  box-shadow: var(--shadow-card);
}
/* 头部在内联流中不再粘顶 */
.selected-domain-inline .selected-domain-drawer__head {
  position: static;
  top: auto;
  padding: 0 0 10px;
  background: transparent;
}

/* 诊断区标题头 */
.diagnostics-zone__head {
  margin: 6px 2px 0;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}

/* 健康条：暖色圆角标签横排（轻量、信息密度高） */
.health-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding: 2px 0;
}
.health-signal {
  min-height: 26px;
  padding: 4px 11px;
  border-radius: var(--radius-full);
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 700;
}

/* 系统诊断内联：去掉弹层用的限高与滚动 */
.system-diagnostics-inline .runtime-domain-index { border: 0; padding: 0; background: transparent; }
.runtime-auxiliary-details { max-height: none; overflow: visible; padding: 0; border: 0; background: transparent; }
.runtime-auxiliary-details__head { margin: 6px 0 4px; }
.observability-grid--dialog { overflow: visible; padding-right: 0; }
.runtime-domain-index--primary .runtime-domain-table { max-height: 360px; }

/* 顶部分区 Tab（药丸式分页签） */
.monitor-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  width: fit-content;
  max-width: 100%;
  margin: 2px 0 2px;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface-muted);
}
.monitor-tab {
  appearance: none;
  border: 0;
  border-radius: var(--radius-full);
  padding: 7px 16px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  transition: background 0.15s ease, color 0.15s ease;
}
.monitor-tab:hover { color: var(--color-text); }
.monitor-tab--active {
  background: var(--color-surface-2);
  color: var(--color-primary-dark);
  box-shadow: var(--shadow-sm);
}
.monitor-tab-panel { display: grid; gap: 12px; min-width: 0; }
.single-screen-diagnostics { margin-top: 0; }

/* =====================================================================
   全局紧凑密度层（缩小整体尺寸、提高信息密度、长文本限高）
   末尾追加，覆盖前面规则；避开契约锁定的布局值
   ===================================================================== */
.crawler-monitor { font-size: 12px; }

/* 标题与正文整体降一档 */
.focused-topbar .page-head__title { font-size: 17px; }
.focused-topbar .page-head__subtitle { font-size: 12px; margin-top: 2px; }
.section-card__title,
.panel-head h2,
.panel-head h3,
.recovery-detail h2 { font-size: 13px; }
.section-card__subtitle,
.section-card__subtitle-note,
.panel-head p,
.recovery-detail p { font-size: 11px; margin-top: 2px; line-height: 1.4; }
.wiki-live-panel h2,
.wiki-live-panel h3,
.wiki-recovery-panel h3,
.selected-domain-drawer__head h2 { font-size: 14px; }
.wiki-live-panel p { font-size: 11.5px; margin-top: 4px; }
.wiki-live-percent { font-size: 24px; }
.ops-card__title { font-size: 14px; }
.base-domain-orchestration__head strong,
.domain-test-matrix__head strong { font-size: 13px; }

/* 卡片 / 面板 / 容器 padding 收紧 */
.focused-topbar { padding: 10px 12px; }
.panel { padding: 12px; }
.card { padding: 11px; }
.section-card { }
.wiki-live-panel,
.wiki-recovery-panel { padding: 12px; gap: 10px; }
.selected-domain-inline { padding: 12px; gap: 10px; }
.observability-block,
.auto-dispatch-card,
.runtime-domain-index,
.runtime-summary-card,
.domain-test-card,
.dispatch-queue-row { padding: 10px; }
.action-card { padding: 11px; gap: 9px; }
.recovery-main { gap: 10px; }
.single-screen-diagnostics__body,
.monitor-tab-panel { gap: 10px; }

/* 指标格 / 行块更紧 + 字号降一档 */
.wiki-live-metrics,
.selected-domain-detail-grid,
.dispatch-queue-row__meta,
.compact-metrics,
.action-card__queue,
.ops-metrics,
.domain-test-items { gap: 6px; }
.wiki-live-metrics span,
.wiki-path-strip,
.selected-domain-detail-grid span,
.dispatch-queue-row__meta span,
.compact-metrics span,
.action-card__queue span,
.ops-metrics span,
.domain-test-items span,
.state-row,
.reason-row,
.runtime-summary-card { padding: 6px 8px; }
.wiki-live-metrics strong,
.selected-domain-detail-grid strong,
.compact-metrics strong,
.dispatch-queue-row__meta strong { font-size: 11.5px; }
.runtime-summary-card strong { font-size: 14px; }
.data-quality-cell strong { font-size: 14px; }
.data-quality-cell { min-height: 50px; padding: 7px 9px; }
.base-domain-flow-step { min-height: 92px; padding: 7px; }

/* 表格行更紧凑 */
.monitor-table th,
.monitor-table td { padding: 7px 10px; }
.monitor-table td strong { font-size: 12px; }
.monitor-table td small,
.monitor-table td code { font-size: 11px; margin-top: 2px; }
.runtime-domain-table th,
.runtime-domain-table td { padding: 6px 9px; font-size: 11px; }
.domain-monitor-table td { padding-top: 6px; padding-bottom: 6px; }

/* 按钮更小 */
.inline-report-button,
.icon-close-button { min-height: 28px; font-size: 11.5px; }
.inline-report-button--compact { min-height: 24px; }
.btn { min-height: 30px; font-size: 11.5px; }
.monitor-tab { padding: 6px 13px; font-size: 12px; }

/* —— 长文本限高截断，避免日志/路径/原因撑高卡片 —— */
.runtime-domain-index__reason,
.action-card__message,
.dispatch-queue-row__main small,
.wiki-domain-card__reason,
.reason-row strong,
.state-row small {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.wiki-path-strip code,
.dispatch-queue-row__main code,
.state-row code,
.wiki-command-preview code {
  display: block;
  max-height: 3.4em;
  overflow: auto;
}
/* 报告预览与空态：限制最大高度，内部滚动 */
/* 报告/日志预览：抽屉是整屏高，内容吃满剩余高度（不再强压 320px） */
.report-preview__content { max-height: none; height: 100%; font-size: 12px; line-height: 1.55; }
.report-preview-drawer { width: min(960px, calc(100vw - 24px)); }
.report-preview__empty { font-size: 11.5px; }
/* 任务进度明细表横向滚动区限高，长列表内部滚动 */
.single-screen-diagnostics .table-scroll { max-height: 460px; overflow: auto; }

/* =====================================================================
   块密度层 2：卡片/瓦片/格子更密更小，信息更集中
   ===================================================================== */

/* 内嵌指标瓦片：更小 padding、更小字、去多余高度 */
.wiki-live-metrics span,
.selected-domain-detail-grid span,
.dispatch-queue-row__meta span,
.compact-metrics span,
.action-card__queue span,
.ops-metrics span,
.domain-test-items span,
.wiki-detail-card,
.runtime-summary-card,
.state-row,
.reason-row { padding: 5px 7px; border-radius: 6px; }
.wiki-live-metrics small,
.selected-domain-detail-grid small,
.dispatch-queue-row__meta small,
.compact-metrics small,
.action-card__queue small,
.ops-metrics small,
.domain-test-items small,
.wiki-detail-card span,
.runtime-summary-card small { font-size: 10px; }
.wiki-live-metrics strong,
.selected-domain-detail-grid strong,
.dispatch-queue-row__meta strong,
.compact-metrics strong,
.action-card__queue strong,
.ops-metrics strong,
.domain-test-items strong,
.wiki-detail-card strong { font-size: 11px; margin-top: 1px; }

/* 指标网格列更多更密 */
.wiki-live-metrics { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 5px; }
.selected-domain-detail-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; }
.compact-metrics { grid-template-columns: repeat(auto-fit, minmax(78px, 1fr)); gap: 5px; }
.runtime-summary-grid { grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 6px; }
.data-quality-grid { grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 6px; }
.domain-test-items { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; }
.domain-test-matrix__grid { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; }

/* 数据质量瓦片更扁 */
.data-quality-cell { min-height: 0; padding: 6px 8px; }
.data-quality-cell strong { font-size: 13px; }
.data-quality-cell small { font-size: 10px; }

/* 基础域编排步骤瓦片更密 */
.base-domain-orchestration { padding: 10px; gap: 8px; }
.base-domain-flow-row { gap: 7px; }
.base-domain-flow-steps { gap: 5px; }
.base-domain-flow-step { min-height: 0; padding: 6px 7px; gap: 3px; }
.base-domain-flow-step__label { font-size: 9px; }
.base-domain-flow-step strong { font-size: 11px; }
.base-domain-flow-step small { font-size: 10px; line-height: 1.3; }
.base-domain-flow-row__domain { padding: 7px; gap: 4px; }

/* 域测试卡更紧 */
.domain-test-card { padding: 9px; gap: 7px; }
.domain-test-card__head strong { font-size: 12px; }

/* 执行总览卡更紧 */
.action-card { padding: 9px; gap: 7px; }
.action-card__head strong { font-size: 12px; }
.action-card__meta { font-size: 11px; }

/* 队列行更紧 */
.dispatch-queue-row { padding: 8px 9px; gap: 9px; }
.dispatch-queue-row__main strong { font-size: 12px; }
.dispatch-queue-row__main small,
.dispatch-queue-row__main code { font-size: 11px; }

/* 选中域内联面板内部留白再收 */
.selected-domain-inline { gap: 8px; }
.wiki-live-panel,
.wiki-recovery-panel { padding: 11px; gap: 9px; }
.wiki-run-control-panel { padding: 9px; gap: 8px; }
.wiki-detail-card { padding: 8px 9px; gap: 3px; }

/* 健康条标签更小 */
.health-signal { min-height: 22px; padding: 3px 9px; font-size: 11px; }

/* 状态药丸再小一档 */
.status-pill { min-height: 20px; padding: 1px 8px; font-size: 11px; }
.status-pill::before { width: 5px; height: 5px; }

/* 运行态辅助网格列更密 */
.observability-grid--dialog { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 9px; }
</style>
