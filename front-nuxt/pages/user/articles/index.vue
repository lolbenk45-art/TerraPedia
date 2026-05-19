<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">/user/articles · drafts</span>
          <h1>我的文章</h1>
          <p>文章管理是前台用户页，不是后台管理。这里展示用户自己的草稿、投稿状态和公开文章入口，功能暂不实现。</p>
        </div>
        <a class="primary-button" href="/user/articles/new">新建文章</a>
      </div>
    </div>

    <main class="user-layout">
      <section class="user-dashboard-grid">
        <article class="support-panel user-feed-panel wide">
          <span class="eyebrow">投稿列表</span>
          <div class="user-article-row active"><b>近战装备推进路线补充</b><span>草稿 · 18 个图鉴链接</span><a href="/user/articles/new">继续编辑</a></div>
          <div class="user-article-row"><b>丛林探索风险整理</b><span>待审核 · 生态专题</span><a href="/articles/jungle-route">查看预览</a></div>
          <div class="user-article-row"><b>克眼前准备清单</b><span>已发布 · Boss 前路线</span><a href="/articles/eye-prep">打开文章</a></div>
        </article>
        <aside class="support-panel user-feed-panel">
          <span class="eyebrow">状态汇总</span>
          <div class="user-link-matrix single">
            <a href="/user/articles/new"><b>2</b><span>草稿</span></a>
            <a href="/articles"><b>4</b><span>已发布</span></a>
            <a href="/user"><b>1</b><span>待审核</span></a>
          </div>
        </aside>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
