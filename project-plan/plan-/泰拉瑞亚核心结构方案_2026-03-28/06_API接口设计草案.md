# API 接口设计草案

## 1. 设计目标

接口设计要服务三个核心场景：

- 前台检索与详情展示
- 后台管理与数据维护
- 数据同步与批量导入

因此接口建议分成三层：

- 前台读接口
- 后台管理接口
- 数据导入接口

## 2. 前台读接口

### 2.1 物品

- `GET /api/items`
- `GET /api/items/{id}`
- `GET /api/items/suggestions`

建议支持参数：

- `keyword`
- `categoryCode`
- `rarityId`
- `stageCode`
- `biomeCode`
- `sourceType`
- `page`
- `size`
- `sortBy`
- `sortDirection`

### 2.2 配方

- `GET /api/recipes`
- `GET /api/recipes/{id}`
- `GET /api/items/{id}/recipes`
- `GET /api/items/{id}/used-in-recipes`

### 2.3 群系

- `GET /api/biomes`
- `GET /api/biomes/{id}`
- `GET /api/biomes/{id}/items`

### 2.4 Boss

- `GET /api/bosses`
- `GET /api/bosses/{id}`
- `GET /api/bosses/{id}/drops`

### 2.5 事件

- `GET /api/events`
- `GET /api/events/{id}`
- `GET /api/events/{id}/drops`

### 2.6 NPC

- `GET /api/npcs`
- `GET /api/npcs/{id}`
- `GET /api/npcs/{id}/shop`

### 2.7 阶段推进

- `GET /api/progression/stages`
- `GET /api/progression/stages/{code}`
- `GET /api/progression/stages/{code}/recommendations`

## 3. 后台管理接口

### 3.1 主实体 CRUD

- `GET /api/admin/items`
- `POST /api/admin/items`
- `PUT /api/admin/items/{id}`
- `DELETE /api/admin/items/{id}`

- `GET /api/admin/biomes`
- `POST /api/admin/biomes`
- `PUT /api/admin/biomes/{id}`
- `DELETE /api/admin/biomes/{id}`

- `GET /api/admin/bosses`
- `POST /api/admin/bosses`
- `PUT /api/admin/bosses/{id}`
- `DELETE /api/admin/bosses/{id}`

- `GET /api/admin/events`
- `POST /api/admin/events`
- `PUT /api/admin/events/{id}`
- `DELETE /api/admin/events/{id}`

- `GET /api/admin/npcs`
- `POST /api/admin/npcs`
- `PUT /api/admin/npcs/{id}`
- `DELETE /api/admin/npcs/{id}`

### 3.2 关系数据管理

- `GET /api/admin/items/{id}/sources`
- `POST /api/admin/items/{id}/sources`
- `PUT /api/admin/item-sources/{id}`
- `DELETE /api/admin/item-sources/{id}`

- `GET /api/admin/items/{id}/images`
- `POST /api/admin/items/{id}/images`
- `PUT /api/admin/item-images/{id}`
- `DELETE /api/admin/item-images/{id}`

- `GET /api/admin/items/{id}/recipes`
- `POST /api/admin/items/{id}/recipes`
- `PUT /api/admin/recipes/{id}`
- `DELETE /api/admin/recipes/{id}`

### 3.3 图片与资源上传

- `POST /api/admin/upload/image`
- `POST /api/admin/items/{id}/images/upload`

## 4. 数据导入接口

### 4.1 批量导入

- `POST /api/import/items`
- `POST /api/import/item-relations`
- `POST /api/import/biomes`
- `POST /api/import/npcs`
- `POST /api/import/projectiles`
- `POST /api/import/buffs`

### 4.2 导入结果返回结构

建议统一返回：

- `success`
- `created`
- `updated`
- `skipped`
- `errors`
- `reportId`

## 5. 详情接口返回建议

详情接口不要只回主表字段，建议直接回聚合结果。

例如 `GET /api/items/{id}` 应直接返回：

- 基本属性
- 图片集合
- 来源集合
- 配方集合
- biome 关联
- 阶段信息
- 快照信息摘要

这样前端不需要一次详情页打很多散接口。

## 6. 列表接口返回建议

统一返回：

- `success`
- `data`
- `pagination`
- `filters`

分页字段建议：

- `page`
- `size`
- `total`
- `totalPages`

## 7. 搜索能力建议

至少应支持：

- 关键词搜索
- 分类筛选
- biome 筛选
- 阶段筛选
- Hardmode 筛选
- 来源类型筛选

## 8. 结论

API 设计的重点不是接口多，而是边界清晰：

- 前台负责读
- 后台负责维护
- 导入接口负责同步

同时，详情接口应尽量聚合，列表接口应尽量统一。
