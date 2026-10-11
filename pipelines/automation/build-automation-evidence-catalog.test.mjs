import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildAutomationEvidenceCatalog,
  verifyAutomationEvidenceCatalog,
  writeAutomationEvidenceCatalog,
} from './build-automation-evidence-catalog.mjs';

function fixtureRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-evidence-catalog-'));
}

function privateOutputRoot(repositoryRoot) {
  const outputRoot = path.join(repositoryRoot, '.local', 'tmp');
  fs.mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
  fs.chmodSync(outputRoot, 0o700);
  return outputRoot;
}

function writeFixture(root, relativePath, payload = { generatedAt: '2026-08-31T00:00:00Z' }) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
  fs.chmodSync(absolutePath, 0o600);
}

function writeExpected185Fixture(root) {
  const l2Names = [
    'execution-manifest', 'input', 'owner-input', 'packet', 'request', 'result',
  ];
  let sequence = 0;
  for (let index = 0; index < 131; index += 1) {
    const role = l2Names[index % l2Names.length];
    writeFixture(root, `reports/authorization/canonical/automation-items-l2-promotion.${role}.${sequence}.json`);
    sequence += 1;
  }
  for (let index = 0; index < 45; index += 1) {
    writeFixture(root, `reports/authorization/canonical/l1-historical-source-hash-disposition/items/run-${index}/candidate.json`);
  }
  for (let index = 0; index < 4; index += 1) {
    writeFixture(root, `reports/audit/audit-${index}.json`);
    writeFixture(root, `reports/relation/relation-${index}.json`);
  }
  writeFixture(root, 'v2-preflight-readback.json', { checkedAt: '2026-08-31T00:00:00Z' });
}

test('catalogs the retained evidence with the expected 131/45/4/4/1 split', () => {
  const root = fixtureRoot();
  writeExpected185Fixture(root);

  const catalog = buildAutomationEvidenceCatalog({ sourceRoot: root, expectedCount: 185 });

  assert.equal(catalog.entryCount, 185);
  assert.deepEqual(catalog.categoryCounts, {
    'eight-domain-l2-automation-evidence': 131,
    'historical-source-hash-disposition': 45,
    'audit-reports': 4,
    'relation-reports': 4,
    'v2-preflight-readback': 1,
  });
  assert.deepEqual(catalog.classificationCounts, {
    consumed: 131,
    'historical-exception': 45,
    baseline: 9,
  });
  assert.equal(verifyAutomationEvidenceCatalog(catalog, { sourceRoot: root, expectedCount: 185 }), true);
  assert.ok(catalog.entries.every((entry) => entry.mode === '0600' && entry.symlink === false));
  assert.ok(catalog.entries.every((entry) => entry.forbiddenUses.length > 0 && entry.reusableFor.length > 0));
});

test('catalog rejects an unexpected count and an unclassified path', () => {
  const root = fixtureRoot();
  writeFixture(root, 'reports/audit/a.json');
  assert.throws(
    () => buildAutomationEvidenceCatalog({ sourceRoot: root, expectedCount: 185 }),
    /count mismatch/,
  );
  writeFixture(root, 'reports/unknown/unclassified.json');
  assert.throws(() => buildAutomationEvidenceCatalog({ sourceRoot: root }), /unclassified retained evidence path/);
});

test('catalog rejects unknown automation and disposition domains instead of downgrading them to global', () => {
  const dispositionRoot = fixtureRoot();
  writeFixture(
    dispositionRoot,
    'reports/authorization/canonical/l1-historical-source-hash-disposition/unknown_domain/run-1/disposition.json',
  );
  assert.throws(
    () => buildAutomationEvidenceCatalog({ sourceRoot: dispositionRoot }),
    /unknown|unrecognized|unclassified.*domain/i,
  );

  const automationRoot = fixtureRoot();
  writeFixture(
    automationRoot,
    'reports/authorization/canonical/automation-unknown-domain-l2-promotion.packet.0.json',
  );
  assert.throws(
    () => buildAutomationEvidenceCatalog({ sourceRoot: automationRoot }),
    /unknown|unrecognized|unclassified.*domain/i,
  );
});

test('catalog refuses symlinks and non-0600 source files', () => {
  const root = fixtureRoot();
  writeFixture(root, 'reports/audit/real.json');
  fs.symlinkSync(path.join(root, 'reports/audit/real.json'), path.join(root, 'reports/audit/link.json'));
  assert.throws(() => buildAutomationEvidenceCatalog({ sourceRoot: root }), /symlink/);

  const modeRoot = fixtureRoot();
  writeFixture(modeRoot, 'reports/audit/too-open.json');
  fs.chmodSync(path.join(modeRoot, 'reports/audit/too-open.json'), 0o644);
  assert.throws(() => buildAutomationEvidenceCatalog({ sourceRoot: modeRoot }), /0600/);
});

test('catalog rejects a source root reached through a symlinked ancestor', () => {
  const anchor = fixtureRoot();
  const realParent = path.join(anchor, 'real-parent');
  const realRoot = path.join(realParent, 'evidence');
  const linkedParent = path.join(anchor, 'linked-parent');
  fs.mkdirSync(realRoot, { recursive: true });
  fs.symlinkSync(realParent, linkedParent, 'dir');
  writeFixture(realRoot, 'reports/audit/source.json');

  assert.throws(
    () => buildAutomationEvidenceCatalog({ sourceRoot: path.join(linkedParent, 'evidence') }),
    /canonical|symbolic|symlink|ancestor|ordinary/i,
  );
});

test('catalog rejects a group-writable source root or descendant directory', () => {
  const root = fixtureRoot();
  writeFixture(root, 'reports/audit/source.json');
  fs.chmodSync(root, 0o770);
  assert.throws(() => buildAutomationEvidenceCatalog({ sourceRoot: root }), /owner|writable|mode|private/i);

  const nestedRoot = fixtureRoot();
  writeFixture(nestedRoot, 'reports/audit/source.json');
  fs.chmodSync(path.join(nestedRoot, 'reports', 'audit'), 0o770);
  assert.throws(() => buildAutomationEvidenceCatalog({ sourceRoot: nestedRoot }), /owner|writable|mode|private/i);
});

test('git-untracked catalog mode rejects symlink entries instead of silently filtering them', () => {
  const root = fixtureRoot();
  execFileSync('git', ['init', '--quiet', root]);
  writeFixture(root, 'reports/audit/real.json');
  fs.symlinkSync(path.join(root, 'reports/audit/real.json'), path.join(root, 'reports/audit/link.json'));

  assert.throws(
    () => buildAutomationEvidenceCatalog({ sourceRoot: root, gitUntrackedOnly: true }),
    /symlink|symbolic|ordinary|source entry/i,
  );
});

test('catalog verification catches byte drift and preserves same-named files by full path', () => {
  const root = fixtureRoot();
  writeFixture(root, 'reports/audit/shared.json');
  writeFixture(root, 'reports/relation/shared.json');
  const catalog = buildAutomationEvidenceCatalog({ sourceRoot: root });
  assert.equal(new Set(catalog.entries.map((entry) => entry.relativePath)).size, 2);
  fs.appendFileSync(path.join(root, 'reports/audit/shared.json'), 'drift');
  assert.throws(() => verifyAutomationEvidenceCatalog(catalog), /byte (length|hash) drifted|metadata/i);
});

test('catalog marks absent content timestamps and forbids replay uses', (t) => {
  const root = fixtureRoot();
  const repositoryRoot = fixtureRoot();
  const outputRoot = privateOutputRoot(repositoryRoot);
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(repositoryRoot, { recursive: true, force: true });
  });
  writeFixture(root, 'reports/audit/no-timestamp.json', { note: 'no timestamp' });
  const catalog = buildAutomationEvidenceCatalog({ sourceRoot: root });
  const entry = catalog.entries[0];
  assert.equal(entry.generationTime.source, 'unavailable');
  assert.ok(entry.forbiddenUses.includes('scheduler-authorization'));

  const output = path.join(outputRoot, 'catalog.json');
  writeAutomationEvidenceCatalog(output, catalog, { outputRoot, repositoryRoot });
  assert.equal(fs.statSync(output).mode & 0o777, 0o600);
  assert.throws(() => writeAutomationEvidenceCatalog(output, catalog, { outputRoot, repositoryRoot }), /overwrite/);
});

test('catalog output requires an explicit separate intended root', (t) => {
  const sourceRoot = fixtureRoot();
  const outputRoot = fixtureRoot();
  t.after(() => {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(outputRoot, { recursive: true, force: true });
  });
  writeFixture(sourceRoot, 'reports/audit/catalog-source.json');
  const catalog = buildAutomationEvidenceCatalog({ sourceRoot });
  const outputPath = path.join(outputRoot, 'catalog.json');

  assert.throws(
    () => writeAutomationEvidenceCatalog(outputPath, catalog),
    /output root.*required|explicit.*output/i,
  );
  assert.equal(fs.existsSync(outputPath), false);
  assert.throws(
    () => writeAutomationEvidenceCatalog(path.join(sourceRoot, 'catalog.json'), catalog, { outputRoot: sourceRoot }),
    /read-only source root|separate from/i,
  );
  assert.equal(fs.existsSync(path.join(sourceRoot, 'catalog.json')), false);
});

test('catalog output rejects a symlinked intended root before any external write', (t) => {
  const sourceRoot = fixtureRoot();
  const outputAnchor = fixtureRoot();
  const outsideRoot = fixtureRoot();
  t.after(() => {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(outputAnchor, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  });
  writeFixture(sourceRoot, 'reports/audit/catalog-source.json');
  const catalog = buildAutomationEvidenceCatalog({ sourceRoot });
  const outputRoot = path.join(outputAnchor, 'linked-output');
  const outputPath = path.join(outputRoot, 'catalog.json');
  fs.symlinkSync(outsideRoot, outputRoot, 'dir');

  assert.throws(
    () => writeAutomationEvidenceCatalog(outputPath, catalog, { outputRoot }),
    /symbolic|symlink|ordinary.*directory|output root/i,
  );
  assert.equal(fs.existsSync(path.join(outsideRoot, 'catalog.json')), false);
});

test('catalog output preserves a target created after validation', (t) => {
  const sourceRoot = fixtureRoot();
  const repositoryRoot = fixtureRoot();
  const outputRoot = privateOutputRoot(repositoryRoot);
  t.after(() => {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(repositoryRoot, { recursive: true, force: true });
  });
  writeFixture(sourceRoot, 'reports/audit/catalog-source.json');
  const catalog = buildAutomationEvidenceCatalog({ sourceRoot });
  const outputPath = path.join(outputRoot, 'catalog.json');
  const originalRenameSync = fs.renameSync;
  const originalLinkSync = fs.linkSync;
  const originalOpenSync = fs.openSync;
  let raced = false;
  const publishCollision = (candidate) => {
    if (raced || typeof candidate !== 'string' || !candidate.endsWith(`${path.sep}catalog.json`)) return;
    raced = true;
    const fd = originalOpenSync(
      outputPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
      0o600,
    );
    fs.writeFileSync(fd, 'late catalog collision\n');
    fs.closeSync(fd);
  };
  fs.renameSync = function patchedRenameSync(from, to, ...args) {
    publishCollision(to);
    return originalRenameSync.call(this, from, to, ...args);
  };
  fs.linkSync = function patchedLinkSync(from, to, ...args) {
    publishCollision(to);
    return originalLinkSync.call(this, from, to, ...args);
  };

  try {
    assert.throws(
      () => writeAutomationEvidenceCatalog(outputPath, catalog, { outputRoot, repositoryRoot }),
      /already exists|overwrite/i,
    );
  } finally {
    fs.renameSync = originalRenameSync;
    fs.linkSync = originalLinkSync;
  }
  assert.equal(raced, true);
  assert.equal(fs.readFileSync(outputPath, 'utf8'), 'late catalog collision\n');
});

test('catalog output rejects a destination replaced after hard-link publication', (t) => {
  const sourceRoot = fixtureRoot();
  const repositoryRoot = fixtureRoot();
  const outputRoot = privateOutputRoot(repositoryRoot);
  t.after(() => {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(repositoryRoot, { recursive: true, force: true });
  });
  writeFixture(sourceRoot, 'reports/audit/catalog-source.json');
  const catalog = buildAutomationEvidenceCatalog({ sourceRoot });
  const outputPath = path.join(outputRoot, 'catalog.json');
  const originalLinkSync = fs.linkSync;
  let replaced = false;
  fs.linkSync = function patchedLinkSync(from, to, ...args) {
    const result = originalLinkSync.call(this, from, to, ...args);
    if (!replaced && typeof to === 'string' && to.endsWith(`${path.sep}catalog.json`)) {
      replaced = true;
      fs.unlinkSync(to);
      fs.writeFileSync(to, 'replacement catalog\n', { mode: 0o600, flag: 'wx' });
    }
    return result;
  };
  try {
    assert.throws(
      () => writeAutomationEvidenceCatalog(outputPath, catalog, { outputRoot, repositoryRoot }),
      /identity|changed|replacement|ordinary|private/i,
    );
  } finally {
    fs.linkSync = originalLinkSync;
  }
  assert.equal(replaced, true);
  assert.equal(fs.readFileSync(outputPath, 'utf8'), 'replacement catalog\n');
});

test('catalog publication fails closed when a source file drifts after the final hard link', (t) => {
  const sourceRoot = fixtureRoot();
  const repositoryRoot = fixtureRoot();
  const outputRoot = privateOutputRoot(repositoryRoot);
  t.after(() => {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(repositoryRoot, { recursive: true, force: true });
  });
  const sourcePath = path.join(sourceRoot, 'reports', 'audit', 'catalog-source.json');
  writeFixture(sourceRoot, 'reports/audit/catalog-source.json');
  const catalog = buildAutomationEvidenceCatalog({ sourceRoot });
  const outputPath = path.join(outputRoot, 'catalog.json');
  const originalLinkSync = fs.linkSync;
  let drifted = false;
  fs.linkSync = function patchedLinkSync(from, to, ...args) {
    const result = originalLinkSync.call(this, from, to, ...args);
    if (!drifted && typeof to === 'string' && to.endsWith(`${path.sep}catalog.json`)) {
      drifted = true;
      fs.writeFileSync(sourcePath, '{"generatedAt":"2026-08-31T00:01:00Z","drifted":true}\n', { mode: 0o600 });
      fs.chmodSync(sourcePath, 0o600);
    }
    return result;
  };
  try {
    assert.throws(
      () => writeAutomationEvidenceCatalog(outputPath, catalog, { outputRoot, repositoryRoot }),
      /source.*(drift|metadata|catalog)|catalog.*source|inventory/i,
    );
  } finally {
    fs.linkSync = originalLinkSync;
  }
  assert.equal(drifted, true);
  assert.equal(fs.existsSync(outputPath), true);
  assert.throws(
    () => verifyAutomationEvidenceCatalog(JSON.parse(fs.readFileSync(outputPath, 'utf8')), { sourceRoot }),
    /byte (length|hash) drifted|metadata/i,
  );
});

test('catalog verification rejects an omitted source file even when the catalog self-hash is rebuilt', () => {
  const root = fixtureRoot();
  writeFixture(root, 'reports/audit/first.json');
  writeFixture(root, 'reports/audit/second.json');
  const catalog = buildAutomationEvidenceCatalog({ sourceRoot: root });
  catalog.entries = [catalog.entries[0]];
  catalog.entryCount = 1;
  catalog.categoryCounts = { 'audit-reports': 1 };
  catalog.classificationCounts = { consumed: 0, 'historical-exception': 0, baseline: 1 };
  catalog.catalogSha256 = `sha256:${createHash('sha256').update(`${JSON.stringify({ ...catalog, catalogSha256: undefined })}\n`).digest('hex')}`;

  assert.throws(
    () => verifyAutomationEvidenceCatalog(catalog, { sourceRoot: root }),
    /inventory|source.*file|path set|complete|missing/i,
  );
});

test('catalog verification rejects a newly added source file after enumeration', () => {
  const root = fixtureRoot();
  writeFixture(root, 'reports/audit/first.json');
  const catalog = buildAutomationEvidenceCatalog({ sourceRoot: root });
  writeFixture(root, 'reports/audit/late.json');

  assert.throws(
    () => verifyAutomationEvidenceCatalog(catalog, { sourceRoot: root }),
    /inventory|source.*file|path set|extra|mismatch/i,
  );
});

test('catalog verification rejects tampered metadata even when its self-hash is rebuilt', () => {
  const root = fixtureRoot();
  writeFixture(root, 'reports/audit/metadata.json');
  const catalog = buildAutomationEvidenceCatalog({ sourceRoot: root });
  catalog.entries[0].classification = 'consumed';
  catalog.entries[0].consumed = true;
  catalog.entries[0].historicalException = false;
  catalog.entries[0].category = 'eight-domain-l2-automation-evidence';
  catalog.categoryCounts = { 'eight-domain-l2-automation-evidence': 1 };
  catalog.classificationCounts = { consumed: 1, 'historical-exception': 0, baseline: 0 };
  catalog.catalogSha256 = `sha256:${createHash('sha256').update(`${JSON.stringify({ ...catalog, catalogSha256: undefined })}\n`).digest('hex')}`;

  assert.throws(
    () => verifyAutomationEvidenceCatalog(catalog, { sourceRoot: root }),
    /metadata|classification|category|does not match|invalid/i,
  );
});

test('catalog verification rejects malformed required metadata despite a valid self-hash', () => {
  const root = fixtureRoot();
  writeFixture(root, 'reports/audit/metadata-required.json');
  const catalog = buildAutomationEvidenceCatalog({ sourceRoot: root });
  catalog.entries[0].forbiddenUses = [];
  catalog.catalogSha256 = `sha256:${createHash('sha256').update(`${JSON.stringify({ ...catalog, catalogSha256: undefined })}\n`).digest('hex')}`;

  assert.throws(
    () => verifyAutomationEvidenceCatalog(catalog, { sourceRoot: root }),
    /forbidden|metadata|required|invalid/i,
  );
});

test('catalog rejects an unstable source enumeration instead of trusting one root inode check', () => {
  const root = fixtureRoot();
  writeFixture(root, 'reports/audit/first.json');
  const originalReaddirSync = fs.readdirSync;
  let injected = false;
  let reads = 0;
  fs.readdirSync = function patchedReaddirSync(directoryPath, options) {
    reads += 1;
    const result = originalReaddirSync.call(this, directoryPath, options);
    if (!injected && reads >= 3 && String(directoryPath).includes('/proc/self/fd/')) {
      injected = true;
      writeFixture(root, 'reports/audit/injected-during-enumeration.json');
    }
    return result;
  };
  try {
    assert.throws(
      () => buildAutomationEvidenceCatalog({ sourceRoot: root }),
      /unstable|enumeration|inventory|mismatch|source.*file/i,
    );
  } finally {
    fs.readdirSync = originalReaddirSync;
  }
  assert.equal(injected, true);
});

test('catalog output must be confined to the repository private temporary root', () => {
  const repositoryRoot = fixtureRoot();
  const sourceRoot = fixtureRoot();
  const trackedLikeOutputRoot = path.join(repositoryRoot, 'reports', 'authorization', 'canonical');
  fs.mkdirSync(trackedLikeOutputRoot, { recursive: true, mode: 0o700 });
  writeFixture(sourceRoot, 'reports/audit/catalog-source.json');
  const catalog = buildAutomationEvidenceCatalog({ sourceRoot });

  assert.throws(
    () => writeAutomationEvidenceCatalog(
      path.join(trackedLikeOutputRoot, 'catalog.json'),
      catalog,
      { outputRoot: trackedLikeOutputRoot, repositoryRoot },
    ),
    /private|temporary|\.local|ignored|output root/i,
  );
  assert.equal(fs.existsSync(path.join(trackedLikeOutputRoot, 'catalog.json')), false);
});
