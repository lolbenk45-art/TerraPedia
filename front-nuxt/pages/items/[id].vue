<template>
<section class="screen detail-screen active">
    <TerraNav />
    <TerraBreadcrumb />

          <div class="detail-layout">
            <section class="detail-hero dark-card">
              <div class="detail-icon-stage">
                <span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/a192da2a6a2d415ca9c5a09782113e3d.png')"></span>
              </div>
              <div class="detail-main">
                <span class="eyebrow">物品 #757 · Terra Blade</span>
                <h2>泰拉刃</h2>
                <p>泰拉刃是一把困难模式后期近战武器，挥动时会发射高速剑气。它通过真永夜刃和真断钢剑合成，是进入月亮领主阶段前的主线节点。</p>
                <div class="tag-row">
                  <span class="tag gold">近战武器</span>
                  <span class="tag moss">困难模式</span>
                  <span class="tag paper">可合成</span>
                  <span class="tag paper">剑气</span>
                </div>
                <div class="detail-tabs">
                  <button class="detail-tab active" type="button">概览</button>
                  <button class="detail-tab" type="button">合成</button>
                  <button class="detail-tab" type="button">来源</button>
                  <button class="detail-tab" type="button">证据链</button>
                </div>
              </div>
              <aside class="detail-side">
                <p class="section-label">核心属性</p>
                <dl>
                  <dt>伤害</dt><dd>115 近战</dd>
                  <dt>击退</dt><dd>6.5 强</dd>
                  <dt>使用时间</dt><dd>14 很快</dd>
                  <dt>稀有度</dt><dd>黄色</dd>
                  <dt>售出</dt><dd>20 金</dd>
                </dl>
              </aside>
            </section>

            <div class="detail-grid">
              <div class="module-stack">
                <section class="detail-module dark-card">
                  <div class="module-title">
                    <h3>合成路线</h3>
                    <span class="tag gold">2 个直接材料</span>
                  </div>
                  <div class="recipe-tree">
                    <div class="recipe-node">
                      <span class="sprite-frame" style="width:48px;height:48px"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/cd8d30c0359b4fbda34ffcfba4745145.png')"></span></span>
                      <b>真永夜刃</b><span>永夜刃 + 英雄断剑</span>
                    </div>
                    <div class="recipe-arrow">+</div>
                    <div class="recipe-node">
                      <span class="sprite-frame" style="width:48px;height:48px"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/5495725121204ede9da25ddf678ca246.png')"></span></span>
                      <b>真断钢剑</b><span>断钢剑 + 英雄断剑</span>
                    </div>
                    <div class="recipe-arrow">=</div>
                    <div class="recipe-node">
                      <span class="sprite-frame" style="width:48px;height:48px"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/a192da2a6a2d415ca9c5a09782113e3d.png')"></span></span>
                      <b>泰拉刃</b><span>秘银砧 / 山铜砧</span>
                    </div>
                  </div>
                </section>

                <section class="detail-module dark-card">
                  <div class="module-title">
                    <h3>来源与关联</h3>
                    <span class="tag moss">玩家可读摘要</span>
                  </div>
                  <div class="source-table">
                    <div class="source-row">
                      <span class="sprite-frame" style="width:42px;height:42px"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/77203300926f489fb82ae1072a8623d4.png')"></span></span>
                      <div><b>英雄断剑</b><span>日食事件中的蛾怪掉落</span></div>
                      <strong>25%</strong>
                    </div>
                    <div class="source-row">
                      <span class="sprite-frame" style="width:42px;height:42px"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/195bfda5955641b5bf340322fdd26eba.png')"></span></span>
                      <div><b>秘银砧 / 山铜砧</b><span>困难模式砧类制作站</span></div>
                      <strong>制作站</strong>
                    </div>
                    <div class="source-row">
                      <span class="sprite-frame" style="width:42px;height:42px"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/c626dfb6e7bc4139b099b81ffc4680d1.png')"></span></span>
                      <div><b>装备路线</b><span>推荐在击败机械 Boss 后推进</span></div>
                      <strong>攻略</strong>
                    </div>
                  </div>
                </section>
              </div>

              <aside class="evidence-panel dark-card">
                <span class="eyebrow">资料链路</span>
                <div class="evidence-step"><div><b>聚合接口</b><span>/public/items/:id/aggregate</span></div></div>
                <div class="evidence-step"><div><b>图片关系</b><span>主图标、候选图片、排序状态</span></div></div>
                <div class="evidence-step"><div><b>来源关系</b><span>掉落、制作站、事件条件</span></div></div>
                <div class="evidence-step"><div><b>配方树</b><span>检测循环和可展开分支</span></div></div>
              </aside>
            </div>
          </div>

          <TerraFooter />
        </section>
</template>
