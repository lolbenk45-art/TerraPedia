# TerraPedia 项目结构迁移 Inventory

审计时间：2026-08-16 CST

工作区：`/home/lolben/TerraPedia`

分支：`feat/supplementary-domains-readiness`

观察基线：`c8586c24`（工作区存在 60 个 tracked modified paths、37 个 untracked paths；无 staged paths）

## 目的与边界

本 inventory 是物理目录迁移前的事实快照。它记录顶层职责、消费者、版本/忽略状态、可重建性、目标命名和迁移前引用计数。它不授权移动目录，也不把目标目录当作当前存在的事实。

本次明确不做：代码移动或删除、数据库写入、真实 crawler apply/force、Redis reset、本地栈重启、Shimmer/授权证据清理或重生成。现有用户改动保持原位。

## 当前顶层清单

计数来自 `git ls-files` 和当前工作树目录检查；`tracked` 只统计已跟踪文件，忽略状态表示当前规则或工作树观测，不等于目录内每个文件都同一状态。

| 路径 | owner / consumer | 状态 | 可重建性 | 迁移结论 |
| --- | --- | --- | --- | --- |
| `.codex/` | 项目协作技能；Codex agents | tracked=106 | 不可随意重建，随仓库版本化 | 根级保留 |
| `.claude/` | 本机设置；Claude 工具 | ignored，tracked=0 | 可重建 | 根级本地状态，永不进入业务目录 |
| `.superpowers/` | 本机流程/设计产物 | ignored，tracked=0 | 可重建 | 根级本地状态，不提交 |
| `.worktrees/` | Git linked worktree 预留 | 当前不存在；ignored 规则存在 | Git 可重建 | 根级预留，迁移时单独创建 |
| `.github/` | GitHub Actions | tracked=2 | 需版本化 | 根级保留 |
| `back/` | Spring Boot API、Maven、local stack、CI | tracked=800 | 源码不可由构建产物替代 | 目标 `services/catalog-api/`，延后单边界迁移 |
| `front-nuxt/` | 公共 Nuxt 前台、浏览器验收、CI | tracked=246 | 源码需版本化；`.nuxt/.output` 可重建 | 目标 `apps/public-web/`，第一迁移候选 |
| `data-query-app/` | 管理/数据查询 Nuxt、admin gate | tracked=165 | 源码需版本化；构建缓存可重建 | 目标 `apps/admin-console/`，第二候选 |
| `shared/` | `shared/article-runtime/` 共享渲染器 | tracked=2 | 源码需版本化 | 目标 `packages/content-runtime/`，需先扫 importer |
| `scripts/` | 数据管线、开发栈、运维、tooling | tracked=941 | 源码需版本化，输出不应回写源码树 | 逻辑拆分到 `pipelines/` / `platform/`，按生命周期迁移 |
| `data/` | 数据层和兼容输入 | tracked=415；raw/generated 等混合忽略 | 依层级决定；canonical/证据需保留 | 保持稳定根，先做 Task 8 分类 |
| `docs/` | 治理、架构、计划、审计、runbook、devlog | tracked=803 | 结论性文档需版本化 | 根级保留 |
| `reports/` | runtime、授权、关系、迁移、crawler 证据 | tracked=476；目录策略混合 | runtime 可重建，durable evidence 需保留 | 暂不整体移动；future `artifacts/runtime/` 仅收可证明产物 |
| `logs/` | 本地应用日志 | tracked=0；`*.log` ignored | 可删除/重建 | 后续统一 runtime artifact 策略，不在本次移动 |
| `tmp/` | 审计、截图、浏览器包和验收辅助文件 | tracked=14；目录有 ignore 规则但历史文件仍 tracked | 多数可重建，历史材料不得擅删 | 暂留，Task 8 分类 |
| `.vite/` | Vite cache | ignored，tracked=0 | 可重建 | 保留忽略规则 |
| `task/` | 本地任务上下文 | ignored，tracked=0 | 可重建 | 保留本地使用；结论提升到 docs |

根级稳定文件为 `README.md`、`AGENTS.md`、`.gitignore`、`.editorconfig`、`.nvmrc`。`.env`（敏感配置）和 `dump.rdb`（Redis 本地数据）均为本机文件，不是项目结构输入。

## 兼容根与证据保留

迁移窗口内必须保持以下路径可读，且不得因为“目标目录”存在就产生第二个可写来源：

- `data/generated/`、`data/terraPedia/`、`data/standardized/`、`data/standardized-view/`
- `reports/relation/`、`reports/canonical-migration/`、`reports/authorization/`
- `reports/crawler-monitor/`、`reports/backend-refresh/`

Shimmer 当前生成目录和授权报告是用户已有状态；inventory 只引用其边界，不评估内容、不移动文件。

## 迁移前引用扫描

扫描对象为当前已跟踪文件，使用 `rg` 固定字符串匹配；为避免生成报告和大体量运行数据放大噪声，扫描排除了 `data/generated/**` 与 `reports/**` 的文件内容。`files` 是包含匹配的文件数，`matches` 是匹配行数；数字不是“待修复数量”，历史文档、测试 fixture 和兼容 wrapper 也会命中。

命令：

```bash
for path in \
  front-nuxt/ data-query-app/ back/ shared/article-runtime/ \
  scripts/data/ scripts/dev/ scripts/ops/ scripts/tooling/ scripts/lib/ \
  data/generated/ data/terraPedia/ reports/relation/ \
  reports/canonical-migration/ reports/authorization/ task/ \
  .codex/ .claude/ .superpowers/ .worktrees/ .github/; do
  git ls-files -z -- ':!data/generated/**' ':!reports/**' \
    | xargs -0 -r rg -l -F -- "$path" 2>/dev/null | sort -u | wc -l
  git ls-files -z -- ':!data/generated/**' ':!reports/**' \
    | xargs -0 -r rg -n -F -- "$path" 2>/dev/null | wc -l
done
```

观察结果（`files / matches`）：

| 当前路径 | files | matches |
| --- | ---: | ---: |
| `front-nuxt/` | 139 | 1,391 |
| `data-query-app/` | 169 | 1,111 |
| `back/` | 255 | 1,872 |
| `shared/article-runtime/` | 11 | 22 |
| `scripts/data/` | 410 | 5,933 |
| `scripts/dev/` | 195 | 842 |
| `scripts/ops/` | 18 | 72 |
| `scripts/tooling/` | 10 | 33 |
| `scripts/lib/` | 17 | 33 |
| `data/generated/` | 270 | 1,679 |
| `data/terraPedia/` | 94 | 26,194 |
| `reports/relation/` | 98 | 507 |
| `reports/canonical-migration/` | 58 | 173 |
| `reports/authorization/` | 100 | 476 |
| `task/` | 24 | 55 |
| `.codex/` | 9 | 18 |
| `.claude/` | 23 | 40 |
| `.superpowers/` | 24 | 45 |
| `.worktrees/` | 11 | 25 |
| `.github/` | 17 | 43 |

物理迁移前必须在目标边界上重复扫描，并把命中分类为生产消费者、CI/启动入口、测试 fixture、历史文档或兼容别名；不得用总数直接推断可以移动。

## 目标命名和顺序

```text
front-nuxt/            -> apps/public-web/       (先迁移)
data-query-app/        -> apps/admin-console/    (后续)
back/                  -> services/catalog-api/  (最后评估)
shared/article-runtime/-> packages/content-runtime/
scripts/data/          -> pipelines/             (按生命周期)
scripts/dev/           -> platform/local/
scripts/ops/           -> platform/operations/
scripts/tooling/       -> platform/tooling/
```

目标目录当前均不存在。每次只允许一个边界进入迁移工作树；旧入口必须以只读/委托 wrapper 形式明确其写入归属，直到消费者完成切换。

## 后续检查点

Task 1 的产物是本 inventory 与 [`docs/architecture/project-structure-v2.md`](../../architecture/project-structure-v2.md)。下一步才可在专用迁移工作树中进行 `front-nuxt/` 的引用扫描和路径偏移合同测试；本工作树不得直接开始目录移动。
