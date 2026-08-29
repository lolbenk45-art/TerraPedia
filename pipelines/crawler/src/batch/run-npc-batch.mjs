import fs from 'node:fs/promises';
import path from 'node:path';

import { buildNpcBatchSummary, writeNpcBatchSummaryReport } from '../report/npc-batch-summary.mjs';
import { getProjectRoot } from '../../../lib/project-root.mjs';
import {
  buildActionProgressPayload,
  createCrawlerProgressHeartbeat,
  writeJsonFile
} from '../../../workflow/backend-refresh-runtime-state.mjs';

const ACTION_ID = 'npc-coverage-batch';

export async function runNpcBatch(options = {}, { runCliImpl } = {}) {
  if (typeof runCliImpl !== 'function') {
    throw new Error('runCliImpl is required');
  }

  const domain = String(options.domain ?? 'npc').trim();
  if (domain !== 'npc') {
    throw new Error(`Only batch --domain=npc is supported, received: ${domain}`);
  }

  const resolvedProjectRoot = path.resolve(options.projectRoot ?? getProjectRoot());
  const resolvedProgressPath = path.resolve(
    options.progressPath
      ?? process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH
      ?? path.join(resolvedProjectRoot, 'data', 'generated', 'wiki-sync-progress.latest.json')
  );
  const resolvedCanonicalProgressPath = path.resolve(
    options.canonicalProgressPath ?? path.join(resolvedProjectRoot, 'data', 'generated', 'wiki-sync-progress.latest.json')
  );
  const actionId = String(options.actionId ?? process.env.TERRAPEDIA_CRAWLER_ACTION_ID ?? ACTION_ID).trim() || ACTION_ID;
  const outputRoot = options.outputRoot;
  const reportPath = path.join(
    path.resolve(outputRoot ?? path.join(process.cwd(), 'data', 'wiki-crawler')),
    'report', 'npc', 'batch-summary.latest.json'
  );
  const startedAt = new Date().toISOString();
  let current = 0;
  let total = 0;
  const writeProgress = (progress, targetPath = resolvedProgressPath) => {
    const payload = buildActionProgressPayload({
      actionId,
      startedAt,
      childStatusPath: targetPath,
      outputPath: reportPath,
      reportPath,
      ...progress
    });
    writeJsonFile(targetPath, payload);
    if (targetPath !== resolvedCanonicalProgressPath) {
      writeJsonFile(resolvedCanonicalProgressPath, buildActionProgressPayload({
        actionId,
        startedAt,
        childStatusPath: resolvedCanonicalProgressPath,
        outputPath: reportPath,
        reportPath,
        ...progress
      }));
    }
  };
  const heartbeat = createCrawlerProgressHeartbeat({ writeProgress });
  const publish = (progress) => heartbeat.publish({ current, total, ...progress });

  publish({ status: 'running', phase: 'load_targets', message: 'loading NPC coverage batch targets' });
  try {
    const targetPageTitles = await loadPageTitlesFromTargetsFile({
      targetsFile: options.targetsFile,
      targetPriority: options.targetPriority,
      limit: options.limit
    });
    const pageTitles = [...new Set([...normalizePageTitles(options.pageTitles), ...targetPageTitles])];
    const pageIds = normalizePageIds(options.pageIds);
    const writeFiles = Boolean(options.writeFiles);
    const executions = [];
    total = pageTitles.length + pageIds.length;
    publish({
      status: 'running',
      phase: 'fetch_pages',
      message: `fetching ${total} NPC coverage targets`
    });

    for (const pageTitle of pageTitles) {
      executions.push(await runSingleTarget({
        argv: buildEntityArgv({ pageTitle, apiUrl: options.apiUrl, writeFiles, outputRoot }),
        target: { pageTitle, pageId: null },
        runCliImpl
      }));
      current += 1;
      publish({ status: 'running', phase: 'fetch_pages', message: `fetched NPC target ${current}/${total}` });
    }

    for (const pageId of pageIds) {
      executions.push(await runSingleTarget({
        argv: buildEntityArgv({ pageId, apiUrl: options.apiUrl, writeFiles, outputRoot }),
        target: { pageTitle: '', pageId },
        runCliImpl
      }));
      current += 1;
      publish({ status: 'running', phase: 'fetch_pages', message: `fetched NPC target ${current}/${total}` });
    }

    const summary = buildNpcBatchSummary({ executions });
    publish({ status: 'running', phase: 'write_report', message: 'writing NPC batch summary report' });
    const writtenReportPath = writeNpcBatchSummaryReport({ summary, outputRoot });
    publish({ status: 'completed', phase: 'completed', message: 'NPC coverage batch completed' });
    return {
      executions,
      summary,
      reportPath: writtenReportPath,
      progressPath: resolvedProgressPath,
      canonicalProgressPath: resolvedCanonicalProgressPath
    };
  } catch (error) {
    publish({ status: 'failed', phase: 'failed', message: error?.message ?? String(error), failedCount: 1 });
    throw error;
  } finally {
    heartbeat.stop();
  }
}

async function runSingleTarget({
  argv,
  target,
  runCliImpl
}) {
  const payload = await runCliImpl(argv);
  return {
    target: {
      pageTitle: target.pageTitle ?? '',
      pageId: target.pageId ?? null,
      entityId: payload?.normalized?.entityId ?? ''
    },
    audit: payload?.audit ?? {
      status: 'fail',
      reasons: ['missing audit payload']
    },
    writtenFiles: payload?.writtenFiles ?? null
  };
}

function buildEntityArgv({
  pageTitle,
  pageId,
  apiUrl,
  writeFiles,
  outputRoot
}) {
  const argv = ['entity', '--domain=npc'];
  if (pageTitle) {
    argv.push(`--page-title=${pageTitle}`);
  } else if (pageId != null) {
    argv.push(`--page-id=${pageId}`);
  }
  if (apiUrl) {
    argv.push(`--api-url=${apiUrl}`);
  }
  if (writeFiles) {
    argv.push('--write-files');
  }
  if (outputRoot) {
    argv.push(`--output-root=${outputRoot}`);
  }
  return argv;
}

function normalizePageTitles(value) {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split('|')
      : [];
  return list.map((entry) => String(entry ?? '').trim()).filter(Boolean);
}

function normalizePageIds(value) {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  return list
    .map((entry) => Number(String(entry ?? '').trim()))
    .filter((entry) => Number.isInteger(entry));
}

async function loadPageTitlesFromTargetsFile({
  targetsFile,
  targetPriority,
  limit
} = {}) {
  const filePath = String(targetsFile ?? '').trim();
  if (!filePath) {
    return [];
  }

  const raw = await fs.readFile(filePath, 'utf8');
  const payload = JSON.parse(raw);
  const rows = normalizeTargetRows(payload);
  const filtered = String(targetPriority ?? '').trim()
    ? rows.filter((row) => String(row?.priority ?? '').trim() === String(targetPriority).trim())
    : rows;

  const titles = [...new Set(filtered
    .map((row) => {
      if (typeof row === 'string') {
        return row.trim();
      }
      return String(row?.pageTitle ?? row?.resolvedPageTitle ?? row?.requestedTitle ?? '').trim();
    })
    .filter(Boolean))];

  const normalizedLimit = Number(limit);
  if (Number.isFinite(normalizedLimit) && normalizedLimit > 0) {
    return titles.slice(0, normalizedLimit);
  }
  return titles;
}

function normalizeTargetRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.eligibleBatchTargets)) {
    return payload.eligibleBatchTargets;
  }
  if (Array.isArray(payload?.targets)) {
    return payload.targets;
  }
  return [];
}
