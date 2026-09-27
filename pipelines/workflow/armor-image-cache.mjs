import { createHash } from 'node:crypto';
import { isManagedImagePath, normalizeManagedImageUrlPrefixes } from '../relation/managed-image-url-policy.mjs';

export const ARMOR_IMAGE_CACHE_OPERATION_ID = 'canonical-armor-image-cache';
const ROLES = ['male', 'female', 'demo', 'part', 'other'];
const INFO_FIELDS = ['fileTitle', 'url', 'revisionTimestamp', 'mime', 'width', 'height', 'size'];
const MAX_BYTES = 10 * 1024 * 1024;
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const hash = value => digest(JSON.stringify(stable(value)));
const title = value => String(value ?? '').replace(/^File:/, '').replaceAll('_', ' ');
function text(value, label) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw new Error(`Armor ${label} is required`);
  return value;
}
function time(value, label) {
  text(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
      || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) {
    throw new Error(`Armor ${label} timestamp is invalid`);
  }
  return Date.parse(value);
}
function sourceUrl(value) {
  const url = new URL(text(value, 'source URL'));
  if (url.origin !== 'https://terraria.wiki.gg' || !url.pathname.startsWith('/images/') || url.username || url.password || url.hash) {
    throw new Error('Armor source URL is outside Wiki image scope');
  }
  return url.href;
}
function info(value) {
  if (!value || typeof value !== 'object') throw new Error('Armor image source info is missing');
  const result = Object.fromEntries(INFO_FIELDS.map(key => [key, value[key]]));
  text(result.fileTitle, 'source file title'); sourceUrl(result.url); time(result.revisionTimestamp, 'source revision');
  if (!['image/png', 'image/gif', 'image/jpeg', 'image/webp'].includes(result.mime)
      || ['width', 'height', 'size'].some(key => !Number.isSafeInteger(result[key]) || result[key] <= 0)
      || result.size > MAX_BYTES) throw new Error('Armor image source size/type is invalid');
  return result;
}
function imageBytes(encoded, metadata, transfer) {
  if (typeof encoded !== 'string' || !encoded || encoded.length > Math.ceil(MAX_BYTES / 3) * 4) throw new Error('Armor image bytes are missing or oversized');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) throw new Error('Armor image base64 is not canonical');
  if (transfer && (transfer.contentType !== metadata.mime || transfer.contentLength !== bytes.length)) throw new Error('Armor image transfer MIME/size drift');
  if (bytes.length !== metadata.size) {
    const original = /(?:^|,\s*)orig_size=(\d+)(?:,|$)/.exec(transfer?.cfPolished ?? '');
    if (!transfer || !/^ok(?:,|$)/.test(transfer.cfPolished ?? '') || !original || Number(original[1]) !== metadata.size) {
      throw new Error('Armor image bytes size differs from source without explicit CDN transfer evidence');
    }
  }
  const valid = metadata.mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    : metadata.mime === 'image/gif' ? /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString())
      : metadata.mime === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (!valid) throw new Error('Armor image bytes signature differs from source MIME');
  if (metadata.mime === 'image/png' && (bytes.length < 24 || bytes.subarray(12, 16).toString() !== 'IHDR'
      || bytes.readUInt32BE(16) !== metadata.width || bytes.readUInt32BE(20) !== metadata.height)) throw new Error('Armor PNG dimensions differ from source');
  if (metadata.mime === 'image/gif' && (bytes.length < 10 || bytes.readUInt16LE(6) !== metadata.width
      || bytes.readUInt16LE(8) !== metadata.height)) throw new Error('Armor GIF dimensions differ from source');
  return bytes;
}

export function buildArmorImageCacheProposal({ sourcePayload, downloads, managedImageUrlPrefixes, generatedAt } = {}) {
  const generated = time(generatedAt, 'generation');
  const source = structuredClone(sourcePayload);
  if (source?.source !== 'terraria.wiki.gg:armor-set-pages:imageinfo' || source.sourcePageTitle !== 'Armor set pages'
      || source.sourceApi !== 'https://terraria.wiki.gg/api.php') throw new Error('Armor source identity is invalid');
  if (source.sourceRevisionTimestamp !== null) throw new Error('Armor image collection aggregate revision must remain null');
  if (!Array.isArray(source.warnings) || source.warnings.length) throw new Error('Armor source warnings indicate incomplete input');
  if (!Array.isArray(source.armorSetImages) || !source.armorSetImages.length || source.armorSetImages.length > 2000
      || source.totalArmorSetImages !== source.armorSetImages.length) throw new Error('Armor source image count is invalid');
  if (time(source.fetchedAt, 'source fetch') > generated) throw new Error('Armor source fetch is newer than generation');
  const prefixes = normalizeManagedImageUrlPrefixes(managedImageUrlPrefixes);
  if (!prefixes.length) throw new Error('Armor managed prefixes are required');
  const logical = new Set(); const files = new Map();
  for (const row of source.armorSetImages) {
    text(row.textKey, 'text identity'); text(row.pageTitle, 'page title'); text(row.sourceFileTitle, 'source file');
    if (!ROLES.includes(row.imageRole) || typeof row.isPrimary !== 'boolean') throw new Error('Armor source image role is invalid');
    const key = JSON.stringify([row.textKey, row.imageRole, row.sourceFileTitle]);
    if (logical.has(key)) throw new Error('Armor duplicate logical image identity');
    logical.add(key);
    const metadata = info(row.raw?.imageInfo);
    if (title(metadata.fileTitle) !== title(row.sourceFileTitle) || row.originalUrl !== metadata.url
        || row.sourceRevisionTimestamp !== metadata.revisionTimestamp || row.contentType !== metadata.mime
        || row.width !== metadata.width || row.height !== metadata.height
        || time(row.sourceRevisionTimestamp, 'source revision') > time(source.fetchedAt, 'source fetch')) {
      throw new Error('Armor source image metadata/revision binding drift');
    }
    const fileKey = title(row.sourceFileTitle);
    if (files.has(fileKey) && hash(files.get(fileKey).metadata) !== hash(metadata)) throw new Error('Armor shared source file metadata conflict');
    files.set(fileKey, { sourceFileTitle: row.sourceFileTitle, metadata });
  }
  if (!Array.isArray(downloads) || downloads.length !== files.size) throw new Error('Armor downloads must cover exact source files');
  const seen = new Set(); let totalBytes = 0;
  const assets = downloads.map(download => {
    const key = title(download.sourceFileTitle); const sourceFile = files.get(key);
    if (!sourceFile || seen.has(key)) throw new Error('Armor unbound or duplicate source download');
    seen.add(key);
    const before = info(download.before); const after = info(download.after);
    if (hash(before) !== hash(sourceFile.metadata) || hash(before) !== hash(after)) throw new Error('Armor source revision drift during download');
    const bytes = imageBytes(download.bytesBase64, before, download.transfer); totalBytes += bytes.length;
    return { sourceFileTitle: sourceFile.sourceFileTitle, before, after, bytesBase64: download.bytesBase64, ...(download.transfer ? { transfer: structuredClone(download.transfer) } : {}), sha256: digest(bytes) };
  }).sort((a, b) => a.sourceFileTitle.localeCompare(b.sourceFileTitle));
  if (totalBytes > 64 * 1024 * 1024) throw new Error('Armor image bytes exceed bounded batch');
  const proposal = { schemaVersion: 'armor-image-cache-proposal/v1', operationId: ARMOR_IMAGE_CACHE_OPERATION_ID,
    generatedAt, databaseWrites: false, sourcePayload: source, sourceSha256: hash(source),
    managedImageUrlPrefixes: prefixes, assets, totalBytes };
  return { ...proposal, proposalSha256: hash(proposal) };
}

export function validateArmorImageCacheProposal(proposal) {
  const { proposalSha256, ...body } = proposal ?? {};
  if (hash(body) !== proposalSha256) throw new Error('Armor cache proposal hash drift');
  const rebuilt = buildArmorImageCacheProposal({ ...proposal, downloads: proposal.assets });
  if (hash(rebuilt) !== hash(proposal)) throw new Error('Armor cache proposal derivation drift');
  return true;
}

function safeManaged(value, prefixes) {
  if (typeof value !== 'string' || /[?#\\\s\u0000-\u001f\u007f]/.test(value) || /%(?:25|2f|5c)/i.test(value)) return false;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.split('/').some(part => part === '.' || part === '..')) return false;
    return isManagedImagePath(value, prefixes);
  } catch { return false; }
}

// No default network/authority callbacks: only the registered runner supplies them.
export async function executeArmorImageCache({ proposal, persistPrepared, consumePermit, upload, readManaged, persistResult,
  persistUploadEvent = async () => {}, resumeVerified = [] } = {}) {
  validateArmorImageCacheProposal(proposal);
  const frozen = structuredClone(proposal);
  for (const fn of [persistPrepared, consumePermit, upload, readManaged, persistResult, persistUploadEvent]) {
    if (typeof fn !== 'function') throw new Error('Armor cache execution capability is missing');
  }
  const uploaded = []; const attemptedFiles = [];
  const resumed = new Map();
  for (const receipt of resumeVerified) {
    if (!receipt || typeof receipt.sourceFileTitle !== 'string' || resumed.has(title(receipt.sourceFileTitle))
        || !safeManaged(receipt.cachedUrl, frozen.managedImageUrlPrefixes)
        || typeof receipt.sha256 !== 'string' || receipt.verified !== true) throw new Error('Armor resume receipt is invalid');
    resumed.set(title(receipt.sourceFileTitle), structuredClone(receipt));
  }
  const base = { operationId: ARMOR_IMAGE_CACHE_OPERATION_ID, proposalSha256: frozen.proposalSha256, databaseWrites: false };
  await persistPrepared({ ...base, status: 'PREPARED' });
  let resultPublished = false;
  try {
    await consumePermit();
    for (const asset of frozen.assets) {
      const prior = resumed.get(title(asset.sourceFileTitle));
      if (prior) {
        if (prior.sha256 !== asset.sha256) throw new Error('Armor resume receipt hash does not match proposal');
        attemptedFiles.push(asset.sourceFileTitle);
        await persistUploadEvent({ phase: 'RESUME_INTENT', ...prior });
        const bytes = await readManaged(prior.cachedUrl);
        if (!Buffer.isBuffer(bytes) || digest(bytes) !== asset.sha256) throw new Error('Armor resumed cache readback bytes mismatch');
        uploaded.push({ ...prior, verified: true });
        await persistUploadEvent({ phase: 'RESUME_VERIFIED', ...prior, verified: true });
        continue;
      }
      await persistUploadEvent({ phase: 'UPLOAD_INTENT', sourceFileTitle: asset.sourceFileTitle, sha256: asset.sha256 });
      attemptedFiles.push(asset.sourceFileTitle);
      const cachedUrl = await upload(structuredClone(asset));
      const receipt = { sourceFileTitle: asset.sourceFileTitle, cachedUrl, sha256: asset.sha256, verified: false };
      uploaded.push(receipt);
      await persistUploadEvent({ phase: 'UPLOAD_RECEIVED', ...receipt });
      if (!safeManaged(cachedUrl, frozen.managedImageUrlPrefixes)) throw new Error('Armor returned cache URL is outside safe managed path/origin');
      const bytes = await readManaged(cachedUrl);
      if (!Buffer.isBuffer(bytes) || digest(bytes) !== asset.sha256) throw new Error('Armor cache readback bytes mismatch');
      receipt.verified = true;
      await persistUploadEvent({ phase: 'CACHE_VERIFIED', ...receipt });
    }
    if (uploaded.length !== frozen.assets.length) throw new Error('Armor cache resume coverage is incomplete');
    const byFile = new Map(uploaded.map(row => [title(row.sourceFileTitle), row.cachedUrl]));
    const payload = structuredClone(frozen.sourcePayload);
    for (const row of payload.armorSetImages) row.cachedUrl = byFile.get(title(row.sourceFileTitle));
    const result = { ...base, status: 'COMPLETED', attemptedFiles, uploaded, payload, payloadSha256: hash(payload) };
    // A publication failure must never overwrite a successfully created result.
    resultPublished = true;
    await persistResult(result);
    return result;
  } catch (error) {
    if (!resultPublished) {
      try { await persistResult({ ...base, status: 'FAILED', attemptedFiles, requiresObjectReconciliation: attemptedFiles.length > 0, uploaded, reason: error.message }); }
      catch (cause) { (error.suppressedErrors ??= []).push(cause); }
    }
    throw error;
  }
}

export async function collectArmorImageCacheProposal({ sourcePayload, managedImageUrlPrefixes, readInfo, readBytes, progress,
  resumeDownloads = [], persistDownload = async () => {}, now = () => new Date().toISOString() } = {}) {
  const source = structuredClone(sourcePayload);
  const downloads = []; const startedAt = now();
  const files = new Map();
  let sourceFileTitle;
  const publish = status => progress({ actionId: 'armor-set-images', status, phase: 'verify-image-bytes',
    startedAt, generatedAt: now(), lastHeartbeatAt: now(), current: downloads.length, total: files.size,
    sourceFileTitle, message: `Armor frozen image bytes ${downloads.length}/${files.size}` });
  await publish('running');
  try {
    if (!Array.isArray(source?.armorSetImages) || !source.armorSetImages.length || source.armorSetImages.length > 2000) throw new Error('Armor source image count is invalid');
    for (const row of source.armorSetImages) {
      sourceUrl(row.originalUrl); text(row.sourceFileTitle, 'source file');
      files.set(title(row.sourceFileTitle), row);
    }
    await publish('running');
    const retained = new Map();
    if (!Array.isArray(resumeDownloads)) throw new Error('Armor resume downloads must be an array');
    for (const download of resumeDownloads) {
      const key = title(download.sourceFileTitle);
      if (!files.has(key) || retained.has(key)) throw new Error('Armor unbound or duplicate resume download');
      const rows = source.armorSetImages.filter(row => title(row.sourceFileTitle) === key);
      buildArmorImageCacheProposal({ sourcePayload: { ...source, armorSetImages: rows, totalArmorSetImages: rows.length },
        downloads: [download], managedImageUrlPrefixes, generatedAt: now() });
      retained.set(key, structuredClone(download));
    }
    for (const row of files.values()) {
      sourceFileTitle = row.sourceFileTitle;
      await publish('running');
      const before = await readInfo(row.sourceFileTitle);
      if (hash(info(before)) !== hash(info(row.raw?.imageInfo))) throw new Error('Armor source revision drift before download');
      if (retained.has(title(row.sourceFileTitle))) {
        downloads.push(retained.get(title(row.sourceFileTitle)));
        await publish('running');
        continue;
      }
      const response = await readBytes(sourceUrl(row.originalUrl));
      const bytes = Buffer.isBuffer(response) ? response : response?.bytes;
      const transfer = Buffer.isBuffer(response) ? undefined : response?.transfer;
      if (!Buffer.isBuffer(bytes)) throw new Error('Armor source download must return bytes');
      imageBytes(bytes.toString('base64'), before, transfer);
      const after = await readInfo(row.sourceFileTitle);
      if (hash(info(before)) !== hash(info(after))) throw new Error('Armor source revision drift after download');
      const download = { sourceFileTitle: row.sourceFileTitle, before, after, bytesBase64: bytes.toString('base64'), ...(transfer ? { transfer } : {}) };
      await persistDownload(structuredClone(download));
      downloads.push(download);
      await publish('running');
    }
    const result = buildArmorImageCacheProposal({ sourcePayload: source, downloads, managedImageUrlPrefixes, generatedAt: now() });
    await publish('completed');
    return result;
  } catch (error) {
    try { await publish('failed'); } catch (cause) { (error.suppressedErrors ??= []).push(cause); }
    throw error;
  }
}

export function assertArmorImageCacheResult({ proposal, result } = {}) {
  validateArmorImageCacheProposal(proposal);
  if (result?.operationId !== ARMOR_IMAGE_CACHE_OPERATION_ID || result.status !== 'COMPLETED' || result.databaseWrites !== false
      || result.proposalSha256 !== proposal.proposalSha256) throw new Error('Armor cache terminal result must be bound and COMPLETED');
  if (!Array.isArray(result.uploaded) || result.uploaded.length !== proposal.assets.length
      || hash(result.attemptedFiles) !== hash(proposal.assets.map(asset => asset.sourceFileTitle))) throw new Error('Armor cache receipt coverage is incomplete');
  const byFile = new Map();
  for (const [index, receipt] of result.uploaded.entries()) {
    const asset = proposal.assets[index];
    if (receipt.sourceFileTitle !== asset.sourceFileTitle || receipt.sha256 !== asset.sha256 || receipt.verified !== true
        || !safeManaged(receipt.cachedUrl, proposal.managedImageUrlPrefixes)) throw new Error('Armor cache verified receipt drift');
    byFile.set(title(asset.sourceFileTitle), receipt.cachedUrl);
  }
  const payload = structuredClone(proposal.sourcePayload);
  for (const row of payload.armorSetImages) row.cachedUrl = byFile.get(title(row.sourceFileTitle));
  if (hash(payload) !== result.payloadSha256 || hash(result.payload) !== result.payloadSha256) throw new Error('Armor cache derived payload drift');
  return true;
}
