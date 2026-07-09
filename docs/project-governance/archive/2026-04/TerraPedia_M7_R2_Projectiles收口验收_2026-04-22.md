# TerraPedia M7-R2 Projectiles 收口验收

日期：2026-04-22  
执行分支：`feature/npc-domain-m1-m2`

---

## 1. 验收结论

`M7-R2: Projectiles` 已达到可收口状态。

当前结论：

- standardized / DB / admin 三条链主计数一致
- 管理端列表与详情页可稳定消费
- MinIO 图片已基本收口
- 中文名缺口已明确归因到上游语言源，而不是本地导库失败

---

## 2. 最新基线

### 2.1 standardized

基于 `data/standardized/projectiles.standardized.json`：

- `standardizedCount = 1111`

### 2.2 数据库

基于 `terria_v1_local` 只读统计：

- `total = 1111`
- `with_zh = 1006`
- `missing_zh = 105`
- `with_minio_image = 1110`
- `missing_minio_image = 1`

唯一未命中 MinIO 图片的记录：

- `internal_name = None`
- `source_id = 0`

### 2.3 管理端/API

已验证：

- `GET /api/admin/projectiles?page=1&limit=2`
- `GET /api/admin/projectiles/2`
- `http://localhost:3001/entities/projectiles`

结果：

- HTTP 均为 `200`

---

## 3. Dry-run 证据

基于 `reports/projectile-zh-image-backfill-2026-04-22.json`：

- `sourceMapCount = 1011`
- `total = 1111`
- `zhMatched = 1006`
- `zhUpdated = 0`
- `imageResolved = 1110`
- `imageAlreadyManaged = 1110`
- `recordsChanged = 0`
- `unresolvedZh = 105`
- `unresolvedImage = 1`

这说明：

- 当前本地数据并不是“忘了回填”
- 而是上游语言包只覆盖到了 `1006` 条
- 剩余 `105` 条是 source map 未给出中文名

---

## 4. 样本验收

### 4.1 正常样本

`WoodenArrowFriendly`

- `nameZh = 木箭`
- `nameEn = Wooden Arrow (friendly)`
- `imageUrl` 已指向本地 MinIO

### 4.2 缺中文样本

代表样本：

- `WebSlingerHook / Web`
- `PhasicWarpEjector / Phasic Warp Ejector`
- `PhasicWarpDisc / Phasic Warp Disc`
- `AmberHook / Amber Hook`
- `MysticSnakeCoil / Mystic Snake Coil`

这些样本的共同点：

- DB 中 `name_zh` 为空
- dry-run 中 `unresolvedZh` 仍为缺失
- 不属于本地脚本未执行，而是语言源未覆盖

### 4.3 占位样本

`None`

- `source_id = 0`
- `name = null`
- `name_zh = null`
- 无 MinIO 图片

该记录属于占位射弹，不应被当成普通缺图问题处理。

---

## 5. 设计接受项

### 5.1 中文名缺口

本轮设计接受：

- `105` 条 `name_zh` 缺口保留
- 原因归于上游语言包未覆盖
- 不在 `M7-R2` 中手写补全这批中文名

### 5.2 占位射弹

本轮设计接受：

- `internal_name = None` 保留为占位记录
- 不强行补图
- 不把它计入普通射弹图片缺陷

---

## 6. 验证命令

已执行：

```powershell
node scripts/data/backfill/backfill-projectile-zh-and-images.mjs --apply=false --skipUpload=true --apiBase=http://127.0.0.1:18088/api --output=reports/projectile-zh-image-backfill-2026-04-22.json
```

结果：

- `zhMatched = 1006`
- `unresolvedZh = 105`
- `imageResolved = 1110`
- `unresolvedImage = 1`

已执行：

```powershell
node scripts/dev/verify/verify-module-api-smoke.mjs --apiBase=http://127.0.0.1:18088/api
```

结果：

- `admin.projectiles.list = 200`
- `admin.projectiles.detail = 200`

已执行：

```text
http://localhost:3001/entities/projectiles
```

结果：

- HTTP `200`

---

## 7. 当前结论

`Projectiles` 可以收口。

它当前已经满足：

- 标准化产物存在
- DB 接入存在
- 管理端消费存在
- 图片主链路已基本收口
- 中文名缺口已被清楚归因

下一步进入：

`M7-R3: Biomes 收口`
