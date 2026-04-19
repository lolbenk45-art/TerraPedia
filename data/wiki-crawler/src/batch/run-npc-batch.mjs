import fs from 'node:fs/promises';

import { buildNpcBatchSummary, writeNpcBatchSummaryReport } from '../report/npc-batch-summary.mjs';

export async function runNpcBatch(options = {}, { runCliImpl } = {}) {
  if (typeof runCliImpl !== 'function') {
    throw new Error('runCliImpl is required');
  }

  const domain = String(options.domain ?? 'npc').trim();
  if (domain !== 'npc') {
    throw new Error(`Only batch --domain=npc is supported, received: ${domain}`);
  }

  const targetPageTitles = await loadPageTitlesFromTargetsFile({
    targetsFile: options.targetsFile,
    targetPriority: options.targetPriority,
    limit: options.limit
  });
  const pageTitles = [...new Set([
    ...normalizePageTitles(options.pageTitles),
    ...targetPageTitles
  ])];
  const pageIds = normalizePageIds(options.pageIds);
  const writeFiles = Boolean(options.writeFiles);
  const outputRoot = options.outputRoot;
  const executions = [];

  for (const pageTitle of pageTitles) {
    executions.push(await runSingleTarget({
      argv: buildEntityArgv({ pageTitle, writeFiles, outputRoot }),
      target: { pageTitle, pageId: null },
      runCliImpl
    }));
  }

  for (const pageId of pageIds) {
    executions.push(await runSingleTarget({
      argv: buildEntityArgv({ pageId, writeFiles, outputRoot }),
      target: { pageTitle: '', pageId },
      runCliImpl
    }));
  }

  const summary = buildNpcBatchSummary({ executions });
  const reportPath = writeNpcBatchSummaryReport({
    summary,
    outputRoot
  });

  return {
    executions,
    summary,
    reportPath
  };
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
  writeFiles,
  outputRoot
}) {
  const argv = ['entity', '--domain=npc'];
  if (pageTitle) {
    argv.push(`--page-title=${pageTitle}`);
  } else if (pageId != null) {
    argv.push(`--page-id=${pageId}`);
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
