# TerraPedia 项目结构 v2 基线

状态：迁移前结构基线（2026-08-16），物理目录迁移尚未开始。

本文件定义结构迁移期间可依赖的边界和目标命名。它不把目标目录视为当前事实；在每个边界完成消费者扫描、路径偏移验证、兼容入口和回滚设计前，当前路径仍是唯一运行入口。

## 当前基线

- 当前分支：`feat/supplementary-domains-readiness`
- 基线提交：`c8586c24`
- 当前维护应用：`front-nuxt/`、`data-query-app/`、`back/`
- 机器可读常量：`scripts/config/project.constants.json`
- 常量解析器：`scripts/lib/project-constants.mjs`
- 旧的未跟踪 `front/` 已删除，不创建 `apps/legacy-web/` 兼容目录。
- 当前工作区含有与结构修复无关的 Shimmer 生成数据和授权证据；它们属于用户已有状态，不能在迁移中清理、重置或改放位置。

## 当前顶层边界

| 当前路径 | 职责与主要消费者 | 版本/忽略状态 | 生成与生命周期 | 迁移目标或处置 |
| --- | --- | --- | --- | --- |
| `.codex/` | 版本化 Codex 技能、仓库协作规则；开发代理和技能加载器消费 | tracked（106 个文件） | 源码/规则，随仓库评审 | 保留在根目录，不进入业务边界 |
| `.claude/` | 本机 Claude 设置和会话辅助状态 | ignored，未跟踪 | 本地工具生成，可删除后重建 | 保留为本地隐藏目录，不作为项目事实 |
| `.superpowers/` | 本机设计/流程工具生成物和截图 | ignored，未跟踪 | 本地工具生成，可删除后重建 | 保留为本地隐藏目录，不提交、不迁入业务目录 |
| `.worktrees/` | Git linked worktree 预留位置；当前工作树中不存在 | ignored（规则已存在） | `git worktree` 创建/删除 | 保留根级预留；迁移工作树须显式隔离 |
| `.github/` | GitHub Actions 工作流 | tracked（2 个工作流） | 人工维护，随代码评审 | 保留根目录；工作流调用稳定脚本入口 |
| `back/` | Spring Boot catalog API；Maven、local stack、CI 和后端测试消费 | tracked（800 个文件） | `target/`、日志等为可重建运行产物 | 后续单边界迁移至 `services/catalog-api/`；当前不移动 |
| `front-nuxt/` | 维护中的公共 Nuxt 前台；本地启动、CI、浏览器验收消费 | tracked（246 个文件） | `.nuxt/`、`.output/`、coverage、依赖目录可重建且忽略 | 后续迁移至 `apps/public-web/`；当前不移动 |
| `data-query-app/` | 管理/数据查询 Nuxt 应用；管理端检查和本地栈消费 | tracked（165 个文件） | `.nuxt/`、`.output/`、coverage、依赖目录可重建且忽略 | 后续迁移至 `apps/admin-console/`；当前不移动 |
| `shared/` | 跨应用共享代码；目前为 `shared/article-runtime/` | tracked（2 个文件） | 源码，随调用方验证 | 后续迁移至 `packages/content-runtime/`；先完成 importer 扫描 |
| `scripts/` | 数据管线、开发栈、运维和独立 tooling 的源码 | tracked（941 个文件） | 源码；运行输出由 data/reports/runtime 承载 | 逻辑目标为 `pipelines/`、`platform/local/`、`platform/operations/`、`platform/tooling/`；按生命周期迁移 |
| `data/` | raw、normalized、canonical、generated、standardized、legacy 和兼容输入 | tracked/ignored 混合（415 个 tracked 文件） | 多数 raw/generated/runtime 输出可重建；canonical、备份和兼容证据需按契约保留 | `data/` 继续作为稳定数据根；先完成层级分类，不做批量移动 |
| `docs/` | 当前规范、架构、计划、runbook、审计和 devlog | tracked（803 个文件） | 人工维护；审计结论长期保留 | `docs/` 继续作为稳定文档根 |
| `reports/` | 运行报告、授权包、关系/迁移/crawler 证据和视觉验收产物 | tracked/ignored 混合（476 个 tracked 文件） | runtime 可重建；授权、canonical-migration、relation 等证据按契约保留 | 稳定证据根暂不移动；未来仅将已证明的 runtime 输出归入 `artifacts/runtime/` |
| `logs/` | 本地应用日志（当前为 `*.log`） | 目录未整体忽略，文件由 `*.log` 忽略 | 运行时生成，可删除/重建 | 不作为源码；Task 8 再统一到 runtime artifact 策略 |
| `tmp/` | 临时审计、截图、浏览器包和验收辅助文件；当前仍有 tracked 历史产物 | mixed（`tmp/` 规则存在，但已有 14 个 tracked 文件） | 大部分可重建，历史验收材料暂不能擅自删除 | 暂留，Task 8 分类后再决定 `reports/runtime` 或 `artifacts/runtime` |
| `.vite/` | Vite 本地缓存 | ignored，未跟踪 | 工具生成，可删除/重建 | 保留忽略规则，不进入结构迁移 |
| `task/` | 当前任务的本地上下文、草稿和日志 | ignored，未跟踪 | 临时生成，可删除/重建 | 保留为本地上下文；最终结论必须提升到 `docs/` |

根级稳定入口文件（`README.md`、`AGENTS.md`、`.gitignore`、`.editorconfig`、`.nvmrc`）继续留在根目录。`.env` 和 `dump.rdb` 是本机敏感配置/Redis 运行文件，均不属于可提交的项目结构；`dump.rdb` 当前由本机 `.git/info/exclude` 忽略。

## 目标树（仅命名基线）

```text
TerraPedia/
├── apps/
│   ├── public-web/          # front-nuxt/
│   └── admin-console/      # data-query-app/
├── services/
│   └── catalog-api/        # back/
├── packages/
│   └── content-runtime/    # shared/article-runtime/
├── pipelines/              # scripts/data/（按生命周期迁移）
├── platform/
│   ├── local/              # scripts/dev/
│   ├── operations/         # scripts/ops/
│   └── tooling/            # scripts/tooling/
├── data/                   # 稳定数据根，先分类再迁移
├── docs/                   # 稳定文档与审计根
├── reports/                # 兼容证据与运行报告（暂不整体移动）
└── artifacts/              # 仅未来证明可重建的 runtime/generated 输出
```

上述目标树不是当前目录清单。迁移窗口内应先复制或建立兼容入口，再一次只处理一个边界；旧路径和新路径不得形成可分叉写入的双主来源。

## 迁移期间必须保持可读的兼容根

以下路径在没有单独证据、回滚方案和消费者切换前必须保持原样可读：

- `data/generated/`：生成兼容导出、resume 和部分运行状态；不是统一 canonical 源。
- `data/terraPedia/`：共享数据兼容根，由显式环境配置优先选择。
- `data/standardized/`、`data/standardized-view/`：标准化输入与投影兼容层。
- `reports/relation/`：关系审计和 lineage 证据。
- `reports/canonical-migration/`：canonical 迁移证据。
- `reports/authorization/`：授权请求、packet 和消费记录。
- `reports/crawler-monitor/`、`reports/backend-refresh/`：运行契约仍引用的监控与刷新证据。

这些根目录的可读性不代表允许新增任意输出；新脚本必须通过项目常量和明确的 runtime/evidence 规则选择路径。

## No-delete / no-write 边界

本结构基线及其审阅阶段明确禁止：

- 移动、删除或重命名 `front-nuxt/`、`data-query-app/`、`back/`、`shared/article-runtime/` 或任何 `scripts/` 子树；
- 删除、重置、重生成现有 Shimmer 数据、授权报告、canonical/关系/crawler evidence 或历史兼容数据；
- 运行真实 crawler `apply/force`、数据库写入、Redis reset 或修改本地栈运行状态；
- 创建目标目录并把当前应用复制成两个可写副本；
- 在旧路径和目标路径同时产生未协调的写入。

允许的动作仅限于：只读 inventory/reference scan、架构与审计文档更新、路径常量/解析器的已批准窄修复，以及不改变外部运行状态的文档门禁验证。

## 下一迁移检查点

1. 在独立迁移工作树中复核本文件与 inventory，确认主工作树的混合改动已形成可审阅检查点。
2. 对 `front-nuxt/` 做旧路径消费者扫描、任意 cwd/linked-worktree 路径偏移测试和兼容 wrapper 设计。
3. 只迁移 `front-nuxt/` → `apps/public-web/`，同步 CI、启动脚本、测试、常量和回滚说明；通过 focused gate 后再评估管理端。
4. 每个边界完成后更新当前规范、`AGENTS.md` 和文件落位规则；在目标顶层边界尚未获批准前，不修改这些事实性入口。

## 参考

- [项目结构迁移 inventory](../audits/structure/project-structure-inventory-2026-08-16.md)
- [项目常量说明（中文）](./project-constants.zh-CN.md)
- [项目常量说明（English）](./project-constants.en-US.md)
- [文件创建与目录落位规则](./file-placement-rules.md)
- [当前项目规范](../project-governance/00_CURRENT_SPEC.md)
