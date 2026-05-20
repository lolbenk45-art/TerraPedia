<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="boss-detail-shell">
      <section class="boss-detail-hero support-panel">
        <div class="boss-detail-portrait">
          <img :src="'/preview-assets/wiki-files/Eye_of_Cthulhu_(Phase_1).gif'" alt="克苏鲁之眼" />
        </div>
        <div>
          <span class="eyebrow">Boss · Eye of Cthulhu</span>
          <h1>克苏鲁之眼</h1>
          <p>早期主线 Boss。公开详情页优先展示触发、战前准备、阶段变化、关键掉落和下一步。</p>
          <p class="boss-readiness"><b>战前完成度</b><span>生命水晶、平台、远程武器、铁皮药水</span><em>建议准备 4 / 5</em></p>
          <div class="tag-row">
            <span class="tag gold">2800 HP</span>
            <span class="tag moss">夜晚</span>
            <span class="tag paper">可召唤</span>
            <span class="tag paper">普通模式</span>
          </div>
        </div>
      </section>

      <section class="boss-phase-grid">
        <article class="support-panel boss-phase active">
          <span>Phase 01</span>
          <h2>试探阶段</h2>
          <p>以冲撞和悬停召唤仆从为主，重点检查平台宽度和基础输出。</p>
        </article>
        <article class="support-panel boss-phase">
          <span>Phase 02</span>
          <h2>高速冲刺</h2>
          <p>血量降低后切换高频冲刺，移动速度和再生能力会明显影响容错。</p>
        </article>
        <article class="support-panel boss-phase">
          <span>Route</span>
          <h2>后续推进</h2>
          <p>胜利后继续推进邪恶地形、陨石、地牢和困难模式前装备。</p>
        </article>
      </section>

      <section class="boss-detail-grid">
        <article class="support-panel loot-panel">
          <span class="eyebrow">掉落与路线</span>
          <div class="loot-row"><b>恶魔矿 / 猩红矿</b><span>通向暗影套和恶魔弓路线</span><em>核心</em></div>
          <div class="loot-row"><b>弱效治疗药水</b><span>早期补给</span><em>常见</em></div>
          <div class="loot-row"><b>克苏鲁之盾</b><span>专家模式机动饰品</span><em>专家</em></div>
        </article>
        <article class="support-panel prep-panel">
          <span class="eyebrow">推荐准备</span>
          <a href="/buffs/ironskin"><b>铁皮药水</b><span>提升防御容错</span></a>
          <a href="/items"><b>远程武器</b><span>弓、枪、手雷等早期输出</span></a>
          <a href="/articles/eye-prep"><b>场地搭建</b><span>平台、篝火、心灯占位</span></a>
        </article>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
