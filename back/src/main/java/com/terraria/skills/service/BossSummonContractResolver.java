package com.terraria.skills.service;

import com.terraria.skills.entity.BossGroup;

import java.util.List;
import java.util.Map;

public final class BossSummonContractResolver {

    private static final Map<String, String> DEFAULT_SUMMON_METHODS = Map.ofEntries(
        Map.entry("KING_SLIME", "使用史莱姆王冠（Slime Crown）主动召唤；也可在史莱姆雨期间击杀足够史莱姆后出现，或极少在地图两侧外缘自然生成。"),
        Map.entry("EYE_OF_CTHULHU", "夜晚使用可疑眼球（Suspicious Looking Eye）召唤；满足生命值和防御条件后也可能在夜晚随机出现。"),
        Map.entry("EATER_OF_WORLDS", "在腐化之地使用蠕虫诱饵（Worm Food）召唤；也可通过摧毁 3 个暗影珠触发。"),
        Map.entry("BRAIN_OF_CTHULHU", "在猩红之地使用血腥脊椎（Bloody Spine）召唤；也可通过摧毁 3 个猩红心触发。"),
        Map.entry("QUEEN_BEE", "在地下丛林使用憎恶蜂巢（Abeemination）召唤；也可通过破坏蜂巢中的幼虫触发。"),
        Map.entry("SKELETRON", "夜晚在地牢门口与老人对话并选择诅咒即可召唤。"),
        Map.entry("DEERCLOPS", "在雪原使用鹿华（Deer Thing）主动召唤；也可能在暴风雪的午夜附近自然出现。"),
        Map.entry("WALL_OF_FLESH", "向地狱岩浆中丢入向导巫毒娃娃，且向导存活时即可召唤血肉墙。"),
        Map.entry("QUEEN_SLIME", "在神圣之地破坏明胶水晶（Gelatin Crystal）即可召唤。"),
        Map.entry("THE_TWINS", "夜晚使用机械魔眼（Mechanical Eye）召唤；满足条件时也可能在夜晚随机出现。"),
        Map.entry("THE_DESTROYER", "夜晚使用机械蠕虫（Mechanical Worm）召唤；满足条件时也可能在夜晚随机出现。"),
        Map.entry("SKELETRON_PRIME", "夜晚使用机械骷髅头（Mechanical Skull）召唤；满足条件时也可能在夜晚随机出现。"),
        Map.entry("PLANTERA", "击败三王后，在地下丛林破坏世纪之花花苞即可召唤。"),
        Map.entry("GOLEM", "在丛林神庙的蜥蜴祭坛上消耗蜥蜴能量电池（Lihzahrd Power Cell）召唤。"),
        Map.entry("DUKE_FISHRON", "在海洋中用装有松露虫（Truffle Worm）的鱼竿钓鱼即可召唤。"),
        Map.entry("EMPRESS_OF_LIGHT", "夜晚在地表神圣之地击杀七彩草蛉（Prismatic Lacewing）即可召唤。"),
        Map.entry("LUNATIC_CULTIST", "击败石巨人后，在地牢入口击杀拜月教邪教徒即可召唤。"),
        Map.entry("MOON_LORD", "摧毁全部四柱后会自动降临；也可使用天界符（Celestial Sigil）主动召唤。"),
        Map.entry("DARK_MAGE", "在永恒水晶座上放置永恒水晶并开启撒旦军队（Old One's Army）事件后，于对应波次出现。"),
        Map.entry("OGRE", "在撒旦军队（Old One's Army）事件的困难模式波次中出现。"),
        Map.entry("BETSY", "在石巨人后开启的撒旦军队（Old One's Army）最终波次出现。"),
        Map.entry("FLYING_DUTCHMAN", "在海盗入侵事件中出现。"),
        Map.entry("MOURNING_WOOD", "在南瓜月事件中出现。"),
        Map.entry("PUMPKING", "在南瓜月高波次中出现。"),
        Map.entry("EVERSCREAM", "在霜月事件中出现。"),
        Map.entry("SANTA_NK1", "在霜月事件中出现。"),
        Map.entry("ICE_QUEEN", "在霜月高波次中出现。"),
        Map.entry("MARTIAN_SAUCER", "触发火星暴乱事件后出现；通常需让火星探测怪发现玩家并成功逃离。"),
        Map.entry("SOLAR_PILLAR", "击败拜月教邪教徒后出现的天界柱之一，无需额外召唤物。"),
        Map.entry("NEBULA_PILLAR", "击败拜月教邪教徒后出现的天界柱之一，无需额外召唤物。"),
        Map.entry("VORTEX_PILLAR", "击败拜月教邪教徒后出现的天界柱之一，无需额外召唤物。"),
        Map.entry("STARDUST_PILLAR", "击败拜月教邪教徒后出现的天界柱之一，无需额外召唤物。"),
        Map.entry("MECHDUSA", "仅限天顶世界（Get fixed boi）等特殊种子，夜晚使用奥库瑞姆剃刀（Ocram's Razor）召唤。")
    );

    private static final Map<String, List<SummonItemRef>> DEFAULT_SUMMON_ITEMS = Map.ofEntries(
        Map.entry("KING_SLIME", List.of(summonItem("SlimeCrown", "Slime Crown"))),
        Map.entry("EYE_OF_CTHULHU", List.of(summonItem("SuspiciousLookingEye", "Suspicious Looking Eye"))),
        Map.entry("EATER_OF_WORLDS", List.of(summonItem("WormFood", "Worm Food"))),
        Map.entry("BRAIN_OF_CTHULHU", List.of(summonItem("BloodySpine", "Bloody Spine"))),
        Map.entry("QUEEN_BEE", List.of(summonItem("Abeemination", "Abeemination"))),
        Map.entry("DEERCLOPS", List.of(summonItem("DeerThing", "Deer Thing"))),
        Map.entry("WALL_OF_FLESH", List.of(summonItem("GuideVoodooDoll", "Guide Voodoo Doll"))),
        Map.entry("QUEEN_SLIME", List.of(summonItem("QueenSlimeCrystal", "Gelatin Crystal"))),
        Map.entry("THE_TWINS", List.of(summonItem("MechanicalEye", "Mechanical Eye"))),
        Map.entry("THE_DESTROYER", List.of(summonItem("MechanicalWorm", "Mechanical Worm"))),
        Map.entry("SKELETRON_PRIME", List.of(summonItem("MechanicalSkull", "Mechanical Skull"))),
        Map.entry("GOLEM", List.of(summonItem("LihzahrdPowerCell", "Lihzahrd Power Cell"))),
        Map.entry("DUKE_FISHRON", List.of(summonItem("TruffleWorm", "Truffle Worm"))),
        Map.entry("EMPRESS_OF_LIGHT", List.of(summonItem("EmpressButterfly", "Prismatic Lacewing"))),
        Map.entry("MOON_LORD", List.of(summonItem("CelestialSigil", "Celestial Sigil"))),
        Map.entry("DARK_MAGE", List.of(summonItem("DD2ElderCrystal", "Eternia Crystal"))),
        Map.entry("OGRE", List.of(summonItem("DD2ElderCrystal", "Eternia Crystal"))),
        Map.entry("BETSY", List.of(summonItem("DD2ElderCrystal", "Eternia Crystal"))),
        Map.entry("FLYING_DUTCHMAN", List.of(summonItem("PirateMap", "Pirate Map"))),
        Map.entry("MOURNING_WOOD", List.of(summonItem("PumpkinMoonMedallion", "Pumpkin Moon Medallion"))),
        Map.entry("PUMPKING", List.of(summonItem("PumpkinMoonMedallion", "Pumpkin Moon Medallion"))),
        Map.entry("EVERSCREAM", List.of(summonItem("NaughtyPresent", "Naughty Present"))),
        Map.entry("SANTA_NK1", List.of(summonItem("NaughtyPresent", "Naughty Present"))),
        Map.entry("ICE_QUEEN", List.of(summonItem("NaughtyPresent", "Naughty Present"))),
        Map.entry("MECHDUSA", List.of(summonItem("MechdusaSummon", "Ocram's Razor")))
    );

    private BossSummonContractResolver() {
    }

    public record SummonItemRef(String itemInternalName, String itemName, String role) {
    }

    public static String resolveExplicitSummonMethod(BossGroup bossGroup) {
        if (bossGroup == null) {
            return null;
        }
        return trimToNull(bossGroup.getSummonMethod());
    }

    public static String resolveSummonMethodResolved(BossGroup bossGroup) {
        if (bossGroup == null) {
            return null;
        }
        String explicit = resolveExplicitSummonMethod(bossGroup);
        if (explicit != null) {
            return explicit;
        }
        String code = trimToNull(bossGroup.getCode());
        if (code == null) {
            return null;
        }
        return DEFAULT_SUMMON_METHODS.get(code);
    }

    public static List<SummonItemRef> resolveSummonItemRefs(BossGroup bossGroup) {
        if (bossGroup == null) {
            return List.of();
        }
        String code = trimToNull(bossGroup.getCode());
        if (code == null) {
            return List.of();
        }
        return DEFAULT_SUMMON_ITEMS.getOrDefault(code, List.of());
    }

    private static SummonItemRef summonItem(String itemInternalName, String itemName) {
        return new SummonItemRef(itemInternalName, itemName, "summon");
    }

    private static String trimToNull(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }
}
