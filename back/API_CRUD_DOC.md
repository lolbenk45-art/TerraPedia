# Back CRUD API 文档

## 概览

- 服务地址：`http://localhost:18088/api`
- 响应格式：统一返回 `ApiResponse<T>`
- 已实测跑通：
  - `items`：列表、详情、新增、更新、删除
  - `categories`：树列表、详情、新增、更新、删除
  - 异常路径：删除存在子分类的分类会返回 `400`

统一响应示例：

```json
{
  "success": true,
  "data": {},
  "message": "操作成功",
  "statusCode": 200,
  "pagination": {
    "total": 10,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

错误响应示例：

```json
{
  "success": false,
  "message": "分类下存在子分类，无法删除",
  "statusCode": 400
}
```

## Items

### GET `/items`

用途：分页查询物品列表。

查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `page` | `number` | 否 | 页码，默认 `1` |
| `limit` | `number` | 否 | 每页数量，默认 `20` |
| `search` | `string` | 否 | 按 `name/internal_name` 模糊搜索 |
| `categoryId` | `number` | 否 | 分类 ID |
| `rarity` | `string` | 否 | 稀有度文本，可传 `普通/稀有/史诗/传说` |

返回 `data` 字段示例：

```json
[
  {
    "id": 10911,
    "name": "plan_item_probe",
    "internalName": "PLAN_ITEM_PROBE_1773483033297",
    "image": "http://example.com/probe.png",
    "categoryId": 1,
    "categoryName": "BUFF",
    "rarityId": 1,
    "rarity": "普通",
    "description": "probe item",
    "damage": 5,
    "defense": 1,
    "createdAt": "2026-03-14T18:10:33",
    "updatedAt": "2026-03-14T18:10:33"
  }
]
```

### GET `/items/{id}`

用途：查询单个物品详情。

路径参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `number` | 是 | 物品 ID |

### POST `/items`

用途：创建物品。

请求体：

```json
{
  "name": "铜剑",
  "categoryId": 1,
  "rarityId": 1,
  "description": "基础近战武器",
  "damage": 8,
  "defense": 0,
  "imageUrl": "http://example.com/copper-sword.png"
}
```

说明：

- `internalName` 可不传，后端会自动生成。
- `imageUrl` 会自动映射到数据库字段 `image`。
- `rarityId` 与 `rarity` 二选一即可，优先使用 `rarityId`。

### PUT `/items/{id}`

用途：更新物品。

请求体与 `POST /items` 基本一致。

### DELETE `/items/{id}`

用途：删除物品。

返回示例：

```json
{
  "success": true,
  "data": null,
  "message": "物品删除成功",
  "statusCode": 200
}
```

## Categories

### GET `/categories`

用途：查询分类树。

说明：

- 当前默认直接返回树结构。
- 每个节点都包含 `children` 数组，可直接给前端树组件使用。

返回 `data` 字段示例：

```json
[
  {
    "id": 14,
    "name": "NPC",
    "code": "CATEGORY_NPC",
    "topType": "NPC",
    "sort": 10,
    "description": "NPC 分类",
    "icon": "npc",
    "children": [],
    "level": 1,
    "createdAt": "2026-01-30T13:03:30",
    "updatedAt": "2026-01-30T13:03:30"
  }
]
```

### GET `/categories/{id}`

用途：查询单个分类详情。

路径参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `number` | 是 | 分类 ID |

### POST `/categories`

用途：创建分类。

请求体：

```json
{
  "name": "武器",
  "parentId": null,
  "sortOrder": 1,
  "description": "武器分类",
  "icon": "sword"
}
```

说明：

- `parentId: null` 表示顶级分类，后端会自动转成数据库中的根节点值。
- `sortOrder` 会自动映射到数据库字段 `sort`。
- `code` 可不传，后端会自动生成唯一编码。
- `topType` 可不传，后端默认写空字符串。

### PUT `/categories/{id}`

用途：更新分类。

请求体与 `POST /categories` 基本一致。

补充：

- 可以更新 `parentId`，后端会校验不能把自己设为父分类，也不能形成循环引用。

### DELETE `/categories/{id}`

用途：删除分类。

删除限制：

- 如果该分类下还有子分类，接口会返回 `400`。

失败示例：

```json
{
  "success": false,
  "message": "分类下存在子分类，无法删除",
  "statusCode": 400
}
```

## 前端对接字段说明

建议前端直接按下面字段消费：

| 前端字段 | 后端返回/接收字段 | 备注 |
| --- | --- | --- |
| `imageUrl` | 请求时传 `imageUrl`，返回时读 `image` 或 `imageUrl` | 后端已兼容 `imageUrl -> image` |
| `categoryName` | `categoryName` | 列表/详情接口返回 |
| `rarity` | `rarity` | 列表/详情接口返回文本 |
| `sortOrder` | 请求时传 `sortOrder`，返回时读 `sort` | 后端已兼容 `sortOrder -> sort` |
| `parentId` | `parentId` | 顶级分类返回 `null` |

## 数据库变更说明

如果你的本地库是旧结构，至少需要补这些列：

```sql
ALTER TABLE category ADD COLUMN icon VARCHAR(255) NULL;
ALTER TABLE category ADD COLUMN deleted TINYINT DEFAULT 0;
ALTER TABLE items ADD COLUMN damage INT NULL;
ALTER TABLE items ADD COLUMN defense INT NULL;
```

如果需要重新初始化，可参考 `back/src/main/resources/schema.sql`。

## 数据库重构新增只读接口（Phase 1）

以下接口用于读取新关系表数据，遵循“旧接口不变 + 新接口增量暴露”的策略。

### GET `/items/{id}/recipes`

用途：查询可产出该物品的配方列表。

路径参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `number` | 是 | 物品 ID |

返回 `data` 示例：

```json
[
  {
    "id": 101,
    "resultItemId": 7,
    "resultQuantity": 1,
    "ingredients": [
      {
        "ingredientItemId": 9,
        "ingredientNameRaw": "Wood",
        "quantityMin": 10,
        "quantityMax": 10
      }
    ],
    "stations": [
      {
        "stationItemId": 33,
        "stationNameRaw": "Work Bench",
        "isAlternative": false
      }
    ]
  }
]
```

### GET `/items/{id}/sources`

用途：查询物品获取来源（掉落、合成、商店等）。

路径参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `number` | 是 | 物品 ID |

返回 `data` 示例：

```json
[
  {
    "id": 201,
    "itemId": 7,
    "sourceType": "drop",
    "sourceRefName": "Zombie",
    "chanceText": "50%",
    "quantityText": "1-2",
    "biomeName": "Forest"
  }
]
```

### GET `/items/{id}/images`

用途：查询物品图片列表。

读取策略：

- 优先读取 `item_images` 表。
- 当 `item_images` 无数据时，自动回退读取 `items.image`（兼容旧数据）。

路径参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `number` | 是 | 物品 ID |

返回 `data` 示例：

```json
[
  {
    "itemId": 7,
    "role": "icon",
    "cachedUrl": "https://cdn.example.com/items/7.png",
    "isPrimary": true,
    "sortOrder": 0
  }
]
```

### GET `/biomes`

用途：查询群系列表。

返回 `data` 示例：

```json
[
  {
    "id": 1,
    "code": "forest",
    "nameEn": "Forest",
    "nameZh": "森林"
  }
]
```

### GET `/biomes/{id}`

用途：查询单个群系详情。

路径参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `number` | 是 | 群系 ID |

失败示例（不存在）：

```json
{
  "success": false,
  "message": "Biome not found",
  "statusCode": 404
}
```
