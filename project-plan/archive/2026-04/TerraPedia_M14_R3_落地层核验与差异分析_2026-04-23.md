# TerraPedia M14-R3 落地层核验与差异分析
日期：2026-04-23  
对应里程碑：`M14-R3`

---

## 1. 本批目标

把 `source_dataset_landings` 从“已进库”推进到“可审计”，明确：

- landing 当前总量和分布
- provider 分布
- landing 所对应业务域在 `local / r2` 的表规模对比

---

## 2. 本批新增内容

新增脚本：

- `scripts/data/landing/audit-source-dataset-landings.mjs`
- `scripts/data/landing/audit-source-dataset-landings.test.mjs`

新增能力：

- landing current 按 `dataset_type` 统计
- landing current 按 `provider` 统计
- 与 `terria_v1_local` 业务表计数对照
- 与 `terria_v1_item_staging_20260413_r2` 业务表计数对照
- 输出 `reports/source-dataset-landing-audit-2026-04-23.json`

---

## 3. 实际执行

已执行：

```powershell
node --test scripts/data/landing/audit-source-dataset-landings.test.mjs
node --check scripts/data/landing/audit-source-dataset-landings.mjs
node scripts/data/landing/audit-source-dataset-landings.mjs
```

输出报告：

```text
reports/source-dataset-landing-audit-2026-04-23.json
```

---

## 4. landing 当前结果

current 总量：

- `6514`

按 `dataset_type`：

- `armor_sets_raw`: `1`
- `biomes_raw`: `7`
- `bosses_raw`: `33`
- `buffs_raw`: `1`
- `categories_raw`: `6`
- `item_pages_raw`: `6131`
- `item_relations_bundle_raw`: `290`
- `items_raw`: `1`
- `npcs_raw`: `1`
- `projectiles_raw`: `1`
- `recipes_raw`: `41`
- `shimmer_raw`: `1`

按 `provider`：

- `terraria.wiki.gg`: `6183`
- `terraria.wiki.gg/zh`: `41`
- `terrapedia.generated`: `290`

---

## 5. local / r2 业务表对比

### 5.1 `local` 少于 `r2`

- `items`: `local 6134`，`r2 6146`，差值 `-12`

### 5.2 `local` 与 `r2` 持平

- `npcs`: `762 / 762`
- `projectiles`: `1111 / 1111`
- `buffs`: `388 / 388`
- `boss_groups`: `33 / 33`

### 5.3 `local` 明显多于 `r2`

- `armor_sets`: `88 / 63`，多 `25`
- `biomes`: `29 / 12`，多 `17`
- `category`: `137 / 16`，多 `121`
- `recipes`: `8539 / 5020`，多 `3519`

---

## 6. 审计结论

本轮结论明确：

1. `source_dataset_landings` 已形成稳定 current 层，可直接作为后续映射和回放基座。
2. `terria_v1_local` 依然应作为当前开发主库，不应被 `r2` 直接覆盖。
3. `r2` 只在 `items` 总数上比 `local` 多 `12`，但在多个关键域明显更弱。
4. `local` 在 `armor_sets / biomes / category / recipes` 上明显更完整。
5. `item_relations_bundle_raw` 当前以 `290` 个 chunk row 形式稳定落地，可继续保留该策略。

---

## 7. 下一步建议

建议进入 `M14-R4`：

- 明确每种 `dataset_type` 的正式去向
- 区分“继续进业务表”和“长期只保留 landing 层”
- 把 `items_raw / npcs_raw / projectiles_raw / buffs_raw / bosses_raw / biomes_raw` 作为优先映射批
- 把 `categories_raw / item_pages_raw / recipes_raw / item_relations_bundle_raw` 作为规则层或二次标准化批
