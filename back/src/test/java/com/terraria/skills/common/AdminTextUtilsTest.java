package com.terraria.skills.common;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class AdminTextUtilsTest {

    @Test
    void shouldReturnNullForNullValue() {
        assertNull(AdminTextUtils.trimToNull(null));
    }

    @Test
    void shouldReturnNullForBlankAndWhitespaceValues() {
        assertNull(AdminTextUtils.trimToNull(""));
        assertNull(AdminTextUtils.trimToNull(" \t\n "));
    }

    @Test
    void shouldTrimStringValue() {
        assertEquals("Terraria", AdminTextUtils.trimToNull("  Terraria  "));
    }

    @Test
    void shouldConvertNonStringValueWithStringValueOf() {
        assertEquals("42", AdminTextUtils.trimToNull(42));
    }

    @Test
    void shouldTrimCustomObjectStringRepresentation() {
        Object value = new Object() {
            @Override
            public String toString() {
                return "  custom value  ";
            }
        };

        assertEquals("custom value", AdminTextUtils.trimToNull(value));
    }

    @Test
    void shouldReturnNullForNullUnicodeBlankValue() {
        assertNull(AdminTextUtils.trimToNullUnicodeBlank(null));
    }

    @Test
    void shouldReturnNullForUnicodeOnlyBlankValue() {
        assertNull(AdminTextUtils.trimToNullUnicodeBlank("\u2003"));
    }

    @Test
    void shouldReturnNullForAsciiBlankValueAtUnicodeBoundary() {
        assertNull(AdminTextUtils.trimToNullUnicodeBlank(" \t\n "));
    }

    @Test
    void shouldPreserveUnicodeWhitespaceAroundNonBlankValue() {
        assertEquals("\u2003Terraria\u2003", AdminTextUtils.trimToNullUnicodeBlank("\u2003Terraria\u2003"));
    }

    @Test
    void shouldKeepUnicodeBlankValueForObjectTrimContract() {
        assertEquals("\u2003", AdminTextUtils.trimToNull("\u2003"));
    }
}
