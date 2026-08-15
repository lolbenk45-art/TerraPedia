import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { auditCanonicalConsistency } from './audit-canonical-consistency.mjs';
import { createCanonicalContentHash } from './canonical-schema.mjs';

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

test('auditCanonicalConsistency reports full hash match for valid item candidates', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'terrapedia-canonical-audit-'));
  const repoRoot = path.join(tempRoot, 'repo');
  const sharedDataRoot = path.join(tempRoot, 'shared');
  const itemsPayload = {
    moduleTitle: 'Module:Iteminfo/data',
    items: {
      1: { name: 'Iron Pickaxe' },
    },
  };
  const itemPagePayload = {
    itemInternalName: 'IronPickaxe',
    pageTitle: 'Iron Pickaxe',
    infobox: { type: 'tool' },
  };

  await writeJson(path.join(sharedDataRoot, 'raw', 'wiki', 'module__iteminfo__data.latest.json'), itemsPayload);
  await writeJson(path.join(sharedDataRoot, 'raw', 'wiki', 'item-pages', 'iron-pickaxe.latest.json'), itemPagePayload);

  const candidatesPath = path.join(repoRoot, 'reports', 'canonical', 'candidates', 'item', 'canonical-candidates.json');
  await writeJson(candidatesPath, {
    domain: 'item',
    generatedAt: '2026-05-06T09:00:00.000Z',
    candidates: [
      {
        canonical_version: 'v1',
        domain: 'item',
        dataset_type: 'items_raw',
        candidate_generated_at: '2026-05-06T09:00:00.000Z',
        source_landing_id: 'landing:items_raw:terraria.wiki.gg:wiki.module.iteminfo:Module%3AIteminfo%2Fdata',
        source_provider: 'terraria.wiki.gg',
        source_key: 'wiki.module.iteminfo',
        source_page: 'Module:Iteminfo/data',
        source_revision_timestamp: null,
        source_content_hash: createCanonicalContentHash(itemsPayload),
        content_hash: createCanonicalContentHash(itemsPayload),
        payload_file: 'payloads/items.json',
      },
      {
        canonical_version: 'v1',
        domain: 'item',
        dataset_type: 'item_pages_raw',
        candidate_generated_at: '2026-05-06T09:00:00.000Z',
        source_landing_id: 'landing:item_pages_raw:terraria.wiki.gg:wiki.page.item_detail:IronPickaxe:Iron%20Pickaxe',
        source_provider: 'terraria.wiki.gg',
        source_key: 'wiki.page.item_detail:IronPickaxe',
        source_page: 'Iron Pickaxe',
        source_revision_timestamp: null,
        source_content_hash: createCanonicalContentHash(itemPagePayload),
        content_hash: createCanonicalContentHash(itemPagePayload),
        payload_file: 'payloads/item-page.json',
      },
    ],
  });
  await writeJson(path.join(repoRoot, 'reports', 'canonical', 'candidates', 'item', 'payloads', 'items.json'), itemsPayload);
  await writeJson(path.join(repoRoot, 'reports', 'canonical', 'candidates', 'item', 'payloads', 'item-page.json'), itemPagePayload);

  const audit = await auditCanonicalConsistency({
    repoRoot,
    sharedDataRoot,
    candidatesPath,
    now: new Date('2026-05-06T09:30:00.000Z'),
  });

  assert.equal(audit.domain, 'item');
  assert.equal(audit.summary.totalCandidates, 2);
  assert.equal(audit.summary.hashMatchRate, 1);
  assert.equal(audit.summary.coverageRate, 1);
  assert.deepEqual(audit.summary.schemaViolations, []);
  assert.deepEqual(audit.summary.missingLandingInputs, []);
});
