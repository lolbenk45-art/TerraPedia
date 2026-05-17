<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">762 个角色与敌怪 · 公共资料索引</span>
          <h2>NPC 图鉴</h2>
          <p>把城镇角色、敌怪、Boss 部件和事件生物放到同一个可筛选图鉴里。重点不是翻页，而是快速判断角色类型、战斗属性和玩家可用信息。</p>
        </div>
        <a class="primary-button" href="/bosses">进入 Boss 路线</a>
      </div>
    </div>

    <main class="entity-layout">
      <aside class="entity-rail">
        <p class="section-label">角色域</p>
        <a class="entity-filter active" href="/npcs"><span></span><b>全部 NPC</b><em>762</em></a>
        <a class="entity-filter" href="/npcs"><span></span><b>城镇角色</b><em>28</em></a>
        <a class="entity-filter" href="/npcs"><span></span><b>敌怪</b><em>590+</em></a>
        <a class="entity-filter" href="/bosses"><span></span><b>Boss 相关</b><em>阶段</em></a>

        <div class="entity-mini-panel">
          <strong>公共展示口径</strong>
          <p>列表只呈现玩家能理解的信息：身份、生态、基础战斗属性、商店/掉落提示和详情入口。</p>
        </div>
      </aside>

      <section class="entity-main-panel">
        <div class="entity-toolbar">
          <div class="catalog-search"><span class="search-glyph" aria-hidden="true"></span><strong>向导 / 商人 / 克苏鲁之眼</strong></div>
          <div class="toolbar-buttons">
            <button class="small-button active" type="button">紧凑</button>
            <button class="small-button" type="button">按类型</button>
            <button class="small-button" type="button">按阶段</button>
          </div>
        </div>

        <div class="entity-stat-strip">
          <div><b>762</b><span>标准化角色记录</span></div>
          <div><b>28</b><span>城镇角色入口</span></div>
          <div><b>Boss</b><span>按推进阶段拆分</span></div>
          <div><b>可追溯</b><span>图片与公开资料来源</span></div>
        </div>

        <div class="npc-board">
          <a class="npc-card active" href="/npcs/guide">
            <i><img src="http://localhost:9000/terrapedia-images/npcs/2026/05/08/a1a47b9270ac4c8eae3af58ecf0dbe3c.png" alt="向导" /></i>
            <div><b>向导</b><span>城镇 NPC · 材料咨询</span></div>
            <em>详情</em>
          </a>
          <a class="npc-card" href="/npcs/guide">
            <i><img src="http://localhost:9000/terrapedia-images/npcs/2026/05/08/899c04acf9d44145abc53dc4aff90803.png" alt="商人" /></i>
            <div><b>商人</b><span>城镇 NPC · 基础补给</span></div>
            <em>商店</em>
          </a>
          <a class="npc-card" href="/npcs/guide">
            <i><img src="http://localhost:9000/terrapedia-images/npcs/2026/05/08/730578baf3e94be3ab63148a52fa4db0.png" alt="护士" /></i>
            <div><b>护士</b><span>城镇 NPC · 治疗服务</span></div>
            <em>服务</em>
          </a>
          <a class="npc-card danger" href="/bosses">
            <i><img src="http://localhost:9000/terrapedia-images/npcs/2026/05/08/0d8a53901a0e4dfea17b59f2aecae869.gif" alt="克苏鲁之眼" /></i>
            <div><b>克苏鲁之眼</b><span>Boss · 前期门槛</span></div>
            <em>Boss</em>
          </a>
          <a class="npc-card danger" href="/bosses">
            <i><img src="http://localhost:9000/terrapedia-images/npcs/2026/05/08/f2e173cc79824f8bb12a8be6807150b9.gif" alt="史莱姆王" /></i>
            <div><b>史莱姆王</b><span>Boss · 早期事件</span></div>
            <em>Boss</em>
          </a>
          <a class="npc-card" href="/npcs/guide">
            <i><img src="http://localhost:9000/terrapedia-images/npcs/2026/05/08/4d7e13d9e77b4d4ea81c80e307dc50ac.gif" alt="黄蜂" /></i>
            <div><b>黄蜂</b><span>敌怪 · 丛林生态</span></div>
            <em>生态</em>
          </a>
        </div>
      </section>

      <aside class="entity-preview-dark">
        <span class="eyebrow">当前焦点</span>
        <div class="portrait-stage">
          <img src="http://localhost:9000/terrapedia-images/npcs/2026/05/08/a1a47b9270ac4c8eae3af58ecf0dbe3c.png" alt="向导" />
        </div>
        <h3>向导</h3>
        <p>新世界的基础角色。公开页应先告诉玩家他能做什么，再展示商店、提示、战斗和关联路线。</p>
        <div class="mini-facts">
          <div><b>250</b><span>生命值</span></div>
          <div><b>30</b><span>防御</span></div>
          <div><b>城镇</b><span>角色类型</span></div>
          <div><b>材料</b><span>咨询入口</span></div>
        </div>
        <a class="primary-button full-button" href="/npcs/guide">打开详情</a>
      </aside>
    </main>

    <TerraFooter />
  </section>
</template>
