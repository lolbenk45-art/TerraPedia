import test from 'node:test';
import assert from 'node:assert/strict';

import { parseWikiArmorSetRows } from './fetch-wiki-armor-sets.mjs';

const fixtureWikitext = `
== Armor sets ==
{{/count}}

== [[{{tr|Pre-Hardmode}}]] ==
{| class="terraria lined sortable"
|-
! Appearance
! Set
|-
| [[File:Wood armor.png|link=]] [[File:Wood armor female.png|link=]]
| {{item|mode=text|wrap=y|Wood armor}}
| style="text-align:center" | 1
| class="small" |
* '''{{tr|Set Bonus}}:'''+1 {{tr|defense}}
| class="small" |
* 75 {{item|Wood}}
|}

== [[{{tr|Hardmode}}]] ==
{| class="terraria lined sortable"
|-
! Appearance
! Set
|-
| [[File:Hallowed armor.png|link=]]
[[File:Hallowed armor female.png|link=]]
| {{item|mode=text|wrap=y|Hallowed armor}}
| style="text-align:center" | 1
| class="small" |
* Each piece can be interchanged with [[{{tr|Ancient Hallowed armor}}]] pieces
* '''{{tr|Set Bonus}}:''' [[{{tr|Holy Protection}}]]
| class="small" |
* 54 {{item|Hallowed Bar}}
|}

=== [[{{tr|Wizard set}}]] ===
{| class="terraria lined"
|-
| [[File:Magic Hat (equipped).png|link=]]
| {{item|mode=text|wrap=y|Magic Hat}}
|}

== 其他盔甲 ==
{| class="terraria lined"
|-
| [[File:Night Vision Helmet.png|link=]]
| [[{{tr|Night Vision Helmet}}]]
|}

== 成就 ==
`;

const fixtureHtml = `
<h3>困难模式之前</h3>
<table><tbody>
<tr><th>Appearance</th><th>Set</th></tr>
<tr>
  <td><img alt="Wood armor.png" src="https://terraria.wiki.gg/images/Wood_armor.png?x" /><img alt="Wood armor female.png" src="https://terraria.wiki.gg/images/Wood_armor_female.png?x" /></td>
  <td><span><a title="木盔甲">木盔甲</a></span></td>
  <td>1</td><td>1</td><td>0</td><td>3</td>
  <td class="small"><ul><li><b>套装奖励：</b>+1 防御</li></ul></td>
  <td>75 木材</td>
</tr>
</tbody></table>
<h3>困难模式</h3>
<table><tbody>
<tr><th>Appearance</th><th>Set</th></tr>
<tr>
  <td><img alt="Hallowed armor.png" src="https://terraria.wiki.gg/images/Hallowed_armor.png?x" /><img alt="Hallowed armor female.png" src="https://terraria.wiki.gg/images/Hallowed_armor_female.png?x" /></td>
  <td><span><a title="神圣盔甲">神圣盔甲</a></span></td>
  <td>1</td><td>15</td><td>11</td><td>27</td>
  <td class="small"><ul><li>每个部件都可以和远古神圣盔甲的部件互换</li><li><b>套装奖励：</b>神圣保护</li></ul></td>
  <td>54 神圣锭</td>
</tr>
</tbody></table>
<h3>巫师套装</h3>
<table><tbody>
<tr><td><img alt="Magic Hat (equipped).png" src="https://terraria.wiki.gg/images/Magic_Hat_%28equipped%29.png" /></td><td><a title="魔法帽">魔法帽</a></td></tr>
</tbody></table>
<h3>Other armor</h3>
<table><tbody>
<tr><td><img alt="Night Vision Helmet.png" src="https://terraria.wiki.gg/images/Night_Vision_Helmet.png" /></td><td><a title="Night Vision Helmet">Night Vision Helmet</a></td></tr>
</tbody></table>
`;

test('parseWikiArmorSetRows treats traditional, single-piece, and nonstandard armor rows as armor sets', () => {
  const actual = parseWikiArmorSetRows({
    wikitext: fixtureWikitext,
    html: fixtureHtml,
    sourceRevisionTimestamp: '2026-04-28T00:00:00Z'
  });

  assert.deepEqual(
    actual.map((row) => [row.pageTitle, row.entityType, row.compositionKind]),
    [
      ['Wood armor', 'armor_set', 'traditional_set'],
      ['Hallowed armor', 'armor_set', 'traditional_set'],
      ['Magic Hat', 'armor_set', 'single_piece_set'],
      ['Night Vision Helmet', 'armor_set', 'nonstandard_piece_set']
    ]
  );
  assert.equal(actual[0].nameZh, '木盔甲');
  assert.equal(actual[0].images[0].role, 'male');
  assert.equal(actual[0].images[0].url, 'https://terraria.wiki.gg/images/Wood_armor.png?x');
  assert.equal(actual[1].nameZh, '神圣盔甲');
  assert.deepEqual(actual[1].interchangeableSetTitles, ['Ancient Hallowed armor']);
  assert.match(actual[1].effectText, /套装奖励/);
  assert.equal(actual[2].images[0].fileTitle, 'Magic Hat (equipped).png');
  assert.equal(actual[3].nameZh, 'Night Vision Helmet');
});
