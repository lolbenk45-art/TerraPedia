package com.terraria.skills.service.impl;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;

import com.terraria.skills.controller.AdminArmorSetController;
import org.springframework.beans.factory.annotation.Value;
import java.lang.reflect.Field;

import org.junit.jupiter.api.Test;

class PublicArmorSetRelationSchemaTest {
    @Test
    void relationSchemaIsConfigurableForIsolatedReadback() throws Exception {
        assertRelationSchemaBinding(PublicArmorSetServiceImpl.class);
        assertRelationSchemaBinding(AdminArmorSetController.class);
    }

    private void assertRelationSchemaBinding(Class<?> owner) throws Exception {
        Field field = owner.getDeclaredField("relationDatabaseName");
        assertTrue(field.getType().equals(String.class));
        assertEquals("${terraria.crawler.cross-db.relation-database:terria_v1_relation}",
            field.getAnnotation(Value.class).value());
    }
}
