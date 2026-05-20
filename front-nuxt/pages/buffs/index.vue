<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">388 个效果 · 增益与减益</span>
          <h1>Buff 图鉴</h1>
          <p>Buff 页面用玩家语言表达：这个效果做什么、通常从哪里获得、会影响哪些目标、有哪些免疫提示。后台维护字段不直接出现在公开页。</p>
        </div>
        <a class="primary-button" href="/items">查看药水</a>
      </div>
    </div>

    <main class="effect-layout">
      <section class="effect-hero-panel">
        <div>
          <span class="eyebrow">战前组合</span>
          <h2>把效果当成作战配置，而不是后台表格</h2>
          <p>玩家进入页面后先看到推荐场景和效果差异，再进入具体条目。这样 Buff 页面能服务 Boss 前准备、探索路线和职业构筑。</p>
        </div>
        <div class="effect-stack">
          <span><img :src="'/preview-assets/terrapedia-images/items/2026/04/08/c86addd4cab34c9f9a6f67efef22d45b.png'" alt="铁皮" /></span>
          <span><img :src="'/preview-assets/terrapedia-images/items/2026/04/08/ad621e426a964223819739c74adebc32.png'" alt="再生" /></span>
          <span><img :src="'/preview-assets/terrapedia-images/items/2026/04/08/e9dbcf9db6244a1f9a2c8668c4878ef9.png'" alt="敏捷" /></span>
          <span><img :src="'/preview-assets/terrapedia-images/items/2026/04/08/36df5977d3714f69a3c4abdba2ebb668.png'" alt="吃得好" /></span>
        </div>
      </section>

      <section class="effect-grid">
        <article class="effect-card active">
          <i><img :src="'/preview-assets/terrapedia-images/items/2026/04/08/c86addd4cab34c9f9a6f67efef22d45b.png'" alt="铁皮" /></i>
          <span>防御增益</span>
          <h3>铁皮</h3>
          <p>防御增加 8，常用于 Boss 前准备。</p>
          <dl><div><dt>获得摘要</dt><dd>铁皮药水</dd></div><div><dt>影响目标</dt><dd>玩家</dd></div></dl>
        </article>
        <article class="effect-card">
          <i><img :src="'/preview-assets/terrapedia-images/items/2026/04/08/ad621e426a964223819739c74adebc32.png'" alt="再生" /></i>
          <span>恢复增益</span>
          <h3>再生</h3>
          <p>提供生命再生，适合持久战和探索。</p>
          <dl><div><dt>获得摘要</dt><dd>再生药水</dd></div><div><dt>影响目标</dt><dd>玩家</dd></div></dl>
        </article>
        <article class="effect-card">
          <i><img :src="'/preview-assets/terrapedia-images/items/2026/04/08/e9dbcf9db6244a1f9a2c8668c4878ef9.png'" alt="敏捷" /></i>
          <span>移动增益</span>
          <h3>敏捷</h3>
          <p>移动速度提高 25%，提升走位容错。</p>
          <dl><div><dt>获得摘要</dt><dd>敏捷药水</dd></div><div><dt>影响目标</dt><dd>玩家</dd></div></dl>
        </article>
        <article class="effect-card debuff">
          <i><img :src="'/preview-assets/terrapedia-images/items/2026/04/08/685945ca103148e0b4484c263ecd08ac.png'" alt="着火了" /></i>
          <span>减益</span>
          <h3>着火了！</h3>
          <p>持续损失生命值，部分敌怪具备免疫提示。</p>
          <dl><div><dt>来源摘要</dt><dd>火焰类攻击</dd></div><div><dt>免疫提示</dt><dd>按敌怪显示</dd></div></dl>
        </article>
        <article class="effect-card debuff">
          <i><img :src="'/preview-assets/terrapedia-images/items/2026/04/08/f2b935f8701a4bf39058f1b356c27e6b.png'" alt="中毒" /></i>
          <span>减益</span>
          <h3>中毒</h3>
          <p>缓慢损失生命值，适合在敌怪详情中反向关联。</p>
          <dl><div><dt>来源摘要</dt><dd>毒刺 / 毒类攻击</dd></div><div><dt>免疫提示</dt><dd>159 条样本</dd></div></dl>
        </article>
        <article class="effect-card debuff">
          <i><img :src="'/preview-assets/terrapedia-images/items/2026/04/08/530fbd9b78b94f46821f1d4ee9144b4a.png'" alt="诅咒狱火" /></i>
          <span>减益</span>
          <h3>诅咒狱火</h3>
          <p>持续损失生命值，后续可接入来源和免疫详情。</p>
          <dl><div><dt>来源摘要</dt><dd>诅咒火焰</dd></div><div><dt>免疫提示</dt><dd>26 条样本</dd></div></dl>
        </article>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
