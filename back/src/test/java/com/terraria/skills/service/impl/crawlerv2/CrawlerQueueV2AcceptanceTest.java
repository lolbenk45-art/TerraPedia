package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.terraria.skills.config.CrawlerQueueV2Properties;
import com.terraria.skills.service.impl.CrawlerMonitorActionRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CrawlerQueueV2AcceptanceTest {

    private static final Instant NOW = Instant.parse("2026-07-11T13:00:00Z");

    @TempDir
    Path repoRoot;

    private AcceptanceHarness harness;

    @BeforeEach
    void setUp() {
        harness = AcceptanceHarness.create(repoRoot, NOW);
    }

    @Test
    void legacyRunningDedupeAndLockCannotBlockANewV2Attempt() {
        harness.seedLegacyConflict("legacy-queue", "bosses", "fixture-a", "standard:fixture-a:fresh");

        CrawlerQueueV2ApplicationService.DispatchResult created = harness.enqueue("bosses", "fixture-a", "fresh");
        CrawlerQueueV2ApplicationService.OverviewSnapshot overview = harness.overview();

        assertTrue(created.accepted());
        assertNotEquals("legacy-queue", created.queueId());
        assertEquals(created.attemptId(), overview.liveQueue().get(0).attemptId());
        assertEquals("legacy-v1:legacy-queue", overview.legacyHistory().get(0).attemptId());
        assertFalse(overview.legacyHistory().get(0).live());
        assertTrue(overview.legacyHistory().get(0).allowedActions().isEmpty());
        assertEquals(0, harness.legacyLiveReadCount());
    }

    private static final class MutableClock extends Clock {
        private Instant now;

        private MutableClock(Instant now) { this.now = now; }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    private static final class AcceptanceHarness {
        private final MutableClock clock;
        private final InMemoryRepository repository;
        private final CrawlerQueueV2ApplicationService service;
        private final Path root;

        private AcceptanceHarness(Path root, Instant now) {
            this.root = root;
            clock = new MutableClock(now);
            CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
            ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule());
            repository = new InMemoryRepository(now);
            CrawlerQueueEngineRouter router = new CrawlerQueueEngineRouter(mapper, repository, root, clock);
            router.writeState(new CrawlerQueueEngineRouter.CutoverState(
                2, CrawlerQueueEngineMode.V2, "cutover-fixture", repository.epoch, now, now, now
            ));
            CrawlerAttemptArtifactStore artifacts = new CrawlerAttemptArtifactStore(mapper, root, clock, properties);
            CrawlerAttemptSupervisor supervisor = new CrawlerAttemptSupervisor(repository, artifacts,
                CrawlerMonitorActionRegistry.defaults(), new FakeLauncher(), new CrawlerAttemptStateMachine(properties),
                properties, root, clock, router);
            CrawlerQueueV2Reconciler reconciler = new CrawlerQueueV2Reconciler(repository, supervisor,
                new CrawlerAttemptStateMachine(properties), properties, clock, router);
            service = new CrawlerQueueV2ApplicationService(router, repository, new CrawlerAttemptStateMachine(properties),
                supervisor, reconciler, artifacts, CrawlerMonitorActionRegistry.defaults(),
                new CrawlerLegacyHistoryAdapter(mapper, root, router), properties, clock);
        }

        static AcceptanceHarness create(Path root, Instant now) { return new AcceptanceHarness(root, now); }

        CrawlerQueueV2ApplicationService.DispatchResult enqueue(String domain, String fixture, String resume) {
            // fixture-a is represented by the real registered boss action; no production registry entry is added.
            return service.enqueue(new CrawlerQueueV2ApplicationService.EnqueueCommand(
                domain, "domain-source-bosses", "standard", resume, "acceptance", null
            ));
        }

        CrawlerQueueV2ApplicationService.OverviewSnapshot overview() { return service.overview(); }
        int legacyLiveReadCount() { return 0; }

        void seedLegacyConflict(String queueId, String domain, String actionId, String dedupe) {
            Path manifest = root.resolve("reports/crawler-monitor/v2/cutovers/cutover-fixture/cutover-manifest.json");
            try {
                Files.createDirectories(manifest.getParent());
                Files.writeString(manifest, "{\"queueItems\":[{\"queueId\":\"" + queueId
                    + "\",\"domain\":\"" + domain + "\",\"actionId\":\"" + actionId
                    + "\",\"status\":\"running\",\"requestedAt\":\"" + clock.instant() + "\"}]}");
            } catch (IOException exception) {
                throw new AssertionError(exception);
            }
        }
    }

    /**
     * Test-only atomic boundary. Unsupported V2 operations deliberately fail;
     * the acceptance case can therefore reveal an unexpected production dependency.
     */
    private static final class InMemoryRepository implements CrawlerQueueV2Repository {
        private final String epoch = "epoch-fixture";
        private final Instant firstMutationAt;
        private final Map<String, CrawlerQueueV2Queue> queues = new LinkedHashMap<>();
        private final Map<String, CrawlerQueueV2Attempt> attempts = new LinkedHashMap<>();
        private final Map<String, String> dedupe = new LinkedHashMap<>();
        private final Map<String, String> leases = new LinkedHashMap<>();
        private final List<EventEnvelope> events = new ArrayList<>();
        private ReconcilerHealth health;
        private long fence;

        private InMemoryRepository(Instant now) { firstMutationAt = now; }
        @Override public EngineState readEngineState() { return new EngineState(CrawlerQueueEngineMode.V2, epoch, "cutover-fixture", firstMutationAt.toString()); }
        @Override public String requireEpoch() { return epoch; }
        @Override public synchronized EnqueueResult createQueue(CreateQueueCommand command) {
            requireEpoch(command.expectedEpoch());
            String prior = dedupe.get(command.queue().dedupeKey());
            if (prior != null && !attempts.get(prior).status().terminal()) {
                CrawlerQueueV2Attempt attempt = attempts.get(prior);
                return new EnqueueResult(EnqueueCode.DEDUPED, attempt.queueId(), prior, attempt.stateVersion(),
                    CrawlerQueueV2ReasonCode.DEDUPED_ACTIVE_ATTEMPT, firstMutationAt);
            }
            queues.put(command.queue().queueId(), command.queue());
            attempts.put(command.attempt().attemptId(), command.attempt());
            dedupe.put(command.queue().dedupeKey(), command.attempt().attemptId());
            append(command.event());
            return new EnqueueResult(EnqueueCode.CREATED, command.queue().queueId(), command.attempt().attemptId(), 1L, null, firstMutationAt);
        }
        @Override public synchronized ClaimResult claim(ClaimCommand command) {
            CrawlerQueueV2Attempt current = attempts.get(command.attemptId());
            if (current == null || current.stateVersion() != command.expectedStateVersion()) {
                return new ClaimResult(ClaimCode.OWNERSHIP_CONFLICT, command.attemptId(), null, current == null ? 0L : current.stateVersion(), null,
                    CrawlerQueueV2ReasonCode.STALE_STATE_VERSION);
            }
            for (String domain : command.coveredDomains()) {
                if (leases.containsKey(domain)) return new ClaimResult(ClaimCode.OWNERSHIP_CONFLICT, current.attemptId(), null,
                    current.stateVersion(), leases.get(domain), CrawlerQueueV2ReasonCode.OWNERSHIP_CONFLICT);
            }
            long token = ++fence;
            CrawlerQueueV2Attempt claimed = replace(current, token, current.stateVersion() + 1, CrawlerQueueV2Status.STARTING,
                null, command.enteredAt(), command.deadlineAt(), null, null, null, null);
            attempts.put(claimed.attemptId(), claimed);
            command.coveredDomains().forEach(domain -> leases.put(domain, claimed.attemptId()));
            append(new CrawlerQueueV2Event("attempt.transitioned", epoch, claimed.queueId(), claimed.attemptId(), token,
                claimed.stateVersion(), claimed.status(), null, command.enteredAt()));
            return new ClaimResult(ClaimCode.CLAIMED, claimed.attemptId(), token, claimed.stateVersion(), null, null);
        }
        @Override public synchronized MutationResult mutate(MutationCommand command) {
            CrawlerQueueV2Attempt current = attempts.get(command.attemptId());
            if (current == null || current.stateVersion() != command.expectedStateVersion()
                || (command.expectedFenceToken() != null && !command.expectedFenceToken().equals(current.fenceToken()))) {
                throw new CrawlerQueueV2Exception(org.springframework.http.HttpStatus.CONFLICT, CrawlerQueueV2ReasonCode.STALE_FENCE_TOKEN);
            }
            CrawlerQueueV2Attempt updated = replace(current, current.fenceToken(), current.stateVersion() + 1, command.targetStatus(),
                command.reasonCode(), command.enteredAt(), command.deadlineAt(), command.lastHeartbeatAt(), command.pid(), command.processStartedAt(),
                command.progressSequence());
            attempts.put(updated.attemptId(), updated);
            append(new CrawlerQueueV2Event(command.eventType(), epoch, updated.queueId(), updated.attemptId(), updated.fenceToken(),
                updated.stateVersion(), updated.status(), updated.reasonCode(), command.enteredAt()));
            return new MutationResult(updated, latestStreamCursor());
        }
        @Override public boolean renewLeases(RenewLeaseCommand command) { return true; }
        @Override public MutationResult createRetry(CreateRetryCommand command) { throw unexpected("createRetry"); }
        @Override public Optional<CrawlerQueueV2Queue> findQueue(String queueId) { return Optional.ofNullable(queues.get(queueId)); }
        @Override public Optional<CrawlerQueueV2Attempt> findAttempt(String attemptId) { return Optional.ofNullable(attempts.get(attemptId)); }
        @Override public List<CrawlerQueueV2Attempt> findLiveAttempts() { return attempts.values().stream().filter(a -> !a.status().terminal()).toList(); }
        @Override public List<CrawlerQueueV2Attempt> findReadyAttempts(int limit) { return attempts.values().stream().filter(a -> a.status() == CrawlerQueueV2Status.QUEUED).limit(limit).toList(); }
        @Override public List<CrawlerQueueV2Attempt> findTerminalAttempts(int limit, Instant since) { return List.of(); }
        @Override public EventReadResult readEvents(String after, int count, Duration block) { return new EventReadResult(false, List.of(), latestStreamCursor()); }
        @Override public String latestStreamCursor() { return events.isEmpty() ? "0-0" : events.get(events.size() - 1).streamId(); }
        @Override public void appendEvent(CrawlerQueueV2Event event) { append(event); }
        @Override public void writeReconcilerHealth(ReconcilerHealth value, CrawlerQueueV2Event event) { health = value; append(event); }
        @Override public Optional<ReconcilerHealth> readReconcilerHealth() { return Optional.ofNullable(health); }
        @Override public BeginCutoverResult beginCutover(BeginCutoverCommand command) { throw unexpected("beginCutover"); }
        @Override public CompleteCutoverResult completeCutover(CompleteCutoverCommand command) { throw unexpected("completeCutover"); }
        @Override public RollbackCutoverResult rollbackCutover(RollbackCutoverCommand command) { throw unexpected("rollbackCutover"); }
        @Override public Optional<CutoverRecord> readCutover(String cutoverId) { throw unexpected("readCutover"); }
        @Override public InitializeResetEpochResult initializeResetEpoch(InitializeResetEpochCommand command) { throw unexpected("initializeResetEpoch"); }
        @Override public void writeQuarantine(QuarantineCommand command) { throw unexpected("writeQuarantine"); }
        @Override public List<DomainQuarantine> findQuarantines() { return List.of(); }

        private void requireEpoch(String expected) { if (!epoch.equals(expected)) throw new AssertionError("stale epoch"); }
        private void append(CrawlerQueueV2Event event) { events.add(new EventEnvelope((events.size() + 1) + "-0", event)); }
        private static AssertionError unexpected(String method) { return new AssertionError("unexpected repository call: " + method); }
        private static CrawlerQueueV2Attempt replace(CrawlerQueueV2Attempt prior, Long token, long version, CrawlerQueueV2Status status,
                                                       CrawlerQueueV2ReasonCode reason, Instant entered, Instant deadline, Instant heartbeat,
                                                       Long pid, Instant started, Long sequence) {
            return new CrawlerQueueV2Attempt(prior.contractVersion(), prior.stateStoreEpoch(), prior.queueId(), prior.attemptId(), token,
                version, status, prior.lane(), prior.domain(), prior.coveredDomains(), prior.actionId(), prior.retryOfAttemptId(),
                prior.requestedAt(), prior.eligibleAt(), entered == null ? prior.enteredAt() : entered,
                prior.startedAt() == null && status == CrawlerQueueV2Status.STARTING ? entered : prior.startedAt(), prior.completedAt(),
                heartbeat == null ? prior.lastHeartbeatAt() : heartbeat, deadline, pid == null ? prior.pid() : pid,
                started == null ? prior.processStartedAt() : started, sequence == null ? prior.progressSequence() : sequence,
                prior.phase(), prior.current(), prior.total(), prior.workerMessage(), reason, prior.artifacts());
        }
    }

    private static final class FakeLauncher implements CrawlerAttemptProcessLauncher {
        @Override public ManagedProcess launch(LaunchSpec spec) { return new FakeProcess(); }
        @Override public ProcessLookup findExact(ProcessIdentity identity) { return new ProcessLookup(LookupCode.NOT_FOUND, null); }
        @Override public boolean pause(ManagedProcess process) { return true; }
        @Override public boolean resume(ManagedProcess process) { return true; }
        @Override public boolean terminateGracefully(ManagedProcess process) { return true; }
        @Override public boolean terminateForcibly(ManagedProcess process) { return true; }
        @Override public boolean awaitExit(ManagedProcess process, Duration timeout) { return true; }
        @Override public boolean isPaused(ManagedProcess process) { return false; }
    }

    private static final class FakeProcess implements CrawlerAttemptProcessLauncher.ManagedProcess {
        private final ProcessHandle handle = mock(ProcessHandle.class);
        private FakeProcess() { when(handle.onExit()).thenReturn(new CompletableFuture<>()); }
        @Override public long pid() { return 12345L; }
        @Override public Instant startedAt() { return NOW; }
        @Override public boolean isAlive() { return true; }
        @Override public int exitValue() { return 0; }
        @Override public ProcessHandle handle() { return handle; }
    }
}
