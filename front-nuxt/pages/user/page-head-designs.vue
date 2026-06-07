<script setup lang="ts">
const options = [
  { id: 'compact', label: 'A 单行工具栏' },
  { id: 'context', label: 'B 上下文条' },
  { id: 'sticky', label: 'C 吸顶压缩' },
  { id: 'split', label: 'D 展示页保留' },
]

const activeOption = ref('compact')
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="tp-page-shell head-design-page">
      <header class="head-design-top">
        <div>
          <p>TerraPedia · Page Head Optimization</p>
          <h1>页面头部压缩设计稿</h1>
        </div>
        <nav aria-label="设计稿版本">
          <button
            v-for="option in options"
            :key="option.id"
            type="button"
            :class="{ active: activeOption === option.id }"
            @click="activeOption = option.id"
          >
            {{ option.label }}
          </button>
        </nav>
      </header>

    <section class="preview-frame">
      <div class="mock-nav">
        <strong>TerraPedia</strong>
        <span>资料库</span>
        <span>文章</span>
        <span>用户中心</span>
      </div>
      <div class="mock-breadcrumb">首页 / 用户中心 / 我的文章 / 编辑文章</div>

      <template v-if="activeOption === 'compact'">
        <header class="mock-head compact-head">
          <div class="compact-title">
            <span class="status-dot"></span>
            <div>
              <p>/user/articles/32 · editor</p>
              <h2>真永夜之刃制作教程：从永夜之刃到机械三魂</h2>
            </div>
          </div>
          <div class="head-actions">
            <button type="button">返回我的文章</button>
            <button type="button" class="primary">保存草稿</button>
          </div>
        </header>
      </template>

      <template v-else-if="activeOption === 'context'">
        <header class="mock-head context-head">
          <div class="context-line">
            <span>文章编辑</span>
            <b>草稿可编辑</b>
            <em>最后保存 09:32</em>
          </div>
          <div class="context-main">
            <h2>真永夜之刃制作教程：从永夜之刃到机械三魂</h2>
            <button type="button">返回我的文章</button>
          </div>
        </header>
      </template>

      <template v-else-if="activeOption === 'sticky'">
        <header class="mock-head sticky-head">
          <div class="sticky-left">
            <button type="button">←</button>
            <div>
              <h2>真永夜之刃制作教程</h2>
              <p>编辑中 · 正文 1,284 字 · 封面已设置</p>
            </div>
          </div>
          <div class="head-actions">
            <button type="button">预览</button>
            <button type="button" class="primary">保存</button>
          </div>
        </header>
      </template>

      <template v-else>
        <div class="split-example">
          <header class="mock-head compact-head">
            <div class="compact-title">
              <span class="status-dot"></span>
              <div>
                <p>工作流页面</p>
                <h2>文章编辑使用紧凑头部</h2>
              </div>
            </div>
            <button type="button">保存草稿</button>
          </header>
          <header class="mock-head hero-head">
            <div>
              <p>展示页</p>
              <h2>物品、Boss、公开文章详情保留大标题区</h2>
              <span>需要建立阅读语境的页面继续使用强标题，不影响编辑和管理效率。</span>
            </div>
          </header>
        </div>
      </template>

      <section class="mock-content">
        <aside>
          <a>标题摘要</a>
          <a>正文</a>
          <a>文章设置</a>
          <a>发布检查</a>
        </aside>
        <article>
          <label>
            <span>标题</span>
            <input value="真永夜之刃制作教程：从永夜之刃到机械三魂" />
          </label>
          <div class="mock-editor">
            <h3>正文编辑区</h3>
            <p>页面头部压缩后，用户进入页面第一眼会看到编辑任务，而不是大面积说明区。</p>
          </div>
        </article>
        <aside>
          <strong>发布检查</strong>
          <span>标题已填写</span>
          <span>正文已填写</span>
          <button type="button" class="primary">保存草稿</button>
        </aside>
      </section>
    </section>
    </main>

    <TerraFooter />
  </section>
</template>

<style scoped>
.head-design-page {
  min-height: 100vh;
  padding: 28px;
  color: #f4ead0;
  background: #06100b;
}

.head-design-top {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  width: min(1440px, 100%);
  margin: 0 auto 20px;
}

.head-design-top p {
  margin: 0 0 8px;
  color: rgba(244, 234, 208, 0.62);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

.head-design-top h1 {
  margin: 0;
  font-size: 30px;
}

.head-design-top nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-content: start;
}

button {
  min-height: 44px;
  border: 1px solid rgba(214, 177, 90, 0.34);
  border-radius: 8px;
  padding: 0 14px;
  color: #f4ead0;
  background: rgba(244, 234, 208, 0.055);
  font-weight: 800;
  cursor: pointer;
}

button.active,
button.primary {
  color: #10180d;
  border-color: rgba(240, 207, 116, 0.42);
  background: linear-gradient(135deg, #f0cf74, #bd8b39);
}

.preview-frame {
  width: min(1440px, 100%);
  margin: 0 auto;
  border: 1px solid rgba(214, 177, 90, 0.2);
  border-radius: 8px;
  overflow: hidden;
  background:
    linear-gradient(90deg, rgba(244, 234, 208, 0.028) 1px, transparent 1px),
    linear-gradient(rgba(244, 234, 208, 0.022) 1px, transparent 1px),
    #0a130d;
  background-size: 32px 32px;
}

.mock-nav {
  display: flex;
  gap: 20px;
  align-items: center;
  min-height: 58px;
  padding: 0 24px;
  border-bottom: 1px solid rgba(214, 177, 90, 0.16);
  color: rgba(244, 234, 208, 0.72);
}

.mock-nav strong {
  color: #f0cf74;
}

.mock-breadcrumb {
  min-height: 38px;
  padding: 10px 24px 0;
  color: rgba(244, 234, 208, 0.52);
  font-size: 13px;
}

.mock-head {
  margin: 14px 24px 18px;
  border: 1px solid rgba(214, 177, 90, 0.24);
  border-radius: 8px;
  background: rgba(14, 21, 16, 0.78);
}

.compact-head,
.sticky-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 72px;
  padding: 10px 18px;
}

.compact-title,
.sticky-left,
.head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #f0cf74;
}

.mock-head p,
.mock-head h2 {
  margin: 0;
}

.mock-head p {
  color: rgba(244, 234, 208, 0.58);
  font-size: 12px;
  font-weight: 800;
}

.mock-head h2 {
  color: #fff7e5;
  font-size: 22px;
  line-height: 1.25;
}

.context-head {
  min-height: 92px;
  padding: 14px 18px;
}

.context-line,
.context-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.context-line {
  margin-bottom: 10px;
  color: rgba(244, 234, 208, 0.58);
  font-size: 13px;
}

.context-line b {
  color: #9db89a;
}

.context-line em {
  font-style: normal;
}

.sticky-head {
  position: sticky;
  top: 0;
  z-index: 2;
  min-height: 60px;
  backdrop-filter: blur(12px);
}

.sticky-head h2 {
  font-size: 18px;
}

.sticky-head p {
  margin-top: 3px;
}

.split-example {
  display: grid;
  gap: 14px;
}

.hero-head {
  min-height: 150px;
  padding: 26px;
}

.hero-head h2 {
  margin: 10px 0 12px;
  font-size: 34px;
}

.hero-head span {
  color: rgba(244, 234, 208, 0.62);
}

.mock-content {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr) 260px;
  gap: 16px;
  padding: 0 24px 24px;
}

.mock-content aside,
.mock-content article {
  display: grid;
  align-content: start;
  gap: 10px;
  border: 1px solid rgba(214, 177, 90, 0.18);
  border-radius: 8px;
  padding: 14px;
  background: rgba(244, 234, 208, 0.025);
}

.mock-content a,
.mock-content span {
  color: rgba(244, 234, 208, 0.68);
}

label {
  display: grid;
  gap: 8px;
}

label span {
  color: rgba(244, 234, 208, 0.58);
  font-size: 12px;
  font-weight: 800;
}

input {
  min-height: 50px;
  border: 1px solid rgba(214, 177, 90, 0.22);
  border-radius: 8px;
  padding: 0 14px;
  color: #fff7e5;
  background: rgba(10, 17, 11, 0.74);
  font: inherit;
}

.mock-editor {
  min-height: 260px;
  border: 1px solid rgba(214, 177, 90, 0.16);
  border-radius: 8px;
  padding: 20px;
  background: rgba(10, 17, 11, 0.56);
}

.mock-editor h3 {
  margin: 0 0 12px;
  color: #fff7e5;
}

.mock-editor p {
  margin: 0;
  color: rgba(244, 234, 208, 0.7);
  line-height: 1.7;
}

@media (max-width: 980px) {
  .head-design-top,
  .compact-head,
  .context-main,
  .sticky-head {
    align-items: stretch;
    flex-direction: column;
  }

  .mock-content {
    grid-template-columns: 1fr;
  }
}
</style>
