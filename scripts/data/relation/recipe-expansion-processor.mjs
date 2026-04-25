import {
  confidence,
  createRecordKey,
  normalizeText,
  relationStatus
} from './relation-trace.mjs';
import { canonicalizeRecipeGroupName } from '../lib/recipe-material-reference.mjs';

function toNullableNumber(value) {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildGroupIndex(recipeReferencePayload = {}) {
  const groups = Array.isArray(recipeReferencePayload?.groups) ? recipeReferencePayload.groups : [];
  const index = new Map();

  for (const group of groups) {
    const canonicalName = canonicalizeRecipeGroupName(group?.canonicalName ?? group?.displayNameEn);
    if (!canonicalName) {
      continue;
    }
    const existing = index.get(canonicalName) ?? {
      canonicalName,
      displayNameZh: normalizeText(group?.displayNameZh),
      members: new Map()
    };
    const members = Array.isArray(group?.members) ? group.members : [];
    for (const member of members) {
      const internalName = normalizeText(member?.internalName);
      const name = normalizeText(member?.name);
      const key = internalName ?? name;
      if (!key || existing.members.has(key)) {
        continue;
      }
      existing.members.set(key, {
        internalName,
        memberName: name,
        memberNameZh: normalizeText(member?.nameZh)
      });
    }
    index.set(canonicalName, existing);
  }

  return index;
}

export function buildRecipeGroupExpansions({
  recipeIngredients = [],
  recipeReferencePayload = {}
} = {}) {
  const groupIndex = buildGroupIndex(recipeReferencePayload);
  const groupExpansions = [];

  for (const ingredient of recipeIngredients) {
    if (normalizeText(ingredient?.ingredientGroupType) !== 'group') {
      continue;
    }

    const canonicalGroupName = canonicalizeRecipeGroupName(ingredient?.ingredientNameRaw);
    const group = canonicalGroupName ? groupIndex.get(canonicalGroupName) ?? null : null;
    if (!group) {
      continue;
    }

    const members = Array.from(group.members.values()).sort((left, right) =>
      String(left.internalName ?? left.memberName ?? '').localeCompare(String(right.internalName ?? right.memberName ?? ''))
    );

    for (let index = 0; index < members.length; index += 1) {
      const member = members[index];
      groupExpansions.push({
        recordKey: createRecordKey({
          type: 'recipe_group_expansion',
          ingredientRecordKey: ingredient.recordKey ?? null,
          memberInternalName: member.internalName ?? null,
          memberName: member.memberName ?? null
        }),
        recipeKey: normalizeText(ingredient.recipeKey),
        ingredientRecordKey: normalizeText(ingredient.recordKey),
        groupName: canonicalGroupName,
        groupNameZh: group.displayNameZh,
        memberInternalName: member.internalName,
        memberName: member.memberName,
        memberNameZh: member.memberNameZh,
        quantityMin: toNullableNumber(ingredient.quantityMin),
        quantityMax: toNullableNumber(ingredient.quantityMax),
        quantityText: normalizeText(ingredient.quantityText),
        sortOrder: toNullableNumber(ingredient.sortOrder) ?? index,
        reviewStatus: relationStatus.resolved,
        confidence: confidence.high,
        reason: 'recipe_group_expanded_from_reference',
        sourceMaintTable: ingredient.sourceMaintTable ?? null,
        sourceMaintRecordKey: ingredient.sourceMaintRecordKey ?? null,
        sourceMaintId: ingredient.sourceMaintId ?? null,
        landingSourceId: ingredient.landingSourceId ?? null,
        landingSourceKey: ingredient.landingSourceKey ?? null,
        landingContentHash: ingredient.landingContentHash ?? null,
        sourceProvider: ingredient.sourceProvider ?? null,
        sourcePage: ingredient.sourcePage ?? null,
        sourceRevisionTimestamp: ingredient.sourceRevisionTimestamp ?? null,
        rawJson: ingredient.rawJson ?? null
      });
    }
  }

  return {
    groupExpansions
  };
}
