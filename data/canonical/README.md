# Canonical Data

本目录保存经过审计后可作为业务导入依据的可信数据。

## 规则

- 分类替换优先读取 `data/canonical/category/`。
- 写库脚本不能直接从 `raw` 或 `normalized` 绕过 canonical 层。
- 每个 canonical 输出应能追溯来源、生成脚本和生成时间。

当前目录先作为目标结构入口，历史数据尚未迁入。
