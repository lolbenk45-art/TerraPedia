<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">/user/articles/new · editor placeholder</span>
          <h2>新建文章</h2>
          <p>这里做投稿编辑器的静态布局：标题、摘要、路线节点、关联资料和发布检查。编辑、上传、保存功能暂不实现。</p>
        </div>
        <a class="secondary-button" href="/user/articles">返回我的文章</a>
      </div>
    </div>

    <main class="editor-layout">
      <section class="editor-main support-panel">
        <span class="eyebrow">文章草稿</span>
        <div class="editor-field title">近战装备推进路线补充</div>
        <div class="editor-field summary">从机械 Boss 后到月亮领主前，把武器、套装、Buff、事件和材料节点串成可执行路线。</div>
        <div class="editor-body-placeholder">
          <b>正文编辑区占位</b>
          <span>后续接入富文本或 Markdown 编辑器，这里先确认信息架构和视觉层级。</span>
        </div>
      </section>

      <aside class="editor-side support-panel">
        <span class="eyebrow">发布检查</span>
        <div class="material-row done"><b>关联物品</b><span>泰拉刃、真永夜刃</span></div>
        <div class="material-row done"><b>关联 Boss</b><span>机械 Boss、月亮领主</span></div>
        <div class="material-row missing"><b>封面图</b><span>未选择</span></div>
        <div class="material-row"><b>状态</b><span>草稿</span></div>
        <button class="primary-button" type="button">保存占位</button>
      </aside>
    </main>

    <TerraFooter />
  </section>
</template>
