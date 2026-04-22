# TerraPedia M12-R3 运维增强收口
日期：2026-04-22  
对应里程碑：`M12-R3`

---

## 1. 本批目标

把 `M12` 新增的 heartbeat 和 summary 文件口径补进当前运维说明，并重排剩余问题优先级。

---

## 2. 新增观测口径

daemon heartbeat：

```text
reports/backend-refresh/backend-refresh-daemon.heartbeat.json
```

cycle summary：

```text
reports/backend-refresh/history/<report-name>.summary.json
```

action runtime：

```text
reports/backend-refresh/history/<report-name>.runtime/<action-id>.snapshot.json
reports/backend-refresh/history/<report-name>.runtime/<action-id>.heartbeat.json
```

---

## 3. 剩余问题重排

完成 `M12` 后，剩余问题优先级调整为：

1. 更生产化的部署/托管
2. daemon heartbeat 字段继续细化
3. action 中间摘要继续丰富
