package com.terraria.skills.dto;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertTrue;

class NpcShopConditionDTOTest {

    @Test
    void shouldExposeNpcReferenceAccessorsForPublicAndAdminContracts() {
        Set<String> methodNames = Arrays.stream(NpcShopConditionDTO.class.getMethods())
            .map(java.lang.reflect.Method::getName)
            .collect(Collectors.toSet());

        assertTrue(methodNames.contains("getRefNpcName"), "Missing getRefNpcName accessor");
        assertTrue(methodNames.contains("getRefNpcNameZh"), "Missing getRefNpcNameZh accessor");
        assertTrue(methodNames.contains("getRefNpcInternalName"), "Missing getRefNpcInternalName accessor");
    }
}
