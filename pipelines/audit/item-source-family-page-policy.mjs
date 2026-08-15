import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_POLICY_PATH = path.join(process.cwd(), 'data', 'config', 'item-source-family-page-policy.json');

export function loadFamilyPagePolicy(policyPath = DEFAULT_POLICY_PATH) {
  return JSON.parse(fs.readFileSync(policyPath, 'utf8'));
}

export function classifyFamilyPagePolicy(pageTitle, policy = loadFamilyPagePolicy()) {
  const normalized = String(pageTitle ?? '').trim();
  if ((policy.allowSharedWorldgenPages ?? []).includes(normalized)) {
    return { pageTitle: normalized, policy: 'allow_shared_worldgen', reason: 'explicit_allowlist' };
  }
  if ((policy.blockUntilItemSpecificPages ?? []).includes(normalized)) {
    return { pageTitle: normalized, policy: 'block_item_specific_required', reason: 'explicit_blocklist' };
  }
  if ((policy.manualReviewPages ?? []).includes(normalized)) {
    return { pageTitle: normalized, policy: 'manual_review', reason: 'explicit_manual_review' };
  }
  return { pageTitle: normalized, policy: 'manual_review', reason: 'no_policy_entry' };
}

export function isFamilyPageAllowedForSharedSource(source, policy = loadFamilyPagePolicy()) {
  const decision = classifyFamilyPagePolicy(source?.pageTitle, policy);
  return decision.policy === 'allow_shared_worldgen'
    && source?.sourceType === 'worldgen'
    && source?.sourceRefType === 'world';
}
