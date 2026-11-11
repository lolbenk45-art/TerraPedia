# 2026-11-11 仓库收尾与 MySQL 归档总交接

## 用户决定与范围

- 用户明确停止全部旧任务，要求先保存成果并提交 GitHub，为各分支提供交接 Markdown，再整理本地分支和工作区。
- 每个旧分支独立保存；本次未把未完成分支的业务代码合并进 main。main 原有的两个本地提交随 main 正常快进上传。
- `.local` 的明确处理范围仅为 inactive recrawl MySQL 目录；其他主目录 `.local` 记录、Redis 数据和复爬结果保留。
- 旧任务因 intentionally stopped 关闭，不代表功能完成或生产验收通过。复工需要新用户目标、fresh runtime/authorization 和新 active devlog。

## GitHub 分支快照索引

20 个分支的首次保全提交已通过 GitHub 官方 refs API 逐一核对。下表 main 的 SHA 是首次保全点；main 后续总交接提交以 Git 当前 HEAD 为准。其他分支保留其独立快照。

每个分支均有 `docs/handoffs/2026-11-11-workspace-stop.md` 和对应 JSON inventory，记录分支、原始 HEAD、源码入口、旧索引、未完成项、历史风险、验证范围和复工命令。

| GitHub 分支 | 首次保全提交 | 说明 |
| --- | --- | --- |
| `archive/stashes-20261111` | `3d8a020a682c75998a757f4b3df0c9c7f2dceebb` | 4 个 stash 的自包含 bundle 与恢复说明 |
| `design/crawler-auto-ingestion-readiness` | `8ffb29796c9d974ebb90382a8484bd183ca35f90` | 已停止任务的独立源码/证据快照 |
| `feat/automation-domain-armor` | `720ce52b56fcc40f6bf836d2143f78e8ed724e1d` | 已停止任务的独立源码/证据快照 |
| `feat/automation-domain-buff` | `0d0875d7221fb0f8d262e15f38f0f7e921f2def7` | 已停止任务的独立源码/证据快照 |
| `feat/automation-domain-shimmer` | `dc74e68d0d66283351e0f8bab63137ac43abbc7e` | 已停止任务的独立源码/证据快照 |
| `feat/automation-ingestion-continuation` | `74265433a21b4246521e93700513ffc3e72eb117` | 已停止任务的独立源码/证据快照 |
| `feat/local-formal-catch-up-automation` | `9bfa56e1a4cee0d55db568b1cc3f208b1ac915c7` | 已停止任务的独立源码/证据快照 |
| `feat/pc-version-update-triage` | `088aacadd5c0b07f6275add34332a493c82d3c88` | 已停止任务的独立源码/证据快照 |
| `feat/scheduler-permanent-enablement` | `aec13599f9160f2746d1c2f11df372b7d567aa47` | 已停止任务的独立源码/证据快照 |
| `feat/supplementary-domains-readiness` | `02057e4ee529516a4c9c681b999ab4f51b65e656` | 已停止任务的独立源码/证据快照 |
| `fix/admin-p0-batch` | `ca0c708a2416338eb3f2abc12f5b7b4ad877a5db` | 已停止任务的独立源码/证据快照 |
| `fix/crawler-queue-v2-runtime` | `d96337635585471d9517c238b4121675c162bc3a` | 已停止任务的独立源码/证据快照 |
| `main` | `084a0c5086f5af499944e1729001cdcb140a02ea` | 本地主目录最终保留分支；含后续清理总交接 |
| `ops/eight-domain-version-sample-20261022` | `526cf176b794fb5b1dbff5f8ed9e046044c38e7b` | 已停止任务的独立源码/证据快照 |
| `ops/recrawl-allocation-contract-20261013` | `eb00c399f854a4d63e4b5a2fdc66114807b8aa30` | 已停止任务的独立源码/证据快照 |
| `ops/recrawl-armor-20261013` | `4a6a1fdf06e8ed1eedd9463862a2a2b2ab5727de` | 已停止任务的独立源码/证据快照 |
| `ops/recrawl-buff-20261013` | `413563f7df38d890774826683b0ed6ed5bd2b188` | 已停止任务的独立源码/证据快照 |
| `ops/recrawl-shimmer-20261013` | `2b888b92c098fbaea7e28b35e45532c5c37e78a6` | 已停止任务的独立源码/证据快照 |
| `refactor/close-structure-compat-window` | `84232ffda224940de40b2c571f0e523f7d446cbf` | 已停止任务的独立源码/证据快照 |
| `review/front-nuxt-visual` | `15b07e3aa12a54cd64b914b45909964ef34f7520` | 已停止任务的独立源码/证据快照 |

## 本地 Git 整理结果

- 最终保留 `/home/lolben/TerraPedia` 一个已注册工作区和 `main` 一个本地分支。
- 删除 19 个本地任务/临时工作区与 19 个已验证远端可恢复的本地分支；GitHub 分支全部保留。
- 4 个 stash 已归档到 `origin/archive/stashes-20261111` 并清空本地 stash。bundle 在独立空仓库完成 fetch/commit-graph 验证，包含 index 和存在时的 untracked 父提交。
- 旧 `.worktrees/eight-domain-production-readiness` 的一个残留 MinIO 临时文件也已校验保存，旧 `.worktrees` 目录已移除。
- 未 force-push、未重写历史、未删除远端分支，未启动爬虫或业务数据写入。

## 本地运行证据与配置

- 保全目录：`.local/tmp/workspace-closeout-20261111/preserved-worktrees/<branch-slug>/`；branch slug 将 `/` 改成 `--`。
- 内容包括任务工作区的 `.local`、非重建型忽略报告、配置和运行日志；这些本地文件未上传 GitHub。
- 每份 `PRESERVATION-MANIFEST.json` 记录文件 SHA-256 或符号链接目标；所有复制文件在移除源工作区前均逐一比对。
- 已校验保全 4358 个忽略文件/链接，合计 5,512,719,319 个逻辑字节；另外保留了运行日志和未注册旧工作区残留文件。
- 28 份大型报告以可恢复的 `.json.gz` 保存在对应 GitHub 分支，压缩前后内容 SHA-256 一致；需原始路径时按分支 handoff 解压并核对哈希。
- 另保留 `pre-cleanup-all-refs.bundle` 与 `stopped-work-remote-verified.bundle`，均通过 `git bundle verify`，位于 `.local/tmp/workspace-closeout-20261111/`。

## 验证与未验证内容

- 198 个修改的 JavaScript 文件通过 `node --check`；2497 个 JSON 文件解析通过。
- 每个分支的 staged whitespace 检查、路径审查、提交后 handoff 读回和 clean-worktree 检查通过。
- GitHub 20 个分支 exact tips 与对应首次保全提交一致；删除本地分支前确认没有 local-only commit。
- 没有对已取消的业务工作运行全量 Maven、前端构建或真实 ingestion 验收；历史记录不能当成当前验收证据。
- GitHub 连接只使用命令级官方地址解析和现有 Git 凭据，保留 TLS 校验；未改全局代理、DNS、凭据或远端 URL。

## MySQL 归档

- 归档目录：`D:\Mysql\TerriaData\terrapedia-recrawl-mysql-20261111`（WSL：`/mnt/d/Mysql/TerriaData/terrapedia-recrawl-mysql-20261111`）。
- 压缩包：`mysql-full-recrawl-20261013.tar.gz`，4,093,318,674 字节（约 3.81 GiB）。
- 源数据：`/home/lolben/TerraPedia/.local/tmp/mysql-full-recrawl-20261013`，577 个文件，33,277,803,240 个逻辑字节（约 30.99 GiB）。
- 校验：先对源文件生成 SHA-256 清单，再从 tar.gz 流式读回所有文件逐一比对，577/577 一致；原临时目录已在全部校验通过后删除。
- 压缩包 SHA-256：`adfa5db7edc08dd034a1786af8a0aedd6964f408d3b2f8d8fa41e5b878df62cf`。旁边保留 `.sha256`、`source-manifest.json`、`archive-result.json` 和 `README.md`。
- 正式 MySQL 进程仍使用 `/var/lib/mysql`、端口 13306；本次未停止或写入正式实例。其他 recrawl 记录、Redis 证据、MySQL restore probe 与既有 SQL 备份均保留。
- 这是离线物理目录归档，未进行 MySQL 启动/恢复演练；恢复时应解压到新的隔离目录，使用兼容版本并重新设置属主、配置和端口，不得覆盖正式数据目录。

## 复工

1. 在本总交接中选取需要恢复的远端分支。
2. `git fetch origin` 后新建独立工作区，阅读该分支的 `docs/handoffs/2026-11-11-workspace-stop.md`。
3. 按需恢复压缩报告与本地证据/配置，重新确认业务目标、依赖、运行态与授权。
4. 新建 active devlog 并运行对应最小验证；不自动恢复旧 scheduler、DB writes 或 consumed decisions。

原始操作清单、提交/推送日志、复制校验和清理结果保存在 `.local/tmp/workspace-closeout-20261111/`。See git for code-level diff details.
