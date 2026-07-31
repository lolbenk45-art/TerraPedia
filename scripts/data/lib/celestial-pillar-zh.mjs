// The English wiki gives each Celestial Pillar its own page; the Chinese wiki
// merges all four into one 天界柱 page with a section per pillar. None of the
// four English pages therefore carries a zh langlink, so the usual langlink
// lookup returns nothing for them and every zh value has to come from here.
//
// Both the boss fetch and the zh description backfill need this mapping. It
// lives in one place so the two cannot drift apart.

export const CELESTIAL_PILLAR_SHARED_ZH_PAGE = '天界柱';

const CELESTIAL_PILLARS = [
  { code: 'SOLAR_PILLAR', titleEn: 'Solar Pillar', nameZh: '日耀柱' },
  { code: 'NEBULA_PILLAR', titleEn: 'Nebula Pillar', nameZh: '星云柱' },
  { code: 'VORTEX_PILLAR', titleEn: 'Vortex Pillar', nameZh: '星旋柱' },
  { code: 'STARDUST_PILLAR', titleEn: 'Stardust Pillar', nameZh: '星尘柱' },
];

const NAME_ZH_BY_CODE = new Map(CELESTIAL_PILLARS.map((pillar) => [pillar.code, pillar.nameZh]));
const NAME_ZH_BY_TITLE_EN = new Map(CELESTIAL_PILLARS.map((pillar) => [pillar.titleEn, pillar.nameZh]));

export const CELESTIAL_PILLAR_CODES = new Set(NAME_ZH_BY_CODE.keys());

export function resolveCelestialPillarNameZhByCode(code) {
  return NAME_ZH_BY_CODE.get(String(code ?? '').trim()) ?? null;
}

export function resolveCelestialPillarNameZhByEnglishTitle(titleEn) {
  return NAME_ZH_BY_TITLE_EN.get(String(titleEn ?? '').trim()) ?? null;
}
