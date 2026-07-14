# 后台管理员全局通知中心（设计）

- 日期：2026-07-14
- 分支：`review/front-nuxt-visual`
- 目标目录：`data-query-app/`（layouts/default.vue、stores/、composables/、新增 notifications 模块）
- 状态：**已确认，待写实现计划**（范围、数据来源、展示形式见第 6 节，持久化方案与扩展点见第 3.2.1/3.3 节，均已经用户确认）

---

## 1. 背景与问题

管理员目前无法在离开具体页面的情况下感知系统状态变化：

- **文章审核**（`stores/articles.ts`）：状态流转 `DRAFT → PENDING_REVIEW → APPROVED/REJECTED`，但全局没有"待审核数量"统计，侧边栏菜单、任何页面都没有徽章或计数入口。数据是一次性请求，无轮询。
- **爬虫监控**（`pages/operations/crawler-monitor.vue`）：已有较完善的告警信号（`attentionCards`、`v4StatusStrip`、`healthSignals`，按 `blocked/failed/timed_out/stalled/state_missing` 分类），但这些信号**只在管理员打开该页面时才可见**，一旦离开页面就完全感知不到域卡死、任务失败等情况。
- 现有的 `useToast`（`composables/useToast.ts` + `components/AppToast.vue`）是一个模块级单例：一次只能显示一条、3 秒自动消失、不支持堆叠、无历史记录、无已读/未读概念——只适合做"操作结果的一次性反馈"，不能承担"持续可回溯的通知列表"这个职责。
- 后端（`AdminArticleController` 等）目前没有任何通知/待审核计数聚合接口。

目标：新增一个跨页面常驻的**通知中心**，把"文章审核需要处理"和"爬虫监控需要处理"这两类信号统一暴露给管理员，不需要管理员主动打开对应页面才能发现问题。

## 2. 设计目标

- **跨页面常驻**：管理员在任意后台页面都能看到未处理事项的数量和内容，不必逐个打开 articles / crawler-monitor 页面排查。
- **可扩展**：新增事件来源（例如未来的评论审核）时，不改动核心调度逻辑和 UI，只新增一个 source 模块。
- **不重复造轮子**：爬虫侧的异常分类逻辑直接复用 `crawlerMonitorTriageWorkbench.mjs` 已验证的规则，不重新定义一套分类标准。
- **落地成本可控**：第一期不改动后端，纯前端轮询 + diff 实现；已知的跨设备已读状态不同步的局限被明确记录，而非被忽略。
- **风格对齐**：UI 使用项目现有的手写 Vue SFC + Tailwind + CSS 变量语言，不引入 element-plus/naive-ui 等新依赖。

## 3. 架构

### 3.1 统一事件模型

```
NotificationEvent {
  id: string          // 稳定去重键，如 `article:123:pending_review` / `crawler:townNpc:stalled`
  source: 'article-review' | 'crawler-monitor'
  level: 'info' | 'warning' | 'danger'
  title: string
  detail?: string
  link: string         // 点击跳转目标，如 /articles?id=123 或 /operations/crawler-monitor?domain=townNpc
  createdAt: number    // epoch ms，来自本地 diff 出该事件的时刻
}
```

### 3.2 数据源模块（纯函数，输入状态 + 拉取结果，输出事件数组）

- `data-query-app/notifications/articleReviewSource.mjs`
  - 轮询 `GET /admin/articles?status=PENDING_REVIEW`
  - 与上一次已知的 pending 文章 id 集合做 diff，新进入该集合的文章产出 `article_submitted_for_review` 事件（`level: 'warning'`）
  - 输入输出均为纯数据，不直接持有 `fetch`，调用方（store）负责请求与调度，source 模块只做"上一状态 + 新数据 → 事件数组 + 新状态"的转换，便于单测注入

- `data-query-app/notifications/crawlerMonitorSource.mjs`
  - 轮询 `GET /admin/crawler-monitor/overview`
  - 复用 `crawlerMonitorTriageWorkbench.mjs` 导出的 triage 分类函数得到每个域当前的 `triageStatus`
  - 与上一次已知的每域 `triageStatus` 做 diff，状态跃迁为 `blocked/failed/timed_out/stalled/state_missing` 时产出对应事件（`level: 'danger'`），跃迁回正常状态时**不产出事件**（避免"已恢复"刷屏，恢复情况仍可在铃铛面板里通过该事件消失来体现）

#### 3.2.1 统一接口（为未来新增来源预留）

两个 source 模块都实现同一个形状，作为以后新增来源（如评论审核）时唯一需要遵守的契约：

```
NotificationSource {
  key: string                 // 'article-review' | 'crawler-monitor' | ...
  intervalMs: number
  fetch(): Promise<RawData>   // 调用对应 REST 接口
  diff(prevState, rawData): { events: NotificationEvent[], nextState: any }
}
```

`stores/notifications.ts` 内部维护一个 `sources: NotificationSource[]` 数组，调度循环对数组做遍历，不写死"文章审核"和"爬虫监控"两个具体名字。第一期数组里只放这两个 source 实例；以后新增一类事件，只需要新写一个符合上述接口的 `.mjs` 模块并 `push` 进这个数组，store 的调度、去重、已读、持久化、UI 渲染都不需要改动。

### 3.3 中央调度 store

`data-query-app/stores/notifications.ts`（Pinia，Composition API 风格，参照 `stores/statistics.ts` 的 `loading/fetch` 模式）：

- 分别调度两个 source 各自的轮询定时器，互相独立：一个 source 请求失败不影响另一个
- 合并两个 source 产出的事件，按 `id` 去重，维护：
  - `events: NotificationEvent[]`（最近事件，做长度上限，如 100 条，防止无限增长）
  - `readIds: string[]`（已读事件 id；用数组而非 `Set`，因为持久化插件默认走 JSON 序列化，`Set` 无法直接序列化）
  - `unreadCount` 计算属性
- 已读状态与最近事件列表的持久化改用 `@pinia-plugin-persistedstate/nuxt`（需新增依赖，项目目前未安装任何 Pinia 持久化插件），在 store 定义里对 `events`/`readIds` 声明 `persist: { pick: [...] }`，不再手写 localStorage 读写逻辑。persist key 需要按当前登录管理员 id 隔离（如 `notif:{userId}`），具体做法（动态 key 函数 or 登录/切换账号时手动清空重挂载 store）留到实现阶段验证插件 API 支持程度后再定
- 新增一个 `level: 'danger'` 的事件时，调用现有 `showToast(title, 'warning')` 做一次性弹出提醒（复用现有机制，不新造 toast 系统）

### 3.4 UI

- `layouts/default.vue` 的 `header__actions` 区域（`ThemeSwitcher` 旁）新增一个铃铛图标入口，未读数用小徽章展示（0 时不显示徽章）
- 点击铃铛展开下拉面板：事件列表（按时间倒序），每条展示 `title` + 相对时间 + `level` 对应的着色（复用现有 `--color-danger-muted` 等 token），点击单条事件跳转到 `link` 并标记该事件已读；面板底部提供"全部标记已读"
- 面板视觉语言对齐现有 header/sidebar（圆角、`color-mix`、`backdrop-filter`），不引入新组件库

### 3.5 轮询与生命周期

- 文章审核 source：30s 一次
- 爬虫监控 source：固定 20s 一次，与 crawler-monitor 页面自身的 3~10s 轮询相互独立、不做联动。crawler-monitor 页面当前把 overview 数据存在页面本地的 `ref`（script setup 内），不是 Pinia store，没有现成的状态可供通知中心订阅；要联动需要先把该页面的状态提升为共享 store，这是一次单独的重构，不在本期范围内。因此第一期接受"管理员停留在该页面时，两套定时器各自轮询同一个 overview 接口"这一已知的轻微冗余请求，后续如有必要再做状态提升合并
- 标签页隐藏（`visibilitychange`）时暂停两个 source 的定时器，复现 `crawler-monitor.vue` 已验证的模式
- 遇到 401/403 时停止对应 source 的轮询，不重复弹错误提示

## 4. 错误处理

- 单个 source 拉取失败：记录一次 `console.warn`，不产出新事件，不清空已有事件列表，不影响另一个 source 的轮询
- 持久化插件读写 localStorage 失败（如隐私模式）：内存态仍正常工作，只是刷新后已读状态和历史丢失，不抛出运行时错误阻断页面

## 5. 测试策略

沿用本项目对 crawler-monitor 已确立的测试原则：行为测试优于对 `.vue` 源码做正则匹配，离线可注入优于真实网络请求。

- `articleReviewSource.mjs` / `crawlerMonitorSource.mjs`：纯函数单测，喂入"上一状态快照 + mock 拉取结果"，断言产出的事件数组与新状态，不发真实网络请求
- `stores/notifications.ts`：注入 mock source（伪造定时轮询结果）测试合并去重、已读状态、localStorage 持久化、danger 事件触发 toast 等行为
- 铃铛面板组件：挂载后注入 store 状态断言渲染与交互行为（点击跳转、标记已读、徽章数字），不对组件源码做字符串匹配

## 6. 范围确认（已获用户确认）

1. **事件范围**：只做「文章审核」+「爬虫监控」两类（用户原话明确提到的两类）。评论审核等其他类型不纳入第一期，但 3.2.1 节的 source 注册接口已为它们预留了扩展点。
2. **数据来源**：纯前端轮询 + diff（不改后端），代价是已读状态/历史不跨设备、不跨浏览器同步。如果后续需要跨设备一致的通知状态，需要新增后端聚合接口，届时是设计的重大调整而非增量修改。
3. **展示形式**：顶部铃铛 + 下拉面板（而非右侧抽屉）。

## 7. 后续可扩展方向（本期不做）

- 新增评论审核等其他事件来源：只需新增一个 source 模块 + 在 store 里注册，不改动 UI 和调度框架
- 后端聚合接口：如果前端轮询的网络开销或跨设备一致性成为问题，可以将 source 模块的 diff 逻辑下沉到后端，前端 store 改为消费单一聚合接口，UI 层不受影响

**明确不做的事**：项目里目前还有 4 处直接读写 `window.localStorage` 的代码，与本次的通知中心无关，本期**不**顺带迁移：

| 文件 | 用途 |
|---|---|
| `components/ThemeSwitcher.vue` | 深色/浅色主题 |
| `composables/useArticleEditor.ts` | 文章编辑器草稿自动保存 |
| `layouts/default.vue` | 侧边栏展开/收起状态 |
| `pages/operations/crawler-monitor-test.vue` | 刷新间隔设置（测试页） |

这些都是各自组件/composable 内的局部标量状态，跟通知中心要解决的"跨页面共享一份持续更新的事件列表"不是同一类问题，谈不上"全部迁到 Pinia"的必要性——迁移它们本身代价也不高（都是简单的 getItem/setItem，改造成一两个小 store 即可），但属于与本次目标无关的范围外重构，不在本次方案中顺带处理。安装 `@pinia-plugin-persistedstate/nuxt` 之后，如果之后想顺手把这几处也迁移掉，成本会更低（依赖已经装好、用法已经在通知中心里验证过），但那是一次独立的小任务。
