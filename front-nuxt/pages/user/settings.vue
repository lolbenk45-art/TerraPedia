<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">/user/settings · preferences</span>
          <h1>账号设置</h1>
          <p>设置页只做前台用户偏好页面，不实现保存。保留资料、显示偏好、通知和公开身份四个区域。</p>
        </div>
        <a class="secondary-button" href="/user">返回用户中心</a>
      </div>
    </div>

    <main class="settings-layout">
      <section class="settings-list support-panel">
        <span class="eyebrow">设置分组</span>
        <a class="active" href="/user/settings"><span class="sprite-icon icon-user menu-icon" aria-hidden="true"></span><span><b>个人资料</b><span>昵称、公开简介</span></span></a>
        <a href="/user/settings"><span class="sprite-icon icon-items menu-icon" aria-hidden="true"></span><span><b>显示偏好</b><span>列表密度、默认入口</span></span></a>
        <a href="/user/settings"><span class="sprite-icon icon-notification menu-icon" aria-hidden="true"></span><span><b>通知</b><span>投稿状态、资料更新</span></span></a>
        <a href="/user/settings"><span class="sprite-icon icon-codex menu-icon" aria-hidden="true"></span><span><b>公开身份</b><span>贡献展示、署名方式</span></span></a>
      </section>

      <section class="settings-panel support-panel">
        <span class="eyebrow">个人资料</span>
        <label><span>昵称</span><input type="text" value="Terraria Player" readonly /></label>
        <label><span>公开简介</span><textarea readonly>喜欢近战路线、Boss 准备和制作链整理。</textarea></label>
        <div class="settings-toggle-row"><b>默认进入高密度图鉴</b><span>开启</span></div>
        <div class="settings-toggle-row"><b>显示投稿署名</b><span>关闭</span></div>
        <button class="primary-button" type="button">保存占位</button>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
