import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT_REFERENCE_ALLOWLIST = new Set([
  '.gitignore',
  'AGENTS.md',
  'README.md',
  'docs/architecture/deployable-components.md',
  'docs/architecture/file-placement-rules.md',
  'docs/architecture/project-structure-redesign-2026-04-27.md',
  'docs/audits/structure/mixed-agent-skill-inventory-2026-08-16.md',
  'docs/audits/structure/local-artifact-inventory-2026-08-16.md',
  'docs/audits/structure/mixed-agent-structure-acceptance-2026-08-16.md',
  'docs/audits/structure/project-structure-audit-2026-04-27.md',
  'docs/audits/structure/project-structure-inventory-2026-08-16.md',
  'docs/operations/lightweight-request-observability.md',
  'docs/project-management/README.md'
]);

const HISTORICAL_PREFIX_ALLOWLIST = [
  '.codex/',
  '.claude/',
  '.superpowers/',
  'agent/',
  'docs/devlog/',
  'docs/plans/',
  'docs/project-management/frontend-migration/',
  'docs/project-governance/archive/',
  'docs/superpowers/',
  'reports/',
  'task/',
  'tmp/'
];

const SELF_PATHS = new Set([
  'platform/tooling/check-root-artifact-contract.mjs',
  'platform/tooling/root-artifact-contract.test.mjs'
]);

export const DEFAULT_ALLOWLIST = new Set([
  ...ROOT_REFERENCE_ALLOWLIST,
  ...HISTORICAL_PREFIX_ALLOWLIST
]);

const ROOT_TMP_RE = /(?<![\w/])(?:\.\/)?tmp\/(?:[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)?/g;
const ROOT_LOGS_RE = /(?<![\w/])(?:\.\/)?logs\/(?:[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)?/g;
const REPORTS_TMP_RE = /(?:^|[^\w/])reports\/tmp(?:\/(?:[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)?)?(?![\w.-])/g;
const ROOT_SUMMARY_RE = /(?<![\w/])(?:[A-Za-z0-9_.-]+_SUMMARY\.md)/g;

function normalizeMatch(match) {
  return match.replace(/^[^A-Za-z0-9./-]+/, '');
}

function collectMatches(content, regex, kind) {
  const findings = [];
  for (const match of content.matchAll(regex)) {
    const value = normalizeMatch(match[0]);
    findings.push({ kind, value });
  }
  return findings;
}

export function scanText(content, relativePath = '<text>') {
  const findings = [
    ...collectMatches(content, ROOT_TMP_RE, 'root-tmp'),
    ...collectMatches(content, ROOT_LOGS_RE, 'root-logs'),
    ...collectMatches(content, REPORTS_TMP_RE, 'reports-tmp'),
    ...collectMatches(content, ROOT_SUMMARY_RE, 'root-summary')
  ];

  return findings.map((finding) => ({ ...finding, path: relativePath }));
}

export function scanRelativePath(relativePath) {
  if (/^[^/]+_SUMMARY\.md$/.test(relativePath)) {
    return [{ kind: 'root-summary-file', value: relativePath, path: relativePath }];
  }
  return [];
}

export function isAllowlisted(relativePath) {
  return ROOT_REFERENCE_ALLOWLIST.has(relativePath)
    || HISTORICAL_PREFIX_ALLOWLIST.some((prefix) => relativePath.startsWith(prefix))
    || SELF_PATHS.has(relativePath);
}

function trackedFiles(repoRoot) {
  const output = execFileSync(
    'git',
    ['-C', repoRoot, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf8' }
  );
  return output.split('\0').filter(Boolean);
}

export function scanRepository(repoRoot) {
  const findings = [];
  for (const relativePath of trackedFiles(repoRoot)) {
    if (isAllowlisted(relativePath)) continue;
    const absolutePath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(absolutePath)) continue;
    if (!fs.statSync(absolutePath).isFile()) continue;
    findings.push(...scanRelativePath(relativePath));
    const content = fs.readFileSync(absolutePath, 'utf8');
    findings.push(...scanText(content, relativePath));
  }
  return findings;
}

function formatFinding(finding) {
  return `${finding.path}: ${finding.kind} ${finding.value}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const repoRoot = path.resolve(process.argv[2] || path.join(import.meta.dirname, '..', '..'));
  const findings = scanRepository(repoRoot);
  if (findings.length) {
    console.error(findings.map(formatFinding).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('root artifact contract: no unallowlisted references');
  }
}
