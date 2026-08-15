#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'standardized', 'buffs.standardized.json'), 'utf8'));
const records = Array.isArray(raw.records) ? raw.records : [];

const result = {
  generatedAt: new Date().toISOString(),
  count: records.length,
  records: Object.fromEntries(records.map((record) => [
    String(record.internalName),
    {
      id: record.id ?? null,
      internalName: record.internalName ?? null,
      englishName: record.englishName ?? record.localized?.en?.name ?? null,
      nameZh: record.localized?.zh?.name ?? null,
      tooltipEn: record.localized?.en?.tooltip ?? null,
      tooltipZh: record.localized?.zh?.tooltip ?? null,
      buffType: record.type ?? null,
      sourceItemCount: record.sourceItemCount ?? null,
      immuneNpcCount: record.immuneNpcCount ?? null,
      imageUrl: record.imageUrl ?? null,
    },
  ])),
};

const outputPath = path.join(process.cwd(), 'data', 'generated', 'buff-standardized-map.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
console.log(JSON.stringify({ outputPath, count: result.count }, null, 2));
