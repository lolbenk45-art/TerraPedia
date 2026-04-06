# Batch35-补丁 历史迁移去物理外键 + Flyway Repair（2026-03-23）

## 本次执行
- 按你的要求继续“移除”：
  - 已把历史迁移中的物理外键定义移除（仅保留逻辑外键）。

## 具体改动
1. 历史迁移去物理外键定义
- `back/src/main/resources/db/migration/V7__add_user_and_article_modules.sql`
  - 移除 `fk_user_refresh_tokens_user_id` 外键定义。
- `back/src/main/resources/db/migration/V9__add_article_review_workflow.sql`
  - 移除 `fk_article_review_log_article_id` 外键定义。

2. 保留并使用纠偏迁移
- `back/src/main/resources/db/migration/V10__remove_physical_foreign_keys.sql`
  - 继续用于已存在数据库的物理外键清理（幂等）。

## 重要处理（已执行）
- 由于修改了已执行过的历史迁移，Flyway 出现 checksum mismatch（V7/V9）。
- 已执行 repair 修复本地库历史记录：

```bash
cd back
C:\Windows\System32\cmd.exe /c "mvn -q org.flywaydb:flyway-maven-plugin:10.22.0:repair -Dflyway.url=jdbc:mysql://localhost:3306/terria_new -Dflyway.user=root -Dflyway.password=root"
```

## 验证结果
- `cd back && mvn -q test`：通过。
- `python scripts/dev/test_batch31_user_security_flow.py`：通过（`success=true`）。

## 说明
- 其他环境（测试/生产）如果已执行过旧版 V7/V9，也需要做一次 `flyway repair` 才能继续迁移。
- 从这次之后，新建库与后续迁移均走“无物理外键、逻辑外键”策略。
