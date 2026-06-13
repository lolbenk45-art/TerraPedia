import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  buildItemSourceCandidateBundle,
  buildItemSourceCandidateImportPlan,
  parseBuildItemSourceCandidateImportPlanArgs
} from './build-item-source-candidate-import-plan.mjs';

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'item-source-import-plan-'));
  const rawDir = path.join(root, 'raw');
  const sourcesDir = path.join(root, 'itemSources');
  const itemsPath = path.join(root, 'items.standardized.json');
  const npcsPath = path.join(root, 'npcs.standardized.json');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(sourcesDir, { recursive: true });
  fs.writeFileSync(path.join(sourcesDir, 'itemSources.part-0001.json'), JSON.stringify({ itemSources: [] }));
  fs.writeFileSync(itemsPath, JSON.stringify({
    records: [
      { id: 50, internalName: 'MagicMirror', name: 'Magic Mirror' },
      { id: 1001, internalName: 'GoldChest', name: 'Gold Chest' },
      { id: 48, internalName: 'Chest', name: 'Chest' },
      { id: 1002, internalName: 'FrozenChest', name: 'Frozen Chest' },
      { id: 1003, internalName: 'WoodenCrate', name: 'Wooden Crate' },
      { id: 1004, internalName: 'BossBagDukeFishron', name: 'Treasure Bag (Duke Fishron)' },
      { id: 1005, internalName: 'LockBox', name: 'Lock Box' },
      { id: 2000, internalName: 'AetheriumBookcase', name: 'Aetherium Bookcase' },
      { id: 2001, internalName: 'ClownHat', name: 'Clown Hat' },
      { id: 2002, internalName: 'StyngerBolt', name: 'Stynger Bolt' },
      { id: 8, internalName: 'Torch', name: 'Torch' },
      { id: 23, internalName: 'Gel', name: 'Gel' },
      { id: 177, internalName: 'Sapphire', name: 'Sapphire' },
      { id: 225, internalName: 'Silk', name: 'Silk' },
      { id: 150, internalName: 'Cobweb', name: 'Cobweb' },
      { id: 965, internalName: 'Rope', name: 'Rope' },
      { id: 1774, internalName: 'GoodieBag', name: 'Goodie Bag' },
      { id: 1749, internalName: 'CatMask', name: 'Cat Mask' },
      { id: 1766, internalName: 'WitchHat', name: 'Witch Hat' },
      { id: 1775, internalName: 'WitchDress', name: 'Witch Dress' },
      { id: 1776, internalName: 'WitchBoots', name: 'Witch Boots' },
      { id: 2611, internalName: 'Flairon', name: 'Flairoon' },
      { id: 4410, internalName: 'Oyster', name: 'Oyster' },
      { id: 4412, internalName: 'WhitePearl', name: 'White Pearl' },
      { id: 4413, internalName: 'BlackPearl', name: 'Black Pearl' },
      { id: 4414, internalName: 'PinkPearl', name: 'Pink Pearl' },
      { id: 4411, internalName: 'ShuckedOyster', name: 'Shucked Oyster' },
      { id: 2367, internalName: 'AnglerHat', name: 'Angler Hat' },
      { id: 2368, internalName: 'AnglerVest', name: 'Angler Vest' },
      { id: 2369, internalName: 'AnglerPants', name: 'Angler Pants' },
      { id: 2380, internalName: 'SeashellHairpin', name: 'Seashell Hairpin' },
      { id: 2381, internalName: 'MermaidAdornment', name: 'Mermaid Adornment' },
      { id: 2382, internalName: 'MermaidTail', name: 'Mermaid Tail' },
      { id: 2490, internalName: 'OldShoe', name: 'Old Shoe' },
      { id: 2491, internalName: 'TinCan', name: 'Tin Can' },
      { id: 1869, internalName: 'Present', name: 'Present' },
      { id: 1870, internalName: 'CandyApple', name: 'Candy Apple' },
      { id: 1871, internalName: 'CandyCane', name: 'Candy Cane' },
      { id: 1872, internalName: 'SoulCake', name: 'Soul Cake' },
      { id: 1873, internalName: 'SugarPlum', name: 'Sugar Plum' },
      { id: 4877, internalName: 'ObsidianCrate', name: 'Obsidian Crate' },
      { id: 4878, internalName: 'HellstoneCrate', name: 'Hellstone Crate' },
      { id: 5200, internalName: 'PottedLavaPlantPalm', name: 'Potted Magma Palm' },
      { id: 5201, internalName: 'PottedLavaPlantBush', name: 'Potted Brimstone Bush' },
      { id: 5202, internalName: 'LavaFishbowl', name: 'Lava Serpent Bowl' },
      { id: 5210, internalName: 'GoldenFishingRod', name: 'Golden Fishing Rod' },
      { id: 5211, internalName: 'HotlineFishingHook', name: 'Hotline Fishing Hook' },
      { id: 5212, internalName: 'SuperAbsorbantSponge', name: 'Super Absorbant Sponge' },
      { id: 5213, internalName: 'LavaAbsorbantSponge', name: 'Lava Absorbant Sponge' },
      { id: 5214, internalName: 'BottomlessHoneyBucket', name: 'Bottomless Honey Bucket' },
      { id: 74, internalName: 'PlatinumCoin', name: 'Platinum Coin' },
      { id: 870, internalName: 'MummyMask', name: 'Mummy Mask' },
      { id: 680, internalName: 'IvyChest', name: 'Ivy Chest' },
      { id: 832, internalName: 'LivingWoodWand', name: 'Living Wood Wand' },
      { id: 932, internalName: 'BoneWand', name: 'Bone Wand' },
      { id: 766, internalName: 'BoneBlock', name: 'Bone Block' },
      { id: 933, internalName: 'LeafWand', name: 'Leaf Wand' },
      { id: 1129, internalName: 'HiveWand', name: 'Hive Wand' },
      { id: 3322, internalName: 'QueenBeeBossBag', name: 'Treasure Bag (Queen Bee)' },
      { id: 3360, internalName: 'LivingMahoganyWand', name: 'Living Mahogany Wand' },
      { id: 3361, internalName: 'LivingMahoganyLeafWand', name: 'Rich Mahogany Leaf Wand' },
      { id: 3077, internalName: 'SilkRope', name: 'Silk Rope' },
      { id: 3078, internalName: 'WebRope', name: 'Web Rope' },
      { id: 2996, internalName: 'VineRope', name: 'Vine Rope' },
      { id: 427, internalName: 'BlueTorch', name: 'Blue Torch' },
      { id: 3004, internalName: 'BoneTorch', name: 'Bone Torch' },
      { id: 5353, internalName: 'ShimmerTorch', name: 'Aether Torch' },
      { id: 2274, internalName: 'UltrabrightTorch', name: 'Ultrabright Torch' },
      { id: 2420, internalName: 'ZephyrFish', name: 'Zephyr Fish' },
      { id: 2003, internalName: 'Goldfish', name: 'Goldfish' },
      { id: 576, internalName: 'MusicBox', name: 'Music Box' },
      { id: 567, internalName: 'MusicBoxBoss1', name: 'Music Box (Boss 1)' },
      { id: 438, internalName: 'StarStatue', name: 'Star Statue' },
      { id: 1372, internalName: 'BloodMoonRising', name: 'Blood Moon Rising' },
      { id: 2156, internalName: 'BlackScorpion', name: 'Black Scorpion' },
      { id: 4341, internalName: 'BlueDungeonVase', name: 'Blue Dungeon Vase' },
      { id: 4372, internalName: 'LavaMoss', name: 'Lava Moss' },
      { id: 5532, internalName: 'DemonAltar', name: 'Demon Altar' },
      { id: 3218, internalName: 'CrimsonPlanterBox', name: 'Deathweed Planter Box' },
      { id: 5492, internalName: 'MagicShimmerDropper', name: 'Magic Shimmer Dropper' },
      { id: 5374, internalName: 'SandstoneWallUnsafe', name: 'Treacherous Sandstone Wall' },
      { id: 5481, internalName: 'BlueDragonfly', name: 'Blue Dragonfly' },
      { id: 3822, internalName: 'EtherianMana', name: 'Etherian Mana' },
      { id: 321, internalName: 'Tombstone', name: 'Tombstone' },
      { id: 1173, internalName: 'GraveMarker', name: 'Grave Marker' },
      { id: 1993, internalName: 'MonarchButterfly', name: 'Monarch Butterfly' },
      { id: 1994, internalName: 'PurpleEmperorButterfly', name: 'Purple Emperor Butterfly' },
      { id: 2454, internalName: 'Batfish', name: 'Batfish' },
      { id: 2455, internalName: 'BumblebeeTuna', name: 'Bumblebee Tuna' },
      { id: 603, internalName: 'Carrot', name: 'Carrot' },
      { id: 969, internalName: 'CookedMarshmallow', name: 'Cooked Marshmallow' },
      { id: 968, internalName: 'MarshmallowonaStick', name: 'Marshmallow on a Stick' },
      { id: 3024, internalName: 'DevDye', name: "Skiphs' Blood" },
      { id: 3281, internalName: 'RedsYoyo', name: "Red's Throw" },
      { id: 5275, internalName: 'JojaCola', name: 'Joja Cola' },
      { id: 4609, internalName: 'GardenGnome', name: 'Garden Gnome' },
      { id: 5043, internalName: 'TorchGodsFavor', name: "Torch God's Favor" },
      { id: 5276, internalName: 'JunimoPetItem', name: 'Stardrop' },
      { id: 5289, internalName: 'MinecartPowerup', name: 'Minecart Upgrade Kit' },
      { id: 3603, internalName: 'LogicGate_AND', name: 'Logic Gate (AND)' },
      { id: 3621, internalName: 'TeamBlockRed', name: 'Red Team Block' },
      { id: 5674, internalName: 'TeamBlockRedVariant', name: 'Dull Red Team Block' },
      { id: 5358, internalName: 'Shellphone', name: 'Shellphone (Home)' },
      { id: 5359, internalName: 'ShellphoneSpawn', name: 'Shellphone (Spawn)' },
      { id: 5360, internalName: 'ShellphoneOcean', name: 'Shellphone (Ocean)' },
      { id: 5361, internalName: 'ShellphoneHell', name: 'Shellphone (Underworld)' },
      { id: 2881, internalName: 'PhasicWarpEjector', name: 'Phasic Warp Ejector' },
      { id: 5668, internalName: 'SoundGun', name: 'The Imploder' },
      { id: 2901, internalName: 'BlueCultistArcherBanner', name: 'Blue Cultist Archer Banner' },
      { id: 2902, internalName: 'AnglerFishBanner', name: 'Angler Fish Banner' },
      { id: 2903, internalName: 'BlueCultistFighterBanner', name: 'Blue Cultist Fighter Banner' },
      { id: 2909, internalName: 'BatBanner', name: 'Cave Bat Banner' },
      { id: 2910, internalName: 'BunnyBanner', name: 'Bunny Banner' },
      { id: 2933, internalName: 'DemonEyeBanner', name: 'Demon Eye Banner' },
      { id: 2989, internalName: 'WhiteCultistArcherBanner', name: 'White Cultist Archer Banner' },
      { id: 2990, internalName: 'WhiteCultistCasterBanner', name: 'White Cultist Caster Banner' },
      { id: 2991, internalName: 'WhiteCultistFighterBanner', name: 'White Cultist Fighter Banner' },
      { id: 3398, internalName: 'SeveredHandBanner', name: 'Severed Hand Banner' },
      { id: 3404, internalName: 'PoisonousSporeBanner', name: 'Poisonous Spore Banner' },
      { id: 4845, internalName: 'GemSquirrelAmethyst', name: 'Amethyst Squirrel' },
      { id: 4852, internalName: 'GemBunnyAmethyst', name: 'Amethyst Bunny' },
      { id: 2015, internalName: 'BlueJay', name: 'Blue Jay' },
      { id: 2017, internalName: 'MallardDuck', name: 'Mallard Duck' },
      { id: 2019, internalName: 'ScarletMacaw', name: 'Scarlet Macaw' },
      { id: 2120, internalName: 'FairyCritterPink', name: 'Pink Fairy' },
      { id: 1582, internalName: 'DTownsWings', name: "D-Town's Wings" },
      { id: 1580, internalName: 'DTownsHelmet', name: "D-Town's Helmet" },
      { id: 3228, internalName: 'ArkhalisWings', name: "Arkhalis' Lightwings" },
      { id: 1364, internalName: 'EyeofCthulhuTrophy', name: 'Eye of Cthulhu Trophy' },
      { id: 1365, internalName: 'GoldfishTrophy', name: 'Goldfish Trophy' },
      { id: 3867, internalName: 'BetsyMasterTrophy', name: 'Betsy Relic' },
      { id: 2092, internalName: 'SkeletronMask', name: 'Skeletron Mask' },
      { id: 3319, internalName: 'EyeOfCthulhuBossBag', name: 'Treasure Bag (Eye of Cthulhu)' },
      { id: 5000, internalName: 'BlueDungeonDoor', name: 'Blue Dungeon Door' },
      { id: 5001, internalName: 'ObsidianDoor', name: 'Obsidian Door' },
      { id: 5002, internalName: 'GoldenDoor', name: 'Golden Door' },
      { id: 5003, internalName: 'MarchingBonesBanner', name: 'Marching Bones Banner' },
      { id: 5004, internalName: 'JungleKeyMold', name: 'Jungle Key Mold' },
      { id: 5005, internalName: 'SkeletronHand', name: 'Skeletron Hand' },
      { id: 5006, internalName: 'FishHook', name: 'Fish Hook' },
      { id: 5007, internalName: 'FestiveWings', name: 'Festive Wings' },
      { id: 5008, internalName: 'FinWings', name: 'Fin Wings' },
      { id: 5009, internalName: 'BetsyWings', name: "Betsy's Wings" },
      { id: 5010, internalName: 'BluePresent', name: 'Blue Present' },
      { id: 5059, internalName: 'CapricornLegs', name: 'Capricorn Hooves' },
      { id: 5060, internalName: 'CapricornTail', name: 'Capricorn Tail' },
      { id: 1705, internalName: 'GoldenToilet', name: 'Golden Toilet' },
      { id: 4131, internalName: 'VoidLens', name: 'Void Bag' },
      { id: 5323, internalName: 'DontHurtComboBook', name: 'Guide to Peaceful Coexistence' },
      { id: 5325, internalName: 'ClosedVoidBag', name: 'Closed Void Bag' },
      { id: 5356, internalName: 'UsedGasTrap', name: 'Used Gas Trap' },
      { id: 5380, internalName: 'ShimmerFlare', name: 'Shimmer Flare' },
      { id: 5455, internalName: 'DontHurtComboBookInactive', name: 'Guide to Peaceful Coexistence (Inactive)' },
      { id: 5656, internalName: 'HeroicisHead', name: "Heroicis' Hat" },
      { id: 5657, internalName: 'HeroicisBody', name: "Heroicis' Coat" },
      { id: 5658, internalName: 'HeroicisLegs', name: "Heroicis' Pants" },
      { id: 3353, internalName: 'MinecartMech', name: 'Mechanical Cart' },
      { id: 3885, internalName: 'GoldenChest', name: 'Golden Chest' },
      { id: 4067, internalName: 'FishMinecart', name: 'Minecarp' },
      { id: 4917, internalName: 'TeleportationPylonUnderground', name: 'Cavern Pylon' },
      { id: 6142, internalName: 'PalworldChilletEgg', name: 'Huge Dragon Egg' },
      { id: 6143, internalName: 'PalworldPetChilletIgnis', name: 'Chillet Ignis' },
      { id: 1706, internalName: 'GoldenSink', name: 'Golden Sink' },
      { id: 2100, internalName: 'TwinMask', name: 'Twin Mask' },
      { id: 3329, internalName: 'TwinsBossBag', name: 'Treasure Bag (The Twins)' },
      { id: 3868, internalName: 'TwinsMasterTrophy', name: 'Twins Relic' },
      { id: 5290, internalName: 'ChippysHead', name: "Chippy's Helmet" },
      { id: 5291, internalName: 'ChippysBody', name: "Chippy's Chestplate" },
      { id: 5292, internalName: 'ChippysLegs', name: "Chippy's Greaves" },
      { id: 5293, internalName: 'ChippysHeadband', name: "Chippy's Headband" },
      { id: 5294, internalName: 'ChippysWingsInactive', name: "Chippy's Cloak (Inactive)" },
      { id: 2945, internalName: 'MartianBrainscramblerBanner', name: 'Martian Brain Scrambler Banner' },
      { id: 2948, internalName: 'MartianGigazapperBanner', name: 'Martian Gigazapper Banner' },
      { id: 2949, internalName: 'MartianGreyGruntBanner', name: 'Martian Gray Grunt Banner' },
      { id: 2951, internalName: 'MartianRaygunnerBanner', name: 'Martian Ray Gunner Banner' },
      { id: 2952, internalName: 'MartianScutlixGunnerBanner', name: 'Martian Scutlix Gunner Banner' },
      { id: 2953, internalName: 'MartianTeslaTurretBanner', name: 'Martian Tesla Turret Banner' },
      { id: 2963, internalName: 'PresentMimicBanner', name: 'Present Mimic Banner' }
    ]
  }));
  fs.writeFileSync(npcsPath, JSON.stringify({
    records: [
      { id: 85, internalName: 'Mimic', name: 'Mimic', boss: false },
      { id: 54, internalName: 'Clothier', name: 'Clothier', boss: false },
      { id: 19, internalName: 'ArmsDealer', name: 'Arms Dealer', boss: false },
      { id: 228, internalName: 'WitchDoctor', name: 'Witch Doctor', boss: false },
      { id: 370, internalName: 'DukeFishron', name: 'Duke Fishron', boss: true },
      { id: 78, internalName: 'Mummy', name: 'Mummy', boss: false },
      { id: 79, internalName: 'DarkMummy', name: 'Dark Mummy', boss: false },
      { id: 80, internalName: 'LightMummy', name: 'Light Mummy', boss: false },
      { id: 630, internalName: 'BloodMummy', name: 'Blood Mummy', boss: false },
      { id: -14, internalName: 'BigBoned', name: 'Angry Bones', boss: false },
      { id: 34, internalName: 'CursedSkull', name: 'Cursed Skull', boss: false },
      { id: 32, internalName: 'DarkCaster', name: 'Dark Caster', boss: false },
      { id: 693, internalName: 'LibrarianSkeleton', name: 'Librarian Skeleton', boss: false },
      { id: 222, internalName: 'QueenBee', name: 'Queen Bee', boss: true },
      { id: 17, internalName: 'Merchant', name: 'Merchant', boss: false },
      { id: 20, internalName: 'Dryad', name: 'Dryad', boss: false },
      { id: 108, internalName: 'Wizard', name: 'Wizard', boss: false },
      { id: 691, internalName: 'MossZombie', name: 'Moss Zombie', boss: false },
      { id: 369, internalName: 'Angler', name: 'Angler', boss: false },
      { id: 178, internalName: 'Steampunker', name: 'Steampunker', boss: false },
      { id: 229, internalName: 'PirateShip', name: 'Pirates', boss: false },
      { id: 453, internalName: 'SkeletonMerchant', name: 'Skeleton Merchant', boss: false },
      { id: 368, internalName: 'TravelingMerchant', name: 'Traveling Merchant', boss: false },
      { id: 1, internalName: 'BlueSlime', name: 'Blue Slime', boss: false },
      { id: 4, internalName: 'EyeofCthulhu', name: 'Eye of Cthulhu', boss: true },
      { id: 35, internalName: 'SkeletronHead', name: 'Skeletron', boss: true },
      { id: 344, internalName: 'Everscream', name: 'Everscream', boss: true },
      { id: 590, internalName: 'TorchZombie', name: 'Zombie', imageFileTitle: 'Torch Zombie.gif', boss: false },
      { id: 591, internalName: 'ArmedTorchZombie', name: 'Zombie', imageFileTitle: 'Armed Torch Zombie.gif', boss: false },
      { id: 624, internalName: 'Gnome', name: 'Gnome', boss: false },
      { id: 102, internalName: 'AnglerFish', name: 'Angler Fish', boss: false },
      { id: 49, internalName: 'CaveBat', name: 'Cave Bat', boss: false },
      { id: 551, internalName: 'DD2Betsy', name: 'Betsy', boss: true },
      { id: 303, internalName: 'BunnySlimed', name: 'Bunny', boss: false },
      { id: 46, internalName: 'Bunny', name: 'Bunny', boss: false },
      { id: 190, internalName: 'CataractEye', name: 'Demon Eye', boss: false },
      { id: 2, internalName: 'DemonEye', name: 'Demon Eye', boss: false },
      { id: 381, internalName: 'BrainScrambler', name: 'Brain Scrambler', imageFileTitle: 'Brain Scrambler.gif', boss: false },
      { id: 382, internalName: 'RayGunner', name: 'Ray Gunner', imageFileTitle: 'Ray Gunner.gif', boss: false },
      { id: 385, internalName: 'GrayGrunt', name: 'Gray Grunt', imageFileTitle: 'Gray Grunt.gif', boss: false },
      { id: 387, internalName: 'MartianTurret', name: 'Tesla Turret', imageFileTitle: 'Tesla Turret.gif', boss: false },
      { id: 389, internalName: 'GigaZapper', name: 'Gigazapper', imageFileTitle: 'Gigazapper.gif', boss: false },
      { id: 390, internalName: 'ScutlixRider', name: 'Scutlix Gunner', imageFileTitle: 'Scutlix Gunner.png', boss: false },
      { id: 341, internalName: 'PresentMimic', name: 'Present Mimic', imageFileTitle: 'Present Mimic.png', boss: false },
      { id: 379, internalName: 'CultistArcherBlue', name: 'Cultist Archer', imageFileTitle: 'Cultist Archer.gif', boss: false },
      { id: 380, internalName: 'CultistArcherWhite', name: 'Cultist Archer', imageFileTitle: 'White Cultist Archer.gif', boss: false }
    ]
  }));
  return { root, rawDir, sourcesDir, itemsPath, npcsPath };
}

test('parseBuildItemSourceCandidateImportPlanArgs rejects mutation flags', () => {
  for (const flag of ['--apply', '--apply=true', '--write-db', '--sync', '--import', '--materialize']) {
    assert.throws(
      () => parseBuildItemSourceCandidateImportPlanArgs([flag]),
      /read-only import plan refuses mutation flag/
    );
  }
});

test('parseBuildItemSourceCandidateImportPlanArgs accepts promotion scope', () => {
  assert.equal(parseBuildItemSourceCandidateImportPlanArgs(['--promotion-scope=family']).promotionScope, 'family');
  assert.equal(parseBuildItemSourceCandidateImportPlanArgs(['--promotion-scope=polluted']).promotionScope, 'polluted');
  assert.equal(parseBuildItemSourceCandidateImportPlanArgs(['--promotion-scope=all']).promotionScope, 'all');
});

test('buildItemSourceCandidateImportPlan marks MagicMirror as eligible canary', () => {
  const fixture = createFixture();

  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { high_confidence: 1 },
      candidates: [{
        itemInternalName: 'MagicMirror',
        itemName: 'Magic Mirror',
        pageTitle: 'Magic Mirrors',
        rawPath: path.join(fixture.rawDir, 'magicmirror.latest.json'),
        rawSourceCount: 5,
        standardizedSourceCount: 0,
        classification: 'high_confidence',
        sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
        extractedSources: [
          { sourceType: 'container', sourceRefType: 'container', sourceRefName: 'Gold Chest', quantityText: '1', chanceText: '1/6 (16.67%)', conditions: 'Underground', notes: null },
          { sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Mimics', quantityText: '1', chanceText: '16.67%', conditions: null, notes: null },
          { sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Mimic', quantityText: '1', chanceText: '16.67%', conditions: null, notes: null },
          { sourceType: 'container', sourceRefType: 'container', sourceRefName: 'Frozen Chest', quantityText: '1', chanceText: '1/5 (20%)', conditions: null, notes: null },
          { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Magic Mirrors worldgen', quantityText: null, chanceText: null, conditions: 'generated in Chests', notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.readOnly, true);
  assert.equal(plan.mode, 'candidate_import_plan');
  assert.equal(plan.summary.eligibleCandidates, 1);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.equal(plan.summary.plannedSourceRows, 5);
  assert.deepEqual(
    plan.eligibleCandidates[0].plannedSources.map((row) => [row.sourceRefName, row.sourceRefType, row.resolutionStatus]),
    [
      ['Gold Chest', 'container', 'resolved_item_ref'],
      ['Mimics', 'npc', 'resolved_npc_ref'],
      ['Mimic', 'npc', 'resolved_npc_ref'],
      ['Frozen Chest', 'container', 'resolved_item_ref'],
      ['Magic Mirrors worldgen', 'world', 'world_text_ref']
    ]
  );
});

test('buildItemSourceCandidateImportPlan cleans duplicate vendor tail rows', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { high_confidence: 1 },
      candidates: [{
        itemInternalName: 'ClownHat',
        itemName: 'Clown Hat',
        pageTitle: 'Clown set',
        rawPath: path.join(fixture.rawDir, 'clownhat.latest.json'),
        rawSourceCount: 2,
        standardizedSourceCount: 0,
        classification: 'high_confidence',
        sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
        extractedSources: [
          { sourceType: 'shop', sourceRefType: 'npc', sourceRefName: 'Clothier', quantityText: null, chanceText: null, conditions: null, notes: null },
          { sourceType: 'shop', sourceRefType: 'npc', sourceRefName: 'Clothier for', quantityText: null, chanceText: null, conditions: null, notes: 'Sold by the Clothier for 3 gold.' }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 1);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.equal(plan.summary.plannedSourceRows, 1);
  assert.deepEqual(
    plan.eligibleCandidates[0].plannedSources.map((row) => [row.sourceType, row.sourceRefType, row.sourceRefName, row.resolutionStatus, row.notes]),
    [['shop', 'npc', 'Clothier', 'resolved_npc_ref', 'Sold by the Clothier for 3 gold.']]
  );
});

test('buildItemSourceCandidateImportPlan drops covered composite vendor rows', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { high_confidence: 1 },
      candidates: [{
        itemInternalName: 'StyngerBolt',
        itemName: 'Stynger Bolt',
        pageTitle: 'Stynger',
        rawPath: path.join(fixture.rawDir, 'styngerbolt.latest.json'),
        rawSourceCount: 3,
        standardizedSourceCount: 0,
        classification: 'high_confidence',
        sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
        extractedSources: [
          { sourceType: 'shop', sourceRefType: 'npc', sourceRefName: 'Arms Dealer', quantityText: '60-99', chanceText: null, conditions: null, notes: null },
          { sourceType: 'shop', sourceRefType: 'npc', sourceRefName: 'Witch Doctor', quantityText: '60-99', chanceText: null, conditions: null, notes: null },
          { sourceType: 'shop', sourceRefType: 'npc', sourceRefName: 'Witch Doctor and Arms Dealer', quantityText: '60-99', chanceText: null, conditions: null, notes: 'Sold if the player has a Stynger.' }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 1);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.equal(plan.summary.plannedSourceRows, 2);
  assert.deepEqual(
    plan.eligibleCandidates[0].plannedSources.map((row) => [row.sourceRefName, row.notes]),
    [
      ['Arms Dealer', 'Sold if the player has a Stynger.'],
      ['Witch Doctor', 'Sold if the player has a Stynger.']
    ]
  );
});

test('buildItemSourceCandidateImportPlan blocks non-allowlisted family page candidates', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { family_page_candidate: 1 },
      candidates: [{
        itemInternalName: 'MagicMirror',
        itemName: 'Magic Mirror',
        pageTitle: 'Unreviewed Decorations',
        rawPath: path.join(fixture.rawDir, 'unreviewed-decorations.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'family_page_candidate',
        sourceRevisionTimestamp: '2026-05-14T05:44:56Z',
        extractedSources: [
          { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Unreviewed Decorations worldgen', quantityText: null, chanceText: null, conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 0);
  assert.equal(plan.summary.blockedCandidates, 1);
  assert.equal(plan.blockedCandidates[0].itemInternalName, 'MagicMirror');
  assert.equal(plan.blockedCandidates[0].blockedReason, 'family_page_candidate');
});

test('buildItemSourceCandidateImportPlan promotes allowlisted shared-worldgen family pages only', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 2,
      classificationCounts: { family_page_candidate: 2 },
      candidates: [{
        itemInternalName: 'AetheriumBookcase',
        itemName: 'Aetherium Bookcase',
        pageTitle: 'Bookcases',
        rawPath: path.join(fixture.rawDir, 'aetheriumbookcase.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'family_page_candidate',
        sourceRevisionTimestamp: '2026-05-14T05:44:56Z',
        extractedSources: [
          { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Bookcases worldgen', quantityText: null, chanceText: null, conditions: 'generated in Underground Cabins', notes: null }
        ]
      }, {
        itemInternalName: 'MagicMirror',
        itemName: 'Magic Mirror',
        pageTitle: 'Unreviewed Decorations',
        rawPath: path.join(fixture.rawDir, 'unreviewed-decorations.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'family_page_candidate',
        sourceRevisionTimestamp: '2026-05-14T05:44:56Z',
        extractedSources: [
          { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Unreviewed Decorations worldgen', quantityText: null, chanceText: null, conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 1);
  assert.equal(plan.summary.blockedCandidates, 1);
  assert.equal(plan.eligibleCandidates[0].itemInternalName, 'AetheriumBookcase');
  assert.equal(plan.eligibleCandidates[0].plannedSources[0].sourceRefType, 'world');
  assert.equal(plan.blockedCandidates[0].pageTitle, 'Unreviewed Decorations');
  assert.equal(plan.blockedCandidates[0].blockedReason, 'family_page_candidate');
});

test('buildItemSourceCandidateImportPlan maps Goodie Bag polluted unknown source to item-backed source', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { polluted_candidate: 1 },
      candidates: [{
        itemInternalName: 'CatMask',
        itemName: 'Cat Mask',
        pageTitle: 'Cat set',
        rawPath: path.join(fixture.rawDir, 'catmask.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'polluted_candidate',
        sourceRevisionTimestamp: '2026-05-14T05:44:56Z',
        extractedSources: [
          { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Goodie Bag', quantityText: null, chanceText: null, conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 1);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.equal(plan.eligibleCandidates[0].plannedSources[0].sourceRefType, 'item');
  assert.equal(plan.eligibleCandidates[0].plannedSources[0].sourceRefName, 'Goodie Bag');
  assert.equal(plan.eligibleCandidates[0].plannedSources[0].resolutionStatus, 'resolved_item_ref');
});

test('buildItemSourceCandidateImportPlan does not map Goodie Bag unknown source outside allowed polluted pages', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { high_confidence: 1 },
      candidates: [{
        itemInternalName: 'CatMask',
        itemName: 'Cat Mask',
        pageTitle: 'Unexpected Goodie Source',
        rawPath: path.join(fixture.rawDir, 'unexpected-goodie.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'high_confidence',
        sourceRevisionTimestamp: '2026-05-14T05:44:56Z',
        extractedSources: [
          { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Goodie Bag', quantityText: null, chanceText: null, conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 0);
  assert.equal(plan.summary.blockedCandidates, 1);
  assert.equal(plan.blockedCandidates[0].blockedSources[0].blockedReason, 'unknown_source_contract');
});

test('buildItemSourceCandidateImportPlan maps Shucked Oyster unknown Oyster source to item-backed source', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { polluted_candidate: 1 },
      candidates: [{
        itemInternalName: 'ShuckedOyster',
        itemName: 'Shucked Oyster',
        pageTitle: 'Shucked Oyster',
        rawPath: path.join(fixture.rawDir, 'shuckedoyster.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'polluted_candidate',
        sourceRevisionTimestamp: '2026-03-29T04:32:14Z',
        extractedSources: [
          { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Oyster', quantityText: '1', chanceText: '100%', conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 1);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    plan.eligibleCandidates[0].plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.quantityText, source.chanceText, source.resolutionStatus]),
    [['drop', 'item', 'Oyster', '1', '100%', 'resolved_item_ref']]
  );
});

test('buildItemSourceCandidateImportPlan does not map unknown Oyster source outside Shucked Oyster page', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { high_confidence: 1 },
      candidates: [{
        itemInternalName: 'MagicMirror',
        itemName: 'Magic Mirror',
        pageTitle: 'Unexpected Oyster Source',
        rawPath: path.join(fixture.rawDir, 'unexpected-oyster.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'high_confidence',
        sourceRevisionTimestamp: '2026-05-14T05:44:56Z',
        extractedSources: [
          { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Oyster', quantityText: '1', chanceText: '100%', conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 0);
  assert.equal(plan.summary.blockedCandidates, 1);
  assert.equal(plan.blockedCandidates[0].blockedSources[0].blockedReason, 'unknown_source_contract');
});

test('buildItemSourceCandidateImportPlan keeps Witch set Goodie Bag source and drops Vampirism worldgen noise', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { polluted_candidate: 1 },
      candidates: [{
        itemInternalName: 'WitchHat',
        itemName: 'Witch Hat',
        pageTitle: 'Witch set',
        rawPath: path.join(fixture.rawDir, 'witchhat.latest.json'),
        rawSourceCount: 2,
        standardizedSourceCount: 0,
        classification: 'polluted_candidate',
        sourceRevisionTimestamp: '2026-05-23T16:47:45Z',
        extractedSources: [
          { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Goodie Bag', quantityText: '1', chanceText: '3.51%', conditions: null, notes: null },
          { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Witch set worldgen', quantityText: null, chanceText: null, conditions: 'It may also be found in chests in Vampirism worlds.', notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 1);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    plan.eligibleCandidates[0].plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.chanceText, source.resolutionStatus]),
    [['drop', 'item', 'Goodie Bag', '3.51%', 'resolved_item_ref']]
  );
});

test('buildItemSourceCandidateImportPlan expands Mummy set group source to explicit NPC rows', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { polluted_candidate: 1 },
      candidates: [{
        itemInternalName: 'MummyMask',
        itemName: 'Mummy Mask',
        pageTitle: 'Mummy set',
        rawPath: path.join(fixture.rawDir, 'mummymask.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'polluted_candidate',
        sourceRevisionTimestamp: '2023-10-24T00:43:54Z',
        extractedSources: [
          { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Mummies', quantityText: '1', chanceText: '1.33%', conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 1);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    plan.eligibleCandidates[0].plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.quantityText, source.chanceText, source.resolutionStatus]),
    [
      ['drop', 'npc', 'Blood Mummy', '1', '1.33%', 'resolved_npc_ref'],
      ['drop', 'npc', 'Dark Mummy', '1', '1.33%', 'resolved_npc_ref'],
      ['drop', 'npc', 'Light Mummy', '1', '1.33%', 'resolved_npc_ref'],
      ['drop', 'npc', 'Mummy', '1', '1.33%', 'resolved_npc_ref']
    ]
  );
});

test('buildItemSourceCandidateImportPlan does not expand Mummies group source outside Mummy set page', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { high_confidence: 1 },
      candidates: [{
        itemInternalName: 'MagicMirror',
        itemName: 'Magic Mirror',
        pageTitle: 'Unexpected Mummies Source',
        rawPath: path.join(fixture.rawDir, 'unexpected-mummies.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'high_confidence',
        sourceRevisionTimestamp: '2023-10-24T00:43:54Z',
        extractedSources: [
          { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Mummies', quantityText: '1', chanceText: '1.33%', conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 0);
  assert.equal(plan.summary.blockedCandidates, 1);
  assert.equal(plan.blockedCandidates[0].blockedSources[0].blockedReason, 'unknown_source_contract');
});

test('buildItemSourceCandidateImportPlan keeps polluted candidates blocked in family-only promotion scope', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    promotionScope: 'family',
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { polluted_candidate: 1 },
      candidates: [{
        itemInternalName: 'CatMask',
        itemName: 'Cat Mask',
        pageTitle: 'Cat set',
        rawPath: path.join(fixture.rawDir, 'catmask.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'polluted_candidate',
        sourceRevisionTimestamp: '2026-05-14T05:44:56Z',
        extractedSources: [
          { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Goodie Bag', quantityText: null, chanceText: null, conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 0);
  assert.equal(plan.summary.blockedCandidates, 1);
  assert.equal(plan.blockedCandidates[0].blockedReason, 'polluted_candidate');
});

test('buildItemSourceCandidateImportPlan keeps Flairon boss and treasure bag rows while treating Expert Mode as condition text', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { polluted_candidate: 1 },
      candidates: [{
        itemInternalName: 'Flairon',
        itemName: 'Flairoon',
        pageTitle: 'Flairon',
        rawPath: path.join(fixture.rawDir, 'flairon.latest.json'),
        rawSourceCount: 3,
        standardizedSourceCount: 0,
        classification: 'polluted_candidate',
        sourceRevisionTimestamp: '2026-05-14T05:44:56Z',
        extractedSources: [
          { sourceType: 'drop', sourceRefType: 'boss', sourceRefName: 'Duke Fishron', quantityText: '1', chanceText: '20%', conditions: null, notes: null },
          { sourceType: 'treasure_bag', sourceRefType: 'treasure_bag', sourceRefName: 'Treasure Bag (Duke Fishron)', quantityText: '1', chanceText: '33%', conditions: null, notes: null },
          { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Expert Mode', quantityText: null, chanceText: null, conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 1);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    plan.eligibleCandidates[0].plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.conditions, source.resolutionStatus]),
    [
      ['drop', 'boss', 'Duke Fishron', null, 'resolved_boss_ref'],
      ['treasure_bag', 'treasure_bag', 'Treasure Bag (Duke Fishron)', 'Expert Mode', 'resolved_item_ref']
    ]
  );
});

test('buildItemSourceCandidateImportPlan blocks Flairon when extra resolved sources are present', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { polluted_candidate: 1 },
      candidates: [{
        itemInternalName: 'Flairon',
        itemName: 'Flairoon',
        pageTitle: 'Flairon',
        rawPath: path.join(fixture.rawDir, 'flairon.latest.json'),
        rawSourceCount: 4,
        standardizedSourceCount: 0,
        classification: 'polluted_candidate',
        sourceRevisionTimestamp: '2026-05-14T05:44:56Z',
        extractedSources: [
          { sourceType: 'drop', sourceRefType: 'boss', sourceRefName: 'Duke Fishron', quantityText: '1', chanceText: '20%', conditions: null, notes: null },
          { sourceType: 'treasure_bag', sourceRefType: 'treasure_bag', sourceRefName: 'Treasure Bag (Duke Fishron)', quantityText: '1', chanceText: '33%', conditions: null, notes: null },
          { sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Mimic', quantityText: '1', chanceText: '1%', conditions: null, notes: null },
          { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Expert Mode', quantityText: null, chanceText: null, conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 0);
  assert.equal(plan.summary.blockedCandidates, 1);
  assert.equal(plan.blockedCandidates[0].blockedReason, 'polluted_candidate');
});

test('buildItemSourceCandidateImportPlan promotes block-placing wand rows by section title only', () => {
  const fixture = createFixture();
  const commonSources = [
    { sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Angry Bones', quantityText: '1', chanceText: '0.4%', conditions: null, notes: null, sourceSectionTitle: 'Bone Wand', sourceRowText: 'Angry Bones 1 0.4%' },
    { sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Cursed Skull', quantityText: '1', chanceText: '0.4%', conditions: null, notes: null, sourceSectionTitle: 'Bone Wand', sourceRowText: 'Cursed Skull 1 0.4%' },
    { sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Dark Caster', quantityText: '1', chanceText: '0.4%', conditions: null, notes: null, sourceSectionTitle: 'Bone Wand', sourceRowText: 'Dark Caster 1 0.4%' },
    { sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Librarian Skeleton', quantityText: '1', chanceText: '0.4%', conditions: null, notes: null, sourceSectionTitle: 'Bone Wand', sourceRowText: 'Librarian Skeleton 1 0.4%' },
    { sourceType: 'drop', sourceRefType: 'boss', sourceRefName: 'Queen Bee', quantityText: '1', chanceText: '33%', conditions: null, notes: null, sourceSectionTitle: 'Hive Wand', sourceRowText: 'Queen Bee 1 33%' },
    { sourceType: 'treasure_bag', sourceRefType: 'treasure_bag', sourceRefName: 'Treasure Bag (Queen Bee)', quantityText: '1', chanceText: '100%', conditions: null, notes: null, sourceSectionTitle: 'Hive Wand', sourceRowText: 'Treasure Bag (Queen Bee) 1 100%' },
    { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Forest tree', quantityText: '1', chanceText: '0.3333%', conditions: null, notes: null, sourceSectionTitle: 'Living Wood Wand', sourceRowText: 'Forest tree Shaking 1 0.3333%' },
    { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Shaking', quantityText: '1', chanceText: '0.3333%', conditions: null, notes: null, sourceSectionTitle: 'Living Wood Wand', sourceRowText: 'Forest tree Shaking 1 0.3333%' },
    { sourceType: 'container', sourceRefType: 'container', sourceRefName: 'Ivy Chest', quantityText: '1', chanceText: '1/6 (16.67%)', conditions: null, notes: null, sourceSectionTitle: 'Living Mahogany Wand', sourceRowText: 'Ivy Chest 1 1/6 (16.67%)' },
    { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Mahogany tree', quantityText: '1', chanceText: '0.5%', conditions: null, notes: null, sourceSectionTitle: 'Living Mahogany Wand', sourceRowText: 'Mahogany tree Shaking 1 0.5%' },
    { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Shaking', quantityText: '1', chanceText: '0.5%', conditions: null, notes: null, sourceSectionTitle: 'Living Mahogany Wand', sourceRowText: 'Mahogany tree Shaking 1 0.5%' }
  ];
  const candidates = [
    { itemInternalName: 'BoneWand', itemName: 'Bone Wand' },
    { itemInternalName: 'HiveWand', itemName: 'Hive Wand' },
    { itemInternalName: 'LivingWoodWand', itemName: 'Living Wood Wand' },
    { itemInternalName: 'LivingMahoganyWand', itemName: 'Living Mahogany Wand' }
  ].map((candidate) => ({
    ...candidate,
    pageTitle: 'Block-placing wands',
    rawPath: path.join(fixture.rawDir, `${candidate.itemInternalName}.latest.json`),
    rawSourceCount: commonSources.length,
    standardizedSourceCount: 0,
    classification: 'polluted_candidate',
    sourceRevisionTimestamp: '2026-04-20T15:01:42Z',
    extractedSources: commonSources
  }));

  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: candidates.length,
      classificationCounts: { polluted_candidate: candidates.length },
      candidates
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 4);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    Object.fromEntries(plan.eligibleCandidates.map((candidate) => [
      candidate.itemInternalName,
      candidate.plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.chanceText, source.conditions, source.sourceSectionTitle, source.resolutionStatus])
    ])),
    {
      BoneWand: [
        ['drop', 'npc', 'Angry Bones', '0.4%', null, 'Bone Wand', 'resolved_npc_ref'],
        ['drop', 'npc', 'Cursed Skull', '0.4%', null, 'Bone Wand', 'resolved_npc_ref'],
        ['drop', 'npc', 'Dark Caster', '0.4%', null, 'Bone Wand', 'resolved_npc_ref'],
        ['drop', 'npc', 'Librarian Skeleton', '0.4%', null, 'Bone Wand', 'resolved_npc_ref']
      ],
      HiveWand: [
        ['drop', 'boss', 'Queen Bee', '33%', null, 'Hive Wand', 'resolved_boss_ref'],
        ['treasure_bag', 'treasure_bag', 'Treasure Bag (Queen Bee)', '100%', null, 'Hive Wand', 'resolved_item_ref']
      ],
      LivingWoodWand: [
        ['drop', 'world', 'Forest tree', '0.3333%', 'Shaking', 'Living Wood Wand', 'world_text_ref']
      ],
      LivingMahoganyWand: [
        ['container', 'container', 'Ivy Chest', '1/6 (16.67%)', null, 'Living Mahogany Wand', 'resolved_item_ref'],
        ['drop', 'world', 'Mahogany tree', '0.5%', 'Shaking', 'Living Mahogany Wand', 'world_text_ref']
      ]
    }
  );
});

test('buildItemSourceCandidateImportPlan promotes torches by exact recipe or type-row evidence only', () => {
  const fixture = createFixture();
  const commonDropSources = [
    { sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Blue Slime', quantityText: '5-10', chanceText: '0.31%', conditions: null, notes: null, sourceRowText: 'Blue Slime Bonus drop 5-10 0.31%' },
    { sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Armed Torch Zombie', quantityText: '5-20', chanceText: '100%', conditions: null, notes: null, sourceRowText: 'Zombie (Armed Torch Zombie) 5-20 100%' },
    { sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Torch Zombie', quantityText: '5-20', chanceText: '100%', conditions: null, notes: null, sourceRowText: 'Zombie (Torch Zombie) 5-20 100%' },
    { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Bonus drop', quantityText: '5-10', chanceText: '0.31%', conditions: null, notes: null, sourceRowText: 'Blue Slime Bonus drop 5-10 0.31%' },
    { sourceType: 'shop', sourceRefType: 'npc', sourceRefName: 'Merchant or Skeleton Merchant for', quantityText: null, chanceText: null, conditions: null, notes: 'Regular Torches can be purchased from the Merchant or Skeleton Merchant for 50 Copper Coins each.' },
    { sourceType: 'shop', sourceRefType: 'npc', sourceRefName: 'Skeleton Merchant', sourceTargetItemName: 'Bone Torch', quantityText: null, chanceText: null, conditions: 'first half of every second', notes: 'Sold by the Skeleton Merchant for 1 Silver Coin each during the first half of every second.' },
    { sourceType: 'shop', sourceRefType: 'npc', sourceRefName: 'Traveling Merchant', sourceTargetItemName: 'Ultrabright Torch', quantityText: null, chanceText: null, conditions: 'random shop stock', notes: 'Sold randomly by the Traveling Merchant for 3 Silver Coins each.' }
  ];
  const extractedRecipes = [
    { resultName: 'Blue Torch', resultQuantity: 10, ingredients: [{ ingredientName: 'Torch', ingredientGroupType: 'item', quantityText: '10' }, { ingredientName: 'Sapphire', ingredientGroupType: 'item', quantityText: null }], stations: [] },
    { resultName: 'Torch', resultQuantity: 3, ingredients: [{ ingredientName: 'Gel', ingredientGroupType: 'item', quantityText: null }, { ingredientName: 'Any Wood', ingredientGroupType: 'group', quantityText: null }], stations: [] },
    { resultName: 'Aether Torch', resultQuantity: 1, recipeKind: 'shimmer', ingredients: [{ ingredientName: 'Any Torch', ingredientGroupType: 'group', quantityText: null }], stations: [] },
    { resultName: 'Rope Coil', resultQuantity: 1, ingredients: [{ ingredientName: 'Rope', ingredientGroupType: 'item', quantityText: '10' }], stations: [] }
  ];
  const candidates = [
    { itemInternalName: 'Torch', itemName: 'Torch' },
    { itemInternalName: 'BlueTorch', itemName: 'Blue Torch' },
    { itemInternalName: 'BoneTorch', itemName: 'Bone Torch' },
    { itemInternalName: 'ShimmerTorch', itemName: 'Aether Torch' },
    { itemInternalName: 'UltrabrightTorch', itemName: 'Ultrabright Torch' }
  ].map((candidate) => ({
    ...candidate,
    pageTitle: 'Torches',
    rawPath: path.join(fixture.rawDir, `${candidate.itemInternalName}.latest.json`),
    rawSourceCount: commonDropSources.length,
    standardizedSourceCount: 0,
    classification: 'polluted_candidate',
    sourceRevisionTimestamp: '2026-05-22T20:22:49Z',
    extractedSources: commonDropSources,
    extractedRecipes
  }));

  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: candidates.length,
      classificationCounts: { polluted_candidate: candidates.length },
      candidates
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 5);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    Object.fromEntries(plan.eligibleCandidates.map((candidate) => [
      candidate.itemInternalName,
      candidate.plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.quantityText, source.conditions, source.resolutionStatus])
    ])),
    {
      Torch: [
        ['drop', 'npc', 'Blue Slime', '5-10', null, 'resolved_npc_ref'],
        ['drop', 'npc', 'Armed Torch Zombie', '5-20', null, 'resolved_npc_ref'],
        ['drop', 'npc', 'Torch Zombie', '5-20', null, 'resolved_npc_ref'],
        ['shop', 'npc', 'Merchant', null, null, 'resolved_npc_ref'],
        ['shop', 'npc', 'Skeleton Merchant', null, null, 'resolved_npc_ref'],
        ['craft', 'item', 'Gel', '3', 'Crafted by hand', 'resolved_item_ref'],
        ['craft', 'world', 'Any Wood', '3', 'Crafted by hand', 'world_text_ref']
      ],
      BlueTorch: [
        ['craft', 'item', 'Torch', '10', 'Crafted by hand', 'resolved_item_ref'],
        ['craft', 'item', 'Sapphire', '10', 'Crafted by hand', 'resolved_item_ref']
      ],
      BoneTorch: [
        ['shop', 'npc', 'Skeleton Merchant', null, 'first half of every second', 'resolved_npc_ref']
      ],
      ShimmerTorch: [
        ['shimmer', 'world', 'Any Torch', '1', 'Shimmer transmutation', 'world_text_ref']
      ],
      UltrabrightTorch: [
        ['shop', 'npc', 'Traveling Merchant', null, 'random shop stock', 'resolved_npc_ref']
      ]
    }
  );
});

test('buildItemSourceCandidateImportPlan promotes ropes by exact direct, recipe, and narrative evidence only', () => {
  const fixture = createFixture();
  const commonRopeSources = [
    { sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Blue Slime', quantityText: '20-45', chanceText: '0.31%', conditions: null, notes: null, sourceRowText: 'Blue Slime Bonus drop 20-45 0.31%' },
    { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Bonus drop', quantityText: '20-45', chanceText: '0.31%', conditions: null, notes: null, sourceRowText: 'Blue Slime Bonus drop 20-45 0.31%' },
    { sourceType: 'container', sourceRefType: 'container', sourceRefName: 'Chest', quantityText: '50-100', chanceText: '1/2 (50%)', conditions: null, notes: null, sourceRowText: 'Chest 50-100 1/2 (50%)' },
    { sourceType: 'shop', sourceRefType: 'npc', sourceRefName: 'Merchant or Skeleton Merchant for', quantityText: null, chanceText: null, conditions: null, notes: 'Rope can be purchased from the Merchant and Skeleton Merchant for 10 Copper Coins each.' }
  ];
  const extractedRecipes = [
    { resultName: 'Silk Rope', resultQuantity: 30, ingredients: [{ ingredientName: 'Silk', ingredientGroupType: 'item', quantityText: null }], stations: [{ stationName: 'Loom' }] },
    { resultName: 'Web Rope', resultQuantity: 3, ingredients: [{ ingredientName: 'Cobweb', ingredientGroupType: 'item', quantityText: null }], stations: [] },
    { resultName: 'Rope Coil', resultQuantity: 1, ingredients: [{ ingredientName: 'Rope', ingredientGroupType: 'item', quantityText: '10' }], stations: [] }
  ];
  const candidates = [
    { itemInternalName: 'Rope', itemName: 'Rope' },
    { itemInternalName: 'SilkRope', itemName: 'Silk Rope' },
    { itemInternalName: 'VineRope', itemName: 'Vine Rope' },
    { itemInternalName: 'WebRope', itemName: 'Web Rope' }
  ].map((candidate) => ({
    ...candidate,
    pageTitle: 'Ropes',
    rawPath: path.join(fixture.rawDir, `${candidate.itemInternalName}.latest.json`),
    rawSourceCount: commonRopeSources.length,
    standardizedSourceCount: 0,
    classification: 'polluted_candidate',
    sourceRevisionTimestamp: '2026-03-06T03:49:36Z',
    extractedSources: commonRopeSources,
    extractedRecipes
  }));

  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: candidates.length,
      classificationCounts: { polluted_candidate: candidates.length },
      candidates
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 4);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    Object.fromEntries(plan.eligibleCandidates.map((candidate) => [
      candidate.itemInternalName,
      candidate.plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.quantityText, source.conditions, source.resolutionStatus])
    ])),
    {
      Rope: [
        ['drop', 'npc', 'Blue Slime', '20-45', null, 'resolved_npc_ref'],
        ['container', 'container', 'Chest', '50-100', null, 'resolved_item_ref'],
        ['shop', 'npc', 'Merchant', null, null, 'resolved_npc_ref'],
        ['shop', 'npc', 'Skeleton Merchant', null, null, 'resolved_npc_ref']
      ],
      SilkRope: [
        ['craft', 'item', 'Silk', '30', 'Crafted at Loom', 'resolved_item_ref']
      ],
      VineRope: [
        ['drop', 'world', 'Vines', '1', 'Guide to Plant Fiber Cordage equipped', 'world_text_ref']
      ],
      WebRope: [
        ['craft', 'item', 'Cobweb', '3', 'Crafted by hand', 'resolved_item_ref']
      ]
    }
  );
});

test('buildItemSourceCandidateImportPlan keeps high-risk polluted matrix pages blocked', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 3,
      classificationCounts: { polluted_candidate: 3 },
      candidates: ['Torches', 'Ropes', 'Block-placing wands'].map((pageTitle, index) => ({
        itemInternalName: ['Torch', 'Rope', 'BoneWand'][index],
        itemName: ['Torch', 'Rope', 'Bone Wand'][index],
        pageTitle,
        rawPath: path.join(fixture.rawDir, `${pageTitle}.latest.json`),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'polluted_candidate',
        sourceRevisionTimestamp: '2026-05-14T05:44:56Z',
        extractedSources: [
          { sourceType: 'drop', sourceRefType: 'unknown', sourceRefName: 'Goodie Bag', quantityText: null, chanceText: null, conditions: null, notes: null }
        ]
      }))
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 0);
  assert.equal(plan.summary.blockedCandidates, 3);
  assert.deepEqual(plan.blockedCandidates.map((candidate) => candidate.pageTitle), ['Torches', 'Ropes', 'Block-placing wands']);
});

test('buildItemSourceCandidateImportPlan blocks container-like sources misclassified as NPC', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { high_confidence: 1 },
      candidates: [{
        itemInternalName: 'MagicMirror',
        itemName: 'Magic Mirror',
        pageTitle: 'Magic Mirrors',
        rawPath: path.join(fixture.rawDir, 'magicmirror.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'high_confidence',
        sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
        extractedSources: [{
          sourceType: 'drop',
          sourceRefType: 'npc',
          sourceRefName: 'Gold Chest',
          quantityText: '1',
          chanceText: '1/6 (16.67%)',
          conditions: null,
          notes: null
        }]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 0);
  assert.equal(plan.summary.blockedCandidates, 1);
  assert.equal(plan.summary.blockedSourceRows, 1);
  assert.equal(plan.blockedCandidates[0].blockedSources[0].blockedReason, 'forbidden_npc_container_mapping');
});

test('build item source candidate import plan CLI supports --sample and prints JSON', () => {
  const fixture = createFixture();
  fs.writeFileSync(path.join(fixture.rawDir, 'magicmirror.latest.json'), JSON.stringify({
    itemInternalName: 'MagicMirror',
    itemName: 'Magic Mirror',
    pageTitle: 'Magic Mirrors',
    revisionTimestamp: '2026-04-02T10:40:10Z',
    wikitext: '',
    html: '<p>Magic Mirrors can be found in Chests generated in the Underground and Cavern layers.</p>'
  }));

  const result = spawnSync(process.execPath, [
    'scripts/data/audit/build-item-source-candidate-import-plan.mjs',
    '--raw-dir', fixture.rawDir,
    '--items', fixture.itemsPath,
    '--standardized-npcs', fixture.npcsPath,
    '--npcs', fixture.npcsPath,
    '--item-sources-dir', fixture.sourcesDir,
    '--sample', 'MagicMirror'
  ], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.summary.eligibleCandidates, 1);
  assert.equal(parsed.summary.plannedSourceRows, 1);
});

test('buildItemSourceCandidateBundle emits item_relations_bundle_raw compatible payload', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { high_confidence: 1 },
      candidates: [{
        itemInternalName: 'MagicMirror',
        itemName: 'Magic Mirror',
        pageTitle: 'Magic Mirrors',
        rawPath: path.join(fixture.rawDir, 'magicmirror.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'high_confidence',
        sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
        extractedSources: [
          { sourceType: 'container', sourceRefType: 'container', sourceRefName: 'Gold Chest', quantityText: '1', chanceText: '1/6 (16.67%)', conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  const bundle = buildItemSourceCandidateBundle(plan);

  assert.equal(bundle.source, 'terraria.wiki.gg:item-source-gap-repair');
  assert.equal(bundle.overwriteExisting, false);
  assert.equal(bundle.itemSources.length, 1);
  assert.equal(bundle.itemSources[0].itemInternalName, 'MagicMirror');
  assert.equal(bundle.itemSources[0].sourceRefType, 'container');
  assert.deepEqual(bundle.itemImages, []);
  assert.deepEqual(bundle.recipes, []);
  assert.deepEqual(bundle.itemBiomes, []);
  assert.deepEqual(bundle.snapshots, []);
});

test('build item source candidate import plan CLI writes bundle root when requested', () => {
  const fixture = createFixture();
  const bundleRoot = path.join(fixture.root, 'bundle-root');
  fs.writeFileSync(path.join(fixture.rawDir, 'magicmirror.latest.json'), JSON.stringify({
    itemInternalName: 'MagicMirror',
    itemName: 'Magic Mirror',
    pageTitle: 'Magic Mirrors',
    revisionTimestamp: '2026-04-02T10:40:10Z',
    wikitext: '',
    html: '<p>Magic Mirrors can be found in Chests generated in the Underground and Cavern layers.</p>'
  }));

  const result = spawnSync(process.execPath, [
    'scripts/data/audit/build-item-source-candidate-import-plan.mjs',
    '--raw-dir', fixture.rawDir,
    '--items', fixture.itemsPath,
    '--standardized-npcs', fixture.npcsPath,
    '--npcs', fixture.npcsPath,
    '--item-sources-dir', fixture.sourcesDir,
    '--sample', 'MagicMirror',
    '--bundle-root', bundleRoot
  ], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
  const bundlePath = path.join(bundleRoot, 'normalized', 'item-relations.bundle.json');
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  assert.equal(bundle.itemSources.length, 1);
  assert.equal(bundle.itemSources[0].itemInternalName, 'MagicMirror');
});

test('buildItemSourceCandidateImportPlan promotes local-compat text source contracts', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 3,
      classificationCounts: { high_confidence: 3 },
      candidates: [
        {
          itemInternalName: 'ZephyrFish',
          itemName: 'Zephyr Fish',
          pageTitle: 'Zephyr Fish',
          rawPath: path.join(fixture.rawDir, 'zephyrfish.latest.json'),
          rawSourceCount: 1,
          standardizedSourceCount: 0,
          classification: 'high_confidence',
          sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
          extractedSources: [
            { sourceType: 'fishing', sourceRefType: 'world', sourceRefName: 'Fishing', quantityText: null, chanceText: '2/3125 (0.06%)', conditions: 'rarely caught from fishing in any body of water', notes: null }
          ]
        },
        {
          itemInternalName: 'Goldfish',
          itemName: 'Goldfish',
          pageTitle: 'Goldfish',
          rawPath: path.join(fixture.rawDir, 'goldfish.latest.json'),
          rawSourceCount: 1,
          standardizedSourceCount: 0,
          classification: 'high_confidence',
          sourceRevisionTimestamp: '2026-05-03T02:37:13Z',
          extractedSources: [
            { sourceType: 'capture', sourceRefType: 'world', sourceRefName: 'Bug Net capture', quantityText: null, chanceText: null, conditions: 'caught with a Bug Net', notes: null }
          ]
        },
        {
          itemInternalName: 'EtherianMana',
          itemName: 'Etherian Mana',
          pageTitle: 'Etherian Mana',
          rawPath: path.join(fixture.rawDir, 'etherianmana.latest.json'),
          rawSourceCount: 2,
          standardizedSourceCount: 0,
          classification: 'high_confidence',
          sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
          extractedSources: [
            { sourceType: 'drop', sourceRefType: 'npc_group', sourceRefName: "Old One's Army enemies", quantityText: null, chanceText: null, conditions: "dropped by all of the event's enemies", notes: null },
            { sourceType: 'drop', sourceRefType: 'boss_group', sourceRefName: "Skeletron's Red Hat variant", quantityText: null, chanceText: null, conditions: "dropped by Skeletron's Red Hat variant", notes: null }
          ]
        }
      ]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 3);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    plan.eligibleCandidates.flatMap((candidate) => candidate.plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.resolutionStatus])),
    [
      ['fishing', 'world', 'world_text_ref'],
      ['capture', 'world', 'world_text_ref'],
      ['drop', 'npc_group', 'text_only_ref'],
      ['drop', 'boss_group', 'text_only_ref']
    ]
  );
});

test('buildItemSourceCandidateImportPlan keeps unknown source contracts blocked', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { high_confidence: 1 },
      candidates: [{
        itemInternalName: 'MagicMirror',
        itemName: 'Magic Mirror',
        pageTitle: 'Magic Mirrors',
        rawPath: path.join(fixture.rawDir, 'magicmirror.latest.json'),
        rawSourceCount: 1,
        standardizedSourceCount: 0,
        classification: 'high_confidence',
        sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
        extractedSources: [{
          sourceType: 'unknown',
          sourceRefType: 'unknown',
          sourceRefName: 'review-only transformation',
          quantityText: null,
          chanceText: null,
          conditions: null,
          notes: null
        }]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 0);
  assert.equal(plan.summary.blockedCandidates, 1);
  assert.equal(plan.blockedCandidates[0].blockedSources[0].blockedReason, 'unknown_source_contract');
});

test('buildItemSourceCandidateImportPlan promotes reviewed family event capture and quest pages', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 6,
      classificationCounts: { family_page_candidate: 6 },
      candidates: [
        {
          itemInternalName: 'Tombstone',
          itemName: 'Tombstone',
          pageTitle: 'Tombstones',
          rawPath: path.join(fixture.rawDir, 'tombstone.latest.json'),
          rawSourceCount: 1,
          standardizedSourceCount: 0,
          classification: 'family_page_candidate',
          sourceRevisionTimestamp: '2026-02-22T05:19:23Z',
          extractedSources: [
            { sourceType: 'drop', sourceRefType: 'world', sourceRefName: 'player death', quantityText: null, chanceText: null, conditions: 'drops when a player dies', notes: null }
          ]
        },
        {
          itemInternalName: 'GraveMarker',
          itemName: 'Grave Marker',
          pageTitle: 'Tombstones',
          rawPath: path.join(fixture.rawDir, 'gravemarker.latest.json'),
          rawSourceCount: 1,
          standardizedSourceCount: 0,
          classification: 'family_page_candidate',
          sourceRevisionTimestamp: '2026-02-22T05:19:23Z',
          extractedSources: [
            { sourceType: 'drop', sourceRefType: 'world', sourceRefName: 'player death', quantityText: null, chanceText: null, conditions: 'drops when a player dies', notes: null }
          ]
        },
        {
          itemInternalName: 'MonarchButterfly',
          itemName: 'Monarch Butterfly',
          pageTitle: 'Butterflies',
          rawPath: path.join(fixture.rawDir, 'monarchbutterfly.latest.json'),
          rawSourceCount: 1,
          standardizedSourceCount: 0,
          classification: 'family_page_candidate',
          sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
          extractedSources: [
            { sourceType: 'capture', sourceRefType: 'world', sourceRefName: 'Bug Net capture', quantityText: null, chanceText: null, conditions: 'caught with a Bug Net', notes: null }
          ]
        },
        {
          itemInternalName: 'PurpleEmperorButterfly',
          itemName: 'Purple Emperor Butterfly',
          pageTitle: 'Butterflies',
          rawPath: path.join(fixture.rawDir, 'purpleemperorbutterfly.latest.json'),
          rawSourceCount: 1,
          standardizedSourceCount: 0,
          classification: 'family_page_candidate',
          sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
          extractedSources: [
            { sourceType: 'capture', sourceRefType: 'world', sourceRefName: 'Bug Net capture', quantityText: null, chanceText: null, conditions: 'caught with a Bug Net', notes: null }
          ]
        },
        {
          itemInternalName: 'Batfish',
          itemName: 'Batfish',
          pageTitle: 'Angler/Quests',
          rawPath: path.join(fixture.rawDir, 'batfish.latest.json'),
          rawSourceCount: 1,
          standardizedSourceCount: 0,
          classification: 'family_page_candidate',
          sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
          extractedSources: [
            { sourceType: 'unknown', sourceRefType: 'world', sourceRefName: 'Angler quest fish catch', quantityText: null, chanceText: null, conditions: 'caught as an Angler quest fish', notes: null }
          ]
        },
        {
          itemInternalName: 'BumblebeeTuna',
          itemName: 'Bumblebee Tuna',
          pageTitle: 'Angler/Quests',
          rawPath: path.join(fixture.rawDir, 'bumblebeetuna.latest.json'),
          rawSourceCount: 1,
          standardizedSourceCount: 0,
          classification: 'family_page_candidate',
          sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
          extractedSources: [
            { sourceType: 'unknown', sourceRefType: 'world', sourceRefName: 'Angler quest fish catch', quantityText: null, chanceText: null, conditions: 'caught as an Angler quest fish', notes: null }
          ]
        }
      ]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 6);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    plan.eligibleCandidates.map((candidate) => [
      candidate.itemInternalName,
      candidate.plannedSources[0].sourceType,
      candidate.plannedSources[0].sourceRefType,
      candidate.plannedSources[0].sourceRefName
    ]),
    [
      ['Tombstone', 'drop', 'world', 'player death'],
      ['GraveMarker', 'drop', 'world', 'player death'],
      ['MonarchButterfly', 'capture', 'world', 'Bug Net capture'],
      ['PurpleEmperorButterfly', 'capture', 'world', 'Bug Net capture'],
      ['Batfish', 'quest_reward', 'npc', 'Angler'],
      ['BumblebeeTuna', 'quest_reward', 'npc', 'Angler']
    ]
  );
});

test('buildItemSourceCandidateImportPlan promotes reviewed Logic Gates and Dull Team Blocks', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-13T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 2,
      classificationCounts: { family_page_candidate: 2 },
      candidates: [
        {
          itemInternalName: 'LogicGate_AND',
          itemName: 'Logic Gate (AND)',
          pageTitle: 'Logic Gates',
          rawPath: path.join(fixture.rawDir, 'logicgate-and.latest.json'),
          rawSourceCount: 1,
          standardizedSourceCount: 0,
          classification: 'family_page_candidate',
          sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
          extractedSources: [
            { sourceType: 'shop', sourceRefType: 'npc', sourceRefName: 'Steampunker', quantityText: null, chanceText: null, conditions: null, notes: 'Logic Gates are purchased from the Steampunker.' }
          ]
        },
        {
          itemInternalName: 'TeamBlockRedVariant',
          itemName: 'Dull Red Team Block',
          pageTitle: 'Team Blocks',
          rawPath: path.join(fixture.rawDir, 'teamblockredvariant.latest.json'),
          rawSourceCount: 1,
          standardizedSourceCount: 0,
          classification: 'family_page_candidate',
          sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
          extractedSources: [
            { sourceType: 'shop', sourceRefType: 'npc', sourceRefName: 'Traveling Merchant', quantityText: null, chanceText: null, conditions: null, notes: 'Team Blocks are purchased from the Traveling Merchant and dull variants are transmuted via Shimmer.' }
          ],
          extractedRecipes: [
            {
              resultName: 'Dull Red Team Block',
              resultQuantity: 1,
              ingredients: [
                { ingredientName: 'Red Team Block', ingredientGroupType: 'item' }
              ],
              stations: []
            }
          ]
        }
      ]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 2);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    plan.eligibleCandidates.map((candidate) => [
      candidate.itemInternalName,
      candidate.plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.resolutionStatus])
    ]),
    [
      ['LogicGate_AND', [['shop', 'npc', 'Steampunker', 'resolved_npc_ref']]],
      ['TeamBlockRedVariant', [['shimmer', 'item', 'Red Team Block', 'resolved_item_ref']]]
    ]
  );
});

test('buildItemSourceCandidateImportPlan promotes remaining reviewed family pages with normalized contracts', () => {
  const fixture = createFixture();
  const familyCandidate = (itemInternalName, itemName, pageTitle, extractedSources) => ({
    itemInternalName,
    itemName,
    pageTitle,
    rawPath: path.join(fixture.rawDir, `${itemInternalName.toLowerCase()}.latest.json`),
    rawSourceCount: extractedSources.length,
    standardizedSourceCount: 0,
    classification: 'family_page_candidate',
    sourceRevisionTimestamp: '2026-06-13T00:00:00Z',
    extractedSources
  });
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-13T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 11,
      classificationCounts: { family_page_candidate: 11 },
      candidates: [
        familyCandidate('BlueDragonfly', 'Blue Dragonfly', 'Dragonflies', [
          { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Dragonflies worldgen', conditions: 'found near cattails and caught with a Bug Net' }
        ]),
        familyCandidate('BlackScorpion', 'Black Scorpion', 'Scorpions', [
          { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Scorpions worldgen', conditions: 'found in the Desert and caught with a Bug Net' }
        ]),
        familyCandidate('BlueDungeonVase', 'Blue Dungeon Vase', 'Vases', [
          { sourceType: 'mining', sourceRefType: 'world', sourceRefName: 'Vases vein', conditions: 'found naturally and collected with a pickaxe' }
        ]),
        familyCandidate('LavaMoss', 'Lava Moss', 'Moss', [
          { sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Moss Zombie', conditions: 'dropped by Moss Zombies' },
          { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Moss worldgen', conditions: 'found naturally in the Cavern layer' },
          { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Moss worldgen', conditions: 'duplicate family page sentence' }
        ]),
        familyCandidate('DemonAltar', 'Demon Altar', 'Altars', [
          { sourceType: 'drop', sourceRefType: 'boss', sourceRefName: 'Eye of Cthulhu', conditions: 'noise from ore spawning context' },
          { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Altars worldgen', conditions: 'generated in Corruption or Crimson worlds' }
        ]),
        familyCandidate('CrimsonPlanterBox', 'Deathweed Planter Box', 'Planter Boxes', [
          { sourceType: 'shop', sourceRefType: 'npc', sourceRefName: 'Dryad', conditions: 'sold by the Dryad' }
        ]),
        familyCandidate('MagicShimmerDropper', 'Magic Shimmer Dropper', 'Magic Droppers', [
          { sourceType: 'mining', sourceRefType: 'world', sourceRefName: 'Magic Droppers vein', conditions: 'naturally generated droplets can be mined' }
        ]),
        familyCandidate('SandstoneWallUnsafe', 'Treacherous Sandstone Wall', 'Sandstone Walls', [
          { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Sandstone Walls worldgen', conditions: 'unsafe walls can be found naturally generated' }
        ]),
        familyCandidate('BloodMoonRising', 'Blood Moon Rising', 'Paintings', [
          { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Paintings worldgen', conditions: 'painting family acquisition summary' }
        ]),
        familyCandidate('MusicBoxBoss1', 'Music Box (Boss 1)', 'Music Boxes', [
          { sourceType: 'shop', sourceRefType: 'npc', sourceRefName: 'Wizard', conditions: 'blank Music Box is bought from the Wizard and records music' }
        ]),
        familyCandidate('StarStatue', 'Star Statue', 'Statues', [
          { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Statues worldgen', conditions: 'found placed underground' },
          { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Statues worldgen', conditions: 'decorative statue duplicate sentence' }
        ])
      ]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 11);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    Object.fromEntries(plan.eligibleCandidates.map((candidate) => [
      candidate.itemInternalName,
      candidate.plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.resolutionStatus])
    ])),
    {
      BlueDragonfly: [['capture', 'world', 'Bug Net capture', 'world_text_ref']],
      BlackScorpion: [['capture', 'world', 'Bug Net capture', 'world_text_ref']],
      BlueDungeonVase: [['mining', 'world', 'Vases vein', 'world_text_ref']],
      LavaMoss: [
        ['drop', 'npc', 'Moss Zombie', 'resolved_npc_ref'],
        ['worldgen', 'world', 'Moss worldgen', 'world_text_ref']
      ],
      DemonAltar: [['worldgen', 'world', 'Altars worldgen', 'world_text_ref']],
      CrimsonPlanterBox: [['shop', 'npc', 'Dryad', 'resolved_npc_ref']],
      MagicShimmerDropper: [['mining', 'world', 'Magic Droppers vein', 'world_text_ref']],
      SandstoneWallUnsafe: [['worldgen', 'world', 'Sandstone Walls worldgen', 'world_text_ref']],
      BloodMoonRising: [['worldgen', 'world', 'Paintings worldgen', 'world_text_ref']],
      MusicBoxBoss1: [['transformation', 'item', 'Music Box', 'resolved_item_ref']],
      StarStatue: [['worldgen', 'world', 'Statues worldgen', 'world_text_ref']]
    }
  );
});

test('buildItemSourceCandidateImportPlan promotes reviewed exact family source sets', () => {
  const fixture = createFixture();
  const candidates = [
    {
      itemInternalName: 'WhitePearl',
      itemName: 'White Pearl',
      pageTitle: 'Pearls',
      extractedSources: [
        { sourceType: 'drop', sourceRefType: 'item', sourceRefName: 'Oyster', quantityText: '1', chanceText: null, conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'AnglerHat',
      itemName: 'Angler Hat',
      pageTitle: 'Angler armor',
      extractedSources: [
        { sourceType: 'quest_reward', sourceRefType: 'npc', sourceRefName: 'Angler', quantityText: '1', chanceText: null, conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'SeashellHairpin',
      itemName: 'Seashell Hairpin',
      pageTitle: 'Mermaid set',
      extractedSources: [
        { sourceType: 'quest_reward', sourceRefType: 'npc', sourceRefName: 'Angler', quantityText: '1', chanceText: null, conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'OldShoe',
      itemName: 'Old Shoe',
      pageTitle: 'Junk',
      extractedSources: [
        { sourceType: 'fishing', sourceRefType: 'world', sourceRefName: 'Fishing junk catch', quantityText: '1', chanceText: null, conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'CandyApple',
      itemName: 'Candy Apple',
      pageTitle: 'Heart',
      extractedSources: [
        { sourceType: 'drop', sourceRefType: 'npc_group', sourceRefName: 'slain enemies, pots, and slimes', quantityText: '1', chanceText: null, conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'SoulCake',
      itemName: 'Soul Cake',
      pageTitle: 'Star',
      extractedSources: [
        { sourceType: 'drop', sourceRefType: 'npc_group', sourceRefName: 'any enemy', quantityText: '1', chanceText: null, conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'PottedLavaPlantPalm',
      itemName: 'Potted Magma Palm',
      pageTitle: 'Potted Lava Plants',
      extractedSources: [
        { sourceType: 'crate', sourceRefType: 'crate', sourceRefName: 'Obsidian Crate', quantityText: '1', chanceText: null, conditions: null, notes: null },
        { sourceType: 'crate', sourceRefType: 'crate', sourceRefName: 'Hellstone Crate', quantityText: '1', chanceText: null, conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'LavaFishbowl',
      itemName: 'Lava Serpent Bowl',
      pageTitle: 'Fish Bowls',
      extractedSources: [
        { sourceType: 'crate', sourceRefType: 'crate', sourceRefName: 'Obsidian Crate', quantityText: '1', chanceText: null, conditions: null, notes: null },
        { sourceType: 'crate', sourceRefType: 'crate', sourceRefName: 'Hellstone Crate', quantityText: '1', chanceText: null, conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'GoldenFishingRod',
      itemName: 'Golden Fishing Rod',
      pageTitle: 'Fishing poles',
      extractedSources: [
        { sourceType: 'quest_reward', sourceRefType: 'npc', sourceRefName: 'Angler', quantityText: '1', chanceText: null, conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'HotlineFishingHook',
      itemName: 'Hotline Fishing Hook',
      pageTitle: 'Fishing poles',
      extractedSources: [
        { sourceType: 'fishing', sourceRefType: 'world', sourceRefName: 'Lava fishing', quantityText: '1', chanceText: null, conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'SuperAbsorbantSponge',
      itemName: 'Super Absorbant Sponge',
      pageTitle: 'Sponges',
      extractedSources: [
        { sourceType: 'quest_reward', sourceRefType: 'npc', sourceRefName: 'Angler', quantityText: '1', chanceText: null, conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'LavaAbsorbantSponge',
      itemName: 'Lava Absorbant Sponge',
      pageTitle: 'Sponges',
      extractedSources: [
        { sourceType: 'fishing', sourceRefType: 'world', sourceRefName: 'Lava fishing', quantityText: '1', chanceText: null, conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'BottomlessHoneyBucket',
      itemName: 'Bottomless Honey Bucket',
      pageTitle: 'Bottomless Buckets',
      extractedSources: [
        { sourceType: 'quest_reward', sourceRefType: 'npc', sourceRefName: 'Angler', quantityText: '1', chanceText: null, conditions: null, notes: null }
      ]
    }
  ].map((candidate) => ({
    ...candidate,
    rawPath: path.join(fixture.rawDir, `${candidate.itemInternalName}.latest.json`),
    rawSourceCount: candidate.extractedSources.length,
    standardizedSourceCount: 0,
    classification: 'family_page_candidate',
    sourceRevisionTimestamp: '2026-05-14T05:44:56Z'
  }));

  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: candidates.length,
      classificationCounts: { family_page_candidate: candidates.length },
      candidates
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, candidates.length);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    Object.fromEntries(plan.eligibleCandidates.map((candidate) => [
      candidate.itemInternalName,
      candidate.plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.resolutionStatus])
    ])),
    {
      WhitePearl: [['drop', 'item', 'Oyster', 'resolved_item_ref']],
      AnglerHat: [['quest_reward', 'npc', 'Angler', 'resolved_npc_ref']],
      SeashellHairpin: [['quest_reward', 'npc', 'Angler', 'resolved_npc_ref']],
      OldShoe: [['fishing', 'world', 'Fishing junk catch', 'world_text_ref']],
      CandyApple: [['drop', 'npc_group', 'slain enemies, pots, and slimes', 'text_only_ref']],
      SoulCake: [['drop', 'npc_group', 'any enemy', 'text_only_ref']],
      PottedLavaPlantPalm: [
        ['crate', 'crate', 'Obsidian Crate', 'resolved_item_ref'],
        ['crate', 'crate', 'Hellstone Crate', 'resolved_item_ref']
      ],
      LavaFishbowl: [
        ['crate', 'crate', 'Obsidian Crate', 'resolved_item_ref'],
        ['crate', 'crate', 'Hellstone Crate', 'resolved_item_ref']
      ],
      GoldenFishingRod: [['quest_reward', 'npc', 'Angler', 'resolved_npc_ref']],
      HotlineFishingHook: [['fishing', 'world', 'Lava fishing', 'world_text_ref']],
      SuperAbsorbantSponge: [['quest_reward', 'npc', 'Angler', 'resolved_npc_ref']],
      LavaAbsorbantSponge: [['fishing', 'world', 'Lava fishing', 'world_text_ref']],
      BottomlessHoneyBucket: [['quest_reward', 'npc', 'Angler', 'resolved_npc_ref']]
    }
  );
});

test('buildItemSourceCandidateImportPlan keeps reviewed exact family pages blocked when mixed with unreviewed rows', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 1,
      classificationCounts: { family_page_candidate: 1 },
      candidates: [{
        itemInternalName: 'AnglerHat',
        itemName: 'Angler Hat',
        pageTitle: 'Angler armor',
        rawPath: path.join(fixture.rawDir, 'anglerhat.latest.json'),
        rawSourceCount: 2,
        standardizedSourceCount: 0,
        classification: 'family_page_candidate',
        sourceRevisionTimestamp: '2026-05-14T05:44:56Z',
        extractedSources: [
          { sourceType: 'quest_reward', sourceRefType: 'npc', sourceRefName: 'Angler', quantityText: '1', chanceText: null, conditions: null, notes: null },
          { sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Mimic', quantityText: '1', chanceText: null, conditions: null, notes: null }
        ]
      }]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 0);
  assert.equal(plan.summary.blockedCandidates, 1);
  assert.equal(plan.blockedCandidates[0].blockedReason, 'family_page_candidate');
});

test('buildItemSourceCandidateImportPlan promotes reviewed boss-family trophy relic mask and bag rows', () => {
  const fixture = createFixture();
  const candidates = [
    {
      itemInternalName: 'EyeofCthulhuTrophy',
      itemName: 'Eye of Cthulhu Trophy',
      pageTitle: 'Trophies',
      extractedSources: [
        { sourceType: 'drop', sourceRefType: 'boss_group', sourceRefName: 'most bosses', quantityText: '1', chanceText: '10%', conditions: null, notes: null },
        { sourceType: 'quest_reward', sourceRefType: 'npc', sourceRefName: 'Angler', quantityText: '1', chanceText: null, conditions: 'polluted quest table', notes: null }
      ]
    },
    {
      itemInternalName: 'GoldfishTrophy',
      itemName: 'Goldfish Trophy',
      pageTitle: 'Trophies',
      extractedSources: [
        { sourceType: 'drop', sourceRefType: 'boss_group', sourceRefName: 'most bosses', quantityText: '1', chanceText: '10%', conditions: null, notes: null },
        { sourceType: 'quest_reward', sourceRefType: 'npc', sourceRefName: 'Angler', quantityText: '1', chanceText: null, conditions: 'Angler quest reward', notes: null }
      ]
    },
    {
      itemInternalName: 'BetsyMasterTrophy',
      itemName: 'Betsy Relic',
      pageTitle: 'Relics',
      extractedSources: [
        { sourceType: 'drop', sourceRefType: 'boss_group', sourceRefName: 'bosses and mini-bosses', quantityText: '1', chanceText: '100%', conditions: 'Master Mode', notes: null }
      ]
    },
    {
      itemInternalName: 'SkeletronMask',
      itemName: 'Skeletron Mask',
      pageTitle: 'Masks',
      extractedSources: [
        { sourceType: 'drop', sourceRefType: 'boss', sourceRefName: '{{tr', quantityText: '1', chanceText: '14.29%', conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'EyeOfCthulhuBossBag',
      itemName: 'Treasure Bag (Eye of Cthulhu)',
      pageTitle: 'Treasure Bag',
      extractedSources: [
        { sourceType: 'treasure_bag', sourceRefType: 'boss_group', sourceRefName: 'defeating bosses', quantityText: '1', chanceText: '100%', conditions: 'Expert Mode', notes: null },
        { sourceType: 'treasure_bag', sourceRefType: 'treasure_bag', sourceRefName: 'Treasure Bags dropped from Hardmode bosses', quantityText: '1', chanceText: '100%', conditions: null, notes: null },
        { sourceType: 'unknown', sourceRefType: 'world', sourceRefName: 'unimplemented', quantityText: null, chanceText: null, conditions: null, notes: null }
      ]
    }
  ].map((candidate) => ({
    ...candidate,
    rawPath: path.join(fixture.rawDir, `${candidate.itemInternalName}.latest.json`),
    rawSourceCount: candidate.extractedSources.length,
    standardizedSourceCount: 0,
    classification: 'family_page_candidate',
    sourceRevisionTimestamp: '2026-05-14T05:44:56Z'
  }));

  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: candidates.length,
      classificationCounts: { family_page_candidate: candidates.length },
      candidates
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 5);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    Object.fromEntries(plan.eligibleCandidates.map((candidate) => [
      candidate.itemInternalName,
      candidate.plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.conditions, source.resolutionStatus])
    ])),
    {
      EyeofCthulhuTrophy: [['drop', 'boss', 'Eye of Cthulhu', null, 'resolved_boss_ref']],
      GoldfishTrophy: [['quest_reward', 'npc', 'Angler', 'Angler quest reward', 'resolved_npc_ref']],
      BetsyMasterTrophy: [['drop', 'boss', 'Betsy', 'Master Mode', 'resolved_boss_ref']],
      SkeletronMask: [['drop', 'boss', 'Skeletron', null, 'resolved_boss_ref']],
      EyeOfCthulhuBossBag: [['drop', 'boss', 'Eye of Cthulhu', 'Expert Mode', 'resolved_boss_ref']]
    }
  );
});

test('buildItemSourceCandidateImportPlan promotes reviewed furniture and small exact family rows', () => {
  const fixture = createFixture();
  const candidates = [
    {
      itemInternalName: 'BlueDungeonDoor',
      itemName: 'Blue Dungeon Door',
      pageTitle: 'Doors',
      extractedSources: [
        { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'the Dungeon', quantityText: null, chanceText: null, conditions: null, notes: null },
        { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Doors plunder', quantityText: null, chanceText: null, conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'ObsidianDoor',
      itemName: 'Obsidian Door',
      pageTitle: 'Doors',
      extractedSources: [
        { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Ruined Houses , is not destroyed in lava', quantityText: null, chanceText: null, conditions: null, notes: null },
        { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Doors plunder', quantityText: null, chanceText: null, conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'GoldenDoor',
      itemName: 'Golden Door',
      pageTitle: 'Doors',
      extractedSources: [
        { sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Pirate Invasion', quantityText: '1', chanceText: null, conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'MarchingBonesBanner',
      itemName: 'Marching Bones Banner',
      pageTitle: 'Banners (decorative)',
      extractedSources: [
        { sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Banners (decorative) plunder', quantityText: null, chanceText: null, conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'JungleKeyMold',
      itemName: 'Jungle Key Mold',
      pageTitle: 'Legacy:Biome Key Molds',
      extractedSources: [
        { sourceType: 'drop', sourceRefType: 'npc_group', sourceRefName: 'enemies in Jungle biome', quantityText: '1', chanceText: '1/2500', conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'SkeletronHand',
      itemName: 'Skeletron Hand',
      pageTitle: 'Hooks',
      extractedSources: [
        { sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Skeletron', quantityText: '1', chanceText: '12.24%', conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'FishHook',
      itemName: 'Fish Hook',
      pageTitle: 'Hooks',
      extractedSources: [
        { sourceType: 'fishing', sourceRefType: 'world', sourceRefName: 'Fishing', quantityText: '1', chanceText: null, conditions: null, notes: null },
        { sourceType: 'quest_reward', sourceRefType: 'npc', sourceRefName: 'Angler', quantityText: '1', chanceText: null, conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'FestiveWings',
      itemName: 'Festive Wings',
      pageTitle: 'Wings',
      extractedSources: [
        { sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Everscream', quantityText: '1', chanceText: '25%', conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'FinWings',
      itemName: 'Fin Wings',
      pageTitle: 'Wings',
      extractedSources: [
        { sourceType: 'quest_reward', sourceRefType: 'npc', sourceRefName: 'Angler', quantityText: '1', chanceText: null, conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'BetsyWings',
      itemName: "Betsy's Wings",
      pageTitle: 'Wings',
      extractedSources: [
        { sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Betsy', quantityText: '1', chanceText: '25%', conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'BluePresent',
      itemName: 'Blue Present',
      pageTitle: 'Present',
      extractedSources: [
        { sourceType: 'drop', sourceRefType: 'world', sourceRefName: 'Christmas seasonal event', quantityText: '1', chanceText: null, conditions: null, notes: null },
        { sourceType: 'unknown', sourceRefType: 'world', sourceRefName: 'unobtainable', quantityText: null, chanceText: null, conditions: null, notes: null }
      ]
    },
    {
      itemInternalName: 'PalworldPetChilletIgnis',
      itemName: 'Chillet Ignis',
      pageTitle: 'Chillet',
      extractedSources: [
        { sourceType: 'drop', sourceRefType: 'item', sourceRefName: 'Huge Dragon Egg', quantityText: '1', chanceText: null, conditions: null, notes: null }
      ]
    }
  ].map((candidate) => ({
    ...candidate,
    rawPath: path.join(fixture.rawDir, `${candidate.itemInternalName}.latest.json`),
    rawSourceCount: candidate.extractedSources.length,
    standardizedSourceCount: 0,
    classification: 'family_page_candidate',
    sourceRevisionTimestamp: '2026-05-14T05:44:56Z'
  }));

  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: candidates.length,
      classificationCounts: { family_page_candidate: candidates.length },
      candidates
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, candidates.length);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    Object.fromEntries(plan.eligibleCandidates.map((candidate) => [
      candidate.itemInternalName,
      candidate.plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.resolutionStatus])
    ])),
    {
      BlueDungeonDoor: [['worldgen', 'world', 'the Dungeon', 'world_text_ref']],
      ObsidianDoor: [['worldgen', 'world', 'Ruined Houses , is not destroyed in lava', 'world_text_ref']],
      GoldenDoor: [['drop', 'npc', 'Pirates', 'resolved_npc_ref']],
      MarchingBonesBanner: [['worldgen', 'world', 'Banners (decorative) plunder', 'world_text_ref']],
      JungleKeyMold: [['drop', 'npc_group', 'enemies in Jungle biome', 'text_only_ref']],
      SkeletronHand: [['drop', 'npc', 'Skeletron', 'resolved_npc_ref']],
      FishHook: [
        ['fishing', 'world', 'Fishing', 'world_text_ref'],
        ['quest_reward', 'npc', 'Angler', 'resolved_npc_ref']
      ],
      FestiveWings: [['drop', 'npc', 'Everscream', 'resolved_npc_ref']],
      FinWings: [['quest_reward', 'npc', 'Angler', 'resolved_npc_ref']],
      BetsyWings: [['drop', 'npc', 'Betsy', 'resolved_npc_ref']],
      BluePresent: [['drop', 'world', 'Christmas seasonal event', 'world_text_ref']],
      PalworldPetChilletIgnis: [['drop', 'item', 'Huge Dragon Egg', 'resolved_item_ref']]
    }
  );
});

test('buildItemSourceCandidateImportPlan normalizes safe blocked source rows', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-10T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 5,
      classificationCounts: { high_confidence: 5 },
      candidates: [
        {
          itemInternalName: 'Carrot',
          itemName: 'Carrot',
          pageTitle: 'Carrot',
          rawPath: path.join(fixture.rawDir, 'carrot.latest.json'),
          rawSourceCount: 1,
          standardizedSourceCount: 0,
          classification: 'high_confidence',
          sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
          extractedSources: [
            { sourceType: 'unknown', sourceRefType: 'world', sourceRefName: "Terraria Collector's Edition", quantityText: null, chanceText: null, conditions: 'only available to players in the Terraria Collector’s Edition', notes: null }
          ]
        },
        {
          itemInternalName: 'CookedMarshmallow',
          itemName: 'Cooked Marshmallow',
          pageTitle: 'Cooked Marshmallow',
          rawPath: path.join(fixture.rawDir, 'cookedmarshmallow.latest.json'),
          rawSourceCount: 1,
          standardizedSourceCount: 0,
          classification: 'high_confidence',
          sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
          extractedSources: [
            { sourceType: 'unknown', sourceRefType: 'world', sourceRefName: 'Campfire cooking', quantityText: null, chanceText: null, conditions: 'created by holding a Marshmallow on a Stick over a Campfire', notes: null }
          ]
        },
        {
          itemInternalName: 'DevDye',
          itemName: "Skiphs' Blood",
          pageTitle: "Skiphs' Blood",
          rawPath: path.join(fixture.rawDir, 'devdye.latest.json'),
          rawSourceCount: 1,
          standardizedSourceCount: 0,
          classification: 'high_confidence',
          sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
          extractedSources: [
            { sourceType: 'treasure_bag', sourceRefType: 'treasure_bag', sourceRefName: 'Hardmode Treasure Bag (except Queen Slime)', quantityText: null, chanceText: null, conditions: 'Developer item infobox marks this item as Hardmode bag loot; Queen Slime is excluded by developer-item rules.', notes: null }
          ]
        },
        {
          itemInternalName: 'RedsYoyo',
          itemName: "Red's Throw",
          pageTitle: "Red's Throw",
          rawPath: path.join(fixture.rawDir, 'redsyoyo.latest.json'),
          rawSourceCount: 2,
          standardizedSourceCount: 0,
          classification: 'high_confidence',
          sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
          extractedSources: [
            { sourceType: 'treasure_bag', sourceRefType: 'treasure_bag', sourceRefName: 'Hardmode Treasure Bag (except Queen Slime)', quantityText: null, chanceText: null, conditions: "Red's Throw can be obtained from any Hardmode boss's Treasure Bag (except Queen Slime's) as part of Red's set.", notes: null },
            { sourceType: 'treasure_bag', sourceRefType: 'treasure_bag', sourceRefName: 'Hardmode Treasure Bag (except Queen Slime)', quantityText: null, chanceText: null, conditions: 'Developer item infobox marks this item as Hardmode bag loot; Queen Slime is excluded by developer-item rules.', notes: null }
          ]
        },
        {
          itemInternalName: 'JojaCola',
          itemName: 'Joja Cola',
          pageTitle: 'Joja Cola',
          rawPath: path.join(fixture.rawDir, 'jojacola.latest.json'),
          rawSourceCount: 1,
          standardizedSourceCount: 0,
          classification: 'high_confidence',
          sourceRevisionTimestamp: '2026-04-02T10:40:10Z',
          extractedSources: [
            { sourceType: 'unknown', sourceRefType: 'world', sourceRefName: 'fishing junk replacement', quantityText: null, chanceText: null, conditions: 'possible trash item that can be caught while fishing', notes: null }
          ]
        }
      ]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 5);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    plan.eligibleCandidates.map((candidate) => [
      candidate.itemInternalName,
      candidate.plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName])
    ]),
    [
      ['Carrot', [['worldgen', 'world', "Terraria Collector's Edition"]]],
      ['CookedMarshmallow', [['craft', 'item', 'Marshmallow on a Stick']]],
      ['DevDye', [['treasure_bag', 'boss_group', 'Hardmode Treasure Bag (except Queen Slime)']]],
      ['RedsYoyo', [['treasure_bag', 'boss_group', 'Hardmode Treasure Bag (except Queen Slime)'], ['treasure_bag', 'boss_group', 'Hardmode Treasure Bag (except Queen Slime)']]],
      ['JojaCola', [['fishing', 'world', 'Fishing junk replacement']]]
    ]
  );
});

test('buildItemSourceCandidateImportPlan normalizes reviewed dedicated mechanic source rows', () => {
  const fixture = createFixture();
  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-12T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 3,
      classificationCounts: { high_confidence: 3 },
      candidates: [
        {
          itemInternalName: 'GardenGnome',
          itemName: 'Garden Gnome',
          pageTitle: 'Garden Gnome',
          rawPath: path.join(fixture.rawDir, 'garden-gnome.latest.json'),
          rawSourceCount: 1,
          standardizedSourceCount: 0,
          classification: 'high_confidence',
          sourceRevisionTimestamp: '2026-05-01T00:00:00Z',
          extractedSources: [
            { sourceType: 'unknown', sourceRefType: 'npc', sourceRefName: 'Gnome sunlight transformation', quantityText: null, chanceText: null, conditions: 'formed when a Gnome touches sunlight', notes: null }
          ]
        },
        {
          itemInternalName: 'TorchGodsFavor',
          itemName: "Torch God's Favor",
          pageTitle: "Torch God's Favor",
          rawPath: path.join(fixture.rawDir, 'torch-gods-favor.latest.json'),
          rawSourceCount: 2,
          standardizedSourceCount: 0,
          classification: 'high_confidence',
          sourceRevisionTimestamp: '2026-05-01T00:00:00Z',
          extractedSources: [
            { sourceType: 'fishing', sourceRefType: 'world', sourceRefName: 'Fishing', quantityText: null, chanceText: null, conditions: 'torch biome notes mention fishing precedence', notes: null },
            { sourceType: 'unknown', sourceRefType: 'world', sourceRefName: 'The Torch God event', quantityText: null, chanceText: null, conditions: 'obtained by surviving The Torch God event', notes: null }
          ]
        },
        {
          itemInternalName: 'JunimoPetItem',
          itemName: 'Stardrop',
          pageTitle: 'Stardrop',
          rawPath: path.join(fixture.rawDir, 'stardrop.latest.json'),
          rawSourceCount: 1,
          standardizedSourceCount: 0,
          classification: 'high_confidence',
          sourceRevisionTimestamp: '2026-05-01T00:00:00Z',
          extractedSources: [
            { sourceType: 'unknown', sourceRefType: 'npc', sourceRefName: 'Dryad', quantityText: null, chanceText: null, conditions: 'obtained by purifying a Joja Cola from the Dryad', notes: null }
          ]
        }
      ]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 3);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    plan.eligibleCandidates.map((candidate) => [
      candidate.itemInternalName,
      candidate.plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName])
    ]),
    [
      ['GardenGnome', [['transformation', 'npc', 'Gnome']]],
      ['TorchGodsFavor', [['event', 'world', 'The Torch God event']]],
      ['JunimoPetItem', [['transformation', 'npc', 'Dryad']]]
    ]
  );
});

test('buildItemSourceCandidateImportPlan promotes enemy banners only to resolved NPC sources', () => {
  const fixture = createFixture();
  const candidate = (itemInternalName, itemName) => ({
    itemInternalName,
    itemName,
    pageTitle: 'Banners (enemy)',
    rawPath: path.join(fixture.rawDir, `${itemInternalName}.latest.json`),
    rawSourceCount: 1,
    standardizedSourceCount: 0,
    classification: 'family_page_candidate',
    sourceRevisionTimestamp: '2026-05-01T00:00:00Z',
    extractedSources: [
      {
        sourceType: 'drop',
        sourceRefType: 'npc_group',
        sourceRefName: 'killing most enemies and a few critters',
        quantityText: null,
        chanceText: null,
        conditions: 'Enemy banners are obtained by killing most enemies and a few critters.',
        notes: null
      }
    ]
  });

  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-12T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 4,
      classificationCounts: { family_page_candidate: 4 },
      candidates: [
        candidate('AnglerFishBanner', 'Angler Fish Banner'),
        candidate('BatBanner', 'Cave Bat Banner'),
        candidate('BunnyBanner', 'Bunny Banner'),
        candidate('DemonEyeBanner', 'Demon Eye Banner')
      ]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 4);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    plan.eligibleCandidates.map((candidate) => [
      candidate.itemInternalName,
      candidate.plannedSources[0].sourceType,
      candidate.plannedSources[0].sourceRefType,
      candidate.plannedSources[0].sourceRefName,
      candidate.plannedSources[0].resolvedRef?.internalName
    ]),
    [
      ['AnglerFishBanner', 'drop', 'npc', 'Angler Fish', 'AnglerFish'],
      ['BatBanner', 'drop', 'npc', 'Cave Bat', 'CaveBat'],
      ['BunnyBanner', 'drop', 'npc', 'Bunny', 'Bunny'],
      ['DemonEyeBanner', 'drop', 'npc', 'Demon Eye', 'DemonEye']
    ]
  );
});

test('buildItemSourceCandidateImportPlan promotes reviewed critter capture family pages', () => {
  const fixture = createFixture();
  const candidate = (itemInternalName, itemName, pageTitle) => ({
    itemInternalName,
    itemName,
    pageTitle,
    rawPath: path.join(fixture.rawDir, `${itemInternalName}.latest.json`),
    rawSourceCount: 1,
    standardizedSourceCount: 0,
    classification: 'family_page_candidate',
    sourceRevisionTimestamp: '2026-05-01T00:00:00Z',
    extractedSources: [
      {
        sourceType: 'capture',
        sourceRefType: 'world',
        sourceRefName: 'Bug Net capture',
        quantityText: null,
        chanceText: null,
        conditions: 'caught with a Bug Net',
        notes: null
      }
    ]
  });

  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-12T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 6,
      classificationCounts: { family_page_candidate: 6 },
      candidates: [
        candidate('GemSquirrelAmethyst', 'Amethyst Squirrel', 'Gem Squirrels'),
        candidate('GemBunnyAmethyst', 'Amethyst Bunny', 'Gem Bunnies'),
        candidate('BlueJay', 'Blue Jay', 'Birds'),
        candidate('MallardDuck', 'Mallard Duck', 'Ducks'),
        candidate('ScarletMacaw', 'Scarlet Macaw', 'Macaws'),
        candidate('FairyCritterPink', 'Pink Fairy', 'Fairies')
      ]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 6);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    plan.eligibleCandidates.map((candidate) => [
      candidate.itemInternalName,
      candidate.plannedSources[0].sourceType,
      candidate.plannedSources[0].sourceRefType,
      candidate.plannedSources[0].sourceRefName
    ]),
    [
      ['GemSquirrelAmethyst', 'capture', 'world', 'Bug Net capture'],
      ['GemBunnyAmethyst', 'capture', 'world', 'Bug Net capture'],
      ['BlueJay', 'capture', 'world', 'Bug Net capture'],
      ['MallardDuck', 'capture', 'world', 'Bug Net capture'],
      ['ScarletMacaw', 'capture', 'world', 'Bug Net capture'],
      ['FairyCritterPink', 'capture', 'world', 'Bug Net capture']
    ]
  );
});

test('buildItemSourceCandidateImportPlan promotes reviewed developer treasure bag family rows', () => {
  const fixture = createFixture();
  const candidate = (itemInternalName, itemName, pageTitle) => ({
    itemInternalName,
    itemName,
    pageTitle,
    rawPath: path.join(fixture.rawDir, `${itemInternalName}.latest.json`),
    rawSourceCount: 1,
    standardizedSourceCount: 0,
    classification: 'family_page_candidate',
    sourceRevisionTimestamp: '2026-05-01T00:00:00Z',
    extractedSources: [
      {
        sourceType: 'treasure_bag',
        sourceRefType: 'boss_group',
        sourceRefName: 'Hardmode Treasure Bag (except Queen Slime)',
        quantityText: null,
        chanceText: null,
        conditions: 'Developer item infobox marks this item as Hardmode bag loot; Queen Slime is excluded by developer-item rules.',
        notes: null
      }
    ]
  });

  const blockedDifferentSource = candidate('ArkhalisWings', "Arkhalis' Lightwings", 'Wings');
  blockedDifferentSource.extractedSources = [{
    sourceType: 'drop',
    sourceRefType: 'npc',
    sourceRefName: 'Betsy',
    quantityText: null,
    chanceText: null,
    conditions: 'Betsy',
    notes: null
  }];

  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-12T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 3,
      classificationCounts: { family_page_candidate: 3 },
      candidates: [
        candidate('DTownsWings', "D-Town's Wings", 'Wings'),
        candidate('DTownsHelmet', "D-Town's Helmet", "D-Town's set"),
        blockedDifferentSource
      ]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 2);
  assert.equal(plan.summary.blockedCandidates, 1);
  assert.deepEqual(
    plan.eligibleCandidates.map((candidate) => [
      candidate.itemInternalName,
      candidate.plannedSources[0].sourceType,
      candidate.plannedSources[0].sourceRefType,
      candidate.plannedSources[0].sourceRefName
    ]),
    [
      ['DTownsWings', 'treasure_bag', 'boss_group', 'Hardmode Treasure Bag (except Queen Slime)'],
      ['DTownsHelmet', 'treasure_bag', 'boss_group', 'Hardmode Treasure Bag (except Queen Slime)']
    ]
  );
  assert.equal(plan.blockedCandidates[0].itemInternalName, 'ArkhalisWings');
});

test('buildItemSourceCandidateImportPlan separates explicit unobtainable and unimplemented source exemptions', () => {
  const fixture = createFixture();
  const candidate = (itemInternalName, itemName, pageTitle, extractedSources, classification = 'high_confidence') => ({
    itemInternalName,
    itemName,
    pageTitle,
    rawPath: path.join(fixture.rawDir, `${itemInternalName}.latest.json`),
    rawSourceCount: extractedSources.length,
    standardizedSourceCount: 0,
    classification,
    sourceRevisionTimestamp: '2026-06-12T00:00:00Z',
    extractedSources
  });

  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-12T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 4,
      classificationCounts: { high_confidence: 3, family_page_candidate: 1 },
      candidates: [
        candidate('BoneBlock', 'Bone Block', 'Bone Block', [
          { sourceType: 'unknown', sourceRefType: 'world', sourceRefName: 'unobtainable as item', quantityText: null, chanceText: null, conditions: 'There is no way to obtain the block as an item in these versions.', notes: null }
        ]),
        candidate('PhasicWarpEjector', 'Phasic Warp Ejector', 'Phasic Warp Ejector', [
          { sourceType: 'unknown', sourceRefType: 'world', sourceRefName: 'unimplemented', quantityText: null, chanceText: null, conditions: 'The Phasic Warp Ejector is an unimplemented and incomplete item.', notes: null }
        ]),
        candidate('SoundGun', 'The Imploder', 'The Imploder', [
          { sourceType: 'unknown', sourceRefType: 'world', sourceRefName: 'unimplemented', quantityText: null, chanceText: null, conditions: 'The Imploder is an unimplemented item.', notes: null },
          { sourceType: 'unknown', sourceRefType: 'world', sourceRefName: 'unobtainable', quantityText: null, chanceText: null, conditions: 'Unlike most other unobtainable items, if obtained via inventory editor, The Imploder is not removed from inventory when the character is loaded.', notes: null }
        ]),
        candidate('BlueCultistFighterBanner', 'Blue Cultist Fighter Banner', 'Banners (enemy)', [
          { sourceType: 'drop', sourceRefType: 'npc_group', sourceRefName: 'killing most enemies and a few critters', quantityText: null, chanceText: null, conditions: 'Enemy banners are obtained by killing most enemies and a few critters.', notes: null },
          { sourceType: 'unknown', sourceRefType: 'world', sourceRefName: 'unobtainable', quantityText: null, chanceText: null, conditions: 'In addition, there are 6 unobtainable enemy banners.', notes: null }
        ], 'family_page_candidate')
      ]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 0);
  assert.equal(plan.summary.explicitSourceExemptionCandidates, 3);
  assert.equal(plan.summary.explicitSourceExemptionRows, 4);
  assert.equal(plan.summary.blockedCandidates, 1);
  assert.deepEqual(
    plan.explicitSourceExemptionCandidates.map((candidate) => [
      candidate.itemInternalName,
      candidate.exemptionReason,
      candidate.exemptedSources.map((source) => source.exemptionStatus)
    ]),
    [
      ['BoneBlock', 'explicit_unobtainable_or_unimplemented_source', ['unobtainable_as_item']],
      ['PhasicWarpEjector', 'explicit_unobtainable_or_unimplemented_source', ['unimplemented']],
      ['SoundGun', 'explicit_unobtainable_or_unimplemented_source', ['unimplemented', 'unobtainable']]
    ]
  );
  assert.equal(plan.blockedCandidates[0].itemInternalName, 'BlueCultistFighterBanner');
});

test('buildItemSourceCandidateImportPlan promotes reviewed raw family mechanism rows', () => {
  const fixture = createFixture();
  const candidate = (itemInternalName, itemName, pageTitle, extractedSources) => ({
    itemInternalName,
    itemName,
    pageTitle,
    rawPath: path.join(fixture.rawDir, `${itemInternalName}.latest.json`),
    rawSourceCount: extractedSources.length,
    standardizedSourceCount: 0,
    classification: 'family_page_candidate',
    sourceRevisionTimestamp: '2026-06-12T00:00:00Z',
    extractedSources
  });

  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-12T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 13,
      classificationCounts: { family_page_candidate: 13 },
      candidates: [
        candidate('ShellphoneSpawn', 'Shellphone (Spawn)', 'Shellphone', [
          { sourceType: 'unknown', sourceRefType: 'item', sourceRefName: 'Shellphone', conditions: 'Right click to toggle destination', quantityText: null, chanceText: null, notes: null }
        ]),
        candidate('ShellphoneOcean', 'Shellphone (Ocean)', 'Shellphone', [
          { sourceType: 'unknown', sourceRefType: 'item', sourceRefName: 'Shellphone', conditions: 'Right click to toggle destination', quantityText: null, chanceText: null, notes: null }
        ]),
        candidate('CapricornLegs', 'Capricorn Hooves', 'Capricorn set', [
          { sourceType: 'unknown', sourceRefType: 'item', sourceRefName: 'Capricorn Tail', conditions: 'switch from tail to legs', quantityText: null, chanceText: null, notes: null }
        ]),
        candidate('ClosedVoidBag', 'Closed Void Bag', 'Void Bag', [
          { sourceType: 'unknown', sourceRefType: 'item', sourceRefName: 'Void Bag', conditions: 'turns it into the Closed Void Bag', quantityText: null, chanceText: null, notes: null }
        ]),
        candidate('DontHurtComboBookInactive', 'Guide to Peaceful Coexistence (Inactive)', 'Guide to Peaceful Coexistence', [
          { sourceType: 'unknown', sourceRefType: 'item', sourceRefName: 'Guide to Peaceful Coexistence', conditions: 'toggle it between active and inactive', quantityText: null, chanceText: null, notes: null }
        ]),
        candidate('MinecartMech', 'Mechanical Cart', 'Minecarts', [
          { sourceType: 'unknown', sourceRefType: 'item', sourceRefName: 'Minecart Upgrade Kit', conditions: 'Obtained by using a Minecart Upgrade Kit. Expert Mode-exclusive.', quantityText: null, chanceText: null, notes: null }
        ]),
        candidate('FishMinecart', 'Minecarp', 'Minecarts', [
          { sourceType: 'quest_reward', sourceRefType: 'npc', sourceRefName: 'Angler', conditions: 'Received as a quest reward from the Angler.', quantityText: null, chanceText: null, notes: null }
        ]),
        candidate('GoldenToilet', 'Golden Toilet', 'Toilets', [
          { sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Pirates', conditions: 'Dropped by pirates during the Pirate Invasion.', quantityText: null, chanceText: null, notes: null }
        ]),
        candidate('GoldenChest', 'Golden Chest', 'Chests', [
          { sourceType: 'drop', sourceRefType: 'world', sourceRefName: 'Pirate Invasion', conditions: 'Pirate Invasion', quantityText: null, chanceText: null, notes: null }
        ]),
        candidate('TeleportationPylonUnderground', 'Cavern Pylon', 'Pylons', [
          { sourceType: 'shop', sourceRefType: 'npc_group', sourceRefName: 'eligible NPC vendors selling pylons', conditions: 'When below the surface', quantityText: null, chanceText: null, notes: null }
        ]),
        candidate('UsedGasTrap', 'Used Gas Trap', 'Gas Trap', [
          { sourceType: 'shimmer', sourceRefType: 'world', sourceRefName: 'Shimmer transmutation', conditions: 'The Gas Trap then becomes a Used Gas Trap', quantityText: null, chanceText: null, notes: null }
        ]),
        candidate('ShimmerFlare', 'Shimmer Flare', 'Flares', [
          { sourceType: 'shimmer', sourceRefType: 'world', sourceRefName: 'Shimmer transmutation', conditions: 'Throwing either a Flare or Blue Flare into Shimmer', quantityText: null, chanceText: null, notes: null }
        ]),
        candidate('HeroicisHead', "Heroicis' Hat", "Heroicis' set", [
          { sourceType: 'unknown', sourceRefType: 'world', sourceRefName: 'Platinum Coin thrown into Oasis water', conditions: 'obtained by throwing a Platinum Coin into water in an Oasis', quantityText: null, chanceText: null, notes: null }
        ])
      ]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 13);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    Object.fromEntries(plan.eligibleCandidates.map((row) => [
      row.itemInternalName,
      row.plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.resolutionStatus])
    ])),
    {
      ShellphoneSpawn: [['transformation', 'item', 'Shellphone (Home)', 'resolved_item_ref']],
      ShellphoneOcean: [['transformation', 'item', 'Shellphone (Home)', 'resolved_item_ref']],
      CapricornLegs: [['transformation', 'item', 'Capricorn Tail', 'resolved_item_ref']],
      ClosedVoidBag: [['transformation', 'item', 'Void Bag', 'resolved_item_ref']],
      DontHurtComboBookInactive: [['transformation', 'item', 'Guide to Peaceful Coexistence', 'resolved_item_ref']],
      MinecartMech: [['transformation', 'item', 'Minecart Upgrade Kit', 'resolved_item_ref']],
      FishMinecart: [['quest_reward', 'npc', 'Angler', 'resolved_npc_ref']],
      GoldenToilet: [['drop', 'npc', 'Pirates', 'resolved_npc_ref']],
      GoldenChest: [['drop', 'world', 'Pirate Invasion', 'world_text_ref']],
      TeleportationPylonUnderground: [['shop', 'npc_group', 'eligible NPC vendors selling pylons', 'text_only_ref']],
      UsedGasTrap: [['shimmer', 'world', 'Shimmer transmutation', 'world_text_ref']],
      ShimmerFlare: [['shimmer', 'world', 'Shimmer transmutation', 'world_text_ref']],
      HeroicisHead: [['transformation', 'item', 'Platinum Coin', 'resolved_item_ref']]
    }
  );
});

test('buildItemSourceCandidateImportPlan promotes reviewed remaining raw family source rows', () => {
  const fixture = createFixture();
  const candidate = (itemInternalName, itemName, pageTitle, extractedSources) => ({
    itemInternalName,
    itemName,
    pageTitle,
    rawPath: path.join(fixture.rawDir, `${itemInternalName}.latest.json`),
    rawSourceCount: extractedSources.length,
    standardizedSourceCount: 0,
    classification: 'family_page_candidate',
    sourceRevisionTimestamp: '2026-06-12T00:00:00Z',
    extractedSources
  });
  const chippySource = {
    sourceType: 'drop',
    sourceRefType: 'boss_group',
    sourceRefName: "Skeletron's Red Hat variant",
    conditions: "It is always dropped by Skeletron's Red Hat variant.",
    quantityText: null,
    chanceText: null,
    notes: null
  };

  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-12T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 9,
      classificationCounts: { family_page_candidate: 9 },
      candidates: [
        candidate('GoldenSink', 'Golden Sink', 'Sinks', [
          { sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Pirate Invasion', conditions: 'Dropped by Pirates.', quantityText: null, chanceText: null, notes: null }
        ]),
        candidate('TwinMask', 'Twin Mask', 'Masks', [
          { sourceType: 'drop', sourceRefType: 'boss', sourceRefName: '{{tr', conditions: 'Masks are dropped by all non-event bosses.', quantityText: null, chanceText: '1/7', notes: null, sourceRowText: '{{item infobox|type=Vanity|tags=drop/hardmode| auto = 2106 | link = {{tr|The Twins}}}}' }
        ]),
        candidate('TwinsBossBag', 'Treasure Bag (The Twins)', 'Treasure Bag', [
          { sourceType: 'drop', sourceRefType: 'boss', sourceRefName: 'The Twins', conditions: 'Treasure Bags are obtained in Expert Mode and Master Mode as a reward for defeating bosses.', quantityText: null, chanceText: null, notes: null }
        ]),
        candidate('TwinsMasterTrophy', 'Twins Relic', 'Relics', [
          { sourceType: 'drop', sourceRefType: 'boss', sourceRefName: 'The Twins', conditions: 'Relics are dropped by bosses and mini-bosses in Master Mode.', quantityText: null, chanceText: null, notes: null }
        ]),
        candidate('ChippysHead', "Chippy's Helmet", "Chippy's set", [chippySource]),
        candidate('ChippysBody', "Chippy's Chestplate", "Chippy's set", [chippySource]),
        candidate('ChippysLegs', "Chippy's Greaves", "Chippy's set", [chippySource]),
        candidate('ChippysHeadband', "Chippy's Headband", "Chippy's set", [chippySource]),
        candidate('ChippysWingsInactive', "Chippy's Cloak (Inactive)", 'Wings', [chippySource])
      ]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 9);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    Object.fromEntries(plan.eligibleCandidates.map((row) => [
      row.itemInternalName,
      row.plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.resolutionStatus])
    ])),
    {
      GoldenSink: [['drop', 'npc', 'Pirates', 'resolved_npc_ref']],
      TwinMask: [['drop', 'boss_group', 'The Twins', 'text_only_ref']],
      TwinsBossBag: [['drop', 'boss_group', 'The Twins', 'text_only_ref']],
      TwinsMasterTrophy: [['drop', 'boss_group', 'The Twins', 'text_only_ref']],
      ChippysHead: [['drop', 'boss_group', "Skeletron's Red Hat variant", 'text_only_ref']],
      ChippysBody: [['drop', 'boss_group', "Skeletron's Red Hat variant", 'text_only_ref']],
      ChippysLegs: [['drop', 'boss_group', "Skeletron's Red Hat variant", 'text_only_ref']],
      ChippysHeadband: [['drop', 'boss_group', "Skeletron's Red Hat variant", 'text_only_ref']],
      ChippysWingsInactive: [['drop', 'boss_group', "Skeletron's Red Hat variant", 'text_only_ref']]
    }
  );
});

test('buildItemSourceCandidateImportPlan promotes reviewed enemy banner NPC aliases', () => {
  const fixture = createFixture();
  const candidate = (itemInternalName, itemName) => ({
    itemInternalName,
    itemName,
    pageTitle: 'Banners (enemy)',
    rawPath: path.join(fixture.rawDir, `${itemInternalName}.latest.json`),
    rawSourceCount: 1,
    standardizedSourceCount: 0,
    classification: 'family_page_candidate',
    sourceRevisionTimestamp: '2026-06-12T00:00:00Z',
    extractedSources: [
      { sourceType: 'drop', sourceRefType: 'npc_group', sourceRefName: 'killing most enemies and a few critters', conditions: 'Enemy banners are obtained by killing most enemies and a few critters.', quantityText: null, chanceText: null, notes: null }
    ]
  });

  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-12T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 7,
      classificationCounts: { family_page_candidate: 7 },
      candidates: [
        candidate('MartianBrainscramblerBanner', 'Martian Brain Scrambler Banner'),
        candidate('MartianGigazapperBanner', 'Martian Gigazapper Banner'),
        candidate('MartianGreyGruntBanner', 'Martian Gray Grunt Banner'),
        candidate('MartianRaygunnerBanner', 'Martian Ray Gunner Banner'),
        candidate('MartianScutlixGunnerBanner', 'Martian Scutlix Gunner Banner'),
        candidate('MartianTeslaTurretBanner', 'Martian Tesla Turret Banner'),
        candidate('PresentMimicBanner', 'Present Mimic Banner')
      ]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 7);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.deepEqual(
    Object.fromEntries(plan.eligibleCandidates.map((row) => [
      row.itemInternalName,
      row.plannedSources.map((source) => [source.sourceType, source.sourceRefType, source.sourceRefName, source.resolvedRef?.internalName])
    ])),
    {
      MartianBrainscramblerBanner: [['drop', 'npc', 'Brain Scrambler', 'BrainScrambler']],
      MartianGigazapperBanner: [['drop', 'npc', 'Gigazapper', 'GigaZapper']],
      MartianGreyGruntBanner: [['drop', 'npc', 'Gray Grunt', 'GrayGrunt']],
      MartianRaygunnerBanner: [['drop', 'npc', 'Ray Gunner', 'RayGunner']],
      MartianScutlixGunnerBanner: [['drop', 'npc', 'Scutlix Gunner', 'ScutlixRider']],
      MartianTeslaTurretBanner: [['drop', 'npc', 'Tesla Turret', 'MartianTurret']],
      PresentMimicBanner: [['drop', 'npc', 'Present Mimic', 'PresentMimic']]
    }
  );
});

test('buildItemSourceCandidateImportPlan closes remaining enemy banner edge cases conservatively', () => {
  const fixture = createFixture();
  const bannerDropSource = (itemName) => ({
    sourceType: 'drop',
    sourceRefType: 'npc_group',
    sourceRefName: 'killing most enemies and a few critters',
    quantityText: null,
    chanceText: null,
    conditions: 'Enemy banners are obtained by killing most enemies and a few critters.',
    notes: null
  });
  const unobtainableBannerSource = (itemId) => ({
    sourceType: 'unknown',
    sourceRefType: 'world',
    sourceRefName: 'unobtainable',
    quantityText: null,
    chanceText: null,
    conditions: 'In addition, there are 6 unobtainable enemy banners.',
    notes: null,
    sourceRowText: `{{item infobox|view=void|auto=${itemId}|buffid=147|type=Furniture|width=1|height=3|tags=unobtainable/drop/enemy banner}}`
  });
  const candidate = (itemInternalName, itemName, itemId, hasUnobtainableSource) => ({
    itemInternalName,
    itemName,
    pageTitle: 'Banners (enemy)',
    rawPath: path.join(fixture.rawDir, `${itemInternalName}.latest.json`),
    rawSourceCount: hasUnobtainableSource ? 2 : 1,
    standardizedSourceCount: 0,
    classification: 'family_page_candidate',
    sourceRevisionTimestamp: '2026-06-12T00:00:00Z',
    extractedSources: [
      bannerDropSource(itemName),
      ...(hasUnobtainableSource ? [unobtainableBannerSource(itemId)] : [])
    ]
  });

  const plan = buildItemSourceCandidateImportPlan({
    auditSummary: {
      generatedAt: '2026-06-12T00:00:00.000Z',
      readOnly: true,
      totalCandidates: 7,
      classificationCounts: { family_page_candidate: 7 },
      candidates: [
        candidate('BlueCultistArcherBanner', 'Blue Cultist Archer Banner', 2901, false),
        candidate('BlueCultistFighterBanner', 'Blue Cultist Fighter Banner', 2903, true),
        candidate('WhiteCultistArcherBanner', 'White Cultist Archer Banner', 2989, true),
        candidate('WhiteCultistCasterBanner', 'White Cultist Caster Banner', 2990, true),
        candidate('WhiteCultistFighterBanner', 'White Cultist Fighter Banner', 2991, true),
        candidate('SeveredHandBanner', 'Severed Hand Banner', 3398, true),
        candidate('PoisonousSporeBanner', 'Poisonous Spore Banner', 3404, true)
      ]
    },
    standardizedItemsPath: fixture.itemsPath,
    standardizedNpcsPath: fixture.npcsPath,
    npcParsedPath: fixture.npcsPath,
    itemSourcesDir: fixture.sourcesDir
  });

  assert.equal(plan.summary.eligibleCandidates, 1);
  assert.equal(plan.summary.blockedCandidates, 0);
  assert.equal(plan.summary.explicitSourceExemptionCandidates, 6);
  assert.equal(plan.summary.explicitSourceExemptionRows, 12);
  assert.deepEqual(
    plan.eligibleCandidates.map((row) => [
      row.itemInternalName,
      row.plannedSources[0].sourceType,
      row.plannedSources[0].sourceRefType,
      row.plannedSources[0].sourceRefName,
      row.plannedSources[0].resolvedRef?.internalName
    ]),
    [['BlueCultistArcherBanner', 'drop', 'npc', 'Cultist Archer', 'CultistArcherBlue']]
  );
  assert.deepEqual(
    plan.explicitSourceExemptionCandidates.map((row) => [row.itemInternalName, row.exemptionReason]),
    [
      ['BlueCultistFighterBanner', 'explicit_unobtainable_enemy_banner_source'],
      ['WhiteCultistArcherBanner', 'explicit_unobtainable_enemy_banner_source'],
      ['WhiteCultistCasterBanner', 'explicit_unobtainable_enemy_banner_source'],
      ['WhiteCultistFighterBanner', 'explicit_unobtainable_enemy_banner_source'],
      ['SeveredHandBanner', 'explicit_unobtainable_enemy_banner_source'],
      ['PoisonousSporeBanner', 'explicit_unobtainable_enemy_banner_source']
    ]
  );
});
