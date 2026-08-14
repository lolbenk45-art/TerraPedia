# 双路径域入库验收 Review Plan

**状态：待评审**
**环境：仅 WSL，本地 `terria_v1_local`**
**分支：`feat/supplementary-domains-readiness`**

## 目标

验证八个 changed-only 域同时具备手动入口和自动入口。自动写库取消逐次 Owner approval，但必须受当前 canonical scheduler activation 总闸门约束：未授权、未启用、identity 不匹配或 preflight 不合格时，自动链在首次数据库 mutation 前 fail-closed。

手动和自动路径必须复用相同的 source validation、frozen input、owned-table、事务、progress、audit 和 acknowledgement 合同。

## 域矩阵

| 域 | 本地数量 | 测试方式 | 是否真实写库 |
| --- | ---: | --- | --- |
| Items | 6131 | 本地标准化数据 + 真实 source probe；手动/自动只测 dry-run、门禁、派发、去重 | 否 |
| Projectiles | 1111 | 本地标准化数据 + 真实 source probe；手动/自动只测 dry-run、门禁、派发、去重 | 否 |
| NPCs | 762 | 真实受限来源、手动事务、自动事务 | 是 |
| Buffs | 388 | 真实可恢复抓取、手动事务、自动事务 | 是 |
| Armor Sets | 63 | 真实单模块刷新、手动事务、自动事务 | 是 |
| Bosses | 33 | 真实受限抓取、手动事务、自动事务 | 是 |
| Audio | <=600 | 四前缀完整目录、真实下载、手动事务、自动事务 | 是 |
| Shimmer | 受限 | 真实 generation 提取、手动事务、自动事务 | 是 |

`boss_loot`、`npc_loot`、L2、生产库、Windows 服务、Redis reset 和无关数据修复不在范围内。

## 自动化总闸门

自动写库需要同时满足：

1. canonical activation request/packet/result 当前有效，且精确绑定八域。
2. V2 automation 为 `enabled=true`、`mode=changed-only`。
3. preflight 报告目标域全部 eligible，且没有意外域。
4. source probe 成功并返回 changed fingerprint。
5. 没有同域 live attempt 或共享 progress/output writer。
6. L1 source/preview 成功，前后 probe fingerprint 一致，冻结 bundle 可读。
7. bundle、policy、baseline、owned-table 和目标数据库 identity 校验通过。

手动入口可以在 scheduler disabled 时运行，但必须显式指定域、`apply=true` 和本地数据库保护。

## 手动/自动验收顺序

每个真实域按以下顺序串行执行：

1. 记录 source fingerprint、Git 状态、active writer、目标表写前计数和 mutation generation。
2. 运行真实 probe 和 source/preview，冻结 bundle。
3. 运行手动真实事务，记录提交结果、计数、样本和 audit。
4. 保留真实 source fingerprint，由 canonical scheduler 触发自动入口；不伪造 hash。
5. 自动入口必须真实进入 activation gate、事务、audit、terminal progress 和 acknowledgement。若手动阶段已使数据最新，自动 apply 允许是幂等零变更事务。
6. 第二次 changed-only 检查对已 acknowledgement fingerprint 必须零新 attempt。

Items/Projectiles 在第 3、5 步只运行 importer dry-run，数据库计数必须不变。

## 失败与停止规则

- source probe、pre/post fingerprint、bundle、policy、database identity 或 owned-table 任一失败：停止该域，禁止写库和 acknowledgement。
- crawler 可恢复失败最多三次；达到上限后暂停人工处理。
- 部分或不明确数据库写入不得自动重试；必须 rollback 并记录 blocked。
- Audio 在第 601 个接受文件、分页未耗尽或任一前缀超过 100 页时，下载和 manifest 写入前失败。
- 同一 progress/output 家族不得并行 writer；域之间串行。

## 方案取舍

采用 activation-gated shared importer：单一 activation 授权控制自动写库，手动和自动共享 importer/事务合同。

拒绝每次 apply 都要求 Owner approval，因为与本轮要求冲突；拒绝无条件自动写库，因为会绕过 disabled/stale activation；拒绝 fixture-only，因为无法证明小域真实来源、事务和本地库行为。

## Review 结论标准

评审通过后，执行计划必须覆盖：取消 supplementary apply 的逐次 approval 依赖、保留 activation identity/fence、Items/Projectiles dry-run、六个真实域的手动和自动事务、WSL-only 数据库验证、逐域 rollback 和最终回归。
