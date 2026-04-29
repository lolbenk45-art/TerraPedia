#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  numericOption,
  parseCliArgs
} from '../lib/wiki-item-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const runnerPath = path.join(repoRoot, 'scripts', 'data', 'fetch', 'run-item-page-crawl-batches.mjs');
const defaultProgressPath = 'data/generated/wiki-sync-progress.latest.json';
const defaultTaskName = 'TerraPediaItemPageCrawl';

export function buildRunnerCliArgs({
  batchSize,
  concurrency,
  delayMs,
  endOffset = null,
  jitterMs,
  maxAttempts,
  onlyChanged,
  progressPath,
  resumeFromProgress,
  startOffset = null,
  withRecipes
}) {
  const args = [
    `--batch-size=${batchSize}`,
    `--concurrency=${concurrency}`,
    `--delay-ms=${delayMs}`,
    `--jitter-ms=${jitterMs}`,
    `--max-attempts=${maxAttempts}`,
    `--progress-path=${progressPath}`,
    `--resume-from-progress=${Boolean(resumeFromProgress)}`,
    `--only-changed=${Boolean(onlyChanged)}`,
    `--with-recipes=${Boolean(withRecipes)}`
  ];
  if (startOffset != null && Number(startOffset) >= 0) {
    args.push(`--start-offset=${Math.trunc(Number(startOffset))}`);
  }
  if (endOffset != null && Number(endOffset) >= 0) {
    args.push(`--end-offset=${Math.trunc(Number(endOffset))}`);
  }
  return args;
}

export function buildTaskRunCommand({
  nodePath,
  runnerPath,
  runnerArgs,
  stdoutPath,
  stderrPath
}) {
  return `cmd.exe /d /s /c "${buildRunnerCommandLine({
    nodePath,
    runnerPath,
    runnerArgs,
    stdoutPath,
    stderrPath
  })}"`;
}

export function buildTaskWrapperRunCommand(commandPath) {
  return `cmd.exe /d /s /c "${quoteForCmd(commandPath)}"`;
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const reportDir = path.join(repoRoot, 'reports', 'crawler-monitor');
  fs.mkdirSync(reportDir, { recursive: true });

  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const stdoutPath = path.join(reportDir, `item-pages-detached-runner-${stamp}.log`);
  const stderrPath = path.join(reportDir, `item-pages-detached-runner-${stamp}.err.log`);
  const commandPath = path.join(reportDir, `item-pages-detached-runner-${stamp}.cmd`);
  const taskName = String(options['task-name'] ?? options.taskName ?? defaultTaskName);
  const nodePath = process.execPath;
  const runnerArgs = buildRunnerCliArgs({
    batchSize: Math.max(1, numericOption(options['batch-size'] ?? options.limit, 100)),
    concurrency: Math.max(1, numericOption(options.concurrency, 1)),
    delayMs: Math.max(0, numericOption(options['delay-ms'] ?? options.delayMs, 5000)),
    endOffset: optionNumberOrNull(options['end-offset'] ?? options.maxOffset),
    jitterMs: Math.max(0, numericOption(options['jitter-ms'] ?? options.jitterMs, 2000)),
    maxAttempts: Math.max(1, numericOption(options['max-attempts'] ?? options.maxAttempts, 8)),
    onlyChanged: booleanOption(options['only-changed'] ?? options.onlyChanged, false),
    progressPath: String(options['progress-path'] ?? options.progressPath ?? defaultProgressPath),
    resumeFromProgress: booleanOption(options['resume-from-progress'] ?? options.resumeFromProgress, true),
    startOffset: optionNumberOrNull(options['start-offset'] ?? options.offset),
    withRecipes: booleanOption(options['with-recipes'] ?? options.withRecipes, true)
  });
  const runnerCommand = buildRunnerCommandLine({
    nodePath,
    runnerPath,
    runnerArgs,
    stdoutPath,
    stderrPath
  });
  fs.writeFileSync(commandPath, `@echo off\r\n${runnerCommand}\r\n`, 'utf8');
  const taskRun = buildTaskWrapperRunCommand(commandPath);
  const startTime = formatTaskTime(new Date(Date.now() + 60_000));

  runSchtasks(['/Create', '/TN', taskName, '/SC', 'ONCE', '/ST', startTime, '/TR', taskRun, '/F']);
  runSchtasks(['/Run', '/TN', taskName]);

  console.log(JSON.stringify({
    stderrPath,
    stdoutPath,
    commandPath,
    taskName,
    taskRun,
    runnerPath,
    startedAt: new Date().toISOString()
  }, null, 2));
}

function runSchtasks(args) {
  const result = spawnSync('schtasks.exe', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe'
  });
  if (result.status !== 0) {
    throw new Error(`schtasks failed: ${result.stderr || result.stdout}`);
  }
}

function quoteForCmd(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}

function buildRunnerCommandLine({
  nodePath,
  runnerPath,
  runnerArgs,
  stdoutPath,
  stderrPath
}) {
  const commandParts = [
    quoteForCmd(nodePath),
    quoteForCmd(runnerPath),
    ...runnerArgs.map((arg) => quoteRunnerArg(arg)),
    `1>>${quoteForCmd(stdoutPath)}`,
    `2>>${quoteForCmd(stderrPath)}`
  ];
  return commandParts.join(' ');
}

function quoteRunnerArg(value) {
  const text = String(value);
  return /[\s"&|<>]/.test(text) ? quoteForCmd(text) : text;
}

function optionNumberOrNull(value) {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanOption(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  if (value === true || value === 'true' || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === '0') {
    return false;
  }
  return fallback;
}

function formatTaskTime(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
