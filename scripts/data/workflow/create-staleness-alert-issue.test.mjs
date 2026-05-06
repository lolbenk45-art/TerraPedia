import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { buildStalenessAlertIssue } from './create-staleness-alert-issue.mjs';

const execFileAsync = promisify(execFile);

test('buildStalenessAlertIssue creates markdown body and appends history when blocking findings exist', async () => {
  const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'terrapedia-staleness-issue-'));
  const historyPath = path.join(tempDir, 'staleness-history.jsonl');
  const bodyPath = path.join(tempDir, 'issue-body.md');

  try {
    const result = await buildStalenessAlertIssue({
      historyPath,
      bodyPath,
      generatedAt: '2026-05-06T00:00:00Z',
      audit: {
        panels: [
          {
            domainId: 'bosses',
            panelId: 'publicReadiness',
            freshnessStatus: 'missing',
            freshnessReason: 'No matching domain acceptance report evidence found.',
            blockingBeforePublic: true,
          },
        ],
      },
      refreshPlan: {
        overallStatus: 'blocked',
        actions: [
          {
            domainId: 'bosses',
            panelId: 'publicReadiness',
            status: 'blocked',
            blockedReason: 'bosses/publicReadiness evidence command is missing',
          },
        ],
      },
      complianceReports: [
        {
          domainId: 'support.recipe',
          panelId: 'b1ExemptionCompliance',
          status: 'blocked',
          blockingReasons: ['B1 exemption data/generated/recipe-material-reference.json is missing deadline.'],
        },
      ],
    });

    assert.equal(result.shouldCreateIssue, true);
    assert.match(result.title, /blocking findings/i);
    assert.equal(fs.existsSync(bodyPath), true);
    assert.equal(fs.existsSync(historyPath), true);

    const body = await fsPromises.readFile(bodyPath, 'utf8');
    assert.match(body, /bosses\/publicReadiness/);
    assert.match(body, /support\.recipe\/b1ExemptionCompliance/);

    const historyLines = (await fsPromises.readFile(historyPath, 'utf8')).trim().split('\n');
    assert.equal(historyLines.length, 1);
    const historyEntry = JSON.parse(historyLines[0]);
    assert.equal(historyEntry.shouldCreateIssue, true);
    assert.equal(historyEntry.blockingPanelCount, 1);
    assert.equal(historyEntry.blockingComplianceCount, 1);
  } finally {
    await fsPromises.rm(tempDir, { recursive: true, force: true });
  }
});

test('buildStalenessAlertIssue skips issue creation for warning-only inputs but still writes history', async () => {
  const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'terrapedia-staleness-issue-'));
  const historyPath = path.join(tempDir, 'staleness-history.jsonl');
  const bodyPath = path.join(tempDir, 'issue-body.md');

  try {
    const result = await buildStalenessAlertIssue({
      historyPath,
      bodyPath,
      generatedAt: '2026-05-06T00:00:00Z',
      audit: {
        panels: [
          {
            domainId: 'buffs',
            panelId: 'relationReadiness',
            freshnessStatus: 'stale',
            freshnessReason: 'Evidence is older than 24 hours.',
            blockingBeforePublic: false,
          },
        ],
      },
      refreshPlan: {
        overallStatus: 'needs_confirmation',
        actions: [
          {
            domainId: 'buffs',
            panelId: 'relationReadiness',
            status: 'needs_confirmation',
            confirmationReason: 'buffs/relationReadiness requires local database confirmation',
          },
        ],
      },
      complianceReports: [],
    });

    assert.equal(result.shouldCreateIssue, false);
    assert.equal(fs.existsSync(bodyPath), true);
    const historyEntry = JSON.parse((await fsPromises.readFile(historyPath, 'utf8')).trim());
    assert.equal(historyEntry.shouldCreateIssue, false);
  } finally {
    await fsPromises.rm(tempDir, { recursive: true, force: true });
  }
});

test('CLI writes issue body/history files and prints summary JSON', async () => {
  const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'terrapedia-staleness-issue-'));
  const auditPath = path.join(tempDir, 'audit.json');
  const planPath = path.join(tempDir, 'plan.json');
  const compliancePath = path.join(tempDir, 'compliance.json');
  const bodyPath = path.join(tempDir, 'issue.md');
  const historyPath = path.join(tempDir, 'history.jsonl');

  await fsPromises.writeFile(auditPath, JSON.stringify({
    panels: [
      {
        domainId: 'bosses',
        panelId: 'publicReadiness',
        freshnessStatus: 'unknown',
        freshnessReason: 'Domain acceptance report JSON is unreadable or invalid.',
        blockingBeforePublic: true,
      },
    ],
  }), 'utf8');
  await fsPromises.writeFile(planPath, JSON.stringify({ actions: [] }), 'utf8');
  await fsPromises.writeFile(compliancePath, JSON.stringify({
    domainId: 'support.recipe',
    panelId: 'b1ExemptionCompliance',
    status: 'warning',
    warningReasons: ['deadline approaching'],
  }), 'utf8');

  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [
        'scripts/data/workflow/create-staleness-alert-issue.mjs',
        `--audit=${auditPath}`,
        `--plan=${planPath}`,
        `--compliance-report=${compliancePath}`,
        `--body-path=${bodyPath}`,
        `--history-path=${historyPath}`,
        '--generated-at=2026-05-06T00:00:00Z',
      ],
      { cwd: process.cwd() },
    );

    assert.equal(stderr, '');
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.shouldCreateIssue, true);
    assert.equal(parsed.bodyPath, bodyPath);
    assert.equal(parsed.historyPath, historyPath);
  } finally {
    await fsPromises.rm(tempDir, { recursive: true, force: true });
  }
});
