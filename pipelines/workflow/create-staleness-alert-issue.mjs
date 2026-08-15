#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);

export async function buildStalenessAlertIssue({
  generatedAt = new Date().toISOString(),
  audit,
  refreshPlan,
  complianceReports = [],
  historyPath,
  bodyPath,
} = {}) {
  const blockingPanels = collectBlockingPanels(audit);
  const blockedActions = collectBlockedActions(refreshPlan);
  const blockingCompliance = collectBlockingCompliance(complianceReports);
  const shouldCreateIssue = blockingPanels.length > 0 || blockedActions.length > 0 || blockingCompliance.length > 0;
  const title = `Scheduled staleness alert: ${shouldCreateIssue ? 'blocking findings' : 'warning-only findings'} (${generatedAt.slice(0, 10)})`;
  const body = renderIssueBody({
    generatedAt,
    blockingPanels,
    blockedActions,
    blockingCompliance,
    audit,
    refreshPlan,
    complianceReports,
  });
  const historyEntry = {
    generatedAt,
    shouldCreateIssue,
    blockingPanelCount: blockingPanels.length,
    blockedActionCount: blockedActions.length,
    blockingComplianceCount: blockingCompliance.length,
    warningPanelCount: Array.isArray(audit?.panels)
      ? audit.panels.filter((panel) => ['stale', 'missing', 'unknown'].includes(panel?.freshnessStatus)).length
      : 0,
  };

  if (bodyPath) {
    fs.mkdirSync(path.dirname(bodyPath), { recursive: true });
    fs.writeFileSync(bodyPath, body, 'utf8');
  }
  if (historyPath) {
    fs.mkdirSync(path.dirname(historyPath), { recursive: true });
    fs.appendFileSync(historyPath, `${JSON.stringify(historyEntry)}\n`, 'utf8');
  }

  return {
    generatedAt,
    shouldCreateIssue,
    title,
    bodyPath: bodyPath ?? null,
    historyPath: historyPath ?? null,
    historyEntry,
  };
}

function collectBlockingPanels(audit) {
  return Array.isArray(audit?.panels)
    ? audit.panels.filter((panel) => panel?.blockingBeforePublic === true && ['missing', 'unknown'].includes(panel?.freshnessStatus))
    : [];
}

function collectBlockedActions(refreshPlan) {
  return Array.isArray(refreshPlan?.actions)
    ? refreshPlan.actions.filter((action) => action?.status === 'blocked')
    : [];
}

function collectBlockingCompliance(complianceReports) {
  return normalizeComplianceReports(complianceReports)
    .filter((report) => report?.status === 'blocked');
}

function normalizeComplianceReports(complianceReports) {
  if (!complianceReports) {
    return [];
  }
  return Array.isArray(complianceReports) ? complianceReports : [complianceReports];
}

function renderIssueBody({
  generatedAt,
  blockingPanels,
  blockedActions,
  blockingCompliance,
  audit,
  refreshPlan,
  complianceReports,
}) {
  const lines = [
    '# Scheduled Staleness Monitor',
    '',
    `Generated at: ${generatedAt}`,
    '',
    `Issue required: ${blockingPanels.length > 0 || blockedActions.length > 0 || blockingCompliance.length > 0 ? 'yes' : 'no'}`,
    '',
    '## Blocking freshness panels',
    '',
  ];

  if (blockingPanels.length === 0) {
    lines.push('- none');
  } else {
    for (const panel of blockingPanels) {
      lines.push(`- ${panel.domainId}/${panel.panelId}: ${panel.freshnessStatus} - ${panel.freshnessReason ?? 'no reason provided'}`);
    }
  }

  lines.push('', '## Blocked refresh-plan actions', '');
  if (blockedActions.length === 0) {
    lines.push('- none');
  } else {
    for (const action of blockedActions) {
      lines.push(`- ${action.domainId}/${action.panelId}: ${action.blockedReason ?? 'blocked'}`);
    }
  }

  lines.push('', '## Blocking B1 exemption compliance', '');
  if (blockingCompliance.length === 0) {
    lines.push('- none');
  } else {
    for (const report of blockingCompliance) {
      for (const reason of report.blockingReasons ?? []) {
        lines.push(`- ${report.domainId}/${report.panelId}: ${reason}`);
      }
    }
  }

  lines.push('', '## Warning summary', '');
  lines.push(`- audit overallStatus: ${audit?.overallStatus ?? 'unknown'}`);
  lines.push(`- refresh plan overallStatus: ${refreshPlan?.overallStatus ?? 'unknown'}`);
  lines.push(`- compliance reports: ${normalizeComplianceReports(complianceReports).length}`);
  return `${lines.join('\n')}\n`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const arg of argv) {
    const match = String(arg).match(/^--([^=]+)=(.*)$/);
    if (match) {
      args[match[1]] = match[2];
    }
  }
  return args;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = await buildStalenessAlertIssue({
    generatedAt: args['generated-at'] ?? new Date().toISOString(),
    audit: args.audit ? readJson(args.audit) : null,
    refreshPlan: args.plan ? readJson(args.plan) : null,
    complianceReports: args['compliance-report']
      ? String(args['compliance-report'])
        .split(',')
        .filter(Boolean)
        .map((entry) => readJson(entry))
      : [],
    historyPath: args['history-path'] ?? null,
    bodyPath: args['body-path'] ?? null,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  await main();
}
