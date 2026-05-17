<script setup lang="ts">
const heroEntries = [
  { label: '搜索', href: '/search', code: 'SR', desc: '全站快速定位', tone: 'tone-search' },
  { label: '物品', href: '/items', code: 'IT', desc: '装备材料掉落', tone: 'tone-items' },
  { label: '分类', href: '/categories', code: 'CL', desc: '按类型浏览', tone: 'tone-category' },
  { label: '生态', href: '/biomes', code: 'BM', desc: '群落资源路径', tone: 'tone-biome' },
  { label: 'Boss', href: '/bosses', code: 'BS', desc: '阶段战斗路线', tone: 'tone-boss' },
  { label: 'Buff', href: '/buffs', code: 'BF', desc: '增益减益组合', tone: 'tone-buff' },
  { label: '套装', href: '/armor-sets', code: 'AR', desc: '职业防具推进', tone: 'tone-armor' },
  { label: '射弹', href: '/projectiles', code: 'PJ', desc: '弹道来源行为', tone: 'tone-projectile' },
  { label: 'NPC', href: '/npcs', code: 'NP', desc: '城镇敌怪图鉴', tone: 'tone-npc' },
  { label: '攻略', href: '/articles', code: 'GD', desc: '专题和机制', tone: 'tone-guide' },
]
</script>

<template>
<section class="screen home-screen active">
    <TerraNav />

          <section class="hero">
            <div class="hero-grid">
              <aside class="hero-left" aria-hidden="true">
                <div class="atlas-index">
                  <div class="index-head">
                    <div><span>TERRAPEDIA INDEX</span><strong>公共资料索引</strong></div>
                    <div class="index-total"><b>6,214</b><span>条目</span></div>
                  </div>
                  <div class="index-focus">
                    <img src="http://localhost:9000/terrapedia-images/items/2026/04/08/a192da2a6a2d415ca9c5a09782113e3d.png" alt="" />
                    <div><span>当前焦点</span><b>泰拉刃</b></div>
                    <em>详情</em>
                  </div>
                  <div class="index-metrics">
                    <div><b>物品</b><span>装备 / 材料 / 掉落</span></div>
                    <div><b>NPC</b><span>城镇 / 敌怪</span></div>
                    <div><b>Boss</b><span>阶段 / 战利品</span></div>
                    <div><b>攻略</b><span>路线 / 事件</span></div>
                  </div>
                  <div class="index-table">
                    <div class="index-row"><span>01</span><b>物品图鉴</b><em>6,214</em></div>
                    <div class="index-row"><span>02</span><b>合成链路</b><em>14,746</em></div>
                    <div class="index-row"><span>03</span><b>Boss 进度</b><em>路线化</em></div>
                    <div class="index-row"><span>04</span><b>攻略专题</b><em>精选</em></div>
                  </div>
                </div>
              </aside>

              <section class="hero-center">
                <span class="hero-kicker">公开图鉴 · 世界路线</span>
                <div>
                  <h2>从一把泰拉刃进入整个世界</h2>
                  <p class="hero-lede">
                    这不是博客首页。它是泰拉瑞亚的资料入口，围绕物品、Boss、NPC、生态和攻略路线组织内容，用完整首页的结构建立第一印象。
                  </p>
                </div>
                <div class="search-bar">
                  <div class="search-field">
                    <span class="search-glyph" aria-hidden="true"></span>
                    <strong>搜索物品、Boss、NPC、路线...</strong>
                  </div>
                  <a class="primary-button" href="/items">开始检索</a>
                </div>
                <div class="quick-entry">
                  <a
                    v-for="entry in heroEntries"
                    :key="entry.href"
                    class="quick-entry-card"
                    :class="entry.tone"
                    :href="entry.href"
                  >
                    <span class="quick-entry-code">{{ entry.code }}</span>
                    <span class="quick-entry-copy">
                      <b>{{ entry.label }}</b>
                      <em>{{ entry.desc }}</em>
                    </span>
                    <span class="quick-entry-arrow" aria-hidden="true">›</span>
                  </a>
                </div>
              </section>
            </div>
            <div class="hero-stats">
              <article class="hero-stat-card"><b>6,214</b><span>物品条目</span></article>
              <article class="hero-stat-card"><b>高密度</b><span>图标墙浏览</span></article>
              <article class="hero-stat-card"><b>路线化</b><span>专题与攻略入口</span></article>
              <article class="hero-stat-card"><b>可追溯</b><span>来源与证据链</span></article>
            </div>
          </section>

          <section class="home-lower">
            <div class="home-lower-inner">
              <section class="exploration-map">
                <div class="map-head">
                  <span class="eyebrow">探索地图</span>
                  <h3>世界不是一张列表，而是一张可走的图</h3>
                  <p>把生态、装备、事件和资料入口放在同一张地图里，首页才会像资料中枢，而不是一页普通的产品列表。</p>
                </div>
                <div class="map-path"></div>
                <article class="map-node one">
                  <i><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/3a43bd1521b5418fade0c386891cc047.png')"></span></i>
                  <b>开荒入口</b>
                  <span>铜短剑、木弓、火把，形成第一条路径。</span>
                </article>
                <article class="map-node featured two">
                  <i><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/a192da2a6a2d415ca9c5a09782113e3d.png')"></span></i>
                  <b>物品图鉴</b>
                  <span>泰拉刃为中心入口，牵出主线路径和合成方向。</span>
                </article>
                <article class="map-node three">
                  <i><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/c626dfb6e7bc4139b099b81ffc4680d1.png')"></span></i>
                  <b>困难模式</b>
                  <span>神圣锭、机械 Boss、阶段性推进。</span>
                </article>
                <article class="map-node four">
                  <i><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/195bfda5955641b5bf340322fdd26eba.png')"></span></i>
                  <b>生态地图</b>
                  <span>群落、资源与地形入口在同一层表达。</span>
                </article>
                <article class="map-node five">
                  <i><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/6ef1b719169348b595c93654cbf60c1c.png')"></span></i>
                  <b>资料手札</b>
                  <span>攻略和专题从这里向外分叉。</span>
                </article>
              </section>

              <section class="paper-stage">
                <div class="section-head">
                  <span class="eyebrow">精选路线</span>
                  <h3>首页下半部分承接首屏，但不再继续抬高戏剧性</h3>
                  <p>这里开始进入资料探索，重点是路线、事件和专题入口，视觉强度比首屏低一点，但依然要有完整设计感。</p>
                </div>

                <div class="stage-grid">
                  <article class="featured-route">
                    <div class="route-art">
                      <span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/cd8d30c0359b4fbda34ffcfba4745145.png')"></span>
                    </div>
                    <h4>从机械 Boss 到月亮领主：近战装备推进路线</h4>
                    <p>以泰拉刃、甲虫套和关键饰品为主线，整理困难模式后期的材料、事件和 Boss 顺序，并标注每一步对应的图鉴入口。</p>
                    <div class="tag-row">
                      <span class="tag moss">开荒</span>
                      <span class="tag gold">Boss 前</span>
                      <span class="tag paper">困难模式</span>
                      <span class="tag paper">月前装备</span>
                    </div>
                  </article>

                  <div class="route-list">
                    <div class="route-list-row">
                      <span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/cd8d30c0359b4fbda34ffcfba4745145.png')"></span>
                      <div>
                        <b>真永夜刃</b>
                        <span>合成材料 · 路线主轴</span>
                      </div>
                      <strong>合成</strong>
                    </div>
                    <div class="route-list-row">
                      <span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/5495725121204ede9da25ddf678ca246.png')"></span>
                      <div>
                        <b>真断钢剑</b>
                        <span>合成材料 · 战前推进</span>
                      </div>
                      <strong>合成</strong>
                    </div>
                    <div class="route-list-row">
                      <span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/77203300926f489fb82ae1072a8623d4.png')"></span>
                      <div>
                        <b>英雄断剑</b>
                        <span>掉落来源 · 日食事件</span>
                      </div>
                      <strong>来源</strong>
                    </div>
                  </div>
                </div>
              </section>

              <article class="boss-strip">
                <div class="boss-medallion">
                  <span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/195bfda5955641b5bf340322fdd26eba.png')"></span>
                </div>
                <div class="boss-copy">
                  <span class="eyebrow">Boss 事件条</span>
                  <h4>将战斗、掉落和推进节奏摆在同一条线上</h4>
                  <p>战前准备、击败后的掉落与下一阶段入口放成连续信息，不让 Boss 区像普通卡片列表。</p>
                  <div class="boss-route">
                    <span><b>01</b>战前准备</span>
                    <span><b>02</b>事件触发</span>
                    <span><b>03</b>关键掉落</span>
                    <span><b>04</b>下一阶段</span>
                  </div>
                </div>
                <div class="loot-grid" aria-hidden="true">
                  <span><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/6ef1b719169348b595c93654cbf60c1c.png')"></span></span>
                  <span><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/6b53bc835cd742dba96053653aac8f4f.png')"></span></span>
                  <span><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/c626dfb6e7bc4139b099b81ffc4680d1.png')"></span></span>
                  <span><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/034a248ac37a42049c5ef882098a4eb8.png')"></span></span>
                  <span><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/572d02498c01441e86ce0e55aa946f5b.png')"></span></span>
                  <span><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/1c9f832ea4a6424c8bdae1bc843ec02f.png')"></span></span>
                </div>
              </article>

              <div class="codex-band">
                <article class="codex-scroll">
                  <div class="codex-feature">
                    <span class="eyebrow">资料手札</span>
                    <h4>文章区不是博客堆叠，而是专题导航</h4>
                    <p>按游玩阶段、装备目标和机制解释组织内容，和图鉴数据互相跳转，保持站点整体的路线感。</p>
                    <div class="codex-actions">
                      <span>攻略</span>
                      <span>专题</span>
                      <span>机制</span>
                    </div>
                  </div>
                  <div class="codex-route-list">
                    <div><span>01</span><p><b>阶段专题</b><em>开荒 / 困难模式 / 月后整理</em></p></div>
                    <div><span>02</span><p><b>装备目标</b><em>近战、射手、法师和召唤路线</em></p></div>
                    <div><span>03</span><p><b>机制解释</b><em>事件、生态、掉落与刷新规则</em></p></div>
                  </div>
                </article>

                <aside class="codex-notes">
                  <div class="codex-note">
                    <i aria-hidden="true">A</i>
                    <div><b>专题索引</b><span>按阶段、职业和事件组织入口</span></div>
                  </div>
                  <div class="codex-note">
                    <i aria-hidden="true">B</i>
                    <div><b>路线信号</b><span>把装备和事件拆成可走的流程</span></div>
                  </div>
                  <div class="codex-note">
                    <i aria-hidden="true">C</i>
                    <div><b>阅读手札</b><span>文章卡片以专题化摘要呈现</span></div>
                  </div>
                </aside>
              </div>

              <section class="index-plinth" aria-label="资料索引台">
                <div>
                  <b>资料索引台</b>
                  <span>统计、导航、信号展示</span>
                </div>
                <div>
                  <b>6,214</b>
                  <span>物品条目</span>
                </div>
                <div>
                  <b>高密度</b>
                  <span>图标墙浏览</span>
                </div>
                <div>
                  <b>路线化</b>
                  <span>专题与攻略入口</span>
                </div>
                <div>
                  <b>可追溯</b>
                  <span>来源与证据链</span>
                </div>
              </section>
            </div>

            <TerraFooter />
          </section>
        </section>
</template>
