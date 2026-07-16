package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CrawlerQueueEngineRouterTest {

    private static final Instant NOW = Instant.parse("2026-07-13T01:00:00Z");

    @TempDir
    Path repoRoot;

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
    private final CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);

    @Test
    void usesV1OnlyWhenDurableAndRedisStateAreBothV1() {
        when(repository.readEngineState()).thenReturn(engine(CrawlerQueueEngineMode.V1, null, null, null));

        assertEquals(CrawlerQueueEngineMode.V1, router().mode());
    }

    @Test
    void neverFallsBackToV1WhenDurableV2MarkerExistsAndRedisIsUnavailable() {
        CrawlerQueueEngineRouter router = router();
        router.writeState(state(CrawlerQueueEngineMode.V2, "cutover-1", "epoch-1", null, null));
        when(repository.readEngineState()).thenThrow(new CrawlerQueueV2Exception(
            HttpStatus.SERVICE_UNAVAILABLE,
            CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE
        ));

        CrawlerQueueV2Exception exception = assertThrows(CrawlerQueueV2Exception.class, router::mode);

        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE, exception.reasonCode());
        assertNotEquals(CrawlerQueueEngineMode.V1, router.lastKnownMode());
    }

    @Test
    void entersMaintenanceWhenDurableAndRedisModesMismatch() {
        CrawlerQueueEngineRouter router = router();
        router.writeState(state(CrawlerQueueEngineMode.V2, "cutover-1", "epoch-1", null, null));
        when(repository.readEngineState()).thenReturn(engine(CrawlerQueueEngineMode.V1, null, null, null));

        assertEquals(CrawlerQueueEngineMode.MAINTENANCE, router.mode());
        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, router.lastReasonCode());
    }

    @Test
    void treatsAnAbsentMarkerAndRedisV2AsMaintenanceInsteadOfV1() {
        when(repository.readEngineState()).thenReturn(engine(CrawlerQueueEngineMode.V2, "epoch-1", "cutover-1", null));

        CrawlerQueueEngineRouter router = router();

        assertEquals(CrawlerQueueEngineMode.MAINTENANCE, router.mode());
        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, router.lastReasonCode());
        assertFalse(router.allowsLegacyMutations());
    }

    @Test
    void maintenanceMarkerBlocksLegacyMutationAndDrain() {
        CrawlerQueueEngineRouter router = router();
        router.writeState(state(CrawlerQueueEngineMode.MAINTENANCE, "cutover-1", "epoch-1", null, null));
        when(repository.readEngineState()).thenReturn(engine(CrawlerQueueEngineMode.V1, null, null, null));

        assertEquals(CrawlerQueueEngineMode.MAINTENANCE, router.mode());
        assertFalse(router.allowsLegacyMutations());
    }

    @Test
    void confirmsReservedFirstMutationOnlyFromMatchingRedisIdentityAndEvidence() {
        CrawlerQueueEngineRouter router = router();
        router.writeState(state(CrawlerQueueEngineMode.V2, "cutover-1", "epoch-1", NOW.plusSeconds(1), null));
        when(repository.readEngineState()).thenReturn(engine(
            CrawlerQueueEngineMode.V2,
            "epoch-1",
            "cutover-1",
            NOW.plusSeconds(2).toString()
        ));

        CrawlerQueueEngineRouter.CutoverState reconciled = router.reconcileFirstMutationReservation();

        assertEquals(CrawlerQueueEngineMode.V2, reconciled.mode());
        assertEquals(NOW.plusSeconds(2), reconciled.firstLiveMutationAt());
        assertEquals(NOW.plusSeconds(1), reconciled.mutationReservationAt());
    }

    @Test
    void keepsAmbiguousReservationInMaintenanceAndForbidsRollback() {
        CrawlerQueueEngineRouter router = router();
        router.writeState(state(CrawlerQueueEngineMode.V2, "cutover-1", "epoch-1", NOW.plusSeconds(1), null));
        when(repository.readEngineState()).thenReturn(engine(
            CrawlerQueueEngineMode.V2,
            "epoch-1",
            "cutover-1",
            null
        ));

        CrawlerQueueEngineRouter.CutoverState reconciled = router.reconcileFirstMutationReservation();

        assertEquals(CrawlerQueueEngineMode.MAINTENANCE, reconciled.mode());
        assertEquals(CrawlerQueueV2ReasonCode.FIRST_MUTATION_OUTCOME_UNCERTAIN, router.lastReasonCode());
        assertNull(reconciled.firstLiveMutationAt());
        assertNotNull(reconciled.mutationReservationAt());
        assertFalse(router.rollbackPermitted());
    }

    @Test
    void permitsRollbackOnlyBeforeAnyReservationOrFirstMutation() {
        CrawlerQueueEngineRouter router = router();
        router.writeState(state(CrawlerQueueEngineMode.MAINTENANCE, "cutover-1", "epoch-1", null, null));
        when(repository.readEngineState()).thenReturn(engine(CrawlerQueueEngineMode.MAINTENANCE, "epoch-1", "cutover-1", null));

        assertTrue(router.rollbackPermitted());
    }

    @Test
    void putsMissingRedisEpochForDurableV2InMaintenanceUntilExplicitReset() {
        CrawlerQueueEngineRouter router = router();
        router.writeState(state(CrawlerQueueEngineMode.V2, "cutover-1", "epoch-1", null, null));
        when(repository.readEngineState()).thenReturn(engine(CrawlerQueueEngineMode.V2, null, "cutover-1", null));

        assertEquals(CrawlerQueueEngineMode.MAINTENANCE, router.mode());
        assertEquals(CrawlerQueueV2ReasonCode.STATE_STORE_RESET, router.lastReasonCode());
    }

    @Test
    void writesReservationWithAtomicReplacementBeforeAnyRedisCall() throws Exception {
        CrawlerQueueEngineRouter router = router();
        router.writeState(state(CrawlerQueueEngineMode.V2, "cutover-1", "epoch-1", null, null));

        CrawlerQueueEngineRouter.CutoverState reserved = router.reserveFirstLiveMutation(NOW.plusSeconds(1));
        Path stateFile = repoRoot.resolve("reports/crawler-monitor/v2/cutover-state.json");

        assertEquals(NOW.plusSeconds(1), reserved.mutationReservationAt());
        assertTrue(Files.exists(stateFile));
        assertTrue(Files.readString(stateFile).contains("mutationReservationAt"));
        try (var paths = Files.list(stateFile.getParent())) {
            assertTrue(paths.noneMatch(path -> path.getFileName().toString().contains(".tmp")));
        }
    }

    @Test
    void serializesConcurrentReadModifyWriteAndRejectsAnIncompatibleOverwrite() throws Exception {
        CrawlerQueueEngineRouter first = router();
        CrawlerQueueEngineRouter second = new CrawlerQueueEngineRouter(
            objectMapper,
            repository,
            repoRoot,
            Clock.fixed(NOW, ZoneOffset.UTC)
        );
        first.writeState(state(CrawlerQueueEngineMode.V2, "cutover-1", "epoch-1", null, null));
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> reservation = executor.submit(() -> {
                ready.countDown();
                await(start);
                first.reserveFirstLiveMutation(NOW.plusSeconds(1));
            });
            Future<?> incompatible = executor.submit(() -> {
                ready.countDown();
                await(start);
                return assertThrows(IllegalStateException.class, () -> second.writeState(
                    state(CrawlerQueueEngineMode.V2, "cutover-other", "epoch-other", null, null)
                ));
            });
            ready.await();
            start.countDown();
            reservation.get();
            incompatible.get();
        } finally {
            executor.shutdownNow();
        }

        CrawlerQueueEngineRouter.CutoverState durable = first.readDurableState();
        assertEquals("cutover-1", durable.cutoverId());
        assertEquals("epoch-1", durable.stateStoreEpoch());
        assertEquals(NOW.plusSeconds(1), durable.mutationReservationAt());
    }

    @Test
    void completeStateStoreResetKeepsTheConfirmedReservationAndFirstMutationPair() {
        CrawlerQueueEngineRouter router = router();
        Instant reservation = NOW.minusSeconds(2);
        Instant firstMutation = NOW.minusSeconds(1);
        router.writeState(state(CrawlerQueueEngineMode.MAINTENANCE, "cutover-1", "epoch-old", reservation, firstMutation));
        when(repository.readEngineState()).thenReturn(engine(
            CrawlerQueueEngineMode.V2,
            "epoch-new",
            "cutover-1",
            firstMutation.toString()
        ));

        CrawlerQueueEngineRouter.CutoverState completed = router.completeStateStoreReset("epoch-new", firstMutation);

        assertEquals(CrawlerQueueEngineMode.V2, completed.mode());
        assertEquals("epoch-new", completed.stateStoreEpoch());
        assertEquals(reservation, completed.mutationReservationAt());
        assertEquals(firstMutation, completed.firstLiveMutationAt());
        assertEquals(CrawlerQueueEngineMode.V2, router.mode());
    }

    private CrawlerQueueEngineRouter router() {
        return new CrawlerQueueEngineRouter(
            objectMapper,
            repository,
            repoRoot,
            Clock.fixed(NOW, ZoneOffset.UTC)
        );
    }

    private static CrawlerQueueEngineRouter.CutoverState state(
        CrawlerQueueEngineMode mode,
        String cutoverId,
        String epoch,
        Instant reservation,
        Instant firstMutation
    ) {
        return new CrawlerQueueEngineRouter.CutoverState(
            2,
            mode,
            cutoverId,
            epoch,
            NOW,
            reservation,
            firstMutation
        );
    }

    private static CrawlerQueueV2Repository.EngineState engine(
        CrawlerQueueEngineMode mode,
        String epoch,
        String cutoverId,
        String firstMutation
    ) {
        return new CrawlerQueueV2Repository.EngineState(mode, epoch, cutoverId, firstMutation);
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(2, TimeUnit.SECONDS)) {
                throw new AssertionError("timed out waiting for deterministic test interleaving");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AssertionError(exception);
        }
    }
}
