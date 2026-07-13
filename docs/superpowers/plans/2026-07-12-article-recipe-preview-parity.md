# 文章合成树物品预览一致性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让文章内嵌合成树使用制作页同一套物品可见像素居中逻辑，完整且清晰地展示 PNG 物品预览。

**Architecture:** 把 `CommonPreviewImage` 中与 Vue 生命周期无关的 alpha 可见区域定位计算抽为客户端工具。制作页组件和文章页动态 DOM 都调用该工具；文章页移除会覆盖各类预览的固定 `38px` 图片规则。

**Tech Stack:** Nuxt 4、Vue 3、TypeScript、原生 DOM、Chromium 契约检查。

---

### Task 1: 先建立文章树必须使用共享居中预览的失败契约

**Files:**
- Modify: `front-nuxt/scripts/check-article-content-references.mjs:154-250, 614-655`
- Test: `front-nuxt/scripts/check-article-content-references.mjs`

- [ ] **Step 1: 增加源代码与运行态断言**

在现有文章树契约的静态断言后加入：

```js
if (!articlePageSource.includes("import { syncPreviewImageVisibleCenter }")) {
  throw new Error('article recipe tree must use the shared preview visible-center helper')
}
if (articleStyleSource.includes('.article-recipe-tree__graph-node img)') && articleStyleSource.includes('width: 38px')) {
  throw new Error('article recipe tree must not override every preview image with a fixed 38px size')
}
```

在合成树 hydration 后加入：

```js
const graphPreview = recipeGraph.querySelector('.recipe-overview-node .tp-preview-image')
assert(graphPreview?.getAttribute('data-source-image'), 'article recipe tree previews should expose the shared preview source marker')
assert(graphPreview?.querySelector('img')?.getAttribute('data-preview-visible-center') === 'shared', 'article recipe tree previews should opt into shared visible-content centering')
```

- [ ] **Step 2: 运行契约，确认 RED**

Run: `cd front-nuxt && pnpm run check:article-content-references`

Expected: FAIL，原因是文章页尚未导入共享工具、图片没有 shared marker，或仍存在 `38px` 覆盖。

### Task 2: 抽出制作页的通用可见像素居中工具

**Files:**
- Create: `front-nuxt/utils/previewImageVisibleCenter.ts`
- Modify: `front-nuxt/components/common/PreviewImage.vue:1-145`
- Test: `front-nuxt/scripts/check-article-content-references.mjs`

- [ ] **Step 1: 创建无 Vue 依赖的工具 API**

定义：

```ts
const resetPreviewImageVisibleCenter = (root: HTMLElement | null) => {
  root?.style.setProperty('--tp-preview-visible-shift-x', '0px')
  root?.style.setProperty('--tp-preview-visible-shift-y', '0px')
}

const syncPreviewImageVisibleCenter = (image: HTMLImageElement | null, root: HTMLElement | null, enabled = true) => {
  if (!enabled || !image || !root || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    resetPreviewImageVisibleCenter(root)
    return
  }

  const naturalPixels = image.naturalWidth * image.naturalHeight
  if (naturalPixels > 1_500_000) {
    resetPreviewImageVisibleCenter(root)
    return
  }

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    resetPreviewImageVisibleCenter(root)
    return
  }

  try {
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    const stride = Math.max(1, Math.ceil(Math.sqrt(naturalPixels / 120_000)))
    let minX = canvas.width
    let minY = canvas.height
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < canvas.height; y += stride) {
      for (let x = 0; x < canvas.width; x += stride) {
        if ((data[(y * canvas.width + x) * 4 + 3] ?? 0) > 8) {
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
        }
      }
    }
    if (maxX < minX || maxY < minY) {
      resetPreviewImageVisibleCenter(root)
      return
    }
    const imageRect = image.getBoundingClientRect()
    const rootRect = root.getBoundingClientRect()
    const current = getComputedStyle(root)
    const shiftX = Number.parseFloat(current.getPropertyValue('--tp-preview-visible-shift-x')) || 0
    const shiftY = Number.parseFloat(current.getPropertyValue('--tp-preview-visible-shift-y')) || 0
    const visibleCenterX = imageRect.left - shiftX + ((minX + maxX + 1) / 2) * imageRect.width / image.naturalWidth
    const visibleCenterY = imageRect.top - shiftY + ((minY + maxY + 1) / 2) * imageRect.height / image.naturalHeight
    root.style.setProperty('--tp-preview-visible-shift-x', `${Math.round((rootRect.left + rootRect.width / 2 - visibleCenterX) * 100) / 100}px`)
    root.style.setProperty('--tp-preview-visible-shift-y', `${Math.round((rootRect.top + rootRect.height / 2 - visibleCenterY) * 100) / 100}px`)
  } catch {
    resetPreviewImageVisibleCenter(root)
  }
}

export { resetPreviewImageVisibleCenter, syncPreviewImageVisibleCenter }
```

工具必须先验证 `enabled`、`image.complete`、自然尺寸和 `1_500_000` 像素上限；读取 canvas 失败时调用 reset；扫描上限为 `120_000` 个采样像素。

- [ ] **Step 2: 让 `CommonPreviewImage` 调用工具**

替换组件内私有的 `maxVisibleCenter*`、`resetVisibleCenter` 和 `syncVisibleCenter` 实现，保留组件函数名作为薄包装：

```ts
import { resetPreviewImageVisibleCenter, syncPreviewImageVisibleCenter } from '~/utils/previewImageVisibleCenter'

const resetVisibleCenter = () => resetPreviewImageVisibleCenter(rootElement.value)
const syncVisibleCenter = () => syncPreviewImageVisibleCenter(imageElement.value, rootElement.value, props.autoCenterVisible)
```

保持 `@load="syncVisibleCenter"`、`ResizeObserver`、`markFailed` 和 `watch` 的现有调用点不变。

### Task 3: 让文章动态树接入同一工具，并去除冲突尺寸规则

**Files:**
- Modify: `front-nuxt/pages/articles/[slug].vue:1-15, 934-952, 3010-3020`
- Test: `front-nuxt/scripts/check-article-content-references.mjs`

- [ ] **Step 1: 导入共享工具并接入图片加载事件**

在页面脚本导入：

```ts
import { resetPreviewImageVisibleCenter, syncPreviewImageVisibleCenter } from '~/utils/previewImageVisibleCenter'
```

把 `createArticleRecipeTreePreviewImage` 的图片分支调整为：

```ts
preview.setAttribute('data-source-image', imageUrl)
const img = document.createElement('img')
img.src = imageUrl
img.alt = label
img.width = width
img.height = height
img.loading = 'lazy'
img.decoding = 'async'
img.dataset.previewVisibleCenter = 'shared'
img.addEventListener('load', () => syncPreviewImageVisibleCenter(img, preview))
img.addEventListener('error', () => {
  resetPreviewImageVisibleCenter(preview)
  preview.classList.add('is-fallback')
})
preview.append(img)
```

保留无图时的 `data-fallback`、`role="img"` 和 `aria-label` 分支。

- [ ] **Step 2: 限缩文章树图片样式**

删除完整的文章树宽泛图像规则：

```css
.article-content-text :deep(.article-recipe-tree__graph-node img) {
  display: block;
  width: 38px;
  height: 38px;
  margin: 0;
  border: 0;
  border-radius: 0;
  object-fit: contain;
}
```

不替换该规则。文章树图片全都属于 `.item-art.tp-preview-image img`，由全局预览样式的 `width: auto`、`height: auto`、`max-width/max-height: var(--tp-preview-image-size)` 与 `object-fit: contain` 负责尺寸和显示。

- [ ] **Step 3: 运行契约，确认 GREEN**

Run: `cd front-nuxt && pnpm run check:article-content-references`

Expected: `article content reference checks passed`。

### Task 4: 验证制作页不回归、文章页同物品预览一致

**Files:**
- Modify: `docs/devlog/entries/2026-07-12-article-embedded-recipe-tree-light.md`
- Modify: `docs/devlog/current.md`

- [ ] **Step 1: 运行项目验证**

Run:

```bash
cd front-nuxt && pnpm run check
TERRAPEDIA_FRONT_NUXT_URL=http://127.0.0.1:15177 pnpm run check:light-theme
git diff --check
```

Expected: 所有命令退出码为 `0`。

- [ ] **Step 2: 同物品浏览器核验**

使用 Chromium CDP 分别访问：

```text
http://127.0.0.1:15177/articles/article
http://127.0.0.1:15177/crafting?itemId=4731
```

在文章页面切换 `morning-paper`，记录同一物品预览的容器矩形、图片矩形、`data-source-image`、`--tp-preview-visible-shift-x/y` 和是否有裁切或溢出；制作页作为参照。若 item `4731` 没有可扫描的图像，使用文章与制作页都能渲染的同一物品 ID，并在 devlog 中记录实际 ID 和原因。

- [ ] **Step 3: 更新 devlog 状态**

记录共享工具、受影响路径、RED/GREEN 证据、浏览器对比结果、残余风险。用户未要求提交时保留 `active`（若验证完整则 `ready-for-commit`），不要自行提交。
