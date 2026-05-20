<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">职业与阶段</span>
          <h1>套装</h1>
          <p>按阶段选择与职业分支，看每套装备的部件与定位。</p>
        </div>
        <a class="primary-button" href="/bosses">按 Boss 推进</a>
      </div>
    </div>

    <main class="armor-layout">
      <section class="armor-spotlight">
        <div>
          <span class="eyebrow">当前推荐</span>
          <h2>神圣盔甲作为困难模式中段的职业分岔点</h2>
          <p>同一套装通过头部件切换近战、远程、魔法、召唤方向。公开页需要让玩家先看到路线差异，再展开部件细节。</p>
          <div class="tag-row">
            <span class="tag gold">困难模式</span>
            <span class="tag moss">职业分支</span>
            <span class="tag paper">神圣锭</span>
          </div>
        </div>
        <div class="armor-stage">
          <img :src="'/preview-assets/wiki-images/Hallowed_armor.png?8ccbab'" alt="神圣盔甲" />
        </div>
      </section>

      <section class="armor-grid">
        <article class="armor-card active">
          <img :src="'/preview-assets/wiki-images/Hallowed_armor.png?8ccbab'" alt="神圣盔甲" />
          <div>
            <span>困难模式</span>
            <h3>神圣盔甲</h3>
            <p>提供职业头部件分支，套装奖励为神圣防护。</p>
          </div>
          <em>54 神圣锭</em>
        </article>
        <article class="armor-card">
          <img :src="'/preview-assets/wiki-images/Meteor_armor.png?767b93'" alt="流星盔甲" />
          <div>
            <span>肉前</span>
            <h3>流星盔甲</h3>
            <p>魔法路线早期核心，围绕太空枪形成低魔耗打法。</p>
          </div>
          <em>45 陨石锭</em>
        </article>
        <article class="armor-card">
          <img :src="'/preview-assets/wiki-images/Beetle_armor.png?343dd6'" alt="甲虫盔甲" />
          <div>
            <span>月前</span>
            <h3>甲虫盔甲</h3>
            <p>近战路线分为防御与输出两种胸甲选择。</p>
          </div>
          <em>甲虫外壳</em>
        </article>
        <article class="armor-card">
          <img :src="'/preview-assets/wiki-images/Solar_Flare_armor.png?e503bc'" alt="耀斑盔甲" />
          <div>
            <span>月后</span>
            <h3>耀斑盔甲</h3>
            <p>终局近战套装，强调伤害减免和冲刺能力。</p>
          </div>
          <em>碎片 + 夜明锭</em>
        </article>
      </section>

      <section class="armor-route-band">
        <a href="/items"><b>部件</b><span>头盔、胸甲、护腿</span></a>
        <a href="/buffs"><b>套装效果</b><span>触发、防御、伤害、仆从容量</span></a>
        <a href="/bosses"><b>获取阶段</b><span>Boss 后资源与制作站</span></a>
        <a href="/articles"><b>职业攻略</b><span>近战、射手、法师、召唤</span></a>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
