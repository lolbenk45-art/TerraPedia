# TerraPedia 项目结构重设计方案

日期：2026-04-27

状态：设计方案，尚未执行目录迁移。

依据：[项目结构审计报告](../audits/structure/project-structure-audit-2026-04-27.md)

## 设计目标

本方案解决三个核心问题：

1. 让代码、数据、报告、计划、运行产物各自有稳定位置。
2. 避免老数据、新爬取数据、标准化数据、数据库写入脚本混在一起。
3. 为后续分类数据替换、爬虫接入、启动链路排查提供清晰目录边界。

本方案暂不要求一次性搬动所有目录。推荐先立规则、再补路径解析、最后分阶段迁移。

## 设计原则

### 1. 源码和数据分离

源码可以测试、复用、被 review；数据产物可以重新生成、归档、审计。两者不能长期混在同一个目录里。

结论：

- 爬虫源码应迁出 `data/wiki-crawler/src/`。
- `data/` 只保存数据分层和数据产物。
- 数据脚本统一放在 `scripts/data/`。

### 2. 可信数据只有一个入口

分类替换不能一部分读老表，一部分读新爬虫 JSON，一部分读历史 generated 文件。

结论：

- 分类替换只允许读取 `data/canonical/` 或数据库 staging 表。
- `raw`、`normalized`、`legacy` 都不能被业务导入脚本直接当作最终数据源。
- 所有写库脚本必须打印实际输入路径、数据库名、写入表名。

### 3. 报告和运行产物分层

长期要追溯的报告必须可提交；本地运行日志、临时报告、调试输出必须被忽略。

结论：

- 长期报告进入 `docs/audits/`。
- 本地运行输出进入 `reports/runtime/` 或 `task/<task>/logs/`。
- 不再新增“既被忽略又希望别人看到”的报告路径。

### 4. 计划和任务上下文分离

`task/` 可以保存本地长任务上下文，但不能作为最终决策来源。

结论：

- 临时任务记录进入 `task/`。
- 已确认计划进入 `docs/plans/` 或 `project-plan/active/`。
- 历史计划进入 `project-plan/archive/`。

### 5. 根目录保持克制

根目录只放稳定入口。任何新顶层目录都会增加理解成本。

结论：

- 默认不新增顶层目录。
- 新顶层目录必须先更新结构规则文档，并说明为什么不能放进既有目录。

## 目标顶层结构

```text
TerraPedia-dev/
  README.md
  .gitignore
  back/
  front/
  data-query-app/
  scripts/
  data/
  docs/
  project-plan/
  reports/
  task/
  .worktrees/
  .superpowers/
```

## 顶层目录职责

| 目录 | 定位 | 是否允许新增业务文件 | 说明 |
| --- | --- | --- | --- |
| `back/` | Spring Boot 后端 | 是 | 后端 API、服务、Mapper、配置、后端测试 |
| `front/` | 用户前台 | 是 | 用户可见前台应用 |
| `data-query-app/` | 管理或数据查询端 | 是 | 后台管理、数据查询、审计辅助界面；后续可考虑改名为 `admin-query-app/` |
| `scripts/` | 自动化脚本和工具 | 是 | 启动、验证、数据管线、运维、一次性工具 |
| `data/` | 数据分层和数据产物 | 谨慎 | 只放数据，不放长期维护源码 |
| `docs/` | 当前有效文档 | 是 | 架构、审计、计划、规范、运行手册 |
| `project-plan/` | 项目计划历史和当前索引 | 谨慎 | 建议拆 `active/`、`archive/` 后再继续新增 |
| `reports/` | 本地或批量生成报告 | 谨慎 | 默认本地运行产物；长期报告优先放 `docs/audits/` |
| `task/` | 本地长任务上下文 | 是，但不进 git | 只做本地交接、草稿、日志，不保存最终决策 |
| `.worktrees/` | 本地隔离工作树 | 否 | 只由 git worktree 或任务工具创建 |
| `.superpowers/` | 本地工具状态 | 否 | 不属于业务结构 |

## 推荐详细结构

```text
TerraPedia-dev/
  back/
    src/main/
    src/test/
    pom.xml

  front/
    src/
    public/
    package.json
    vite.config.ts

  data-query-app/
    app/
    components/
    server/
    package.json
    nuxt.config.ts

  scripts/
    dev/
      config/
      verify/
    data/
      crawler/
      fetch/
      normalize/
      canonical/
      audit/
      import/
      backfill/
      monitor/
      lib/
    ops/
    lib/

  data/
    raw/
    normalized/
    canonical/
    exports/
    legacy/
    backups/

  docs/
    architecture/
    audits/
    plans/
    runbooks/
    research/

  project-plan/
    INDEX.md
    active/
    archive/

  reports/
    runtime/
    relation/

  task/
    YYYY-MM-DD_task-name/
      docs/
      data/
      artifacts/
      logs/
```

## 数据分层设计

### `data/raw/`

用途：保存外部来源的原始抓取结果。

规则：

- 不做字段改名。
- 不做业务合并。
- 不直接写入数据库。
- 默认不进 git，除非是很小的固定样例。

### `data/normalized/`

用途：保存字段统一、格式统一后的中间数据。

规则：

- 可以修正字段名、类型、枚举值。
- 不承诺是最终可信数据。
- 不允许业务导入脚本直接依赖它作为最终分类来源。

### `data/canonical/`

用途：保存经过审计后可作为业务导入依据的可信数据。

规则：

- 分类替换、关系替换、批量写库优先读取这里。
- 每个 canonical 文件必须能追溯来源、生成脚本、生成时间。
- 对分类数据，建议使用稳定路径：`data/canonical/category/`。

### `data/exports/`

用途：保存给前端、后台、外部工具消费的导出文件。

规则：

- 由 canonical 或数据库生成。
- 不作为人工维护源。
- 体量过大时不进 git。

### `data/legacy/`

用途：保存老数据、旧映射、迁移前快照。

规则：

- 只能用于对比和回滚。
- 新写库脚本不得默认读取这里。
- 读取 legacy 必须在脚本参数或报告中显式说明。

### `data/backups/`

用途：保存人工导出的备份或迁移快照。

规则：

- 默认不进 git。
- 大文件不放仓库。
- 长期备份应进入外部备份位置，而不是项目目录。

## 数据脚本生命周期

推荐固定为：

```text
fetch -> raw -> normalize -> normalized -> canonicalize -> canonical -> audit -> import/backfill -> database -> export
```

对应目录：

| 阶段 | 脚本目录 | 数据目录 | 说明 |
| --- | --- | --- | --- |
| 采集 | `scripts/data/fetch/` 或 `scripts/data/crawler/` | `data/raw/` | 从 wiki 或稳定来源抓取 |
| 规范化 | `scripts/data/normalize/` | `data/normalized/` | 字段、类型、枚举统一 |
| 可信化 | `scripts/data/canonical/` | `data/canonical/` | 生成可导入业务数据 |
| 审计 | `scripts/data/audit/` | `docs/audits/` 或 `reports/runtime/` | 对比新旧数据、记录风险 |
| 写库 | `scripts/data/import/` 或 `scripts/data/backfill/` | 数据库 | 必须打印输入、目标库、目标表 |
| 导出 | `scripts/data/export/` | `data/exports/` | 给前端或工具消费 |

## 分类替换目标结构

分类替换建议使用独立子结构：

```text
data/
  raw/category/
  normalized/category/
  canonical/category/
  legacy/category/

scripts/
  data/
    crawler/category/
    normalize/category/
    canonical/category/
    audit/category/
    import/category/

docs/
  audits/category/
  plans/category/
```

分类替换只允许从 `data/canonical/category/` 或明确命名的数据库 staging 表读取最终数据。

禁止：

- 从 `data/generated/` 直接写分类表。
- 从 `data/wiki-crawler/normalized-light/` 直接写分类表。
- 在一个脚本里同时读取 legacy 和 canonical 后直接混写。
- 未生成审计报告就覆盖正式分类数据。

## 报告结构

推荐规则：

```text
docs/audits/       # 长期保留、可 review、可提交的审计报告
docs/plans/        # 已确认、可执行的计划
reports/runtime/   # 本地运行报告、临时输出，默认忽略
reports/relation/  # 历史兼容目录，后续需决定保留或迁移
task/*/logs/       # 长任务日志，默认忽略
```

后续建议把重要的 `reports/relation/*.md` 迁入 `docs/audits/relation/`，JSON 证据可放 `docs/audits/relation/data/` 或 `task/<task>/data/`。

## 计划文档结构

推荐规则：

```text
project-plan/
  INDEX.md
  active/
  archive/

docs/plans/
  YYYY-MM-DD_topic.md
```

区别：

- `project-plan/active/`：仍在推动的项目级里程碑。
- `project-plan/archive/`：历史计划和已完成批次。
- `docs/plans/`：针对当前任务已经确认的执行计划。
- `task/`：本地草稿、上下文、过程记录。

## 迁移路线

### 阶段 1：先建立规则和索引

目标：停止继续污染结构。

动作：

- 保留本文件。
- 保留 [文件创建与目录落位规则](./file-placement-rules.md)。
- 后续所有新增文件先按规则判断落位。

### 阶段 2：修复路径解析

目标：确保主工作区和 `.worktrees/` 下脚本读取同一个明确数据根。

动作：

- 抽出统一路径工具。
- 让数据脚本打印 repo root、workspace root、data root。
- 为 worktree 场景增加测试。

### 阶段 3：整理 `data/wiki-crawler/`

目标：源码和数据分离。

动作：

- 新增 `scripts/data/crawler/`。
- 迁移 `data/wiki-crawler/src/` 和 `data/wiki-crawler/tests/`。
- 保留旧入口兼容一段时间。
- 旧目录剩余内容标记为数据产物。

### 阶段 4：建立分类 canonical 层

目标：分类替换只读一个可信输入。

动作：

- 建立 `data/canonical/category/`。
- 建立分类 canonical 生成脚本。
- 建立分类替换前后审计报告。
- 写库脚本只接受 canonical 输入。

### 阶段 5：收敛历史报告和计划

目标：减少检索噪音。

动作：

- 为 `project-plan/` 建 `INDEX.md`。
- 逐步区分 `active/` 和 `archive/`。
- 把长期审计报告迁入 `docs/audits/`。
- 明确 `reports/` 只保留运行产物或历史兼容目录。

## 暂不建议立刻做的事

- 不建议一次性批量重命名所有中文历史文档。
- 不建议直接删除 `data/generated/`、`data/standardized/`、`data/standardized-view/`。
- 不建议马上把 `data-query-app/` 改名，除非同时更新启动脚本、文档、CI 和部署引用。
- 不建议在没有审计报告的情况下直接覆盖分类相关正式表。

## 完成标准

项目结构整改完成后，应满足：

- 根目录无临时业务文件。
- `data/` 中没有长期维护源码。
- 分类替换有唯一 canonical 输入。
- 新增报告能明确判断是否应该进入 git。
- 新增计划能明确判断放 `docs/plans/`、`project-plan/active/` 还是 `task/`。
- 任意启动或写库脚本都能打印实际配置路径、数据根路径、目标数据库。
