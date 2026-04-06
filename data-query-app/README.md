# DataQuery - TerraPedia 管理端（Nuxt）

基于 Vue 3.5 + Nuxt 构建的 TerraPedia 后台管理端，支持分类与物品数据管理。

## ✨ 特性

- 🎨 **多主题支持** - 内置 5 种精美主题（明亮、暗黑、海洋、森林、日落）
- 🔍 **数据查询** - SQL 编辑器，支持查询历史、快捷模板
- 📊 **数据可视化** - 柱状图、折线图、饼图等多种图表类型
- ⚡ **现代化设计** - 玻璃态效果、渐变、动画交互
- 📱 **响应式布局** - 完美适配桌面和移动设备
- 🌙 **深色模式** - 支持系统偏好自动切换

## 🛠️ 技术栈

- **Vue 3.5** - 渐进式 JavaScript 框架
- **Nuxt 3.14** - 全栈 Vue 框架
- **TypeScript** - 类型安全的 JavaScript
- **Tailwind CSS** - 实用优先的 CSS 框架
- **@vueuse/core** - Vue 组合式函数库
- **@nuxtjs/color-mode** - 颜色模式管理

## 📦 安装

```bash
# 进入项目目录
cd data-query-app

# 安装依赖
pnpm install

# 启动开发服务器
pnpm run dev
```

## 🚀 构建

```bash
# 生产构建
pnpm run build

# 静态生成
pnpm run generate

# 预览生产构建
pnpm run preview

# 类型检查
pnpm run check
```

## 📁 项目结构

```
data-query-app/
├── assets/
│   └── css/
│       └── main.css          # 全局样式和主题变量
├── components/
│   └── ThemeSwitcher.vue     # 主题切换组件
├── layouts/
│   └── default.vue           # 默认布局
├── pages/
│   ├── index.vue             # 首页
│   ├── query.vue             # 数据查询页
│   ├── visualization.vue     # 数据可视化页
│   └── about.vue             # 关于页面
├── nuxt.config.ts            # Nuxt 配置
├── tailwind.config.js        # Tailwind 配置
├── package.json
└── README.md
```

## 🎨 主题系统

项目使用 CSS 变量实现主题系统，支持以下主题：

1. **明亮 (Light)** - 默认主题，清爽简洁
2. **暗黑 (Dark)** - 深色模式，护眼舒适
3. **海洋 (Ocean)** - 蓝色调，清新自然
4. **森林 (Forest)** - 绿色调，生机勃勃
5. **日落 (Sunset)** - 橙色调，温暖活力

主题配置位于 `assets/css/main.css` 中。

## 📝 功能说明

### 首页
- Hero 区域展示
- 功能特性介绍
- 数据统计展示
- CTA 行动号召

### 数据查询
- SQL 编辑器
- 数据源选择
- 快捷查询模板
- 查询历史
- 结果分页展示
- 导出功能

### 数据可视化
- 多种图表类型切换
- 统计卡片
- 详细数据表格
- 导出功能

### 关于页面
- 项目介绍
- 技术栈展示
- 主题预览
- 联系方式

## 🔧 配置

### 添加新主题

在 `assets/css/main.css` 中添加新的主题类：

```css
.my-theme-mode {
  --color-bg: #...;
  --color-text: #...;
  /* ... */
}
```

然后在 `components/ThemeSwitcher.vue` 中添加主题选项。

## 📄 许可证

MIT License