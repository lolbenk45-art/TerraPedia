# TerraPedia M8-M10 前台公开能力正式里程碑计划
日期：2026-04-22  
执行分支：`feature/npc-domain-m1-m2`  
适用阶段：`M5-M7` 连续收口完成后，进入 `Phase C：前台公开能力扩展与发布质量`

---

## 1. 任务定位

本批里程碑不再继续扩展新的后台数据域，也不回退去重做已验收的 `M5-M7`。  
本批的唯一目标是：

> 把已经稳定的后台数据能力，组织成真实可访问、可索引、可复用、可持续扩展的前台公开产品能力。

这意味着后续默认推进方向从：

- 后台管理闭环
- 数据导入闭环
- 审计与验收闭环

转为：

- 公共 API 契约
- 前台实体页能力
- SEO / Sitemap / 内容联动

---

## 2. 当前阶段判断

截至当前批次，已明确关闭的里程碑为：

- `M5`：NPC 公开消费闭环
- `M6`：Boss 聚合域闭环
- `M7`：次级成熟域接入

当前前后台真实状态如下。

### 2.1 前台现状

前台已有公开路由：

- `/items`
- `/items/:id`
- `/npcs`
- `/npcs/:id`
- `/articles`
- `/articles/:id`

前台尚缺：

- `/bosses`
- `/bosses/:id` 或 `/bosses/:slug`
- `/biomes`
- `/biomes/:id` 或 `/biomes/:slug`

### 2.2 后台现状

已存在公开能力：

- `NPC` 已有公开 list / detail / aggregate
- `Biome` 已有只读公开接口

仍然缺口明显的部分：

- `Boss` 仍主要停留在管理端聚合口径
- 前台没有复用型的公开实体页壳层
- SEO、结构化数据、站内交叉联动尚未形成统一机制

### 2.3 阶段结论

当前项目已经不适合继续把时间投到“补更多后台实体域”上。  
真正的短板已经变成：

- 公开 DTO 与前台消费契约不统一
- 公开页面能力不完整
- 页面可以访问但不可发布、不可索引、不可联动

因此，下一批里程碑必须围绕“前台公开产品化”展开，而不是继续做后台域扩展。

---

## 3. 排期原则

### 3.1 不回头扩新后台域

本批默认不优先投入：

- 新的后台实体管理域
- 新的抓取脚本扩展
- 新的次级数据域验收

除非它是 `Boss / Biome` 公开能力落地的直接阻塞项，否则不纳入本批主线。

### 3.2 按“公开消费链”排期

本批固定按以下顺序推进：

1. 公开 API / DTO / 聚合契约
2. 前台路由与实体页
3. SEO / Sitemap / Structured Data
4. 文章与实体联动

### 3.3 只做高价值公开域

本批主公开域只覆盖：

- `Boss`
- `Biome`
- 已有 `NPC / Item / Article` 的公开层统一补齐

本批不升格为主公开域：

- `Projectile`
- `Buff`
- `Shimmer`
- `Armor Set`

这些域在本批仅作为补充信息源，不作为独立前台产品线。

---

## 4. 方案对比与结论

### 方案 A：继续按实体域补后台

做法：

- 继续补更多后台实体
- 继续补更多审计、导入与脚本

问题：

- 偏离当前项目阶段
- 不能直接提升前台产品完成度
- 会让项目继续停留在“后台越来越厚、前台仍不成型”

结论：

- 不采用

### 方案 B：按页面逐个推进

做法：

- 先做 Boss 页
- 再做 Biome 页
- 再补 SEO

优点：

- 直观
- 页面成果可感知

问题：

- 容易重复补 API、DTO、meta、壳层
- 同类问题会在多个实体页反复返工

结论：

- 可执行，但不是最优

### 方案 C：按公开产品链推进

做法：

- 先统一公共契约与共享壳层
- 再批量接 Boss / Biome 页面
- 再统一补 SEO、文章联动和发布质量

优点：

- 最符合当前阶段
- 可以减少 Boss / Biome / 后续公开域的重复返工
- 便于后续把更多实体页纳入同一框架

结论：

- **采用方案 C**

---

## 5. 新一批里程碑总览

| 里程碑 | 名称 | 主域 | 核心目标 |
| --- | --- | --- | --- |
| `M8` | 公开实体契约层 | Boss Public / Biome Public / Shared Public Shell | 先把前台公开消费契约和共享实体壳层做稳 |
| `M9` | 前台实体页扩展 | Boss List/Detail / Biome List/Detail / Public Navigation | 把 Boss / Biome 做成真实可访问的前台实体页 |
| `M10` | 发布质量与内容联动 | SEO / Sitemap / Structured Data / Articles / Cross-linking | 让前台实体页达到可发布、可索引、可联动水平 |

本批完成后，才考虑是否进入下一阶段：

- `M11`：开放生态 / API / 社区工作流

`M11` 不在本批默认执行范围内。

---

## 6. M8：公开实体契约层

### 6.1 目标

先统一前台公开消费层，不直接跳到页面细节实现。

### 6.2 范围

- `Boss Public Contract`
- `Biome Public Contract`
- `Shared Public Entity Shell`
- 共享 `meta / breadcrumb / hero / image / related entities` 口径

### 6.3 交付内容

- 新增或统一 Boss 公开 list / detail / aggregate API
- 规范 Biome 公开 list / detail API 的前台消费口径
- 明确前台实体页共享字段：
  - `id`
  - `slug` 或可稳定公开标识
  - `nameZh`
  - `nameEn`
  - `imageUrl`
  - `summary`
  - `description`
  - `metaTitle`
  - `metaDescription`
  - `relatedEntities`
- 建立前台共享实体壳层：
  - hero
  - breadcrumb
  - section layout
  - fallback 规则

### 6.4 完成标准

- Boss / Biome 公开 API 契约稳定
- 前台不再直接复用管理端 DTO
- 共享实体壳层可被 Boss / Biome 复用

### 6.5 默认执行批次

- `M8-R1`：Boss Public Contract
- `M8-R2`：Biome Public Contract Normalization
- `M8-R3`：Shared Public Entity Shell + Front Access Layer

### 6.6 本里程碑不做

- 不追求完整视觉打磨
- 不一次性铺开全部 SEO
- 不把 Projectile / Buff / Shimmer 拉入主公开页主线

---

## 7. M9：前台实体页扩展

### 7.1 目标

把 `M8` 中稳定下来的公开契约落到真实前台页面。

### 7.2 范围

- `Boss List / Detail`
- `Biome List / Detail`
- `Public Entity Navigation`
- 与现有 `NPC / Item / Article` 的站内连接

### 7.3 交付内容

- 新增前台路由：
  - `/bosses`
  - `/bosses/:id` 或 `/bosses/:slug`
  - `/biomes`
  - `/biomes/:id` 或 `/biomes/:slug`
- Boss 页面至少展示：
  - 基础信息
  - 召唤方式
  - 成员结构
  - 掉落
  - 图片
- Biome 页面至少展示：
  - 基础信息
  - 层级 / 类型
  - 关系
  - 资源 / 相关物品
- 站内导航补齐：
  - Boss
  - Biome

### 7.4 完成标准

- Boss / Biome 不再只存在于管理端
- 前台存在真实可访问页面
- 页面展示完全建立在 `M8` 公开契约之上

### 7.5 默认执行批次

- `M9-R1`：Boss List / Detail Page
- `M9-R2`：Biome List / Detail Page
- `M9-R3`：Public Navigation / Shared Search Entry / Cross-entry polish

### 7.6 本里程碑不做

- 不扩展过多新的公开实体页
- 不在本轮追求极致内容编排

---

## 8. M10：发布质量与内容联动

### 8.1 目标

把前台实体页从“能访问”提升到“可发布、可索引、可联动”。

### 8.2 范围

- `SEO / Metadata`
- `Sitemap / Discoverability`
- `Structured Data`
- `Article / Entity Cross-linking`
- `Performance / Cache / Empty State`

### 8.3 交付内容

- 为 `Boss / Biome / NPC / Item / Article` 统一补齐：
  - title
  - description
  - canonical
  - open graph
  - structured data
- sitemap 纳入：
  - items
  - npcs
  - bosses
  - biomes
  - articles
- 建立文章与实体双向联动：
  - 实体页展示相关文章
  - 文章页展示关联实体
- 收口公开页质量：
  - empty state
  - 404
  - 缺图兜底
  - 列表 / 详情缓存策略

### 8.4 完成标准

- Boss / Biome / NPC / Item / Article 形成统一公开网络
- 页面具备基础 SEO 与结构化能力
- 前台产品达到“可发布”标准

### 8.5 默认执行批次

- `M10-R1`：Metadata / Structured Data
- `M10-R2`：Sitemap / Discoverability
- `M10-R3`：Article Cross-linking / Publish Quality Closure

### 8.6 本里程碑不做

- 不进入开放 API 平台化
- 不做社区协作工作流
- 不做多语言站点级扩展

---

## 9. 顺序约束

本批必须遵守以下约束：

1. `M8` 先于 `M9`
2. `M9` 先于 `M10`
3. `M10` 完成前，不进入 `M11`
4. Boss / Biome 前台页必须建立在公开 DTO 之上，不能直接复用管理端 payload
5. 若出现阻塞，只允许做与 `Boss / Biome` 公开链直接相关的最小解阻

---

## 10. 真实入口与影响范围

本计划默认以下入口为真实落点。

### 10.1 前台入口

- `front/src/router/routes.ts`
- 现有 `items / npcs / articles` 前台页面与数据访问层

### 10.2 后台入口

- `back/src/main/java/com/terraria/skills/controller/AdminBossController.java`
- `back/src/main/java/com/terraria/skills/controller/BiomeController.java`
- `back/src/main/java/com/terraria/skills/controller/NpcController.java`
- `back/src/main/java/com/terraria/skills/controller/PublicNpcAggregateController.java`

### 10.3 缺口判断

- `Boss` 缺公开前台消费 API
- `Biome` 有公开只读 API，但未形成前台产品契约
- 前台路由层尚无 Boss / Biome 公开实体页

这也是本批里程碑的真实边界来源。

---

## 11. 默认验证矩阵

### M8

- 公开 API contract 样本校验
- `front` typecheck
- 共享 entity shell 渲染校验

### M9

- 前台路由 smoke：
  - `/bosses`
  - `/bosses/:id` 或 `/bosses/:slug`
  - `/biomes`
  - `/biomes/:id` 或 `/biomes/:slug`
- API 与页面样本对齐
- 基础移动端可用性检查

### M10

- SEO / meta 样本校验
- sitemap 生成校验
- 页面公开访问 smoke
- 空状态 / 404 / 缺图兜底校验

---

## 12. 风险与默认处理原则

### 风险 1：Boss 公开 DTO 直接照搬管理端结构

后果：

- 前台与管理端耦合
- 后续页面不断返工

默认处理：

- `M8` 先拆出独立公开契约，不接受直接把管理端 payload 暴露给前台

### 风险 2：Biome 已有 API 但字段口径不适合前台

后果：

- 页面层补过多转换逻辑
- 页面与数据层边界再次变脏

默认处理：

- 在 `M8-R2` 统一做前台消费归一化

### 风险 3：页面先落地，SEO 和联动长期拖欠

后果：

- 页面“能打开但不可发布”
- 前台产品化停在半成品

默认处理：

- `M10` 作为强制收口里程碑，不跳过

---

## 13. 当前默认执行入口

本计划确认后，默认从以下顺序开始执行：

1. `M8-R1`：Boss Public Contract
2. `M8-R2`：Biome Public Contract Normalization
3. `M8-R3`：Shared Public Entity Shell

不再回头扩新的后台次级域，不再把里程碑重心放回导入与验收型工作。

---

## 14. 本轮结论

`M5-M7` 结束后，TerraPedia 的下一阶段不应继续围绕“后台域补完”展开，而应正式进入：

> `Boss / Biome` 前台公开能力建设 + 统一发布质量收口

本文件就是当前默认执行的正式里程碑计划。后续主线按：

- `M8`
- `M9`
- `M10`

连续推进，直到前台公开能力达到可发布标准。
