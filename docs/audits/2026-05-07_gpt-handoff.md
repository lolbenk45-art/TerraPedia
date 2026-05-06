# GPT Handoff — 2026-05-07 审查修正汇总

## 背景

Claude Code (DeepSeek) 为 P0-P2 执行计划的 34 项交付物创建了 `scripts/dev/acceptance-test.ps1`（真实环境验收脚本）。GPT 对该脚本进行了 4 轮审查，每轮发现的边界漏洞均已修正。

## 当前 HEAD

`main` @ `1b5ca90`

## 涉及文件

| 文件 | 状态 |
|------|------|
| `scripts/dev/acceptance-test.ps1` | 4 轮修正完成，边界到位 |
| `.github/workflows/scheduled-staleness-monitor.yml` | issue 去重已修正 |
| `docs/audits/2026-05-07_p0-p2-delivery-summary.md` | 文档语义已同步 |

## 验收脚本的关键边界（已锁定）

### 1. DB 不可用行为
- 默认：Phase 2 全部 6 步 **FAIL**（exit 1）
- 显式 `-AllowDbSkip` 才允许 SKIP
- 运行时：`powershell -File scripts/dev/acceptance-test.ps1` 或 `powershell -File scripts/dev/acceptance-test.ps1 -AllowDbSkip`

### 2. blocked 状态检查（`Test-AcceptanceBlocked` 函数）
检查 5 条路径，任一命中 → FAIL：
- `parsed.status === 'blocked'`
- `parsed.overallStatus === 'blocked'`
- `parsed.summary.status === 'blocked'`
- `parsed.summary.blockingCount > 0`
- `parsed.summary.schemaViolations > 0`

### 3. 链式步骤（审计→计划→告警）
- 全部通过 `Invoke-AcceptanceStep -OutputPath <path>` 调用
- 共用 blocked 检查，无绕过
- 上游失败导致临时文件缺失 → 下游 SKIP（消息明确标注 "upstream failed:"）

### 4. 步骤计数
- Phase 1：13 步（无需 DB）
- Phase 2：6 步（需 DB）
- 总计：最多 19 步

### 5. 结构校验
- 每步验证 JSON stdout 的关键顶层 key
- 不校验具体值（因依赖实时数据状态）
- 脚本 exit code ≠ 0 → FAIL
- 无 stdout 输出 → FAIL

### 6. 运行方式
```powershell
# 完整（DB 必须可用，否则 exit 1）
powershell -File scripts/dev/acceptance-test.ps1

# 仅无 DB
powershell -File scripts/dev/acceptance-test.ps1 -SkipDb

# 允许 DB 不可用时跳过
powershell -File scripts/dev/acceptance-test.ps1 -AllowDbSkip

# 自定义共享数据路径
powershell -File scripts/dev/acceptance-test.ps1 -SharedDataRoot D:\data\terraPedia
```

## Workflow 去重策略（已修正）

`scheduled-staleness-monitor.yml` 的 Issue 创建步骤：
1. `gh issue list --label stale-evidence --state open --limit 1`
2. 存在 open issue → `gh issue comment` 追加状态
3. 不存在 → `gh issue create` 新建

同一时刻最多 1 个 open stale-evidence issue，跨天持续阻断只追加评论。

## GPT 修正完成 — Claude 审查结论

GPT 已按 handoff 3 项建议完成所有代码修改，并额外修复了 2 个 handoff 未覆盖的边界问题。

### 已完成的修正（6 项）

| # | 来源 | 内容 | 状态 |
|---|------|------|------|
| 1 | handoff H1 | `Get-OptionalArrayCount` 安全数组计数 | ✅ |
| 2 | handoff H2 | `coverageRate < 1` / `hashMatchRate < 1` / `missingLandingInputs.Count > 0` 强制检查 | ✅ |
| 3 | handoff M1 | `-FailOnWarning` 开关，默认 false | ✅ |
| 4 | GPT 自行发现 | PowerShell 5 兼容（`??` → `if`/`else`、`$host` → `$dbHostValue`、`+=` 构建数组、`Count-ResultsByStatus` 包装器）| ✅ |
| 5 | GPT 自行发现 | UTF-8 no BOM 输出（`Set-Utf8NoBomContent`）—— 修复 Node `JSON.parse` BOM 错误 | ✅ |
| 6 | GPT 自行 | `scripts/dev/acceptance-test.test.mjs` 6 个测试，23/23 pass | ✅ |

### 审查结论：无新增问题

改动全在 `scripts/dev/acceptance-test.ps1`（+ 新增 `.test.mjs`），遵循现有模式，不引入新风险：

- `Test-AcceptanceBlocked` 的 8 条检查路径均安全：`$null -ne` 守卫确保非 canonical 步骤不受影响
- `Get-OptionalArrayCount` 对 null root / null property / null value 均有防御
- PS5 兼容语法不改变行为（`+=` 在 3 元素规模无性能影响）
- `-FailOnWarning` 默认 false，不改变现有行为
- 实测验证：全部 23 个测试通过；`-SkipDb` 执行到完成；B1 合规 blocked → exit 1（正确拦截）

## 已知未完成

| 项目 | 状态 |
|------|------|
| P0.3 `.gitignore` 规则修正清单 | 待补 |
| P3 公开路由上线 | 延迟，依赖真实环境验收通过 |
| Flyway 迁移执行（Buff 表 / canonical_version） | 需 MySQL schema 写权限 |
