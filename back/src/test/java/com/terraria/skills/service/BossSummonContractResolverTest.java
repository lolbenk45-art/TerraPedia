package com.terraria.skills.service;

import com.terraria.skills.entity.BossGroup;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BossSummonContractResolverTest {

    @Test
    void shouldPreferExplicitSummonMethodForResolvedContract() {
        BossGroup bossGroup = bossGroup("KING_SLIME", "Use reviewed summon copy.");

        assertEquals("Use reviewed summon copy.", BossSummonContractResolver.resolveSummonMethodResolved(bossGroup));
    }

    @Test
    void shouldUseFallbackSummonMethodWhenExplicitValueIsMissing() {
        BossGroup bossGroup = bossGroup("MECHDUSA", null);

        String resolved = BossSummonContractResolver.resolveSummonMethodResolved(bossGroup);

        assertTrue(resolved.contains("奥库瑞姆剃刀"));
    }

    @Test
    void shouldReturnNullWhenNoExplicitOrFallbackSummonMethodExists() {
        BossGroup bossGroup = bossGroup("UNKNOWN_BOSS", null);

        assertNull(BossSummonContractResolver.resolveSummonMethodResolved(bossGroup));
    }

    private BossGroup bossGroup(String code, String summonMethod) {
        BossGroup bossGroup = new BossGroup();
        bossGroup.setCode(code);
        bossGroup.setSummonMethod(summonMethod);
        return bossGroup;
    }
}
