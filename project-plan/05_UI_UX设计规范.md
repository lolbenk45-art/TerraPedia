# TerraPedia UI/UX 设计规范

> 类泰拉瑞亚 Wiki 网站设计规范文档  
> 技术栈：Astro + Tailwind CSS | Solo 开发者

---

## 1. 设计原则

| 原则 | 说明 |
|------|------|
| **信息密度优先** | Wiki 以内容为核心，在保证可读性的前提下合理提升信息密度，减少无意义留白，让用户快速获取所需信息 |
| **可扫描性** | 使用清晰的层级结构、分隔线、标签和表格，支持用户快速扫读定位目标内容 |
| **游戏风格融入** | 视觉元素参考泰拉瑞亚像素美学，适度使用像素风装饰、游戏内稀有度色彩、复古边框等，保持 Wiki 专业感的同时体现游戏特色 |
| **移动端优先** | 优先考虑小屏体验，核心功能在移动端可用，再逐步增强大屏布局与交互 |

---

## 2. 色彩系统

### 2.1 主色与辅助色

| 角色 | 浅色模式 | 暗黑模式 | 用途 |
|------|----------|----------|------|
| 主色 Primary | `#3B82F6` (blue-500) | `#60A5FA` (blue-400) | 链接、按钮、强调 |
| 辅助色 Secondary | `#8B5CF6` (violet-500) | `#A78BFA` (violet-400) | 次要强调、标签 |
| 背景 Background | `#FFFFFF` (white) | `#0F172A` (slate-900) |
| 表面 Surface | `#F8FAFC` (slate-50) | `#1E293B` (slate-800) |
| 边框 Border | `#E2E8F0` (slate-200) | `#334155` (slate-700) |
| 文字 Text | `#0F172A` (slate-900) | `#F1F5F9` (slate-100) |
| 文字次要 Muted | `#64748B` (slate-500) | `#94A3B8` (slate-400) |

### 2.2 语义色

| 语义 | 浅色模式 | 暗黑模式 | 用途 |
|------|----------|----------|------|
| 成功 Success | `#22C55E` (green-500) | `#4ADE80` (green-400) | 成功提示、可合成 |
| 警告 Warning | `#F59E0B` (amber-500) | `#FBBF24` (amber-400) | 警告、需注意 |
| 错误 Error | `#EF4444` (red-500) | `#F87171` (red-400) | 错误、不可用 |
| 信息 Info | `#0EA5E9` (sky-500) | `#38BDF8` (sky-400) | 提示、说明 |

### 2.3 泰拉瑞亚稀有度颜色映射

| 等级 | 名称 | 色值 | Tailwind 类 | 用途 |
|------|------|------|-------------|------|
| 0 | 白色 White | `#FFFFFF` | `text-white` / `border-white` | 普通物品 |
| 1 | 蓝色 Blue | `#9EC1FF` | 自定义 `rarity-1` | 稀有度 1 |
| 2 | 绿色 Green | `#83F9B8` | 自定义 `rarity-2` | 稀有度 2 |
| 3 | 橙色 Orange | `#FFB380` | 自定义 `rarity-3` | 稀有度 3 |
| 4 | 浅红 Light Red | `#FF9999` | 自定义 `rarity-4` | 稀有度 4 |
| 5 | 粉色 Pink | `#FF99FF` | 自定义 `rarity-5` | 稀有度 5 |
| 6 | 浅紫 Light Purple | `#E6B3FF` | 自定义 `rarity-6` | 稀有度 6 |
| 7 | 酸橙色 Lime | `#CCFF99` | 自定义 `rarity-7` | 稀有度 7 |
| 8 | 黄色 Yellow | `#FFFF99` | 自定义 `rarity-8` | 稀有度 8 |
| 9 | 青色 Cyan | `#99FFFF` | 自定义 `rarity-9` | 稀有度 9 |
| 10 | 红色 Red | `#FF6666` | 自定义 `rarity-10` | 稀有度 10 |
| 11 | 紫色 Purple | `#CC99FF` | 自定义 `rarity-11` | 传说/最高稀有度 |

**Tailwind 配置示例：**

```js
// tailwind.config.mjs
theme: {
  extend: {
    colors: {
      rarity: {
        0: '#FFFFFF',
        1: '#9EC1FF',
        2: '#83F9B8',
        3: '#FFB380',
        4: '#FF9999',
        5: '#FF99FF',
        6: '#E6B3FF',
        7: '#CCFF99',
        8: '#FFFF99',
        9: '#99FFFF',
        10: '#FF6666',
        11: '#CC99FF',
      },
    },
  },
},
```

### 2.4 浅色/暗黑模式双色板

| 变量用途 | 浅色模式 | 暗黑模式 |
|----------|----------|----------|
| `--color-bg` | `#FFFFFF` | `#0F172A` |
| `--color-surface` | `#F8FAFC` | `#1E293B` |
| `--color-border` | `#E2E8F0` | `#334155` |
| `--color-text` | `#0F172A` | `#F1F5F9` |
| `--color-text-muted` | `#64748B` | `#94A3B8` |
| `--color-primary` | `#3B82F6` | `#60A5FA` |

---

## 3. 字体系统

### 3.1 font-family

```css
/* 中文：系统字体栈，保证各平台良好显示 */
--font-sans: "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "WenQuanYi Micro Hei", sans-serif;

/* 英文：Inter，清晰易读 */
--font-sans-en: "Inter", var(--font-sans);

/* 代码：JetBrains Mono */
--font-mono: "JetBrains Mono", "Fira Code", "Consolas", monospace;
```

**Tailwind 配置：**

```js
fontFamily: {
  sans: ['Inter', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
  mono: ['JetBrains Mono', 'Consolas', 'monospace'],
},
```

### 3.2 字号规范

| 用途 | 字号 | 行高 | Tailwind 类 | 示例 |
|------|------|------|-------------|------|
| h1 | 2rem (32px) | 1.25 | `text-3xl font-bold` | 页面主标题 |
| h2 | 1.5rem (24px) | 1.3 | `text-2xl font-semibold` | 章节标题 |
| h3 | 1.25rem (20px) | 1.4 | `text-xl font-semibold` | 小节标题 |
| h4 | 1.125rem (18px) | 1.4 | `text-lg font-medium` | 四级标题 |
| h5 | 1rem (16px) | 1.5 | `text-base font-medium` | 五级标题 |
| h6 | 0.875rem (14px) | 1.5 | `text-sm font-medium` | 六级标题 |
| body | 1rem (16px) | 1.6 | `text-base` | 正文 |
| small | 0.875rem (14px) | 1.5 | `text-sm` | 次要说明 |
| caption | 0.75rem (12px) | 1.4 | `text-xs` | 图注、辅助信息 |

---

## 4. 间距系统

基于 **4px 栅格**，与 Tailwind 默认 spacing 一致：

| Token | 值 | Tailwind 类 | 典型用途 |
|-------|-----|-------------|----------|
| 0 | 0px | `0` / `p-0` | 无间距 |
| 1 | 4px | `1` / `p-1` | 极小内边距 |
| 2 | 8px | `2` / `p-2` | 紧凑内边距 |
| 3 | 12px | `3` / `p-3` | 小内边距 |
| 4 | 16px | `4` / `p-4` | 标准内边距 |
| 5 | 20px | `5` / `p-5` | 中等内边距 |
| 6 | 24px | `6` / `p-6` | 大内边距 |
| 8 | 32px | `8` / `p-8` | 区块间距 |
| 10 | 40px | `10` / `p-10` | 大区块间距 |
| 12 | 48px | `12` / `p-12` | 页面边距 |
| 16 | 64px | `16` / `p-16` | 超大间距 |

**常用组合：**
- 卡片内边距：`p-4` (16px)
- 列表项间距：`gap-3` (12px)
- 区块间距：`space-y-6` 或 `gap-6` (24px)
- 页面左右边距：`px-4 md:px-6 lg:px-8` (响应式)

---

## 5. 组件规范

### 5.1 ItemCard 物品卡片

| 属性 | 说明 |
|------|------|
| **结构** | 图标(左) + 名称 + 类型标签(右) + 稀有度颜色左边框 |
| **尺寸** | 高度 `h-14` ~ `h-16`，图标 `w-12 h-12`，最小宽度 `min-w-[200px]` |
| **默认** | 背景 `bg-surface`，边框 `border-l-4 border-rarity-{n}`，圆角 `rounded-md` |
| **悬浮** | `hover:bg-slate-100 dark:hover:bg-slate-700/50`，轻微阴影 |
| **激活** | `ring-2 ring-primary` 或 `bg-primary/10` |

```
┌─────────────────────────────────────┐
│ ▌ [图标]  物品名称        [类型标签] │
│ ▌                                   │
└─────────────────────────────────────┘
  ↑ 稀有度色条
```

### 5.2 BossCard Boss 卡片

| 属性 | 说明 |
|------|------|
| **结构** | 头像/立绘 + 名称 + 简短描述 + 生命值/难度标签 |
| **尺寸** | 宽度 `w-full sm:w-64`，头像 `w-20 h-20` 或 `w-24 h-24` |
| **默认** | 卡片式 `rounded-lg border`，头像圆角或方形 |
| **悬浮** | `hover:shadow-md`，`hover:border-primary/50` |
| **激活** | 点击进入详情页，可加 `active:scale-[0.98]` |

### 5.3 SearchBar 搜索栏

| 属性 | 说明 |
|------|------|
| **结构** | 输入框 + 搜索图标(左) + 清除/加载状态(右) |
| **尺寸** | 高度 `h-10` 或 `h-11`，最大宽度 `max-w-md` 或 `max-w-lg` |
| **默认** | `rounded-lg border`，placeholder 灰色 |
| **聚焦** | `focus:ring-2 focus:ring-primary focus:border-primary` |
| **加载** | 右侧显示 `Loader2` 旋转图标 |

### 5.4 StatTable 属性表格

| 属性 | 说明 |
|------|------|
| **结构** | 表头(属性名) + 表体(数值)，可多列 |
| **尺寸** | 单元格 `px-4 py-2`，表头 `text-sm font-medium` |
| **默认** | 斑马纹 `even:bg-surface`，边框 `border-b` |
| **悬浮** | 行悬浮 `hover:bg-slate-50 dark:hover:bg-slate-800/50` |
| **响应式** | 小屏可改为卡片式堆叠 |

### 5.5 BreadcrumbNav 面包屑导航

| 属性 | 说明 |
|------|------|
| **结构** | 首页 > 分类 > 当前页，分隔符 `ChevronRight` |
| **尺寸** | 字号 `text-sm`，间距 `gap-1` |
| **默认** | 当前页 `font-medium`，其余 `text-muted` |
| **悬浮** | 链接 `hover:text-primary` |
| **激活** | 当前页不可点击，无悬浮效果 |

### 5.6 Pagination 分页

| 属性 | 说明 |
|------|------|
| **结构** | 上一页 + 页码列表 + 下一页，支持省略号 |
| **尺寸** | 按钮 `h-9 w-9` 或 `h-9 px-3` |
| **默认** | 页码 `rounded-md`，当前页 `bg-primary text-white` |
| **悬浮** | `hover:bg-surface` |
| **禁用** | 上一页/下一页禁用时 `opacity-50 cursor-not-allowed` |

### 5.7 RarityBadge 稀有度徽章

| 属性 | 说明 |
|------|------|
| **结构** | 纯文字或带背景的标签，显示稀有度名称 |
| **尺寸** | `text-xs px-2 py-0.5` 或 `text-sm px-2.5 py-1` |
| **默认** | 文字颜色 `text-rarity-{n}`，可选 `bg-rarity-{n}/20` |
| **悬浮** | 一般不交互，可选 `hover:bg-rarity-{n}/30` |
| **激活** | 作为筛选条件时，选中态 `ring-2 ring-rarity-{n}` |

---

## 6. 响应式断点

| 断点 | 宽度 | Tailwind 前缀 | 布局说明 |
|------|------|---------------|----------|
| 默认 | < 640px | (无) | 单列布局，导航折叠/抽屉，搜索全宽，表格卡片化 |
| sm | ≥ 640px | `sm:` | 双列网格可选，侧边栏仍可折叠 |
| md | ≥ 768px | `md:` | 固定侧边栏，内容区加宽，表格可完整展示 |
| lg | ≥ 1024px | `lg:` | 三列网格（如物品列表），侧边栏+主内容+可选右侧栏 |
| xl | ≥ 1280px | `xl:` | 最大内容宽度 `max-w-7xl`，留白适中 |

**典型布局类：**

```html
<!-- 容器 -->
<div class="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">

<!-- 网格 -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">

<!-- 侧边栏 + 主内容 -->
<div class="flex flex-col lg:flex-row gap-6">
  <aside class="lg:w-64 shrink-0">...</aside>
  <main class="flex-1 min-w-0">...</main>
</div>
```

---

## 7. 图标规范

使用 **Lucide** 图标库，保持风格统一。

### 7.1 常用图标映射

| 场景 | 图标名 | 用途 |
|------|--------|------|
| 搜索 | `Search` | 搜索栏、搜索按钮 |
| 导航-首页 | `Home` | 首页链接 |
| 导航-菜单 | `Menu` | 移动端菜单展开 |
| 导航-关闭 | `X` | 关闭弹窗、菜单 |
| 外链 | `ExternalLink` | 外部链接标识 |
| 内部链接 | `ArrowRight` / `ChevronRight` | 面包屑、列表项 |
| 分类/标签 | `Tag` | 类型标签、分类 |
| 设置 | `Settings` | 设置入口 |
| 主题切换 | `Sun` / `Moon` | 浅色/暗黑切换 |
| 信息 | `Info` | 提示、说明 |
| 警告 | `AlertTriangle` | 警告信息 |
| 错误 | `AlertCircle` | 错误信息 |
| 成功 | `CheckCircle` | 成功状态 |
| 加载 | `Loader2` | 加载中（需 `animate-spin`） |
| 收藏/星标 | `Star` | 收藏、重要标记 |
| 筛选 | `Filter` | 筛选条件 |
| 排序 | `ArrowUpDown` | 排序切换 |

### 7.2 图标尺寸规范

| 场景 | 尺寸 | Tailwind 类 |
|------|------|-------------|
| 内联文字旁 | 16px | `w-4 h-4` |
| 按钮内 | 18–20px | `w-5 h-5` |
| 导航项 | 20px | `w-5 h-5` |
| 卡片/列表项 | 24px | `w-6 h-6` |
| 空状态/大图标 | 48px | `w-12 h-12` |

---

## 8. 动画与过渡

### 8.1 原则

- **简洁**：避免花哨动画，以功能性过渡为主
- **性能优先**：优先使用 `transform`、`opacity`，避免触发布局/重绘

### 8.2 标准过渡时长

| 用途 | 时长 | Tailwind |
|------|------|----------|
| 微交互（按钮、链接） | 150ms | `duration-150` |
| 常规过渡 | 200ms | `duration-200` |
| 面板、下拉 | 250ms | `duration-250` |
| 模态、抽屉 | 300ms | `duration-300` |

### 8.3 缓动函数

| 用途 | 缓动 | Tailwind |
|------|------|----------|
| 默认 | ease | `ease-default` |
| 进入 | ease-out | `ease-out` |
| 退出 | ease-in | `ease-in` |
| 进出 | ease-in-out | `ease-in-out` |

### 8.4 常用过渡组合

```css
/* 按钮/链接悬浮 */
transition-colors duration-150 ease-out

/* 卡片悬浮 */
transition-all duration-200 ease-out

/* 模态/抽屉 */
transition-opacity duration-300 ease-out
transition-transform duration-300 ease-out
```

**Tailwind 类示例：**

```html
<button class="transition-colors duration-150 hover:bg-primary/10">
  按钮
</button>

<div class="transition-all duration-200 hover:shadow-md">
  卡片
</div>
```

---

## 附录：快速参考

| 项目 | 值 |
|------|-----|
| 主色 | `blue-500` / `blue-400` |
| 正文字号 | `text-base` (16px) |
| 标准间距 | `p-4` `gap-4` |
| 圆角 | 小 `rounded-md` 中 `rounded-lg` 大 `rounded-xl` |
| 过渡 | `transition-colors duration-150` |
| 图标库 | Lucide |
| 断点 | sm:640 md:768 lg:1024 xl:1280 |

---

*文档版本：1.0 | 最后更新：2025-03*
