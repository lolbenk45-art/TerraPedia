# 需求单:armor-sets 详情聚合端点(WP-10,消前端 N+1)

- 提出:2026-07-17,前台整改计划 WP-10(`docs/plans/2026-07-17_front-pages-remediation-p0-p2-plan.md`)
- 状态:待后端排期(前端兜底开关方案已定,后端未就绪不阻塞)

## 背景

`front-nuxt/pages/armor-sets/[id].vue` 水合后按部件逐个拉取两类二级数据:

- 每部件 1 次 `/api/public/equipment-effects`(部件装备效果,约 :797 的 `server:false` useAsyncData)
- 每部件 1 次 `/api/public/items/{itemId}/recipe-tree`(配方摘要,约 :1932)

10 部件套装 = 水合后 **20 个客户端请求批次**(R2 审查实测)。`server:false` 是为规避 hydration mismatch 的已知取舍,根治需后端聚合。

## 需求

`GET /api/public/armor-sets/{id}?include=piece-effects,recipes`

- `include` 缺省时行为与现状完全一致(向后兼容,前端旧路径不受影响)
- `include=piece-effects`:响应内联每个部件的装备效果数组(等价于现逐件 equipment-effects 查询结果,按 pieceItemId 分组)
- `include=recipes`:内联每个部件的配方摘要(等价于现 recipe-tree maxDepth=1 的直接配方层,无需全树)
- 响应形状建议在现 detail data 上加 `pieceEffects: { [itemId]: [...] }` 与 `pieceRecipes: { [itemId]: [...] }` 两个可选键
- 注意:该控制器现有 "success 无 data" 的响应 quirk(前端 normalize 层已兜底),新增键请挂在与现 data 同层,别改变既有键结构

## 验收

- 前端改造后(消费聚合响应+保留旧路径开关)armor-sets 详情页总请求数 ≤3(现 20+)
- 旧客户端(不带 include)行为零变化

## 前端侧配合(已在 WP-10 前端范围)

- 详情页检测聚合键存在则跳过逐件取数;不存在自动回退旧路径(开关即字段探测,无需配置项)
