import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  applyBuffPageImmunityFacts,
  parseBuffPageImmunityFacts,
  parseBuffPageEvidence
} from './buff-immunity-page-parser.mjs';

const cursedInfernoFixtureHtml = `
  <h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2>
  <div class="terraria mw-collapsible">
    <div class="heading">Enemies immune to Cursed Inferno</div>
    <div class="mw-collapsible-content">
      <div class="itemlist">
        <ul>
          <li><span class="i"><a href="/wiki/Dungeon_Guardian" title="Dungeon Guardian"><img alt="Dungeon Guardian" src="/images/Dungeon_Guardian.png" /></a><span><span><a href="/wiki/Dungeon_Guardian" title="Dungeon Guardian">Dungeon Guardian</a></span></span></span></li>
          <li><span class="i -w"><a href="/wiki/Martian_Saucer" title="Martian Saucer"><img alt="Martian Saucer" src="/images/Martian_Saucer.png" /></a><span><span><a href="/wiki/Martian_Saucer" title="Martian Saucer">Martian Saucer</a></span><span class="eico s i1 i2 i4" title="Desktop, Console and Mobile versions"><b></b><i></i><span>(Desktop, Console and Mobile versions)</span></span></span></span></li>
          <li><span class="i"><a href="/wiki/Clinger" title="Clinger"><img alt="Clinger" src="/images/Clinger.png" /></a><span><span><a href="/wiki/Clinger" title="Clinger">Clinger</a></span></span></span></li>
          <li><span class="i"><a href="/wiki/Dungeon_Spirit" title="Dungeon Spirit"><img alt="Dungeon Spirit" src="/images/Dungeon_Spirit.png" /></a><span><span><a href="/wiki/Dungeon_Spirit" title="Dungeon Spirit">Dungeon Spirit</a></span></span></span></li>
          <li><span class="i"><a href="/wiki/Wraith" title="Wraith"><img alt="Wraith" src="/images/Wraith.png" /></a><span><span><a href="/wiki/Wraith" title="Wraith">Wraith</a></span></span></span></li>
        </ul>
      </div>
    </div>
  </div>
  <h2><span class="mw-headline" id="Notes">Notes</span></h2>
`;

test('parseBuffPageImmunityFacts extracts ordered immune NPC entries from the rendered immunities section', () => {
  const facts = parseBuffPageImmunityFacts({
    buffId: 39,
    buffName: 'Cursed Inferno',
    pageTitle: 'Cursed Inferno',
    html: cursedInfernoFixtureHtml,
    sampleLimit: 3
  });

  assert.equal(facts.immuneNpcCount, 5);
  assert.equal(facts.immuneNpcSource, 'buff-page-immunities');
  assert.equal(
    facts.immuneNpcSampleSemantics,
    'first 3 entries from the rendered buff page immunities list; immuneNpcCount is the full rendered list size'
  );
  assert.deepEqual(
    facts.immuneNpcSample.map((entry) => ({
      name: entry.name,
      pageTitle: entry.pageTitle,
      sourceOrder: entry.sourceOrder
    })),
    [
      { name: 'Dungeon Guardian', pageTitle: 'Dungeon Guardian', sourceOrder: 1 },
      { name: 'Martian Saucer', pageTitle: 'Martian Saucer', sourceOrder: 2 },
      { name: 'Clinger', pageTitle: 'Clinger', sourceOrder: 3 }
    ]
  );
});

test('applyBuffPageImmunityFacts prefers page facts over incomplete npcinfo-module fallback', () => {
  const immuneNpcCountByBuffId = new Map([[39, 5]]);
  const immuneNpcSampleByBuffId = new Map([
    [39, [
      { npcId: 85, name: 'Spike Ball', internalName: 'SpikeBall' },
      { npcId: 101, name: 'Clinger', internalName: 'Clinger' }
    ]]
  ]);

  const pageFacts = new Map([
    [39, parseBuffPageImmunityFacts({
      buffId: 39,
      buffName: 'Cursed Inferno',
      pageTitle: 'Cursed Inferno',
      html: cursedInfernoFixtureHtml,
      sampleLimit: 4
    })]
  ]);

  applyBuffPageImmunityFacts({
    immuneNpcCountByBuffId,
    immuneNpcSampleByBuffId,
    pageFacts
  });

  assert.equal(immuneNpcCountByBuffId.get(39), 5);
  assert.deepEqual(
    immuneNpcSampleByBuffId.get(39).map((entry) => entry.name),
    ['Dungeon Guardian', 'Martian Saucer', 'Clinger', 'Dungeon Spirit']
  );
});

test('parseBuffPageImmunityFacts ignores the table of contents Immune_NPCs link and reads the body section', () => {
  const html = `
    <h2 id="mw-toc-heading">Contents</h2>
    <ul>
      <li><a href="#Immune_NPCs"><span class="toctext">Immune NPCs</span></a></li>
    </ul>
    <h2><span class="mw-headline" id="Causes">Causes</span></h2>
    <p>Other page content.</p>
    <h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2>
    <div class="terraria mw-collapsible"><div class="heading">Enemies immune to Poisoned</div><div class="mw-collapsible-content"><div class="itemlist"><ul>
      <li><span class="i"><a href="/wiki/Ancient_Vision" title="Ancient Vision"><img alt="Ancient Vision" /></a><span><span><a href="/wiki/Ancient_Vision" title="Ancient Vision">Ancient Vision</a></span></span></span></li>
      <li><span class="i"><a href="/wiki/Poisonous_Spore" title="Poisonous Spore"><img alt="Poisonous Spore" /></a><span><span><a href="/wiki/Poisonous_Spore" title="Poisonous Spore">Poisonous Spore</a></span></span></span></li>
    </ul></div></div></div>
    <h2><span class="mw-headline" id="History">History</span></h2>
  `;

  const facts = parseBuffPageImmunityFacts({
    buffId: 20,
    buffName: 'Poisoned',
    pageTitle: 'Poisoned',
    html
  });

  assert.equal(facts.immuneNpcCount, 2);
  assert.deepEqual(
    facts.immuneNpcSample.map((entry) => entry.name),
    ['Ancient Vision', 'Poisonous Spore']
  );
});

test('parseBuffPageImmunityFacts matches the Immune_NPCs heading regardless of class order and keeps duplicate page titles', () => {
  const html = `
    <h2><span id="Immune_NPCs" class="foo bar mw-headline baz">Immune NPCs</span></h2>
    <div class="mw-collapsible terraria"><div class="mw-collapsible-content"><div class="itemlist"><ul>
      <li><span class="i"><a href="/wiki/Dungeon_Guardian" title="Dungeon Guardian"><img alt="Dungeon Guardian" /></a><span><span><a href="/wiki/Dungeon_Guardian" title="Dungeon Guardian">Dungeon Guardian</a></span></span></span></li>
      <li><span class="i"><a href="/wiki/Dungeon_Guardian" title="Dungeon Guardian"><img alt="Dungeon Guardian" /></a><span><span><a href="/wiki/Dungeon_Guardian" title="Dungeon Guardian">Dungeon Guardian</a></span><a href="/wiki/Version_history" title="Version history">(Desktop, Console and Mobile versions)</a></span></span></li>
    </ul></div></div></div>
    <h2><span class="mw-headline" id="Notes">Notes</span></h2>
  `;

  const facts = parseBuffPageImmunityFacts({
    buffId: 39,
    buffName: 'Cursed Inferno',
    pageTitle: 'Cursed Inferno',
    html
  });

  assert.equal(facts.immuneNpcCount, 2);
  assert.deepEqual(
    facts.immuneNpcSample.map((entry) => ({
      name: entry.name,
      pageTitle: entry.pageTitle
    })),
    [
      { name: 'Dungeon Guardian', pageTitle: 'Dungeon Guardian' },
      { name: 'Dungeon Guardian', pageTitle: 'Dungeon Guardian' }
    ]
  );
});

test('parseBuffPageEvidence captures Causes and Immune NPCs for zh Cursed Inferno', () => {
  const html = fs.readFileSync(new URL('./fixtures/zh-cursed-inferno.buff-page.html', import.meta.url), 'utf8');
  const wikitext = fs.readFileSync(new URL('./fixtures/zh-cursed-inferno.buff-page.wikitext', import.meta.url), 'utf8');

  const evidence = parseBuffPageEvidence({
    pageTitle: '诅咒狱火',
    sections: [
      { index: '1', line: '原因', anchor: '原因' },
      { index: '2', line: '来自玩家', anchor: '来自玩家' },
      { index: '3', line: '来自敌怪', anchor: '来自敌怪' },
      { index: '4', line: '免疫的 NPC', anchor: '免疫的_NPC' }
    ],
    html,
    wikitext
  });

  assert.equal(evidence.sourceItems.length, 7);
  assert.equal(evidence.inflictingNpcs.length, 3);
  assert.ok(evidence.immuneNpcs.length >= 25);
  assert.deepEqual(
    evidence.sourceItems.slice(0, 2).map((row) => row.name),
    ['诅咒箭', '诅咒弹']
  );
  assert.deepEqual(
    evidence.inflictingNpcs.map((row) => row.name),
    ['爬藤怪', '腐恶食尸鬼', '魔焰眼']
  );
  assert.equal(evidence.sourceEvidence.parseStatus, 'parsed');
});

test('parseBuffPageEvidence reports missing and empty sections instead of treating empty arrays as success', () => {
  const evidence = parseBuffPageEvidence({
    pageTitle: 'Empty Buff',
    sections: [
      { index: '1', line: 'Causes', anchor: 'Causes' },
      { index: '2', line: 'From player', anchor: 'From_player' },
      { index: '3', line: 'Immune NPCs', anchor: 'Immune_NPCs' }
    ],
    html: `
      <h2><span class="mw-headline" id="Causes">Causes</span></h2>
      <h3><span class="mw-headline" id="From_player">From player</span></h3>
      <p>No source rows on this page.</p>
      <h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2>
      <p>No immune rows on this page.</p>
    `
  });

  assert.equal(evidence.sourceEvidence.parseStatus, 'parse_incomplete');
  assert.deepEqual(
    evidence.sourceEvidence.unresolvedFacts.map((fact) => [fact.group, fact.status]),
    [
      ['sourceItems', 'no_rows'],
      ['immuneNpcs', 'no_rows']
    ]
  );
  assert.equal(evidence.sourceEvidence.factGroups.inflictingNpcs.status, 'section_missing');
});

test('parseBuffPageEvidence treats absent optional cause subsections as parsed when other evidence is complete', () => {
  const evidence = parseBuffPageEvidence({
    pageTitle: 'Hellfire',
    sections: [
      { line: 'Causes', anchor: 'Causes' },
      { line: 'From player', anchor: 'From_player' },
      { line: 'From environment', anchor: 'From_environment' },
      { line: 'Immune NPCs', anchor: 'Immune_NPCs' }
    ],
    html: `
      <h2><span class="mw-headline" id="Causes">Causes</span></h2>
      <h3><span class="mw-headline" id="From_player">From player</span></h3>
      <table><tr><td><a href="/wiki/Flamethrower" title="Flamethrower">Flamethrower</a></td></tr></table>
      <h3><span class="mw-headline" id="From_environment">From environment</span></h3>
      <ul><li><a href="/wiki/Lava" title="Lava">Lava</a></li></ul>
      <h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2>
      <ul><li><a href="/wiki/Meteor_Head" title="Meteor Head">Meteor Head</a></li></ul>
    `
  });

  assert.equal(evidence.sourceEvidence.parseStatus, 'parsed');
  assert.deepEqual(evidence.sourceEvidence.unresolvedFacts, []);
  assert.equal(evidence.sourceEvidence.factGroups.inflictingNpcs.status, 'section_missing');
  assert.deepEqual(evidence.sourceItems.map((entry) => [entry.name, entry.sourceKind]), [
    ['Flamethrower', 'player'],
    ['Lava', 'environment']
  ]);
  assert.deepEqual(evidence.inflictingNpcs, []);
  assert.deepEqual(evidence.immuneNpcs.map((entry) => entry.name), ['Meteor Head']);
});

test('parseBuffPageEvidence recognizes English and zh cause subheadings including environment', () => {
  const evidence = parseBuffPageEvidence({
    pageTitle: 'Poisoned',
    sections: [
      { line: 'Causes', anchor: 'Causes' },
      { line: 'From player', anchor: 'From_player' },
      { line: 'From enemy', anchor: 'From_enemy' },
      { line: 'From environment', anchor: 'From_environment' },
      { line: 'Immune NPCs', anchor: 'Immune_NPCs' }
    ],
    html: `
      <h2><span class="mw-headline" id="Causes">Causes</span></h2>
      <h3><span class="mw-headline" id="From_player">From player</span></h3>
      <table><tr><td><a href="/wiki/Poisoned_Knife" title="Poisoned Knife">Poisoned Knife</a></td></tr></table>
      <h3><span class="mw-headline" id="From_enemy">From enemy</span></h3>
      <table><tr><td><a href="/wiki/Hornet" title="Hornet">Hornet</a></td></tr></table>
      <h3><span class="mw-headline" id="From_environment">From environment</span></h3>
      <ul><li><a href="/wiki/Poison_Dart_Trap" title="Poison Dart Trap">Poison Dart Trap</a></li></ul>
      <h2><span class="mw-headline" id="Immune_NPCs">Immune NPCs</span></h2>
      <ul><li><a href="/wiki/Blue_Slime" title="Blue Slime">Blue Slime</a></li></ul>
    `
  });

  assert.deepEqual(evidence.sourceItems.map((entry) => [entry.name, entry.sourceKind]), [
    ['Poisoned Knife', 'player'],
    ['Poison Dart Trap', 'environment']
  ]);
  assert.deepEqual(evidence.inflictingNpcs.map((entry) => entry.name), ['Hornet']);
  assert.deepEqual(evidence.immuneNpcs.map((entry) => entry.name), ['Blue Slime']);
  assert.equal(evidence.sourceEvidence.parseStatus, 'parsed');
});
