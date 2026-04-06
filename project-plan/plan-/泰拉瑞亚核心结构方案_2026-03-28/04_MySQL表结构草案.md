# MySQL 表结构草案

## 1. 主表

### 1.1 `items`

```sql
CREATE TABLE items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  external_id BIGINT NULL,
  internal_name VARCHAR(255) NOT NULL UNIQUE,
  name_en VARCHAR(255) NOT NULL,
  name_zh VARCHAR(255) NULL,
  category_code VARCHAR(64) NOT NULL,
  rarity_id INT NULL,
  description TEXT NULL,
  tooltip TEXT NULL,
  damage INT NULL,
  defense INT NULL,
  use_time INT NULL,
  knockback DECIMAL(10,2) NULL,
  buy_price INT NULL,
  sell_price INT NULL,
  stack_size INT NULL,
  image_url VARCHAR(1024) NULL,
  status TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 1.2 `biomes`

```sql
CREATE TABLE biomes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL UNIQUE,
  name_en VARCHAR(255) NOT NULL,
  name_zh VARCHAR(255) NULL,
  layer_type VARCHAR(64) NULL,
  biome_type VARCHAR(64) NULL,
  description TEXT NULL,
  icon_url VARCHAR(1024) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 1.3 `bosses`

```sql
CREATE TABLE bosses (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL UNIQUE,
  name_en VARCHAR(255) NOT NULL,
  name_zh VARCHAR(255) NULL,
  stage_code VARCHAR(64) NULL,
  summon_item_id BIGINT NULL,
  is_hardmode TINYINT NOT NULL DEFAULT 0,
  description TEXT NULL,
  image_url VARCHAR(1024) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 1.4 `events`

```sql
CREATE TABLE events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL UNIQUE,
  name_en VARCHAR(255) NOT NULL,
  name_zh VARCHAR(255) NULL,
  event_type VARCHAR(64) NULL,
  is_hardmode TINYINT NOT NULL DEFAULT 0,
  trigger_conditions TEXT NULL,
  description TEXT NULL,
  image_url VARCHAR(1024) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 1.5 `npcs`

```sql
CREATE TABLE npcs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  external_id BIGINT NULL,
  internal_name VARCHAR(255) NOT NULL UNIQUE,
  name_en VARCHAR(255) NOT NULL,
  name_zh VARCHAR(255) NULL,
  npc_type VARCHAR(64) NOT NULL,
  is_town_npc TINYINT NOT NULL DEFAULT 0,
  is_boss TINYINT NOT NULL DEFAULT 0,
  damage INT NULL,
  defense INT NULL,
  life_max INT NULL,
  image_url VARCHAR(1024) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## 2. 关系表

### 2.1 配方

```sql
CREATE TABLE recipes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  result_item_id BIGINT NOT NULL,
  result_quantity INT NOT NULL DEFAULT 1,
  version_scope VARCHAR(128) NULL,
  notes TEXT NULL,
  source_page VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

```sql
CREATE TABLE recipe_ingredients (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  recipe_id BIGINT NOT NULL,
  ingredient_item_id BIGINT NULL,
  ingredient_name_raw VARCHAR(255) NULL,
  quantity_min INT NULL,
  quantity_max INT NULL,
  quantity_text VARCHAR(128) NULL,
  sort_order INT NOT NULL DEFAULT 0
);
```

```sql
CREATE TABLE recipe_stations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  recipe_id BIGINT NOT NULL,
  station_item_id BIGINT NULL,
  station_name_raw VARCHAR(255) NULL,
  is_alternative TINYINT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0
);
```

### 2.2 来源与图片

```sql
CREATE TABLE item_sources (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  item_id BIGINT NOT NULL,
  source_type VARCHAR(64) NOT NULL,
  source_ref_type VARCHAR(64) NULL,
  source_ref_name VARCHAR(255) NULL,
  quantity_text VARCHAR(128) NULL,
  chance_text VARCHAR(128) NULL,
  conditions TEXT NULL,
  notes TEXT NULL,
  biome_code VARCHAR(64) NULL,
  sort_order INT NOT NULL DEFAULT 0
);
```

```sql
CREATE TABLE item_images (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  item_id BIGINT NOT NULL,
  role VARCHAR(64) NOT NULL,
  provider VARCHAR(64) NOT NULL,
  source_file_title VARCHAR(255) NULL,
  source_page VARCHAR(255) NULL,
  source_revision_timestamp DATETIME NULL,
  original_url VARCHAR(1024) NULL,
  cached_url VARCHAR(1024) NULL,
  width INT NULL,
  height INT NULL,
  content_type VARCHAR(128) NULL,
  is_primary TINYINT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0
);
```

```sql
CREATE TABLE item_biomes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  item_id BIGINT NOT NULL,
  biome_id BIGINT NOT NULL,
  relation_type VARCHAR(64) NOT NULL,
  notes TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0
);
```

### 2.3 Boss / Event / NPC

```sql
CREATE TABLE boss_drops (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  boss_id BIGINT NOT NULL,
  item_id BIGINT NOT NULL,
  quantity_text VARCHAR(128) NULL,
  chance_text VARCHAR(128) NULL,
  notes TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0
);
```

```sql
CREATE TABLE event_drops (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  event_id BIGINT NOT NULL,
  item_id BIGINT NOT NULL,
  source_ref_name VARCHAR(255) NULL,
  quantity_text VARCHAR(128) NULL,
  chance_text VARCHAR(128) NULL,
  notes TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0
);
```

```sql
CREATE TABLE npc_shops (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  npc_id BIGINT NOT NULL,
  item_id BIGINT NOT NULL,
  conditions TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0
);
```

## 3. 阶段与快照

```sql
CREATE TABLE progression_stages (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0
);
```

```sql
CREATE TABLE snapshots (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  entity_type VARCHAR(64) NOT NULL,
  entity_id BIGINT NULL,
  provider VARCHAR(64) NOT NULL,
  source_kind VARCHAR(64) NOT NULL,
  source_locator VARCHAR(255) NULL,
  source_page VARCHAR(255) NULL,
  source_revision_timestamp DATETIME NULL,
  payload_json LONGTEXT NULL,
  fetched_at DATETIME NULL,
  parse_status VARCHAR(64) NULL,
  is_current TINYINT NOT NULL DEFAULT 1
);
```

## 4. 设计取向

这套草案故意偏保守：

- 主表保持清晰
- 复杂关系拆到关系表
- 时间、来源、排序字段尽量保留

后续如果要进一步规范，可以再加：

- 外键
- 版本表
- 多语言表
- 全文索引

但第一阶段不建议把模型搞得过重。
