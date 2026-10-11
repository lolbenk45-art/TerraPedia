package com.terraria.skills.service.impl.crawlerv2;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class SourceDispatchIdentityTest {

    private static final String HASH = "sha256:" + "a".repeat(64);
    private static final String CONTENT = "sha256:" + "b".repeat(64);
    private static final String RUN = "2026-09-03T01:02:03.004Z";

    @Test
    void preservesExactValuesAndMatchesOnlyTheSameIdentity() {
        SourceDispatchIdentity identity = new SourceDispatchIdentity(HASH, RUN, CONTENT);

        assertEquals(HASH, identity.sourceFingerprint());
        assertEquals(RUN, identity.sourceRunIdentity());
        assertEquals(CONTENT, identity.sourceContentIdentity());
        assertEquals(Instant.parse(RUN), identity.parsedSourceRunIdentity());
        assertEquals(identity, new SourceDispatchIdentity(HASH, RUN, CONTENT));
    }

    @Test
    void rejectsMissingOrMalformedHashAndRunValues() {
        assertThrows(IllegalArgumentException.class, () ->
            new SourceDispatchIdentity("sha256:ABC", RUN, CONTENT)
        );
        assertThrows(IllegalArgumentException.class, () ->
            new SourceDispatchIdentity(HASH, "not-an-instant", CONTENT)
        );
        assertThrows(IllegalArgumentException.class, () ->
            new SourceDispatchIdentity(HASH, RUN, "content")
        );
    }
}
