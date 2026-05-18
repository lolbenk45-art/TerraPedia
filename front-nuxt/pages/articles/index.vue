<template>
<section class="screen article-screen active">
    <TerraNav />
    <TerraBreadcrumb />

          <div class="page-head">
            <div class="page-head-inner">
              <div>
                <span class="eyebrow">编辑部精选 · 路线攻略</span>
                <h2>资料手札</h2>
                <p>文章区以游玩路线、装备目标和机制解释组织内容，和图鉴数据互相跳转，避免普通博客列表的松散感。</p>
              </div>
              <a class="secondary-button" href="/articles">查看专题索引</a>
            </div>
          </div>

          <div class="article-layout discovery-articles-page">
            <section class="article-panel article-route-system">
              <article class="article-lead article-route-lead">
                <div class="cover-art">
                  <span class="cover-plate primary" aria-hidden="true"></span>
                  <span class="cover-plate secondary" aria-hidden="true"></span>
                  <span class="cover-plate tertiary" aria-hidden="true"></span>
                </div>
                <div>
                  <span class="eyebrow">本周主线</span>
                  <h2>从机械 Boss 到月亮领主：近战装备推进路线</h2>
                  <p>以泰拉刃、甲虫套和关键饰品为主线，整理困难模式后期的材料、事件和 Boss 顺序，并标注每一步对应的图鉴入口。</p>
                  <div class="article-meta">
                    <span>12 分钟阅读</span><span>近战路线</span><span>含 18 个图鉴链接</span>
                  </div>
                  <div class="featured-guide-metrics">
                    <span><b>04</b><em>阶段</em></span>
                    <span><b>18</b><em>图鉴链接</em></span>
                    <span><b>07</b><em>Boss 节点</em></span>
                  </div>
                </div>
              </article>
              <div class="article-path route-stage-timeline">
                <a class="article-stage-node active" href="/articles"><span>01</span><b>开荒路线</b><em>资源基础</em></a>
                <a class="article-stage-node" href="/bosses"><span>02</span><b>Boss 前准备</b><em>平台 / 药水</em></a>
                <a class="article-stage-node" href="/armor-sets"><span>03</span><b>困难模式</b><em>三矿 / 神圣锭</em></a>
                <a class="article-stage-node" href="/items/terra-blade"><span>04</span><b>月亮领主前</b><em>泰拉刃 / 甲虫套</em></a>
              </div>
              <div class="article-list article-stage-groups">
                <section class="article-stage-group">
                  <div class="article-stage-label"><span>Stage 01</span><b>开荒到第一场 Boss</b></div>
                  <article class="article-card">
                    <span class="eyebrow">开荒</span>
                    <h3>第一次下矿前应该准备什么</h3>
                    <p>火把、绳索、回忆药水和早期武器的最小配置，适合新存档快速进入地下。</p>
                  </article>
                  <article class="article-card">
                    <span class="eyebrow">Boss</span>
                    <h3>克苏鲁之眼前的装备检查表</h3>
                    <p>从生命水晶、平台、药水到武器选择，按成功率排序准备项。</p>
                  </article>
                </section>
                <section class="article-stage-group">
                  <div class="article-stage-label"><span>Stage 02</span><b>生态与交通系统</b></div>
                  <article class="article-card">
                    <span class="eyebrow">生态</span>
                    <h3>丛林探索的风险和收益</h3>
                    <p>蜂巢、生命果、孢子、丛林宝箱的检索路径，以及推荐进入时机。</p>
                  </article>
                  <article class="article-card">
                    <span class="eyebrow">建筑</span>
                    <h3>晶塔网络如何规划</h3>
                    <p>NPC 幸福度、生态群落和交通节点的组合策略，附常用布局。</p>
                  </article>
                </section>
              </div>
            </section>

            <aside class="article-side article-route-side">
              <span class="eyebrow">阅读路径</span>
              <div class="toc-list">
                <div class="toc-item"><span class="toc-num">01</span><div><b>开荒到克眼</b><span>基础资源和第一场 Boss</span></div></div>
                <div class="toc-item"><span class="toc-num">02</span><div><b>邪恶地形推进</b><span>暗影珠、陨石、永夜刃</span></div></div>
                <div class="toc-item"><span class="toc-num">03</span><div><b>困难模式开局</b><span>三矿、机械 Boss、神圣锭</span></div></div>
                <div class="toc-item"><span class="toc-num">04</span><div><b>月前装备</b><span>泰拉刃、甲虫套、饰品重铸</span></div></div>
              </div>
              <div class="route-side-summary">
                <b>路线覆盖</b>
                <span>武器、Boss、生态、建筑四条主题线合并为一组可追踪阅读路径。</span>
              </div>
            </aside>
          </div>

          <TerraFooter />
        </section>
</template>
