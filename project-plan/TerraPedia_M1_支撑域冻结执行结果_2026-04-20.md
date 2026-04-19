# TerraPedia M1 支撑域冻结执行结果

日期：2026-04-20  
执行分支：`feature/npc-domain-m1-m2`

---

## 本轮结论

本轮把 `M1: 支撑域冻结` 落成了一个最小可验证闭环，重点不是新增页面，而是把当前已经存在但口径分散的支撑域真正收回到统一入口：

1. `Categories / Taxonomy`
   - 继续以现有 `CategoryManagementService + /categories + /admin/categories` 作为 canonical 入口
   - 新增支持域目录时，把 item category tree/path 显式投影进统一 catalog
2. `Game Periods`
   - 补齐 `game_period` 的正式实体、mapper、service 和 admin catalog 输出
   - 管理端不再在多个页面各自写死 `0/1/2 -> 文案`
3. `World Contexts`
   - 继续以 `world_contexts` 表和 `AdminWorldContextController` 为事实来源
   - 在统一 support catalog 中输出稳定 option 结构，供关系域与管理端消费

这意味着 `M1` 本轮冻结的不是“所有支撑域页面”，而是：

- 支撑域的统一读取口径
- 管理端时期/世界条件消费面的统一 option contract
- category / game period / world context 在代码层的显式支撑域身份

---

## 实际变更

### 后端

- 新增 `GamePeriod` 实体与 `GamePeriodMapper`
- 新增 `SupportDomainService` / `SupportDomainServiceImpl`
- 新增 `AdminSupportDomainController`
- 新增 DTO：
  - `SupportDomainCatalogDTO`
  - `SupportDomainOptionDTO`
  - `SupportCategoryOptionDTO`

### 管理端

- 新增 `data-query-app/stores/supportDomains.ts`
- 把以下消费点切到统一 support store：
  - `data-query-app/pages/items.vue`
  - `data-query-app/components/ItemDetail.vue`
  - `data-query-app/components/ItemRecipeEditor.vue`
  - `data-query-app/pages/entities/town-npcs/[id]/edit.vue`
  - `data-query-app/components/TownNpcWorkbenchModal.vue`
- 新增类型合同检查：
  - `data-query-app/types/supportDomains.typecheck.ts`

### 测试

- 新增 `SupportDomainServiceImplTest`
- 新增 `AdminSupportDomainControllerTest`

---

## 验证证据

### 1. 后端 support-domain 精确测试

执行：

```powershell
cd back
mvn "-Dtest=SupportDomainServiceImplTest,AdminSupportDomainControllerTest,AdminNpcControllerTest,TownNpcMaintenanceDomainMapperTest" test
```

结果：

- `8` tests
- `8` pass
- `0` fail

### 2. 管理端类型检查

执行：

```powershell
cd data-query-app
pnpm run check
```

结果：

- PASS

### 3. 管理端生产构建

执行：

```powershell
cd data-query-app
pnpm run build
```

结果：

- PASS

---

## 本轮冻结下来的支撑域口径

### Categories / Taxonomy

- canonical source: `CategoryManagementService`
- admin/query entry:
  - `/categories`
  - `/categories/items`
  - `/admin/categories`
- support catalog projection:
  - `itemCategories[]`
  - 字段：`id / parentId / code / label / pathLabel / level / sortOrder / status`

### Game Periods

- canonical source: `game_period`
- support catalog projection:
  - `gamePeriods[]`
  - 字段：`id / code / label / labelZh / labelEn / sortOrder / status`
- 管理端统一消费：
  - item filter / item editor
  - town npc editor / workbench
  - item detail label fallback

### World Contexts

- canonical source: `world_contexts`
- admin detail/query entry:
  - `/admin/world-contexts`
- support catalog projection:
  - `worldContexts[]`
  - 字段：`id / code / label / labelZh / labelEn / contextType / sortOrder / status`
- 管理端统一消费：
  - `ItemRecipeEditor` 条件选项

---

## 残余风险

1. `AdminTownNpcMaintenanceController` 仍保留自身的 game period label 生成逻辑
   - 本轮没有继续改它，避免把已稳定的 Town NPC 维护链路再次扩大
   - 后续如要彻底消除所有硬编码，可在 `M3` 里把 overview label 也切到 support service

2. `front` 公开站仍存在部分独立的 game period 展示逻辑
   - 本轮范围限定在 `M1` 的支撑域冻结和管理端消费面
   - 公开消费面对齐应放在 `M5`

3. Categories 本轮主要是“显式冻结现有 canonical”，不是重做分类体系
   - 若后续出现 item / npc / recipe 对同一分类 code 的解释差异，仍需在后续里程碑补专门验收

---

## 下一步建议

按正式里程碑顺序，`M1` 这轮最小冻结已经具备继续往下推进的条件。下一步有两个合理入口：

1. 继续补齐 `M1` 的残余验收
   - 把 `AdminTownNpcMaintenanceController` 的时期文案也接到 support service
   - 进一步审计 category path 在 item / npc / recipe 三条链路的解释是否一致
2. 切回 `M2 / M3` 主线
   - 以已冻结的 support domains 为底座，继续推进 Town NPC source / maintenance 闭环

如果保持当前节奏，更合理的是：

> 收住 `M1` 当前结果，下一轮开始接 `M3: Town NPC 维护闭环` 的剩余项，而不是直接扩大公开消费面。
