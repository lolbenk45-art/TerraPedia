#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseCliArgs
} from '../lib/wiki-item-utils.mjs';

const MUTATION_FLAGS = new Set([
  'apply',
  'write-db',
  'sync',
  'import',
  'materialize',
  'backfill',
  'refresh',
  'pipeline',
  'crawler',
  'fetch',
  'flyway',
  'delete'
]);

const DEFAULT_INPUT = path.join(process.cwd(), 'data', 'reports', 'item-source-raw-page-candidates-2026-06-11-current.json');
const DEFAULT_OUTPUT = path.join(process.cwd(), 'data', 'reports', 'item-source-terminal-closure-review-2026-06-11.html');

export function parseRenderItemSourceClosureReviewHtmlArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  for (const [key, value] of Object.entries(options)) {
    if (MUTATION_FLAGS.has(key.toLowerCase()) && value !== false && value !== 'false') {
      throw new Error(`read-only item source closure HTML renderer refuses mutation flag: --${key}`);
    }
  }
  return {
    inputPath: options.input ?? DEFAULT_INPUT,
    outputPath: options.output ?? DEFAULT_OUTPUT
  };
}

export function renderItemSourceClosureReviewHtml(report) {
  const summary = report.summary ?? {};
  const hardBlockedRows = Array.isArray(report.hardBlockedRows) ? report.hardBlockedRows : [];
  const candidates = Array.isArray(report.candidates) ? report.candidates : [];
  const pageResolutionRows = Array.isArray(report.pageResolutionSummary) ? report.pageResolutionSummary : [];
  const generatedAt = report.generatedAt ?? new Date().toISOString();
  const embeddedReport = escapeScriptJson(JSON.stringify({
    generatedAt,
    summary,
    candidates: candidates.map(toCandidateReviewRow),
    hardBlockedRows: hardBlockedRows.map(toHardBlockedReviewRow),
    pageResolutionRows
  }));

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Item Source Terminal Closure Review</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #1f2933;
      --muted: #5f6c7b;
      --line: #d9e0e8;
      --accent: #1769aa;
      --ok: #157f3b;
      --warn: #a15c00;
      --bad: #b42318;
      --chip: #eef4fb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }
    header {
      background: #ffffff;
      border-bottom: 1px solid var(--line);
      padding: 24px 28px 18px;
      position: sticky;
      top: 0;
      z-index: 5;
    }
    h1 {
      font-size: 24px;
      line-height: 1.2;
      margin: 0 0 8px;
      letter-spacing: 0;
    }
    h2 {
      font-size: 18px;
      margin: 0 0 14px;
      letter-spacing: 0;
    }
    main {
      max-width: 1480px;
      margin: 0 auto;
      padding: 22px 28px 40px;
    }
    .meta {
      color: var(--muted);
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      font-size: 13px;
    }
    .grid {
      display: grid;
      gap: 12px;
    }
    .summary-grid {
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      margin-bottom: 18px;
    }
    .metric {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      min-height: 94px;
    }
    .metric strong {
      display: block;
      font-size: 28px;
      line-height: 1.05;
      margin-bottom: 8px;
    }
    .metric span {
      color: var(--muted);
      font-size: 13px;
    }
    .metric.ok strong { color: var(--ok); }
    .metric.warn strong { color: var(--warn); }
    .metric.bad strong { color: var(--bad); }
    section {
      margin-top: 18px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      margin-bottom: 12px;
    }
    input, select, button {
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      color: var(--text);
      font: inherit;
      min-height: 36px;
    }
    input, select {
      padding: 7px 10px;
    }
    input[type="search"] {
      min-width: min(420px, 100%);
      flex: 1 1 260px;
    }
    button {
      cursor: pointer;
      padding: 7px 11px;
    }
    button:hover { border-color: var(--accent); }
    .chips {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin: 10px 0 2px;
    }
    .chip {
      border: 1px solid var(--line);
      background: var(--chip);
      border-radius: 999px;
      padding: 4px 9px;
      font-size: 12px;
      color: var(--muted);
      white-space: nowrap;
    }
    .table-wrap {
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 1080px;
      background: #fff;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 9px 10px;
      text-align: left;
      vertical-align: top;
      font-size: 13px;
    }
    th {
      background: #f1f5f9;
      color: #344054;
      font-weight: 650;
      position: sticky;
      top: 0;
      z-index: 2;
    }
    tr:last-child td { border-bottom: 0; }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      word-break: break-word;
    }
    .status {
      display: inline-block;
      border-radius: 6px;
      padding: 2px 6px;
      background: #eef4fb;
      color: #184e77;
      font-size: 12px;
      font-weight: 650;
    }
    .nowrap { white-space: nowrap; }
    .muted { color: var(--muted); }
    .details {
      max-width: 520px;
      color: #344054;
    }
    .source-list {
      display: grid;
      gap: 5px;
      max-width: 560px;
    }
    .source-line {
      border-left: 3px solid #c7d7e8;
      padding-left: 8px;
    }
    .empty {
      color: var(--muted);
      padding: 18px;
    }
    @media (max-width: 760px) {
      header { padding: 18px 16px 14px; position: static; }
      main { padding: 16px; }
      section { padding: 12px; }
      h1 { font-size: 21px; }
      .metric strong { font-size: 24px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Item Source Terminal Closure Review</h1>
    <div class="meta">
      <span>只读审核页</span>
      <span>Generated: <code id="generatedAt"></code></span>
      <span>Source: <code>data/reports/item-source-raw-page-candidates-2026-06-11-current.json</code></span>
    </div>
  </header>
  <main>
    <div id="summary" class="grid summary-grid"></div>

    <section>
      <h2>终止闭环硬阻断</h2>
      <div class="toolbar">
        <input id="hardSearch" type="search" placeholder="搜索 ID、名称、状态、原因、建议动作">
        <select id="hardStatusFilter"></select>
        <button type="button" id="hardReset">重置</button>
      </div>
      <div id="hardChips" class="chips"></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="nowrap">Item ID</th>
              <th>名称</th>
              <th>状态</th>
              <th>原硬阻断</th>
              <th>证据</th>
              <th>建议动作</th>
              <th>Raw/Page</th>
            </tr>
          </thead>
          <tbody id="hardRows"></tbody>
        </table>
      </div>
      <div id="hardEmpty" class="empty" hidden>没有匹配的硬阻断记录。</div>
    </section>

    <section>
      <h2>可导入候选抽样审核</h2>
      <div class="toolbar">
        <input id="candidateSearch" type="search" placeholder="搜索 ID、名称、分类、来源类型、来源对象">
        <select id="candidateLaneFilter"></select>
        <select id="candidateSourceTypeFilter"></select>
        <button type="button" id="candidateReset">重置</button>
      </div>
      <div id="candidateChips" class="chips"></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="nowrap">Item ID</th>
              <th>名称</th>
              <th>分类</th>
              <th>候选分组</th>
              <th class="nowrap">来源数</th>
              <th>来源样例</th>
              <th>Raw/Page</th>
            </tr>
          </thead>
          <tbody id="candidateRows"></tbody>
        </table>
      </div>
      <div id="candidateEmpty" class="empty" hidden>没有匹配的候选记录。</div>
    </section>

    <section>
      <h2>页面解析口径</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Page Title</th>
              <th class="nowrap">已转候选</th>
              <th class="nowrap">仍硬阻断</th>
              <th>原因</th>
            </tr>
          </thead>
          <tbody id="pageResolutionRows"></tbody>
        </table>
      </div>
    </section>
  </main>

  <script id="reportData" type="application/json">${embeddedReport}</script>
  <script>
    const report = JSON.parse(document.getElementById('reportData').textContent);
    const state = {
      hardQuery: '',
      hardStatus: 'all',
      candidateQuery: '',
      candidateLane: 'all',
      candidateSourceType: 'all'
    };

    document.getElementById('generatedAt').textContent = report.generatedAt || '';
    renderSummary();
    setupFilters();
    renderHardRows();
    renderCandidateRows();
    renderPageResolutionRows();

    function renderSummary() {
      const summary = report.summary || {};
      const metrics = [
        ['总行数', summary.totalRows, ''],
        ['已提取来源候选', summary.candidatesWithExtractedSources, 'ok'],
        ['候选来源明细行', summary.candidateSourceRows, 'ok'],
        ['硬阻断行', summary.hardBlockedRows, 'warn'],
        ['终止闭环硬阻断', summary.terminalHardBlockedRows, 'warn'],
        ['可继续解析阻断', summary.actionableParserHardBlockedRows, summary.actionableParserHardBlockedRows ? 'bad' : 'ok'],
        ['未解决总数', summary.unresolvedTotal, summary.unresolvedTotal ? 'bad' : 'ok'],
        ['缺 raw page', summary.missingRawPage, 'warn']
      ];
      document.getElementById('summary').innerHTML = metrics.map(([label, value, cls]) =>
        '<div class="metric ' + cls + '"><strong>' + esc(value ?? 0) + '</strong><span>' + esc(label) + '</span></div>'
      ).join('');
    }

    function setupFilters() {
      fillSelect('hardStatusFilter', '全部终止状态', unique(report.hardBlockedRows.map((row) => row.terminalClosureStatus)));
      fillSelect('candidateLaneFilter', '全部候选分组', unique(report.candidates.map((row) => row.reviewLane)));
      fillSelect('candidateSourceTypeFilter', '全部来源类型', unique(report.candidates.flatMap((row) => row.sourceTypes)));

      document.getElementById('hardSearch').addEventListener('input', (event) => {
        state.hardQuery = event.target.value.trim().toLowerCase();
        renderHardRows();
      });
      document.getElementById('hardStatusFilter').addEventListener('change', (event) => {
        state.hardStatus = event.target.value;
        renderHardRows();
      });
      document.getElementById('hardReset').addEventListener('click', () => {
        state.hardQuery = '';
        state.hardStatus = 'all';
        document.getElementById('hardSearch').value = '';
        document.getElementById('hardStatusFilter').value = 'all';
        renderHardRows();
      });

      document.getElementById('candidateSearch').addEventListener('input', (event) => {
        state.candidateQuery = event.target.value.trim().toLowerCase();
        renderCandidateRows();
      });
      document.getElementById('candidateLaneFilter').addEventListener('change', (event) => {
        state.candidateLane = event.target.value;
        renderCandidateRows();
      });
      document.getElementById('candidateSourceTypeFilter').addEventListener('change', (event) => {
        state.candidateSourceType = event.target.value;
        renderCandidateRows();
      });
      document.getElementById('candidateReset').addEventListener('click', () => {
        state.candidateQuery = '';
        state.candidateLane = 'all';
        state.candidateSourceType = 'all';
        document.getElementById('candidateSearch').value = '';
        document.getElementById('candidateLaneFilter').value = 'all';
        document.getElementById('candidateSourceTypeFilter').value = 'all';
        renderCandidateRows();
      });
    }

    function renderHardRows() {
      const rows = report.hardBlockedRows.filter((row) => {
        const matchesStatus = state.hardStatus === 'all' || row.terminalClosureStatus === state.hardStatus;
        const matchesQuery = !state.hardQuery || [
          row.itemId,
          row.name,
          row.internalName,
          row.terminalClosureStatus,
          row.terminalClosureReason,
          row.terminalClosureEvidence,
          row.recommendedNextAction,
          row.hardBlockLane,
          row.priorUnresolvedLane,
          row.pageTitle
        ].join(' ').toLowerCase().includes(state.hardQuery);
        return matchesStatus && matchesQuery;
      });
      document.getElementById('hardRows').innerHTML = rows.map((row) => (
        '<tr>' +
          '<td class="nowrap"><code>' + esc(row.itemId) + '</code></td>' +
          '<td><strong>' + esc(row.name) + '</strong><br><code>' + esc(row.internalName) + '</code></td>' +
          '<td><span class="status">' + esc(row.terminalClosureStatus) + '</span><div class="muted">' + esc(row.terminalClosureReason) + '</div></td>' +
          '<td><code>' + esc(row.hardBlockLane) + '</code><br><span class="muted">' + esc(row.priorUnresolvedLane) + '</span></td>' +
          '<td class="details">' + esc(row.terminalClosureEvidence) + '</td>' +
          '<td class="details">' + esc(row.recommendedNextAction) + '</td>' +
          '<td><div>' + esc(row.pageTitle) + '</div><code>' + esc(shortPath(row.rawPath || row.attemptedRawPath)) + '</code></td>' +
        '</tr>'
      )).join('');
      document.getElementById('hardEmpty').hidden = rows.length > 0;
      document.getElementById('hardChips').innerHTML = [
        ['当前显示', rows.length],
        ['总硬阻断', report.hardBlockedRows.length],
        ['可继续解析阻断', report.summary.actionableParserHardBlockedRows ?? 0]
      ].map(([label, value]) => '<span class="chip">' + esc(label) + ': ' + esc(value) + '</span>').join('');
    }

    function renderCandidateRows() {
      const rows = report.candidates.filter((row) => {
        const matchesLane = state.candidateLane === 'all' || row.reviewLane === state.candidateLane;
        const matchesSourceType = state.candidateSourceType === 'all' || row.sourceTypes.includes(state.candidateSourceType);
        const matchesQuery = !state.candidateQuery || [
          row.itemId,
          row.name,
          row.internalName,
          row.categoryName,
          row.categoryCode,
          row.reviewLane,
          row.pageTitle,
          row.sourceTypes.join(' '),
          row.sourceRefNames.join(' ')
        ].join(' ').toLowerCase().includes(state.candidateQuery);
        return matchesLane && matchesSourceType && matchesQuery;
      });
      document.getElementById('candidateRows').innerHTML = rows.map((row) => (
        '<tr>' +
          '<td class="nowrap"><code>' + esc(row.itemId) + '</code></td>' +
          '<td><strong>' + esc(row.name) + '</strong><br><code>' + esc(row.internalName) + '</code></td>' +
          '<td>' + esc(row.categoryName || '') + '<br><code>' + esc(row.categoryCode || '') + '</code></td>' +
          '<td><span class="status">' + esc(row.reviewLane) + '</span></td>' +
          '<td class="nowrap">' + esc(row.extractedSourceCount) + '</td>' +
          '<td><div class="source-list">' + row.sourcePreview.map(renderSourcePreview).join('') + '</div></td>' +
          '<td><div>' + esc(row.pageTitle) + '</div><code>' + esc(shortPath(row.rawPath)) + '</code></td>' +
        '</tr>'
      )).join('');
      document.getElementById('candidateEmpty').hidden = rows.length > 0;
      document.getElementById('candidateChips').innerHTML = [
        ['当前显示', rows.length],
        ['总候选', report.candidates.length],
        ['候选来源明细行', report.summary.candidateSourceRows ?? 0]
      ].map(([label, value]) => '<span class="chip">' + esc(label) + ': ' + esc(value) + '</span>').join('');
    }

    function renderPageResolutionRows() {
      document.getElementById('pageResolutionRows').innerHTML = report.pageResolutionRows.map((row) => (
        '<tr>' +
          '<td>' + esc(row.pageTitle) + '</td>' +
          '<td class="nowrap">' + esc(row.convertedToCandidate ?? 0) + '</td>' +
          '<td class="nowrap">' + esc(row.remainingHardBlocked ?? 0) + '</td>' +
          '<td><code>' + esc(row.reason) + '</code></td>' +
        '</tr>'
      )).join('');
    }

    function renderSourcePreview(source) {
      return '<div class="source-line">' +
        '<code>' + esc(source.sourceType) + '</code> / <code>' + esc(source.sourceRefType) + '</code> ' +
        '<strong>' + esc(source.sourceRefName) + '</strong>' +
        (source.chanceText ? '<span class="muted"> chance=' + esc(source.chanceText) + '</span>' : '') +
        (source.quantityText ? '<span class="muted"> qty=' + esc(source.quantityText) + '</span>' : '') +
      '</div>';
    }

    function fillSelect(id, label, values) {
      const select = document.getElementById(id);
      select.innerHTML = '<option value="all">' + esc(label) + '</option>' +
        values.map((value) => '<option value="' + escAttr(value) + '">' + esc(value) + '</option>').join('');
    }

    function unique(values) {
      return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
    }

    function shortPath(value) {
      if (!value) return '';
      return String(value).replace('/home/lolben/TerraPedia/', '').replace('/home/lolben/data/terraPedia/', '~/data/terraPedia/');
    }

    function esc(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char]));
    }

    function escAttr(value) {
      return esc(value).replace(/\\x60/g, '&#96;');
    }
  </script>
</body>
</html>`;
}

function toCandidateReviewRow(row) {
  const extractedSources = Array.isArray(row.extractedSources) ? row.extractedSources : [];
  return {
    itemId: row.itemId,
    internalName: row.itemInternalName ?? row.internalName ?? '',
    name: row.name ?? row.itemName ?? row.itemInternalName ?? row.internalName ?? '',
    categoryCode: row.categoryCode ?? '',
    categoryName: row.categoryName ?? '',
    rawPath: row.rawPath ?? '',
    pageTitle: row.pageTitle ?? '',
    sourceRevisionTimestamp: row.sourceRevisionTimestamp ?? null,
    extractedSourceCount: row.extractedSourceCount ?? extractedSources.length,
    reviewLane: row.reviewLane ?? '',
    sourceTypes: [...new Set(extractedSources.map((source) => source.sourceType).filter(Boolean))],
    sourceRefNames: [...new Set(extractedSources.map((source) => source.sourceRefName).filter(Boolean))],
    sourcePreview: extractedSources.slice(0, 4).map((source) => ({
      sourceType: source.sourceType ?? '',
      sourceRefType: source.sourceRefType ?? '',
      sourceRefName: source.sourceRefName ?? '',
      quantityText: source.quantityText ?? '',
      chanceText: source.chanceText ?? ''
    }))
  };
}

function toHardBlockedReviewRow(row) {
  return {
    itemId: row.itemId,
    internalName: row.itemInternalName ?? row.internalName ?? '',
    name: row.name ?? row.itemName ?? row.itemInternalName ?? row.internalName ?? '',
    categoryCode: row.categoryCode ?? '',
    categoryName: row.categoryName ?? '',
    pageTitle: row.pageTitle ?? '',
    rawPath: row.rawPath ?? '',
    attemptedRawPath: row.attemptedRawPath ?? '',
    hardBlockLane: row.hardBlockLane ?? '',
    blockerReason: row.blockerReason ?? '',
    specificBlockerReason: row.specificBlockerReason ?? '',
    priorUnresolvedLane: row.priorUnresolvedLane ?? '',
    terminalClosureStatus: row.terminalClosureStatus ?? '',
    terminalClosureReason: row.terminalClosureReason ?? '',
    recommendedNextAction: row.recommendedNextAction ?? '',
    terminalClosureEvidence: row.terminalClosureEvidence ?? ''
  };
}

function escapeScriptJson(value) {
  return value
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function writeItemSourceClosureReviewHtml({
  inputPath = DEFAULT_INPUT,
  outputPath = DEFAULT_OUTPUT
} = {}) {
  const report = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), inputPath), 'utf8'));
  const html = renderItemSourceClosureReviewHtml(report);
  fs.mkdirSync(path.dirname(path.resolve(process.cwd(), outputPath)), { recursive: true });
  fs.writeFileSync(path.resolve(process.cwd(), outputPath), html);
  return {
    outputPath: path.resolve(process.cwd(), outputPath),
    bytes: Buffer.byteLength(html),
    summary: report.summary ?? {}
  };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const options = parseRenderItemSourceClosureReviewHtmlArgs();
  const result = writeItemSourceClosureReviewHtml(options);
  console.log(JSON.stringify(result, null, 2));
}
