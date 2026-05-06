import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildApplyPlan,
  loadConfirmedCandidatesPayload,
  parseArgs,
} from './apply-reresolve-results.mjs';

test('parseArgs defaults apply-reresolve-results to dry-run with no candidate file', () => {
  assert.deepEqual(parseArgs([]), {
    relationDatabase: 'terria_v1_relation',
    apply: false,
    generatedAt: null,
    confirmedCandidatesPath: null,
  });
});

test('loadConfirmedCandidatesPayload fails closed without explicit manual confirmation and writer clearance', () => {
  assert.throws(
    () => loadConfirmedCandidatesPayload({
      candidates: [],
    }),
    /manualConfirmation\.confirmed=true/,
  );

  assert.throws(
    () => loadConfirmedCandidatesPayload({
      manualConfirmation: {
        confirmed: true,
        confirmedBy: 'reviewer',
        confirmedAt: '2026-05-06T12:00:00Z',
      },
      candidates: [],
    }),
    /activeWriterCheck\.confirmedClear=true/,
  );
});

test('buildApplyPlan stays dry-run by default and only stages approved manual confirmations', () => {
  const confirmed = loadConfirmedCandidatesPayload({
    sourceReportPath: 'reports/relation/reresolve-candidates-2026-05-06.json',
    manualConfirmation: {
      confirmed: true,
      confirmedBy: 'reviewer',
      confirmedAt: '2026-05-06T12:00:00Z',
    },
    activeWriterCheck: {
      confirmedClear: true,
      checkedBy: 'reviewer',
      checkedAt: '2026-05-06T11:55:00Z',
    },
    candidates: [
      {
        auditId: 'audit-1',
        approved: true,
        proposedMatch: {
          npcSourceId: 17,
          npcInternalName: 'Merchant',
          npcName: 'Merchant',
        },
        confidence: 'high',
        evidence: {
          matchBasis: 'source_ref_exact',
        },
      },
      {
        auditId: 'audit-2',
        approved: false,
        proposedMatch: {
          npcSourceId: 18,
          npcInternalName: 'Nurse',
          npcName: 'Nurse',
        },
        confidence: 'low',
        evidence: {
          matchBasis: 'source_ref_fuzzy',
        },
      },
    ],
  });

  const plan = buildApplyPlan({
    apply: false,
    generatedAt: '2026-05-06T12:30:00Z',
    confirmedCandidates: confirmed,
    resolvedAtColumnPresent: false,
  });

  assert.equal(plan.apply, false);
  assert.equal(plan.summary.approvedCandidateCount, 1);
  assert.equal(plan.summary.skippedCandidateCount, 1);
  assert.equal(plan.summary.requiresManualConfirmation, true);
  assert.equal(plan.summary.resolvedAtColumnPresent, false);
  assert.equal(plan.updates.length, 1);
  assert.deepEqual(plan.updates[0], {
    auditId: 'audit-1',
    nextAuditStatus: 'resolved_manual_confirmed',
    nextReasonCode: 'resolved_manual_confirmed',
    candidateNpcInternalName: 'Merchant',
    candidateNpcSourceId: 17,
    resolvedAt: '2026-05-06T12:30:00Z',
    manualConfirmation: {
      confirmedBy: 'reviewer',
      confirmedAt: '2026-05-06T12:00:00Z',
    },
    activeWriterCheck: {
      checkedBy: 'reviewer',
      checkedAt: '2026-05-06T11:55:00Z',
    },
    evidence: {
      matchBasis: 'source_ref_exact',
      appliedByScript: 'apply-reresolve-results',
      resolvedAt: '2026-05-06T12:30:00Z',
    },
  });
});

test('buildApplyPlan refuses apply mode without confirmed candidates', () => {
  assert.throws(
    () => buildApplyPlan({
      apply: true,
      generatedAt: '2026-05-06T12:30:00Z',
      confirmedCandidates: null,
      resolvedAtColumnPresent: false,
    }),
    /requires --confirmed-candidates with explicit manual confirmation/,
  );
});
