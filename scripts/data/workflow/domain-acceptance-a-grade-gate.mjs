#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDomainAcceptanceReportManifest } from './domain-acceptance-report-manifest.mjs';
import { buildDomainAcceptanceFreshnessAudit } from './domain-acceptance-freshness-audit.mjs';
import { buildDomainAcceptanceRefreshPlan } from './domain-acceptance-refresh-plan.mjs';
import { buildDomainAcceptanceReportGeneration } from './domain-acceptance-generate-reports.mjs';

const __filename = fileURLToPath(import.meta.url);

export function buildDomainAcceptanceAGradeGate({
  repoRoot = process.cwd(),
  generatedAt = new Date().toISOString(),
  manifest = buildDomainAcceptanceReportManifest(),
  freshnessAudit = buildDomainAcceptanceFreshnessAudit({ repoRoot, manifest, generatedAt }),
  refreshPlan = buildDomainAcceptanceRefreshPlan({ generatedAt, audit: freshnessAudit }),
  generation = buildDomainAcceptanceReportGeneration({ repoRoot, manifest, generatedAt }),
} = {}) {
  const panels = Array.isArray(freshnessAudit?.panels) ? freshnessAudit.panels : [];
  const refreshActions = Array.isArray(refreshPlan?.actions) ? refreshPlan.actions : [];
  const checks = [
    ...manifestChecks(manifest),
    ...freshnessChecks(freshnessAudit, panels),
    ...refreshPlanChecks(refreshPlan, refreshActions),
    ...generationChecks(generation),
  ];
  const blockingReasons = uniqueMessages(checks
    .filter((check) => check.status === 'blocked')
    .map((check) => check.message));
  const warningReasons = uniqueMessages(checks
    .filter((check) => check.status === 'warning')
    .map((check) => check.message));

  return {
    generatedAt,
    gate: 'domain-acceptance-a-grade',
    overallStatus: blockingReasons.length > 0 ? 'blocked' : warningReasons.length > 0 ? 'warning' : 'pass',
    summary: summarize({ freshnessAudit, panels, refreshActions, generation }),
    blockingReasons,
    warningReasons,
    inputs: {
      registryPath: 'scripts/data/workflow/domain-acceptance-registry.json',
      manifestGenerated: Array.isArray(manifest),
      freshnessAuditGenerated: freshnessAudit != null,
      refreshPlanGenerated: refreshPlan != null,
      reportDryRunGenerated: generation != null,
      evidenceCommandsExecuted: false,
      databaseWrites: false,
    },
    domains: buildDomainStatuses({ manifest, panels, checks }),
    checks,
  };
}

function manifestChecks(manifest) {
  const checks = [];
  const seenPanels = new Set();
  for (const entry of manifest) {
    const checkContext = {
      domainId: entry.domainId ?? null,
      panelId: entry.panelId ?? null,
    };
    const key = `${entry.domainId}/${entry.panelId}`;
    if (seenPanels.has(key)) {
      checks.push(blockedCheck('manifest.uniquePanel', `duplicate domain acceptance panel: ${key}`, checkContext));
    }
    seenPanels.add(key);
    if (!entry.managementRoute) {
      checks.push(blockedCheck('manifest.managementRoute', `${entry.domainId} has no management route`, checkContext));
    }
    if (!Array.isArray(entry.backendRefreshStepIds) || entry.backendRefreshStepIds.length === 0) {
      checks.push(blockedCheck('manifest.backendRefreshRoute', `${key} has no backend refresh step route`, checkContext));
    }
    if (!entry.backendRefreshPlanCommand) {
      checks.push(blockedCheck('manifest.backendRefreshPlanCommand', `${key} has no backend refresh plan command`, checkContext));
    }
    if (entry.writesDatabase === true) {
      checks.push(blockedCheck('manifest.databaseWrite', `${key} generator command writes database`, checkContext));
    }
    if (entry.commandRisk === 'unsafe') {
      checks.push(blockedCheck('manifest.commandSafety', `${key} generator command is unsafe`, checkContext));
    }
  }
  return checks;
}

function freshnessChecks(freshnessAudit, panels) {
  const checks = [];
  for (const reason of freshnessAudit?.blockingReasons ?? []) {
    checks.push(blockedCheck('freshness.blocked', reason));
  }
  for (const reason of freshnessAudit?.warningReasons ?? []) {
    checks.push(warningCheck('freshness.warning', reason));
  }
  for (const panel of panels) {
    const key = `${panel.domainId}/${panel.panelId}`;
    const context = { domainId: panel.domainId, panelId: panel.panelId };
    if (!Array.isArray(panel.backendRefreshStepIds) || panel.backendRefreshStepIds.length === 0) {
      checks.push(blockedCheck('freshness.backendRefreshRoute', `${key} has no backend refresh step route`, context));
    }
    if (panel.writesDatabase === true) {
      checks.push(blockedCheck('freshness.databaseWrite', `${key} generator command writes database`, context));
    }
    if (panel.commandRisk === 'unsafe') {
      checks.push(blockedCheck('freshness.commandSafety', `${key} generator command is unsafe`, context));
    }
    if (['missing', 'unknown'].includes(panel.freshnessStatus) && panel.blockingBeforePublic === true) {
      checks.push(blockedCheck('freshness.publicEvidenceUnavailable', `${key} public-blocking evidence freshness is ${panel.freshnessStatus}`, context));
    } else if (['stale', 'missing', 'unknown'].includes(panel.freshnessStatus)) {
      checks.push(warningCheck('freshness.state', `${key} evidence is ${panel.freshnessStatus}`, context));
    }
    if (panel.publicExposure === 'planned-public' && !hasPublicRoute(panel.publicRoute)) {
      checks.push(warningCheck('public.plannedRouteMissing', `${key} is planned-public but has no public route`, context));
    }
    if (requiresPublicRoute(panel) && !hasPublicRoute(panel.publicRoute)) {
      checks.push(warningCheck(
        'public.routeMissing',
        `${key} is blocking before public consumption but has no public route`,
        context,
      ));
    }
  }
  return checks;
}

function refreshPlanChecks(refreshPlan, refreshActions) {
  const checks = [];
  for (const reason of refreshPlan?.blockingReasons ?? []) {
    checks.push(blockedCheck('refreshPlan.blocked', `refresh plan is blocked: ${reason}`));
  }
  for (const reason of refreshPlan?.confirmationReasons ?? []) {
    checks.push(warningCheck('refreshPlan.confirmation', `refresh plan needs confirmation: ${reason}`));
  }
  for (const action of refreshActions) {
    const key = `${action.domainId}/${action.panelId}`;
    const context = { domainId: action.domainId, panelId: action.panelId };
    if (action.executeMode !== 'manual') {
      checks.push(blockedCheck('refreshPlan.manualOnly', `${key} refresh action is not manual-only`, context));
    }
    if (action.executionPolicy !== 'plan-only') {
      checks.push(blockedCheck('refreshPlan.planOnly', `${key} refresh action is not plan-only`, context));
    }
    if (!Array.isArray(action.backendRefreshStepIds) || action.backendRefreshStepIds.length === 0) {
      checks.push(blockedCheck('refreshPlan.backendRefreshRoute', `${key} has no backend refresh step route`, context));
    }
    if (action.status === 'ready') {
      checks.push(warningCheck('refreshPlan.ready', `${key} has a manual refresh action ready`, context));
    }
  }
  return checks;
}

function generationChecks(generation) {
  const summary = generation?.summary ?? {};
  const checks = [];
  if (summary.writtenCount > 0 || generation?.write === true) {
    checks.push(blockedCheck('generation.dryRunOnly', 'domain acceptance generation wrote files during A-grade gate'));
  }
  if (summary.blockedCount > 0) {
    checks.push(blockedCheck('generation.blocked', `domain acceptance generation has ${summary.blockedCount} blocked panels`));
  }
  if (summary.warningCount > 0) {
    checks.push(warningCheck('generation.warning', `domain acceptance generation has ${summary.warningCount} warning panels`));
  }
  if (summary.missingCount > 0) {
    checks.push(warningCheck('generation.missing', `domain acceptance generation has ${summary.missingCount} missing panels`));
  }
  return checks;
}

function summarize({ freshnessAudit, panels, refreshActions, generation }) {
  const generationSummary = generation?.summary ?? {};
  const freshnessSummary = freshnessAudit?.summary ?? {};
  return {
    panelCount: Number(freshnessSummary.panelCount ?? generationSummary.panelCount ?? panels.length),
    domainCount: Number(freshnessSummary.domainCount ?? new Set(panels.map((panel) => panel.domainId)).size),
    generatedPassCount: Number(generationSummary.passCount ?? 0),
    generatedWarningCount: Number(generationSummary.warningCount ?? 0),
    generatedBlockedCount: Number(generationSummary.blockedCount ?? 0),
    freshCount: Number(freshnessSummary.freshCount ?? panels.filter((panel) => panel.freshnessStatus === 'fresh').length),
    staleCount: Number(freshnessSummary.staleCount ?? panels.filter((panel) => panel.freshnessStatus === 'stale').length),
    missingCount: Number(freshnessSummary.missingCount ?? panels.filter((panel) => panel.freshnessStatus === 'missing').length),
    unknownCount: Number(freshnessSummary.unknownCount ?? panels.filter((panel) => panel.freshnessStatus === 'unknown').length),
    maintenanceRoutedCount: panels.filter((panel) => Array.isArray(panel.backendRefreshStepIds) && panel.backendRefreshStepIds.length > 0).length,
    autoMaintenanceAllowedCount: panels.filter((panel) => panel.autoMaintenanceAllowed === true).length,
    blockingBeforePublicCount: panels.filter((panel) => panel.blockingBeforePublic === true).length,
    acceptedWarningActiveCount: panels.filter((panel) => panel.acceptedWarningActive === true).length,
    publicRouteMissingCount: panels.filter((panel) => requiresPublicRoute(panel) && !hasPublicRoute(panel.publicRoute)).length,
    refreshActionCount: refreshActions.length,
    refreshReadyCount: refreshActions.filter((action) => action.status === 'ready').length,
    refreshConfirmationCount: refreshActions.filter((action) => action.status === 'needs_confirmation').length,
    refreshBlockedCount: refreshActions.filter((action) => action.status === 'blocked').length,
  };
}

function buildDomainStatuses({ manifest, panels, checks }) {
  const panelByKey = new Map(panels.map((panel) => [`${panel.domainId}/${panel.panelId}`, panel]));
  const domains = [];
  const manifestDomains = new Map();
  for (const entry of manifest) {
    if (!manifestDomains.has(entry.domainId)) {
      manifestDomains.set(entry.domainId, {
        domainId: entry.domainId,
        tier: entry.tier,
        managementRoute: entry.managementRoute ?? null,
        publicExposure: entry.publicExposure ?? null,
        publicRoute: entry.publicRoute ?? null,
        requiredPanels: [],
      });
    }
    manifestDomains.get(entry.domainId).requiredPanels.push(entry.panelId);
  }
  for (const domain of manifestDomains.values()) {
    const panelStatuses = domain.requiredPanels.map((panelId) => {
      const panel = panelByKey.get(`${domain.domainId}/${panelId}`);
      return {
        panelId,
        freshnessStatus: panel?.freshnessStatus ?? 'unknown',
        acceptedWarningActive: panel?.acceptedWarningActive === true,
        acceptedWarningStatus: panel?.acceptedWarningStatus ?? 'none',
        acceptedWarning: panel?.acceptedWarning ?? null,
        backendRefreshStepIds: panel?.backendRefreshStepIds ?? [],
      };
    });
    const domainChecks = checks.filter((check) => check.domainId === domain.domainId);
    const blockingReasons = domainChecks.filter((check) => check.status === 'blocked').map((check) => check.message);
    const warningReasons = domainChecks.filter((check) => check.status === 'warning').map((check) => check.message);
    const publicGate = buildPublicGate(domain, domainChecks);
    const acceptedWarningPanels = panelStatuses
      .filter((panel) => panel.acceptedWarningActive === true)
      .map((panel) => panel.panelId);
    domains.push({
      ...domain,
      aGradeStatus: blockingReasons.length > 0 ? 'blocked' : warningReasons.length > 0 ? 'warning' : 'pass',
      publicGateStatus: publicGate.status,
      publicGateReason: publicGate.reason,
      routeReady: publicGate.status === 'public_route_configured',
      acceptedWarningPanels,
      readinessOnlyAcceptedWarningActive: acceptedWarningPanels.length > 0,
      panelStatuses,
      blockingReasons,
      warningReasons,
    });
  }
  return domains;
}

function buildPublicGate(domain, domainChecks) {
  if (domain.publicExposure === 'admin-only') {
    return {
      status: 'admin_only',
      reason: null,
    };
  }
  if (domain.publicExposure === 'planned-public') {
    return {
      status: 'planned_public_no_route',
      reason: 'public route is planned but not yet configured',
    };
  }
  const routeMissing = domainChecks.find((check) => check.id === 'public.routeMissing');
  if (routeMissing) {
    return {
      status: 'public_route_missing',
      reason: routeMissing.message,
    };
  }
  if (domain.publicExposure === 'public' && hasPublicRoute(domain.publicRoute)) {
    return {
      status: 'public_route_configured',
      reason: null,
    };
  }
  return {
    status: 'public_route_missing',
    reason: `${domain.domainId} has public exposure but no public route`,
  };
}

function requiresPublicRoute(panel) {
  return panel?.publicExposure === 'public'
    && panel.blockingBeforePublic === true
    && panel.chainStage === 'public';
}

function hasPublicRoute(publicRoute) {
  return typeof publicRoute === 'string' && publicRoute.trim() !== '';
}

function blockedCheck(id, message, context = {}) {
  return check(id, 'blocked', message, context);
}

function warningCheck(id, message, context = {}) {
  return check(id, 'warning', message, context);
}

function check(id, status, message, context = {}) {
  return {
    id,
    status,
    message,
    domainId: context.domainId ?? null,
    panelId: context.panelId ?? null,
  };
}

function uniqueMessages(messages) {
  return [...new Set(messages.filter(Boolean))];
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
  const gate = buildDomainAcceptanceAGradeGate({
    repoRoot: args['repo-root'] ?? process.cwd(),
    generatedAt,
  });
  process.stdout.write(`${JSON.stringify(gate, null, 2)}\n`);
  if (args['fail-on-blocked'] === 'true' && gate.overallStatus === 'blocked') {
    process.exitCode = 1;
  }
  if (args['fail-on-warning'] === 'true' && gate.overallStatus === 'warning') {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
