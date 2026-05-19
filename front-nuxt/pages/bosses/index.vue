<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">推进顺序 · 战利品 · 阶段入口</span>
          <h1>Boss 路线</h1>
          <p>Boss 页面不做普通卡片堆叠，而是把触发条件、战前准备、关键掉落和下一阶段放到同一条推进线上。</p>
        </div>
        <a class="primary-button" href="/articles">看路线攻略</a>
      </div>
    </div>

    <main class="boss-page-shell">
      <section class="boss-command">
        <div>
          <span class="eyebrow">当前路线</span>
          <h2>普通模式到月亮领主前的关键节点</h2>
          <p>先展示战斗节点，再连接装备、Buff 和套装入口。页面目标是让玩家一眼知道下一步该准备什么。</p>
        </div>
        <div class="boss-command-stats">
          <div><b>01</b><span>战前检查</span></div>
          <div><b>02</b><span>触发方式</span></div>
          <div><b>03</b><span>关键掉落</span></div>
          <div><b>04</b><span>后续路线</span></div>
        </div>
      </section>

      <section class="boss-timeline" aria-label="Boss 推进线">
        <article class="boss-node early">
          <i><img :src="'/preview-assets/terrapedia-images/npcs/2026/05/08/f2e173cc79824f8bb12a8be6807150b9.gif'" alt="史莱姆王" /></i>
          <span>早期</span>
          <h3>史莱姆王</h3>
          <p>低门槛移动检查，适合作为第一次事件型 Boss 入口。</p>
          <div class="node-meta"><b>2000 HP</b><em>王冠 / 史莱姆雨</em></div>
        </article>
        <article class="boss-node active">
          <i><img :src="'/preview-assets/terrapedia-images/npcs/2026/05/08/0d8a53901a0e4dfea17b59f2aecae869.gif'" alt="克苏鲁之眼" /></i>
          <span>主线门槛</span>
          <h3>克苏鲁之眼</h3>
          <p>把生命水晶、平台、药水和第一套武器组织成战前检查表。</p>
          <div class="node-meta"><b>2800 HP</b><em>夜晚 / 可召唤</em></div>
        </article>
        <article class="boss-node">
          <i><img :src="'/preview-assets/terrapedia-images/npcs/2026/05/08/17ee52151e494ffdab942e0b1cbe2586.png'" alt="骷髅王" /></i>
          <span>地牢入口</span>
          <h3>骷髅王</h3>
          <p>击败后打开地牢资源，承接射手、法师和饰品路线。</p>
          <div class="node-meta"><b>4400 HP</b><em>夜晚 / 老人</em></div>
        </article>
        <article class="boss-node hardmode">
          <i><img :src="'/preview-assets/terrapedia-images/npcs/2026/05/08/598625b6363f403c90a90a4af9145b96.gif'" alt="血肉墙" /></i>
          <span>世界转折</span>
          <h3>血肉墙</h3>
          <p>困难模式入口，必须明确装备、地狱桥和掉落后的下一步。</p>
          <div class="node-meta"><b>8000 HP</b><em>向导巫毒娃娃</em></div>
        </article>
      </section>

      <section class="boss-lower-grid">
        <article class="boss-feature-panel">
          <span class="eyebrow">终局信号</span>
          <div class="moon-stage">
            <img :src="'/preview-assets/terrapedia-images/npcs/2026/05/08/f019c588f5fb462087ed61eb12d3c9ea.gif'" alt="月亮领主" />
          </div>
          <h3>月亮领主</h3>
          <p>终局 Boss 详情需要拆成部件、招式、阶段与掉落。这里先占位为后续详情页的结构模板。</p>
        </article>

        <div class="boss-prep-matrix">
          <a href="/items"><b>装备入口</b><span>武器、防具、饰品和制作站</span></a>
          <a href="/buffs"><b>药水与增益</b><span>铁皮、再生、敏捷、食物加成</span></a>
          <a href="/armor-sets"><b>套装路线</b><span>流星、死灵、神圣、甲虫、耀斑</span></a>
          <a href="/projectiles"><b>弹幕行为</b><span>激光、剑气、召唤物、穿透规则</span></a>
        </div>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
