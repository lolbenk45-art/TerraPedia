#!/usr/bin/env node

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveProjectPath, resolveSharedDataRoot } from '../data/lib/project-root.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRootDefault = resolveProjectPath();
const sharedDataRootDefault = resolveSharedDataRoot();

export async function buildStandaloneMonitorState({
  repoRoot = repoRootDefault,
  sharedDataRoot = sharedDataRootDefault,
  now = new Date()
} = {}) {
  const progressPath = path.join(repoRoot, 'data/generated/wiki-sync-progress.latest.json');
  const requestGatePath = path.join(sharedDataRoot, 'generated/wiki-request-gate.latest.json');
  const repoBuffProgressPath = path.join(repoRoot, 'data/generated/buff-evidence-refresh-progress.latest.json');
  const sharedBuffProgressPath = path.join(sharedDataRoot, 'generated/fetch-wiki-buffs-progress.latest.json');
  const itemPagesRawDir = path.join(sharedDataRoot, 'raw/wiki/item-pages');
  const fetchReportDir = path.join(sharedDataRoot, 'reports/fetch');
  const crawlerReportDir = path.join(repoRoot, 'reports/crawler-monitor');

  const progress = await readJsonFile(progressPath);
  const requestGate = await readJsonFile(requestGatePath);
  const buffProgressSources = [
    { path: repoBuffProgressPath, ...(await readJsonFile(repoBuffProgressPath)) },
    { path: sharedBuffProgressPath, ...(await readJsonFile(sharedBuffProgressPath)) }
  ];
  const buffProgress = selectProgressSource(buffProgressSources);
  const rawCount = await countFiles(itemPagesRawDir, (name) => name.endsWith('.latest.json'));
  const latestReport = await readLatestJsonReport(fetchReportDir, /^fetch-item-pages-.*\.json$/);
  const recentReports = [
    ...(await listRecentFiles(fetchReportDir, /^fetch-item-pages.*\.json$/, 'fetch')),
    ...(await listRecentFiles(crawlerReportDir, /item-pages.*\.(log|json|err\.log)$/, 'runner'))
  ].slice(0, 12);

  return {
    generatedAt: now.toISOString(),
    repoRoot,
    sharedDataRoot,
    itemPages: {
      rawCount,
      rawDir: itemPagesRawDir,
      latestReport
    },
    progress: {
      ...progress,
      path: 'data/generated/wiki-sync-progress.latest.json'
    },
    buffProgress: {
      ...buffProgress,
      path: buffProgress.path
    },
    buffProgressSources,
    requestGate: buildRequestGateState(requestGate),
    files: [
      fileSummary('Item page progress', progressPath, progress),
      fileSummary('Wiki request gate', requestGatePath, requestGate),
      ...buffProgressSources.map((source) => fileSummary(source.path.endsWith('buff-evidence-refresh-progress.latest.json') ? 'Buff evidence progress' : 'Buff source progress', source.path, source)),
      dirSummary('Raw item pages', itemPagesRawDir, rawCount),
      dirSummary('Fetch reports', fetchReportDir, recentReports.length)
    ],
    recentReports
  };
}

function selectProgressSource(sources) {
  const found = sources.filter((source) => source.found && source.readable);
  const running = found.find((source) => source.payload?.status === 'running');
  if (running) return running;
  return found.sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))[0]
    ?? sources[0]
    ?? { found: false, readable: false, payload: null, path: null };
}

export function renderStandaloneMonitorHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>爬取监控</title>
  <style>${standaloneCss()}</style>
</head>
<body>
  <main class="page-wrap crawler-monitor">
    <section class="workspace-shell workspace-shell--unified">
      <div class="workspace-hero workspace-hero--unified monitor-hero">
        <div class="workspace-hero__copy">
          <p class="eyebrow">CRAWLER MONITOR</p>
          <h1 class="page-head__title">爬取监控</h1>
          <p class="page-head__subtitle">独立只读端口，直接读取本地进度文件和报告，不依赖后台登录、Nuxt proxy 或后端 API。</p>
          <div class="workspace-summary-grid" id="summaryCards"></div>
        </div>
        <div class="toolbar-top action-cluster toolbar-top--hero monitor-actions">
          <button type="button" class="btn btn-secondary" id="refreshButton">刷新</button>
          <span class="status-pill info" id="autoRefreshLabel">2s auto refresh</span>
        </div>
      </div>
    </section>

    <section class="status-grid" id="statusGrid"></section>

    <section class="source-progress-panel" aria-label="Item page live progress">
      <div class="source-progress-panel__head">
        <div>
          <h2 class="section-card__title">Item pages 实时进度</h2>
          <p class="section-card__subtitle">读取 data/generated/wiki-sync-progress.latest.json；页面只显示状态，不触发爬取。</p>
        </div>
        <div class="source-progress-panel__meta">
          <span class="status-pill muted" id="lastRefresh">--</span>
          <code id="repoRoot">--</code>
        </div>
      </div>
      <div id="progressRows" class="source-progress-grid"></div>
    </section>

    <section class="operations-grid" aria-label="Crawler operation snapshot">
      <article class="ops-card ops-card--primary" id="activeTask"></article>
      <article class="ops-card" id="requestGate"></article>
      <article class="ops-card" id="rawOutput"></article>
      <article class="ops-card ops-card--paths" id="latestReport"></article>
    </section>

    <section class="monitor-layout">
      <div class="monitor-main">
        <section class="section-card monitor-panel">
          <div class="section-head">
            <div>
              <h2 class="section-card__title">阶段进度</h2>
              <p class="section-card__subtitle">本页复用后台监控页的信息层级，但所有数据来自本地文件。</p>
            </div>
          </div>
          <div class="action-rail" id="actionRail"></div>
        </section>
      </div>
      <aside class="monitor-side">
        <section class="section-card monitor-panel">
          <div class="section-head">
            <div>
              <h2 class="section-card__title">文件健康</h2>
              <p class="section-card__subtitle">缺失和 JSON 读取失败会单独标出。</p>
            </div>
          </div>
          <div class="file-list" id="fileList"></div>
        </section>
        <section class="section-card monitor-panel">
          <div class="section-head">
            <div>
              <h2 class="section-card__title">近期报告</h2>
              <p class="section-card__subtitle">只显示路径、大小和更新时间。</p>
            </div>
          </div>
          <div class="report-list" id="reportList"></div>
        </section>
      </aside>
    </section>
  </main>
  <script>${standaloneClientJs()}</script>
</body>
</html>`;
}

export async function routeStandaloneMonitorRequest(request, options = {}) {
  const method = String(request.method || 'GET').toUpperCase();
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (method !== 'GET' && method !== 'HEAD') {
    return jsonResponse({ error: 'read-only monitor' }, 405);
  }
  if (url.pathname === '/api/state') {
    return jsonResponse(await buildStandaloneMonitorState(options));
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    return htmlResponse(renderStandaloneMonitorHtml());
  }
  return jsonResponse({ error: 'not found' }, 404);
}

async function startServer() {
  const port = Number(process.env.TERRAPEDIA_MONITOR_PORT || '3099');
  const host = process.env.TERRAPEDIA_MONITOR_HOST || '127.0.0.1';
  const server = http.createServer(async (req, res) => {
    try {
      const response = await routeStandaloneMonitorRequest(req);
      res.writeHead(response.status, response.headers);
      res.end(response.body);
    } catch (error) {
      const response = jsonResponse({ error: error?.message || String(error) }, 500);
      res.writeHead(response.status, response.headers);
      res.end(response.body);
    }
  });
  server.listen(port, host, () => {
    console.log(`Standalone crawler monitor: http://${host}:${port}`);
  });
}

async function readJsonFile(filePath) {
  try {
    const text = await fs.promises.readFile(filePath, 'utf8');
    const stat = await fs.promises.stat(filePath);
    return { found: true, readable: true, updatedAt: stat.mtime.toISOString(), payload: JSON.parse(text) };
  } catch (error) {
    return { found: false, readable: false, errorMessage: error.message, payload: null };
  }
}

async function countFiles(dirPath, predicate) {
  try {
    const names = await fs.promises.readdir(dirPath);
    return names.filter(predicate).length;
  } catch {
    return 0;
  }
}

async function readLatestJsonReport(dirPath, pattern) {
  const files = await listRecentFiles(dirPath, pattern, 'fetch');
  if (!files.length) return null;
  const latest = files[0];
  const parsed = await readJsonFile(latest.absolutePath);
  return {
    path: latest.path,
    updatedAt: latest.updatedAt,
    sizeBytes: latest.sizeBytes,
    successCount: Number(parsed.payload?.successCount || 0),
    failureCount: Number(parsed.payload?.failureCount || 0),
    withRecipes: Boolean(parsed.payload?.withRecipes)
  };
}

async function listRecentFiles(dirPath, pattern, category) {
  try {
    const names = await fs.promises.readdir(dirPath);
    const rows = [];
    for (const name of names) {
      if (!pattern.test(name)) continue;
      const absolutePath = path.join(dirPath, name);
      const stat = await fs.promises.stat(absolutePath);
      rows.push({ name, path: absolutePath, absolutePath, category, updatedAt: stat.mtime.toISOString(), sizeBytes: stat.size });
    }
    return rows.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  } catch {
    return [];
  }
}

function buildRequestGateState(result) {
  const payload = result.payload || {};
  const cooldownUntil = payload.cooldownUntil || null;
  return {
    found: result.found,
    readable: result.readable,
    cooldownActive: Boolean(cooldownUntil && Date.parse(cooldownUntil) > Date.now()),
    cooldownUntil,
    consecutiveThrottleFailures: Number(payload.consecutiveThrottleFailures || 0),
    successCount: Number(payload.successCount || 0),
    failureCount: Number(payload.failureCount || 0),
    lastError: payload.lastError || null,
    updatedAt: result.updatedAt || null
  };
}

function fileSummary(label, filePath, result) {
  return { label, path: filePath, found: result.found, readable: result.readable, updatedAt: result.updatedAt || null, errorMessage: result.errorMessage || null };
}

function dirSummary(label, dirPath, count) {
  return { label, path: dirPath, found: true, readable: true, count, updatedAt: null };
}

function jsonResponse(value, status = 200) {
  return { status, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(value, null, 2) };
}

function htmlResponse(body) {
  return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body };
}

function standaloneCss() {
  return `:root{--color-bg:#f6f8fb;--color-bg-shell:#edf2f7;--color-surface-1:#fff;--color-surface-2:#f8fafc;--color-text:#172033;--color-text-secondary:#607086;--color-border:#d8e0ea;--color-primary:#2563eb;--color-info:#0891b2;--color-success:#16a34a;--color-warning:#d97706;--color-danger:#dc2626;--radius-lg:8px;--radius-xl:8px;--shadow-surface-1:0 12px 28px rgba(15,23,42,.08);--shadow-surface-2:0 18px 42px rgba(15,23,42,.1);--font-sans:Inter,Plus Jakarta Sans,system-ui,sans-serif;--font-display:Inter,Plus Jakarta Sans,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;font-family:var(--font-sans);background:linear-gradient(180deg,var(--color-bg-shell),var(--color-bg));color:var(--color-text)}button{font:inherit}.page-wrap{max-width:1440px;margin:0 auto;padding:24px}.workspace-shell,.section-card,.status-card,.ops-card,.source-progress-row{border:1px solid var(--color-border);background:linear-gradient(180deg,var(--color-surface-1),var(--color-surface-2));box-shadow:var(--shadow-surface-1);border-radius:8px}.workspace-shell{margin-bottom:22px;box-shadow:var(--shadow-surface-2)}.workspace-hero{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(260px,.6fr);gap:24px;padding:28px 30px}.eyebrow{margin:0 0 8px;font-size:.75rem;font-weight:700;color:var(--color-primary);letter-spacing:.08em}.page-head__title{margin:0;font-size:2rem;line-height:1.1}.page-head__subtitle{max-width:72ch;color:var(--color-text-secondary);line-height:1.7}.workspace-summary-grid,.status-grid,.operations-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.summary-mini,.status-card,.ops-card{padding:16px}.summary-mini__label,.status-card__label,.ops-card__label{display:block;color:var(--color-text-secondary);font-size:.8rem}.summary-mini__value,.status-card strong,.ops-card__title{font-size:1.25rem}.btn{display:inline-flex;align-items:center;gap:8px;min-height:40px;border:1px solid var(--color-border);border-radius:8px;padding:0 14px;background:#fff;color:var(--color-text);cursor:pointer}.monitor-actions{display:flex;justify-content:flex-end;gap:10px}.status-pill{display:inline-flex;align-items:center;min-height:24px;border-radius:999px;padding:0 10px;background:#e2e8f0;color:#334155;font-size:.78rem;font-weight:700}.status-pill.info{background:#dbeafe;color:#1d4ed8}.status-pill.success{background:#dcfce7;color:#166534}.status-pill.warning{background:#fef3c7;color:#92400e}.status-pill.danger{background:#fee2e2;color:#991b1b}.source-progress-panel,.section-card{padding:22px 24px;margin-bottom:20px}.source-progress-panel__head,.section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:18px}.section-card__title{margin:0;font-size:1.08rem}.section-card__subtitle{margin:.35rem 0 0;color:var(--color-text-secondary)}.source-progress-grid,.action-rail,.file-list,.report-list{display:grid;gap:12px}.source-progress-row{padding:16px}.source-progress-row__title,.ops-card__head{display:flex;align-items:center;justify-content:space-between;gap:12px}.progress-track{height:8px;border-radius:999px;background:#e5e7eb;overflow:hidden;margin-top:12px}.progress-track span{display:block;height:100%;background:var(--color-primary);width:0}.progress-track span.success{background:var(--color-success)}.progress-track span.warning{background:var(--color-warning)}.progress-track span.danger{background:var(--color-danger)}.ops-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}.ops-metrics small{display:block;color:var(--color-text-secondary)}.monitor-layout{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:20px}.file-row,.report-row{padding:12px;border:1px solid var(--color-border);border-radius:8px;background:#fff}.file-row strong,.report-row strong{display:block}.file-row small,.report-row small,code{color:var(--color-text-secondary)}code{word-break:break-all}@media(max-width:900px){.workspace-hero,.monitor-layout{grid-template-columns:1fr}.workspace-summary-grid,.status-grid,.operations-grid{grid-template-columns:1fr}}`;
}

function standaloneClientJs() {
  return `const fmt=n=>new Intl.NumberFormat().format(Number(n||0));const pct=(c,t)=>t>0?Math.max(0,Math.min(100,Math.round(c/t*100))):0;const el=id=>document.getElementById(id);function tone(s){s=String(s||'').toLowerCase();if(['completed','success','ok'].includes(s))return'success';if(['running','queued'].includes(s))return'info';if(['failed','error'].includes(s))return'danger';if(['stalled','cooldown'].includes(s))return'warning';return'muted'}function esc(v){return String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}async function load(){const r=await fetch('/api/state');const s=await r.json();render(s)}function render(s){const p=s.progress?.payload||{};const report=s.itemPages?.latestReport||{};el('lastRefresh').textContent='刷新 '+new Date(s.generatedAt).toLocaleTimeString();el('repoRoot').textContent=s.repoRoot;el('summaryCards').innerHTML=[['Raw item pages',fmt(s.itemPages.rawCount)],['Overall',fmt(p.overallCurrent)+' / '+fmt(p.overallTotal)],['Gate failures',fmt(s.requestGate.failureCount)],['Reports',fmt(s.recentReports.length)]].map(([a,b])=>'<article class="summary-mini"><span class="summary-mini__label">'+a+'</span><strong class="summary-mini__value">'+b+'</strong></article>').join('');el('statusGrid').innerHTML=[['Progress',p.status||'unknown',p.message||'--'],['Request gate',s.requestGate.cooldownActive?'cooldown':'ready',s.requestGate.cooldownUntil||'no cooldown'],['Raw dir',fmt(s.itemPages.rawCount),s.itemPages.rawDir],['Latest report',(report.successCount??'--')+' ok / '+(report.failureCount??'--')+' failed',report.path||'--']].map(([a,b,c])=>'<article class="status-card"><span class="status-card__label">'+esc(a)+'</span><strong>'+esc(b)+'</strong><small>'+esc(c)+'</small></article>').join('');const percent=pct(p.overallCurrent||p.current,p.overallTotal||p.total);el('progressRows').innerHTML='<article class="source-progress-row"><div class="source-progress-row__title"><strong>'+esc(p.actionId||'item-pages-refresh')+'</strong><span class="status-pill '+tone(p.status)+'">'+esc(p.status||'unknown')+'</span></div><p>'+esc(p.message||'No progress message yet.')+'</p><div class="progress-track"><span class="'+tone(p.status)+'" style="width:'+percent+'%"></span></div><code>'+esc(s.progress.path)+'</code></article>';el('activeTask').innerHTML='<div class="ops-card__head"><span class="ops-card__label">Active task</span><span class="status-pill '+tone(p.status)+'">'+esc(p.status||'unknown')+'</span></div><strong class="ops-card__title">'+esc(p.actionId||'item-pages-refresh')+'</strong><div class="ops-metrics"><span><small>Progress</small><strong>'+fmt(p.overallCurrent||p.current)+'/'+fmt(p.overallTotal||p.total)+'</strong></span><span><small>Batch</small><strong>'+fmt(p.current)+'/'+fmt(p.total)+'</strong></span><span><small>Heartbeat</small><strong>'+esc(p.lastHeartbeatAt||'--')+'</strong></span></div><div class="progress-track"><span class="'+tone(p.status)+'" style="width:'+percent+'%"></span></div>';el('requestGate').innerHTML='<div class="ops-card__head"><span class="ops-card__label">Request gate</span><span class="status-pill '+(s.requestGate.cooldownActive?'warning':'success')+'">'+(s.requestGate.cooldownActive?'cooldown':'ready')+'</span></div><p>'+esc(s.requestGate.lastError||s.requestGate.cooldownUntil||'No active cooldown')+'</p>';el('rawOutput').innerHTML='<div class="ops-card__head"><span class="ops-card__label">Raw outputs</span><strong>'+fmt(s.itemPages.rawCount)+'</strong></div><code>'+esc(s.itemPages.rawDir)+'</code>';el('latestReport').innerHTML='<div class="ops-card__head"><span class="ops-card__label">Latest report</span><strong>'+fmt(report.successCount)+'/'+fmt(report.failureCount)+'</strong></div><code>'+esc(report.path||'--')+'</code>';el('actionRail').innerHTML=el('progressRows').innerHTML;el('fileList').innerHTML=s.files.map(f=>'<article class="file-row"><strong>'+esc(f.label)+'</strong><small>'+(f.found?'readable':'missing')+'</small><code>'+esc(f.path)+'</code></article>').join('');el('reportList').innerHTML=s.recentReports.map(r=>'<article class="report-row"><strong>'+esc(r.name)+'</strong><small>'+esc(r.updatedAt)+' · '+fmt(r.sizeBytes)+' bytes</small><code>'+esc(r.path)+'</code></article>').join('')}el('refreshButton').addEventListener('click',load);load();setInterval(load,2000);`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  await startServer();
}
