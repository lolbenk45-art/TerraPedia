# TerraPedia 项目常量说明

机器可读源文件：`scripts/config/project.constants.json`

## 分层

- `project`：项目身份和常量 schema 版本。
- `applications`：维护中的公共前台、管理端和后端的当前路径、目标路径、正式名称和迁移状态。
- `roots`：仓库内稳定根目录。
- `dataLayers`：原始、标准化、canonical、导出、legacy、generated 等数据层。
- `evidence`：长期审计、运行报告、授权证据和 crawler monitor 证据。
- `crawler`：manifest、progress、raw、resume 和 operation report 的相对模板；实际 shared-data 根由运行环境决定。
- `runtime`：可移植的本地默认端口/地址；真实端口由环境变量或 local-stack 配置覆盖。
- `externalDefaults`：允许位于仓库外的默认根，例如 MinIO 数据目录。
- `compatibility`：旧环境变量和兼容入口名称。

## 使用规则

脚本使用 `scripts/lib/project-constants.mjs` 的语义解析函数，不直接拼接仓库根目录或使用 `process.cwd()` 推断输出位置。运行状态文件、manifest 和报告是生成物，不是常量；action registry 只保存稳定 actionId 和常量 key。

相对路径默认从选定 worktree 解析。shared data、Redis、MinIO、E2E artifact 等外部根必须显式配置，并对 suffix 做根目录 containment 检查。
