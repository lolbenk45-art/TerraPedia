import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_CUTOVER_OPERATION_IDS,
  CANONICAL_OPERATION_DATA_PATHS,
  CANONICAL_OPERATION_ENTRYPOINTS,
} from './canonical-operation-catalog.mjs';
import {
  CANONICAL_SHIMMER_IMPORT_INPUT_CONTRACT_PATH,
  CANONICAL_SHIMMER_IMPORT_RESULT_PATH,
  readCanonicalShimmerImportInputContract,
  shimmerImportBindingFromInputContract,
} from './canonical-shimmer-import-input-contract.mjs';
import { canonicalServerFingerprint } from './automation-database-contract.mjs';
import {
  NPC_APPLY_OWNER_PHASES,
  NPC_ITEM_RELATION_LINEAGE_REPAIR_OPERATION,
} from '../npc-canonical/npc-apply-ownership-preparation.mjs';
// Keep the exact-scope operation constants local to the manifest. Importing
// the executor here would make every other operation's static code bundle
// depend on this new lane and would drift unrelated authorization hashes.
const NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID = 'canonical-npc-external-relation-scope-apply';
const NPC_EXTERNAL_RELATION_SCOPE_BUNDLE_PATH = 'reports/runtime/local-data-chain-closure/20260819/accepted-projection/npc-item-relations.accepted.bundle.json';
const NPC_EXTERNAL_RELATION_SCOPE_PREVIEW_PATH = 'reports/runtime/local-data-chain-closure/20260819/accepted-projection/npc-relation-owner-scope-preview.json';
const NPC_EXTERNAL_RELATION_SCOPE_PROJECTION_PATH = 'reports/runtime/local-data-chain-closure/20260819/npc-external-relation-scope-accepted-quarantine-projection.json';
const NPC_EXTERNAL_RELATION_SCOPE_SERVER_FINGERPRINT_PATH = 'reports/authorization/canonical/canonical-npc-external-relation-scope.server-fingerprint.json';
const NPC_EXTERNAL_RELATION_SCOPE_BINDING = Object.freeze({
  scopeSha256: 'sha256:759c022a34a243ed17c93630727bb07d965b95064ed296740ecdf5d01cc6ca39',
  bundleSha256: 'sha256:febde906014e59a8cbbcec8d04bf6083c1562d94b9fdcca5cc0a29c61bde6f05',
  previewSha256: 'sha256:090652680bb566c6ff670dfe2807fc7378e2d0daa286416304638232316a363d',
  projectionSha256: 'sha256:2e499d5b089a83f9654828a69113c1994a71d52a026cf6ea377b094be0dec6a4',
  quarantinedFactCount: 198,
  unresolvedCandidateCount: 357,
  writeTargets: Object.freeze([
    'landing.npc_item_relations_bundle_raw',
    'maint.maint_item_sources',
    'maint.maint_npc_crawler_facts',
    'relation.item_source_facts',
    'relation.item_source_details',
    'relation.item_npc_loot_relations',
    'relation.item_npc_shop_relations',
    'local.npc_loot_entries',
    'local.npc_shop_entries',
  ]),
});
import {
  buildItemImageProjectionAttemptPaths,
  readItemImageProjectionInputContract,
} from '../relation/item-image-projection-contract.mjs';
import {
  assertRepositoryOrdinaryFile,
  assertRepositoryPathConfinement,
} from '../lib/private-repository-path.mjs';

const NPC_OWNER_OPERATION_IDS = Object.freeze([
  'canonical-npc-landing-apply',
  ...NPC_APPLY_OWNER_PHASES.map((phase) => phase.operationId),
  NPC_ITEM_RELATION_LINEAGE_REPAIR_OPERATION.operationId,
]);
const NPC_BASE_MAINT_OPERATION_IDS = Object.freeze([
  'canonical-npc-base-maint-nontown-apply',
  'canonical-npc-base-maint-town-apply',
]);
const NPC_DUPLICATE_QUARANTINE_OPERATION_ID = 'canonical-npc-duplicate-quarantine';
const NPC_STALE_LINEAGE_RETIREMENT_OPERATION_ID = 'canonical-npc-stale-lineage-retirement';
const NPC_PARENT_CONFLICT_RETIREMENT_OPERATION_ID = 'canonical-npc-stale-lineage-parent-conflict-retirement';
const NPC_INDEPENDENT_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID = 'canonical-npc-independent-wiki-gg-variant-retirement';
const NPC_PROJECTION_TEXT_IDENTITY_REPAIR_OPERATION_ID = 'canonical-npc-projection-text-identity-repair';
const NPC_PROJECTION_TEXT_IDENTITY_RESIDUAL_REPAIR_OPERATION_ID = 'canonical-npc-projection-text-identity-residual-repair';
const NPC_PROJECTION_GAP_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID = 'canonical-npc-projection-gap-wiki-gg-variant-retirement';
const NPC_LOCAL_LOOT_COMPATIBILITY_RETIREMENT_OPERATION_ID = 'canonical-npc-local-loot-compatibility-retirement';
const ITEM_IMAGE_PROVENANCE_OPERATION_ID = 'canonical-item-image-provenance-patch';
const BUFF_IMAGE_PROJECTION_OPERATION_ID = 'canonical-buff-image-projection-patch';
const NPC_BUFF_RELATION_RECOVERY_OPERATION_ID = 'canonical-npc-buff-relation-recovery';
const NPC_LOOT_IDENTITY_RESTORATION_OPERATION_ID = 'canonical-npc-loot-identity-restoration';
const NPC_DUPLICATE_RELATION_RETIREMENT_OPERATION_ID = 'canonical-npc-loot-duplicate-relation-retirement';
const ITEM_IMAGE_ORIGIN_NORMALIZATION_OPERATION_ID = 'canonical-item-image-origin-normalization';
const NPC_IMAGE_ORIGIN_NORMALIZATION_OPERATION_ID = 'canonical-npc-image-origin-normalization';
const PROJECTILE_IMAGE_ORIGIN_NORMALIZATION_OPERATION_ID = 'canonical-projectile-image-origin-normalization';
const BIOME_IMAGE_ORIGIN_NORMALIZATION_OPERATION_ID = 'canonical-biome-image-origin-normalization';
const ARMOR_SET_PROJECTION_RESTORATION_OPERATION_ID = 'canonical-armor-set-projection-restoration';
const TWO_ITEM_IMAGE_QUARANTINE_REPAIR_OPERATION_ID = 'canonical-two-item-image-quarantine-repair';
const ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID = 'canonical-item-source-local-npc-admission';
const AUTHORIZED_RUNNER_CODE_PATH = 'pipelines/automation/run-authorized-canonical-operation.mjs';
const L2_OPERATION_IDS = Object.freeze({
  items: 'automation-items-l2-promotion',
  npcs: 'automation-npcs-l2-promotion',
  projectiles: 'automation-projectiles-l2-promotion',
  armor_sets: 'automation-armor-sets-l2-promotion',
  buffs: 'automation-buffs-l2-promotion',
  audio: 'automation-audio-l2-promotion',
  bosses: 'automation-bosses-l2-promotion',
  shimmer: 'automation-shimmer-l2-promotion',
});
const L2_POLICY_DECISION_OPERATION_IDS = new Set([
  'automation-biomes-l2-promotion',
  ...Object.values(L2_OPERATION_IDS),
]);
const GOVERNED_L1_OPERATION_DOMAINS = Object.freeze({
  'automation-items-l1': 'items',
  'automation-npcs-l1': 'npcs',
  'automation-projectiles-l1': 'projectiles',
  'automation-armor-sets-l1': 'armor_sets',
  'automation-buffs-l1': 'buffs',
  'automation-audio-first-l1': 'audio',
  'automation-bosses-first-l1': 'bosses',
  'automation-shimmer-first-l1': 'shimmer',
});

const AUTHORIZED_CONTEXT_CODE_PATHS = Object.freeze([
  'pipelines/automation/authorized-operation-context.mjs',
  'pipelines/automation/build-canonical-cutover-authorization.mjs',
  'pipelines/automation/canonical-operation-catalog.mjs',
  'pipelines/automation/canonical-operation-execution-manifest.mjs',
  'pipelines/automation/policy-set-hash.mjs',
]);

const CODE_PATHS = Object.freeze({
  'automation-biomes-l0-bootstrap': Object.freeze([
    'pipelines/automation/bootstrap-automation-policy.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
    'pipelines/lib/project-root.mjs',
  ]),
  ...Object.fromEntries(['items', 'projectiles'].flatMap((domainId) => [
    [`automation-${domainId}-l0-bootstrap`, Object.freeze([
      'pipelines/automation/bootstrap-automation-policy.mjs',
      ...AUTHORIZED_CONTEXT_CODE_PATHS,
      'pipelines/lib/mysql-module.mjs',
      'pipelines/lib/project-root.mjs',
    ])],
    [`automation-${domainId}-l1-policy-promotion`, Object.freeze([
      'pipelines/automation/run-automation-policy-decision.mjs',
      ...AUTHORIZED_CONTEXT_CODE_PATHS,
      'pipelines/lib/mysql-module.mjs',
    ])],
  ])),
  ...Object.fromEntries(Object.keys(GOVERNED_L1_OPERATION_DOMAINS).map((operationId) => [
    operationId, Object.freeze([
      'pipelines/automation/run-governed-l1-operation.mjs',
      'pipelines/automation/build-l1-reconciliation-evidence.mjs',
      'pipelines/automation/reconciliation-evidence-contract.mjs',
      'pipelines/automation/run-supplementary-domain-l1-operation.mjs',
      'pipelines/automation/supplementary-domain-l1-contract.mjs',
      'pipelines/automation/canonical-shimmer-import-input-contract.mjs',
      'pipelines/import/import-wiki-audio-assets-to-db.mjs',
      'pipelines/import/import-wiki-bosses-to-db.mjs',
      'pipelines/import/import-wiki-shimmer-to-db.mjs',
      ...AUTHORIZED_CONTEXT_CODE_PATHS,
      'pipelines/lib/mysql-module.mjs',
      'pipelines/lib/project-root.mjs',
    ]),
  ])),
  ...Object.fromEntries(Object.entries(L2_OPERATION_IDS).map(([domainId, operationId]) => [
    operationId, Object.freeze([
      'pipelines/automation/run-automation-policy-decision.mjs',
      'pipelines/automation/build-l2-promotion-proposal.mjs',
      'pipelines/automation/l2-policy-ceiling-artifact.mjs',
      'pipelines/automation/reconciliation-evidence-contract.mjs',
      ...AUTHORIZED_CONTEXT_CODE_PATHS,
      'pipelines/lib/mysql-module.mjs',
    ]),
  ])),
  ...Object.fromEntries(Object.values(L2_OPERATION_IDS).map((promotionOperationId) => {
    const operationId = promotionOperationId.replace(/-l2-promotion$/, '-l2-policy-ceiling-registration');
    return [operationId, Object.freeze([
      'pipelines/automation/register-l2-policy-ceiling.mjs',
      'pipelines/automation/l2-policy-ceiling-artifact.mjs',
      'pipelines/automation/policy-set-hash.mjs',
      ...AUTHORIZED_CONTEXT_CODE_PATHS,
      'pipelines/lib/mysql-module.mjs',
    ])];
  })),
  'canonical-item-image-source-verification': Object.freeze([
    'pipelines/workflow/run-backend-data-refresh.mjs',
    'pipelines/fetch/fetch-item-image-source-verification.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
  ]),
  'canonical-item-image-source-promotion': Object.freeze([
    'pipelines/transform/promote-item-image-sources.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
  ]),
  'canonical-item-image-lineage-apply': Object.freeze([
    'pipelines/relation/apply-item-image-lineage.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
  ]),
  [ITEM_IMAGE_PROVENANCE_OPERATION_ID]: Object.freeze([
    'pipelines/relation/item-image-provenance-patch.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  [BUFF_IMAGE_PROJECTION_OPERATION_ID]: Object.freeze([
    'pipelines/relation/buff-image-projection-patch.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  [NPC_BUFF_RELATION_RECOVERY_OPERATION_ID]: Object.freeze([
    'pipelines/relation/npc-buff-relation-recovery.mjs',
    'pipelines/relation/secondary-relation-processor.mjs',
    'pipelines/relation/sync-maint-to-relation.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  [NPC_LOOT_IDENTITY_RESTORATION_OPERATION_ID]: Object.freeze([
    'pipelines/relation/npc-loot-identity-restoration.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
    'pipelines/lib/private-repository-path.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  [NPC_DUPLICATE_RELATION_RETIREMENT_OPERATION_ID]: Object.freeze([
    'pipelines/npc-canonical/npc-duplicate-relation-retirement.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  ...Object.fromEntries([
    ITEM_IMAGE_ORIGIN_NORMALIZATION_OPERATION_ID,
    NPC_IMAGE_ORIGIN_NORMALIZATION_OPERATION_ID,
    PROJECTILE_IMAGE_ORIGIN_NORMALIZATION_OPERATION_ID,
    BIOME_IMAGE_ORIGIN_NORMALIZATION_OPERATION_ID,
  ].map((operationId) => [operationId, Object.freeze([
    'pipelines/relation/projection-image-origin-normalization.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
    'pipelines/lib/private-repository-path.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ])])),
  [ARMOR_SET_PROJECTION_RESTORATION_OPERATION_ID]: Object.freeze([
    'pipelines/relation/armor-set-projection-restoration.mjs',
    'pipelines/relation/projection-sync.mjs',
    'pipelines/relation/managed-image-url-policy.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
    'pipelines/lib/private-repository-path.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  [TWO_ITEM_IMAGE_QUARANTINE_REPAIR_OPERATION_ID]: Object.freeze([
    'pipelines/relation/two-item-image-quarantine-repair.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  'canonical-item-image-projection-apply': Object.freeze([
    'pipelines/relation/apply-item-image-projection.mjs',
    'pipelines/relation/build-item-image-projection-proposal.mjs',
    'pipelines/relation/item-image-projection-contract.mjs',
    'pipelines/relation/item-image-projection-db.mjs',
    'pipelines/relation/managed-image-url-policy.mjs',
    'pipelines/lib/private-repository-path.mjs',
    'pipelines/lib/project-root.mjs',
    'pipelines/lib/mysql-module.mjs',
    'scripts/lib/local-runtime-config.mjs',
    'pipelines/automation/authorized-operation-context.mjs',
    'pipelines/automation/build-canonical-cutover-authorization.mjs',
    'pipelines/automation/canonical-operation-catalog.mjs',
    'pipelines/automation/canonical-operation-execution-manifest.mjs',
    'pipelines/automation/policy-set-hash.mjs',
  ]),
  'canonical-item-image-projection-missing-row-insert': Object.freeze([
    'pipelines/relation/apply-item-image-projection-missing-row-insert.mjs',
    'pipelines/relation/item-image-projection-missing-row-insert-contract.mjs',
    'pipelines/relation/item-image-projection-missing-row-insert-db.mjs',
    'pipelines/lib/private-repository-path.mjs',
    'pipelines/lib/project-root.mjs',
    'pipelines/lib/mysql-module.mjs',
    'scripts/lib/local-runtime-config.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
  ]),
  'canonical-item-base-entity-restoration': Object.freeze([
    'pipelines/relation/apply-item-canonical-base-entity-restoration.mjs',
    'pipelines/relation/build-item-canonical-base-entity-restoration-proposal.mjs',
    'pipelines/relation/item-canonical-base-entity-restoration-contract.mjs',
    'pipelines/relation/item-canonical-base-entity-restoration-db.mjs',
    'pipelines/relation/base-entity-processor.mjs',
    'pipelines/relation/relation-trace.mjs',
    'pipelines/relation/managed-image-url-policy.mjs',
    'pipelines/lib/private-repository-path.mjs',
    'pipelines/lib/project-root.mjs',
    'pipelines/lib/mysql-module.mjs',
    'scripts/lib/local-runtime-config.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
  ]),
  [ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID]: Object.freeze([
    'pipelines/relation/apply-item-source-local-npc-admission.mjs',
    'pipelines/relation/build-item-source-local-npc-admission-proposal.mjs',
    'pipelines/relation/item-source-local-npc-admission-contract.mjs',
    'pipelines/relation/item-source-local-npc-admission-db.mjs',
    'pipelines/relation/item-source-local-npc-admission.mjs',
    'pipelines/lib/private-repository-path.mjs',
    'pipelines/lib/project-root.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
  ]),
  'canonical-item-projection-parity-apply': Object.freeze([
    'pipelines/relation/apply-core-projection-parity.mjs',
    'pipelines/relation/core-projection-parity-contract.mjs',
    'pipelines/relation/core-projection-parity-db.mjs',
    'pipelines/lib/mysql-module.mjs',
    'scripts/lib/local-runtime-config.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
  ]),
  'canonical-npc-projection-parity-apply': Object.freeze([
    'pipelines/relation/apply-core-projection-parity.mjs',
    'pipelines/relation/core-projection-parity-contract.mjs',
    'pipelines/relation/core-projection-parity-db.mjs',
    'pipelines/lib/mysql-module.mjs',
    'scripts/lib/local-runtime-config.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
  ]),
  'canonical-boss-projection-parity-apply': Object.freeze([
    'pipelines/relation/apply-core-projection-parity.mjs',
    'pipelines/relation/core-projection-parity-contract.mjs',
    'pipelines/relation/core-projection-parity-db.mjs',
    'pipelines/lib/mysql-module.mjs',
    'scripts/lib/local-runtime-config.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
  ]),
  'canonical-boss-source-refresh-offline': Object.freeze([
    'pipelines/relation/boss-source-refresh-offline.mjs',
    'pipelines/landing/import-source-dataset-landings.mjs',
    'pipelines/maint/sync-landing-to-maint.mjs',
    'pipelines/relation/boss-series-processor.mjs',
    'pipelines/relation/projection-sync.mjs',
    'pipelines/lib/mysql-module.mjs',
    'scripts/lib/local-runtime-config.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
  ]),
  'canonical-projection-recovery-from-relation': Object.freeze([
    'pipelines/relation/recover-projections-from-relation.mjs',
    'pipelines/relation/projection-sync.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  'canonical-item-source-relation-recovery-from-maint': Object.freeze([
    'pipelines/relation/recover-item-source-relations-from-maint.mjs',
    'pipelines/relation/sync-maint-to-relation.mjs',
    'pipelines/relation/item-source-relation-processor.mjs',
    'pipelines/automation/authorized-operation-context.mjs',
    'pipelines/automation/build-canonical-cutover-authorization.mjs',
    'pipelines/automation/canonical-operation-catalog.mjs',
    'pipelines/automation/canonical-operation-execution-manifest.mjs',
    'pipelines/automation/policy-set-hash.mjs',
    'pipelines/lib/mysql-module.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  'canonical-projection-recovery-from-relation-v2': Object.freeze([
    'pipelines/relation/recover-projections-from-relation-v2.mjs',
    'pipelines/relation/projection-sync.mjs',
    'pipelines/relation/managed-image-url-policy.mjs',
    'pipelines/automation/authorized-operation-context.mjs',
    'pipelines/automation/build-canonical-cutover-authorization.mjs',
    'pipelines/automation/canonical-operation-catalog.mjs',
    'pipelines/automation/canonical-operation-execution-manifest.mjs',
    'pipelines/automation/policy-set-hash.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  'canonical-image-sync': Object.freeze([
    'pipelines/workflow/run-image-sync.mjs',
    'pipelines/lib/wiki-item-utils.mjs',
    'pipelines/lib/minio-image-upload.mjs',
    'pipelines/relation/managed-image-url-policy.mjs',
    'pipelines/workflow/backend-refresh-runtime-state.mjs',
  ]),
  'canonical-boss-import': Object.freeze([
    'pipelines/import/import-wiki-bosses-to-db.mjs',
    'pipelines/import/boss-import-strict-mode.mjs',
    'pipelines/import/boss-reference-source.mjs',
    'pipelines/lib/mysql-module.mjs',
    'pipelines/lib/minio-image-upload.mjs',
    'pipelines/lib/project-root.mjs',
    'scripts/lib/local-runtime-config.mjs',
    'services/catalog-api/src/main/java/com/terraria/skills/controller/FileStorageController.java',
    'services/catalog-api/src/main/java/com/terraria/skills/service/ObjectStorageService.java',
    'services/catalog-api/src/main/java/com/terraria/skills/service/UserAvatarValidator.java',
    'services/catalog-api/src/main/java/com/terraria/skills/service/impl/MinioObjectStorageServiceImpl.java',
  ]),
  'canonical-boss-loot-import': Object.freeze([
    'pipelines/import/import-boss-loot-to-db.mjs',
    'pipelines/import/boss-loot-schema-path.mjs',
    'pipelines/import/boss-loot-owner.mjs',
    'pipelines/generate/generate-boss-loot-bundle.mjs',
    'pipelines/lib/base-domain-row-reconcile.mjs',
    'pipelines/lib/mysql-module.mjs',
    'pipelines/lib/project-root.mjs',
    'pipelines/lib/wiki-item-utils.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  'canonical-boss-t1-acceptance': Object.freeze([
    'pipelines/automation/run-live-automation-acceptance.mjs',
    'pipelines/boss/boss-canonical-t1-acceptance.mjs',
    'pipelines/import/import-wiki-bosses-to-db.mjs',
    'pipelines/import/import-boss-loot-to-db.mjs',
    'pipelines/relation/sync-maint-to-relation.mjs',
  ]),
  'canonical-projectile-backfill': Object.freeze([
    'pipelines/backfill/backfill-projectile-zh-and-images.mjs',
    'pipelines/lib/projectile-name-resolver.mjs',
    'pipelines/lib/wiki-item-utils.mjs',
    'pipelines/workflow/backend-refresh-runtime-state.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  'canonical-projectile-t1-acceptance': Object.freeze([
    'pipelines/automation/run-live-automation-acceptance.mjs',
    'pipelines/projectile/projectile-canonical-t1-acceptance.mjs',
    'pipelines/import/import-independent-entities-to-db.mjs',
    'pipelines/maint/sync-landing-to-maint.mjs',
    'pipelines/relation/sync-maint-to-relation.mjs',
  ]),
  'canonical-buff-t1-acceptance': Object.freeze([
    'pipelines/automation/run-live-automation-acceptance.mjs',
    'pipelines/buff/buff-canonical-t1-acceptance.mjs',
    'pipelines/import/import-independent-entities-to-db.mjs',
    'pipelines/maint/sync-landing-to-maint.mjs',
    'pipelines/relation/sync-maint-to-relation.mjs',
  ]),
  'canonical-biome-t1-acceptance': Object.freeze([
    'pipelines/automation/run-live-automation-acceptance.mjs',
    'pipelines/biome/biome-canonical-t1-acceptance.mjs',
    'pipelines/audit/biome-wikitext-linkage-dry-run.mjs',
    'pipelines/import/import-biomes-to-db.mjs',
    'pipelines/import/import-biome-wikitext-resolved-to-db.mjs',
    'pipelines/maint/sync-landing-to-maint.mjs',
  ]),
  'canonical-biome-image-contract-apply': Object.freeze([
    'pipelines/relation/apply-biome-image-contract.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/project-root.mjs',
  ]),
  'canonical-recipe-crawler': Object.freeze([
    'pipelines/fetch/fetch-wiki-zh-recipe-pages.mjs',
    'pipelines/fetch/fetch-wiki-zh-recipe-pages-progress.mjs',
    'pipelines/lib/wiki-item-utils.mjs',
    'pipelines/lib/wiki-page-utils.mjs',
    'pipelines/workflow/backend-refresh-runtime-state.mjs',
  ]),
  'canonical-recipe-apply': Object.freeze([
    'pipelines/pipeline/run-wiki-zh-recipe-sync-pipeline.mjs',
    'pipelines/import/import-wiki-zh-recipes-to-db.mjs',
    'pipelines/backfill/backfill-recipe-zh-display-names.mjs',
    'pipelines/sync/consolidate-recipe-provider-priority.mjs',
    'pipelines/lib/project-root.mjs',
    'pipelines/lib/wiki-item-utils.mjs',
  ]),
  'canonical-recipe-t1-acceptance': Object.freeze([
    'pipelines/automation/run-live-automation-acceptance.mjs',
    'pipelines/recipe/recipe-canonical-t1-acceptance.mjs',
    'pipelines/pipeline/run-wiki-zh-recipe-sync-pipeline.mjs',
    'pipelines/import/import-wiki-zh-recipes-to-db.mjs',
    'pipelines/backfill/backfill-recipe-zh-display-names.mjs',
    'pipelines/sync/consolidate-recipe-provider-priority.mjs',
  ]),
  'canonical-shimmer-generation': Object.freeze([
    'pipelines/pipeline/run-wiki-shimmer-extraction-pipeline.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
  ]),
  'canonical-shimmer-import': Object.freeze([
    'pipelines/import/import-wiki-shimmer-to-db.mjs',
    'pipelines/automation/canonical-shimmer-import-input-contract.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/transform/shimmer-generation-contract.mjs',
    'pipelines/transform/shimmer-generation-builder.mjs',
    'pipelines/maint/shimmer-structured-parser.mjs',
    'pipelines/lib/mysql-module.mjs',
    'pipelines/lib/project-root.mjs',
    'pipelines/lib/wiki-item-utils.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  'canonical-npc-crawler': Object.freeze([
    'pipelines/npc-canonical/npc-crawler-fact-action.mjs',
    'pipelines/crawler/src/cli.mjs',
    'pipelines/crawler/src/batch/run-npc-batch.mjs',
    'pipelines/crawler/src/live/npc-live-source.mjs',
    'pipelines/crawler/src/output/npc-file-fanout.mjs',
    'pipelines/crawler/src/domains/npc-domain.mjs',
    'pipelines/workflow/backend-refresh-runtime-state.mjs',
  ]),
  'canonical-npc-t1-acceptance': Object.freeze([
    'pipelines/automation/run-live-automation-acceptance.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/automation/automation-database-contract.mjs',
    'pipelines/automation/mysql-automation-acceptance-adapter.mjs',
    'pipelines/automation/provision-automation-databases.mjs',
    'pipelines/automation/drop-automation-databases.mjs',
    'pipelines/lib/mysql-module.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  'canonical-npc-t2-cutover-verification': Object.freeze([
    'pipelines/npc-canonical/npc-canonical-t2-cutover.mjs',
    'pipelines/npc-canonical/npc-canonical-readiness.mjs',
    'pipelines/npc-canonical/npc-owner-phase-apply.mjs',
    'pipelines/npc-canonical/npc-apply-ownership-preparation.mjs',
    'pipelines/npc-canonical/npc-base-maint-apply.mjs',
    'pipelines/npc-canonical/npc-canonical-t1-acceptance.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
  ]),
  'canonical-schema-v56-v58': Object.freeze([
    'pipelines/automation/run-canonical-schema-migration.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/maint/maint-schema.mjs',
    'pipelines/relation/relation-schema.mjs',
    'services/catalog-api/src/main/java/com/terraria/skills/tooling/CanonicalFlywayMigrationCli.java',
    'services/catalog-api/pom.xml',
  ]),
  'automation-biomes-l1-policy-promotion': Object.freeze([
    'pipelines/automation/run-automation-policy-decision.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
  ]),
  'canonical-crawler-v2-scheduler-t1-acceptance': Object.freeze([
    'pipelines/monitor/crawler-queue-v2-scheduler-lifecycle.mjs',
    'pipelines/monitor/crawler-queue-v2-scheduler-system-driver.mjs',
    'pipelines/monitor/recorded-http-fixture-source.mjs',
    'pipelines/monitor/recorded-recipe-auto-ingestion.mjs',
    'pipelines/monitor/recorded-domain-auto-ingestion.mjs',
    'pipelines/monitor/crawler-queue-v2-fixture.mjs',
    'pipelines/workflow/backend-refresh-runtime-state.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
  ]),
  'canonical-crawler-v2-items-t1-acceptance': Object.freeze([
    'pipelines/monitor/crawler-queue-v2-scheduler-lifecycle.mjs',
    'pipelines/monitor/crawler-queue-v2-scheduler-system-driver.mjs',
    'pipelines/monitor/recorded-item-auto-ingestion.mjs',
    'pipelines/monitor/recorded-http-fixture-source.mjs',
    'pipelines/monitor/crawler-queue-v2-fixture.mjs',
    'pipelines/workflow/backend-refresh-runtime-state.mjs',
    'pipelines/lib/mysql-module.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
  ]),
  'canonical-crawler-v2-scheduler-activation': Object.freeze([
    'pipelines/automation/build-canonical-crawler-v2-scheduler-activation-proposal.mjs',
    'pipelines/automation/crawler-v2-scheduler-activation-preflight.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
  ]),
  'automation-biomes-l2-promotion': Object.freeze([
    'pipelines/automation/run-automation-policy-decision.mjs',
    'pipelines/automation/build-l2-promotion-proposal.mjs',
    'pipelines/automation/l2-policy-ceiling-artifact.mjs',
    'pipelines/automation/reconciliation-evidence-contract.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
  ]),
  'automation-biomes-scheduler-activation': Object.freeze([
    'pipelines/automation/run-automation-policy-decision.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
  ]),
  'automation-crawler-v2-scheduler-activation': Object.freeze([
    'pipelines/automation/run-automation-policy-decision.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
  ]),
  'automation-crawler-v2-scheduler-reactivation': Object.freeze([
    'pipelines/automation/run-automation-policy-decision.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
  ]),
  ...Object.fromEntries(['audio', 'bosses', 'shimmer'].flatMap((domainId) => [
    [`automation-${domainId}-l0-bootstrap`, Object.freeze([
      'pipelines/automation/bootstrap-automation-policy.mjs',
      ...AUTHORIZED_CONTEXT_CODE_PATHS,
      'pipelines/lib/mysql-module.mjs',
      'pipelines/lib/project-root.mjs',
    ])],
    [`automation-${domainId}-l1-policy-promotion`, Object.freeze([
      'pipelines/automation/run-automation-policy-decision.mjs',
      ...AUTHORIZED_CONTEXT_CODE_PATHS,
      'pipelines/lib/mysql-module.mjs',
    ])],
  ])),
  'canonical-item-group-bootstrap': Object.freeze([
    'pipelines/item-groups/item-group-canonical-action.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/item-groups/item-group-live-acceptance.mjs',
    'pipelines/item-groups/item-group-bootstrap.mjs',
    'pipelines/item-groups/item-group-canonical-sync.mjs',
    'pipelines/item-groups/export-item-group-compatibility.mjs',
    'pipelines/workflow/backend-refresh-runtime-state.mjs',
    'pipelines/lib/mysql-module.mjs',
  ]),
  'automation-biomes-first-l1': Object.freeze([
    'pipelines/automation/run-biomes-automation-operation.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/import/import-biomes-to-db.mjs',
    'pipelines/lib/base-domain-row-reconcile.mjs',
    'pipelines/lib/load-standardized-dataset.mjs',
    'pipelines/lib/mysql-module.mjs',
    'pipelines/lib/project-root.mjs',
  ]),
  'automation-biomes-second-l1': Object.freeze([
    'pipelines/automation/run-biomes-automation-operation.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/import/import-biomes-to-db.mjs',
    'pipelines/lib/base-domain-row-reconcile.mjs',
    'pipelines/lib/load-standardized-dataset.mjs',
    'pipelines/lib/mysql-module.mjs',
    'pipelines/lib/project-root.mjs',
  ]),
  ...Object.fromEntries(NPC_OWNER_OPERATION_IDS.map((operationId) => [operationId, Object.freeze([
    'pipelines/npc-canonical/npc-owner-phase-apply.mjs',
    'pipelines/npc-canonical/npc-apply-ownership-preparation.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
  ])])),
  ...Object.fromEntries(NPC_BASE_MAINT_OPERATION_IDS.map((operationId) => [operationId, Object.freeze([
    'pipelines/npc-canonical/npc-base-maint-apply.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
  ])])),
  [NPC_DUPLICATE_QUARANTINE_OPERATION_ID]: Object.freeze([
    'pipelines/npc-canonical/npc-duplicate-quarantine.mjs',
    'pipelines/relation/item-source-relation-processor.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  [NPC_STALE_LINEAGE_RETIREMENT_OPERATION_ID]: Object.freeze([
    'pipelines/npc-canonical/npc-stale-lineage-retirement.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  [NPC_PARENT_CONFLICT_RETIREMENT_OPERATION_ID]: Object.freeze([
    'pipelines/npc-canonical/npc-stale-lineage-parent-conflict-retirement.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  [NPC_INDEPENDENT_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID]: Object.freeze([
    'pipelines/npc-canonical/npc-independent-wiki-gg-variant-retirement.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  [NPC_PROJECTION_TEXT_IDENTITY_REPAIR_OPERATION_ID]: Object.freeze([
    'pipelines/npc-canonical/npc-projection-text-identity-repair.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  [NPC_PROJECTION_TEXT_IDENTITY_RESIDUAL_REPAIR_OPERATION_ID]: Object.freeze([
    'pipelines/npc-canonical/npc-projection-text-identity-residual-repair.mjs',
    'pipelines/audit/npc-projection-text-identity-residual-preview.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  [NPC_PROJECTION_GAP_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID]: Object.freeze([
    'pipelines/npc-canonical/npc-projection-gap-wiki-gg-variant-retirement.mjs',
    'pipelines/audit/npc-projection-gap-wiki-gg-variant-retirement-preview.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  [NPC_LOCAL_LOOT_COMPATIBILITY_RETIREMENT_OPERATION_ID]: Object.freeze([
    'pipelines/npc-canonical/npc-local-loot-compatibility-retirement.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'pipelines/lib/mysql-module.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  [NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID]: Object.freeze([
    'pipelines/npc-canonical/npc-external-relation-scope-operation.mjs',
  ]),
});

export const CANONICAL_EXECUTABLE_OPERATION_IDS = Object.freeze(
  CANONICAL_CUTOVER_OPERATION_IDS.filter((operationId) => (
    CANONICAL_OPERATION_ENTRYPOINTS[operationId] !== null
  )),
);

export function buildCanonicalOperationExecutionManifest({
  repoRoot = process.cwd(),
  operationId,
  artifactDate = new Date().toISOString().slice(0, 10),
  npcLimit = 25,
  backendApiBase = null,
  resultLabel = null,
  npcT1ConfigPath = null,
  npcT1RedisDb = null,
  npcT1RunId = null,
  itemImagePromotionBundlePath = null,
  managedObjectOrigin = null,
  legacyOriginRepair = false,
  legacyOrigin = null,
  expectedLegacyCount = null,
  itemImageLineageAttemptRoot = null,
  itemImageProvenanceAttemptRoot = null,
  twoItemImageQuarantineRepairAttemptRoot = null,
  itemImageProjectionAttemptRoot = null,
  itemImageProjectionMissingRowInsertAttemptRoot = null,
  itemCanonicalBaseEntityRestorationAttemptRoot = null,
  itemSourceLocalNpcAdmissionAttemptRoot = null,
  npcT2AttemptRoot = null,
  bossSourceSnapshotHash = null,
  policyCeilingRegistrationMode = 'register',
  l1RunRoot = null,
} = {}) {
  const root = path.resolve(repoRoot);
  const contract = buildCanonicalOperationExecutionContract({
    repoRoot: root,
    operationId,
    artifactDate,
    npcLimit,
    backendApiBase,
    resultLabel,
    itemImagePromotionBundlePath,
    managedObjectOrigin,
    legacyOriginRepair,
    legacyOrigin,
    expectedLegacyCount,
    itemImageLineageAttemptRoot,
    itemImageProvenanceAttemptRoot,
    twoItemImageQuarantineRepairAttemptRoot,
    itemImageProjectionAttemptRoot,
    itemImageProjectionMissingRowInsertAttemptRoot,
    itemCanonicalBaseEntityRestorationAttemptRoot,
    itemSourceLocalNpcAdmissionAttemptRoot,
    npcT2AttemptRoot,
    bossSourceSnapshotHash,
    policyCeilingRegistrationMode,
    npcT1ConfigPath,
    npcT1RedisDb,
    npcT1RunId,
    l1RunRoot,
  });
  const codePaths = expandRepositoryCodePaths(root, operationCodePaths(operationId));
  if (operationId === 'canonical-item-image-projection-apply') {
    assertNoDynamicImports(root, codePaths);
  }
  const codeBundleEntries = codePaths.map((relativePath) => {
    const fullPath = path.join(root, relativePath);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      throw new Error(`operation code file is missing: ${relativePath}`);
    }
    return {
      path: relativePath,
      contentHash: `sha256:${createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex')}`,
    };
  });
  return { ...contract, codeBundleEntries };
}

export function buildCanonicalOperationExecutionContract({
  repoRoot = process.cwd(),
  operationId,
  artifactDate = new Date().toISOString().slice(0, 10),
  npcLimit = 25,
  backendApiBase = null,
  resultLabel = null,
  npcT1ConfigPath = null,
  npcT1RedisDb = null,
  npcT1RunId = null,
  itemImagePromotionBundlePath = null,
  managedObjectOrigin = null,
  legacyOriginRepair = false,
  legacyOrigin = null,
  expectedLegacyCount = null,
  itemImageLineageAttemptRoot = null,
  itemImageProvenanceAttemptRoot = null,
  twoItemImageQuarantineRepairAttemptRoot = null,
  itemImageProjectionAttemptRoot = null,
  itemImageProjectionMissingRowInsertAttemptRoot = null,
  itemCanonicalBaseEntityRestorationAttemptRoot = null,
  itemSourceLocalNpcAdmissionAttemptRoot = null,
  npcT2AttemptRoot = null,
  bossSourceSnapshotHash = null,
  policyCeilingRegistrationMode = 'register',
  l1RunRoot = null,
} = {}) {
  if (!CANONICAL_CUTOVER_OPERATION_IDS.includes(operationId)) {
    throw new Error(`unsupported operationId: ${operationId ?? ''}`);
  }
  if (CANONICAL_OPERATION_ENTRYPOINTS[operationId] === null) {
    throw new Error(`no governed executor is registered for operation: ${operationId}`);
  }
  const effectiveBossSourceSnapshotHash = operationId === 'canonical-boss-source-refresh-offline'
    ? (bossSourceSnapshotHash ?? `sha256:${createHash('sha256').update(fs.readFileSync(path.join(path.resolve(repoRoot), 'data/generated/wiki-bosses.latest.json'))).digest('hex')}`)
    : bossSourceSnapshotHash;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(artifactDate)) {
    throw new Error('artifactDate must use YYYY-MM-DD');
  }
  if (operationId === 'canonical-npc-crawler' && npcLimit !== 25) {
    throw new Error('npcLimit must be exactly 25 for the frozen canonical NPC operation');
  }
  const normalizedResultLabel = normalizeResultLabel(resultLabel);
  if (normalizedResultLabel && !NPC_OWNER_OPERATION_IDS.includes(operationId)) {
    throw new Error('result label is supported only for an NPC owner operation');
  }
  const npcT1Acceptance = ['canonical-npc-t1-acceptance', 'canonical-recipe-t1-acceptance', 'canonical-boss-t1-acceptance', 'canonical-projectile-t1-acceptance', 'canonical-buff-t1-acceptance', 'canonical-biome-t1-acceptance', 'canonical-crawler-v2-scheduler-t1-acceptance', 'canonical-crawler-v2-items-t1-acceptance'].includes(operationId)
    ? buildNpcT1AcceptanceIdentity({
      configPath: npcT1ConfigPath,
      redisLogicalDb: npcT1RedisDb,
      runId: npcT1RunId,
    })
    : null;
  const shimmerImport = operationId === 'canonical-shimmer-import'
    ? shimmerImportBindingFromInputContract(readCanonicalShimmerImportInputContract({
      repoRoot: path.resolve(repoRoot),
    }).contract)
    : null;
  const definition = buildDefinition(
    path.resolve(repoRoot),
    operationId,
    artifactDate,
    npcLimit,
    backendApiBase,
    npcT1Acceptance,
    normalizedResultLabel,
    itemImagePromotionBundlePath,
    managedObjectOrigin,
    legacyOriginRepair,
    legacyOrigin,
    expectedLegacyCount,
    shimmerImport,
    itemImageLineageAttemptRoot,
    itemImageProvenanceAttemptRoot,
    twoItemImageQuarantineRepairAttemptRoot,
    itemImageProjectionAttemptRoot,
    itemImageProjectionMissingRowInsertAttemptRoot,
    itemCanonicalBaseEntityRestorationAttemptRoot,
    itemSourceLocalNpcAdmissionAttemptRoot,
    npcT2AttemptRoot,
    effectiveBossSourceSnapshotHash,
    policyCeilingRegistrationMode,
    l1RunRoot,
  );
  return {
    schemaVersion: 1,
    operationId,
    artifactDate,
    ...(normalizedResultLabel ? { resultLabel: normalizedResultLabel } : {}),
    ...definition,
  };
}

export function assertCanonicalOperationExecutionManifestContract({
  repoRoot = process.cwd(),
  operationId,
  manifest,
} = {}) {
  const npcLimit = operationId === 'canonical-npc-crawler'
    ? Number(manifest?.bounds?.targetLimit)
    : 25;
  const backendApiBase = manifest?.command?.find((argument) => (
    typeof argument === 'string' && argument.startsWith('--apiBase=')
  ))?.slice('--apiBase='.length) ?? null;
  const npcT1Acceptance = manifest?.isolatedAcceptance ?? null;
  const commandArgument = (prefix) => manifest?.command?.find((argument) => (
    typeof argument === 'string' && argument.startsWith(prefix)
  ))?.slice(prefix.length) ?? null;
  const expected = buildCanonicalOperationExecutionContract({
    repoRoot,
    operationId,
    artifactDate: manifest?.artifactDate,
    npcLimit,
    backendApiBase,
    resultLabel: manifest?.resultLabel ?? null,
    npcT1ConfigPath: npcT1Acceptance?.configPath ?? null,
    npcT1RedisDb: npcT1Acceptance?.redisLogicalDb ?? null,
    npcT1RunId: npcT1Acceptance?.runId ?? null,
    itemImagePromotionBundlePath: commandArgument('--local-evidence='),
    managedObjectOrigin: commandArgument('--managed-object-origin='),
    legacyOriginRepair: manifest?.command?.includes('--legacy-origin-repair=true') ?? false,
    legacyOrigin: commandArgument('--legacy-origin='),
    expectedLegacyCount: commandArgument('--expected-legacy-count=') == null
      ? null
      : Number(commandArgument('--expected-legacy-count=')),
    itemImageLineageAttemptRoot: manifest?.itemImageLineageAttempt?.attemptRoot ?? null,
    itemImageProvenanceAttemptRoot: manifest?.itemImageProvenanceAttempt?.attemptRoot ?? null,
    twoItemImageQuarantineRepairAttemptRoot: manifest?.twoItemImageQuarantineRepairAttempt?.attemptRoot ?? null,
    itemImageProjectionAttemptRoot: manifest?.itemImageProjectionAttempt?.attemptRoot ?? null,
    itemImageProjectionMissingRowInsertAttemptRoot:
      manifest?.itemImageProjectionMissingRowInsertAttempt?.attemptRoot ?? null,
    itemCanonicalBaseEntityRestorationAttemptRoot:
      manifest?.itemCanonicalBaseEntityRestorationAttempt?.attemptRoot ?? null,
    itemSourceLocalNpcAdmissionAttemptRoot:
      manifest?.itemSourceLocalNpcAdmissionAttempt?.attemptRoot ?? null,
    npcT2AttemptRoot: manifest?.npcT2Attempt?.attemptRoot ?? null,
    bossSourceSnapshotHash: commandArgument('--expected-sha256='),
    policyCeilingRegistrationMode: manifest?.policyCeilingRegistration?.mode ?? 'register',
    l1RunRoot: manifest?.l1RunRoot ?? null,
  });
  if (['canonical-npc-t1-acceptance', 'canonical-recipe-t1-acceptance', 'canonical-boss-t1-acceptance', 'canonical-projectile-t1-acceptance', 'canonical-buff-t1-acceptance', 'canonical-biome-t1-acceptance', 'canonical-crawler-v2-scheduler-t1-acceptance', 'canonical-crawler-v2-items-t1-acceptance'].includes(operationId)
      && expected.isolatedAcceptance?.configSha256 !== npcT1Acceptance?.configSha256) {
    throw new Error('NPC T1 config hash drifted from the execution manifest');
  }
  const { codeBundleEntries, ...actualContract } = manifest ?? {};
  if (JSON.stringify(stableValue(actualContract)) !== JSON.stringify(stableValue(expected))) {
    throw new Error(`execution manifest contract drifted for operation: ${operationId}`);
  }
  const actualCodePaths = Array.isArray(codeBundleEntries)
    ? codeBundleEntries.map((entry) => entry?.path)
    : [];
  const expectedCodePaths = expandRepositoryCodePaths(path.resolve(repoRoot), operationCodePaths(operationId));
  if (JSON.stringify(actualCodePaths) !== JSON.stringify(expectedCodePaths)) {
    throw new Error(`execution manifest contract drifted for operation code bundle: ${operationId}`);
  }
  if (operationId === 'canonical-item-image-projection-apply') {
    assertNoDynamicImports(path.resolve(repoRoot), expectedCodePaths);
  }
  return true;
}

function operationCodePaths(operationId) {
  return [...CODE_PATHS[operationId], AUTHORIZED_RUNNER_CODE_PATH];
}

function expandRepositoryCodePaths(repoRoot, seedPaths) {
  const paths = [];
  const seen = new Set();
  const queue = [...seedPaths];
  while (queue.length > 0) {
    const relativePath = queue.shift();
    if (seen.has(relativePath)) continue;
    const fullPath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      throw new Error(`operation code file is missing: ${relativePath}`);
    }
    seen.add(relativePath);
    paths.push(relativePath);
    if (!relativePath.endsWith('.mjs')) continue;
    const source = fs.readFileSync(fullPath, 'utf8');
    for (const specifier of staticRelativeImports(source)) {
      let importedPath = path.posix.normalize(path.posix.join(
        path.posix.dirname(relativePath),
        specifier,
      ));
      if (!path.posix.extname(importedPath)) importedPath += '.mjs';
      const importedFullPath = path.join(repoRoot, importedPath);
      if (fs.existsSync(importedFullPath) && fs.statSync(importedFullPath).isFile()
          && !seen.has(importedPath)) {
        queue.push(importedPath);
      }
    }
  }
  return paths;
}

function staticRelativeImports(source) {
  const imports = [];
  for (const pattern of [
    /(?:import\s+(?:[^'\"]*?\s+from\s+)?|export\s+[^'\"]*?\s+from\s+)['\"](\.[^'\"]+)['\"]/g,
    /import\s*\(\s*['\"](\.[^'\"]+)['\"]\s*\)/g,
  ]) {
    for (const match of source.matchAll(pattern)) imports.push(match[1]);
  }
  return imports;
}

function assertNoDynamicImports(repoRoot, codePaths) {
  for (const relativePath of codePaths) {
    if (!relativePath.endsWith('.mjs')) continue;
    const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
    if (containsDynamicImport(source)) {
      throw new Error(`projection code bundle forbids dynamic import(): ${relativePath}`);
    }
  }
}

function containsDynamicImport(source) {
  const tokens = javascriptTokens(source);
  return tokens.some((token, index) => (
    token === 'import' && tokens[index - 1] !== '.' && tokens[index + 1] === '('
  ));
}

function javascriptTokens(source) {
  const shebangEnd = source.startsWith('#!') ? source.indexOf('\n') : 0;
  const start = shebangEnd === -1 ? source.length : shebangEnd;
  return scanJavascriptTokens(source, start, false).tokens;
}

function scanJavascriptTokens(source, start, stopAtClosingBrace) {
  const tokens = [];
  let index = start;
  let canStartRegex = true;
  let braceDepth = 0;
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === '/' && next === '/') {
      index = skipLineComment(source, index + 2);
      continue;
    }
    if (character === '/' && next === '*') {
      index = skipBlockComment(source, index + 2);
      continue;
    }
    if (character === "'" || character === '"') {
      index = skipQuotedLiteral(source, index + 1, character);
      canStartRegex = false;
      continue;
    }
    if (character === '`') {
      const template = scanTemplateTokens(source, index + 1);
      tokens.push(...template.tokens);
      index = template.index;
      canStartRegex = false;
      continue;
    }
    if (character === '/' && canStartRegex) {
      index = skipRegexLiteral(source, index + 1);
      canStartRegex = false;
      continue;
    }
    if (character === '{') {
      tokens.push(character);
      braceDepth += 1;
      index += 1;
      canStartRegex = true;
      continue;
    }
    if (character === '}') {
      if (stopAtClosingBrace && braceDepth === 0) {
        return { tokens, index: index + 1 };
      }
      tokens.push(character);
      braceDepth = Math.max(0, braceDepth - 1);
      index += 1;
      canStartRegex = false;
      continue;
    }
    if (/[A-Za-z_$]/.test(character)) {
      const start = index;
      index += 1;
      while (/[A-Za-z0-9_$]/.test(source[index] ?? '')) index += 1;
      const token = source.slice(start, index);
      tokens.push(token);
      canStartRegex = REGEX_PREFIX_KEYWORDS.has(token);
      continue;
    }
    if (/[0-9]/.test(character)) {
      index += 1;
      while (/[A-Za-z0-9_.]/.test(source[index] ?? '')) index += 1;
      tokens.push('literal');
      canStartRegex = false;
      continue;
    }
    tokens.push(character);
    index += 1;
    canStartRegex = REGEX_PREFIX_PUNCTUATORS.has(character);
  }
  return { tokens, index };
}

const REGEX_PREFIX_KEYWORDS = new Set([
  'await', 'case', 'delete', 'do', 'else', 'in', 'instanceof', 'new', 'of',
  'return', 'throw', 'typeof', 'void', 'yield',
]);
const REGEX_PREFIX_PUNCTUATORS = new Set([
  '(', '[', '{', ',', ';', ':', '=', '!', '?', '&', '|', '+', '-', '*', '%',
  '^', '~', '<', '>',
]);

function skipLineComment(source, index) {
  const newline = source.indexOf('\n', index);
  return newline === -1 ? source.length : newline + 1;
}

function skipBlockComment(source, index) {
  const end = source.indexOf('*/', index);
  return end === -1 ? source.length : end + 2;
}

function skipQuotedLiteral(source, index, quote) {
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (source[index] === quote) return index + 1;
    index += 1;
  }
  return source.length;
}

function scanTemplateTokens(source, index) {
  const tokens = [];
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (source[index] === '`') return { tokens, index: index + 1 };
    if (source[index] === '$' && source[index + 1] === '{') {
      const expression = scanJavascriptTokens(source, index + 2, true);
      tokens.push(...expression.tokens);
      index = expression.index;
      continue;
    }
    index += 1;
  }
  return { tokens, index };
}

function skipRegexLiteral(source, index) {
  let inCharacterClass = false;
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (source[index] === '[') inCharacterClass = true;
    if (source[index] === ']') inCharacterClass = false;
    if (source[index] === '/' && !inCharacterClass) {
      index += 1;
      while (/[A-Za-z]/.test(source[index] ?? '')) index += 1;
      return index;
    }
    index += 1;
  }
  return source.length;
}

export function writeCanonicalOperationExecutionManifest({ outputPath, ...options } = {}) {
  const output = path.resolve(requireText(outputPath, 'outputPath'));
  const manifest = buildCanonicalOperationExecutionManifest(options);
  const projectionManifestPath = manifest.itemImageProjectionAttempt?.manifestPath ?? null;
  const provenanceManifestPath = manifest.itemImageProvenanceAttempt?.manifestPath ?? null;
  const twoItemManifestPath = manifest.twoItemImageQuarantineRepairAttempt?.manifestPath ?? null;
  const itemSourceAdmissionManifestPath = manifest.itemSourceLocalNpcAdmissionAttempt?.manifestPath ?? null;
  const exactAttemptManifestPath = projectionManifestPath
    ?? provenanceManifestPath
    ?? twoItemManifestPath
    ?? itemSourceAdmissionManifestPath;
  const exactAttempt = manifest.itemImageProjectionAttempt
    ?? manifest.itemImageProvenanceAttempt
    ?? manifest.twoItemImageQuarantineRepairAttempt
    ?? manifest.itemSourceLocalNpcAdmissionAttempt;
  if (exactAttemptManifestPath != null) {
    const expectedOutput = path.resolve(options.repoRoot ?? process.cwd(), exactAttemptManifestPath);
    const retainedResult = path.resolve(
      options.repoRoot ?? process.cwd(),
      exactAttempt.resultPath,
    );
    if (pathEntryExists(retainedResult)) {
      throw new Error('attempt retained result already exists; retry requires a new attempt');
    }
    if (output !== expectedOutput) {
      throw new Error('attempt execution manifest output must be the exact attempt execution-manifest.json path');
    }
    assertRepositoryPathConfinement({
      repoRoot: options.repoRoot ?? process.cwd(),
      filePath: output,
      label: 'attempt execution manifest',
    });
    if (fs.existsSync(output)) {
      throw new Error('attempt execution manifest already exists; overwrite is forbidden');
    }
  } else {
    fs.mkdirSync(path.dirname(output), { recursive: true });
  }
  const temporary = `${output}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    if (projectionManifestPath != null || itemSourceAdmissionManifestPath != null) {
      fs.linkSync(temporary, output);
      fs.unlinkSync(temporary);
    } else {
      fs.renameSync(temporary, output);
    }
    fs.chmodSync(output, 0o600);
  } catch (error) {
    if (exactAttemptManifestPath != null && error?.code === 'EEXIST') {
      throw new Error('attempt execution manifest already exists; overwrite is forbidden');
    }
    throw error;
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return manifest;
}

function pathEntryExists(filePath) {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function buildDefinition(
  repoRoot,
  operationId,
  artifactDate,
  npcLimit,
  backendApiBase,
  npcT1Acceptance,
  resultLabel,
  itemImagePromotionBundlePath,
  managedObjectOrigin,
  legacyOriginRepair,
  legacyOrigin,
  expectedLegacyCount,
  shimmerImport,
  itemImageLineageAttemptRoot,
  itemImageProvenanceAttemptRoot,
  twoItemImageQuarantineRepairAttemptRoot,
  itemImageProjectionAttemptRoot,
  itemImageProjectionMissingRowInsertAttemptRoot,
  itemCanonicalBaseEntityRestorationAttemptRoot,
  itemSourceLocalNpcAdmissionAttemptRoot,
  npcT2AttemptRoot,
  bossSourceSnapshotHash,
  policyCeilingRegistrationMode,
  l1RunRoot,
) {
  const definitions = {
    'canonical-biome-image-contract-apply': {
      executionClass: 'formal_biome_image_schema_contract',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
        '--input=reports/authorization/canonical/canonical-biome-image-contract-apply.input.json',
        '--apply=true',
        '--output=reports/authorization/canonical/canonical-biome-image-contract-apply.result.json',
      ],
      inputPaths: ['reports/authorization/canonical/canonical-biome-image-contract-apply.input.json'],
      outputPaths: ['reports/authorization/canonical/canonical-biome-image-contract-apply.result.json'],
      reportPaths: [],
      progressPaths: [],
      databaseWrites: true,
      networkAccess: false,
    },
    'automation-biomes-l0-bootstrap': {
      executionClass: 'formal_database_bootstrap',
      command: [
        'node',
        CANONICAL_OPERATION_ENTRYPOINTS[operationId],
        '--input=reports/authorization/canonical/automation-biomes-l0-bootstrap.input.json',
        '--output=reports/authorization/canonical/automation-biomes-l0-bootstrap.result.json',
        '--apply=true',
      ],
      inputPaths: ['reports/authorization/canonical/automation-biomes-l0-bootstrap.input.json'],
      outputPaths: ['reports/authorization/canonical/automation-biomes-l0-bootstrap.result.json'],
      reportPaths: [],
      progressPaths: [],
      databaseWrites: true,
      networkAccess: false,
    },
    'canonical-item-image-source-verification': {
      executionClass: 'bounded_network_crawler',
      command: [
        'node',
        CANONICAL_OPERATION_ENTRYPOINTS[operationId],
        '--mode=apply',
        '--steps=item-image-source-verification',
        '--output=reports/backend-refresh/history/canonical-item-image-source-verification.json',
      ],
      inputPaths: [
        'reports/authorization/canonical/canonical-item-image-source-verification.input.json',
      ],
      outputPaths: ['reports/audit/item-image-source-verification.round-04-2026-08-01.json'],
      reportPaths: [
        'reports/audit/item-image-source-verification.round-04-2026-08-01.json',
        'reports/backend-refresh/history/canonical-item-image-source-verification.json',
      ],
      progressPaths: [
        'reports/backend-refresh/history/canonical-item-image-source-verification.runtime/item-image-source-verification.child-status.json',
      ],
      sources: ['https://terraria.wiki.gg/api.php'],
      bounds: {
        unresolvedIdentityCount: 9,
        batchSize: 8,
        maxRequests: 9,
        serial: true,
      },
      databaseWrites: false,
      networkAccess: true,
    },
    ...(operationId === 'canonical-item-image-lineage-apply'
      ? { [operationId]: lineageDefinition({
        operationId,
        attemptRoot: itemImageLineageAttemptRoot,
      }) }
      : {}),
    [ITEM_IMAGE_PROVENANCE_OPERATION_ID]: narrowImagePatchDefinition({
      operationId: ITEM_IMAGE_PROVENANCE_OPERATION_ID,
      ownershipKeys: [
        'maint.maint_item_images.source_page',
        'maint.maint_item_images.source_revision_timestamp',
        'maint.maint_item_images.original_url',
        'relation.relation_item_images.source_page',
        'relation.relation_item_images.source_revision_timestamp',
        'relation.relation_item_images.original_url',
        'local.item_images.source_page',
        'local.item_images.source_revision_timestamp',
        'local.item_images.original_url',
      ],
    }),
    [BUFF_IMAGE_PROJECTION_OPERATION_ID]: narrowImagePatchDefinition({
      operationId: BUFF_IMAGE_PROJECTION_OPERATION_ID,
      ownershipKeys: ['relation.projection_buffs.image'],
    }),
    [NPC_BUFF_RELATION_RECOVERY_OPERATION_ID]: {
      executionClass: 'formal_npc_buff_relation_recovery',
      command: [
        'node',
        CANONICAL_OPERATION_ENTRYPOINTS[NPC_BUFF_RELATION_RECOVERY_OPERATION_ID],
        '--apply=true',
      ],
      inputPaths: [
        'reports/authorization/canonical/canonical-npc-buff-relation-recovery.retry-02.input.json',
        'reports/runtime/local-data-chain-closure/20260824/ten-blocker-closure/072100/npc-buff-relation-recovery.proposal.json',
      ],
      outputPaths: [
        'reports/authorization/canonical/canonical-npc-buff-relation-recovery.retry-02.result.json',
      ],
      reportPaths: [],
      progressPaths: [],
      ownershipKeys: ['relation.npc_buff_relations.buffs'],
      requiredOperationIds: [],
      databaseWrites: true,
      networkAccess: false,
    },
    [NPC_LOOT_IDENTITY_RESTORATION_OPERATION_ID]: {
      executionClass: 'formal_npc_loot_identity_restoration',
      command: [
        'node',
        CANONICAL_OPERATION_ENTRYPOINTS[NPC_LOOT_IDENTITY_RESTORATION_OPERATION_ID],
        '--apply=true',
      ],
      inputPaths: [
        'reports/authorization/canonical/canonical-npc-loot-identity-restoration.retry-01.input.json',
        'reports/runtime/local-data-chain-closure/20260824/ten-blocker-closure/072100/npc-loot-identity-restoration.proposal.json',
      ],
      outputPaths: [
        'reports/authorization/canonical/canonical-npc-loot-identity-restoration.retry-01.result.json',
      ],
      reportPaths: [],
      progressPaths: [],
      ownershipKeys: [
        'relation.item_npc_loot_relations.canonical_insert',
        'relation.item_npc_loot_relations.legacy_status_deleted',
        'relation.projection_npcs.loot_items_json',
      ],
      requiredOperationIds: [],
      databaseWrites: true,
      networkAccess: false,
    },
    [NPC_DUPLICATE_RELATION_RETIREMENT_OPERATION_ID]: npcDuplicateRelationRetirementDefinition(),
    ...Object.fromEntries([
      [
        ITEM_IMAGE_ORIGIN_NORMALIZATION_OPERATION_ID,
        'item-image-origin-normalization.proposal.json',
        [
          'relation.relation_item_images.cached_url',
          'relation.projection_items.image',
        ],
      ],
      [
        NPC_IMAGE_ORIGIN_NORMALIZATION_OPERATION_ID,
        'npc-image-origin-normalization.proposal.json',
        ['relation.projection_npcs.image_url'],
      ],
      [
        PROJECTILE_IMAGE_ORIGIN_NORMALIZATION_OPERATION_ID,
        'projectile-image-origin-normalization.proposal.json',
        ['relation.projection_projectiles.image_url'],
      ],
      [
        BIOME_IMAGE_ORIGIN_NORMALIZATION_OPERATION_ID,
        'biome-image-origin-normalization.proposal.json',
        ['relation.projection_biomes.icon_url'],
      ],
    ].map(([imageOperationId, proposalName, ownershipKeys]) => [imageOperationId, {
      executionClass: 'formal_projection_image_origin_normalization',
      command: [
        'node',
        CANONICAL_OPERATION_ENTRYPOINTS[imageOperationId],
        `--operation-id=${imageOperationId}`,
        '--apply=true',
      ],
      inputPaths: [
        `reports/authorization/canonical/${imageOperationId}.retry-01.input.json`,
        `reports/runtime/local-data-chain-closure/20260824/ten-blocker-closure/072100/${proposalName}`,
      ],
      outputPaths: [`reports/authorization/canonical/${imageOperationId}.retry-01.result.json`],
      reportPaths: [],
      progressPaths: [],
      ownershipKeys,
      requiredOperationIds: [],
      databaseWrites: true,
      networkAccess: false,
    }])),
    [ARMOR_SET_PROJECTION_RESTORATION_OPERATION_ID]: {
      executionClass: 'formal_armor_set_projection_restoration',
      command: [
        'node',
        CANONICAL_OPERATION_ENTRYPOINTS[ARMOR_SET_PROJECTION_RESTORATION_OPERATION_ID],
        `--operation-id=${ARMOR_SET_PROJECTION_RESTORATION_OPERATION_ID}`,
        '--apply=true',
      ],
      inputPaths: [
        'reports/authorization/canonical/canonical-armor-set-projection-restoration.retry-05.input.json',
        'reports/runtime/local-data-chain-closure/20260824/ten-blocker-closure/072100/armor-set-projection-restoration.retry-02.proposal.json',
      ],
      outputPaths: [
        'reports/authorization/canonical/canonical-armor-set-projection-restoration.retry-05.result.json',
      ],
      reportPaths: [],
      progressPaths: [],
      ownershipKeys: ['relation.projection_armor_sets.insert'],
      requiredOperationIds: [],
      databaseWrites: true,
      networkAccess: false,
    },
    [TWO_ITEM_IMAGE_QUARANTINE_REPAIR_OPERATION_ID]: narrowImagePatchDefinition({
      operationId: TWO_ITEM_IMAGE_QUARANTINE_REPAIR_OPERATION_ID,
      ownershipKeys: [
        'maint.maint_item_images.source_file_title',
        'maint.maint_item_images.source_page',
        'maint.maint_item_images.source_revision_timestamp',
        'maint.maint_item_images.original_url',
        'maint.maint_item_images.cached_url',
        'relation.relation_item_images.source_file_title',
        'relation.relation_item_images.source_page',
        'relation.relation_item_images.source_revision_timestamp',
        'relation.relation_item_images.original_url',
        'relation.relation_item_images.cached_url',
        'local.item_images.source_file_title',
        'local.item_images.source_page',
        'local.item_images.source_revision_timestamp',
        'local.item_images.original_url',
        'local.item_images.cached_url',
        'relation.projection_items.image',
        'local.items.image',
      ],
    }),
    ...(operationId === 'canonical-item-image-projection-apply'
      ? { [operationId]: projectionDefinition({
        repoRoot,
        operationId,
        attemptRoot: itemImageProjectionAttemptRoot,
      }) }
      : {}),
    ...(operationId === ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID
      ? { [operationId]: itemSourceLocalNpcAdmissionDefinition({
        repoRoot,
        operationId,
        attemptRoot: itemSourceLocalNpcAdmissionAttemptRoot,
      }) }
      : {}),
    ...(['canonical-item-projection-parity-apply', 'canonical-npc-projection-parity-apply', 'canonical-boss-projection-parity-apply'].includes(operationId)
      ? { [operationId]: parityDefinition({ operationId }) }
      : {}),
    ...(operationId === 'canonical-item-image-provenance-patch' && itemImageProvenanceAttemptRoot != null
      ? { [operationId]: provenanceDefinition({
        operationId,
        attemptRoot: itemImageProvenanceAttemptRoot,
      }) }
      : {}),
    ...(operationId === 'canonical-two-item-image-quarantine-repair' && twoItemImageQuarantineRepairAttemptRoot != null
      ? { [operationId]: twoItemQuarantineDefinition({ operationId, attemptRoot: twoItemImageQuarantineRepairAttemptRoot }) }
      : {}),
    ...(operationId === 'canonical-item-image-projection-missing-row-insert'
      ? { [operationId]: missingRowInsertDefinition({
        operationId,
        attemptRoot: itemImageProjectionMissingRowInsertAttemptRoot,
      }) }
      : {}),
    ...(operationId === 'canonical-item-base-entity-restoration'
      ? { [operationId]: baseEntityRestorationDefinition({
        operationId,
        attemptRoot: itemCanonicalBaseEntityRestorationAttemptRoot,
      }) }
      : {}),
    'canonical-item-image-source-promotion': {
      executionClass: 'formal_standardized_apply',
      command: [
        'node',
        CANONICAL_OPERATION_ENTRYPOINTS[operationId],
        '--input-contract=reports/authorization/canonical/canonical-item-image-source-promotion.input.json',
        '--apply=true',
      ],
      inputPaths: [
        'reports/authorization/canonical/canonical-item-image-source-promotion.input.json',
      ],
      outputPaths: [
        'data/standardized/items.standardized.json',
        'reports/authorization/canonical/canonical-item-image-source-promotion.result.json',
      ],
      reportPaths: [
        'reports/authorization/canonical/canonical-item-image-source-promotion.result.json',
      ],
      progressPaths: [],
      databaseWrites: false,
      networkAccess: false,
    },
    'canonical-image-sync': {
      executionClass: 'formal_asset_sync',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId], '--apply=true', '--scopes=items',
        `--apiBase=${requireBackendApiBase(operationId, backendApiBase)}`,
        `--local-evidence=${requireItemImagePromotionBundlePath(operationId, itemImagePromotionBundlePath)}`,
        `--managed-object-origin=${requireManagedObjectOrigin(operationId, managedObjectOrigin)}`,
        ...(legacyOriginRepair ? [
          '--legacy-origin-repair=true',
          `--legacy-origin=${requireLegacyOrigin(operationId, legacyOrigin)}`,
          `--expected-legacy-count=${requireExpectedLegacyCount(operationId, expectedLegacyCount)}`,
        ] : []),
        `--output=reports/workflow-image-sync-${artifactDate}.json`,
        '--progress-path=reports/backend-refresh/history/canonical-image-sync.runtime/child-status.json',
      ],
      inputPaths: [
        'data/standardized/items.standardized.json',
        'reports/authorization/canonical/canonical-item-image-source-promotion.result.json',
        requireItemImagePromotionBundlePath(operationId, itemImagePromotionBundlePath),
      ],
      outputPaths: ['data/standardized/items.standardized.json'],
      reportPaths: [`reports/workflow-image-sync-${artifactDate}.json`],
      progressPaths: ['reports/backend-refresh/history/canonical-image-sync.runtime/child-status.json'],
      databaseWrites: false,
      networkAccess: true,
    },
    'canonical-boss-import': {
      executionClass: 'formal_database_import',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
        `--apiBase=${requireBackendApiBase(operationId, backendApiBase)}`,
        '--input=data/generated/wiki-bosses.latest.json',
        `--report-json=reports/wiki-bosses-import-${artifactDate}.json`,
        '--database=terria_v1_local', '--dry-run=false', '--strict=true',
      ],
      inputPaths: ['data/generated/wiki-bosses.latest.json', 'data/generated/npc-standardized-map.json'],
      outputPaths: ['data/generated/npc-standardized-map.json'],
      reportPaths: [`reports/wiki-bosses-import-${artifactDate}.json`],
      progressPaths: [],
      databaseWrites: true,
      networkAccess: true,
    },
    'canonical-boss-source-refresh-offline': {
      executionClass: 'formal_offline_boss_source_refresh',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
        '--input=data/generated/wiki-bosses.latest.json',
        `--expected-sha256=${requireBossSourceSnapshotHash(operationId, bossSourceSnapshotHash)}`,
        '--database=terria_v1_local', '--port=13306',
        '--report-root=reports/runtime/local-data-chain-closure/boss-source-refresh-offline',
      ],
      inputPaths: ['data/generated/wiki-bosses.latest.json'],
      outputPaths: [
        'reports/runtime/local-data-chain-closure/boss-source-refresh-offline/landing-local.json',
        'reports/runtime/local-data-chain-closure/boss-source-refresh-offline/landing-maint.json',
      ],
      reportPaths: [
        'reports/runtime/local-data-chain-closure/boss-source-refresh-offline/landing-local.json',
        'reports/runtime/local-data-chain-closure/boss-source-refresh-offline/landing-maint.json',
      ],
      progressPaths: [],
      databaseWrites: true,
      networkAccess: false,
    },
    'canonical-projection-recovery-from-relation': {
      executionClass: 'formal_projection_recovery',
      command: ['node', CANONICAL_OPERATION_ENTRYPOINTS[operationId], '--apply=true'],
      inputPaths: [],
      outputPaths: [],
      reportPaths: [],
      progressPaths: [],
      databaseWrites: true,
      networkAccess: false,
    },
    'canonical-item-source-relation-recovery-from-maint': {
      executionClass: 'formal_relation_source_chain_recovery',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
        '--proposal=reports/runtime/local-data-chain-closure/20260823/relation-source-recovery/proposal.json',
        '--expected-sha256=sha256:022281e0a9e4c712872a2e3ce8cd5916d9e665038380972010afe244228cee70',
        '--backup=reports/runtime/local-data-chain-closure/20260823/relation-source-recovery/backup.json',
        '--output=reports/runtime/local-data-chain-closure/20260823/relation-source-recovery/result.json',
      ],
      inputPaths: ['reports/runtime/local-data-chain-closure/20260823/relation-source-recovery/proposal.json'],
      outputPaths: [
        'reports/runtime/local-data-chain-closure/20260823/relation-source-recovery/backup.json',
        'reports/runtime/local-data-chain-closure/20260823/relation-source-recovery/result.json',
      ],
      reportPaths: [],
      progressPaths: [],
      ownershipKeys: [
        'relation.item_source_facts',
        'relation.item_source_details',
        'relation.item_npc_shop_relations',
        'relation.item_npc_loot_relations',
        'relation.item_npc_relation_audits',
      ],
      requiredOperationIds: [],
      databaseWrites: true,
      networkAccess: false,
    },
    'canonical-projection-recovery-from-relation-v2': {
      executionClass: 'formal_projection_recovery_v2',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
        '--snapshot=reports/runtime/local-data-chain-closure/20260823/projection-recovery-v2/relation-snapshot.json',
        '--expected-sha256=sha256:52cdaba325ef9d6b72e1dc4724092dafe86b1c49b4c7a0374db7f28a846bee26',
        '--backup=reports/runtime/local-data-chain-closure/20260823/projection-recovery-v2/backup.json',
        '--output=reports/runtime/local-data-chain-closure/20260823/projection-recovery-v2/result.json',
      ],
      inputPaths: ['reports/runtime/local-data-chain-closure/20260823/projection-recovery-v2/relation-snapshot.json'],
      outputPaths: [
        'reports/runtime/local-data-chain-closure/20260823/projection-recovery-v2/backup.json',
        'reports/runtime/local-data-chain-closure/20260823/projection-recovery-v2/result.json',
      ],
      reportPaths: [],
      progressPaths: [],
      ownershipKeys: [
        'relation.projection_items',
        'relation.projection_npcs',
        'relation.projection_bosses',
        'relation.projection_projectiles',
        'relation.projection_buffs',
      ],
      requiredOperationIds: [],
      databaseWrites: true,
      networkAccess: false,
    },
    'canonical-boss-loot-import': {
      executionClass: 'formal_database_import',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
        '--bundle=data/wiki-crawler/normalized/boss-loot.bundle.json',
        `--report-json=reports/boss-loot-import-${artifactDate}.json`,
        '--database=terria_v1_local', '--dry-run=false', '--regenerate-bundle=false',
      ],
      inputPaths: ['data/wiki-crawler/normalized/boss-loot.bundle.json'],
      outputPaths: [],
      reportPaths: [`reports/boss-loot-import-${artifactDate}.json`],
      progressPaths: [],
      databaseWrites: true,
      networkAccess: false,
    },
    'canonical-projectile-backfill': {
      executionClass: 'bounded_network_backfill',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId], '--apply=true', '--limit=0',
        `--output=reports/projectile-zh-image-backfill-${artifactDate}.json`,
        '--progress-path=reports/backend-refresh/history/canonical-projectile-backfill.runtime/child-status.json',
      ],
      inputPaths: ['data/standardized/projectiles.standardized.json'],
      outputPaths: [
        'data/standardized/projectiles.standardized.json',
        'data/generated/projectile-zh-map.json',
      ],
      reportPaths: [`reports/projectile-zh-image-backfill-${artifactDate}.json`],
      progressPaths: ['reports/backend-refresh/history/canonical-projectile-backfill.runtime/child-status.json'],
      bounds: { inputCorpus: 'frozen_projectiles', limit: 0, serial: true },
      databaseWrites: false,
      networkAccess: true,
    },
    'canonical-recipe-crawler': {
      executionClass: 'bounded_network_crawler',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId], '--pages=\u914d\u65b9,\u914d\u65b9/\u5de5\u4f5c\u53f0',
        '--expand-child-pages=true', '--max-depth=1',
        '--output=data/generated/wiki-zh-recipe-pages.latest.json',
        `--md-output=reports/wiki-zh-recipe-pages-${artifactDate}.md`,
        '--progress-path=reports/backend-refresh/history/canonical-recipe-crawler.runtime/child-status.json',
      ],
      inputPaths: [],
      outputPaths: ['data/generated/wiki-zh-recipe-pages.latest.json'],
      reportPaths: [`reports/wiki-zh-recipe-pages-${artifactDate}.md`],
      progressPaths: [
        'reports/backend-refresh/history/canonical-recipe-crawler.runtime/child-status.json',
        'data/generated/wiki-sync-progress.latest.json',
      ],
      sources: ['https://terraria.wiki.gg/zh/api.php'],
      bounds: { seedPageCount: 2, maxDepth: 1, serial: true },
      databaseWrites: false,
      networkAccess: true,
    },
    'canonical-recipe-apply': {
      executionClass: 'formal_database_pipeline',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId], '--apply=true',
        '--input=data/generated/wiki-zh-recipe-pages.latest.json', '--database=terria_v1_local',
        `--import-report=reports/wiki-zh-recipe-import-${artifactDate}.json`,
        `--consolidation-report=reports/recipe-provider-consolidation-${artifactDate}.json`,
        `--output=reports/wiki-zh-recipe-sync-summary-${artifactDate}.json`,
      ],
      inputPaths: ['data/generated/wiki-zh-recipe-pages.latest.json'],
      outputPaths: [],
      reportPaths: [
        `reports/wiki-zh-recipe-import-${artifactDate}.json`,
        `reports/recipe-provider-consolidation-${artifactDate}.json`,
        `reports/wiki-zh-recipe-sync-summary-${artifactDate}.json`,
      ],
      progressPaths: [],
      databaseWrites: true,
      networkAccess: false,
    },
    'canonical-recipe-t1-acceptance': {
      executionClass: 'isolated_read_only_acceptance',
      command: ['node', 'pipelines/automation/run-live-automation-acceptance.mjs', '--profile=t1', '--scope=recipe-canonical', '--config-path=<private-recipe-t1-config>', '--config-sha256=<private-config-sha256>', '--redis-db=<isolated-redis-db>', '--run-id=<recipe-t1-run-id>', '--output=reports/canonical-migration/canonical-recipe-t1-acceptance.json'],
      inputPaths: ['pipelines/recipe/fixtures/recipe-t1.sample.json'],
      outputPaths: ['reports/canonical-migration/canonical-recipe-t1-acceptance.json'],
      reportPaths: ['reports/canonical-migration/canonical-recipe-t1-acceptance.json'],
      progressPaths: [],
      databaseWrites: false,
      isolatedResourceWrites: true,
      networkAccess: false,
    },
    'canonical-shimmer-generation': {
      executionClass: 'bounded_network_crawler',
      actionId: 'domain-source-shimmer',
      command: [
        'node',
        CANONICAL_OPERATION_ENTRYPOINTS[operationId],
        '--input-contract=reports/authorization/canonical/canonical-shimmer-generation.input.json',
        '--page=Shimmer',
        '--api=https://terraria.wiki.gg/zh/api.php',
        '--progress-path=data/generated/domain-source-shimmer-progress.latest.json',
        `--report-output=reports/wiki-shimmer-generation-${artifactDate}.md`,
      ],
      inputPaths: [
        'reports/authorization/canonical/canonical-shimmer-generation.input.json',
        'data/standardized/items.standardized.json',
        'data/standardized/npcs.standardized.json',
      ],
      outputPaths: ['data/generated/shimmer/wiki-shimmer-current-generation.json'],
      reportPaths: [`reports/wiki-shimmer-generation-${artifactDate}.md`],
      progressPaths: ['data/generated/domain-source-shimmer-progress.latest.json'],
      sources: ['https://terraria.wiki.gg/zh/api.php'],
      bounds: {
        pageTitle: 'Shimmer',
        rawRequests: 3,
        langlinkBatchSize: 8,
        maxLanglinkRequests: 128,
        maxRequests: 131,
        serial: true,
      },
      databaseWrites: false,
      networkAccess: true,
    },
    'canonical-shimmer-import': {
      executionClass: 'formal_database_import',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
        `--input-contract=${CANONICAL_SHIMMER_IMPORT_INPUT_CONTRACT_PATH}`,
        '--apply=true',
        `--output=${CANONICAL_SHIMMER_IMPORT_RESULT_PATH}`,
        '--database=terria_v1_local',
      ],
      inputPaths: [CANONICAL_SHIMMER_IMPORT_INPUT_CONTRACT_PATH],
      outputPaths: [CANONICAL_SHIMMER_IMPORT_RESULT_PATH],
      reportPaths: [],
      progressPaths: [],
      shimmerImport,
      databaseWrites: true,
      networkAccess: false,
    },
    'canonical-npc-crawler': {
      executionClass: 'bounded_network_crawler',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
        '--action-id=npc-crawler-facts-preview',
        '--targets-file=reports/authorization/canonical/canonical-npc-crawler.targets.json',
        `--limit=${npcLimit}`, '--output-root=data/wiki-crawler',
        '--progress-path=reports/backend-refresh/history/canonical-npc-crawler.runtime/child-status.json',
      ],
      inputPaths: ['reports/authorization/canonical/canonical-npc-crawler.targets.json'],
      outputPaths: [
        'data/wiki-crawler/normalized-light/npc',
        'data/wiki-crawler/canonical/npc',
        'data/wiki-crawler/audit/npc',
      ],
      reportPaths: [],
      progressPaths: ['reports/backend-refresh/history/canonical-npc-crawler.runtime/child-status.json'],
      sources: ['https://terraria.wiki.gg/api.php'],
      bounds: { targetLimit: npcLimit, serial: true },
      databaseWrites: false,
      networkAccess: true,
    },
    ...(operationId === 'canonical-npc-t1-acceptance'
      ? { [operationId]: npcT1AcceptanceDefinition(operationId, npcT1Acceptance) }
      : {}),
    ...(operationId === 'canonical-recipe-t1-acceptance'
      ? { [operationId]: recipeT1AcceptanceDefinition(operationId, npcT1Acceptance) }
      : {}),
    ...(operationId === 'canonical-boss-t1-acceptance'
      ? { [operationId]: bossT1AcceptanceDefinition(operationId, npcT1Acceptance) }
      : {}),
    ...(operationId === 'canonical-projectile-t1-acceptance'
      ? { [operationId]: projectileT1AcceptanceDefinition(operationId, npcT1Acceptance) }
      : {}),
    ...(operationId === 'canonical-buff-t1-acceptance'
      ? { [operationId]: buffT1AcceptanceDefinition(operationId, npcT1Acceptance) }
      : {}),
    ...(operationId === 'canonical-biome-t1-acceptance'
      ? { [operationId]: biomeT1AcceptanceDefinition(operationId, npcT1Acceptance) }
      : {}),
    ...(operationId === 'canonical-crawler-v2-scheduler-t1-acceptance'
      ? { [operationId]: schedulerT1AcceptanceDefinition(operationId, npcT1Acceptance) }
      : {}),
    ...(operationId === 'canonical-crawler-v2-items-t1-acceptance'
      ? { [operationId]: schedulerT1AcceptanceDefinition(operationId, npcT1Acceptance, { itemMode: true }) }
      : {}),
    ...(operationId === 'canonical-crawler-v2-scheduler-activation'
      ? { [operationId]: schedulerActivationProposalDefinition(operationId) }
      : {}),
    ...(operationId === 'canonical-npc-t2-cutover-verification'
      ? { [operationId]: npcT2Definition({ operationId, attemptRoot: npcT2AttemptRoot, backendApiBase }) }
      : {}),
    'canonical-schema-v56-v58': {
      executionClass: 'formal_schema_migration',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
        '--output=reports/authorization/canonical/canonical-schema-v56-v58.result.json',
        '--apply=true',
      ],
      inputPaths: [
        'services/catalog-api/src/main/resources/db/migration/V56__extend_source_dataset_landings_for_canonical_inputs.sql',
        'services/catalog-api/src/main/resources/db/migration/V57__create_canonical_item_group_runtime_tables.sql',
        'services/catalog-api/src/main/resources/db/migration/V58__create_crawler_automation_activation_decisions.sql',
      ],
      outputPaths: ['reports/authorization/canonical/canonical-schema-v56-v58.result.json'],
      reportPaths: [],
      progressPaths: [],
      databaseWrites: true,
      networkAccess: false,
    },
    'canonical-item-group-bootstrap': {
      executionClass: 'formal_database_bootstrap',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
        '--action-id=item-group-canonical-apply',
        '--input=reports/authorization/canonical/canonical-item-group-bootstrap.input.json',
        '--output=reports/authorization/canonical/canonical-item-group-bootstrap.result.json',
        '--progress-path=reports/backend-refresh/history/canonical-item-group-bootstrap.runtime/child-status.json',
      ],
      inputPaths: [
        'reports/authorization/canonical/canonical-item-group-bootstrap.input.json',
        'data/generated/recipe-material-reference.json',
        'data/generated/recipe-group-overrides.json',
        'data/generated/item-group-overrides.json',
        'data/standardized/items.standardized.json',
      ],
      outputPaths: ['reports/authorization/canonical/canonical-item-group-bootstrap.result.json'],
      reportPaths: [],
      progressPaths: ['reports/backend-refresh/history/canonical-item-group-bootstrap.runtime/child-status.json'],
      databaseWrites: true,
      networkAccess: false,
    },
    ...(GOVERNED_L1_OPERATION_DOMAINS[operationId]
      ? {
        [operationId]: governedL1Definition({
          repoRoot,
          operationId,
          l1RunRoot,
        }),
      }
      : {}),
    'automation-biomes-l1-policy-promotion': policyDecisionDefinition({ operationId }),
    'automation-biomes-first-l1': biomesApplyDefinition({ operationId }),
    'automation-biomes-second-l1': biomesApplyDefinition({ operationId }),
    'automation-biomes-l2-promotion': policyDecisionDefinition({ operationId }),
    ...Object.fromEntries(Object.entries(L2_OPERATION_IDS).map(([domainId, operationId]) => [
      operationId,
      policyDecisionDefinition({ operationId }),
    ])),
    ...Object.fromEntries(Object.values(L2_OPERATION_IDS).map((promotionOperationId) => {
      const operationId = promotionOperationId.replace(/-l2-promotion$/, '-l2-policy-ceiling-registration');
      return [operationId, policyCeilingRegistrationDefinition({ operationId, mode: policyCeilingRegistrationMode })];
    })),
    'automation-biomes-scheduler-activation': policyDecisionDefinition({ operationId }),
    'automation-crawler-v2-scheduler-activation': policyDecisionDefinition({ operationId }),
    'automation-crawler-v2-scheduler-reactivation': policyDecisionDefinition({ operationId }),
    ...Object.fromEntries(['items', 'projectiles'].flatMap((domainId) => [
      [`automation-${domainId}-l0-bootstrap`, supplementaryBootstrapDefinition({
        operationId: `automation-${domainId}-l0-bootstrap`,
      })],
      [`automation-${domainId}-l1-policy-promotion`, policyDecisionDefinition({
        operationId: `automation-${domainId}-l1-policy-promotion`,
      })],
    ])),
    ...Object.fromEntries(['audio', 'bosses', 'shimmer'].flatMap((domainId) => [
      [`automation-${domainId}-l0-bootstrap`, supplementaryBootstrapDefinition({
        operationId: `automation-${domainId}-l0-bootstrap`,
      })],
      [`automation-${domainId}-l1-policy-promotion`, policyDecisionDefinition({
        operationId: `automation-${domainId}-l1-policy-promotion`,
      })],
    ])),
    ...Object.fromEntries(NPC_OWNER_OPERATION_IDS.map((npcOperationId) => [
      npcOperationId,
      npcOwnerDefinition({
        operationId: npcOperationId,
        resultLabel: npcOperationId === operationId ? resultLabel : null,
      }),
    ])),
    ...Object.fromEntries(NPC_BASE_MAINT_OPERATION_IDS.map((npcOperationId) => [
      npcOperationId,
      npcBaseMaintDefinition({ operationId: npcOperationId }),
    ])),
    [NPC_DUPLICATE_QUARANTINE_OPERATION_ID]: npcDuplicateQuarantineDefinition(),
    [NPC_STALE_LINEAGE_RETIREMENT_OPERATION_ID]: npcStaleLineageRetirementDefinition(),
    [NPC_PARENT_CONFLICT_RETIREMENT_OPERATION_ID]: npcParentConflictRetirementDefinition(),
    [NPC_INDEPENDENT_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID]: npcIndependentWikiGgVariantRetirementDefinition(),
    [NPC_PROJECTION_TEXT_IDENTITY_REPAIR_OPERATION_ID]: npcProjectionTextIdentityRepairDefinition(),
    [NPC_PROJECTION_TEXT_IDENTITY_RESIDUAL_REPAIR_OPERATION_ID]: npcProjectionTextIdentityResidualRepairDefinition(),
    [NPC_PROJECTION_GAP_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID]: npcProjectionGapWikiGgVariantRetirementDefinition(),
    [NPC_LOCAL_LOOT_COMPATIBILITY_RETIREMENT_OPERATION_ID]: npcLocalLootCompatibilityRetirementDefinition(),
    [NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID]: npcExternalRelationScopeDefinition(),
  };
  return definitions[operationId];
}

function narrowImagePatchDefinition({ operationId, ownershipKeys }) {
  const inputPath = `reports/authorization/canonical/${operationId}.input.json`;
  const previewPath = operationId === TWO_ITEM_IMAGE_QUARANTINE_REPAIR_OPERATION_ID
    ? 'reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/two-item-quarantine-repair.preview.json'
    : `reports/runtime/local-data-chain-closure/20260820/image-provenance-closure/${operationId}.preview.json`;
  const resultPath = `reports/authorization/canonical/${operationId}.result.json`;
  return {
    executionClass: 'formal_narrow_image_patch',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      `--input=${inputPath}`,
      `--preview=${previewPath}`,
      '--apply=true',
      `--output=${resultPath}`,
    ],
    inputPaths: [inputPath, previewPath],
    outputPaths: [resultPath],
    reportPaths: [],
    progressPaths: [],
    ownershipKeys,
    requiredOperationIds: [],
    databaseWrites: true,
    networkAccess: false,
  };
}

function npcExternalRelationScopeDefinition() {
  const resultPath = `reports/authorization/canonical/${NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID}.result.json`;
  return {
    executionClass: 'formal_npc_external_relation_scope_apply',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[NPC_EXTERNAL_RELATION_SCOPE_OPERATION_ID],
      `--bundle=${NPC_EXTERNAL_RELATION_SCOPE_BUNDLE_PATH}`,
      `--preview=${NPC_EXTERNAL_RELATION_SCOPE_PREVIEW_PATH}`,
      `--projection=${NPC_EXTERNAL_RELATION_SCOPE_PROJECTION_PATH}`,
      `--server-fingerprint=${NPC_EXTERNAL_RELATION_SCOPE_SERVER_FINGERPRINT_PATH}`,
      '--apply=true',
      `--output=${resultPath}`,
    ],
    inputPaths: [
      NPC_EXTERNAL_RELATION_SCOPE_BUNDLE_PATH,
      NPC_EXTERNAL_RELATION_SCOPE_PREVIEW_PATH,
      NPC_EXTERNAL_RELATION_SCOPE_PROJECTION_PATH,
      NPC_EXTERNAL_RELATION_SCOPE_SERVER_FINGERPRINT_PATH,
    ],
    outputPaths: [resultPath],
    reportPaths: [],
    progressPaths: [],
    ownershipKeys: [...NPC_EXTERNAL_RELATION_SCOPE_BINDING.writeTargets],
    requiredOperationIds: [],
    npcExternalRelationScope: {
      scopeSha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.scopeSha256,
      bundleSha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.bundleSha256,
      previewSha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.previewSha256,
      projectionSha256: NPC_EXTERNAL_RELATION_SCOPE_BINDING.projectionSha256,
      unresolvedCandidateCount: NPC_EXTERNAL_RELATION_SCOPE_BINDING.unresolvedCandidateCount,
      quarantinedFactCount: NPC_EXTERNAL_RELATION_SCOPE_BINDING.quarantinedFactCount,
    },
    databaseWrites: true,
    networkAccess: false,
  };
}

function npcDuplicateQuarantineDefinition() {
  const resultPath = `reports/authorization/canonical/${NPC_DUPLICATE_QUARANTINE_OPERATION_ID}.result.json`;
  return {
    executionClass: 'formal_npc_exact_row_quarantine',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[NPC_DUPLICATE_QUARANTINE_OPERATION_ID],
      '--input=reports/authorization/canonical/canonical-npc-duplicate-quarantine.input.json',
      `--output=${resultPath}`,
      '--apply=true',
    ],
    inputPaths: [...CANONICAL_OPERATION_DATA_PATHS[NPC_DUPLICATE_QUARANTINE_OPERATION_ID]],
    outputPaths: [resultPath],
    reportPaths: [],
    progressPaths: [],
    ownershipKeys: [
      'relation.item_source_facts.items',
      'relation.item_source_details.items',
      'relation.item_npc_loot_relations.items',
      'local.npc_loot_entries.non_boss',
    ],
    requiredOperationIds: [],
    databaseWrites: true,
    networkAccess: false,
  };
}

function npcDuplicateRelationRetirementDefinition() {
  const operationId = NPC_DUPLICATE_RELATION_RETIREMENT_OPERATION_ID;
  const inputPath = 'reports/authorization/canonical/canonical-npc-loot-duplicate-relation-retirement.input.json';
  const proposalPath = 'reports/runtime/local-data-chain-closure/20260825/parent-final-1055/npc-duplicate-relation-retirement.proposal.json';
  const resultPath = `reports/authorization/canonical/${operationId}.result.json`;
  return {
    executionClass: 'formal_npc_duplicate_relation_retirement',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      `--input=${inputPath}`,
      `--proposal=${proposalPath}`,
      `--output=${resultPath}`,
      '--apply=true',
    ],
    inputPaths: [inputPath, proposalPath],
    outputPaths: [resultPath],
    reportPaths: [],
    progressPaths: [],
    ownershipKeys: ['relation.item_npc_loot_relations.status_deleted'],
    requiredOperationIds: [],
    databaseWrites: true,
    networkAccess: false,
  };
}

function npcStaleLineageRetirementDefinition() {
  const resultPath = `reports/authorization/canonical/${NPC_STALE_LINEAGE_RETIREMENT_OPERATION_ID}.result.json`;
  const inputPath = `reports/authorization/canonical/${NPC_STALE_LINEAGE_RETIREMENT_OPERATION_ID}.input.json`;
  const previewPath = 'reports/runtime/local-data-chain-closure/20260819/npc-stale-lineage-repair-preview.json';
  return {
    executionClass: 'formal_npc_stale_lineage_retirement',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[NPC_STALE_LINEAGE_RETIREMENT_OPERATION_ID],
      `--input=${inputPath}`,
      `--preview=${previewPath}`,
      `--output=${resultPath}`,
      '--apply=true',
    ],
    inputPaths: [inputPath, previewPath],
    outputPaths: [resultPath],
    reportPaths: [],
    progressPaths: [],
    ownershipKeys: [
      'relation.item_source_facts.stale_generated_lineage',
      'relation.item_source_details.stale_generated_lineage',
      'relation.item_npc_loot_relations.stale_generated_lineage',
      'relation.item_npc_shop_relations.stale_generated_lineage',
    ],
    requiredOperationIds: [],
    databaseWrites: true,
    networkAccess: false,
  };
}

function npcParentConflictRetirementDefinition() {
  const resultPath = `reports/authorization/canonical/${NPC_PARENT_CONFLICT_RETIREMENT_OPERATION_ID}.result.json`;
  const inputPath = `reports/authorization/canonical/${NPC_PARENT_CONFLICT_RETIREMENT_OPERATION_ID}.input.json`;
  const previewPath = 'reports/runtime/local-data-chain-closure/20260819/post-stale-lineage/npc-stale-lineage-parent-conflict-preview.json';
  return {
    executionClass: 'formal_npc_stale_lineage_parent_conflict_retirement',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[NPC_PARENT_CONFLICT_RETIREMENT_OPERATION_ID],
      `--input=${inputPath}`,
      `--preview=${previewPath}`,
      `--output=${resultPath}`,
      '--apply=true',
    ],
    inputPaths: [inputPath, previewPath],
    outputPaths: [resultPath],
    reportPaths: [],
    progressPaths: [],
    ownershipKeys: ['relation.item_npc_loot_relations.parent_conflict_old_generated'],
    requiredOperationIds: [],
    databaseWrites: true,
    networkAccess: false,
  };
}

function npcIndependentWikiGgVariantRetirementDefinition() {
  const resultPath = `reports/authorization/canonical/${NPC_INDEPENDENT_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID}.result.json`;
  const inputPath = `reports/authorization/canonical/${NPC_INDEPENDENT_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID}.input.json`;
  const previewPath = 'reports/runtime/local-data-chain-closure/20260819/post-parent-conflict/npc-independent-wiki-gg-variant-retirement-preview.json';
  return {
    executionClass: 'formal_npc_independent_wiki_gg_variant_retirement',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[NPC_INDEPENDENT_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID],
      `--input=${inputPath}`,
      `--preview=${previewPath}`,
      `--output=${resultPath}`,
      '--apply=true',
    ],
    inputPaths: [inputPath, previewPath],
    outputPaths: [resultPath],
    reportPaths: [],
    progressPaths: [],
    ownershipKeys: ['relation.item_npc_loot_relations.independent_wiki_gg_variant'],
    requiredOperationIds: [],
    databaseWrites: true,
    networkAccess: false,
  };
}

function npcProjectionTextIdentityRepairDefinition() {
  const resultPath = `reports/authorization/canonical/${NPC_PROJECTION_TEXT_IDENTITY_REPAIR_OPERATION_ID}.result.json`;
  const inputPath = `reports/authorization/canonical/${NPC_PROJECTION_TEXT_IDENTITY_REPAIR_OPERATION_ID}.input.json`;
  const previewPath = 'reports/runtime/local-data-chain-closure/20260819/post-parent-conflict/npc-projection-text-identity-repair-preview.json';
  return {
    executionClass: 'formal_npc_projection_text_identity_repair',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[NPC_PROJECTION_TEXT_IDENTITY_REPAIR_OPERATION_ID],
      `--input=${inputPath}`,
      `--preview=${previewPath}`,
      `--output=${resultPath}`,
      '--apply=true',
    ],
    inputPaths: [inputPath, previewPath],
    outputPaths: [resultPath],
    reportPaths: [],
    progressPaths: [],
    ownershipKeys: ['relation.projection_npcs.loot_items_json'],
    requiredOperationIds: [NPC_INDEPENDENT_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID],
    databaseWrites: true,
    networkAccess: false,
  };
}

function npcProjectionTextIdentityResidualRepairDefinition() {
  const resultPath = `reports/authorization/canonical/${NPC_PROJECTION_TEXT_IDENTITY_RESIDUAL_REPAIR_OPERATION_ID}.result.json`;
  const inputPath = `reports/authorization/canonical/${NPC_PROJECTION_TEXT_IDENTITY_RESIDUAL_REPAIR_OPERATION_ID}.input.json`;
  const previewPath = 'reports/runtime/local-data-chain-closure/20260819/post-final/npc-projection-text-identity-residual-preview.json';
  return {
    executionClass: 'formal_npc_projection_text_identity_residual_repair',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[NPC_PROJECTION_TEXT_IDENTITY_RESIDUAL_REPAIR_OPERATION_ID],
      `--input=${inputPath}`,
      `--preview=${previewPath}`,
      `--output=${resultPath}`,
      '--apply=true',
    ],
    inputPaths: [inputPath, previewPath],
    outputPaths: [resultPath],
    reportPaths: [],
    progressPaths: [],
    ownershipKeys: [
      'relation.item_npc_loot_relations.status_deleted',
      'relation.projection_npcs.loot_items_json',
      'local.npc_loot_entries.status_deleted',
    ],
    requiredOperationIds: [],
    databaseWrites: true,
    networkAccess: false,
  };
}

function npcProjectionGapWikiGgVariantRetirementDefinition() {
  const resultPath = `reports/authorization/canonical/${NPC_PROJECTION_GAP_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID}.result.json`;
  const inputPath = `reports/authorization/canonical/${NPC_PROJECTION_GAP_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID}.input.json`;
  const previewPath = 'reports/runtime/local-data-chain-closure/20260819/post-parent-conflict/npc-projection-gap-wiki-gg-variant-retirement-preview.json';
  return {
    executionClass: 'formal_npc_projection_gap_wiki_gg_variant_retirement',
    command: ['node', CANONICAL_OPERATION_ENTRYPOINTS[NPC_PROJECTION_GAP_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID], `--input=${inputPath}`, `--preview=${previewPath}`, `--output=${resultPath}`, '--apply=true'],
    inputPaths: [inputPath, previewPath],
    outputPaths: [resultPath],
    reportPaths: [],
    progressPaths: [],
    ownershipKeys: ['relation.item_npc_loot_relations.projection_gap_wiki_gg_variant'],
    requiredOperationIds: [NPC_PROJECTION_TEXT_IDENTITY_REPAIR_OPERATION_ID],
    databaseWrites: true,
    networkAccess: false,
  };
}

function npcLocalLootCompatibilityRetirementDefinition() {
  const resultPath = `reports/authorization/canonical/${NPC_LOCAL_LOOT_COMPATIBILITY_RETIREMENT_OPERATION_ID}.result.json`;
  const inputPath = `reports/authorization/canonical/${NPC_LOCAL_LOOT_COMPATIBILITY_RETIREMENT_OPERATION_ID}.input.json`;
  const previewPath = 'reports/runtime/local-data-chain-closure/20260819/post-final/npc-local-loot-compatibility-retirement-preview.json';
  return {
    executionClass: 'formal_npc_local_loot_compatibility_retirement',
    command: ['node', CANONICAL_OPERATION_ENTRYPOINTS[NPC_LOCAL_LOOT_COMPATIBILITY_RETIREMENT_OPERATION_ID], `--input=${inputPath}`, `--preview=${previewPath}`, `--output=${resultPath}`, '--apply=true'],
    inputPaths: [inputPath, previewPath],
    outputPaths: [resultPath],
    reportPaths: [],
    progressPaths: [],
    ownershipKeys: ['local.npc_loot_entries.non_boss'],
    requiredOperationIds: [],
    databaseWrites: true,
    networkAccess: false,
  };
}

function parityDefinition({ operationId }) {
  const domain = operationId === 'canonical-item-projection-parity-apply' ? 'items'
    : operationId === 'canonical-npc-projection-parity-apply' ? 'npcs'
      : 'bosses';
  const inputPath = `reports/authorization/canonical/${operationId}.input.json`;
  const outputPath = `reports/authorization/canonical/${operationId}.result.json`;
  return {
    executionClass: 'formal_core_projection_parity',
    command: ['node', CANONICAL_OPERATION_ENTRYPOINTS[operationId], `--domain=${domain}`, `--input=${inputPath}`, '--apply=true', `--output=${outputPath}`],
    inputPaths: [inputPath],
    outputPaths: [outputPath],
    reportPaths: [outputPath],
    progressPaths: [],
    ownershipKeys: [domain === 'items' ? 'relation.projection_items.knockback_sell' : domain === 'npcs' ? 'relation.projection_npcs.life_max_knock_back_resist_scale' : 'relation.projection_bosses.name_zh'],
    requiredOperationIds: [],
    databaseWrites: true,
    networkAccess: false,
  };
}

function projectionDefinition({ repoRoot, operationId, attemptRoot }) {
  const normalizedRoot = requireText(attemptRoot, 'item image projection attempt root')
    .replaceAll('\\', '/');
  const prefix = 'reports/authorization/canonical/item-image-projection-apply/';
  if (path.isAbsolute(normalizedRoot)
      || path.posix.normalize(normalizedRoot) !== normalizedRoot
      || !normalizedRoot.startsWith(prefix)
      || !/^[a-f0-9]{64}$/.test(normalizedRoot.slice(prefix.length))) {
    throw new Error('item image projection attempt root must contain one lowercase SHA-256 attemptId');
  }
  const inputPath = `${normalizedRoot}/input.json`;
  const inputContract = readItemImageProjectionInputContract({
    repoRoot,
    inputContractPath: inputPath,
  });
  if (inputContract.attemptRoot !== normalizedRoot) {
    throw new Error('item image projection attempt root must match the exact input contract root');
  }
  const attemptPaths = buildItemImageProjectionAttemptPaths(
    inputContract.proposalAuthorization.decisionIdentity,
  );
  if (attemptPaths.attemptRoot !== normalizedRoot || attemptPaths.inputPath !== inputPath) {
    throw new Error('item image projection attempt root must be decision-derived from the input contract');
  }
  const outputPath = attemptPaths.resultPath;
  return {
    executionClass: 'formal_database_projection',
    command: [
      'node',
      CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      `--input-contract=${inputPath}`,
      '--apply=true',
      `--output=${outputPath}`,
    ],
    inputPaths: [inputPath],
    outputPaths: [outputPath],
    reportPaths: [outputPath],
    progressPaths: [],
    itemImageProjectionAttempt: {
      attemptId: attemptPaths.attemptId,
      attemptRoot: normalizedRoot,
      manifestPath: attemptPaths.manifestPath,
      requestPath: attemptPaths.requestPath,
      packetPath: attemptPaths.packetPath,
      permitPath: attemptPaths.permitPath,
      resultPath: attemptPaths.resultPath,
      inputBinding: itemImageProjectionInputBinding(inputContract),
    },
    databaseWrites: true,
    networkAccess: false,
  };
}

function itemSourceLocalNpcAdmissionDefinition({ repoRoot, operationId, attemptRoot }) {
  const normalizedRoot = requireText(attemptRoot, 'Item-source admission attempt root').replaceAll('\\', '/');
  const prefix = 'reports/authorization/canonical/canonical-item-source-local-npc-admission/';
  if (path.isAbsolute(normalizedRoot) || path.posix.normalize(normalizedRoot) !== normalizedRoot
      || !normalizedRoot.startsWith(prefix)
      || !/^[a-f0-9]{64}$/.test(normalizedRoot.slice(prefix.length))) {
    throw new Error('Item-source admission attempt root must contain one lowercase SHA-256 attemptId');
  }
  const inputPath = `${normalizedRoot}/input.json`;
  const inputContract = readItemSourceLocalNpcAdmissionInputContract({ repoRoot, inputPath });
  const paths = buildItemSourceLocalNpcAdmissionAttemptPaths(
    inputContract.proposalAuthorization.decisionIdentity,
  );
  if (paths.attemptRoot !== normalizedRoot || paths.inputPath !== inputPath
      || inputContract.attemptId !== paths.attemptId || inputContract.attemptRoot !== paths.attemptRoot
      || inputContract.proposalPath !== paths.proposalPath) {
    throw new Error('Item-source admission attempt root must be decision-derived from the input contract');
  }
  return {
    executionClass: 'formal_item_source_local_npc_admission',
    command: [
      'node',
      CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      `--input-contract=${paths.inputPath}`,
      '--apply=true',
      `--output=${paths.resultPath}`,
    ],
    inputPaths: [paths.inputPath],
    outputPaths: [paths.resultPath],
    reportPaths: [paths.resultPath],
    progressPaths: [],
    ownershipKeys: [
      'local.source_dataset_landings.item_source_npc_admission_insert',
      'maint.maint_npc_crawler_facts.item_source_npc_admission_insert',
      'relation.item_source_facts.item_source_npc_admission_insert',
      'relation.item_source_details.item_source_npc_admission_insert',
      'relation.item_npc_shop_relations.item_source_npc_admission_insert',
      'relation.item_npc_loot_relations.item_source_npc_admission_insert',
      'local.item_acquisition_sources.item_source_npc_admission_reconciliation',
    ],
    requiredOperationIds: [],
    itemSourceLocalNpcAdmissionAttempt: paths,
    databaseWrites: true,
    networkAccess: false,
  };
}

function readItemSourceLocalNpcAdmissionInputContract({ repoRoot, inputPath }) {
  const root = path.resolve(repoRoot);
  const absolutePath = assertRepositoryOrdinaryFile({
    repoRoot: root,
    filePath: path.resolve(root, inputPath),
    label: 'Item-source admission input contract',
  });
  if ((fs.statSync(absolutePath).mode & 0o077) !== 0) {
    throw new Error('Item-source admission input contract must be private');
  }
  let input;
  try {
    input = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch {
    throw new Error('Item-source admission input contract must be valid JSON');
  }
  assertItemSourceLocalNpcAdmissionInputContract(input);
  return input;
}

function buildItemSourceLocalNpcAdmissionAttemptPaths(decisionIdentity) {
  const identity = requireText(decisionIdentity, 'Item-source admission decision identity');
  const attemptId = createHash('sha256').update(identity, 'utf8').digest('hex');
  const attemptRoot = `reports/authorization/canonical/${ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID}/${attemptId}`;
  return {
    attemptId,
    attemptRoot,
    proposalPath: `${attemptRoot}/proposal.json`,
    inputPath: `${attemptRoot}/input.json`,
    manifestPath: `${attemptRoot}/execution-manifest.json`,
    requestPath: `${attemptRoot}/request.json`,
    packetPath: `${attemptRoot}/packet.json`,
    permitPath: `${attemptRoot}/permit.json`,
    resultPath: `${attemptRoot}/result.json`,
  };
}

function assertItemSourceLocalNpcAdmissionInputContract(input) {
  if (!input || input.schemaVersion !== 'item-source-local-npc-admission-input-v1'
      || input.operationId !== ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID || input.apply !== true) {
    throw new Error('Item-source admission input contract identity is invalid');
  }
  const paths = buildItemSourceLocalNpcAdmissionAttemptPaths(
    requireText(input.proposalAuthorization?.decisionIdentity, 'Item-source admission decision identity'),
  );
  if (input.attemptId !== paths.attemptId || input.attemptRoot !== paths.attemptRoot
      || input.proposalPath !== paths.proposalPath || !isSha256(input.proposalSha256)
      || !isSha256(input.proposalScopeHash) || !isSha256(input.selectedIdentityHash)
      || !isSha256(input.beforeFingerprint) || !isSha256(input.afterFingerprint)) {
    throw new Error('Item-source admission input contract binding is invalid');
  }
  return input;
}

function isSha256(value) {
  return /^sha256:[a-f0-9]{64}$/.test(String(value ?? ''));
}

function missingRowInsertDefinition({ operationId, attemptRoot }) {
  const normalizedRoot = requireText(
    attemptRoot,
    'item image projection missing-row insert attempt root',
  ).replaceAll('\\', '/');
  const prefix = 'reports/authorization/canonical/item-image-projection-missing-row-insert/';
  if (path.isAbsolute(normalizedRoot)
      || path.posix.normalize(normalizedRoot) !== normalizedRoot
      || !normalizedRoot.startsWith(prefix)
      || !/^[a-f0-9]{64}$/.test(normalizedRoot.slice(prefix.length))) {
    throw new Error('missing-row insert attempt root must contain one lowercase SHA-256 attemptId');
  }
  const inputPath = `${normalizedRoot}/input.json`;
  const resultPath = `${normalizedRoot}/result.json`;
  const paths = {
    attemptId: normalizedRoot.slice(prefix.length),
    attemptRoot: normalizedRoot,
    manifestPath: `${normalizedRoot}/execution-manifest.json`,
    requestPath: `${normalizedRoot}/request.json`,
    packetPath: `${normalizedRoot}/packet.json`,
    permitPath: `${normalizedRoot}/permit.json`,
    resultPath,
  };
  return {
    executionClass: 'formal_database_projection_insert',
    command: [
      'node',
      CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      `--input-contract=${inputPath}`,
      '--apply=true',
      `--output=${resultPath}`,
    ],
    inputPaths: [inputPath],
    outputPaths: [resultPath],
    reportPaths: [resultPath],
    progressPaths: [],
    itemImageProjectionMissingRowInsertAttempt: paths,
    databaseWrites: true,
    networkAccess: false,
  };
}

function baseEntityRestorationDefinition({ operationId, attemptRoot }) {
  const normalizedRoot = requireText(attemptRoot, 'canonical base-entity restoration attempt root').replaceAll('\\', '/');
  const prefix = 'reports/authorization/canonical/item-canonical-base-entity-restoration/';
  if (path.isAbsolute(normalizedRoot) || path.posix.normalize(normalizedRoot) !== normalizedRoot
      || !normalizedRoot.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(normalizedRoot.slice(prefix.length))) {
    throw new Error('canonical base-entity restoration attempt root must contain one lowercase SHA-256 attemptId');
  }
  const inputPath = `${normalizedRoot}/input.json`;
  const resultPath = `${normalizedRoot}/result.json`;
  return {
    executionClass: 'formal_database_base_entity_restoration',
    command: ['node', CANONICAL_OPERATION_ENTRYPOINTS[operationId], `--input-contract=${inputPath}`, '--apply=true', `--output=${resultPath}`],
    inputPaths: [inputPath], outputPaths: [resultPath], reportPaths: [resultPath], progressPaths: [],
    itemCanonicalBaseEntityRestorationAttempt: {
      attemptId: normalizedRoot.slice(prefix.length), attemptRoot: normalizedRoot,
      manifestPath: `${normalizedRoot}/execution-manifest.json`, requestPath: `${normalizedRoot}/request.json`,
      packetPath: `${normalizedRoot}/packet.json`, permitPath: `${normalizedRoot}/permit.json`, resultPath,
    },
    databaseWrites: true, networkAccess: false,
  };
}

function lineageDefinition({ operationId, attemptRoot }) {
  if (attemptRoot == null) {
    return {
      executionClass: 'formal_database_projection',
      command: [
        'node',
        CANONICAL_OPERATION_ENTRYPOINTS[operationId],
        '--input-contract=reports/authorization/canonical/canonical-item-image-lineage-apply.input.json',
        '--apply=true',
      ],
      inputPaths: [
        'reports/authorization/canonical/canonical-item-image-lineage-apply.input.json',
      ],
      outputPaths: [
        'reports/authorization/canonical/canonical-item-image-lineage-apply.result.json',
      ],
      reportPaths: [
        'reports/authorization/canonical/canonical-item-image-lineage-apply.result.json',
      ],
      progressPaths: [],
      databaseWrites: true,
      networkAccess: false,
    };
  }

  const normalizedRoot = requireText(attemptRoot, 'item image lineage attempt root')
    .replaceAll('\\', '/');
  const prefix = 'reports/authorization/canonical/item-image-lineage-apply/';
  if (path.isAbsolute(normalizedRoot)
      || path.posix.normalize(normalizedRoot) !== normalizedRoot
      || !normalizedRoot.startsWith(prefix)
      || !/^[a-f0-9]{64}$/.test(normalizedRoot.slice(prefix.length))) {
    throw new Error('item image lineage attempt root must contain one lowercase SHA-256 attemptId');
  }
  const inputPath = `${normalizedRoot}/input.json`;
  const snapshotPath = `${normalizedRoot}/snapshot.json`;
  const resultPath = `${normalizedRoot}/result.json`;
  return {
    executionClass: 'formal_database_projection',
    command: [
      'node',
      CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      `--input-contract=${inputPath}`,
      '--apply=true',
      `--snapshot=${snapshotPath}`,
      `--result=${resultPath}`,
    ],
    inputPaths: [inputPath],
    outputPaths: [snapshotPath, resultPath],
    reportPaths: [resultPath],
    progressPaths: [],
    itemImageLineageAttempt: {
      attemptRoot: normalizedRoot,
      inputPath,
      bundlePath: `${normalizedRoot}/bundle.json`,
      snapshotPath,
      resultPath,
    },
    databaseWrites: true,
    networkAccess: false,
  };
}

function provenanceDefinition({ operationId, attemptRoot }) {
  const normalizedRoot = requireText(attemptRoot, 'item image provenance attempt root').replaceAll('\\', '/');
  const prefix = 'reports/authorization/canonical/item-image-provenance-patch/';
  if (path.isAbsolute(normalizedRoot)
      || path.posix.normalize(normalizedRoot) !== normalizedRoot
      || !normalizedRoot.startsWith(prefix)
      || !/^[a-f0-9]{64}$/.test(normalizedRoot.slice(prefix.length))) {
    throw new Error('item image provenance attempt root must contain one lowercase SHA-256 attemptId');
  }
  const inputPath = `${normalizedRoot}/input.json`;
  const previewPath = `${normalizedRoot}/preview.json`;
  const resultPath = `${normalizedRoot}/result.json`;
  return {
    executionClass: 'formal_database_image_provenance_patch',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      `--input=${inputPath}`,
      `--preview=${previewPath}`,
      '--apply=true',
      `--output=${resultPath}`,
    ],
    inputPaths: [inputPath, previewPath],
    outputPaths: [resultPath],
    reportPaths: [resultPath],
    progressPaths: [],
    itemImageProvenanceAttempt: {
      attemptRoot: normalizedRoot,
      inputPath,
      previewPath,
      resultPath,
      manifestPath: `${normalizedRoot}/execution-manifest.json`,
      requestPath: `${normalizedRoot}/request.json`,
      packetPath: `${normalizedRoot}/packet.json`,
      permitPath: `${normalizedRoot}/permit.json`,
    },
    databaseWrites: true,
    networkAccess: false,
  };
}

function twoItemQuarantineDefinition({ operationId, attemptRoot }) {
  const normalizedRoot = requireText(attemptRoot, 'two-item quarantine attempt root').replaceAll('\\', '/');
  const prefix = 'reports/authorization/canonical/two-item-image-quarantine-repair/';
  if (path.isAbsolute(normalizedRoot) || path.posix.normalize(normalizedRoot) !== normalizedRoot
      || !normalizedRoot.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(normalizedRoot.slice(prefix.length))) {
    throw new Error('two-item quarantine attempt root must contain one lowercase SHA-256 attemptId');
  }
  const inputPath = `${normalizedRoot}/input.json`;
  const previewPath = `${normalizedRoot}/preview.json`;
  const resultPath = `${normalizedRoot}/result.json`;
  return {
    executionClass: 'formal_narrow_image_patch',
    command: ['node', CANONICAL_OPERATION_ENTRYPOINTS[operationId], `--input=${inputPath}`, `--preview=${previewPath}`, '--apply=true', `--output=${resultPath}`],
    inputPaths: [inputPath, previewPath],
    outputPaths: [resultPath],
    reportPaths: [resultPath],
    progressPaths: [],
    twoItemImageQuarantineRepairAttempt: {
      attemptRoot: normalizedRoot,
      inputPath,
      previewPath,
      resultPath,
      manifestPath: `${normalizedRoot}/execution-manifest.json`,
      requestPath: `${normalizedRoot}/request.json`,
      packetPath: `${normalizedRoot}/packet.json`,
      permitPath: `${normalizedRoot}/permit.json`,
    },
    databaseWrites: true,
    networkAccess: false,
  };
}

function itemImageProjectionInputBinding(input) {
  return {
    operationId: input.operationId,
    contractVersion: input.contractVersion,
    attemptId: input.attemptId,
    attemptRoot: input.attemptRoot,
    proposalAuthorization: input.proposalAuthorization,
    proposalPath: input.proposalPath,
    proposalSha256: input.proposalSha256,
    snapshotPath: input.snapshotPath,
    snapshotSha256: input.snapshotSha256,
    lineage: input.lineage,
    target: input.target,
    managedUrlPolicy: input.managedUrlPolicy,
    managedUrlPrefixes: input.managedUrlPrefixes,
    keys: input.keys,
    keySetSha256: input.keySetSha256,
    relationRowsSha256: input.relationRowsSha256,
    projectionBeforeSha256: input.projectionBeforeSha256,
    projectionAfterSha256: input.projectionAfterSha256,
    targetRowCount: input.targetRowCount,
    changedRowCount: input.changedRowCount,
  };
}

function buildNpcT1AcceptanceIdentity({ configPath, redisLogicalDb, runId } = {}) {
  const resolvedConfigPath = path.resolve(requireText(configPath, 'NPC T1 config path'));
  const stat = fs.lstatSync(resolvedConfigPath);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error('NPC T1 config must be a private ordinary file');
  }
  const normalizedRedisDb = Number(redisLogicalDb);
  if (!Number.isInteger(normalizedRedisDb) || normalizedRedisDb < 1 || normalizedRedisDb > 14) {
    throw new Error('NPC T1 Redis DB must be an integer from 1 through 14');
  }
  const normalizedRunId = requireText(runId, 'NPC T1 runId');
  if (!/^npc-t1-[a-z0-9-]{3,80}$/.test(normalizedRunId)) {
    throw new Error('NPC T1 runId must use the bounded npc-t1 identity');
  }
  const configBytes = fs.readFileSync(resolvedConfigPath);
  let config;
  try {
    config = JSON.parse(configBytes.toString('utf8'));
  } catch {
    throw new Error('NPC T1 config must be valid JSON');
  }
  const serverFingerprint = canonicalServerFingerprint(config?.npcT1ServerFingerprint);
  if (String(config?.database?.host ?? '').trim() !== serverFingerprint.host
      || Number(config?.database?.port) !== serverFingerprint.port) {
    throw new Error('NPC T1 config database endpoint must match its server fingerprint');
  }
  return {
    configPath: resolvedConfigPath,
    configSha256: `sha256:${createHash('sha256').update(configBytes).digest('hex')}`,
    redisLogicalDb: normalizedRedisDb,
    runId: normalizedRunId,
    serverFingerprint,
  };
}

function npcT1AcceptanceDefinition(operationId, isolatedAcceptance) {
  if (isolatedAcceptance == null) throw new Error('NPC T1 isolated acceptance identity is required');
  return {
    executionClass: 'isolated_read_only_acceptance',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      '--profile=t1',
      '--scope=npc-canonical',
      `--config-path=${isolatedAcceptance.configPath}`,
      `--config-sha256=${isolatedAcceptance.configSha256}`,
      `--redis-db=${isolatedAcceptance.redisLogicalDb}`,
      `--run-id=${isolatedAcceptance.runId}`,
      '--max-rows=2',
      '--output=reports/canonical-migration/canonical-npc-t1-acceptance.json',
    ],
    inputPaths: [...CANONICAL_OPERATION_DATA_PATHS[operationId]],
    outputPaths: ['reports/canonical-migration/canonical-npc-t1-acceptance.json'],
    reportPaths: ['reports/canonical-migration/canonical-npc-t1-acceptance.json'],
    progressPaths: [],
    isolatedAcceptance,
    databaseWrites: false,
    isolatedResourceWrites: true,
    networkAccess: false,
  };
}

function recipeT1AcceptanceDefinition(operationId, isolatedAcceptance) {
  if (isolatedAcceptance == null) throw new Error('recipe T1 isolated acceptance identity is required');
  return {
    executionClass: 'isolated_read_only_acceptance',
    command: ['node', CANONICAL_OPERATION_ENTRYPOINTS[operationId], '--profile=t1', '--scope=recipe-canonical', `--config-path=${isolatedAcceptance.configPath}`, `--config-sha256=${isolatedAcceptance.configSha256}`, `--redis-db=${isolatedAcceptance.redisLogicalDb}`, `--run-id=${isolatedAcceptance.runId}`, '--max-rows=25', '--output=reports/canonical-migration/canonical-recipe-t1-acceptance.json'],
    inputPaths: ['pipelines/recipe/fixtures/recipe-t1.sample.json'],
    outputPaths: ['reports/canonical-migration/canonical-recipe-t1-acceptance.json'],
    reportPaths: ['reports/canonical-migration/canonical-recipe-t1-acceptance.json'],
    progressPaths: [], isolatedAcceptance, databaseWrites: false, isolatedResourceWrites: true, networkAccess: false,
  };
}

function bossT1AcceptanceDefinition(operationId, isolatedAcceptance) {
  if (isolatedAcceptance == null) throw new Error('boss T1 isolated acceptance identity is required');
  return {
    executionClass: 'isolated_read_only_acceptance',
    command: ['node', CANONICAL_OPERATION_ENTRYPOINTS[operationId], '--profile=t1', '--scope=boss-canonical', `--config-path=${isolatedAcceptance.configPath}`, `--config-sha256=${isolatedAcceptance.configSha256}`, `--redis-db=${isolatedAcceptance.redisLogicalDb}`, `--run-id=${isolatedAcceptance.runId}`, '--max-rows=25', '--output=reports/canonical-migration/canonical-boss-t1-acceptance.json'],
    inputPaths: [...CANONICAL_OPERATION_DATA_PATHS[operationId]],
    outputPaths: ['reports/canonical-migration/canonical-boss-t1-acceptance.json'],
    reportPaths: ['reports/canonical-migration/canonical-boss-t1-acceptance.json'],
    progressPaths: [], isolatedAcceptance, databaseWrites: false, isolatedResourceWrites: true, networkAccess: false,
  };
}

function projectileT1AcceptanceDefinition(operationId, isolatedAcceptance) {
  if (isolatedAcceptance == null) throw new Error('projectile T1 isolated acceptance identity is required');
  return {
    executionClass: 'isolated_read_only_acceptance',
    command: ['node', CANONICAL_OPERATION_ENTRYPOINTS[operationId], '--profile=t1', '--scope=projectile-canonical', `--config-path=${isolatedAcceptance.configPath}`, `--config-sha256=${isolatedAcceptance.configSha256}`, `--redis-db=${isolatedAcceptance.redisLogicalDb}`, `--run-id=${isolatedAcceptance.runId}`, '--max-rows=25', '--output=reports/canonical-migration/canonical-projectile-t1-acceptance.json'],
    inputPaths: [...CANONICAL_OPERATION_DATA_PATHS[operationId]],
    outputPaths: ['reports/canonical-migration/canonical-projectile-t1-acceptance.json'],
    reportPaths: ['reports/canonical-migration/canonical-projectile-t1-acceptance.json'],
    progressPaths: [], isolatedAcceptance, databaseWrites: false, isolatedResourceWrites: true, networkAccess: false,
  };
}

function buffT1AcceptanceDefinition(operationId, isolatedAcceptance) {
  if (isolatedAcceptance == null) throw new Error('buff T1 isolated acceptance identity is required');
  return {
    executionClass: 'isolated_read_only_acceptance',
    command: ['node', CANONICAL_OPERATION_ENTRYPOINTS[operationId], '--profile=t1', '--scope=buff-canonical', `--config-path=${isolatedAcceptance.configPath}`, `--config-sha256=${isolatedAcceptance.configSha256}`, `--redis-db=${isolatedAcceptance.redisLogicalDb}`, `--run-id=${isolatedAcceptance.runId}`, '--max-rows=25', '--output=reports/canonical-migration/canonical-buff-t1-acceptance.json'],
    inputPaths: [...CANONICAL_OPERATION_DATA_PATHS[operationId]],
    outputPaths: ['reports/canonical-migration/canonical-buff-t1-acceptance.json'],
    reportPaths: ['reports/canonical-migration/canonical-buff-t1-acceptance.json'],
    progressPaths: [], isolatedAcceptance, databaseWrites: false, isolatedResourceWrites: true, networkAccess: false,
  };
}

function biomeT1AcceptanceDefinition(operationId, isolatedAcceptance) {
  if (isolatedAcceptance == null) throw new Error('biome T1 isolated acceptance identity is required');
  return {
    executionClass: 'isolated_read_only_acceptance',
    command: ['node', CANONICAL_OPERATION_ENTRYPOINTS[operationId], '--profile=t1', '--scope=biome-canonical', `--config-path=${isolatedAcceptance.configPath}`, `--config-sha256=${isolatedAcceptance.configSha256}`, `--redis-db=${isolatedAcceptance.redisLogicalDb}`, `--run-id=${isolatedAcceptance.runId}`, '--max-rows=25', '--output=reports/canonical-migration/canonical-biome-t1-acceptance.json'],
    inputPaths: [...CANONICAL_OPERATION_DATA_PATHS[operationId]],
    outputPaths: ['reports/canonical-migration/canonical-biome-t1-acceptance.json'],
    reportPaths: ['reports/canonical-migration/canonical-biome-t1-acceptance.json'],
    progressPaths: [], isolatedAcceptance, databaseWrites: false, isolatedResourceWrites: true, networkAccess: false,
  };
}

function schedulerT1AcceptanceDefinition(operationId, isolatedAcceptance, { itemMode = false } = {}) {
  if (isolatedAcceptance == null) throw new Error('scheduler T1 isolated acceptance identity is required');
  const item = itemMode || operationId === 'canonical-crawler-v2-items-t1-acceptance';
  const scope = item ? 'crawler-v2-items' : 'crawler-v2-scheduler';
  const markerRoot = `/tmp/terrapedia-${scope}-${isolatedAcceptance.runId}`;
  const output = item
    ? `reports/canonical-migration/canonical-crawler-v2-items-t1-acceptance-${isolatedAcceptance.runId}.json`
    : `reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance-${isolatedAcceptance.runId}.json`;
  return {
    executionClass: 'isolated_scheduler_lifecycle_acceptance',
    command: ['node', CANONICAL_OPERATION_ENTRYPOINTS[operationId], '--profile=t1', `--scope=${scope}`, `--config-path=${isolatedAcceptance.configPath}`, `--config-sha256=${isolatedAcceptance.configSha256}`, `--redis-db=${isolatedAcceptance.redisLogicalDb}`, `--run-id=${isolatedAcceptance.runId}`, `--marker-root=${markerRoot}`, '--live=true', '--driver-module=pipelines/monitor/crawler-queue-v2-scheduler-system-driver.mjs', ...(item ? ['--item-mode=true', '--item-limit=100'] : []), `--output=${output}`],
    inputPaths: [...CANONICAL_OPERATION_DATA_PATHS[operationId]],
    outputPaths: [output],
    reportPaths: [output],
    progressPaths: [], isolatedAcceptance, databaseWrites: false, isolatedResourceWrites: true, networkAccess: false,
  };
}

function schedulerActivationProposalDefinition(operationId) {
  return {
    executionClass: 'formal_activation_proposal_only',
    command: [
      'node',
      CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      '--preflight=reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.preflight.json',
      '--t1-report=reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance-npc-t1-crawler-v2-auto-ingestion-20260809-04.json',
      '--output=reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.proposal.json',
    ],
    inputPaths: [...CANONICAL_OPERATION_DATA_PATHS[operationId]],
    outputPaths: ['reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.proposal.json'],
    reportPaths: ['reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.proposal.json'],
    progressPaths: [], databaseWrites: false, isolatedResourceWrites: false, networkAccess: false,
  };
}

function npcT2Definition({ operationId, attemptRoot, backendApiBase }) {
  const normalizedRoot = requireText(attemptRoot, 'NPC T2 attempt root').replaceAll('\\', '/');
  const prefix = 'reports/authorization/canonical/canonical-npc-t2-cutover-verification/';
  if (path.isAbsolute(normalizedRoot)
      || path.posix.normalize(normalizedRoot) !== normalizedRoot
      || !normalizedRoot.startsWith(prefix)
      || !/^[a-f0-9]{64}$/.test(normalizedRoot.slice(prefix.length))) {
    throw new Error('NPC T2 attempt root must contain one lowercase SHA-256 attemptId');
  }
  const resultPath = `${normalizedRoot}/result.json`;
  const readinessPath = 'reports/canonical-migration/canonical-npc-crawler-facts-readiness.json';
  return {
    executionClass: 'formal_read_only_cutover_verification',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      '--no-write=true',
      `--apiBase=${requireBackendApiBase(operationId, backendApiBase)}`,
      `--output=${resultPath}`,
      `--readiness-output=${readinessPath}`,
    ],
    inputPaths: [...CANONICAL_OPERATION_DATA_PATHS[operationId]],
    outputPaths: [resultPath, readinessPath],
    reportPaths: [resultPath, readinessPath],
    progressPaths: [],
    npcT2Attempt: {
      attemptId: normalizedRoot.slice(prefix.length),
      attemptRoot: normalizedRoot,
      manifestPath: `${normalizedRoot}/execution-manifest.json`,
      requestPath: `${normalizedRoot}/request.json`,
      packetPath: `${normalizedRoot}/packet.json`,
      permitPath: `${normalizedRoot}/permit.json`,
      resultPath,
      readinessPath,
    },
    databases: {
      local: 'terria_v1_local',
      maint: 'terria_v1_maint',
      relation: 'terria_v1_relation',
    },
    noWrite: true,
    databaseWrites: false,
    networkAccess: false,
  };
}

function npcOwnerDefinition({ operationId, resultLabel = null }) {
  const resultPath = resultLabel
    ? `reports/authorization/canonical/${operationId}.${resultLabel}.result.json`
    : `reports/authorization/canonical/${operationId}.result.json`;
  const phase = NPC_APPLY_OWNER_PHASES.find((candidate) => candidate.operationId === operationId)
    ?? (operationId === NPC_ITEM_RELATION_LINEAGE_REPAIR_OPERATION.operationId
      ? NPC_ITEM_RELATION_LINEAGE_REPAIR_OPERATION
      : null);
  const landing = operationId === 'canonical-npc-landing-apply';
  const lineageRepair = operationId === NPC_ITEM_RELATION_LINEAGE_REPAIR_OPERATION.operationId;
  return {
    executionClass: landing
      ? 'formal_npc_landing_apply'
      : lineageRepair
        ? 'formal_npc_relation_lineage_repair'
        : 'formal_npc_owner_phase_apply',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      `--operation-id=${operationId}`,
      '--input=reports/authorization/canonical/canonical-npc-apply.input.json',
      `--output=${resultPath}`,
      '--apply=true',
    ],
    inputPaths: [...CANONICAL_OPERATION_DATA_PATHS[operationId]],
    outputPaths: [resultPath],
    reportPaths: [],
    progressPaths: [],
    ownershipKeys: landing
      ? [
          'local.source_dataset_landings.npcs_base',
          'local.source_dataset_landings.npc_crawler_facts',
        ]
      : [...phase.ownershipKeys],
    requiredOperationIds: landing ? [] : [...phase.requiredOperationIds],
    databaseWrites: true,
    networkAccess: false,
  };
}

function npcBaseMaintDefinition({ operationId }) {
  const resultPath = `reports/authorization/canonical/${operationId}.result.json`;
  const ownershipKey = operationId === 'canonical-npc-base-maint-nontown-apply'
    ? 'maint.maint_npcs.npcs'
    : 'maint.maint_npcs.town';
  return {
    executionClass: 'formal_npc_base_maint_apply',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      `--operation-id=${operationId}`,
      '--input=reports/authorization/canonical/canonical-npc-apply.input.json',
      `--output=${resultPath}`,
      '--apply=true',
    ],
    inputPaths: [...CANONICAL_OPERATION_DATA_PATHS[operationId]],
    outputPaths: [resultPath],
    reportPaths: [],
    progressPaths: [],
    ownershipKeys: [ownershipKey],
    requiredOperationIds: ['canonical-npc-landing-apply'],
    databaseWrites: true,
    networkAccess: false,
  };
}

// The reuse evidence bundle is content addressed by its generation id, so the
// manifest freezes the exact bundle rather than following a mutable pointer.
function requireItemImagePromotionBundlePath(operationId, value) {
  if (operationId !== 'canonical-image-sync') return '';
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${operationId} itemImagePromotionBundlePath is required`);
  if (path.isAbsolute(text) || text.includes('..') || text.includes('latest')) {
    throw new Error(`${operationId} itemImagePromotionBundlePath must be a content-addressed repository path`);
  }
  return text;
}

function requireManagedObjectOrigin(operationId, value) {
  if (operationId !== 'canonical-image-sync') return '';
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${operationId} managedObjectOrigin is required`);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${operationId} managedObjectOrigin must be an absolute URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${operationId} managedObjectOrigin must use http or https`);
  }
  return text.replace(/\/$/, '');
}

function requireLegacyOrigin(operationId, value) {
  if (operationId !== 'canonical-image-sync') return '';
  const text = String(value ?? '').trim();
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${operationId} legacyOrigin must be an absolute URL origin`);
  }
  if (!['http:', 'https:'].includes(url.protocol)
      || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${operationId} legacyOrigin must be an absolute URL origin`);
  }
  return url.origin;
}

function requireExpectedLegacyCount(operationId, value) {
  if (operationId !== 'canonical-image-sync') return '';
  const count = Number(value);
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`${operationId} expectedLegacyCount must be a positive integer`);
  }
  return String(count);
}

function requireBackendApiBase(operationId, value) {
  if (![
    'canonical-image-sync',
    'canonical-boss-import',
    'canonical-npc-t2-cutover-verification',
  ].includes(operationId)) return '';
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${operationId} backendApiBase is required`);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${operationId} backendApiBase must be an absolute URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${operationId} backendApiBase must use http or https`);
  }
  return text.replace(/\/$/, '');
}

function requireBossSourceSnapshotHash(operationId, value) {
  if (operationId !== 'canonical-boss-source-refresh-offline') return '';
  const text = String(value ?? '').trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(text)) {
    throw new Error(`${operationId} bossSourceSnapshotHash must be sha256:<64 hex>`);
  }
  return text;
}

function biomesApplyDefinition({ operationId }) {
  const inputPath = `reports/authorization/canonical/${operationId}.bundle.json`;
  const outputPath = `reports/authorization/canonical/${operationId}.result.json`;
  return {
    executionClass: 'formal_automation_l1_apply',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      `--operation-id=${operationId}`,
      `--input=${inputPath}`,
      `--output=${outputPath}`,
      '--apply=true',
    ],
    inputPaths: [inputPath],
    outputPaths: [outputPath],
    reportPaths: [],
    progressPaths: [],
    databaseWrites: true,
    networkAccess: false,
  };
}

function supplementaryBootstrapDefinition({ operationId }) {
  const inputPath = `reports/authorization/canonical/${operationId}.input.json`;
  const outputPath = `reports/authorization/canonical/${operationId}.result.json`;
  return {
    executionClass: 'formal_database_bootstrap',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      `--input=${inputPath}`,
      `--output=${outputPath}`,
      '--apply=true',
    ],
    inputPaths: [inputPath],
    outputPaths: [outputPath],
    reportPaths: [],
    progressPaths: [],
    databaseWrites: true,
    networkAccess: false,
  };
}

function supplementaryApplyDefinition({ operationId }) {
  const inputPath = `reports/authorization/canonical/${operationId}.bundle.json`;
  const outputPath = `reports/authorization/canonical/${operationId}.result.json`;
  return {
    executionClass: 'formal_automation_l1_apply',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      `--operation-id=${operationId}`,
      `--input=${inputPath}`,
      `--output=${outputPath}`,
      '--apply=true',
    ],
    inputPaths: [inputPath],
    outputPaths: [outputPath],
    reportPaths: [],
    progressPaths: [],
    databaseWrites: true,
    networkAccess: false,
  };
}

function governedL1Definition({ repoRoot, operationId, l1RunRoot }) {
  const domainId = GOVERNED_L1_OPERATION_DOMAINS[operationId];
  const normalizedRoot = requireText(l1RunRoot, 'L1 run root').replaceAll('\\', '/');
  const prefix = `reports/authorization/canonical/l1-runs/${domainId}/`;
  if (path.isAbsolute(normalizedRoot)
      || path.posix.normalize(normalizedRoot) !== normalizedRoot
      || !normalizedRoot.startsWith(prefix)) {
    throw new Error('L1 run root must be a confined domain-specific reports path');
  }
  const runId = normalizedRoot.slice(prefix.length);
  if (!new RegExp(`^${domainId}_l1_[a-z0-9_]{8,72}$`).test(runId)) {
    throw new Error('L1 run root must contain a valid domain-specific runId');
  }
  const authorizationPath = `${normalizedRoot}/authorization-context.json`;
  const resultPath = `${normalizedRoot}/result.json`;
  const progressPath = `${normalizedRoot}/progress.json`;
  return {
    executionClass: 'formal_automation_l1_apply',
    l1RunRoot: normalizedRoot,
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      `--domain=${domainId}`,
      `--run-id=${runId}`,
      '--source-mode=local',
      '--full-reconciliation=false',
      `--repo-root=${path.resolve(repoRoot)}`,
    ],
    inputPaths: [authorizationPath],
    outputPaths: [resultPath],
    reportPaths: [],
    progressPaths: [progressPath],
    databaseWrites: true,
    networkAccess: false,
  };
}

function policyDecisionDefinition({ operationId }) {
  const inputPath = `reports/authorization/canonical/${operationId}.input.json`;
  const outputPath = `reports/authorization/canonical/${operationId}.result.json`;
  const commitMarkerPath = `${outputPath}.commit.json`;
  const publication = L2_POLICY_DECISION_OPERATION_IDS.has(operationId)
    ? {
      pendingResultPath: outputPath,
      commitMarkerPath,
    }
    : null;
  return {
    executionClass: 'formal_policy_decision',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      `--operation-id=${operationId}`,
      `--input=${inputPath}`,
      `--output=${outputPath}`,
      '--apply=true',
    ],
    inputPaths: [inputPath],
    outputPaths: publication == null ? [outputPath] : [outputPath, commitMarkerPath],
    reportPaths: [],
    progressPaths: [],
    ...(publication == null ? {} : { policyDecisionPublication: publication }),
    databaseWrites: true,
    networkAccess: false,
  };
}

function policyCeilingRegistrationDefinition({ operationId, mode = 'register' }) {
  const inputPath = `reports/authorization/canonical/${operationId}.input.json`;
  const outputPath = `reports/authorization/canonical/${operationId}.result.json`;
  const commitMarkerPath = `${outputPath}.commit.json`;
  if (!['register', 'recover'].includes(mode)) {
    throw new Error('policy ceiling registration mode must be register or recover');
  }
  const recovery = mode !== 'register';
  return {
    executionClass: recovery
      ? 'formal_policy_artifact_registration_recovery'
      : 'formal_policy_artifact_registration',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      `--operation-id=${operationId}`,
      `--input=${inputPath}`,
      `--output=${outputPath}`,
      ...(mode === 'register' ? ['--apply=true'] : ['--recover=true']),
    ],
    inputPaths: recovery ? [inputPath, outputPath] : [inputPath],
    outputPaths: mode === 'register' ? [outputPath, commitMarkerPath] : [commitMarkerPath],
    reportPaths: [],
    progressPaths: [],
    policyCeilingRegistration: { mode },
    databaseWrites: true,
    networkAccess: false,
  };
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function normalizeResultLabel(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text)) {
    throw new Error('result label must be a lowercase kebab-case token of at most 80 characters');
  }
  return text;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((arg) => {
    const [key, ...values] = String(arg).replace(/^--/, '').split('=');
    return [key, values.join('=')];
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const manifest = writeCanonicalOperationExecutionManifest({
      repoRoot: args['repo-root'] ?? process.cwd(),
      operationId: args['operation-id'],
      artifactDate: args['artifact-date'] ?? new Date().toISOString().slice(0, 10),
      npcLimit: args['npc-limit'] == null ? 25 : Number(args['npc-limit']),
      backendApiBase: args['backend-api-base'] ?? null,
      resultLabel: args['result-label'] ?? null,
      npcT1ConfigPath: args['npc-t1-config-path'] ?? null,
      npcT1RedisDb: args['npc-t1-redis-db'] == null ? null : Number(args['npc-t1-redis-db']),
      npcT1RunId: args['npc-t1-run-id'] ?? null,
      itemImagePromotionBundlePath: args['item-image-promotion-bundle-path'] ?? null,
      managedObjectOrigin: args['managed-object-origin'] ?? null,
      legacyOriginRepair: args['legacy-origin-repair'] === 'true',
      legacyOrigin: args['legacy-origin'] ?? null,
      expectedLegacyCount: args['expected-legacy-count'] == null
        ? null
        : Number(args['expected-legacy-count']),
      itemImageLineageAttemptRoot: args['item-image-lineage-attempt-root'] ?? null,
      itemImageProjectionAttemptRoot: args['item-image-projection-attempt-root'] ?? null,
      itemImageProjectionMissingRowInsertAttemptRoot:
        args['item-image-projection-missing-row-insert-attempt-root'] ?? null,
      itemCanonicalBaseEntityRestorationAttemptRoot:
        args['item-canonical-base-entity-restoration-attempt-root'] ?? null,
      itemSourceLocalNpcAdmissionAttemptRoot:
        args['item-source-local-npc-admission-attempt-root'] ?? null,
      npcT2AttemptRoot: args['npc-t2-attempt-root'] ?? null,
      bossSourceSnapshotHash: args['boss-source-snapshot-hash'] ?? null,
      policyCeilingRegistrationMode: args['policy-ceiling-registration-mode'] ?? 'register',
      l1RunRoot: args['l1-run-root'] ?? null,
      outputPath: args.output,
    });
    process.stdout.write(`${JSON.stringify({
      operationId: manifest.operationId,
      output: path.resolve(args.output),
    })}\n`);
  } catch (error) {
    process.stderr.write(`canonical operation manifest failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
