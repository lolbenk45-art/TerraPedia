# TerraPedia M7-R3 Biomes 收口验收

日期：2026-04-22  
执行分支：`feature/npc-domain-m1-m2`

---

## 1. 验收结论

`M7-R3: Biomes` 已达到可收口状态。

当前结论：

- `standardized`、`generated`、`DB` 三层口径差异已被解释
- `wiki-biomes` source 与 `importable` 链路已恢复
- transform 已过滤 overview fallback 伪记录
- 管理端列表 / 详情页可稳定消费

---

## 2. 差异归因

### 2.1 standardized 为什么只有 7 条

`data/standardized/biomes.standardized.json` 当前只覆盖：

- `forest`
- `jungle`
- `desert`
- `snow`
- `crimson`
- `corruption`
- `hallow`

这层更接近：

- 主群系 anchor
- 关系域里稳定复用的核心群系集合

它不是完整导库口径。

### 2.2 generated importable 为什么是 28 条

重新执行：

- `fetch-wiki-biomes.mjs`
- `transform-wiki-biomes-to-import.mjs`

后，`data/generated/wiki-biomes.importable.latest.json` 得到：

- `biomeCount = 28`
- `derivedBiomeCount = 6`

这里的 28 条是完整导库口径，包含：

- 主群系
- 地下层变体
- mini-biomes
- Aether / Town / Graveyard 等扩展群系

### 2.3 DB 为什么是 29 条

当前 DB：

- `biomes = 29`

与 importable 做差后：

- `onlyImportable = []`
- `onlyDb = ['biomes']`

说明 DB 唯一多出的记录是：

- `code = biomes`

它不是有效群系，而是历史导入时由 wiki 总览页回退产生的伪记录。

---

## 3. 本轮修复

本轮修复了 `transform-wiki-biomes-to-import.mjs` 的一个真实问题：

- 某些 mini-biome 目标页在 wiki 上回退到总览页 `Biomes`
- transform 原先直接把它们当成实体导入
- 结果产生重复 `code = biomes`

已新增过滤规则：

- 当 `requestedTitle != Biomes`
- 但解析结果 `title == Biomes`

则视为：

- overview fallback 伪记录
- 不进入 importable 输出

修复后：

- importable 从 `30` 收敛到 `28`

---

## 4. 当前基线

### 4.1 source fetch

基于 `fetch-wiki-biomes.mjs` 最新结果：

- `discoveredBiomeCount = 30`
- `derivedBiomeCount = 6`
- `unresolvedCount = 0`

### 4.2 importable

基于 `wiki-biomes.importable.latest.json`：

- `biomeCount = 28`

### 4.3 数据库

基于 `terria_v1_local`：

- `biomes = 29`
- `biome_relations = 14`
- `biome_resources = 48`
- `item_biomes = 364`

### 4.4 页面/API

已验证：

- `GET /api/admin/biomes?page=1&limit=1`
- `GET /api/admin/biomes/1`
- `http://localhost:3001/entities/biomes`

结果：

- HTTP 均为 `200`

---

## 5. 设计接受项

### 5.1 历史伪记录 `biomes`

本轮设计接受：

- DB 中现存 `code = biomes` 保留
- 不在本轮执行破坏性删除
- 将其视为历史 overview fallback 伪记录

### 5.2 图标缺口

当前：

- `icon_url` 仍为空

本轮设计接受：

- `Biomes` 先完成结构与消费验收
- 图标本地化不在本轮单独展开

---

## 6. 验证命令

已执行：

```powershell
node scripts/data/fetch/fetch-wiki-biomes.mjs
```

结果：

- `discoveredBiomeCount = 30`
- `derivedBiomeCount = 6`
- `unresolvedCount = 0`

已执行：

```powershell
node scripts/data/transform/transform-wiki-biomes-to-import.mjs
```

结果：

- `biomeCount = 28`

已执行：

```powershell
node --test scripts/data/transform/biome-transform-filters.test.mjs
```

结果：

- `2/2 pass`

已执行：

```powershell
node scripts/dev/verify/verify-module-api-smoke.mjs --apiBase=http://127.0.0.1:18088/api
```

结果：

- `admin.biomes.list = 200`
- `admin.biomes.detail = 200`

---

## 7. 当前结论

`Biomes` 可以收口。

它当前已经满足：

- source 链路存在
- importable 链路存在
- DB / 管理端消费存在
- 差异已可解释

下一步进入：

`M7-R4: Armor Sets 收口`
