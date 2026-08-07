import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(moduleDir, 'fixtures', 'buff-t1.sample.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

function fixtureRecords() {
  return fixture.records.map((record) => structuredClone(record));
}

export function buildBuffT1LandingRows() {
  return fixtureRecords().map((record) => ({
    dataset_type: 'buffs_raw',
    provider: record.sourceEvidence?.provider ?? 'terraria.wiki.gg',
    source_kind: 'wiki_page',
    source_key: String(record.id),
    source_locator: record.sourceEvidence?.canonicalPageTitle ?? record.englishName,
    source_page: record.sourceEvidence?.pageTitle ?? record.englishName,
    source_revision_timestamp: record.sourceEvidence?.revisionTimestamp ?? null,
    payload_json: JSON.stringify(record),
    parse_status: record.sourceEvidence?.parseStatus === 'parsed' ? 'ok' : 'partial',
    is_current: 1,
  }));
}

export function seedBuffFixtureItems(records = fixtureRecords()) {
  return records.flatMap((record) => (record.sourceItems ?? []).map((item, index) => ({
    source_id: item.itemId ?? null,
    internal_name: item.internalName,
    name: item.name,
    buff_source_id: record.id,
    sort_order: item.sourceOrder ?? index + 1,
    raw_json: JSON.stringify(item),
  })));
}

export function seedBuffFixtureNpcs(records = fixtureRecords()) {
  return records.flatMap((record) => (record.inflictingNpcs ?? []).map((npc, index) => ({
    source_id: npc.npcId ?? null,
    internal_name: npc.internalName,
    name: npc.name,
    buff_source_id: record.id,
    sort_order: npc.sourceOrder ?? index + 1,
    raw_json: JSON.stringify(npc),
  })));
}

export function seedBuffFixtureMaintItems(records = fixtureRecords()) {
  return seedBuffFixtureItems(records).map((row) => ({
    source_id: row.buff_source_id,
    internal_name: `Buff${row.buff_source_id}`,
    raw_json: JSON.stringify(records.find((record) => record.id === row.buff_source_id)),
  }));
}

export function seedBuffFixtureMaintNpcs(records = fixtureRecords()) {
  return seedBuffFixtureNpcs(records).map((row) => ({
    source_id: row.buff_source_id,
    internal_name: `Buff${row.buff_source_id}`,
    raw_json: JSON.stringify(records.find((record) => record.id === row.buff_source_id)),
  }));
}

function assertBuffExecutorIsolation(executor) {
  const name = String(executor?.name ?? '').toLowerCase();
  const domain = String(executor?.domain ?? 'buffs').toLowerCase();
  if (domain !== 'buffs' || (name && !name.includes('buff'))) {
    throw new Error('T1 acceptance executor must remain isolated to buffs');
  }
}

export async function runBuffCanonicalT1Acceptance({ executor = { name: 'buff-canonical-t1' } } = {}) {
  assertBuffExecutorIsolation(executor);
  const records = fixtureRecords();
  const rows = buildBuffT1LandingRows();
  return {
    datasetType: 'buffs_raw',
    records: records.length,
    landingRows: rows.length,
    relations: {
      itemBuffRelations: seedBuffFixtureItems(records).length,
      inflictingNpcBuffRelations: seedBuffFixtureNpcs(records).length,
    },
  };
}

export { fixturePath };
