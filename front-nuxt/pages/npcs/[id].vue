<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="entity-detail-layout">
      <section class="npc-detail-hero">
        <div class="npc-detail-portrait">
          <img src="http://localhost:9000/terrapedia-images/npcs/2026/05/08/a1a47b9270ac4c8eae3af58ecf0dbe3c.png" alt="向导" />
        </div>
        <div class="npc-detail-copy">
          <span class="eyebrow">NPC #22 · Guide</span>
          <h2>向导</h2>
          <p>向导是新世界最早出现的城镇角色，核心价值是材料咨询和基础提示。详情页用玩家视角组织信息：怎么入住、能提供什么、与哪些路线有关。</p>
          <div class="tag-row">
            <span class="tag gold">城镇 NPC</span>
            <span class="tag moss">材料咨询</span>
            <span class="tag paper">开荒入口</span>
            <span class="tag paper">公开资料</span>
          </div>
        </div>
        <aside class="npc-detail-facts">
          <p class="section-label">核心属性</p>
          <dl>
            <dt>生命值</dt><dd>250</dd>
            <dt>防御</dt><dd>30</dd>
            <dt>击退抗性</dt><dd>0.5</dd>
            <dt>类型</dt><dd>友好城镇角色</dd>
          </dl>
        </aside>
      </section>

      <section class="detail-mosaic">
        <article class="detail-module dark-card">
          <div class="module-title">
            <h3>玩家先看什么</h3>
            <span class="tag moss">公开详情结构</span>
          </div>
          <div class="signal-list">
            <div><b>01</b><span>入住条件</span><em>世界创建后默认可用，后续需要空房间。</em></div>
            <div><b>02</b><span>材料咨询</span><em>把任意材料交给向导，查看可制作物和制作站线索。</em></div>
            <div><b>03</b><span>路线关联</span><em>从火把、工作台、矿物装备一路连接到 Boss 前准备。</em></div>
          </div>
        </article>

        <article class="detail-module dark-card">
          <div class="module-title">
            <h3>关联入口</h3>
            <span class="tag gold">路线导航</span>
          </div>
          <div class="source-table dark-table">
            <a class="source-row" href="/items">
              <span class="sprite-frame" style="width:42px;height:42px"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/c088eaaa45c5467e9757b30a0e69a797.png')"></span></span>
              <div><b>基础方块与工作台</b><span>开荒制作链路</span></div>
              <strong>物品</strong>
            </a>
            <a class="source-row" href="/buffs">
              <span class="sprite-frame" style="width:42px;height:42px"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/c86addd4cab34c9f9a6f67efef22d45b.png')"></span></span>
              <div><b>Boss 前增益</b><span>铁皮、再生、敏捷等准备项</span></div>
              <strong>Buff</strong>
            </a>
            <a class="source-row" href="/bosses">
              <span class="sprite-frame" style="width:42px;height:42px"><img src="http://localhost:9000/terrapedia-images/npcs/2026/05/08/0d8a53901a0e4dfea17b59f2aecae869.gif" alt="" /></span>
              <div><b>第一批 Boss 检查</b><span>克苏鲁之眼前的装备、场地和药水</span></div>
              <strong>路线</strong>
            </a>
          </div>
        </article>

        <aside class="evidence-panel dark-card">
          <span class="eyebrow">页面边界</span>
          <div class="evidence-step"><div><b>公开展示</b><span>玩家可读摘要优先</span></div></div>
          <div class="evidence-step"><div><b>后台维护</b><span>隐藏原始维护字段</span></div></div>
          <div class="evidence-step"><div><b>后续接入</b><span>/public/npcs/:id/aggregate</span></div></div>
        </aside>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
