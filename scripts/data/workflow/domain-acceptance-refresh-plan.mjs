#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDomainAcceptanceFreshnessAudit } from './domain-acceptance-freshness-audit.mjs';

const __filename = fileURLToPath(import.meta.url);

export function buildDomainAcceptanceRefreshPlan({
  generatedAt = new Date().toISOString(),
  audit = buildDomainAcceptanceFreshnessAudit({ generatedAt }),
} = {}) {
  const panels = Array.isArray(audit?.panels) ? audit.panels : [];
  const actions = panels
    .filter((panel) => ['missing', 'stale', 'unknown'].includes(panel?.freshnessStatus))
    .map((panel) => ({
      domainId: panel.domainId,
      panelId: panel.panelId,
      freshnessStatus: panel.freshnessStatus,
      reason: panel.freshnessReason ?? `${panel.domainId}/${panel.panelId} evidence is ${panel.freshnessStatus}`,
      command: panel.nextEvidenceCommand,
      commandRisk: panel.commandRisk ?? 'unknown',
      requiresDatabase: panel.requiresDatabase === true,
      writesDatabase: panel.writesDatabase === true,
      status: actionStatus(panel),
      confirmationReason: confirmationReason(panel),
      blockedReason: blockedReason(panel),
      executeMode: 'manual',
    }));
  const blockingReasons = actions
    .filter((action) => action.status === 'blocked')
    .map((action) => action.blockedReason);
  const confirmationReasons = actions
    .filter((action) => action.status === 'needs_confirmation')
    .map((action) => action.confirmationReason);

  return {
    generatedAt,
    auditGeneratedAt: audit?.generatedAt ?? null,
    overallStatus: overallStatus(actions),
    summary: summarizeActions(actions),
    blockingReasons,
    confirmationReasons,
    actions,
  };
}

function summarizeActions(actions) {
  return {
    actionCount: actions.length,
    readyCount: actions.filter((action) => action.status === 'ready').length,
    confirmationCount: actions.filter((action) => action.status === 'needs_confirmation').length,
    blockedCount: actions.filter((action) => action.status === 'blocked').length,
    safeReadOnlyCount: actions.filter((action) => action.commandRisk === 'safe-read-only').length,
    unsafeActionCount: actions.filter((action) => action.commandRisk === 'unsafe').length,
    databaseRequiredCount: actions.filter((action) => action.requiresDatabase === true).length,
    manualOnlyCount: actions.filter((action) => action.executeMode === 'manual').length,
    affectedDomainCount: new Set(actions.map((action) => action.domainId)).size,
  };
}

function actionStatus(panel) {
  if (blockedReason(panel)) {
    return 'blocked';
  }
  if (confirmationReason(panel)) {
    return 'needs_confirmation';
  }
  return 'ready';
}

function blockedReason(panel) {
  if (panel?.commandRisk === 'unsafe') {
    return `${panel.domainId}/${panel.panelId} generator command is unsafe`;
  }
  if (panel?.writesDatabase === true) {
    return `${panel.domainId}/${panel.panelId} generator command writes database`;
  }
  if (!panel?.nextEvidenceCommand) {
    return `${panel.domainId}/${panel.panelId} evidence command is missing`;
  }
  return null;
}

function confirmationReason(panel) {
  if (panel?.commandRisk === 'unknown') {
    return `${panel.domainId}/${panel.panelId} command risk is unknown`;
  }
  if (panel?.freshnessStatus === 'unknown') {
    return `${panel.domainId}/${panel.panelId} evidence is unknown`;
  }
  if (panel?.requiresDatabase === true) {
    return `${panel.domainId}/${panel.panelId} requires local database confirmation`;
  }
  return null;
}

function overallStatus(actions) {
  if (actions.some((action) => action.status === 'blocked')) {
    return 'blocked';
  }
  if (actions.some((action) => action.status === 'needs_confirmation')) {
    return 'needs_confirmation';
  }
  if (actions.some((action) => action.status === 'ready')) {
    return 'ready';
  }
  return 'empty';
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

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const generatedAt = args['generated-at'] ?? new Date().toISOString();
  const audit = args.audit
    ? JSON.parse(fs.readFileSync(args.audit, 'utf8'))
    : buildDomainAcceptanceFreshnessAudit({
        repoRoot: args['repo-root'] ?? process.cwd(),
        generatedAt,
        domainIds: args.domains ?? null,
      });
  const plan = buildDomainAcceptanceRefreshPlan({ generatedAt, audit });
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}

