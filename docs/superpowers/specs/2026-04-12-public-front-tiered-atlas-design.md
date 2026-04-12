# TerraPedia 公开前台 Tiered Atlas 设计稿

- Date: `2026-04-12`
- Scope: `front`
- Status: `approved-in-chat / pending-written-review`
- Design baseline: `HomePage / Atlas Gate`
- Design system: `Moss Lantern`
- Direction: `Tiered Atlas`
- Method note: `ui-ux-pro-max rulebase fallback`

## 1. 目标

本次不是重做一个全新站点，而是把首页已经建立的 `Atlas Gate + Moss Lantern` 视觉语言扩展成整套公开前台的统一系统。

最终效果应该是：

- 首页继续承担最强的世界入口和品牌记忆点
- `Items/NPCs` 页面像高质量检索工作台，而不是旧工具页
- `Articles/About` 页面像知识档案册，而不是附属说明页
- 整站共享同一套色彩、材质、按钮、标题、状态、分页、路径和动效语法
- 用户能一眼看出这是同一家产品，但不同页面层级承担不同任务

## 2. 范围

本次设计覆盖以下公开前台路由：

- `/`
- `/items`
- `/items/:id`
- `/npcs`
- `/npcs/:id`
- `/articles`
- `/articles/:id`
- `/about`

## 3. 不在本次范围

- 登录、注册、找回密码、个人中心
- 后台管理端
- 后端接口契约重构
- SEO、部署、运营系统大改
- 新增复杂推荐系统或新数据接口

说明：

- 首页是风格母版，但不是本次主要重构对象
- 如内页落地时必须微调共享 token 或公共壳层，可以做最小必要联动

## 4. 当前问题

当前公开前台的主要问题不是没有样式，而是没有真正形成“整站级设计系统”。

具体表现：

- 首页已经形成完整品牌语言，但内页没有稳定继承
- `/items` 仍有明显旧工作台结构痕迹
- `/items/:id` 和 `/npcs/:id` 信息很多，但还偏模块堆叠
- `/articles`、`/articles/:id`、`/about` 已有阅读感，但还不够成体系
- 共用组件语言不完整，很多页面仍在各自判断边框、容器、状态和节奏

## 5. 最终方向：Tiered Atlas

本次采用 `Tiered Atlas`，而不是“所有页面都做成首页”。

核心原则：

- 首页最强
- 工具页高效
- 阅读页安静
- 全站同族

这条路线同时满足：

- 强统一感
- 明确页面角色分层
- 保留首页品牌张力
- 不牺牲检索与阅读效率

## 6. 页面分层

### Tier 0 / Atlas Gate

只用于首页 `/`。

职责：

- 承担 TerraPedia 第一印象
- 提供最强的探索入口和世界感
- 建立导航、品牌、材质、按钮和节奏母版

保留特征：

- 双栏 Hero
- 路线卡片
- Relic/Stage 舞台感
- 最强的背景层次与叙事张力

### Tier 1 / Atlas Workbench

用于：

- `/items`
- `/items/:id`
- `/npcs`
- `/npcs/:id`

职责：

- 让用户快速查找、定位、筛选和理解条目
- 在高信息密度下保持秩序和结构感
- 继承首页品牌语气，但不复制首页舞台结构

特征：

- Hero 仍存在，但更偏信息摘要
- 工具栏、索引轨道、结果区、详情侧栏都采用统一容器语法
- 视觉表达克制于首页，但明显强于旧工具页

### Tier 2 / Editorial Ledger

用于：

- `/articles`
- `/articles/:id`
- `/about`

职责：

- 承担知识条目、项目说明、长文本阅读
- 强化版式、留白、摘要和正文节奏

特征：

- 比 Workbench 更安静
- 更像档案册、冒险日志、项目 dossier
- 仍共享 Moss Lantern 色彩和组件语言

## 7. 设计系统

### 7.1 色彩

继续使用首页已建立的 `Moss Lantern` token：

- `--bg-primary`
- `--bg-secondary`
- `--bg-tertiary`
- `--surface-panel`
- `--surface-soft`
- `--surface-elevated`
- `--text-primary`
- `--text-secondary`
- `--text-muted`
- `--border-color`
- `--border-strong`
- `--accent-primary`
- `--accent-secondary`
- `--accent-gold`
- `--accent-support`

使用规则：

- 绿色承担主 CTA 和主导航强调
- 金色只做路径高光和重点强调，不做大面积主功能色
- 青色只做辅助结构点亮
- 页面不得自创新的主色体系

### 7.2 材质层级

整站只保留三类主要表面：

1. `surface-panel`
   用于页面级容器、Hero、大摘要层

2. `surface-card`
   用于标准内容卡、详情块、统计块、列表卡

3. `surface-card--soft`
   用于筛选条、标签区、提示区、轻量元信息块

禁止：

- 每页自定义新的主容器底色
- 用零散 utility 背景临时拼出页面主骨架

### 7.3 排版

统一规则：

- 一级页头统一使用 `section-eyebrow + section-title + section-copy`
- 检索页正文宽度偏宽，阅读页正文宽度收窄
- 中文是主要阅读语言，英文名和 internal name 只做 secondary 信息
- 元信息使用更安静的 label、mono、chip 样式

### 7.4 图标与信号

遵循 `ui-ux-pro-max` 的 `no-emoji-icons` 规则：

- 不再使用 emoji 作为结构型 UI 图标
- 优先使用统一 SVG 图标或字母徽记
- 缺图 fallback 使用统一样式，不再每页各做各的

### 7.5 动效

遵循 `ui-ux-pro-max` 的 `duration-timing`、`motion-meaning`、`layout-shift-avoid`：

- 内页只使用 150-300ms 的轻位移、透明度、阴影变化
- 不在内页复用首页级浮空装置感动效
- 所有动效尊重 `prefers-reduced-motion`

### 7.6 状态系统

以下状态统一语言：

- loading
- empty
- error
- retry
- pagination current / disabled
- active filter
- breadcrumb current

要求：

- 状态文案简洁
- 状态区使用统一 panel 语法
- 不再每页各自发明错误区和空态区

## 8. 页面模板

### 8.1 Atlas Workbench 列表页模板

适用：

- `/items`
- `/npcs`

固定结构：

1. Hero summary
2. Workbench toolbar
3. Rail / filters
4. Result summary
5. Result grid or list
6. Pager

设计要求：

- 首屏先告诉用户当前所在页面、当前切片、当前总量和当前操作上下文
- Toolbar 承接搜索、筛选、排序、刷新和状态 chip
- Rail 是索引轨道，不是旧侧栏复刻
- Results 顶部要先有摘要层，再进入卡片或结果网格

### 8.2 Atlas Workbench 详情页模板

适用：

- `/items/:id`
- `/npcs/:id`

固定结构：

1. Breadcrumbs
2. Back link
3. Hero
4. Main / Sidebar content shell

设计要求：

- Hero 先建立条目身份，而不是直接堆正文
- Main 区承接主内容、关系、说明、模块
- Sidebar 承接元信息、路径、状态、补充模块
- 不同实体页共用同一个详情壳层，而不是各自独立设计

### 8.3 Editorial Ledger 模板

适用：

- `/articles`
- `/articles/:id`
- `/about`

固定结构：

1. Lead header
2. Summary / metadata layer
3. Reading body
4. Aside / extended reading / project supplements

设计要求：

- 强调正文节奏和留白
- 头部摘要要比当前更有存在感
- 阅读层必须明显区别于 Workbench，但仍属于同一家族

## 9. 路由级落地

### `/`

- 保留 Atlas Gate
- 不作为本次主要重构对象
- 继续承担品牌和探索母版职责

### `/items`

- 升级为 TerraPedia 主检索工作台
- Hero 显示索引总量、当前分类、排序、页码
- 分类树升级为 Atlas Index Rail
- 结果区先摘要后网格

### `/items/:id`

- 升级为 Item 档案页
- 顶部 Hero 先建立媒体、名称、摘要、核心属性
- 主区承接描述、配方、关系
- 侧栏承接路径、元信息、来源

### `/npcs`

- 与 `/items` 对齐为同一工作台层
- 搜索、过滤、结果摘要、目录感统一

### `/npcs/:id`

- 与 `/items/:id` 共用实体详情页壳层
- Hero 建立身份
- 模块区统一承接 Loot / Shop / Buffs
- 侧栏承接 profile facts 和 aggregate 状态

### `/articles`

- 升级为 Editorial Ledger 列表页
- 保留封面 + 文本双栏卡，但搜索、统计、状态语言统一进同一壳层

### `/articles/:id`

- 升级为真正的阅读页
- 头部承接标题、编号、摘要、作者、封面
- 正文进入 reading body
- 侧边承接补充信息和继续阅读

### `/about`

- 从轻说明页升级成项目 dossier
- 内容组织围绕项目定位、阶段、系统能力和当前优先级

## 10. 验收标准

用户验收时重点看：

1. 一眼能看出首页和内页属于同一家产品
2. 首页像入口厅，`Items/NPCs` 像工作台，`Articles/About` 像档案册
3. 移动端没有横向滚动，结构不崩
4. 页面主动作明确，不再出现“所有东西都像主按钮”
5. Breadcrumb、hero、summary strip、chip、pager、section frame 形成共用体系
6. 不再使用 emoji 作为结构型 UI 图标

## 11. 最小实现验证

实现阶段至少验证：

- `front` 类型检查通过
- `front` 构建通过
- 公开前台关键页面的壳层测试通过
- 手机宽度下无横向滚动和关键布局塌陷

## 12. 风险与边界

- 该方案允许明显重排页面结构，但不改后端契约
- 首页不作为重构主体，避免扩大范围
- 若共享样式层不先抽稳，后续页面容易再次漂移
- 若实现时为追求“统一”而把所有页面做得像首页，会损失检索效率和阅读节奏
