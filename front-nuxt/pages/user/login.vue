<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="user-auth-layout">
      <section class="user-auth-copy support-panel">
        <span class="eyebrow">账号入口</span>
        <h1>登录 TerraPedia</h1>
        <p>页面只展示登录视图，不实现认证。后续补齐账号功能后保留当前位置、收藏和投稿入口。</p>
        <div class="user-auth-proof">
          <div><b>收藏</b><span>快速回到资料</span></div>
          <div><b>投稿</b><span>管理攻略草稿</span></div>
          <div><b>偏好</b><span>保存浏览设置</span></div>
        </div>
      </section>

      <section class="user-form-panel support-panel">
        <span class="eyebrow">Preview form</span>
        <label><span>邮箱</span><input type="email" value="player@terrapedia.local" readonly /></label>
        <label><span>密码</span><input type="password" value="preview-only" readonly /></label>
        <button class="primary-button" type="button">登录占位</button>
        <div class="form-footnote">
          <a href="/user/register">注册账号</a>
          <a href="/user">返回用户中心</a>
        </div>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
