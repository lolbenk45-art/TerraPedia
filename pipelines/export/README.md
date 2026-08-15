# Data Export Scripts

本目录保存从 canonical 数据或数据库生成消费端导出文件的脚本。

## 规则

- 输出应进入 `data/exports/` 或显式参数指定的位置。
- 不得把导出产物写入根目录。
- 大体量输出默认不进入 git。
