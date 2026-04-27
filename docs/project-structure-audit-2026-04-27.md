# TerraPedia 项目结构审计报告

审计日期：2026-04-27

## 任务范围

本次只做项目结构审计，不做代码重构、不移动文件、不写数据库、不运行爬虫。

成功标准：

- 找出当前项目结构中容易造成维护混乱、启动失败、数据混用的问题。
- 给出具体证据路径。
- 汇总成一个中文 Markdown 文件，方便后续一起确认整改顺序。

## 结论摘要

当前仓库不是“完全不能维护”的状态，核心模块划分大体存在：`back/` 是后端，`front/` 是前台，`data-query-app/` 是管理或查询端，`scripts/` 是脚本，`data/` 是数据，`docs/` 和 `project-plan/` 是文档。

真正不合理的地方集中在四类：

1. `data/` 里混入了爬虫源码、测试、运行产物和标准化数据，源码和数据边界不清。
2. `reports/`、`task/`、`.worktrees/`、`.superpowers/` 的忽略策略和实际使用方式不完全一致，容易导致重要报告或上下文“不进 git、不好追踪”。
3. 数据脚本的根路径解析对 worktree 不稳定，已经暴露出“同一个脚本在不同工作树读错数据根目录”的风险。
4. 历史计划文档数量过多，`project-plan/` 和 `project-plan/plan-/` 同时存在，且中文路径在部分命令输出中显示为转义或乱码，影响检索和交接。

这些问题会直接放大你之前担心的“老数据和新爬取数据混用”风险。尤其是分类替换、爬虫数据接入、启动脚本定位数据库配置时，如果源代码、运行数据、审计报告、任务上下文没有稳定边界，后续很容易再次出现“看起来启动失败，实际是数据根目录或数据库口径错了”的问题。

## 高优先级问题

| 问题 | 证据 | 影响 | 建议 |
| --- | --- | --- | --- |
| `data/wiki-crawler/` 同时承担源码目录和数据产物目录 | `data/wiki-crawler/src/`、`data/wiki-crawler/tests/`、`data/wiki-crawler/audit/`、`data/wiki-crawler/canonical/`、`data/wiki-crawler/normalized-light/`、`data/wiki-crawler/report/` 同级存在；其中 `src` 和 `tests` 已有 48 个 tracked 文件 | 新人会分不清哪些是代码、哪些是可删除产物、哪些是可信数据源；`.gitignore` 也被迫按子目录做复杂规则 | 把爬虫源码迁到 `scripts/data/crawler/` 或 `tools/wiki-crawler/`；`data/wiki-crawler/` 只保留爬取结果、标准化结果、审计产物 |
| `reports/` 被忽略，但仓库里已有 tracked 报告 | `.gitignore:28` 忽略 `reports/`；同时 `git ls-files reports` 显示 9 个 `reports/relation/*.md|*.json` 已被跟踪 | 新报告默认不出现在 `git status`，历史报告却又在 git 中，容易误判“报告没有生成”或“报告已经提交” | 明确拆分：`reports/relation/` 或 `reports/official/` 可跟踪，`reports/runtime/`、`reports/run-logs/` 继续忽略；或者统一把报告转入 `docs/audits/` |
| 数据脚本根路径对 worktree 不稳定 | `scripts/data/lib/wiki-item-utils.mjs:13` 使用 `path.resolve(__dirname, '..', '..', '..', '..')` 推导 workspace root，`scripts/data/lib/wiki-item-utils.mjs:14` 再拼 `data/terraPedia` | 在 `.worktrees/category-source-audit` 这类隔离工作树中运行脚本时，可能读到错误的共享数据根目录，导致审计结果为 0 或读错旧数据 | 抽出统一路径解析工具，优先识别真实 repo root 和主工作区共享数据根；所有数据脚本通过同一个工具读取 shared data path |
| `task/` 被忽略，但已经承载重要任务上下文 | `.gitignore:57` 忽略 `task/`，同时当前工作流使用 `task/2026-04-27_category-stable-source-replacement/` 保存阶段总结 | 适合本地交接，但不适合保存最终决策；如果后续换机器或换协作者，重要计划不会进入版本历史 | 保留 `task/` 作为本地草稿和长任务上下文；通过评审后的结论、里程碑、执行计划应提升到 `docs/` 或 `project-plan/active/` |
| 生成数据的 tracked 和 ignored 规则混杂 | tracked 数据中 `data/generated`、`data/standardized`、`data/standardized-view` 合计 155 个文件；`.gitignore:69-79` 又忽略多个 generated、raw、normalized、wiki-crawler 子目录 | 后续替换分类数据时，很难判断哪些 JSON 是源数据、哪些是中间产物、哪些是最终可消费数据 | 为 `data/` 定义固定分层：`raw/` 原始抓取、`normalized/` 中间规范化、`canonical/` 可信标准层、`exports/` 可消费输出；每层明确是否进 git |

## 中优先级问题

### 1. 两个前端应用的职责需要写清

当前同时存在：

- `front/`：Vite/Vue 前台应用，存在 `front/package.json`、`front/vite.config.ts`、本地构建产物 `front/dist/`。
- `data-query-app/`：Nuxt 查询或管理端，存在 `data-query-app/package.json`、`data-query-app/nuxt.config.ts`、本地产物 `data-query-app/.nuxt/` 和 `data-query-app/.output/`。

这本身不一定错误，但结构上缺少一份清晰说明：哪个是用户前台，哪个是管理后台，哪个负责数据审计或查询。建议在根 `README.md` 增加“应用入口和职责”小节，或者将 `data-query-app/` 改名为更明确的 `admin/`、`admin-query-app/`。

### 2. `scripts/data/` 阶段命名过多

`scripts/data/` 当前包含：

- `audit`
- `backfill`
- `fetch`
- `generate`
- `import`
- `landing`
- `lib`
- `maint`
- `monitor`
- `normalize`
- `pipeline`
- `relation`
- `sync`
- `transform`
- `workflow`

问题不是目录数量本身，而是阶段边界不够直观。比如 `import`、`sync`、`backfill`、`pipeline`、`workflow` 都可能被理解为“把数据写进去”；`generate`、`normalize`、`transform` 都可能被理解为“加工数据”。

建议补一份 `scripts/data/README.md` 的执行生命周期图，固定顺序例如：

1. `fetch`：采集外部数据。
2. `raw`：保存原始数据。
3. `normalize`：统一字段和格式。
4. `canonical`：生成可信标准层。
5. `audit`：审计差异。
6. `import` 或 `backfill`：写入数据库。
7. `monitor`：运行后监控。

如果某个目录不在这个生命周期里，应说明它是临时工具、历史兼容，还是即将废弃。

### 3. `project-plan/` 历史文档过多且存在重复层级

证据：

- `project-plan/` tracked 文件数量约 148 个。
- `project-plan/plan-/` 里还有一套从早期 batch 到里程碑的历史计划。
- `git ls-files` 对大量中文文件名显示为转义路径，PowerShell 部分输出也显示过 `????`。

影响：

- 检索时噪音很大，最新计划和历史计划混在一起。
- 旧方案容易被误当成当前事实来源。
- 中文路径在部分终端、脚本、CI 输出里可读性较差。

建议：

- 建立 `project-plan/active/` 保存当前仍有效的计划。
- 建立 `project-plan/archive/` 存历史计划。
- 对新文档采用“日期 + 英文 slug + 中文标题”的命名，例如 `2026-04-27_category-source-replacement_分类数据替换.md`。
- 不建议现在大规模改名，先新增索引文件，把当前有效文档标出来。

### 4. 本地配置路径存在历史口径

当前主路径是：

- `scripts/dev/config/local-stack.config.json`
- `scripts/dev/config/local-stack.config.example.json`

但历史文档仍能搜到旧路径：

- `project-plan/08_安全方案.md` 提到 `scripts/dev/local-stack.config.json`
- `project-plan/plan-/08_安全方案.md` 也提到 `scripts/dev/local-stack.config.json`

当前脚本已经兼容两个路径，例如 `scripts/lib/local-runtime-config.mjs`、`scripts/dev/start-local-stack.ps1`、`scripts/dev/stop-local-stack.ps1` 都会查找新旧位置。这种兼容有价值，但文档口径需要统一，否则排查启动失败时会浪费时间。

建议：

- 所有新文档只写 `scripts/dev/config/local-stack.config.json`。
- 旧路径只作为兼容说明出现，不作为推荐路径。
- 启动问题排查文档里明确“先看 config 目录下的配置”。

## 低优先级问题

### 1. `back/.idea/` 出现在工作区

`back/.idea/` 当前存在于本地工作区，但 `git ls-files back/.idea` 没有显示 tracked 文件。也就是说它目前没有进入 git，风险较低。

建议保持忽略，不要提交 IDE 元数据。

### 2. `.superpowers/` 是本地工具状态

`.gitignore:64` 忽略 `.superpowers/`，根目录也存在该目录。它适合作为本地工作流状态，但不应成为业务结构的一部分。

建议在根 README 的“本地工具目录”中简单说明它是本地状态目录，可忽略。

### 3. `.worktrees/` 是项目内工作树目录

`.gitignore:52` 忽略 `.worktrees/`，当前存在 `.worktrees/category-source-audit`。这种方式便于隔离任务，但对路径解析要求更高，尤其是数据脚本不能假设“当前工作树根就是唯一真实工作区”。

建议保留，但必须优先修复前面提到的数据路径解析问题。

### 4. 本地构建产物占据应用目录

当前存在：

- `front/dist/`
- `data-query-app/.nuxt/`
- `data-query-app/.output/`

这些通常是正常本地产物，只要不进 git 即可。问题在于它们会增加目录浏览噪音。

建议保持忽略，并在清理脚本或 README 中说明它们可安全删除后重建。

## 对分类数据替换的直接影响

你之前的想法是“舍弃老数据，用爬取的最新数据替代，避免老数据和新数据混用”。从项目结构看，这个方向是对的，但要先补三个结构前置条件：

1. 明确“爬取数据”的稳定落点。建议最终只让分类替换读取一个 canonical 层，而不是直接读 `raw`、`normalized-light` 或历史 generated 文件。
2. 明确“老数据”的隔离方式。旧数据可以保留备份，但不应继续和新数据共享同一个默认读取路径。
3. 明确“报告和审计结果”的保存规则。分类替换前后的差异报告应进入可追踪位置，否则下次排查又会不知道上一次依据是什么。

如果不先整理这些边界，直接把新爬虫数据接入数据库，短期可能能跑，但后续很容易出现这些问题：

- 启动脚本读到旧配置或旧数据根目录。
- 分类脚本从 generated 文件取了一部分，从 crawler 输出取了一部分。
- 审计报告生成了但被 `.gitignore` 吃掉，别人看不到。
- worktree 里跑出来的数据和主工作区数据不一致。

## 推荐目标结构

建议先不要一次性大搬家，可以按下面的目标结构逐步靠拢：

```text
TerraPedia-dev/
  back/                         # Spring Boot 后端
  front/                        # 用户前台
  data-query-app/               # 管理或查询端，后续可考虑改名为 admin-query-app
  scripts/
    dev/                        # 本地启动、停止、验证
    data/
      fetch/                    # 数据采集脚本
      normalize/                # 数据规范化脚本
      audit/                    # 数据审计脚本
      import/                   # 写库或导入脚本
      lib/                      # 共享工具
      crawler/                  # 建议迁入 wiki-crawler 源码
  data/
    raw/                        # 原始抓取数据，通常不进 git
    normalized/                 # 中间规范化数据，按体量决定是否进 git
    canonical/                  # 可信标准层，分类替换应优先读取这里
    exports/                    # 前后端可消费输出
  docs/
    audits/                     # 可长期保留的审计报告
    architecture/               # 当前架构说明
    plans/                      # 已确认的近期计划
  reports/
    runtime/                    # 本地运行报告，忽略
    relation/                   # 如果继续保留，需要显式允许 tracked
  task/                         # 本地长任务上下文，忽略
```

## 建议整改顺序

### 第一阶段：先立规则，不搬文件

目标：先避免继续混乱。

建议动作：

- 在 `README.md` 或 `docs/architecture/` 新增一页“目录职责说明”。
- 明确 `data/` 每一层是否进 git。
- 明确 `reports/` 哪些目录可提交，哪些目录只做本地运行产物。
- 明确 `task/` 只做本地上下文，不保存最终决策。

### 第二阶段：修复路径解析

目标：避免启动、审计、爬虫脚本在 worktree 或不同目录运行时读错数据。

建议动作：

- 抽出统一路径解析模块。
- 所有数据脚本统一调用它。
- 对 worktree 场景加一个最小测试。
- 启动脚本和数据脚本都打印实际使用的配置路径、数据库名、数据根目录。

### 第三阶段：整理爬虫源码和数据产物

目标：让分类替换只依赖稳定数据层。

建议动作：

- 先新增目标目录，不立即删除旧目录。
- 把 `data/wiki-crawler/src` 和 `data/wiki-crawler/tests` 迁到 `scripts/data/crawler/` 或 `tools/wiki-crawler/`。
- 保留兼容入口一段时间。
- 明确 `data/wiki-crawler/` 剩余目录都是产物或历史输出。

### 第四阶段：确定分类替换的数据契约

目标：避免老数据和新数据混用。

建议动作：

- 定义分类 canonical JSON 或数据库 staging 表。
- 分类写库脚本只接受 canonical 输入。
- 老数据只保留在 legacy 或 backup 路径。
- 每次替换前后都生成可追踪审计报告。

### 第五阶段：整理历史计划文档

目标：让新任务只看最新有效计划。

建议动作：

- 新建 `project-plan/INDEX.md`。
- 标注当前有效计划、历史计划、已废弃计划。
- 后续逐步迁移到 `active/` 和 `archive/`。
- 暂时不要批量改中文文件名，避免引入大量无业务价值 diff。

## 本次未处理内容

- 没有重构目录。
- 没有删除本地构建产物。
- 没有修改 `.gitignore`。
- 没有运行启动脚本、数据库脚本或爬虫脚本。
- 没有判断每一份历史文档的业务正确性，只从结构和维护风险角度审计。

## 最小结论

现在最需要优先处理的不是“马上移动所有目录”，而是先把数据边界和报告边界定下来：

1. `data/` 只放数据，爬虫源码迁出或至少标记为源码区。
2. 分类替换只读一个 canonical 新数据源。
3. `reports/` 的 tracked 和 ignored 规则统一。
4. 路径解析要支持主工作区和 `.worktrees/`。
5. 重要计划从 ignored 的 `task/` 提升到可追踪文档。

这五件事处理完，再替换分类数据会稳定很多，也能降低后续启动失败时“到底是数据库、脚本、路径还是旧数据”的排查成本。
