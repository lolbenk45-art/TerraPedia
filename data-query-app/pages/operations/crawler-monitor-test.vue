<template>
  <div class="page-wrap page-workspace crawler-monitor-test">
    <section class="workspace-shell workspace-shell--unified">
      <div class="workspace-hero workspace-hero--unified test-hero">
        <div class="workspace-hero__copy">
          <p class="eyebrow">爬取监控测试</p>
          <h1 class="page-head__title">监控测试状态</h1>
          <p class="page-head__subtitle">{{ filePath }}</p>
          <div class="workspace-summary-grid">
            <article v-for="stat in summaryCards" :key="stat.label" class="summary-mini">
              <span class="summary-mini__label">{{ stat.label }}</span>
              <strong class="summary-mini__value">{{ stat.value }}</strong>
            </article>
          </div>
        </div>

        <div class="toolbar-top action-cluster toolbar-top--hero test-actions">
          <button type="button" class="btn btn-secondary" :disabled="loading" @click="loadState">
            <RefreshCw :size="16" :class="{ spin: loading }" />
            <span>{{ loading ? '刷新中' : '刷新' }}</span>
          </button>
          <button type="button" class="btn btn-secondary" :disabled="saving || simulationRunning" @click="resetState">
            <RotateCcw :size="16" />
            <span>重置</span>
          </button>
          <button
            type="button"
            class="btn"
            :class="autoRefresh ? 'btn-primary' : 'btn-secondary'"
            @click="autoRefresh = !autoRefresh"
          >
            <TimerReset :size="16" />
            <span>{{ autoRefreshLabel }}</span>
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="domainSmokeRunning || loading || saving || simulationRunning"
            @click="startDomainSmoke"
          >
            <Download :size="16" :class="{ spin: domainSmokeRunning }" />
            <span>{{ domainSmokePrimaryActionLabel }}</span>
          </button>
          <button type="button" class="btn btn-secondary" :disabled="domainSmokeProgressActive" @click="clearDomainSmokeDisplay">
            <X :size="16" />
            <span>清除本次展示</span>
          </button>
          <NuxtLink class="btn btn-secondary" to="/operations/crawler-monitor">
            回到监控页
          </NuxtLink>
          <label class="refresh-interval-control">
            <span>间隔</span>
            <input
              v-model="refreshIntervalInput"
              type="number"
              inputmode="numeric"
              :min="MIN_REFRESH_INTERVAL_SECONDS"
              :max="MAX_REFRESH_INTERVAL_SECONDS"
              step="1"
              aria-label="自动刷新间隔秒数"
              @blur="commitRefreshInterval"
              @change="commitRefreshInterval"
            >
            <span>秒</span>
          </label>
        </div>
      </div>
    </section>

    <section class="section-card status-grid">
      <article v-for="card in statusCards" :key="card.label" class="status-card">
        <span class="status-card__icon" :class="card.tone">
          <component :is="card.icon" :size="18" />
        </span>
        <div>
          <span class="status-card__label">{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
          <small>{{ card.detail }}</small>
        </div>
      </article>
    </section>

    <section class="section-card domain-smoke-testcases">
      <div class="section-head">
        <div>
          <h2 class="section-card__title">每域 10 条真实测试用例</h2>
          <p class="section-card__subtitle">选择域后走后端 domain_smoke 队列；结果读取真实 output JSON。</p>
        </div>
        <span class="status-pill" :class="statusTone(domainSmokeProgressStatus)">
          {{ statusLabel(domainSmokeProgressStatus) }}
        </span>
      </div>

      <div class="domain-smoke-selector" aria-label="选择真实爬取测试域">
        <button
          v-for="domain in domainSmokeTestDomains"
          :key="domain.domain"
          type="button"
          class="domain-smoke-toggle"
          :class="{ selected: selectedSmokeDomains.includes(domain.domain) }"
          :disabled="domainSmokeRunning || domainSmokeProgressActive"
          @click="toggleSmokeDomain(domain.domain)"
        >
          <span>{{ domain.label }}</span>
          <small>{{ domain.domain }}</small>
        </button>
      </div>

      <div class="domain-smoke-actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!selectedSmokeDomains.length || domainSmokeRunning || domainSmokeProgressActive"
          @click="runSelectedDomainSmoke('single')"
        >
          <Download :size="16" :class="{ spin: domainSmokeRunning }" />
          <span>单任务爬选中域</span>
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="!selectedSmokeDomains.length || domainSmokeRunning || domainSmokeProgressActive"
          @click="runSelectedDomainSmoke('per_domain')"
        >
          <Download :size="16" />
          <span>逐域加入队列</span>
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="domainSmokeRunning || domainSmokeProgressActive"
          @click="runAllDomainSmokeQueue"
        >
          <Download :size="16" />
          <span>全部 10 域入队</span>
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="domainSmokeRunning || domainSmokeProgressActive"
          @click="selectAllSmokeDomains"
        >
          <CheckCircle2 :size="16" />
          <span>全选</span>
        </button>
        <button
          type="button"
          class="btn btn-danger"
          :disabled="domainSmokeRunning || domainSmokeProgressActive || domainSmokeCleanupRunning"
          @click="cleanupDomainSmokeArtifacts"
        >
          <XCircle :size="16" :class="{ spin: domainSmokeCleanupRunning }" />
          <span>{{ domainSmokeCleanupRunning ? '删除中' : '一键删除测试域数据' }}</span>
        </button>
      </div>

      <section class="domain-smoke-queue-control-panel" aria-label="队列控制">
        <div>
          <h3 class="section-card__title">队列控制</h3>
          <p class="section-card__subtitle">10 域样本不支持暂停和断点续传；取消一个排队域后会继续执行后面的队列项。</p>
        </div>
        <div class="domain-smoke-queue-note">
          <span>排队状态可单独取消。</span>
          <span>运行中的域只能终止当前域，后续排队域仍由后端队列继续处理。</span>
        </div>
      </section>

      <section class="domain-smoke-effect-panel" aria-label="本次 10 域下载效果">
        <div class="section-head section-head--compact">
          <div>
            <h3 class="section-card__title">本次 10 域下载效果</h3>
            <p class="section-card__subtitle">直接看本次生成位置、文件数量、记录总数和失败域；清理按钮只删除 reports/crawler-monitor/wiki-monitor-domain-smoke* 测试产物。</p>
          </div>
          <span class="status-pill" :class="statusTone(domainSmokeProgressStatus)">
            {{ statusLabel(domainSmokeProgressStatus) }}
          </span>
        </div>
        <div class="domain-smoke-effect-grid">
          <article v-for="card in domainSmokeEffectCards" :key="card.label" class="domain-smoke-effect-card">
            <small>{{ card.label }}</small>
            <strong>{{ card.value }}</strong>
            <span>{{ card.detail }}</span>
          </article>
        </div>
        <div class="domain-smoke-effect-paths">
          <span>
            <small>输出目录</small>
            <code>{{ domainSmokeEffectOutputDir || '当前没有结果' }}</code>
          </span>
          <span>
            <small>进度文件</small>
            <code>{{ domainSmokeEffectProgressPath }}</code>
          </span>
          <span>
            <small>报告文件</small>
            <code>{{ domainSmokeEffectReportPath || '--' }}</code>
          </span>
        </div>
      </section>

      <section v-if="domainSmokeQueueBatchRows.length > 1" class="domain-smoke-queue-panel" aria-label="最近 10 域队列下载情况">
        <div class="section-head section-head--compact">
          <div>
            <h3 class="section-card__title">最近 10 域队列下载情况</h3>
            <p class="section-card__subtitle">来自 wikiMonitor.dispatchQueue 的最新 domain_smoke 批次；每个域独立显示下载状态、输出 JSON、报告和日志。</p>
          </div>
          <span class="status-pill muted">{{ formatNumber(domainSmokeQueueBatchRows.length) }} 域</span>
        </div>
      </section>

      <div class="domain-smoke-result-grid">
        <article v-for="row in domainSmokeResultRows" :key="row.domain" class="domain-smoke-result-card">
          <div class="domain-smoke-result-card__head">
            <div>
              <strong>{{ row.label }}</strong>
              <small>{{ row.domain }}</small>
            </div>
            <span class="status-pill" :class="statusTone(row.status)">{{ row.verdict }}</span>
          </div>
          <div class="domain-smoke-result-metrics">
            <span><small>期望 10 条</small><strong>10</strong></span>
            <span><small>实际</small><strong>{{ formatNumber(row.actualCount) }}</strong></span>
            <span><small>状态</small><strong>{{ statusLabel(row.status) }}</strong></span>
            <span><small>开始时间</small><strong>{{ formatDate(row.startedAt || row.requestedAt) }}</strong></span>
            <span><small>完成时间</small><strong>{{ formatDate(row.completedAt) }}</strong></span>
            <span><small>队列</small><strong>{{ row.queueId || '--' }}</strong></span>
          </div>
          <p v-if="row.failureReason" class="domain-smoke-error">
            <strong>错误原因</strong>
            <span>{{ row.failureReason }}</span>
          </p>
          <div class="domain-smoke-file-actions">
            <span>
              <small>输出文件</small>
              <code>{{ row.outputPath || '--' }}</code>
            </span>
            <span>
              <small>报告文件</small>
              <code>{{ row.reportPath || '--' }}</code>
            </span>
            <span>
              <small>日志文件</small>
              <code>{{ row.logPath || '--' }}</code>
            </span>
            <button
              v-if="row.outputPath"
              type="button"
              class="btn btn-secondary domain-smoke-file-button"
              :disabled="domainSmokeFilePreviewLoading && domainSmokeFilePreviewPath === row.outputPath"
              @click="openDomainSmokeFilePreview(row.outputPath)"
            >
              <FileJson :size="16" />
              <span>{{ domainSmokeFilePreviewLoading && domainSmokeFilePreviewPath === row.outputPath ? '读取中' : '查看文件' }}</span>
            </button>
            <button
              v-if="row.logPath"
              type="button"
              class="btn btn-secondary domain-smoke-file-button"
              :disabled="domainSmokeFilePreviewLoading && domainSmokeFilePreviewPath === row.logPath"
              @click="openDomainSmokeFilePreview(row.logPath)"
            >
              <FileJson :size="16" />
              <span>{{ domainSmokeFilePreviewLoading && domainSmokeFilePreviewPath === row.logPath ? '读取中' : '查看日志' }}</span>
            </button>
            <div v-if="canCancelDomainSmokeQueuedRow(row) || canCancelDomainSmokeRunningRow(row)" class="domain-smoke-queue-controls">
              <button
                v-if="canCancelDomainSmokeQueuedRow(row)"
                type="button"
                class="btn btn-secondary domain-smoke-file-button"
                :disabled="domainSmokeQueueControlLoading === row.queueId"
                @click="cancelDomainSmokeQueuedRow(row)"
              >
                <XCircle :size="16" :class="{ spin: domainSmokeQueueControlLoading === row.queueId }" />
                <span>{{ domainSmokeQueueControlLoading === row.queueId ? '取消中' : '取消排队' }}</span>
              </button>
              <button
                v-if="canCancelDomainSmokeRunningRow(row)"
                type="button"
                class="btn btn-danger domain-smoke-file-button"
                :disabled="domainSmokeQueueControlLoading === row.queueId"
                @click="cancelDomainSmokeRunningRow(row)"
              >
                <XCircle :size="16" :class="{ spin: domainSmokeQueueControlLoading === row.queueId }" />
                <span>{{ domainSmokeQueueControlLoading === row.queueId ? '终止中' : '终止当前域' }}</span>
              </button>
            </div>
          </div>
        </article>
      </div>

      <section v-if="domainSmokeFilePreviewPath || domainSmokeFilePreviewContent || domainSmokeFilePreviewError" class="domain-smoke-file-viewer">
        <div class="section-head section-head--compact">
          <div>
            <h3 class="section-card__title">原始文件内容</h3>
            <p class="section-card__subtitle">当前文件：{{ domainSmokeFilePreviewPath || '--' }}</p>
          </div>
          <button type="button" class="btn btn-secondary" @click="closeDomainSmokeFilePreview">
            <X :size="16" />
            <span>关闭</span>
          </button>
        </div>
        <p v-if="domainSmokeFilePreviewError" class="domain-smoke-error">
          <strong>读取失败</strong>
          <span>{{ domainSmokeFilePreviewError }}</span>
        </p>
        <pre v-else class="domain-smoke-file-content">{{ domainSmokeFilePreviewContent || '正在读取文件...' }}</pre>
      </section>

      <div class="domain-smoke-records">
        <div class="section-head section-head--compact">
          <div>
            <h3 class="section-card__title">真实记录</h3>
            <p class="section-card__subtitle">来自每个域 output JSON 的 records。</p>
          </div>
          <span class="status-pill muted">{{ formatNumber(domainSmokeRecordRows.length) }} rows</span>
        </div>
        <div class="table-scroll">
          <table class="monitor-table domain-smoke-record-table">
            <thead>
              <tr>
                <th>域</th>
                <th>标题</th>
                <th>pageId</th>
                <th>revisionId</th>
                <th>revisionTimestamp</th>
                <th>contentLength</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="record in domainSmokeRecordRows" :key="`${record.domain}-${record.index}-${record.title}`">
                <td>{{ record.domainLabel }}</td>
                <td><strong>{{ record.title || '--' }}</strong></td>
                <td>{{ record.pageId ?? '--' }}</td>
                <td>{{ record.revisionId ?? '--' }}</td>
                <td>{{ formatDate(record.revisionTimestamp) }}</td>
                <td>{{ formatNumber(record.contentLength) }}</td>
              </tr>
              <tr v-if="!domainSmokeRecordRows.length">
                <td colspan="6" class="table-empty">暂无真实记录；先运行单域或队列测试。</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="section-card business-json-panel">
      <div class="section-head">
        <div>
          <h2 class="section-card__title">业务 JSON 数据文件</h2>
          <p class="section-card__subtitle">查看标准化数据里的具体记录字段，例如 Wooden Sword、Nurse、Guide。</p>
        </div>
        <span class="status-pill muted">{{ formatNumber(businessJsonRecordRows.length) }} rows</span>
      </div>

      <div class="business-json-toolbar">
        <div class="domain-smoke-actions">
          <button
            v-for="dataset in businessJsonDatasets"
            :key="dataset.key"
            type="button"
            class="btn"
            :class="selectedBusinessJsonDatasetKey === dataset.key ? 'btn-primary' : 'btn-secondary'"
            :disabled="businessJsonLoading"
            @click="loadBusinessJsonDataset(dataset.key)"
          >
            <FileJson :size="16" />
            <span>{{ dataset.label }}</span>
          </button>
        </div>
        <label class="field-control business-json-search">
          <span>搜索记录</span>
          <input
            v-model="businessJsonSearchInput"
            type="search"
            placeholder="Wooden Sword / Nurse / Guide / internalName"
            aria-label="搜索业务 JSON 记录"
          >
        </label>
        <div class="domain-smoke-actions">
          <button type="button" class="btn btn-secondary" @click="setBusinessJsonSearch('items', 'Wooden Sword')">
            Wooden Sword
          </button>
          <button type="button" class="btn btn-secondary" @click="setBusinessJsonSearch('npcs', 'Nurse')">
            Nurse
          </button>
          <button type="button" class="btn btn-secondary" @click="setBusinessJsonSearch('npcs', 'Guide')">
            Guide
          </button>
        </div>
      </div>

      <div class="business-json-source">
        <span>当前文件</span>
        <code>{{ selectedBusinessJsonDataset?.path || '--' }}</code>
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="!selectedBusinessJsonDataset?.path || businessJsonLoading"
          @click="openDomainSmokeFilePreview(selectedBusinessJsonDataset?.path || '')"
        >
          <FileJson :size="16" />
          <span>查看完整文件</span>
        </button>
      </div>

      <p v-if="businessJsonError" class="domain-smoke-error">
        <strong>读取失败</strong>
        <span>{{ businessJsonError }}</span>
      </p>

      <div class="table-scroll">
        <table class="monitor-table business-json-record-table">
          <thead>
            <tr>
              <th>id</th>
              <th>name</th>
              <th>internalName</th>
              <th>类型</th>
              <th>关键数值</th>
              <th>JSON</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in businessJsonRecordRows" :key="`${row.id}-${row.internalName}-${row.name}`">
              <td>{{ row.id }}</td>
              <td><strong>{{ row.name }}</strong></td>
              <td><code>{{ row.internalName }}</code></td>
              <td>{{ row.kind }}</td>
              <td>{{ row.summary }}</td>
              <td>
                <button type="button" class="btn btn-secondary btn-compact" @click="openBusinessJsonRecordPreview(row.record)">
                  查看记录
                </button>
              </td>
            </tr>
            <tr v-if="!businessJsonRecordRows.length">
              <td colspan="6" class="table-empty">{{ businessJsonLoading ? '正在读取业务 JSON...' : '没有匹配记录' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <section v-if="businessJsonRecordPreview" class="domain-smoke-file-viewer">
        <div class="section-head section-head--compact">
          <div>
            <h3 class="section-card__title">具体记录 JSON</h3>
            <p class="section-card__subtitle">{{ businessJsonRecordPreviewTitle }}</p>
          </div>
          <button type="button" class="btn btn-secondary" @click="businessJsonRecordPreview = ''">
            <X :size="16" />
            <span>关闭</span>
          </button>
        </div>
        <pre class="domain-smoke-file-content">{{ businessJsonRecordPreview }}</pre>
      </section>
    </section>

    <section class="section-card simulation-panel">
      <div class="section-head">
        <div>
          <h2 class="section-card__title">定时模拟</h2>
          <p class="section-card__subtitle">持续写入 running payload，然后以 completed 或 failed 结束。</p>
        </div>
        <span v-if="simulationRunning" class="status-pill info">运行中 {{ simulationElapsedSeconds }}s</span>
      </div>
      <div class="simulation-controls">
        <label class="field-control">
          <span>持续时间</span>
          <input
            v-model="simulationDurationInput"
            type="number"
            inputmode="numeric"
            :min="MIN_SIMULATION_DURATION_SECONDS"
            :max="MAX_SIMULATION_DURATION_SECONDS"
            step="1"
            :disabled="simulationRunning"
            aria-label="模拟任务持续秒数"
            @blur="commitSimulationDuration"
            @change="commitSimulationDuration"
          >
          <small>秒</small>
        </label>

        <label class="field-control">
          <span>最终结果</span>
          <select v-model="simulationResult" :disabled="simulationRunning" aria-label="模拟任务最终结果">
            <option value="completed">完成 completed</option>
            <option value="failed">失败 failed</option>
          </select>
        </label>

        <div class="simulation-progress" aria-live="polite">
          <div class="simulation-progress__meta">
            <span>{{ simulationRunning ? '进行中' : '就绪' }}</span>
            <strong>{{ simulationProgressLabel }}</strong>
          </div>
          <div class="progress-track">
            <span class="info" :style="{ width: simulationProgressWidth }" />
          </div>
        </div>

        <button
          type="button"
          class="btn btn-primary"
          :disabled="saving || loading || simulationRunning || editorDirty"
          :title="editorDirty ? '开始模拟前请保存或重置 JSON 编辑' : ''"
          @click="startTimedSimulation"
        >
          <Play :size="16" />
          <span>开始</span>
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="!simulationRunning || saving"
          @click="finishTimedSimulation()"
        >
          <CheckCircle2 :size="16" />
          <span>立即结束</span>
        </button>
        <small v-if="editorDirty" class="simulation-warning">开始前请保存或重置 JSON 编辑。</small>
      </div>
    </section>

    <section v-if="domainSmokeResult" class="section-card smoke-panel">
      <div class="section-head">
        <div>
          <h2 class="section-card__title">真实下载测试</h2>
          <p class="section-card__subtitle">后端固定执行 wiki-monitor-domain-smoke，每个域最多 10 条。</p>
        </div>
        <span class="status-pill" :class="statusTone(domainSmokeResult.status)">{{ statusLabel(domainSmokeResult.status) }}</span>
      </div>
      <div class="smoke-meta">
        <span>任务 {{ domainSmokeResult.dispatchId || '--' }}</span>
        <span>进度 {{ domainSmokeResult.progressPath || '--' }}</span>
        <span>报告 {{ domainSmokeResult.reportPath || '--' }}</span>
      </div>
    </section>

    <section class="section-card smoke-progress-panel">
      <div class="section-head">
        <div>
          <h2 class="section-card__title">真实下载进度</h2>
          <p class="section-card__subtitle">读取后端 overview 中的 wiki-monitor-domain-smoke 进度文件。</p>
        </div>
        <span class="status-pill" :class="statusTone(domainSmokeProgressStatus)">
          {{ statusLabel(domainSmokeProgressStatus) }}
        </span>
      </div>

      <div class="smoke-progress-summary">
        <span>
          <small>总进度</small>
          <strong>{{ domainSmokeProgressLabel }}</strong>
        </span>
        <span>
          <small>汇总</small>
          <strong>{{ domainSmokeSummaryLabel }}</strong>
        </span>
        <span>
          <small>域</small>
          <strong>{{ formatNumber(visibleDomainSmokeProgressRows.length) }}</strong>
        </span>
        <span>
          <small>当前域</small>
          <strong>{{ domainSmokeCurrentDomain || '--' }}</strong>
        </span>
        <span>
          <small>更新时间</small>
          <strong>{{ formatDate(domainSmokeProgressTask?.progressHeartbeatAt || domainSmokeProgressTask?.updatedAt) }}</strong>
        </span>
      </div>
      <div class="progress-track">
        <span :class="statusTone(domainSmokeProgressStatus)" :style="{ width: domainSmokeProgressWidth }" />
      </div>
      <div class="smoke-meta">
        <span>进度 {{ domainSmokeProgressTask?.progressSource || domainSmokeProgressTask?.progressPath || domainSmokeResult?.progressPath || '--' }}</span>
        <span>报告 {{ domainSmokeProgressTask?.reportPath || domainSmokeResult?.reportPath || '--' }}</span>
      </div>

      <div v-if="visibleDomainSmokeProgressRows.length" class="smoke-domain-grid">
        <article v-for="row in visibleDomainSmokeProgressRows" :key="row.domain || row.label || 'domain-smoke'" class="smoke-domain-row">
          <div>
            <strong>{{ row.label || row.domain || '未知域' }}</strong>
            <small>{{ row.sourceKey || row.locator || row.message || '--' }}</small>
          </div>
          <span class="status-pill" :class="statusTone(row.status)">{{ statusLabel(row.status) }}</span>
          <div class="smoke-domain-row__result">
            <strong>{{ domainSmokeRowCountLabel(row) }}</strong>
            <code v-if="domainSmokeRowPath(row)">{{ domainSmokeRowPath(row) }}</code>
          </div>
        </article>
      </div>
      <div v-else class="table-empty">{{ domainSmokeDisplayCleared ? '本次展示已清除；重新执行或刷新后可再次查看真实进度。' : '暂无真实下载进度；点击“每域 10 条”后等待下一次自动刷新。' }}</div>
    </section>

    <section class="section-card scenario-panel">
      <div class="section-head">
        <div>
          <h2 class="section-card__title">场景</h2>
          <p class="section-card__subtitle">向 test-state 文件写入固定 payload。</p>
        </div>
      </div>
      <div class="scenario-grid">
        <button
          v-for="scenario in scenarios"
          :key="scenario.key"
          type="button"
          class="scenario-button"
          :disabled="saving || simulationRunning"
          @click="applyScenario(scenario.key)"
        >
          <component :is="scenario.icon" :size="16" />
          <span>{{ scenario.label }}</span>
        </button>
      </div>
    </section>

    <section class="monitor-layout">
      <div class="monitor-main">
        <section class="section-card monitor-panel">
          <div class="section-head">
            <div>
              <h2 class="section-card__title">动作</h2>
              <p class="section-card__subtitle">紧凑查看测试 payload 中的 latest-run action 状态。</p>
            </div>
            <span class="status-pill" :class="statusTone(latestRunStatus)">{{ statusLabel(latestRunStatus) }}</span>
          </div>

          <div class="table-scroll">
            <table class="monitor-table">
              <thead>
                <tr>
                  <th>动作</th>
                  <th>执行器</th>
                  <th>状态</th>
                  <th>持续时间</th>
                  <th>更新时间</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="action in actions" :key="action.id || action.runner || 'action'">
                  <td>
                    <strong>{{ action.id || '未知动作' }}</strong>
                    <small>{{ shortArgs(action.args) }}</small>
                  </td>
                  <td>{{ action.runner || '--' }}</td>
                  <td><span class="status-pill" :class="statusTone(action.status)">{{ statusLabel(action.status) }}</span></td>
                  <td>{{ formatDuration(action.durationMs) }}</td>
                  <td>{{ formatDate(action.updatedAt) }}</td>
                </tr>
                <tr v-if="!actions.length">
                  <td colspan="5" class="table-empty">暂无动作行</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <aside class="monitor-side">
        <section class="section-card monitor-panel">
          <div class="section-head">
            <div>
              <h2 class="section-card__title">JSON Payload</h2>
              <p class="section-card__subtitle">编辑发送到 PUT /admin/crawler-monitor/test-state 的 payload 对象。</p>
            </div>
          </div>
          <textarea
            v-model="editorText"
            class="json-editor"
            spellcheck="false"
            :disabled="saving || simulationRunning"
            @input="editorDirty = true"
          />
          <div class="editor-actions">
            <span class="editor-meta">{{ formatDate(testState?.updatedAt || testState?.generatedAt) }}</span>
            <button type="button" class="btn btn-primary" :disabled="saving || simulationRunning" @click="saveEditor">
              <Save :size="16" />
              <span>{{ saving ? '保存中' : '保存' }}</span>
            </button>
          </div>
        </section>
      </aside>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  FileJson,
  LockKeyhole,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  ServerCog,
  TimerReset,
  X,
  XCircle,
} from 'lucide-vue-next'
import { get, post, put } from '~/composables/useApi'
import { showToast } from '~/composables/useToast'
import {
  progressRowsFromOverview,
  rowStatus,
} from '~/utils/crawlerMonitorProgressRows.mjs'
import type {
  CrawlerMonitorAction,
  CrawlerMonitorFile,
  CrawlerMonitorRegisteredTask,
  CrawlerMonitorReportDetail,
  CrawlerMonitorRun,
  CrawlerMonitorTestPayload,
  CrawlerMonitorTestState,
  CrawlerMonitorWikiQueueItem,
} from '~/types/crawlerMonitor'

definePageMeta({ title: '监控测试页', navSection: '/operations/crawler-monitor-test', headerVariant: 'compact' })

type StatusCard = {
  label: string
  value: string
  detail: string
  icon: Component
  tone: string
}

type ScenarioKey = 'idle' | 'running' | 'failed' | 'completed' | 'locked' | 'stale'
type SimulationResult = 'completed' | 'failed'
type DomainSmokeQueueMode = 'single' | 'per_domain'
type DomainSmokeProgressRow = {
  domain?: string | null
  label?: string | null
  sourceKey?: string | null
  locator?: string | null
  message?: string | null
  status?: string | null
  actualCount?: number | null
  current?: number | null
  requestedLimit?: number | null
  limit?: number | null
  total?: number | null
  requestedAt?: string | null
  startedAt?: string | null
  completedAt?: string | null
  queueId?: string | null
  outputPath?: string | null
  reportPath?: string | null
  logPath?: string | null
  error?: string | null
}
type DomainSmokeRecord = {
  index?: number | null
  title?: string | null
  pageId?: number | null
  revisionId?: number | null
  revisionTimestamp?: string | null
  contentLength?: number | null
  domain?: string | null
  domainLabel?: string | null
}
type DomainSmokeSample = {
  domain?: string | null
  label?: string | null
  status?: string | null
  requestedLimit?: number | null
  actualCount?: number | null
  outputPath?: string | null
  error?: string | null
  records?: DomainSmokeRecord[]
}
type BusinessJsonDataset = {
  key: string
  label: string
  path: string
  defaultSearch: string
}
type BusinessJsonRecordRow = {
  id: string
  name: string
  internalName: string
  kind: string
  summary: string
  record: Record<string, any>
}
type ProgressRow = CrawlerMonitorRegisteredTask & {
  rowKey: string
  action?: CrawlerMonitorAction | null
}

const MIN_REFRESH_INTERVAL_SECONDS = 2
const MAX_REFRESH_INTERVAL_SECONDS = 120
const DEFAULT_REFRESH_INTERVAL_SECONDS = 10
const REFRESH_INTERVAL_STORAGE_KEY = 'crawler-monitor-test-refresh-interval-seconds'
const DOMAIN_SMOKE_PROGRESS_LATEST_PATH = 'reports/crawler-monitor/wiki-monitor-domain-smoke-progress.latest.json'
const MIN_SIMULATION_DURATION_SECONDS = 1
const MAX_SIMULATION_DURATION_SECONDS = 3600
const DEFAULT_SIMULATION_DURATION_SECONDS = 30
const SIMULATION_TICK_MS = 1000

const testState = ref<CrawlerMonitorTestState | null>(null)
const loading = ref(false)
const saving = ref(false)
const autoRefresh = ref(true)
const refreshIntervalSeconds = ref(DEFAULT_REFRESH_INTERVAL_SECONDS)
const refreshIntervalInput = ref(String(DEFAULT_REFRESH_INTERVAL_SECONDS))
const editorText = ref('{\n}')
const editorDirty = ref(false)
const simulationDurationSeconds = ref(DEFAULT_SIMULATION_DURATION_SECONDS)
const simulationDurationInput = ref(String(DEFAULT_SIMULATION_DURATION_SECONDS))
const simulationResult = ref<SimulationResult>('completed')
const simulationRunning = ref(false)
const simulationFinished = ref(false)
const simulationElapsedSeconds = ref(0)
const domainSmokeRunning = ref(false)
const domainSmokeCleanupRunning = ref(false)
const domainSmokeQueueControlLoading = ref('')
const domainSmokeResult = ref<Record<string, any> | null>(null)
const domainSmokeDisplayCleared = ref(false)
const selectedSmokeDomains = ref<string[]>(['items'])
const domainSmokeSamples = ref<Record<string, DomainSmokeSample>>({})
const domainSmokeFilePreviewPath = ref('')
const domainSmokeFilePreviewContent = ref('')
const domainSmokeFilePreviewError = ref('')
const domainSmokeFilePreviewLoading = ref(false)
const selectedBusinessJsonDatasetKey = ref('items')
const businessJsonSearchInput = ref('Wooden Sword')
const businessJsonRecords = ref<Array<Record<string, any>>>([])
const businessJsonLoading = ref(false)
const businessJsonError = ref('')
const businessJsonRecordPreview = ref('')
const businessJsonRecordPreviewTitle = ref('')
const liveOverview = ref<any | null>(null)
let refreshTimer: ReturnType<typeof setInterval> | null = null
let simulationTimer: ReturnType<typeof setInterval> | null = null
let simulationStartedAt = 0
let simulationToken = 0
let simulationWriteInFlight = false
let simulationFinishRequested = false
let simulationFinishSilent = false

const payload = computed<CrawlerMonitorTestPayload>(() => testState.value?.payload || {})
const overview = computed(() => testState.value?.overview || null)
const smokeOverview = computed(() => liveOverview.value || overview.value)
const daemon = computed(() => overview.value?.daemon || null)
const scheduler = computed(() => overview.value?.scheduler || null)
const lockFile = computed(() => overview.value?.lock || null)
const latestRun = computed<CrawlerMonitorRun>(() => overview.value?.latestRun || {})
const actions = computed<CrawlerMonitorAction[]>(() => Array.isArray(latestRun.value.actions) ? latestRun.value.actions : [])
const progressRows = computed<ProgressRow[]>(() => progressRowsFromOverview(smokeOverview.value))
const domainSmokeProgressTask = computed<ProgressRow | null>(() => {
  return progressRows.value.find((row) => row.id === 'wiki-monitor-domain-smoke')
    || progressRows.value.find((row) => String(row.progressPath || row.progressSource || '').includes('wiki-monitor-domain-smoke-progress'))
    || null
})
const domainSmokeProgressPayload = computed<Record<string, any>>(() => {
  const payload = domainSmokeProgressTask.value?.progressPayload
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, any> : {}
})
const domainSmokeProgressRows = computed<DomainSmokeProgressRow[]>(() => {
  const domains = domainSmokeProgressPayload.value.domains
  return Array.isArray(domains) ? domains : []
})
const latestDomainSmokeQueueRows = computed<CrawlerMonitorWikiQueueItem[]>(() => {
  const rows = smokeOverview.value?.wikiMonitor?.dispatchQueue
  if (!Array.isArray(rows)) return []
  return rows
    .filter((item) => item?.lane === 'domain_smoke')
    .filter((item) => smokeQueueDomain(item))
    .sort((a, b) => queueSortTime(b) - queueSortTime(a))
})
const domainSmokeQueueBatchRows = computed<DomainSmokeProgressRow[]>(() => {
  const rows = latestDomainSmokeQueueRows.value
  const anchor = rows[0] ? queueSortTime(rows[0]) : 0
  if (!anchor) return []
  return rows
    .filter((item) => Math.abs(queueSortTime(item) - anchor) <= 5000)
    .sort((a, b) => queueSortTime(a) - queueSortTime(b))
    .slice(0, domainSmokeTestDomains.length)
    .map(queueDomainSmokeRow)
})
const visibleDomainSmokeProgressRows = computed(() => {
  if (domainSmokeDisplayCleared.value) return []
  if (domainSmokeQueueBatchRows.value.length > 1) return domainSmokeQueueBatchRows.value
  return domainSmokeProgressRows.value
})
const domainSmokeProgressStatus = computed(() => {
  if (domainSmokeDisplayCleared.value) return 'missing'
  if (domainSmokeQueueBatchRows.value.length > 1) {
    if (domainSmokeQueueBatchRows.value.some((row) => String(row.status || '').toLowerCase() === 'failed')) return 'failed'
    if (domainSmokeQueueBatchRows.value.some((row) => ['running', 'starting'].includes(String(row.status || '').toLowerCase()))) return 'running'
    if (domainSmokeQueueBatchRows.value.every((row) => String(row.status || '').toLowerCase() === 'completed')) return 'completed'
  }
  return rowStatus(domainSmokeProgressTask.value)
    || String(domainSmokeProgressPayload.value.status || domainSmokeResult.value?.status || 'missing')
})
const domainSmokeActive = computed(() => ['running', 'stalled'].includes(String(domainSmokeProgressStatus.value).toLowerCase()))
const domainSmokeProgressActive = computed(() => ['running', 'stalled'].includes(String(domainSmokeProgressStatus.value).toLowerCase()))
const domainSmokeCurrentDomain = computed(() => String(domainSmokeProgressPayload.value.currentDomain || domainSmokeProgressPayload.value.domain || ''))
const domainSmokeProgressLabel = computed(() => {
  if (domainSmokeDisplayCleared.value) return '--'
  const current = finiteNumber(domainSmokeProgressTask.value?.overallCurrent ?? domainSmokeProgressTask.value?.current)
  const total = finiteNumber(domainSmokeProgressTask.value?.overallTotal ?? domainSmokeProgressTask.value?.total)
  if (current != null && total != null && total > 0) return `${formatNumber(current)}/${formatNumber(total)}`
  const completedDomains = domainSmokeProgressRows.value.filter((row) => String(row.status || '').toLowerCase() === 'completed').length
  if (domainSmokeProgressRows.value.length) return `${formatNumber(completedDomains)}/${formatNumber(domainSmokeProgressRows.value.length)} 域`
  return '--'
})
const domainSmokeProgressWidth = computed(() => {
  if (domainSmokeDisplayCleared.value) return '0%'
  const percent = finiteNumber(domainSmokeProgressTask.value?.percent)
  if (percent != null) return `${clampPercent(percent)}%`
  const current = finiteNumber(domainSmokeProgressTask.value?.overallCurrent ?? domainSmokeProgressTask.value?.current)
  const total = finiteNumber(domainSmokeProgressTask.value?.overallTotal ?? domainSmokeProgressTask.value?.total)
  if (current != null && total != null && total > 0) return `${clampPercent((current / total) * 100)}%`
  return ['completed', 'failed'].includes(String(domainSmokeProgressStatus.value).toLowerCase()) ? '100%' : '0%'
})
const domainSmokeCompletedCount = computed(() => visibleDomainSmokeProgressRows.value.filter((row) => String(row.status || '').toLowerCase() === 'completed').length)
const domainSmokeFailedCount = computed(() => visibleDomainSmokeProgressRows.value.filter((row) => String(row.status || '').toLowerCase() === 'failed').length)
const domainSmokeSummaryLabel = computed(() => `${formatNumber(domainSmokeCompletedCount.value)} 完成 / ${formatNumber(domainSmokeFailedCount.value)} 失败`)
const domainSmokeEffectOutputFiles = computed(() => {
  return Array.from(new Set(
    domainSmokeResultRows.value
      .map((row) => row.outputPath)
      .filter((path): path is string => Boolean(path)),
  ))
})
const domainSmokeEffectOutputDir = computed(() => {
  const firstOutputPath = domainSmokeEffectOutputFiles.value[0] || ''
  if (firstOutputPath) return dirnamePath(firstOutputPath)
  const reportPath = domainSmokeEffectReportPath.value
  return reportPath ? dirnamePath(reportPath) : ''
})
const domainSmokeEffectProgressPath = computed(() => {
  return String(
    domainSmokeProgressTask.value?.progressSource
    || domainSmokeProgressTask.value?.progressPath
    || domainSmokeResult.value?.progressPath
    || DOMAIN_SMOKE_PROGRESS_LATEST_PATH,
  )
})
const domainSmokeEffectReportPath = computed(() => {
  return String(domainSmokeProgressTask.value?.reportPath || domainSmokeResult.value?.reportPath || '')
})
const domainSmokeEffectRecordTotal = computed(() => {
  const sampleTotal = Object.values(domainSmokeSamples.value).reduce((total, sample) => {
    return total + (finiteNumber(sample.actualCount) ?? (Array.isArray(sample.records) ? sample.records.length : 0))
  }, 0)
  if (sampleTotal > 0) return sampleTotal
  return domainSmokeResultRows.value.reduce((total, row) => total + (finiteNumber(row.actualCount) ?? 0), 0)
})
const domainSmokeEffectCards = computed(() => [
  {
    label: '域',
    value: formatNumber(visibleDomainSmokeProgressRows.value.length || selectedSmokeDomains.value.length),
    detail: `${domainSmokeSummaryLabel.value}`,
  },
  {
    label: '生成文件',
    value: formatNumber(domainSmokeEffectOutputFiles.value.length),
    detail: domainSmokeEffectOutputDir.value || '当前没有结果',
  },
  {
    label: '记录总数',
    value: formatNumber(domainSmokeEffectRecordTotal.value),
    detail: '来自 output JSON records',
  },
  {
    label: '失败域',
    value: formatNumber(domainSmokeFailedCount.value),
    detail: domainSmokeFailedCount.value ? '查看每域错误原因' : '暂无失败',
  },
])
const domainSmokePrimaryActionLabel = computed(() => {
  if (domainSmokeRunning.value) return '下载中'
  if (domainSmokeResult.value || domainSmokeProgressRows.value.length) return '重新执行'
  return '每域 10 条'
})
const refreshStale = computed(() => Boolean(overview.value?.refreshStale))
const filePath = computed(() => testState.value?.filePath || testState.value?.path || 'reports/backend-refresh/manual-monitor-test.json')
const autoRefreshLabel = computed(() => autoRefresh.value ? `自动刷新 ${refreshIntervalSeconds.value}s` : '自动刷新关闭')
const simulationProgressWidth = computed(() => {
  const percent = simulationDurationSeconds.value > 0
    ? (simulationElapsedSeconds.value / simulationDurationSeconds.value) * 100
    : 0
  return `${Math.min(100, Math.max(0, percent)).toFixed(1)}%`
})
const simulationProgressLabel = computed(() => {
  if (!simulationRunning.value && simulationFinished.value) {
    return `已用 ${simulationElapsedSeconds.value}s / 剩余 0s`
  }
  const remaining = Math.max(0, simulationDurationSeconds.value - simulationElapsedSeconds.value)
  return `已用 ${simulationElapsedSeconds.value}s / 剩余 ${remaining}s`
})
const latestRunStatus = computed(() => {
  if (!latestRun.value.found) return 'missing'
  if (Number(latestRun.value.failedActions || 0) > 0) return 'failed'
  if (Number(latestRun.value.runningActions || 0) > 0) return 'running'
  if (Number(latestRun.value.pendingActions || 0) > 0) return 'pending'
  return 'completed'
})

const scenarios: Array<{ key: ScenarioKey; label: string; icon: Component }> = [
  { key: 'idle', label: '空闲 / 当前', icon: CheckCircle2 },
  { key: 'running', label: '运行中', icon: Activity },
  { key: 'failed', label: '失败', icon: XCircle },
  { key: 'completed', label: '已完成', icon: CheckCircle2 },
  { key: 'locked', label: '已锁定', icon: LockKeyhole },
  { key: 'stale', label: '已过期', icon: AlertTriangle },
]

const domainSmokeTestDomains = [
  { domain: 'items', label: '物品' },
  { domain: 'npcs', label: 'NPC' },
  { domain: 'projectiles', label: '射弹' },
  { domain: 'buffs', label: 'Buff' },
  { domain: 'armor_sets', label: '盔甲套装' },
  { domain: 'recipes', label: '配方' },
  { domain: 'biomes', label: '生物群落' },
  { domain: 'bosses', label: 'Boss' },
  { domain: 'town_npc_maintenance', label: '城镇 NPC' },
  { domain: 'shimmer', label: 'Shimmer' },
]

const businessJsonDatasets: BusinessJsonDataset[] = [
  { key: 'items', label: 'Items', path: 'data/standardized-view/items/part-0001.json', defaultSearch: 'Wooden Sword' },
  { key: 'npcs', label: 'NPCs', path: 'data/standardized-view/npcs/part-0001.json', defaultSearch: 'Nurse' },
  { key: 'buffs', label: 'Buffs', path: 'data/standardized-view/buffs/part-0001.json', defaultSearch: 'Regeneration' },
  { key: 'projectiles', label: 'Projectiles', path: 'data/standardized-view/projectiles/part-0001.json', defaultSearch: 'Wooden Arrow' },
]
const DEFAULT_BUSINESS_JSON_DATASET = businessJsonDatasets[0] as BusinessJsonDataset

const selectedBusinessJsonDataset = computed(() => {
  return businessJsonDatasets.find((dataset) => dataset.key === selectedBusinessJsonDatasetKey.value)
    || DEFAULT_BUSINESS_JSON_DATASET
})

const domainSmokeResultRows = computed(() => {
  const fallbackRows: DomainSmokeProgressRow[] = selectedSmokeDomains.value.map((domain) => ({
    domain,
    label: smokeDomainLabel(domain),
    status: 'missing',
    actualCount: 0,
    requestedLimit: 10,
  }))
  const rows: DomainSmokeProgressRow[] = visibleDomainSmokeProgressRows.value.length
    ? visibleDomainSmokeProgressRows.value
    : fallbackRows
  return rows.map((row) => {
    const domain = String(row.domain || '')
    const sample = domainSmokeSamples.value[domain] || {}
    const actualCount = finiteNumber(sample.actualCount ?? row.actualCount ?? row.current) ?? 0
    const expectedCount = finiteNumber(sample.requestedLimit ?? row.requestedLimit ?? row.limit ?? row.total) ?? 10
    const status = String(sample.status || row.status || 'missing')
    return {
      domain,
      label: String(row.label || sample.label || smokeDomainLabel(domain)),
      status,
      actualCount,
      requestedAt: String(row.requestedAt || ''),
      startedAt: String(row.startedAt || ''),
      completedAt: String(row.completedAt || ''),
      queueId: String(row.queueId || ''),
      outputPath: String(sample.outputPath || row.outputPath || ''),
      reportPath: String(row.reportPath || domainSmokeEffectReportPath.value || ''),
      logPath: String(row.logPath || ''),
      failureReason: domainSmokeFailureReason(row, sample),
      verdict: domainSmokeVerdict(status, actualCount, expectedCount),
    }
  })
})

const domainSmokeRecordRows = computed<DomainSmokeRecord[]>(() => {
  return domainSmokeResultRows.value.flatMap((row) => {
    const records = domainSmokeSamples.value[row.domain]?.records
    return Array.isArray(records)
      ? records.map((record) => ({ ...record, domain: row.domain, domainLabel: row.label }))
      : []
  })
})

const businessJsonRecordRows = computed<BusinessJsonRecordRow[]>(() => {
  const query = normalizeSearchText(businessJsonSearchInput.value)
  return businessJsonRecords.value
    .filter((record) => {
      if (!query) return true
      return businessJsonSearchMatches([
        record.id,
        record.name,
        record.nameEn,
        record.englishName,
        record.internalName,
        record.nameZh,
        record.localized?.zh?.name,
      ].filter((value) => value != null).join(' '), query)
    })
    .slice(0, 50)
    .map((record) => ({
      id: displayValue(record.id ?? record.gameId ?? record.type),
      name: displayValue(record.name ?? record.nameEn ?? record.englishName ?? record.localized?.en?.name ?? record.pageTitle),
      internalName: displayValue(record.internalName),
      kind: displayValue(record.categoryCode ?? record.type ?? record.entityType ?? selectedBusinessJsonDataset.value.label),
      summary: businessJsonRecordSummary(record),
      record,
    }))
})

const summaryCards = computed(() => [
  { label: '总数', value: formatNumber(latestRun.value.totalActions) },
  { label: '已完成', value: formatNumber(latestRun.value.completedActions) },
  { label: '失败', value: formatNumber(latestRun.value.failedActions) },
  { label: '运行中', value: formatNumber(latestRun.value.runningActions) },
])

const statusCards = computed<StatusCard[]>(() => [
  {
    label: '刷新状态',
    value: refreshStale.value ? '已过期 stale' : '当前 current',
    detail: `最后活动 ${formatDate(overview.value?.refreshLastActivityAt || overview.value?.generatedAt)}`,
    icon: AlertTriangle,
    tone: refreshStale.value ? 'danger' : 'success',
  },
  {
    label: '守护进程 Daemon',
    value: statusLabel(payloadValue(daemon.value, 'status') || fileStateText(daemon.value)),
    detail: `心跳 ${formatDate(payloadValue(daemon.value, 'generatedAt') || daemon.value?.updatedAt)}`,
    icon: ServerCog,
    tone: statusTone(payloadValue(daemon.value, 'status')),
  },
  {
    label: '调度器 Scheduler',
    value: statusLabel(payloadValue(scheduler.value, 'status') || fileStateText(scheduler.value)),
    detail: `下次 ${formatDate(payloadValue(scheduler.value, 'nextPlannedAt'))}`,
    icon: Clock3,
    tone: statusTone(payloadValue(scheduler.value, 'status')),
  },
  {
    label: '锁 Lock',
    value: lockFile.value?.found ? '已锁定 locked' : '空闲 free',
    detail: lockFile.value?.found ? (lockFile.value.path || '已发现锁文件') : '无锁文件',
    icon: LockKeyhole,
    tone: lockFile.value?.found ? 'warning' : 'success',
  },
  {
    label: '最近运行',
    value: statusLabel(latestRunStatus.value),
    detail: `${formatNumber(latestRun.value.completedActions)} 已完成 / ${formatNumber(latestRun.value.failedActions)} 失败`,
    icon: FileJson,
    tone: statusTone(latestRunStatus.value),
  },
])

onMounted(() => {
  loadStoredRefreshInterval()
  loadState()
  loadBusinessJsonDataset(selectedBusinessJsonDatasetKey.value)
  syncAutoRefresh()
})

onUnmounted(() => {
  clearRefreshTimer()
  if (simulationRunning.value) {
    void finishTimedSimulation(true)
  } else {
    clearSimulationTimer()
  }
})

watch(autoRefresh, () => {
  syncAutoRefresh()
})

watch(refreshIntervalSeconds, () => {
  if (autoRefresh.value) {
    syncAutoRefresh()
  }
})

watch(domainSmokeActive, () => {
  if (autoRefresh.value) {
    syncAutoRefresh()
  }
})

async function loadState() {
  loading.value = true
  try {
    const response: any = await get('/admin/crawler-monitor/test-state')
    testState.value = (response?.data ?? response) || null
    await loadLiveOverview()
    await loadDomainSmokeSamples()
    if (!editorDirty.value && !saving.value) {
      editorText.value = JSON.stringify(testState.value?.payload || {}, null, 2)
    }
  } catch (error: any) {
    console.error('Failed to load crawler monitor test state:', error)
    showToast(error?.data?.message || error?.message || '加载测试状态失败', 'error')
  } finally {
    loading.value = false
  }
}

async function loadLiveOverview() {
  try {
    const response: any = await get('/admin/crawler-monitor/overview')
    liveOverview.value = (response?.data ?? response) || null
  } catch (error) {
    console.error('Failed to load live crawler monitor overview:', error)
  }
}

async function savePayload(nextPayload: Record<string, any>, message = '测试状态已保存') {
  saving.value = true
  try {
    const response: any = await put('/admin/crawler-monitor/test-state', nextPayload)
    testState.value = (response?.data ?? response) || {
      ...testState.value,
      payload: nextPayload,
      updatedAt: new Date().toISOString(),
    }
    editorText.value = JSON.stringify(testState.value?.payload || nextPayload, null, 2)
    editorDirty.value = false
    if (message) {
      showToast(message)
    }
    return true
  } catch (error: any) {
    console.error('Failed to save crawler monitor test state:', error)
    showToast(error?.data?.message || error?.message || '保存测试状态失败', 'error')
    return false
  } finally {
    saving.value = false
  }
}

async function saveEditor() {
  try {
    const parsed = JSON.parse(editorText.value)
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      showToast('JSON payload 必须是对象', 'error')
      return
    }
    await savePayload(parsed)
  } catch {
    showToast('JSON payload 格式无效', 'error')
  }
}

async function applyScenario(key: ScenarioKey) {
  await savePayload(buildScenarioPayload(key), `场景已保存：${key}`)
}

async function resetState() {
  saving.value = true
  try {
    const response: any = await post('/admin/crawler-monitor/test-state/reset')
    testState.value = (response?.data ?? response) || null
    editorText.value = JSON.stringify(testState.value?.payload || {}, null, 2)
    editorDirty.value = false
    showToast('测试状态已重置')
  } catch (error: any) {
    console.error('Failed to reset crawler monitor test state:', error)
    showToast(error?.data?.message || error?.message || '重置测试状态失败', 'error')
  } finally {
    saving.value = false
  }
}

async function startDomainSmoke() {
  selectedSmokeDomains.value = domainSmokeTestDomains.map((domain) => domain.domain)
  await runSelectedDomainSmoke('single')
}

async function runSelectedDomainSmoke(queueMode: DomainSmokeQueueMode) {
  if (domainSmokeRunning.value || loading.value || saving.value || simulationRunning.value) return
  if (!selectedSmokeDomains.value.length) {
    showToast('请至少选择一个测试域', 'error')
    return
  }
  domainSmokeRunning.value = true
  try {
    const response: any = await post('/admin/crawler-monitor/test-domain-smoke', {
      domains: selectedSmokeDomains.value,
      queueMode: queueMode,
    })
    const result = (response?.data ?? response) || null
    domainSmokeResult.value = result
    domainSmokeDisplayCleared.value = false
    if (result?.accepted) {
      showToast(queueMode === 'per_domain' ? '逐域真实下载测试已加入队列' : '真实下载测试已启动')
      await loadState()
      return
    }
    showToast(result?.message || '真实下载测试未启动', 'error')
  } catch (error: any) {
    console.error('Failed to start wiki monitor domain smoke:', error)
    showToast(error?.data?.message || error?.message || '启动真实下载测试失败', 'error')
  } finally {
    domainSmokeRunning.value = false
  }
}

async function runAllDomainSmokeQueue() {
  selectedSmokeDomains.value = domainSmokeTestDomains.map((domain) => domain.domain)
  await runSelectedDomainSmoke('per_domain')
}

async function cleanupDomainSmokeArtifacts() {
  if (domainSmokeCleanupRunning.value || domainSmokeRunning.value || domainSmokeProgressActive.value) return
  if (import.meta.client && !window.confirm('确认删除测试域数据？只删除 reports/crawler-monitor/wiki-monitor-domain-smoke* 测试产物，不删除业务 JSON 数据文件。')) {
    return
  }
  domainSmokeCleanupRunning.value = true
  try {
    const response: any = await post('/admin/crawler-monitor/test-domain-smoke/cleanup')
    const result = (response?.data ?? response) || null
    domainSmokeResult.value = result
    domainSmokeDisplayCleared.value = true
    domainSmokeSamples.value = {}
    closeDomainSmokeFilePreview()
    showToast(result?.message || '测试域数据已删除')
    await loadState()
  } catch (error: any) {
    console.error('Failed to clean up wiki monitor domain smoke artifacts:', error)
    showToast(error?.data?.message || error?.message || '删除测试域数据失败', 'error')
  } finally {
    domainSmokeCleanupRunning.value = false
  }
}

function canCancelDomainSmokeQueuedRow(row: DomainSmokeProgressRow) {
  const status = String(row.status || '').toLowerCase()
  return Boolean(row.queueId) && ['queued', 'pending', 'blocked_cooldown'].includes(status)
}

function canCancelDomainSmokeRunningRow(row: DomainSmokeProgressRow) {
  const status = String(row.status || '').toLowerCase()
  return Boolean(row.queueId) && ['running', 'starting'].includes(status)
}

async function cancelDomainSmokeQueuedRow(row: DomainSmokeProgressRow) {
  if (!canCancelDomainSmokeQueuedRow(row) || !row.queueId || domainSmokeQueueControlLoading.value) return
  domainSmokeQueueControlLoading.value = row.queueId
  try {
    const response: any = await post('/admin/crawler-monitor/dispatch/control', {
      controlAction: 'cancelQueued',
      queueId: row.queueId,
    })
    domainSmokeResult.value = (response?.data ?? response) || null
    showToast('已取消排队域；后续队列项会继续执行')
    await loadState()
  } catch (error: any) {
    console.error('Failed to cancel queued wiki monitor domain smoke row:', error)
    showToast(error?.data?.message || error?.message || '取消排队域失败', 'error')
  } finally {
    domainSmokeQueueControlLoading.value = ''
  }
}

async function cancelDomainSmokeRunningRow(row: DomainSmokeProgressRow) {
  if (!canCancelDomainSmokeRunningRow(row) || !row.queueId || domainSmokeQueueControlLoading.value) return
  if (import.meta.client && !window.confirm(`确认终止当前域：${row.label || row.domain || row.queueId}？后续排队域会继续执行。`)) {
    return
  }
  domainSmokeQueueControlLoading.value = row.queueId
  try {
    const response: any = await post('/admin/crawler-monitor/dispatch/control', {
      controlAction: 'cancel',
      actionId: 'wiki-monitor-domain-smoke',
      queueId: row.queueId,
      domain: row.domain || '',
    })
    domainSmokeResult.value = (response?.data ?? response) || null
    showToast('已终止当前域；后续队列项会继续执行')
    await loadState()
  } catch (error: any) {
    console.error('Failed to cancel running wiki monitor domain smoke row:', error)
    showToast(error?.data?.message || error?.message || '终止当前域失败', 'error')
  } finally {
    domainSmokeQueueControlLoading.value = ''
  }
}

function toggleSmokeDomain(domain: string) {
  if (selectedSmokeDomains.value.includes(domain)) {
    selectedSmokeDomains.value = selectedSmokeDomains.value.filter((item) => item !== domain)
    return
  }
  selectedSmokeDomains.value = [...selectedSmokeDomains.value, domain]
}

function selectAllSmokeDomains() {
  selectedSmokeDomains.value = domainSmokeTestDomains.map((domain) => domain.domain)
}

async function loadDomainSmokeSamples() {
  const nextSamples: Record<string, DomainSmokeSample> = {}
  for (const row of visibleDomainSmokeProgressRows.value) {
    const domain = String(row.domain || '')
    const outputPath = domainSmokeRowPath(row)
    if (!domain || !outputPath) continue
    const sample = await loadDomainSmokeSample(outputPath)
    if (sample) {
      nextSamples[domain] = {
        ...sample,
        domain,
        label: String(row.label || sample.label || smokeDomainLabel(domain)),
        outputPath,
      }
    }
  }
  domainSmokeSamples.value = nextSamples
}

async function loadDomainSmokeSample(path: string): Promise<DomainSmokeSample | null> {
  try {
    const response: any = await get('/admin/crawler-monitor/report', { path })
    const detail = (response?.data ?? response) as CrawlerMonitorReportDetail
    if (!detail?.content) return null
    const parsed = JSON.parse(detail.content)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as DomainSmokeSample
  } catch (error) {
    console.error('Failed to load domain smoke sample:', path, error)
    return null
  }
}

async function openDomainSmokeFilePreview(path: string) {
  if (!path) return
  domainSmokeFilePreviewPath.value = path
  domainSmokeFilePreviewContent.value = ''
  domainSmokeFilePreviewError.value = ''
  domainSmokeFilePreviewLoading.value = true
  try {
    const response: any = await get('/admin/crawler-monitor/report', { path })
    const detail = (response?.data ?? response) as CrawlerMonitorReportDetail
    domainSmokeFilePreviewContent.value = formatReportContent(detail?.content || '')
  } catch (error: any) {
    console.error('Failed to load domain smoke output file:', path, error)
    domainSmokeFilePreviewError.value = error?.data?.message || error?.message || '读取文件失败'
  } finally {
    domainSmokeFilePreviewLoading.value = false
  }
}

async function loadBusinessJsonDataset(key: string) {
  const dataset = businessJsonDatasets.find((item) => item.key === key) || DEFAULT_BUSINESS_JSON_DATASET
  selectedBusinessJsonDatasetKey.value = dataset.key
  businessJsonSearchInput.value = dataset.defaultSearch
  businessJsonRecords.value = []
  businessJsonError.value = ''
  businessJsonRecordPreview.value = ''
  businessJsonRecordPreviewTitle.value = ''
  businessJsonLoading.value = true
  try {
    const response: any = await get('/admin/crawler-monitor/report', { path: dataset.path })
    const detail = (response?.data ?? response) as CrawlerMonitorReportDetail
    if (!detail?.readable || !detail.content) {
      throw new Error(detail?.errorMessage || '业务 JSON 文件不可读')
    }
    const parsed = JSON.parse(detail.content)
    businessJsonRecords.value = normalizeBusinessJsonRecords(parsed)
  } catch (error: any) {
    console.error('Failed to load business JSON dataset:', dataset.path, error)
    businessJsonError.value = error?.data?.message || error?.message || '读取业务 JSON 失败'
  } finally {
    businessJsonLoading.value = false
  }
}

async function setBusinessJsonSearch(datasetKey: string, query: string) {
  if (selectedBusinessJsonDatasetKey.value !== datasetKey) {
    await loadBusinessJsonDataset(datasetKey)
  }
  businessJsonSearchInput.value = query
}

function openBusinessJsonRecordPreview(record: Record<string, any>) {
  businessJsonRecordPreviewTitle.value = [
    displayValue(record.name ?? record.nameEn ?? record.englishName ?? record.localized?.en?.name),
    displayValue(record.internalName),
  ].filter((value) => value && value !== '--').join(' / ')
  businessJsonRecordPreview.value = JSON.stringify(record, null, 2)
}

function closeDomainSmokeFilePreview() {
  domainSmokeFilePreviewPath.value = ''
  domainSmokeFilePreviewContent.value = ''
  domainSmokeFilePreviewError.value = ''
  domainSmokeFilePreviewLoading.value = false
}

function formatReportContent(content: string) {
  const text = String(content || '')
  if (!text.trim()) return ''
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

function normalizeBusinessJsonRecords(payload: any): Array<Record<string, any>> {
  if (Array.isArray(payload)) {
    return payload.filter(isPlainRecord)
  }
  if (Array.isArray(payload?.records)) {
    return payload.records.filter(isPlainRecord)
  }
  if (payload?.records && typeof payload.records === 'object') {
    return Object.values(payload.records).filter(isPlainRecord) as Array<Record<string, any>>
  }
  return []
}

function isPlainRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function businessJsonRecordSummary(record: Record<string, any>) {
  const parts = [
    record.categoryCode ? `category=${record.categoryCode}` : '',
    record.rarity ? `rarity=${record.rarity}` : '',
    record.stats?.damage != null ? `damage=${record.stats.damage}` : '',
    record.combat?.lifeMax != null ? `life=${record.combat.lifeMax}` : '',
    record.combat?.defense != null ? `defense=${record.combat.defense}` : '',
    record.localized?.zh?.name ? `zh=${record.localized.zh.name}` : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' / ') : '--'
}

function normalizeSearchText(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function businessJsonSearchMatches(value: unknown, query: string) {
  const haystack = normalizeSearchText(value).replace(/[^a-z0-9\u4e00-\u9fff]+/gi, ' ')
  const compactHaystack = haystack.replace(/\s+/g, '')
  return query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .every((term) => haystack.includes(term) || compactHaystack.includes(term))
}

function displayValue(value: unknown) {
  if (value == null || value === '') return '--'
  return String(value)
}

function clearDomainSmokeDisplay() {
  domainSmokeResult.value = null
  domainSmokeDisplayCleared.value = true
  domainSmokeSamples.value = {}
  closeDomainSmokeFilePreview()
}

function syncAutoRefresh() {
  clearRefreshTimer()
  if (!autoRefresh.value || !import.meta.client) return
  refreshTimer = setInterval(() => {
    if (!loading.value && !saving.value) {
      loadState()
    }
  }, (domainSmokeActive.value ? MIN_REFRESH_INTERVAL_SECONDS : refreshIntervalSeconds.value) * 1000)
}

function clearRefreshTimer() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

function loadStoredRefreshInterval() {
  if (!import.meta.client) return
  const storedValue = window.localStorage.getItem(REFRESH_INTERVAL_STORAGE_KEY)
  const nextValue = sanitizeRefreshInterval(storedValue)
  refreshIntervalSeconds.value = nextValue
  refreshIntervalInput.value = String(nextValue)
}

function commitRefreshInterval() {
  const nextValue = sanitizeRefreshInterval(refreshIntervalInput.value)
  refreshIntervalSeconds.value = nextValue
  refreshIntervalInput.value = String(nextValue)
  if (import.meta.client) {
    window.localStorage.setItem(REFRESH_INTERVAL_STORAGE_KEY, String(nextValue))
  }
}

function commitSimulationDuration() {
  const nextValue = sanitizeSimulationDuration(simulationDurationInput.value)
  simulationDurationSeconds.value = nextValue
  simulationDurationInput.value = String(nextValue)
}

function sanitizeRefreshInterval(value: number | string | null | undefined) {
  if (value == null || String(value).trim() === '') return DEFAULT_REFRESH_INTERVAL_SECONDS
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_REFRESH_INTERVAL_SECONDS
  return Math.min(MAX_REFRESH_INTERVAL_SECONDS, Math.max(MIN_REFRESH_INTERVAL_SECONDS, Math.round(parsed)))
}

function sanitizeSimulationDuration(value: number | string | null | undefined) {
  if (value == null || String(value).trim() === '') return DEFAULT_SIMULATION_DURATION_SECONDS
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_SIMULATION_DURATION_SECONDS
  return Math.min(MAX_SIMULATION_DURATION_SECONDS, Math.max(MIN_SIMULATION_DURATION_SECONDS, Math.round(parsed)))
}

async function startTimedSimulation() {
  if (editorDirty.value) {
    showToast('开始模拟前请保存或重置 JSON 编辑', 'error')
    return
  }
  if (loading.value || saving.value || simulationRunning.value) return
  commitSimulationDuration()
  clearSimulationTimer()
  const token = simulationToken + 1
  simulationToken = token
  simulationStartedAt = Date.now()
  simulationElapsedSeconds.value = 0
  simulationRunning.value = true
  simulationFinished.value = false
  simulationFinishRequested = false
  simulationFinishSilent = false

  await writeSimulationTick(token)
  if (!simulationRunning.value || token !== simulationToken) return

  simulationTimer = setInterval(() => {
    writeSimulationTick(token)
  }, SIMULATION_TICK_MS)
}

async function finishTimedSimulation(silent = false) {
  if (!simulationRunning.value) return
  if (simulationWriteInFlight) {
    simulationFinishRequested = true
    simulationFinishSilent = simulationFinishSilent || silent
    clearSimulationTimer()
    return
  }

  clearSimulationTimer()
  const token = simulationToken + 1
  simulationToken = token
  simulationFinishRequested = false
  simulationFinishSilent = false
  const elapsedSeconds = currentSimulationElapsedSeconds()
  simulationElapsedSeconds.value = elapsedSeconds
  simulationWriteInFlight = true

  try {
    const saved = await savePayload(
      buildTimedSimulationPayload(simulationResult.value, simulationDurationSeconds.value, elapsedSeconds),
      silent ? '' : `定时模拟已结束：${statusLabel(simulationResult.value)}`,
    )
    if (token === simulationToken) {
      simulationRunning.value = false
      simulationFinished.value = saved
    }
  } finally {
    simulationWriteInFlight = false
  }
}

function clearSimulationTimer() {
  if (simulationTimer) {
    clearInterval(simulationTimer)
    simulationTimer = null
  }
}

async function writeSimulationTick(token: number) {
  if (simulationWriteInFlight) return
  if (token !== simulationToken) return
  simulationWriteInFlight = true
  let runDeferredFinish = false
  let deferredFinishSilent = false
  const elapsedSeconds = currentSimulationElapsedSeconds()
  const final = elapsedSeconds >= simulationDurationSeconds.value
  const status = final ? simulationResult.value : 'running'
  simulationElapsedSeconds.value = elapsedSeconds

  try {
    const saved = await savePayload(
      buildTimedSimulationPayload(status, simulationDurationSeconds.value, elapsedSeconds),
      final ? `Timed simulation finished: ${status}` : '',
    )
    if (!saved) {
      if (token === simulationToken) {
        simulationRunning.value = false
        clearSimulationTimer()
      }
      return
    }
    if (final && token === simulationToken) {
      simulationRunning.value = false
      simulationFinished.value = true
      clearSimulationTimer()
    }
  } catch {
    if (token === simulationToken) {
      simulationRunning.value = false
      clearSimulationTimer()
    }
  } finally {
    simulationWriteInFlight = false
    if (simulationFinishRequested && token === simulationToken && simulationRunning.value) {
      simulationFinishRequested = false
      runDeferredFinish = true
      deferredFinishSilent = simulationFinishSilent
      simulationFinishSilent = false
    }
  }

  if (runDeferredFinish) {
    await finishTimedSimulation(deferredFinishSilent)
  }
}

function currentSimulationElapsedSeconds() {
  if (!simulationStartedAt) return 0
  return Math.min(
    simulationDurationSeconds.value,
    Math.max(0, Math.floor((Date.now() - simulationStartedAt) / 1000)),
  )
}

function buildScenarioPayload(key: ScenarioKey): CrawlerMonitorTestPayload {
  const now = new Date().toISOString()
  const base: CrawlerMonitorTestPayload = {
    scenario: key,
    generatedAt: now,
    daemonStatus: 'idle',
    schedulerStatus: 'sleeping',
    lockFound: false,
    refreshStale: false,
    refreshLastActivityAt: now,
    refreshStaleThresholdMs: 86400000,
    latestRun: emptyRunPayload(now),
  }

  if (key === 'running') {
    base.daemonStatus = 'running'
    base.schedulerStatus = 'active'
    base.latestRun = runPayload('running', now)
  } else if (key === 'failed') {
    base.latestRun = runPayload('failed', now)
  } else if (key === 'completed') {
    base.latestRun = runPayload('completed', now)
  } else if (key === 'locked') {
    base.lockFound = true
    base.daemonStatus = 'running'
    base.latestRun = runPayload('running', now)
  } else if (key === 'stale') {
    const staleAt = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString()
    base.generatedAt = staleAt
    base.refreshStale = true
    base.refreshLastActivityAt = staleAt
    base.refreshStaleReason = 'crawler monitor test state is older than threshold'
    base.daemonStatus = 'idle'
    base.schedulerStatus = 'sleeping'
    base.latestRun = runPayload('completed', staleAt)
  }

  return base
}

function buildTimedSimulationPayload(
  status: 'running' | SimulationResult,
  durationSeconds: number,
  elapsedSeconds: number,
): CrawlerMonitorTestPayload {
  const now = new Date().toISOString()
  const durationMs = durationSeconds * 1000
  const running = status === 'running'
  const failed = status === 'failed'
  const elapsedMs = Math.min(durationMs, Math.max(0, elapsedSeconds * 1000))
  const remainingMs = running ? Math.max(0, durationMs - elapsedMs) : 0

  return {
    scenario: 'timed-simulation',
    generatedAt: now,
    daemonStatus: running ? 'running' : 'idle',
    schedulerStatus: running ? 'active' : 'sleeping',
    lockFound: false,
    refreshStale: false,
    refreshLastActivityAt: now,
    refreshStaleThresholdMs: 86400000,
    simulation: {
      status,
      result: status,
      durationSeconds,
      elapsedSeconds,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      durationMs,
      elapsedMs,
      remainingMs,
      startedAt: new Date(simulationStartedAt).toISOString(),
      updatedAt: now,
    },
    latestRun: {
      found: true,
      readable: true,
      path: 'reports/backend-refresh/manual-monitor-test.json',
      summaryPath: 'reports/backend-refresh/manual-monitor-test.json',
      generatedAt: now,
      lastActionId: 'manual-monitor-test',
      totalActions: 1,
      completedActions: running ? 0 : (failed ? 0 : 1),
      failedActions: failed ? 1 : 0,
      runningActions: running ? 1 : 0,
      pendingActions: 0,
      timedOutActions: 0,
      totalDurationMs: elapsedMs,
      durationMs,
      elapsedMs,
      remainingMs,
      durationSeconds,
      elapsedSeconds,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      actions: [
        {
          id: 'manual-monitor-test',
          runner: 'test-state',
          args: ['PUT /admin/crawler-monitor/test-state'],
          status,
          durationMs: elapsedMs,
          updatedAt: now,
        },
      ],
    } as CrawlerMonitorRun,
  }
}

function emptyRunPayload(updatedAt: string): CrawlerMonitorRun {
  return {
    found: true,
    readable: true,
    path: 'reports/backend-refresh/manual-monitor-test.json',
    summaryPath: 'reports/backend-refresh/manual-monitor-test.json',
    generatedAt: updatedAt,
    totalActions: 0,
    completedActions: 0,
    failedActions: 0,
    runningActions: 0,
    pendingActions: 0,
    timedOutActions: 0,
    totalDurationMs: 0,
    actions: [],
  }
}

function runPayload(status: 'running' | 'failed' | 'completed', updatedAt: string): CrawlerMonitorRun {
  const failed = status === 'failed'
  const running = status === 'running'
  return {
    found: true,
    readable: true,
    path: 'reports/backend-refresh/manual-monitor-test.json',
    summaryPath: 'reports/backend-refresh/manual-monitor-test.json',
    generatedAt: updatedAt,
    lastActionId: running ? 'wiki-items' : 'wiki-recipes',
    totalActions: 2,
    completedActions: failed ? 1 : (running ? 0 : 2),
    failedActions: failed ? 1 : 0,
    runningActions: running ? 1 : 0,
    pendingActions: running ? 1 : 0,
    timedOutActions: 0,
    totalDurationMs: running ? 3200 : 8400,
    actions: [
      {
        id: 'wiki-items',
        runner: 'node',
        args: ['scripts/crawler/wiki-items.mjs'],
        status: running ? 'running' : 'completed',
        durationMs: running ? 3200 : 2800,
        updatedAt,
      },
      {
        id: 'wiki-recipes',
        runner: 'node',
        args: ['scripts/crawler/wiki-recipes.mjs'],
        status: failed ? 'failed' : (running ? 'pending' : 'completed'),
        durationMs: failed ? 1200 : 2800,
        updatedAt,
      },
    ],
  }
}

function payloadValue(file: CrawlerMonitorFile | null, key: string) {
  const value = file?.payload?.[key]
  if (value == null || value === '') return ''
  return String(value)
}

function fileStateText(file: CrawlerMonitorFile | null) {
  if (!file?.found) return 'missing'
  return file.readable ? 'readable' : 'read error'
}

function statusLabel(status?: string | null) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'completed') return '已完成 completed'
  if (normalized === 'failed') return '失败 failed'
  if (normalized === 'running') return '运行中 running'
  if (normalized === 'pending') return '等待中 pending'
  if (normalized === 'stalled') return '停滞 stalled'
  if (normalized === 'partial') return '部分完成 partial'
  if (normalized === 'missing') return '缺失 missing'
  if (normalized === 'readable') return '可读取 readable'
  if (normalized === 'read error') return '读取错误 read error'
  if (normalized === 'stale') return '已过期 stale'
  if (normalized === 'current') return '当前 current'
  if (normalized === 'locked') return '已锁定 locked'
  if (normalized === 'free') return '空闲 free'
  return normalized || '未知'
}

function statusTone(status?: string | null) {
  const normalized = String(status || '').toLowerCase()
  if (['completed', 'success', 'ok', 'readable', 'free', 'current'].includes(normalized)) return 'success'
  if (['failed', 'error', 'missing', 'read error', 'stale'].includes(normalized)) return 'danger'
  if (['running', 'active'].includes(normalized)) return 'info'
  if (['pending', 'sleeping', 'locked', 'idle', 'stalled', 'partial'].includes(normalized)) return 'warning'
  return 'muted'
}

function domainSmokeRowCountLabel(row: DomainSmokeProgressRow) {
  return `${formatNumber(row.actualCount ?? row.current)}/${formatNumber(row.requestedLimit ?? row.limit ?? row.total ?? 10)}`
}

function domainSmokeRowPath(row: DomainSmokeProgressRow) {
  return row.outputPath || ''
}

function domainSmokeFailureReason(row: DomainSmokeProgressRow, sample: DomainSmokeSample) {
  const sampleError = typeof sample.error === 'string' ? sample.error.trim() : ''
  if (sampleError) return sampleError
  const rowError = typeof row.error === 'string' ? row.error.trim() : ''
  if (rowError) return rowError
  const failedMessage = String(row.status || '').toLowerCase() === 'failed' && typeof row.message === 'string'
    ? row.message.trim()
    : ''
  return failedMessage
}

function smokeDomainLabel(domain: string) {
  return domainSmokeTestDomains.find((item) => item.domain === domain)?.label || domain || '未知域'
}

function queueDomainSmokeRow(item: CrawlerMonitorWikiQueueItem): DomainSmokeProgressRow {
  const domain = smokeQueueDomain(item)
  const outputDir = String(item.outputPath || '').replaceAll('\\', '/').replace(/\/+$/, '')
  return {
    domain,
    label: smokeDomainLabel(domain),
    sourceKey: item.actionId || '',
    message: item.message || '',
    status: item.status || 'missing',
    requestedLimit: 10,
    limit: 10,
    total: 10,
    requestedAt: item.requestedAt || '',
    startedAt: item.startedAt || item.processStartedAt || '',
    completedAt: item.completedAt || '',
    queueId: item.queueId || '',
    outputPath: outputDir && domain ? `${outputDir}/${domain}.json` : '',
    reportPath: item.reportPath || '',
    logPath: item.logPath || '',
  }
}

function smokeQueueDomain(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  if (!item) return ''
  const coveredDomain = Array.isArray(item.coveredDomains) ? item.coveredDomains.find(Boolean) : ''
  return String(coveredDomain || item.domain || '').trim()
}

function queueSortTime(item: CrawlerMonitorWikiQueueItem | null | undefined) {
  const date = new Date(item?.requestedAt || item?.startedAt || item?.completedAt || '')
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function domainSmokeVerdict(status: string, actualCount: number, expectedCount: number) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'failed') return '失败'
  if (actualCount >= expectedCount) return '通过'
  if (actualCount > 0) return '不足'
  if (normalized === 'running') return '运行中'
  if (normalized === 'queued' || normalized === 'pending') return '等待'
  return '未运行'
}

function formatNumber(value: number | string | null | undefined) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed.toLocaleString('zh-CN') : '0'
}

function finiteNumber(value: number | string | null | undefined) {
  if (value == null || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function dirnamePath(path: string) {
  const normalized = String(path || '').replaceAll('\\', '/')
  const index = normalized.lastIndexOf('/')
  return index > 0 ? normalized.slice(0, index) : ''
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value))
}

function formatDate(value: number | string | null | undefined) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatDuration(value: number | string | null | undefined) {
  const ms = Number(value || 0)
  if (!Number.isFinite(ms) || ms <= 0) return '--'
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`
}

function shortArgs(args?: string[]) {
  if (!Array.isArray(args) || !args.length) return '--'
  return args.join(' ').slice(0, 120)
}
</script>

<style scoped>
.crawler-monitor-test {
  display: grid;
  gap: 20px;
}

.test-hero {
  align-items: flex-start;
}

.test-actions {
  align-items: center;
}

.refresh-interval-control {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 72%, var(--color-bg));
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.refresh-interval-control input {
  width: 58px;
  height: 28px;
  padding: 0 6px;
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  text-align: center;
}

.refresh-interval-control input:focus {
  border-color: color-mix(in srgb, var(--color-primary) 65%, var(--color-border));
  outline: none;
}

.spin {
  animation: spin 1s linear infinite;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 16px;
}

.status-card {
  display: flex;
  gap: 14px;
  min-height: 112px;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 78%, var(--color-bg));
}

.status-card__icon {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 8px;
}

.status-card__label {
  display: block;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.status-card strong {
  display: block;
  margin-top: 5px;
  color: var(--color-text);
  font-size: 20px;
}

.status-card small {
  display: block;
  margin-top: 5px;
  color: var(--color-text-secondary);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.scenario-panel,
.simulation-panel,
.domain-smoke-testcases,
.smoke-panel,
.monitor-panel {
  min-width: 0;
}

.domain-smoke-testcases {
  display: grid;
  gap: 16px;
}

.domain-smoke-selector {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.domain-smoke-toggle {
  display: grid;
  gap: 4px;
  min-height: 58px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.domain-smoke-toggle.selected {
  border-color: color-mix(in srgb, var(--color-primary) 72%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg));
}

.domain-smoke-toggle span {
  font-weight: 900;
}

.domain-smoke-toggle small {
  color: var(--color-text-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.domain-smoke-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.domain-smoke-queue-control-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 0.85fr);
  gap: 14px;
  align-items: start;
  min-width: 0;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--color-warning) 28%, var(--color-border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-warning) 6%, var(--color-bg));
}

.domain-smoke-queue-note {
  display: grid;
  gap: 6px;
  min-width: 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.45;
}

.domain-smoke-effect-panel {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 22%, var(--color-border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 5%, var(--color-bg));
}

.domain-smoke-effect-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.domain-smoke-effect-card {
  min-width: 0;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  border-radius: 8px;
  background: var(--color-bg);
}

.domain-smoke-effect-card small,
.domain-smoke-effect-paths small,
.domain-smoke-file-actions small {
  display: block;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 900;
}

.domain-smoke-effect-card strong {
  display: block;
  margin-top: 4px;
  color: var(--color-text);
  font-size: 20px;
}

.domain-smoke-effect-card span {
  display: block;
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.domain-smoke-effect-paths {
  display: grid;
  gap: 8px;
}

.domain-smoke-effect-paths span {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 10px;
  align-items: baseline;
  min-width: 0;
}

.domain-smoke-effect-paths code {
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.domain-smoke-queue-panel {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 72%, var(--color-bg));
}

.domain-smoke-result-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.domain-smoke-result-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 76%, var(--color-bg));
}

.domain-smoke-result-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.domain-smoke-result-card__head strong,
.domain-smoke-result-card__head small {
  display: block;
}

.domain-smoke-result-card__head small,
.domain-smoke-result-card code {
  color: var(--color-text-secondary);
  overflow-wrap: anywhere;
}

.domain-smoke-file-actions {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.domain-smoke-file-actions span {
  min-width: 0;
}

.domain-smoke-file-actions code {
  display: block;
}

.domain-smoke-file-button {
  justify-self: start;
}

.domain-smoke-queue-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 2px;
}

.domain-smoke-result-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.domain-smoke-result-metrics span {
  min-width: 0;
}

.domain-smoke-result-metrics small {
  display: block;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 800;
}

.domain-smoke-result-metrics strong {
  display: block;
  margin-top: 3px;
  overflow-wrap: anywhere;
}

.domain-smoke-error {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fef2f2;
  color: #991b1b;
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.domain-smoke-error strong {
  font-size: 12px;
  font-weight: 900;
}

.domain-smoke-file-viewer {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  border-radius: 8px;
  background: var(--color-bg);
}

.domain-smoke-file-content {
  max-height: 460px;
  min-height: 180px;
  margin: 0;
  padding: 14px;
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 88%, var(--color-bg));
  color: var(--color-text);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre;
}

.domain-smoke-records {
  display: grid;
  gap: 10px;
}

.section-head--compact {
  margin-bottom: 0;
}

.domain-smoke-record-table {
  min-width: 880px;
}

.business-json-panel {
  display: grid;
  gap: 16px;
}

.business-json-toolbar {
  display: grid;
  gap: 12px;
}

.business-json-search {
  max-width: 560px;
}

.business-json-source {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 800;
}

.business-json-source code {
  min-width: 0;
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.business-json-record-table {
  min-width: 980px;
}

.smoke-meta {
  display: grid;
  gap: 8px;
  color: var(--color-text-secondary);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.smoke-progress-panel {
  display: grid;
  gap: 14px;
}

.smoke-progress-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.smoke-progress-summary span {
  min-width: 0;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 72%, var(--color-bg));
}

.smoke-progress-summary small,
.smoke-domain-row small {
  display: block;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 800;
}

.smoke-progress-summary strong,
.smoke-domain-row strong {
  display: block;
  margin-top: 4px;
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.smoke-domain-grid {
  display: grid;
  gap: 8px;
}

.smoke-domain-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(96px, 0.45fr);
  gap: 12px;
  align-items: center;
  min-height: 54px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  border-radius: 8px;
  background: var(--color-bg);
}

.smoke-domain-row > div {
  min-width: 0;
}

.smoke-domain-row__result {
  min-width: 0;
  text-align: right;
}

.smoke-domain-row__result code {
  display: block;
  margin-top: 4px;
  color: var(--color-text-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
  white-space: normal;
}

.simulation-controls {
  display: grid;
  grid-template-columns: minmax(140px, 0.75fr) minmax(150px, 0.75fr) minmax(220px, 1.4fr) auto auto;
  gap: 12px;
  align-items: end;
}

.field-control {
  display: grid;
  gap: 6px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 800;
}

.field-control input,
.field-control select {
  width: 100%;
  height: 38px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
}

.field-control input:focus,
.field-control select:focus {
  border-color: color-mix(in srgb, var(--color-primary) 65%, var(--color-border));
  outline: none;
}

.field-control small {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.simulation-progress {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.simulation-progress__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 800;
}

.simulation-progress__meta strong {
  color: var(--color-text);
  font-size: 12px;
}

.simulation-warning {
  grid-column: 1 / -1;
  color: #92400e;
  font-size: 12px;
  font-weight: 800;
}

.progress-track {
  width: 100%;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-border) 70%, transparent);
}

.progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  transition: width 180ms ease;
}

.scenario-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}

.scenario-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  font-weight: 800;
  cursor: pointer;
}

.scenario-button:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border));
  color: var(--color-primary);
}

.scenario-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.monitor-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(360px, 0.8fr);
  gap: 20px;
}

.monitor-main,
.monitor-side {
  display: grid;
  align-content: start;
  gap: 20px;
}

.table-scroll {
  overflow-x: auto;
}

.monitor-table {
  width: 100%;
  min-width: 720px;
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
.monitor-table td small {
  display: block;
}

.monitor-table td small {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.table-empty {
  color: var(--color-text-secondary);
  text-align: center;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
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

.json-editor {
  width: 100%;
  min-height: 520px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg) 88%, var(--color-bg-secondary));
  color: var(--color-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.55;
  resize: vertical;
}

.editor-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
}

.editor-meta {
  color: var(--color-text-secondary);
  font-size: 12px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1280px) {
  .status-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .simulation-controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .simulation-progress {
    grid-column: 1 / -1;
  }

  .smoke-progress-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .domain-smoke-effect-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .domain-smoke-selector {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .domain-smoke-result-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .scenario-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .monitor-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .status-grid,
  .domain-smoke-effect-grid,
  .domain-smoke-selector,
  .domain-smoke-result-grid,
  .scenario-grid {
    grid-template-columns: 1fr;
  }

  .test-actions,
  .editor-actions {
    width: 100%;
  }

  .simulation-controls {
    grid-template-columns: 1fr;
  }

  .simulation-progress {
    grid-column: auto;
  }

  .smoke-progress-summary,
  .smoke-domain-row {
    grid-template-columns: 1fr;
  }

  .smoke-domain-row__result {
    text-align: left;
  }

  .domain-smoke-effect-paths span {
    grid-template-columns: 1fr;
  }

  .test-actions .btn,
  .refresh-interval-control,
  .simulation-controls .btn,
  .editor-actions .btn {
    flex: 1 1 100%;
  }

  .refresh-interval-control {
    justify-content: center;
  }
}
</style>
