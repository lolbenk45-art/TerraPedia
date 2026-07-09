# TerraPedia 文档体系规范

> 适用于类泰拉瑞亚 Wiki 网站 TerraPedia 的文档体系设计。技术栈：Astro SSG，Solo 开发者。

---

## 1. 文档分类与受众

| 文档类型 | 受众 | 位置 | 格式 | 更新频率 |
|----------|------|------|------|----------|
| **项目文档** | 自己（Solo 开发者） | `docs/adr/`、`docs/decisions/` | Markdown | 有重大决策时 |
| 架构决策记录（ADR） | 自己 | `docs/adr/` | Markdown | 每次架构变更 |
| 技术选型理由 | 自己 | `docs/decisions/` 或 ADR | Markdown | 选型时一次性 |
| **开发者文档** | 贡献者 | `README.md`、`CONTRIBUTING.md`、`docs/dev/` | Markdown | 功能变更时 |
| 本地运行指南 | 贡献者 | `README.md`、`docs/dev/setup.md` | Markdown | 环境变更时 |
| 数据添加指南 | 贡献者 | `CONTRIBUTING.md`、`docs/dev/data-guide.md` | Markdown | 数据格式变更时 |
| 代码规范 | 贡献者 | `docs/dev/code-style.md`、`.eslintrc` | Markdown / JSON | 规范变更时 |
| **用户文档** | 访问者 | 站点内 `/help/`、`/faq/` | Markdown → HTML | 功能上线时 |
| 站点功能说明 | 访问者 | 站点内 `/help/` | Markdown → HTML | 新功能发布时 |
| FAQ | 访问者 | 站点内 `/faq/` | Markdown → HTML | 常见问题积累时 |

### 文档目录结构建议

```
project-root/
├── README.md                 # 项目主入口
├── CONTRIBUTING.md           # 贡献指南（含数据贡献）
├── CHANGELOG.md              # 版本变更记录
├── LICENSE                   # 开源协议
├── docs/
│   ├── adr/                  # 架构决策记录
│   │   ├── 0001-选择-astro-而非-nextjs.md
│   │   └── 0002-选择-yaml-存储数据.md
│   ├── decisions/            # 技术选型补充说明（可选）
│   └── dev/                  # 开发者文档
│       ├── setup.md          # 本地环境搭建
│       ├── data-guide.md     # 数据格式详解
│       └── code-style.md     # 代码规范
└── src/
    └── content/              # 用户可见内容（站点内文档）
        └── help/
            ├── index.md
            └── faq.md
```

---

## 2. README.md 模板

```markdown
# TerraPedia

<p align="center">
  <strong>泰拉瑞亚中文百科</strong> · 结构化、可检索、视觉友好的游戏数据查询站点
</p>

<p align="center">
  <a href="https://terrapedia.example.com">在线预览</a> ·
  <a href="CONTRIBUTING.md">参与贡献</a> ·
  <a href="CHANGELOG.md">更新日志</a>
</p>

---

## 项目简介

TerraPedia 是一个现代化的泰拉瑞亚（Terraria）中文百科站点，为玩家提供结构化、可检索、视觉友好的游戏数据查询与攻略浏览体验。采用 Astro 静态站点生成，零运维、高性能、无广告。

## 特性列表

- **极速加载**：静态优先，首屏 < 2s
- **响应式设计**：移动端优先，适配各种屏幕
- **结构化数据**：JSON/YAML 驱动，支持高级筛选与搜索
- **中文原生**：术语统一，翻译完整
- **无广告**：纯净浏览体验

## 快速开始

### 环境要求

- Node.js >= 20
- pnpm >= 9（推荐）或 npm / yarn

### 安装

```bash
# 克隆仓库
git clone https://github.com/your-username/terrapedia.git
cd terrapedia

# 安装依赖
pnpm install
```

### 本地运行

```bash
pnpm dev
```

访问 http://localhost:4321

### 构建

```bash
pnpm build
```

构建产物位于 `dist/` 目录。

### 预览构建结果

```bash
pnpm preview
```

## 项目结构

```
terrapedia/
├── src/
│   ├── components/     # Astro/React 组件
│   ├── content/        # Content Collections（数据与文档）
│   ├── layouts/        # 页面布局
│   ├── pages/          # 路由页面
│   └── utils/          # 工具函数
├── public/             # 静态资源
├── docs/               # 项目文档
└── scripts/            # 构建/数据脚本
```

## 如何贡献

欢迎贡献！请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解：

- 如何添加/修改物品数据
- 数据格式说明
- PR 提交流程

## License

[MIT](LICENSE) © TerraPedia
```

---

## 3. 数据贡献指南模板（CONTRIBUTING.md）

```markdown
# 贡献指南

感谢你对 TerraPedia 的关注！本文档说明如何为项目贡献数据与代码。

## 目录

- [添加物品数据](#添加物品数据)
- [修改现有数据](#修改现有数据)
- [数据格式说明](#数据格式说明)
- [PR 流程](#pr-流程)

---

## 添加物品数据

### 1. 确定物品类型

根据物品类型选择对应目录：

| 类型 | 路径 | 示例 |
|------|------|------|
| 武器 | `src/content/items/weapons/` | 剑、弓、法杖 |
| 工具 | `src/content/items/tools/` | 镐、斧、锤 |
| 材料 | `src/content/items/materials/` | 矿石、木材 |
| 消耗品 | `src/content/items/consumables/` | 药水、食物 |

### 2. 创建 YAML 文件

在对应目录下新建 `{物品英文名}.yaml`，参考同目录下的现有文件填写字段。

### 3. 添加图片

将物品图片放入 `public/images/items/`，命名为 `{物品英文名}.png`。

### 4. 本地验证

```bash
pnpm dev
```

在浏览器中检查物品是否正确显示。

---

## 修改现有数据

1. 找到对应的 YAML 文件
2. 直接编辑字段
3. 确保符合 [数据格式说明](#数据格式说明)
4. 运行 `pnpm build` 确保无报错

---

## 数据格式说明

### 物品基础 Schema

```yaml
# 必填字段
id: "iron_sword"           # 唯一标识，英文小写+下划线
name: "铁剑"                # 中文显示名
type: "weapon"             # 类型：weapon | tool | material | consumable

# 可选字段（根据类型不同）
description: "一把基础铁剑"  # 物品描述
rarity: "white"            # 稀有度：white | blue | green | orange | red | purple | yellow | cyan
damage: 14                 # 伤害值（武器）
useTime: 20                # 使用时间（毫秒）
stack: 1                   # 堆叠上限
sell: 90                   # 出售价格（铜币）
source: ["铁砧"]           # 获取来源
```

### 字段约束

- `id`：全局唯一，仅允许小写字母、数字、下划线
- `name`：必填，支持中文
- `rarity`：必须是预定义枚举值之一
- 数值类字段：必须为非负整数

### 完整示例

参见 `src/content/items/weapons/iron_sword.yaml`

---

## PR 流程

1. **Fork** 本仓库到你的 GitHub 账号
2. **Clone** 到本地，创建分支：`git checkout -b add-item-xxx`
3. **修改** 数据或代码，遵循现有格式
4. **测试**：运行 `pnpm build` 确保构建通过
5. **提交**：`git commit -m "feat(data): 添加铁剑物品数据"`
6. **推送**：`git push origin add-item-xxx`
7. **创建 PR**：在 GitHub 上发起 Pull Request，填写变更说明
8. **等待审核**：维护者会尽快 Review，如有修改建议请及时更新

### 提交信息规范

采用 [Conventional Commits](https://www.conventionalcommits.org/)：

- `feat(data): 添加 xxx 物品`
- `fix(data): 修正 xxx 的伤害值`
- `docs: 更新贡献指南`
```

---

## 4. 架构决策记录（ADR）模板

### 模板结构

```markdown
# ADR-XXXX: [决策标题]

## 状态

[提议中 | 已接受 | 已废弃 | 已替代]

## 上下文

描述需要做出决策的背景、问题或机遇。说明相关技术约束、业务需求、团队情况等。

## 决策

明确说明最终做出的决定，以及做出该决定的核心理由。

## 后果

### 正面影响

- 列举采纳此决策带来的好处

### 负面影响 / 风险

- 列举需要接受的权衡与风险

### 后续行动

- 需要跟进的具体事项
```

### 示例一：选择 Astro 而非 Next.js

```markdown
# ADR-0001: 选择 Astro 而非 Next.js 作为 SSG 框架

## 状态

已接受

## 上下文

TerraPedia 是 Solo 开发者主导的泰拉瑞亚 Wiki 站点，核心需求为：
- 静态内容为主，无用户账号、无实时 API
- 首屏加载需 < 2s，SEO 友好
- 部署成本需接近零（免费托管）
- 开发效率优先，学习曲线不宜过陡

Next.js 与 Astro 均为可选方案，需在性能、复杂度、运维成本间权衡。

## 决策

选择 **Astro** 作为静态站点生成框架。

理由：
1. **零 JS 默认**：Astro 默认输出纯 HTML，按需注入交互（岛屿架构），首屏性能优于 Next.js 默认方案
2. **Content Collections 原生支持**：游戏数据以 YAML/JSON 存储，Astro 内置类型安全的内容层，无需自建数据管道
3. **部署极简**：纯静态输出，可部署至 Cloudflare Pages 等免费平台，无需 Node 运行时
4. **Solo 友好**：概念更少，配置更轻，适合单人维护
5. **渐进增强**：未来若需 React 组件（如搜索、筛选），可按需引入，不破坏现有架构

## 后果

### 正面影响

- 首屏加载时间可控制在 2s 内
- 托管费用为 $0（Cloudflare Pages 免费额度）
- 无服务端，攻击面小，无需运维监控
- 构建产物可全量 CDN 缓存

### 负面影响 / 风险

- 动态搜索需依赖客户端方案（如 Pagefind），数据量极大时可能受限
- 若后续需用户系统、API 服务，需评估迁移至 Next.js 的成本

### 后续行动

- 在 `docs/adr/` 中记录本决策
- 若未来需求变更，可新增 ADR 记录迁移理由
```

### 示例二：选择 YAML 而非 Markdown 存储数据

```markdown
# ADR-0002: 选择 YAML 而非 Markdown 存储游戏数据

## 状态

已接受

## 上下文

TerraPedia 需存储大量结构化游戏数据（物品、NPC、Boss 等），每类数据有固定字段（id、name、damage、rarity 等）。需选择一种易于人工编辑、便于程序解析的格式。

候选方案：
- **Markdown + Frontmatter**：内容与元数据混合，适合文档型内容
- **YAML**：纯结构化数据，无冗余标记
- **JSON**：程序友好，但人工编辑易出错（逗号、引号）

## 决策

选择 **YAML** 作为游戏数据的主存储格式。

理由：
1. **结构化优先**：物品数据以字段为主，描述文本为辅，YAML 的键值对结构更直观
2. **人工可读可写**：贡献者无需学习 Markdown 语法，缩进即可表达层级，支持中文无需转义
3. **Astro Content Collections 支持**：Astro 原生支持 YAML，可配合 Zod 做 Schema 校验
4. **与 Markdown 共存**：长文本描述可内嵌于 YAML 的多行字符串，或单独用 Markdown 存储攻略类内容

## 后果

### 正面影响

- 贡献者上手门槛低，社区参与数据维护更容易
- 类型校验可在构建时完成，减少运行时错误
- 与 Git 版本控制配合良好，diff 清晰

### 负面影响 / 风险

- YAML 缩进敏感，需在 CONTRIBUTING 中明确规范
- 超长文本在 YAML 中可读性一般，可考虑拆分为独立 Markdown 文件引用

### 后续行动

- 在 `src/content/` 下建立统一的 YAML Schema
- 编写 `docs/dev/data-guide.md` 详细说明各字段含义与示例
```

---

## 5. CHANGELOG 规范

采用 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 格式。

### 格式说明

- 版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)（主版本.次版本.修订号）
- 变更分类：`Added`、`Changed`、`Deprecated`、`Removed`、`Fixed`、`Security`
- 每个版本标注日期（YYYY-MM-DD）
- 未发布变更放在 `[Unreleased]` 下

### 示例

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/lang/zh-CN/).

## [Unreleased]

### Added

- 物品详情页支持「相关合成」区块
- 搜索框支持按稀有度筛选

### Changed

- 升级 Astro 至 5.1
- 物品列表页分页从 20 条改为 30 条

### Fixed

- 移动端导航菜单点击后无法关闭的问题

---

## [1.2.0] - 2025-03-15

### Added

- 新增 Boss 攻略专题页（史莱姆王、克苏鲁之眼）
- 物品数据支持 `source` 字段，展示获取来源
- 暗黑模式切换按钮

### Changed

- 搜索索引构建时间优化，减少约 30%
- 物品卡片样式调整，稀有度颜色更明显

### Fixed

- 修复部分物品图片 404 问题
- 修复中文搜索分词不准确的问题

---

## [1.1.0] - 2025-02-28

### Added

- 物品高级筛选（按类型、稀有度、伤害范围）
- 站点内 FAQ 页面

### Fixed

- 修复移动端表格横向滚动异常
```

---

## 6. 代码内文档规范

### 6.1 组件文档（Props 说明）

Astro/React 组件需在文件顶部或 Props 接口处添加 JSDoc 注释。

```tsx
/**
 * 物品卡片组件
 * 用于在列表页展示单个物品的摘要信息
 *
 * @example
 * <ItemCard item={item} showRarity />
 */
interface ItemCardProps {
  /** 物品数据对象 */
  item: Item;
  /** 是否显示稀有度颜色条，默认 true */
  showRarity?: boolean;
  /** 点击时的回调 */
  onClick?: (item: Item) => void;
}

export function ItemCard({ item, showRarity = true, onClick }: ItemCardProps) {
  // ...
}
```

### 6.2 工具函数文档（JSDoc）

```typescript
/**
 * 将游戏内铜币数量格式化为可读字符串
 * @param copper - 铜币数量（整数）
 * @returns 格式化后的字符串，如 "1 金 50 银 20 铜"
 *
 * @example
 * formatCurrency(120)   // "1 银 20 铜"
 * formatCurrency(10000) // "1 金"
 */
export function formatCurrency(copper: number): string {
  // ...
}
```

### 6.3 数据 Schema 注释

在 Content Collections 的 config 或 Zod Schema 中添加注释。

```typescript
// src/content/config.ts
import { defineCollection, z } from "astro:content";

const itemsCollection = defineCollection({
  type: "data",
  schema: z.object({
    id: z.string().describe("唯一标识，英文小写+下划线"),
    name: z.string().describe("中文显示名"),
    type: z.enum(["weapon", "tool", "material", "consumable"]),
    rarity: z
      .enum(["white", "blue", "green", "orange", "red", "purple", "yellow", "cyan"])
      .optional()
      .describe("稀有度，对应游戏内颜色"),
    damage: z.number().int().min(0).optional().describe("伤害值，仅武器有效"),
    stack: z.number().int().min(1).default(1).describe("堆叠上限"),
    // ...
  }),
});
```

---

## 7. 文档自动化

### 7.1 TypeDoc / JSDoc 自动生成 API 文档

**适用场景**：工具函数、类型定义、公共 API 的文档站点。

**推荐方案**：TypeDoc

```bash
pnpm add -D typedoc
```

`package.json` 配置：

```json
{
  "scripts": {
    "docs:api": "typedoc --entryPoints src/utils --out docs/api --plugin typedoc-plugin-markdown --excludePrivate"
  }
}
```

`typedoc.json` 示例：

```json
{
  "entryPoints": ["src/utils", "src/types"],
  "out": "docs/api",
  "plugin": ["typedoc-plugin-markdown"],
  "excludePrivate": true,
  "excludeProtected": true,
  "readme": "none"
}
```

**输出**：`docs/api/` 下生成 Markdown 格式的 API 文档，可纳入站点或单独查阅。

### 7.2 CHANGELOG 自动生成（conventional-changelog）

**适用场景**：根据 Git 提交信息自动生成 CHANGELOG 条目。

**推荐方案**：`conventional-changelog-cli`

```bash
pnpm add -D conventional-changelog-cli
```

`package.json` 配置：

```json
{
  "scripts": {
    "changelog": "conventional-changelog -p angular -i CHANGELOG.md -s"
  }
}
```

**工作流**：

1. 提交时使用 Conventional Commits：`feat: 添加铁剑物品`、`fix: 修复搜索 404`
2. 发布新版本前执行：`pnpm changelog`
3. 工具根据提交历史追加 `[Unreleased]` 下的变更到 CHANGELOG
4. 手动调整分类、合并重复项、补充描述

**与标准版本发布流程结合**：

```json
{
  "scripts": {
    "release": "pnpm changelog && git add CHANGELOG.md && git commit -m 'chore: update changelog'"
  }
}
```

---

## 附录：文档检查清单

| 文档 | 发布前检查 |
|------|------------|
| README | 安装/运行命令是否最新、链接是否有效 |
| CONTRIBUTING | 数据格式是否与 Schema 一致、示例是否可运行 |
| ADR | 状态是否更新、后果是否补充 |
| CHANGELOG | 版本号与日期是否正确、分类是否完整 |
| 代码注释 | 公共 API 是否有 JSDoc、复杂逻辑是否有说明 |

---

*文档版本：1.0 | 最后更新：2025-03*
