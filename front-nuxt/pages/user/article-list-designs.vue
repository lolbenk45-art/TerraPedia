<script setup lang="ts">
definePageMeta({ layout: false })

const options = [
  { id: 'table', label: 'A 信息表格' },
  { id: 'cards', label: 'B 卡片工作台' },
  { id: 'board', label: 'C 状态看板' },
]

const activeOption = ref('table')

const articles = [
  {
    id: 32,
    title: '真永夜之刃制作教程：从永夜之刃到机械三魂',
    summary: '补齐制作链、素材来源、Boss 前置和常见卡点，适合从困难模式前期开始规划。',
    status: '已下架',
    reviewStatus: '已通过',
    updatedAt: '2026-06-07 07:58',
    submittedAt: '2026-06-06 18:12',
    words: 4280,
    images: 6,
    comments: 12,
    nextAction: '编辑后重新提交管理员审核',
    action: '继续编辑',
    tone: 'offline',
    cover: 'blade',
    coverLabel: '永夜之刃',
  },
  {
    id: 33,
    title: '克苏鲁之眼前的装备路线整理',
    summary: '从武器、饰品、药水和战斗场地四个方向整理一条更稳的准备路线。',
    status: '草稿',
    reviewStatus: '未提交',
    updatedAt: '2026-06-04 23:14',
    submittedAt: '未提交',
    words: 1284,
    images: 1,
    comments: 0,
    nextAction: '补正文后提交管理员审核',
    action: '继续写作',
    tone: 'draft',
    cover: 'eye',
    coverLabel: '克眼准备',
  },
  {
    id: 34,
    title: '机械三王前的药水和场地清单',
    summary: '列出必须药水、推荐饰品、平台间距和召唤前检查项。',
    status: '待审核',
    reviewStatus: '管理员审核中',
    updatedAt: '2026-06-05 09:30',
    submittedAt: '2026-06-05 09:35',
    words: 2110,
    images: 3,
    comments: 2,
    nextAction: '等待管理员审核或撤回修改',
    action: '查看状态',
    tone: 'pending',
    cover: 'potion',
    coverLabel: '药水清单',
  },
  {
    id: 35,
    title: '蜂后路线：丛林探索到召唤物准备',
    summary: '面向第一次进入地下丛林的玩家，整理安全探索和蜂巢处理策略。',
    status: '已发布',
    reviewStatus: '已通过',
    updatedAt: '2026-03-25 18:30',
    submittedAt: '2026-03-24 20:16',
    words: 3650,
    images: 5,
    comments: 28,
    nextAction: '查看公开页或下架修改',
    action: '管理',
    tone: 'published',
    cover: 'jungle',
    coverLabel: '蜂后路线',
  },
]

const summary = [
  { label: '需要继续写', value: 2, helper: '草稿和已下架文章' },
  { label: '等待管理员', value: 1, helper: '已提交审核' },
  { label: '公开展示中', value: 1, helper: '已发布文章' },
  { label: '本周更新', value: 3, helper: '最近 7 天有修改' },
]

const boardColumns = [
  { id: 'draft', title: '继续写作', tones: ['draft', 'offline'], hint: '可编辑，可提交管理员审核' },
  { id: 'pending', title: '管理员审核', tones: ['pending'], hint: '等待审核或撤回修改' },
  { id: 'published', title: '公开文章', tones: ['published'], hint: '可查看公开页或下架维护' },
]
</script>

<template>
  <main class="article-list-design-page">
    <header class="design-topbar">
      <div>
        <p>TerraPedia · User Articles</p>
        <h1>我的文章列表三版设计稿</h1>
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

    <section class="draft-shell">
      <section class="summary-strip" aria-label="状态汇总">
        <article v-for="item in summary" :key="item.label" class="summary-tile">
          <b>{{ item.value }}</b>
          <span>{{ item.label }}</span>
          <small>{{ item.helper }}</small>
        </article>
      </section>

      <template v-if="activeOption === 'table'">
        <section class="article-table-panel">
          <header class="panel-head">
            <div>
              <span class="eyebrow">Submission Queue</span>
              <h2>投稿列表</h2>
            </div>
            <div class="toolbar-actions">
              <button type="button">筛选状态</button>
              <button type="button" class="primary">新建文章</button>
            </div>
          </header>
          <div class="article-table" role="table" aria-label="文章投稿列表">
            <div class="article-table__head" role="row">
              <span>封面</span>
              <span>文章</span>
              <span>状态</span>
              <span>内容量</span>
              <span>时间</span>
              <span>下一步</span>
              <span>操作</span>
            </div>
            <article v-for="article in articles" :key="article.id" class="article-table__row" role="row">
              <div class="cover-thumb" :class="`cover-${article.cover}`" role="img" :aria-label="`${article.title} 封面`">
                <span>{{ article.coverLabel }}</span>
              </div>
              <div class="title-cell">
                <b>{{ article.title }}</b>
                <p>{{ article.summary }}</p>
              </div>
              <div>
                <span class="status-pill" :class="`is-${article.tone}`">{{ article.status }}</span>
                <small>{{ article.reviewStatus }}</small>
              </div>
              <div class="metric-cell">
                <span>{{ article.words }} 字</span>
                <span>{{ article.images }} 图</span>
                <span>{{ article.comments }} 评论</span>
              </div>
              <div class="time-cell">
                <span>更新 {{ article.updatedAt }}</span>
                <span>提交 {{ article.submittedAt }}</span>
              </div>
              <p class="next-cell">{{ article.nextAction }}</p>
              <div class="row-actions">
                <button type="button" class="primary">{{ article.action }}</button>
                <button v-if="article.tone === 'published'" type="button">公开页</button>
              </div>
            </article>
          </div>
        </section>
      </template>

      <template v-else-if="activeOption === 'cards'">
        <section class="cards-workspace">
          <header class="panel-head">
            <div>
              <span class="eyebrow">Article Workspace</span>
              <h2>卡片工作台</h2>
            </div>
            <button type="button" class="primary">新建文章</button>
          </header>
          <div class="article-card-grid">
            <article v-for="article in articles" :key="article.id" class="article-card">
              <div class="cover-swatch" :class="[`is-${article.tone}`, `cover-${article.cover}`]" role="img" :aria-label="`${article.title} 封面`">
                <span>{{ article.status }}</span>
                <strong>{{ article.coverLabel }}</strong>
              </div>
              <div class="article-card__body">
                <div class="card-title-line">
                  <b>{{ article.title }}</b>
                  <span class="status-pill" :class="`is-${article.tone}`">{{ article.reviewStatus }}</span>
                </div>
                <p>{{ article.summary }}</p>
                <div class="meta-grid">
                  <span><b>{{ article.words }}</b> 字数</span>
                  <span><b>{{ article.images }}</b> 图片</span>
                  <span><b>{{ article.comments }}</b> 评论</span>
                  <span><b>{{ article.updatedAt }}</b> 最近更新</span>
                </div>
                <div class="next-action">
                  <span>下一步</span>
                  <strong>{{ article.nextAction }}</strong>
                </div>
              </div>
              <footer>
                <button type="button" class="primary">{{ article.action }}</button>
                <button type="button">更多</button>
              </footer>
            </article>
          </div>
        </section>
      </template>

      <template v-else>
        <section class="board-workspace">
          <header class="panel-head">
            <div>
              <span class="eyebrow">Review Board</span>
              <h2>状态看板</h2>
            </div>
            <button type="button" class="primary">新建文章</button>
          </header>
          <div class="board-grid">
            <section v-for="column in boardColumns" :key="column.id" class="board-column">
              <header>
                <h3>{{ column.title }}</h3>
                <span>{{ column.hint }}</span>
              </header>
              <article
                v-for="article in articles.filter((item) => column.tones.includes(item.tone))"
                :key="article.id"
                class="board-card"
              >
                <div class="board-cover" :class="[`is-${article.tone}`, `cover-${article.cover}`]" role="img" :aria-label="`${article.title} 封面`">
                  <span>{{ article.coverLabel }}</span>
                </div>
                <span class="status-pill" :class="`is-${article.tone}`">{{ article.status }}</span>
                <b>{{ article.title }}</b>
                <p>{{ article.nextAction }}</p>
                <div class="board-meta">
                  <span>{{ article.words }} 字</span>
                  <span>{{ article.updatedAt }}</span>
                </div>
                <button type="button">{{ article.action }}</button>
              </article>
            </section>
          </div>
        </section>
      </template>
    </section>
  </main>
</template>

<style scoped>
.article-list-design-page {
  min-height: 100vh;
  padding: 28px;
  color: var(--text-main);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--index-line) 22%, transparent) 1px, transparent 1px),
    linear-gradient(color-mix(in srgb, var(--index-line) 18%, transparent) 1px, transparent 1px),
    var(--index-bg);
  background-size: 32px 32px;
}

.design-topbar,
.draft-shell {
  width: min(1500px, 100%);
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
.eyebrow {
  margin: 0;
  color: var(--text-faint);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

.design-topbar h1,
.panel-head h2 {
  margin: 0;
  color: var(--text-strong);
  line-height: 1.16;
}

.design-topbar nav,
.toolbar-actions,
.row-actions,
.article-card footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.design-topbar nav {
  padding: 6px;
  border: 1px solid var(--index-line);
  border-radius: 8px;
  background: color-mix(in srgb, var(--panel) 82%, transparent);
}

button {
  min-height: 44px;
  border: 1px solid var(--index-line);
  border-radius: 8px;
  padding: 0 14px;
  color: var(--text-main);
  background: color-mix(in srgb, var(--index-surface) 88%, transparent);
  font-weight: 800;
  cursor: pointer;
}

button.active,
button.primary {
  color: var(--index-bg);
  border-color: color-mix(in srgb, var(--accent-gold) 70%, var(--index-line));
  background: var(--accent-gold);
}

.draft-shell {
  display: grid;
  gap: 16px;
}

.summary-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.summary-tile,
.article-table-panel,
.cards-workspace,
.board-workspace,
.article-card,
.board-column {
  border: 1px solid var(--index-line);
  border-radius: 8px;
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  box-shadow: var(--shadow);
}

.summary-tile {
  display: grid;
  gap: 4px;
  min-height: 112px;
  padding: 16px;
}

.summary-tile b {
  color: var(--text-strong);
  font-size: 30px;
}

.summary-tile span {
  font-weight: 900;
}

.summary-tile small {
  color: var(--text-faint);
}

.article-table-panel,
.cards-workspace,
.board-workspace {
  display: grid;
  gap: 16px;
  padding: 18px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.article-table {
  display: grid;
  overflow-x: auto;
}

.article-table__head,
.article-table__row {
  display: grid;
  grid-template-columns: 132px minmax(320px, 1.35fr) 150px 180px 220px minmax(220px, .9fr) 150px;
  gap: 14px;
  align-items: center;
  min-width: 1380px;
}

.article-table__head {
  padding: 0 14px 10px;
  color: var(--text-faint);
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
}

.article-table__row {
  min-height: 118px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--index-line) 72%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-surface) 74%, transparent);
}

.title-cell,
.metric-cell,
.time-cell {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.cover-thumb,
.cover-swatch,
.board-cover {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--index-line);
  border-radius: 8px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent-gold) 28%, transparent), transparent),
    color-mix(in srgb, var(--index-surface) 84%, transparent);
}

.cover-thumb::before,
.cover-swatch::before,
.board-cover::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 72% 22%, color-mix(in srgb, var(--accent-gold) 54%, transparent), transparent 18%),
    linear-gradient(145deg, transparent 48%, color-mix(in srgb, var(--index-line) 62%, transparent) 49%, transparent 51%);
}

.cover-thumb span,
.cover-swatch span,
.cover-swatch strong,
.board-cover span {
  position: relative;
  z-index: 1;
}

.cover-thumb {
  display: grid;
  aspect-ratio: 16 / 9;
  place-items: end start;
  padding: 8px;
}

.cover-thumb span,
.board-cover span {
  border-radius: 999px;
  padding: 5px 8px;
  color: var(--text-strong);
  background: color-mix(in srgb, var(--panel) 82%, transparent);
  font-size: 11px;
  font-weight: 900;
}

.cover-blade {
  background:
    linear-gradient(120deg, color-mix(in srgb, #7dd3fc 34%, transparent), transparent 42%),
    linear-gradient(35deg, color-mix(in srgb, var(--accent-gold) 64%, transparent) 0 12%, transparent 13% 100%),
    color-mix(in srgb, var(--index-surface) 88%, transparent);
}

.cover-eye {
  background:
    radial-gradient(circle at 58% 42%, color-mix(in srgb, #ef8d6b 72%, transparent) 0 12%, color-mix(in srgb, var(--panel) 94%, transparent) 13% 19%, transparent 20%),
    color-mix(in srgb, var(--index-surface) 88%, transparent);
}

.cover-potion {
  background:
    radial-gradient(circle at 34% 62%, color-mix(in srgb, #66c987 68%, transparent), transparent 20%),
    radial-gradient(circle at 68% 34%, color-mix(in srgb, #5aa7ff 58%, transparent), transparent 18%),
    color-mix(in srgb, var(--index-surface) 88%, transparent);
}

.cover-jungle {
  background:
    linear-gradient(135deg, color-mix(in srgb, #66c987 42%, transparent), transparent 56%),
    radial-gradient(circle at 78% 30%, color-mix(in srgb, var(--accent-gold) 62%, transparent), transparent 15%),
    color-mix(in srgb, var(--index-surface) 88%, transparent);
}

.title-cell b,
.article-card__body b,
.board-card b {
  color: var(--text-strong);
}

.title-cell p,
.next-cell,
.article-card__body p,
.board-card p {
  margin: 0;
  color: var(--text-muted);
  line-height: 1.55;
}

.metric-cell,
.time-cell,
.board-meta {
  color: var(--text-faint);
  font-size: 13px;
}

.status-pill {
  display: inline-flex;
  width: fit-content;
  min-height: 28px;
  align-items: center;
  border: 1px solid var(--index-line);
  border-radius: 999px;
  padding: 0 10px;
  color: var(--text-main);
  background: color-mix(in srgb, var(--index-surface) 78%, transparent);
  font-size: 12px;
  font-weight: 900;
}

.status-pill.is-draft,
.cover-swatch.is-draft,
.board-cover.is-draft {
  border-color: color-mix(in srgb, var(--accent-gold) 42%, var(--index-line));
}

.status-pill.is-pending,
.cover-swatch.is-pending,
.board-cover.is-pending {
  border-color: color-mix(in srgb, #5aa7ff 48%, var(--index-line));
}

.status-pill.is-published,
.cover-swatch.is-published,
.board-cover.is-published {
  border-color: color-mix(in srgb, #66c987 48%, var(--index-line));
}

.status-pill.is-offline,
.cover-swatch.is-offline,
.board-cover.is-offline {
  border-color: color-mix(in srgb, #ef8d6b 48%, var(--index-line));
}

.article-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.article-card {
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr);
  gap: 16px;
  padding: 14px;
}

.cover-swatch {
  display: grid;
  min-height: 170px;
  align-content: end;
  gap: 8px;
  padding: 12px;
}

.cover-swatch span {
  border-radius: 999px;
  padding: 6px 10px;
  color: var(--text-strong);
  background: color-mix(in srgb, var(--panel) 84%, transparent);
  font-size: 12px;
  font-weight: 900;
}

.cover-swatch strong {
  color: var(--text-strong);
  font-size: 17px;
  line-height: 1.2;
}

.article-card__body {
  display: grid;
  gap: 12px;
}

.card-title-line {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.meta-grid span,
.next-action {
  min-height: 44px;
  border: 1px solid color-mix(in srgb, var(--index-line) 70%, transparent);
  border-radius: 8px;
  padding: 9px 10px;
  color: var(--text-faint);
  background: color-mix(in srgb, var(--index-surface) 66%, transparent);
  font-size: 12px;
}

.meta-grid b {
  display: block;
  color: var(--text-main);
}

.next-action {
  display: grid;
  gap: 4px;
}

.next-action strong {
  color: var(--text-strong);
}

.article-card footer {
  grid-column: 2;
  justify-content: flex-end;
}

.board-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.board-column {
  display: grid;
  align-content: start;
  gap: 12px;
  min-height: 560px;
  padding: 14px;
}

.board-column header {
  display: grid;
  gap: 4px;
}

.board-column h3 {
  margin: 0;
  color: var(--text-strong);
}

.board-column header span {
  color: var(--text-faint);
  font-size: 13px;
}

.board-card {
  display: grid;
  gap: 10px;
  border: 1px solid color-mix(in srgb, var(--index-line) 72%, transparent);
  border-radius: 8px;
  padding: 12px;
  background: color-mix(in srgb, var(--index-surface) 76%, transparent);
}

.board-cover {
  display: grid;
  aspect-ratio: 16 / 7;
  place-items: end start;
  padding: 8px;
}

.board-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

@media (max-width: 1160px) {
  .article-card-grid,
  .board-grid,
  .summary-strip {
    grid-template-columns: 1fr;
  }

  .article-card {
    grid-template-columns: 1fr;
  }

  .article-card footer {
    grid-column: auto;
  }
}

@media (max-width: 720px) {
  .article-list-design-page {
    padding: 14px;
  }

  .design-topbar,
  .panel-head {
    align-items: stretch;
    flex-direction: column;
  }

  .meta-grid {
    grid-template-columns: 1fr;
  }
}
</style>
