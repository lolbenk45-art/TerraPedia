import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRunnerCliArgs,
  buildTaskRunCommand,
  buildTaskWrapperRunCommand
} from './start-detached-item-page-crawl.mjs';

test('buildRunnerCliArgs forwards detached crawl options', () => {
  assert.deepEqual(buildRunnerCliArgs({
    batchSize: 100,
    concurrency: 1,
    endOffset: 6200,
    maxAttempts: 8,
    onlyChanged: false,
    progressPath: 'data/generated/wiki-sync-progress.latest.json',
    resumeFromProgress: true,
    startOffset: 200,
    withRecipes: true
  }), [
    '--batch-size=100',
    '--concurrency=1',
    '--max-attempts=8',
    '--progress-path=data/generated/wiki-sync-progress.latest.json',
    '--resume-from-progress=true',
    '--only-changed=false',
    '--with-recipes=true',
    '--start-offset=200',
    '--end-offset=6200'
  ]);
});

test('buildTaskRunCommand runs node through cmd with redirected logs', () => {
  const command = buildTaskRunCommand({
    nodePath: 'C:\\Node\\node.exe',
    runnerPath: 'G:\\Repo\\scripts\\data\\fetch\\run-item-page-crawl-batches.mjs',
    runnerArgs: ['--start-offset=200', '--end-offset=6200'],
    stdoutPath: 'G:\\Repo\\reports\\crawler-monitor\\runner.log',
    stderrPath: 'G:\\Repo\\reports\\crawler-monitor\\runner.err.log'
  });

  assert.equal(
    command,
    'cmd.exe /d /s /c ""C:\\Node\\node.exe" "G:\\Repo\\scripts\\data\\fetch\\run-item-page-crawl-batches.mjs" --start-offset=200 --end-offset=6200 1>>"G:\\Repo\\reports\\crawler-monitor\\runner.log" 2>>"G:\\Repo\\reports\\crawler-monitor\\runner.err.log""'
  );
});

test('buildTaskWrapperRunCommand keeps scheduled task command short', () => {
  assert.equal(
    buildTaskWrapperRunCommand('G:\\Repo\\reports\\crawler-monitor\\runner.cmd'),
    'cmd.exe /d /s /c ""G:\\Repo\\reports\\crawler-monitor\\runner.cmd""'
  );
});
