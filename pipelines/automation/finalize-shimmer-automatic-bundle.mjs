import { computePolicyHash } from './bootstrap-automation-policy.mjs';
import { loadTargetFingerprint } from '../import/import-wiki-shimmer-to-db.mjs';
import { buildSupplementaryL1Bundle, validateSupplementaryL1Bundle } from './supplementary-domain-l1-contract.mjs';
import { buildShimmerPartitionBundle, SHIMMER_PARTITION_SCOPES } from './shimmer-partition-contract.mjs';
import { assertShimmerSixScopePolicy } from './shimmer-policy-scope-transition.mjs';
import { readCurrentSupplementaryContext } from './run-supplementary-domain-l1-operation.mjs';
import { acquireShimmerPartitionFences } from './run-governed-l1-operation.mjs';

/** Only a persisted, Owner-approved six-scope policy can materialize a preview.
 * Policy registration must independently verify its scope-transition approvals.
 * Publish the immutable bundle before committing any acquired fences.
 */
export async function finalizeShimmerAutomaticBundle({ connection, preview, activation, repoRoot, publishBundle }) {
  validateSupplementaryL1Bundle(preview);
  if (preview.domainId !== 'shimmer' || preview.previewOnly !== true
      || preview.executionMode !== 'ACTIVATION_GATED_AUTO' || typeof publishBundle !== 'function') {
    throw new Error('Shimmer finalization requires a read-only automatic preview and immutable publisher');
  }
  let bundle;
  let approvedBy;
  await acquireShimmerPartitionFences(connection, {
    environmentId: preview.baseline.environmentId,
    runId: preview.runId,
    generations: preview.baseline.generations,
    beforeAcquire: async () => {
      const config = connection.config ?? {};
      if (!config.host || !config.port || config.database !== 'terria_v1_local') {
        throw new Error('Shimmer finalization requires the actual database connection target');
      }
      const target = await loadTargetFingerprint(connection, config);
      if (!target.serverUuid || computePolicyHash(target) !== preview.importPlan.targetFingerprintSha256) {
        throw new Error('Shimmer finalization target server fingerprint drifted');
      }
      const current = await readCurrentSupplementaryContext(connection, {
        bundle: preview, environmentId: preview.baseline.environmentId, repoRoot, lock: true,
      });
      assertShimmerSixScopePolicy(current);
      if (current.ownerStatus !== 'ACTIVE' || current.ownerUsername !== activation.actor
          || current.approvedBy !== current.ownerUsername) {
        throw new Error('Shimmer finalization requires the persisted policy approval of the active Owner');
      }
      if (current.policyVersion !== preview.policy.policyVersion || current.policyHash !== preview.policy.policyHash
          || current.policySetHash !== preview.policy.policySetHash || current.policySetHash !== activation.policySetHash
          || current.baselineFingerprint !== preview.baselineFingerprint) {
        throw new Error('Shimmer finalization policy or baseline drifted after preview');
      }
      const [rows] = await connection.query(
        'SELECT decision_identity AS decisionIdentity, packet_hash AS packetHash, policy_set_hash AS policySetHash,'
        + ' actor, authorized_at <= CURRENT_TIMESTAMP AND expires_at > CURRENT_TIMESTAMP AS active'
        + ' FROM crawler_automation_activation_decision WHERE decision_kind = ? AND domain_id = ?'
        + ' ORDER BY authorized_at DESC, id DESC LIMIT 1 FOR UPDATE',
        ['SCHEDULER_ACTIVATION', 'crawler_v2_scheduler'],
      );
      const live = rows?.[0];
      if (!live || !Number(live.active) || live.decisionIdentity !== activation.decisionIdentity
          || live.packetHash !== activation.packetHash || live.policySetHash !== activation.policySetHash
          || live.actor !== current.ownerUsername) {
        throw new Error('Shimmer finalization activation changed or expired');
      }
      approvedBy = current.approvedBy;
    },
    beforeCommit: async (fences) => {
      const { shimmerPartitionPreview, ...importPlan } = preview.importPlan;
      const partition = buildShimmerPartitionBundle({
        ...shimmerPartitionPreview,
        ownerApprovals: [...new Set(SHIMMER_PARTITION_SCOPES.map((scope) => scope.capability))],
        fences,
      });
      bundle = buildSupplementaryL1Bundle({ ...preview, previewOnly: false,
        importPlan: { ...importPlan, shimmerPartition: partition,
          shimmerPolicyApproval: { actor: approvedBy, policyVersion: preview.policy.policyVersion,
            policyHash: preview.policy.policyHash, policySetHash: preview.policy.policySetHash } },
      });
      await publishBundle(bundle);
    },
  });
  return bundle;
}
