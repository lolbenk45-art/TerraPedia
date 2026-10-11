import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as cache from './armor-image-cache.mjs';

const at = '2026-09-27T04:00:00.000Z';
const prefix = 'http://127.0.0.1:19000/terrapedia-images/items/';
const bytes = Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001', 'hex');
function fixture() {
  const info = { fileTitle: 'File:Wood Helmet.png', url: 'https://terraria.wiki.gg/images/Wood_Helmet.png?v1',
    revisionTimestamp: '2022-01-02T11:49:07Z', mime: 'image/png', width: 1, height: 1, size: bytes.length };
  const row = { textKey: 'ArmorSetBonus.Wood', pageTitle: 'Wood armor', imageRole: 'part',
    sourceFileTitle: 'Wood_Helmet.png', originalUrl: info.url, cachedUrl: null,
    sourceRevisionTimestamp: info.revisionTimestamp, contentType: info.mime, width: 1, height: 1,
    isPrimary: false, sortOrder: 0, raw: { imageInfo: info } };
  return { sourcePayload: { source: 'terraria.wiki.gg:armor-set-pages:imageinfo', sourceApi: 'https://terraria.wiki.gg/api.php',
    sourcePageTitle: 'Armor set pages', sourceRevisionTimestamp: null, fetchedAt: at,
    totalArmorSets: 2, totalArmorSetImages: 2, warnings: [], armorSetImages: [row, { ...row, textKey: 'ArmorSetBonus.Other' }] },
  downloads: [{ sourceFileTitle: row.sourceFileTitle, before: info, after: structuredClone(info), bytesBase64: bytes.toString('base64') }],
  managedImageUrlPrefixes: [prefix], generatedAt: at };
}

test('freezes exact source bytes and deduplicates shared files without changing image roles', () => {
  assert.equal(typeof cache.buildArmorImageCacheProposal, 'function');
  const input = fixture(); const original = structuredClone(input);
  const plan = cache.buildArmorImageCacheProposal(input);
  assert.equal(plan.assets.length, 1);
  assert.equal(plan.sourcePayload.armorSetImages.length, 2);
  assert.equal(plan.assets[0].sha256, `sha256:${createHash('sha256').update(bytes).digest('hex')}`);
  assert.deepEqual(input, original);
  assert.equal(cache.validateArmorImageCacheProposal(plan), true);
});

for (const [name, mutate, pattern] of [
  ['unbound download', x => { x.downloads[0].sourceFileTitle = 'Other.png'; }, /source|download|missing/i],
  ['source revision drift', x => { x.downloads[0].after.revisionTimestamp = '2023-01-01T00:00:00Z'; }, /revision|drift/i],
  ['foreign URL', x => { x.sourcePayload.armorSetImages[0].originalUrl = 'http://127.0.0.1/secret'; }, /source|url/i],
  ['duplicate logical image', x => { x.sourcePayload.armorSetImages[1].textKey = x.sourcePayload.armorSetImages[0].textKey; }, /duplicate/i],
  ['conflicting shared file', x => { x.sourcePayload.armorSetImages[1].sourceRevisionTimestamp = '2023-01-01T00:00:00Z'; }, /source|revision|conflict/i],
  ['fake aggregate revision', x => { x.sourcePayload.sourceRevisionTimestamp = at; }, /aggregate|collection/i],
  ['truncated bytes', x => { x.downloads[0].bytesBase64 = Buffer.from('no image').toString('base64'); }, /bytes|size|image/i],
  ['missing files', x => { x.downloads = []; }, /download|missing/i],
  ['warning', x => { x.sourcePayload.warnings.push('partial'); }, /warning|incomplete/i],
  ['noncanonical base64', x => { x.downloads[0].bytesBase64 += '\n'; }, /base64/i],
]) test(`refuses ${name} before upload`, () => {
  const input = fixture(); mutate(input);
  assert.throws(() => cache.buildArmorImageCacheProposal(input), pattern);
});

test('detects proposal drift before permit consumption', async () => {
  const plan = cache.buildArmorImageCacheProposal(fixture());
  plan.assets[0].sha256 = `sha256:${'a'.repeat(64)}`;
  let consumed = false;
  await assert.rejects(cache.executeArmorImageCache({ proposal: plan, consumePermit: async () => { consumed = true; } }), /hash|drift/i);
  assert.equal(consumed, false);
});

test('consumes once before upload and reads exact bytes back before deriving a new payload', async () => {
  const plan = cache.buildArmorImageCacheProposal(fixture()); const before = structuredClone(plan);
  const calls = [];
  const result = await cache.executeArmorImageCache({ proposal: plan,
    persistPrepared: async () => calls.push('prepared'), consumePermit: async () => calls.push('permit'),
    upload: async asset => { calls.push('upload'); assert.deepEqual(Buffer.from(asset.bytesBase64, 'base64'), bytes); return `${prefix}object.png`; },
    readManaged: async () => { calls.push('readback'); return bytes; },
    persistResult: async () => calls.push('result'),
  });
  assert.deepEqual(calls, ['prepared', 'permit', 'upload', 'readback', 'result']);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.databaseWrites, false);
  assert.equal(result.payload.armorSetImages.length, 2);
  for (const row of result.payload.armorSetImages) { assert.equal(row.cachedUrl, `${prefix}object.png`); assert.equal(row.imageRole, 'part'); }
  assert.deepEqual(plan, before);
});

for (const [name, uploadUrl, returnedBytes, pattern] of [
  ['different cache bytes', `${prefix}object.png`, Buffer.from('wrong'), /readback|bytes/i],
  ['foreign cache origin', 'https://evil.test/terrapedia-images/items/1.png', bytes, /managed|origin/i],
  ['encoded traversal', `${prefix}%2e%2e/x.png`, bytes, /managed|path/i],
  ['cache URL query', `${prefix}x.png?forged=1`, bytes, /managed|path/i],
]) test(`persists failed partial evidence for ${name}`, async () => {
  let evidence; let reads = 0;
  await assert.rejects(cache.executeArmorImageCache({ proposal: cache.buildArmorImageCacheProposal(fixture()),
    persistPrepared: async () => {}, consumePermit: async () => {}, upload: async () => uploadUrl,
    readManaged: async () => { reads++; return returnedBytes; }, persistResult: async x => { evidence = x; },
  }), pattern);
  assert.equal(evidence.status, 'FAILED');
  assert.equal(evidence.payload, undefined);
  assert.equal(evidence.uploaded.length, 1);
  if (name !== 'different cache bytes') assert.equal(reads, 0);
});

test('a failed permit never calls upload or emits completion', async () => {
  let calls = 0; let evidence;
  await assert.rejects(cache.executeArmorImageCache({ proposal: cache.buildArmorImageCacheProposal(fixture()),
    persistPrepared: async () => {}, consumePermit: async () => { throw new Error('permit expired'); },
    upload: async () => { calls++; }, readManaged: async () => bytes, persistResult: async x => { evidence = x; },
  }), /permit expired/);
  assert.equal(calls, 0); assert.equal(evidence.status, 'FAILED');
});

test('collects source bytes serially with progress before network and fresh revision readback', async () => {
  const input = fixture(); const calls = [];
  const result = await cache.collectArmorImageCacheProposal({ sourcePayload: input.sourcePayload,
    managedImageUrlPrefixes: [prefix], now: () => at,
    progress: async p => { calls.push(p.status); assert.ok(p.lastHeartbeatAt); },
    readInfo: async () => { calls.push('info'); return input.downloads[0].before; },
    readBytes: async () => { calls.push('bytes'); return bytes; },
  });
  assert.equal(calls[0], 'running');
  assert.deepEqual(calls.filter(x => ['info', 'bytes'].includes(x)), ['info', 'bytes', 'info']);
  assert.equal(calls.at(-1), 'completed');
  assert.equal(result.assets.length, 1);
});

test('source collection fails visibly on download failure and returns no proposal', async () => {
  const input = fixture(); const progress = [];
  await assert.rejects(cache.collectArmorImageCacheProposal({ sourcePayload: input.sourcePayload,
    managedImageUrlPrefixes: [prefix], now: () => at, progress: async p => progress.push(p),
    readInfo: async () => input.downloads[0].before, readBytes: async () => { throw new Error('download failed'); },
  }), /download failed/);
  assert.equal(progress[0].status, 'running');
  assert.equal(progress.at(-1).status, 'failed');
});

test('records explicit CDN optimization without rewriting original image size or revision', () => {
  const input = fixture();
  for (const row of input.sourcePayload.armorSetImages) row.raw.imageInfo.size = 310;
  input.downloads[0].before.size = 310; input.downloads[0].after.size = 310;
  input.downloads[0].transfer = { contentType: 'image/png', contentLength: bytes.length, cfPolished: 'ok, orig_size=310' };
  const plan = cache.buildArmorImageCacheProposal(input);
  assert.equal(plan.assets[0].before.size, 310);
  assert.equal(plan.assets[0].transfer.contentLength, bytes.length);
  assert.equal(plan.totalBytes, bytes.length);
  assert.equal(cache.validateArmorImageCacheProposal(plan), true);
});

test('rejects CDN size exception with unrelated original size or changed dimensions', () => {
  const input = fixture();
  input.downloads[0].transfer = { contentType: 'image/png', contentLength: bytes.length, cfPolished: 'ok, orig_size=999' };
  input.downloads[0].bytesBase64 = Buffer.concat([bytes, Buffer.from('changed')]).toString('base64');
  assert.throws(() => cache.buildArmorImageCacheProposal(input), /size|bytes|transfer/);
  const changed = fixture();
  for (const row of changed.sourcePayload.armorSetImages) row.raw.imageInfo.size = 310;
  changed.downloads[0].before.size = 310; changed.downloads[0].after.size = 310;
  changed.downloads[0].transfer = { contentType: 'image/png', contentLength: bytes.length, cfPolished: 'ok, orig_size=310' };
  const wrongDimensions = Buffer.from(bytes); wrongDimensions.writeUInt32BE(2, 16);
  changed.downloads[0].bytesBase64 = wrongDimensions.toString('base64');
  assert.throws(() => cache.buildArmorImageCacheProposal(changed), /dimensions/);
});

test('an upload acknowledgement loss preserves the attempted file for reconciliation', async () => {
  let evidence;
  await assert.rejects(cache.executeArmorImageCache({ proposal: cache.buildArmorImageCacheProposal(fixture()),
    persistPrepared: async () => {}, consumePermit: async () => {},
    upload: async () => { throw new Error('upload acknowledgement lost'); },
    readManaged: async () => bytes, persistResult: async x => { evidence = x; },
  }), /acknowledgement lost/);
  assert.equal(evidence.status, 'FAILED');
  assert.deepEqual(evidence.attemptedFiles, ['Wood_Helmet.png']);
  assert.equal(evidence.requiresObjectReconciliation, true);
});

test('failure to publish successful readback is never followed by an overwrite attempt', async () => {
  let writes = 0;
  await assert.rejects(cache.executeArmorImageCache({ proposal: cache.buildArmorImageCacheProposal(fixture()),
    persistPrepared: async () => {}, consumePermit: async () => {}, upload: async () => `${prefix}cache.png`,
    readManaged: async () => bytes, persistResult: async () => { writes++; throw new Error('disk unavailable'); },
  }), /disk unavailable/);
  assert.equal(writes, 1);
});

test('terminal verifier rejects missing receipts and source fields changed in cached payload', async () => {
  const proposal = cache.buildArmorImageCacheProposal(fixture());
  const result = await cache.executeArmorImageCache({ proposal, persistPrepared: async () => {}, consumePermit: async () => {},
    upload: async () => `${prefix}cache.png`, readManaged: async () => bytes, persistResult: async () => {} });
  assert.equal(typeof cache.assertArmorImageCacheResult, 'function');
  assert.equal(cache.assertArmorImageCacheResult({ proposal, result }), true);
  const drifted = structuredClone(result); drifted.payload.armorSetImages[0].imageRole = 'male';
  assert.throws(() => cache.assertArmorImageCacheResult({ proposal, result: drifted }), /payload|drift/);
  assert.throws(() => cache.assertArmorImageCacheResult({ proposal, result: { ...result, uploaded: [] } }), /receipt|coverage/);
  assert.throws(() => cache.assertArmorImageCacheResult({ proposal, result: { ...result, status: 'FAILED' } }), /COMPLETED/);
});

test('retains each verified download and resumes only source-bound bytes with fresh metadata', async () => {
  const input = fixture(); const saved = []; const calls = [];
  const args = { sourcePayload: input.sourcePayload, managedImageUrlPrefixes: [prefix], now: () => at,
    progress: async () => {}, readInfo: async () => { calls.push('info'); return input.downloads[0].before; },
    readBytes: async () => { calls.push('bytes'); return bytes; }, persistDownload: async x => saved.push(structuredClone(x)) };
  await cache.collectArmorImageCacheProposal(args);
  assert.equal(saved.length, 1);
  calls.length = 0;
  const resumed = await cache.collectArmorImageCacheProposal({ ...args, resumeDownloads: saved,
    readBytes: async () => { throw new Error('verified bytes must be reused'); } });
  assert.deepEqual(calls, ['info']);
  assert.equal(resumed.assets.length, 1);
  assert.equal(saved.length, 1);
  const corrupt = structuredClone(saved); corrupt[0].bytesBase64 = Buffer.from('corrupt').toString('base64');
  await assert.rejects(cache.collectArmorImageCacheProposal({ ...args, resumeDownloads: corrupt }), /size|signature|bytes/);
  await assert.rejects(cache.collectArmorImageCacheProposal({ ...args, resumeDownloads: [saved[0], saved[0]] }), /duplicate/);
  await assert.rejects(cache.collectArmorImageCacheProposal({ ...args, resumeDownloads: saved,
    readInfo: async () => ({ ...input.downloads[0].before, size: 999 }) }), /revision drift/);
});

test('checkpoint persistence failure stops collection and identifies the affected source file', async () => {
  const input = fixture(); const statuses = [];
  await assert.rejects(cache.collectArmorImageCacheProposal({ sourcePayload: input.sourcePayload,
    managedImageUrlPrefixes: [prefix], now: () => at, progress: async p => statuses.push(p),
    readInfo: async () => input.downloads[0].before, readBytes: async () => bytes,
    persistDownload: async () => { throw new Error('checkpoint disk full'); },
  }), /checkpoint disk full/);
  assert.equal(statuses.at(-1).status, 'failed');
  assert.equal(statuses.at(-1).sourceFileTitle, 'Wood_Helmet.png');
});

test('durable upload events bracket each side effect and failed intent persistence blocks upload', async () => {
  const proposal = cache.buildArmorImageCacheProposal(fixture()); const events = []; let uploads = 0;
  const args = { proposal, persistPrepared: async () => {}, consumePermit: async () => {},
    upload: async () => { uploads++; assert.equal(events.at(-1).phase, 'UPLOAD_INTENT'); return `${prefix}cache.png`; },
    readManaged: async () => { assert.equal(events.at(-1).phase, 'UPLOAD_RECEIVED'); return bytes; },
    persistResult: async () => {}, persistUploadEvent: async event => events.push(structuredClone(event)) };
  await cache.executeArmorImageCache(args);
  assert.deepEqual(events.map(event => event.phase), ['UPLOAD_INTENT', 'UPLOAD_RECEIVED', 'CACHE_VERIFIED']);
  assert.equal(events[0].sourceFileTitle, proposal.assets[0].sourceFileTitle);
  assert.equal(events[2].sha256, proposal.assets[0].sha256);
  assert.equal(events[2].cachedUrl, `${prefix}cache.png`);
  await assert.rejects(cache.executeArmorImageCache({ ...args,
    persistUploadEvent: async () => { throw new Error('journal unavailable'); } }), /journal unavailable/);
  assert.equal(uploads, 1);
});

test('resume verifies retained cache objects and uploads only uncovered assets', async () => {
  const input = fixture();
  const proposal = cache.buildArmorImageCacheProposal(input);
  const retained = { sourceFileTitle: proposal.assets[0].sourceFileTitle, cachedUrl: `${prefix}retained.png`, sha256: proposal.assets[0].sha256, verified: true };
  let uploads = 0; const events = [];
  const result = await cache.executeArmorImageCache({ proposal, resumeVerified: [retained], persistPrepared: async () => {}, consumePermit: async () => {},
    upload: async () => { uploads++; return `${prefix}new.png`; }, readManaged: async url => { assert.ok(url.endsWith('retained.png') || url.endsWith('new.png')); return bytes; },
    persistUploadEvent: async event => events.push(event), persistResult: async () => {} });
  assert.equal(uploads, 0);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(events.filter(event => event.phase === 'RESUME_VERIFIED').length, 1);
  assert.equal(result.uploaded.length, proposal.assets.length);
});

test('builds a complete source proposal while reusing verified historical receipts without source bytes', async () => {
  const input = fixture();
  const one = input.sourcePayload.armorSetImages[0];
  const retainedSha = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const retained = {
    sourceFileTitle: one.sourceFileTitle,
    cachedUrl: '/terrapedia-images/items/retained.png',
    sha256: retainedSha,
    verified: true
  };
  const priorProposal = cache.buildArmorImageCacheProposal(input);
  const priorResult = await cache.executeArmorImageCache({ proposal: priorProposal,
    persistPrepared: async () => {}, consumePermit: async () => {},
    upload: async () => retained.cachedUrl, readManaged: async () => bytes, persistResult: async () => {} });
  const proposal = cache.buildArmorImageCacheProposal({
    sourcePayload: input.sourcePayload,
    downloads: [],
    retainedReceipts: [retained],
    retainedEvidence: { proposal: priorProposal, result: priorResult },
    managedImageUrlPrefixes: [prefix],
    generatedAt: at
  });
  assert.equal(proposal.schemaVersion, 'armor-image-cache-proposal/v2');
  assert.equal(proposal.sourcePayload.armorSetImages.length, 2);
  assert.equal(proposal.assets.length, 0);
  assert.deepEqual(proposal.retainedReceipts, [retained]);
  assert.equal(cache.validateArmorImageCacheProposal(proposal), true);
  let uploads = 0;
  const result = await cache.executeArmorImageCache({
    proposal,
    persistPrepared: async () => {},
    consumePermit: async () => {},
    upload: async () => { uploads += 1; },
    readManaged: async () => bytes,
    persistResult: async () => {}
  });
  assert.equal(uploads, 0);
  assert.equal(result.retained.length, 1);
  assert.equal(result.payload.armorSetImages[0].cachedUrl, retained.cachedUrl);
  assert.equal(result.payload.armorSetImages[1].cachedUrl, retained.cachedUrl);
  assert.equal(cache.assertArmorImageCacheResult({ proposal, result }), true);
});

async function reuseFixture() {
  const input = fixture();
  const proposal = cache.buildArmorImageCacheProposal(input);
  const result = await cache.executeArmorImageCache({ proposal,
    persistPrepared: async () => {}, consumePermit: async () => {},
    upload: async () => `${prefix}retained.png`, readManaged: async () => bytes, persistResult: async () => {} });
  return { ...input, downloads: [], retainedReceipts: result.uploaded, retainedEvidence: { proposal, result } };
}

for (const [name, mutate] of [
  ['missing history', x => { delete x.retainedEvidence; }],
  ['failed history', x => { x.retainedEvidence.result.status = 'FAILED'; }],
  ['altered historical receipt', x => {
    x.retainedEvidence.result = structuredClone(x.retainedEvidence.result);
    x.retainedEvidence.result.uploaded[0].sha256 = `sha256:${'b'.repeat(64)}`;
  }],
  ['altered historical payload', x => { x.retainedEvidence.result.payload.armorSetImages[0].cachedUrl = `${prefix}wrong.png`; }],
  ['receipt URL drift', x => { x.retainedReceipts = structuredClone(x.retainedReceipts); x.retainedReceipts[0].cachedUrl = `${prefix}wrong.png`; }],
  ['changed source revision', x => { for (const row of x.sourcePayload.armorSetImages) {
    row.sourceRevisionTimestamp = '2023-01-01T00:00:00Z'; row.raw.imageInfo.revisionTimestamp = row.sourceRevisionTimestamp;
  } }],
]) test(`retained cache refuses ${name}`, async () => {
  const input = await reuseFixture(); mutate(input);
  assert.throws(() => cache.buildArmorImageCacheProposal(input), /history|historical|retained|drift|COMPLETED/);
});

test('retained readback corruption prevents any new upload', async () => {
  const input = await reuseFixture();
  const proposal = cache.buildArmorImageCacheProposal(input);
  let evidence; let uploads = 0;
  await assert.rejects(cache.executeArmorImageCache({ proposal,
    persistPrepared: async () => {}, consumePermit: async () => {},
    upload: async () => { uploads++; }, readManaged: async () => Buffer.from('corrupt'),
    persistResult: async value => { evidence = value; } }), /retained cache readback/);
  assert.equal(uploads, 0);
  assert.equal(evidence.status, 'FAILED');
});
