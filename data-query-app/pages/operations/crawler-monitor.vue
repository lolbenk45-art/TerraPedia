<template>
  <div class="page-wrap page-workspace crawler-monitor crawler-monitor-v4">
    <section class="status-strip" aria-live="polite">
      <div class="status-strip__main">
        <span class="status-dot" :class="`status-dot--${v4StatusStrip.tone}`" aria-hidden="true"></span>
        <div>
          <strong>{{ v4StatusStrip.title }}</strong>
          <small>{{ v4StatusStrip.subtitle }}</small>
        </div>
      </div>
      <div class="status-strip__actions">
        <span v-for="chip in v4StatusStrip.chips" :key="chip.label" class="status-pill" :class="chip.tone">
          {{ chip.label }}
        </span>
        <button type="button" class="btn btn-plain btn-plain--danger" :disabled="forceReclaimAllLoading" @click="forceReclaimAllRunningDispatches">
          <TimerReset :size="16" />
          <span>{{ forceReclaimAllLoading ? '清理中' : '清空运行/队列' }}</span>
        </button>
        <button type="button" class="btn btn-secondary" :aria-busy="loading" :aria-disabled="loading" @click="loadOverview">
          <RefreshCw :size="16" />
          <span>刷新状态</span>
        </button>
      </div>
    </section>

    <section class="metric-row" aria-label="核心监控指标">
      <article v-for="metric in v4MetricCards" :key="metric.key" class="metric">
        <small>{{ metric.label }}</small>
        <strong>{{ metric.value }}</strong>
        <span>{{ metric.note }}</span>
      </article>
    </section>

    <nav class="module-tabs" aria-label="爬取监控模块">
      <button
        v-for="panel in monitorPanels"
        :key="panel.key"
        type="button"
        class="module-tab"
        :class="{ active: activeMonitorPanel === panel.key }"
        @click="setActiveMonitorPanel(panel.key)"
      >
        <span>{{ panel.label }}</span>
        <span v-if="panel.count !== '' && panel.count != null" class="module-tab__count">{{ panel.count }}</span>
      </button>
    </nav>

    <section class="section-card module-stage-shell">
      <div class="stage" :class="{ switching: panelSwitching }">
        <div class="view-head">
          <div>
            <h3>{{ activeMonitorPanelMeta.title }}</h3>
            <p>{{ activeMonitorPanelMeta.subtitle }}</p>
          </div>
          <span class="status-pill" :class="v4StatusStrip.tone">{{ activeMonitorPanelMeta.badge }}</span>
        </div>

        <section v-show="activeMonitorPanel === 'overview'" class="monitor-panel-stage monitor-panel-stage--overview">
          <div class="overview-layout">
            <div class="domain-table">
              <table class="monitor-table">
                <thead>
                  <tr>
                    <th>域</th>
                    <th>状态</th>
                    <th>进度</th>
                    <th>下一步</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in domainTableRows"
                    :key="selectedDomainTableRowKey(row)"
                    class="domain-row"
                    :class="[`domain-row--${row.diagnosisGroup}`, { selected: selectedDomainTableRow && selectedDomainTableRowKey(selectedDomainTableRow) === selectedDomainTableRowKey(row) }]"
                    @click="selectDomainTableRow(row)"
                  >
                    <td>
                      <strong>{{ row.label }}</strong>
                      <small>{{ row.domain || row.actionId || '未知域' }}</small>
                    </td>
                    <td>
                      <div class="domain-status-cell">
                        <span class="status-pill" :class="statusTone(domainRowStatus(row) || row.risk)">{{ domainRowStatusLabel(row) }}</span>
                        <small>{{ row.diagnosisTitle }}</small>
                      </div>
                    </td>
                    <td>
                      <strong>{{ row.progressLabel }}</strong>
                      <div class="progress-track">
                        <span :style="{ width: rowProgress(row.progressRow) }" :class="statusTone(row.status)" />
                      </div>
                    </td>
                    <td>
                      <strong>{{ domainRowNextActionLabel(row) }}</strong>
                    </td>
                    <td>
                      <div class="domain-actions">
                        <button v-if="canResumeDomainTableRow(row)" type="button" class="btn btn-plain" @click.stop="resumeDomainTableRow(row)">
                          <Play :size="14" />
                          <span>继续运行</span>
                        </button>
                        <button v-if="canCancelDomainTableRunningRow(row)" type="button" class="btn btn-plain btn-plain--danger" @click.stop="cancelDomainTableRunningRow(row)">
                          <CircleStop :size="14" />
                          <span>终止运行</span>
                        </button>
                        <button v-if="canCancelDomainTableQueuedRow(row)" type="button" class="btn btn-plain btn-plain--danger" @click.stop="cancelDomainTableQueuedRow(row)">
                          <X :size="14" />
                          <span>取消排队</span>
                        </button>
                        <button v-if="canStartDomainTableRow(row)" type="button" class="btn btn-plain" @click.stop="startDomainTableRow(row)">
                          <RefreshCw :size="14" />
                          <span>提交正式派发</span>
                        </button>
                        <button v-if="shouldOfferDomainRowForceReclaim(row)" type="button" class="btn btn--reclaim btn-plain btn-plain--danger" @click.stop="forceReclaimDomainTableRow(row)">
                          <TimerReset :size="14" />
                          <span>强制回收</span>
                        </button>
                        <button type="button" class="btn btn-plain" @click.stop="selectDomainTableRow(row)">
                          <Eye :size="14" />
                          <span>查看证据</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="!domainTableRows.length">
                    <td colspan="5" class="table-empty">暂无域状态。</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <aside v-if="selectedDomainTableRow" class="current-card">
              <header class="current-head">
                <div>
                  <span class="status-pill" :class="statusTone(domainRowStatus(selectedDomainTableRow) || selectedDomainTableRow.risk)">
                    {{ selectedDomainStatusLabel }}
                  </span>
                  <h4>{{ selectedDomainDisplayName }}</h4>
                  <p>{{ selectedDomainOperatorSummary }}</p>
                </div>
                <button type="button" class="btn btn-plain" @click="openReportPreview(domainRowEvidencePath(selectedDomainTableRow) || selectedWikiReportPath || selectedWikiProgressPath)">
                  查看证据
                </button>
              </header>

              <div class="kv-grid">
                <div class="kv"><small>当前进度</small><strong>{{ selectedWikiProgressNumbers }}</strong></div>
                <div class="kv"><small>阻塞/占用</small><strong>{{ domainRowBlockerLabel(selectedDomainTableRow) || selectedDomainTableRow.queueSummary }}</strong></div>
                <div class="kv"><small>最近心跳</small><strong>{{ selectedDomainHeartbeatMessage }}</strong></div>
                <div class="kv"><small>建议动作</small><strong>{{ domainRowNextActionLabel(selectedDomainTableRow) }}</strong></div>
                <div class="kv"><small>队列详情</small><strong>{{ selectedDomainTableRow.ownerLabel || selectedDomainTableRow.queueSummary }}</strong></div>
                <div class="kv"><small>进程</small><strong>{{ selectedDomainTableRow.pid ? `PID ${selectedDomainTableRow.pid}` : '无 PID' }}</strong></div>
                <div class="kv"><small>补充说明</small><strong>{{ selectedDomainTableRow.rankReason || selectedDomainTableRow.reason || '暂无补充' }}</strong></div>
              </div>

              <div v-if="selectedDomainTableVisibleEvidenceFiles.length || selectedDomainTableLogEvidenceFiles.length" class="evidence-row progress-path-list">
                <button
                  v-for="file in selectedDomainTableVisibleEvidenceFiles"
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
                <button
                  v-if="selectedDomainTableLogEvidenceFiles.length"
                  type="button"
                  class="inline-report-button inline-report-button--compact"
                  @click="toggleQueueItemLogs(selectedDomainTableLogKey)"
                >
                  <span>{{ showQueueItemLogs(selectedDomainTableLogKey) ? '隐藏日志' : '显示日志' }}</span>
                </button>
                <template v-if="selectedDomainTableLogEvidenceFiles.length && showQueueItemLogs(selectedDomainTableLogKey)">
                  <button
                    v-for="file in selectedDomainTableLogEvidenceFiles"
                    :key="`selected-domain-log-${file.label}-${file.path}`"
                    type="button"
                    class="inline-report-button inline-report-button--compact"
                    :class="{ 'inline-report-button--not-previewable': !isPreviewableReportPath(file.path) }"
                    :disabled="!isPreviewableReportPath(file.path)"
                    :title="isPreviewableReportPath(file.path) ? file.path : '此日志不支持预览'"
                    @click="openReportPreview(file.path)"
                  >
                    <span>{{ file.label }}</span>
                  </button>
                </template>
              </div>
              <div v-else class="evidence-row">
                <span class="file-chip">暂无证据</span>
              </div>

              <section v-if="selectedWikiDomain" class="wiki-domain-control-strip" aria-label="正式域手动派发">
                <div class="wiki-domain-control-strip__copy">
                  <strong>正式派发</strong>
                  <small>{{ selectedWikiOperationHint }}</small>
                  <small class="wiki-domain-control-strip__impact">
                    影响域：{{ selectedWikiCoveredDomainLabels }}
                    <template v-if="selectedWikiSharedActionWarning"> · {{ selectedWikiSharedActionWarning }}</template>
                  </small>
                </div>
                <div class="wiki-domain-control-actions">
                  <button
                    type="button"
                    class="inline-report-button inline-report-button--compact wiki-domain-control-primary"
                    :disabled="selectedWikiPrimaryActionDisabled"
                    @click="handleSelectedWikiDomainPrimaryAction"
                  >
                    <component :is="selectedWikiPrimaryActionIcon" :size="14" :class="{ spin: selectedWikiActionLoading }" />
                    <span>{{ selectedDomainNextActionLabel }}</span>
                  </button>
                  <button
                    v-if="selectedWikiCanCancel"
                    type="button"
                    class="inline-report-button inline-report-button--compact inline-report-button--danger"
                    :disabled="selectedWikiActionLoading"
                    @click="openCancelConfirm(selectedWikiDomain)"
                  >
                    <CircleStop :size="14" />
                    <span>终止任务</span>
                  </button>
                </div>
              </section>
            </aside>
          </div>
        </section>

        <section v-show="activeMonitorPanel === 'queue'" class="monitor-panel-stage monitor-panel-stage--queue">
          <div class="grid-queue">
            <div class="queue-list">
              <section class="queue-group queue-group--active">
                <header class="queue-group-head">
                  <div>
                    <h4>正在运行</h4>
                    <p>运行、排队、暂停或等待占用释放的未结束项。</p>
                  </div>
                  <span class="status-pill info">{{ formatNumber(activeExecutionOverviewRows.length) }} 项</span>
                </header>
                <article v-for="row in activeExecutionOverviewRows" :key="`active-execution-${row.key}`" class="queue-card">
                  <small class="queue-time">{{ executionOverviewTiming(row) }}</small>
                  <div class="queue-meta">
                    <strong>{{ row.primaryLabel }}</strong>
                    <span class="status-pill" :class="statusTone(row.displayStatus || row.status)">{{ statusLabel(row.displayStatus || row.status) }}</span>
                  </div>
                  <small>{{ row.secondaryLabel }}</small>
                  <div class="progress-track">
                    <span :style="{ width: executionOverviewProgress(row) }" :class="statusTone(row.displayStatus || row.status)" />
                  </div>
                  <div class="queue-primary-insight">
                    <span><small>进度</small><strong>{{ executionOverviewProgressNumbers(row) }}</strong></span>
                    <span><small>建议动作</small><strong>{{ executionOverviewNextAction(row) }}</strong></span>
                  </div>
                  <details class="queue-card-details">
                    <summary>工程详情</summary>
                    <p v-if="row.message" class="queue-message">{{ row.message }}</p>
                    <p v-if="executionOverviewStatusReason(row)" class="queue-message" :class="{ 'queue-message--warning': executionOverviewHasConflict(row) }">{{ executionOverviewStatusReason(row) }}</p>
                    <p v-if="row.heartbeatSummary" class="queue-message queue-message--warning">{{ row.heartbeatSummary }}</p>
                    <div class="queue-insight-grid">
                      <span><small>状态来源</small><strong>{{ executionOverviewStatusSource(row) }}</strong></span>
                      <span><small>队列标识</small><strong>{{ executionOverviewQueueIdentity(row) }}</strong></span>
                      <span><small>阻塞</small><strong>{{ executionOverviewBlocker(row) }}</strong></span>
                      <span><small>时间</small><strong>{{ executionOverviewTiming(row) }}</strong></span>
                    </div>
                  </details>
                  <button type="button" class="inline-report-button inline-report-button--compact" @click="selectExecutionOverviewRow(row)">
                    <Eye :size="14" />
                    <span>查看</span>
                  </button>
                </article>
                <div v-if="!activeExecutionOverviewRows.length" class="empty-block empty-block--compact">
                  <Activity :size="20" />
                  <span>暂无正在运行的执行项。</span>
                </div>
              </section>

              <section class="queue-group queue-group--history">
                <header class="queue-group-head">
                  <div>
                    <h4>已处理/异常</h4>
                    <p>失败、超时、停滞、取消或已处理完的追溯项。</p>
                  </div>
                  <span class="status-pill muted">{{ formatNumber(historicalExecutionOverviewRows.length) }} 项</span>
                </header>
                <article v-for="row in historicalExecutionOverviewRows" :key="`history-execution-${row.key}`" class="queue-card queue-card--history">
                  <small class="queue-time">{{ executionOverviewTiming(row) }}</small>
                  <div class="queue-meta">
                    <strong>{{ row.primaryLabel }}</strong>
                    <span class="status-pill" :class="statusTone(row.displayStatus || row.status)">{{ statusLabel(row.displayStatus || row.status) }}</span>
                  </div>
                  <small>{{ row.secondaryLabel }}</small>
                  <div class="progress-track">
                    <span :style="{ width: executionOverviewProgress(row) }" :class="statusTone(row.displayStatus || row.status)" />
                  </div>
                  <div class="queue-primary-insight">
                    <span><small>进度</small><strong>{{ executionOverviewProgressNumbers(row) }}</strong></span>
                    <span><small>建议动作</small><strong>{{ executionOverviewNextAction(row) }}</strong></span>
                  </div>
                  <details class="queue-card-details">
                    <summary>工程详情</summary>
                    <p v-if="row.message" class="queue-message">{{ row.message }}</p>
                    <p v-if="executionOverviewStatusReason(row)" class="queue-message" :class="{ 'queue-message--warning': executionOverviewHasConflict(row) }">{{ executionOverviewStatusReason(row) }}</p>
                    <p v-if="row.heartbeatSummary" class="queue-message queue-message--warning">{{ row.heartbeatSummary }}</p>
                    <div class="queue-insight-grid">
                      <span><small>状态来源</small><strong>{{ executionOverviewStatusSource(row) }}</strong></span>
                      <span><small>队列标识</small><strong>{{ executionOverviewQueueIdentity(row) }}</strong></span>
                      <span><small>阻塞</small><strong>{{ executionOverviewBlocker(row) }}</strong></span>
                      <span><small>时间</small><strong>{{ executionOverviewTiming(row) }}</strong></span>
                    </div>
                  </details>
                  <button type="button" class="inline-report-button inline-report-button--compact" @click="selectExecutionOverviewRow(row)">
                    <Eye :size="14" />
                    <span>查看</span>
                  </button>
                </article>
                <div v-if="!historicalExecutionOverviewRows.length" class="empty-block empty-block--compact">
                  <Activity :size="20" />
                  <span>暂无已处理或异常执行项。</span>
                </div>
              </section>
              <div v-if="!executionOverviewRows.length" class="empty-block empty-block--compact">
                <Activity :size="20" />
                <span>暂无需关注执行项。</span>
              </div>
            </div>

            <aside class="side-panel">
              <section class="summary-card wiki-monitor-dispatch-queue" aria-label="wiki-monitor-dispatch-queue">
                <div class="queue-side-head">
                  <div>
                    <h4>队列明细</h4>
                    <p>只显示正在排队、运行或堵塞的队列项；终态结果和运行文件统一进入任务进度明细。</p>
                  </div>
                  <span class="status-pill" :class="activeDispatchQueueRows.length ? 'warning' : 'muted'">{{ activeDispatchQueueRows.length }} 项</span>
                </div>
                <div v-if="activeDispatchQueueRows.length" class="dispatch-queue-list">
                  <article v-for="item in dispatchQueueRows" :key="item.queueId || item.dispatchId || `${item.domain}-${item.actionId}`" class="dispatch-queue-row queue-card">
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
                    <button v-if="canCancelQueuedItem(item)" type="button" class="inline-report-button inline-report-button--compact inline-report-button--danger" :disabled="queueControlLoading === item.queueId" @click="cancelQueuedDispatchItem(item)">
                      <X :size="14" />
                      <span>{{ queueControlLoading === item.queueId ? '处理中' : '取消排队' }}</span>
                    </button>
                    <button v-if="canCancelRunningQueueItem(item)" type="button" class="inline-report-button inline-report-button--compact inline-report-button--danger" :disabled="queueControlLoading === item.queueId" @click="cancelRunningDispatchItem(item)">
                      <CircleStop :size="14" />
                      <span>{{ queueControlLoading === item.queueId ? '处理中' : queueItemStatus(item) === 'paused' ? '终止暂停' : '终止运行' }}</span>
                    </button>
                  </article>
                </div>
                <div v-else class="empty-block empty-block--compact">
                  <Activity :size="20" />
                  <span>尚无正在排队、运行或堵塞的队列项。</span>
                </div>
              </section>
            </aside>
          </div>
        </section>

        <section v-show="activeMonitorPanel === 'progress'" class="monitor-panel-stage monitor-panel-stage--progress">
          <div class="grid-progress">
            <div class="task-list">
              <section class="progress-group progress-group--active">
                <header class="progress-group-head">
                  <div>
                    <h4>正在运行</h4>
                    <p>当前运行、排队、暂停或等待占用释放的任务。</p>
                  </div>
                  <span class="status-pill info">{{ formatNumber(activeProgressRows.length) }} 项</span>
                </header>
                <article v-for="row in activeProgressRows" :key="`active-row-${row.rowKey}`" class="task-card">
                  <div class="progress-card-head">
                    <div>
                      <strong>{{ progressRowTitle(row) }}</strong>
                      <small>{{ progressRowDomainLabel(row) }} · {{ progressRowActionLabel(row) }}</small>
                    </div>
                    <span class="status-pill" :class="statusTone(progressRowEffectiveStatus(row))">{{ progressRowStatusLabel(row) }}</span>
                  </div>
                  <small class="progress-card-subtitle">{{ progressRowLaneLabel(row) }} · {{ rowProgressLabel(row) }} · {{ rowHeartbeatLabel(row) }}</small>
                  <div class="progress-track">
                    <span :style="{ width: rowProgress(row) }" :class="statusTone(progressRowEffectiveStatus(row))" />
                  </div>
                  <div class="progress-primary-insight">
                    <span><small>进度</small><strong>{{ rowProgressLabel(row) }}</strong></span>
                    <span><small>建议动作</small><strong>{{ progressRowNextActionLabel(row) }}</strong></span>
                  </div>
                  <div v-if="progressRowStateConflictLabel(row)" class="progress-state-conflict">
                    <div>
                      <small>状态冲突</small>
                      <strong>{{ progressRowStateConflictLabel(row) }}</strong>
                    </div>
                    <button
                      type="button"
                      class="inline-report-button inline-report-button--compact inline-report-button--warning"
                      :aria-busy="loading"
                      :aria-disabled="loading"
                      @click="loadOverview"
                    >
                      <RefreshCw :size="14" />
                      <span>{{ progressRowSyncActionLabel(row) }}</span>
                    </button>
                  </div>
                  <details class="progress-card-details">
                    <summary>工程详情</summary>
                    <div class="progress-insight-grid">
                      <span><small>状态来源</small><strong>{{ progressRowStatusSource(row) }}</strong></span>
                      <span><small>队列状态</small><strong>{{ progressRowQueueStateLabel(row) }}</strong></span>
                      <span><small>影响域</small><strong>{{ progressRowCoveredDomainLabels(row) }}</strong></span>
                    </div>
                    <div class="kv-grid">
                      <div class="kv"><small>待处理</small><strong>{{ rowPendingLabel(row) }}</strong></div>
                      <div class="kv"><small>速度</small><strong>{{ rowSpeedLabel(row) }}</strong></div>
                      <div class="kv"><small>预计剩余</small><strong>{{ rowEtaLabel(row) }}</strong></div>
                      <div class="kv"><small>运行时长</small><strong>{{ formatElapsedDuration(taskElapsedMs(row)) }}</strong></div>
                    </div>
                    <div v-if="progressRowVisiblePathEntries(row).length" class="progress-path-list">
                      <button
                        v-for="entry in progressRowVisiblePathEntries(row)"
                        :key="`${row.rowKey}-${entry.label}`"
                        type="button"
                        class="inline-report-button inline-report-button--compact"
                        :class="{ 'inline-report-button--not-previewable': !isPreviewableReportPath(entry.path) && !isPreviewableProgressPath(entry.path) && !isPreviewableGeneratedJsonPath(entry.path) }"
                        :disabled="!isPreviewableReportPath(entry.path) && !isPreviewableProgressPath(entry.path) && !isPreviewableGeneratedJsonPath(entry.path)"
                        :title="(!isPreviewableReportPath(entry.path) && !isPreviewableProgressPath(entry.path) && !isPreviewableGeneratedJsonPath(entry.path)) ? '此路径不支持预览' : entry.path"
                        @click="openReportPreview(entry.path)"
                      >
                        <span>{{ entry.label }}</span>
                      </button>
                      <button
                        v-if="progressRowLogPathEntries(row).length"
                        type="button"
                        class="inline-report-button inline-report-button--compact"
                        @click="toggleQueueItemLogs(progressRowQueueLogKey(row))"
                      >
                        <span>{{ showQueueItemLogs(progressRowQueueLogKey(row)) ? '隐藏日志' : '显示日志' }}</span>
                      </button>
                      <span v-else class="file-chip file-chip--muted">日志已隐藏</span>
                    </div>
                    <div v-if="progressRowLogPathEntries(row).length && showQueueItemLogs(progressRowQueueLogKey(row))" class="progress-path-list progress-path-list--logs">
                      <button
                        v-for="entry in progressRowLogPathEntries(row)"
                        :key="`${row.rowKey}-log-${entry.path}`"
                        type="button"
                        class="inline-report-button inline-report-button--compact"
                        :class="{ 'inline-report-button--not-previewable': !isPreviewableReportPath(entry.path) }"
                        :disabled="!isPreviewableReportPath(entry.path)"
                        :title="isPreviewableReportPath(entry.path) ? entry.path : '此日志不支持预览'"
                        @click="openReportPreview(entry.path)"
                      >
                        <span>{{ entry.label }}</span>
                      </button>
                    </div>
                  </details>
                  <div v-if="progressRowControlButtons(row).length" class="progress-control-row">
                    <button
                      v-for="control in progressRowControlButtons(row)"
                      :key="`${row.rowKey}-${control.action}`"
                      type="button"
                      class="inline-report-button inline-report-button--compact"
                      :class="{ 'inline-report-button--danger': control.action === 'cancel' }"
                      :disabled="progressControlLoading === progressRowControlKey(row)"
                      @click="controlProgressTask(row, control.action)"
                    >
                      <component :is="control.icon" :size="14" :class="{ spin: progressControlLoading === progressRowControlKey(row) }" />
                      <span>{{ control.label }}</span>
                    </button>
                  </div>
                </article>
                <div v-if="!activeProgressRows.length" class="empty-block empty-block--compact">
                  <Activity :size="20" />
                  <span>暂无正在运行的进度。</span>
                </div>
              </section>

              <section class="progress-group progress-group--history">
                <header class="progress-group-head">
                  <div>
                    <h4>历史与异常</h4>
                    <p>失败、超时、完成、取消和不再运行的进度，作为追溯项保留。</p>
                  </div>
                  <span class="status-pill muted">{{ formatNumber(historicalProgressRows.length) }} 项</span>
                </header>
                <article v-for="row in historicalProgressRows" :key="`history-row-${row.rowKey}`" class="task-card task-card--history">
                  <div class="progress-card-head">
                    <div>
                      <strong>{{ progressRowTitle(row) }}</strong>
                      <small>{{ progressRowDomainLabel(row) }} · {{ progressRowActionLabel(row) }}</small>
                    </div>
                    <span class="status-pill" :class="statusTone(progressRowEffectiveStatus(row))">{{ progressRowStatusLabel(row) }}</span>
                  </div>
                  <small class="progress-card-subtitle">{{ progressRowLaneLabel(row) }} · {{ rowProgressLabel(row) }} · {{ rowHeartbeatLabel(row) }}</small>
                  <div class="progress-track">
                    <span :style="{ width: rowProgress(row) }" :class="statusTone(progressRowEffectiveStatus(row))" />
                  </div>
                  <div class="progress-primary-insight">
                    <span><small>进度</small><strong>{{ rowProgressLabel(row) }}</strong></span>
                    <span><small>建议动作</small><strong>{{ progressRowNextActionLabel(row) }}</strong></span>
                  </div>
                  <details class="progress-card-details">
                    <summary>工程详情</summary>
                    <div class="progress-insight-grid">
                      <span><small>状态来源</small><strong>{{ progressRowStatusSource(row) }}</strong></span>
                      <span><small>队列状态</small><strong>{{ progressRowQueueStateLabel(row) }}</strong></span>
                      <span><small>影响域</small><strong>{{ progressRowCoveredDomainLabels(row) }}</strong></span>
                    </div>
                    <div class="kv-grid">
                      <div class="kv"><small>待处理</small><strong>{{ rowPendingLabel(row) }}</strong></div>
                      <div class="kv"><small>速度</small><strong>{{ rowSpeedLabel(row) }}</strong></div>
                      <div class="kv"><small>预计剩余</small><strong>{{ rowEtaLabel(row) }}</strong></div>
                      <div class="kv"><small>运行时长</small><strong>{{ formatElapsedDuration(taskElapsedMs(row)) }}</strong></div>
                    </div>
                    <div v-if="progressRowVisiblePathEntries(row).length" class="progress-path-list">
                      <button
                        v-for="entry in progressRowVisiblePathEntries(row)"
                        :key="`${row.rowKey}-${entry.label}`"
                        type="button"
                        class="inline-report-button inline-report-button--compact"
                        :class="{ 'inline-report-button--not-previewable': !isPreviewableReportPath(entry.path) && !isPreviewableProgressPath(entry.path) && !isPreviewableGeneratedJsonPath(entry.path) }"
                        :disabled="!isPreviewableReportPath(entry.path) && !isPreviewableProgressPath(entry.path) && !isPreviewableGeneratedJsonPath(entry.path)"
                        :title="(!isPreviewableReportPath(entry.path) && !isPreviewableProgressPath(entry.path) && !isPreviewableGeneratedJsonPath(entry.path)) ? '此路径不支持预览' : entry.path"
                        @click="openReportPreview(entry.path)"
                      >
                        <span>{{ entry.label }}</span>
                      </button>
                      <button
                        v-if="progressRowLogPathEntries(row).length"
                        type="button"
                        class="inline-report-button inline-report-button--compact"
                        @click="toggleQueueItemLogs(progressRowQueueLogKey(row))"
                      >
                        <span>{{ showQueueItemLogs(progressRowQueueLogKey(row)) ? '隐藏日志' : '显示日志' }}</span>
                      </button>
                      <span v-else class="file-chip file-chip--muted">日志已隐藏</span>
                    </div>
                    <div v-if="progressRowLogPathEntries(row).length && showQueueItemLogs(progressRowQueueLogKey(row))" class="progress-path-list progress-path-list--logs">
                      <button
                        v-for="entry in progressRowLogPathEntries(row)"
                        :key="`${row.rowKey}-log-${entry.path}`"
                        type="button"
                        class="inline-report-button inline-report-button--compact"
                        :class="{ 'inline-report-button--not-previewable': !isPreviewableReportPath(entry.path) }"
                        :disabled="!isPreviewableReportPath(entry.path)"
                        :title="isPreviewableReportPath(entry.path) ? entry.path : '此日志不支持预览'"
                        @click="openReportPreview(entry.path)"
                      >
                        <span>{{ entry.label }}</span>
                      </button>
                    </div>
                  </details>
                </article>
                <div v-if="!historicalProgressRows.length" class="empty-block empty-block--compact">
                  <Activity :size="20" />
                  <span>暂无历史或异常进度。</span>
                </div>
              </section>
              <div v-if="!progressDetailRowsByPriority.length" class="empty-block empty-block--compact">
                <Activity :size="20" />
                <span>暂无进度行。</span>
              </div>
            </div>
            <aside class="side-panel">
              <div class="summary-card">
                <h4>进度规则</h4>
                <p>这里仅展示后端真实进度和心跳，不拆出推算阶段百分比。</p>
              </div>
              <div class="diag-card" :class="executionOverviewStatusLabel === 'success' ? 'accent' : statusTone(executionOverviewStatusLabel)">
                <small>当前执行状态</small>
                <strong>{{ statusLabel(executionOverviewStatusLabel) }}</strong>
                <small>执行项 {{ executionOverviewRows.length }} 项</small>
              </div>
            </aside>
          </div>
        </section>

        <section v-show="activeMonitorPanel === 'reports'" class="monitor-panel-stage monitor-panel-stage--reports">
          <div class="grid-reports">
            <div class="report-list">
              <button
                v-for="report in recentReportRows"
                :key="report.path || report.name"
                type="button"
                class="report-item"
                :class="{ active: selectedReportPath === report.path, 'inline-report-button--not-previewable': !isPreviewableReportPath(report.path) }"
                :disabled="!isPreviewableReportPath(report.path)"
                :title="isPreviewableReportPath(report.path) ? report.path : '此报告不支持预览'"
                @click="openReportPreview(report.path)"
              >
                <span class="status-pill" :class="reportTone(report.category)">{{ report.category || '报告' }}</span>
                <strong>{{ report.name || report.path || '未命名报告' }}</strong>
                <small>{{ formatDate(report.updatedAt) }} · {{ formatBytes(report.sizeBytes) }}</small>
              </button>
              <p v-if="!recentReportRows.length" class="empty-line">暂无报告</p>
            </div>
            <div>
              <div class="section-head">
                <div>
                  <h4 class="section-title">报告预览</h4>
                  <p class="section-subtitle">主页面只放摘要；完整路径和内容在右侧抽屉。</p>
                </div>
                <button type="button" class="btn btn-secondary" :disabled="!selectedReportPath" @click="openReportPreview(selectedReportPath)">打开抽屉</button>
              </div>
              <pre class="code-preview">{{ selectedReportPath || '请选择左侧报告查看详情。' }}</pre>
            </div>
          </div>
        </section>

        <section v-show="activeMonitorPanel === 'diagnostics'" class="monitor-panel-stage monitor-panel-stage--diagnostics">
          <div class="grid-diagnostics">
            <div class="diagnostic-list">
              <div class="diag-grid">
                <button
                  v-if="blockedDomainFocus"
                  type="button"
                  class="diag-card warning blocked-domain-focus"
                  @click="selectBlockedDomainFocus"
                >
                  <small>当前卡住域</small>
                  <strong>{{ blockedDomainFocus.label }}</strong>
                  <small>{{ blockedDomainFocus.detail }}</small>
                </button>
                <button
                  v-for="sig in dataQualitySignals"
                  :key="sig.key"
                  type="button"
                  class="diag-card data-quality-cell"
                  :class="sig.tone"
                  :disabled="!sig.reportPath || !isPreviewableReportPath(sig.reportPath)"
                  :title="sig.reportPath || '无核查报告'"
                  @click="openReportPreview(sig.reportPath)"
                >
                  <small>{{ sig.label }}</small>
                  <strong>{{ sig.value }}</strong>
                </button>
                <article v-for="card in runtimeStateCards" :key="card.key" class="diag-card accent">
                  <small>{{ card.label }}</small>
                  <strong>{{ statusLabel(card.status) }}</strong>
                  <small>{{ card.detail }}</small>
                </article>
              </div>
            </div>

            <aside class="side-panel">
              <div class="summary-card">
                <h4>系统诊断</h4>
                <p>工程字段、心跳、锁、历史、报告和图片指标集中在低优先级区域。</p>
              </div>
              <div class="summary-card auto-dispatch-card">
                <div class="queue-side-head">
                  <div>
                    <h4>自动派发</h4>
                    <p>{{ wikiDispatchModeLabel }} · {{ wikiAutoDispatchLabel }} · {{ wikiPendingApprovalCount }} 待审批</p>
                  </div>
                  <span class="status-pill" :class="savedAutoDispatchEnabled ? 'success' : 'muted'">{{ savedAutoDispatchLabel }}</span>
                </div>
                <label class="setting-row auto-dispatch-toggle">
                  <div>
                    <strong>启用状态</strong>
                    <small>有变化时按 changed-only 流程派发。</small>
                  </div>
                  <input v-model="autoDispatchForm.enabled" type="checkbox">
                </label>
                <label class="setting-row auto-dispatch-interval">
                  <div>
                    <strong>扫描间隔</strong>
                    <small>单位：分钟。</small>
                  </div>
                  <input v-model.number="autoDispatchForm.sweepIntervalMinutes" class="number-input" type="number" min="1" max="1440">
                </label>
                <div class="setting-row">
                  <div>
                    <strong>最近自动派发</strong>
                    <small>{{ autoDispatchSweepSummary }}</small>
                  </div>
                  <button type="button" class="btn btn-secondary" :disabled="autoDispatchSaving" @click="saveAutoDispatchSettings">
                    <RefreshCw :size="16" :class="{ spin: autoDispatchSaving }" />
                    <span>{{ autoDispatchSaving ? '保存中' : '保存设置' }}</span>
                  </button>
                </div>
              </div>
              <div class="diagnostic-list state-list state-list--compact">
                <div v-for="plan in dispatchPlanRows" :key="plan.actionId || plan.priority || plan.reason" class="diag-card">
                  <small>派发计划</small>
                  <strong>{{ plan.actionId || '未命名动作' }}</strong>
                  <small>{{ dispatchPlanSummary(plan) }}</small>
                </div>
                <div v-for="heartbeat in staleHeartbeatRows" :key="heartbeatKey(heartbeat)" class="diag-card warning">
                  <small>{{ heartbeat.label || heartbeat.id || heartbeat.domain || '心跳' }}</small>
                  <strong>{{ statusLabel(heartbeat.status || 'stalled') }}</strong>
                  <small>{{ heartbeat.reason || heartbeat.progressStaleReason || heartbeat.message || formatDate(heartbeat.lastHeartbeatAt || heartbeat.progressHeartbeatAt) }}</small>
                </div>
                <div v-for="run in historyRows" :key="run.path || run.generatedAt || run.summaryPath" class="diag-card">
                  <small>运行历史</small>
                  <strong>{{ formatDate(run.generatedAt || run.updatedAt) }}</strong>
                  <small>{{ runSummary(run) }}</small>
                </div>
                <div v-for="metric in imageNormalizationRows" :key="metric.label" class="diag-card">
                  <small>{{ metric.label }}</small>
                  <strong>{{ metric.value }}</strong>
                </div>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </section>

    <section v-if="dispatchConfirmDomain" class="cancel-confirm-panel" role="dialog" aria-modal="true" aria-label="正式派发确认">
      <div class="cancel-confirm-panel__body">
        <span class="ops-card__label">派发确认</span>
        <h2>确认提交正式派发：{{ wikiDomainChineseName(dispatchConfirmDomain) }}</h2>
        <p>该操作会创建后台抓取任务并进入正式队列；不是刷新当前页面，也不会自动清理旧产物。为防止误触，请先确认当前心跳、进度文件和已下载文件。</p>
        <ul>
          <li><code>动作：{{ dispatchConfirmDomain.recommendedActionId || '未配置' }}</code></li>
          <li><code>影响域：{{ dispatchConfirmCoveredDomainLabels }}</code></li>
          <li><code>进度：{{ wikiDomainProgressPath(dispatchConfirmDomain) || '未生成' }}</code></li>
          <li><code>输出：{{ wikiDomainOutputPath(dispatchConfirmDomain) || '等待生成' }}</code></li>
        </ul>
        <div class="cancel-confirm-panel__actions">
          <button type="button" class="inline-report-button" @click="closeDispatchConfirm">暂不派发</button>
          <button type="button" class="inline-report-button inline-report-button--danger" :disabled="wikiDispatchLoading === dispatchConfirmDomain.domain" @click="confirmWikiDomainDispatch">
            确认提交正式派发
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
          <button type="button" class="inline-report-button inline-report-button--danger" :disabled="wikiControlLoading === cancelConfirmDomain.domain" @click="confirmWikiDomainCancel">
            确认终止并清理
          </button>
        </div>
      </div>
    </section>

    <div
      class="drawer-backdrop"
      :class="{ open: Boolean(selectedReportPath || reportPreview || reportPreviewError) }"
      @click="closeReportPreview"
    ></div>
    <aside class="report-drawer" :class="{ open: Boolean(selectedReportPath || reportPreview || reportPreviewError) }" role="dialog" aria-modal="true" aria-label="报告预览">
      <div class="drawer-head">
        <div>
          <strong>{{ reportPreview?.name || selectedReportPath || '报告预览' }}</strong>
          <small>
            {{ reportPreview?.path || selectedReportPath || '当前对象的报告、进度、日志与路径。' }}
            <template v-if="reportPreview?.sizeBytes"> - {{ formatBytes(reportPreview.sizeBytes) }}</template>
          </small>
        </div>
        <button type="button" class="icon-close-button" aria-label="关闭报告预览" @click="closeReportPreview">
          <X :size="16" />
        </button>
      </div>
      <div class="drawer-body">
        <div class="report-preview__meta">
          <span class="status-pill" :class="reportTone(reportPreview?.category)">{{ reportPreview?.category || '报告' }}</span>
          <span class="status-pill" :class="reportPreview?.readable ? 'success' : reportPreviewError ? 'danger' : 'muted'">
            {{ reportPreviewStatusLabel }}
          </span>
          <span v-if="reportPreview?.truncated" class="status-pill warning">已截断 {{ formatBytes(reportPreview.maxBytes) }}</span>
        </div>
        <pre v-if="reportPreview?.readable" class="report-preview__content code-preview">{{ reportPreview.content || '' }}</pre>
        <div v-else class="report-preview__empty">
          {{ reportPreviewEmptyMessage }}
        </div>
      </div>
    </aside>
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
import { buildCrawlerUnifiedStatus } from '~/utils/crawlerMonitorUnifiedStatus.mjs'
import { shouldOfferForceReclaim, buildDispatchControlPayload } from './crawler-monitor.control.mjs'
import { resolveDomainState } from './crawler-monitor.state.mjs'
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

const MONITOR_PANEL_KEYS = ['overview', 'queue', 'progress', 'reports', 'diagnostics'] as const
type MonitorPanelKey = typeof MONITOR_PANEL_KEYS[number]
type MonitorPanelMeta = {
  key: MonitorPanelKey
  label: string
  title: string
  subtitle: string
  badge: string
  count: number | string
}
const FALLBACK_MONITOR_PANEL: MonitorPanelMeta = {
  key: 'queue',
  label: '队列和派发状态',
  title: '队列和派发状态',
  subtitle: '当前未结束项和已处理/异常项分开展示，运行中的任务始终在上方。',
  badge: '运行 0 / 已处理 0',
  count: 0,
}

const overview = ref<CrawlerMonitorOverview | null>(null)
const loading = ref(false)
const autoRefresh = ref(true)
const activeMonitorPanel = ref<MonitorPanelKey>('queue')
const panelSwitching = ref(false)
const selectedReportPath = ref<string | null>(null)
const reportPreview = ref<CrawlerMonitorReportDetail | null>(null)
const reportPreviewLoading = ref(false)
const reportPreviewError = ref('')
const lastOverviewRefreshAt = ref<string | null>(null)
const wikiDispatchLoading = ref('')
const wikiControlLoading = ref('')
const progressControlLoading = ref('')
const queueControlLoading = ref('')
const forceReclaimAllLoading = ref(false)
const autoDispatchSaving = ref(false)
const autoDispatchForm = reactive<CrawlerMonitorAutoDispatchSettings>({
  enabled: false,
  mode: 'changed-only',
  sweepIntervalMinutes: 60,
})
const hiddenNoiseKeys = ref<Set<string>>(new Set())
const visibleQueueLogKeys = ref<Set<string>>(new Set())
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
let panelSwitchTimer: ReturnType<typeof setTimeout> | null = null

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
const activeExecutionOverviewRows = computed(() => executionOverviewRows.value.filter((row) => isCurrentExecutionOverviewRow(row)))
const historicalExecutionOverviewRows = computed(() => executionOverviewRows.value.filter((row) => isHistoricalExecutionOverviewRow(row)))
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
const activeProgressRows = computed<ProgressRow[]>(() => progressDetailRowsByPriority.value.filter((row) => isCurrentProgressRow(row)))
const historicalProgressRows = computed<ProgressRow[]>(() => progressDetailRowsByPriority.value.filter((row) => isHistoricalProgressRow(row)))
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
function isRiskHealthTone(tone?: string | null) {
  return ['danger', 'warning'].includes(String(tone || '').toLowerCase())
}

const crawlerHealthCards = computed(() => {
  const highestRiskRow = domainTableRows.value[0] || null
  const highestRiskTone = highestRiskRow ? statusTone(highestRiskRow.risk || highestRiskRow.status || 'missing') : 'muted'
  const failedDomainRows = domainTableRows.value.filter((row) => statusTone(row.risk || row.status) === 'danger')
  const runningDomainRows = domainTableRows.value.filter((row) => ['running'].includes(String(row.status || '').toLowerCase()))
  const queuedDomainRows = domainTableRows.value.filter((row) => ['queued'].includes(String(row.status || '').toLowerCase()))
  const queuedRows = dispatchQueueRows.value.length ? dispatchQueueRows.value : queuedDomainRows
  const staleHeartbeatCount = staleHeartbeatRows.value.length
  const refreshLabel = lastOverviewRefreshAt.value ? formatDate(lastOverviewRefreshAt.value) : '暂无刷新'
  return [
    {
      key: 'highest-risk',
      label: '最高风险',
      value: highestRiskRow ? (highestRiskRow.diagnosisTitle || statusLabel(highestRiskRow.status || 'missing')) : '暂无',
      note: highestRiskRow ? `${highestRiskRow.label || highestRiskRow.domain || '未知域'} · ${highestRiskRow.rankReason || highestRiskRow.reason || '暂无判断'}` : '暂无域监控数据',
      tone: highestRiskTone,
      risk: isRiskHealthTone(highestRiskTone),
    },
    {
      key: 'failed-domains',
      label: '失败域',
      value: formatNumber(failedDomainRows.length),
      note: failedDomainRows.length ? '来自域监控表的失败状态' : '暂无失败域',
      tone: failedDomainRows.length > 0 ? 'danger' : 'muted',
      risk: failedDomainRows.length > 0,
    },
    {
      key: 'stale-heartbeats',
      label: '心跳过期',
      value: formatNumber(staleHeartbeatCount),
      note: staleHeartbeatCount ? '来自当前过期心跳列表' : '暂无心跳过期',
      tone: staleHeartbeatCount > 0 ? 'warning' : 'muted',
      risk: staleHeartbeatCount > 0,
    },
    {
      key: 'running-domains',
      label: '运行态',
      value: formatNumber(runningDomainRows.length),
      note: runningDomainRows.length ? '来自域监控表的运行中状态' : '暂无运行中域',
      tone: 'success',
      risk: false,
    },
    {
      key: 'queued-domains',
      label: '排队中',
      value: formatNumber(queuedRows.length),
      note: queuedRows.length ? '来自队列或域监控表' : '暂无排队任务',
      tone: queuedRows.length > 0 ? 'info' : 'muted',
      risk: false,
    },
    {
      key: 'last-refresh',
      label: '最后刷新',
      value: refreshLabel,
      note: autoRefresh.value ? '自动刷新开' : '自动刷新关',
      tone: autoRefresh.value ? 'success' : 'muted',
      risk: false,
    },
  ]
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
const savedAutoDispatchEnabled = computed(() => Boolean(wikiMonitor.value?.autoDispatchSettings?.enabled ?? wikiMonitor.value?.autoDispatchEnabled))
const savedAutoDispatchLabel = computed(() => savedAutoDispatchEnabled.value ? '已开启' : '已关闭')
const savedAutoDispatchIntervalMinutes = computed(() => {
  const settingsInterval = Number(wikiMonitor.value?.autoDispatchSettings?.sweepIntervalMinutes)
  return Number.isFinite(settingsInterval) && settingsInterval > 0 ? settingsInterval : 60
})
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
  dispatchQueue: rawDispatchQueueRows.value,
}))
const selectedDomainTableRow = computed(() => {
  const rows = domainTableRows.value
  if (!rows.length) return null
  const selected = rows.find((row) => selectedDomainTableRowKey(row) === selectedDomainTableKey.value)
  return selected || rows[0]
})
const selectedDomainTableEvidence = computed(() => buildDomainTableEvidence(selectedDomainTableRow.value))
const selectedDomainTableBackendEvidenceFile = computed(() => {
  const path = domainRowEvidencePath(selectedDomainTableRow.value)
  return path ? { label: '后端证据', path } : null
})
const selectedDomainTableVisibleEvidenceFiles = computed(() => {
  const files = selectedDomainTableEvidence.value.files.filter((file: any) => String(file.label || '').trim() !== '日志')
  const backendFile = selectedDomainTableBackendEvidenceFile.value
  if (!backendFile || files.some((file: any) => file.path === backendFile.path)) return files
  return [backendFile, ...files]
})
const selectedDomainTableLogEvidenceFiles = computed(() => selectedDomainTableEvidence.value.files.filter((file: any) => String(file.label || '').trim() === '日志'))
const selectedDomainTableLogKey = computed(() => {
  const row = selectedDomainTableRow.value
  return row?.queueItem ? queueItemLogKey(row.queueItem) : selectedDomainTableRowKey(row)
})
const failedDomainRows = computed(() => domainTableRows.value.filter((row) => statusTone(row.risk || row.status) === 'danger'))
const runningDomainRows = computed(() => domainTableRows.value.filter((row) => {
  const status = String(row.status || row.risk || '').toLowerCase()
  return status === 'running'
}))
const highestRiskDomainRow = computed(() => domainTableRows.value[0] || null)
const v4StatusStrip = computed(() => {
  const row = highestRiskDomainRow.value
  const failedCount = failedDomainRows.value.length
  const staleCount = staleHeartbeatRows.value.length
  const runningCount = runningDomainRows.value.length
  const title = failedCount > 0 && row
    ? `当前需要处理：${row.label || row.domain || row.actionId || '未知域'} ${row.diagnosisTitle || statusLabel(row.status || 'failed')}`
    : staleCount > 0
      ? `当前需要处理：${formatNumber(staleCount)} 条心跳过期`
      : runningCount > 0
        ? `当前运行中：${formatNumber(runningCount)} 个域`
        : '当前状态稳定'
  const subtitle = [
    `正式域 ${formatNumber(domainTableRows.value.length)} 个`,
    `队列 ${formatNumber(dispatchQueueRows.value.length)} 项`,
    `自动派发${savedAutoDispatchEnabled.value ? '开启' : '关闭'}`,
    lastOverviewRefreshAt.value ? `刷新 ${formatDate(lastOverviewRefreshAt.value)}` : '暂无刷新',
  ].join(' · ')
  return {
    title,
    subtitle,
    tone: failedCount > 0 ? 'danger' : staleCount > 0 ? 'warning' : runningCount > 0 ? 'info' : 'success',
    chips: [
      { label: `${formatNumber(failedCount)} 个失败`, tone: failedCount > 0 ? 'danger' : 'muted' },
      { label: `${formatNumber(runningCount)} 个运行`, tone: runningCount > 0 ? 'info' : 'muted' },
      { label: `${formatNumber(staleCount)} 条心跳`, tone: staleCount > 0 ? 'warning' : 'muted' },
    ],
  }
})
const v4MetricCards = computed(() => {
  const highestRiskRow = highestRiskDomainRow.value
  const queuedRows = dispatchQueueRows.value.length
    ? dispatchQueueRows.value
    : domainTableRows.value.filter((row) => ['queued'].includes(String(row.status || '').toLowerCase()))
  const visibleEvidenceCount = recentReportRows.value.length
    + progressDetailRowsByPriority.value.reduce((total, row) => total + progressRowVisiblePathEntries(row).length + progressRowLogPathEntries(row).length, 0)

  return [
    {
      key: 'highest-risk',
      label: '最需要处理',
      value: highestRiskRow ? (highestRiskRow.label || highestRiskRow.domain || highestRiskRow.actionId || '未知域') : '暂无',
      note: highestRiskRow ? `${highestRiskRow.diagnosisTitle || statusLabel(highestRiskRow.status || 'unknown')} · ${highestRiskRow.rankReason || highestRiskRow.reason || '查看证据'}` : '暂无域监控数据',
      tone: highestRiskRow ? statusTone(highestRiskRow.risk || highestRiskRow.status || 'missing') : 'muted',
    },
    {
      key: 'running-domains',
      label: '运行态',
      value: formatNumber(runningDomainRows.value.length),
      note: runningDomainRows.value.length ? '来自域监控表的运行中状态' : '暂无运行中域',
      tone: runningDomainRows.value.length ? 'info' : 'muted',
    },
    {
      key: 'queued-domains',
      label: '队列等待',
      value: formatNumber(queuedRows.length),
      note: queuedRows.length ? '来自队列或域监控表' : '暂无排队任务',
      tone: queuedRows.length ? 'warning' : 'muted',
    },
    {
      key: 'evidence-files',
      label: '可点击证据',
      value: formatNumber(visibleEvidenceCount),
      note: `报告 ${formatNumber(recentReportRows.value.length)} / 进度与日志 ${formatNumber(Math.max(0, visibleEvidenceCount - recentReportRows.value.length))}`,
      tone: visibleEvidenceCount ? 'info' : 'muted',
    },
    {
      key: 'last-refresh',
      label: '最近刷新',
      value: lastOverviewRefreshAt.value ? formatDate(lastOverviewRefreshAt.value) : '暂无刷新',
      note: autoRefresh.value ? '自动刷新开' : '自动刷新关',
      tone: autoRefresh.value ? 'success' : 'muted',
    },
  ].slice(0, 5)
})
const monitorPanels = computed<MonitorPanelMeta[]>(() => [
  {
    key: 'overview',
    label: '域总览',
    title: '域总览',
    subtitle: '完整域列表只在这里展示；选中一行后在右侧查看当前域证据。',
    badge: `${formatNumber(domainTableRows.value.length)} 域`,
    count: domainTableRows.value.length,
  },
  {
    key: 'queue',
    label: '队列和派发状态',
    title: '队列和派发状态',
    subtitle: '当前未结束项和已处理/异常项分开展示，运行中的任务始终在上方。',
    badge: `运行 ${formatNumber(activeExecutionOverviewRows.value.length)} / 已处理 ${formatNumber(historicalExecutionOverviewRows.value.length)}`,
    count: activeDispatchQueueRows.value.length,
  },
  {
    key: 'progress',
    label: '真实任务进度',
    title: '真实任务进度',
    subtitle: '当前执行和历史异常分开展示；不把失败、过去进度与正在运行混排。',
    badge: `运行 ${formatNumber(activeProgressRows.value.length)} / 历史 ${formatNumber(historicalProgressRows.value.length)}`,
    count: progressDetailRowsByPriority.value.length,
  },
  {
    key: 'reports',
    label: '报告',
    title: '报告和证据文件',
    subtitle: '展示最近报告和当前对象相关证据，完整路径进入抽屉。',
    badge: `${formatNumber(recentReportRows.value.length)} 个`,
    count: recentReportRows.value.length,
  },
  {
    key: 'diagnostics',
    label: '诊断',
    title: '诊断',
    subtitle: '工程字段、心跳、锁、历史和质量指标集中在低优先级区域。',
    badge: dataQualityAttentionCount.value ? `${formatNumber(dataQualityAttentionCount.value)} 项待查` : '质量正常',
    count: dataQualityAttentionCount.value,
  },
])
const activeMonitorPanelMeta = computed<MonitorPanelMeta>(() => monitorPanels.value.find((panel) => panel.key === activeMonitorPanel.value) || FALLBACK_MONITOR_PANEL)

function normalizeMonitorPanelKey(value?: string | null): MonitorPanelKey | null {
  const normalized = String(value || '').replace(/^#/, '').trim()
  return (MONITOR_PANEL_KEYS as readonly string[]).includes(normalized) ? normalized as MonitorPanelKey : null
}

function setActiveMonitorPanel(panel: MonitorPanelKey) {
  if (activeMonitorPanel.value === panel) return
  activeMonitorPanel.value = panel
  panelSwitching.value = true
  if (panelSwitchTimer) clearTimeout(panelSwitchTimer)
  panelSwitchTimer = setTimeout(() => {
    panelSwitching.value = false
    panelSwitchTimer = null
  }, 180)
  if (import.meta.client) {
    window.location.hash = panel
  }
}

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
const selectedWikiCoveredDomainLabels = computed(() => wikiDomainCoveredDomainLabels(selectedWikiDomain.value))
const selectedWikiSharedActionWarning = computed(() => sharedActionWarning(selectedWikiDomain.value))
const dispatchConfirmCoveredDomainLabels = computed(() => wikiDomainCoveredDomainLabels(dispatchConfirmDomain.value))
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
const selectedDomainStatusLabel = computed(() => statusLabel(domainRowStatus(selectedDomainTableRow.value) || 'unknown'))
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
  const backendAction = domainRowNextActionLabel(selectedDomainTableRow.value)
  if (backendAction) return backendAction
  const domain = selectedWikiDomain.value
  if (!domain) return selectedDomainTableRow.value?.nextActionLabel || '查看任务'
  if (canResumeWikiDomain(domain)) return '继续任务'
  if (canPauseWikiDomain(domain)) return '暂停任务'
  if (canExecuteWikiDomain(domain)) return '提交正式派发'
  if (isWikiDomainCoolingDown(domain)) return '等待冷却'
  return '暂不可执行'
})
const selectedWikiReCrawlButtonLabel = computed(() => {
  const domain = selectedWikiDomain.value
  if (!domain) return '不能派发'
  if (wikiDispatchLoading.value === domain.domain) return '提交中'
  if (!canExecuteWikiDomain(domain)) return '不能派发'
  return '提交正式派发'
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
const blockedDomainFocus = computed(() => {
  const blockedQueue = activeDispatchQueueRows.value.find((item) => queueItemBlockerLabel(item))
  if (blockedQueue) {
    return {
      label: queueItemDomainLabel(blockedQueue),
      detail: `${statusLabel(queueItemStatus(blockedQueue))} · ${queueItemBlockerLabel(blockedQueue)} · ${blockedQueue.queueId || blockedQueue.actionId || '无 queueId'}`,
      queueItem: blockedQueue,
      row: null,
    }
  }
  const stalledRow = domainTableRows.value.find((row) => ['stalled', 'blocked', 'failed'].includes(String(row.status || row.risk || '').toLowerCase()))
  if (stalledRow) {
    return {
      label: stalledRow.label || stalledRow.domain || stalledRow.actionId || '未知域',
      detail: `${stalledRow.diagnosisTitle || statusLabel(stalledRow.status)} · ${stalledRow.rankReason || stalledRow.reason || '查看进度和队列'}`,
      queueItem: stalledRow.queueItem || null,
      row: stalledRow,
    }
  }
  const stale = staleHeartbeatRows.value[0]
  if (stale) {
    return {
      label: stale.label || stale.domain || stale.id || '心跳过期任务',
      detail: stale.progressStaleReason || stale.reason || stale.message || formatDate(stale.lastHeartbeatAt || stale.progressHeartbeatAt),
      queueItem: null,
      row: null,
    }
  }
  return null
})
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
const selectedWikiCanCancel = computed(() => Boolean(selectedWikiDomain.value && canCancelWikiDomain(selectedWikiDomain.value)))
const selectedWikiActionLoading = computed(() => {
  const domain = selectedWikiDomain.value
  return Boolean(domain?.domain && (wikiDispatchLoading.value === domain.domain || wikiControlLoading.value === domain.domain))
})
const selectedWikiPrimaryActionDisabled = computed(() => {
  const domain = selectedWikiDomain.value
  if (!domain || selectedWikiActionLoading.value) return true
  return !canResumeWikiDomain(domain)
    && !canPauseWikiDomain(domain)
    && !canExecuteWikiDomain(domain)
})
const selectedWikiPrimaryActionIcon = computed(() => {
  const domain = selectedWikiDomain.value
  if (!domain) return Play
  if (canPauseWikiDomain(domain)) return Pause
  return Play
})
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
    latest?.outputPath,
    latest?.lockPath,
    selectedWikiOutputPath.value,
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
  const hashPanel = import.meta.client ? normalizeMonitorPanelKey(window.location.hash) : null
  if (hashPanel) {
    activeMonitorPanel.value = hashPanel
  }
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
  if (panelSwitchTimer) {
    clearTimeout(panelSwitchTimer)
    panelSwitchTimer = null
  }
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
  if (loading.value) return
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

function selectBlockedDomainFocus() {
  const focus = blockedDomainFocus.value
  if (!focus) return
  if (focus.row) {
    selectDomainTableRow(focus.row)
    setActiveMonitorPanel('overview')
    return
  }
  if (focus.queueItem) {
    selectQueueItemDomain(focus.queueItem)
    setActiveMonitorPanel('queue')
  }
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
  return ['queued', 'starting', 'running', 'paused', 'blocked_cooldown']
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
  if (wikiDispatchLoading.value === domain.domain) return '提交中'
  if (!canExecuteWikiDomain(domain)) return '不能派发'
  return '提交正式派发'
}

function wikiDomainRecoveryTitle(domain: CrawlerMonitorWikiDomain) {
  const status = wikiDomainFlowStatus(domain)
  if (status === 'running') return '继续观察运行'
  if (status === 'stalled') return '心跳过期，人工确认后重派'
  if (status === 'failed' || status === 'error') return '失败，人工确认后重派'
  if (status === 'paused') return '继续执行'
  if (status === 'pending' || status === 'ready' || status === 'changed') return '手动提交正式派发'
  if (status === 'blocked') return '已阻断，查看原因'
  if (status === 'completed') return '打开报告复核'
  return '缺少进度，先提交正式派发'
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
  if (canExecuteWikiDomain(domain)) return `${wikiDomainManualHint(domain)}。将创建一个后台抓取任务并加入正式队列；不是刷新当前页面，也不会自动清理旧产物。`
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

function wikiDomainCoveredDomains(domain: CrawlerMonitorWikiDomain | null | undefined) {
  if (!domain) return []
  const actionId = String(domain.recommendedActionId || '').trim()
  const activeQueueItem = activeQueueItemForDomain(domain)
  const queueCovered = Array.isArray(activeQueueItem?.coveredDomains)
    ? activeQueueItem.coveredDomains.map((value) => String(value || '').trim()).filter(Boolean)
    : []
  const inferred = actionId
    ? wikiDomainRows.value
        .filter((row) => row.recommendedActionId === actionId)
        .map((row) => row.domain || wikiDomainKey(row))
        .filter(Boolean)
    : []
  const self = domain.domain || wikiDomainKey(domain)
  return Array.from(new Set([...queueCovered, ...inferred, self].filter(Boolean)))
}

function wikiDomainCoveredDomainLabels(domain: CrawlerMonitorWikiDomain | null | undefined) {
  const labels = wikiDomainCoveredDomains(domain).map((domainId) => {
    const matched = wikiDomainRows.value.find((row) => row.domain === domainId)
    return wikiDomainChineseName(matched || { domain: domainId, label: domainId })
  })
  return labels.join('、') || '当前域'
}

function sharedActionWarning(domain: CrawlerMonitorWikiDomain | null | undefined) {
  const count = wikiDomainCoveredDomains(domain).length
  return count > 1 ? '共享动作会联动刷新这些域' : ''
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

async function handleSelectedWikiDomainPrimaryAction() {
  const domain = selectedWikiDomain.value
  if (!domain || selectedWikiPrimaryActionDisabled.value) return
  if (canResumeWikiDomain(domain)) {
    await controlWikiMonitorTask(domain, 'resume')
    return
  }
  if (canPauseWikiDomain(domain)) {
    await controlWikiMonitorTask(domain, 'pause')
    return
  }
  if (canExecuteWikiDomain(domain)) {
    openDispatchConfirm(domain)
  }
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
  return queueItemVisiblePathEntries(item)
}

function queueItemVisiblePathEntries(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  return [
    { label: '进度', path: item?.progressPath || '' },
    { label: '报告', path: item?.reportPath || '' },
    { label: '输出', path: item?.outputPath || '' },
    { label: '锁', path: item?.lockPath || '' },
  ].filter((entry) => Boolean(entry.path))
}

function queueItemLogPathEntries(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  return [
    { label: '日志', path: item?.logPath || '' },
  ].filter((entry) => Boolean(entry.path))
}

function queueItemLogKey(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  return item?.queueId || item?.dispatchId || item?.logPath || `${item?.domain || ''}:${item?.actionId || ''}`
}

function showQueueItemLogs(key: string | null | undefined) {
  return Boolean(key && visibleQueueLogKeys.value.has(key))
}

function toggleQueueItemLogs(key: string | null | undefined) {
  if (!key) return
  const next = new Set(visibleQueueLogKeys.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  visibleQueueLogKeys.value = next
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
  return Boolean(item?.queueId && ['running', 'paused'].includes(queueItemStatus(item)))
}

function canCancelDomainTableQueuedRow(row: any) {
  return Boolean(row?.queueItem && canCancelQueuedItem(row.queueItem))
}

function canCancelDomainTableRunningRow(row: any) {
  return Boolean(row?.queueItem && canCancelRunningQueueItem(row.queueItem))
}

function canResumeDomainTableRow(row: any) {
  const domain = row?.sourceDomain || null
  if (domain && canResumeWikiDomain(domain)) return true
  return queueItemStatus(row?.queueItem) === 'paused'
}

function canStartDomainTableRow(row: any) {
  if (!canExecuteDomainTableRow(row)) return false
  if (row?.queueItem && ['queued', 'blocked_cooldown', 'starting', 'running', 'paused'].includes(queueItemStatus(row.queueItem))) return false
  return ['failed', 'stalled', 'ready', 'completed', 'cancelled', 'missing'].includes(String(domainRowStatus(row) || row?.risk || row?.status || '').toLowerCase())
}

function canExecuteDomainTableRow(row: any) {
  const domain = row?.sourceDomain || null
  if (!domain?.recommendedActionId) return false
  if (domain.pauseReason) return false
  if (isWikiDomainCoolingDown(domain)) return false
  if (row?.queueItem && ['queued', 'blocked_cooldown', 'starting', 'running', 'paused'].includes(queueItemStatus(row.queueItem))) return false
  return ['failed', 'stalled', 'ready', 'completed', 'cancelled', 'missing'].includes(String(domainRowStatus(row) || row?.risk || row?.status || '').toLowerCase())
}

function shouldOfferDomainRowForceReclaim(row: any) {
  return shouldOfferForceReclaim({ ...row, risk: domainRowStatus(row) || row?.risk })
}

function resumeDomainTableRow(row: any) {
  selectDomainTableRow(row)
  const domain = row?.sourceDomain || null
  if (domain && canResumeWikiDomain(domain)) return controlWikiMonitorTask(domain, 'resume')
  if (row?.queueItem) return controlProgressTask(queueItemAsProgressRow(row.queueItem), 'resume')
}

function startDomainTableRow(row: any) {
  selectDomainTableRow(row)
  openDomainTableDispatchConfirm(row)
}

function openDomainTableDispatchConfirm(row: any) {
  const domain = row?.sourceDomain || null
  if (!domain || !canExecuteDomainTableRow(row)) return
  selectWikiDomain(domain)
  dispatchConfirmDomainKey.value = wikiDomainKey(domain)
}

function cancelDomainTableQueuedRow(row: any) {
  selectDomainTableRow(row)
  if (row?.queueItem) return cancelQueuedDispatchItem(row.queueItem)
}

function cancelDomainTableRunningRow(row: any) {
  selectDomainTableRow(row)
  if (row?.queueItem) return cancelRunningDispatchItem(row.queueItem)
}

async function forceReclaimDomainTableRow(row: any) {
  selectDomainTableRow(row)
  const payload = buildDispatchControlPayload('forceReclaim', row)
  try {
    const response: any = await post('/admin/crawler-monitor/dispatch/control', payload)
    latestDispatchResult.value = (response?.data ?? response) || null
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || '已提交强制回收', latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '强制回收失败', 'error')
  }
}

async function forceReclaimAllRunningDispatches() {
  if (forceReclaimAllLoading.value) return
  if (import.meta.client && !window.confirm('确认清空所有运行中和排队中的爬虫监控任务？这会终止已登记进程、释放锁，并把非终态队列标记为已取消。')) return
  forceReclaimAllLoading.value = true
  try {
    const response: any = await post('/admin/crawler-monitor/dispatch/control', {
      controlAction: 'forceReclaimAll',
      domain: null,
      actionId: null,
      queueId: null,
    })
    latestDispatchResult.value = (response?.data ?? response) || null
    showToast(dispatchFeedbackMessage(latestDispatchResult.value) || '已清空运行/队列任务', latestDispatchResult.value?.accepted === false ? 'warning' : 'success')
    await loadOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '清空运行/队列失败', 'error')
  } finally {
    forceReclaimAllLoading.value = false
  }
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
      outputPath: item.outputPath || null,
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

function executionOverviewStatusSource(row: any) {
  const source = String(row?.statusSource || '').toLowerCase()
  if (source === 'queue') return `队列：${statusLabel(row?.status)}`
  if (source === 'progress') return `进度：${statusLabel(row?.progressStatus || row?.status)}`
  if (source === 'domain') return '正式域规则'
  return '未判定'
}

function executionOverviewStatusReason(row: any) {
  return String(row?.stateConflictLabel || row?.statusReason || '').trim()
}

function executionOverviewHasConflict(row: any) {
  return Boolean(row?.stateConflictLabel)
}

function executionOverviewQueueIdentity(row: any) {
  return row?.queueIdentityLabel || (row?.queuePosition ? `队列第 ${row.queuePosition} 位` : '无队列')
}

function executionOverviewNextAction(row: any) {
  return row?.nextActionLabel || '查看证据'
}

function executionOverviewBlocker(row: any) {
  return row?.blockerLabel || '无阻塞'
}

function executionOverviewTiming(row: any) {
  const timeEvent = executionOverviewTimeEvent(row)
  if (timeEvent) return `上海时间 ${formatDate(timeEvent.value)} · ${timeEvent.label}`
  const fallback = String(row?.heartbeatSummary || '').trim()
  return fallback || '暂无时间'
}

function executionOverviewTimeEvent(row: any) {
  const item = row?.sourceQueueItem || null
  const progressRow = row?.sourceProgressRow || null
  const candidates = [
    { label: '结束', value: item?.completedAt || progressRow?.progressPayload?.completedAt },
    { label: '最新心跳', value: progressRow?.progressHeartbeatAt || progressRow?.lastHeartbeatAt || progressRow?.action?.lastHeartbeatAt },
    { label: '更新', value: progressRow?.updatedAt || progressRow?.progressUpdatedAt || progressRow?.action?.updatedAt },
    { label: '启动', value: item?.startedAt || progressRow?.progressPayload?.startedAt || progressRow?.action?.startedAt },
    { label: '请求', value: item?.requestedAt },
  ]
  return candidates.find((candidate) => isValidDateValue(candidate.value)) || null
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

function progressRowQueueItem(row: ProgressRow | null | undefined) {
  if (!row) return null
  if (row.sourceQueueItem) return row.sourceQueueItem
  const actionId = progressRowControlActionId(row)
  const progressPath = String(row.progressPath || row.progressSource || row.action?.childStatusPath || '')
  return rawDispatchQueueRows.value.find((item) => {
    if (item.lane && item.lane !== 'standard') return false
    if (actionId && item.actionId === actionId) return true
    if (progressPath && item.progressPath === progressPath) return true
    return false
  }) || null
}

function progressRowEffectiveStatus(row: ProgressRow | null | undefined) {
  return buildCrawlerUnifiedStatus({
    progressRow: row,
    queueItem: progressRowQueueItem(row),
  }).effectiveStatus
}

function progressRowStatusLabel(row: ProgressRow) {
  return statusLabel(progressRowEffectiveStatus(row))
}

// P2 双读：优先后端权威 domain.state，缺失回落旧前端调解器（P3 删）。
function domainRowState(row: any) {
  const domain = row?.sourceDomain || row || null
  return resolveDomainState(domain, {
    progressRow: row?.progressRow || null,
    queueItem: row?.queueItem || null,
  })
}

function domainRowStatus(row: any) {
  return domainRowState(row).status
}

function domainRowStatusLabel(row: any) {
  return statusLabel(domainRowStatus(row))
}

function domainRowNextActionLabel(row: any) {
  const state = domainRowState(row)
  return state.nextActionLabel || '等待后端状态'
}

function domainRowBlockerLabel(row: any) {
  const state = domainRowState(row)
  return state.blockerLabel || state.blocker || ''
}

function domainRowEvidencePath(row: any) {
  return domainRowState(row).evidence || ''
}

function progressRowStatusSource(row: ProgressRow) {
  const queueItem = progressRowQueueItem(row)
  const queueStatus = queueItemStatus(queueItem)
  const progressStatus = rowStatus(row)
  const unified = buildCrawlerUnifiedStatus({ progressRow: row, queueItem })
  if (unified.statusSource === 'queue') return `队列控制：${statusLabel(unified.effectiveStatus)}`
  if (unified.statusSource === 'progress') return `进度文件：${statusLabel(unified.effectiveStatus)}`
  if (queueItem) return `队列 ${statusLabel(queueStatus)} / 进度 ${statusLabel(progressStatus)}`
  return `进度文件：${statusLabel(progressStatus)}`
}

function progressRowStateConflictLabel(row: ProgressRow) {
  const queueItem = progressRowQueueItem(row)
  if (!queueItem) return ''
  const unified = buildCrawlerUnifiedStatus({ progressRow: row, queueItem })
  if (unified.conflictLabel) return `${unified.conflictLabel}；以后端队列状态为准。`
  const queueStatus = queueItemStatus(queueItem)
  const progressStatus = rowStatus(row)
  const message = String(queueItem.message || '')
  if (message.includes('自动校准')) return message
  if (queueStatus === 'paused' && ['running', 'starting'].includes(progressStatus)) {
    return '队列已暂停，但进度文件仍显示运行；以后端队列状态为准。'
  }
  if (queueStatus === 'running' && progressStatus === 'paused') {
    return '队列显示运行，但最近派发状态显示暂停；刷新后以后端校准结果为准。'
  }
  if (['timed_out', 'cancelled', 'failed'].includes(queueStatus) && ['running', 'starting', 'paused'].includes(progressStatus)) {
    return `队列已是${statusLabel(queueStatus)}，进度文件仍保留 ${statusLabel(progressStatus)}；可查看文件或重新派发。`
  }
  return ''
}

function progressRowSyncActionLabel(row: ProgressRow) {
  const status = progressRowEffectiveStatus(row)
  if (status === 'paused') return '同步状态'
  if (status === 'running') return '重新校准'
  return '刷新状态'
}

function progressRowDomainLabel(row: ProgressRow) {
  const queueItem = progressRowQueueItem(row)
  if (queueItem) return queueItemDomainLabel(queueItem)
  const payloadDomain = String(row.progressPayload?.domain || '').trim()
  if (payloadDomain) return wikiDomainChineseName({ domain: payloadDomain, label: payloadDomain })
  const actionId = progressRowControlActionId(row)
  const domain = wikiDomainRows.value.find((candidate) => candidate.recommendedActionId === actionId)
  if (domain) return wikiDomainChineseName(domain)
  return row.label || row.id || '未知域'
}

function progressRowActionLabel(row: ProgressRow) {
  return progressRowControlActionId(row) || row.action?.id || row.id || '未命名动作'
}

function progressRowQueueStateLabel(row: ProgressRow) {
  const queueItem = progressRowQueueItem(row)
  if (!queueItem) return '无队列占用'
  return `${statusLabel(queueItemStatus(queueItem))} · ${queueItemPositionLabel(queueItem)}`
}

function progressRowCoveredDomainLabels(row: ProgressRow) {
  const queueItem = progressRowQueueItem(row)
  const queueCovered = Array.isArray(queueItem?.coveredDomains)
    ? queueItem.coveredDomains.map((value) => String(value || '').trim()).filter(Boolean)
    : []
  const actionId = progressRowControlActionId(row)
  const inferred = actionId
    ? wikiDomainRows.value
        .filter((domain) => domain.recommendedActionId === actionId)
        .map((domain) => domain.domain || wikiDomainKey(domain))
        .filter(Boolean)
    : []
  const domains = Array.from(new Set([...queueCovered, ...inferred]))
  if (!domains.length) return progressRowDomainLabel(row)
  return domains
    .map((domainId) => wikiDomainChineseName(wikiDomainRows.value.find((domain) => domain.domain === domainId) || { domain: domainId, label: domainId }))
    .join('、')
}

function progressRowNextActionLabel(row: ProgressRow) {
  const status = progressRowEffectiveStatus(row)
  if (status === 'paused') return '继续任务'
  if (status === 'running' || status === 'starting') return '可暂停或终止'
  if (status === 'queued' || status === 'blocked_cooldown') return '等待或取消排队'
  if (status === 'stalled' || status === 'failed' || status === 'error') return '终止清理后重新提交'
  return '查看证据'
}

function progressRowControlButtons(row: ProgressRow): Array<{ action: 'pause' | 'resume' | 'cancel', label: string, icon: any }> {
  const status = progressRowEffectiveStatus(row)
  const buttons: Array<{ action: 'pause' | 'resume' | 'cancel', label: string, icon: any }> = []
  if (status === 'running') buttons.push({ action: 'pause', label: '暂停任务', icon: Pause })
  if (status === 'paused') buttons.push({ action: 'resume', label: '继续任务', icon: Play })
  if (['running', 'paused', 'stalled'].includes(status)) buttons.push({ action: 'cancel', label: '终止任务', icon: CircleStop })
  return progressRowControlActionId(row) ? buttons : []
}

function progressRowControlKey(row: ProgressRow) {
  return progressRowControlActionId(row) || row.rowKey || row.label || ''
}

function canPauseProgressRow(row: ProgressRow) {
  return progressRowEffectiveStatus(row) === 'running' && Boolean(progressRowControlActionId(row))
}

function canResumeProgressRow(row: ProgressRow) {
  return progressRowEffectiveStatus(row) === 'paused' && Boolean(progressRowControlActionId(row))
}

function canTriggerBackfillRow(row: ProgressRow) {
  const status = rowStatus(row)
  return String(row.lane || '').toLowerCase() === 'backfill'
    && Boolean(row.id)
    && Boolean(backfillDomainForRow(row))
    && !['running', 'paused', 'stalled'].includes(status)
}

function canCancelProgressRow(row: ProgressRow) {
  return ['running', 'paused', 'stalled'].includes(progressRowEffectiveStatus(row)) && Boolean(progressRowControlActionId(row))
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
  if (!domain) return '不可派发'
  if (wikiDispatchLoading.value === domain.domain) return '提交中'
  return canExecuteWikiDomain(domain) ? '可提交派发' : '不可派发'
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
    showToast(error?.data?.message || error?.message || '提交正式派发失败', 'error')
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
  const queueItem = progressRowQueueItem(row)
  progressControlLoading.value = controlKey
  try {
    const response: any = await post('/admin/crawler-monitor/dispatch/control', {
      actionId,
      controlAction,
      queueId: queueItem?.queueId,
      domain: queueItem?.domain,
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
  if (normalized === 'state_missing') return '状态未同步'
  if (normalized === 'ready') return '可重新派发'
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

function isCurrentProgressRow(row: ProgressRow) {
  const status = progressRowEffectiveStatus(row)
  return ['running', 'starting', 'queued', 'pending', 'paused', 'blocked', 'blocked_cooldown'].includes(status)
}

function isHistoricalProgressRow(row: ProgressRow) {
  return !isCurrentProgressRow(row)
}

function isCurrentExecutionOverviewRow(row: any) {
  const status = String(row?.displayStatus || row?.status || '').toLowerCase()
  return ['running', 'starting', 'queued', 'pending', 'paused', 'blocked', 'blocked_cooldown'].includes(status)
}

function isHistoricalExecutionOverviewRow(row: any) {
  return !isCurrentExecutionOverviewRow(row)
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
  if (normalized === 'ready') return 'ready'
  if (normalized === 'cancelled') return 'cancelled'
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
    return row.sourceQueueItem.progressPath || row.sourceQueueItem.reportPath || row.sourceQueueItem.outputPath || row.sourceQueueItem.lockPath || row.sourceQueueItem.logPath || ''
  }
  return row.progressSource || row.progressPath || row.action?.childStatusPath || row.reportPath || row.outputPath || ''
}

function progressRowPathEntries(row: ProgressRow | null | undefined) {
  return progressRowVisiblePathEntries(row)
}

function progressRowVisiblePathEntries(row: ProgressRow | null | undefined) {
  if (!row) return []
  if (row.sourceQueueItem) return queueItemVisiblePathEntries(row.sourceQueueItem)
  const entries = [
    { label: '进度', path: row.progressSource || row.progressPath || row.action?.childStatusPath || '' },
    { label: '报告', path: row.reportPath || '' },
    { label: '输出', path: row.outputPath || row.progressPayload?.outputPath || '' },
  ].filter((entry) => entry.path)
  if (!entries.length && rowSourcePath(row)) return [{ label: '来源', path: rowSourcePath(row) }]
  return entries
}

function progressRowLogPathEntries(row: ProgressRow | null | undefined) {
  if (!row) return []
  if (row.sourceQueueItem) return queueItemLogPathEntries(row.sourceQueueItem)
  return [
    { label: '日志', path: row.progressPayload?.logPath || '' },
  ].filter((entry) => Boolean(entry.path))
}

function progressRowQueueLogKey(row: ProgressRow | null | undefined) {
  if (row?.sourceQueueItem) return queueItemLogKey(row.sourceQueueItem)
  return row?.rowKey || row?.id || row?.label || ''
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
    return `已有 Wiki 监控任务占用：${dispatchBlockerLabel(result)}${since}${lock}。心跳过期不会自动重试，请先确认阻塞任务状态，必要时取消清理后再重新提交正式派发。`
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
  return formatShanghaiDate(date)
}

const SHANGHAI_DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

function formatShanghaiDate(value: Date) {
  const parts = Object.fromEntries(SHANGHAI_DATE_FORMATTER.formatToParts(value).map((part) => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}

function isValidDateValue(value: number | string | null | undefined) {
  if (!value) return false
  return Number.isFinite(new Date(value).getTime())
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
  font-size: 10px;
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
  grid-template-rows: auto auto;
  gap: 8px;
  height: auto;
  min-height: 0;
  max-height: none;
  padding: 12px;
  overflow: visible;
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

.execution-overview-card,
.queue-progress-card,
.quality-validation-card,
.system-diagnostics-card {
  border-color: color-mix(in srgb, var(--color-border) 86%, transparent);
  border-radius: 12px;
  background: var(--color-surface-2, var(--color-bg));
}

.execution-overview-card .action-rail {
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.queue-progress-card .wiki-monitor-dispatch-queue {
  gap: 12px;
}

.queue-progress-card .dispatch-queue-row {
  grid-template-columns: minmax(0, 1.3fr) minmax(220px, 0.8fr) auto;
  gap: 12px;
}

.queue-progress-card__subhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.quality-validation-card .data-quality-grid {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.quality-validation-card .domain-test-matrix__grid {
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.system-diagnostics-card .runtime-domain-index,
.system-diagnostics-card .runtime-auxiliary-details {
  max-height: none;
}

.system-diagnostics-card .runtime-auxiliary-details {
  overflow: visible;
}

.system-diagnostics-card .observability-grid--dialog {
  overflow: visible;
  padding-right: 0;
}

@media (max-width: 1180px) {
  .queue-progress-card .dispatch-queue-row {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* Formal v4 high fidelity */
.crawler-monitor-v4 {
  max-width: 1400px;
  margin: 0 auto;
  display: grid;
  gap: 10px;
}

.crawler-monitor-v4 .status-strip {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  min-height: 58px;
  min-width: 0;
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, #d97706 26%, var(--color-border));
  border-radius: 8px;
  background: color-mix(in srgb, #fffbeb 54%, var(--color-bg));
  box-shadow: none;
}

.crawler-monitor-v4 .status-strip__main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.crawler-monitor-v4 .status-strip__main > div {
  min-width: 0;
}

.crawler-monitor-v4 .status-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--color-warning);
  box-shadow: 0 0 0 4px color-mix(in srgb, #d97706 16%, transparent);
  flex: 0 0 auto;
}

.crawler-monitor-v4 .status-dot--danger {
  background: var(--color-danger);
  box-shadow: 0 0 0 4px color-mix(in srgb, #dc2626 15%, transparent);
}

.crawler-monitor-v4 .status-dot--success {
  background: var(--color-success);
  box-shadow: 0 0 0 4px color-mix(in srgb, #059669 15%, transparent);
}

.crawler-monitor-v4 .status-strip strong {
  display: block;
  min-width: 0;
  color: var(--color-text);
  font-size: 15px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.crawler-monitor-v4 .status-strip small {
  display: block;
  min-width: 0;
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.crawler-monitor-v4 .status-strip__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.crawler-monitor-v4 .status-pill {
  min-height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.crawler-monitor-v4 .domain-status-cell {
  min-height: 48px;
  display: grid;
  grid-template-rows: 26px 16px;
  align-content: center;
  gap: 4px;
  width: 88px;
}

.crawler-monitor-v4 .domain-status-cell .status-pill {
  min-width: 72px;
  width: 72px;
  justify-self: start;
}

.crawler-monitor-v4 .domain-status-cell small {
  min-height: 16px;
  max-width: 88px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.crawler-monitor-v4 .success {
  color: var(--color-success, #166534);
  background: var(--color-success-bg, #dcfce7);
}

.crawler-monitor-v4 .danger {
  color: var(--color-danger, #b91c1c);
  background: var(--color-danger-bg, #fee2e2);
}

.crawler-monitor-v4 .warning {
  color: var(--color-warning, #92400e);
  background: var(--color-warning-bg, #fef3c7);
}

.crawler-monitor-v4 .info {
  color: var(--color-info, #075985);
  background: var(--color-info-bg, #e0f2fe);
}

.crawler-monitor-v4 .ready {
  color: #166534;
  background: color-mix(in srgb, var(--color-success-bg, #dcfce7) 72%, var(--color-bg));
}

.crawler-monitor-v4 .cancelled {
  color: var(--color-text-secondary, #475569);
  background: color-mix(in srgb, var(--color-border) 72%, var(--color-bg));
}

.crawler-monitor-v4 .muted {
  color: var(--color-text-secondary, #475569);
  background: color-mix(in srgb, var(--color-border) 68%, var(--color-bg));
}

.crawler-monitor-v4 .metric-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.crawler-monitor-v4 .metric {
  min-width: 0;
  min-height: 86px;
  display: grid;
  align-content: space-between;
  gap: 8px;
  padding: 11px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  box-shadow: var(--shadow-card);
}

.crawler-monitor-v4 .metric strong {
  color: var(--color-text);
  font-size: 30px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0;
  font-variant-numeric: tabular-nums;
}

.crawler-monitor-v4 .metric small,
.crawler-monitor-v4 .metric span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.crawler-monitor-v4 .metric small {
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.35;
}

.crawler-monitor-v4 .metric span {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 1.3;
}

.crawler-monitor-v4 .module-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.crawler-monitor-v4 .module-tab {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-bg);
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, background-color 160ms ease, color 160ms ease;
}

.crawler-monitor-v4 .module-tab:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--color-primary) 36%, var(--color-border));
  color: var(--color-text);
}

.crawler-monitor-v4 .module-tab.active {
  color: #f8fffe;
  background: var(--color-primary);
  border-color: var(--color-primary);
  box-shadow: 0 16px 28px -24px color-mix(in srgb, var(--color-primary) 80%, transparent);
}

.crawler-monitor-v4 .module-tab__count {
  min-width: 18px;
  height: 18px;
  display: inline-grid;
  place-items: center;
  padding: 0 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 12%, var(--color-bg));
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
}

.crawler-monitor-v4 .module-tab.active .module-tab__count {
  background: rgb(255 255 255 / 22%);
  color: #f8fffe;
}

.crawler-monitor-v4 .module-stage-shell {
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--color-bg);
  box-shadow: var(--shadow-card);
}

.crawler-monitor-v4 .stage {
  display: grid;
  gap: 10px;
  min-width: 0;
  transition: opacity 170ms ease;
}

.crawler-monitor-v4 .stage.switching {
  opacity: 0.5;
}

.crawler-monitor-v4 .view-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: end;
}

.crawler-monitor-v4 .view-head h3 {
  margin: 0;
  color: var(--color-text);
  font-size: 18px;
  line-height: 1.2;
  letter-spacing: 0;
}

.crawler-monitor-v4 .view-head p {
  margin: 4px 0 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.42;
}

.crawler-monitor-v4 .monitor-panel-stage {
  min-width: 0;
}

.crawler-monitor-v4 .overview-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
  gap: 12px;
  align-items: start;
}

.crawler-monitor-v4 .domain-table {
  max-height: 520px;
  max-width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
}

.crawler-monitor-v4 .monitor-table {
  width: 100%;
  min-width: 0;
  table-layout: fixed;
  border-collapse: collapse;
}

.crawler-monitor-v4 .monitor-table th,
.crawler-monitor-v4 .monitor-table td {
  padding: 8px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent);
  font-size: 12px;
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}

.crawler-monitor-v4 .monitor-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  color: var(--color-text-secondary);
  background: var(--color-bg-secondary);
  font-weight: 700;
}

.crawler-monitor-v4 .monitor-table th:nth-child(1),
.crawler-monitor-v4 .monitor-table td:nth-child(1) {
  width: 18%;
}

.crawler-monitor-v4 .monitor-table th:nth-child(2),
.crawler-monitor-v4 .monitor-table td:nth-child(2) {
  width: 18%;
}

.crawler-monitor-v4 .monitor-table th:nth-child(3),
.crawler-monitor-v4 .monitor-table td:nth-child(3) {
  width: 14%;
}

.crawler-monitor-v4 .monitor-table th:nth-child(4),
.crawler-monitor-v4 .monitor-table td:nth-child(4) {
  width: 22%;
}

.crawler-monitor-v4 .monitor-table th:nth-child(5),
.crawler-monitor-v4 .monitor-table td:nth-child(5) {
  width: 28%;
}

.crawler-monitor-v4 .domain-row {
  cursor: pointer;
  transition: background-color 160ms ease, box-shadow 160ms ease;
}

.crawler-monitor-v4 .domain-row:hover {
  background: color-mix(in srgb, var(--color-bg-secondary) 58%, var(--color-bg));
}

.crawler-monitor-v4 .domain-row.selected {
  background: color-mix(in srgb, #f0fdfa 64%, var(--color-bg));
  box-shadow: inset 3px 0 0 var(--color-primary);
}

.crawler-monitor-v4 .domain-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.crawler-monitor-v4 .domain-actions .btn {
  min-height: 32px;
  padding: 5px 7px;
  white-space: normal;
}

.crawler-monitor-v4 .btn-plain--danger {
  color: var(--color-danger, #b91c1c);
  background: color-mix(in srgb, var(--color-danger, #b91c1c) 7%, transparent);
}

.crawler-monitor-v4 .progress-track {
  height: 7px;
  margin-top: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-border) 72%, transparent);
}

.crawler-monitor-v4 .progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.crawler-monitor-v4 .current-card {
  position: sticky;
  top: calc(var(--header-height) + 12px);
  display: grid;
  gap: 10px;
  min-width: 0;
  max-height: calc(100vh - var(--header-height) - 28px);
  overflow: auto;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 28%, var(--color-border));
  border-radius: 8px;
  background: var(--color-bg);
  box-shadow: var(--shadow-card);
}

.crawler-monitor-v4 .current-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: flex-start;
}

.crawler-monitor-v4 .current-head h4 {
  margin: 5px 0 0;
  font-size: 17px;
  line-height: 1.2;
}

.crawler-monitor-v4 .current-head p {
  margin: 5px 0 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.crawler-monitor-v4 .kv-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.crawler-monitor-v4 .kv {
  min-width: 0;
  padding: 9px;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
  border-radius: 8px;
  background: var(--color-bg-secondary);
}

.crawler-monitor-v4 .wiki-domain-control-strip {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 24%, var(--color-border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 5%, var(--color-bg));
}

.crawler-monitor-v4 .wiki-domain-control-strip__copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.crawler-monitor-v4 .wiki-domain-control-strip__copy strong {
  color: var(--color-text);
  font-size: 13px;
  font-weight: 900;
}

.crawler-monitor-v4 .wiki-domain-control-strip__copy small {
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.crawler-monitor-v4 .wiki-domain-control-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.crawler-monitor-v4 .wiki-domain-control-primary {
  border-color: color-mix(in srgb, var(--color-primary) 44%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg));
  color: var(--color-primary);
}

.crawler-monitor-v4 .kv small,
.crawler-monitor-v4 .kv strong {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
}

.crawler-monitor-v4 .kv strong {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.crawler-monitor-v4 .grid-queue,
.crawler-monitor-v4 .grid-progress,
.crawler-monitor-v4 .grid-reports,
.crawler-monitor-v4 .grid-auto,
.crawler-monitor-v4 .grid-diagnostics {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 0.36fr);
  gap: 12px;
  align-items: start;
}

.crawler-monitor-v4 .queue-list,
.crawler-monitor-v4 .task-list,
.crawler-monitor-v4 .report-list,
.crawler-monitor-v4 .diagnostic-list {
  display: grid;
  gap: 8px;
  max-height: 520px;
  min-width: 0;
  overflow: auto;
  padding-right: 2px;
}

.crawler-monitor-v4 .progress-group,
.crawler-monitor-v4 .queue-group {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.crawler-monitor-v4 .progress-group + .progress-group,
.crawler-monitor-v4 .queue-group + .queue-group {
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent);
}

.crawler-monitor-v4 .progress-group-head,
.crawler-monitor-v4 .queue-group-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: end;
  min-width: 0;
  min-height: 44px;
  padding: 2px 0;
}

.crawler-monitor-v4 .progress-group-head h4,
.crawler-monitor-v4 .queue-group-head h4 {
  margin: 0;
  color: var(--color-text);
  font-size: 13px;
  font-weight: 900;
  line-height: 1.25;
}

.crawler-monitor-v4 .progress-group-head p,
.crawler-monitor-v4 .queue-group-head p {
  margin: 3px 0 0;
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 1.35;
}

.crawler-monitor-v4 .queue-card,
.crawler-monitor-v4 .task-card,
.crawler-monitor-v4 .report-item,
.crawler-monitor-v4 .setting-row,
.crawler-monitor-v4 .diag-card,
.crawler-monitor-v4 .summary-card {
  min-width: 0;
  padding: 11px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  text-align: left;
  box-shadow: var(--shadow-card);
}

.crawler-monitor-v4 .queue-card,
.crawler-monitor-v4 .report-item {
  width: 100%;
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, background-color 160ms ease;
}

.crawler-monitor-v4 .queue-card:hover,
.crawler-monitor-v4 .report-item:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--color-primary) 34%, var(--color-border));
}

.crawler-monitor-v4 .queue-card.selected,
.crawler-monitor-v4 .report-item.active {
  background: color-mix(in srgb, #f0fdfa 64%, var(--color-bg));
  border-color: color-mix(in srgb, var(--color-primary) 38%, var(--color-border));
  box-shadow: inset 3px 0 0 var(--color-primary), var(--shadow-card);
}

.crawler-monitor-v4 .queue-card strong,
.crawler-monitor-v4 .task-card strong,
.crawler-monitor-v4 .report-item strong,
.crawler-monitor-v4 .setting-row strong,
.crawler-monitor-v4 .diag-card strong {
  display: block;
  min-width: 0;
  color: var(--color-text);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.crawler-monitor-v4 .queue-card small,
.crawler-monitor-v4 .task-card small,
.crawler-monitor-v4 .report-item small,
.crawler-monitor-v4 .setting-row small,
.crawler-monitor-v4 .diag-card small {
  display: block;
  min-width: 0;
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 1.38;
  overflow-wrap: anywhere;
}

.crawler-monitor-v4 .queue-time {
  display: inline-flex;
  width: max-content;
  max-width: 100%;
  margin: 0 0 7px;
  padding: 3px 7px;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-bg-secondary) 84%, transparent);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 750;
  line-height: 1.2;
}

.crawler-monitor-v4 .queue-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-bottom: 7px;
}

.crawler-monitor-v4 .progress-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  margin-bottom: 6px;
}

.crawler-monitor-v4 .progress-card-head > div {
  min-width: 0;
}

.crawler-monitor-v4 .progress-card-head .status-pill {
  flex: 0 0 auto;
}

.crawler-monitor-v4 .progress-card-subtitle {
  margin-bottom: 6px;
}

.crawler-monitor-v4 .queue-primary-insight,
.crawler-monitor-v4 .progress-primary-insight {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: 8px;
}

.crawler-monitor-v4 .queue-primary-insight span,
.crawler-monitor-v4 .progress-primary-insight span {
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-secondary);
}

.crawler-monitor-v4 .queue-card-details,
.crawler-monitor-v4 .progress-card-details {
  margin-top: 8px;
  border-top: 1px solid var(--color-border);
  padding-top: 8px;
}

.crawler-monitor-v4 .queue-card-details > summary,
.crawler-monitor-v4 .progress-card-details > summary {
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.crawler-monitor-v4 .progress-insight-grid,
.crawler-monitor-v4 .queue-insight-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-top: 8px;
}

.crawler-monitor-v4 .queue-insight-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.crawler-monitor-v4 .progress-insight-grid span,
.crawler-monitor-v4 .queue-insight-grid span {
  min-width: 0;
  padding: 7px;
  border: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 62%, transparent);
}

.crawler-monitor-v4 .progress-insight-grid strong,
.crawler-monitor-v4 .queue-insight-grid strong {
  margin-top: 2px;
  font-size: 12px;
}

.crawler-monitor-v4 .progress-state-conflict {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--color-warning, #d97706) 32%, var(--color-border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-warning-bg, #fef3c7) 72%, var(--color-bg-card));
}

.crawler-monitor-v4 .progress-state-conflict > div {
  min-width: 0;
}

.crawler-monitor-v4 .progress-state-conflict strong {
  display: block;
  margin-top: 2px;
  color: var(--color-warning, #92400e);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.crawler-monitor-v4 .progress-control-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.crawler-monitor-v4 .queue-message {
  min-height: 18px;
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.crawler-monitor-v4 .queue-message--warning {
  color: var(--color-warning, #92400e);
}

.crawler-monitor-v4 .side-panel {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.crawler-monitor-v4 .queue-side-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.crawler-monitor-v4 .queue-side-head h4,
.crawler-monitor-v4 .queue-side-head p {
  margin: 0;
}

.crawler-monitor-v4 .queue-side-head h4 {
  color: var(--color-text);
  font-size: 15px;
  line-height: 1.3;
}

.crawler-monitor-v4 .queue-side-head p {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.crawler-monitor-v4 .dispatch-queue-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  min-width: 0;
}

.crawler-monitor-v4 .dispatch-queue-row__main {
  display: grid;
  gap: 5px;
  min-width: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0;
  text-align: left;
}

.crawler-monitor-v4 .dispatch-queue-row__main > span {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.crawler-monitor-v4 .dispatch-queue-row__main strong,
.crawler-monitor-v4 .dispatch-queue-row__main small,
.crawler-monitor-v4 .dispatch-queue-row__main code {
  min-width: 0;
  overflow-wrap: anywhere;
}

.crawler-monitor-v4 .dispatch-queue-row__main strong {
  color: var(--color-text);
  font-size: 13px;
  line-height: 1.35;
}

.crawler-monitor-v4 .dispatch-queue-row__main small,
.crawler-monitor-v4 .dispatch-queue-row__main code {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 1.38;
}

.crawler-monitor-v4 .dispatch-queue-row__blocker {
  color: var(--color-warning);
  font-weight: 700;
}

.crawler-monitor-v4 .dispatch-queue-row__meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  min-width: 0;
}

.crawler-monitor-v4 .dispatch-queue-row__meta span {
  min-width: 0;
  padding: 8px;
  border-radius: 8px;
  background: var(--color-bg-secondary);
}

.crawler-monitor-v4 .dispatch-queue-row__meta small,
.crawler-monitor-v4 .dispatch-queue-row__meta strong {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
}

.crawler-monitor-v4 .dispatch-queue-row__meta small {
  color: var(--color-text-secondary);
  font-size: 10px;
  font-weight: 700;
}

.crawler-monitor-v4 .dispatch-queue-row__meta strong {
  margin-top: 2px;
  color: var(--color-text);
  font-size: 11px;
  line-height: 1.25;
}

.crawler-monitor-v4 .settings-form {
  display: grid;
  gap: 8px;
}

.crawler-monitor-v4 .setting-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.crawler-monitor-v4 .diag-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.crawler-monitor-v4 .diag-card.accent {
  border-color: color-mix(in srgb, var(--color-primary) 34%, var(--color-border));
  box-shadow: inset 3px 0 0 var(--color-primary), var(--shadow-card);
}

.crawler-monitor-v4 .diag-card.warning {
  border-color: color-mix(in srgb, #d97706 34%, var(--color-border));
  box-shadow: inset 3px 0 0 var(--color-warning), var(--shadow-card);
}

.crawler-monitor-v4 .diag-card.danger,
.crawler-monitor-v4 .data-quality-cell.danger {
  border-color: color-mix(in srgb, #dc2626 34%, var(--color-border));
  box-shadow: inset 3px 0 0 var(--color-danger), var(--shadow-card);
}

.crawler-monitor-v4 .domain-table {
  max-width: 100%;
  overflow: auto;
}

.crawler-monitor-v4 .progress-path-list {
  max-width: 100%;
  gap: 5px;
}

.crawler-monitor-v4 .progress-path-list .inline-report-button,
.crawler-monitor-v4 .inline-report-button--compact {
  max-width: 100%;
}

.crawler-monitor-v4 .progress-path-list .inline-report-button span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.crawler-monitor-v4 .code-preview {
  min-height: 0;
  height: 430px;
  max-width: 100%;
  padding: 14px;
  border-radius: 8px;
  background: #171512;
  color: #f5f5f4;
  font-family: Consolas, "JetBrains Mono", monospace;
  font-size: 12px;
  line-height: 1.62;
  overflow: auto;
  white-space: pre-wrap;
}

.crawler-monitor-v4 .drawer-backdrop {
  position: fixed;
  inset: var(--header-height) 0 0 var(--sidebar-width);
  z-index: 1000;
  background: rgb(28 25 23 / 30%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 220ms ease;
}

.crawler-monitor-v4 .drawer-backdrop.open {
  opacity: 1;
  pointer-events: auto;
}

.crawler-monitor-v4 .report-drawer {
  position: fixed;
  top: var(--header-height);
  right: 0;
  bottom: 0;
  z-index: 1001;
  width: min(620px, calc(100vw - var(--sidebar-width)));
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  background: var(--color-bg);
  border-left: 1px solid var(--color-border);
  box-shadow: var(--shadow-floating);
  transform: translateX(105%);
  transition: transform 260ms ease;
}

.crawler-monitor-v4 .report-drawer.open {
  transform: translateX(0);
}

.crawler-monitor-v4 .drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  min-width: 0;
  padding: 16px 18px;
  border-bottom: 1px solid var(--color-border);
}

.crawler-monitor-v4 .drawer-head strong,
.crawler-monitor-v4 .drawer-head small {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
}

.crawler-monitor-v4 .drawer-head strong {
  font-size: 15px;
}

.crawler-monitor-v4 .drawer-head small {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.crawler-monitor-v4 .drawer-body {
  display: grid;
  align-content: start;
  gap: 12px;
  min-height: 0;
  padding: 16px 18px;
  overflow: auto;
}

.crawler-monitor-v4 {
  scrollbar-color: color-mix(in srgb, var(--color-text-muted) 42%, transparent) transparent;
  scrollbar-width: thin;
}

.crawler-monitor-v4 ::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.crawler-monitor-v4 ::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--color-text-muted) 34%, transparent);
  border: 3px solid transparent;
  border-radius: 999px;
  background-clip: content-box;
}

.crawler-monitor-v4 ::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--color-primary) 42%, transparent);
  border: 3px solid transparent;
  background-clip: content-box;
}

.crawler-monitor-v4 .status-strip {
  background:
    linear-gradient(180deg, color-mix(in srgb, #fffbeb 58%, var(--color-bg-secondary)), var(--color-bg-secondary));
}

.crawler-monitor-v4 .btn:focus-visible,
.crawler-monitor-v4 .module-tab:focus-visible,
.crawler-monitor-v4 .queue-card:focus-visible,
.crawler-monitor-v4 .task-card:focus-visible,
.crawler-monitor-v4 .report-item:focus-visible,
.crawler-monitor-v4 .inline-report-button:focus-visible {
  outline: 0;
  box-shadow: var(--shadow-focus), var(--shadow-card);
}

.crawler-monitor-v4 .metric,
.crawler-monitor-v4 .module-stage-shell,
.crawler-monitor-v4 .queue-card,
.crawler-monitor-v4 .task-card,
.crawler-monitor-v4 .report-item,
.crawler-monitor-v4 .diag-card,
.crawler-monitor-v4 .summary-card,
.crawler-monitor-v4 .current-card {
  background:
    linear-gradient(180deg, var(--color-bg-secondary), color-mix(in srgb, var(--color-bg-secondary) 90%, var(--color-bg-tertiary)));
}

.crawler-monitor-v4 .metric {
  position: relative;
  overflow: hidden;
  border-color: color-mix(in srgb, var(--color-border) 84%, transparent);
}

.crawler-monitor-v4 .metric::after {
  content: "";
  position: absolute;
  inset: auto 12px 0;
  height: 2px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 30%, transparent);
  opacity: 0.45;
}

.crawler-monitor-v4 .side-panel {
  position: sticky;
  top: calc(var(--header-height) + 12px);
  align-self: start;
}

.crawler-monitor-v4 .queue-card,
.crawler-monitor-v4 .task-card,
.crawler-monitor-v4 .report-item {
  position: relative;
  overflow: hidden;
  box-shadow: 0 10px 26px -24px rgb(28 25 23 / 22%);
}

.crawler-monitor-v4 .queue-card::before,
.crawler-monitor-v4 .task-card::before,
.crawler-monitor-v4 .report-item::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: transparent;
  transition: background-color 160ms ease, opacity 160ms ease;
}

.crawler-monitor-v4 .queue-card.selected,
.crawler-monitor-v4 .report-item.active {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 7%, var(--color-bg-secondary)), var(--color-bg-secondary));
  box-shadow:
    inset 3px 0 0 var(--color-primary),
    0 14px 34px -28px color-mix(in srgb, var(--color-primary) 42%, rgb(28 25 23 / 20%));
}

.crawler-monitor-v4 .queue-card.selected::before,
.crawler-monitor-v4 .report-item.active::before {
  background: var(--color-primary);
}

.crawler-monitor-v4 .queue-card:hover,
.crawler-monitor-v4 .task-card:hover,
.crawler-monitor-v4 .report-item:hover,
.crawler-monitor-v4 .diag-card:hover {
  box-shadow: var(--shadow-surface-2);
}

.crawler-monitor-v4 .queue-primary-insight span,
.crawler-monitor-v4 .progress-primary-insight span,
.crawler-monitor-v4 .queue-insight-grid span,
.crawler-monitor-v4 .progress-insight-grid span,
.crawler-monitor-v4 .dispatch-queue-row__meta span,
.crawler-monitor-v4 .kv {
  background:
    linear-gradient(180deg, var(--color-bg-secondary), color-mix(in srgb, var(--color-bg-secondary) 82%, var(--color-bg-tertiary)));
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 58%, transparent);
}

.crawler-monitor-v4 .progress-track {
  height: 8px;
  background: color-mix(in srgb, var(--color-border) 64%, var(--color-bg-tertiary));
  box-shadow: inset 0 1px 2px rgb(28 25 23 / 6%);
}

.crawler-monitor-v4 .progress-track span {
  background: linear-gradient(90deg, var(--color-primary-dark), var(--color-primary-light));
}

.crawler-monitor-v4 .progress-track span.danger {
  background: linear-gradient(90deg, var(--color-danger), #f87171);
}

.crawler-monitor-v4 .progress-track span.warning {
  background: linear-gradient(90deg, var(--color-warning), #fbbf24);
}

.crawler-monitor-v4 .evidence-row .inline-report-button,
.crawler-monitor-v4 .progress-path-list .inline-report-button {
  position: relative;
  min-height: 54px;
  border-color: color-mix(in srgb, var(--color-border) 82%, transparent);
  background:
    linear-gradient(180deg, var(--color-bg-secondary), color-mix(in srgb, var(--color-bg-secondary) 80%, var(--color-bg-tertiary)));
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 54%, transparent);
}

.crawler-monitor-v4 .evidence-row .inline-report-button::after,
.crawler-monitor-v4 .progress-path-list .inline-report-button::after,
.crawler-monitor-v4 .evidence-chip::after {
  content: "";
  position: absolute;
  right: 9px;
  top: 9px;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 58%, transparent);
}

.crawler-monitor-v4 .inline-report-button--not-previewable::after {
  background: color-mix(in srgb, var(--color-text-muted) 38%, transparent);
}

.crawler-monitor-v4 .queue-side-head {
  padding-bottom: 2px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 74%, transparent);
}

.crawler-monitor-v4 .diag-card {
  min-height: 86px;
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}

.crawler-monitor-v4 .diag-card:hover {
  transform: translateY(-1px);
}

.crawler-monitor-v4 .diag-card:not(.danger):not(.warning):not(.accent) {
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--color-border) 80%, transparent), var(--shadow-card);
}

.crawler-monitor-v4 .current-card {
  box-shadow: inset 3px 0 0 var(--color-primary), var(--shadow-surface-2);
}

.crawler-monitor-v4 .wiki-domain-control-strip {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-secondary)), var(--color-bg-secondary));
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 58%, transparent);
}

.crawler-monitor-v4 .code-preview {
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 4%);
}

@media (prefers-reduced-motion: reduce) {
  .crawler-monitor-v4 .module-tab,
  .crawler-monitor-v4 .stage,
  .crawler-monitor-v4 .drawer-backdrop,
  .crawler-monitor-v4 .report-drawer,
  .crawler-monitor-v4 .queue-card,
  .crawler-monitor-v4 .task-card,
  .crawler-monitor-v4 .report-item {
    transition-duration: 1ms;
  }
}

@media (max-width: 1180px) {
  .crawler-monitor-v4 .overview-layout,
  .crawler-monitor-v4 .grid-queue,
  .crawler-monitor-v4 .grid-auto,
  .crawler-monitor-v4 .grid-progress,
  .crawler-monitor-v4 .grid-diagnostics,
  .crawler-monitor-v4 .grid-reports {
    grid-template-columns: 1fr;
  }

  .crawler-monitor-v4 .current-card {
    position: static;
  }

  .crawler-monitor-v4 .drawer-backdrop {
    inset-left: 0;
  }

  .crawler-monitor-v4 .report-drawer {
    width: min(620px, 100vw);
  }

  .crawler-monitor-v4 .metric-row {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .crawler-monitor-v4 {
    gap: 8px;
  }

  .crawler-monitor-v4 .status-strip,
  .crawler-monitor-v4 .view-head,
  .crawler-monitor-v4 .setting-row {
    grid-template-columns: 1fr;
  }

  .crawler-monitor-v4 .status-strip__main {
    align-items: flex-start;
  }

  .crawler-monitor-v4 .status-strip__actions {
    justify-content: flex-start;
  }

  .crawler-monitor-v4 .metric-row,
  .crawler-monitor-v4 .diag-grid,
  .crawler-monitor-v4 .kv-grid {
    grid-template-columns: 1fr;
  }

  .crawler-monitor-v4 .module-tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .crawler-monitor-v4 .module-tab {
    min-height: 44px;
    justify-content: center;
    padding-inline: 10px;
  }

  .crawler-monitor-v4 .inline-report-button,
  .crawler-monitor-v4 .inline-report-button--compact,
  .crawler-monitor-v4 .icon-close-button {
    min-height: 44px;
  }

  .crawler-monitor-v4 .icon-close-button {
    min-width: 44px;
  }

  .crawler-monitor-v4 .domain-table {
    max-height: 520px;
  }

  .crawler-monitor-v4 .monitor-table {
    min-width: 640px;
  }
}
</style>
