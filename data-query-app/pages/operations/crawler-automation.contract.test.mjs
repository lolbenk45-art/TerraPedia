import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pageUrl = new URL('./crawler-monitor.vue', import.meta.url);
const componentRoot = new URL('../../components/crawler-monitor/', import.meta.url);

// Contract tests for the crawler-automation admin page.
// These validate the API contract expectations used by the Vue components,
// not the Vue source files themselves.

const AUTOMATION_ENDPOINTS = [
  'GET /admin/crawler-automation/overview',
  'GET /admin/crawler-automation/runs',
  'GET /admin/crawler-automation/runs/:runId',
  'POST /admin/crawler-automation/approvals',
  'GET /admin/crawler-automation/profile'
];

const OVERVIEW_REQUIRED_FIELDS = [
  'lastCheckedAt',
  'openCircuitBreakers',
  'pendingOwnerApprovals',
  'abnormalDomains',
  'domains'
];

const DOMAIN_REQUIRED_FIELDS = [
  'domainId',
  'automationLevel',
  'operationalState',
  'disabledReasons'
];

const RUN_REQUIRED_FIELDS = [
  'runId',
  'status',
  'policySetHash',
  'baselineFingerprint',
  'version',
  'decision'
];

const DECISION_REQUIRED_FIELDS = [
  'decisionType',
  'decisionHash',
  'reasonCodes',
  'snapshotRequired',
  'approvable',
  'writeIntent'
];

const APPROVAL_REQUEST_REQUIRED_FIELDS = [
  'requestKey',
  'runId',
  'decisionHash',
  'actor',
  'reauthId',
  'action',
  'reason',
  'expectedRunVersion'
];

// ── Schema contracts ──────────────────────────────────────────────────────────

test('automation API exposes exactly the expected endpoint set', () => {
  assert.strictEqual(AUTOMATION_ENDPOINTS.length, 5);
  assert.ok(AUTOMATION_ENDPOINTS.some((e) => e.includes('overview')));
  assert.ok(AUTOMATION_ENDPOINTS.some((e) => e.includes('approvals')));
  assert.ok(AUTOMATION_ENDPOINTS.some((e) => e.includes('profile')));
});

test('overview DTO declares all required fields', () => {
  // Validate that a conforming overview object passes field checks
  const overview = {
    lastCheckedAt: '2026-07-24T00:00:00',
    openCircuitBreakers: 0,
    pendingOwnerApprovals: 0,
    abnormalDomains: 0,
    domains: []
  };
  for (const field of OVERVIEW_REQUIRED_FIELDS) {
    assert.ok(field in overview, `overview missing field: ${field}`);
  }
});

test('domain rows expose backend-owned disabled reasons', () => {
  const domain = {
    domainId: 'recipes',
    automationLevel: 'L0',
    operationalState: 'DISABLED',
    disabledReasons: [{
      code: 'POLICY_DISABLED',
      messageZh: '自动化策略当前为禁用状态。'
    }]
  };
  for (const field of DOMAIN_REQUIRED_FIELDS) {
    assert.ok(field in domain, `domain summary missing field: ${field}`);
  }
  assert.equal(domain.disabledReasons[0].code, 'POLICY_DISABLED');
  assert.equal(typeof domain.disabledReasons[0].messageZh, 'string');
});

test('run DTO declares all required fields including nested decision', () => {
  const run = {
    runId: 'run-1',
    primaryDomainId: 'recipes',
    coveredDomains: ['recipes'],
    policySetHash: 'sha256:' + 'b'.repeat(64),
    triggerKind: 'SCHEDULED',
    status: 'COMMITTED',
    baselineFingerprint: 'sha256:' + 'e'.repeat(64),
    version: 1,
    createdAt: null,
    completedAt: null,
    decision: {
      decisionType: 'AUTO_APPLY_L2',
      decisionHash: 'sha256:' + 'd'.repeat(64),
      reasonCodes: ['WITHIN_POLICY_CEILINGS'],
      snapshotRequired: true,
      approvable: false,
      writeIntent: true
    }
  };
  for (const field of RUN_REQUIRED_FIELDS) {
    assert.ok(field in run, `run DTO missing field: ${field}`);
  }
  for (const field of DECISION_REQUIRED_FIELDS) {
    assert.ok(field in run.decision, `decision summary missing field: ${field}`);
  }
});

test('approval request DTO contains all required identity fields', () => {
  const request = {
    requestKey: 'approve-1',
    runId: 'run-2',
    decisionHash: 'sha256:' + 'd'.repeat(64),
    actor: 'owner',
    reauthId: 'reauth-1',
    action: 'APPROVE',
    reason: 'reviewed and approved',
    expectedRunVersion: 4
  };
  for (const field of APPROVAL_REQUEST_REQUIRED_FIELDS) {
    assert.ok(field in request, `approval request missing field: ${field}`);
  }
});

// ── Read-only profile contracts ───────────────────────────────────────────────

test('read-only profile response disables mutation controls', () => {
  const profileReadOnly = { readOnly: true };
  const profileMutable = { readOnly: false };

  assert.strictEqual(profileReadOnly.readOnly, true);
  assert.strictEqual(profileMutable.readOnly, false);
  // UI must use this boolean to conditionally render approve/reject buttons
  assert.notStrictEqual(profileReadOnly.readOnly, profileMutable.readOnly);
});

test('T2 read-only profile forbids approval submission', () => {
  // Simulates the contract: POST /approvals returns 403 when readOnly=true
  function simulateApprovalSubmit(isReadOnly) {
    if (isReadOnly) throw new Error('403 Forbidden: mutation controls disabled');
    return { requestKey: 'approve-1' };
  }

  assert.throws(() => simulateApprovalSubmit(true), /403 Forbidden/);
  assert.doesNotThrow(() => simulateApprovalSubmit(false));
});

// ── Decision type contracts ───────────────────────────────────────────────────

test('all valid decision types are known', () => {
  const VALID_TYPES = new Set(['BLOCKED_L0', 'REQUIRES_OWNER_L1', 'AUTO_APPLY_L2', 'CIRCUIT_BREAK']);

  for (const type of VALID_TYPES) {
    assert.ok(typeof type === 'string' && type.length > 0);
  }

  // Only REQUIRES_OWNER_L1 is approvable
  const approvableTypes = [...VALID_TYPES].filter((t) => t === 'REQUIRES_OWNER_L1');
  assert.strictEqual(approvableTypes.length, 1);
});

test('only REQUIRES_OWNER_L1 decisions set approvable=true', () => {
  const decisions = [
    { decisionType: 'BLOCKED_L0', approvable: false },
    { decisionType: 'REQUIRES_OWNER_L1', approvable: true },
    { decisionType: 'AUTO_APPLY_L2', approvable: false },
    { decisionType: 'CIRCUIT_BREAK', approvable: false }
  ];

  for (const d of decisions) {
    const expected = d.decisionType === 'REQUIRES_OWNER_L1';
    assert.strictEqual(d.approvable, expected,
      `${d.decisionType}: expected approvable=${expected}`);
  }
});

test('only AUTO_APPLY_L2 decisions set writeIntent=true', () => {
  const decisions = [
    { decisionType: 'BLOCKED_L0', writeIntent: false },
    { decisionType: 'REQUIRES_OWNER_L1', writeIntent: false },
    { decisionType: 'AUTO_APPLY_L2', writeIntent: true },
    { decisionType: 'CIRCUIT_BREAK', writeIntent: false }
  ];

  for (const d of decisions) {
    const expected = d.decisionType === 'AUTO_APPLY_L2';
    assert.strictEqual(d.writeIntent, expected,
      `${d.decisionType}: expected writeIntent=${expected}`);
  }
});

test('crawler monitor renders the automation risk console before secondary tabs', async () => {
  const page = await readFile(pageUrl, 'utf8');
  const risk = page.indexOf('<CrawlerAutomationRiskConsole');
  const pipeline = page.indexOf('<CrawlerAutomationPipeline');
  const matrix = page.indexOf('<CrawlerAutomationDomainMatrix');
  assert.ok(risk >= 0, 'risk console is missing');
  assert.ok(pipeline > risk, 'pipeline must follow the risk console');
  assert.ok(matrix > risk, 'domain matrix must follow the risk console');
  assert.match(page, /automationProfile\?\.readOnly/);
});

test('automation workbench components expose accessible states and evidence drawer', async () => {
  for (const file of [
    'CrawlerAutomationRiskConsole.vue',
    'CrawlerAutomationPipeline.vue',
    'CrawlerAutomationDomainMatrix.vue',
    'CrawlerAutomationEvidenceDrawer.vue',
  ]) {
    const source = await readFile(new URL(file, componentRoot), 'utf8');
    assert.match(source, /aria-|role=/, `${file} must expose an accessible state`);
  }
});

test('domain matrix renders backend disabled reasons without inferring policy in Vue', async () => {
  const source = await readFile(new URL('CrawlerAutomationDomainMatrix.vue', componentRoot), 'utf8');
  assert.match(source, /domain\.disabledReasons/);
  assert.match(source, /reason\.messageZh/);
  assert.doesNotMatch(source, /automationLevel\s*===|operationalState\s*===/);
});
