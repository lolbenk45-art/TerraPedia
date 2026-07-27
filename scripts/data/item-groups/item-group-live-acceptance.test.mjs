import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const acceptance = await import('./item-group-live-acceptance.mjs').catch(() => ({}));

const DATABASES = {
  local: 'terria_v1_automation_acceptance_grp_0123456789abcdef_local',
  maint: 'terria_v1_automation_acceptance_grp_0123456789abcdef_maint',
  relation: 'terria_v1_automation_acceptance_grp_0123456789abcdef_relation',
};

async function loadInputs() {
  const paths = {
    recipeReference: new URL('../../../data/generated/recipe-material-reference.json', import.meta.url),
    recipeOverrides: new URL('../../../data/generated/recipe-group-overrides.json', import.meta.url),
    itemOverrides: new URL('../../../data/generated/item-group-overrides.json', import.meta.url),
  };
  const artifacts = {};
  for (const [key, url] of Object.entries(paths)) {
    const raw = await readFile(url, 'utf8');
    artifacts[key] = { raw, payload: JSON.parse(raw), sourceLocator: url.href };
  }
  const itemsPayload = JSON.parse(await readFile(
    new URL('../../../data/standardized/items.standardized.json', import.meta.url),
    'utf8',
  ));
  return { artifacts, items: itemsPayload.records };
}

test('real frozen inputs produce the exact T1 canonical group evidence', async () => {
  assert.equal(typeof acceptance.buildItemGroupAcceptanceProjection, 'function');
  const projection = acceptance.buildItemGroupAcceptanceProjection({
    ...await loadInputs(),
    runKey: 'grp_0123456789abcdef',
  });

  assert.deepEqual(projection.counts, {
    landing: { sourceCount: 4, groupCount: 64 },
    maint: { groupCount: 35, memberCount: 163, aliasCount: 72, exclusionCount: 2 },
    relation: {
      groupCount: 35, memberCount: 163, aliasCount: 72,
      unresolvedCount: 0, ambiguousCount: 0, rejectedCount: 2,
    },
    local: { groupCount: 34, memberCount: 161, aliasCount: 70 },
  });
  assert.equal(projection.blockedGroupCount, 1);
  assert.equal(projection.compatibility.roundTripMatches, true);
  assert.match(projection.runtime.snapshotHash, /^[a-f0-9]{64}$/);
  assert.equal(acceptance.validateItemGroupAcceptanceProjection(projection), projection);
  assert.throws(
    () => acceptance.validateItemGroupAcceptanceProjection({
      ...projection,
      compatibility: { ...projection.compatibility, roundTripMatches: false },
    }),
    /round.trip/i,
  );
});

test('T1 SQL is isolated and proves rollback commit restore plus published state', async () => {
  assert.equal(typeof acceptance.buildItemGroupAcceptanceSql, 'function');
  const projection = acceptance.buildItemGroupAcceptanceProjection({
    ...await loadInputs(),
    runKey: 'grp_0123456789abcdef',
  });
  const sql = acceptance.buildItemGroupAcceptanceSql({ databases: DATABASES, projection });

  assert.doesNotMatch(sql, /terria_v1_(?:local|maint|relation)(?=[^a-z0-9_]|$)/i);
  assert.match(sql, /START TRANSACTION/);
  assert.match(sql, /ROLLBACK/);
  assert.match(sql, /'rollback'/);
  assert.match(sql, /'commit'/);
  assert.match(sql, /'restore'/);
  assert.match(sql, /item_group_projection_state/);
  for (const database of Object.values(DATABASES)) assert.match(sql, new RegExp(database));

  const exclusionInsert = sql.match(/INSERT INTO `[^`]+`\.`maint_item_group_member_exclusions`[\s\S]*?;/)?.[0];
  assert.ok(exclusionInsert);
  assert.doesNotMatch(exclusionInsert, /`canonical_name`/);
  const localGroupInsert = sql.match(/INSERT INTO `[^`]+`\.`item_groups`[\s\S]*?;/)?.[0];
  assert.ok(localGroupInsert);
  assert.match(localGroupInsert, /`name`, `name_zh`/);
  assert.doesNotMatch(localGroupInsert, /`display_name|`landing_|`resolved_member_count|`ambiguous_member_count/);
});

test('T1 output parser requires exact committed counts and a zero restore', async () => {
  assert.equal(typeof acceptance.parseItemGroupAcceptanceOutput, 'function');
  const projection = acceptance.buildItemGroupAcceptanceProjection({
    ...await loadInputs(),
    runKey: 'grp_0123456789abcdef',
  });
  const zero = Array(12).fill(0).join('\t');
  const committed = [4, 35, 163, 72, 2, 35, 163, 72, 34, 161, 70, 1].join('\t');
  const output = [
    `rollback\t${zero}`,
    `commit\t${committed}`,
    `state\tPUBLISHED\t${projection.runtime.snapshotHash}`,
    `restore\t${zero}`,
  ].join('\n');

  const parsed = acceptance.parseItemGroupAcceptanceOutput(output, projection);
  assert.equal(parsed.status, 'passed');
  assert.deepEqual(parsed.commit, [4, 35, 163, 72, 2, 35, 163, 72, 34, 161, 70, 1]);
  assert.throws(
    () => acceptance.parseItemGroupAcceptanceOutput(output.replace(`restore\t${zero}`, `restore\t1\t${zero}`), projection),
    /restore|malformed/i,
  );
});

test('schema parser requires every canonical table, key, check, and immutable audit trigger', () => {
  assert.equal(typeof acceptance.validateItemGroupSchemaOutput, 'function');
  const output = acceptance.EXPECTED_ITEM_GROUP_SCHEMA_EVIDENCE
    .map((entry) => entry.join('\t'))
    .join('\n');
  assert.equal(acceptance.validateItemGroupSchemaOutput(output).status, 'passed');
  assert.throws(
    () => acceptance.validateItemGroupSchemaOutput(output.replace(/trg_item_group_admin_audit_no_delete[^\n]*\n?/, '')),
    /missing schema evidence/i,
  );
});

test('T1 execution selects the isolated local database for its temporary table session', async () => {
  const projection = acceptance.buildItemGroupAcceptanceProjection({
    ...await loadInputs(),
    runKey: 'grp_0123456789abcdef',
  });
  const zero = Array(12).fill(0).join('\t');
  const committed = [4, 35, 163, 72, 2, 35, 163, 72, 34, 161, 70, 1].join('\t');
  const outputs = [
    acceptance.EXPECTED_ITEM_GROUP_SCHEMA_EVIDENCE.map((entry) => entry.join('\t')).join('\n'),
    [
      `rollback\t${zero}`,
      `commit\t${committed}`,
      `state\tPUBLISHED\t${projection.runtime.snapshotHash}`,
      `restore\t${zero}`,
    ].join('\n'),
  ];
  const calls = [];
  const result = await acceptance.runItemGroupLiveAcceptance({
    profile: 't1',
    repoRoot: fileURLToPath(new URL('../../..', import.meta.url)),
    databases: DATABASES,
    manifest: { runKey: 'grp_0123456789abcdef' },
    client: {
      query: async (sql, targetDatabase) => {
        calls.push({ sql, targetDatabase });
        return outputs.shift();
      },
    },
  });
  assert.equal(result.status, 'passed');
  assert.equal(calls[1].targetDatabase, DATABASES.local);
});
