<script setup lang="ts">
const versions = [
  { id: 'canvas', label: 'A 纯写作画布' },
  { id: 'immersive', label: 'B 沉浸写作' },
  { id: 'outline', label: 'C 分屏大纲' },
]

const activeVersion = ref('canvas')
const writingMode = ref(true)
const compactToolbar = ref(false)
const outlineVisible = ref(true)

const editorTools = ['B', 'I', 'H2', 'H3', '引用', '列表', '链接', '图片', '颜色']
const outlineItems = ['开荒前置', '装备路线', '场地搭建', '药水准备', '常见失误', '提交前检查']
const checkItems = [
  { label: '标题', value: '已填写' },
  { label: '正文', value: '1,284 字' },
  { label: '封面', value: '已折叠' },
  { label: '状态', value: '草稿' },
]

const paragraphs = [
  '先把移动能力补齐，再考虑输出。赫尔墨斯靴、二段跳与抓钩可以显著降低战斗容错压力。',
  '远程路线优先选择金弓或铂金弓，配合火焰箭。近战路线需要留意攻击距离，不建议只依赖短剑。',
  '战斗场地至少准备两层平台，平台间距不要太密。这样既能保留上升空间，也不会影响下落躲避。',
  '如果地图刷到足够多的生命水晶，建议把血量提高到 200 以上再触发 Boss。',
  '提交前重点检查正文图片、段落标题、公开页摘要和封面比例，避免审核阶段因为基础素材退回。',
]
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="tp-page-shell writing-design-page">
      <header class="design-topbar">
        <div>
          <p>TerraPedia · Writing Mode Drafts</p>
          <h1>文章编辑页写作模式三版设计稿</h1>
        </div>
        <nav aria-label="设计稿版本">
          <button
            v-for="version in versions"
            :key="version.id"
            type="button"
            :class="{ active: activeVersion === version.id }"
            @click="activeVersion = version.id"
          >
            {{ version.label }}
          </button>
        </nav>
      </header>

    <section v-if="activeVersion === 'canvas'" class="draft-shell canvas-shell" :class="{ 'is-writing': writingMode }">
      <header class="compact-editor-head">
        <div>
          <span>/user/articles/32 · editor</span>
          <h2>克苏鲁之眼前的装备路线整理</h2>
        </div>
        <div class="head-actions">
          <button type="button" @click="writingMode = !writingMode">
            {{ writingMode ? '退出写作模式' : '进入写作模式' }}
          </button>
          <button type="button" class="primary">保存草稿</button>
        </div>
      </header>

      <section class="canvas-grid">
        <aside class="thin-rail">
          <a href="#canvas-body">正文</a>
          <a href="#canvas-settings">设置</a>
          <a href="#canvas-submit">发布</a>
        </aside>

        <article id="canvas-body" class="paper-editor">
          <label class="title-field">
            <span>标题</span>
            <input value="克苏鲁之眼前的装备路线整理" />
          </label>
          <label class="summary-field">
            <span>摘要</span>
            <textarea>从武器、饰品、药水和战斗场地四个方向整理一条更稳的准备路线。</textarea>
          </label>

          <div class="floating-toolbar" :class="{ compact: compactToolbar }" aria-label="跟随滑动的编辑栏">
            <div class="tool-group">
              <button v-for="tool in editorTools" :key="tool" type="button">{{ tool }}</button>
            </div>
            <button type="button" class="toolbar-toggle" @click="compactToolbar = !compactToolbar">
              {{ compactToolbar ? '展开工具栏' : '收起工具栏' }}
            </button>
          </div>

          <section class="writing-body" :class="{ compact: compactToolbar }">
            <h3>开荒前置</h3>
            <p v-for="paragraph in paragraphs" :key="paragraph">{{ paragraph }}</p>
            <h3>装备路线</h3>
            <p v-for="paragraph in paragraphs.slice(0, 3)" :key="`canvas-${paragraph}`">{{ paragraph }}</p>
          </section>
        </article>

        <aside id="canvas-submit" class="status-stack">
          <div v-for="item in checkItems" :key="item.label" class="status-row">
            <span>{{ item.label }}</span>
            <b>{{ item.value }}</b>
          </div>
          <button type="button" class="primary">提交审核</button>
        </aside>
      </section>
    </section>

    <section v-else-if="activeVersion === 'immersive'" class="draft-shell immersive-shell" :class="{ 'is-writing': writingMode }">
      <header class="immersive-command">
        <button type="button" @click="writingMode = !writingMode">
          {{ writingMode ? '退出沉浸' : '进入沉浸' }}
        </button>
        <strong>克苏鲁之眼前的装备路线整理</strong>
        <span>草稿 · 自动保存 09:42</span>
        <button type="button" class="primary">保存</button>
      </header>

      <article class="immersive-editor">
        <input class="immersive-title" value="克苏鲁之眼前的装备路线整理" />
          <div class="floating-toolbar immersive-toolbar" :class="{ compact: compactToolbar }" aria-label="跟随滑动的编辑栏">
          <div class="tool-group">
            <button v-for="tool in editorTools" :key="tool" type="button">{{ tool }}</button>
          </div>
          <button type="button" class="toolbar-toggle" @click="compactToolbar = !compactToolbar">
            {{ compactToolbar ? '显示完整工具' : '只留常用工具' }}
          </button>
        </div>
        <section class="writing-body immersive-body" :class="{ compact: compactToolbar }">
          <p v-for="paragraph in paragraphs.concat(paragraphs)" :key="`immersive-${paragraph}`">{{ paragraph }}</p>
        </section>
      </article>

      <aside class="immersive-mini-panel">
        <button type="button">预览</button>
        <button type="button">文章设置</button>
        <button type="button">发布检查</button>
      </aside>
    </section>

    <section v-else class="draft-shell outline-shell" :class="{ 'outline-hidden': !outlineVisible }">
      <header class="compact-editor-head">
        <div>
          <span>Writing + outline</span>
          <h2>正文和大纲同时服务长文编辑</h2>
        </div>
        <div class="head-actions">
          <button type="button" @click="outlineVisible = !outlineVisible">
            {{ outlineVisible ? '隐藏大纲' : '显示大纲' }}
          </button>
          <button type="button" class="primary">保存草稿</button>
        </div>
      </header>

      <section class="outline-grid">
        <aside class="outline-panel">
          <h3>文章大纲</h3>
          <a v-for="item in outlineItems" :key="item" href="#outline-body">{{ item }}</a>
        </aside>

        <article id="outline-body" class="paper-editor">
          <label class="title-field">
            <span>标题</span>
            <input value="克苏鲁之眼前的装备路线整理" />
          </label>
          <div class="floating-toolbar" :class="{ compact: compactToolbar }" aria-label="跟随滑动的编辑栏">
            <div class="tool-group">
              <button v-for="tool in editorTools" :key="tool" type="button">{{ tool }}</button>
            </div>
            <button type="button" class="toolbar-toggle" @click="compactToolbar = !compactToolbar">
              {{ compactToolbar ? '恢复工具栏' : '专注正文' }}
            </button>
          </div>
          <section class="writing-body" :class="{ compact: compactToolbar }">
            <h3 v-for="item in outlineItems.slice(0, 4)" :key="item">{{ item }}</h3>
            <p v-for="paragraph in paragraphs.concat(paragraphs.slice(0, 2))" :key="`outline-${paragraph}`">{{ paragraph }}</p>
          </section>
        </article>

        <aside class="right-drawer">
          <h3>发布检查</h3>
          <div v-for="item in checkItems" :key="item.label" class="status-row">
            <span>{{ item.label }}</span>
            <b>{{ item.value }}</b>
          </div>
          <button type="button">封面与 Slug</button>
          <button type="button" class="primary">提交审核</button>
        </aside>
      </section>
    </section>
    </main>

    <TerraFooter />
  </section>
</template>

<style scoped>
.writing-design-page {
  min-height: 100vh;
  padding: 28px;
  color: #172018;
  background:
    linear-gradient(90deg, rgba(47, 67, 44, 0.05) 1px, transparent 1px),
    linear-gradient(rgba(47, 67, 44, 0.04) 1px, transparent 1px),
    #f5f1e7;
  background-size: 32px 32px;
}

.design-topbar,
.draft-shell {
  width: min(1480px, 100%);
  margin: 0 auto;
}

.design-topbar {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.design-topbar p,
.compact-editor-head span,
.title-field span,
.summary-field span,
.immersive-command span {
  margin: 0;
  color: #697466;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

.design-topbar h1,
.compact-editor-head h2 {
  margin: 0;
  color: #172018;
  line-height: 1.16;
}

.design-topbar h1 {
  font-size: 30px;
}

.design-topbar nav,
.head-actions,
.tool-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.design-topbar nav {
  padding: 6px;
  border: 1px solid rgba(47, 67, 44, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.74);
}

button,
.thin-rail a,
.outline-panel a {
  min-height: 44px;
}

button {
  border: 1px solid rgba(47, 67, 44, 0.16);
  border-radius: 8px;
  padding: 0 14px;
  color: #172018;
  background: #fffdf7;
  font-weight: 800;
  cursor: pointer;
}

button.active,
button.primary {
  color: #fffdf7;
  border-color: #284625;
  background: #284625;
}

.draft-shell {
  min-height: calc(100vh - 118px);
}

.compact-editor-head,
.immersive-command,
.paper-editor,
.status-stack,
.outline-panel,
.right-drawer {
  border: 1px solid rgba(47, 67, 44, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 18px 48px rgba(47, 67, 44, 0.08);
}

.compact-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 72px;
  margin-bottom: 16px;
  padding: 10px 14px 10px 18px;
}

.canvas-grid {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr) 260px;
  gap: 16px;
  align-items: start;
}

.thin-rail,
.status-stack,
.outline-panel,
.right-drawer {
  position: sticky;
  top: 16px;
  display: grid;
  gap: 10px;
  align-content: start;
}

.thin-rail a,
.outline-panel a {
  display: flex;
  align-items: center;
  padding: 0 14px;
  color: #385236;
  text-decoration: none;
  border: 1px solid rgba(47, 67, 44, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.76);
}

.thin-rail a:first-child,
.outline-panel a:first-of-type {
  color: #fffdf7;
  background: #2f4a2b;
}

.paper-editor {
  display: grid;
  gap: 16px;
  padding: 24px;
}

.title-field,
.summary-field {
  display: grid;
  gap: 8px;
}

input,
textarea {
  width: 100%;
  border: 1px solid rgba(47, 67, 44, 0.16);
  border-radius: 8px;
  padding: 12px 14px;
  color: #172018;
  background: #fffdf7;
  font: inherit;
}

.title-field input,
.immersive-title {
  border: 0;
  padding: 0;
  font-size: 36px;
  font-weight: 900;
  line-height: 1.14;
  background: transparent;
}

textarea {
  min-height: 78px;
  resize: vertical;
}

.floating-toolbar {
  position: sticky;
  top: 12px;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px;
  border: 1px solid rgba(47, 67, 44, 0.18);
  border-radius: 8px;
  background: rgba(248, 244, 234, 0.96);
  backdrop-filter: blur(12px);
  box-shadow: 0 12px 30px rgba(47, 67, 44, 0.12);
}

.tool-group button {
  min-width: 44px;
  padding: 0 10px;
}

.toolbar-toggle {
  flex: 0 0 auto;
}

.writing-body {
  display: grid;
  gap: 16px;
  min-height: 760px;
  padding: 34px;
  border: 1px solid rgba(47, 67, 44, 0.12);
  border-radius: 8px;
  background: #fffdf7;
  color: #243222;
  font-size: 17px;
  line-height: 1.85;
}

.floating-toolbar.compact .tool-group button:nth-child(n + 5) {
  display: none;
}

.writing-body h3 {
  margin: 0;
  color: #172018;
  font-size: 22px;
}

.writing-body p {
  margin: 0;
}

.status-stack,
.right-drawer,
.outline-panel {
  padding: 16px;
}

.status-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(47, 67, 44, 0.1);
}

.status-row b {
  color: #2f5b2b;
}

.status-stack button,
.right-drawer button {
  width: 100%;
}

.canvas-shell.is-writing .thin-rail,
.canvas-shell.is-writing .status-stack {
  opacity: 0.38;
}

.immersive-shell {
  position: relative;
  display: grid;
  gap: 16px;
  color: var(--text-main);
  background: color-mix(in srgb, var(--panel) 88%, var(--index-bg));
}

.immersive-command {
  position: sticky;
  top: 0;
  z-index: 8;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr) max-content max-content;
  gap: 12px;
  align-items: center;
  padding: 10px;
  color: var(--text-main);
  background: color-mix(in srgb, var(--index-surface) 96%, var(--panel));
}

.immersive-command strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.immersive-editor {
  width: min(920px, calc(100% - 32px));
  margin: 0 auto 40px;
  padding: 26px;
  border: 1px solid rgba(214, 177, 90, 0.22);
  border-radius: 8px;
  background: rgba(244, 234, 208, 0.04);
}

.immersive-title {
  color: var(--text-strong);
  margin-bottom: 18px;
}

.immersive-toolbar {
  top: 64px;
  border-color: color-mix(in srgb, var(--accent-gold) 28%, var(--index-line));
  background: color-mix(in srgb, var(--index-surface) 96%, var(--panel));
}

.immersive-toolbar button {
  color: var(--text-main);
  border-color: color-mix(in srgb, var(--accent-gold) 28%, var(--index-line));
  background: color-mix(in srgb, var(--index-bg) 58%, transparent);
}

.immersive-body {
  border-color: color-mix(in srgb, var(--accent-gold) 20%, var(--index-line));
  background: color-mix(in srgb, var(--index-surface) 88%, transparent);
  color: var(--text-main);
}

.immersive-mini-panel {
  position: fixed;
  right: 24px;
  bottom: 24px;
  display: grid;
  gap: 8px;
  width: 150px;
}

.immersive-mini-panel button {
  color: var(--text-main);
  border-color: color-mix(in srgb, var(--accent-gold) 28%, var(--index-line));
  background: color-mix(in srgb, var(--index-surface) 92%, var(--panel));
}

.outline-grid {
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr) 260px;
  gap: 16px;
  align-items: start;
}

.outline-panel h3,
.right-drawer h3 {
  margin: 0 0 10px;
}

.outline-hidden .outline-grid {
  grid-template-columns: minmax(0, 1fr) 260px;
}

.outline-hidden .outline-panel {
  display: none;
}

@media (max-width: 1080px) {
  .design-topbar,
  .compact-editor-head,
  .immersive-command {
    align-items: stretch;
    grid-template-columns: 1fr;
    flex-direction: column;
  }

  .canvas-grid,
  .outline-grid,
  .outline-hidden .outline-grid {
    grid-template-columns: 1fr;
  }

  .thin-rail,
  .status-stack,
  .outline-panel,
  .right-drawer {
    position: static;
  }

  .thin-rail,
  .outline-panel {
    display: flex;
    flex-wrap: wrap;
  }

  .immersive-mini-panel {
    position: static;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: min(920px, calc(100% - 32px));
    margin: 0 auto 24px;
  }
}

@media (max-width: 640px) {
  .writing-design-page {
    padding: 14px;
  }

  .design-topbar h1 {
    font-size: 24px;
  }

  .title-field input,
  .immersive-title {
    font-size: 26px;
  }

  .floating-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .writing-body,
  .paper-editor,
  .immersive-editor {
    padding: 16px;
  }
}
</style>
