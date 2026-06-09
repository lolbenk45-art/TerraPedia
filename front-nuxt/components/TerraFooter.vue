<script setup lang="ts">
withDefaults(defineProps<{
  itemTotalLabel?: string
}>(), {
  itemTotalLabel: '6,154',
})
</script>

<template>
  <footer class="camp-footer">
    <div class="footer-main">
      <section class="footer-brand">
        <span class="footer-kicker">TERRAPEDIA</span>
        <h3>为 Terraria 玩家建立清晰可靠的中文资料中枢</h3>
        <p>TerraPedia 汇总物品图鉴、合成链路、Boss 阶段、专题攻略与版本依据，让资料查询从零散搜索变成稳定的路线系统。</p>
        <div class="footer-proof">
          <div><b>{{ itemTotalLabel }}</b><span>物品条目</span></div>
          <div><b>14,746</b><span>链路节点</span></div>
          <div><b>持续</b><span>数据校验</span></div>
        </div>
      </section>

      <nav class="footer-column" aria-label="产品">
        <h4>产品</h4>
        <div class="footer-links">
          <a href="/items">物品图鉴</a>
          <a href="/crafting">制作路线</a>
          <a href="/categories">分类索引</a>
          <a href="/bosses">Boss 进度</a>
          <a href="/articles">专题攻略</a>
          <a href="/buffs">Buff 图鉴</a>
          <a href="/armor-sets">套装路线</a>
        </div>
      </nav>

      <nav class="footer-column" aria-label="资源">
        <h4>资源</h4>
        <div class="footer-links">
          <a href="/npcs">NPC 图鉴</a>
          <a href="/projectiles">射弹图鉴</a>
          <a href="/biomes">生态索引</a>
          <a href="/search">全站检索</a>
          <a href="/about">数据来源</a>
          <a href="/about">使用说明</a>
        </div>
      </nav>

      <nav class="footer-column" aria-label="说明">
        <h4>说明</h4>
        <div class="footer-links">
          <a href="/about">项目边界</a>
          <a href="/about">版本说明</a>
          <a href="/about">资料声明</a>
          <a href="/about">权利声明</a>
        </div>
      </nav>

      <aside class="footer-contact">
        <h4>维护状态</h4>
        <p>资料来源、校验边界和权利说明集中放在项目说明页，页面内容会随数据维护状态持续校正。</p>
        <div class="footer-contact-list">
          <span><em>Source</em>Terraria Wiki / 本地校验链</span>
          <span><em>Scope</em>中文资料索引</span>
          <span><em>Status</em>Public release · 2026</span>
        </div>
      </aside>
    </div>

    <div class="footer-bottom">
      <span>© 2026 TerraPedia. Unofficial Terraria knowledge project.</span>
      <div class="footer-legal">
        <a href="/about">隐私</a>
        <a href="/about">条款</a>
        <a href="/about">品牌说明</a>
      </div>
    </div>
  </footer>
</template>
