#!/usr/bin/env node

import {
  MIMIC_CONTRACT_ITEM_INTERNAL_NAMES,
  classifyNpcLootSource,
} from '../lib/npc-loot-source-taxonomy.mjs';

export function evaluateMimicFamilyRows(rows = []) {
  const familyStatus = rows.map((row) => {
    const classification = classifyNpcLootSource(row);
    return {
      ...row,
      status: classification.status,
      materializable: classification.materializable,
      targetNpcInternalName: classification.targetNpcInternalName,
      reason: classification.reason,
      sourceRefResolution: classification.sourceRefResolution,
    };
  });

  const acceptedItems = familyStatus
    .filter((row) => row.status === 'accepted' && row.targetNpcInternalName === 'Mimic')
    .map((row) => row.itemInternalName)
    .filter(Boolean)
    .sort();
  const acceptedSet = new Set(acceptedItems);
  const missingItems = [...MIMIC_CONTRACT_ITEM_INTERNAL_NAMES]
    .filter((itemInternalName) => !acceptedSet.has(itemInternalName))
    .sort();
  const extraItems = acceptedItems
    .filter((itemInternalName) => !MIMIC_CONTRACT_ITEM_INTERNAL_NAMES.has(itemInternalName))
    .sort();
  const mismatchRows = familyStatus.filter((row) => row.status === 'contract_mismatch');
  const genericBucketRows = familyStatus.filter((row) => row.status === 'generic_bucket');
  const ordinaryContractPass = missingItems.length === 0 && extraItems.length === 0 && mismatchRows.length === 0;
  const auditStatus = ordinaryContractPass ? 'pass' : 'blocked';

  return {
    auditName: 'mimic-family-loot-contract',
    auditStatus,
    evidenceHealth: 'sufficient',
    checks: [
      {
        id: 'ordinary_mimic_exact_contract',
        status: ordinaryContractPass ? 'pass' : 'fail',
        expectedItems: [...MIMIC_CONTRACT_ITEM_INTERNAL_NAMES].sort(),
        acceptedItems,
        missingItems,
        extraItems,
      },
    ],
    ordinaryMimic: {
      acceptedItems,
      missingItems,
      extraItems,
    },
    familyStatus,
    mismatchRows,
    genericBucketRows,
    summary: {
      totalRows: familyStatus.length,
      accepted: familyStatus.filter((row) => row.status === 'accepted').length,
      contractMismatch: mismatchRows.length,
      genericBucket: genericBucketRows.length,
      blocked: familyStatus.filter((row) => row.status !== 'accepted').length,
    },
  };
}
