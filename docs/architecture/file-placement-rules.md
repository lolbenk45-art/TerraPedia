# TerraPedia 文件创建与目录落位规则

状态：强约束规则。

适用对象：人、AI 助手、脚本、批处理任务。

目标：避免文件被随手创建到错误目录，污染项目结构，导致后续启动、数据替换、审计和交接困难。

## 一句话规则

任何新文件创建前，先判断它是代码、数据、报告、计划、日志、配置、构建产物还是本地上下文；不能判断清楚时，不允许创建。

## 创建文件前必须回答的问题

新建文件前必须能回答：

1. 这个文件是源码、数据、文档、报告、日志、配置，还是构建产物？
2. 这个文件是否需要进入 git？
3. 这个文件是否可以重新生成？
4. 这个文件是否包含本地路径、账号、密钥、数据库连接、临时端口？
5. 这个文件的消费者是谁：后端、前端、管理端、数据脚本、人工审计，还是只给当前任务使用？
6. 三个月后别人看到它，能不能从路径判断用途？

答不出来时，先写入 `task/<date>_<topic>/docs/`，不要进入业务目录；确认后再迁移到正式位置。

## 顶层目录新增规则

默认禁止新增顶层目录。

允许存在的顶层目录只有：

```text
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

新增顶层目录必须同时满足：

- 现有目录无法表达它的职责。
- 它会长期存在，而不是一次性任务产物。
- 已更新 `docs/architecture/project-structure-redesign-2026-04-27.md`。
- 已在本规则中补充落位说明。

## 根目录规则

根目录只允许放稳定入口文件。

允许：

- `README.md`
- `.gitignore`
- 构建工具必须要求的根级配置文件
- 项目级许可证、编辑器配置、CI 配置

禁止：

- 临时 SQL
- 临时 JSON
- 临时日志
- 一次性脚本
- 手工导出的数据
- 截图
- 任务总结草稿
- 备份文件

## 代码文件落位规则

### 后端代码

放置位置：

```text
back/src/main/
back/src/test/
```

适用文件：

- Java 后端源码
- 后端测试
- 后端资源配置
- MyBatis Mapper 或同等后端持久层文件

禁止：

- 把后端临时验证脚本放进 `back/src/main/`。
- 把数据库导出 JSON 放进 `back/`。
- 把本地 IDE 元数据提交到 `back/.idea/`。

### 前台代码

放置位置：

```text
front/src/
front/public/
```

适用文件：

- 用户前台页面
- 用户前台组件
- 用户前台样式
- 前台静态资源

禁止：

- 把管理端页面放入 `front/`。
- 把爬虫数据或导入报告放入 `front/public/`。
- 提交 `front/dist/`。

### 管理或查询端代码

放置位置：

```text
data-query-app/
```

适用文件：

- 管理端页面
- 数据查询页面
- 审计辅助页面
- 管理端服务接口

禁止：

- 把用户前台页面放入 `data-query-app/`。
- 提交 `data-query-app/.nuxt/` 或 `data-query-app/.output/`。

### 脚本代码

放置位置：

```text
scripts/dev/
scripts/data/
scripts/ops/
scripts/lib/
```

规则：

- 启动、停止、联调验证脚本放 `scripts/dev/`。
- 数据采集、规范化、审计、写库脚本放 `scripts/data/`。
- 运维任务、Windows 计划任务、守护进程注册脚本放 `scripts/ops/`。
- 跨脚本复用工具放 `scripts/lib/` 或 `scripts/data/lib/`。

禁止：

- 把长期维护脚本放在 `data/`。
- 把一次性探针脚本放到根目录。
- 在脚本里写死本地绝对路径、数据库名、账号密码。

## 数据文件落位规则

### 原始抓取数据

放置位置：

```text
data/raw/
```

规则：

- 只保留外部来源原始形态。
- 默认不进入 git。
- 不允许业务写库脚本直接读取 raw 作为最终来源。

### 规范化中间数据

放置位置：

```text
data/normalized/
```

规则：

- 用于字段统一、类型统一、基础清洗。
- 不是最终可信数据。
- 默认不作为业务导入入口。

### 可信标准数据

放置位置：

```text
data/canonical/
```

规则：

- 这是业务替换和写库优先读取的数据层。
- 分类数据使用 `data/canonical/category/`。
- 每个 canonical 数据都必须能追溯生成脚本和来源。

### 前后端导出数据

放置位置：

```text
data/exports/
```

规则：

- 由 canonical 或数据库生成。
- 只给前端、管理端或外部工具消费。
- 不能作为人工维护源。

### 老数据和备份

放置位置：

```text
data/legacy/
data/backups/
```

规则：

- `legacy` 只用于对比、回滚、迁移审计。
- `backups` 默认不进 git。
- 新脚本读取 legacy 必须显式标注原因。

## 分类数据专项规则

分类替换只能使用：

```text
data/canonical/category/
```

或明确命名的数据库 staging 表。

禁止：

- 从 `data/generated/` 直接写正式分类表。
- 从 `data/wiki-crawler/normalized-light/` 直接写正式分类表。
- 从 `data/legacy/` 和 `data/canonical/` 混合读取后直接写正式表。
- 没有审计报告就覆盖正式分类数据。

分类相关报告放：

```text
docs/audits/category/
```

临时分类任务上下文放：

```text
task/YYYY-MM-DD_category-*/docs/
task/YYYY-MM-DD_category-*/data/
task/YYYY-MM-DD_category-*/logs/
```

## 报告文件落位规则

### 长期审计报告

放置位置：

```text
docs/audits/
```

适用：

- 分类替换审计
- 数据来源审计
- 结构审计
- 迁移前后对比
- 可供 review 的结论性报告

### 本地运行报告

放置位置：

```text
reports/runtime/
```

适用：

- 本地启动报告
- 临时探针结果
- 大批量脚本运行输出
- 可重新生成的报告

默认不进入 git。

### 历史兼容报告

当前兼容：

```text
reports/relation/
```

规则：

- 不建议继续扩散新报告到这里。
- 需要长期保留的内容应迁入 `docs/audits/relation/`。
- JSON 证据体量大时放 `task/<task>/data/`，Markdown 结论放 `docs/audits/`。

## 计划和任务文件落位规则

### 当前有效计划

放置位置：

```text
docs/plans/
project-plan/active/
```

规则：

- 任务级执行计划优先放 `docs/plans/`。
- 项目级里程碑优先放 `project-plan/active/`。
- 文件名建议：`YYYY-MM-DD_english-slug_中文标题.md`。

### 历史计划

放置位置：

```text
project-plan/archive/
```

规则：

- 已完成、已废弃、只做参考的计划都应进入 archive。
- 不建议删除历史计划，先通过索引标注状态。

### 本地任务上下文

放置位置：

```text
task/YYYY-MM-DD_topic/
```

规则：

- `task/` 默认不进入 git。
- 只保存本地过程材料。
- 通过评审的结论必须提升到 `docs/` 或 `project-plan/`。

固定子目录：

```text
docs/
data/
artifacts/
logs/
```

禁止在 `task/` 中保存唯一版本的最终规则、最终计划、最终审计结论。

## 配置和密钥规则

允许提交：

```text
scripts/dev/config/local-stack.config.example.json
```

禁止提交：

```text
scripts/dev/config/local-stack.config.json
scripts/dev/config/credentials.json
```

规则：

- 本地配置只放 `scripts/dev/config/`。
- 文档中的推荐配置路径统一写 `scripts/dev/config/local-stack.config.json`。
- 旧路径 `scripts/dev/local-stack.config.json` 只能作为兼容说明，不作为推荐路径。
- 密钥、账号、密码、本地绝对路径不得写入 tracked 文件。

## 构建产物和依赖目录规则

禁止提交：

```text
front/dist/
data-query-app/.nuxt/
data-query-app/.output/
node_modules/
back/target/
```

规则：

- 构建产物可以本地存在，但不能作为源码维护。
- 需要交付构建结果时，应通过发布流程或外部 artifact，而不是直接提交到仓库。

## 临时文件规则

临时文件只能放：

```text
task/<task>/artifacts/
task/<task>/logs/
reports/runtime/
```

禁止命名：

```text
test.json
temp.md
new.txt
fix.sql
output.log
backup.zip
```

推荐命名：

```text
YYYY-MM-DD_scope_purpose.ext
```

例子：

```text
2026-04-27_category-source-diff.md
2026-04-27_local-start-probe.log
2026-04-27_canonical-category-sample.json
```

## AI 助手执行规则

AI 助手创建文件前必须遵守：

1. 不在根目录创建临时文件。
2. 不新增顶层目录，除非用户明确要求并同步更新结构规则。
3. 不把报告放进被忽略目录后告诉用户“已交付最终报告”。
4. 不把长期维护代码放入 `data/`。
5. 不把数据产物放入 `scripts/`。
6. 不把本地任务过程当作最终文档留在 `task/`。
7. 不修改或删除用户未要求处理的历史文件。
8. 写库、爬虫、启动脚本相关文件必须说明目标数据库、数据源、输出位置。

## 脚本输出规则

脚本生成文件必须满足：

- 输出目录可配置。
- 默认输出不污染根目录。
- 默认输出到 `reports/runtime/`、`task/<task>/data/` 或明确的数据层目录。
- 执行日志打印实际输出路径。
- 写数据库脚本必须打印目标数据库、目标表、输入文件。

禁止脚本默认输出到：

```text
.
data/
scripts/
back/
front/
data-query-app/
```

除非该脚本职责就是生成对应目录下的正式文件。

## 判断表

| 文件类型 | 正确位置 | 是否进 git | 备注 |
| --- | --- | --- | --- |
| 后端源码 | `back/src/main/` | 是 | Java、资源、Mapper |
| 后端测试 | `back/src/test/` | 是 | 单元或集成测试 |
| 前台源码 | `front/src/` | 是 | 用户前台 |
| 管理端源码 | `data-query-app/` | 是 | 后台或查询端 |
| 数据脚本 | `scripts/data/` | 是 | 采集、规范化、审计、写库 |
| 启动脚本 | `scripts/dev/` | 是 | 本地联调入口 |
| 运维脚本 | `scripts/ops/` | 是 | 计划任务、守护进程 |
| 原始数据 | `data/raw/` | 通常否 | 可重抓 |
| 标准可信数据 | `data/canonical/` | 视体量决定 | 分类替换优先读取 |
| 导出数据 | `data/exports/` | 视体量决定 | 可再生成 |
| 长期审计报告 | `docs/audits/` | 是 | 结论性报告 |
| 临时运行报告 | `reports/runtime/` | 否 | 可再生成 |
| 当前计划 | `docs/plans/` 或 `project-plan/active/` | 是 | 可执行计划 |
| 本地任务上下文 | `task/<task>/` | 否 | 草稿、日志、过程材料 |
| 本地配置 | `scripts/dev/config/local-stack.config.json` | 否 | 不提交 |
| 构建产物 | `dist/`、`.nuxt/`、`.output/`、`target/` | 否 | 可重建 |

## 违反规则时的处理

发现文件落错位置时：

1. 先判断是否已经被代码或脚本引用。
2. 如果未被引用，移动到正确目录。
3. 如果已被引用，先补兼容路径，再迁移引用。
4. 如果是报告或任务材料，判断是否应该进入 `docs/`。
5. 如果是数据文件，判断是否属于 `raw`、`normalized`、`canonical`、`exports`、`legacy`。
6. 迁移后更新相关 README 或索引。

禁止直接删除不明来源文件。先确认用途，再处理。

