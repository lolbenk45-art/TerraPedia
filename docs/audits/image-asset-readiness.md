# Image Asset Readiness

状态：当前为人工索引版，后续可由只读审计脚本生成。

## 当前事实

- item 图片已优先读取 `item_images.cached_url`，并保留 `original_url` / legacy wiki fallback。
- buff 图片已通过 `V40__add_buff_image_cache_columns.sql` 增加 `image_original_url`、`image_cached_url`、`image_content_type`、`image_last_verified_at`。
- `WikiImageSyncServiceImpl` 已承担 wiki image 解析、下载、MinIO materialization、fallback 回填职责。
- NPC/Biome/Projectile/Article 仍需要统一 source/cache/fallback 契约。

## 当前验收命令

```powershell
cd back
mvn "-Dtest=WikiImageSyncServiceImplTest,ItemImageServiceImplTest,ItemMapperPreferredImageSqlTest,AdminBuffControllerTest,AdminNpcControllerTest,AdminNpcRelationControllerTest,PublicNpcServiceImplImageTest" test
```

## 后续审计脚本目标

未来只读脚本应输出：

- 每类实体图片总量。
- MinIO cache 命中数量。
- 仅 wiki fallback 数量。
- 缺图数量。
- content type 缺失数量。
- last verified 过期数量。
- broken cache URL 样本。

## 当前准入结论

图片资产可以支撑已有 item/buff/npc 局部展示修补，但不能直接支撑 Boss/Biome/Projectile 等新增公开详情页。新增公开实体必须先通过图片 source/cache/fallback 验收。
