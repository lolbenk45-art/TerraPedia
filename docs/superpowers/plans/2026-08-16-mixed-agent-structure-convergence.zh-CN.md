# 混合 AI 代理与项目结构收敛执行计划

> **给代理执行者：** 执行本计划时，按任务逐项使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`。每个步骤使用复选框（`- [ ]`）跟踪。

**目标：** 在不损坏现有业务、数据和本地工作树的前提下，把 TerraPedia 收敛为 Codex、Claude Code 及其他模型都能共同使用的项目结构，并明确 skill 所有权、运行时适配层、应用/服务边界和临时产物归属。

**架构：** `agent/skills/` 是跨模型 skill 的唯一编辑源；`.codex/skills/` 和 `.claude/skills/` 是按各工具发现规则生成的运行时副本，用脚本和 hash parity 检查防止漂移。`apps/` 与 `services/` 保持分离，新增部署组件索引解释二者关系；被忽略的 `.local/` 统一承载本地临时文件和日志，长期结论进入 `docs/audits/` 或治理归档。

**技术栈：** Markdown、Node.js ESM、Node `node:test`、Git、Bash/PowerShell，以及现有 TerraPedia 路径解析器和质量门禁。

---

## Review Gate 0：方案边界确认

在用户 review 前，本计划只允许修改计划文档，不允许创建 `agent/` 或 `.local/`，不允许同步 skill，也不允许移动或删除运行时文件。

开始 Task 1 前，需要确认以下默认决策：

- `agent/skills/` 作为公共 skill 源；如果不接受，替换为用户指定路径，并同步修改中英文计划。
- 不使用 symlink/junction 作为项目契约；运行时目录使用普通文件同步生成。
- `apps/` 与 `services/` 不物理合并，用部署组件索引表达“同属可部署组件”。
- `.claude/settings.json`、`.claude/worktrees/` 和 `.superpowers/` 继续作为本机状态，不进入 git。
- `.claude/skills/` 中可复用的项目 skill 纳入 git；Claude 插件配置不纳入 git。

如果用户否决任一项，先修改中英文计划并重新进行计划审计，再执行后续任务。

## 目标锁定

本计划要关闭以下具体问题：

1. Claude Code 目前只能看到两个被忽略的 skill 副本，干净 clone 无法复用大部分 TerraPedia 治理 skill。
2. `.codex/skills`、`.claude/skills`、`docs/superpowers` 和 `.superpowers` 没有可验证的职责层次。
3. `apps/` 与 `services/` 的部署关系没有明确说明。
4. 根 `tmp/`、`logs/`、`reports/tmp/` 和根级 `*_SUMMARY.md` 的生命周期与落位规则不一致。
5. 关闭兼容 symlink 前，没有“技能适配、临时产物、历史总结、旧路径引用”的统一验收门。

完成定义：

- 干净 clone 按文档执行一次同步命令后，Codex 和 Claude Code 都能发现所有标记为 `portable` 的项目 skill。
- 公共 skill 源、运行时副本和工具专属 metadata 的所有权清晰，`--check` 能阻止漂移。
- `apps/`、`services/`、`pipelines/`、`platform/` 和 `packages/` 的职责在架构文档、README 和代理入口中一致。
- 临时目录、报告目录和历史归档目录有明确规则；根目录不再新增临时文件或任务总结。
- 关闭旧入口前，全仓引用扫描、runtime smoke、结构测试和 focused quality gate 均通过。

## 范围与安全边界

### 本次包含

- `agent/skills/` 公共源、manifest、同步脚本、parity 测试和使用文档。
- `.claude/skills/` 的可提交项目 skill 入口；保留 `.claude/settings.json` 和 `.claude/worktrees/` 的忽略状态。
- Codex、Claude Code、Gemini 的轻量入口文件；入口只引用统一治理规则，不复制完整规则正文。
- `docs/architecture/deployable-components.md`、结构基线、文件落位规则、README、`AGENTS.md` 和 current spec 的一致性更新。
- `tmp/`、`logs/`、`reports/tmp/` 和根级 summary 的引用盘点、分类、迁移或历史归档。
- 兼容 symlink 关闭前的引用扫描和最终验证。

### 本次不包含

- 不修改 API 语义、数据库 schema、业务数据、爬虫策略、Shimmer 生成数据或授权报告。
- 不运行 crawler `apply/force`、数据库写入、Redis reset、外部刷新或生产部署。
- 不把 `.claude/worktrees/`、`.superpowers/`、密码、插件缓存或本机设置提交到 git。
- 不把后端搬进 `apps/`，也不引入 `products/` 或 `workspaces/` 额外路径层。

### 不写入边界

在 Task 6 之前，以下路径只读：

```text
data/generated/shimmer/
reports/authorization/
data/canonical/
data/legacy/
data/backups/
.claude/worktrees/
.superpowers/
```

所有结构操作必须在专用 worktree 完成；主工作树中的既有未提交路径必须在每个检查点前后保持不变。

## 来源与消费者链

```text
agent/skills/<skill>/SKILL.md
  -> sync-agent-skills.mjs
  -> .codex/skills/<skill>/SKILL.md       -> Codex skill discovery
  -> .claude/skills/<skill>/SKILL.md      -> Claude Code project discovery
  -> AGENTS.md / CLAUDE.md / GEMINI.md     -> 项目治理与 skill 选择规则
```

长期流程和执行历史不进入运行时 skill 源：

```text
docs/superpowers/specs/  -> 已批准设计
docs/superpowers/plans/  -> 可执行计划
docs/devlog/             -> 状态、验证和交接
.superpowers/             -> 被忽略的本机 brainstorm 和截图产物
```

## 实施前文件清单

### 新建文件

- `agent/README.md`：公共代理资产的所有权、发现方式和同步规则。
- `agent/skills/README.md`：skill 命名、frontmatter 以及 portable/Codex-only 分类规则。
- `agent/skills/skill-manifest.json`：skill ID、来源类别、运行时目标和 hash schema。
- `platform/tooling/sync-agent-skills.mjs`：提供 `--write`、`--check`、`--list` 三种模式的同步器。
- `platform/tooling/sync-agent-skills.test.mjs`：临时 fixture、hash parity、路径逃逸、未知 skill 和运行时 metadata 测试。
- `CLAUDE.md`：Claude Code 薄入口，指向 `AGENTS.md` 和 current spec，不复制治理正文。
- `GEMINI.md`：Gemini CLI 薄入口，指向 `AGENTS.md` 和 current spec，不声明不存在的工具能力。
- `docs/architecture/deployable-components.md`：apps、services、packages 的部署和依赖索引。
- `docs/audits/structure/mixed-agent-structure-acceptance-2026-08-16.md`：最终结构和 skill 链验收证据。

### 修改文件

- `.gitignore`：只为可跟踪的 `.claude/skills/` 建立精确例外，继续忽略 settings、worktrees 和本地缓存；增加 `.local/` 规则。
- `AGENTS.md`：增加跨模型入口、skill 选择、同步，以及禁止直接编辑生成副本的规则。
- `README.md`：增加部署组件、代理 skill、临时文件和历史总结的落位说明。
- `docs/architecture/project-structure-v2.md`：增加 agent 层、运行时适配层和 `.local` 规则。
- `docs/architecture/file-placement-rules.md`：用户批准新增顶层 `agent/` 后，补充其职责和根目录允许项。
- `docs/architecture/README.md`：增加部署组件和混合 AI 结构入口。
- `docs/project-governance/00_CURRENT_SPEC.md`：仅在 maintained boundaries、入口文件或文档落位事实改变时更新。
- `docs/project-governance/INDEX.md`：增加公共 skill 和归档总结索引。
- `docs/devlog/current.md` 与新建 `docs/devlog/entries/2026-08-16-mixed-agent-structure-convergence.md`：记录执行状态和验证结果。
- `PLAN_FIXES_SUMMARY.md`、`REFACTORING_SUMMARY.md`：不改正文；引用扫描确认后移动到 `docs/project-governance/archive/`，保留历史标题。

## Task 1：冻结 inventory 并选择公共 skill 源

**文件：**
- 新建：`docs/audits/structure/mixed-agent-skill-inventory-2026-08-16.md`
- 修改：`docs/devlog/current.md` 和新建的任务 entry
- 只读：`.codex/skills/`、`.claude/skills/`、`.claude/settings.json`、`.claude/worktrees/`、`.superpowers/`、`docs/superpowers/`

- [x] 记录 `.codex`、`.claude`、`.superpowers`、`.worktrees`、`docs/superpowers`、`tmp`、`logs`、`reports/tmp` 和 `task` 的准确跟踪/忽略状态与文件数量。
- [x] 将当前 `.codex/skills/*` 的每个条目标记为 `portable`、`codex-only` 或 `external/plugin`；依据 frontmatter 和实际工具引用判断，不依据目录名猜测。
- [x] 在修改 ignore 规则前，确认 `.codex/skills` 与 `.claude/skills` 中 `session-handoff`、`ui-ux-pro-max` 的 parity。
- [x] 记录当前 dirty paths，并确认后续 staged scope 永远排除 Shimmer 数据和授权报告。
- [x] 在创建目录前取得用户对 `agent/skills/` 公共源的确认。

验证：

```bash
git status --short --branch -uall
git ls-files .codex/skills .claude/skills
git check-ignore -v .claude/settings.json .claude/worktrees .superpowers tmp
git diff --check
```

## Task 2：建立跨模型入口契约

**文件：**
- 新建：`CLAUDE.md`、`GEMINI.md`、`agent/README.md`、`agent/skills/README.md`
- 修改：`AGENTS.md`、`README.md`、`docs/project-governance/00_CURRENT_SPEC.md`（仅在 current facts 改变时）
- 测试：`platform/tooling/agent-entry-contract.test.mjs`

- [x] 将每个入口写成薄适配层：包含读取顺序、事实源文件、skill 选择规则和同步命令，不复制完整 workflow。
- [x] 明确 `agent/skills` 是源，`.codex/skills`/`.claude/skills` 是生成的运行时视图。
- [x] 明确 skill 根据 `description` 按需读取；代理不能把所有 skill 一次性加载进上下文。
- [x] 增加测试，断言每个入口都引用 `AGENTS.md`、`docs/project-governance/00_CURRENT_SPEC.md`、`docs/project-governance/00_WORKFLOW.md` 和同步命令。
- [x] 增加反例测试：禁止把某个厂商专属工具声明为项目必需依赖。

## Task 3：建立公共 skill 源和同步器

**文件：**
- 新建：`agent/skills/skill-manifest.json`、`platform/tooling/sync-agent-skills.mjs`、`platform/tooling/sync-agent-skills.test.mjs`
- 修改：`.gitignore`
- 迁移：将 portable skill 目录从 `.codex/skills/` 放入 `agent/skills/`
- 生成：对应的 `.codex/skills/` 和 `.claude/skills/` 运行时副本

同步器契约：

```text
--write  校验 manifest，复制 portable SKILL.md/references，保留运行时专属 metadata
--check  比较源文件与生成副本，漂移时以具体路径退出码 1
--list   输出 portable、Codex-only、Claude-only 和 external/plugin 条目
```

- [x] 按 `[a-z0-9-]+` 校验 skill 名称，校验必需的 `name`/`description` frontmatter 和仓库路径包含关系。
- [x] 只复制 manifest 列出的文件；未声明的生成文件和路径逃逸必须报错。
- [x] 保留 `.codex/skills/*/agents/openai.yaml` 等 Codex-only metadata，不把它们复制进公共源。
- [x] 为可跟踪的 `.claude/skills/` 建立精确 ignore 例外，同时继续忽略 `.claude/settings.json`、`.claude/worktrees/` 和其他本地状态。
- [x] 保证同步可重复：排序稳定、换行符统一、不写时间戳、不写机器绝对路径。
- [x] 测试新 skill、修改 skill、删除 skill、frontmatter 错误、仓库外引用和过期运行时副本。
- [x] 在生成文件 staged 前后都运行 `node platform/tooling/sync-agent-skills.mjs --check`；提交授权已取得，当前结果为 79 个 source files 同步。

## Task 4：使 skill 内容可被混合模型使用

**文件：**
- 修改：portable 的 `agent/skills/*/SKILL.md` 及其直接引用的 references
- 保留工具专属内容：`.codex/skills/*/agents/`、Codex 工具映射、Claude 插件 settings
- 测试：`platform/tooling/skill-portability.test.mjs`

- [x] 将 portable skill 中强制依赖 Claude-only 或 Codex-only 工具的表述改为通用动作，并引用工具映射说明。
- [x] 将 TerraPedia workflow 规则保留在 `terrapedia-*` skill，将通用 superpowers workflow skill 保持 portable。
- [x] 确认每个 portable skill 只使用 `name` 和 `description` frontmatter，并且引用均为仓库相对路径。
- [x] 为没有子代理、浏览器工具或 PowerShell 的环境增加明确 fallback。
- [x] 确认生成后的 Codex 和 Claude `session-handoff` 内容字节一致。
- [x] 确认 description 只描述触发条件，不把简化版 workflow 写进 description 以致模型跳过正文。

## Task 5：明确部署边界，不合并 apps 和 services

**文件：**
- 新建：`docs/architecture/deployable-components.md`
- 修改：`AGENTS.md`、`README.md`、`docs/architecture/project-structure-v2.md`、`docs/architecture/README.md`、`docs/architecture/file-placement-rules.md`

- [x] 将 `apps/public-web` 和 `apps/admin-console` 定义为浏览器端 Nuxt deployable。
- [x] 将 `services/catalog-api` 定义为有独立数据库/API 生命周期的 Spring Boot deployable。
- [x] 将 `packages/content-runtime` 定义为 library，而不是 deployable。
- [x] 将 `pipelines` 和 `platform` 定义为有不同验证和写入边界的运维代码。
- [x] 添加依赖表：public web/admin console -> catalog API -> canonical DB/data；pipelines -> canonical data/import contracts；packages -> consuming apps/services。
- [x] 明确禁止创建 `apps/catalog-api`、`products/` 或 `workspaces/` 作为替代目录。
- [x] 增加根目录允许项表，让顶层职责清晰，而不是再增加一层目录。

验证：

```bash
rg -n 'apps/catalog-api|products/|workspaces/' AGENTS.md README.md docs/architecture docs/project-governance | rg -v 'Forbidden Alternative Homes|禁止创建|Do not create|不应创建|alternative homes|替代目录'
node scripts/lib/project-constants-usage.test.mjs
git diff --check
```

## Task 6：收敛临时产物并归档历史 summary

**文件：**
- 新建：`.local/README.md`（忽略）、`docs/audits/structure/local-artifact-inventory-2026-08-16.md`
- 修改：`.gitignore`、`docs/architecture/file-placement-rules.md`、`README.md`、`AGENTS.md`
- 引用扫描后移动：`PLAN_FIXES_SUMMARY.md`、`REFACTORING_SUMMARY.md` 到 `docs/project-governance/archive/`
- 移动前检查：`tmp/`、`logs/`、`reports/tmp/`、`task/`

- [x] 扫描生产脚本、测试、文档和本地 wrapper 对根 `tmp/`、根 `logs/`、`reports/tmp/` 的写入。
- [x] 将每个消费者分类为本地临时状态、可重建 runtime report、长期审计证据或兼容输入。
- [x] 只把已审计的本地输出消费者改到 `.local/tmp/` 或 `.local/logs/`；报告消费者使用 `reports/runtime/<operation>/`。
- [x] 本任务不删除已有 ignored 文件；先记录清单，清理必须另获用户明确授权。
- [x] 移动两个根 summary 时不重写历史正文；只修复会失效的引用。
- [x] 增加 scanner，禁止新的根级 `*_SUMMARY.md`、根 `tmp/` 和根 `logs/` 引用，允许项除外。
- [x] 保留 `task/` 作为本地任务上下文，并明确它不是项目事实源。

验证：

```bash
rg -n --hidden --glob '!**/.git/**' --glob '!**/node_modules/**' '(\./)?tmp/|(^|/)logs/|reports/tmp|^[^/]+_SUMMARY\.md' .
git diff --check
```

## Task 7：完成全仓扫描后再关闭兼容 symlink

**文件：**
- 只读扫描：所有 tracked source、文档、CI、脚本、测试和 runbook
- 扫描干净后才允许修改：`front-nuxt`、`data-query-app`、`back`、`shared/article-runtime`、`scripts/dev`、`scripts/ops`、`scripts/tooling`、`scripts/data` 的引用
- 新建：`docs/audits/structure/mixed-agent-structure-acceptance-2026-08-16.md`

- [x] 执行旧路径全仓扫描，将每个匹配分类为 canonical、historical、compatibility、fixture 或 defect。
- [x] 证明所有当前可执行消费者使用 `apps/`、`services/`、`packages/`、`platform/` 和 `pipelines/`；发现的 runbook、设计稿和 portable skill 引用已修复并重新扫描。
- [x] 确认生成的 skill 副本和 `.local` 规则不会重新引入旧路径或 ignored worktree 内容。
- [x] 删除 symlink 前运行全部路径/结构 contract。
- [x] 已取得用户提交授权并删除 8 个 symlink；删除结果通过独立 focused commit 的路径/结构验证后提交。
- [x] 重新扫描现行可执行与治理路径，确认没有引用依赖待删除路径。
- [x] 历史文档中的旧路径保留，并在审计中分类为 historical、fixture 或 compatibility。

## Task 8：集成验证与交接

**文件：**
- 修改：`docs/devlog/entries/2026-08-16-mixed-agent-structure-convergence.md`、`docs/devlog/current.md`
- 新建/更新：`docs/audits/structure/mixed-agent-structure-acceptance-2026-08-16.md`

- [x] 运行 `node platform/tooling/sync-agent-skills.mjs --check`。
- [x] 运行全部新增 Node 测试和现有结构/路径测试。
- [x] 运行 Shell/PowerShell 路径 contract。
- [x] 运行 `cd apps/admin-console && pnpm run check`。
- [x] 从 `services/catalog-api/` 运行 focused backend path/acceptance Maven 测试。
- [x] 运行 `git diff --check` 和目标路径/术语扫描。
- [x] 运行排除无关 public sitemap 与 fixture variance 的窄版 local quality gate，并记录准确计数；结果为 321/326，通过项外的 5 项均为隔离 worktree 缺少授权 fixture。
- [x] 运行 `git status --short`，确认 Shimmer 和授权路径仍未被触碰且未 staged。
- [x] 在 devlog 记录 residual risks、未运行的 crawler/database 操作、branch/worktree、验证输出和下一步。

## 提交边界

使用以下 focused commits，不能合并成一个无边界的大提交：

1. `docs(structure): add mixed-agent structure plan and inventory`
2. `feat(tooling): add portable skill source and runtime synchronizer`
3. `docs(structure): clarify deployable and local artifact boundaries`
4. `refactor(structure): close legacy aliases after reference audit`

每次提交前运行：

```bash
git status --short
git diff --cached --stat
git diff --check
```

禁止使用 `git add .`；只显式 stage 当前任务文件。不得 stage 用户已有的 `data/generated/shimmer/` 或 `reports/authorization/` 改动。

## 失败处理

- 如果某个 skill 无法满足 portable frontmatter 或通用工具约束，将其标记为 `codex-only` 并留在 `.codex/skills`；不能把有问题的 skill 静默复制给 Claude。
- 如果跟踪 `.claude/skills` 会捕获本地状态，使用精确 negation 规则修复 `.gitignore`，重新运行 `git check-ignore`；禁止宽泛解除 `.claude/*` 忽略。
- 如果某个输出消费者仍依赖根 `tmp/` 或 `logs/`，在有 focused 替代方案前保留有文档说明的兼容入口；不能批量改写全部 `process.cwd()` 消费者。
- 如果旧路径扫描发现 executable consumer，停止 symlink 删除，修复消费者，重跑受影响测试，再重复扫描。
- 如果验证依赖缺失的本地 fixture，记录具体缺失项并保持任务 `active`；不能为了让门禁变绿而重生成或覆盖用户数据。

## 最终验收

只有同时满足以下条件才算完成：

- `agent/skills` 源和运行时适配层通过 parity 检查。
- Claude、Codex、Gemini 入口文件指向相同的 current project facts。
- `apps` 与 `services` 保持分离，并由 deployable-components 索引解释。
- 根临时文件和 summary 都有明确 owner，不再产生无管控的新消费者。
- 只有在扫描证明不再需要旧入口后，才删除 legacy symlink。
- acceptance audit、devlog、focused tests 和 residual risks 均已记录。
