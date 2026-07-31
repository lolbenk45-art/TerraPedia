import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { summarizeImageScopes } from './run-wiki-sync.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const scriptPath = path.join(__dirname, 'run-wiki-sync.mjs');

test('item page plan passes explicit only-changed=false to fetch action', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-sync-'));
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const manifestPath = path.join(tempDir, 'manifest.json');
    const monitorStatePath = path.join(tempDir, 'monitor-state.json');
    const planPath = path.join(tempDir, 'plan.json');
    const progressPath = path.join(tempDir, 'progress.json');

    fs.mkdirSync(worktreeRoot, { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }), 'utf8');
    fs.writeFileSync(monitorStatePath, JSON.stringify({ sources: [{ key: 'seed' }] }), 'utf8');

    const result = spawnSync(process.execPath, [
      scriptPath,
      '--mode=plan',
      '--entity=item_pages',
      '--items=MiningPotion',
      '--only-changed=false',
      '--with-recipes=true',
      `--manifest-path=${manifestPath}`,
      `--monitor-state=${monitorStatePath}`,
      `--plan-path=${planPath}`,
      `--progress-path=${progressPath}`
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKTREE_ROOT: worktreeRoot,
      }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    assert.equal(plan.actions.length, 1);
    assert.ok(plan.actions[0].args.includes('--only-changed=false'));
    assert.ok(!plan.actions[0].args.includes('--only-changed=true'));
});

test('force mode schedules an unchanged module while check mode remains a no-change plan', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-sync-force-module-'));
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const manifestPath = path.join(tempDir, 'manifest.json');
    const monitorStatePath = path.join(tempDir, 'monitor-state.json');
    const checkPlanPath = path.join(tempDir, 'check-plan.json');
    const forcePlanPath = path.join(tempDir, 'force-plan.json');
    const progressPath = path.join(tempDir, 'progress.json');
    const localPath = path.join(tempDir, 'module__iteminfo__data.latest.json');

    fs.mkdirSync(worktreeRoot, { recursive: true });
    fs.writeFileSync(localPath, '{}\n', 'utf8');
    fs.writeFileSync(manifestPath, JSON.stringify({
      records: [{
        entityFamily: 'items',
        sourceKind: 'module',
        sourceKey: 'wiki.module.iteminfo',
        lang: 'en',
        pageTitle: 'Module:Iteminfo/data',
        localPath,
        revisionId: 456,
      }],
      schemaVersion: '1.0.0',
    }), 'utf8');
    fs.writeFileSync(monitorStatePath, JSON.stringify({
      sources: [{
        key: 'wiki.module.iteminfo',
        changed: false,
        revisionId: 456,
      }],
    }), 'utf8');

    const commonArgs = [
      scriptPath,
      '--mode=plan',
      '--entity=items',
      `--manifest-path=${manifestPath}`,
      `--monitor-state=${monitorStatePath}`,
      `--progress-path=${progressPath}`,
    ];
    const check = spawnSync(process.execPath, [
      ...commonArgs,
      `--plan-path=${checkPlanPath}`,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, WORKTREE_ROOT: worktreeRoot },
    });
    const force = spawnSync(process.execPath, [
      ...commonArgs,
      '--force=true',
      `--plan-path=${forcePlanPath}`,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, WORKTREE_ROOT: worktreeRoot },
    });

    assert.equal(check.status, 0, check.stderr || check.stdout);
    assert.equal(force.status, 0, force.stderr || force.stdout);
    assert.equal(JSON.parse(fs.readFileSync(checkPlanPath, 'utf8')).actions.length, 0);
    const forcePlan = JSON.parse(fs.readFileSync(forcePlanPath, 'utf8'));
    assert.equal(forcePlan.actions.length, 1);
    assert.equal(forcePlan.actions[0].reason, 'manual_force');
});

test('armor attributes plan routes to the dedicated wiki armor attributes fetcher', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-sync-armor-attributes-'));
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const manifestPath = path.join(tempDir, 'manifest.json');
    const monitorStatePath = path.join(tempDir, 'monitor-state.json');
    const planPath = path.join(tempDir, 'plan.json');
    const progressPath = path.join(tempDir, 'progress.json');

    fs.mkdirSync(worktreeRoot, { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }), 'utf8');
    fs.writeFileSync(monitorStatePath, JSON.stringify({ sources: [{ key: 'seed' }] }), 'utf8');

    const result = spawnSync(process.execPath, [
      scriptPath,
      '--mode=plan',
      '--entity=armor_attributes',
      `--manifest-path=${manifestPath}`,
      `--monitor-state=${monitorStatePath}`,
      `--plan-path=${planPath}`,
      `--progress-path=${progressPath}`
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKTREE_ROOT: worktreeRoot,
      }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    assert.equal(plan.actions.length, 1);
    assert.match(plan.actions[0].scriptPath, /fetch-wiki-armor-attributes\.mjs$/);
    assert.deepEqual(plan.actions[0].titles, ['盔甲属性表']);
});

test('item page plan passes sample options to fetch action', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-sync-sample-'));
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const manifestPath = path.join(tempDir, 'manifest.json');
    const monitorStatePath = path.join(tempDir, 'monitor-state.json');
    const planPath = path.join(tempDir, 'plan.json');
    const progressPath = path.join(tempDir, 'progress.json');

    fs.mkdirSync(worktreeRoot, { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }), 'utf8');
    fs.writeFileSync(monitorStatePath, JSON.stringify({ sources: [{ key: 'seed' }] }), 'utf8');

    const result = spawnSync(process.execPath, [
      scriptPath,
      '--mode=plan',
      '--entity=item_pages',
      '--sample-size=7',
      '--sample-seed=smoke-a',
      '--only-changed=false',
      `--manifest-path=${manifestPath}`,
      `--monitor-state=${monitorStatePath}`,
      `--plan-path=${planPath}`,
      `--progress-path=${progressPath}`
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKTREE_ROOT: worktreeRoot,
      }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    assert.equal(plan.actions.length, 1);
    assert.ok(plan.actions[0].args.includes('--sample-size=7'));
    assert.ok(plan.actions[0].args.includes('--sample-seed=smoke-a'));
    assert.ok(plan.actions[0].args.includes('--only-changed=false'));
    assert.ok(plan.actions[0].args.includes('--limit=100'));
});

test('item page plan rejects sample sizes above the crawler smoke cap', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-sync-sample-cap-'));
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const manifestPath = path.join(tempDir, 'manifest.json');
    const monitorStatePath = path.join(tempDir, 'monitor-state.json');
    const planPath = path.join(tempDir, 'plan.json');
    const progressPath = path.join(tempDir, 'progress.json');

    fs.mkdirSync(worktreeRoot, { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }), 'utf8');
    fs.writeFileSync(monitorStatePath, JSON.stringify({ sources: [{ key: 'seed' }] }), 'utf8');

    const result = spawnSync(process.execPath, [
      scriptPath,
      '--mode=plan',
      '--entity=item_pages',
      '--sample-size=101',
      '--sample-seed=too-large',
      `--manifest-path=${manifestPath}`,
      `--monitor-state=${monitorStatePath}`,
      `--plan-path=${planPath}`,
      `--progress-path=${progressPath}`
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKTREE_ROOT: worktreeRoot,
      }
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /sample-size.*100/i);
});

test('default wiki sync progress path follows WORKTREE_ROOT when progress path is omitted', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-sync-worktree-'));
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const manifestPath = path.join(tempDir, 'manifest.json');
    const monitorStatePath = path.join(tempDir, 'monitor-state.json');
    const planPath = path.join(tempDir, 'plan.json');
    const worktreeProgressPath = path.join(worktreeRoot, 'data', 'generated', 'wiki-sync-progress.latest.json');

    fs.mkdirSync(worktreeRoot, { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }), 'utf8');
    fs.writeFileSync(monitorStatePath, JSON.stringify({ sources: [{ key: 'seed' }] }), 'utf8');

    const result = spawnSync(process.execPath, [
      scriptPath,
      '--mode=plan',
      '--entity=item_pages',
      '--items=MiningPotion',
      '--only-changed=false',
      '--with-recipes=true',
      `--manifest-path=${manifestPath}`,
      `--monitor-state=${monitorStatePath}`,
      `--plan-path=${planPath}`
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKTREE_ROOT: worktreeRoot,
      }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(fs.existsSync(worktreeProgressPath), true);

    const progress = JSON.parse(fs.readFileSync(worktreeProgressPath, 'utf8'));
    assert.equal(progress.status, 'completed');
    assert.equal(path.resolve(progress.childStatusPath), worktreeProgressPath);
});

test('covered source manifest is not advanced during raw child fetch completion', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-sync-owned-manifest-'));
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const manifestPath = path.join(tempDir, 'manifest.json');
    const planPath = path.join(tempDir, 'plan.json');
    const progressPath = path.join(tempDir, 'progress.json');
    const fakeChildPath = path.join(tempDir, 'fake-child.mjs');
    const rawWikiDir = path.join(tempDir, 'data', 'terraPedia', 'raw', 'wiki');
    const iteminfoPath = path.join(rawWikiDir, 'module__iteminfo__data.latest.json');

    fs.mkdirSync(rawWikiDir, { recursive: true });
    fs.writeFileSync(fakeChildPath, 'process.exit(0);\n', 'utf8');
    fs.writeFileSync(iteminfoPath, JSON.stringify({
      fetchedAt: '2026-06-20T00:00:00.000Z',
      moduleContent: 'return { ["data"] = [=[{ "_terrariaversion": "1.4.4.9", "1": { "name": "Iron Pickaxe", "internalName": "IronPickaxe", "pick": 40, "maxStack": 1 } }]=] }',
      pageId: 123,
      pageTitle: 'Module:Iteminfo/data',
      revisionId: 456,
      revisionTimestamp: '2026-06-20T00:00:00Z'
    }), 'utf8');
    fs.writeFileSync(manifestPath, JSON.stringify({
      generatedAt: '2026-06-19T00:00:00.000Z',
      records: [{
        contentHash: 'previous-hash',
        entityFamily: 'items',
        key: 'items|module|wiki.module.iteminfo|en|Module:Iteminfo/data',
        lang: 'en',
        lastFetchedAt: '2026-06-19T00:00:00.000Z',
        lastParsedAt: '2026-06-19T00:00:00.000Z',
        localPath: iteminfoPath,
        pageId: 111,
        pageTitle: 'Module:Iteminfo/data',
        requestedPageTitle: 'Module:Iteminfo/data',
        revisionId: 222,
        revisionTimestamp: '2026-06-19T00:00:00Z',
        sourceKey: 'wiki.module.iteminfo',
        sourceKind: 'module',
        status: 'ok'
      }],
      schemaVersion: '1.0.0'
    }), 'utf8');
    fs.writeFileSync(planPath, JSON.stringify({
      actions: [{
        id: 'items-refresh',
        entityFamily: 'items',
        type: 'run_script',
        command: process.execPath,
        args: [fakeChildPath],
        sourceKeys: ['wiki.module.iteminfo'],
        status: 'pending'
      }],
      generatedAt: '2026-06-20T00:00:00.000Z',
      requestedEntities: ['items'],
      resumeToken: 'test-owned-manifest',
      runMode: 'plan'
    }), 'utf8');

    const result = spawnSync(process.execPath, [
      scriptPath,
      '--mode=resume',
      '--entity=items',
      `--manifest-path=${manifestPath}`,
      `--plan-path=${planPath}`,
      `--progress-path=${progressPath}`
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKTREE_ROOT: worktreeRoot,
      }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const iteminfoRecord = manifest.records.find((record) => record.sourceKey === 'wiki.module.iteminfo');
    assert.equal(iteminfoRecord.contentHash, 'previous-hash');
    assert.equal(iteminfoRecord.revisionId, 222);
});

test('items apply normalizes wiki item module after raw source refresh', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-sync-normalize-items-'));
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const manifestPath = path.join(tempDir, 'manifest.json');
    const planPath = path.join(tempDir, 'plan.json');
    const progressPath = path.join(tempDir, 'progress.json');
    const fakeChildPath = path.join(tempDir, 'write-iteminfo.mjs');
    const rawWikiDir = path.join(tempDir, 'data', 'terraPedia', 'raw', 'wiki');
    const normalizedPath = path.join(tempDir, 'data', 'terraPedia', 'normalized', 'items.wiki.json');

    fs.mkdirSync(rawWikiDir, { recursive: true });
    fs.writeFileSync(fakeChildPath, `
      import fs from 'node:fs';
      import path from 'node:path';
      const rawDir = ${JSON.stringify(rawWikiDir)};
      fs.mkdirSync(rawDir, { recursive: true });
      fs.writeFileSync(path.join(rawDir, 'module__iteminfo__data.latest.json'), JSON.stringify({
        apiUrl: 'https://terraria.wiki.gg/api.php',
        pageTitle: 'Module:Iteminfo/data',
        revisionId: 456,
        revisionTimestamp: '2026-06-20T00:00:00Z',
        fetchedAt: '2026-06-20T00:00:00.000Z',
        moduleContent: 'return { ["data"] = [=[{ "_terrariaversion": "1.4.4.9", "1": { "name": "Iron Pickaxe", "internalName": "IronPickaxe", "pick": 40, "maxStack": 1 } }]=] }'
      }));
    `, 'utf8');
    fs.writeFileSync(manifestPath, JSON.stringify({ records: [], schemaVersion: '1.0.0' }), 'utf8');
    fs.writeFileSync(planPath, JSON.stringify({
      actions: [{
        id: 'items-refresh',
        entityFamily: 'items',
        type: 'run_script',
        command: process.execPath,
        args: [fakeChildPath],
        sourceKeys: ['wiki.module.iteminfo'],
        status: 'pending'
      }],
      generatedAt: '2026-06-20T00:00:00.000Z',
      requestedEntities: ['items'],
      resumeToken: 'test-normalize-items',
      runMode: 'plan'
    }), 'utf8');

    const result = spawnSync(process.execPath, [
      scriptPath,
      '--mode=resume',
      '--entity=items',
      `--manifest-path=${manifestPath}`,
      `--plan-path=${planPath}`,
      `--progress-path=${progressPath}`
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKTREE_ROOT: worktreeRoot,
      }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(fs.existsSync(normalizedPath), true);
    const normalized = JSON.parse(fs.readFileSync(normalizedPath, 'utf8'));
    assert.equal(normalized.totalItems, 1);
    assert.equal(normalized.items[0].internalName, 'IronPickaxe');
    const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    assert.equal(progress.plannedCount, 1);
    assert.equal(progress.actualCount, 1);
    assert.equal(progress.skippedCount, 0);
    assert.equal(progress.failedCount, 0);
    assert.equal(progress.resultKind, 'fetched');
    assert.equal(progress.resumeOutcome, 'not_supported');
});

test('items apply marks action failed when post-refresh normalization fails', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-sync-normalize-fail-'));
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const manifestPath = path.join(tempDir, 'manifest.json');
    const planPath = path.join(tempDir, 'plan.json');
    const progressPath = path.join(tempDir, 'progress.json');
    const fakeChildPath = path.join(tempDir, 'no-iteminfo.mjs');

    fs.mkdirSync(worktreeRoot, { recursive: true });
    fs.writeFileSync(fakeChildPath, 'process.exit(0);\n', 'utf8');
    fs.writeFileSync(manifestPath, JSON.stringify({ records: [], schemaVersion: '1.0.0' }), 'utf8');
    fs.writeFileSync(planPath, JSON.stringify({
      actions: [{
        id: 'items-refresh',
        entityFamily: 'items',
        type: 'run_script',
        command: process.execPath,
        args: [fakeChildPath],
        sourceKeys: ['wiki.module.iteminfo'],
        status: 'pending'
      }],
      generatedAt: '2026-06-20T00:00:00.000Z',
      requestedEntities: ['items'],
      resumeToken: 'test-normalize-fail',
      runMode: 'plan'
    }), 'utf8');

    const result = spawnSync(process.execPath, [
      scriptPath,
      '--mode=resume',
      '--entity=items',
      `--manifest-path=${manifestPath}`,
      `--plan-path=${planPath}`,
      `--progress-path=${progressPath}`
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKTREE_ROOT: worktreeRoot,
      }
    });

    assert.notEqual(result.status, 0);
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    assert.equal(plan.actions[0].status, 'failed');
    const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    assert.equal(progress.status, 'failed');
    assert.match(progress.message, /failed items-refresh/);
    assert.equal(progress.plannedCount, 1);
    assert.equal(progress.actualCount, 0);
    assert.equal(progress.failedCount, 1);
    assert.equal(progress.resultKind, 'failed');
});

test('items apply normalizes existing raw module when no source action is planned', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-sync-normalize-noop-'));
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const manifestPath = path.join(tempDir, 'manifest.json');
    const monitorStatePath = path.join(tempDir, 'monitor-state.json');
    const planPath = path.join(tempDir, 'plan.json');
    const progressPath = path.join(tempDir, 'progress.json');
    const rawWikiDir = path.join(tempDir, 'data', 'terraPedia', 'raw', 'wiki');
    const rawPath = path.join(rawWikiDir, 'module__iteminfo__data.latest.json');
    const normalizedPath = path.join(tempDir, 'data', 'terraPedia', 'normalized', 'items.wiki.json');

    fs.mkdirSync(rawWikiDir, { recursive: true });
    fs.writeFileSync(rawPath, JSON.stringify({
      apiUrl: 'https://terraria.wiki.gg/api.php',
      pageTitle: 'Module:Iteminfo/data',
      revisionId: 456,
      revisionTimestamp: '2026-06-20T00:00:00Z',
      fetchedAt: '2026-06-20T00:00:00.000Z',
      moduleContent: 'return { ["data"] = [=[{ "_terrariaversion": "1.4.4.9", "1": { "name": "Iron Pickaxe", "internalName": "IronPickaxe", "pick": 40, "maxStack": 1 } }]=] }'
    }), 'utf8');
    fs.writeFileSync(manifestPath, JSON.stringify({
      records: [{
        contentHash: 'existing',
        entityFamily: 'items',
        key: 'items|module|wiki.module.iteminfo|en|Module:Iteminfo/data',
        lang: 'en',
        localPath: rawPath,
        pageTitle: 'Module:Iteminfo/data',
        requestedPageTitle: 'Module:Iteminfo/data',
        revisionTimestamp: '2026-06-20T00:00:00Z',
        sourceKey: 'wiki.module.iteminfo',
        sourceKind: 'module',
        status: 'ok'
      }],
      schemaVersion: '1.0.0'
    }), 'utf8');
    fs.writeFileSync(monitorStatePath, JSON.stringify({
      sources: [{
        key: 'wiki.module.iteminfo',
        entityFamily: 'items',
        revisionTimestamp: '2026-06-20T00:00:00Z',
        changed: false,
        status: 'ok'
      }]
    }), 'utf8');

    const result = spawnSync(process.execPath, [
      scriptPath,
      '--mode=apply',
      '--entity=items',
      `--manifest-path=${manifestPath}`,
      `--monitor-state=${monitorStatePath}`,
      `--plan-path=${planPath}`,
      `--progress-path=${progressPath}`
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKTREE_ROOT: worktreeRoot,
      }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    assert.equal(plan.actions.length, 0);
    assert.equal(fs.existsSync(normalizedPath), true);
    const normalized = JSON.parse(fs.readFileSync(normalizedPath, 'utf8'));
    assert.equal(normalized.items[0].internalName, 'IronPickaxe');
    const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
    assert.equal(progress.plannedCount, 0);
    assert.equal(progress.actualCount, 0);
    assert.equal(progress.skippedCount, 0);
    assert.equal(progress.failedCount, 0);
    assert.equal(progress.resultKind, 'no_change');
    assert.equal(progress.resumeOutcome, 'not_supported');
});

test('image scope summary counts an origin-free managed path as managed', () => {
    // Image sync stores the path the backend returns. Reading those as unmanaged
    // schedules a full re-sync of every already-managed image on every plan.
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-sync-images-'));
    fs.mkdirSync(path.join(tempRoot, 'data', 'standardized'), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, 'data', 'standardized', 'items.standardized.json'),
      JSON.stringify({
        records: [
          { internalName: 'Torch', imageUrl: '/terrapedia-images/items/2026/07/29/torch.png' },
          { internalName: 'Wood', imageUrl: 'http://localhost:9000/terrapedia-images/items/wood.png' },
          { internalName: 'Stone', imageUrl: 'https://terraria.wiki.gg/images/Stone_Block.png' }
        ]
      }),
      'utf8'
    );

    const summary = summarizeImageScopes(['items'], undefined, { repoRoot: tempRoot });

    assert.equal(summary.modules.items.total, 3);
    assert.equal(summary.modules.items.unmanaged, 1);
    assert.equal(summary.unmanagedImageCount, 1);
});
