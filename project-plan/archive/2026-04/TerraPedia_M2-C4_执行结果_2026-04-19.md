# TerraPedia M2-C4 执行结果

日期：2026-04-19  
执行分支：`feature/m2-c4-townnpc-backend`  
基线分支：`feature/npc-domain-m1-m2`

---

## 本轮结论

`M2-C4` 已完成一轮可验证执行，但结果不是“大量后端实现变更”，而是：

1. Town NPC maintenance contract 已被测试冻结
2. Town NPC admin payload contract 已被测试冻结
3. `data-query-app` 的 Town NPC editor detail contract 已从 `any` 收紧为显式类型
4. Public NPC aggregate contract 已被测试冻结
5. Public frontend aggregate contract 已被静态类型冻结

这说明当前主线代码在 Town NPC maintenance/public aggregate 这两条链路上，业务实现本身已经基本可用；本轮主要新增的是“防漂移约束”。

---

## 实际变更

### 后端测试冻结

- `back/src/test/java/com/terraria/skills/service/TownNpcMaintenanceDomainMapperTest.java`
- `back/src/test/java/com/terraria/skills/controller/AdminNpcControllerTest.java`
- `back/src/test/java/com/terraria/skills/controller/PublicNpcAggregateControllerTest.java`

### 管理端类型冻结

- `data-query-app/types/npcDomain.ts`
- `data-query-app/types/npcDomain.typecheck.ts`

### 公开端类型冻结

- `front/src/types/npcDomain.typecheck.ts`

---

## 验证证据

### 1. 后端精确测试

执行：

```powershell
cd back
mvn "-Dtest=TownNpcMaintenanceDomainMapperTest,AdminNpcControllerTest,PublicNpcAggregateControllerTest,NpcControllerTest" test
```

结果：

- `12` tests
- `12` pass
- `0` fail

### 2. crawler 回归

执行：

```powershell
node --test data/wiki-crawler/tests/*.test.mjs
```

结果：

- `55` tests
- `55` pass
- `0` fail

### 3. 管理端类型检查

执行：

```powershell
cd data-query-app
pnpm run check
```

结果：

- PASS

### 4. 公开端静态与构建验证

执行：

```powershell
cd front
pnpm exec vue-tsc --noEmit
pnpm exec vite build
```

结果：

- 静态类型检查通过
- 生产构建通过

备注：

- 在当前 isolated worktree 下，`front` 的 `pnpm run check` / `pnpm run build` 脚本入口没有稳定找到本地 bin
- 直接使用 `pnpm exec` 可以稳定完成同等验证

---

## 本轮提交

本轮在执行分支上形成的提交：

1. `1f7e9a2` `test: freeze town npc maintenance contract`
2. `b591be7` `test: freeze town npc admin maintenance payload`
3. `7422bf8` `feat: align town npc admin maintenance flow`
4. `077e6ca` `test: freeze public town npc aggregate contract`
5. `e1be362` `test: freeze public town npc frontend contract`

---

## 风险

### 1. 仍未把 worktree 中的这些提交并回主线

当前结果还在 `feature/m2-c4-townnpc-backend`，尚未回收进 `feature/npc-domain-m1-m2`。

### 2. 业务代码改动很少，说明本轮重点在“冻结”，不是“扩功能”

如果后续要接 Town NPC crawler/bridge 的更多字段到 maintenance/public 页面，还需要新一轮明确的字段提升计划。

### 3. `front` 的脚本入口在 isolated worktree 下存在环境差异

虽然 `pnpm exec vue-tsc` 和 `pnpm exec vite build` 已验证通过，但需要记住当前 worktree 对 `pnpm run check/build` 的 PATH 解析不稳定。

---

## 阻塞情况

本轮没有代码级阻塞。

唯一碰到的是环境级问题：

- `data-query-app` / `front` 新 worktree 初始没有依赖
- `front` 的脚本入口在当前 worktree 下 PATH 解析不稳定

这两个问题都已通过安装依赖和改用 `pnpm exec` 绕开。

---

## 是否需要刷新、重启、重跑

- 不需要重启后端服务
- 不需要重启本地 crawler
- 如果后续继续在这个 isolated worktree 上做前端验证，建议直接沿用：

```powershell
cd front
pnpm exec vue-tsc --noEmit
pnpm exec vite build
```

而不是依赖 `pnpm run check` / `pnpm run build`

---

## 下一步建议

下一步有两个合理选项：

1. 先把 `feature/m2-c4-townnpc-backend` 回收到 `feature/npc-domain-m1-m2`
2. 在当前 worktree 继续下一轮真正的业务接入任务：
   - 把 Town NPC crawler/bridge 已闭环字段进一步接入 maintenance/public 展示面

如果按当前节奏，优先建议先收回本轮契约冻结提交，再决定是否继续扩大 Town NPC 的公开消费字段。
