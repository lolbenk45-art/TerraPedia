import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildArmorCanonicalMaintCandidate } from './armor-canonical-maint-candidate.mjs';

const prefix = 'https://media.example.test/terrapedia-images/items/';
const at = '2026-09-24T01:00:00.000Z';
const revision = '2026-09-23T23:00:00.000Z';
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const textHash = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;

function fixture() {
  const module = {
    source: 'terraria.wiki.gg:Module:ArmorSetBonuses', sourcePageTitle: 'Module:ArmorSetBonuses',
    sourceRevisionTimestamp: revision, fetchedAt: at, totalArmorSets: 1,
    armorSets: [{ textKey: 'ArmorSetBonus.Wood', benefitExpression: 'WoodBonus', primaryPart: null,
      setCount: 1, sets: [[1, 2, 3]], uniqueItemIds: [1, 2, 3] }],
  };
  const images = {
    sourcePageTitle: 'Armor set pages', fetchedAt: at, totalArmorSets: 1, totalArmorSetImages: 1, warnings: [],
    armorSetImages: [{ textKey: 'ArmorSetBonus.Wood', pageTitle: 'Wood armor', imageRole: 'male',
      sourceFileTitle: 'Wood_armor.png', originalUrl: 'https://terraria.wiki.gg/images/Wood_armor.png',
      cachedUrl: `${prefix}Wood_armor.png`, sourceRevisionTimestamp: revision,
      isPrimary: true, sortOrder: 0, width: 40, height: 50, contentType: 'image/png' }],
  };
  const landing = (id, dataset, sourceKey, payload) => ({
    id, dataset_type: dataset, source_key: sourceKey, provider: 'terraria.wiki.gg',
    source_page: payload.sourcePageTitle, source_revision_timestamp: payload.sourceRevisionTimestamp ?? null,
    fetched_at: at, parsed_at: at, payload_json: JSON.stringify(payload), content_hash: hash(payload),
    artifact_role: 'source_evidence', parse_status: 'ok', is_current: 1,
  });
  return {
    landingRows: [landing(31, 'armor_sets_raw', 'wiki.module.armorsetbonuses', module),
      landing(32, 'armor_set_images_raw', 'wiki.armor_set_images', images)],
    currentRows: { maint_armor_sets: [], maint_armor_set_images: [] },
    managedImageUrlPrefixes: [prefix],
  };
}

function changePayload(input, index, mutate) {
  const landing = input.landingRows[index];
  const payload = JSON.parse(landing.payload_json);
  mutate(payload);
  landing.payload_json = JSON.stringify(payload);
  landing.content_hash = hash(payload);
}

test('builds a non-executable two-table maint candidate from canonical landing evidence without allocating IDs', async () => {
  const input = fixture();
  const untouched = structuredClone(input);
  const result = await buildArmorCanonicalMaintCandidate(input);
  assert.equal(result.executable, false);
  assert.equal(result.summary.inserts, 2);
  assert.deepEqual(result.deletes, []);
  const row = result.changes.maint_armor_sets.inserts[0];
  assert.equal(row.text_key, 'ArmorSetBonus.Wood');
  assert.equal(row.landing_source_id, 31);
  assert.equal(row.landing_content_hash, input.landingRows[0].content_hash);
  assert.equal(row.id, undefined);
  assert.match(row.record_key, /^[a-f0-9]{64}$/);
  assert.deepEqual(input, untouched);
});

test('builds an ID-independent maint candidate when both source-evidence landing IDs are unresolved', async () => {
  const input = fixture();
  for (const row of input.landingRows) delete row.id;
  const result = await buildArmorCanonicalMaintCandidate({ ...input, allowUnmaterializedLandingIds: true });
  assert.equal(result.executable, false);
  assert.equal(result.summary.inserts, 2);
  assert.equal(result.changes.maint_armor_sets.inserts[0].landing_source_id, undefined);
  assert.equal(result.changes.maint_armor_set_images.inserts[0].landing_source_id, undefined);
  assert.ok(result.unresolvedLandingReferences);
  assert.deepEqual(result.unresolvedLandingReferences.sort(), [
    'armor_set_images_raw|terraria.wiki.gg|wiki.armor_set_images|Armor set pages',
    'armor_sets_raw|terraria.wiki.gg|wiki.module.armorsetbonuses|Module:ArmorSetBonuses',
  ]);
});

test('accepts a namespaced canonical module landing while preserving the exact source page title', async () => {
  const input = fixture();
  input.landingRows[0].id = undefined;
  input.landingRows[0].source_key = 'wiki.module.armorsetbonuses.canonical.a63-20260927-33';
  input.landingRows[0].source_page = 'Module:ArmorSetBonuses';
  const result = await buildArmorCanonicalMaintCandidate({ ...input, allowUnmaterializedLandingIds: true });
  assert.equal(result.summary.inserts, 2);
  assert.equal(result.changes.maint_armor_sets.inserts[0].landing_source_key, input.landingRows[0].source_key);
});

test('validates enriched set effect page lineage and effect text hash', async () => {
  const input = fixture();
  const payload = JSON.parse(input.landingRows[0].payload_json);
  const effectText = '套装奖励：+1 防御';
  payload.armorSets[0].effectText = effectText;
  payload.armorSets[0].effectTextEvidenceHash = `sha256:${'e'.repeat(64)}`;
  payload.armorSets[0].effectTextSource = {
    provider: 'terraria.wiki.gg', locale: 'zh', kind: 'set_page', pageTitle: 'Wood armor',
    revisionId: 101, revisionTimestamp: revision, contentHash: `sha256:${'f'.repeat(64)}`,
    effectTextHash: textHash(effectText),
  };
  input.landingRows[0].payload_json = JSON.stringify(payload);
  input.landingRows[0].content_hash = hash(payload);
  const result = await buildArmorCanonicalMaintCandidate(input);
  assert.equal(result.summary.inserts, 2);
  assert.equal(JSON.parse(result.changes.maint_armor_sets.inserts[0].raw_json).effectTextSource.revisionId, 101);
});

for (const [label, mutate] of [
  ['effect text hash drift', (record) => { record.effectText = '套装奖励：+2 防御'; }],
  ['missing source lineage', (record) => { delete record.effectTextSource; }],
  ['invalid page revision', (record) => { record.effectTextSource.revisionId = 0; }],
]) {
  test(`rejects forged enriched effect evidence: ${label}`, async () => {
    const input = fixture();
    const payload = JSON.parse(input.landingRows[0].payload_json);
    const effectText = '套装奖励：+1 防御';
    payload.armorSets[0].effectText = effectText;
    payload.armorSets[0].effectTextEvidenceHash = `sha256:${'e'.repeat(64)}`;
    payload.armorSets[0].effectTextSource = {
      provider: 'terraria.wiki.gg', locale: 'zh', kind: 'set_page', pageTitle: 'Wood armor',
      revisionId: 101, revisionTimestamp: revision, contentHash: `sha256:${'f'.repeat(64)}`,
      effectTextHash: textHash(effectText),
    };
    mutate(payload.armorSets[0]);
    input.landingRows[0].payload_json = JSON.stringify(payload);
    input.landingRows[0].content_hash = hash(payload);
    await assert.rejects(buildArmorCanonicalMaintCandidate(input), /effect text source|effect text evidence|lineage/i);
  });
}

test('rejects an image landing that omits one module set key', async () => {
  const input = fixture();
  changePayload(input, 0, payload => {
    payload.armorSets.push({ ...payload.armorSets[0], textKey: 'ArmorSetBonus.Shroomite',
      sets: [[1548, 1549, 1550]], uniqueItemIds: [1548, 1549, 1550] });
    payload.totalArmorSets = payload.armorSets.length;
  });
  await assert.rejects(buildArmorCanonicalMaintCandidate(input), /image.*coverage|missing.*image|image.*set/i);
});

test('changed module content preserves existing maint IDs and record keys, retaining unmatched rows', async () => {
  const input = fixture();
  const initial = await buildArmorCanonicalMaintCandidate(input);
  input.currentRows = initial.expectedRows;
  const before = input.currentRows.maint_armor_sets[0];
  before.id = 50;
  before.record_key = 'f'.repeat(64);
  before.created_at = '2026-01-01T00:00:00Z';
  input.currentRows.maint_armor_set_images[0].id = 60;
  const unmatched = { id: 51, record_key: 'e'.repeat(64), text_key: 'ArmorSetBonus.Other', status: 1, deleted: 0 };
  input.currentRows.maint_armor_sets.push(unmatched);
  changePayload(input, 0, (payload) => { payload.armorSets[0].benefitExpression = 'UpdatedBonus'; });
  const next = await buildArmorCanonicalMaintCandidate(input);
  assert.equal(next.summary.inserts, 0);
  const changed = next.changes.maint_armor_sets.updates[0];
  assert.equal(changed.after.id, 50);
  assert.equal(changed.after.record_key, 'f'.repeat(64));
  assert.equal(changed.after.benefit_expression, 'UpdatedBonus');
  assert.equal(changed.after.created_at, before.created_at);
  assert.deepEqual(next.changes.maint_armor_sets.preserved, [unmatched]);
  assert.deepEqual(next.removedSourceIdentities, ['ArmorSetBonus.Other']);
  assert.equal(next.requiresRemovalReview, true);
  const repeated = await buildArmorCanonicalMaintCandidate({ ...input, currentRows: next.expectedRows });
  assert.equal(repeated.summary.updates, 0);
});

test('unmaterialized matching landing IDs preserve existing maint lineage and reject changed sources', async () => {
  const input = fixture();
  input.currentRows = (await buildArmorCanonicalMaintCandidate(input)).expectedRows;
  input.currentRows.maint_armor_sets[0].id = 50;
  input.currentRows.maint_armor_set_images[0].id = 60;
  const originalIds = {
    sets: input.currentRows.maint_armor_sets[0].landing_source_id,
    images: input.currentRows.maint_armor_set_images[0].landing_source_id,
  };
  for (const row of input.landingRows) delete row.id;

  const result = await buildArmorCanonicalMaintCandidate({ ...input, allowUnmaterializedLandingIds: true });
  assert.equal(result.summary.updates, 0);
  assert.equal(result.expectedRows.maint_armor_sets[0].landing_source_id, originalIds.sets);
  assert.equal(result.expectedRows.maint_armor_set_images[0].landing_source_id, originalIds.images);

  changePayload(input, 1, payload => { payload.armorSetImages[0].sortOrder = 3; });
  await assert.rejects(
    buildArmorCanonicalMaintCandidate({ ...input, allowUnmaterializedLandingIds: true }),
    /cannot clear landing source ID|unmaterialized landing/i,
  );
});

test('image reorder/content updates preserve image identity independently of content hash and sort order', async () => {
  const input = fixture();
  input.currentRows = (await buildArmorCanonicalMaintCandidate(input)).expectedRows;
  input.currentRows.maint_armor_sets[0].id = 50;
  const image = input.currentRows.maint_armor_set_images[0];
  image.id = 60;
  image.record_key = 'd'.repeat(64);
  changePayload(input, 1, (payload) => { payload.armorSetImages[0].sortOrder = 3; });
  const result = await buildArmorCanonicalMaintCandidate(input);
  assert.equal(result.changes.maint_armor_set_images.inserts.length, 0);
  assert.equal(result.changes.maint_armor_set_images.updates[0].after.record_key, image.record_key);
  assert.equal(result.changes.maint_armor_set_images.updates[0].after.id, 60);
});

test('DB JSON/date representations do not manufacture updates', async () => {
  const input = fixture();
  input.currentRows = (await buildArmorCanonicalMaintCandidate(input)).expectedRows;
  for (const rows of Object.values(input.currentRows)) {
    for (const [index, row] of rows.entries()) {
      row.id = index + 1;
      if (row.is_primary != null) row.is_primary = String(Number(row.is_primary));
      for (const key of Object.keys(row)) {
        if (key.endsWith('_json')) row[key] = JSON.parse(row[key]);
        if (key.endsWith('_timestamp') || key.endsWith('_at')) {
          if (row[key] != null) row[key] = new Date(row[key]);
        }
      }
    }
  }
  const result = await buildArmorCanonicalMaintCandidate(input);
  assert.equal(result.summary.updates, 0);
  assert.equal(result.summary.unchanged, 2);
});

test('async extraction cannot observe caller changes to frozen inputs', async () => {
  const input = fixture();
  const result = buildArmorCanonicalMaintCandidate(input);
  input.landingRows[1].payload_json = '{}';
  input.currentRows.maint_armor_set_images.push({ invalid: true });
  assert.equal((await result).summary.inserts, 2);
});

test('landing DATETIME seconds bind fractional producer times without discarding exact source evidence', async () => {
  const input = fixture();
  changePayload(input, 0, p => {
    p.fetchedAt = '2026-09-24T01:00:00.123Z';
    p.sourceRevisionTimestamp = '2026-09-23T23:00:00.123Z';
  });
  const result = await buildArmorCanonicalMaintCandidate(input);
  assert.equal(result.changes.maint_armor_sets.inserts[0].landing_content_hash, input.landingRows[0].content_hash);
  assert.equal(result.changes.maint_armor_sets.inserts[0].source_revision_timestamp, revision);
  input.landingRows[0].fetched_at = '2026-09-24T01:00:01.000Z';
  await assert.rejects(buildArmorCanonicalMaintCandidate(input), /time binding/);
});

test('rejects impossible canonical module revision despite matching landing timestamp', async () => {
  const input = fixture();
  const impossible = '2026-02-30T12:00:00.000Z';
  changePayload(input, 0, payload => { payload.sourceRevisionTimestamp = impossible; });
  input.landingRows[0].source_revision_timestamp = impossible;
  await assert.rejects(buildArmorCanonicalMaintCandidate(input), /timestamp|calendar/);
});

test('rejects impossible image revision rather than storing a normalized date', async () => {
  const input = fixture();
  changePayload(input, 1, payload => { payload.armorSetImages[0].sourceRevisionTimestamp = '2026-02-30T12:00:00.000Z'; });
  await assert.rejects(buildArmorCanonicalMaintCandidate(input), /timestamp|calendar/);
});

test('rejects impossible fetched timestamps even when payload and landing agree', async () => {
  const input = fixture();
  const impossible = '2026-02-30T12:00:00.000Z';
  changePayload(input, 0, payload => {
    payload.sourceRevisionTimestamp = '2026-02-01T12:00:00.000Z';
    payload.fetchedAt = impossible;
  });
  input.landingRows[0].source_revision_timestamp = '2026-02-01T12:00:00.000Z';
  input.landingRows[0].fetched_at = impossible;
  await assert.rejects(buildArmorCanonicalMaintCandidate(input), /timestamp|calendar/);
});

test('rejects impossible landing parse timestamp that normalizes after its valid fetch', async () => {
  const input = fixture();
  changePayload(input, 0, payload => {
    payload.sourceRevisionTimestamp = '2026-02-01T12:00:00.000Z';
    payload.fetchedAt = '2026-02-28T12:00:00.000Z';
  });
  input.landingRows[0].source_revision_timestamp = '2026-02-01T12:00:00.000Z';
  input.landingRows[0].fetched_at = '2026-02-28T12:00:00.000Z';
  input.landingRows[0].parsed_at = '2026-02-30T12:00:00.000Z';
  await assert.rejects(buildArmorCanonicalMaintCandidate(input), /timestamp|calendar/);
});

test('valid leap-day fractional source evidence retains exact hashes and SQL second precision', async () => {
  const input = fixture();
  const exact = '2024-02-29T12:00:00.123456Z';
  changePayload(input, 0, payload => { payload.sourceRevisionTimestamp = exact; });
  input.landingRows[0].source_revision_timestamp = new Date('2024-02-29T12:00:00.000Z');
  const result = await buildArmorCanonicalMaintCandidate(input);
  const row = result.expectedRows.maint_armor_sets[0];
  assert.equal(row.source_revision_timestamp, '2024-02-29T12:00:00.000Z');
  assert.equal(row.landing_content_hash, input.landingRows[0].content_hash);
  assert.equal(JSON.parse(input.landingRows[0].payload_json).sourceRevisionTimestamp, exact);
});

for (const [name, mutate] of [
  ['duplicate stable identity', (rows) => rows.push({ ...rows[0], id: 99, record_key: 'c'.repeat(64) })],
  ['duplicate row ID', (rows) => rows.push({ ...rows[0], text_key: 'Other', record_key: 'c'.repeat(64) })],
  ['duplicate record key', (rows) => rows.push({ ...rows[0], id: 99, text_key: 'Other' })],
  ['inactive identity', (rows) => { rows[0].status = 0; }],
]) {
  test(`rejects ${name} in maint baseline`, async () => {
    const input = fixture();
    input.currentRows = (await buildArmorCanonicalMaintCandidate(input)).expectedRows;
    for (const rows of Object.values(input.currentRows)) rows[0].id = 1;
    mutate(input.currentRows.maint_armor_sets);
    await assert.rejects(buildArmorCanonicalMaintCandidate(input), /identity|duplicate|inactive/);
  });
}

for (const [name, mutate, pattern] of [
  ['legacy pruning role', (x) => { x.landingRows[0].artifact_role = 'legacy_compat'; }, /source.evidence/],
  ['hash drift', (x) => { x.landingRows[0].content_hash = 'a'.repeat(64); }, /hash/],
  ['unrelated landing', (x) => { x.landingRows[0].dataset_type = 'items_raw'; }, /dataset/],
  ['missing image snapshot', (x) => { x.landingRows.pop(); }, /snapshot/],
  ['missing module revision', (x) => changePayload(x, 0, p => { delete p.sourceRevisionTimestamp; }), /revision/],
  ['source title drift', (x) => changePayload(x, 0, p => { p.sourcePageTitle = 'Other module'; }), /source|title/],
  ['duplicate text identity', (x) => changePayload(x, 0, p => { p.armorSets.push({ ...p.armorSets[0] }); p.totalArmorSets++; }), /duplicate/],
  ['malformed sets', (x) => changePayload(x, 0, p => { p.armorSets[0].sets = [[1, -2, 3]]; }), /set|part/],
  ['legacy page payload', (x) => changePayload(x, 0, p => { p.records = p.armorSets; delete p.armorSets; }), /module|armorSets/],
  ['image warning', (x) => changePayload(x, 1, p => { p.warnings = [{ message: 'incomplete' }]; }), /image/],
  ['unbound image', (x) => changePayload(x, 1, p => { p.armorSetImages[0].textKey = 'Foreign'; }), /image.*identity/],
  ['unmanaged image', (x) => changePayload(x, 1, p => { p.armorSetImages[0].cachedUrl = 'https://evil.test/image.png'; }), /managed/],
  ['managed path traversal', (x) => changePayload(x, 1, p => { p.armorSetImages[0].cachedUrl = '/terrapedia-images/items/%2e%2e/other.png'; }), /managed/],
  ['managed path control normalization', (x) => changePayload(x, 1, p => { p.armorSetImages[0].cachedUrl = '/terrapedia-images/items/.\n./other.png'; }), /managed/],
  ['managed encoded separator', (x) => changePayload(x, 1, p => { p.armorSetImages[0].cachedUrl = '/terrapedia-images/items/a%2fb.png'; }), /managed/],
  ['managed nested escape', (x) => changePayload(x, 1, p => { p.armorSetImages[0].cachedUrl = '/terrapedia-images/items/%252e%252e%252fother.png'; }), /managed/],
  ['managed image query', (x) => changePayload(x, 1, p => { p.armorSetImages[0].cachedUrl += '?forged=1'; }), /managed/],
  ['missing image revision', (x) => changePayload(x, 1, p => { p.armorSetImages[0].sourceRevisionTimestamp = null; }), /revision/],
  ['string image boolean', (x) => changePayload(x, 1, p => { p.armorSetImages[0].isPrimary = 'false'; }), /image.*shape/],
  ['unrelated baseline table', (x) => { x.currentRows.maint_items = []; }, /table/],
]) {
  test(`rejects ${name} before producing a candidate`, async () => {
    const input = fixture();
    mutate(input);
    await assert.rejects(buildArmorCanonicalMaintCandidate(input), pattern);
  });
}

test('preserves producer part image role and existing identity across source refresh', async () => {
  const input = fixture();
  changePayload(input, 1, payload => {
    Object.assign(payload.armorSetImages[0], {
      imageRole: 'part', sourceFileTitle: 'Wood_Helmet.png', isPrimary: false,
    });
  });
  const initial = await buildArmorCanonicalMaintCandidate(input);
  input.currentRows = initial.expectedRows;
  input.currentRows.maint_armor_sets[0].id = 50;
  Object.assign(input.currentRows.maint_armor_set_images[0], { id: 60, record_key: 'd'.repeat(64) });
  changePayload(input, 1, payload => { payload.armorSetImages[0].sortOrder = 9; });
  const result = await buildArmorCanonicalMaintCandidate(input);
  const image = result.changes.maint_armor_set_images.updates[0].after;
  assert.equal(image.image_role, 'part');
  assert.equal(image.id, 60);
  assert.equal(image.record_key, 'd'.repeat(64));
  assert.equal(image.source_revision_timestamp, revision);
  assert.equal(result.changes.maint_armor_set_images.inserts.length, 0);
  assert.deepEqual(result.deletes, []);
});
