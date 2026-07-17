package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.terraria.skills.config.CrawlerQueueV2Properties;
import com.terraria.skills.service.impl.CrawlerMonitorActionRegistry;
import com.terraria.skills.service.impl.CrawlerMonitorActionDefinition;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InOrder;
import org.springframework.http.HttpStatus;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;
import java.util.function.UnaryOperator;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CrawlerAttemptSupervisorTest {

    private static final Instant NOW = Instant.parse("2026-07-11T13:00:00Z");
    private static final Instant STARTED_AT = Instant.parse("2026-07-11T12:59:59Z");

    @TempDir
    Path repoRoot;

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
    private final CrawlerQueueV2Repository repository = mock(CrawlerQueueV2Repository.class);
    private final CrawlerAttemptArtifactStore artifactStore = mock(CrawlerAttemptArtifactStore.class);

    @Test
    void shouldInjectTheCompleteAttemptIdentityAndUseAttemptScopedPaths() {
        CrawlerQueueV2Attempt attempt = startingAttempt(142L, 2L);
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, attempt);

        supervisor.start(attempt);

        CrawlerAttemptProcessLauncher.LaunchSpec spec = launcher.lastLaunchSpec();
        assertEquals(repoRoot.toString(), spec.environment().get("WORKTREE_ROOT"));
        assertEquals("domain-source-bosses", spec.environment().get("TERRAPEDIA_CRAWLER_ACTION_ID"));
        assertEquals("queue-1", spec.environment().get("TERRAPEDIA_CRAWLER_QUEUE_ID"));
        assertEquals("attempt-1", spec.environment().get("TERRAPEDIA_CRAWLER_ATTEMPT_ID"));
        assertEquals("142", spec.environment().get("TERRAPEDIA_CRAWLER_FENCE_TOKEN"));
        assertEquals("epoch-1", spec.environment().get("TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH"));
        assertEquals("2", spec.environment().get("TERRAPEDIA_CRAWLER_INITIAL_STATE_VERSION"));
        assertEquals("0", spec.environment().get("TERRAPEDIA_CRAWLER_PROGRESS_SEQUENCE"));
        assertEquals(attempt.artifacts().progressPath(), spec.environment().get("TERRAPEDIA_CRAWLER_PROGRESS_PATH"));
        assertEquals(attempt.artifacts().logPath(), storedPath(spec.logPath()));
        assertEquals(repoRoot.toAbsolutePath().normalize(), spec.directory());
        assertTrue(spec.command().contains("--progress-path=" + attempt.artifacts().progressPath()));
        assertTrue(spec.command().contains("--resume-mode=fresh"));
        assertTrue(spec.command().contains("--resume-state=data/generated/resume/domain-source-bosses.resume.json"));
    }

    @Test
    void resumableRetryLaunchesWithAutoResumeMode() {
        CrawlerQueueV2Attempt attempt = withRetryOf(startingAttempt(142L, 2L), "attempt-prior");
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, attempt);

        supervisor.start(attempt);

        assertTrue(launcher.lastLaunchSpec().command().contains("--resume-mode=auto"));
        assertTrue(launcher.lastLaunchSpec().command().contains(
            "--resume-state=data/generated/resume/domain-source-bosses.resume.json"
        ));
    }

    @Test
    void recoveryRegistersOnlyTheExactExpectedProcessStateAndIsIdempotent() {
        CrawlerQueueV2Attempt running = runningAttempt(142L, 7L, 11L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        FakeLauncher launcher = new FakeLauncher(process);
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, running);

        assertTrue(supervisor.recoverExactProcess(running, false));
        assertTrue(supervisor.recoverExactProcess(running, false));
        assertEquals(1, supervisor.managedProcessCount());

        process.paused = true;
        assertFalse(supervisor.recoverExactProcess(running, false));
        CrawlerQueueV2Attempt paused = withStatus(running, CrawlerQueueV2Status.PAUSED, 7L);
        latestAttempt.set(paused);
        assertTrue(supervisor.recoverExactProcess(paused, true));
    }

    @Test
    void recoveredProcessWithoutExitCodeMustConvergeToFailedAndReleaseOwnership() {
        CrawlerQueueV2Attempt running = runningAttempt(142L, 7L, 11L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        FakeLauncher launcher = new FakeLauncher(process);
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, running);

        assertTrue(supervisor.recoverExactProcess(running, false));

        process.completeExitWithoutCode();

        verify(repository).mutate(argThat(command ->
            command.targetStatus() == CrawlerQueueV2Status.FAILED
                && command.reasonCode() == CrawlerQueueV2ReasonCode.PROCESS_EXIT_CODE_UNAVAILABLE
                && command.releaseOwnership()
        ));
        verify(artifactStore).writeManifest(argThat(manifest ->
            manifest.status() == CrawlerQueueV2Status.FAILED && manifest.exitCode() == null
        ));
        assertEquals(0, supervisor.managedProcessCount());
    }

    @Test
    void recoveredPausedProcessWithoutExitCodeMustConvergeToFailedAndReleaseOwnership() {
        CrawlerQueueV2Attempt paused = withStatus(runningAttempt(142L, 7L, 11L), CrawlerQueueV2Status.PAUSED, 7L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        process.paused = true;
        CrawlerAttemptSupervisor supervisor = supervisor(new FakeLauncher(process), paused);

        assertTrue(supervisor.recoverExactProcess(paused, true));

        process.completeExitWithoutCode();

        verify(repository).mutate(argThat(command ->
            command.targetStatus() == CrawlerQueueV2Status.FAILED
                && command.reasonCode() == CrawlerQueueV2ReasonCode.PROCESS_EXIT_CODE_UNAVAILABLE
                && command.releaseOwnership()
        ));
        assertEquals(0, supervisor.managedProcessCount());
    }

    @Test
    void startsTheHiddenFixtureDefinitionWithoutAddingItToTheProductionRegistry() {
        CrawlerQueueV2Attempt attempt = withAction(
            startingAttempt(142L, 2L),
            "crawler_queue_v2_fixture",
            "crawler-queue-v2-fixture"
        );
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, attempt);

        supervisor.start(attempt);

        assertEquals(
            List.of("node", "scripts/data/monitor/crawler-queue-v2-fixture.mjs", "--progress-path="
                + attempt.artifacts().progressPath(), "--heartbeats=20", "--interval-ms=250"),
            launcher.lastLaunchSpec().command()
        );
        assertFalse(CrawlerMonitorActionRegistry.defaults().all().stream()
            .anyMatch(action -> "crawler-queue-v2-fixture".equals(action.actionId())));
    }

    @Test
    void keepsFixtureExecutionInTheWorktreeWhileWritingArtifactsToAnExternalFixtureRoot() throws IOException {
        Path fixtureRoot = Files.createTempDirectory("crawler-v2-fixture-artifacts-");
        CrawlerQueueV2Attempt attempt = withAction(
            startingAttempt(142L, 2L),
            "crawler_queue_v2_fixture",
            "crawler-queue-v2-fixture"
        );
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        CrawlerAttemptSupervisor supervisor = supervisor(
            launcher,
            attempt,
            CrawlerMonitorActionRegistry.defaults(),
            new CrawlerQueueV2Properties(),
            v2Router().router(),
            repoRoot,
            fixtureRoot
        );

        supervisor.start(attempt);

        Path externalProgress = fixtureRoot.resolve(attempt.artifacts().progressPath()).normalize();
        assertEquals(repoRoot.toAbsolutePath().normalize(), launcher.lastLaunchSpec().directory());
        assertEquals(externalProgress, Path.of(launcher.lastLaunchSpec().environment()
            .get("TERRAPEDIA_CRAWLER_PROGRESS_PATH")));
        assertTrue(launcher.lastLaunchSpec().command().contains("--progress-path=" + externalProgress));
        assertEquals(fixtureRoot.resolve(attempt.artifacts().logPath()).normalize(), launcher.lastLaunchSpec().logPath());
    }

    @Test
    void launchSpecMustDefensivelyCopyCommandAndEnvironment() {
        List<String> command = new ArrayList<>(List.of("node", "worker.mjs"));
        Map<String, String> environment = new LinkedHashMap<>(Map.of("QUEUE_ID", "queue-1"));
        CrawlerAttemptProcessLauncher.LaunchSpec spec = new CrawlerAttemptProcessLauncher.LaunchSpec(
            command,
            repoRoot,
            environment,
            repoRoot.resolve("run.log")
        );

        command.add("--unsafe-late-change");
        environment.put("QUEUE_ID", "queue-other");

        assertEquals(List.of("node", "worker.mjs"), spec.command());
        assertEquals(Map.of("QUEUE_ID", "queue-1"), spec.environment());
        assertThrows(UnsupportedOperationException.class, () -> spec.command().add("later"));
        assertThrows(UnsupportedOperationException.class, () -> spec.environment().put("x", "y"));
    }

    @Test
    void startMustRejectAPathThatIsNotTheExactManifestAttemptPath() {
        CrawlerQueueV2Attempt canonical = startingAttempt(142L, 2L);
        CrawlerQueueV2Attempt foreignPath = withArtifacts(canonical, new CrawlerQueueV2Artifacts(
            canonical.artifacts().progressPath(),
            "reports/crawler-monitor/v2/2026-07-11/foreign/attempt-1/run.log",
            canonical.artifacts().reportPath(),
            canonical.artifacts().outputPath()
        ));
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, foreignPath);
        when(artifactStore.readManifest("attempt-1")).thenReturn(Optional.of(manifest(canonical, null)));

        CrawlerAttemptSupervisor.StartResult result = supervisor.start(foreignPath);

        assertTrue(result.terminalized());
        assertFalse(result.started());
        assertEquals(CrawlerQueueV2ReasonCode.ATTEMPT_START_FAILED, result.attempt().reasonCode());
        assertEquals(null, launcher.lastLaunchSpec());
        verify(repository).mutate(argThat(command ->
            command.targetStatus() == CrawlerQueueV2Status.FAILED
                && command.reasonCode() == CrawlerQueueV2ReasonCode.ATTEMPT_START_FAILED
                && command.releaseOwnership()
        ));
    }

    @Test
    void duplicateStartMustNotLaunchOrSignalASecondProcess() {
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, request);
        latestAttempt.set(withProcessIdentity(request, 54321L, STARTED_AT.plusSeconds(10), 3L));

        assertThrows(IllegalStateException.class, () -> supervisor.start(request));

        assertEquals(0, launcher.launchCount());
        assertTrue(launcher.calls().isEmpty());
    }

    @Test
    void startCasFailureMustTerminateAndConfirmTheNewlyLaunchedExactProcess() {
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        FakeLauncher launcher = new FakeLauncher(process);
        launcher.exitAfterForcedWait = true;
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, request);
        doThrow(new CrawlerQueueV2Exception(
            HttpStatus.CONFLICT,
            CrawlerQueueV2ReasonCode.STALE_STATE_VERSION
        )).when(repository).mutate(any());

        assertThrows(CrawlerQueueV2Exception.class, () -> supervisor.start(request));

        assertEquals(1, launcher.launchCount());
        assertEquals(List.of("forced", "wait:PT5S"), launcher.calls());
        assertFalse(process.isAlive());
    }

    @Test
    void workerMustRemainPreExecStoppedUntilProcessRegistrationCompletes() throws Exception {
        assumeLinuxProcessTools();
        Path markerPath = repoRoot.resolve("supervisor-registration.marker");
        Path childPidPath = repoRoot.resolve("supervisor-registration-child.pid");
        ProcessBuilderCrawlerAttemptLauncher launcher = new ProcessBuilderCrawlerAttemptLauncher();
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        CrawlerAttemptSupervisor supervisor = supervisor(
            launcher,
            request,
            markerRegistry(markerPath, childPidPath),
            shortTerminationProperties()
        );
        CountDownLatch casEntered = new CountDownLatch(1);
        CountDownLatch releaseCas = new CountDownLatch(1);
        doAnswer(invocation -> {
            CrawlerQueueV2Repository.MutationCommand command = invocation.getArgument(0);
            if ("attempt.process-started".equals(command.eventType())) {
                casEntered.countDown();
                if (!releaseCas.await(2, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("process-started CAS was not released");
                }
            }
            CrawlerQueueV2Attempt updated = apply(latestAttempt(), command);
            latestAttempt.set(updated);
            return new CrawlerQueueV2Repository.MutationResult(updated, "handshake-1");
        }).when(repository).mutate(any());
        CompletableFuture<CrawlerAttemptSupervisor.StartResult> started = CompletableFuture.supplyAsync(
            () -> supervisor.start(request)
        );
        CrawlerQueueV2Attempt recorded = null;
        try {
            assertTrue(casEntered.await(2, TimeUnit.SECONDS));
            assertFalse(Files.exists(markerPath));
            assertFalse(Files.exists(childPidPath));

            releaseCas.countDown();
            recorded = started.get(2, TimeUnit.SECONDS).attempt();
            assertTrue(awaitFile(markerPath, Duration.ofSeconds(2)));
            assertTrue(awaitFile(childPidPath, Duration.ofSeconds(2)));
        } finally {
            releaseCas.countDown();
            if (recorded == null) {
                try {
                    recorded = started.get(2, TimeUnit.SECONDS).attempt();
                } catch (Exception ignored) {
                    // The identity may still be unavailable only if launch itself failed.
                }
            }
            cleanupRealProcess(launcher, recorded, childPidPath);
        }
    }

    @Test
    void processStartedCasMustBeTheFirstLiveWriterBecauseEarlyProgressCannotRun() throws Exception {
        assumeLinuxProcessTools();
        Path markerPath = repoRoot.resolve("supervisor-first-writer.marker");
        Path childPidPath = repoRoot.resolve("supervisor-first-writer-child.pid");
        ProcessBuilderCrawlerAttemptLauncher launcher = new ProcessBuilderCrawlerAttemptLauncher();
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        CrawlerAttemptSupervisor supervisor = supervisor(
            launcher,
            request,
            markerRegistry(markerPath, childPidPath),
            shortTerminationProperties()
        );
        AtomicReference<String> firstWriter = new AtomicReference<>();
        AtomicReference<CrawlerAttemptProcessLauncher.ProcessIdentity> identity = new AtomicReference<>();
        doAnswer(invocation -> {
            CrawlerQueueV2Repository.MutationCommand command = invocation.getArgument(0);
            if (command.pid() != null && command.processStartedAt() != null) {
                identity.set(new CrawlerAttemptProcessLauncher.ProcessIdentity(
                    command.pid(),
                    command.processStartedAt()
                ));
            }
            if (firstWriter.compareAndSet(null, command.eventType())
                && awaitFile(markerPath, Duration.ofMillis(250))) {
                latestAttempt.set(copyAttempt(
                    latestAttempt(),
                    CrawlerQueueV2Status.RUNNING,
                    3L,
                    1L,
                    null,
                    null
                ));
                throw new CrawlerQueueV2Exception(
                    HttpStatus.CONFLICT,
                    CrawlerQueueV2ReasonCode.STALE_STATE_VERSION
                );
            }
            CrawlerQueueV2Attempt updated = apply(latestAttempt(), command);
            latestAttempt.set(updated);
            return new CrawlerQueueV2Repository.MutationResult(updated, "handshake-2");
        }).when(repository).mutate(any());
        CrawlerQueueV2Attempt recorded = null;
        try {
            recorded = supervisor.start(request).attempt();

            assertEquals("attempt.process-started", firstWriter.get());
            assertTrue(awaitFile(markerPath, Duration.ofSeconds(2)));
        } finally {
            cleanupRealProcess(launcher, identity.get(), childPidPath);
        }
    }

    @Test
    void processStartedCasFailureMustKillStoppedGroupBeforeWorkerRuns() throws Exception {
        assumeLinuxProcessTools();
        Path markerPath = repoRoot.resolve("supervisor-cas-failure.marker");
        Path childPidPath = repoRoot.resolve("supervisor-cas-failure-child.pid");
        ProcessBuilderCrawlerAttemptLauncher launcher = new ProcessBuilderCrawlerAttemptLauncher();
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        CrawlerAttemptSupervisor supervisor = supervisor(
            launcher,
            request,
            markerRegistry(markerPath, childPidPath),
            shortTerminationProperties()
        );
        AtomicReference<CrawlerAttemptProcessLauncher.ProcessIdentity> identity = new AtomicReference<>();
        doAnswer(invocation -> {
            CrawlerQueueV2Repository.MutationCommand command = invocation.getArgument(0);
            identity.set(new CrawlerAttemptProcessLauncher.ProcessIdentity(
                command.pid(),
                command.processStartedAt()
            ));
            throw new CrawlerQueueV2Exception(
                HttpStatus.CONFLICT,
                CrawlerQueueV2ReasonCode.STALE_STATE_VERSION
            );
        }).when(repository).mutate(any());

        try {
            assertThrows(CrawlerQueueV2Exception.class, () -> supervisor.start(request));

            assertFalse(Files.exists(markerPath));
            assertFalse(Files.exists(childPidPath));
            assertEquals(
                CrawlerAttemptProcessLauncher.LookupCode.NOT_FOUND,
                launcher.findExact(identity.get()).code()
            );
        } finally {
            cleanupRealProcess(launcher, identity.get(), childPidPath);
        }
    }

    @Test
    void confirmedPreReturnLaunchFailureMustFailAndReleaseOwnership() {
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        launcher.launchFailure = new CrawlerAttemptProcessLauncher.LaunchFailureException(
            "session validation failed",
            12345L,
            STARTED_AT,
            true
        );
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, request);

        CrawlerAttemptSupervisor.StartResult result = supervisor.start(request);

        assertFalse(result.started());
        assertTrue(result.terminalized());
        assertEquals(CrawlerQueueV2Status.FAILED, result.attempt().status());
        assertEquals(CrawlerQueueV2ReasonCode.ATTEMPT_START_FAILED, result.attempt().reasonCode());
        verify(repository).mutate(argThat(command ->
            command.expectedStateVersion() == 2L
                && command.targetStatus() == CrawlerQueueV2Status.FAILED
                && command.reasonCode() == CrawlerQueueV2ReasonCode.ATTEMPT_START_FAILED
                && command.releaseOwnership()
        ));
    }

    @Test
    void launcherIoFailureWithoutAProcessMustTerminalizeImmediately() {
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        launcher.launchFailure = new IOException("executable not found");
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, request);

        CrawlerAttemptSupervisor.StartResult result = supervisor.start(request);

        assertFalse(result.started());
        assertTrue(result.terminalized());
        assertEquals(CrawlerQueueV2Status.FAILED, result.attempt().status());
        assertEquals(CrawlerQueueV2ReasonCode.ATTEMPT_START_FAILED, result.attempt().reasonCode());
        verify(repository).mutate(argThat(command ->
            command.expectedStateVersion() == 2L
                && command.targetStatus() == CrawlerQueueV2Status.FAILED
                && command.reasonCode() == CrawlerQueueV2ReasonCode.ATTEMPT_START_FAILED
                && command.workerMessage().startsWith("process launch failed:")
                && command.releaseOwnership()
        ));
    }

    @Test
    void missingExactManifestMustTerminalizeBeforeLaunching() {
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, request);
        when(artifactStore.readManifest(request.attemptId())).thenReturn(Optional.empty());

        CrawlerAttemptSupervisor.StartResult result = supervisor.start(request);

        assertFalse(result.started());
        assertTrue(result.terminalized());
        assertEquals(CrawlerQueueV2ReasonCode.ATTEMPT_START_FAILED, result.attempt().reasonCode());
        assertEquals(0, launcher.launchCount());
        verify(repository).mutate(argThat(command ->
            command.targetStatus() == CrawlerQueueV2Status.FAILED
                && command.reasonCode() == CrawlerQueueV2ReasonCode.ATTEMPT_START_FAILED
                && command.workerMessage().startsWith("launch validation failed:")
                && command.releaseOwnership()
        ));
    }

    @Test
    void unconfirmedPreReturnLaunchFailureMustRecordIdentityAndRetainIsolation() {
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        launcher.launchFailure = new CrawlerAttemptProcessLauncher.LaunchFailureException(
            "cleanup inspection failed",
            12345L,
            STARTED_AT,
            false
        );
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, request);

        assertThrows(IllegalStateException.class, () -> supervisor.start(request));

        InOrder order = inOrder(repository);
        order.verify(repository).mutate(argThat(command ->
            command.expectedStateVersion() == 2L
                && command.targetStatus() == CrawlerQueueV2Status.STARTING
                && command.pid() == 12345L
                && STARTED_AT.equals(command.processStartedAt())
                && "attempt.process-started".equals(command.eventType())
        ));
        order.verify(repository).mutate(argThat(command ->
            command.expectedStateVersion() == 3L
                && command.targetStatus() == CrawlerQueueV2Status.FAILED
                && command.reasonCode() == CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED
                && !command.releaseOwnership()
                && Duration.ofMinutes(2).equals(command.retainedOwnershipTtl())
        ));
    }

    @Test
    void unconfirmedPreReturnLaunchFailureMustRetainIsolationWhenManifestWriteFails() {
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        launcher.launchFailure = new CrawlerAttemptProcessLauncher.LaunchFailureException(
            "cleanup inspection failed",
            12345L,
            STARTED_AT,
            false
        );
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, request);
        doThrow(new IllegalStateException("manifest write failed"))
            .doNothing()
            .when(artifactStore).writeManifest(any());

        assertThrows(IllegalStateException.class, () -> supervisor.start(request));

        verify(repository).mutate(argThat(command ->
            command.expectedStateVersion() == 3L
                && command.targetStatus() == CrawlerQueueV2Status.FAILED
                && command.reasonCode() == CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED
                && !command.releaseOwnership()
        ));
    }

    @Test
    void postCasManifestFailureMustFailAndReleaseFromTheReturnedStateVersionAfterConfirmedExit() {
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        FakeLauncher launcher = new FakeLauncher(process);
        launcher.exitAfterForcedWait = true;
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, request);
        IllegalStateException manifestFailure = new IllegalStateException("manifest write failed");
        doThrow(manifestFailure).doNothing().when(artifactStore).writeManifest(any());

        CrawlerAttemptSupervisor.StartResult result = supervisor.start(request);

        assertTrue(result.terminalized());
        assertFalse(result.started());
        verify(repository).mutate(argThat(command ->
            command.expectedStateVersion() == 3L
                && command.targetStatus() == CrawlerQueueV2Status.FAILED
                && command.releaseOwnership()
                && command.reasonCode() == CrawlerQueueV2ReasonCode.ATTEMPT_START_FAILED
        ));
        assertEquals(List.of("forced", "wait:PT5S"), launcher.calls());
    }

    @Test
    void postCasWatcherFailureMustRetainIsolationFromReturnedVersionWhenExitIsUnconfirmed() {
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        process.failOnExitRegistration = true;
        FakeLauncher launcher = new FakeLauncher(process);
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, request);

        assertThrows(IllegalStateException.class, () -> supervisor.start(request));

        verify(repository).mutate(argThat(command ->
            command.expectedStateVersion() == 3L
                && command.targetStatus() == CrawlerQueueV2Status.FAILED
                && command.reasonCode() == CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED
                && !command.releaseOwnership()
                && Duration.ofMinutes(2).equals(command.retainedOwnershipTtl())
        ));
        assertEquals(
            List.of("forced", "wait:PT5S"),
            launcher.calls()
        );
    }

    @Test
    void initialContinueFailureMustKillStoppedGroupAndCompensateRecordedIdentity() {
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        FakeLauncher launcher = new FakeLauncher(process);
        launcher.resumeSucceeds = false;
        launcher.exitAfterForcedWait = true;
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, request);

        CrawlerAttemptSupervisor.StartResult result = supervisor.start(request);

        assertTrue(result.terminalized());
        assertFalse(result.started());
        assertEquals(List.of("resume", "forced", "wait:PT5S"), launcher.calls());
        verify(repository).mutate(argThat(command ->
            command.expectedStateVersion() == 3L
                && command.targetStatus() == CrawlerQueueV2Status.FAILED
                && command.reasonCode() == CrawlerQueueV2ReasonCode.ATTEMPT_START_FAILED
                && command.releaseOwnership()
        ));
    }

    @Test
    void postCasCompensationMustReloadSameLaunchIdentityAndRetryFromAdvancedVersion() {
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        FakeLauncher launcher = new FakeLauncher(process);
        launcher.exitAfterForcedWait = true;
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, request);
        IllegalStateException manifestFailure = new IllegalStateException("manifest write failed");
        doThrow(manifestFailure).doNothing().when(artifactStore).writeManifest(any());
        AtomicInteger mutations = new AtomicInteger();
        doAnswer(invocation -> {
            CrawlerQueueV2Repository.MutationCommand command = invocation.getArgument(0);
            int mutation = mutations.incrementAndGet();
            if (mutation == 2) {
                latestAttempt.set(copyAttempt(
                    latestAttempt(),
                    CrawlerQueueV2Status.RUNNING,
                    4L,
                    1L,
                    12345L,
                    STARTED_AT
                ));
                throw new CrawlerQueueV2Exception(
                    HttpStatus.CONFLICT,
                    CrawlerQueueV2ReasonCode.STALE_STATE_VERSION
                );
            }
            CrawlerQueueV2Attempt updated = apply(latestAttempt(), command);
            latestAttempt.set(updated);
            return new CrawlerQueueV2Repository.MutationResult(updated, mutation + "-0");
        }).when(repository).mutate(any());

        CrawlerAttemptSupervisor.StartResult result = supervisor.start(request);

        assertTrue(result.terminalized());
        assertFalse(result.started());
        assertEquals(3, mutations.get());
        assertEquals(CrawlerQueueV2Status.FAILED, latestAttempt().status());
        verify(repository).mutate(argThat(command ->
            command.expectedStateVersion() == 4L
                && command.targetStatus() == CrawlerQueueV2Status.FAILED
                && command.releaseOwnership()
        ));
    }

    @Test
    void postCasCompensationMustNotOverwriteCancelAuthority() {
        assertPostCasCompensationDoesNotOverwrite(current ->
            withStatus(current, CrawlerQueueV2Status.CANCEL_REQUESTED, 4L)
        );
    }

    @Test
    void postCasCompensationMustNotOverwriteTerminalAuthority() {
        assertPostCasCompensationDoesNotOverwrite(current ->
            withStatus(current, CrawlerQueueV2Status.CANCELLED, 4L)
        );
    }

    @Test
    void postCasCompensationMustNotOverwriteForeignProcessAuthority() {
        assertPostCasCompensationDoesNotOverwrite(current ->
            withProcessIdentity(current, 54321L, STARTED_AT.plusSeconds(5), 4L)
        );
    }

    @Test
    void oldExitWatcherMustNotTerminalizeAReplacementProcessIdentity() {
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        FakeProcess oldProcess = FakeProcess.alive(12345L, STARTED_AT);
        CrawlerAttemptSupervisor supervisor = supervisor(new FakeLauncher(oldProcess), request);
        supervisor.start(request);
        CrawlerQueueV2Attempt replacement = withProcessIdentity(
            runningAttempt(143L, 9L, 4L),
            54321L,
            STARTED_AT.plusSeconds(20),
            9L
        );
        latestAttempt.set(replacement);

        oldProcess.completeExit(0);

        verify(repository, never()).mutate(argThat(command -> command.targetStatus().terminal()));
    }

    @Test
    void watcherFailureMustAlwaysRemoveTheRegistryAndAppendBoundedReconcilerEvidence() {
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        RouterFixture routerFixture = v2Router();
        CrawlerAttemptSupervisor supervisor = supervisor(
            new FakeLauncher(process),
            request,
            CrawlerMonitorActionRegistry.defaults(),
            new CrawlerQueueV2Properties(),
            routerFixture.router()
        );
        supervisor.start(request);
        CrawlerQueueV2Attempt recorded = latestAttempt();
        when(repository.findAttempt("attempt-1"))
            .thenThrow(new IllegalStateException("watcher lookup failed"))
            .thenReturn(Optional.of(recorded));
        doAnswer(invocation -> {
            assertTrue(routerFixture.permitHeld().get(), "watcher fallback evidence must stay inside the permit");
            return null;
        }).when(repository).appendEvent(any());

        process.completeExit(0);

        assertEquals(0, supervisor.managedProcessCount());
        verify(routerFixture.router()).withMutationPermit(any());
        verify(routerFixture.permit()).requireMode(CrawlerQueueEngineMode.V2);
        verify(repository, times(1)).appendEvent(argThat(event ->
            event.type().equals("attempt.watcher-failed")
                && event.reasonCode() == CrawlerQueueV2ReasonCode.RECONCILER_STALE
        ));
    }

    @Test
    void deniedPermitBeforeNormalExitOnlyRemovesTheManagedProcessRegistry() {
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        FakeLauncher launcher = new FakeLauncher(process);
        CrawlerAttemptSupervisor supervisor = supervisor(
            launcher,
            request,
            CrawlerMonitorActionRegistry.defaults(),
            new CrawlerQueueV2Properties(),
            deniedRouter()
        );
        supervisor.start(request);
        List<String> callsBeforeExit = launcher.calls();
        clearInvocations(repository, artifactStore);

        process.completeExit(0);

        assertEquals(0, supervisor.managedProcessCount());
        assertEquals(callsBeforeExit, launcher.calls());
        verify(repository, never()).mutate(any());
        verify(repository, never()).appendEvent(any());
        verify(artifactStore, never()).writeManifest(any());
    }

    @Test
    void deniedPermitBeforeWatcherFailureOnlyRemovesTheManagedProcessRegistry() {
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        FakeLauncher launcher = new FakeLauncher(process);
        CrawlerAttemptSupervisor supervisor = supervisor(
            launcher,
            request,
            CrawlerMonitorActionRegistry.defaults(),
            new CrawlerQueueV2Properties(),
            deniedRouter()
        );
        supervisor.start(request);
        List<String> callsBeforeExit = launcher.calls();
        clearInvocations(repository, artifactStore);

        process.completeWatcherFailure(new IllegalStateException("watcher completion failed"));

        assertEquals(0, supervisor.managedProcessCount());
        assertEquals(callsBeforeExit, launcher.calls());
        verify(repository, never()).mutate(any());
        verify(repository, never()).appendEvent(any());
        verify(artifactStore, never()).writeManifest(any());
    }

    @Test
    void deniedPermitBeforeHandlerFailureOnlyRemovesTheManagedProcessRegistry() {
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        FakeLauncher launcher = new FakeLauncher(process);
        CrawlerAttemptSupervisor supervisor = supervisor(
            launcher,
            request,
            CrawlerMonitorActionRegistry.defaults(),
            new CrawlerQueueV2Properties(),
            deniedRouter()
        );
        supervisor.start(request);
        List<String> callsBeforeExit = launcher.calls();
        clearInvocations(repository, artifactStore);
        when(repository.findAttempt("attempt-1")).thenThrow(new IllegalStateException("handler lookup failed"));

        process.completeExit(0);

        assertEquals(0, supervisor.managedProcessCount());
        assertEquals(callsBeforeExit, launcher.calls());
        verify(repository, never()).findAttempt("attempt-1");
        verify(repository, never()).mutate(any());
        verify(repository, never()).appendEvent(any());
        verify(artifactStore, never()).writeManifest(any());
    }

    @Test
    void routerFailureDuringWatcherAdmissionOnlyRemovesTheManagedProcessRegistry() {
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        FakeLauncher launcher = new FakeLauncher(process);
        CrawlerAttemptSupervisor supervisor = supervisor(
            launcher,
            request,
            CrawlerMonitorActionRegistry.defaults(),
            new CrawlerQueueV2Properties(),
            failingRouter()
        );
        supervisor.start(request);
        List<String> callsBeforeExit = launcher.calls();
        clearInvocations(repository, artifactStore);

        process.completeExit(0);

        assertEquals(0, supervisor.managedProcessCount());
        assertEquals(callsBeforeExit, launcher.calls());
        verify(repository, never()).mutate(any());
        verify(repository, never()).appendEvent(any());
        verify(artifactStore, never()).writeManifest(any());
    }

    @Test
    void persistedMaintenanceBeforeZeroExitOnlyRemovesTheManagedProcessRegistry() {
        assertPersistedMaintenanceBlocksTerminalExit(0);
    }

    @Test
    void persistedMaintenanceBeforeNonzeroExitOnlyRemovesTheManagedProcessRegistry() {
        assertPersistedMaintenanceBlocksTerminalExit(17);
    }

    @Test
    void persistedMaintenanceBeforeWatcherFailureOnlyRemovesTheManagedProcessRegistry() {
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        FakeLauncher launcher = new FakeLauncher(process);
        CrawlerQueueEngineRouter durableRouter = durableRouter();
        CrawlerAttemptSupervisor supervisor = supervisor(
            launcher,
            request,
            CrawlerMonitorActionRegistry.defaults(),
            new CrawlerQueueV2Properties(),
            durableRouter
        );
        supervisor.start(request);
        persistMaintenanceMarker(durableRouter);
        List<String> callsBeforeExit = launcher.calls();
        clearInvocations(repository, artifactStore);

        process.completeWatcherFailure(new IllegalStateException("watcher completion failed"));

        assertEquals(0, supervisor.managedProcessCount());
        assertEquals(callsBeforeExit, launcher.calls());
        verify(repository, never()).mutate(any());
        verify(artifactStore, never()).writeManifest(any());
        verify(repository, never()).appendEvent(any());
        verify(repository, never()).findAttempt("attempt-1");
    }

    @Test
    void persistedMaintenanceBeforeHandlerFailureOnlyRemovesTheManagedProcessRegistry() {
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        FakeLauncher launcher = new FakeLauncher(process);
        CrawlerQueueEngineRouter durableRouter = durableRouter();
        CrawlerAttemptSupervisor supervisor = supervisor(
            launcher,
            request,
            CrawlerMonitorActionRegistry.defaults(),
            new CrawlerQueueV2Properties(),
            durableRouter
        );
        supervisor.start(request);
        CrawlerQueueV2Attempt recorded = latestAttempt();
        when(repository.findAttempt("attempt-1"))
            .thenThrow(new IllegalStateException("handler lookup failed"))
            .thenReturn(Optional.of(recorded));
        persistMaintenanceMarker(durableRouter);
        List<String> callsBeforeExit = launcher.calls();
        clearInvocations(repository, artifactStore);

        process.completeExit(0);

        assertEquals(0, supervisor.managedProcessCount());
        assertEquals(callsBeforeExit, launcher.calls());
        verify(repository, never()).mutate(any());
        verify(artifactStore, never()).writeManifest(any());
        verify(repository, never()).appendEvent(any());
        verify(repository, never()).findAttempt("attempt-1");
    }

    @Test
    void watcherPermitSerializesTerminalManifestBeforeDurableMaintenanceMarker() throws Exception {
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        FakeLauncher launcher = new FakeLauncher(process);
        CrawlerQueueEngineRouter durableRouter = new CrawlerQueueEngineRouter(
            objectMapper,
            repository,
            repoRoot,
            Clock.fixed(NOW, ZoneOffset.UTC)
        );
        when(repository.readEngineState()).thenReturn(new CrawlerQueueV2Repository.EngineState(
            CrawlerQueueEngineMode.V2,
            "epoch-1",
            "cutover-1",
            NOW.minusSeconds(60).toString()
        ));
        durableRouter.writeState(new CrawlerQueueEngineRouter.CutoverState(
            2,
            CrawlerQueueEngineMode.V2,
            "cutover-1",
            "epoch-1",
            NOW,
            NOW.minusSeconds(61),
            NOW.minusSeconds(60)
        ));
        CrawlerQueueEngineRouter.CutoverState current = durableRouter.readDurableState();
        CrawlerQueueEngineRouter.CutoverState maintenance = new CrawlerQueueEngineRouter.CutoverState(
            current.contractVersion(),
            CrawlerQueueEngineMode.MAINTENANCE,
            current.cutoverId(),
            current.stateStoreEpoch(),
            NOW.plusSeconds(1),
            current.mutationReservationAt(),
            current.firstLiveMutationAt()
        );
        CrawlerAttemptSupervisor supervisor = supervisor(
            launcher,
            request,
            CrawlerMonitorActionRegistry.defaults(),
            new CrawlerQueueV2Properties(),
            durableRouter
        );
        supervisor.start(request);
        CrawlerQueueV2Attempt started = latestAttempt();
        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(progress(
            "queue-1", "attempt-1", 142L, "epoch-1", 1L, "running", NOW.plusSeconds(1)
        )));
        supervisor.ingestProgress(started);

        CountDownLatch terminalMutationEntered = new CountDownLatch(1);
        CountDownLatch releaseTerminalMutation = new CountDownLatch(1);
        CountDownLatch markerPersisted = new CountDownLatch(1);
        AtomicInteger order = new AtomicInteger();
        AtomicInteger terminalMutationOrder = new AtomicInteger();
        AtomicInteger terminalManifestOrder = new AtomicInteger();
        AtomicInteger markerOrder = new AtomicInteger();
        doAnswer(invocation -> {
            CrawlerQueueV2Repository.MutationCommand command = invocation.getArgument(0);
            if (command.targetStatus().terminal()) {
                terminalMutationEntered.countDown();
                awaitLatch(releaseTerminalMutation, "terminal watcher mutation release");
                terminalMutationOrder.set(order.incrementAndGet());
            }
            CrawlerQueueV2Attempt updated = apply(latestAttempt(), command);
            latestAttempt.set(updated);
            return new CrawlerQueueV2Repository.MutationResult(updated, "1-0");
        }).when(repository).mutate(any());
        doAnswer(invocation -> {
            CrawlerAttemptManifest manifest = invocation.getArgument(0);
            if (manifest.status().terminal()) {
                terminalManifestOrder.set(order.incrementAndGet());
            }
            return null;
        }).when(artifactStore).writeManifest(any());

        Thread markerThread = new Thread(() -> {
            durableRouter.writeState(maintenance);
            markerOrder.set(order.incrementAndGet());
            markerPersisted.countDown();
        }, "durable-maintenance-marker");
        CompletableFuture<Void> watcher = CompletableFuture.runAsync(() -> process.completeExit(0));
        try {
            awaitLatch(terminalMutationEntered, "terminal watcher mutation entry");
            markerThread.start();
            awaitRouterLockContention(markerThread, markerPersisted);

            releaseTerminalMutation.countDown();
            watcher.get(2, TimeUnit.SECONDS);
            assertTrue(markerPersisted.await(2, TimeUnit.SECONDS), "maintenance marker did not complete");
            markerThread.join(2_000L);
            assertFalse(markerThread.isAlive(), "maintenance marker thread did not finish");

            assertTrue(terminalMutationOrder.get() > 0, "terminal mutation was not recorded");
            assertTrue(terminalManifestOrder.get() > terminalMutationOrder.get(), "terminal manifest must follow mutation");
            assertTrue(markerOrder.get() > terminalManifestOrder.get(), "maintenance must persist after terminal evidence");
        } finally {
            releaseTerminalMutation.countDown();
            try {
                watcher.get(2, TimeUnit.SECONDS);
            } catch (Exception ignored) {
                // The primary assertion reports callback failures; cleanup must still release the marker thread.
            }
            markerThread.join(2_000L);
        }
    }

    @Test
    void attemptSerializerEntriesMustBeReclaimedAfterSuccessAndFailure() {
        CrawlerQueueV2Attempt attempt = pausedAttempt(142L, 7L, 11L);
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, attempt);

        supervisor.resume(attempt);
        assertEquals(0, supervisor.serializerEntryCount());

        launcher.lookupCode = CrawlerAttemptProcessLauncher.LookupCode.INSPECTION_UNAVAILABLE;
        assertThrows(IllegalStateException.class, () -> supervisor.resume(attempt));
        assertEquals(0, supervisor.serializerEntryCount());
    }

    @Test
    void reapOverdueProcessMustResumeFrozenGroupBeforeTerminationAndConfirmExit() {
        CrawlerQueueV2Attempt attempt = runningAttempt(142L, 7L, 11L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        process.paused = true;
        FakeLauncher launcher = new FakeLauncher(process);
        launcher.exitAfterGracefulWait = true;
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, attempt);

        assertTrue(supervisor.reapOverdueProcess(attempt));

        // SIGSTOP 状态下 TERM 会滞留为 pending 信号，必须先 CONT 再优雅终止
        assertEquals(List.of("isPaused", "resume", "graceful", "wait:PT15S"), launcher.calls());
        verify(repository, never()).writeQuarantine(any());
    }

    @Test
    void reapOverdueProcessMustQuarantineDomainsWhenTerminationUnconfirmed() {
        CrawlerQueueV2Attempt attempt = runningAttempt(142L, 7L, 11L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        FakeLauncher launcher = new FakeLauncher(process);
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, attempt);

        assertFalse(supervisor.reapOverdueProcess(attempt));

        verify(repository).writeQuarantine(argThat(command ->
            "bosses".equals(command.domain())
                && command.reasonCode() == CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED
        ));
    }

    @Test
    void reapOverdueProcessIsANoOpWhenNoProcessIdentityIsRecorded() {
        CrawlerQueueV2Attempt running = runningAttempt(142L, 7L, 11L);
        CrawlerQueueV2Attempt attempt = copyAttempt(
            running, running.status(), 7L, running.progressSequence(), null, null
        );
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, attempt);

        assertTrue(supervisor.reapOverdueProcess(attempt));

        assertEquals(List.of(), launcher.calls());
        verify(repository, never()).writeQuarantine(any());
    }

    @Test
    void shouldWaitForExitBeforeReleasingOwnershipOnCancel() {
        CrawlerQueueV2Attempt attempt = cancelRequestedAttempt();
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        FakeLauncher launcher = spy(new FakeLauncher(process));
        launcher.exitAfterGracefulWait = true;
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, attempt);

        supervisor.cancel(attempt);

        assertEquals(List.of("isPaused", "graceful", "wait:PT15S"), launcher.calls());
        InOrder order = inOrder(launcher, repository);
        order.verify(launcher).terminateGracefully(process);
        order.verify(launcher).awaitExit(process, Duration.ofSeconds(15));
        order.verify(repository).mutate(argThat(command ->
            command.targetStatus() == CrawlerQueueV2Status.CANCELLED && command.releaseOwnership()
        ));
        verify(artifactStore, never()).cleanupArtifacts(anyString(), any(), anyString(), any());
    }

    @Test
    void shouldForceTerminateAfterGracefulTimeout() {
        CrawlerQueueV2Attempt attempt = cancelRequestedAttempt();
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        FakeLauncher launcher = new FakeLauncher(process);
        launcher.exitAfterForcedWait = true;
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, attempt);

        supervisor.cancel(attempt);

        assertEquals(
            List.of("isPaused", "graceful", "wait:PT15S", "forced", "wait:PT5S"),
            launcher.calls()
        );
        verify(repository).mutate(argThat(command ->
            command.targetStatus() == CrawlerQueueV2Status.CANCELLED && command.releaseOwnership()
        ));
        verify(artifactStore, never()).cleanupArtifacts(anyString(), any(), anyString(), any());
    }

    @Test
    void failedLeaseRenewalTerminatesTheExactProcessBeforeReleasingOwnership() {
        CrawlerQueueV2Attempt running = runningAttempt(142L, 7L, 11L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        FakeLauncher launcher = spy(new FakeLauncher(process));
        launcher.exitAfterGracefulWait = true;
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, running);

        CrawlerQueueV2Attempt result = supervisor.handleLeaseRenewalFailure(running);

        assertEquals(CrawlerQueueV2Status.FAILED, result.status());
        assertEquals(CrawlerQueueV2ReasonCode.LEASE_RENEW_FAILED, result.reasonCode());
        assertEquals(List.of("graceful", "wait:PT15S"), launcher.calls());
        InOrder order = inOrder(repository, launcher);
        order.verify(repository).mutate(argThat(command ->
            command.targetStatus() == CrawlerQueueV2Status.STALLED
                && command.reasonCode() == CrawlerQueueV2ReasonCode.LEASE_RENEW_FAILED
                && !command.releaseOwnership()
        ));
        order.verify(launcher).terminateGracefully(process);
        order.verify(launcher).awaitExit(process, Duration.ofSeconds(15));
        order.verify(repository).mutate(argThat(command ->
            command.targetStatus() == CrawlerQueueV2Status.FAILED
                && command.reasonCode() == CrawlerQueueV2ReasonCode.LEASE_RENEW_FAILED
                && command.releaseOwnership()
        ));
        verify(repository, never()).writeQuarantine(any());
    }

    @Test
    void failedLeaseRenewalQuarantinesEveryCoveredDomainWhenTerminationIsUnconfirmed() {
        CrawlerQueueV2Attempt running = runningAttempt(142L, 7L, 11L);
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, running);

        CrawlerQueueV2Attempt result = supervisor.handleLeaseRenewalFailure(running);

        assertEquals(CrawlerQueueV2Status.FAILED, result.status());
        assertEquals(CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED, result.reasonCode());
        verify(repository).writeQuarantine(argThat(command ->
            command.expectedEpoch().equals(running.stateStoreEpoch())
                && command.domain().equals("bosses")
                && command.attemptId().equals(running.attemptId())
                && command.fenceToken().equals(running.fenceToken())
                && command.expiresAt().equals(NOW.plus(Duration.ofMinutes(2)))
                && command.reasonCode() == CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED
        ));
        verify(repository).mutate(argThat(command ->
            command.targetStatus() == CrawlerQueueV2Status.FAILED
                && command.reasonCode() == CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED
                && command.releaseOwnership()
        ));
    }

    @Test
    void shouldRetainOwnershipAtomicallyWithoutASecondLeaseRenewalWhenExitCannotBeConfirmed() {
        CrawlerQueueV2Attempt attempt = cancelRequestedAttempt();
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        FakeLauncher launcher = new FakeLauncher(process);
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, attempt);

        supervisor.cancel(attempt);

        verify(repository).mutate(argThat(command ->
            command.targetStatus() == CrawlerQueueV2Status.FAILED
                && command.reasonCode() == CrawlerQueueV2ReasonCode.PROCESS_TERMINATION_UNCONFIRMED
                && !command.releaseOwnership()
                && Duration.ofMinutes(2).equals(command.retainedOwnershipTtl())
        ));
        verify(repository, never()).renewLeases(any());
        verify(artifactStore, never()).cleanupArtifacts(anyString(), any(), anyString(), any());
    }

    @Test
    void inspectionUnavailableMustRetainOwnershipWithoutSendingSignals() {
        CrawlerQueueV2Attempt attempt = cancelRequestedAttempt();
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        launcher.lookupCode = CrawlerAttemptProcessLauncher.LookupCode.INSPECTION_UNAVAILABLE;
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, attempt);

        supervisor.cancel(attempt);

        assertTrue(launcher.calls().isEmpty());
        verify(repository).mutate(argThat(command ->
            command.targetStatus() == CrawlerQueueV2Status.FAILED
                && !command.releaseOwnership()
        ));
    }

    @Test
    void pidStartTimeMismatchMustNeverSignalTheReusedPid() {
        CrawlerQueueV2Attempt attempt = cancelRequestedAttempt();
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT.plusSeconds(1)));
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, attempt);

        CrawlerQueueV2Attempt result = supervisor.cancel(attempt);

        assertEquals(CrawlerQueueV2Status.CANCELLED, result.status());
        assertTrue(launcher.calls().isEmpty());
        verify(repository).mutate(argThat(command ->
            command.targetStatus() == CrawlerQueueV2Status.CANCELLED && command.releaseOwnership()
        ));
    }

    @Test
    void terminateRecordedMustUseManifestProcessIdentityWhenRedisAttemptIsMissing() {
        CrawlerQueueV2Attempt attempt = cancelRequestedAttempt();
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        FakeLauncher launcher = new FakeLauncher(process);
        launcher.exitAfterGracefulWait = true;
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, attempt);
        when(repository.findAttempt("attempt-1")).thenReturn(Optional.empty());
        CrawlerAttemptManifest manifest = manifest(attempt, null);

        CrawlerAttemptSupervisor.TerminationResult result = supervisor.terminateRecorded(manifest);

        assertEquals(12345L, manifest.pid());
        assertEquals(STARTED_AT, manifest.processStartedAt());
        assertTrue(result.isConfirmed());
        assertEquals(List.of("graceful", "wait:PT15S"), launcher.calls());
    }

    @Test
    void terminateRecordedMustRemainUnconfirmedWhenRedisAndManifestIdentityAreMissing() {
        CrawlerQueueV2Attempt attempt = cancelRequestedAttempt();
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, attempt);
        when(repository.findAttempt("attempt-1")).thenReturn(Optional.empty());
        CrawlerAttemptManifest manifest = withoutManifestProcessIdentity(manifest(attempt, null));

        CrawlerAttemptSupervisor.TerminationResult result = supervisor.terminateRecorded(manifest);

        assertFalse(result.isConfirmed());
        assertTrue(launcher.calls().isEmpty());
    }

    @Test
    void shouldRejectOldProgressWithoutChangingTheCurrentAttempt() {
        CrawlerQueueV2Attempt attempt = runningAttempt(142L, 5L, 7L);
        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(progress(
            "queue-1", "attempt-old", 141L, "epoch-1", 8L, "running", NOW.plusSeconds(20)
        )));
        CrawlerAttemptSupervisor supervisor = supervisor(
            new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT)),
            attempt
        );

        CrawlerAttemptSupervisor.ProgressResult result = supervisor.ingestProgress(attempt);

        assertEquals(CrawlerAttemptSupervisor.ProgressCode.REJECTED_STALE_IDENTITY, result.code());
        verify(repository, never()).mutate(any());
        verify(repository).appendEvent(argThat(event ->
            event.reasonCode() == CrawlerQueueV2ReasonCode.STALE_FENCE_TOKEN
        ));
    }

    @Test
    void shouldRejectEqualOrLowerProgressSequenceWithoutMutation() {
        CrawlerQueueV2Attempt attempt = runningAttempt(142L, 5L, 7L);
        CrawlerAttemptSupervisor supervisor = supervisor(
            new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT)),
            attempt
        );
        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(progress(
            "queue-1", "attempt-1", 142L, "epoch-1", 7L, "running", NOW.plusSeconds(1)
        )));

        assertEquals(
            CrawlerAttemptSupervisor.ProgressCode.REJECTED_SEQUENCE,
            supervisor.ingestProgress(attempt).code()
        );

        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(progress(
            "queue-1", "attempt-1", 142L, "epoch-1", 6L, "running", NOW.plusSeconds(2)
        )));
        assertEquals(
            CrawlerAttemptSupervisor.ProgressCode.REJECTED_SEQUENCE,
            supervisor.ingestProgress(attempt).code()
        );
        verify(repository, never()).mutate(any());
    }

    @Test
    void exactRunningHeartbeatMustMoveStartingToRunningAndRollDeadline() {
        CrawlerQueueV2Attempt attempt = startingAttempt(142L, 2L);
        Instant heartbeat = NOW.plusSeconds(20);
        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(progress(
            "queue-1", "attempt-1", 142L, "epoch-1", 1L, "running", heartbeat
        )));
        CrawlerAttemptSupervisor supervisor = supervisor(
            new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT)),
            attempt
        );

        CrawlerAttemptSupervisor.ProgressResult result = supervisor.ingestProgress(attempt);

        assertEquals(CrawlerAttemptSupervisor.ProgressCode.ACCEPTED, result.code());
        assertEquals(CrawlerQueueV2Status.RUNNING, result.attempt().status());
        assertEquals(heartbeat, result.attempt().lastHeartbeatAt());
        assertEquals(heartbeat.plusSeconds(90), result.attempt().deadlineAt());
        verify(repository).mutate(argThat(command ->
            command.expectedStateVersion() == 2L
                && command.progressSequence() == 1L
                && command.targetStatus() == CrawlerQueueV2Status.RUNNING
        ));
    }

    @Test
    void unsupportedWorkerStatusMustNotRefreshStartingLiveness() {
        CrawlerQueueV2Attempt attempt = startingAttempt(142L, 2L);
        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(progress(
            "queue-1", "attempt-1", 142L, "epoch-1", 1L, "completed", NOW.plusSeconds(20)
        )));
        CrawlerAttemptSupervisor supervisor = supervisor(
            new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT)),
            attempt
        );

        CrawlerAttemptSupervisor.ProgressResult result = supervisor.ingestProgress(attempt);

        assertEquals(CrawlerAttemptSupervisor.ProgressCode.INVALID_PAYLOAD, result.code());
        assertEquals(attempt.deadlineAt(), result.attempt().deadlineAt());
        verify(repository, never()).mutate(any());
    }

    @Test
    void workerStateVersionIsDiagnosticAndCannotOverrideCurrentCasVersion() {
        CrawlerQueueV2Attempt attempt = runningAttempt(142L, 9L, 7L);
        CrawlerAttemptProgressPayload payload = new CrawlerAttemptProgressPayload(
            "queue-1", "attempt-1", 142L, "epoch-1", 999L, 8L,
            "domain-source-bosses", "completed", "done", "worker says done",
            10L, 10L, NOW.plusSeconds(10), NOW.plusSeconds(10), null
        );
        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(payload));
        CrawlerAttemptSupervisor supervisor = supervisor(
            new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT)),
            attempt
        );

        CrawlerAttemptSupervisor.ProgressResult result = supervisor.ingestProgress(attempt);

        assertEquals(CrawlerAttemptSupervisor.ProgressCode.INVALID_PAYLOAD, result.code());
        assertEquals(CrawlerQueueV2Status.RUNNING, result.attempt().status());
        verify(repository, never()).mutate(any());
    }

    @Test
    void progressMustReloadCurrentVersionAndSequenceBeforeCas() {
        CrawlerQueueV2Attempt staleSnapshot = runningAttempt(142L, 5L, 7L);
        CrawlerAttemptSupervisor supervisor = supervisor(
            new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT)),
            staleSnapshot
        );
        latestAttempt.set(runningAttempt(142L, 6L, 8L));
        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(progress(
            "queue-1", "attempt-1", 142L, "epoch-1", 9L, "running", NOW.plusSeconds(5)
        )));

        CrawlerAttemptSupervisor.ProgressResult result = supervisor.ingestProgress(staleSnapshot);

        assertEquals(CrawlerAttemptSupervisor.ProgressCode.ACCEPTED, result.code());
        verify(repository).mutate(argThat(command ->
            command.expectedStateVersion() == 6L && command.progressSequence() == 9L
        ));
    }

    @Test
    void progressMustNotOverrideAConcurrentPauseRequest() {
        CrawlerQueueV2Attempt staleSnapshot = runningAttempt(142L, 5L, 7L);
        CrawlerAttemptSupervisor supervisor = supervisor(
            new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT)),
            staleSnapshot
        );
        latestAttempt.set(withStatus(staleSnapshot, CrawlerQueueV2Status.PAUSE_REQUESTED, 6L));
        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(progress(
            "queue-1", "attempt-1", 142L, "epoch-1", 8L, "running", NOW.plusSeconds(5)
        )));

        CrawlerAttemptSupervisor.ProgressResult result = supervisor.ingestProgress(staleSnapshot);

        assertEquals(CrawlerAttemptSupervisor.ProgressCode.INVALID_PAYLOAD, result.code());
        verify(repository, never()).mutate(any());
    }

    @Test
    void progressMustNotOverrideAConcurrentCancelRequest() {
        CrawlerQueueV2Attempt staleSnapshot = runningAttempt(142L, 5L, 7L);
        CrawlerAttemptSupervisor supervisor = supervisor(
            new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT)),
            staleSnapshot
        );
        latestAttempt.set(withStatus(staleSnapshot, CrawlerQueueV2Status.CANCEL_REQUESTED, 6L));
        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(progress(
            "queue-1", "attempt-1", 142L, "epoch-1", 8L, "running", NOW.plusSeconds(5)
        )));

        CrawlerAttemptSupervisor.ProgressResult result = supervisor.ingestProgress(staleSnapshot);

        assertEquals(CrawlerAttemptSupervisor.ProgressCode.INVALID_PAYLOAD, result.code());
        verify(repository, never()).mutate(any());
    }

    @Test
    void pausedAttemptMustRejectPrePauseHeartbeatInsteadOfFlippingBackToRunning() {
        CrawlerQueueV2Attempt attempt = pausedAttempt(142L, 7L, 11L);
        // 暂停生效时间为 enteredAt(NOW)；该心跳文件是 SIGSTOP 之前写入的陈旧内容
        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(progress(
            "queue-1", "attempt-1", 142L, "epoch-1", 12L, "running", NOW.minusSeconds(4)
        )));
        CrawlerAttemptSupervisor supervisor = supervisor(
            new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT)),
            attempt
        );

        CrawlerAttemptSupervisor.ProgressResult result = supervisor.ingestProgress(attempt);

        assertEquals(CrawlerAttemptSupervisor.ProgressCode.INVALID_PAYLOAD, result.code());
        assertEquals(CrawlerQueueV2Status.PAUSED, result.attempt().status());
        verify(repository, never()).mutate(any());
    }

    @Test
    void pausedAttemptMustAcceptPostPauseHeartbeatAndConvergeToRunning() {
        CrawlerQueueV2Attempt attempt = pausedAttempt(142L, 7L, 11L);
        Instant freshHeartbeat = NOW.plusSeconds(5);
        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(progress(
            "queue-1", "attempt-1", 142L, "epoch-1", 12L, "running", freshHeartbeat
        )));
        CrawlerAttemptSupervisor supervisor = supervisor(
            new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT)),
            attempt
        );

        CrawlerAttemptSupervisor.ProgressResult result = supervisor.ingestProgress(attempt);

        assertEquals(CrawlerAttemptSupervisor.ProgressCode.ACCEPTED, result.code());
        assertEquals(CrawlerQueueV2Status.RUNNING, result.attempt().status());
        assertEquals(freshHeartbeat, result.attempt().lastHeartbeatAt());
    }

    @Test
    void staleProgressEventMustUseReloadedCurrentIdentity() {
        CrawlerQueueV2Attempt staleSnapshot = runningAttempt(141L, 5L, 7L);
        CrawlerAttemptSupervisor supervisor = supervisor(
            new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT)),
            staleSnapshot
        );
        latestAttempt.set(runningAttempt(142L, 9L, 8L));
        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(progress(
            "queue-1", "attempt-1", 141L, "epoch-1", 9L, "running", NOW.plusSeconds(5)
        )));

        CrawlerAttemptSupervisor.ProgressResult result = supervisor.ingestProgress(staleSnapshot);

        assertEquals(CrawlerAttemptSupervisor.ProgressCode.REJECTED_STALE_IDENTITY, result.code());
        verify(repository).appendEvent(argThat(event ->
            event.fenceToken() == 142L && event.stateVersion() == 9L
                && event.status() == CrawlerQueueV2Status.RUNNING
        ));
        verify(repository, never()).mutate(any());
    }

    @Test
    void staleProgressCasMustReloadAndRejectWithoutExtendingLiveness() {
        CrawlerQueueV2Attempt attempt = runningAttempt(142L, 5L, 7L);
        CrawlerAttemptSupervisor supervisor = supervisor(
            new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT)),
            attempt
        );
        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(progress(
            "queue-1", "attempt-1", 142L, "epoch-1", 8L, "running", NOW.plusSeconds(5)
        )));
        doAnswer(invocation -> {
            latestAttempt.set(runningAttempt(142L, 6L, 8L));
            throw new CrawlerQueueV2Exception(HttpStatus.CONFLICT, CrawlerQueueV2ReasonCode.STALE_STATE_VERSION);
        }).when(repository).mutate(any());

        CrawlerAttemptSupervisor.ProgressResult result = supervisor.ingestProgress(attempt);

        assertEquals(CrawlerAttemptSupervisor.ProgressCode.REJECTED_SEQUENCE, result.code());
        assertEquals(8L, result.attempt().progressSequence());
    }

    @Test
    void staleProgressCasMustRetryOnceWhenTheSequenceIsStillNew() {
        CrawlerQueueV2Attempt attempt = runningAttempt(142L, 5L, 7L);
        CrawlerAttemptSupervisor supervisor = supervisor(
            new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT)),
            attempt
        );
        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(progress(
            "queue-1", "attempt-1", 142L, "epoch-1", 8L, "running", NOW.plusSeconds(5)
        )));
        AtomicInteger mutations = new AtomicInteger();
        doAnswer(invocation -> {
            CrawlerQueueV2Repository.MutationCommand command = invocation.getArgument(0);
            if (mutations.getAndIncrement() == 0) {
                latestAttempt.set(runningAttempt(142L, 6L, 7L));
                throw new CrawlerQueueV2Exception(
                    HttpStatus.CONFLICT,
                    CrawlerQueueV2ReasonCode.STALE_STATE_VERSION
                );
            }
            CrawlerQueueV2Attempt updated = apply(latestAttempt(), command);
            latestAttempt.set(updated);
            return new CrawlerQueueV2Repository.MutationResult(updated, "2-0");
        }).when(repository).mutate(any());

        CrawlerAttemptSupervisor.ProgressResult result = supervisor.ingestProgress(attempt);

        assertEquals(CrawlerAttemptSupervisor.ProgressCode.ACCEPTED, result.code());
        assertEquals(2, mutations.get());
        assertEquals(8L, result.attempt().progressSequence());
    }

    @Test
    void repeatedStaleProgressCasMustReturnExplicitRetryRequired() {
        CrawlerQueueV2Attempt attempt = runningAttempt(142L, 5L, 7L);
        CrawlerAttemptSupervisor supervisor = supervisor(
            new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT)),
            attempt
        );
        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(progress(
            "queue-1", "attempt-1", 142L, "epoch-1", 8L, "running", NOW.plusSeconds(5)
        )));
        AtomicInteger mutations = new AtomicInteger();
        doAnswer(invocation -> {
            mutations.incrementAndGet();
            CrawlerQueueV2Attempt latest = latestAttempt();
            latestAttempt.set(runningAttempt(142L, latest.stateVersion() + 1L, 7L));
            throw new CrawlerQueueV2Exception(
                HttpStatus.CONFLICT,
                CrawlerQueueV2ReasonCode.STALE_STATE_VERSION
            );
        }).when(repository).mutate(any());

        CrawlerAttemptSupervisor.ProgressResult result = supervisor.ingestProgress(attempt);

        assertEquals(CrawlerAttemptSupervisor.ProgressCode.RETRY_REQUIRED, result.code());
        assertEquals(2, mutations.get());
        assertEquals(7L, result.attempt().progressSequence());
    }

    @Test
    void progressMustPropagateStateStoreFailures() {
        CrawlerQueueV2Attempt attempt = runningAttempt(142L, 5L, 7L);
        CrawlerAttemptSupervisor supervisor = supervisor(
            new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT)),
            attempt
        );
        CrawlerQueueV2Exception failure = new CrawlerQueueV2Exception(
            HttpStatus.SERVICE_UNAVAILABLE,
            CrawlerQueueV2ReasonCode.STATE_STORE_UNAVAILABLE
        );
        when(repository.readEngineState()).thenThrow(failure);

        CrawlerQueueV2Exception thrown = assertThrows(
            CrawlerQueueV2Exception.class,
            () -> supervisor.ingestProgress(attempt)
        );

        assertEquals(failure, thrown);
        verify(artifactStore, never()).readProgress(anyString());
    }

    @Test
    void invalidProgressMustNotMutateCanonicalState() {
        CrawlerQueueV2Attempt attempt = runningAttempt(142L, 5L, 7L);
        when(artifactStore.readProgress("attempt-1"))
            .thenThrow(new CrawlerAttemptArtifactStore.InvalidProgressPayloadException(
                "invalid progress JSON",
                new IllegalArgumentException("broken")
            ));
        CrawlerAttemptSupervisor supervisor = supervisor(
            new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT)),
            attempt
        );

        CrawlerAttemptSupervisor.ProgressResult result = supervisor.ingestProgress(attempt);

        assertEquals(CrawlerAttemptSupervisor.ProgressCode.INVALID_PAYLOAD, result.code());
        verify(repository, never()).mutate(any());
    }

    @Test
    void progressPathSecurityAndIoFailuresMustPropagate() {
        CrawlerQueueV2Attempt attempt = runningAttempt(142L, 5L, 7L);
        CrawlerAttemptSupervisor supervisor = supervisor(
            new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT)),
            attempt
        );
        SecurityException securityFailure = new SecurityException("path escaped");
        when(artifactStore.readProgress("attempt-1")).thenThrow(securityFailure);

        assertEquals(
            securityFailure,
            assertThrows(SecurityException.class, () -> supervisor.ingestProgress(attempt))
        );

        IllegalStateException ioFailure = new IllegalStateException("progress read failed");
        doThrow(ioFailure).when(artifactStore).readProgress("attempt-1");
        assertEquals(
            ioFailure,
            assertThrows(IllegalStateException.class, () -> supervisor.ingestProgress(attempt))
        );
        verify(repository, never()).mutate(any());
    }

    @Test
    void missingProgressMustReturnNoProgressWithoutMutation() {
        CrawlerQueueV2Attempt attempt = runningAttempt(142L, 5L, 7L);
        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.empty());
        CrawlerAttemptSupervisor supervisor = supervisor(
            new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT)),
            attempt
        );

        CrawlerAttemptSupervisor.ProgressResult result = supervisor.ingestProgress(attempt);

        assertEquals(CrawlerAttemptSupervisor.ProgressCode.NO_PROGRESS, result.code());
        verify(repository, never()).mutate(any());
    }

    @Test
    void processExitZeroMustReloadLatestAttemptAndCompleteIt() {
        CrawlerQueueV2Attempt attempt = startingAttempt(142L, 2L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        RouterFixture routerFixture = v2Router();
        CrawlerAttemptSupervisor supervisor = supervisor(
            new FakeLauncher(process),
            attempt,
            CrawlerMonitorActionRegistry.defaults(),
            new CrawlerQueueV2Properties(),
            routerFixture.router()
        );
        supervisor.start(attempt);
        CrawlerQueueV2Attempt started = latestAttempt();
        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(progress(
            "queue-1", "attempt-1", 142L, "epoch-1", 1L, "running", NOW.plusSeconds(1)
        )));
        supervisor.ingestProgress(started);

        process.completeExit(0);

        verify(routerFixture.router()).withMutationPermit(any());
        verify(routerFixture.permit()).requireMode(CrawlerQueueEngineMode.V2);
        verify(repository).mutate(argThat(command ->
            command.targetStatus() == CrawlerQueueV2Status.COMPLETED
                && command.reasonCode() == null
                && command.releaseOwnership()
        ));
        verify(artifactStore).writeManifest(argThat(manifest ->
            manifest.status() == CrawlerQueueV2Status.COMPLETED && manifest.exitCode() == 0
        ));
    }

    @Test
    void processExitZeroMustMergeExactCompletedProgressIntoTheTerminalMutation() {
        CrawlerQueueV2Attempt attempt = startingAttempt(142L, 2L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        CrawlerAttemptSupervisor supervisor = supervisor(new FakeLauncher(process), attempt);
        supervisor.start(attempt);
        String outputPath = "data/terraPedia/raw/wiki/module__armorsetbonuses.latest.json";
        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(
            new CrawlerAttemptProgressPayload(
                "queue-1",
                "attempt-1",
                142L,
                "epoch-1",
                99L,
                2L,
                "domain-source-bosses",
                "completed",
                "write",
                "completed",
                1L,
                1L,
                NOW.plusSeconds(2),
                NOW.plusSeconds(2),
                null,
                outputPath,
                null
            )
        ));

        process.completeExit(0);

        verify(repository).mutate(argThat(command ->
            command.targetStatus() == CrawlerQueueV2Status.COMPLETED
                && command.progressSequence() == 2L
                && "write".equals(command.phase())
                && command.current() == 1L
                && command.total() == 1L
                && outputPath.equals(command.outputPath())
                && command.reportPath() == null
                && command.releaseOwnership()
        ));
        assertEquals(2L, latestAttempt().progressSequence());
        assertEquals("write", latestAttempt().phase());
        assertEquals(1L, latestAttempt().current());
        assertEquals(1L, latestAttempt().total());
        assertEquals(outputPath, latestAttempt().artifacts().outputPath());
    }

    @Test
    void completedProgressMustNotReleaseOwnershipWhileTheProcessIsActive() {
        CrawlerQueueV2Attempt attempt = runningAttempt(142L, 5L, 1L);
        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(
            new CrawlerAttemptProgressPayload(
                "queue-1", "attempt-1", 142L, "epoch-1", 99L, 2L,
                "domain-source-bosses", "completed", "write", "completed",
                1L, 1L, NOW.plusSeconds(2), NOW.plusSeconds(2), null,
                "data/terraPedia/raw/wiki/module__armorsetbonuses.latest.json", null
            )
        ));
        CrawlerAttemptSupervisor supervisor = supervisor(
            new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT)),
            attempt
        );

        CrawlerAttemptSupervisor.ProgressResult result = supervisor.ingestProgress(attempt);

        assertEquals(CrawlerAttemptSupervisor.ProgressCode.INVALID_PAYLOAD, result.code());
        verify(repository, never()).mutate(any());
    }

    @Test
    void processExitNonzeroMustFailWithReasonAndReleaseOwnership() {
        CrawlerQueueV2Attempt attempt = startingAttempt(142L, 2L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        CrawlerAttemptSupervisor supervisor = supervisor(new FakeLauncher(process), attempt);
        supervisor.start(attempt);
        CrawlerQueueV2Attempt started = latestAttempt();
        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(progress(
            "queue-1", "attempt-1", 142L, "epoch-1", 1L, "running", NOW.plusSeconds(1)
        )));
        supervisor.ingestProgress(started);

        process.completeExit(17);

        verify(repository).mutate(argThat(command ->
            command.targetStatus() == CrawlerQueueV2Status.FAILED
                && command.reasonCode() == CrawlerQueueV2ReasonCode.PROCESS_EXIT_NONZERO
                && command.releaseOwnership()
        ));
    }

    @Test
    void processExitNonzeroMustMergeExactFailedProgressDetails() {
        CrawlerQueueV2Attempt attempt = startingAttempt(142L, 2L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        CrawlerAttemptSupervisor supervisor = supervisor(new FakeLauncher(process), attempt);
        supervisor.start(attempt);
        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(
            new CrawlerAttemptProgressPayload(
                "queue-1", "attempt-1", 142L, "epoch-1", 99L, 2L,
                "domain-source-bosses", "failed", "write", "source unavailable",
                1L, 1L, NOW.plusSeconds(2), NOW.plusSeconds(2), null,
                "data/terraPedia/raw/wiki/module__armorsetbonuses.latest.json", null
            )
        ));

        process.completeExit(17);

        verify(repository).mutate(argThat(command ->
            command.targetStatus() == CrawlerQueueV2Status.FAILED
                && command.reasonCode() == CrawlerQueueV2ReasonCode.PROCESS_EXIT_NONZERO
                && command.progressSequence() == 2L
                && "source unavailable".equals(command.workerMessage())
                && command.releaseOwnership()
        ));
    }

    @Test
    void staleCompletedProgressMustBeIgnoredAfterConfirmedSuccessfulExit() {
        CrawlerQueueV2Attempt attempt = startingAttempt(142L, 2L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        CrawlerAttemptSupervisor supervisor = supervisor(new FakeLauncher(process), attempt);
        supervisor.start(attempt);
        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(
            new CrawlerAttemptProgressPayload(
                "queue-1", "attempt-1", 999L, "epoch-old", 99L, 2L,
                "domain-source-bosses", "completed", "write", "stale completed",
                1L, 1L, NOW.plusSeconds(2), NOW.plusSeconds(2), null,
                "foreign-output.json", null
            )
        ));

        process.completeExit(0);

        verify(repository).mutate(argThat(command ->
            command.targetStatus() == CrawlerQueueV2Status.COMPLETED
                && command.progressSequence() == null
                && command.outputPath() == null
                && command.releaseOwnership()
        ));
    }

    @Test
    void malformedTerminalProgressMustNotBlockExitDerivedCompletion() {
        CrawlerQueueV2Attempt attempt = startingAttempt(142L, 2L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        CrawlerAttemptSupervisor supervisor = supervisor(new FakeLauncher(process), attempt);
        supervisor.start(attempt);
        when(artifactStore.readProgress("attempt-1")).thenThrow(
            new CrawlerAttemptArtifactStore.InvalidProgressPayloadException(
                "broken terminal progress",
                new IOException("invalid json")
            )
        );

        process.completeExit(0);

        verify(repository).mutate(argThat(command ->
            command.targetStatus() == CrawlerQueueV2Status.COMPLETED
                && command.progressSequence() == null
                && command.outputPath() == null
                && command.releaseOwnership()
        ));
    }

    @Test
    void pauseMustAcknowledgeOnlyAfterTheProcessReportsStopped() {
        CrawlerQueueV2Attempt attempt = runningAttempt(142L, 5L, 7L);
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        launcher.pauseReportsStopped = false;
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, attempt);

        CrawlerQueueV2Attempt result = supervisor.pause(attempt);

        assertEquals(CrawlerQueueV2Status.PAUSE_REQUESTED, result.status());
        assertEquals(List.of("pause", "isPaused"), launcher.calls());
        verify(repository).mutate(argThat(command ->
            command.targetStatus() == CrawlerQueueV2Status.PAUSE_REQUESTED
        ));
        verify(repository, never()).mutate(argThat(command ->
            command.targetStatus() == CrawlerQueueV2Status.PAUSED
        ));
    }

    @Test
    void pauseMustMoveToPausedAfterStoppedAcknowledgement() {
        CrawlerQueueV2Attempt attempt = runningAttempt(142L, 5L, 7L);
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        launcher.pauseReportsStopped = true;
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, attempt);

        CrawlerQueueV2Attempt result = supervisor.pause(attempt);

        assertEquals(CrawlerQueueV2Status.PAUSED, result.status());
        assertEquals(List.of("pause", "isPaused"), launcher.calls());
    }

    @Test
    void resumeMustRemainPausedUntilAHigherSequenceHeartbeatArrives() {
        CrawlerQueueV2Attempt attempt = pausedAttempt(142L, 7L, 11L);
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, attempt);

        CrawlerQueueV2Attempt resumed = supervisor.resume(attempt);

        assertEquals(CrawlerQueueV2Status.PAUSED, resumed.status());
        assertEquals(List.of("resume"), launcher.calls());
        verify(repository, never()).mutate(any());

        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(progress(
            "queue-1", "attempt-1", 142L, "epoch-1", 11L, "running", NOW.plusSeconds(1)
        )));
        assertEquals(
            CrawlerAttemptSupervisor.ProgressCode.REJECTED_SEQUENCE,
            supervisor.ingestProgress(attempt).code()
        );

        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(progress(
            "queue-1", "attempt-1", 142L, "epoch-1", 12L, "running", NOW.plusSeconds(2)
        )));
        CrawlerAttemptSupervisor.ProgressResult accepted = supervisor.ingestProgress(attempt);
        assertEquals(CrawlerAttemptSupervisor.ProgressCode.ACCEPTED, accepted.code());
        assertEquals(CrawlerQueueV2Status.RUNNING, accepted.attempt().status());
    }

    @Test
    void resumeMustRejectAStaleSnapshotBeforeSendingAnySignal() {
        CrawlerQueueV2Attempt stale = pausedAttempt(142L, 7L, 11L);
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, stale);
        latestAttempt.set(withStatus(stale, CrawlerQueueV2Status.PAUSED, 8L));

        assertThrows(IllegalStateException.class, () -> supervisor.resume(stale));

        assertTrue(launcher.calls().isEmpty());
    }

    @Test
    void resumeMustFailExplicitlyWhenTheExactProcessIsMissingOrSignalFails() {
        CrawlerQueueV2Attempt attempt = pausedAttempt(142L, 7L, 11L);
        FakeLauncher missing = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        missing.lookupCode = CrawlerAttemptProcessLauncher.LookupCode.NOT_FOUND;
        CrawlerAttemptSupervisor missingSupervisor = supervisor(missing, attempt);

        assertThrows(IllegalStateException.class, () -> missingSupervisor.resume(attempt));
        assertTrue(missing.calls().isEmpty());

        missing.lookupCode = null;
        missing.resumeSucceeds = false;

        assertThrows(IllegalStateException.class, () -> missingSupervisor.resume(attempt));
        assertEquals(List.of("resume"), missing.calls());
    }

    @Test
    void pauseMustNotSendStopAfterCancelAuthorityReplacesPauseRequested() throws Exception {
        CrawlerQueueV2Attempt attempt = runningAttempt(142L, 5L, 7L);
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        launcher.blockNextLookup();
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, attempt);
        CompletableFuture<Throwable> pauseFailure = CompletableFuture.supplyAsync(() -> {
            try {
                supervisor.pause(attempt);
                return null;
            } catch (Throwable failure) {
                return failure;
            }
        });
        assertTrue(launcher.awaitBlockedLookup());
        CrawlerQueueV2Attempt pauseRequested = latestAttempt();
        latestAttempt.set(withStatus(
            pauseRequested,
            CrawlerQueueV2Status.CANCEL_REQUESTED,
            pauseRequested.stateVersion() + 1L
        ));

        launcher.releaseBlockedLookup();

        assertTrue(pauseFailure.get(2, TimeUnit.SECONDS) instanceof IllegalStateException);
        assertFalse(launcher.calls().contains("pause"));
    }

    @Test
    void resumeAndCancelMustSerializeSoCancelAuthorityNeverAllowsAStaleCont() throws Exception {
        CrawlerQueueV2Attempt attempt = pausedAttempt(142L, 7L, 11L);
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        launcher.exitAfterGracefulWait = true;
        launcher.blockNextLookup();
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, attempt);
        CompletableFuture<Throwable> resumeFailure = CompletableFuture.supplyAsync(() -> {
            try {
                supervisor.resume(attempt);
                return null;
            } catch (Throwable failure) {
                return failure;
            }
        });
        assertTrue(launcher.awaitBlockedLookup());
        CrawlerQueueV2Attempt cancelAuthority = withStatus(
            attempt,
            CrawlerQueueV2Status.CANCEL_REQUESTED,
            attempt.stateVersion() + 1L
        );
        latestAttempt.set(cancelAuthority);
        CompletableFuture<CrawlerQueueV2Attempt> cancelled = CompletableFuture.supplyAsync(
            () -> supervisor.cancel(cancelAuthority)
        );

        launcher.releaseBlockedLookup();

        assertTrue(resumeFailure.get(2, TimeUnit.SECONDS) instanceof IllegalStateException);
        assertEquals(CrawlerQueueV2Status.CANCELLED, cancelled.get(2, TimeUnit.SECONDS).status());
        assertFalse(launcher.calls().contains("resume"));
        assertEquals(List.of("isPaused", "graceful", "wait:PT15S"), launcher.calls());
    }

    @Test
    void crossInstanceCancelAfterStopMustResumeForSafetyAndNeverReleaseALiveGroup() throws Exception {
        CrawlerQueueV2Attempt attempt = runningAttempt(142L, 5L, 7L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        FakeLauncher launcher = new FakeLauncher(process);
        launcher.pauseReportsStopped = true;
        launcher.exitAfterGracefulWait = true;
        launcher.blockAfterNextPause();
        CrawlerAttemptSupervisor pauseSupervisor = supervisor(launcher, attempt);
        CrawlerAttemptSupervisor cancelSupervisor = anotherSupervisor(launcher);
        CompletableFuture<Throwable> pauseFailure = CompletableFuture.supplyAsync(() -> {
            try {
                pauseSupervisor.pause(attempt);
                return null;
            } catch (Throwable failure) {
                return failure;
            }
        });
        assertTrue(launcher.awaitBlockedSignal());
        CrawlerQueueV2Attempt pauseRequested = latestAttempt();
        CrawlerQueueV2Attempt cancelAuthority = withStatus(
            pauseRequested,
            CrawlerQueueV2Status.CANCEL_REQUESTED,
            pauseRequested.stateVersion() + 1L
        );
        latestAttempt.set(cancelAuthority);

        CrawlerQueueV2Attempt cancelled = cancelSupervisor.cancel(cancelAuthority);
        launcher.releaseBlockedSignal();

        assertEquals(CrawlerQueueV2Status.CANCELLED, cancelled.status());
        assertTrue(pauseFailure.get(2, TimeUnit.SECONDS) instanceof IllegalStateException);
        assertFalse(process.paused);
        assertFalse(process.alive);
        assertTrue(launcher.calls().indexOf("resume") < launcher.calls().indexOf("graceful"));
    }

    @Test
    void crossInstanceCancelAfterContMustMakeResumeReturnTheCurrentAuthority() throws Exception {
        CrawlerQueueV2Attempt attempt = pausedAttempt(142L, 7L, 11L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        process.paused = true;
        FakeLauncher launcher = new FakeLauncher(process);
        launcher.exitAfterGracefulWait = true;
        launcher.blockAfterNextResume();
        CrawlerAttemptSupervisor resumeSupervisor = supervisor(launcher, attempt);
        CrawlerAttemptSupervisor cancelSupervisor = anotherSupervisor(launcher);
        CompletableFuture<CrawlerQueueV2Attempt> resumed = CompletableFuture.supplyAsync(
            () -> resumeSupervisor.resume(attempt)
        );
        assertTrue(launcher.awaitBlockedSignal());
        CrawlerQueueV2Attempt cancelAuthority = withStatus(
            attempt,
            CrawlerQueueV2Status.CANCEL_REQUESTED,
            attempt.stateVersion() + 1L
        );
        latestAttempt.set(cancelAuthority);

        CrawlerQueueV2Attempt cancelled = cancelSupervisor.cancel(cancelAuthority);
        launcher.releaseBlockedSignal();

        assertEquals(CrawlerQueueV2Status.CANCELLED, cancelled.status());
        assertEquals(CrawlerQueueV2Status.CANCELLED, resumed.get(2, TimeUnit.SECONDS).status());
        assertFalse(process.paused);
        assertFalse(process.alive);
    }

    @Test
    void cancelMustRejectAChangedCurrentProcessIdentityBeforeSendingAnySignal() {
        CrawlerQueueV2Attempt stale = cancelRequestedAttempt();
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, stale);
        latestAttempt.set(withProcessIdentity(stale, 54321L, STARTED_AT.plusSeconds(5), 4L));

        assertThrows(IllegalStateException.class, () -> supervisor.cancel(stale));

        assertTrue(launcher.calls().isEmpty());
    }

    @Test
    void pauseMustRejectAStaleSnapshotBeforeChangingStateOrSendingSignal() {
        CrawlerQueueV2Attempt stale = runningAttempt(142L, 5L, 7L);
        FakeLauncher launcher = new FakeLauncher(FakeProcess.alive(12345L, STARTED_AT));
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, stale);
        latestAttempt.set(withStatus(stale, CrawlerQueueV2Status.RUNNING, 6L));

        assertThrows(IllegalStateException.class, () -> supervisor.pause(stale));

        assertTrue(launcher.calls().isEmpty());
        verify(repository, never()).mutate(any());
    }

    @Test
    void artifactStoreMustReadAttemptScopedProgressAndHandleMissingOrInvalidJson() throws Exception {
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        CrawlerAttemptArtifactStore store = new CrawlerAttemptArtifactStore(
            objectMapper,
            repoRoot,
            Clock.fixed(NOW, ZoneOffset.UTC),
            properties
        );
        CrawlerAttemptArtifactStore.PreparedArtifacts artifacts = store.prepare(
            "epoch-1", "queue-1", "attempt-real", "bosses", "domain-source-bosses", NOW
        );

        assertTrue(store.readProgress("attempt-real").isEmpty());

        CrawlerAttemptProgressPayload expected = progress(
            "queue-1", "attempt-real", 142L, "epoch-1", 1L, "running", NOW
        );
        objectMapper.writeValue(repoRoot.resolve(artifacts.progressPath()).toFile(), expected);
        assertEquals(expected, store.readProgress("attempt-real").orElseThrow());

        Files.writeString(repoRoot.resolve(artifacts.progressPath()), "{broken-json");
        assertThrows(
            CrawlerAttemptArtifactStore.InvalidProgressPayloadException.class,
            () -> store.readProgress("attempt-real")
        );
    }

    private CrawlerAttemptSupervisor supervisor(
        FakeLauncher launcher,
        CrawlerQueueV2Attempt initialAttempt
    ) {
        return supervisor(
            launcher,
            initialAttempt,
            CrawlerMonitorActionRegistry.defaults(),
            new CrawlerQueueV2Properties(),
            v2Router().router()
        );
    }

    private void assertPersistedMaintenanceBlocksTerminalExit(int exitCode) {
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        FakeLauncher launcher = new FakeLauncher(process);
        CrawlerQueueEngineRouter durableRouter = durableRouter();
        CrawlerAttemptSupervisor supervisor = supervisor(
            launcher,
            request,
            CrawlerMonitorActionRegistry.defaults(),
            new CrawlerQueueV2Properties(),
            durableRouter
        );
        supervisor.start(request);
        CrawlerQueueV2Attempt started = latestAttempt();
        when(artifactStore.readProgress("attempt-1")).thenReturn(Optional.of(progress(
            "queue-1", "attempt-1", 142L, "epoch-1", 1L, "running", NOW.plusSeconds(1)
        )));
        supervisor.ingestProgress(started);
        assertEquals(CrawlerQueueV2Status.RUNNING, latestAttempt().status());
        persistMaintenanceMarker(durableRouter);
        List<String> callsBeforeExit = launcher.calls();
        clearInvocations(repository, artifactStore);

        process.completeExit(exitCode);

        assertEquals(0, supervisor.managedProcessCount());
        assertEquals(callsBeforeExit, launcher.calls());
        verify(repository, never()).mutate(any());
        verify(artifactStore, never()).writeManifest(any());
        verify(repository, never()).appendEvent(any());
        verify(repository, never()).findAttempt("attempt-1");
    }

    private CrawlerQueueEngineRouter durableRouter() {
        return new CrawlerQueueEngineRouter(
            objectMapper,
            repository,
            repoRoot,
            Clock.fixed(NOW, ZoneOffset.UTC)
        );
    }

    private void persistMaintenanceMarker(CrawlerQueueEngineRouter router) {
        router.writeState(new CrawlerQueueEngineRouter.CutoverState(
            2,
            CrawlerQueueEngineMode.MAINTENANCE,
            "cutover-1",
            "epoch-1",
            NOW,
            null,
            null
        ));
        assertEquals(CrawlerQueueEngineMode.MAINTENANCE, router.readDurableState().mode());
    }

    private CrawlerAttemptSupervisor supervisor(
        CrawlerAttemptProcessLauncher launcher,
        CrawlerQueueV2Attempt initialAttempt,
        CrawlerMonitorActionRegistry actionRegistry,
        CrawlerQueueV2Properties properties
    ) {
        return supervisor(launcher, initialAttempt, actionRegistry, properties, v2Router().router());
    }

    private CrawlerAttemptSupervisor supervisor(
        CrawlerAttemptProcessLauncher launcher,
        CrawlerQueueV2Attempt initialAttempt,
        CrawlerMonitorActionRegistry actionRegistry,
        CrawlerQueueV2Properties properties,
        CrawlerQueueEngineRouter router,
        Path worktreeRoot,
        Path artifactRoot
    ) {
        AtomicReference<CrawlerQueueV2Attempt> current = new AtomicReference<>(initialAttempt);
        when(repository.requireEpoch()).thenReturn("epoch-1");
        when(repository.findQueue("queue-1")).thenReturn(Optional.of(queue()));
        when(repository.findAttempt("attempt-1")).thenAnswer(ignored -> Optional.ofNullable(current.get()));
        when(repository.readEngineState()).thenReturn(new CrawlerQueueV2Repository.EngineState(
            CrawlerQueueEngineMode.V2, "epoch-1", "cutover-1", NOW.minusSeconds(60).toString()
        ));
        when(repository.renewLeases(any())).thenReturn(true);
        when(repository.mutate(any())).thenAnswer(invocation -> {
            CrawlerQueueV2Repository.MutationCommand command = invocation.getArgument(0);
            CrawlerQueueV2Attempt updated = apply(current.get(), command);
            current.set(updated);
            return new CrawlerQueueV2Repository.MutationResult(updated, "1-0");
        });
        when(artifactStore.readManifest("attempt-1")).thenReturn(Optional.of(manifest(initialAttempt, null)));
        latestAttempt = current;
        return new CrawlerAttemptSupervisor(
            repository, artifactStore, actionRegistry, launcher, new CrawlerAttemptStateMachine(properties), properties,
            worktreeRoot, artifactRoot, Clock.fixed(NOW, ZoneOffset.UTC), router
        );
    }

    private CrawlerAttemptSupervisor supervisor(
        CrawlerAttemptProcessLauncher launcher,
        CrawlerQueueV2Attempt initialAttempt,
        CrawlerMonitorActionRegistry actionRegistry,
        CrawlerQueueV2Properties properties,
        CrawlerQueueEngineRouter router
    ) {
        AtomicReference<CrawlerQueueV2Attempt> current = new AtomicReference<>(initialAttempt);
        when(repository.requireEpoch()).thenReturn("epoch-1");
        when(repository.findQueue("queue-1")).thenReturn(Optional.of(queue()));
        when(repository.findAttempt("attempt-1")).thenAnswer(ignored -> Optional.ofNullable(current.get()));
        when(repository.readEngineState()).thenReturn(new CrawlerQueueV2Repository.EngineState(
            CrawlerQueueEngineMode.V2,
            "epoch-1",
            "cutover-1",
            NOW.minusSeconds(60).toString()
        ));
        when(repository.renewLeases(any())).thenReturn(true);
        when(repository.mutate(any())).thenAnswer(invocation -> {
            CrawlerQueueV2Repository.MutationCommand command = invocation.getArgument(0);
            CrawlerQueueV2Attempt updated = apply(current.get(), command);
            current.set(updated);
            return new CrawlerQueueV2Repository.MutationResult(updated, "1-0");
        });
        when(artifactStore.readManifest("attempt-1"))
            .thenReturn(Optional.of(manifest(initialAttempt, null)));
        CrawlerAttemptSupervisor supervisor = new CrawlerAttemptSupervisor(
            repository,
            artifactStore,
            actionRegistry,
            launcher,
            new CrawlerAttemptStateMachine(properties),
            properties,
            repoRoot,
            Clock.fixed(NOW, ZoneOffset.UTC),
            router
        );
        latestAttempt = current;
        return supervisor;
    }

    private CrawlerMonitorActionRegistry markerRegistry(Path markerPath, Path childPidPath) {
        CrawlerMonitorActionRegistry registry = mock(CrawlerMonitorActionRegistry.class);
        CrawlerMonitorActionDefinition definition = new CrawlerMonitorActionDefinition(
            "bosses",
            "Controlled marker",
            "test.marker",
            "controlled",
            "domain-source-bosses",
            "unused-progress.json",
            List.of(
                "sh",
                "-c",
                "printf 'worker-ran' > '" + markerPath + "'; sleep 30 & child=$!; "
                    + "printf '%s' \"$child\" > '" + childPidPath + "'; wait"
            ),
            false,
            true,
            false,
            "fresh",
            null,
            "fresh"
        );
        when(registry.require("bosses", "domain-source-bosses")).thenReturn(definition);
        return registry;
    }

    private CrawlerQueueV2Properties shortTerminationProperties() {
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        properties.setGracefulTerminationWait(Duration.ofMillis(100));
        properties.setForcedTerminationWait(Duration.ofSeconds(2));
        return properties;
    }

    private boolean awaitFile(Path path, Duration timeout) throws InterruptedException {
        long deadline = System.nanoTime() + timeout.toNanos();
        while (!Files.exists(path)) {
            if (System.nanoTime() >= deadline) {
                return false;
            }
            Thread.sleep(10L);
        }
        return true;
    }

    private void cleanupRealProcess(
        ProcessBuilderCrawlerAttemptLauncher launcher,
        CrawlerQueueV2Attempt attempt,
        Path childPidPath
    ) throws Exception {
        CrawlerAttemptProcessLauncher.ProcessIdentity identity = attempt != null
            && attempt.pid() != null
            && attempt.processStartedAt() != null
            ? new CrawlerAttemptProcessLauncher.ProcessIdentity(
                attempt.pid(),
                attempt.processStartedAt()
            )
            : null;
        cleanupRealProcess(launcher, identity, childPidPath);
    }

    private void cleanupRealProcess(
        ProcessBuilderCrawlerAttemptLauncher launcher,
        CrawlerAttemptProcessLauncher.ProcessIdentity identity,
        Path childPidPath
    ) throws Exception {
        if (identity != null) {
            CrawlerAttemptProcessLauncher.ProcessLookup lookup = launcher.findExact(identity);
            if (lookup.code() == CrawlerAttemptProcessLauncher.LookupCode.FOUND) {
                launcher.terminateForcibly(lookup.process());
                launcher.awaitExit(lookup.process(), Duration.ofSeconds(2));
            }
        }
        if (Files.exists(childPidPath)) {
            ProcessHandle child = ProcessHandle.of(Long.parseLong(Files.readString(childPidPath)))
                .orElse(null);
            if (child != null && child.isAlive()) {
                child.destroyForcibly();
                child.onExit().get();
            }
        }
    }

    private void assumeLinuxProcessTools() {
        Assumptions.assumeTrue(Files.isDirectory(Path.of("/proc")));
        Assumptions.assumeTrue(Files.isExecutable(Path.of("/usr/bin/kill"))
            || Files.isExecutable(Path.of("/bin/kill")));
        Assumptions.assumeTrue(Files.isExecutable(Path.of("/usr/bin/setsid"))
            || Files.isExecutable(Path.of("/bin/setsid")));
    }

    private AtomicReference<CrawlerQueueV2Attempt> latestAttempt;

    private CrawlerAttemptSupervisor anotherSupervisor(FakeLauncher launcher) {
        CrawlerQueueV2Properties properties = new CrawlerQueueV2Properties();
        return new CrawlerAttemptSupervisor(
            repository,
            artifactStore,
            CrawlerMonitorActionRegistry.defaults(),
            launcher,
            new CrawlerAttemptStateMachine(properties),
            properties,
            repoRoot,
            Clock.fixed(NOW, ZoneOffset.UTC),
            v2Router().router()
        );
    }

    private RouterFixture v2Router() {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        CrawlerQueueEngineRouter.MutationPermit permit = mock(CrawlerQueueEngineRouter.MutationPermit.class);
        AtomicBoolean permitHeld = new AtomicBoolean();
        when(permit.mode()).thenReturn(CrawlerQueueEngineMode.V2);
        doNothing().when(permit).requireMode(CrawlerQueueEngineMode.V2);
        when(router.withMutationPermit(any())).thenAnswer(invocation -> {
            Function<CrawlerQueueEngineRouter.MutationPermit, ?> operation = invocation.getArgument(0);
            permitHeld.set(true);
            try {
                return operation.apply(permit);
            } finally {
                permitHeld.set(false);
            }
        });
        return new RouterFixture(router, permit, permitHeld);
    }

    private CrawlerQueueEngineRouter deniedRouter() {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.withMutationPermit(any())).thenThrow(new CrawlerQueueV2Exception(
            HttpStatus.CONFLICT,
            CrawlerQueueV2ReasonCode.STATE_STORE_RESET
        ));
        return router;
    }

    private CrawlerQueueEngineRouter failingRouter() {
        CrawlerQueueEngineRouter router = mock(CrawlerQueueEngineRouter.class);
        when(router.withMutationPermit(any())).thenThrow(new IllegalStateException("router lock failed"));
        return router;
    }

    private static void awaitLatch(CountDownLatch latch, String description) {
        try {
            if (!latch.await(2, TimeUnit.SECONDS)) {
                throw new AssertionError("timed out waiting for " + description);
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AssertionError("interrupted while waiting for " + description, exception);
        }
    }

    private static void awaitRouterLockContention(Thread marker, CountDownLatch markerPersisted)
        throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        while (System.nanoTime() < deadline) {
            Thread.State state = marker.getState();
            boolean waitingInRouter = Arrays.stream(marker.getStackTrace()).anyMatch(frame ->
                frame.getClassName().equals(CrawlerQueueEngineRouter.class.getName())
                    && frame.getMethodName().equals("locked")
            );
            if (markerPersisted.getCount() == 1
                && waitingInRouter
                && (state == Thread.State.WAITING || state == Thread.State.BLOCKED)) {
                return;
            }
            Thread.sleep(5L);
        }
        throw new AssertionError("maintenance writer did not wait on the real router lock");
    }

    private CrawlerQueueV2Attempt latestAttempt() {
        return latestAttempt.get();
    }

    private record RouterFixture(
        CrawlerQueueEngineRouter router,
        CrawlerQueueEngineRouter.MutationPermit permit,
        AtomicBoolean permitHeld
    ) {
    }

    private void assertPostCasCompensationDoesNotOverwrite(
        UnaryOperator<CrawlerQueueV2Attempt> authorityChange
    ) {
        CrawlerQueueV2Attempt request = startingAttempt(142L, 2L);
        FakeProcess process = FakeProcess.alive(12345L, STARTED_AT);
        FakeLauncher launcher = new FakeLauncher(process);
        launcher.exitAfterForcedWait = true;
        CrawlerAttemptSupervisor supervisor = supervisor(launcher, request);
        IllegalStateException manifestFailure = new IllegalStateException("manifest write failed");
        doThrow(manifestFailure).doNothing().when(artifactStore).writeManifest(any());
        AtomicInteger mutations = new AtomicInteger();
        doAnswer(invocation -> {
            CrawlerQueueV2Repository.MutationCommand command = invocation.getArgument(0);
            int mutation = mutations.incrementAndGet();
            if (mutation == 2) {
                latestAttempt.set(authorityChange.apply(latestAttempt()));
                throw new CrawlerQueueV2Exception(
                    HttpStatus.CONFLICT,
                    CrawlerQueueV2ReasonCode.STALE_STATE_VERSION
                );
            }
            CrawlerQueueV2Attempt updated = apply(latestAttempt(), command);
            latestAttempt.set(updated);
            return new CrawlerQueueV2Repository.MutationResult(updated, mutation + "-0");
        }).when(repository).mutate(any());

        assertEquals(
            manifestFailure,
            assertThrows(IllegalStateException.class, () -> supervisor.start(request))
        );

        assertEquals(2, mutations.get());
        assertEquals(4L, latestAttempt().stateVersion());
    }

    private CrawlerQueueV2Attempt apply(
        CrawlerQueueV2Attempt attempt,
        CrawlerQueueV2Repository.MutationCommand command
    ) {
        Instant completedAt = command.targetStatus().terminal() ? command.enteredAt() : attempt.completedAt();
        CrawlerQueueV2Artifacts artifacts = new CrawlerQueueV2Artifacts(
            attempt.artifacts().progressPath(),
            attempt.artifacts().logPath(),
            command.reportPath() == null ? attempt.artifacts().reportPath() : command.reportPath(),
            command.outputPath() == null ? attempt.artifacts().outputPath() : command.outputPath()
        );
        return new CrawlerQueueV2Attempt(
            attempt.contractVersion(), attempt.stateStoreEpoch(), attempt.queueId(), attempt.attemptId(),
            attempt.fenceToken(), attempt.stateVersion() + 1L, command.targetStatus(), attempt.lane(),
            attempt.domain(), attempt.coveredDomains(), attempt.actionId(), attempt.retryOfAttemptId(),
            attempt.requestedAt(), attempt.eligibleAt(), command.enteredAt(),
            attempt.startedAt() == null && command.pid() != null ? command.enteredAt() : attempt.startedAt(),
            completedAt,
            command.lastHeartbeatAt() == null ? attempt.lastHeartbeatAt() : command.lastHeartbeatAt(),
            command.deadlineAt(),
            command.pid() == null ? attempt.pid() : command.pid(),
            command.processStartedAt() == null ? attempt.processStartedAt() : command.processStartedAt(),
            command.progressSequence() == null ? attempt.progressSequence() : command.progressSequence(),
            command.phase() == null ? attempt.phase() : command.phase(),
            command.current() == null ? attempt.current() : command.current(),
            command.total() == null ? attempt.total() : command.total(),
            command.workerMessage() == null ? attempt.workerMessage() : command.workerMessage(),
            command.reasonCode(), artifacts
        );
    }

    private CrawlerQueueV2Attempt withArtifacts(
        CrawlerQueueV2Attempt attempt,
        CrawlerQueueV2Artifacts artifacts
    ) {
        return new CrawlerQueueV2Attempt(
            attempt.contractVersion(), attempt.stateStoreEpoch(), attempt.queueId(), attempt.attemptId(),
            attempt.fenceToken(), attempt.stateVersion(), attempt.status(), attempt.lane(), attempt.domain(),
            attempt.coveredDomains(), attempt.actionId(), attempt.retryOfAttemptId(), attempt.requestedAt(),
            attempt.eligibleAt(), attempt.enteredAt(), attempt.startedAt(), attempt.completedAt(),
            attempt.lastHeartbeatAt(), attempt.deadlineAt(), attempt.pid(), attempt.processStartedAt(),
            attempt.progressSequence(), attempt.phase(), attempt.current(), attempt.total(),
            attempt.workerMessage(), attempt.reasonCode(), artifacts
        );
    }

    private CrawlerQueueV2Attempt withAction(
        CrawlerQueueV2Attempt attempt,
        String domain,
        String actionId
    ) {
        return new CrawlerQueueV2Attempt(
            attempt.contractVersion(), attempt.stateStoreEpoch(), attempt.queueId(), attempt.attemptId(),
            attempt.fenceToken(), attempt.stateVersion(), attempt.status(), attempt.lane(), domain,
            List.of(domain), actionId, attempt.retryOfAttemptId(), attempt.requestedAt(),
            attempt.eligibleAt(), attempt.enteredAt(), attempt.startedAt(), attempt.completedAt(),
            attempt.lastHeartbeatAt(), attempt.deadlineAt(), attempt.pid(), attempt.processStartedAt(),
            attempt.progressSequence(), attempt.phase(), attempt.current(), attempt.total(),
            attempt.workerMessage(), attempt.reasonCode(), attempt.artifacts()
        );
    }

    private CrawlerQueueV2Attempt withRetryOf(CrawlerQueueV2Attempt attempt, String priorAttemptId) {
        return new CrawlerQueueV2Attempt(
            attempt.contractVersion(), attempt.stateStoreEpoch(), attempt.queueId(), attempt.attemptId(),
            attempt.fenceToken(), attempt.stateVersion(), attempt.status(), attempt.lane(), attempt.domain(),
            attempt.coveredDomains(), attempt.actionId(), priorAttemptId, attempt.requestedAt(),
            attempt.eligibleAt(), attempt.enteredAt(), attempt.startedAt(), attempt.completedAt(),
            attempt.lastHeartbeatAt(), attempt.deadlineAt(), attempt.pid(), attempt.processStartedAt(),
            attempt.progressSequence(), attempt.phase(), attempt.current(), attempt.total(),
            attempt.workerMessage(), attempt.reasonCode(), attempt.artifacts()
        );
    }

    private CrawlerQueueV2Attempt withProcessIdentity(
        CrawlerQueueV2Attempt attempt,
        long pid,
        Instant processStartedAt,
        long stateVersion
    ) {
        return copyAttempt(attempt, attempt.status(), stateVersion, attempt.progressSequence(), pid, processStartedAt);
    }

    private CrawlerQueueV2Attempt withStatus(
        CrawlerQueueV2Attempt attempt,
        CrawlerQueueV2Status status,
        long stateVersion
    ) {
        return copyAttempt(
            attempt,
            status,
            stateVersion,
            attempt.progressSequence(),
            attempt.pid(),
            attempt.processStartedAt()
        );
    }

    private CrawlerQueueV2Attempt copyAttempt(
        CrawlerQueueV2Attempt attempt,
        CrawlerQueueV2Status status,
        long stateVersion,
        long progressSequence,
        Long pid,
        Instant processStartedAt
    ) {
        Instant deadline = switch (status) {
            case STARTING -> NOW.plus(Duration.ofMinutes(2));
            case RUNNING -> NOW.plusSeconds(90);
            case PAUSE_REQUESTED, CANCEL_REQUESTED -> NOW.plusSeconds(30);
            case PAUSED -> NOW.plus(Duration.ofHours(24));
            default -> attempt.deadlineAt();
        };
        return new CrawlerQueueV2Attempt(
            attempt.contractVersion(), attempt.stateStoreEpoch(), attempt.queueId(), attempt.attemptId(),
            attempt.fenceToken(), stateVersion, status, attempt.lane(), attempt.domain(),
            attempt.coveredDomains(), attempt.actionId(), attempt.retryOfAttemptId(), attempt.requestedAt(),
            attempt.eligibleAt(), attempt.enteredAt(), attempt.startedAt(), attempt.completedAt(),
            attempt.lastHeartbeatAt(), deadline, pid, processStartedAt, progressSequence, attempt.phase(),
            attempt.current(), attempt.total(), attempt.workerMessage(), attempt.reasonCode(), attempt.artifacts()
        );
    }

    private CrawlerAttemptProgressPayload progress(
        String queueId,
        String attemptId,
        Long fenceToken,
        String epoch,
        Long sequence,
        String status,
        Instant heartbeat
    ) {
        return new CrawlerAttemptProgressPayload(
            queueId,
            attemptId,
            fenceToken,
            epoch,
            99L,
            sequence,
            "domain-source-bosses",
            status,
            "crawl-pages",
            "working",
            2L,
            10L,
            heartbeat,
            heartbeat,
            null
        );
    }

    private CrawlerQueueV2Queue queue() {
        return new CrawlerQueueV2Queue(
            2,
            "epoch-1",
            "queue-1",
            "standard",
            "bosses",
            List.of("bosses"),
            "domain-source-bosses",
            "standard:domain-source-bosses",
            NOW.minusSeconds(10),
            "tester",
            "attempt-1",
            List.of("attempt-1"),
            null
        );
    }

    private CrawlerQueueV2Attempt startingAttempt(long fenceToken, long stateVersion) {
        return attempt(CrawlerQueueV2Status.STARTING, fenceToken, stateVersion, 0L, null, null);
    }

    private CrawlerQueueV2Attempt cancelRequestedAttempt() {
        return attempt(
            CrawlerQueueV2Status.CANCEL_REQUESTED,
            142L,
            3L,
            7L,
            12345L,
            STARTED_AT
        );
    }

    private CrawlerQueueV2Attempt runningAttempt(long fenceToken, long stateVersion, long progressSequence) {
        return attempt(
            CrawlerQueueV2Status.RUNNING,
            fenceToken,
            stateVersion,
            progressSequence,
            12345L,
            STARTED_AT
        );
    }

    private CrawlerQueueV2Attempt pausedAttempt(long fenceToken, long stateVersion, long progressSequence) {
        return attempt(
            CrawlerQueueV2Status.PAUSED,
            fenceToken,
            stateVersion,
            progressSequence,
            12345L,
            STARTED_AT
        );
    }

    private CrawlerQueueV2Attempt attempt(
        CrawlerQueueV2Status status,
        long fenceToken,
        long stateVersion,
        long progressSequence,
        Long pid,
        Instant processStartedAt
    ) {
        Instant deadline = switch (status) {
            case STARTING -> NOW.plus(Duration.ofMinutes(2));
            case RUNNING -> NOW.plusSeconds(90);
            case PAUSED -> NOW.plus(Duration.ofHours(24));
            case CANCEL_REQUESTED -> NOW.plusSeconds(30);
            default -> throw new IllegalArgumentException("unsupported supervisor fixture status: " + status);
        };
        return new CrawlerQueueV2Attempt(
            2,
            "epoch-1",
            "queue-1",
            "attempt-1",
            fenceToken,
            stateVersion,
            status,
            "standard",
            "bosses",
            List.of("bosses"),
            "domain-source-bosses",
            null,
            NOW.minusSeconds(10),
            NOW.minusSeconds(10),
            NOW,
            status == CrawlerQueueV2Status.STARTING ? null : NOW.minusSeconds(5),
            null,
            status == CrawlerQueueV2Status.RUNNING ? NOW : null,
            deadline,
            pid,
            processStartedAt,
            progressSequence,
            "crawl-pages",
            1L,
            10L,
            "running",
            null,
            new CrawlerQueueV2Artifacts(
                "reports/crawler-monitor/v2/2026-07-11/attempt-1/progress.json",
                "reports/crawler-monitor/v2/2026-07-11/attempt-1/run.log",
                null,
                null
            )
        );
    }

    private CrawlerAttemptManifest manifest(CrawlerQueueV2Attempt attempt, Integer exitCode) {
        return new CrawlerAttemptManifest(
            attempt.contractVersion(), attempt.stateStoreEpoch(), attempt.queueId(), attempt.attemptId(),
            attempt.fenceToken(), attempt.domain(), attempt.actionId(), attempt.status(), attempt.startedAt(),
            attempt.completedAt(), attempt.reasonCode(), exitCode, attempt.pid(), attempt.processStartedAt(),
            attempt.artifacts().progressPath(),
            attempt.artifacts().logPath(), attempt.artifacts().reportPath(), attempt.artifacts().outputPath(),
            null, null, null, null, List.of()
        );
    }

    private CrawlerAttemptManifest withoutManifestProcessIdentity(CrawlerAttemptManifest manifest) {
        return new CrawlerAttemptManifest(
            manifest.contractVersion(), manifest.stateStoreEpoch(), manifest.queueId(), manifest.attemptId(),
            manifest.fenceToken(), manifest.domain(), manifest.actionId(), manifest.status(), manifest.startedAt(),
            manifest.completedAt(), manifest.reasonCode(), manifest.exitCode(), null, null,
            manifest.progressPath(), manifest.logPath(), manifest.reportPath(), manifest.outputPath(),
            manifest.retentionExpiresAt(), manifest.artifactsExpiredAt(), manifest.cleanedAt(),
            manifest.cleanedBy(), manifest.cleanedPaths()
        );
    }

    private String storedPath(Path path) {
        return repoRoot.toAbsolutePath().normalize()
            .relativize(path.toAbsolutePath().normalize())
            .toString()
            .replace('\\', '/');
    }

    private static final class FakeLauncher implements CrawlerAttemptProcessLauncher {
        private final FakeProcess process;
        private final List<String> calls = new ArrayList<>();
        private LaunchSpec lastLaunchSpec;
        private LookupCode lookupCode;
        private boolean pauseReportsStopped;
        private boolean exitAfterGracefulWait;
        private boolean exitAfterForcedWait;
        private boolean resumeSucceeds = true;
        private IOException launchFailure;
        private int launchCount;
        private CountDownLatch lookupBlocked;
        private CountDownLatch releaseLookup;
        private final AtomicBoolean lookupWasBlocked = new AtomicBoolean();
        private CountDownLatch signalBlocked;
        private CountDownLatch releaseSignal;
        private String blockedSignal;
        private final AtomicBoolean signalWasBlocked = new AtomicBoolean();

        private FakeLauncher(FakeProcess process) {
            this.process = process;
        }

        @Override
        public ManagedProcess launch(LaunchSpec spec) throws IOException {
            lastLaunchSpec = spec;
            launchCount++;
            if (launchFailure != null) {
                throw launchFailure;
            }
            process.paused = true;
            return process;
        }

        @Override
        public ProcessLookup findExact(ProcessIdentity identity) {
            if (lookupBlocked != null && lookupWasBlocked.compareAndSet(false, true)) {
                lookupBlocked.countDown();
                try {
                    if (!releaseLookup.await(2, TimeUnit.SECONDS)) {
                        throw new IllegalStateException("blocked lookup was not released");
                    }
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("blocked lookup interrupted", exception);
                }
            }
            if (lookupCode != null) {
                return new ProcessLookup(lookupCode, lookupCode == LookupCode.FOUND ? process : null);
            }
            if (identity.pid() != process.pid() || !identity.processStartedAt().equals(process.startedAt())) {
                return new ProcessLookup(LookupCode.START_TIME_MISMATCH, null);
            }
            return new ProcessLookup(process.isAlive() ? LookupCode.FOUND : LookupCode.NOT_FOUND, process);
        }

        @Override
        public boolean pause(ManagedProcess ignored) {
            calls.add("pause");
            process.paused = pauseReportsStopped;
            blockSignalIfRequested("pause");
            return true;
        }

        @Override
        public boolean resume(ManagedProcess ignored) {
            calls.add("resume");
            if (resumeSucceeds) {
                process.paused = false;
            }
            blockSignalIfRequested("resume");
            return resumeSucceeds;
        }

        @Override
        public boolean terminateGracefully(ManagedProcess ignored) {
            calls.add("graceful");
            return true;
        }

        @Override
        public boolean terminateForcibly(ManagedProcess ignored) {
            calls.add("forced");
            return true;
        }

        @Override
        public boolean awaitExit(ManagedProcess ignored, Duration timeout) {
            calls.add("wait:" + timeout);
            boolean exit = timeout.equals(Duration.ofSeconds(15))
                ? exitAfterGracefulWait
                : exitAfterForcedWait;
            if (exit) {
                process.alive = false;
            }
            return exit;
        }

        @Override
        public boolean isPaused(ManagedProcess ignored) {
            calls.add("isPaused");
            return process.paused;
        }

        private LaunchSpec lastLaunchSpec() {
            return lastLaunchSpec;
        }

        private List<String> calls() {
            return List.copyOf(calls);
        }

        private int launchCount() {
            return launchCount;
        }

        private void blockNextLookup() {
            lookupBlocked = new CountDownLatch(1);
            releaseLookup = new CountDownLatch(1);
            lookupWasBlocked.set(false);
        }

        private boolean awaitBlockedLookup() throws InterruptedException {
            return lookupBlocked.await(2, TimeUnit.SECONDS);
        }

        private void releaseBlockedLookup() {
            releaseLookup.countDown();
        }

        private void blockAfterNextPause() {
            blockAfterNextSignal("pause");
        }

        private void blockAfterNextResume() {
            blockAfterNextSignal("resume");
        }

        private void blockAfterNextSignal(String signal) {
            blockedSignal = signal;
            signalBlocked = new CountDownLatch(1);
            releaseSignal = new CountDownLatch(1);
            signalWasBlocked.set(false);
        }

        private void blockSignalIfRequested(String signal) {
            if (!signal.equals(blockedSignal) || !signalWasBlocked.compareAndSet(false, true)) {
                return;
            }
            signalBlocked.countDown();
            try {
                if (!releaseSignal.await(2, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("blocked signal was not released");
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("blocked signal interrupted", exception);
            }
        }

        private boolean awaitBlockedSignal() throws InterruptedException {
            return signalBlocked.await(2, TimeUnit.SECONDS);
        }

        private void releaseBlockedSignal() {
            releaseSignal.countDown();
        }
    }

    private static final class FakeProcess implements CrawlerAttemptProcessLauncher.ManagedProcess {
        private final long pid;
        private final Instant startedAt;
        private final ProcessHandle handle = mock(ProcessHandle.class);
        private final CompletableFuture<ProcessHandle> exitFuture = new CompletableFuture<>();
        private boolean alive;
        private boolean paused;
        private int exitCode;
        private boolean exitCodeUnavailable;
        private boolean failOnExitRegistration;

        private FakeProcess(long pid, Instant startedAt, boolean alive) {
            this.pid = pid;
            this.startedAt = startedAt;
            this.alive = alive;
            when(handle.onExit()).thenReturn(exitFuture);
        }

        private static FakeProcess alive(long pid, Instant startedAt) {
            return new FakeProcess(pid, startedAt, true);
        }

        private void completeExit(int code) {
            exitCode = code;
            alive = false;
            exitFuture.complete(handle);
        }

        private void completeExitWithoutCode() {
            exitCodeUnavailable = true;
            alive = false;
            exitFuture.complete(handle);
        }

        private void completeWatcherFailure(Throwable failure) {
            alive = false;
            exitFuture.completeExceptionally(failure);
        }

        @Override
        public long pid() {
            return pid;
        }

        @Override
        public Instant startedAt() {
            return startedAt;
        }

        @Override
        public boolean isAlive() {
            return alive;
        }

        @Override
        public int exitValue() {
            if (alive) {
                throw new IllegalThreadStateException("process is still alive");
            }
            if (exitCodeUnavailable) {
                throw new IllegalStateException("recovered process exit code is unavailable");
            }
            return exitCode;
        }

        @Override
        public boolean exitCodeAvailable() {
            return !exitCodeUnavailable;
        }

        @Override
        public ProcessHandle handle() {
            if (failOnExitRegistration) {
                throw new IllegalStateException("watcher registration failed");
            }
            return handle;
        }
    }
}
