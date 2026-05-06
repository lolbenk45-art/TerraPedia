#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { runNpcBatch } from './batch/run-npc-batch.mjs';
import { runNpcStandardizedBridge } from './bridge/run-npc-standardized-bridge.mjs';
import { runNpcCoverageAudit } from './coverage/run-npc-coverage-audit.mjs';
import { runNpcCoverageShard } from './coverage/run-npc-coverage-shard.mjs';
import { buildNpcNormalizedLight } from './domains/npc-domain.mjs';
import { resolveNpcLiveSource } from './live/npc-live-source.mjs';
import { writeNpcFanoutFiles } from './output/npc-file-fanout.mjs';
import { canonicalizeNpc } from './phases/canonicalize.mjs';
import { auditNpcRichClosure } from './phases/audit.mjs';

export async function runCli(argv, {
  readFileImpl = fs.readFile,
  resolveNpcLiveSourceImpl = resolveNpcLiveSource,
  writeNpcFanoutFilesImpl = writeNpcFanoutFiles,
  runNpcBatchImpl = runNpcBatch,
  runNpcStandardizedBridgeImpl = runNpcStandardizedBridge,
  runNpcCoverageAuditImpl = runNpcCoverageAudit,
  runNpcCoverageShardImpl = runNpcCoverageShard
} = {}) {
  if (Array.isArray(argv) && argv[0] === 'batch') {
    return runNpcBatchImpl(compactObject({
      domain: readOption(argv, 'domain') ?? '',
      pageTitles: readListOption(argv, 'page-titles', '|'),
      pageIds: readListOption(argv, 'page-ids', ',').map((value) => Number(value)).filter((value) => Number.isInteger(value)),
      apiUrl: readOption(argv, 'api-url'),
      targetsFile: readOption(argv, 'targets-file'),
      targetPriority: readOption(argv, 'target-priority'),
      limit: readNumberOption(argv, 'limit'),
      writeFiles: hasFlag(argv, 'write-files'),
      outputRoot: readOption(argv, 'output-root')
    }), {
      runCliImpl: (singleArgv) => runCli(singleArgv, {
        readFileImpl,
        resolveNpcLiveSourceImpl,
        writeNpcFanoutFilesImpl,
        runNpcBatchImpl,
        runNpcStandardizedBridgeImpl,
        runNpcCoverageAuditImpl,
        runNpcCoverageShardImpl
      })
    });
  }

  if (Array.isArray(argv) && argv[0] === 'bridge') {
    return runNpcStandardizedBridgeImpl({
      domain: readOption(argv, 'domain') ?? '',
      sourceStandardizedDir: readOption(argv, 'source-standardized-dir'),
      crawlerOutputRoot: readOption(argv, 'crawler-output-root'),
      outputRoot: readOption(argv, 'output-root')
    });
  }

  if (Array.isArray(argv) && argv[0] === 'coverage-audit') {
    return runNpcCoverageAuditImpl({
      domain: readOption(argv, 'domain') ?? '',
      sourceStandardizedDir: readOption(argv, 'source-standardized-dir'),
      crawlerOutputRoot: readOption(argv, 'crawler-output-root'),
      outputRoot: readOption(argv, 'output-root')
    });
  }

  if (Array.isArray(argv) && argv[0] === 'coverage-shard') {
    return runNpcCoverageShardImpl(compactObject({
      domain: readOption(argv, 'domain') ?? '',
      coverageAuditPath: readOption(argv, 'coverage-audit-path'),
      priority: readOption(argv, 'priority'),
      limit: readNumberOption(argv, 'limit'),
      outputRoot: readOption(argv, 'output-root')
    }));
  }

  const raw = await loadRawInput(argv, {
    readFileImpl,
    resolveNpcLiveSourceImpl
  });
  const payload = buildNpcClosurePayload(raw);

  if (hasFlag(argv, 'write-files')) {
    payload.writtenFiles = await writeNpcFanoutFilesImpl({
      entityId: raw.entityId ?? payload.normalized?.entityId,
      outputRoot: readOption(argv, 'output-root'),
      normalized: payload.normalized,
      canonical: payload.canonical,
      audit: payload.audit
    });
  }

  return payload;
}

async function loadRawInput(argv, {
  readFileImpl,
  resolveNpcLiveSourceImpl
}) {
  const args = Array.isArray(argv) ? argv : [];
  const fixturePath = readOption(args, 'fixture');

  if (fixturePath) {
    return JSON.parse(await readFileImpl(fixturePath, 'utf8'));
  }

  if (args[0] === 'entity') {
    const domain = readOption(args, 'domain');
    if (domain !== 'npc') {
      throw new Error('Only entity --domain=npc is supported');
    }

    const pageIdValue = readOption(args, 'page-id');
    const pageTitle = readOption(args, 'page-title');
    const pageId = pageIdValue == null || pageIdValue === ''
      ? undefined
      : Number(pageIdValue);

    if (pageIdValue != null && !Number.isInteger(pageId)) {
      throw new Error(`Invalid --page-id value: ${pageIdValue}`);
    }
    if (pageId == null && !(typeof pageTitle === 'string' && pageTitle.trim())) {
      throw new Error('entity --domain=npc requires --page-id or --page-title');
    }

    return resolveNpcLiveSourceImpl({
      pageId,
      pageTitle,
      apiUrl: readOption(args, 'api-url')
    });
  }

  throw new Error([
    'Usage:',
    '  node scripts/data/crawler/src/cli.mjs --fixture <path>',
    '  node scripts/data/crawler/src/cli.mjs batch --domain=npc --page-titles=<title1|title2>',
    '  node scripts/data/crawler/src/cli.mjs batch --domain=npc --targets-file=<path> --target-priority=<priority> --limit=<n>',
    '  node scripts/data/crawler/src/cli.mjs batch --domain=npc --page-ids=<id1,id2>',
    '  node scripts/data/crawler/src/cli.mjs bridge --domain=npc --source-standardized-dir=<dir> --crawler-output-root=<dir>',
    '  node scripts/data/crawler/src/cli.mjs coverage-audit --domain=npc --source-standardized-dir=<dir> --crawler-output-root=<dir>',
    '  node scripts/data/crawler/src/cli.mjs coverage-shard --domain=npc --coverage-audit-path=<path> --priority=<priority> --limit=<n>',
    '  node scripts/data/crawler/src/cli.mjs entity --domain=npc --page-id=<id>',
    '  node scripts/data/crawler/src/cli.mjs entity --domain=npc --page-title=<title>',
    '  node scripts/data/crawler/src/cli.mjs entity --domain=npc --page-title=<title> --api-url=<wiki-api-url>'
  ].join('\n'));
}

function buildNpcClosurePayload(raw) {
  const normalized = buildNpcNormalizedLight(raw);
  const canonical = canonicalizeNpc(normalized);
  const audit = auditNpcRichClosure({
    ...normalized,
    sourceSignals: buildSourceSignals(raw)
  });

  return { normalized, canonical, audit };
}

function buildSourceSignals(raw) {
  const revisionText = String(raw?.revisionText ?? '');
  return {
    infoboxPresent: revisionText.includes('{{npc infobox'),
    shopTemplatePresent: revisionText.includes('{{shop')
  };
}

function readOption(argv, name) {
  const inlinePrefix = `--${name}=`;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === `--${name}`) {
      return argv[index + 1];
    }
    if (typeof arg === 'string' && arg.startsWith(inlinePrefix)) {
      return arg.slice(inlinePrefix.length);
    }
  }
  return undefined;
}

function readListOption(argv, name, separator) {
  const raw = readOption(argv, name);
  if (typeof raw !== 'string' || !raw.trim()) {
    return [];
  }
  return raw
    .split(separator)
    .map((value) => value.trim())
    .filter(Boolean);
}

function readNumberOption(argv, name) {
  const raw = readOption(argv, name);
  if (raw == null || raw === '') {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter(([, entry]) => entry !== undefined)
  );
}

function hasFlag(argv, name) {
  return Array.isArray(argv) && argv.includes(`--${name}`);
}

const isMain = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;

if (isMain) {
  try {
    const payload = await runCli(process.argv.slice(2));
    console.log(JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  }
}
