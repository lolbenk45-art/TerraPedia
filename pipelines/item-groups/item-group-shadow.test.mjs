import assert from 'node:assert/strict';
import test from 'node:test';

const shadow = await import('./item-group-shadow.mjs').catch(() => ({}));

function snapshot(memberOverrides = {}, extraMembers = []) {
  return {
    groups: [{
      canonicalKey: 'any-wood',
      canonicalName: 'Any Wood',
      displayNameEn: 'Any Wood',
      displayNameZh: '任意木材',
      aliases: ['Wood Group'],
      domains: ['recipe'],
      sourceLayer: 'recipe_reference',
      sourceMetadata: { sourceFile: 'recipe-evidence.json' },
      status: 'ACTIVE',
      members: [
        {
          itemId: 9,
          internalName: 'Wood',
          name: 'Wood',
          nameZh: null,
          ...memberOverrides,
        },
        ...extraMembers,
      ],
    }],
    exclusions: [],
  };
}

test('shadow parity permits only duplicate collapse and null-to-value nameZh enrichment', () => {
  assert.equal(typeof shadow.compareItemGroupShadow, 'function');
  const legacy = snapshot({}, [{
    itemId: 9,
    internalName: 'Wood',
    name: 'Wood',
    nameZh: '木材',
  }]);
  const canonical = snapshot({ nameZh: '木材' });

  const result = shadow.compareItemGroupShadow({
    consumer: 'recipe_expansion',
    legacySnapshot: legacy,
    canonicalSnapshot: canonical,
  });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.differences, []);
  assert.deepEqual(result.normalizations, {
    duplicateMembersCollapsed: 1,
    memberNameZhEnriched: 1,
  });
});

test('shadow parity blocks genuine member loss even in a duplicate-bearing group', () => {
  const legacy = snapshot({}, [
    { itemId: 9, internalName: 'Wood', name: 'Wood', nameZh: '木材' },
    { itemId: 2503, internalName: 'BorealWood', name: 'Boreal Wood', nameZh: '北方木' },
  ]);
  const canonical = snapshot({ nameZh: '木材' });

  const result = shadow.compareItemGroupShadow({
    consumer: 'recipe_expansion',
    legacySnapshot: legacy,
    canonicalSnapshot: canonical,
  });

  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.differences.some((row) => (
    row.kind === 'member_missing' && row.memberKey === 'BorealWood'
  )));
});

test('shadow parity blocks value-to-different-value and value-to-null nameZh changes', () => {
  const changed = shadow.compareItemGroupShadow({
    consumer: 'recipe_expansion',
    legacySnapshot: snapshot({ nameZh: '木材' }),
    canonicalSnapshot: snapshot({ nameZh: '木头' }),
  });
  const removed = shadow.compareItemGroupShadow({
    consumer: 'recipe_expansion',
    legacySnapshot: snapshot({ nameZh: '木材' }),
    canonicalSnapshot: snapshot({ nameZh: null }),
  });

  assert.equal(changed.status, 'BLOCKED');
  assert.equal(removed.status, 'BLOCKED');
  assert.ok(changed.differences.some((row) => row.kind === 'member_name_zh_changed'));
  assert.ok(removed.differences.some((row) => row.kind === 'member_name_zh_removed'));
});

test('shadow parity compares aliases, domains, source metadata, and blocked state exactly', () => {
  const canonical = snapshot({ nameZh: '木材' });
  canonical.groups[0].aliases = ['Different Alias'];
  canonical.groups[0].sourceMetadata = { sourceFile: 'different.json' };
  canonical.groups[0].status = 'BLOCKED';

  const result = shadow.compareItemGroupShadow({
    consumer: 'admin_item_groups',
    legacySnapshot: snapshot({ nameZh: '木材' }),
    canonicalSnapshot: canonical,
  });

  assert.equal(result.status, 'BLOCKED');
  assert.deepEqual(
    new Set(result.differences.map((row) => row.kind)),
    new Set(['aliases_changed', 'source_metadata_changed', 'status_changed']),
  );
});
