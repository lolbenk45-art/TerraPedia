import fs from 'node:fs/promises';
import path from 'node:path';

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatIssueLine(issue) {
  const reason = issue.reason ?? 'unknown';
  const trace = issue.sourceMaintRecordKey ?? issue.sourceFactKey ?? issue.recipeKey ?? 'n/a';
  return `- ${reason} | trace=${trace}`;
}

export function buildRelationAuditMarkdown(summary = {}) {
  const domainSummary = summary.domainSummary ?? {};
  const entityBreakdown = summary.entityBreakdown ?? {};
  const imageBreakdown = summary.imageBreakdown ?? {};
  const bridgeBreakdown = summary.bridgeBreakdown ?? {};
  const unresolvedSamples = ensureArray(summary.unresolvedSamples);
  const lines = [
    '# Relation Audit',
    '',
    `Generated At: ${summary.generatedAt ?? 'unknown'}`,
    '',
    '## Base Entities',
    `- rows: ${domainSummary.base ?? 0}`,
    `- item: ${entityBreakdown.item ?? 0}`,
    `- npc: ${entityBreakdown.npc ?? 0}`,
    `- projectile: ${entityBreakdown.projectile ?? 0}`,
    `- buff: ${entityBreakdown.buff ?? 0}`,
    '',
    '## Images',
    `- rows: ${domainSummary.image ?? 0}`,
    `- item: ${imageBreakdown.item ?? 0}`,
    `- npc: ${imageBreakdown.npc ?? 0}`,
    `- projectile: ${imageBreakdown.projectile ?? 0}`,
    `- buff: ${imageBreakdown.buff ?? 0}`,
    `- maint item image fills: ${bridgeBreakdown.maintItemImageFillRows ?? 0}`,
    `- local item image fallback enabled: ${bridgeBreakdown.localItemImageFallbackEnabled ?? false}`,
    `- local item image fallback rows: ${bridgeBreakdown.localItemImageFallbackRows ?? 0}`,
    '',
    '## Source Bridges',
    `- item zh text override rows: ${bridgeBreakdown.itemTextOverrideRows ?? 0}`,
    '',
    '## Category',
    `- rows: ${domainSummary.category ?? 0}`,
    '',
    '## Recipe',
    `- rows: ${domainSummary.recipe ?? 0}`,
    '',
    '## NPC Source',
    `- rows: ${domainSummary.npc ?? 0}`,
    '',
    '## Buff',
    `- rows: ${domainSummary.buff ?? 0}`,
    '',
    '## Biome',
    `- rows: ${domainSummary.biome ?? 0}`,
    '',
    '## Projectile',
    `- rows: ${domainSummary.projectile ?? 0}`,
    '',
    '## Boss',
    `- rows: ${domainSummary.boss ?? 0}`,
    '',
    '## NPC Series',
    `- rows: ${domainSummary.npcSeries ?? 0}`,
    '',
    '## Unresolved Samples'
  ];

  if (unresolvedSamples.length === 0) {
    lines.push('- none');
  } else {
    for (const issue of unresolvedSamples) {
      lines.push(formatIssueLine(issue));
    }
  }

  return `${lines.join('\n')}\n`;
}

export async function writeRelationReports({ repoRoot, dateTag, summary, issues = [], conflicts = [] }) {
  const reportsDir = path.join(repoRoot, 'reports', 'relation');
  await fs.mkdir(reportsDir, { recursive: true });

  const unresolved = ensureArray(issues).filter((issue) => String(issue.reviewStatus ?? '').includes('unresolved'));
  const auditPayload = {
    ...summary,
    issuesCount: ensureArray(issues).length,
    conflictsCount: ensureArray(conflicts).length,
    unresolvedSamples: unresolved.slice(0, 20)
  };

  const auditJsonPath = path.join(reportsDir, `relation-audit-${dateTag}.json`);
  const auditMdPath = path.join(reportsDir, `relation-audit-${dateTag}.md`);
  const conflictsPath = path.join(reportsDir, `relation-conflicts-${dateTag}.json`);
  const unresolvedPath = path.join(reportsDir, `relation-unresolved-${dateTag}.json`);

  await fs.writeFile(auditJsonPath, JSON.stringify(auditPayload, null, 2));
  await fs.writeFile(auditMdPath, buildRelationAuditMarkdown(auditPayload));
  await fs.writeFile(conflictsPath, JSON.stringify(ensureArray(conflicts), null, 2));
  await fs.writeFile(unresolvedPath, JSON.stringify(unresolved, null, 2));

  return {
    auditJsonPath,
    auditMdPath,
    conflictsPath,
    unresolvedPath
  };
}
