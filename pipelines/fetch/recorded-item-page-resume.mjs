import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { writeJsonFile } from '../workflow/backend-refresh-runtime-state.mjs';

const ACTION_ID = 'fetch-item-pages-recorded-resume-test';
const RESUME_MODE = 'recorded_item_pages';

function requireRecords(records) {
  if (!Array.isArray(records) || records.length !== 100) throw new Error('recorded Item page resume requires exactly one hundred source records');
  const seenIds = new Set();
  const seenNames = new Set();
  for (const [index, record] of records.entries()) {
    const id = Number(record?.id);
    const internalName = String(record?.internalName ?? '').trim();
    const pageTitle = String(record?.name ?? '').trim();
    if (!Number.isSafeInteger(id) || id <= 0 || !internalName || !pageTitle) throw new Error(`recorded Item source record ${index + 1} is invalid`);
    if (seenIds.has(id) || seenNames.has(internalName.toLowerCase())) throw new Error(`recorded Item source contains duplicate identity at record ${index + 1}`);
    seenIds.add(id);
    seenNames.add(internalName.toLowerCase());
  }
  return records;
}

function fingerprintRecords(records, sourceFingerprint) {
  const declared = String(sourceFingerprint ?? '').trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(declared)) throw new Error('recorded Item source fingerprint must be sha256');
  const sourceIdentity = records.map(({ id, internalName, name }) => ({ id: Number(id), internalName: String(internalName), pageTitle: String(name) }));
  const identityHash = createHash('sha256').update(JSON.stringify(sourceIdentity)).digest('hex');
  return { inputFingerprint: declared, identityHash };
}

function atomicWrite(filePath, payload) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true, mode: 0o700 });
  writeJsonFile(filePath, payload);
  fs.chmodSync(filePath, 0o600);
}

function readState(statePath, outputPath, { resume, actionId, inputFingerprint, identityHash, identities }) {
  if (!resume) return { completed: new Map(), state: null };
  if (!fs.existsSync(statePath) || !fs.existsSync(outputPath)) throw new Error('recorded Item resume state or output is missing');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  if (state.actionId !== actionId || state.resumeMode !== RESUME_MODE) throw new Error('recorded Item resume identity mismatch');
  if (state.inputFingerprint !== inputFingerprint) throw new Error('recorded Item resume rejected: fingerprint-mismatch');
  if (state.identityHash !== identityHash) throw new Error('recorded Item resume rejected: source-identity-mismatch');
  if (!Array.isArray(state.completedKeys)) throw new Error('recorded Item resume state has invalid completed keys');
  const pages = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  if (!Array.isArray(pages)) throw new Error('recorded Item partial output must be an array');
  const validKeys = new Set(identities.keys());
  const completedKeys = new Set(state.completedKeys.map(String));
  if (completedKeys.size !== state.completedKeys.length || [...completedKeys].some((key) => !validKeys.has(key))) {
    throw new Error('recorded Item resume has duplicate or out-of-scope completed keys');
  }
  if (pages.length !== completedKeys.size) throw new Error('recorded Item partial output count differs from completed keys');
  const pageIds = new Set();
  const pageNames = new Set();
  const completed = new Map();
  for (const page of pages) {
    const id = Number(page?.id);
    const internalName = String(page?.internalName ?? '');
    const key = String(id);
    if (!completedKeys.has(key) || identities.get(key) !== internalName) throw new Error('recorded Item partial output identity does not match completed source key');
    if (!Number.isSafeInteger(Number(page.pageId)) || Number(page.pageId) <= 0 || !String(page.revision ?? '').trim()) throw new Error('recorded Item partial page is invalid');
    if (pageIds.has(Number(page.pageId)) || pageNames.has(internalName.toLowerCase())) throw new Error('recorded Item partial output contains duplicate page identity');
    pageIds.add(Number(page.pageId));
    pageNames.add(internalName.toLowerCase());
    completed.set(key, page);
  }
  return { completed, state };
}

export async function runRecordedItemPageResume({
  records: rawRecords,
  sourceFingerprint,
  statePath,
  outputPath,
  resume = false,
  failAfter = null,
  fetchPage,
  actionId = ACTION_ID,
  now = () => new Date().toISOString(),
} = {}) {
  const records = requireRecords(rawRecords);
  if (!statePath || !outputPath || path.resolve(statePath) === path.resolve(outputPath)) throw new Error('recorded Item resume requires distinct state and output paths');
  if (typeof fetchPage !== 'function') throw new Error('recorded Item resume requires a page fetch function');
  const { inputFingerprint: fingerprint, identityHash } = fingerprintRecords(records, sourceFingerprint);
  const identities = new Map(records.map((record) => [String(Number(record.id)), String(record.internalName)]));
  const { completed, state: priorState } = readState(statePath, outputPath, { resume: Boolean(resume), actionId, inputFingerprint: fingerprint, identityHash, identities });
  const pages = [...completed.values()];
  const state = priorState ?? {
    actionId,
    resumeMode: RESUME_MODE,
    inputFingerprint: fingerprint,
    identityHash,
    completedKeys: [],
    startedAt: now(),
  };
  const progress = (status, phase, message) => {
    const generatedAt = now();
    state.status = status;
    state.phase = phase;
    state.message = message;
    state.current = pages.length;
    state.total = records.length;
    state.generatedAt = generatedAt;
    state.lastHeartbeatAt = generatedAt;
    state.actionId = actionId;
    state.childStatusPath = path.resolve(statePath);
    state.inputFingerprint = fingerprint;
    state.identityHash = identityHash;
    state.completedKeys = [...new Set(state.completedKeys.map(String))].map(Number);
    atomicWrite(outputPath, pages);
    atomicWrite(statePath, state);
  };

  progress('running', resume ? 'resume' : 'fetch', resume ? 'resuming recorded Item pages' : 'fetching recorded Item pages');
  let fetchedThisRun = 0;
  for (const record of records) {
    const id = Number(record.id);
    if (completed.has(String(id))) continue;
    try {
      const page = await fetchPage(record);
      const normalized = {
        id,
        internalName: String(record.internalName),
        pageTitle: String(record.name),
        pageId: Number(page?.pageId),
        revision: String(page?.revision ?? ''),
      };
      if (!Number.isSafeInteger(normalized.pageId) || normalized.pageId <= 0 || !normalized.revision) throw new Error(`recorded Item page result is invalid for ${record.internalName}`);
      if (pages.some((entry) => Number(entry.pageId) === normalized.pageId || String(entry.internalName).toLowerCase() === normalized.internalName.toLowerCase())) {
        throw new Error(`recorded Item page result contains duplicate page identity for ${record.internalName}`);
      }
      pages.push(normalized);
      completed.set(String(id), normalized);
      state.completedKeys = [...completed.keys()].map(Number);
      fetchedThisRun += 1;
      progress('running', 'fetch', `fetched ${pages.length}/${records.length} Item pages`);
      if (failAfter != null && fetchedThisRun === Number(failAfter)) {
        throw new Error(`simulated source connection interrupted after record ${failAfter}`);
      }
    } catch (error) {
      progress('failed', 'interrupted', error.message);
      throw error;
    }
  }
  progress('completed', 'completed', `completed ${pages.length}/${records.length} recorded Item pages`);
  return Object.freeze({ status: 'completed', actionId, inputFingerprint: fingerprint, current: pages.length, total: records.length, completedKeys: [...completed.keys()].map(Number), pages });
}
