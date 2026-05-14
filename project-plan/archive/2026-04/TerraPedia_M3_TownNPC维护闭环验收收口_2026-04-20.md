# TerraPedia M3 Town NPC 维护闭环验收收口

日期：2026-04-20  
执行分支：`feature/npc-domain-m1-m2`

---

## 验收结论

`M3：Town NPC 维护闭环` 已完成代码层与构建层的核心收口，可以进入切换 `M4` 前的最终判断。

当前结论：

1. Town NPC 维护台 overview / detail / edit 的字段口径已稳定。
2. `gamePeriod / behavior / shop / unmatchedShopItems` 已有明确维护入口和解释口径。
3. 保存链路已返回 `insert / replace / skip / remove` 统计摘要。
4. 批量维护台已展示 `review / unmatched / no source` 等批量验收信号。
5. 相关后端契约测试、管理端 typecheck、管理端生产构建均已通过。
6. 本地栈运行态 smoke 已通过。

因此，`M3` 不再只是“有页面”，而是已具备“可持续维护、可批量复核、可解释保存结果”的最小闭环，并可切入 `M4`。

---

## 本轮新增收口内容

### 1. 保存变更可审计

提交：

- `9c2bc6b feat: audit town npc shop maintenance mutations`

完成内容：

- 后端 `POST /admin/npcs`、`PUT /admin/npcs/{id}` 在保存 `shopEntries` 后返回 `shopMutationSummary`。
- 统计字段：
  - `submittedCount`
  - `persistedCount`
  - `insertedCount`
  - `replacedCount`
  - `skippedCount`
  - `removedCount`
- 管理端保存提示已展示这些统计。
- Workbench 保存 payload 已保留 `shopEntries[].id`，后端可区分 replace 与 insert。

### 2. 批量复核信号可见

提交：

- `a1974c0 feat: surface town npc maintenance review signals`

完成内容：

- Maintenance overview `summary` 新增批量验收指标：
  - `missingScrapeCount`
  - `unmatchedShopNpcCount`
  - `unmatchedShopItemCount`
  - `rowsNeedingAttentionCount`
- 管理端 Town NPC 维护台新增 summary cards：
  - `REVIEW`
  - `UNMATCHED`
  - `NO SOURCE`
- 列表排序优先展示更需要复核的 NPC：
  - 基础维护缺口
  - 未匹配售卖物
  - 缺少抓取源

### 3. 支撑域标签已对齐

提交：

- `da6b966 feat: align town npc maintenance period labels`

完成内容：

- Town NPC 维护台的时期标签统一来自支撑域。
- 避免维护台继续维护一套隐式时期解释。

---

## 验证证据

### 后端测试

执行：

```powershell
cd back
mvn "-Dtest=AdminTownNpcMaintenanceControllerTest,AdminNpcControllerTest,TownNpcMaintenanceDomainMapperTest,SupportDomainServiceImplTest,AdminSupportDomainControllerTest" test
```

结果：

- `11` tests
- `11` pass
- `0` fail

### 管理端类型检查

执行：

```powershell
cd data-query-app
pnpm run check
```

结果：

- PASS

### 管理端生产构建

执行：

```powershell
cd data-query-app
pnpm run build
```

结果：

- PASS

### 本地运行态 smoke

执行环境：

- 本地三端通过 `scripts/dev/start-local-stack.ps1` 启动
- 后端端口：`18088`
- 管理端端口：`3001`
- 管理员登录账号使用 `scripts/dev/config/local-stack.config.json` 中本地开发配置

执行动作：

1. `POST /api/auth/login`
2. `GET /api/admin/town-npcs/maintenance`
3. `GET /api/admin/npcs/83`
4. `PUT /api/admin/npcs/83`
5. `GET /api/admin/npcs/83`

运行态结果：

- 管理员登录成功
- maintenance overview 返回成功
- overview summary 返回：
  - `totalTownNpcs = 39`
  - `rowsNeedingAttentionCount = 37`
  - `unmatchedShopItemCount = 54`
  - `missingScrapeCount = 0`
- 以 `商人 (npcId = 83)` 做一次等价保存 smoke，保存成功
- 返回 `shopMutationSummary`：
  - `submittedCount = 29`
  - `persistedCount = 29`
  - `insertedCount = 0`
  - `replacedCount = 29`
  - `skippedCount = 0`
  - `removedCount = 0`
- 保存后再次读取 detail 成功，`shopEntries` 数量仍为 `29`

备注：

- Nuxt build 仍输出既有 sourcemap / Node deprecation warning。
- 这些 warning 未阻断构建，不是本次 M3 改动引入的失败。

---

## M3 完成标准对照

| M3 标准 | 当前状态 | 证据 |
| --- | --- | --- |
| 管理端可以用统一字段口径查看和修正 Town NPC | 已满足 | overview / detail / edit 已共用 Town NPC 维护字段与支撑域时期标签 |
| `matched / unmatched / replaced / skipped` 的结果可解释 | 已满足 | overview 暴露 unmatched 批量指标，保存响应暴露 mutation summary |
| 管理端手工校正链可反复执行 | 已满足 | 保存后可刷新 overview，并显示本轮保存统计 |
| import / replace / skip 规则固定 | 基本满足 | import report 已接入，保存链路新增 replace / skip / remove 摘要 |
| Town NPC 可持续维护 | 已满足最小闭环 | REVIEW / UNMATCHED / NO SOURCE 指标可用于批量复核 |

---

## 剩余风险

### 1. 未匹配售卖物仍是数据治理工作，不是代码阻塞

历史 import report 中仍存在未匹配售卖物，例如晶塔、节日物品、特殊服装等。

这些问题当前已经能在维护台被看见和复核，不再属于“链路不可解释”，但仍属于后续数据治理待办。

### 2. Public NPC 消费面不是 M3 范围

M3 只收 Town NPC 维护闭环。公开消费面仍应等待 `M4` 关系域稳定后，在 `M5` 处理。

---

## 是否切换 M4

当前判断：

- **代码层 / 构建层：已满足。**
- **运行态 smoke：已满足。**
- **结论：可以切换到 `M4`。**

建议下一步：

1. 把 `M3` 正式标记为完成。
2. 下一任务切入 `M4：配方与关系域闭环`。
3. 优先冻结 recipe / station / group / condition 的统一验收口径，再开始扩实现。
