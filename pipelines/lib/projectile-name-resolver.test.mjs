import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildResolvedProjectileZhEntries,
  resolveProjectileNameReference,
  resolveProjectileZhName,
} from './projectile-name-resolver.mjs';

test('resolveProjectileNameReference extracts referenced projectile internal name', () => {
  assert.equal(resolveProjectileNameReference('{$ProjectileName.ObsidianFire}'), 'ObsidianFire');
  assert.equal(resolveProjectileNameReference('Obsidian Fire'), null);
  assert.equal(resolveProjectileNameReference(''), null);
});

test('resolveProjectileZhName follows projectile placeholder aliases', () => {
  const map = new Map([
    ['ObsidianFire', '黑曜石之火'],
    ['ObsidianFire2', '{$ProjectileName.ObsidianFire}'],
    ['SkyDragonsFuryElectrosphere', '{$ProjectileName.Electrosphere}'],
    ['Electrosphere', '电圈'],
  ]);

  assert.equal(
    resolveProjectileZhName(map.get('ObsidianFire2'), (key) => map.get(key) ?? null),
    '黑曜石之火'
  );
  assert.equal(
    resolveProjectileZhName(map.get('SkyDragonsFuryElectrosphere'), (key) => map.get(key) ?? null),
    '电圈'
  );
});

test('buildResolvedProjectileZhEntries resolves alias rows to concrete zh names', () => {
  const rawEntries = new Map([
    ['ObsidianFire', { internalName: 'ObsidianFire', nameZh: '黑曜石之火' }],
    ['ObsidianFire2', { internalName: 'ObsidianFire2', nameZh: '{$ProjectileName.ObsidianFire}' }],
    ['Electrosphere', { internalName: 'Electrosphere', nameZh: '电圈' }],
    ['SkyDragonsFuryElectrosphere', { internalName: 'SkyDragonsFuryElectrosphere', nameZh: '{$ProjectileName.Electrosphere}' }],
  ]);

  const resolvedEntries = buildResolvedProjectileZhEntries(rawEntries);

  assert.equal(resolvedEntries.get('ObsidianFire2')?.nameZh, '黑曜石之火');
  assert.equal(resolvedEntries.get('SkyDragonsFuryElectrosphere')?.nameZh, '电圈');
});
