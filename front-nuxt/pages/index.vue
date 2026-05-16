<template>
<section class="screen home-screen active">
          <header class="site-nav">
            <a class="site-logo" href="javascript:void(0)">
              <span class="logo-gem" aria-hidden="true"></span>
              <span><strong>TerraPedia</strong><small>泰拉瑞亚中文资料库</small></span>
            </a>
            <nav class="site-links" aria-label="主导航">
              <a class="site-link active" href="javascript:void(0)">首页</a>
              <a class="site-link" href="javascript:void(0)">物品</a>
              <a class="site-link" href="javascript:void(0)">NPC</a>
              <a class="site-link" href="javascript:void(0)">Boss</a>
              <a class="site-link" href="javascript:void(0)">文章</a>
            </nav>
            <div class="site-actions">
              <button class="icon-button" type="button" aria-label="搜索">⌕</button>
              <a class="secondary-button" href="javascript:void(0)">登录</a>
            </div>
          </header>

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
                  <a class="primary-button" href="javascript:void(0)">开始检索</a>
                </div>
                <div class="quick-entry">
                  <a href="javascript:void(0)">物品</a><a href="javascript:void(0)">Boss</a><a href="javascript:void(0)">NPC</a><a href="javascript:void(0)">攻略</a>
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

            <footer class="camp-footer">
              <div class="footer-main">
                <section class="footer-brand">
                  <span class="footer-kicker">TERRAPEDIA</span>
                  <h3>为 Terraria 玩家建立可追溯的中文资料中枢</h3>
                  <p>TerraPedia 聚合物品图鉴、合成链路、Boss 阶段、专题攻略与版本证据，让资料查询从零散搜索变成稳定的路线系统。</p>
                  <div class="footer-proof">
                    <div><b>6,214</b><span>物品条目</span></div>
                    <div><b>14,746</b><span>链路节点</span></div>
                    <div><b>持续</b><span>数据校验</span></div>
                  </div>
                </section>

                <nav class="footer-column" aria-label="产品">
                  <h4>产品</h4>
                  <div class="footer-links">
                    <a href="javascript:void(0)">物品图鉴</a>
                    <a href="javascript:void(0)">合成路线</a>
                    <a href="javascript:void(0)">Boss 进度</a>
                    <a href="javascript:void(0)">专题攻略</a>
                  </div>
                </nav>

                <nav class="footer-column" aria-label="资源">
                  <h4>资源</h4>
                  <div class="footer-links">
                    <a href="javascript:void(0)">更新日志</a>
                    <a href="javascript:void(0)">数据来源</a>
                    <a href="javascript:void(0)">内容规范</a>
                    <a href="javascript:void(0)">开发计划</a>
                  </div>
                </nav>

                <nav class="footer-column" aria-label="社区">
                  <h4>社区</h4>
                  <div class="footer-links">
                    <a href="javascript:void(0)">反馈建议</a>
                    <a href="javascript:void(0)">内容共建</a>
                    <a href="javascript:void(0)">问题追踪</a>
                    <a href="javascript:void(0)">公开路线图</a>
                  </div>
                </nav>

                <aside class="footer-contact">
                  <h4>联系与合作</h4>
                  <p>欢迎提交资料纠错、攻略协作、镜像部署和社区合作需求。</p>
                  <div class="footer-contact-list">
                    <span><em>Email</em>contact@terrapedia.local</span>
                    <span><em>GitHub</em>github.com/terrapedia</span>
                    <span><em>Status</em>Preview build · 2026</span>
                  </div>
                </aside>
              </div>

              <div class="footer-bottom">
                <span>© 2026 TerraPedia. Unofficial Terraria knowledge project.</span>
                <div class="footer-legal">
                  <a href="javascript:void(0)">隐私</a>
                  <a href="javascript:void(0)">条款</a>
                  <a href="javascript:void(0)">品牌说明</a>
                </div>
              </div>
            </footer>
          </section>
        </section>
</template>
