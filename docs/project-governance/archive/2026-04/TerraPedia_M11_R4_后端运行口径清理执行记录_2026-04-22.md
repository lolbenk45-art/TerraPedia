# TerraPedia M11-R4 后端运行口径清理执行记录
日期：2026-04-22  
对应里程碑：`M11-R4`

---

## 1. 本批目标

把当前默认运行口径中的旧 `8888` 清理掉，统一到本地配置与最新 runbook 已采用的 `18088`。

---

## 2. 本批范围

修改：

- `scripts/dev/start-local-stack.ps1`
- `scripts/dev/stop-local-stack.ps1`
- `scripts/dev/benchmark-read-api.ps1`
- `back/README.md`
- `back/API_CRUD_DOC.md`

明确不改：

- Java 中的 `legacy` preflight / cleaner 兼容逻辑
- 历史计划文档中的旧记录

---

## 3. 本批结果

已统一为：

- 后端默认本地端口：`18088`
- Backend API：`http://localhost:18088/api`
- Swagger UI：`http://localhost:18088/api/swagger-ui.html`

这意味着：

- 启停脚本 fallback
- benchmark fallback
- 当前后端文档口径

都与 `local-stack.config.example.json` 和现有刷新脚本默认口径保持一致。
