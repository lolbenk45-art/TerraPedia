import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEntityZhDescriptionProgressPayload,
  buildZhDescriptionPlan,
  DEFAULT_ACTION_ID,
  DEFAULT_PROGRESS_PATH,
  extractFirstChineseParagraph,
  extractSectionParagraphByAnchor,
  isEnglishOnlyText,
  resolveMysqlRequireCandidates,
} from './backfill-entity-zh-descriptions.mjs';

test('isEnglishOnlyText detects visible English without Chinese text', () => {
  assert.equal(isEnglishOnlyText('The Forest is a pure biome.'), true);
  assert.equal(isEnglishOnlyText('森林是一种纯净的生物群系。'), false);
  assert.equal(isEnglishOnlyText(''), false);
});

test('extractFirstChineseParagraph skips short notices and returns Chinese intro text', () => {
  const html = `
    <table><tr><td>infobox</td></tr></table>
    <p>电脑版/主机版/移动版独有内容</p>
    <p><b>史莱姆王</b> 是个 <a href="/zh/wiki/Boss">Boss</a>。其外观是戴着珠宝金冠的巨大蓝史莱姆。</p>
  `;

  assert.equal(
    extractFirstChineseParagraph(html),
    '史莱姆王是个 Boss。其外观是戴着珠宝金冠的巨大蓝史莱姆。'
  );
});

test('extractFirstChineseParagraph removes tag-boundary spaces inside Chinese phrases', () => {
  const html = `
    <p>森林是一种纯净的 <a href="/zh/wiki/生物群系">生物群系</a> <a href="/zh/wiki/森林">森林</a>，并包含若干含水 <a href="/zh/wiki/湖泊">湖泊</a>和池塘。</p>
  `;

  assert.equal(
    extractFirstChineseParagraph(html),
    '森林是一种纯净的生物群系森林，并包含若干含水湖泊和池塘。'
  );
});

test('extractFirstChineseParagraph removes wiki tag spaces around Chinese punctuation', () => {
  const html = `
    <p>天界柱 <span>（</span>又称月亮柱、 <a href="/zh/wiki/月亮塔">月亮塔</a>、或天界塔）会控制区域。 <a href="/zh/wiki/当">当</a>玩家靠近时， <a href="/zh/wiki/敌怪">敌怪</a>会生成。</p>
  `;

  assert.equal(
    extractFirstChineseParagraph(html),
    '天界柱（又称月亮柱、月亮塔、或天界塔）会控制区域。当玩家靠近时，敌怪会生成。'
  );
});

test('extractSectionParagraphByAnchor reads Chinese overview section paragraphs', () => {
  const html = `
    <h3><span class="mw-headline" id="小片花地">小片花地</span></h3>
    <div class="floatright">image</div>
    <p>小片花地是一小片密密麻麻长满了花的<a href="/zh/wiki/地表">地表</a>地面。</p>
    <h3><span class="mw-headline" id="石嵌块">石嵌块</span></h3>
    <p>石嵌块是地面上的小嵌块体。</p>
  `;

  assert.equal(
    extractSectionParagraphByAnchor(html, '小片花地'),
    '小片花地是一小片密密麻麻长满了花的地表地面。'
  );
});

test('buildZhDescriptionPlan updates only rows with traceable Chinese source text', async () => {
  const bosses = [
    {
      id: 34,
      code: 'KING_SLIME',
      name_en: 'King Slime',
      name_zh: '史莱姆王',
      notes: 'King Slime is a pre-Hardmode boss.',
      source_page: 'https://terraria.wiki.gg/wiki/King_Slime',
    },
    {
      id: 62,
      code: 'SOLAR_PILLAR',
      name_en: 'Solar Pillar',
      name_zh: null,
      notes: null,
      source_page: 'https://terraria.wiki.gg/wiki/Solar_Pillar',
    },
  ];
  const biomes = [
    {
      id: 235,
      code: 'flower_patch',
      name_en: 'Flower patch',
      name_zh: '花丛',
      description: 'Flower patches are small patches of Surface ground densely populated by flowers.',
      source_page: 'Biomes#Flower_patch',
      wiki_section_anchor: 'Flower_patch',
    },
    {
      id: 108,
      code: 'biomes',
      name_en: 'Biomes',
      name_zh: null,
      description: 'Biomes are the different types of areas that any Terraria world can contain.',
      source_page: 'Biomes',
      wiki_section_anchor: null,
    },
  ];
  const items = [
    {
      id: 8415,
      name: 'Spinal Tap',
      name_zh: '脊柱骨鞭',
      internal_name: 'ZH_RECIPE_SPINAL_TAP',
      description: 'Placeholder item inserted from zh recipe import.',
      description_zh: null,
      source_page: '配方/工作台',
    },
  ];
  const worldContexts = [
    {
      id: 23,
      code: 'DAY',
      name_en: 'Day',
      name_zh: '白天',
      description: 'The day and night cycle of the Terraria world refers to the rising and setting of the sun and moon.',
      source_page: 'Day and night cycle',
    },
  ];

  const plan = await buildZhDescriptionPlan({
    bosses,
    biomes,
    items,
    worldContexts,
    fetchZhPage: async (title) => {
      if (title === '史莱姆王') {
        return {
          pageTitle: '史莱姆王',
          revisionTimestamp: '2026-05-20T00:00:00Z',
          html: '<p><b>史莱姆王</b> 是个 Boss。其外观是戴着珠宝金冠的巨大蓝史莱姆。</p>',
        };
      }
      if (title === '天界柱') {
        return {
          pageTitle: '天界柱',
          revisionTimestamp: '2026-05-20T00:00:00Z',
          html: '<p>天界柱是在月亮事件中出现的四个 Boss。</p>',
        };
      }
      if (title === '生物群系') {
        return {
          pageTitle: '生物群系',
          revisionTimestamp: '2026-05-20T00:00:00Z',
          html: '<p><b>生物群系</b>是每个泰拉瑞亚世界都可能包含的不同类型的区域。</p><h3><span class="mw-headline" id="小片花地">小片花地</span></h3><p>小片花地是一小片密密麻麻长满了花的地表地面。</p>',
        };
      }
      if (title === '日夜更替') {
        return {
          pageTitle: '日夜更替',
          revisionTimestamp: '2026-05-20T00:00:00Z',
          html: '<p>泰拉瑞亚世界的日夜更替是指太阳和月亮的升起与落下，以及其对世界产生影响的方式。</p>',
        };
      }
      return null;
    },
    fetchZhTitle: async (englishTitle) => {
      if (englishTitle === 'King Slime') return '史莱姆王';
      if (englishTitle === 'Day and night cycle') return '日夜更替';
      return null;
    },
  });

  assert.equal(plan.summary.bosses.candidates, 2);
  assert.equal(plan.summary.bosses.patchable, 2);
  assert.equal(plan.summary.biomes.candidates, 2);
  assert.equal(plan.summary.biomes.patchable, 2);
  assert.equal(plan.summary.items.candidates, 1);
  assert.equal(plan.summary.items.patchable, 1);
  assert.equal(plan.summary.worldContexts.candidates, 1);
  assert.equal(plan.summary.worldContexts.patchable, 1);
  assert.equal(plan.bossUpdates[0].notesAfter, '史莱姆王是个 Boss。其外观是戴着珠宝金冠的巨大蓝史莱姆。');
  assert.equal(plan.bossUpdates[1].nameZhAfter, '日耀柱');
  assert.equal(plan.bossUpdates[1].notesAfter, '天界柱是在月亮事件中出现的四个 Boss。');
  assert.equal(plan.biomeUpdates[0].descriptionAfter, '小片花地是一小片密密麻麻长满了花的地表地面。');
  assert.equal(plan.biomeUpdates[1].descriptionAfter, '生物群系是每个泰拉瑞亚世界都可能包含的不同类型的区域。');
  assert.equal(plan.itemUpdates[0].descriptionZhAfter, '中文配方导入生成的占位物品。');
  assert.equal(plan.worldContextUpdates[0].descriptionAfter, '泰拉瑞亚世界的日夜更替是指太阳和月亮的升起与落下，以及其对世界产生影响的方式。');
});

test('resolveMysqlRequireCandidates includes data-query-app package manifests', () => {
  const candidates = resolveMysqlRequireCandidates(process.cwd());

  assert.ok(candidates.some((candidate) => String(candidate).endsWith('data-query-app/package.json')));
});

test('default progress contract uses the monitor-visible wiki sync path', () => {
  assert.equal(DEFAULT_ACTION_ID, 'entity-zh-descriptions-backfill');
  assert.match(DEFAULT_PROGRESS_PATH, /data[\\/]generated[\\/]wiki-sync-progress\.latest\.json$/);

  const payload = buildEntityZhDescriptionProgressPayload(DEFAULT_PROGRESS_PATH, {
    status: 'running',
    phase: 'fetch',
    message: 'fetching zh wiki descriptions',
    current: 1,
    total: 2,
    startedAt: '2026-05-22T00:00:00.000Z',
  });

  assert.equal(payload.actionId, DEFAULT_ACTION_ID);
  assert.equal(payload.childStatusPath, DEFAULT_PROGRESS_PATH);
  assert.equal(payload.status, 'running');
  assert.equal(payload.phase, 'fetch');
  assert.equal(payload.current, 1);
  assert.equal(payload.total, 2);
  assert.ok(payload.generatedAt);
  assert.ok(payload.lastHeartbeatAt);
});
