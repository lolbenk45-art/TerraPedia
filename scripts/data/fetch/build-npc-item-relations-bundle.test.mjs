import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNpcItemRelationsBundle } from './build-npc-item-relations-bundle.mjs';

test('buildNpcItemRelationsBundle emits variant-specific loot rows with exact source metadata', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-09T00:00:00.000Z',
    standardizedPayload: {
      records: [
        {
          id: 473,
          internalName: 'BigMimicCorruption',
          name: 'Corrupt Mimic',
          wikiCrawler: {
            pageTitle: 'Corrupt Mimic',
            loot: [
              {
                itemName: 'Dart Rifle',
                chanceText: '20%',
                quantityText: '1',
              },
            ],
          },
        },
      ],
    },
  });

  assert.equal(bundle.records.length, 1);
  assert.equal(bundle.records[0].relationType, 'loot');
  assert.equal(bundle.records[0].npcInternalName, 'BigMimicCorruption');
  assert.equal(bundle.records[0].sourceRefInternalName, 'BigMimicCorruption');
  assert.equal(bundle.records[0].sourceRefResolution, 'exact_internal_name');
  assert.equal(bundle.records[0].sourceSection, 'drops');
  assert.equal(bundle.records[0].raw.sourceRefInternalName, 'BigMimicCorruption');
  assert.equal(bundle.records[0].raw.sourceRefResolution, 'exact_internal_name');
});

test('buildNpcItemRelationsBundle preserves bridge-provided exact Mimic variant metadata', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-09T00:00:00.000Z',
    standardizedPayload: {
      records: [
        {
          id: 473,
          internalName: 'BigMimicCrimson',
          name: 'Crimson Mimic',
          wikiCrawler: {
            pageTitle: 'Mimics',
            sourceMetadata: {
              apiUrl: 'https://terraria.wiki.gg/api.php'
            },
            loot: [
              {
                itemName: 'Life Drain',
                chanceText: '20%',
                quantityText: '1',
                sourceRefInternalName: 'BigMimicCrimson',
                sourceRefResolution: 'exact_internal_name',
                sourceSection: 'drops',
                sourceInfobox: { autoId: '473', image: 'Crimson Mimic.gif', name: 'Crimson Mimic' },
                raw: {
                  itemName: 'Life Drain',
                  sourceInfobox: { autoId: '473', image: 'Crimson Mimic.gif', name: 'Crimson Mimic' }
                }
              }
            ],
          },
        },
      ],
    },
  });

  assert.equal(bundle.records.length, 1);
  assert.equal(bundle.records[0].npcInternalName, 'BigMimicCrimson');
  assert.equal(bundle.records[0].sourceRefInternalName, 'BigMimicCrimson');
  assert.equal(bundle.records[0].sourceRefResolution, 'exact_internal_name');
  assert.equal(bundle.records[0].sourceUrl, 'https://terraria.wiki.gg/wiki/Mimics');
  assert.equal(bundle.records[0].raw.sourceRefInternalName, 'BigMimicCrimson');
  assert.equal(bundle.records[0].raw.sourceRefResolution, 'exact_internal_name');
  assert.deepEqual(bundle.records[0].raw.sourceInfobox, { autoId: '473', image: 'Crimson Mimic.gif', name: 'Crimson Mimic' });
});

test('buildNpcItemRelationsBundle dedupes duplicate generated loot rows by logical source identity', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-11T00:00:00.000Z',
    standardizedPayload: {
      records: [
        {
          id: 629,
          internalName: 'IceMimic',
          name: 'Ice Mimic',
          wikiCrawler: {
            pageTitle: 'Mimics',
            loot: [
              {
                itemName: 'Toy Sled',
                chanceText: '5%',
                quantityText: '1',
                sourceRowIndex: 6
              },
              {
                itemName: 'Toy Sled',
                chanceText: '5%',
                quantityText: '1',
                sourceRowIndex: 20
              },
              {
                itemName: 'Toy Sled',
                chanceText: '10%',
                quantityText: '1',
                sourceRowIndex: 21
              }
            ]
          }
        }
      ]
    }
  });

  assert.equal(bundle.records.length, 2);
  assert.deepEqual(bundle.records.map((record) => record.sourceRowIndex), [6, 21]);
  assert.deepEqual(bundle.records.map((record) => record.chanceText), ['5%', '10%']);
});

test('buildNpcItemRelationsBundle ignores parser group marker rows in crawler loot', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-12T00:00:00.000Z',
    standardizedPayload: {
      records: [
        {
          id: 470,
          internalName: 'CrimsonPenguin',
          name: 'Vicious Penguin',
          flags: { boss: false },
          wikiCrawler: {
            pageTitle: 'Vicious Penguin',
            loot: [
              {
                itemName: ':group:start',
                chanceText: '------',
                quantityText: 'Only 1 can drop',
                sourceRowIndex: 0
              },
              {
                itemName: "Pedguin's Hood",
                chanceText: '0.67%',
                quantityText: '1',
                sourceRowIndex: 1
              },
              {
                itemName: ':group:end',
                chanceText: '------',
                quantityText: '--------------',
                sourceRowIndex: 4
              }
            ]
          }
        }
      ]
    }
  });

  assert.equal(bundle.records.length, 1);
  assert.equal(bundle.records[0].itemName, "Pedguin's Hood");
  assert.equal(bundle.records[0].sourceRowIndex, 1);
});

test('buildNpcItemRelationsBundle canonicalizes reviewed wiki item disambiguator labels', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-12T00:00:00.000Z',
    baselineBundle: {
      records: [
        {
          recordKey: 'npc-item:sand-shark:loot:shark-fin-sand-shark:1',
          relationType: 'loot',
          npcInternalName: 'SandShark',
          npcName: 'Sand Shark',
          itemName: 'Shark Fin (Sand Shark)',
          sourceRefInternalName: 'SandShark',
          chanceText: '12.5%',
          quantityText: null,
          conditionText: null,
          sourceSection: 'drops'
        },
        {
          recordKey: 'npc-item:sandshark-corrupt:loot:shark-fin-bone-biter:4',
          relationType: 'loot',
          npcInternalName: 'SandsharkCorrupt',
          npcName: 'Bone Biter',
          itemName: 'Shark Fin (Bone Biter)',
          sourceRefInternalName: 'SandsharkCorrupt',
          chanceText: '12.5%',
          quantityText: null,
          conditionText: null,
          sourceSection: 'drops'
        },
        {
          recordKey: 'npc-item:sandshark-crimson:loot:shark-fin-flesh-reaver:8',
          relationType: 'loot',
          npcInternalName: 'SandsharkCrimson',
          npcName: 'Flesh Reaver',
          itemName: 'Shark Fin (Flesh Reaver)',
          sourceRefInternalName: 'SandsharkCrimson',
          chanceText: '12.5%',
          quantityText: null,
          conditionText: null,
          sourceSection: 'drops'
        },
        {
          recordKey: 'npc-item:sandshark-hallow:loot:shark-fin-crystal-thresher:12',
          relationType: 'loot',
          npcInternalName: 'SandsharkHallow',
          npcName: 'Crystal Thresher',
          itemName: 'Shark Fin (Crystal Thresher)',
          sourceRefInternalName: 'SandsharkHallow',
          chanceText: '12.5%',
          quantityText: null,
          conditionText: null,
          sourceSection: 'drops'
        },
        {
          recordKey: 'npc-item:scutlix-rider:loot:brain-scrambler-item:7',
          relationType: 'loot',
          npcInternalName: 'ScutlixRider',
          npcName: 'Scutlix Gunner',
          itemName: 'Brain Scrambler (item)',
          sourceRefInternalName: 'ScutlixRider',
          chanceText: '3.33%',
          quantityText: '1',
          conditionText: null,
          sourceSection: 'drops'
        }
      ],
      backfillCandidates: []
    },
    standardizedPayload: {
      records: [
        {
          id: 542,
          internalName: 'SandShark',
          name: 'Sand Shark',
          flags: { boss: false },
          wikiCrawler: {
            pageTitle: 'Sand Sharks',
            loot: [
              {
                itemName: 'Shark Fin (Sand Shark)',
                chanceText: '12.5%',
                quantityText: null,
                sourceRowIndex: 1,
                sourceRefInternalName: 'SandShark',
                sourceRefResolution: 'exact_internal_name',
                raw: { itemName: 'Shark Fin (Sand Shark)' }
              }
            ]
          }
        },
        {
          id: 543,
          internalName: 'SandsharkCorrupt',
          name: 'Bone Biter',
          flags: { boss: false },
          wikiCrawler: {
            pageTitle: 'Sand Sharks',
            loot: [
              {
                itemName: 'Shark Fin (Bone Biter)',
                chanceText: '12.5%',
                quantityText: null,
                sourceRowIndex: 4,
                sourceRefInternalName: 'SandsharkCorrupt',
                sourceRefResolution: 'exact_internal_name',
                raw: { itemName: 'Shark Fin (Bone Biter)' }
              }
            ]
          }
        },
        {
          id: 544,
          internalName: 'SandsharkCrimson',
          name: 'Flesh Reaver',
          flags: { boss: false },
          wikiCrawler: {
            pageTitle: 'Sand Sharks',
            loot: [
              {
                itemName: 'Shark Fin (Flesh Reaver)',
                chanceText: '12.5%',
                quantityText: null,
                sourceRowIndex: 8,
                sourceRefInternalName: 'SandsharkCrimson',
                sourceRefResolution: 'exact_internal_name',
                raw: { itemName: 'Shark Fin (Flesh Reaver)' }
              }
            ]
          }
        },
        {
          id: 545,
          internalName: 'SandsharkHallow',
          name: 'Crystal Thresher',
          flags: { boss: false },
          wikiCrawler: {
            pageTitle: 'Sand Sharks',
            loot: [
              {
                itemName: 'Shark Fin (Crystal Thresher)',
                chanceText: '12.5%',
                quantityText: null,
                sourceRowIndex: 12,
                sourceRefInternalName: 'SandsharkHallow',
                sourceRefResolution: 'exact_internal_name',
                raw: { itemName: 'Shark Fin (Crystal Thresher)' }
              }
            ]
          }
        },
        {
          id: 390,
          internalName: 'ScutlixRider',
          name: 'Scutlix Gunner',
          flags: { boss: false },
          wikiCrawler: {
            pageTitle: 'Scutlix',
            loot: [
              {
                itemName: 'Brain Scrambler (item)',
                chanceText: '3.33%',
                quantityText: '1',
                sourceRowIndex: 7,
                sourceRefInternalName: 'ScutlixRider',
                sourceRefResolution: 'exact_internal_name',
                raw: { itemName: 'Brain Scrambler (item)' }
              }
            ]
          }
        }
      ]
    }
  });

  assert.deepEqual(
    bundle.records.map((record) => [record.npcInternalName, record.itemName, record.recordKey]),
    [
      ['SandShark', 'Shark Fin', 'npc-item:sand-shark:loot:shark-fin:1'],
      ['SandsharkCorrupt', 'Shark Fin', 'npc-item:sandshark-corrupt:loot:shark-fin:4'],
      ['SandsharkCrimson', 'Shark Fin', 'npc-item:sandshark-crimson:loot:shark-fin:8'],
      ['SandsharkHallow', 'Shark Fin', 'npc-item:sandshark-hallow:loot:shark-fin:12'],
      ['ScutlixRider', 'Brain Scrambler', 'npc-item:scutlix-rider:loot:brain-scrambler:7']
    ]
  );
  assert.deepEqual(bundle.records.map((record) => record.raw.itemName), [
    'Shark Fin (Sand Shark)',
    'Shark Fin (Bone Biter)',
    'Shark Fin (Flesh Reaver)',
    'Shark Fin (Crystal Thresher)',
    'Brain Scrambler (item)'
  ]);
});

test('buildNpcItemRelationsBundle leaves unreviewed parenthetical item labels unchanged', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-12T00:00:00.000Z',
    standardizedPayload: {
      records: [
        {
          id: 999,
          internalName: 'ExampleEnemy',
          name: 'Example Enemy',
          flags: { boss: false },
          wikiCrawler: {
            pageTitle: 'Example Enemy',
            loot: [
              {
                itemName: 'Example Relic (Variant)',
                chanceText: '10%',
                quantityText: '1',
                sourceRowIndex: 0
              }
            ]
          }
        }
      ]
    }
  });

  assert.equal(bundle.records.length, 1);
  assert.equal(bundle.records[0].itemName, 'Example Relic (Variant)');
  assert.equal(bundle.records[0].recordKey, 'npc-item:example-enemy:loot:example-relic-variant:0');
});

test('buildNpcItemRelationsBundle does not fan out generic Mimics loot to variants', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-09T00:00:00.000Z',
    standardizedPayload: {
      records: [
        {
          id: 85,
          internalName: 'Mimic',
          name: 'Mimics',
          wikiCrawler: {
            pageTitle: 'Mimics',
            loot: [
              {
                itemName: 'Titan Glove',
                chanceText: '14.29%',
              },
            ],
          },
        },
        {
          id: 473,
          internalName: 'BigMimicCorruption',
          name: 'Corrupt Mimic',
          wikiCrawler: {},
        },
      ],
    },
  });

  assert.equal(bundle.records.length, 1);
  assert.equal(bundle.records[0].npcInternalName, 'Mimic');
  assert.equal(bundle.records[0].sourceRefName, 'Mimics');
  assert.equal(bundle.records[0].sourceRefInternalName, 'Mimic');
  assert.equal(bundle.records[0].sourceRefResolution, 'reviewed_mimic_contract');
  assert.equal(bundle.records.some((record) => record.npcInternalName === 'BigMimicCorruption'), false);
});

test('buildNpcItemRelationsBundle keeps only reviewed default ordinary Mimic loot rows', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-12T00:00:00.000Z',
    standardizedPayload: {
      records: [
        {
          id: 85,
          internalName: 'Mimic',
          name: 'Mimic',
          wikiCrawler: {
            pageTitle: 'Mimics',
            loot: [
              { itemName: 'Dual Hook', chanceText: '16.67%', quantityText: '1', sourceRowIndex: 0 },
              { itemName: 'Magic Dagger', chanceText: '16.67%', quantityText: '1', sourceRowIndex: 1 },
              { itemName: 'Mace', chanceText: '16.67%', quantityText: '1', sourceRowIndex: 17 },
              { itemName: 'Magic Mirror', chanceText: '16.67%', quantityText: '1', sourceRowIndex: 18 },
            ],
          },
        },
      ],
    },
  });

  assert.deepEqual(bundle.records.map((record) => record.itemName), ['Dual Hook', 'Magic Dagger']);
  assert.ok(bundle.records.every((record) => record.sourceRefName === 'Mimics'));
  assert.ok(bundle.records.every((record) => record.sourceRefInternalName === 'Mimic'));
  assert.ok(bundle.records.every((record) => record.sourceRefResolution === 'reviewed_mimic_contract'));
});

test('buildNpcItemRelationsBundle normalizes stale baseline ordinary Mimic rows when current bridge has no loot payload', () => {
  const defaultItems = [
    'Dual Hook',
    'Magic Dagger',
    "Philosopher's Stone",
    'Titan Glove',
    'Star Cloak',
    'Cross Necklace'
  ];
  const rejectedItems = ['Mace', 'Magic Mirror'];
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-12T01:30:00.000Z',
    baselineBundle: {
      schemaVersion: 1,
      source: 'wiki-crawler:npc',
      records: [...defaultItems, ...rejectedItems].map((itemName, index) => ({
        recordKey: `npc-item:mimic:loot:${itemName.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`,
        relationType: 'loot',
        npcInternalName: 'Mimic',
        npcName: 'Mimic',
        itemName,
        sourceRefInternalName: 'Mimic',
        sourceRefResolution: 'exact_internal_name',
        chanceText: '16.67%',
        quantityText: '1',
        sourceUrl: 'https://terraria.wiki.gg/wiki/Mimics',
        sourceSection: 'drops',
        sourceRowIndex: index,
        raw: {
          itemName,
          sourceRefInternalName: 'Mimic',
          sourceRefResolution: 'exact_internal_name',
          sourceInfobox: { autoId: '85', image: '', name: '' }
        }
      }))
    },
    standardizedPayload: {
      records: [
        {
          id: 85,
          internalName: 'Mimic',
          name: 'Mimic'
        }
      ]
    }
  });

  assert.deepEqual(bundle.records.map((record) => record.itemName), defaultItems);
  assert.equal(bundle.records.some((record) => rejectedItems.includes(record.itemName)), false);
  assert.ok(bundle.records.every((record) => record.sourceRefName === 'Mimics'));
  assert.ok(bundle.records.every((record) => record.sourceRefInternalName === 'Mimic'));
  assert.ok(bundle.records.every((record) => record.sourceRefResolution === 'reviewed_mimic_contract'));
  assert.ok(bundle.records.every((record) => record.raw.sourceRefName === 'Mimics'));
  assert.ok(bundle.records.every((record) => record.raw.sourceRefResolution === 'reviewed_mimic_contract'));
});

test('buildNpcItemRelationsBundle does not treat ordinary Mimic autoId alone as Mimics group-page evidence', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-12T01:40:00.000Z',
    baselineBundle: {
      records: [
        {
          recordKey: 'npc-item:mimic:loot:mace',
          relationType: 'loot',
          npcInternalName: 'Mimic',
          npcName: 'Mimic',
          itemName: 'Mace',
          sourceRefInternalName: 'Mimic',
          sourceRefResolution: 'exact_internal_name',
          sourceUrl: 'https://terraria.wiki.gg/wiki/Mimic',
          sourceSection: 'drops',
          raw: {
            itemName: 'Mace',
            sourceRefInternalName: 'Mimic',
            sourceRefResolution: 'exact_internal_name',
            sourceInfobox: { autoId: '85', image: '', name: '' }
          }
        }
      ]
    },
    standardizedPayload: {
      records: [
        {
          id: 85,
          internalName: 'Mimic',
          name: 'Mimic'
        }
      ]
    }
  });

  assert.equal(bundle.records.length, 1);
  assert.equal(bundle.records[0].itemName, 'Mace');
  assert.equal(bundle.records[0].sourceRefResolution, 'exact_internal_name');
});

test('buildNpcItemRelationsBundle does not rewrite baseline Mimic variant rows to ordinary Mimic contract rows', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-12T01:40:00.000Z',
    baselineBundle: {
      records: [
        {
          recordKey: 'npc-item:big-mimic-crimson:loot:life-drain',
          relationType: 'loot',
          npcInternalName: 'BigMimicCrimson',
          npcName: 'Crimson Mimic',
          itemName: 'Life Drain',
          sourceRefName: 'Mimics',
          sourceRefInternalName: 'BigMimicCrimson',
          sourceRefResolution: 'exact_internal_name',
          sourceUrl: 'https://terraria.wiki.gg/wiki/Mimics',
          sourceSection: 'drops'
        }
      ]
    },
    standardizedPayload: {
      records: [
        {
          id: 85,
          internalName: 'Mimic',
          name: 'Mimic'
        }
      ]
    }
  });

  assert.equal(bundle.records.length, 1);
  assert.equal(bundle.records[0].npcInternalName, 'BigMimicCrimson');
  assert.equal(bundle.records[0].sourceRefInternalName, 'BigMimicCrimson');
  assert.equal(bundle.records[0].sourceRefResolution, 'exact_internal_name');
});

test('buildNpcItemRelationsBundle materializes reviewed Scarecrow page-level shared loot to explicit variants', () => {
  const scarecrowLoot = [
    { itemName: 'Heart', chanceText: '25%', quantityText: '1', sourceRowIndex: 0 },
    { itemName: 'Scarecrow Hat', chanceText: '0.37%-3.33%', quantityText: '1', sourceRowIndex: 1 },
  ].map((row) => ({
    ...row,
    sourceSection: 'drops',
    sourceInfobox: { autoId: '305', image: 'Scarecrow 6.gif', name: '' },
    raw: {
      itemName: row.itemName,
      sourceInfobox: { autoId: '305', image: 'Scarecrow 6.gif', name: '' }
    }
  }));
  const records = Array.from({ length: 10 }, (_, index) => {
    const number = index + 1;
    return {
      id: 304 + number,
      internalName: `Scarecrow${number}`,
      name: 'Scarecrow',
      wikiCrawler: {
        pageTitle: 'Scarecrow',
        sourceMetadata: { apiUrl: 'https://terraria.wiki.gg/api.php' },
        reviewedSharedLoot: {
          evidenceSource: 'docs/audits/2026-05-12_npc-r42-scarecrow-page-shared-loot-review.md',
          targetInternalNames: [
            'Scarecrow1',
            'Scarecrow2',
            'Scarecrow3',
            'Scarecrow4',
            'Scarecrow5',
            'Scarecrow6',
            'Scarecrow7',
            'Scarecrow8',
            'Scarecrow9',
            'Scarecrow10',
          ],
        },
        loot: scarecrowLoot,
      },
    };
  });

  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-12T00:00:00.000Z',
    standardizedPayload: { records },
  });

  assert.equal(bundle.records.length, 20);
  assert.deepEqual(
    [...new Set(bundle.records.map((record) => record.npcInternalName))],
    [
      'Scarecrow1',
      'Scarecrow2',
      'Scarecrow3',
      'Scarecrow4',
      'Scarecrow5',
      'Scarecrow6',
      'Scarecrow7',
      'Scarecrow8',
      'Scarecrow9',
      'Scarecrow10',
    ]
  );
  assert.ok(bundle.records.every((record) => record.sourceRefName === 'Scarecrow'));
  assert.ok(bundle.records.every((record) => record.sourceRefInternalName === record.npcInternalName));
  assert.ok(bundle.records.every((record) => record.sourceRefResolution === 'reviewed_page_level_shared_loot'));
  assert.ok(bundle.records.every((record) => record.raw.reviewedSharedLootEvidenceSource === 'docs/audits/2026-05-12_npc-r42-scarecrow-page-shared-loot-review.md'));
});

test('buildNpcItemRelationsBundle materializes reviewed Zombie and Skeleton shared loot only to explicit representatives', () => {
  const evidenceSource = 'docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md';
  const reviewedTargets = [
    'BaldZombie',
    'FemaleZombie',
    'SwampZombie',
    'TwiggyZombie',
    'HeadacheSkeleton',
    'MisassembledSkeleton',
    'PantlessSkeleton',
  ];
  const standardizedPayload = {
    records: [
      ...reviewedTargets.map((internalName) => ({
        id: internalName.endsWith('Skeleton') ? 201 : 132,
        internalName,
        name: internalName.endsWith('Skeleton') ? 'Skeleton' : 'Zombie',
        wikiCrawler: {
          pageTitle: internalName.endsWith('Skeleton') ? 'Skeleton' : 'Zombie',
          sourceMetadata: { apiUrl: 'https://terraria.wiki.gg/api.php' },
          reviewedSharedLoot: {
            evidenceSource,
            targetInternalNames: reviewedTargets,
          },
          loot: (internalName.endsWith('Skeleton')
            ? ['Carton of Milk', 'Ancient Iron Helmet', 'Ancient Gold Helmet', 'Bone Sword', 'Skull', 'Hook']
            : ['Shackle', 'Zombie Arm', 'Spiffo Plush']
          ).map((itemName, index) => ({
            itemName,
            chanceText: '1%',
            quantityText: '1',
            sourceRowIndex: index,
            sourceSection: 'drops',
          })),
        },
      })),
      {
        id: 430,
        internalName: 'ArmedZombie',
        name: 'Zombie',
        wikiCrawler: {
          pageTitle: 'Zombie',
          reviewedSharedLoot: {
            evidenceSource,
            targetInternalNames: reviewedTargets,
          },
          loot: [{ itemName: 'Shackle', chanceText: '2%', quantityText: '1', sourceRowIndex: 0 }],
        },
      },
    ],
  };

  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-12T00:00:00.000Z',
    standardizedPayload,
  });

  assert.equal(bundle.records.length, (4 * 3) + (3 * 6) + 1);
  for (const record of bundle.records.filter((row) => reviewedTargets.includes(row.npcInternalName))) {
    assert.equal(record.sourceRefInternalName, record.npcInternalName);
    assert.equal(record.sourceRefResolution, 'reviewed_page_level_shared_loot');
    assert.equal(record.raw.reviewedSharedLootEvidenceSource, evidenceSource);
  }
  const armed = bundle.records.filter((row) => row.npcInternalName === 'ArmedZombie');
  assert.equal(armed.length, 1);
  assert.equal(armed[0].sourceRefResolution, 'exact_internal_name');
});

test('buildNpcItemRelationsBundle does not materialize audit-only no-direct item loot rows', () => {
  const standardizedPayload = {
    records: [
      {
        id: 256,
        internalName: 'FungoFish',
        name: 'Fungo Fish',
        wikiCrawler: {
          pageTitle: 'Jellyfish',
          sourceLootRowsTotal: 10,
          sourceInfoboxes: [{ autoId: '256', image: 'Fungo Fish.gif', name: '' }],
          loot: []
        }
      },
      {
        id: 322,
        internalName: 'SkeletonTopHat',
        name: 'Skeleton',
        wikiCrawler: {
          pageTitle: 'Skeleton',
          sourceLootRowsTotal: 6,
          sourceInfoboxes: [{ autoId: '322', image: 'Top Hat Skeleton.gif', name: '' }],
          loot: []
        }
      },
      {
        id: 449,
        internalName: 'BoneThrowingSkeleton',
        name: 'Skeleton',
        wikiCrawler: {
          pageTitle: 'Skeleton',
          sourceLootRowsTotal: 6,
          sourceInfoboxes: [],
          loot: []
        }
      }
    ]
  };

  const bundle = buildNpcItemRelationsBundle({ standardizedPayload, baselineBundle: { records: [] } });

  assert.deepEqual(bundle.records, []);
});

test('buildNpcItemRelationsBundle drops stale baseline loot when current NPC payload has no direct loot', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-12T02:00:00.000Z',
    noDirectItemLootInternalNames: new Set(['BoneThrowingSkeleton']),
    baselineBundle: {
      records: [
        {
          recordKey: 'npc-item:bone-throwing-skeleton:loot:bone',
          relationType: 'loot',
          npcInternalName: 'BoneThrowingSkeleton',
          npcName: 'Skeleton',
          itemName: 'Bone',
          sourceRefName: 'Skeleton',
          sourceRefInternalName: 'BoneThrowingSkeleton',
          sourceRefResolution: 'exact_internal_name',
          chanceText: '100%',
          quantityText: '1'
        },
        {
          recordKey: 'npc-item:doctor-bones:loot:archaeologist-hat',
          relationType: 'loot',
          npcInternalName: 'DoctorBones',
          npcName: 'Doctor Bones',
          itemName: "Archaeologist's Hat",
          sourceRefInternalName: 'DoctorBones',
          sourceRefResolution: 'exact_internal_name',
          chanceText: '2.5%',
          quantityText: '1'
        }
      ]
    },
    standardizedPayload: {
      records: [
        {
          id: 449,
          internalName: 'BoneThrowingSkeleton',
          name: 'Skeleton',
          wikiCrawler: {
            pageTitle: 'Skeleton',
            sourceLootRowsTotal: 6,
            sourceInfoboxes: [{ autoId: '449', image: 'Bone Throwing Skeleton.gif', name: '' }],
            loot: []
          }
        }
      ]
    }
  });

  assert.deepEqual(
    bundle.records.map((record) => record.npcInternalName),
    ['DoctorBones']
  );
});

test('buildNpcItemRelationsBundle keeps non-overlapping baseline loot when current NPC has partial positive loot', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-13T00:00:00.000Z',
    baselineBundle: {
      records: [
        {
          recordKey: 'npc-item:zombie:loot:gel',
          relationType: 'loot',
          npcInternalName: 'Zombie',
          npcName: 'Zombie',
          itemName: 'Gel',
          sourceRefInternalName: 'Zombie',
          sourceRefResolution: 'exact_internal_name',
          chanceText: '100%',
          quantityText: '1-3'
        },
        {
          recordKey: 'npc-item:zombie:loot:slime-staff',
          relationType: 'loot',
          npcInternalName: 'Zombie',
          npcName: 'Zombie',
          itemName: 'Slime Staff',
          sourceRefInternalName: 'Zombie',
          sourceRefResolution: 'exact_internal_name',
          chanceText: '0.01% 0.014%',
          quantityText: '1'
        },
        {
          recordKey: 'npc-item:zombie:loot:wooden-arrow',
          relationType: 'loot',
          npcInternalName: 'Zombie',
          npcName: 'Zombie',
          itemName: 'Wooden Arrow',
          sourceRefInternalName: 'Zombie',
          sourceRefResolution: 'exact_internal_name',
          chanceText: '100%',
          quantityText: '5-15'
        },
        {
          recordKey: 'npc-item:zombie:loot:shackle:legacy',
          relationType: 'loot',
          npcInternalName: 'Zombie',
          npcName: 'Zombie',
          itemName: 'Shackle',
          sourceRefInternalName: 'Zombie',
          sourceRefResolution: 'exact_internal_name',
          chanceText: '2%',
          quantityText: '1'
        }
      ]
    },
    standardizedPayload: {
      records: [
        {
          id: 3,
          internalName: 'Zombie',
          name: 'Zombie',
          wikiCrawler: {
            pageTitle: 'Zombie',
            loot: [
              {
                itemName: 'Shackle',
                chanceText: '2%',
                quantityText: '1',
                sourceRefInternalName: 'Zombie',
                sourceRefResolution: 'exact_internal_name',
                sourceRowIndex: 0
              },
              {
                itemName: 'Spiffo Plush',
                chanceText: '0.07%',
                quantityText: '1',
                sourceRefInternalName: 'Zombie',
                sourceRefResolution: 'exact_internal_name',
                sourceRowIndex: 1
              }
            ]
          }
        }
      ]
    }
  });

  assert.deepEqual(
    bundle.records.map((record) => [record.npcInternalName, record.itemName, record.recordKey]),
    [
      ['Zombie', 'Gel', 'npc-item:zombie:loot:gel'],
      ['Zombie', 'Slime Staff', 'npc-item:zombie:loot:slime-staff'],
      ['Zombie', 'Wooden Arrow', 'npc-item:zombie:loot:wooden-arrow'],
      ['Zombie', 'Shackle', 'npc-item:zombie:loot:shackle:0'],
      ['Zombie', 'Spiffo Plush', 'npc-item:zombie:loot:spiffo-plush:1']
    ]
  );
});

test('buildNpcItemRelationsBundle keeps baseline loot when no-direct evidence lacks a reviewed contract', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-12T02:15:00.000Z',
    baselineBundle: {
      records: [
        {
          recordKey: 'npc-item:test-npc:loot:test-drop',
          relationType: 'loot',
          npcInternalName: 'TestNpc',
          npcName: 'Test NPC',
          itemName: 'Test Drop',
          sourceRefInternalName: 'TestNpc',
          sourceRefResolution: 'exact_internal_name',
          chanceText: '10%',
          quantityText: '1'
        }
      ]
    },
    standardizedPayload: {
      records: [
        {
          id: 9003,
          internalName: 'TestNpc',
          name: 'Test NPC',
          wikiCrawler: {
            pageTitle: 'Test NPC',
            sourceLootRowsTotal: 1,
            sourceInfoboxes: [{ autoId: '9003', image: 'Test NPC.gif', name: '' }],
            loot: []
          }
        }
      ]
    }
  });

  assert.deepEqual(
    bundle.records.map((record) => [record.npcInternalName, record.itemName]),
    [['TestNpc', 'Test Drop']]
  );
});

test('buildNpcItemRelationsBundle keeps baseline loot when no-direct evidence only matches a sibling infobox', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-12T02:30:00.000Z',
    baselineBundle: {
      records: [
        {
          recordKey: 'npc-item:bone-throwing-skeleton:loot:bone',
          relationType: 'loot',
          npcInternalName: 'BoneThrowingSkeleton',
          npcName: 'Skeleton',
          itemName: 'Bone',
          sourceRefInternalName: 'BoneThrowingSkeleton',
          sourceRefResolution: 'exact_internal_name',
          chanceText: '100%',
          quantityText: '1'
        }
      ]
    },
    standardizedPayload: {
      records: [
        {
          id: 449,
          internalName: 'BoneThrowingSkeleton',
          name: 'Skeleton',
          imageFileTitle: 'Bone Throwing Skeleton.gif',
          wikiCrawler: {
            pageTitle: 'Skeleton',
            sourceLootRowsTotal: 6,
            sourceInfoboxes: [{ autoId: '322', image: 'Top Hat Skeleton.gif', name: '' }],
            loot: []
          }
        }
      ]
    }
  });

  assert.deepEqual(
    bundle.records.map((record) => [record.npcInternalName, record.itemName]),
    [['BoneThrowingSkeleton', 'Bone']]
  );
});

test('buildNpcItemRelationsBundle keeps reviewed baseline loot when current empty payload lacks source coverage evidence', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-12T03:00:00.000Z',
    baselineBundle: {
      records: [
        {
          recordKey: 'npc-item:scarecrow1:loot:scarecrow-hat',
          relationType: 'loot',
          npcInternalName: 'Scarecrow1',
          npcName: 'Scarecrow',
          itemName: 'Scarecrow Hat',
          sourceRefName: 'Scarecrow',
          sourceRefInternalName: 'Scarecrow1',
          sourceRefResolution: 'reviewed_page_level_shared_loot',
          chanceText: '3.33%',
          quantityText: '1'
        }
      ]
    },
    standardizedPayload: {
      records: [
        {
          id: 305,
          internalName: 'Scarecrow1',
          name: 'Scarecrow',
          wikiCrawler: {
            pageTitle: 'Scarecrow',
            sourceLootRowsTotal: 0,
            sourceInfoboxes: [],
            loot: []
          }
        }
      ]
    }
  });

  assert.deepEqual(
    bundle.records.map((record) => [record.npcInternalName, record.itemName]),
    [['Scarecrow1', 'Scarecrow Hat']]
  );
});

test('buildNpcItemRelationsBundle keeps reviewed baseline loot when current empty payload has no positive source loot rows', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-12T03:30:00.000Z',
    baselineBundle: {
      records: [
        {
          recordKey: 'npc-item:reviewed-target:loot:heart',
          relationType: 'loot',
          npcInternalName: 'ReviewedTarget',
          npcName: 'Reviewed Target',
          itemName: 'Heart',
          sourceRefInternalName: 'ReviewedTarget',
          sourceRefResolution: 'reviewed_page_level_shared_loot',
          chanceText: '25%',
          quantityText: '1'
        }
      ]
    },
    standardizedPayload: {
      records: [
        {
          id: 9001,
          internalName: 'ReviewedTarget',
          name: 'Reviewed Target',
          wikiCrawler: {
            pageTitle: 'Reviewed Target',
            sourceLootRowsTotal: 0,
            sourceInfoboxes: [{ autoId: '9001', image: 'Reviewed Target.gif', name: '' }],
            loot: []
          }
        }
      ]
    }
  });

  assert.deepEqual(
    bundle.records.map((record) => [record.npcInternalName, record.itemName]),
    [['ReviewedTarget', 'Heart']]
  );
});

test('buildNpcItemRelationsBundle merges newly crawled NPC loot with an existing full bundle', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-11T00:00:00.000Z',
    baselineBundle: {
      schemaVersion: 1,
      source: 'wiki-crawler:npc',
      generatedAt: '2026-05-10T00:00:00.000Z',
      records: [
        {
          recordKey: 'npc-item:merchant:shop:lesser-healing-potion',
          relationType: 'shop',
          npcInternalName: 'Merchant',
          npcName: 'Merchant',
          itemName: 'Lesser Healing Potion',
          priceText: '3 silver'
        }
      ],
      backfillCandidates: [
        {
          candidateKey: 'a'.repeat(64),
          domain: 'npc_projectile_relation',
          entityType: 'npc',
          entityInternalName: 'Merchant',
          status: 'open'
        }
      ]
    },
    standardizedPayload: {
      records: [
        {
          id: 52,
          internalName: 'DoctorBones',
          name: 'Doctor Bones',
          wikiCrawler: {
            pageTitle: 'Doctor Bones',
            loot: [
              {
                itemName: "Archaeologist's Hat",
                chanceText: '2.5%',
                quantityText: '1',
                sourceRowIndex: 1
              }
            ],
            backfillCandidates: [
              {
                candidateKey: 'b'.repeat(64),
                domain: 'npc_projectile_relation',
                entityType: 'npc',
                missingField: 'projectileId',
                status: 'open'
              }
            ]
          }
        }
      ]
    }
  });

  assert.equal(bundle.records.length, 2);
  assert.ok(bundle.records.some((record) => record.recordKey === 'npc-item:merchant:shop:lesser-healing-potion'));
  assert.ok(bundle.records.some((record) => record.npcInternalName === 'DoctorBones' && record.itemName === "Archaeologist's Hat"));
  assert.deepEqual(bundle.backfillCandidates.map((candidate) => candidate.candidateKey), [
    'a'.repeat(64),
    'b'.repeat(64)
  ]);
});

test('buildNpcItemRelationsBundle excludes boss loot rows from ordinary NPC item relations', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-12T00:00:00.000Z',
    baselineBundle: {
      records: [
        {
          recordKey: 'npc-item:king-slime:loot:slimy-saddle:1',
          relationType: 'loot',
          npcInternalName: 'KingSlime',
          npcName: 'King Slime',
          itemName: 'Slimy Saddle',
          chanceText: '25%',
          quantityText: '1'
        }
      ],
      backfillCandidates: [
        {
          candidateKey: 'king-slime-backfill',
          domain: 'npc_projectile_relation',
          entityType: 'npc',
          entityInternalName: 'king-slime',
          status: 'open'
        },
        {
          candidateKey: 'doctor-bones-backfill',
          domain: 'npc_projectile_relation',
          entityType: 'npc',
          entityInternalName: 'doctor-bones',
          status: 'open'
        }
      ]
    },
    standardizedPayload: {
      records: [
        {
          id: 50,
          internalName: 'KingSlime',
          name: 'King Slime',
          flags: { boss: true },
          wikiCrawler: {
            pageTitle: 'King Slime',
            loot: [
              {
                itemName: 'Slimy Saddle',
                chanceText: '25%',
                quantityText: '1',
                sourceRowIndex: 1
              }
            ]
          }
        },
        {
          id: 222,
          internalName: 'QueenBee',
          name: 'Queen Bee',
          wikiCrawler: {
            pageTitle: 'Queen Bee',
            profile: { kind: 'Boss' },
            loot: [
              {
                itemName: 'Bee Gun',
                chanceText: '33%',
                quantityText: '1',
                sourceRowIndex: 0
              }
            ],
            backfillCandidates: [
              {
                candidateKey: 'queen-bee-backfill',
                domain: 'npc_projectile_relation',
                entityType: 'npc',
                entityInternalName: 'queen-bee',
                status: 'open'
              }
            ]
          }
        },
        {
          id: 52,
          internalName: 'DoctorBones',
          name: 'Doctor Bones',
          flags: { boss: false },
          wikiCrawler: {
            pageTitle: 'Doctor Bones',
            profile: { kind: 'Undead Enemy' },
            loot: [
              {
                itemName: "Archaeologist's Hat",
                chanceText: '100%',
                quantityText: '1',
                sourceRowIndex: 0
              }
            ]
          }
        }
      ]
    }
  });

  assert.equal(bundle.records.length, 1);
  assert.deepEqual(
    bundle.records.map((record) => [record.npcInternalName, record.itemName]),
    [['DoctorBones', "Archaeologist's Hat"]]
  );
  assert.deepEqual(
    bundle.backfillCandidates.map((candidate) => candidate.candidateKey),
    ['doctor-bones-backfill']
  );
});

test('buildNpcItemRelationsBundle keeps reviewed Old Ones Army mini-boss exact NPC drops', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-12T00:00:00.000Z',
    baselineBundle: {
      records: [
        {
          recordKey: 'npc-item:dd2-dark-mage-t1:loot:squire-s-shield:0',
          relationType: 'loot',
          npcInternalName: 'DD2DarkMageT1',
          npcName: 'Dark Mage',
          itemName: "Squire's Shield",
          chanceText: '50%',
          quantityText: '1',
          sourceRefInternalName: 'DD2DarkMageT1',
          sourceRefResolution: 'positive_id_fallback'
        },
        {
          recordKey: 'npc-item:queen-bee:loot:bee-gun:0',
          relationType: 'loot',
          npcInternalName: 'QueenBee',
          npcName: 'Queen Bee',
          itemName: 'Bee Gun',
          chanceText: '33%',
          quantityText: '1',
          sourceRefInternalName: 'QueenBee',
          sourceRefResolution: 'exact_internal_name'
        }
      ]
    },
    standardizedPayload: {
      records: [
        {
          id: 565,
          internalName: 'DD2DarkMageT3',
          name: 'Dark Mage',
          wikiCrawler: {
            pageTitle: 'Dark Mage',
            profile: { kind: 'Boss' },
            loot: [
              {
                itemName: 'Dark Mage Relic',
                chanceText: '{{master|100%}} @master',
                quantityText: '1',
                sourceRefInternalName: 'DD2DarkMageT3',
                sourceRefResolution: 'exact_internal_name',
                sourceRowIndex: 18
              }
            ]
          }
        },
        {
          id: 577,
          internalName: 'DD2OgreT3',
          name: 'Ogre',
          wikiCrawler: {
            pageTitle: 'Ogre',
            profile: { kind: 'Boss' },
            loot: [
              {
                itemName: 'Ogre Relic',
                chanceText: '{{master|100%}} @master',
                quantityText: '1',
                sourceRefInternalName: 'DD2OgreT3',
                sourceRefResolution: 'exact_internal_name',
                sourceRowIndex: 25
              }
            ]
          }
        },
        {
          id: 222,
          internalName: 'QueenBee',
          name: 'Queen Bee',
          wikiCrawler: {
            pageTitle: 'Queen Bee',
            profile: { kind: 'Boss' },
            loot: [
              {
                itemName: 'Bee Gun',
                chanceText: '33%',
                quantityText: '1',
                sourceRefInternalName: 'QueenBee',
                sourceRefResolution: 'exact_internal_name',
                sourceRowIndex: 0
              }
            ]
          }
        }
      ]
    }
  });

  assert.deepEqual(
    bundle.records.map((record) => [record.npcInternalName, record.itemName, record.sourceRefResolution]),
    [
      ['DD2DarkMageT1', "Squire's Shield", 'positive_id_fallback'],
      ['DD2DarkMageT3', 'Dark Mage Relic', 'exact_internal_name'],
      ['DD2OgreT3', 'Ogre Relic', 'exact_internal_name']
    ]
  );
});

test('buildNpcItemRelationsBundle rejects reviewed mini-boss rows without exact NPC evidence', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-12T00:00:00.000Z',
    standardizedPayload: {
      records: [
        {
          id: 565,
          internalName: 'DD2DarkMageT3',
          name: 'Dark Mage',
          wikiCrawler: {
            pageTitle: 'Dark Mage',
            profile: { kind: 'Boss' },
            loot: [
              {
                itemName: 'Dark Mage Relic',
                chanceText: '{{master|100%}} @master',
                quantityText: '1',
                sourceRefInternalName: 'DD2DarkMageT3',
                sourceRefResolution: 'positive_id_fallback',
                sourceRowIndex: 18
              },
              {
                itemName: 'Dark Mage Mask',
                chanceText: '7.14%',
                quantityText: '1',
                sourceRefInternalName: 'DD2DarkMageT1',
                sourceRefResolution: 'exact_internal_name',
                sourceRowIndex: 15
              }
            ]
          }
        }
      ]
    }
  });

  assert.equal(bundle.records.length, 0);
});

test('buildNpcItemRelationsBundle hashes generated record keys that exceed maint DB length', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-12T00:00:00.000Z',
    standardizedPayload: {
      records: [
        {
          id: 999,
          internalName: 'VeryLongButRegularEnemy',
          name: 'Very Long But Regular Enemy',
          flags: { boss: false },
          wikiCrawler: {
            pageTitle: 'Very Long But Regular Enemy',
            profile: { kind: 'enemy' },
            loot: [
              {
                itemName: 'Coins ({{npcinfo|Very Long But Regular Enemy|value|expert}})',
                chanceText: '100%',
                quantityText: '1',
                sourceRowIndex: 'expert'
              }
            ]
          }
        }
      ]
    }
  });

  assert.equal(bundle.records.length, 1);
  assert.equal(bundle.records[0].recordKey.length, 64);
  assert.match(bundle.records[0].recordKey, /^[a-f0-9]{64}$/);
});

test('buildNpcItemRelationsBundle preserves duplicate forward NPC page rows while replacing legacy baseline rows', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-11T00:00:00.000Z',
    baselineBundle: {
      records: [
        {
          recordKey: 'npc-item:reaper:loot:death-sickle',
          relationType: 'loot',
          npcInternalName: 'Reaper',
          npcName: 'Reaper',
          itemName: 'Death Sickle',
          chanceText: '2.5%',
          quantityText: '1'
        }
      ],
      backfillCandidates: []
    },
    standardizedPayload: {
      records: [
        {
          id: 253,
          internalName: 'Reaper',
          name: 'Reaper',
          wikiCrawler: {
            pageTitle: 'Reaper',
            loot: [
              {
                itemName: 'Death Sickle',
                chanceText: '2.5%',
                quantityText: '1',
                sourceUrl: 'https://terraria.wiki.gg/wiki/Reaper',
                sourceRefName: 'Reaper',
                sourceRefInternalName: 'Reaper',
                sourceRefResolution: 'exact_internal_name',
                sourceRowIndex: 0
              },
              {
                itemName: 'Death Sickle',
                chanceText: '2.5%',
                quantityText: '1',
                sourceUrl: 'https://terraria.wiki.gg/wiki/Reaper',
                sourceRefName: 'Reaper',
                sourceRefInternalName: 'Reaper',
                sourceRefResolution: 'exact_internal_name',
                sourceRowIndex: 1
              }
            ]
          }
        }
      ]
    }
  });

  assert.equal(bundle.records.length, 2);
  assert.deepEqual(bundle.records.map((record) => record.recordKey), [
    'npc-item:reaper:loot:death-sickle:0',
    'npc-item:reaper:loot:death-sickle:1'
  ]);
  assert.deepEqual(bundle.records.map((record) => record.sourceRowIndex), [0, 1]);
});

test('buildNpcItemRelationsBundle dedupes shared display-name rows without explicit exact source scope', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-11T00:00:00.000Z',
    standardizedPayload: {
      records: [
        {
          id: 430,
          internalName: 'ArmedZombie',
          name: 'Zombie',
          wikiCrawler: {
            pageTitle: 'Zombie',
            loot: [
              {
                itemName: 'Shackle',
                chanceText: '2%',
                quantityText: '1',
                sourceRowIndex: 1
              },
              {
                itemName: 'Shackle',
                chanceText: '2%',
                quantityText: '1',
                sourceRowIndex: 2
              }
            ]
          }
        }
      ]
    }
  });

  assert.equal(bundle.records.length, 1);
  assert.deepEqual(bundle.records.map((record) => record.recordKey), [
    'npc-item:armed-zombie:loot:shackle:1'
  ]);
});

test('buildNpcItemRelationsBundle dedupes base display-name page rows without explicit exact source scope', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-11T00:00:00.000Z',
    standardizedPayload: {
      records: [
        {
          id: 3,
          internalName: 'Zombie',
          name: 'Zombie',
          wikiCrawler: {
            pageTitle: 'Zombie',
            loot: [
              {
                itemName: 'Shackle',
                chanceText: '2%',
                quantityText: '1',
                sourceRowIndex: 1
              },
              {
                itemName: 'Shackle',
                chanceText: '2%',
                quantityText: '1',
                sourceRowIndex: 2
              }
            ]
          }
        }
      ]
    }
  });

  assert.equal(bundle.records.length, 1);
  assert.deepEqual(bundle.records.map((record) => record.recordKey), [
    'npc-item:zombie:loot:shackle:1'
  ]);
});

test('buildNpcItemRelationsBundle preserves exact forward row identity when page title differs from NPC name', () => {
  const bundle = buildNpcItemRelationsBundle({
    generatedAt: '2026-05-11T00:00:00.000Z',
    standardizedPayload: {
      records: [
        {
          id: 9002,
          internalName: 'VariantEnemy',
          name: 'Variant Enemy',
          wikiCrawler: {
            pageTitle: 'Variant Enemy (NPC)',
            loot: [
              {
                itemName: 'Variant Blade',
                chanceText: '1%',
                quantityText: '1',
                sourceUrl: 'https://terraria.wiki.gg/wiki/Variant_Enemy_(NPC)',
                sourceRefInternalName: 'VariantEnemy',
                sourceRefResolution: 'exact_internal_name',
                sourceRowKey: 'normal:variant-blade'
              },
              {
                itemName: 'Variant Blade',
                chanceText: '1%',
                quantityText: '1',
                sourceUrl: 'https://terraria.wiki.gg/wiki/Variant_Enemy_(NPC)',
                sourceRefInternalName: 'VariantEnemy',
                sourceRefResolution: 'exact_internal_name',
                sourceRowKey: 'expert:variant-blade'
              }
            ]
          }
        }
      ]
    }
  });

  assert.equal(bundle.records.length, 2);
  assert.deepEqual(bundle.records.map((record) => record.recordKey), [
    'npc-item:variant-enemy:loot:variant-blade:normal-variant-blade',
    'npc-item:variant-enemy:loot:variant-blade:expert-variant-blade'
  ]);
  assert.deepEqual(bundle.records.map((record) => record.sourceRefResolution), [
    'exact_internal_name',
    'exact_internal_name'
  ]);
});
