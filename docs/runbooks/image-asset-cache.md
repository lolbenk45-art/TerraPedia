# Image Asset Cache Runbook

## 适用范围

用于处理 Terraria wiki 图片、MinIO 缓存、legacy image 字段和公开/管理端展示 fallback。

## 操作原则

1. 先确认目标实体类型和写入表。
2. 先运行精确测试，再做同步。
3. 大批量同步必须先 limit 小样本。
4. 同一实体类型图片同步 apply 不并发。
5. 不用 managed URL 覆盖 source/original URL。

## 当前写入边界

| 实体 | 写入目标 | 备注 |
| --- | --- | --- |
| item | `item_images.cached_url` / `item_images.original_url` | legacy `items.image` 作为 fallback 来源 |
| buff | `buffs.image_original_url` / `buffs.image_cached_url` / `buffs.image_content_type` / `buffs.image_last_verified_at` | V40 已增加列 |
| npc | 待统一 | 不在未验收前扩张公开页面 |
| projectile | 待统一 | 先管理端验收 |
| biome | 待统一 | 先字段与图片审计 |

## 同步前检查

```powershell
git status --short
cd back
mvn "-Dtest=WikiImageSyncServiceImplTest,ItemImageServiceImplTest,AdminBuffControllerTest" test
```

## 验收样本

每次图片同步或展示契约变更，至少覆盖：

- cached：已有 MinIO cache URL 的实体。
- fallback：只有 wiki/source URL 的实体。
- missing：无图片或图片字段为空的实体。
- broken：缓存 URL 不可用但 source URL 可回源的实体。

## 失败处理

- 外部 wiki 请求失败：记录 URL、entity type、entity id/internal name、HTTP status 或异常类型。
- MinIO 上传失败：保留 original URL，不写 cached URL。
- DB 更新失败：停止当前批次，不继续扩大范围。
- 发现同一实体同时有冲突 source：进入审计报告，不自动覆盖。
