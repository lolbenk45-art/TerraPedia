import { createHash } from 'node:crypto';

export const scopes = [
  '[[bows]], [[repeaters]], [[arrows]], and [[Stake]]s',
  '[[guns]], [[bullets]], and [[Candy Corn]]',
  'specialist ranged weapons (non-consumable ranged weapons that are not bows or guns) and their ammunition',
];
export const conditions = [
  'bows, repeaters, arrows, and Stakes',
  'guns, bullets, and Candy Corn',
  scopes[2],
];
export const names = ['Headgear', 'Mask', 'Helmet'];
export const note = "The ×1.12 damage boost to the specific ammunition type is applied ''after'' applying damage increases from the rest of the armor set, [[accessories]], and [[buffs]].";
export const attribution = 'As a result, Shroomite headpieces provide a larger damage bonus than their [[tooltips]] would suggest.';
export const history = '{{history|Desktop 1.4.5.0|\n** Each piece of Shroomite headgear now applies its damage bonus to ammo as well as weapons.\n** Each piece of Shroomite headgear damage bonus has been reduced from 15% to 12%.}}';
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function artifact(pageTitle, pageId, revisionId, wikitext) {
  const metadata = { pageTitle, pageId, revisionId, revisionTimestamp: '2026-09-02T13:55:25Z' };
  const bytes = Buffer.from(JSON.stringify({ ...metadata, apiUrl: 'https://terraria.wiki.gg/api.php', fetchedAt: '2026-09-29T14:35:36Z', wikitext }));
  return { bytes, expected: { ...metadata, sha256: hash(bytes) } };
}

export function fixture() {
  const pageText = `The full set grants the following effects while equipped:\n<tabber>\n${names.map((name, i) => `|-|With ${name}=\n* +13% [[ranged damage]]\n* ×1.12<ref name="multiplicative-increase"/> damage of ${scopes[i]}`).join('\n')}\n</tabber>\n* +25% ranged [[critical strike chance]]\n* +20% [[ammo conservation]]\n* +12% [[movement speed]]\n*** +50% ranged damage\n== Set ==\n== Notes ==\n* ${note} ${attribution}\n* Specialist weapon scope.{{source code ref|v=1.4.5.8|method=Terraria.Player.GetWeaponDamage}}\n== Tips ==\n== History ==\n${history}\n== References ==`;
  const items = Object.fromEntries(names.map((name, i) => [1546 + i, {
    internalName: `Shroomite${name}`, name: `Shroomite ${name}`, headSlot: 103 + i,
  }]));
  items[1549] = { internalName: 'ShroomiteBreastplate', name: 'Shroomite Breastplate', bodySlot: 67 };
  items[1550] = { internalName: 'ShroomiteLeggings', name: 'Shroomite Leggings', legSlot: 56 };
  return {
    targetGameVersion: '1.4.5.8',
    page: artifact('Shroomite armor', 4771, 1027106, pageText),
    iteminfo: artifact('Module:Iteminfo/data', 18021, 1023241, `["data"] = [==[${JSON.stringify(items)}]==]`),
    armorSets: artifact('Module:ArmorSetBonuses', 72704, 964993,
      'ArmorSetBonuses.Create(ArmorSetBonuses.Benefits.Shroomite, "ArmorSetBonus.Shroomite"):Set(1548, 1549, 1550):Set(1546, 1549, 1550):Set(1547, 1549, 1550)\n:Add();'),
  };
}

export function change(source, mutate) {
  const raw = JSON.parse(source.bytes);
  mutate(raw);
  source.bytes = Buffer.from(JSON.stringify(raw));
  source.expected.sha256 = hash(source.bytes);
}

