import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { assertRepositoryOrdinaryFile, assertRepositoryPathConfinement } from '../lib/private-repository-path.mjs';
import { assertAuthorizedOperationDataBundle, consumeAuthorizedOperationDispatchPermit, loadAuthorizedOperationContext, loadAuthorizedOperationServerFingerprint } from '../automation/authorized-operation-context.mjs';
import { assertArmorIncrementalRuntimeFence, buildArmorIncrementalConnectionOptions } from './run-armor-set-projection-incremental.mjs';
import { ARMOR_RELATION_ITEM_NORMALIZATION_OPERATION_ID, ARMOR_RELATION_ITEM_NORMALIZATION_OWNERSHIP, ARMOR_RELATION_ITEM_NORMALIZATION_TARGET_IDS, buildArmorRelationItemNormalizationCandidate, buildArmorRelationItemNormalizationProposal, validateArmorRelationItemNormalizationProposal } from './armor-relation-item-normalization.mjs';
import { executeArmorRelationItemNormalizationTransaction } from './armor-relation-item-normalization-transaction.mjs';

export { ARMOR_RELATION_ITEM_NORMALIZATION_OPERATION_ID } from './armor-relation-item-normalization.mjs';

export function buildArmorRelationItemNormalizationPaths(resultLabel) {
  if (typeof resultLabel !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resultLabel)) throw new Error('Armor relation-item normalization result label is required and must be normalized');
  const prefix = `reports/authorization/canonical/${ARMOR_RELATION_ITEM_NORMALIZATION_OPERATION_ID}.${resultLabel}`;
  return { proposalPath: `${prefix}.proposal.json`, preparedPath: `${prefix}.prepared.json`, resultPath: `${prefix}.result.json` };
}

function privatePath(root, relativePath) { return assertRepositoryPathConfinement({ repoRoot: root, filePath: path.resolve(root, relativePath), label: 'Armor relation-item normalization output', createParent: true }); }
function readPrivateJson(root, relativePath) { const target = assertRepositoryOrdinaryFile({ repoRoot: root, filePath: path.resolve(root, relativePath), label: 'Armor relation-item normalization artifact' }); if ((fs.statSync(target).mode & 0o077) !== 0) throw new Error('Armor relation-item normalization artifact must be private'); return JSON.parse(fs.readFileSync(target, 'utf8')); }
function writePrivateJson(root, relativePath, value) { const target = privatePath(root, relativePath); const fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600); try { fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function assertFresh(root, relativePath) { try { fs.lstatSync(path.resolve(root, relativePath)); } catch (error) { if (error.code === 'ENOENT') return; throw error; } throw new Error(`Armor relation-item normalization output already exists: ${relativePath}`); }
const placeholders = values => values.map(() => '?').join(', ');

async function readPrepareRows(connection) {
  const [maintItems] = await connection.query(`SELECT * FROM terria_v1_maint.maint_items WHERE source_id IN (${placeholders(ARMOR_RELATION_ITEM_NORMALIZATION_TARGET_IDS)}) ORDER BY source_id`, ARMOR_RELATION_ITEM_NORMALIZATION_TARGET_IDS);
  const [relationItems] = await connection.query(`SELECT * FROM terria_v1_relation.relation_items WHERE source_id IN (${placeholders(ARMOR_RELATION_ITEM_NORMALIZATION_TARGET_IDS)}) ORDER BY source_id`, ARMOR_RELATION_ITEM_NORMALIZATION_TARGET_IDS);
  return { maintItems, relationItems };
}

export async function prepareArmorRelationItemNormalization({ repoRoot = process.cwd(), resultLabel, mysqlModule } = {}) {
  const root = path.resolve(repoRoot); const paths = buildArmorRelationItemNormalizationPaths(resultLabel); [paths.proposalPath, paths.preparedPath, paths.resultPath].forEach(p => assertFresh(root, p));
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule }); const connection = await mysql.createConnection(buildArmorIncrementalConnectionOptions(loadLocalStackConfig(root))); let proposal;
  try { await connection.query('START TRANSACTION READ ONLY'); const [servers] = await connection.query('SELECT @@server_uuid AS serverUuid, TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS timezoneOffsetMinutes'); if (servers.length !== 1 || Number(servers[0].timezoneOffsetMinutes) !== 480) throw new Error('Armor relation-item normalization timezone drift'); proposal = buildArmorRelationItemNormalizationProposal({ candidate: buildArmorRelationItemNormalizationCandidate(await readPrepareRows(connection)), serverUuid: servers[0].serverUuid }); } finally { try { await connection.rollback(); } finally { await connection.end(); } }
  writePrivateJson(root, paths.proposalPath, proposal); return { operationId: ARMOR_RELATION_ITEM_NORMALIZATION_OPERATION_ID, ...paths, proposalSha256: proposal.proposalSha256, targetItemSourceIds: [...ARMOR_RELATION_ITEM_NORMALIZATION_TARGET_IDS], databaseWrites: false, applyAllowed: false };
}

export async function applyArmorRelationItemNormalization({ repoRoot = process.cwd(), resultLabel, env = process.env, mysqlModule } = {}) {
  const root = path.resolve(repoRoot); const paths = buildArmorRelationItemNormalizationPaths(resultLabel); const context = loadAuthorizedOperationContext({ repoRoot: root, operationId: ARMOR_RELATION_ITEM_NORMALIZATION_OPERATION_ID, env }); assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
  if (context.executionManifest.resultLabel !== resultLabel || JSON.stringify(context.executionManifest.ownershipKeys) !== JSON.stringify(ARMOR_RELATION_ITEM_NORMALIZATION_OWNERSHIP)) throw new Error('Armor relation-item normalization packet label or ownership drifted');
  const binding = context.dataBundleEntries.find(entry => entry.path === paths.proposalPath); if (!binding?.contentHash) throw new Error('Armor relation-item normalization proposal binding is missing'); const bytes = fs.readFileSync(path.resolve(root, paths.proposalPath)); if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== binding.contentHash) throw new Error('Armor relation-item normalization proposal bytes drifted');
  const proposal = readPrivateJson(root, paths.proposalPath); validateArmorRelationItemNormalizationProposal(proposal); const fingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext: context, env }); const options = buildArmorIncrementalConnectionOptions(loadLocalStackConfig(root)); if (fingerprint.host !== options.host || Number(fingerprint.port) !== Number(options.port) || fingerprint.serverUuid !== proposal.serverUuid) throw new Error('Armor relation-item normalization target drifted'); [paths.preparedPath, paths.resultPath].forEach(p => assertFresh(root, p));
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule }); const connection = await mysql.createConnection(options); let primaryError;
  try { return await executeArmorRelationItemNormalizationTransaction({ connection, proposal, assertRuntimeFence: async () => assertArmorIncrementalRuntimeFence({ connection, authorizedContext: context, serverUuid: fingerprint.serverUuid }), consumePermit: async () => consumeAuthorizedOperationDispatchPermit({ env, authorizedContext: context, decisionLedgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json') }), persistPrepared: evidence => writePrivateJson(root, paths.preparedPath, { ...evidence, authorization: { decisionIdentity: context.decisionIdentity, packetHash: context.packetHash } }), persistOutcome: evidence => writePrivateJson(root, paths.resultPath, { ...evidence, authorization: { decisionIdentity: context.decisionIdentity, packetHash: context.packetHash } }) }); } catch (error) { primaryError = error; throw error; } finally { try { await connection.end(); } catch (cause) { if (primaryError) (primaryError.suppressedErrors ??= []).push(cause); else throw cause; } }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { const args = {}; for (const token of process.argv.slice(2)) { const match = /^--(operation-id|result-label|prepare|apply)=(.+)$/.exec(token); if (!match || Object.hasOwn(args, match[1])) throw new Error('Armor relation-item normalization CLI argument is invalid or duplicated'); args[match[1]] = match[2]; } const prepare = args.prepare === 'true'; const apply = args.apply === 'true'; if (args['operation-id'] !== ARMOR_RELATION_ITEM_NORMALIZATION_OPERATION_ID || prepare === apply) throw new Error('Armor relation-item normalization CLI requires the exact operation and one explicit action'); (prepare ? prepareArmorRelationItemNormalization : applyArmorRelationItemNormalization)({ resultLabel: args['result-label'] }).then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => { process.stderr.write(`${error.message}; requiresReadbackReconciliation=${error.requiresReadbackReconciliation === true}\n`); process.exitCode = 1; }); }
