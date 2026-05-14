# TerraPedia M7 次级成熟域验收

日期：2026-04-22  
执行分支：`feature/npc-domain-m1-m2`

---

## 1. 验收结论

`M7: 次级成熟域接入` 已达到可收口状态。

本轮完成了 4 个域的统一验收：

- `Shimmer`
- `Projectiles`
- `Biomes`
- `Armor Sets`

它们当前都已进入同一套工程判断口径：

- 抓取 / 生成入口明确
- 标准化或导库口径明确
- DB / 管理端接入存在
- 至少一个消费面可验证
- 剩余差异可解释

---

## 2. 各域结果

### 2.1 Shimmer

状态：

- 已收口

核心事实：

- item transforms: `279`
- decraft rules: `248`
- entity transforms: `121`
- npc transforms: `29`
- `unresolvedTitles = 0`

结论：

- `Shimmer` 是 `M7` 中最稳定的样板域

文档：

- [TerraPedia_M7_R1_Shimmer收口验收_2026-04-22.md](G:/ClaudeCode/TerraPedia-dev/project-plan/TerraPedia_M7_R1_Shimmer收口验收_2026-04-22.md)

### 2.2 Projectiles

状态：

- 已收口

核心事实：

- standardized: `1111`
- DB: `1111`
- `name_zh` 已覆盖：`1006`
- 中文缺口：`105`
- MinIO 图片已覆盖：`1110`
- 未覆盖图片仅占位记录 `None`

结论：

- 主链路已稳定
- 中文缺口明确归因到上游语言包未覆盖

文档：

- [TerraPedia_M7_R2_Projectiles收口验收_2026-04-22.md](G:/ClaudeCode/TerraPedia-dev/project-plan/TerraPedia_M7_R2_Projectiles收口验收_2026-04-22.md)

### 2.3 Biomes

状态：

- 已收口

核心事实：

- standardized 主群系：`7`
- generated importable：`28`
- DB：`29`
- DB 唯一多出项：`code = biomes`

结论：

- 三层口径差异已解释
- 伪记录来自 overview fallback
- transform 已加入过滤规则

文档：

- [TerraPedia_M7_R3_Biomes收口验收_2026-04-22.md](G:/ClaudeCode/TerraPedia-dev/project-plan/TerraPedia_M7_R3_Biomes收口验收_2026-04-22.md)

### 2.4 Armor Sets

状态：

- 已收口

核心事实：

- standardized bonus groups: `63`
- expanded variant sum: `167`
- DB instance rows: `88`
- definition map: `88 total / 71 mapped / 17 placeholder`

结论：

- `63 vs 88` 是 group 与 instance 的层级差异
- 当前不是简单脏数据堆积
- definition map 生成器已恢复可跑

文档：

- [TerraPedia_M7_R4_ArmorSets收口验收_2026-04-22.md](G:/ClaudeCode/TerraPedia-dev/project-plan/TerraPedia_M7_R4_ArmorSets收口验收_2026-04-22.md)

---

## 3. 通用修复

在 `M7` 验收过程中，补齐了两类通用验证能力：

### 3.1 实体完整性审计脚本

修复内容：

- Buff 审计改用当前字段：
  - `name_zh`
  - `image`
- Armor Set 审计改为动态解析首条有效 ID

结果：

- `audit-entity-data-completeness.mjs` 可完整执行

### 3.2 Biome transform 过滤

修复内容：

- 过滤 wiki overview fallback 导致的伪记录 `Biomes`

结果：

- importable 从 `30` 收敛到 `28`
- 差异收敛为 DB 中单条历史伪记录

---

## 4. 统一验证结果

已执行：

```powershell
node scripts/dev/verify/verify-module-api-smoke.mjs --apiBase=http://127.0.0.1:18088/api
```

结果：

- `16/16 pass`

已执行：

```powershell
node scripts/data/audit/audit-entity-data-completeness.mjs --apiBase=http://127.0.0.1:18088/api --output=reports/entity-data-completeness-2026-04-22.json
```

结果：

- 审计报告生成成功

已执行测试：

- `entity-audit-api-path.test.mjs`
- `entity-audit-sql.test.mjs`
- `biome-transform-filters.test.mjs`
- `armor-set-definition-source.test.mjs`

结果：

- `7/7 pass`

---

## 5. 设计接受项总表

### Projectiles

- `105` 条中文名缺口保留
- 原因：上游语言包未覆盖

### Biomes

- DB 中 `code = biomes` 历史伪记录保留
- 本轮不做破坏性删除

### Armor Sets

- `17` 条 placeholder 保留
- `armor_set_items` 历史 orphan 记录保留
- 当前主事实源改以 `armor_sets` 主表与 generated definition map 为准

---

## 6. 最终判断

`M7` 可以收口。

到此为止：

- `M5` 已收口
- `M6` 已收口
- `M7` 已收口

当前主线已经从：

- Town NPC
- Boss 聚合域
- 次级成熟域

连续推进到一个完整批次收口，没有跑偏到新的公开前台扩域。

后续如继续推进，建议切到新的里程碑，而不是继续在 `M7` 内追加尾项。
