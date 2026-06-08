const ref = (type, id, label) => `<span class="tp-content-ref" data-tp-ref-type="${type}" data-tp-ref-id="${id}" data-tp-ref-label="${label}" data-tp-ref-display="text">${label}</span>`;
const recipeTree = (itemId, label, depth = 3) => `<div class="tp-article-embed tp-recipe-tree" data-tp-embed-type="recipe-tree" data-tp-item-id="${itemId}" data-tp-max-depth="${depth}" data-tp-label="${label}"></div>`;

const refs = {
  lifeCrystal: ref('item', '29', '生命水晶'),
  guide: ref('npc', '22', '向导'),
  nurse: ref('npc', '18', '护士'),
  terraBlade: ref('item', '757', '泰拉刃'),
  eyeOfCthulhu: ref('boss', '35', '克苏鲁之眼'),
  brainOfCthulhu: ref('boss', '37', '克苏鲁之脑'),
  eaterOfWorlds: ref('boss', '36', '世界吞噬怪'),
  wallOfFlesh: ref('boss', '41', '血肉墙'),
  shieldOfCthulhu: ref('item', '3097', '克苏鲁护盾'),
  hellstone: ref('item', '174', '狱石'),
  hellstoneBar: ref('item', '175', '狱石锭'),
  moltenPickaxe: ref('item', '122', '熔岩镐'),
  lavaWaders: ref('item', '908', '熔岩靴'),
  lavaSlime: ref('npc', '59', '熔岩史莱姆'),
  lavaBat: ref('npc', '151', '熔岩蝙蝠'),
  goblinTinkerer: ref('npc', '107', '哥布林工匠'),
  tinkerersWorkshop: ref('item', '398', '工匠作坊'),
  hermesBoots: ref('item', '54', '赫尔墨斯靴'),
  shinyRedBalloon: ref('item', '159', '闪亮红气球'),
  fishingPotion: ref('item', '2354', '钓鱼药水'),
  fishingBobber: ref('item', '5139', '钓鱼浮标'),
  meteorite: ref('item', '116', '陨石'),
  meteoriteBar: ref('item', '117', '陨石锭'),
  guideVoodooDoll: ref('item', '267', '向导巫毒娃娃'),
};

const covers = {
  starting: 'http://localhost:9000/terrapedia-images/items/wiki/item-images/da/dae674a2fb89a6b4113c2454bc4013f454a11d62-life-crystal-png.png',
  gear: 'http://localhost:9000/terrapedia-images/items/wiki/item-images/76/76d124dc8ea4f07f1e50d69dfa17163cc5788b17-terra-blade-png.png',
  hardmode: 'http://localhost:9000/terrapedia-images/items/wiki/item-images/e9/e94c0bf06dd370d06a3843ced36383a5762caf38-molten-pickaxe-png.png',
  biome: 'http://localhost:9000/terrapedia-images/npcs/2026/05/08/b9b08083216447588273b7fe1235f41f.gif',
  event: 'http://localhost:9000/terrapedia-images/items/wiki/item-images/91/91f896fd651526b72478020fb605dff5232c04e6-tinkerer-s-workshop-png.png',
  bossPrep: 'http://localhost:9000/terrapedia-images/bosses/2026/05/09/fa5c654168664131ae7987443cd48d8c.gif',
  underworld: 'http://localhost:9000/terrapedia-images/items/wiki/item-images/49/49b62d47fc77c925298df948030f40440a7cff85-lava-waders-png.png',
  mobility: 'http://localhost:9000/terrapedia-images/items/wiki/item-images/73/73ef02e9fdf9b9b84d104f364e5fbc1a16f77408-shiny-red-balloon-png.png',
  fishing: 'http://localhost:9000/terrapedia-images/items/wiki/item-images/f6/f6d28139992d04a38d77ee4da9e1a3de0bc7dcbb-fishing-potion-png.png',
  meteorite: 'http://localhost:9000/terrapedia-images/items/wiki/item-images/89/89e0dfd0284606ae96ce1bcb82191f38cb4f8782-meteorite-png.png',
};

export const acHomeArticles = [
  {
    slug: 'ac-home-starting-route-2026-06-08',
    title: '开荒入口怎么走：先把生存、信息和恢复接起来',
    summary: '首页开荒入口的原创路线：用生命、NPC 和可返回矿洞建立新档前两小时节奏。',
    coverImage: covers.starting,
    contentHtml: `<h2>先解决能否稳定回来</h2>
<p>新档最容易被拆成很多零散动作：砍树、挖矿、造房、下洞、找箱子。真正稳定的开荒路线不是先追某件装备，而是先建立一个能反复出门和回来的循环。</p>
<p>第一晚前先有可入住房屋、工作台、箱子、火把和一条能回头的洞穴路线。这样每一次死亡、回城或背包满载，都不会让路线完全断掉。</p>
<h2>生命和 NPC 是阶段节点</h2>
<p>${refs.lifeCrystal} 不是顺手奖励，它决定你能否把洞穴探索再推进一层。拿到生命提升后，再扩大探索半径，比开局直接下深层更稳定。</p>
<p>${refs.guide} 提供合成和起步信息，${refs.nurse} 则把早期恢复从消耗品压力里解放出来。把他们当作路线节点，而不是背景角色，开荒会清楚很多。</p>
<ul><li>先把房屋和存储做好，再扩大洞穴探索。</li><li>生命值提升后再推进高风险层，不用一开始硬冲。</li><li>每次出门只定一个目标：生命、矿物、宝箱或 NPC 条件。</li></ul>
<blockquote>开荒的判断顺序：据点能恢复，洞穴能返回，生命值能支撑下一段探索。</blockquote>`,
  },
  {
    slug: 'ac-home-gear-foundation-route-2026-06-08',
    title: '装备成型不是堆防御：先确定你的打法',
    summary: '首页装备成型卡片的原创路线：按打法、材料风险和下一场战斗选择装备。',
    coverImage: covers.gear,
    contentHtml: `<h2>装备选择先问打法</h2>
<p>很多装备路线会被“哪个数字更高”带偏。近战、远程、魔法和召唤的站位不同，需要的机动、恢复和容错也不同。装备成型的第一步，是确认下一场战斗准备怎么打。</p>
<p>如果目标是 ${refs.eyeOfCthulhu}，重点通常是横向移动、可命中输出和恢复节奏；如果你准备挑战腐化或猩红路线，${refs.eaterOfWorlds} 与 ${refs.brainOfCthulhu} 对场地和穿透能力的要求又不同。</p>
<h2>材料风险决定顺序</h2>
<p>路线应该先做能降低风险的装备，再去拿需要承担风险的材料。比如进入地狱层前，先确认机动、恢复和挖掘能力，再考虑 ${refs.hellstoneBar} 这类高价值材料。</p>
<ul><li>先确定输出距离，再选防具和配件。</li><li>先补机动与恢复，再进入高压区域刷材料。</li><li>能稳定命中的装备，优先级高于理论面板更漂亮的装备。</li></ul>
${recipeTree('757', '泰拉刃合成树', 3)}
<blockquote>装备成型的目标不是穿上最显眼的装备，而是让下一步战斗变得可重复。</blockquote>`,
  },
  {
    slug: 'ac-home-hardmode-first-hour-mining-2026-06-08',
    title: '困难模式第一小时：先恢复采矿链，再谈新装备',
    summary: '进入困难模式后的原创路线：先处理矿物层级、工具链和安全采集。',
    coverImage: covers.hardmode,
    contentHtml: `<h2>旧节奏会在困难模式失效</h2>
<p>打完 ${refs.wallOfFlesh} 后，敌怪强度、地图威胁和材料层级会一起抬高。这个阶段最常见的错误是急着做新装备，却没有先恢复采矿链和返回路线。</p>
<p>第一小时的目标应该克制：确认当前能挖哪一层矿，先把工具链续上，再扩大地下采集半径。</p>
<h2>把矿物看成工具链</h2>
<p>${refs.moltenPickaxe} 是进入后续采矿节奏的重要基线。困难模式矿物不是颜色列表，而是一层一层推进的工具链：能挖什么，决定下一批锭该优先投入哪里。</p>
<ul><li>先做能继续采集的工具，不要把所有矿石都消耗在短期战斗装上。</li><li>地下路线要有照明、平台和回城余量。</li><li>遇到强敌时先撤回已打通区域，别用单次深入赌进度。</li></ul>
<blockquote>困难模式第一小时的关键不是马上变强，而是重新拥有稳定获取资源的能力。</blockquote>`,
  },
  {
    slug: 'ac-home-biome-exploration-route-2026-06-08',
    title: '生态探索路线：按风险、资源和返回点推进',
    summary: '首页生态探索节点的原创文章：把群落探索拆成风险判断、资源目标和回程管理。',
    coverImage: covers.biome,
    contentHtml: `<h2>群落不是地图背景</h2>
<p>生态探索的价值不只是发现新区域。每个群落都意味着不同敌怪、地形风险、材料来源和后续路线。进入前先问三个问题：我要拿什么，风险来自哪里，拿到后怎么回去。</p>
<p>丛林、地牢、地狱层这类区域，风险往往来自持续压力和地形，而不是单个敌怪。比如地狱层既有 ${refs.lavaSlime} 和 ${refs.lavaBat}，也有熔岩、狭窄落点和长距离返程。</p>
<h2>第一次只做侦察</h2>
<p>第一次进入新群落，不要强求一次拿完资源。先标记入口、观察敌怪密度、确认回程，再决定是否建立临时据点。</p>
<ul><li>进入前确认光源、平台、绳索、回城和恢复物资。</li><li>发现高价值资源后，先规划返回线，再扩大采集范围。</li><li>探索结束后把材料接到装备、药水、召唤物或 Boss 准备里。</li></ul>
<blockquote>生态探索的好路线，是每次出门都有目标，每次回家都能推进一个节点。</blockquote>`,
  },
  {
    slug: 'ac-home-event-workshop-route-2026-06-08',
    title: '专题路线怎么看：事件、工坊和配件要一起规划',
    summary: '首页专题路线节点的原创文章：把事件收益、工匠作坊和配件升级串成路线。',
    coverImage: covers.event,
    contentHtml: `<h2>事件不是打完就结束</h2>
<p>很多事件的价值不只在掉落本身，而在它解锁的后续系统。你需要把事件、NPC、制作站和配件升级看成一条线，而不是互相独立的任务。</p>
<p>例如 ${refs.goblinTinkerer} 解锁后，${refs.tinkerersWorkshop} 会让许多原本零散的移动配件变成真正的路线升级。没有这个节点，仓库里攒再多配件也很难转化为稳定战力。</p>
<h2>先问这个专题能改变什么</h2>
<p>专题文章适合解释跨系统关系：事件触发、NPC 条件、工坊制作、配件组合和下一场战斗之间的关系。它不是图鉴条目替代品，而是把多个条目组织成可执行顺序。</p>
<ul><li>确认事件是否解锁 NPC、制作站或关键材料。</li><li>检查已有配件是否能合成为更高阶功能件。</li><li>把升级结果接到 Boss、探索或机动路线里。</li></ul>
<blockquote>专题路线的作用，是把分散的事件和材料整理成下一步。</blockquote>`,
  },
  {
    slug: 'ac-home-boss-prep-route-2026-06-08',
    title: 'Boss 前置准备：场地、恢复和输出窗口先到位',
    summary: '首页推荐路线右侧条目的原创文章：说明 Boss 前准备如何从场地、恢复和输出节奏入手。',
    coverImage: covers.bossPrep,
    contentHtml: `<h2>召唤物只是开战按钮</h2>
<p>很多失败的 Boss 战不是装备完全不够，而是场地、恢复和输出节奏没有准备好。真正决定稳定性的，是你能不能持续移动、稳定恢复，并在安全窗口输出。</p>
<p>${refs.eyeOfCthulhu} 适合用来检查早期场地质量：横向平台是否足够、恢复是否能接上、武器是否能在移动中命中。专家模式下的 ${refs.shieldOfCthulhu} 也会反过来改变后续走位方式。</p>
<h2>失败后要能定位问题</h2>
<p>好的战前准备，不是保证一次成功，而是失败后能清楚知道该补什么：场地太短、恢复不够、机动断档，还是输出窗口太少。</p>
<ul><li>平台要能上下移动，也要能横向拉开距离。</li><li>恢复点、照明和障碍清理提前完成。</li><li>武器选择优先看实际命中，而不是只看面板。</li></ul>
<blockquote>Boss 前置准备的标准，是失败后能明确修正路线，而不是重新随机试一次。</blockquote>`,
  },
  {
    slug: 'ac-home-underworld-checklist-2026-06-08',
    title: '地狱层探索清单：先处理熔岩、落点和返程',
    summary: '首页推荐路线右侧条目的原创文章：进入地狱层前先检查熔岩风险、移动落点和资源返程。',
    coverImage: covers.underworld,
    contentHtml: `<h2>地狱层最大的风险是连续失误</h2>
<p>地狱层的危险不只来自敌怪。熔岩、狭窄落点、长距离下坠和回程困难会把一次小失误放大成整次探索失败。</p>
<p>进入前先判断目标：是为了 ${refs.hellstone} 和 ${refs.hellstoneBar}，还是为了准备 ${refs.guideVoodooDoll} 与后续 ${refs.wallOfFlesh}。目标不同，路线长度和撤退标准也不同。</p>
<h2>准备清单要具体</h2>
<ul><li>有足够平台或绳索，能修正下坠路线。</li><li>有应对熔岩的工具、药水或替代路径；${refs.lavaWaders} 这类机动/环境装备会显著降低失误成本。</li><li>留出背包空间，避免拿到关键材料后无法带回。</li><li>在入口或中途建立可识别的返回标记。</li></ul>
<blockquote>地狱层路线的核心是降低不可逆风险：能下去，能拿到目标，也能带回来。</blockquote>`,
  },
  {
    slug: 'ac-home-mobility-upgrade-route-2026-06-08',
    title: '移动升级路线：别让机动能力断档',
    summary: '首页攻略专题装备入口的原创文章：把靴子、跳跃、飞行和位移能力作为阶段推进资源。',
    coverImage: covers.mobility,
    contentHtml: `<h2>机动不是舒适度，它是前置条件</h2>
<p>移动能力影响探索深度、Boss 容错和资源回收效率。跑得更稳、跳得更准、能更快脱离危险，往往比一件短期输出装备更能推动进度。</p>
<p>早期可以从 ${refs.hermesBoots} 这类跑速装备开始，再把 ${refs.shinyRedBalloon} 一类跳跃能力纳入路线。等 ${refs.goblinTinkerer} 和工坊节点接上后，移动链就能从散件变成稳定升级目标。</p>
<h2>按用途检查机动链</h2>
<ul><li>探索型升级优先解决跑图、坠落和返回效率。</li><li>Boss 型升级优先解决横向拉扯和高度变化。</li><li>环境型升级优先解决熔岩、水域、狭窄地形和地牢压力。</li></ul>
<p>每当你准备进入新群落、新事件或新 Boss，先问机动是否够用。很多看似装备不够的问题，其实是站位和逃离路线不够。</p>
<blockquote>移动升级不是支线，它是让装备真正发挥作用的条件。</blockquote>`,
  },
  {
    slug: 'ac-home-resource-loop-fishing-2026-06-08',
    title: '资源循环怎么建立：钓鱼、药水和目标水域一起看',
    summary: '首页攻略专题机制入口的原创文章：把钓鱼和药水视为中期资源循环，而不是孤立玩法。',
    coverImage: covers.fishing,
    contentHtml: `<h2>资源循环让准备变得可重复</h2>
<p>当你开始频繁准备 Boss、事件或高风险探索时，临时翻箱子会越来越低效。资源循环的目标是让关键材料、药水和补给能稳定产出。</p>
<p>钓鱼的价值在于它能连接药水、材料、任务和特定水域收益。比如 ${refs.fishingPotion} 和 ${refs.fishingBobber} 不只是钓鱼玩法的道具，它们能把一次等待变成更可控的补给获取。</p>
<h2>先定义目标水域</h2>
<ul><li>目标是药水材料、箱子、任务鱼还是特定环境收益。</li><li>准备鱼饵、钓力提升和安全站位，而不是临时找水坑。</li><li>把产出接回 Boss 准备、探索路线或材料循环。</li></ul>
<p>资源循环不是为了囤满仓库，而是为了让下一场战斗、下一次探索更稳定。</p>
<blockquote>好的资源循环会减少等待和试错，让每次出门都更接近目标。</blockquote>`,
  },
  {
    slug: 'ac-home-meteorite-planning-2026-06-08',
    title: '陨石落地后先别乱挖：采集安全和转化收益一起算',
    summary: '首页攻略专题手札的原创文章：陨石出现后先判断采集风险、材料转化和装备收益。',
    coverImage: covers.meteorite,
    contentHtml: `<h2>陨石是资源节点，也是风险节点</h2>
<p>陨石落地后很容易让人立刻冲过去采集，但真正应该先判断现场风险：地形是否适合站位，敌怪压力是否可控，背包和工具是否能支撑一次有效采集。</p>
<p>${refs.meteorite} 的价值取决于你能否把它转化成当前阶段用得上的目标。零散挖一点，可能既承担风险，又无法形成有效升级；集中规划 ${refs.meteoriteBar} 的用途，收益会明确很多。</p>
<h2>先规划采集，再规划制作</h2>
<ul><li>清理入口和站位，避免被地形逼进危险区域。</li><li>确认工具、恢复物资和背包空间，再开始大规模采集。</li><li>回家后先看能否形成完整装备目标，而不是随手消耗材料。</li></ul>
<p>当材料已经足够完成目标，或者现场风险开始超过收益，就该撤退。资源路线成熟的标志不是把地图挖空，而是知道拿到多少就足够推进下一步。</p>
<blockquote>陨石规划的核心，是把一次突发事件变成可控的装备与材料收益。</blockquote>`,
  },
];
