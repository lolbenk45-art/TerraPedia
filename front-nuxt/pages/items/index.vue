<template>
<section class="screen catalog-screen active">
          <header class="site-nav">
            <a class="site-logo" href="javascript:void(0)">
              <span class="logo-gem" aria-hidden="true"></span>
              <span><strong>TerraPedia</strong><small>物品图鉴</small></span>
            </a>
            <nav class="site-links" aria-label="主导航">
              <a class="site-link" href="javascript:void(0)">首页</a>
              <a class="site-link active" href="javascript:void(0)">物品</a>
              <a class="site-link" href="javascript:void(0)">NPC</a>
              <a class="site-link" href="javascript:void(0)">Boss</a>
              <a class="site-link" href="javascript:void(0)">文章</a>
            </nav>
            <div class="site-actions">
              <button class="icon-button" type="button" aria-label="搜索">⌕</button>
              <a class="secondary-button" href="javascript:void(0)">收藏夹</a>
            </div>
          </header>

          <div class="page-head">
            <div class="page-head-inner">
              <div>
                <span class="eyebrow">6,214 个物品 · 高密度浏览</span>
                <h2>物品图鉴</h2>
                <p>按分类、稀有度、阶段和关键词快速定位。列表以图标墙为主，右侧固定显示当前选中物品，减少大量翻页带来的疲劳。</p>
              </div>
              <a class="primary-button" href="javascript:void(0)">查看合成路线</a>
            </div>
          </div>

          <div class="catalog-layout">
            <aside class="filter-panel">
              <div class="filter-group">
                <p class="section-label">分类</p>
                <div class="filter-option active"><span class="filter-dot"></span><b>全部物品</b><span class="count">6214</span></div>
                <div class="filter-option"><span class="filter-dot"></span><b>武器</b><span class="count">932</span></div>
                <div class="filter-option"><span class="filter-dot"></span><b>装备</b><span class="count">684</span></div>
                <div class="filter-option"><span class="filter-dot"></span><b>材料</b><span class="count">1186</span></div>
                <div class="filter-option"><span class="filter-dot"></span><b>家具</b><span class="count">1408</span></div>
              </div>
              <div class="filter-group">
                <p class="section-label">阶段</p>
                <div class="filter-option"><span class="filter-dot"></span><b>开荒</b><span class="count">812</span></div>
                <div class="filter-option"><span class="filter-dot"></span><b>Boss 前</b><span class="count">960</span></div>
                <div class="filter-option"><span class="filter-dot"></span><b>困难模式</b><span class="count">1244</span></div>
              </div>
            </aside>

            <section class="list-panel">
              <div class="catalog-page-headline">
                <h3>全部物品</h3>
                <button class="small-button active" type="button">图标墙</button>
                <button class="small-button" type="button">列表</button>
                <button class="small-button" type="button">只看可合成</button>
              </div>
              <div class="list-toolbar">
                <div class="catalog-search"><span class="search-glyph" aria-hidden="true"></span><strong>泰拉刃</strong></div>
                <div class="toolbar-buttons">
                  <button class="small-button active" type="button">紧凑</button>
                  <button class="small-button" type="button">稀有度</button>
                  <button class="small-button" type="button">阶段</button>
                </div>
              </div>
              <div class="density-rail">
                <span>高密度图鉴墙 · 当前视口展示 40 个样本，生产页建议 120/240 快速切换</span>
                <strong>6,214</strong>
              </div>
              <div class="item-grid">
                <div class="item-cell active"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/a192da2a6a2d415ca9c5a09782113e3d.png')"></span><span>泰拉刃</span></div>
                <div class="item-cell"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/cd8d30c0359b4fbda34ffcfba4745145.png')"></span><span>真永夜刃</span></div>
                <div class="item-cell"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/5495725121204ede9da25ddf678ca246.png')"></span><span>真断钢剑</span></div>
                <div class="item-cell"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/195bfda5955641b5bf340322fdd26eba.png')"></span><span>神圣镐</span></div>
                <div class="item-cell"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/6ef1b719169348b595c93654cbf60c1c.png')"></span><span>铁皮药水</span></div>
                <div class="item-cell"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/c626dfb6e7bc4139b099b81ffc4680d1.png')"></span><span>神圣锭</span></div>
                <div class="item-cell"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/b3ddc7b2db8b4c53a00b0274ed9edfaa.png')"></span><span>永夜刃</span></div>
                <div class="item-cell"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/c049cc2442144242a8b7768517723664.png')"></span><span>村正</span></div>
                <div class="item-cell"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/3a43bd1521b5418fade0c386891cc047.png')"></span><span>铜短剑</span></div>
                <div class="item-cell"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/195bfda5955641b5bf340322fdd26eba.png')"></span><span>铜镐</span></div>
                <div class="item-cell"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/32a6970ec3f746ad9e23b6312c4dea1c.png')"></span><span>铁矿</span></div>
                <div class="item-cell"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/6ef1b719169348b595c93654cbf60c1c.png')"></span><span>治疗药水</span></div>
                <div class="item-cell"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/572d02498c01441e86ce0e55aa946f5b.png')"></span><span>星星炮</span></div>
                <div class="item-cell"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/6b53bc835cd742dba96053653aac8f4f.png')"></span><span>陨石锭</span></div>
                <div class="item-cell"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/84a7346cf0044805ab5b443b96ca15e0.png')"></span><span>钴镐</span></div>
                <div class="item-cell"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/1c9f832ea4a6424c8bdae1bc843ec02f.png')"></span><span>星怒</span></div>
                <div class="item-cell"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/034a248ac37a42049c5ef882098a4eb8.png')"></span><span>暴雪瓶</span></div>
                <div class="item-cell"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/6ef1b719169348b595c93654cbf60c1c.png')"></span><span>再生药水</span></div>
                <div class="item-cell"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/034a248ac37a42049c5ef882098a4eb8.png')"></span><span>水晶风暴</span></div>
                <div class="item-cell"><span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/195bfda5955641b5bf340322fdd26eba.png')"></span><span>梦魇镐</span></div>
              </div>
              <div class="pager">
                <span>第 1 页 · 每页 120 个 · 已筛选 412 项</span>
                <div class="toolbar-buttons">
                  <button class="small-button" type="button">上一页</button>
                  <button class="small-button active" type="button">下一页</button>
                </div>
              </div>
            </section>

            <aside class="preview-panel">
              <div class="preview-hero">
                <div class="preview-icon">
                  <span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/a192da2a6a2d415ca9c5a09782113e3d.png')"></span>
                </div>
                <h3>泰拉刃</h3>
                <p>近战武器。发射绿色剑气，常用于困难模式后期推进和月亮领主前装备路线。</p>
                <div class="tag-row">
                  <span class="tag gold">黄色稀有度</span>
                  <span class="tag moss">合成</span>
                </div>
                <div class="stat-grid">
                  <div class="stat-box"><b>115</b><span>近战伤害</span></div>
                  <div class="stat-box"><b>14</b><span>使用时间</span></div>
                  <div class="stat-box"><b>6.5</b><span>击退</span></div>
                  <div class="stat-box"><b>1</b><span>最大堆叠</span></div>
                </div>
              </div>
              <div class="preview-list">
                <div class="preview-list-row">
                  <span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/cd8d30c0359b4fbda34ffcfba4745145.png')"></span>
                  <div><b>真永夜刃</b><span>合成材料</span></div>
                </div>
                <div class="preview-list-row">
                  <span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/5495725121204ede9da25ddf678ca246.png')"></span>
                  <div><b>真断钢剑</b><span>合成材料</span></div>
                </div>
                <div class="preview-list-row">
                  <span class="item-art" style="background-image:url('http://localhost:9000/terrapedia-images/items/2026/04/08/77203300926f489fb82ae1072a8623d4.png')"></span>
                  <div><b>英雄断剑</b><span>掉落来源</span></div>
                </div>
              </div>
            </aside>
          </div>
        </section>
</template>
