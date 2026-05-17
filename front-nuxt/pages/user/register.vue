<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="user-auth-layout">
      <section class="user-auth-copy support-panel">
        <span class="eyebrow">创建账号</span>
        <h2>注册成为资料共建者</h2>
        <p>注册页先保留品牌化表单和说明区域，功能暂不实现。视觉上与登录页共享同一套深色网格和低亮边框。</p>
        <div class="user-auth-proof">
          <div><b>路线</b><span>保存阅读进度</span></div>
          <div><b>纠错</b><span>提交资料反馈</span></div>
          <div><b>文章</b><span>参与专题共建</span></div>
        </div>
      </section>

      <section class="user-form-panel support-panel">
        <span class="eyebrow">Preview form</span>
        <label><span>昵称</span><input type="text" value="Terraria Player" readonly /></label>
        <label><span>邮箱</span><input type="email" value="new@terrapedia.local" readonly /></label>
        <label><span>密码</span><input type="password" value="preview-only" readonly /></label>
        <button class="primary-button" type="button">注册占位</button>
        <div class="form-footnote">
          <a href="/user/login">已有账号</a>
          <a href="/user">返回用户中心</a>
        </div>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
