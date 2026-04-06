# TerraPedia 测试策略

> 本文档定义 TerraPedia（类泰拉瑞亚 Wiki 静态站点）的测试策略。技术栈：Astro + Tailwind CSS + Pagefind，数据存储在 Content Collections（YAML/JSON）。Solo 开发者场景。

---

## 1. 测试金字塔

对于 SSG 静态站点，测试策略与传统 Web 应用不同。由于无运行时服务端逻辑，**数据质量**和**构建可靠性**成为核心关注点。

```text
                    ┌─────────────┐
                    │   E2E 测试   │  ← 辅助：关键用户路径验证
                    │  (Playwright) │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │      构建测试            │  ← 核心：构建成功、产物完整
              │  (astro build + 校验)    │
              └────────────┬────────────┘
                           │
    ┌──────────────────────┴──────────────────────┐
    │              数据校验测试                     │  ← 基石：数据正确性、引用完整
    │  (Zod schema + 引用 + 一致性)                 │
    └─────────────────────────────────────────────┘
```

| 层级 | 定位 | 占比 | 说明 |
|------|------|------|------|
| **数据校验** | 基石 | ~50% | 数据是 SSG 的源头，错误会级联到所有页面 |
| **构建测试** | 核心 | ~35% | 确保每次构建产出可用站点 |
| **E2E 测试** | 辅助 | ~15% | 验证关键用户路径，不追求全覆盖 |

---

## 2. 数据校验测试（最重要）

数据错误在构建时可能被静默忽略，导致生成错误页面或 404。**在 CI 中优先执行数据校验**，失败时快速失败。

### 2.1 Zod Schema 验证

为所有 Content Collections 定义 Zod schema，在测试中加载并验证数据文件。

```typescript
// src/content/config.ts 或 tests/schemas/item.ts
import { z } from 'zod';

export const ItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1),
  type: z.enum(['weapon', 'armor', 'accessory', 'consumable', 'material', 'tool']),
  rarity: z.enum(['white', 'green', 'blue', 'purple', 'orange', 'red', 'cyan', 'yellow']),
  icon: z.string().min(1),  // 如 "items/iron_sword.png"
  description: z.string().optional(),
  stats: z.record(z.unknown()).optional(),
});

export const CraftingRecipeSchema = z.object({
  id: z.string(),
  result: z.string(),  // 物品 ID
  ingredients: z.array(z.object({
    itemId: z.string(),
    amount: z.number().int().positive(),
  })),
  station: z.string().optional(),
});

export type Item = z.infer<typeof ItemSchema>;
export type CraftingRecipe = z.infer<typeof CraftingRecipeSchema>;
```

### 2.2 引用完整性校验

合成配方中的 `itemId`、`result` 必须指向已存在的物品。

```typescript
// tests/data/reference-integrity.test.ts
import { describe, it, expect } from 'vitest';
import { getCollection } from 'astro:content';
import { ItemSchema } from '../schemas/item';

describe('引用完整性', () => {
  it('合成配方引用的物品 ID 必须存在', async () => {
    const items = await getCollection('items');
    const recipes = await getCollection('crafting');
    const validItemIds = new Set(items.map((i) => i.data.id));

    for (const recipe of recipes) {
      expect(validItemIds.has(recipe.data.result), 
        `配方 ${recipe.id} 的 result "${recipe.data.result}" 不存在`
      ).toBe(true);

      for (const ing of recipe.data.ingredients) {
        expect(validItemIds.has(ing.itemId),
          `配方 ${recipe.id} 的原料 "${ing.itemId}" 不存在`
        ).toBe(true);
      }
    }
  });
});
```

### 2.3 图片引用校验

`icon` 字段引用的图片文件必须存在于 `public/` 或 `src/assets/` 中。

```typescript
// tests/data/image-reference.test.ts
import { describe, it, expect } from 'vitest';
import { getCollection } from 'astro:content';
import { existsSync } from 'fs';
import { resolve } from 'path';

describe('图片引用校验', () => {
  it('所有物品的 icon 文件必须存在', async () => {
    const items = await getCollection('items');
    const publicDir = resolve(process.cwd(), 'public');

    for (const item of items) {
      const iconPath = resolve(publicDir, item.data.icon);
      expect(existsSync(iconPath), 
        `物品 ${item.data.id} 的 icon "${item.data.icon}" 不存在`
      ).toBe(true);
    }
  });
});
```

### 2.4 数据一致性校验

同一物品在不同集合（如物品列表、合成配方、Boss 掉落）中的属性应一致。

```typescript
// tests/data/consistency.test.ts
import { describe, it, expect } from 'vitest';
import { getCollection } from 'astro:content';

describe('数据一致性', () => {
  it('物品在 items 与 crafting 中的 ID 格式一致', async () => {
    const items = await getCollection('items');
    const recipes = await getCollection('crafting');
    const itemIds = new Set(items.map((i) => i.data.id));

    for (const r of recipes) {
      expect(itemIds.has(r.data.result)).toBe(true);
      // 可扩展：检查 name、type 等字段在跨集合时一致
    }
  });
});
```

### 2.5 Vitest 完整示例

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import astro from '@astrojs/vite';

export default defineConfig({
  plugins: [astro()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
  },
});
```

```typescript
// tests/data/schema-validation.test.ts
import { describe, it, expect } from 'vitest';
import { getCollection } from 'astro:content';
import { ItemSchema, CraftingRecipeSchema } from '../schemas';

describe('Schema 验证', () => {
  it('所有物品数据符合 ItemSchema', async () => {
    const items = await getCollection('items');
    for (const item of items) {
      const result = ItemSchema.safeParse(item.data);
      expect(result.success, 
        `物品 ${item.id}: ${result.success ? '' : JSON.stringify(result.error.issues)}`
      ).toBe(true);
    }
  });

  it('所有合成配方符合 CraftingRecipeSchema', async () => {
    const recipes = await getCollection('crafting');
    for (const recipe of recipes) {
      const result = CraftingRecipeSchema.safeParse(recipe.data);
      expect(result.success).toBe(true);
    }
  });
});
```

---

## 3. 构建测试

### 3.1 构建成功

```bash
astro build
```

在 CI 中执行，退出码非 0 即失败。

### 3.2 关键页面生成校验

构建完成后，检查 `dist/` 中关键页面是否存在。

```typescript
// tests/build/output-pages.test.ts
import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';

const distDir = resolve(process.cwd(), 'dist');
const requiredPages = [
  'index.html',
  'items/index.html',
  'bosses/index.html',
  'npcs/index.html',
  'crafting/index.html',
  'search/index.html',
];

describe('构建产物 - 关键页面', () => {
  for (const page of requiredPages) {
    it(`${page} 必须存在`, () => {
      expect(existsSync(resolve(distDir, page))).toBe(true);
    });
  }
});
```

> 注意：此测试需在 `astro build` 之后执行，可放在 CI 的 build 步骤后。

### 3.3 HTML 验证（无 Broken Links）

使用 `linkinator` 或 `broken-link-checker` 扫描构建产物。

```bash
npx linkinator dist --recurse --skip "^(?!http://localhost)"
```

或集成到测试脚本：

```typescript
// tests/build/links.test.ts (需先 build)
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

describe('链接校验', () => {
  it('dist 目录存在时无 broken links', () => {
    if (!existsSync(resolve(process.cwd(), 'dist'))) {
      console.warn('跳过：请先执行 astro build');
      return;
    }
    try {
      execSync('npx linkinator dist --recurse --format json', {
        encoding: 'utf-8',
      });
    } catch (e: any) {
      const output = e.stdout || e.stderr || '';
      const broken = output.match(/broken/gi);
      expect(broken, '存在断裂链接').toBeNull();
    }
  });
});
```

### 3.4 构建产物体积监控

| 指标 | 阈值 | 说明 |
|------|------|------|
| `dist/` 总大小 | < 50MB | 含图片、JS、CSS |
| `dist/pagefind/` | < 5MB | 搜索索引 |
| 单页 HTML | < 200KB | 典型物品页 |

```yaml
# .github/workflows/build.yml 示例
- name: Check bundle size
  run: |
    SIZE=$(du -sm dist | cut -f1)
    if [ "$SIZE" -gt 50 ]; then
      echo "dist 体积 ${SIZE}MB 超过 50MB 阈值"
      exit 1
    fi
```

---

## 4. E2E 测试（Playwright）

### 4.1 覆盖场景

| 场景 | 优先级 | 说明 |
|------|--------|------|
| 首页加载 | P0 | 站点可访问 |
| 搜索功能 | P0 | Pagefind 搜索可用 |
| 物品详情页导航 | P0 | 核心内容页 |
| 移动端响应式 | P1 | 断点、触摸友好 |

### 4.2 Playwright 示例代码

```typescript
// e2e/home.spec.ts
import { test, expect } from '@playwright/test';

test.describe('首页', () => {
  test('首页加载成功', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/TerraPedia/);
    await expect(page.locator('h1')).toBeVisible();
  });
});
```

```typescript
// e2e/search.spec.ts
import { test, expect } from '@playwright/test';

test.describe('搜索功能', () => {
  test('搜索框存在且可输入', async ({ page }) => {
    await page.goto('/');
    const searchInput = page.getByRole('searchbox').or(page.getByPlaceholder(/搜索/));
    await expect(searchInput).toBeVisible();
    await searchInput.fill('铁剑');
    await searchInput.press('Enter');
    // Pagefind 结果通常异步加载
    await page.waitForTimeout(500);
    await expect(page.locator('[data-pagefind-result], .search-results')).toBeVisible();
  });
});
```

```typescript
// e2e/items.spec.ts
import { test, expect } from '@playwright/test';

test.describe('物品详情页', () => {
  test('从首页导航到物品详情', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /物品/ }).click();
    await expect(page).toHaveURL(/\/items/);
    await page.getByRole('link', { name: /铁剑|Iron Sword/ }).first().click();
    await expect(page).toHaveURL(/\/items\/.+/);
    await expect(page.locator('h1')).toBeVisible();
  });
});
```

```typescript
// e2e/responsive.spec.ts
import { test, expect } from '@playwright/test';

test.describe('移动端响应式', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('移动端导航菜单可展开', async ({ page }) => {
    await page.goto('/');
    const menuButton = page.getByRole('button', { name: /菜单|Menu/ });
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test('物品列表在移动端可滚动', async ({ page }) => {
    await page.goto('/items');
    const list = page.locator('main ul, main .item-grid');
    await expect(list).toBeVisible();
    await expect(list).toHaveCount(1, { timeout: 5000 });
  });
});
```

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.PREVIEW_URL || 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'Mobile Safari', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## 5. 性能测试

### 5.1 Lighthouse CI 集成

```yaml
# lighthouserc.json
{
  "ci": {
    "collect": {
      "url": [
        "http://localhost:4321/",
        "http://localhost:4321/items",
        "http://localhost:4321/items/iron-sword"
      ],
      "numberOfRuns": 3,
      "startServerCommand": "npm run preview",
      "urlFilter": "http://localhost:4321"
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "categories:accessibility": ["error", { "minScore": 0.9 }],
        "categories:best-practices": ["warn", { "minScore": 0.85 }],
        "categories:seo": ["warn", { "minScore": 0.9 }]
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

### 5.2 构建时间监控

| 指标 | 阈值 | 说明 |
|------|------|------|
| 全量构建 | < 5 min | 含 Pagefind 索引 |
| 增量构建 | < 2 min | 仅内容变更时 |

```yaml
# .github/workflows/ci.yml
- name: Build with timing
  run: |
    start=$(date +%s)
    npm run build
    end=$(date +%s)
    echo "BUILD_TIME=$((end - start))" >> $GITHUB_ENV
    if [ $((end - start)) -gt 300 ]; then
      echo "构建超过 5 分钟，请优化"
      exit 1
    fi
```

### 5.3 阈值配置汇总

| 类型 | 指标 | 阈值 |
|------|------|------|
| Lighthouse | Performance | ≥ 0.9 |
| Lighthouse | Accessibility | ≥ 0.9 |
| Lighthouse | Best Practices | ≥ 0.85 |
| Lighthouse | SEO | ≥ 0.9 |
| 构建 | 总时间 | < 5 min |
| 构建 | dist 体积 | < 50MB |

---

## 6. 可访问性测试

### 6.1 axe-core 集成

```bash
npm install -D @axe-core/playwright
```

```typescript
// e2e/a11y.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('可访问性', () => {
  test('首页无严重 a11y 问题', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('物品详情页无严重 a11y 问题', async ({ page }) => {
    await page.goto('/items/iron-sword');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
```

### 6.2 关键检查项

| 检查项 | 标准 | 工具 |
|--------|------|------|
| 语义化 HTML | heading 层级、landmark | axe |
| 键盘导航 | Tab 顺序、焦点可见 | Playwright |
| 色彩对比 | WCAG AA | Lighthouse / axe |
| 图片 alt | 所有 img 有 alt | axe |

---

## 7. 测试执行策略

### 7.1 本地 vs CI

| 测试类型 | 本地 | CI | 说明 |
|----------|------|-----|------|
| 数据校验 | ✅ 每次提交前 | ✅ 每次 push | 快速，必须通过 |
| Schema 验证 | ✅ | ✅ | 同上 |
| 引用/图片校验 | ✅ | ✅ | 同上 |
| 构建测试 | ✅ 重要变更时 | ✅ 每次 push | 耗时 1–3 min |
| 链接校验 | ⚪ 可选 | ✅ 构建后 | 依赖 build 产物 |
| E2E | ⚪ 关键路径 | ✅ PR/merge 时 | 需 preview 服务 |
| Lighthouse | ⚪ 发布前 | ✅ 每周/发布前 | 耗时较长 |
| axe 可访问性 | ⚪ 可选 | ✅ 与 E2E 同跑 | 集成在 E2E |

### 7.2 执行频率

| 场景 | 执行内容 | 频率 |
|------|----------|------|
| 本地 `npm run test` | 数据校验 + Schema | 每次开发 |
| 本地 `npm run test:build` | 构建 + 产物校验 | 内容/配置变更后 |
| CI 每次 push | 数据校验 + 构建 + 链接 | 每次提交 |
| CI PR 合并前 | 上述 + E2E + axe | 合并前 |
| 定时任务 | Lighthouse + 构建时间 | 每周或发布前 |

### 7.3 推荐脚本

```json
// package.json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:build": "astro build && vitest run tests/build",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:a11y": "playwright test e2e/a11y.spec.ts",
    "test:lighthouse": "lhci autorun"
  }
}
```

---

## 附录：依赖安装

```bash
# 数据校验 + 单元测试
npm install -D vitest zod

# E2E
npm install -D @playwright/test

# 可访问性
npm install -D @axe-core/playwright

# 链接检查
npm install -D linkinator

# Lighthouse CI
npm install -D @lhci/cli
```

---

文档版本：1.0 | 更新日期：2025-03
