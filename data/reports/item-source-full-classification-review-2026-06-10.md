# Item Source Full Classification Review - 2026-06-10

Input: `data/reports/item-source-candidate-import-plan.after-vendor-composite-cleanup.json`

## Summary

- totalCandidates: 1488
- eligibleCandidates: 271
- blockedCandidates: 1217
- plannedSourceRows: 454
- blockedSourceRows: 1901

## Groups

| Group | Candidates | Planned rows | Blocked rows | Source ref type rows | Source type rows | Meaning |
| --- | ---: | ---: | ---: | --- | --- | --- |
| applied_high_confidence_item_sources | 271 | 454 | 0 | {"npc":299,"crate":90,"world":30,"container":13,"boss":12,"treasure_bag":10} | {"shop":157,"drop":154,"crate":90,"worldgen":28,"container":13,"treasure_bag":10,"mining":2} | All high-confidence item source candidates written through guarded local compat batches. |
| blocked_family_page_candidate | 1129 | 0 | 1326 | {"world":870,"npc":439,"boss":8,"crate":6,"container":3} | {"worldgen":855,"shop":425,"drop":22,"mining":15,"crate":6,"container":3} | Family/set/category page candidates; not safe for direct per-item import without family policy. |
| blocked_polluted_candidate | 88 | 0 | 575 | {"npc":324,"unknown":130,"container":86,"world":21,"boss":7,"treasure_bag":7} | {"drop":437,"container":86,"shop":24,"worldgen":15,"treasure_bag":7,"mining":6} | Polluted page candidates; need extraction/section repair or manual review before import. |

## applied_high_confidence_item_sources

| itemId | itemInternalName | itemName | pageTitle | plannedRows | blockedRows | sourceRefTypes | sourceTypes | blockedReason | examples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 961 | AncientCobaltBreastplate | Ancient Cobalt Breastplate | Ancient Cobalt armor | 2 | 0 | npc | drop |  | drop:npc:Hornet:-65 \| drop:npc:Man Eater:43 |
| 960 | AncientCobaltHelmet | Ancient Cobalt Helmet | Ancient Cobalt armor | 2 | 0 | npc | drop |  | drop:npc:Hornet:-65 \| drop:npc:Man Eater:43 |
| 962 | AncientCobaltLeggings | Ancient Cobalt Leggings | Ancient Cobalt armor | 2 | 0 | npc | drop |  | drop:npc:Hornet:-65 \| drop:npc:Man Eater:43 |
| 955 | AncientGoldHelmet | Ancient Gold Helmet | Gold armor | 2 | 0 | npc | drop |  | drop:npc:Skeleton:-53 \| drop:npc:Spore Skeleton:635 |
| 954 | AncientIronHelmet | Ancient Iron Helmet | Iron armor | 2 | 0 | npc | drop |  | drop:npc:Skeleton:-53 \| drop:npc:Spore Skeleton:635 |
| 959 | AncientNecroHelmet | Ancient Necro Helmet | Necro armor | 3 | 0 | npc | drop |  | drop:npc:Angry Bones:-14 \| drop:npc:Dark Caster:32 \| drop:npc:Librarian Skeleton:693 |
| 958 | AncientShadowGreaves | Ancient Shadow Greaves | Ancient Shadow armor | 1 | 0 | npc | drop |  | drop:npc:Eater of Souls:-12 |
| 956 | AncientShadowHelmet | Ancient Shadow Helmet | Ancient Shadow armor | 1 | 0 | npc | drop |  | drop:npc:Eater of Souls:-12 |
| 957 | AncientShadowScalemail | Ancient Shadow Scalemail | Ancient Shadow armor | 1 | 0 | npc | drop |  | drop:npc:Eater of Souls:-12 |
| 3874 | ApprenticeAltHead | Dark Artist's Hat | Dark Artist armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 3876 | ApprenticeAltPants | Dark Artist's Leggings | Dark Artist armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 3875 | ApprenticeAltShirt | Dark Artist's Robes | Dark Artist armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 2674 | ApprenticeBait | Apprentice Bait | Bait | 31 | 0 | crate, npc | crate, drop |  | crate:crate:Pearlwood Crate:3979 \| crate:crate:Wooden Crate:2334 \| crate:crate:Azure Crate:3985 |
| 3797 | ApprenticeHat | Apprentice's Hat | Apprentice armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 3798 | ApprenticeRobe | Apprentice's Robe | Apprentice armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 3799 | ApprenticeTrousers | Apprentice's Trousers | Apprentice armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 251 | ArchaeologistsHat | Archaeologist's Hat | Archaeologist's set | 1 | 0 | npc | drop |  | drop:npc:Doctor Bones:52 |
| 252 | ArchaeologistsJacket | Archaeologist's Jacket | Archaeologist's set | 1 | 0 | npc | drop |  | drop:npc:Doctor Bones:52 |
| 253 | ArchaeologistsPants | Archaeologist's Pants | Archaeologist's set | 1 | 0 | npc | drop |  | drop:npc:Doctor Bones:52 |
| 4319 | ArrowSign | Arrow Sign | Arrow Signs | 1 | 0 | npc | shop |  | shop:npc:Golfer:588 |
| 842 | BeeHat | Bee Hat | Bee set | 2 | 0 | boss, treasure_bag | drop, treasure_bag |  | drop:boss:Queen Bee:222 \| treasure_bag:treasure_bag:Treasure Bag (Queen Bee):3322 |
| 844 | BeePants | Bee Pants | Bee set | 2 | 0 | boss, treasure_bag | drop, treasure_bag |  | drop:boss:Queen Bee:222 \| treasure_bag:treasure_bag:Treasure Bag (Queen Bee):3322 |
| 843 | BeeShirt | Bee Shirt | Bee set | 2 | 0 | boss, treasure_bag | drop, treasure_bag |  | drop:boss:Queen Bee:222 \| treasure_bag:treasure_bag:Treasure Bag (Queen Bee):3322 |
| 2857 | BlueLunaticHood | Lunar Cultist Hood | Cultist set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 2859 | BlueLunaticRobe | Lunar Cultist Robe | Cultist set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 354 | Bookcase | Bookcase | Bookcases | 1 | 0 | world | worldgen |  | worldgen:world:Bookcases worldgen: |
| 3263 | BuccaneerBandana | Buccaneer Bandana | Buccaneer set | 4 | 0 | npc | drop |  | drop:npc:Pirate Corsair:213 \| drop:npc:Pirate Crossbower:215 \| drop:npc:Pirate Deadeye:214 |
| 3265 | BuccaneerPants | Buccaneer Pantaloons | Buccaneer set | 4 | 0 | npc | drop |  | drop:npc:Pirate Corsair:213 \| drop:npc:Pirate Crossbower:215 \| drop:npc:Pirate Deadeye:214 |
| 3264 | BuccaneerShirt | Buccaneer Tunic | Buccaneer set | 4 | 0 | npc | drop |  | drop:npc:Pirate Corsair:213 \| drop:npc:Pirate Crossbower:215 \| drop:npc:Pirate Deadeye:214 |
| 4560 | BunnyEars | Bunny Ears | Bunny set | 1 | 0 | npc | shop |  | shop:npc:Zoologist:633 |
| 4775 | BunnyTail | Bunny Tail | Bunny set | 1 | 0 | npc | shop |  | shop:npc:Zoologist:633 |
| 4741 | ButcherApron | Butcher's Bloodstained Apron | Butcher's set | 1 | 0 | npc | drop |  | drop:npc:Butcher:460 |
| 4740 | ButcherMask | Butcher Mask | Butcher's set | 1 | 0 | npc | drop |  | drop:npc:Butcher:460 |
| 4742 | ButcherPants | Butcher's Bloodstained Pants | Butcher's set | 1 | 0 | npc | drop |  | drop:npc:Butcher:460 |
| 586 | CandyCaneBlock | Candy Cane Block | Candy Cane Blocks | 1 | 0 | container | container |  | container:container:Present:1869 |
| 1783 | CandyCorn | Candy Corn | Candy Corn Rifle | 2 | 0 | npc | drop, shop |  | shop:npc:Arms Dealer:19 \| drop:npc:Pumpking:327 |
| 4555 | ChefHat | Chef Hat | Chef set | 1 | 0 | npc | shop |  | shop:npc:Traveling Merchant:368 |
| 4557 | ChefPants | Chef Pants | Chef set | 1 | 0 | npc | shop |  | shop:npc:Traveling Merchant:368 |
| 4556 | ChefShirt | Chef Uniform | Chef set | 1 | 0 | npc | shop |  | shop:npc:Traveling Merchant:368 |
| 3246 | ClothierJacket | Clothier's Jacket | Clothier's set | 2 | 0 | npc | drop, shop |  | shop:npc:Clothier:54 \| drop:npc:Clothier:54 |
| 3247 | ClothierPants | Clothier's Pants | Clothier's set | 2 | 0 | npc | drop, shop |  | shop:npc:Clothier:54 \| drop:npc:Clothier:54 |
| 503 | ClownHat | Clown Hat | Clown set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 505 | ClownPants | Clown Pants | Clown set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 504 | ClownShirt | Clown Shirt | Clown set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 3609 | ConveyorBeltLeft | Conveyor Belt (Clockwise) | Conveyor Belt | 1 | 0 | npc | shop |  | shop:npc:Steampunker:178 |
| 3610 | ConveyorBeltRight | Conveyor Belt (Counter Clockwise) | Conveyor Belt | 1 | 0 | npc | shop |  | shop:npc:Steampunker:178 |
| 345 | CookingPot | Cooking Pot | Cooking Pots | 1 | 0 | npc | shop |  | shop:npc:Witch Doctor:228 |
| 873 | CowboyHat | Cowboy Hat | Cowboy set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 874 | CowboyJacket | Cowboy Jacket | Cowboy set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 875 | CowboyPants | Cowboy Pants | Cowboy set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 4983 | CrystalNinjaChestplate | Crystal Assassin Shirt | Crystal Assassin armor | 2 | 0 | boss, treasure_bag | drop, treasure_bag |  | drop:boss:Queen Slime:657 \| treasure_bag:treasure_bag:Treasure Bag (Queen Slime):4957 |
| 4982 | CrystalNinjaHelmet | Crystal Assassin Hood | Crystal Assassin armor | 2 | 0 | boss, treasure_bag | drop, treasure_bag |  | drop:boss:Queen Slime:657 \| treasure_bag:treasure_bag:Treasure Bag (Queen Slime):4957 |
| 4984 | CrystalNinjaLeggings | Crystal Assassin Pants | Crystal Assassin armor | 2 | 0 | boss, treasure_bag | drop, treasure_bag |  | drop:boss:Queen Slime:657 \| treasure_bag:treasure_bag:Treasure Bag (Queen Slime):4957 |
| 1743 | CyborgHelmet | Cyborg Helmet | Cyborg set | 1 | 0 | npc | shop |  | shop:npc:Cyborg:209 |
| 1745 | CyborgPants | Cyborg Pants | Cyborg set | 1 | 0 | npc | shop |  | shop:npc:Cyborg:209 |
| 1744 | CyborgShirt | Cyborg Shirt | Cyborg set | 1 | 0 | npc | shop |  | shop:npc:Cyborg:209 |
| 4521 | Dirt1Echo | Layered Dirt Wall | Dirt Walls (natural) | 1 | 0 | world | worldgen |  | worldgen:world:Dirt Walls (natural) worldgen: |
| 4522 | Dirt2Echo | Crumbling Dirt Wall | Dirt Walls (natural) | 1 | 0 | world | worldgen |  | worldgen:world:Dirt Walls (natural) worldgen: |
| 4523 | Dirt3Echo | Cracked Dirt Wall | Dirt Walls (natural) | 1 | 0 | world | worldgen |  | worldgen:world:Dirt Walls (natural) worldgen: |
| 4524 | Dirt4Echo | Wavy Dirt Wall | Dirt Walls (natural) | 1 | 0 | world | worldgen |  | worldgen:world:Dirt Walls (natural) worldgen: |
| 5546 | DirtWallUnsafe | Natural Dirt Wall | Dirt Wall | 1 | 0 | world | worldgen |  | worldgen:world:Dirt Wall worldgen: |
| 4768 | DogEars | Dog Ears | Dog set | 1 | 0 | npc | shop |  | shop:npc:Zoologist:633 |
| 4769 | DogTail | Dog Tail | Dog set | 1 | 0 | npc | shop |  | shop:npc:Zoologist:633 |
| 5453 | DontHurtCrittersBookInactive | Guide to Critter Companionship (Inactive) | Guide to Critter Companionship | 1 | 0 | npc | shop |  | shop:npc:Zoologist:633 |
| 5454 | DontHurtNatureBookInactive | Guide to Environmental Preservation (Inactive) | Guide to Environmental Preservation | 1 | 0 | npc | shop |  | shop:npc:Dryad:20 |
| 4739 | DrManFlyLabCoat | Dr. Man Fly's Lab Coat | Dr. Man Fly set | 1 | 0 | npc | drop |  | drop:npc:Dr. Man Fly:468 |
| 4738 | DrManFlyMask | Dr. Man Fly Mask | Dr. Man Fly set | 1 | 0 | npc | drop |  | drop:npc:Dr. Man Fly:468 |
| 4673 | DrumStick | Drumstick | Drum Set | 1 | 0 | npc | shop |  | shop:npc:Merchant:17 |
| 1853 | DryadCoverings | Dryad Coverings | Dryad set | 1 | 0 | npc | shop |  | shop:npc:Dryad:20 |
| 1854 | DryadLoincloth | Dryad Loincloth | Dryad set | 1 | 0 | npc | shop |  | shop:npc:Dryad:20 |
| 1741 | DyeTraderRobe | Dye Trader Robe | Dye Trader's set | 1 | 0 | npc | shop |  | shop:npc:Dye Trader:207 |
| 3248 | DyeTraderTurban | Dye Trader's Turban | Dye Trader's set | 1 | 0 | npc | shop |  | shop:npc:Dye Trader:207 |
| 1943 | ElfHat | Elf Hat | Elf set | 1 | 0 | npc | drop |  | drop:npc:Zombie Elf:338 |
| 1945 | ElfPants | Elf Pants | Elf set | 1 | 0 | npc | drop |  | drop:npc:Zombie Elf:338 |
| 1944 | ElfShirt | Elf Shirt | Elf set | 1 | 0 | npc | drop |  | drop:npc:Zombie Elf:338 |
| 804 | EskimoCoat | Snow Coat | Snow armor | 1 | 0 | npc | drop |  | drop:npc:Frozen Zombie:161 |
| 803 | EskimoHood | Snow Hood | Snow armor | 1 | 0 | npc | drop |  | drop:npc:Frozen Zombie:161 |
| 805 | EskimoPants | Snow Pants | Snow armor | 1 | 0 | npc | drop |  | drop:npc:Frozen Zombie:161 |
| 1785 | ExplosiveJackOLantern | Explosive Jack 'O Lantern | Jack 'O Lantern Launcher | 2 | 0 | npc | drop, shop |  | shop:npc:Arms Dealer:19 \| drop:npc:Pumpking:327 |
| 3363 | FallenTuxedoPants | Fallen Tuxedo Pants | Fallen Tuxedo set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 3362 | FallenTuxedoShirt | Fallen Tuxedo Shirt | Fallen Tuxedo set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 270 | FamiliarPants | Familiar Pants | Familiar set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 269 | FamiliarShirt | Familiar Shirt | Familiar set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 271 | FamiliarWig | Familiar Wig | Familiar set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 3733 | FlowerBoyHat | Silly Sunflower Petals | Silly Sunflower set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 3735 | FlowerBoyPants | Silly Sunflower Bottoms | Silly Sunflower set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 3734 | FlowerBoyShirt | Silly Sunflower Tops | Silly Sunflower set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 4770 | FoxEars | Fox Ears | Fox set (Zoologist) | 1 | 0 | npc | shop |  | shop:npc:Zoologist:633 |
| 4771 | FoxTail | Fox Tail | Fox set (Zoologist) | 1 | 0 | npc | shop |  | shop:npc:Zoologist:633 |
| 4705 | FuneralCoat | Funeral Coat | Funeral set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 4704 | FuneralHat | Funeral Hat | Funeral set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 4706 | FuneralPants | Funeral Pants | Funeral set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 4322 | GameMasterPants | Master Gamer's Pants | Master Gamer's set | 1 | 0 | npc | shop |  | shop:npc:Traveling Merchant:368 |
| 4321 | GameMasterShirt | Master Gamer's Jacket | Master Gamer's set | 1 | 0 | npc | shop |  | shop:npc:Traveling Merchant:368 |
| 3188 | GladiatorBreastplate | Gladiator Breastplate | Gladiator armor | 1 | 0 | npc | drop |  | drop:npc:Hoplite:481 |
| 3187 | GladiatorHelmet | Gladiator Helmet | Gladiator armor | 1 | 0 | npc | drop |  | drop:npc:Hoplite:481 |
| 3189 | GladiatorLeggings | Gladiator Leggings | Gladiator armor | 1 | 0 | npc | drop |  | drop:npc:Hoplite:481 |
| 83 | GoldChainmail | Gold Chainmail | Gold armor | 2 | 0 | npc | drop |  | drop:npc:Skeleton:-53 \| drop:npc:Spore Skeleton:635 |
| 79 | GoldGreaves | Gold Greaves | Gold armor | 2 | 0 | npc | drop |  | drop:npc:Skeleton:-53 \| drop:npc:Spore Skeleton:635 |
| 92 | GoldHelmet | Gold Helmet | Gold armor | 2 | 0 | npc | drop |  | drop:npc:Skeleton:-53 \| drop:npc:Spore Skeleton:635 |
| 3989 | GolfBall | Golf Ball | Golf Balls | 1 | 0 | npc | shop |  | shop:npc:Golfer:588 |
| 4135 | GolfHat | Country Club Cap | Country Club set | 1 | 0 | npc | shop |  | shop:npc:Golfer:588 |
| 4137 | GolfPants | Country Club Trousers | Country Club set | 1 | 0 | npc | shop |  | shop:npc:Golfer:588 |
| 4136 | GolfShirt | Country Club Vest | Country Club set | 1 | 0 | npc | shop |  | shop:npc:Golfer:588 |
| 4138 | GolfVisor | Country Club Visor | Country Club set | 1 | 0 | npc | shop |  | shop:npc:Golfer:588 |
| 4996 | GraduationCapBlack | Black Graduation Cap | Black Graduation set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 4994 | GraduationCapBlue | Blue Graduation Cap | Blue Graduation set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 4995 | GraduationCapMaroon | Maroon Graduation Cap | Maroon Graduation set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 4999 | GraduationGownBlack | Black Graduation Gown | Black Graduation set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 4997 | GraduationGownBlue | Blue Graduation Gown | Blue Graduation set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 4998 | GraduationGownMaroon | Maroon Graduation Gown | Maroon Graduation set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 359 | GrandfatherClock | Grandfather Clock | Grandfather Clocks | 1 | 0 | world | worldgen |  | worldgen:world:Grandfather Clocks worldgen: |
| 3340 | HardenedSandWall | Hardened Sand Wall | Hardened Sand Walls | 1 | 0 | world | worldgen |  | worldgen:world:Hardened Sand Walls worldgen: |
| 3877 | HuntressAltHead | Red Riding Hood | Red Riding armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 3879 | HuntressAltPants | Red Riding Leggings | Red Riding armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 3878 | HuntressAltShirt | Red Riding Dress | Red Riding armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 3804 | HuntressJerkin | Huntress's Jerkin | Huntress armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 3805 | HuntressPants | Huntress's Pants | Huntress armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 3803 | HuntressWig | Huntress's Wig | Huntress armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 664 | IceBlock | Ice Block | Ice Blocks | 2 | 0 | world | mining, worldgen |  | worldgen:world:Ice Blocks worldgen: \| mining:world:Ice Blocks vein: |
| 81 | IronChainmail | Iron Chainmail | Iron armor | 2 | 0 | npc | drop |  | drop:npc:Skeleton:-53 \| drop:npc:Spore Skeleton:635 |
| 77 | IronGreaves | Iron Greaves | Iron armor | 2 | 0 | npc | drop |  | drop:npc:Skeleton:-53 \| drop:npc:Spore Skeleton:635 |
| 90 | IronHelmet | Iron Helmet | Iron armor | 2 | 0 | npc | drop |  | drop:npc:Skeleton:-53 \| drop:npc:Spore Skeleton:635 |
| 2675 | JourneymanBait | Journeyman Bait | Bait | 31 | 0 | crate, npc | crate, drop |  | crate:crate:Pearlwood Crate:3979 \| crate:crate:Wooden Crate:2334 \| crate:crate:Azure Crate:3985 |
| 4529 | Jungle1Echo | Lichen Stone Wall | Jungle Walls (natural) | 1 | 0 | world | worldgen |  | worldgen:world:Jungle Walls (natural) worldgen: |
| 4530 | Jungle2Echo | Leafy Jungle Wall | Jungle Walls (natural) | 1 | 0 | world | worldgen |  | worldgen:world:Jungle Walls (natural) worldgen: |
| 4531 | Jungle3Echo | Ivy Stone Wall | Jungle Walls (natural) | 1 | 0 | world | worldgen |  | worldgen:world:Jungle Walls (natural) worldgen: |
| 4532 | Jungle4Echo | Jungle Vine Wall | Jungle Walls (natural) | 1 | 0 | world | worldgen |  | worldgen:world:Jungle Walls (natural) worldgen: |
| 3786 | LamiaHat | Lamia Mask | Lamia set | 1 | 0 | npc | drop |  | drop:npc:Lamia:528 |
| 3784 | LamiaPants | Lamia Tail | Lamia set | 1 | 0 | npc | drop |  | drop:npc:Lamia:528 |
| 3785 | LamiaShirt | Lamia Wraps | Lamia set | 1 | 0 | npc | drop |  | drop:npc:Lamia:528 |
| 1101 | LihzahrdBrick | Lihzahrd Brick | Lihzahrd Brick | 1 | 0 | boss | drop |  | drop:boss:Plantera:262 |
| 5376 | LihzahrdWallUnsafe | Forbidden Lihzahrd Brick Wall | Lihzahrd Brick Wall | 2 | 0 | boss, world | drop, worldgen |  | drop:boss:Plantera:262 \| worldgen:world:Lihzahrd Brick Wall worldgen: |
| 5681 | LilacDuskBody | Lilac Dusk Dress | Lilac Dusk set | 1 | 0 | npc | shop |  | shop:npc:Traveling Merchant:368 |
| 5680 | LilacDuskHead | Lilac Dusk Hairclip | Lilac Dusk set | 1 | 0 | npc | shop |  | shop:npc:Traveling Merchant:368 |
| 5682 | LilacDuskLegs | Lilac Dusk Skirt | Lilac Dusk set | 1 | 0 | npc | shop |  | shop:npc:Traveling Merchant:368 |
| 5390 | LincolnsHood | Raynbro's Hood | Raynbro's set | 1 | 0 | npc | shop |  | shop:npc:Traveling Merchant:368 |
| 5386 | LincolnsHoodie | Raynbro's Hoodie | Raynbro's set | 1 | 0 | npc | shop |  | shop:npc:Traveling Merchant:368 |
| 5387 | LincolnsPants | Raynbro's Pants | Raynbro's set | 1 | 0 | npc | shop |  | shop:npc:Traveling Merchant:368 |
| 4772 | LizardEars | Lizard Ears | Lizard set | 1 | 0 | npc | shop |  | shop:npc:Zoologist:633 |
| 4773 | LizardTail | Lizard Tail | Lizard set | 1 | 0 | npc | shop |  | shop:npc:Zoologist:633 |
| 50 | MagicMirror | Magic Mirror | Magic Mirrors | 5 | 0 | container, npc, world | container, drop, worldgen |  | container:container:Gold Chest:306 \| drop:npc:Mimics:85 \| drop:npc:Mimic:85 |
| 2803 | MartianCostumeMask | Martian Costume Mask | Martian Costume set | 4 | 0 | npc | drop |  | drop:npc:Brain Scrambler:381 \| drop:npc:Gray Grunt:385 \| drop:npc:Ray Gunner:382 |
| 2805 | MartianCostumePants | Martian Costume Pants | Martian Costume set | 4 | 0 | npc | drop |  | drop:npc:Brain Scrambler:381 \| drop:npc:Gray Grunt:385 \| drop:npc:Ray Gunner:382 |
| 2804 | MartianCostumeShirt | Martian Costume Shirt | Martian Costume set | 4 | 0 | npc | drop |  | drop:npc:Brain Scrambler:381 \| drop:npc:Gray Grunt:385 \| drop:npc:Ray Gunner:382 |
| 2806 | MartianUniformHelmet | Martian Uniform Helmet | Martian Uniform set | 3 | 0 | npc | drop |  | drop:npc:Gigazapper:389 \| drop:npc:Martian Engineer:386 \| drop:npc:Martian Officer:383 |
| 2808 | MartianUniformPants | Martian Uniform Pants | Martian Uniform set | 3 | 0 | npc | drop |  | drop:npc:Gigazapper:389 \| drop:npc:Martian Engineer:386 \| drop:npc:Martian Officer:383 |
| 2807 | MartianUniformTorso | Martian Uniform Torso | Martian Uniform set | 3 | 0 | npc | drop |  | drop:npc:Gigazapper:389 \| drop:npc:Martian Engineer:386 \| drop:npc:Martian Officer:383 |
| 2676 | MasterBait | Master Bait | Bait | 31 | 0 | crate, npc | crate, drop |  | crate:crate:Pearlwood Crate:3979 \| crate:crate:Wooden Crate:2334 \| crate:crate:Azure Crate:3985 |
| 88 | MiningHelmet | Mining Helmet | Mining armor | 3 | 0 | npc | drop, shop |  | drop:npc:Undead Miner:44 \| drop:npc:Undead Miner:44 \| shop:npc:Merchant:17 |
| 411 | MiningPants | Mining Pants | Mining armor | 3 | 0 | npc | drop, shop |  | drop:npc:Undead Miner:44 \| drop:npc:Undead Miner:44 \| shop:npc:Merchant:17 |
| 410 | MiningShirt | Mining Shirt | Mining armor | 3 | 0 | npc | drop, shop |  | drop:npc:Undead Miner:44 \| drop:npc:Undead Miner:44 \| shop:npc:Merchant:17 |
| 3880 | MonkAltHead | Shinobi Infiltrator's Helmet | Shinobi Infiltrator armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 3882 | MonkAltPants | Shinobi Infiltrator's Pants | Shinobi Infiltrator armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 3881 | MonkAltShirt | Shinobi Infiltrator's Torso | Shinobi Infiltrator armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 3806 | MonkBrows | Monk's Bushy Brow Bald Cap | Monk armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 3808 | MonkPants | Monk's Pants | Monk armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 3807 | MonkShirt | Monk's Shirt | Monk armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 1932 | MrsClauseHat | Mrs. Claus Hat | Mrs. Claus set | 1 | 0 | container | container |  | container:container:Present:1869 |
| 1934 | MrsClauseHeels | Mrs. Claus Heels | Mrs. Claus set | 1 | 0 | container | container |  | container:container:Present:1869 |
| 1933 | MrsClauseShirt | Mrs. Claus Shirt | Mrs. Claus set | 1 | 0 | container | container |  | container:container:Present:1869 |
| 4779 | MushroomHat | Mushroom Hat | Mushroom set | 1 | 0 | world | worldgen |  | worldgen:world:Mushroom set worldgen: |
| 4781 | MushroomPants | Mushroom Pants | Mushroom set | 1 | 0 | world | worldgen |  | worldgen:world:Mushroom set worldgen: |
| 4780 | MushroomVest | Mushroom Vest | Mushroom set | 1 | 0 | world | worldgen |  | worldgen:world:Mushroom set worldgen: |
| 3108 | Nail | Nail | Nail Gun | 3 | 0 | npc | shop, drop |  | shop:npc:Arms Dealer:19 \| shop:npc:Merchant:17 \| drop:npc:Nailhead:463 |
| 152 | NecroBreastplate | Necro Breastplate | Necro armor | 3 | 0 | npc | drop |  | drop:npc:Angry Bones:-14 \| drop:npc:Dark Caster:32 \| drop:npc:Librarian Skeleton:693 |
| 153 | NecroGreaves | Necro Greaves | Necro armor | 3 | 0 | npc | drop |  | drop:npc:Angry Bones:-14 \| drop:npc:Dark Caster:32 \| drop:npc:Librarian Skeleton:693 |
| 151 | NecroHelmet | Necro Helmet | Necro armor | 3 | 0 | npc | drop |  | drop:npc:Angry Bones:-14 \| drop:npc:Dark Caster:32 \| drop:npc:Librarian Skeleton:693 |
| 256 | NinjaHood | Ninja Hood | Ninja armor | 2 | 0 | boss, treasure_bag | drop, treasure_bag |  | drop:boss:King Slime:50 \| treasure_bag:treasure_bag:Treasure Bag (King Slime):3318 |
| 258 | NinjaPants | Ninja Pants | Ninja armor | 2 | 0 | boss, treasure_bag | drop, treasure_bag |  | drop:boss:King Slime:50 \| treasure_bag:treasure_bag:Treasure Bag (King Slime):3318 |
| 257 | NinjaShirt | Ninja Shirt | Ninja armor | 2 | 0 | boss, treasure_bag | drop, treasure_bag |  | drop:boss:King Slime:50 \| treasure_bag:treasure_bag:Treasure Bag (King Slime):3318 |
| 1736 | NurseHat | Nurse Hat | Nurse set | 1 | 0 | npc | shop |  | shop:npc:Arms Dealer:19 |
| 1738 | NursePants | Nurse Pants | Nurse set | 1 | 0 | npc | shop |  | shop:npc:Arms Dealer:19 |
| 1737 | NurseShirt | Nurse Shirt | Nurse set | 1 | 0 | npc | shop |  | shop:npc:Arms Dealer:19 |
| 5735 | PalworldPalMetalArmorBody | Pal Metal Chestplate | Pal Metal set | 1 | 0 | npc | shop |  | shop:npc:Traveling Merchant:368 |
| 5736 | PalworldPalMetalArmorLegs | Pal Metal Leggings | Pal Metal set | 1 | 0 | npc | shop |  | shop:npc:Traveling Merchant:368 |
| 4343 | PaperAirplaneA | Paper Airplane | Paper Airplanes | 1 | 0 | npc | drop |  | drop:npc:Windy Balloon:594 |
| 1936 | ParkaCoat | Parka Coat | Parka set | 1 | 0 | container | container |  | container:container:Present:1869 |
| 1935 | ParkaHood | Parka Hood | Parka set | 1 | 0 | container | container |  | container:container:Present:1869 |
| 1937 | ParkaPants | Parka Pants | Parka set | 1 | 0 | container | container |  | container:container:Present:1869 |
| 3757 | PedguinHat | Pedguin's Hood | Pedguin's set | 2 | 0 | npc | drop |  | drop:npc:Corrupt Penguin:168 \| drop:npc:Vicious Penguin:470 |
| 3759 | PedguinPants | Pedguin's Trousers | Pedguin's set | 2 | 0 | npc | drop |  | drop:npc:Corrupt Penguin:168 \| drop:npc:Vicious Penguin:470 |
| 3758 | PedguinShirt | Pedguin's Jacket | Pedguin's set | 2 | 0 | npc | drop |  | drop:npc:Corrupt Penguin:168 \| drop:npc:Vicious Penguin:470 |
| 333 | Piano | Piano | Pianos | 1 | 0 | world | worldgen |  | worldgen:world:Pianos worldgen: |
| 876 | PirateHat | Pirate Hat | Pirate set | 1 | 0 | npc | shop |  | shop:npc:Pirate:229 |
| 878 | PiratePants | Pirate Pants | Pirate set | 1 | 0 | npc | shop |  | shop:npc:Pirate:229 |
| 877 | PirateShirt | Pirate Shirt | Pirate set | 1 | 0 | npc | shop |  | shop:npc:Pirate:229 |
| 5046 | PlaguebringerChestplate | Plaguebringer's Cloak | Plaguebringer's set | 1 | 0 | world | worldgen |  | worldgen:world:Plaguebringer's set worldgen: |
| 5047 | PlaguebringerGreaves | Plaguebringer's Treads | Plaguebringer's set | 1 | 0 | world | worldgen |  | worldgen:world:Plaguebringer's set worldgen: |
| 5045 | PlaguebringerHelmet | Plaguebringer's Skull | Plaguebringer's set | 1 | 0 | world | worldgen |  | worldgen:world:Plaguebringer's set worldgen: |
| 244 | PlumbersHat | Plumber's Hat | Plumber's set | 2 | 0 | npc | drop, shop |  | shop:npc:Clothier:54 \| drop:npc:Fire Imp:24 |
| 246 | PlumbersPants | Plumber's Pants | Plumber's set | 2 | 0 | npc | drop, shop |  | shop:npc:Clothier:54 \| drop:npc:Fire Imp:24 |
| 245 | PlumbersShirt | Plumber's Shirt | Plumber's set | 2 | 0 | npc | drop, shop |  | shop:npc:Clothier:54 \| drop:npc:Fire Imp:24 |
| 4665 | PrettyPinkDressPants | Pretty Pink Stockings | Pretty Pink set | 1 | 0 | npc | shop |  | shop:npc:Traveling Merchant:368 |
| 4664 | PrettyPinkDressSkirt | Pretty Pink Dress | Pretty Pink set | 1 | 0 | npc | shop |  | shop:npc:Traveling Merchant:368 |
| 4666 | PrettyPinkRibbon | Pretty Pink Ribbon | Pretty Pink set | 1 | 0 | npc | shop |  | shop:npc:Traveling Merchant:368 |
| 5080 | PrinceCape | Prince Cape | Prince set | 1 | 0 | npc | shop |  | shop:npc:Princess:663 |
| 5079 | PrincePants | Prince Pants | Prince set | 1 | 0 | npc | shop |  | shop:npc:Princess:663 |
| 5078 | PrinceUniform | Prince Uniform | Prince set | 1 | 0 | npc | shop |  | shop:npc:Princess:663 |
| 66 | PurificationPowder | Purification Powder | Thrown Powder | 1 | 0 | npc | shop |  | shop:npc:Dryad:20 |
| 1136 | RainCoat | Rain Coat | Rain armor | 1 | 0 | npc | drop |  | drop:npc:Raincoat Zombie:223 |
| 1135 | RainHat | Rain Hat | Rain armor | 1 | 0 | npc | drop |  | drop:npc:Raincoat Zombie:223 |
| 260 | RedHat | Red Hat | Clothier's set | 2 | 0 | npc | drop, shop |  | shop:npc:Clothier:54 \| drop:npc:Clothier:54 |
| 5073 | RoyalDressBottom | Royal Dress | Royal set | 1 | 0 | npc | shop |  | shop:npc:Princess:663 |
| 5072 | RoyalDressTop | Royal Blouse | Royal set | 1 | 0 | npc | shop |  | shop:npc:Princess:663 |
| 5071 | RoyalTiara | Royal Tiara | Royal set | 1 | 0 | npc | shop |  | shop:npc:Princess:663 |
| 5330 | RubblemakerLarge | Rubblemaker (Large) | Rubblemaker | 1 | 0 | npc | shop |  | shop:npc:Goblin Tinkerer:107 |
| 5329 | RubblemakerMedium | Rubblemaker (Medium) | Rubblemaker | 1 | 0 | npc | shop |  | shop:npc:Goblin Tinkerer:107 |
| 5324 | RubblemakerSmall | Rubblemaker (Small) | Rubblemaker | 1 | 0 | npc | shop |  | shop:npc:Goblin Tinkerer:107 |
| 754 | RuneHat | Rune Hat | Rune set | 1 | 0 | npc | drop |  | drop:npc:Rune Wizard:172 |
| 755 | RuneRobe | Rune Robe | Rune set | 1 | 0 | npc | drop |  | drop:npc:Rune Wizard:172 |
| 1277 | SailorHat | Sailor Hat | Sailor set | 4 | 0 | npc | drop |  | drop:npc:Pirate Corsair:213 \| drop:npc:Pirate Crossbower:215 \| drop:npc:Pirate Deadeye:214 |
| 1280 | SailorPants | Sailor Pants | Sailor set | 4 | 0 | npc | drop |  | drop:npc:Pirate Corsair:213 \| drop:npc:Pirate Crossbower:215 \| drop:npc:Pirate Deadeye:214 |
| 1279 | SailorShirt | Sailor Shirt | Sailor set | 4 | 0 | npc | drop |  | drop:npc:Pirate Corsair:213 \| drop:npc:Pirate Crossbower:215 \| drop:npc:Pirate Deadeye:214 |
| 169 | SandBlock | Sand Block | Sand Blocks | 1 | 0 | world | worldgen |  | worldgen:world:Sand Blocks worldgen: |
| 3271 | Sandstone | Sandstone Block | Sandstone Blocks | 1 | 0 | world | worldgen |  | worldgen:world:Sandstone Blocks worldgen: |
| 3273 | SandstoneWall | Sandstone Wall | Sandstone Walls | 1 | 0 | world | worldgen |  | worldgen:world:Sandstone Walls worldgen: |
| 588 | SantaHat | Santa Hat | Santa set | 1 | 0 | npc | shop |  | shop:npc:Santa Claus:142 |
| 590 | SantaPants | Santa Pants | Santa set | 1 | 0 | npc | shop |  | shop:npc:Santa Claus:142 |
| 589 | SantaShirt | Santa Shirt | Santa set | 1 | 0 | npc | shop |  | shop:npc:Santa Claus:142 |
| 1788 | ScarecrowHat | Scarecrow Hat | Scarecrow set | 1 | 0 | npc | drop |  | drop:npc:Scarecrow:305 |
| 1790 | ScarecrowPants | Scarecrow Pants | Scarecrow set | 1 | 0 | npc | drop |  | drop:npc:Scarecrow:305 |
| 1789 | ScarecrowShirt | Scarecrow Shirt | Scarecrow set | 1 | 0 | npc | drop |  | drop:npc:Scarecrow:305 |
| 2157 | Scorpion | Scorpion | Scorpions | 1 | 0 | world | worldgen |  | worldgen:world:Scorpions worldgen: |
| 3871 | SquireAltHead | Valhalla Knight's Helm | Valhalla Knight armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 3873 | SquireAltPants | Valhalla Knight's Greaves | Valhalla Knight armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 3872 | SquireAltShirt | Valhalla Knight's Breastplate | Valhalla Knight armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 3800 | SquireGreatHelm | Squire's Great Helm | Squire armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 3802 | SquireGreaves | Squire's Greaves | Squire armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 3801 | SquirePlating | Squire's Plating | Squire armor | 1 | 0 | npc | shop |  | shop:npc:Tavernkeep:550 |
| 1836 | Stake | Stake | Stake Launcher | 3 | 0 | npc | shop, drop |  | shop:npc:Arms Dealer:19 \| shop:npc:Witch Doctor:228 \| drop:npc:Mourning Wood:325 |
| 4323 | StarPrincessCrown | Star Princess Crown | Star Princess set | 1 | 0 | npc | shop |  | shop:npc:Traveling Merchant:368 |
| 4324 | StarPrincessDress | Star Princess Dress | Star Princess set | 1 | 0 | npc | shop |  | shop:npc:Traveling Merchant:368 |
| 839 | SteampunkHat | Steampunk Hat | Steampunk set | 1 | 0 | npc | shop |  | shop:npc:Steampunker:178 |
| 841 | SteampunkPants | Steampunk Pants | Steampunk set | 1 | 0 | npc | shop |  | shop:npc:Steampunker:178 |
| 840 | SteampunkShirt | Steampunk Shirt | Steampunk set | 1 | 0 | npc | shop |  | shop:npc:Steampunker:178 |
| 1261 | StyngerBolt | Stynger Bolt | Stynger | 4 | 0 | npc, boss, treasure_bag | shop, drop, treasure_bag |  | shop:npc:Arms Dealer:19 \| shop:npc:Witch Doctor:228 \| drop:boss:Golem:245 |
| 3242 | TaxCollectorHat | Tax Collector's Hat | Tax Collector's set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 3244 | TaxCollectorPants | Tax Collector's Pants | Tax Collector's set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 3243 | TaxCollectorSuit | Tax Collector's Suit | Tax Collector's set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 3479 | TheBrideDress | Wedding Dress | Wedding set | 1 | 0 | npc | drop |  | drop:npc:The Bride:536 |
| 3478 | TheBrideHat | Wedding Veil | Wedding set | 1 | 0 | npc | drop |  | drop:npc:The Bride:536 |
| 326 | TheDoctorsPants | The Doctor's Pants | The Doctor's set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 325 | TheDoctorsShirt | The Doctor's Shirt | The Doctor's set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 864 | Tiara | Tiara | Princess set (Clothier) | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 1159 | TikiMask | Tiki Mask | Tiki armor | 1 | 0 | npc | shop |  | shop:npc:Witch Doctor:228 |
| 1161 | TikiPants | Tiki Pants | Tiki armor | 1 | 0 | npc | shop |  | shop:npc:Witch Doctor:228 |
| 1160 | TikiShirt | Tiki Shirt | Tiki armor | 1 | 0 | npc | shop |  | shop:npc:Witch Doctor:228 |
| 239 | TopHat | Top Hat | Tuxedo set | 1 | 0 | npc | drop |  | drop:npc:The Groom:53 |
| 1940 | TreeMask | Tree Mask | Tree set | 1 | 0 | container | container |  | container:container:Present:1869 |
| 1941 | TreeShirt | Tree Shirt | Tree set | 1 | 0 | container | container |  | container:container:Present:1869 |
| 1942 | TreeTrunks | Tree Trunks | Tree set | 1 | 0 | container | container |  | container:container:Present:1869 |
| 241 | TuxedoPants | Tuxedo Pants | Tuxedo set | 1 | 0 | npc | drop |  | drop:npc:The Groom:53 |
| 240 | TuxedoShirt | Tuxedo Shirt | Tuxedo set | 1 | 0 | npc | drop |  | drop:npc:The Groom:53 |
| 5391 | UncumberingStone | Uncumbering Stone | Encumbering Stone | 2 | 0 | container, world | container, worldgen |  | container:container:Sandstone Chest:4267 \| worldgen:world:Encumbering Stone worldgen: |
| 4686 | UndertakerCoat | Gravedigger Coat | Gravedigger set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 4685 | UndertakerHat | Gravedigger Hat | Gravedigger set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 2886 | ViciousPowder | Vicious Powder | Thrown Powder | 1 | 0 | npc | shop |  | shop:npc:Dryad:20 |
| 4709 | VictorianGothDress | Victorian Goth Dress | Victorian Goth set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 4708 | VictorianGothHat | Victorian Goth Hat | Victorian Goth set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 67 | VilePowder | Vile Powder | Thrown Powder | 1 | 0 | npc | shop |  | shop:npc:Dryad:20 |
| 2856 | WhiteLunaticHood | Solar Cultist Hood | Cultist set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 2858 | WhiteLunaticRobe | Solar Cultist Robe | Cultist set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 1289 | WhiteTuxedoPants | White Tuxedo Pants | White Tuxedo set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 1288 | WhiteTuxedoShirt | White Tuxedo Shirt | White Tuxedo set | 1 | 0 | npc | shop |  | shop:npc:Clothier:54 |
| 5105 | WilsonBeardLong | Gentleman's Long Beard | Gentleman's set | 1 | 0 | npc | shop |  | shop:npc:Stylist:353 |
| 5106 | WilsonBeardMagnificent | Gentleman's Magnificent Beard | Gentleman's set | 1 | 0 | npc | shop |  | shop:npc:Stylist:353 |
| 5104 | WilsonBeardShort | Gentleman's Beard | Gentleman's set | 1 | 0 | npc | shop |  | shop:npc:Stylist:353 |
| 5103 | WilsonPants | Gentleman's Trousers | Gentleman's set | 1 | 0 | npc | shop |  | shop:npc:Stylist:353 |
| 5102 | WilsonShirt | Gentleman's Vest | Gentleman's set | 1 | 0 | npc | shop |  | shop:npc:Stylist:353 |
| 9 | Wood | Wood | Woods | 2 | 0 | world | mining, worldgen |  | mining:world:Woods vein: \| worldgen:world:Woods worldgen: |

## blocked_family_page_candidate

| itemId | itemInternalName | itemName | pageTitle | plannedRows | blockedRows | sourceRefTypes | sourceTypes | blockedReason | examples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 5550 | AetheriumBookcase | Aetherium Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 5557 | AetheriumClock | Aetherium Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 5561 | AetheriumPiano | Aetherium Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 5565 | AetheriumTable | Aetherium Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 5566 | AetheriumWorkbench | Aetherium Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 5220 | AHorribleNightforAlchemy | A Horrible Night for Alchemy | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 2702 | AlphabetStatue0 | '0' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2703 | AlphabetStatue1 | '1' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2704 | AlphabetStatue2 | '2' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2705 | AlphabetStatue3 | '3' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2706 | AlphabetStatue4 | '4' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2707 | AlphabetStatue5 | '5' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2708 | AlphabetStatue6 | '6' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2709 | AlphabetStatue7 | '7' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2710 | AlphabetStatue8 | '8' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2711 | AlphabetStatue9 | '9' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2712 | AlphabetStatueA | 'A' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2713 | AlphabetStatueB | 'B' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2714 | AlphabetStatueC | 'C' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2715 | AlphabetStatueD | 'D' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2716 | AlphabetStatueE | 'E' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2717 | AlphabetStatueF | 'F' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2718 | AlphabetStatueG | 'G' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2719 | AlphabetStatueH | 'H' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2720 | AlphabetStatueI | 'I' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2721 | AlphabetStatueJ | 'J' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2722 | AlphabetStatueK | 'K' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2723 | AlphabetStatueL | 'L' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2724 | AlphabetStatueM | 'M' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2725 | AlphabetStatueN | 'N' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2726 | AlphabetStatueO | 'O' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2727 | AlphabetStatueP | 'P' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2728 | AlphabetStatueQ | 'Q' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2729 | AlphabetStatueR | 'R' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2730 | AlphabetStatueS | 'S' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2731 | AlphabetStatueT | 'T' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2732 | AlphabetStatueU | 'U' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2733 | AlphabetStatueV | 'V' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2734 | AlphabetStatueW | 'W' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2735 | AlphabetStatueX | 'X' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2736 | AlphabetStatueY | 'Y' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2737 | AlphabetStatueZ | 'Z' Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 5227 | AMachineforTerrarians | A Machine for Terrarians | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1495 | AmericanExplosive | American Explosive | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 4635 | AncientTablet | Ancient Tablet | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 4626 | AndrewSphinx | Andrew Sphinx | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 52 | AngelStatue | Angel Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 468 | AnvilStatue | Anvil Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 4389 | ArgonMoss | Argon Moss | Moss | 0 | 3 | world, npc | worldgen, drop | family_page_candidate | drop:npc:Moss Zombie:691 \| worldgen:world:Moss worldgen: \| worldgen:world:Moss worldgen: |
| 360 | ArmorStatue | Armor Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 5192 | AshWoodBookcase | Ash Wood Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 5199 | AshWoodClock | Ash Wood Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 5217 | AshWoodFence | Ash Wood Fence | Fences | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Fences worldgen: |
| 5203 | AshWoodPiano | Ash Wood Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 5207 | AshWoodTable | Ash Wood Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 5208 | AshWoodWorkbench | Ash Wood Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 5273 | AuroraBorealis | Aurora Borealis | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 465 | AxeStatue | Axe Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 5171 | BalloonBookcase | Balloon Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 5178 | BalloonClock | Balloon Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 5182 | BalloonPiano | Balloon Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 5186 | BalloonTable | Balloon Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 5187 | BalloonWorkbench | Balloon Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 4568 | BambooBookcase | Bamboo Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 4575 | BambooClock | Bamboo Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 4667 | BambooFence | Bamboo Fence | Fences | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Fences worldgen: |
| 4579 | BambooPiano | Bamboo Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 4583 | BambooTable | Bamboo Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 4584 | BambooWorkbench | Bamboo Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 4638 | BandageBoy | Bandage Boy | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5529 | BannerOfTheBeast | Banner of the Beast | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1714 | BanquetTable | Banquet Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 1715 | Bar | Bar | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 443 | BatStatue | Bat Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 5229 | BennyWarhol | Benny Warhol | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5270 | Bifrost | Bifrost | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5267 | Bioluminescence | Bioluminescence | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 464 | BirdStatue | Bird Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1847 | BitterHarvest | Bitter Harvest | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 4334 | BlackDragonfly | Black Dragonfly | Dragonflies | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Dragonflies worldgen: |
| 1097 | BlackPaint | Black Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 2156 | BlackScorpion | Black Scorpion | Scorpions | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Scorpions worldgen: |
| 254 | BlackThread | Black Thread | Threads | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Clothier:54 |
| 5254 | BlessingfromTheHeavens | Blessing from the Heavens | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3219 | BlinkrootPlanterBox | Blinkroot Planter Box | Planter Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 1848 | BloodMoonCountess | Blood Moon Countess | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1372 | BloodMoonRising | Blood Moon Rising | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 945 | BloodWaterFountain | Blood Water Fountain | Water fountains | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Witch Doctor:228 |
| 4728 | BloodyGoblet | Bloody Goblet | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3720 | BloodZombieStatue | Blood Zombie Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1903 | BlueAndGreenLights | Blue and Green Lights | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 1905 | BlueAndYellowLights | Blue and Yellow Lights | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 134 | BlueBrick | Blue Brick | Dungeon Bricks | 0 | 3 | crate, world | crate, mining | family_page_candidate | crate:crate:Dungeon Crate:3205 \| crate:crate:Stockade Crate:3984 \| mining:world:Dungeon Bricks vein: |
| 4335 | BlueDragonfly | Blue Dragonfly | Dragonflies | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Dragonflies worldgen: |
| 1414 | BlueDungeonBookcase | Blue Dungeon Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2376 | BlueDungeonPiano | Blue Dungeon Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 1397 | BlueDungeonTable | Blue Dungeon Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 1408 | BlueDungeonVase | Blue Dungeon Vase | Vases | 0 | 1 | world | mining | family_page_candidate | mining:world:Vases vein: |
| 1398 | BlueDungeonWorkBench | Blue Dungeon Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 2262 | BlueDynastyShingles | Blue Dynasty Shingles | Dynasty Shingles | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 1956 | BluegreenWallpaper | Bluegreen Wallpaper | Wallpapers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Painter:227 |
| 596 | BlueLight | Blue Light | Christmas lights | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 1898 | BlueLights | Blue Lights | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 4352 | BlueMoss | Blue Moss | Moss | 0 | 3 | world, npc | worldgen, drop | family_page_candidate | drop:npc:Moss Zombie:691 \| worldgen:world:Moss worldgen: \| worldgen:world:Moss worldgen: |
| 1081 | BluePaint | Blue Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 852 | BluePressurePlate | Blue Pressure Plate | Pressure Plates | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Mechanic:124 |
| 972 | BlueRocket | Blue Rocket | Firework Rockets | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Party Girl:208 |
| 781 | BlueSolution | Blue Solution | Solutions | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Steampunker:178 |
| 850 | BlueWrench | Blue Wrench | Wrenches | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Mechanic:124 |
| 453 | BombStatue | Bomb Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2138 | BoneBookcase | Bone Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2591 | BoneClock | Bone Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 2381 | BonePiano | Bone Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 3712 | BoneSkeletonStatue | Bone Skeleton Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 827 | BoneTable | Bone Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 1375 | BoneWarp | Bone Warp | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 811 | BoneWorkBench | Bone Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 461 | BoomerangStatue | Boomerang Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 462 | BootStatue | Boot Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 4717 | BorealBeam | Boreal Beam | Beams | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Beams worldgen: |
| 2554 | BorealWoodBookcase | Boreal Wood Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2560 | BorealWoodClock | Boreal Wood Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 2507 | BorealWoodFence | Boreal Wood Fence | Fences | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Fences worldgen: |
| 2565 | BorealWoodPiano | Boreal Wood Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 677 | BorealWoodTable | Boreal Wood Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 673 | BorealWoodWorkBench | Boreal Wood Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 6113 | BoulderBookcase | Boulder Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 6119 | BoulderClock | Boulder Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 6124 | BoulderPiano | Boulder Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 4355 | BoulderStatue | Boulder Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 6128 | BoulderTable | Boulder Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 6130 | BoulderWorkbench | Boulder Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 460 | BowStatue | Bow Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1877 | BowTopper | Bow Topper | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 4350 | BrownMoss | Brown Moss | Moss | 0 | 3 | world, npc | worldgen, drop | family_page_candidate | drop:npc:Moss Zombie:691 \| worldgen:world:Moss worldgen: \| worldgen:world:Moss worldgen: |
| 1966 | BrownPaint | Brown Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 543 | BrownPressurePlate | Brown Pressure Plate | Pressure Plates | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Mechanic:124 |
| 2158 | BubbleWallpaper | Bubble Wallpaper | Wallpapers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Painter:227 |
| 5261 | Buddies | Buddies | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3662 | BuggyStatue | Buggy Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 445 | BunnyStatue | Bunny Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 4628 | BurningSpirit | Burning Spirit | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3652 | ButterflyStatue | Butterfly Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2020 | CactusBookcase | Cactus Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2592 | CactusClock | Cactus Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 2382 | CactusPiano | Cactus Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 2743 | CactusTable | Cactus Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 812 | CactusWorkBench | Cactus Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 1950 | CandyCaneWallpaper | Candy Cane Wallpaper | Wallpapers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Painter:227 |
| 5224 | CatSword | Cat Sword | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1791 | Cauldron | Cauldron | Cooking Pots | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Witch Doctor:228 |
| 4496 | Cave1Echo | Green Mossy Wall | Mossy Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Mossy Walls worldgen: |
| 4497 | Cave2Echo | Brown Mossy Wall | Mossy Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Mossy Walls worldgen: |
| 4498 | Cave3Echo | Red Mossy Wall | Mossy Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Mossy Walls worldgen: |
| 4499 | Cave4Echo | Blue Mossy Wall | Mossy Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Mossy Walls worldgen: |
| 4500 | Cave5Echo | Purple Mossy Wall | Mossy Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Mossy Walls worldgen: |
| 4501 | Cave6Echo | Rocky Dirt Wall | Cave Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Cave Walls worldgen: |
| 4502 | Cave7Echo | Old Stone Wall | Cave Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Cave Walls worldgen: |
| 4512 | Cave8Echo | Craggy Stone Wall | Cave Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Cave Walls worldgen: |
| 4922 | CavernFountain | Cavern Water Fountain | Water fountains | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Witch Doctor:228 |
| 4510 | CaveWall1Echo | Cave Dirt Wall | Cave Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Cave Walls worldgen: |
| 4511 | CaveWall2Echo | Rough Dirt Wall | Cave Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Cave Walls worldgen: |
| 463 | ChestStatue | Chest Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1948 | ChristmasTreeWallpaper | Christmas Tree Wallpaper | Wallpapers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Painter:227 |
| 5957 | CloudBookcase | Cloud Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 5963 | CloudClock | Cloud Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 5968 | CloudPiano | Cloud Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 5971 | CloudTable | Cloud Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 5973 | CloudWorkbench | Cloud Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 5319 | CockatielStatue | Cockatiel Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1487 | ColdWatersintheWhiteLand | Cold Waters in the White Land | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 2159 | CopperPipeWallpaper | Copper Pipe Wallpaper | Wallpapers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Painter:227 |
| 5150 | CoralBookcase | Reef Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 5157 | CoralClock | Reef Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 5161 | CoralPiano | Reef Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 5165 | CoralTable | Reef Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 5166 | CoralWorkbench | Reef Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 3341 | CorruptHardenedSandWall | Hardened Ebonsand Wall | Hardened Sand Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Hardened Sand Walls worldgen: |
| 4513 | Corruption1Echo | Corrupt Growth Wall | Corrupt Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Corrupt Walls worldgen: |
| 4514 | Corruption2Echo | Corrupt Mass Wall | Corrupt Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Corrupt Walls worldgen: |
| 4515 | Corruption3Echo | Corrupt Pustule Wall | Corrupt Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Corrupt Walls worldgen: |
| 4516 | Corruption4Echo | Corrupt Tendril Wall | Corrupt Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Corrupt Walls worldgen: |
| 1529 | CorruptionChest | Corruption Chest | Biome Chests | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Biome Chests worldgen: |
| 3217 | CorruptPlanterBox | Deathweed Planter Box | Planter Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 3276 | CorruptSandstone | Ebonsandstone Block | Sandstone Blocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Sandstone Blocks worldgen: |
| 3344 | CorruptSandstoneWall | Ebonsandstone Wall | Sandstone Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Sandstone Walls worldgen: |
| 466 | CorruptStatue | Corrupt Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 942 | CorruptWaterFountain | Corrupt Water Fountain | Water fountains | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Witch Doctor:228 |
| 5263 | CouchGag | Couch Gag | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5531 | CozyWindow | Cozy Window | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 454 | CrabStatue | Crab Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1246 | CrimsandBlock | Crimsand Block | Sand Blocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Sand Blocks worldgen: |
| 4517 | Crimson1Echo | Crimson Crust Wall | Crimson Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Crimson Walls worldgen: |
| 4518 | Crimson2Echo | Crimson Scab Wall | Crimson Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Crimson Walls worldgen: |
| 4519 | Crimson3Echo | Crimson Teeth Wall | Crimson Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Crimson Walls worldgen: |
| 4520 | Crimson4Echo | Crimson Blister Wall | Crimson Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Crimson Walls worldgen: |
| 5533 | CrimsonAltar | Crimson Altar | Altars | 0 | 3 | boss, world | drop, worldgen | family_page_candidate | drop:boss:Eye of Cthulhu:4 \| drop:boss:Eye of Cthulhu:4 \| worldgen:world:Altars worldgen: |
| 6136 | CrimsonAltarIcon | Crimson Altar | Altars | 0 | 3 | boss, world | drop, worldgen | family_page_candidate | drop:boss:Eye of Cthulhu:4 \| drop:boss:Eye of Cthulhu:4 \| worldgen:world:Altars worldgen: |
| 1530 | CrimsonChest | Crimson Chest | Biome Chests | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Biome Chests worldgen: |
| 2284 | CrimsonCloak | Crimson Cloak | Capes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 3342 | CrimsonHardenedSandWall | Hardened Crimsand Wall | Hardened Sand Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Hardened Sand Walls worldgen: |
| 3218 | CrimsonPlanterBox | Deathweed Planter Box | Planter Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 3277 | CrimsonSandstone | Crimsandstone Block | Sandstone Blocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Sandstone Blocks worldgen: |
| 3345 | CrimsonSandstoneWall | Crimsandstone Wall | Sandstone Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Sandstone Walls worldgen: |
| 943 | CrimsonWaterFountain | Crimson Water Fountain | Water fountains | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Witch Doctor:228 |
| 5779 | CrimtaneBookcase | Crimtane Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 5785 | CrimtaneClock | Crimtane Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 5790 | CrimtanePiano | Crimtane Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 5794 | CrimtaneTable | Crimtane Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 5796 | CrimtaneWorkbench | Crimtane Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 458 | CrossStatue | Cross Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1575 | CrownoDevoursHisLunch | Crowno Devours His Lunch | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5252 | Crustography | Crustography | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3917 | CrystalBookCase | Crystal Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 3898 | CrystalClock | Crystal Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 5488 | Crystallize | Crystallize | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3915 | CrystalPiano | Crystal Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 3920 | CrystalTable | Crystal Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 3909 | CrystalWorkbench | Crystal Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 1079 | CyanPaint | Cyan Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 783 | DarkBlueSolution | Dark Blue Solution | Solutions | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Steampunker:178 |
| 4787 | DarkHorseSaddle | Black Studded Saddle | Saddles | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Zoologist:633 |
| 5087 | DarkSideHallow | Dark Side of the Hallow | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1476 | DarkSoulReaper | Dark Soul Reaper | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3215 | DayBloomPlanterBox | Daybloom Planter Box | Planter Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 1490 | Daylight | Daylight | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3824 | DD2BallistraTowerT1Popper | Ballista Rod | Ballista sentry summons | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Tavernkeep:550 |
| 3825 | DD2BallistraTowerT2Popper | Ballista Cane | Ballista sentry summons | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Tavernkeep:550 |
| 3826 | DD2BallistraTowerT3Popper | Ballista Staff | Ballista sentry summons | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Tavernkeep:550 |
| 3832 | DD2ExplosiveTrapT1Popper | Explosive Trap Rod | Explosive Trap sentry summons | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Tavernkeep:550 |
| 3833 | DD2ExplosiveTrapT2Popper | Explosive Trap Cane | Explosive Trap sentry summons | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Tavernkeep:550 |
| 3834 | DD2ExplosiveTrapT3Popper | Explosive Trap Staff | Explosive Trap sentry summons | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Tavernkeep:550 |
| 3818 | DD2FlameburstTowerT1Popper | Flameburst Rod | Flameburst sentry summons | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Tavernkeep:550 |
| 3819 | DD2FlameburstTowerT2Popper | Flameburst Cane | Flameburst sentry summons | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Tavernkeep:550 |
| 3820 | DD2FlameburstTowerT3Popper | Flameburst Staff | Flameburst sentry summons | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Tavernkeep:550 |
| 3829 | DD2LightningAuraT1Popper | Lightning Aura Rod | Lightning Aura sentry summons | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Tavernkeep:550 |
| 3830 | DD2LightningAuraT2Popper | Lightning Aura Cane | Lightning Aura sentry summons | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Tavernkeep:550 |
| 3831 | DD2LightningAuraT3Popper | Lightning Aura Staff | Lightning Aura sentry summons | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Tavernkeep:550 |
| 1492 | DeadlandComesAlive | Deadland Comes Alive | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1093 | DeepBluePaint | Deep Blue Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 1091 | DeepCyanPaint | Deep Cyan Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 1089 | DeepGreenPaint | Deep Green Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 1088 | DeepLimePaint | Deep Lime Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 1086 | DeepOrangePaint | Deep Orange Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 1096 | DeepPinkPaint | Deep Pink Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 1094 | DeepPurplePaint | Deep Purple Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 1085 | DeepRedPaint | Deep Red Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 1092 | DeepSkyBluePaint | Deep Sky Blue Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 1090 | DeepTealPaint | Deep Teal Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 1095 | DeepVioletPaint | Deep Violet Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 1087 | DeepYellowPaint | Deep Yellow Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 5532 | DemonAltar | Demon Altar | Altars | 0 | 3 | boss, world | drop, worldgen | family_page_candidate | drop:boss:Eye of Cthulhu:4 \| drop:boss:Eye of Cthulhu:4 \| worldgen:world:Altars worldgen: |
| 6135 | DemonAltarIcon | Demon Altar | Altars | 0 | 3 | boss, world | drop, worldgen | family_page_candidate | drop:boss:Eye of Cthulhu:4 \| drop:boss:Eye of Cthulhu:4 \| worldgen:world:Altars worldgen: |
| 5758 | DemoniteBookcase | Demonite Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 5764 | DemoniteClock | Demonite Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 5769 | DemonitePiano | Demonite Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 5773 | DemoniteTable | Demonite Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 5775 | DemoniteWorkbench | Demonite Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 1479 | DemonsEye | Demon's Eye | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 910 | DesertWaterFountain | Desert Water Fountain | Water fountains | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Witch Doctor:228 |
| 5394 | DirtSolution | Brown Solution | Solutions | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Steampunker:178 |
| 1496 | Discover | Discover | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 4639 | DivineEye | Divine Eye | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5241 | DoNotEattheVileMushroom | Do Not Eat the Vile Mushroom! | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1486 | DoNotStepontheGrass | Do Not Step on the Grass | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 4342 | DragonflyStatue | Dragonfly Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 5240 | DreadoftheRedSea | Dread of the Red Sea | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3710 | DripplerStatue | Drippler Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1426 | Dryadisque | Dryadisque | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5232 | Duality | Duality | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3659 | DuckStatue | Duck Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2160 | DuckyWallpaper | Ducky Wallpaper | Wallpapers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Painter:227 |
| 3900 | DungeonClockBlue | Blue Dungeon Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 3901 | DungeonClockGreen | Green Dungeon Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 3902 | DungeonClockPink | Pink Dungeon Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 4712 | DungeonDesertChest | Desert Chest | Biome Chests | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Biome Chests worldgen: |
| 2233 | DynastyBookcase | Dynasty Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2237 | DynastyClock | Dynasty Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 2234 | DynastyCup | Dynasty Cup | Cups | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 3916 | DynastyPiano | Dynasty Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 2259 | DynastyTable | Dynasty Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 2229 | DynastyWorkBench | Dynasty Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 5860 | EasterBookcase | Easter Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 5866 | EasterClock | Easter Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 5871 | EasterPiano | Easter Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 5875 | EasterTable | Easter Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 5877 | EasterWorkbench | Easter Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 5489 | EaterOfLife | Eater Of Life | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 370 | EbonsandBlock | Ebonsand Block | Sand Blocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Sand Blocks worldgen: |
| 2021 | EbonwoodBookcase | Ebonwood Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2593 | EbonwoodClock | Ebonwood Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 2210 | EbonwoodFence | Ebonwood Fence | Fences | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Fences worldgen: |
| 641 | EbonwoodPiano | Ebonwood Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 638 | EbonwoodTable | Ebonwood Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 635 | EbonwoodWorkBench | Ebonwood Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 5344 | EchoCoating | Echo Coating | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 1493 | EvilPresence | Evil Presence | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 471 | EyeballStatue | Eyeball Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 5239 | Eyezorhead | Eyezorhead | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1500 | FacingtheCerebralMastermind | Facing the Cerebral Mastermind | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5219 | FairyGuides | Fairy Guides | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5603 | FallenStarBookcase | Fallen Star Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 5610 | FallenStarClock | Fallen Star Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 5614 | FallenStarPiano | Fallen Star Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 5618 | FallenStarTable | Fallen Star Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 5619 | FallenStarWorkbench | Fallen Star Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 2008 | FancyGreyWallpaper | Fancy Gray Wallpaper | Wallpapers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Painter:227 |
| 5256 | Fangs | Fangs | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1442 | FatherofSomeone | Father of Someone | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1951 | FestiveWallpaper | Festive Wallpaper | Wallpapers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Painter:227 |
| 5691 | FeywoodBookcase | Feywood Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 5698 | FeywoodClock | Feywood Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 5702 | FeywoodPiano | Feywood Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 5706 | FeywoodTable | Feywood Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 5707 | FeywoodWorkbench | Feywood Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 1480 | FindingGold | Finding Gold | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3222 | FireBlossomPlanterBox | Fireblossom Planter Box | Planter Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 3654 | FireflyStatue | Firefly Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1481 | FirstEncounter | First Encounter | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 444 | FishStatue | Fish Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2022 | FleshBookcase | Flesh Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2598 | FleshClock | Flesh Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 2246 | FleshPiano | Flesh Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 828 | FleshTable | Flesh Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 813 | FleshWorkBench | Flesh Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 5821 | FlinxFurBookcase | Flinx Fur Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 5827 | FlinxFurClock | Flinx Fur Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 5832 | FlinxFurPiano | Flinx Fur Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 5836 | FlinxFurTable | Flinx Fur Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 5838 | FlinxFurWorkbench | Flinx Fur Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 4041 | FlowerPacketBlue | Blue Flower Seeds | Flower Seeds | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 4042 | FlowerPacketMagenta | Magenta Flower Seeds | Flower Seeds | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 4043 | FlowerPacketPink | Pink Flower Seeds | Flower Seeds | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 4044 | FlowerPacketRed | Red Flower Seeds | Flower Seeds | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 4048 | FlowerPacketTallGrass | Tall Grass Seeds | Flower Seeds | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 4046 | FlowerPacketViolet | Violet Flower Seeds | Flower Seeds | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 4047 | FlowerPacketWhite | White Flower Seeds | Flower Seeds | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 4241 | FlowerPacketWild | Wild Flower Seeds | Flower Seeds | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 4045 | FlowerPacketYellow | Yellow Flower Seeds | Flower Seeds | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 1542 | FlowingMagma | Flowing Magma | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 6069 | ForbiddenBookcase | Forbidden Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 6075 | ForbiddenClock | Forbidden Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 6080 | ForbiddenPiano | Forbidden Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 6084 | ForbiddenTable | Forbidden Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 6086 | ForbiddenWorkbench | Forbidden Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 5272 | ForestTroll | Forest Troll | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3661 | FrogStatue | Frog Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2031 | FrozenBookcase | Frozen Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 681 | FrozenChest | Ice Chest | Biome Chests | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Biome Chests worldgen: |
| 2594 | FrozenClock | Frozen Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 2247 | FrozenPiano | Frozen Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 2248 | FrozenTable | Frozen Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 2252 | FrozenWorkBench | Frozen Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 450 | GargoyleStatue | Gargoyle Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 4726 | GhostManifestation | Ghost Manifestation | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 2025 | GlassBookcase | Glass Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2239 | GlassClock | Glass Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 2254 | GlassPiano | Glass Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 1713 | GlassTable | Glass Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 2632 | GlassWorkBench | Glass Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 451 | GloomStatue | Gloom Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1577 | GloriousNight | Glorious Night | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1374 | GloryoftheFire | Glory of the Fire | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 4668 | GlowPaint | Illuminant Coating | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 1425 | GoblinsPlayingPoker | Goblins Playing Poker | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 441 | GoblinStatue | Goblin Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2137 | GoldenBookcase | Golden Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2238 | GoldenClock | Golden Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 2379 | GoldenPiano | Golden Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 1716 | GoldenTable | Golden Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 3910 | GoldenWorkbench | Golden Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 4242 | GolfBallDyedBlack | Black Golf Ball | Golf Balls | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 4243 | GolfBallDyedBlue | Blue Golf Ball | Golf Balls | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 4244 | GolfBallDyedBrown | Brown Golf Ball | Golf Balls | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 4245 | GolfBallDyedCyan | Cyan Golf Ball | Golf Balls | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 4246 | GolfBallDyedGreen | Green Golf Ball | Golf Balls | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 4247 | GolfBallDyedLimeGreen | Lime Golf Ball | Golf Balls | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 4248 | GolfBallDyedOrange | Orange Golf Ball | Golf Balls | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 4249 | GolfBallDyedPink | Pink Golf Ball | Golf Balls | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 4250 | GolfBallDyedPurple | Purple Golf Ball | Golf Balls | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 4251 | GolfBallDyedRed | Red Golf Ball | Golf Balls | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 4252 | GolfBallDyedSkyBlue | Sky Blue Golf Ball | Golf Balls | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 4253 | GolfBallDyedTeal | Teal Golf Ball | Golf Balls | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 4254 | GolfBallDyedViolet | Violet Golf Ball | Golf Balls | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 4255 | GolfBallDyedYellow | Yellow Golf Ball | Golf Balls | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 4086 | GolfCupFlagBlue | Blue Pin Flag | Pin Flags | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 4085 | GolfCupFlagGreen | Green Pin Flag | Pin Flags | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 4088 | GolfCupFlagPurple | Purple Pin Flag | Pin Flags | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 4084 | GolfCupFlagRed | Red Pin Flag | Pin Flags | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 4083 | GolfCupFlagWhite | White Pin Flag | Pin Flags | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 4087 | GolfCupFlagYellow | Yellow Pin Flag | Pin Flags | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 4658 | GolfPainting1 | The Rolling Greens | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 4659 | GolfPainting2 | Study of a Ball at Rest | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 4660 | GolfPainting3 | Fore! | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 4661 | GolfPainting4 | The Duplicity of Reflections | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 4599 | GolfTrophyBronze | Bronze Golf Trophy | Golf trophies | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 4601 | GolfTrophyGold | Gold Golf Trophy | Golf trophies | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 4600 | GolfTrophySilver | Silver Golf Trophy | Golf trophies | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 1482 | GoodMorning | Good Morning | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1512 | GothicBookcase | Gothic Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 5746 | GothicClock | Gothic Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 5750 | GothicPiano | Gothic Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 1510 | GothicTable | Gothic Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 1511 | GothicWorkBench | Gothic Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 3167 | GraniteBookcase | Granite Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 3128 | GraniteClock | Granite Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 4719 | GraniteColumn | Granite Column | Beams | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Beams worldgen: |
| 3718 | GraniteGolemStatue | Granite Golem Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 3143 | GranitePiano | Granite Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 3155 | GraniteTable | Granite Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 3158 | GraniteWorkBench | Granite Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 3657 | GrasshopperStatue | Grasshopper Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1099 | GrayPaint | Gray Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 542 | GrayPressurePlate | Gray Pressure Plate | Pressure Plates | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Mechanic:124 |
| 1438 | GreatWave | Great Wave | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1883 | GreenAndWhiteGarland | Green and White Garland | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 137 | GreenBrick | Green Brick | Dungeon Bricks | 0 | 3 | crate, world | crate, mining | family_page_candidate | crate:crate:Dungeon Crate:3205 \| crate:crate:Stockade Crate:3984 \| mining:world:Dungeon Bricks vein: |
| 1887 | GreenBulb | Green Bulb | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 591 | GreenCandyCaneBlock | Green Candy Cane Block | Candy Cane Blocks | 0 | 1 | container | container | family_page_candidate | container:container:Present:1869 |
| 4336 | GreenDragonfly | Green Dragonfly | Dragonflies | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Dragonflies worldgen: |
| 1415 | GreenDungeonBookcase | Green Dungeon Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2377 | GreenDungeonPiano | Green Dungeon Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 1400 | GreenDungeonTable | Green Dungeon Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 1409 | GreenDungeonVase | Green Dungeon Vase | Vases | 0 | 1 | world | mining | family_page_candidate | mining:world:Vases vein: |
| 1401 | GreenDungeonWorkBench | Green Dungeon Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 1882 | GreenGardland | Green Garland | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 598 | GreenLight | Green Light | Christmas lights | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 1897 | GreenLights | Green Lights | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 4349 | GreenMoss | Green Moss | Moss | 0 | 3 | world, npc | worldgen, drop | family_page_candidate | drop:npc:Moss Zombie:691 \| worldgen:world:Moss worldgen: \| worldgen:world:Moss worldgen: |
| 1077 | GreenPaint | Green Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 541 | GreenPressurePlate | Green Pressure Plate | Pressure Plates | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Mechanic:124 |
| 971 | GreenRocket | Green Rocket | Firework Rockets | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Party Girl:208 |
| 780 | GreenSolution | Green Solution | Solutions | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Steampunker:178 |
| 255 | GreenThread | Green Thread | Threads | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Clothier:54 |
| 851 | GreenWrench | Green Wrench | Wrenches | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Mechanic:124 |
| 1957 | GrinchFingerWallpaper | Grinch Finger Wallpaper | Wallpapers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Painter:227 |
| 1440 | GuidePicasso | Guide Picasso | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5257 | HailtotheKing | Hail to the King | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 4525 | Hallow1Echo | Hallowed Prism Wall | Hallowed Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Hallowed Walls worldgen: |
| 4526 | Hallow2Echo | Hallowed Cavern Wall | Hallowed Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Hallowed Walls worldgen: |
| 4527 | Hallow3Echo | Hallowed Shard Wall | Hallowed Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Hallowed Walls worldgen: |
| 4528 | Hallow4Echo | Hallowed Crystalline Wall | Hallowed Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Hallowed Walls worldgen: |
| 5714 | HallowedBookcase | Hallowed Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 1531 | HallowedChest | Hallowed Chest | Biome Chests | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Biome Chests worldgen: |
| 5721 | HallowedClock | Hallowed Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 5725 | HallowedPiano | Hallowed Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 5729 | HallowedTable | Hallowed Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 944 | HallowedWaterFountain | Hallowed Water Fountain | Water fountains | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Witch Doctor:228 |
| 5730 | HallowedWorkbench | Hallowed Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 3343 | HallowHardenedSandWall | Hardened Pearlsand Wall | Hardened Sand Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Hardened Sand Walls worldgen: |
| 3339 | HallowSandstone | Pearlsandstone Block | Sandstone Blocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Sandstone Blocks worldgen: |
| 3346 | HallowSandstoneWall | Pearlsandstone Wall | Sandstone Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Sandstone Walls worldgen: |
| 1849 | HallowsEve | Hallow's Eve | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 455 | HammerStatue | Hammer Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1497 | HandEarth | Hand Earth | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5248 | HappyLittleTree | Happy Little Tree | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5375 | HardenedSandWallUnsafe | Treacherous Hardened Sand Wall | Hardened Sand Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Hardened Sand Walls worldgen: |
| 5934 | HarpyBookcase | Harpy Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 5940 | HarpyClock | Harpy Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 5945 | HarpyPiano | Harpy Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 3715 | HarpyStatue | Harpy Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 5949 | HarpyTable | Harpy Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 5951 | HarpyWorkbench | Harpy Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 5271 | Heartlands | Heartlands | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 473 | HeartStatue | Heart Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 5487 | HeroesFromAnotherWorld | Heroes From Another World | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5226 | HighPitch | High Pitch | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 2023 | HoneyBookcase | Honey Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2240 | HoneyClock | Honey Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 2257 | HoneyCup | Honey Cup | Cups | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 2255 | HoneyPiano | Honey Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 1717 | HoneyTable | Honey Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 2251 | HoneyWorkBench | Honey Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 5389 | HoplitePizza | Cheesy Pizza Poster | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3717 | HopliteStatue | Hoplite Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 452 | HornetStatue | Hornet Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2009 | IceFloeWallpaper | Ice Floe Wallpaper | Wallpapers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Painter:227 |
| 3199 | IceMirror | Ice Mirror | Magic Mirrors | 0 | 5 | container, npc, world | container, drop, worldgen | family_page_candidate | container:container:Gold Chest:306 \| drop:npc:Mimics:85 \| drop:npc:Mimic:85 |
| 941 | IcyWaterFountain | Icy Water Fountain | Water fountains | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Witch Doctor:228 |
| 1433 | Impact | Impact | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1538 | ImpFace | Imp Face | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 449 | ImpStatue | Imp Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 35 | IronAnvil | Iron Anvil | Pre-Hardmode Anvils | 0 | 2 | npc, world | shop, worldgen | family_page_candidate | shop:npc:Merchant:17 \| worldgen:world:Pre-Hardmode Anvils worldgen: |
| 2333 | IronFence | Iron Fence | Fences | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Fences worldgen: |
| 1846 | JackingSkeletron | Jacking Skeletron | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 4629 | JawsOfDeath | Jaws of Death | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5900 | JellyfishBookcase | Jellyfish Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 5906 | JellyfishClock | Jellyfish Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 5911 | JellyfishPiano | Jellyfish Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 459 | JellyfishStatue | Jellyfish Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 5915 | JellyfishTable | Jellyfish Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 5917 | JellyfishWorkbench | Jellyfish Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 1528 | JungleChest | Jungle Chest | Biome Chests | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Biome Chests worldgen: |
| 940 | JungleWaterFountain | Jungle Water Fountain | Water fountains | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Witch Doctor:228 |
| 5225 | KargohsSummon | Kargoh's Summon | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 476 | KingStatue | King Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 4675 | KiteAngryTrapper | Angry Trapper Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 4367 | KiteBlue | Blue Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 4368 | KiteBlueAndYellow | Blue and Yellow Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 4610 | KiteBoneSerpent | Bone Serpent Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 4612 | KiteBunny | Bunny Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 4670 | KiteBunnyCorrupt | Corrupt Bunny Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 4671 | KiteBunnyCrimson | Vicious Bunny Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 4677 | KiteCrawltipede | Crawltipede Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 4674 | KiteGoldfish | Goldfish Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 4649 | KiteJellyfishBlue | Blue Jellyfish Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 4650 | KiteJellyfishPink | Pink Jellyfish Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 4676 | KiteKoi | Koi Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 4648 | KiteManEater | Man Eater Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 4613 | KitePigron | Pigron Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 4369 | KiteRed | Red Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 4370 | KiteRedAndYellow | Red and Yellow Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 4669 | KiteSandShark | Sand Shark Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 4651 | KiteShark | Shark Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 4681 | KiteSpectrum | Spectrum Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 4684 | KiteUnicorn | Unicorn Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 4683 | KiteWanderingEye | Wandering Eye Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 4611 | KiteWorldFeeder | World Feeder Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 4379 | KiteWyvern | Wyvern Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 4371 | KiteYellow | Yellow Kite | Kites | 0 | 1 | npc | shop | family_page_candidate | shop:npc:NPCs: |
| 1955 | KrampusHornWallpaper | Krampus Horn Wallpaper | Wallpapers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Painter:227 |
| 4377 | KryptonMoss | Krypton Moss | Moss | 0 | 3 | world, npc | worldgen, drop | family_page_candidate | drop:npc:Moss Zombie:691 \| worldgen:world:Moss worldgen: \| worldgen:world:Moss worldgen: |
| 5274 | LadyOfTheLake | Lady Of The Lake | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1501 | LakeofFire | Lake of Fire | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1477 | Land | Land | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 4533 | Lava1Echo | Ember Wall | Lava Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Lava Walls worldgen: |
| 4534 | Lava2Echo | Cinder Wall | Lava Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Lava Walls worldgen: |
| 4535 | Lava3Echo | Magma Wall | Lava Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Lava Walls worldgen: |
| 4536 | Lava4Echo | Smouldering Stone Wall | Lava Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Lava Walls worldgen: |
| 4354 | LavaMoss | Lava Moss | Moss | 0 | 3 | world, npc | worldgen, drop | family_page_candidate | drop:npc:Moss Zombie:691 \| worldgen:world:Moss worldgen: \| worldgen:world:Moss worldgen: |
| 716 | LeadAnvil | Lead Anvil | Pre-Hardmode Anvils | 0 | 2 | npc, world | shop, worldgen | family_page_candidate | shop:npc:Merchant:17 \| worldgen:world:Pre-Hardmode Anvils worldgen: |
| 1448 | LeadFence | Lead Fence | Fences | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Fences worldgen: |
| 2282 | LeopardSkin | Leopard Skin | Animal skins | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 3960 | LesionBookcase | Lesion Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 3966 | LesionClock | Lesion Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 3971 | LesionPiano | Lesion Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 3974 | LesionTable | Lesion Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 3975 | LesionWorkbench | Lesion Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 6000 | LibrarianBookcase | Librarian Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 6006 | LibrarianClock | Librarian Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 6011 | LibrarianPiano | Librarian Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 6015 | LibrarianTable | Librarian Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 6017 | LibrarianWorkbench | Librarian Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 4632 | LifeAboveTheSand | Life Above the Sand | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1488 | LightlessChasms | Lightless Chasms | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 2030 | LihzahrdBookcase | Lihzahrd Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2595 | LihzahrdClock | Lihzahrd Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 1154 | LihzahrdGuardianStatue | Lihzahrd Guardian Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2385 | LihzahrdPiano | Lihzahrd Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 1151 | LihzahrdPressurePlate | Lihzahrd Pressure Plate | Pressure Plates | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Mechanic:124 |
| 1152 | LihzahrdStatue | Lihzahrd Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1144 | LihzahrdTable | Lihzahrd Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 1153 | LihzahrdWatcherStatue | Lihzahrd Watcher Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1145 | LihzahrdWorkBench | Lihzahrd Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 1076 | LimePaint | Lime Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 1541 | LivingGore | Living Gore | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 2135 | LivingWoodBookcase | Living Wood Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2596 | LivingWoodClock | Living Wood Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 2245 | LivingWoodPiano | Living Wood Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 829 | LivingWoodTable | Living Wood Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 2633 | LivingWoodWorkBench | Living Wood Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 5230 | LizardKing | Lizard King | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3603 | LogicGate_AND | Logic Gate (AND) | Logic Gates | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Steampunker:178 |
| 3605 | LogicGate_NAND | Logic Gate (NAND) | Logic Gates | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Steampunker:178 |
| 3606 | LogicGate_NOR | Logic Gate (NOR) | Logic Gates | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Steampunker:178 |
| 3608 | LogicGate_NXOR | Logic Gate (XNOR) | Logic Gates | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Steampunker:178 |
| 3604 | LogicGate_OR | Logic Gate (OR) | Logic Gates | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Steampunker:178 |
| 3607 | LogicGate_XOR | Logic Gate (XOR) | Logic Gates | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Steampunker:178 |
| 3663 | LogicGateLamp_Faulty | Logic Gate Lamp (Faulty) | Logic Gate Lamps | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Steampunker:178 |
| 3602 | LogicGateLamp_Off | Logic Gate Lamp (Off) | Logic Gate Lamps | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Steampunker:178 |
| 3618 | LogicGateLamp_On | Logic Gate Lamp (On) | Logic Gate Lamps | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Steampunker:178 |
| 5255 | LoveisintheTrashSlot | Love is in the Trash Slot | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5317 | MacawStatue | Macaw Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 3185 | MagicHoneyDropper | Magic Honey Dropper | Magic Droppers | 0 | 1 | world | mining | family_page_candidate | mining:world:Magic Droppers vein: |
| 3184 | MagicLavaDropper | Magic Lava Dropper | Magic Droppers | 0 | 1 | world | mining | family_page_candidate | mining:world:Magic Droppers vein: |
| 3782 | MagicSandDropper | Magic Sand Dropper | Magic Droppers | 0 | 1 | world | mining | family_page_candidate | mining:world:Magic Droppers vein: |
| 5492 | MagicShimmerDropper | Magic Shimmer Dropper | Magic Droppers | 0 | 1 | world | mining | family_page_candidate | mining:world:Magic Droppers vein: |
| 3182 | MagicWaterDropper | Magic Water Dropper | Magic Droppers | 0 | 1 | world | mining | family_page_candidate | mining:world:Magic Droppers vein: |
| 4786 | MajesticHorseSaddle | Royal Gilded Saddle | Saddles | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Zoologist:633 |
| 3166 | MarbleBookcase | Marble Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 3127 | MarbleClock | Marble Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 4554 | MarbleColumn | Marble Column | Beams | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Beams worldgen: |
| 3142 | MarblePiano | Marble Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 3154 | MarbleTable | Marble Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 3157 | MarbleWorkBench | Marble Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 2809 | MartianAstroClock | Martian Astro Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 2817 | MartianHolobookcase | Martian Holobookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2821 | MartianPiano | Martian Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 2824 | MartianTable | Martian Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 2826 | MartianWorkBench | Martian Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 3714 | MedusaStatue | Medusa Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 3165 | MeteoriteBookcase | Meteorite Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 3126 | MeteoriteClock | Meteorite Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 3141 | MeteoritePiano | Meteorite Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 3153 | MeteoriteTable | Meteorite Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 3156 | MeteoriteWorkBench | Meteorite Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 5262 | MidnightSun | Midnight Sun | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3216 | MoonglowPlanterBox | Moonglow Planter Box | Planter Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 3596 | MoonLordPainting | Not a Kid, nor a Squid | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5243 | MoonmanandCompany | Moonman & Company | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5977 | MoonplateBookcase | Duskware Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 5983 | MoonplateClock | Duskware Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 5988 | MoonplatePiano | Duskware Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 5992 | MoonplateTable | Duskware Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 5994 | MoonplateWorkbench | Duskware Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 1850 | MorbidCuriosity | Morbid Curiosity | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5221 | MorningHunt | Morning Hunt | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3658 | MouseStatue | Mouse Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1884 | MulticoloredBulb | Multicolored Bulb | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 1895 | MulticoloredLights | Multicolored Lights | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 4721 | MushroomBeam | Mushroom Beam | Beams | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Beams worldgen: |
| 2540 | MushroomBookcase | Mushroom Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2599 | MushroomClock | Mushroom Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 2548 | MushroomPiano | Mushroom Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 470 | MushroomStatue | Mushroom Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2550 | MushroomTable | Mushroom Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 814 | MushroomWorkBench | Mushroom Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 576 | MusicBox | Music Box | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 1600 | MusicBoxAltOverworldDay | Music Box (Alt Overworld Day) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 1964 | MusicBoxAltUnderground | Music Box (Alt Underground) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 567 | MusicBoxBoss1 | Music Box (Boss 1) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 572 | MusicBoxBoss2 | Music Box (Boss 2) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 574 | MusicBoxBoss3 | Music Box (Boss 3) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 1599 | MusicBoxBoss4 | Music Box (Boss 4) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 1607 | MusicBoxBoss5 | Music Box (Boss 5) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 4992 | MusicBoxConsoleTitle | Music Box (Alt Title) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 569 | MusicBoxCorruption | Music Box (Corruption) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5044 | MusicBoxCredits | Music Box (Journey's End) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 1598 | MusicBoxCrimson | Music Box (Crimson) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 4237 | MusicBoxDayRemix | Music Box (Day Remix) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 3869 | MusicBoxDD2 | Music Box (Old One's Army) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5112 | MusicBoxDeerclops | Music Box (Deerclops) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 1603 | MusicBoxDesert | Music Box (Desert) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5582 | MusicBoxDestroyer | Music Box (The Destroyer) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 4990 | MusicBoxDukeFishron | Music Box (Duke Fishron) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 1605 | MusicBoxDungeon | Music Box (Dungeon) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5637 | MusicBoxEaterOfWorlds | Music Box (Eater of Worlds) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 1609 | MusicBoxEclipse | Music Box (Eclipse) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 563 | MusicBoxEerie | Music Box (Eerie) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 4985 | MusicBoxEmpressOfLight | Music Box (Empress Of Light) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 1965 | MusicBoxFrostMoon | Music Box (Frost Moon) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 3371 | MusicBoxGoblins | Music Box (Goblin Invasion) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 4358 | MusicBoxGraveyard | Music Box (Graveyard) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 3237 | MusicBoxHell | Music Box (Hell) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 1602 | MusicBoxIce | Music Box (Ice) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 568 | MusicBoxJungle | Music Box (Jungle) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 4606 | MusicBoxJungleNight | Music Box (Jungle Night) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5578 | MusicBoxKingSlime | Music Box (King Slime) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 3044 | MusicBoxLunarBoss | Music Box (Lunar Boss) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5580 | MusicBoxLunaticCultist | Music Box (Lunatic Cultist) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 3235 | MusicBoxMartians | Music Box (Martian Madness) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 4991 | MusicBoxMorningRain | Music Box (Morning Rain) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 1610 | MusicBoxMushrooms | Music Box (Mushrooms) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 564 | MusicBoxNight | Music Box (Night) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 1604 | MusicBoxOcean | Music Box (Ocean Day) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 4077 | MusicBoxOceanAlt | Music Box (Ocean Night) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 562 | MusicBoxOverworldDay | Music Box (Overworld Day) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5031 | MusicBoxOWBloodMoon | Otherworldly Music Box (Eerie) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5033 | MusicBoxOWBoss1 | Otherworldly Music Box (Boss 1) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5032 | MusicBoxOWBoss2 | Otherworldly Music Box (Boss 2) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5025 | MusicBoxOWCorruption | Otherworldly Music Box (Corruption) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5027 | MusicBoxOWCrimson | Otherworldly Music Box (Crimson) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5015 | MusicBoxOWDay | Otherworldly Music Box (Overworld Day) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5018 | MusicBoxOWDesert | Otherworldly Music Box (Desert) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5021 | MusicBoxOWDungeon | Otherworldly Music Box (Dungeon) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5040 | MusicBoxOWHallow | Otherworldly Music Box (Hallow) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5034 | MusicBoxOWInvasion | Otherworldly Music Box (Invasion) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5038 | MusicBoxOWJungle | Otherworldly Music Box (Jungle) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5036 | MusicBoxOWMoonLord | Otherworldly Music Box (Lunar Boss) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5020 | MusicBoxOWMushroom | Otherworldly Music Box (Mushrooms) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5016 | MusicBoxOWNight | Otherworldly Music Box (Night) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5019 | MusicBoxOWOcean | Otherworldly Music Box (Ocean) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5037 | MusicBoxOWPlantera | Otherworldly Music Box (Plantera) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5014 | MusicBoxOWRain | Otherworldly Music Box (Rain) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5024 | MusicBoxOWSnow | Otherworldly Music Box (Snow) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5022 | MusicBoxOWSpace | Otherworldly Music Box (Space) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5035 | MusicBoxOWTowers | Otherworldly Music Box (The Towers) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5017 | MusicBoxOWUnderground | Otherworldly Music Box (Underground) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5026 | MusicBoxOWUndergroundCorruption | Otherworldly Music Box (Underground Corruption) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5028 | MusicBoxOWUndergroundCrimson | Otherworldly Music Box (Underground Crimson) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5030 | MusicBoxOWUndergroundHallow | Otherworldly Music Box (Underground Hallow) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5029 | MusicBoxOWUndergroundSnow | Otherworldly Music Box (Ice) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5023 | MusicBoxOWUnderworld | Otherworldly Music Box (Underworld) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5039 | MusicBoxOWWallOfFlesh | Otherworldly Music Box (Wall of Flesh) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 3236 | MusicBoxPirates | Music Box (Pirate Invasion) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 1606 | MusicBoxPlantera | Music Box (Plantera) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 1963 | MusicBoxPumpkinMoon | Music Box (Pumpkin Moon) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5538 | MusicBoxQueenBee | Music Box (Queen Bee) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5579 | MusicBoxQueenBeeAlt | Music Box (Alt Queen Bee) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 4979 | MusicBoxQueenSlime | Music Box (Queen Slime) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 1601 | MusicBoxRain | Music Box (Rain) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 6145 | MusicBoxRainbowBoulder | Music Box (Rainbow Boulder) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 3796 | MusicBoxSandstorm | Music Box (Sandstorm) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5362 | MusicBoxShimmer | Music Box (Aether) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 6146 | MusicBoxSilence | Music Box (Silence) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 6144 | MusicBoxSkeletron | Music Box (Skeletron) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5581 | MusicBoxSkeletronPrime | Music Box (Skeletron Prime) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 4078 | MusicBoxSlimeRain | Music Box (Slime Rain) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 1596 | MusicBoxSnow | Music Box (Snow) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 1597 | MusicBoxSpace | Music Box (Space Night) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 4079 | MusicBoxSpaceAlt | Music Box (Space Day) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 4357 | MusicBoxStorm | Music Box (Storm) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 1608 | MusicBoxTemple | Music Box (Temple) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 571 | MusicBoxTheHallow | Music Box (The Hallow) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 565 | MusicBoxTitle | Music Box (Title) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 4356 | MusicBoxTitleAlt | Music Box (Journey's Beginning) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5638 | MusicBoxTorchGod | Music Box (Torch God) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5639 | MusicBoxTorchGodAlt | Music Box (Alt Torch God) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 3370 | MusicBoxTowers | Music Box (The Towers) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 4080 | MusicBoxTownDay | Music Box (Town Day) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 4081 | MusicBoxTownNight | Music Box (Town Night) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5539 | MusicBoxTwins | Music Box (The Twins) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 566 | MusicBoxUnderground | Music Box (Underground) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 570 | MusicBoxUndergroundCorruption | Music Box (Underground Corruption) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 2742 | MusicBoxUndergroundCrimson | Music Box (Underground Crimson) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 5006 | MusicBoxUndergroundDesert | Music Box (Underground Desert) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 573 | MusicBoxUndergroundHallow | Music Box (Underground Hallow) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 4421 | MusicBoxUndergroundJungle | Music Box (Underground Jungle) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 4082 | MusicBoxWindyDay | Music Box (Windy Day) | Music Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Wizard:108 |
| 2010 | MusicWallpaper | Music Wallpaper | Wallpapers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Painter:227 |
| 5231 | MySon | My Son | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 2285 | MysteriousCape | Mysterious Cape | Capes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 4189 | NebulaBookcase | Nebula Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 4196 | NebulaClock | Nebula Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 4200 | NebulaPiano | Nebula Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 4204 | NebulaTable | Nebula Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 4205 | NebulaWorkbench | Nebula Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 1968 | NegativePaint | Negative Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 4723 | Nevermore | Nevermore | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5235 | NotSoLostInParadise | Not So Lost In Paradise | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1443 | NurseLisa | Nurse Lisa | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 4417 | OasisFountain | Oasis Water Fountain | Water fountains | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Witch Doctor:228 |
| 4507 | ObsidianBackEcho | Obsidian Wall | Lava Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Lava Walls worldgen: |
| 1463 | ObsidianBookcase | Obsidian Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2600 | ObsidianClock | Obsidian Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 2380 | ObsidianPiano | Obsidian Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 1460 | ObsidianTable | Obsidian Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 1462 | ObsidianVase | Obsidian Vase | Vases | 0 | 1 | world | mining | family_page_candidate | mining:world:Vases vein: |
| 1461 | ObsidianWorkBench | Obsidian Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 5236 | OcularResonance | Ocular Resonance | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 6046 | OfficeBookcase | Office Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 6052 | OfficeClock | Office Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 6057 | OfficePiano | Office Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 6061 | OfficeTable | Office Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 6063 | OfficeWorkbench | Office Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 5527 | OfSeaAndDreams | Of Sea and Dreams | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1498 | OldMiner | Old Miner | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1539 | OminousPresence | Ominous Presence | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 4337 | OrangeDragonfly | Orange Dragonfly | Dragonflies | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Dragonflies worldgen: |
| 1074 | OrangePaint | Orange Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 4261 | OrangePressurePlate | Orange Pressure Plate | Pressure Plates | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Mechanic:124 |
| 1949 | OrnamentWallpaper | Ornament Wallpaper | Wallpapers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Painter:227 |
| 5218 | Outcast | Outcast | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 4397 | OwlStatue | Owl Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 4320 | PaintedArrowSign | Painted Arrow Sign | Arrow Signs | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Golfer:588 |
| 4785 | PaintedHorseSaddle | Dusty Rawhide Saddle | Saddles | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Zoologist:633 |
| 3055 | PaintingAcorns | Acorns | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5631 | PaintingBouldChoices | Bould and Bash | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 2865 | PaintingCastleMarsberg | Castle Marsberg | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3056 | PaintingColdSnap | Cold Snap | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3057 | PaintingCursedSaint | Cursed Saint | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5632 | PaintingDarkForebodings | Dark Forebodings | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5636 | PaintingGermanBeer | Prost | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5633 | PaintingGermanZenith | Oktober | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5634 | PaintingItsScragglinTime | It's Scragglin' Time | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5635 | PaintingKaguya | Kaguya | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 2866 | PaintingMartiaLisa | Martia Lisa | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5086 | PaintingOfALass | Painting of a Lass | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5630 | PaintingRPlace2023 | r/Terraria 2023 | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3058 | PaintingSnowfellas | Snowfellas | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3059 | PaintingTheSeason | The Season | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 2867 | PaintingTheTruthIsUpThere | The Truth Is Up There | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5123 | PaintingWendy | The Bereaved | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5122 | PaintingWillow | The Firestarter | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5121 | PaintingWilson | The Gentleman Scientist | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5124 | PaintingWolfgang | The Strongman | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 2536 | PalmWoodBookcase | Palm Wood Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2601 | PalmWoodClock | Palm Wood Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 2508 | PalmWoodFence | Palm Wood Fence | Fences | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Fences worldgen: |
| 2531 | PalmWoodPiano | Palm Wood Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 2532 | PalmWoodTable | Palm Wood Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 2534 | PalmWoodWorkBench | Palm Wood Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 4344 | PaperAirplaneB | White Paper Airplane | Paper Airplanes | 0 | 1 | npc | drop | family_page_candidate | drop:npc:Windy Balloon:594 |
| 5233 | ParsecPals | Parsec Pals | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 408 | PearlsandBlock | Pearlsand Block | Sand Blocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Sand Blocks worldgen: |
| 2027 | PearlwoodBookcase | Pearlwood Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2602 | PearlwoodClock | Pearlwood Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 2212 | PearlwoodFence | Pearlwood Fence | Fences | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Fences worldgen: |
| 643 | PearlwoodPiano | Pearlwood Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 640 | PearlwoodTable | Pearlwood Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 637 | PearlwoodWorkBench | Pearlwood Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 3660 | PenguinStatue | Penguin Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 469 | PickaxeStatue | Pickaxe Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 4064 | PicnicTable | Picnic Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 4065 | PicnicTableWithCloth | Fancy Picnic Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 3716 | PigronStatue | Pigron Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2497 | PillaginMePixels | Pillagin' Me Pixels | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 472 | PillarStatue | Pillar Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 5842 | PineBookcase | Pine Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 5847 | PineClock | Pine Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 5851 | PinePiano | Pine Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 1926 | PineTable | Pine Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 5856 | PineWorkbench | Pine Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 139 | PinkBrick | Pink Brick | Dungeon Bricks | 0 | 3 | crate, world | crate, mining | family_page_candidate | crate:crate:Dungeon Crate:3205 \| crate:crate:Stockade Crate:3984 \| mining:world:Dungeon Bricks vein: |
| 1416 | PinkDungeonBookcase | Pink Dungeon Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2378 | PinkDungeonPiano | Pink Dungeon Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 1403 | PinkDungeonTable | Pink Dungeon Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 1410 | PinkDungeonVase | Pink Dungeon Vase | Vases | 0 | 1 | world | mining | family_page_candidate | mining:world:Vases vein: |
| 1404 | PinkDungeonWorkBench | Pink Dungeon Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 834 | PinkIceBlock | Pink Ice Block | Ice Blocks | 0 | 2 | world | mining, worldgen | family_page_candidate | worldgen:world:Ice Blocks worldgen: \| mining:world:Ice Blocks vein: |
| 1084 | PinkPaint | Pink Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 981 | PinkThread | Pink Thread | Threads | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Clothier:54 |
| 478 | PiranhaStatue | Piranha Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1485 | PlaceAbovetheClouds | Place Above the Clouds | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5308 | PlacePainting | r/Terraria | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 456 | PotionStatue | Potion Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 474 | PotStatue | Pot Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 5081 | PottedCrystalPlantFern | Potted Crystal Fern | Potted Crystal Plants | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Princess:663 |
| 5082 | PottedCrystalPlantSpiral | Potted Crystal Spiral | Potted Crystal Plants | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Princess:663 |
| 5083 | PottedCrystalPlantTeardrop | Potted Crystal Teardrop | Potted Crystal Plants | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Princess:663 |
| 5084 | PottedCrystalPlantTree | Potted Crystal Tree | Potted Crystal Plants | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Princess:663 |
| 4439 | PottedForestBamboo | Potted Forest Bamboo | Potted Trees | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 4430 | PottedForestCedar | Potted Forest Cedar | Potted Trees | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 4436 | PottedForestPalm | Potted Forest Palm | Potted Trees | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 4433 | PottedForestTree | Potted Forest Tree | Potted Trees | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 4441 | PottedHallowBamboo | Potted Hallow Bamboo | Potted Trees | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 4432 | PottedHallowCedar | Potted Hallow Cedar | Potted Trees | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 4438 | PottedHallowPalm | Potted Hallow Palm | Potted Trees | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 4435 | PottedHallowTree | Potted Hallow Tree | Potted Trees | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 4440 | PottedJungleBamboo | Potted Jungle Bamboo | Potted Trees | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 4431 | PottedJungleCedar | Potted Jungle Cedar | Potted Trees | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 4437 | PottedJunglePalm | Potted Jungle Palm | Potted Trees | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 4434 | PottedJungleTree | Potted Jungle Tree | Potted Trees | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 1434 | PoweredbyBirds | Powered by Birds | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 4634 | PrehistoryPreserved | Prehistory Preserved | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5085 | Princess64 | Princess 64 | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5310 | PrincessStyle | Princess Style | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3707 | ProjectilePressurePad | Teal Pressure Pad | Pressure Plates | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Mechanic:124 |
| 2670 | PumpkinBookcase | Pumpkin Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2603 | PumpkinClock | Pumpkin Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 2671 | PumpkinPiano | Pumpkin Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 1794 | PumpkinTable | Pumpkin Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 1795 | PumpkinWorkBench | Pumpkin Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 909 | PureWaterFountain | Pure Water Fountain | Water fountains | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Witch Doctor:228 |
| 5245 | Purity | Purity | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 833 | PurpleIceBlock | Purple Ice Block | Ice Blocks | 0 | 2 | world | mining, worldgen | family_page_candidate | worldgen:world:Ice Blocks worldgen: \| mining:world:Ice Blocks vein: |
| 4353 | PurpleMoss | Purple Moss | Moss | 0 | 3 | world, npc | worldgen, drop | family_page_candidate | drop:npc:Moss Zombie:691 \| worldgen:world:Moss worldgen: \| worldgen:world:Moss worldgen: |
| 1082 | PurplePaint | Purple Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 2011 | PurpleRainWallpaper | Purple Rain Wallpaper | Wallpapers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Painter:227 |
| 782 | PurpleSolution | Purple Solution | Solutions | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Steampunker:178 |
| 5483 | QueenOfBees | Queen of Bees | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 477 | QueenStatue | Queen Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 5128 | RainbowMoss | Helium Moss | Moss | 0 | 3 | world, npc | worldgen, drop | family_page_candidate | drop:npc:Moss Zombie:691 \| worldgen:world:Moss worldgen: \| worldgen:world:Moss worldgen: |
| 2012 | RainbowWallpaper | Rainbow Wallpaper | Wallpapers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Painter:227 |
| 1576 | RareEnchantment | Rare Enchantment | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 447 | ReaperStatue | Reaper Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 4724 | Reborn | Reborn | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1904 | RedAndBlueLights | Red and Blue Lights | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 1888 | RedAndGreenBulb | Red and Green Bulb | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 1881 | RedAndGreenGardland | Red and Green Garland | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 1901 | RedAndGreenLights | Red and Green Lights | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 1890 | RedAndYellowBulb | Red and Yellow Bulb | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 1900 | RedAndYellowLights | Red and Yellow Lights | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 1885 | RedBulb | Red Bulb | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 2286 | RedCape | Red Cape | Capes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 4338 | RedDragonfly | Red Dragonfly | Dragonflies | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Dragonflies worldgen: |
| 2261 | RedDynastyShingles | Red Dynasty Shingles | Dynasty Shingles | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 1880 | RedGardland | Red Garland | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 835 | RedIceBlock | Red Ice Block | Ice Blocks | 0 | 2 | world | mining, worldgen | family_page_candidate | worldgen:world:Ice Blocks worldgen: \| mining:world:Ice Blocks vein: |
| 597 | RedLight | Red Light | Christmas lights | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 1896 | RedLights | Red Lights | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 4351 | RedMoss | Red Moss | Moss | 0 | 3 | world, npc | worldgen, drop | family_page_candidate | drop:npc:Moss Zombie:691 \| worldgen:world:Moss worldgen: \| worldgen:world:Moss worldgen: |
| 1073 | RedPaint | Red Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 529 | RedPressurePlate | Red Pressure Plate | Pressure Plates | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Mechanic:124 |
| 970 | RedRocket | Red Rocket | Firework Rockets | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Party Girl:208 |
| 784 | RedSolution | Red Solution | Solutions | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Steampunker:178 |
| 5234 | RemnantsofDevotion | Remnants of Devotion | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5223 | Requiem | Requiem | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 4718 | RichMahoganyBeam | Rich Mahogany Beam | Beams | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Beams worldgen: |
| 2026 | RichMahoganyBookcase | Rich Mahogany Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2597 | RichMahoganyClock | Rich Mahogany Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 2211 | RichMahoganyFence | Rich Mahogany Fence | Fences | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Fences worldgen: |
| 642 | RichMahoganyPiano | Rich Mahogany Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 639 | RichMahoganyTable | Rich Mahogany Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 636 | RichMahoganyWorkBench | Rich Mahogany Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 771 | RocketI | Rocket I | Rockets | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Cyborg:209 |
| 772 | RocketII | Rocket II | Rockets | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Cyborg:209 |
| 773 | RocketIII | Rocket III | Rockets | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Cyborg:209 |
| 774 | RocketIV | Rocket IV | Rockets | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Cyborg:209 |
| 4537 | Rocks1Echo | Worn Stone Wall | Cave Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Cave Walls worldgen: |
| 4538 | Rocks2Echo | Stalactite Stone Wall | Cave Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Cave Walls worldgen: |
| 4539 | Rocks3Echo | Mottled Stone Wall | Cave Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Cave Walls worldgen: |
| 4540 | Rocks4Echo | Fractured Stone Wall | Cave Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Cave Walls worldgen: |
| 5600 | RollerSkatesBlueMountItem | Blue Roller Skates | Roller Skates | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 \| shop:npc:Traveling Merchant or Skeleton Merchant: |
| 5641 | RollerSkatesClassicMountItem | Classic Roller Skates | Roller Skates | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 \| shop:npc:Traveling Merchant or Skeleton Merchant: |
| 5640 | RollerSkatesGreenMountItem | Green Roller Skates | Roller Skates | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 \| shop:npc:Traveling Merchant or Skeleton Merchant: |
| 5642 | RollerSkatesPartyMountItem | Party Roller Skates | Roller Skates | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 \| shop:npc:Traveling Merchant or Skeleton Merchant: |
| 5266 | RoyalRomance | Royal Romance | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5392 | SandSolution | Yellow Solution | Solutions | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Steampunker:178 |
| 4300 | SandstoneBookcase | Sandstone Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 4306 | SandstoneClock | Sandstone Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 4720 | SandstoneColumn | Sandstone Column | Beams | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Beams worldgen: |
| 4310 | SandstonePiano | Sandstone Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 4314 | SandstoneTable | Sandstone Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 5374 | SandstoneWallUnsafe | Treacherous Sandstone Wall | Sandstone Walls | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Sandstone Walls worldgen: |
| 4315 | SandstoneWorkbench | Sandstone Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 3655 | ScorpionStatue | Scorpion Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 4360 | SeagullStatue | Seagull Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1491 | SecretoftheSands | Secret of the Sands | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5250 | Secrets | Secrets | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5258 | SeeTheWorldForWhatItIs | See The World For What It Is | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 2136 | ShadewoodBookcase | Shadewood Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2604 | ShadewoodClock | Shadewood Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 2213 | ShadewoodFence | Shadewood Fence | Fences | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Fences worldgen: |
| 919 | ShadewoodPiano | Shadewood Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 917 | ShadewoodTable | Shadewood Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 916 | ShadewoodWorkBench | Shadewood Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 1967 | ShadowPaint | Shadow Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 2672 | SharkStatue | Shark Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 442 | ShieldStatue | Shield Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1540 | ShiningMoon | Shining Moon | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3221 | ShiverthornPlanterBox | Shiverthorn Planter Box | Planter Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 5264 | SilentFish | Silent Fish | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3762 | SillyBalloonGreenWall | Silly Green Balloon Wall | Silly Balloon Walls | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Party Girl during a party: |
| 3760 | SillyBalloonPinkWall | Silly Pink Balloon Wall | Silly Balloon Walls | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Party Girl during a party: |
| 3761 | SillyBalloonPurpleWall | Silly Purple Balloon Wall | Silly Balloon Walls | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Party Girl during a party: |
| 3745 | SillyBalloonTiedGreen | Silly Tied Balloon (Green) | Silly Tied Balloons | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Party Girl:208 |
| 3743 | SillyBalloonTiedPink | Silly Tied Balloon (Pink) | Silly Tied Balloons | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Party Girl:208 |
| 3744 | SillyBalloonTiedPurple | Silly Tied Balloon (Purple) | Silly Tied Balloons | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Party Girl:208 |
| 1499 | Skelehead | Skelehead | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 446 | SkeletonStatue | Skeleton Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1419 | SkellingtonJSkellingsworth | Skellington J Skellingsworth | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1080 | SkyBluePaint | Sky Blue Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 1494 | SkyGuardian | Sky Guardian | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 2029 | SkywareBookcase | Skyware Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2606 | SkywareClock | Skyware Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 3899 | SkywareClock2 | Sunplate Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 2384 | SkywarePiano | Skyware Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 830 | SkywareTable | Skyware Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 2631 | SkywareWorkbench | Skyware Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 2569 | SlimeBookcase | Slime Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2575 | SlimeClock | Slime Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 2580 | SlimePiano | Slime Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 440 | SlimeStatue | Slime Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 2583 | SlimeTable | Slime Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 815 | SlimeWorkBench | Slime Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 3656 | SnailStatue | Snail Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 4631 | SnakesIHateSnakes | Snakes, I Hate Snakes | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5800 | SnowBookcase | Snow Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 5806 | SnowClock | Snow Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 1954 | SnowflakeWallpaper | Snowflake Wallpaper | Wallpapers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Painter:227 |
| 5811 | SnowPiano | Snow Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 5393 | SnowSolution | White Solution | Solutions | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Steampunker:178 |
| 5815 | SnowTable | Snow Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 5817 | SnowWorkbench | Snow Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 4147 | SolarBookcase | Solar Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 4154 | SolarClock | Solar Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 4158 | SolarPiano | Solar Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 4162 | SolarTable | Solar Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 4163 | SolarWorkbench | Solar Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 1422 | SomethingEvilisWatchingYou | Something Evil is Watching You | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 2013 | SparkleStoneWallpaper | Sparkle Stone Wallpaper | Wallpapers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Painter:227 |
| 2995 | SparkyPainting | Sparky | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 457 | SpearStatue | Spear Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 3933 | SpiderBookcase | Spider Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 3940 | SpiderClock | Spider Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 3944 | SpiderPiano | Spider Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 3948 | SpiderTable | Spider Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 3949 | SpiderWorkbench | Spider Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 6023 | SpikeBookcase | Spike Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 6029 | SpikeClock | Spike Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 6034 | SpikePiano | Spike Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 6038 | SpikeTable | Spike Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 6040 | SpikeWorkbench | Spike Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 2028 | SpookyBookcase | Spooky Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2605 | SpookyClock | Spooky Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 2383 | SpookyPiano | Spooky Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 1816 | SpookyTable | Spooky Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 1817 | SpookyWorkBench | Spooky Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 1953 | SquigglesWallpaper | Squiggles Wallpaper | Wallpapers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Painter:227 |
| 3651 | SquirrelStatue | Squirrel Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 4210 | StardustBookcase | Stardust Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 4217 | StardustClock | Stardust Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 4221 | StardustPiano | Stardust Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 4225 | StardustTable | Stardust Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 4226 | StardustWorkbench | Stardust Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 2014 | StarlitHeavenWallpaper | Starlit Heaven Wallpaper | Wallpapers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Painter:227 |
| 1439 | StarryNight | Starry Night | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 438 | StarStatue | Star Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1952 | StarsWallpaper | Stars Wallpaper | Wallpapers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Painter:227 |
| 1874 | StarTopper1 | Star Topper 1 | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 1875 | StarTopper2 | Star Topper 2 | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 1876 | StarTopper3 | Star Topper 3 | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 2024 | SteampunkBookcase | Steampunk Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 2241 | SteampunkClock | Steampunk Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 2258 | SteampunkCup | Chalice | Cups | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 2256 | SteampunkPiano | Steampunk Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 1718 | SteampunkTable | Steampunk Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 2253 | SteampunkWorkBench | Steampunk Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 5530 | StickmanVsTerrTerr | Stickman vs Terr Terr | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 4729 | StillLife | Still Life | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5881 | StoneBookcase | Stone Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 5887 | StoneClock | Stone Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 5891 | StonePiano | Stone Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 5894 | StoneTable | Stone Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 5896 | StoneWorkbench | Stone Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 5249 | StrangeDeadFellows | Strange Dead Fellows | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5247 | StrangeGrowth | Strange Growth | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5246 | SufficientlyAdvanced | Sufficiently Advanced | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1427 | Sunflowers | Sunflowers | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 475 | SunflowerStatue | Sunflower Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 5388 | SunOrnament | Eye of the Sun | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5244 | SunshineofIsrapony | Sunshine of Israpony | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5222 | SuspiciouslySparkly | Suspiciously Sparkly | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 439 | SwordStatue | Sword Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1078 | TealPaint | Teal Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 3634 | TeamBlockBlue | Blue Team Block | Team Blocks | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 3639 | TeamBlockBluePlatform | Blue Team Platform | Team Platforms | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 5676 | TeamBlockBlueVariant | Dull Blue Team Block | Team Blocks | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 3633 | TeamBlockGreen | Green Team Block | Team Blocks | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 3638 | TeamBlockGreenPlatform | Green Team Platform | Team Platforms | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 5675 | TeamBlockGreenVariant | Dull Green Team Block | Team Blocks | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 3636 | TeamBlockPink | Pink Team Block | Team Blocks | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 3641 | TeamBlockPinkPlatform | Pink Team Platform | Team Platforms | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 5678 | TeamBlockPinkVariant | Dull Pink Team Block | Team Blocks | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 3621 | TeamBlockRed | Red Team Block | Team Blocks | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 3622 | TeamBlockRedPlatform | Red Team Platform | Team Platforms | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 5674 | TeamBlockRedVariant | Dull Red Team Block | Team Blocks | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 3637 | TeamBlockWhite | White Team Block | Team Blocks | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 3642 | TeamBlockWhitePlatform | White Team Platform | Team Platforms | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 5679 | TeamBlockWhiteVariant | Dull White Team Block | Team Blocks | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 3635 | TeamBlockYellow | Yellow Team Block | Team Blocks | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 3640 | TeamBlockYellowPlatform | Yellow Team Platform | Team Platforms | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 5677 | TeamBlockYellowVariant | Dull Yellow Team Block | Team Blocks | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 5228 | TerraBladeChronicles | Terra Blade Chronicles | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1428 | TerrarianGothic | Terrarian Gothic | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1573 | TheCreationoftheGuide | The Creation of the Guide | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1420 | TheCursedMan | The Cursed Man | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5265 | TheDuke | The Duke | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1421 | TheEyeSeestheEnd | The Eye Sees the End | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1441 | TheGuardiansGaze | The Guardian's Gaze | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1373 | TheHangedMan | The Hanged Man | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1489 | TheLandofDeceivingLooks | The Land of Deceiving Looks | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1574 | TheMerchant | The Merchant | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1436 | ThePersistencyofEyes | The Persistency of Eyes | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5528 | TheRunicPixie | The Runic Pixie | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 4630 | TheSandsOfSlime | The Sands of Slime | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1424 | TheScreamer | The Screamer | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5486 | TheSeaOfSilence | The Sea of Silence | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1423 | TheTwinsHaveAwoken | The Twins Have Awoken | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5253 | TheWerewolf | The Werewolf | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5490 | ThisIsCanonNow | Brasilian Skies | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5260 | ThisIsGettingOutOfHand | This Is Getting Out Of Hand | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1484 | ThroughtheWindow | Through the Window | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5251 | Thunderbolt | Thunderbolt | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 2281 | TigerSkin | Tiger Skin | Animal skins | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 583 | Timer1Second | 1 Second Timer | Timers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Mechanic:124 |
| 584 | Timer3Second | 3 Second Timer | Timers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Mechanic:124 |
| 585 | Timer5Second | 5 Second Timer | Timers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Mechanic:124 |
| 4485 | TimerOneFourthSecond | 1/4 Second Timer | Timers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Mechanic:124 |
| 4484 | TimerOneHalfSecond | 1/2 Second Timer | Timers | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Mechanic:124 |
| 5318 | ToucanStatue | Toucan Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1478 | TrappedGhost | Trapped Ghost | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 467 | TreeStatue | Tree Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1502 | TrioSuperHeroes | Trio Super Heroes | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 4466 | TurtleStatue | Turtle Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 4636 | Uluru | Uluru | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3713 | UndeadVikingStatue | Undead Viking Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 1483 | UndergroundReward | Underground Reward | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1437 | UnicornCrossingtheHallows | Unicorn Crossing the Hallows | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3709 | UnicornStatue | Unicorn Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 5269 | VikingVoyage | Viking Voyage | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5127 | VioletMoss | Neon Moss | Moss | 0 | 3 | world, npc | worldgen, drop | family_page_candidate | drop:npc:Moss Zombie:691 \| worldgen:world:Moss worldgen: \| worldgen:world:Moss worldgen: |
| 1083 | VioletPaint | Violet Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 4637 | VisitingThePyramids | Visiting the Pyramids | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 4168 | VortexBookcase | Vortex Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 4175 | VortexClock | Vortex Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 4179 | VortexPiano | Vortex Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 4183 | VortexTable | Vortex Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 4184 | VortexWorkbench | Vortex Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 1474 | Waldo | Waldo | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 3708 | WallCreeperStatue | Wall Creeper Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 4627 | WatchfulAntlion | Watchful Antlion | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 6092 | WaterBookcase | Aquarium Bookcase | Bookcases | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Bookcases worldgen: |
| 6097 | WaterClock | Aquarium Clock | Grandfather Clocks | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Grandfather Clocks worldgen: |
| 3220 | WaterleafPlanterBox | Waterleaf Planter Box | Planter Boxes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Dryad:20 |
| 6102 | WaterPiano | Aquarium Piano | Pianos | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Pianos worldgen: |
| 6106 | WaterTable | Aquarium Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 6108 | WaterWorkbench | Aquarium Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 3632 | WeightedPressurePlateCyan | Cyan Weighted Pressure Plate | Pressure Plates | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Mechanic:124 |
| 3630 | WeightedPressurePlateOrange | Orange Weighted Pressure Plate | Pressure Plates | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Mechanic:124 |
| 3626 | WeightedPressurePlatePink | Pink Weighted Pressure Plate | Pressure Plates | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Mechanic:124 |
| 3631 | WeightedPressurePlatePurple | Purple Weighted Pressure Plate | Pressure Plates | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Mechanic:124 |
| 5259 | WhatLurksBelow | What Lurks Below | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 1894 | WhiteAndGreenBulb | White and Green Bulb | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 1892 | WhiteAndRedBulb | White and Red Bulb | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 1879 | WhiteAndRedGarland | White and Red Garland | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 1893 | WhiteAndYellowBulb | White and Yellow Bulb | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 1891 | WhiteBulb | White Bulb | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 1878 | WhiteGarland | White Garland | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 1098 | WhitePaint | White Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 4727 | WickedUndead | Wicked Undead | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5268 | Wildflowers | Wildflowers | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 2244 | WineGlass | Wine Glass | Cups | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 5237 | WingsofEvil | Wings of Evil | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 5491 | WinterAtVaringskollen | Winter At Varingskollen | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 2287 | WinterCape | Winter Cape | Capes | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 448 | WomanStatue | Woman Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 480 | WoodenBeam | Wooden Beam | Beams | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Beams worldgen: |
| 1447 | WoodenFence | Wooden Fence | Fences | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Fences worldgen: |
| 32 | WoodenTable | Wooden Table | Tables | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Tables worldgen: |
| 36 | WorkBench | Work Bench | Work Benches | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Work Benches worldgen: |
| 3653 | WormStatue | Worm Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 3711 | WraithStatue | Wraith Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |
| 509 | Wrench | Red Wrench | Wrenches | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Mechanic:124 |
| 4424 | WroughtIronFence | Wrought Iron Fence | Fences | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Fences worldgen: |
| 4378 | XenonMoss | Xenon Moss | Moss | 0 | 3 | world, npc | worldgen, drop | family_page_candidate | drop:npc:Moss Zombie:691 \| worldgen:world:Moss worldgen: \| worldgen:world:Moss worldgen: |
| 1889 | YellowAndGreenBulb | Yellow and Green Bulb | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 1902 | YellowAndGreenLights | Yellow and Green Lights | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 1886 | YellowBulb | Yellow Bulb | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 4339 | YellowDragonfly | Yellow Dragonfly | Dragonflies | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Dragonflies worldgen: |
| 1899 | YellowLights | Yellow Lights | Christmas Tree decorations | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Santa Claus:142 |
| 1075 | YellowPaint | Yellow Paint | Paints | 0 | 2 | npc | shop | family_page_candidate | shop:npc:Painter NPC: \| shop:npc:Traveling Merchant:368 |
| 853 | YellowPressurePlate | Yellow Pressure Plate | Pressure Plates | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Mechanic:124 |
| 973 | YellowRocket | Yellow Rocket | Firework Rockets | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Party Girl:208 |
| 3612 | YellowWrench | Yellow Wrench | Wrenches | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Mechanic:124 |
| 5242 | YuumaTheBlueTiger | Yuuma, The Blue Tiger | Paintings | 0 | 1 | world | worldgen | family_page_candidate | worldgen:world:Paintings worldgen: |
| 2283 | ZebraSkin | Zebra Skin | Animal skins | 0 | 1 | npc | shop | family_page_candidate | shop:npc:Traveling Merchant:368 |
| 3719 | ZombieArmStatue | Armed Zombie Statue | Statues | 0 | 2 | world | worldgen | family_page_candidate | worldgen:world:Statues worldgen: \| worldgen:world:Statues worldgen: |

## blocked_polluted_candidate

| itemId | itemInternalName | itemName | pageTitle | plannedRows | blockedRows | sourceRefTypes | sourceTypes | blockedReason | examples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 427 | BlueTorch | Blue Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 3004 | BoneTorch | Bone Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 932 | BoneWand | Bone Wand | Block-placing wands | 0 | 18 | unknown, npc, world, boss, container, treasure_bag | drop, worldgen, container, mining, treasure_bag | polluted_candidate | drop:npc:Angry Bones:-14 \| drop:npc:Cursed Skull:34 \| drop:npc:Dark Caster:32 |
| 1778 | BrideofFrankensteinDress | Bride of Frankenstein Dress | Bride of Frankenstein set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1777 | BrideofFrankensteinMask | Bride of Frankenstein Mask | Bride of Frankenstein set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1749 | CatMask | Cat Mask | Cat set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1751 | CatPants | Cat Pants | Cat set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1750 | CatShirt | Cat Shirt | Cat set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 4384 | CoralTorch | Coral Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 4385 | CorruptTorch | Corrupt Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 1746 | CreeperMask | Creeper Mask | Creeper set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1748 | CreeperPants | Creeper Pants | Creeper set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1747 | CreeperShirt | Creeper Shirt | Creeper set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 4386 | CrimsonTorch | Crimson Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 523 | CursedTorch | Cursed Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 433 | DemonTorch | Demon Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 4383 | DesertTorch | Desert Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 2611 | Flairon | Flairoon | Flairon | 0 | 3 | boss, treasure_bag, unknown | drop, treasure_bag | polluted_candidate | drop:boss:Duke Fishron:370 \| drop:unknown:Expert Mode: \| treasure_bag:treasure_bag:Treasure Bag (Duke Fishron):3330 |
| 1821 | FoxMask | Fox Mask | Fox set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1823 | FoxPants | Fox Pants | Fox set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1822 | FoxShirt | Fox Shirt | Fox set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1752 | GhostMask | Ghost Mask | Ghost set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1753 | GhostShirt | Ghost Shirt | Ghost set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 429 | GreenTorch | Green Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 4387 | HallowedTorch | Hallowed Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 1129 | HiveWand | Hive Wand | Block-placing wands | 0 | 18 | unknown, npc, world, boss, container, treasure_bag | drop, worldgen, container, mining, treasure_bag | polluted_candidate | drop:npc:Angry Bones:-14 \| drop:npc:Cursed Skull:34 \| drop:npc:Dark Caster:32 |
| 974 | IceTorch | Ice Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 1333 | IchorTorch | Ichor Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 4388 | JungleTorch | Jungle Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 1779 | KarateTortoiseMask | Karate Tortoise Mask | Karate Tortoise set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1781 | KarateTortoisePants | Karate Tortoise Pants | Karate Tortoise set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1780 | KarateTortoiseShirt | Karate Tortoise Shirt | Karate Tortoise set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 933 | LeafWand | Leaf Wand | Block-placing wands | 0 | 18 | unknown, npc, world, boss, container, treasure_bag | drop, worldgen, container, mining, treasure_bag | polluted_candidate | drop:npc:Angry Bones:-14 \| drop:npc:Cursed Skull:34 \| drop:npc:Dark Caster:32 |
| 1767 | LeprechaunHat | Leprechaun Hat | Leprechaun set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1769 | LeprechaunPants | Leprechaun Pants | Leprechaun set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1768 | LeprechaunShirt | Leprechaun Shirt | Leprechaun set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 3361 | LivingMahoganyLeafWand | Rich Mahogany Leaf Wand | Block-placing wands | 0 | 18 | unknown, npc, world, boss, container, treasure_bag | drop, worldgen, container, mining, treasure_bag | polluted_candidate | drop:npc:Angry Bones:-14 \| drop:npc:Cursed Skull:34 \| drop:npc:Dark Caster:32 |
| 3360 | LivingMahoganyWand | Living Mahogany Wand | Block-placing wands | 0 | 18 | unknown, npc, world, boss, container, treasure_bag | drop, worldgen, container, mining, treasure_bag | polluted_candidate | drop:npc:Angry Bones:-14 \| drop:npc:Cursed Skull:34 \| drop:npc:Dark Caster:32 |
| 832 | LivingWoodWand | Living Wood Wand | Block-placing wands | 0 | 18 | unknown, npc, world, boss, container, treasure_bag | drop, worldgen, container, mining, treasure_bag | polluted_candidate | drop:npc:Angry Bones:-14 \| drop:npc:Cursed Skull:34 \| drop:npc:Dark Caster:32 |
| 870 | MummyMask | Mummy Mask | Mummy set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Mummies: |
| 872 | MummyPants | Mummy Pants | Mummy set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Mummies: |
| 871 | MummyShirt | Mummy Shirt | Mummy set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Mummies: |
| 5293 | MushroomTorch | Mushroom Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 1245 | OrangeTorch | Orange Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 3114 | PinkTorch | Pink Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 1771 | PixiePants | Pixie Pants | Pixie set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1770 | PixieShirt | Pixie Shirt | Pixie set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 865 | PrincessDress | Princess Dress | Princess set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1773 | PrincessDressNew | Princess Dress | Princess set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1772 | PrincessHat | Princess Hat | Princess set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1754 | PumpkinMask | Pumpkin Mask | Pumpkin set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1756 | PumpkinPants | Pumpkin Pants | Pumpkin set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1755 | PumpkinShirt | Pumpkin Shirt | Pumpkin set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 430 | PurpleTorch | Purple Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 3045 | RainbowTorch | Rainbow Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 1819 | ReaperHood | Reaper Hood | Reaper set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1820 | ReaperRobe | Reaper Robe | Reaper set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 428 | RedTorch | Red Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 1757 | RobotMask | Robot Mask | Robot set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1759 | RobotPants | Robot Pants | Robot set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1758 | RobotShirt | Robot Shirt | Robot set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 965 | Rope | Rope | Ropes | 0 | 12 | npc, container, unknown | drop, container | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 5353 | ShimmerTorch | Aether Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 4411 | ShuckedOyster | Shucked Oyster | Shucked Oyster | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Oyster: |
| 3077 | SilkRope | Silk Rope | Ropes | 0 | 12 | npc, container, unknown | drop, container | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 1838 | SpaceCreatureMask | Space Creature Mask | Space Creature set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1840 | SpaceCreaturePants | Space Creature Pants | Space Creature set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1839 | SpaceCreatureShirt | Space Creature Shirt | Space Creature set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 8 | Torch | Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 1852 | TreasureHunterPants | Treasure Hunter Pants | Treasure Hunter set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1851 | TreasureHunterShirt | Treasure Hunter Shirt | Treasure Hunter set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 2274 | UltrabrightTorch | Ultrabright Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 1760 | UnicornMask | Unicorn Mask | Unicorn set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1762 | UnicornPants | Unicorn Pants | Unicorn set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1761 | UnicornShirt | Unicorn Shirt | Unicorn set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1763 | VampireMask | Vampire Mask | Vampire set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1765 | VampirePants | Vampire Pants | Vampire set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1764 | VampireShirt | Vampire Shirt | Vampire set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 2996 | VineRope | Vine Rope | Ropes | 0 | 12 | npc, container, unknown | drop, container | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 3078 | WebRope | Web Rope | Ropes | 0 | 12 | npc, container, unknown | drop, container | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 431 | WhiteTorch | White Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
| 1776 | WitchBoots | Witch Boots | Witch set | 0 | 2 | unknown, world | drop, worldgen | polluted_candidate | drop:unknown:Goodie Bag: \| worldgen:world:Witch set worldgen: |
| 1775 | WitchDress | Witch Dress | Witch set | 0 | 2 | unknown, world | drop, worldgen | polluted_candidate | drop:unknown:Goodie Bag: \| worldgen:world:Witch set worldgen: |
| 1766 | WitchHat | Witch Hat | Witch set | 0 | 2 | unknown, world | drop, worldgen | polluted_candidate | drop:unknown:Goodie Bag: \| worldgen:world:Witch set worldgen: |
| 1841 | WolfMask | Wolf Mask | Wolf set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1843 | WolfPants | Wolf Pants | Wolf set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 1842 | WolfShirt | Wolf Shirt | Wolf set | 0 | 1 | unknown | drop | polluted_candidate | drop:unknown:Goodie Bag: |
| 432 | YellowTorch | Yellow Torch | Torches | 0 | 15 | npc, container, unknown | drop, container, shop | polluted_candidate | drop:npc:Baby Slime:-5 \| drop:unknown:Bonus drop: \| drop:npc:Black Slime:-6 |
