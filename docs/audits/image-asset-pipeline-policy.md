# Image Asset Pipeline Policy

状态：Phase B 稳固准入规则。

## 目标

图片资产不再按普通文本字段处理。所有公开或管理端展示的实体图片都必须同时回答三件事：

- 原始来源是什么。
- 当前优先展示的缓存地址是什么。
- 缓存缺失或失败时如何 fallback。

## 字段语义

| 实体 | 原始来源字段 | 缓存字段 | 展示字段 | 当前状态 |
| --- | --- | --- | --- | --- |
| item | `item_images.original_url`，legacy `items.image` | `item_images.cached_url` | `imageUrl` / `image` | 已优先 MinIO cache，wiki fallback |
| buff | `buffs.image_original_url`，legacy `buffs.image` | `buffs.image_cached_url` | `imageUrl` / `image` | 已由 V40 增加双轨字段 |
| npc | `npcs.image` 或 relation payload source | 待统一 | `imageUrl` / `image` | 已消费 fallback，缺统一 cache 契约 |
| projectile | `projectiles.image` | 待统一 | `imageUrl` / `image` | 管理端验收前不得公开扩张 |
| biome | `biomes.image` | 待统一 | `imageUrl` / `image` | 需先补图片准入审计 |
| article | 上传或外链资源 | MinIO/storage managed URL | cover/image | 需由发布预检确认 |

## 展示优先级

1. 优先使用 MinIO 或本系统托管的 managed/cache URL。
2. 缓存为空时 fallback 到 wiki/source/original URL。
3. 原始来源不得被 managed URL 覆盖；用于回源、重新同步和审计。
4. 如果缓存 URL 失效但原始 URL 可用，公开页面可以降级显示 fallback，但管理端必须标记该实体仍有缓存缺口。

## 同步与写入规则

- item 图片写入 `item_images`，不得把 legacy wiki URL 当作最终展示唯一事实。
- buff 图片写入 `buffs.image_original_url`、`buffs.image_cached_url`、`buffs.image_content_type`、`buffs.image_last_verified_at`。
- 同一实体类型的图片同步 apply 必须串行。
- 图片同步任务必须支持 limit 或样本范围；大批量同步前先运行精确测试和小批量验收。
- 外部 wiki API 失败不得静默吞掉；报告里至少记录失败 URL、实体类型、失败原因。

## 审计口径

图片资产健康报告至少按实体输出：

- totalWithImage
- cachedHitCount
- wikiFallbackOnlyCount
- missingImageCount
- brokenCachedUrlSamples
- missingContentTypeCount
- staleLastVerifiedCount

## 阻断规则

以下情况阻断新的公开实体页面：

- 展示字段无法反查 source/original URL。
- managed/cache URL 被写入后原始 wiki/source URL 丢失。
- 公开页面只有 wiki 直链，没有缓存回填计划或明确豁免。
- 同一实体图片同步任务仍存在未解释的批量失败。

## 当前精确测试集合

```powershell
cd back
mvn "-Dtest=WikiImageSyncServiceImplTest,ItemImageServiceImplTest,ItemMapperPreferredImageSqlTest,AdminBuffControllerTest,AdminNpcControllerTest,AdminNpcRelationControllerTest,PublicNpcServiceImplImageTest" test
```
