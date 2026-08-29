#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
  loadAuthorizedOperationServerFingerprint,
  assertAuthorizedOperationDataBundle,
} from '../automation/authorized-operation-context.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';

export const OPERATION_ID = 'canonical-biome-image-contract-apply';
const LEDGER_PATH = 'reports/authorization/canonical/used-decisions.json';
const TARGETS = Object.freeze({
  maint: 'terria_v1_maint',
  relation: 'terria_v1_relation',
  local: 'terria_v1_local',
});

export function buildBiomeImageMutationValues(row = {}) {
  const originalUrl = row.originalUrl ?? row.iconUrl ?? null;
  const cachedUrl = row.cachedUrl ?? row.iconUrl ?? null;
  return {
    originalUrl,
    cachedUrl,
    contentType: row.contentType ?? (String(cachedUrl ?? '').toLowerCase().endsWith('.png') ? 'image/png' : null),
  };
}

export async function applyBiomeImageContract({ repoRoot = getProjectRoot(), inputPath, outputPath = null, now = new Date().toISOString() } = {}) {
  const root = path.resolve(repoRoot);
  const input = JSON.parse(fs.readFileSync(path.resolve(root, inputPath), 'utf8'));
  if (input.operationId !== OPERATION_ID || input.databaseWrites !== true || !Array.isArray(input.rows) || ![7, 47].includes(input.rows.length)) {
    throw new Error('Biome image contract input is invalid or not an exact seven-row mirror or 47-row contract scope');
  }
  const context = loadAuthorizedOperationContext({ operationId: OPERATION_ID, now });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
  loadAuthorizedOperationServerFingerprint({ authorizedContext: context });
  consumeAuthorizedOperationDispatchPermit({
    authorizedContext: context,
    decisionLedgerPath: path.join(root, LEDGER_PATH),
  });
  const mysql = createRequire(path.join(root, 'apps/admin-console', 'package.json'))('mysql2/promise');
  const connection = await mysql.createConnection({
    host: process.env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.TERRAPEDIA_DB_PORT ?? 13306),
    user: process.env.TERRAPEDIA_DB_USERNAME ?? 'root',
    password: process.env.TERRAPEDIA_DB_PASSWORD ?? 'root',
    multipleStatements: false,
  });
  try {
    await connection.beginTransaction();
    try {
      for (const row of input.rows) {
        const recordKey = row.recordKey;
        const image = buildBiomeImageMutationValues(row);
        const common = [recordKey, row.code, 'legacy_local_biome_icon_contract', row.sourcePage ?? null, image.originalUrl, image.cachedUrl, null, null, image.contentType];
        await connection.execute(`INSERT INTO \`${TARGETS.maint}\`.\`maint_biome_images\` (record_key,biome_code,source_provider,source_page,original_url,cached_url,width,height,content_type) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE biome_code=VALUES(biome_code),source_provider=VALUES(source_provider),source_page=VALUES(source_page),original_url=VALUES(original_url),cached_url=VALUES(cached_url),content_type=VALUES(content_type),status=1,deleted=0`, common);
        await connection.execute(`INSERT INTO \`${TARGETS.relation}\`.\`relation_biome_images\` (record_key,biome_code,source_maint_record_key,source_provider,source_page,original_url,cached_url,width,height,content_type) VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE biome_code=VALUES(biome_code),source_maint_record_key=VALUES(source_maint_record_key),source_provider=VALUES(source_provider),source_page=VALUES(source_page),original_url=VALUES(original_url),cached_url=VALUES(cached_url),content_type=VALUES(content_type),status=1,deleted=0`, [recordKey, row.code, recordKey, ...common.slice(2)]);
        await connection.execute(`INSERT INTO \`${TARGETS.relation}\`.\`projection_biomes\` (id,relation_record_key,code,name_en,name_zh,icon_url,source_provider,source_page,status,deleted) VALUES (?,?,?,?,?,?,?,?,1,0) ON DUPLICATE KEY UPDATE relation_record_key=VALUES(relation_record_key),name_en=VALUES(name_en),name_zh=VALUES(name_zh),icon_url=VALUES(icon_url),source_provider=VALUES(source_provider),source_page=VALUES(source_page),status=1,deleted=0`, [row.id, recordKey, row.code, row.nameEn, row.nameZh, image.cachedUrl, 'legacy_local_biome_icon_contract', row.sourcePage ?? null]);
        await connection.execute(`UPDATE \`${TARGETS.local}\`.\`biomes\` SET icon_url=?, source_provider=?, source_page=?, updated_at=NOW() WHERE id=? AND code=? AND deleted=0`, [image.cachedUrl, 'legacy_local_biome_icon_contract', row.sourcePage ?? null, row.id, row.code]);
      }
      const [counts] = await connection.query(`SELECT (SELECT COUNT(*) FROM \`${TARGETS.maint}\`.\`maint_biome_images\` WHERE deleted=0 AND status=1) maint_count, (SELECT COUNT(*) FROM \`${TARGETS.relation}\`.\`relation_biome_images\` WHERE deleted=0 AND status=1) relation_count, (SELECT COUNT(*) FROM \`${TARGETS.relation}\`.\`projection_biomes\` WHERE deleted=0 AND status=1) projection_count, (SELECT COUNT(*) FROM \`${TARGETS.local}\`.\`biomes\` WHERE deleted=0 AND status=1) local_count`);
      const actual = counts?.[0] ?? {};
      if (Number(actual.maint_count) !== 47 || Number(actual.relation_count) !== 47 || Number(actual.projection_count) !== 47 || Number(actual.local_count) !== 47) throw new Error('Biome image contract readback count drifted');
      await connection.commit();
      const result = { operationId: OPERATION_ID, status: 'COMPLETED', appliedAt: now, counts: { maint: Number(actual.maint_count), relation: Number(actual.relation_count), projection: Number(actual.projection_count), local: Number(actual.local_count) } };
      if (outputPath) fs.writeFileSync(path.resolve(root, outputPath), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
      return result;
    } catch (error) { await connection.rollback(); throw error; }
  } finally { await connection.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => { const [key, ...rest] = arg.replace(/^--/, '').split('='); return [key, rest.join('=')]; }));
  applyBiomeImageContract({ inputPath: args.input, outputPath: args.output, now: new Date().toISOString() }).then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
}
