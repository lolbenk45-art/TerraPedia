import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_OPERATION_ID =
  'canonical-item-image-projection-missing-row-insert';
export const ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_CONTRACT_VERSION =
  'item-image-projection-missing-row-insert-v1';
export const ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_ATTEMPT_ROOT_PREFIX =
  'reports/authorization/canonical/item-image-projection-missing-row-insert';

export const ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS = Object.freeze([
  'AntlionEggs',
  'BoneWhip',
  'RoninShirt',
  'TVHeadPants',
  'TimelessTravelerHood',
]);

const ITEM_IMAGE_PREFIX = '/terrapedia-images/items/';

export function buildItemImageProjectionMissingRowInsertProposal({
  generatedAt,
  expiresAt,
  proposalAuthorization,
  keys,
  target,
  relationItems,
  relationImageRows,
  existingProjectionRows,
} = {}) {
  const requestedKeys = keys ?? [...ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS];
  assertExactKeys(requestedKeys);
  assertTarget(target);
  assertNoExistingProjectionRows(existingProjectionRows);
  const itemByKey = indexRows(relationItems, 'internalName', 'relation items');
  const imageByKey = indexRows(relationImageRows, 'itemInternalName', 'relation image rows');
  const projectionRows = ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS.map((key) => {
    const item = itemByKey.get(key);
    const image = imageByKey.get(key);
    assertActiveItem(item, key);
    assertActivePrimaryManagedImage(image, key);
    return buildProjectionRow(item, image);
  });
  const attemptId = deriveItemImageProjectionMissingRowInsertAttemptId(
    proposalAuthorization?.decisionIdentity,
  );
  const attemptRoot = deriveItemImageProjectionMissingRowInsertAttemptRoot(
    proposalAuthorization?.decisionIdentity,
  );
  const proposal = {
    operationId: ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_OPERATION_ID,
    contractVersion: ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_CONTRACT_VERSION,
    attemptId,
    attemptRoot,
    generatedAt: requireTimestamp(generatedAt, 'generatedAt'),
    expiresAt: requireTimestamp(expiresAt, 'expiresAt'),
    apply: false,
    proposalAuthorization: requireObject(proposalAuthorization, 'proposalAuthorization'),
    keys: [...ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS],
    target: { ...target },
    projectionRows,
    targetRowCount: projectionRows.length,
    insertedRowCount: projectionRows.length,
    sourceRowsSha256: canonicalHash(relationItems),
    relationImageRowsSha256: canonicalHash(relationImageRows),
    projectionRowsSha256: canonicalHash(projectionRows),
    snapshotPath: `${attemptRoot}/snapshot.json`,
    snapshotSha256: canonicalHash({ relationItems, relationImageRows, existingProjectionRows }),
    proposalPath: `${attemptRoot}/proposal.json`,
  };
  proposal.proposalSha256 = canonicalHash(proposal);
  return Object.freeze(proposal);
}

export function deriveItemImageProjectionMissingRowInsertAttemptId(decisionIdentity) {
  return createHash('sha256').update(requireText(decisionIdentity, 'decisionIdentity'), 'utf8').digest('hex');
}

export function deriveItemImageProjectionMissingRowInsertAttemptRoot(decisionIdentity) {
  return `${ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_ATTEMPT_ROOT_PREFIX}/${deriveItemImageProjectionMissingRowInsertAttemptId(decisionIdentity)}`;
}

export function buildItemImageProjectionMissingRowInsertAttemptPaths(decisionIdentity) {
  const attemptRoot = deriveItemImageProjectionMissingRowInsertAttemptRoot(decisionIdentity);
  return Object.freeze({
    attemptId: deriveItemImageProjectionMissingRowInsertAttemptId(decisionIdentity),
    attemptRoot,
    proposalReadOwnerInputPath: `${attemptRoot}/proposal-read.owner-input.json`,
    snapshotPath: `${attemptRoot}/snapshot.json`,
    proposalPath: `${attemptRoot}/proposal.json`,
    inputPath: `${attemptRoot}/input.json`,
    manifestPath: `${attemptRoot}/execution-manifest.json`,
    requestPath: `${attemptRoot}/request.json`,
    packetPath: `${attemptRoot}/packet.json`,
    permitPath: `${attemptRoot}/permit.json`,
    resultPath: `${attemptRoot}/result.json`,
  });
}

export function buildItemImageProjectionMissingRowInsertInputContract({ proposal } = {}) {
  if (!proposal || proposal.operationId !== ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_OPERATION_ID) {
    throw new Error('missing-row insert proposal is required');
  }
  return Object.freeze({ ...proposal, apply: true });
}

export function buildItemImageProjectionMissingRowInsertCompletedResult({
  inputContract,
  inputContractPath,
  completedAt,
} = {}) {
  return Object.freeze({
    resultKind: 'canonical_item_image_projection_missing_row_insert_result',
    operationId: ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_OPERATION_ID,
    contractVersion: ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_CONTRACT_VERSION,
    status: 'completed',
    apply: true,
    inputContractPath,
    inputContractSha256: canonicalHash(inputContract),
    attemptId: inputContract.attemptId,
    attemptRoot: inputContract.attemptRoot,
    keySetSha256: canonicalHash(inputContract.keys),
    insertedRowCount: inputContract.insertedRowCount,
    projectionRowsSha256: inputContract.projectionRowsSha256,
    completedAt,
  });
}

export function writeItemImageProjectionMissingRowInsertJson({ repoRoot, outputPath, value } = {}) {
  const root = path.resolve(requireText(repoRoot, 'repoRoot'));
  const relative = requireText(outputPath, 'outputPath').replaceAll('\\', '/');
  if (path.isAbsolute(relative) || relative.includes('/../') || relative.startsWith('../')) {
    throw new Error('missing-row insert output path must be repository-relative');
  }
  const absolute = path.resolve(root, relative);
  if (fs.existsSync(absolute)) throw new Error('missing-row insert output already exists');
  fs.mkdirSync(path.dirname(absolute), { recursive: true, mode: 0o700 });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  return absolute;
}

function buildProjectionRow(item, image) {
  const raw = parseObject(item.rawJson);
  return Object.freeze({
    id: requirePositiveInteger(item.id, 'relation item id'),
    relationRecordKey: requireText(item.recordKey, 'relation item recordKey'),
    name: item.englishName ?? item.internalName,
    nameZh: item.nameZh ?? null,
    internalName: item.internalName,
    slug: toSlug(item.internalName),
    image: image.cachedUrl,
    categoryId: null,
    description: null,
    descriptionZh: null,
    damage: nullableNumber(item.combatValue ?? raw.damage),
    defense: nullableNumber(item.defenseValue ?? raw.defense),
    knockback: nullableNumber(raw.knockBack),
    useTime: nullableNumber(item.useTime ?? raw.useTime),
    width: nullableNumber(item.width),
    height: nullableNumber(item.height),
    buy: nullableNumber(item.majorValue ?? raw.value),
    sell: nullableNumber(item.sellRaw),
    tooltip: null,
    tooltipZh: null,
    sourceProvider: item.sourceProvider ?? null,
    sourcePage: item.sourcePage ?? null,
    sourceRevisionTimestamp: item.sourceRevisionTimestamp ?? null,
    lastSyncedAt: null,
    rarityId: nullableNumber(item.rareRaw ?? raw.rare),
    gamePeriodId: null,
    gameModelId: null,
    isStackable: Number(item.stackSize) > 1 ? 1 : 0,
    stackSize: nullableNumber(item.stackSize),
    sourceNpcsJson: '[]',
    status: 1,
    deleted: 0,
    createdAt: null,
    updatedAt: null,
  });
}

function assertExactKeys(keys) {
  if (!Array.isArray(keys)
      || keys.length !== ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS.length
      || keys.some((key, index) => key !== ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS[index])) {
    throw new Error('missing-row insert requires the exact five-key allowlist');
  }
}

function assertTarget(target) {
  if (target?.ownedDatabase !== 'terria_v1_relation'
      || target?.ownedTable !== 'projection_items'
      || target?.databases?.relation !== 'terria_v1_relation') {
    throw new Error('missing-row insert target must be terria_v1_relation.projection_items');
  }
}

function assertNoExistingProjectionRows(rows) {
  if (!Array.isArray(rows)) throw new Error('existing projection rows are required');
  for (const row of rows) {
    if (ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS.includes(row?.internalName)) {
      throw new Error(`projection row already exists for ${row.internalName}`);
    }
  }
}

function assertActiveItem(item, key) {
  if (!item || Number(item.status) !== 1 || Number(item.deleted) !== 0) {
    throw new Error(`active relation item is required for ${key}`);
  }
}

function assertActivePrimaryManagedImage(image, key) {
  if (!image || Number(image.status) !== 1 || Number(image.deleted) !== 0
      || image.role !== 'icon' || Number(image.isPrimary) !== 1) {
    throw new Error(`active primary relation image is required for ${key}`);
  }
  if (!String(image.cachedUrl ?? '').startsWith(ITEM_IMAGE_PREFIX)) {
    throw new Error(`managed item image is required for ${key}`);
  }
}

function indexRows(rows, field, label) {
  if (!Array.isArray(rows)) throw new Error(`${label} are required`);
  const index = new Map();
  for (const row of rows) {
    const key = requireText(row?.[field], `${label} key`);
    if (index.has(key)) throw new Error(`duplicate ${label} key ${key}`);
    index.set(key, row);
  }
  return index;
}

function parseObject(value) {
  if (value == null || value === '') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new Error('relation item rawJson must be an object');
  }
}

function nullableNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toSlug(value) {
  return requireText(value, 'internalName')
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replaceAll(/[^A-Za-z0-9]+/g, '-')
    .toLowerCase();
}

function requirePositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${label} must be a non-negative integer`);
  return number;
}

function requireTimestamp(value, label) {
  const text = requireText(value, label);
  if (Number.isNaN(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return text;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is required`);
  return value;
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function canonicalHash(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(sortValue(value)), 'utf8').digest('hex')}`;
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
