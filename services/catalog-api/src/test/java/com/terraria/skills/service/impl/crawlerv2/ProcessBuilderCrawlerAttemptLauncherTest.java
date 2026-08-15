package com.terraria.skills.service.impl.crawlerv2;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BooleanSupplier;
import java.util.function.Predicate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProcessBuilderCrawlerAttemptLauncherTest {

    @TempDir
    Path tempDir;

    private final ProcessBuilderCrawlerAttemptLauncher launcher =
        new ProcessBuilderCrawlerAttemptLauncher();

    @Test
    void launchMustUseCwdEnvironmentAppendBothStreamsAndCaptureStartInstant() throws Exception {
        Path logPath = tempDir.resolve("run.log");
        Files.writeString(logPath, "before\n");
        CrawlerAttemptProcessLauncher.ManagedProcess process = launchAndResume(
            new CrawlerAttemptProcessLauncher.LaunchSpec(
                List.of(
                    "sh",
                    "-c",
                    "sleep 0.2; printf 'out:%s:%s\\n' \"$TEST_ENV\" \"$PWD\"; printf 'err-line\\n' >&2"
                ),
                tempDir,
                Map.of("TEST_ENV", "exact-env"),
                logPath
            )
        );

        assertNotNull(process.startedAt());
        assertEquals(process.startedAt(), process.handle().info().startInstant().orElseThrow());
        assertTrue(launcher.awaitExit(process, Duration.ofSeconds(5)));
        String log = Files.readString(logPath);
        assertTrue(log.startsWith("before\n"));
        assertTrue(log.contains("out:exact-env:" + tempDir.toAbsolutePath()));
        assertTrue(log.contains("err-line"));
    }

    @Test
    void immediateExitMustNotRemainAliveAsACompletedGroupMember() throws Exception {
        assumeLinuxProcessTools();
        CrawlerAttemptProcessLauncher.ManagedProcess process = launchAndResume(
            new CrawlerAttemptProcessLauncher.LaunchSpec(
                List.of("sh", "-c", "printf done"),
                tempDir,
                Map.of(),
                tempDir.resolve("short.log")
            )
        );

        assertNotNull(process.handle().onExit().get(2, TimeUnit.SECONDS));
        assertTrue(launcher.awaitExit(process, Duration.ofSeconds(2)));
        assertFalse(process.isAlive());
        assertEquals(
            CrawlerAttemptProcessLauncher.LookupCode.NOT_FOUND,
            launcher.findExact(new CrawlerAttemptProcessLauncher.ProcessIdentity(
                process.pid(),
                process.startedAt()
            )).code()
        );
        assertTrue(process.exitCodeAvailable());
        assertEquals(0, process.exitValue());
    }

    @Test
    void exitedProcMemberMustNotKeepTheProcessGroupAlive() throws Exception {
        assumeLinuxProcessTools();
        AtomicLong exitedPid = new AtomicLong(-1L);
        ProcessBuilderCrawlerAttemptLauncher exitedInspector = new ProcessBuilderCrawlerAttemptLauncher(
            null,
            null,
            statPath -> {
                String stat = Files.readString(statPath);
                if (!statPath.getParent().getFileName().toString().equals(Long.toString(exitedPid.get()))) {
                    return stat;
                }
                int commandEnd = stat.lastIndexOf(')');
                return stat.substring(0, commandEnd + 2) + "Z" + stat.substring(commandEnd + 3);
            }
        );
        CrawlerAttemptProcessLauncher.ManagedProcess process = launchAndResume(
            exitedInspector,
            new CrawlerAttemptProcessLauncher.LaunchSpec(
                List.of("sleep", "30"),
                tempDir,
                Map.of(),
                tempDir.resolve("exited-member.log")
            )
        );
        exitedPid.set(process.pid());
        try {
            assertTrue(exitedInspector.awaitExit(process, Duration.ofMillis(100)));
            assertFalse(process.isAlive());
            assertEquals(
                CrawlerAttemptProcessLauncher.LookupCode.NOT_FOUND,
                exitedInspector.findExact(new CrawlerAttemptProcessLauncher.ProcessIdentity(
                    process.pid(),
                    process.startedAt()
                )).code()
            );
        } finally {
            forceRawGroupCleanup(process.pid(), -1L);
        }
    }

    @Test
    void launchMustReturnStoppedBeforeWorkerExecutesOrSpawnsDescendants() throws Exception {
        assumeLinuxProcessTools();
        Path markerPath = tempDir.resolve("pre-exec-worker.marker");
        Path childPidPath = tempDir.resolve("pre-exec-child.pid");
        CrawlerAttemptProcessLauncher.ManagedProcess process = launcher.launch(
            immediateMarkerGroup(markerPath, childPidPath, "pre-exec.log")
        );
        long childPid = -1L;
        try {
            assertTrue(launcher.isPaused(process));
            assertFalse(Files.exists(markerPath));
            assertFalse(Files.exists(childPidPath));

            assertTrue(launcher.resume(process));
            assertTrue(await(Duration.ofSeconds(2), () -> Files.exists(markerPath)));
            assertTrue(await(Duration.ofSeconds(2), () -> Files.exists(childPidPath)));
            childPid = readPid(childPidPath);
        } finally {
            forceGroupCleanup(process, childPid);
        }
        assertFalse(ProcessHandle.of(childPid).map(ProcessHandle::isAlive).orElse(false));
    }

    @Test
    void missingStartInstantMustConfirmCleanupWithoutProcAfterStoppedHandshake() throws Exception {
        assumeLinuxProcessTools();
        Path markerPath = tempDir.resolve("missing-start-stopped.marker");
        Path childPidPath = tempDir.resolve("missing-start-stopped-child.pid");
        AtomicBoolean failInspection = new AtomicBoolean();
        ProcessBuilderCrawlerAttemptLauncher failingLauncher = new ProcessBuilderCrawlerAttemptLauncher(
            ignored -> {
                failInspection.set(true);
                return Optional.empty();
            },
            null,
            statPath -> {
                if (failInspection.get()) {
                    throw new IOException("inspection unavailable after stopped handshake");
                }
                return Files.readString(statPath);
            }
        );

        CrawlerAttemptProcessLauncher.LaunchFailureException failure = null;
        long childPid = -1L;
        try {
            failure = assertThrows(
                CrawlerAttemptProcessLauncher.LaunchFailureException.class,
                () -> failingLauncher.launch(immediateMarkerGroup(
                    markerPath,
                    childPidPath,
                    "missing-start-stopped.log"
                ))
            );
            if (Files.exists(childPidPath)) {
                childPid = readPid(childPidPath);
            }

            assertTrue(failure.cleanupConfirmed());
            assertEquals(null, failure.processStartedAt());
            assertFalse(Files.exists(markerPath));
            assertFalse(Files.exists(childPidPath));
            assertFalse(ProcessHandle.of(failure.pid()).map(ProcessHandle::isAlive).orElse(false));
        } finally {
            forceRawGroupCleanup(failure == null ? -1L : failure.pid(), childPid);
        }
    }

    @Test
    void sessionValidationFailureMustKillTheOwnedGroupBeforeReturning() throws Exception {
        assumeLinuxProcessTools();
        Path markerPath = tempDir.resolve("session-failure.marker");
        Path childPidPath = tempDir.resolve("session-failure-child.pid");
        ProcessBuilderCrawlerAttemptLauncher failingLauncher = new ProcessBuilderCrawlerAttemptLauncher(
            null,
            (pid, timeout) -> false,
            Files::readString
        );
        CrawlerAttemptProcessLauncher.LaunchFailureException failure = null;
        try {
            failure = assertThrows(
                CrawlerAttemptProcessLauncher.LaunchFailureException.class,
                () -> failingLauncher.launch(immediateMarkerGroup(
                    markerPath,
                    childPidPath,
                    "session-failure.log"
                ))
            );

            assertTrue(failure.cleanupConfirmed());
            assertTrue(failure.pid() > 0L);
            assertFalse(Files.exists(markerPath));
            assertFalse(Files.exists(childPidPath));
            assertFalse(ProcessHandle.of(failure.pid()).map(ProcessHandle::isAlive).orElse(false));
        } finally {
            forceRawGroupCleanup(failure == null ? -1L : failure.pid(), -1L);
        }
    }

    @Test
    void missingStartInstantMustKillTheOwnedGroupBeforeReturning() throws Exception {
        assumeLinuxProcessTools();
        Path markerPath = tempDir.resolve("missing-start.marker");
        Path childPidPath = tempDir.resolve("missing-start-child.pid");
        ProcessBuilderCrawlerAttemptLauncher failingLauncher = new ProcessBuilderCrawlerAttemptLauncher(
            ignored -> Optional.empty(),
            null,
            Files::readString
        );
        long childPid = -1L;
        CrawlerAttemptProcessLauncher.LaunchFailureException failure = null;
        try {
            failure = assertThrows(
                CrawlerAttemptProcessLauncher.LaunchFailureException.class,
                () -> failingLauncher.launch(immediateMarkerGroup(
                    markerPath,
                    childPidPath,
                    "missing-start.log"
                ))
            );

            assertTrue(failure.cleanupConfirmed());
            assertEquals(null, failure.processStartedAt());
            assertFalse(Files.exists(markerPath));
            assertFalse(Files.exists(childPidPath));
            assertFalse(ProcessHandle.of(failure.pid()).map(ProcessHandle::isAlive).orElse(false));
        } finally {
            forceRawGroupCleanup(failure == null ? -1L : failure.pid(), childPid);
        }
    }

    @Test
    void cleanupInspectionFailureMustReturnTypedUnconfirmedLaunchFailure() throws Exception {
        assumeLinuxProcessTools();
        Path markerPath = tempDir.resolve("unconfirmed-cleanup.marker");
        Path childPidPath = tempDir.resolve("unconfirmed-cleanup-child.pid");
        ProcessBuilderCrawlerAttemptLauncher failingLauncher = new ProcessBuilderCrawlerAttemptLauncher(
            null,
            (pid, timeout) -> false,
            ignored -> {
                throw new IOException("injected proc inspection failure");
            }
        );
        CrawlerAttemptProcessLauncher.LaunchFailureException failure = null;
        try {
            failure = assertThrows(
                CrawlerAttemptProcessLauncher.LaunchFailureException.class,
                () -> failingLauncher.launch(immediateMarkerGroup(
                    markerPath,
                    childPidPath,
                    "unconfirmed-cleanup.log"
                ))
            );

            assertFalse(failure.cleanupConfirmed());
            assertTrue(failure.pid() > 0L);
            assertFalse(Files.exists(markerPath));
            assertFalse(Files.exists(childPidPath));
        } finally {
            forceRawGroupCleanup(failure == null ? -1L : failure.pid(), -1L);
        }
        assertFalse(ProcessHandle.of(failure.pid()).map(ProcessHandle::isAlive).orElse(false));
    }

    @Test
    void unreadableSoleDescendantStatMustNotConfirmGroupExit() throws Exception {
        assumeLinuxProcessTools();
        Path childPidPath = tempDir.resolve("unreadable-stat-child.pid");
        AtomicLong childPid = new AtomicLong(-1L);
        ProcessBuilderCrawlerAttemptLauncher failingInspector = new ProcessBuilderCrawlerAttemptLauncher(
            null,
            null,
            statPath -> {
                if (statPath.getParent().getFileName().toString().equals(Long.toString(childPid.get()))) {
                    throw new IOException("injected unreadable descendant stat");
                }
                return Files.readString(statPath);
            }
        );
        CrawlerAttemptProcessLauncher.ManagedProcess process = launchAndResume(
            failingInspector,
            new CrawlerAttemptProcessLauncher.LaunchSpec(
                List.of(
                    "sh",
                    "-c",
                    "sleep 30 & child=$!; printf '%s' \"$child\" > \"$CHILD_PID_PATH\"; sleep 0.3"
                ),
                tempDir,
                Map.of("CHILD_PID_PATH", childPidPath.toString()),
                tempDir.resolve("unreadable-stat.log")
            )
        );
        try {
            assertTrue(await(Duration.ofSeconds(2), () -> Files.exists(childPidPath)));
            childPid.set(readPid(childPidPath));
            assertTrue(await(Duration.ofSeconds(2), () -> !process.handle().isAlive()));

            assertFalse(failingInspector.awaitExit(process, Duration.ofMillis(100)));
        } finally {
            forceGroupCleanup(process, childPid.get());
        }
        assertFalse(ProcessHandle.of(childPid.get()).map(ProcessHandle::isAlive).orElse(false));
    }

    @Test
    void malformedSoleDescendantStatMustNotConfirmPausedGroup() throws Exception {
        assumeLinuxProcessTools();
        Path childPidPath = tempDir.resolve("malformed-stat-child.pid");
        AtomicLong childPid = new AtomicLong(-1L);
        CrawlerAttemptProcessLauncher.ManagedProcess process = launchAndResume(
            longRunningGroup(childPidPath, "malformed-stat.log")
        );
        try {
            assertTrue(await(Duration.ofSeconds(2), () -> Files.exists(childPidPath)));
            childPid.set(readPid(childPidPath));
            assertTrue(launcher.pause(process));
            assertTrue(await(Duration.ofSeconds(2), () -> launcher.isPaused(process)));
            ProcessBuilderCrawlerAttemptLauncher failingInspector = new ProcessBuilderCrawlerAttemptLauncher(
                null,
                null,
                statPath -> statPath.getParent().getFileName().toString()
                    .equals(Long.toString(childPid.get()))
                    ? "malformed proc stat"
                    : Files.readString(statPath)
            );

            assertFalse(failingInspector.isPaused(process));
        } finally {
            launcher.resume(process);
            forceGroupCleanup(process, childPid.get());
        }
        assertFalse(ProcessHandle.of(childPid.get()).map(ProcessHandle::isAlive).orElse(false));
    }

    @Test
    void driftedStartInstantWithMatchingAttemptFingerprintMustStillFindAndControlTheGroup() throws Exception {
        assumeLinuxProcessTools();
        CrawlerAttemptProcessLauncher.ManagedProcess process = launchAndResume(
            new CrawlerAttemptProcessLauncher.LaunchSpec(
                List.of("sh", "-c", "while :; do sleep 1; done"),
                tempDir,
                Map.of("TERRAPEDIA_CRAWLER_ATTEMPT_ID", "attempt-drift-check"),
                tempDir.resolve("drift-match.log")
            )
        );
        try {
            // WSL2 btime 漂移: 记录的 startInstant 与 /proc 推导值差 67 秒
            CrawlerAttemptProcessLauncher.ProcessLookup drifted = launcher.findExact(
                new CrawlerAttemptProcessLauncher.ProcessIdentity(
                    process.pid(),
                    process.startedAt().plusSeconds(67),
                    "attempt-drift-check"
                )
            );

            assertEquals(CrawlerAttemptProcessLauncher.LookupCode.FOUND, drifted.code());
            assertTrue(launcher.pause(drifted.process()));
            assertTrue(await(Duration.ofSeconds(2), () -> launcher.isPaused(drifted.process())));
            assertTrue(launcher.resume(drifted.process()));
            assertTrue(launcher.terminateForcibly(drifted.process()));
            assertTrue(launcher.awaitExit(drifted.process(), Duration.ofSeconds(2)));
        } finally {
            forceGroupCleanup(process, -1L);
        }
    }

    @Test
    void driftedStartInstantMustRetryATransientlyUnreadableAttemptFingerprint() throws Exception {
        assumeLinuxProcessTools();
        CrawlerAttemptProcessLauncher.ManagedProcess process = launchAndResume(
            new CrawlerAttemptProcessLauncher.LaunchSpec(
                List.of("sh", "-c", "while :; do sleep 1; done"),
                tempDir,
                Map.of("TERRAPEDIA_CRAWLER_ATTEMPT_ID", "attempt-transient-read"),
                tempDir.resolve("drift-transient.log")
            )
        );
        AtomicInteger reads = new AtomicInteger();
        ProcessBuilderCrawlerAttemptLauncher transientInspector = new ProcessBuilderCrawlerAttemptLauncher(
            null,
            null,
            Files::readString,
            pid -> reads.getAndIncrement() == 0
                ? new byte[0]
                : Files.readAllBytes(Path.of("/proc", Long.toString(pid), "environ"))
        );
        try {
            CrawlerAttemptProcessLauncher.ProcessLookup lookup = transientInspector.findExact(
                new CrawlerAttemptProcessLauncher.ProcessIdentity(
                    process.pid(),
                    process.startedAt().plusSeconds(67),
                    "attempt-transient-read"
                )
            );

            assertEquals(CrawlerAttemptProcessLauncher.LookupCode.FOUND, lookup.code());
            assertTrue(reads.get() >= 2);
        } finally {
            forceGroupCleanup(process, -1L);
        }
    }

    @Test
    void driftedStartInstantWithForeignAttemptFingerprintMustNotBeTreatedAsOursNorSignalled() throws Exception {
        assumeLinuxProcessTools();
        CrawlerAttemptProcessLauncher.ManagedProcess process = launchAndResume(
            new CrawlerAttemptProcessLauncher.LaunchSpec(
                List.of("sh", "-c", "while :; do sleep 1; done"),
                tempDir,
                Map.of("TERRAPEDIA_CRAWLER_ATTEMPT_ID", "attempt-real"),
                tempDir.resolve("drift-foreign.log")
            )
        );
        try {
            CrawlerAttemptProcessLauncher.ProcessLookup foreign = launcher.findExact(
                new CrawlerAttemptProcessLauncher.ProcessIdentity(
                    process.pid(),
                    process.startedAt().plusSeconds(67),
                    "attempt-other"
                )
            );

            // pid 被别的 attempt(或复用)占据: 我们的进程已消亡, 而非"找到了"
            assertEquals(CrawlerAttemptProcessLauncher.LookupCode.NOT_FOUND, foreign.code());
            assertTrue(process.isAlive());
        } finally {
            forceGroupCleanup(process, -1L);
        }
    }

    @Test
    void rootPidReuseWithSurvivingFingerprintedMemberMustStillFindTheGroup() throws Exception {
        assumeLinuxProcessTools();
        Path childPidPath = tempDir.resolve("drift-survivor-child.pid");
        CrawlerAttemptProcessLauncher.ManagedProcess process = launchAndResume(
            new CrawlerAttemptProcessLauncher.LaunchSpec(
                List.of(
                    "sh",
                    "-c",
                    "sleep 30 & child=$!; printf '%s' \"$child\" > \"$CHILD_PID_PATH\"; sleep 0.3"
                ),
                tempDir,
                Map.of(
                    "CHILD_PID_PATH", childPidPath.toString(),
                    "TERRAPEDIA_CRAWLER_ATTEMPT_ID", "attempt-survivor"
                ),
                tempDir.resolve("drift-survivor.log")
            )
        );
        long childPid = -1L;
        try {
            assertTrue(await(Duration.ofSeconds(2), () -> Files.exists(childPidPath)));
            childPid = readPid(childPidPath);
            assertTrue(await(Duration.ofSeconds(2), () -> !process.handle().isAlive()));

            // 根进程已退出(将来可能被复用), 组内子进程仍在; 漂移身份 + 指纹须能找回
            CrawlerAttemptProcessLauncher.ProcessLookup lookup = launcher.findExact(
                new CrawlerAttemptProcessLauncher.ProcessIdentity(
                    process.pid(),
                    process.startedAt().plusSeconds(67),
                    "attempt-survivor"
                )
            );

            assertEquals(CrawlerAttemptProcessLauncher.LookupCode.FOUND, lookup.code());
            assertTrue(launcher.terminateForcibly(lookup.process()));
            assertTrue(launcher.awaitExit(lookup.process(), Duration.ofSeconds(2)));
        } finally {
            forceGroupCleanup(process, childPid);
        }
        assertFalse(ProcessHandle.of(childPid).map(ProcessHandle::isAlive).orElse(false));
    }

    @Test
    void exactLookupMustRejectStartMismatchWithoutSignallingThatPid() {
        ProcessHandle current = ProcessHandle.current();
        Instant actualStart = current.info().startInstant().orElseThrow();
        CrawlerAttemptProcessLauncher.ProcessLookup mismatch = launcher.findExact(
            new CrawlerAttemptProcessLauncher.ProcessIdentity(
                current.pid(),
                actualStart.plusSeconds(1)
            )
        );
        CrawlerAttemptProcessLauncher.ManagedProcess wrongIdentity = managed(
            current,
            actualStart.plusSeconds(1)
        );

        assertEquals(CrawlerAttemptProcessLauncher.LookupCode.START_TIME_MISMATCH, mismatch.code());
        assertFalse(launcher.pause(wrongIdentity));
        assertFalse(launcher.resume(wrongIdentity));
        assertFalse(launcher.terminateGracefully(wrongIdentity));
        assertFalse(launcher.terminateForcibly(wrongIdentity));
        assertTrue(current.isAlive());
    }

    @Test
    void lookupMustReportInspectionUnavailableForIncompleteIdentity() {
        assertEquals(
            CrawlerAttemptProcessLauncher.LookupCode.INSPECTION_UNAVAILABLE,
            launcher.findExact(new CrawlerAttemptProcessLauncher.ProcessIdentity(
                ProcessHandle.current().pid(),
                null
            )).code()
        );
    }

    @Test
    void linuxPauseResumeMustUseStoppedStateAcknowledgementAndLeaveNoProcessBehind() throws Exception {
        assumeLinuxProcessTools();
        Path logPath = tempDir.resolve("pause-run.log");
        Path childPidPath = tempDir.resolve("pause-child.pid");
        CrawlerAttemptProcessLauncher.ManagedProcess process = launchAndResume(
            new CrawlerAttemptProcessLauncher.LaunchSpec(
                List.of(
                    "sh",
                    "-c",
                    "sh -c 'while :; do sleep 1; done' & child=$!; "
                        + "printf '%s' \"$child\" > \"$CHILD_PID_PATH\"; while :; do sleep 1; done"
                ),
                tempDir,
                Map.of("CHILD_PID_PATH", childPidPath.toString()),
                logPath
            )
        );
        long childPid = -1L;
        try {
            assertTrue(await(Duration.ofSeconds(2), () -> Files.exists(childPidPath)));
            childPid = Long.parseLong(Files.readString(childPidPath));
            assertTrue(launcher.pause(process));
            assertTrue(await(Duration.ofSeconds(2), () -> launcher.isPaused(process)));
            long pausedChildPid = childPid;
            assertTrue(await(
                Duration.ofSeconds(2),
                () -> processStateMatches(pausedChildPid, state -> state == 'T' || state == 't')
            ));
            assertTrue(launcher.resume(process));
            assertTrue(await(Duration.ofSeconds(2), () -> !launcher.isPaused(process)));
            long resumedChildPid = childPid;
            assertTrue(await(
                Duration.ofSeconds(2),
                () -> processStateMatches(resumedChildPid, state -> state != 'T' && state != 't')
            ));
        } finally {
            forceGroupCleanup(process, childPid);
        }
        assertFalse(process.isAlive());
    }

    @Test
    void rootExitMustNotConfirmExitWhileItsSessionChildRemainsAlive() throws Exception {
        assumeLinuxProcessTools();
        Path childPidPath = tempDir.resolve("root-exit-child.pid");
        CrawlerAttemptProcessLauncher.ManagedProcess process = launchAndResume(
            new CrawlerAttemptProcessLauncher.LaunchSpec(
                List.of(
                    "sh",
                    "-c",
                    "sleep 30 & child=$!; printf '%s' \"$child\" > \"$CHILD_PID_PATH\"; sleep 0.3"
                ),
                tempDir,
                Map.of("CHILD_PID_PATH", childPidPath.toString()),
                tempDir.resolve("root-exit-run.log")
            )
        );
        ProcessHandle child = null;
        try {
            assertTrue(await(Duration.ofSeconds(2), () -> Files.exists(childPidPath)));
            child = ProcessHandle.of(Long.parseLong(Files.readString(childPidPath))).orElseThrow();
            assertTrue(await(Duration.ofSeconds(2), () -> !process.handle().isAlive()));

            assertFalse(launcher.awaitExit(process, Duration.ofMillis(100)));
            assertTrue(process.isAlive());
            assertEquals(
                CrawlerAttemptProcessLauncher.LookupCode.FOUND,
                launcher.findExact(new CrawlerAttemptProcessLauncher.ProcessIdentity(
                    process.pid(),
                    process.startedAt()
                )).code()
            );
        } finally {
            launcher.terminateForcibly(process);
            launcher.awaitExit(process, Duration.ofSeconds(2));
            if (child != null && child.isAlive()) {
                child.destroyForcibly();
                child.onExit().get();
            }
        }
        assertFalse(child != null && child.isAlive());
    }

    @Test
    void gracefulAndForcedTerminationMustWaitForTheWholeProcessGroup() throws Exception {
        assumeLinuxProcessTools();
        Path childPidPath = tempDir.resolve("term-child.pid");
        CrawlerAttemptProcessLauncher.ManagedProcess process = launchAndResume(
            new CrawlerAttemptProcessLauncher.LaunchSpec(
                List.of(
                    "sh",
                    "-c",
                    "trap '' TERM; sh -c 'trap \"\" TERM; while :; do sleep 1; done' & child=$!; "
                        + "printf '%s' \"$child\" > \"$CHILD_PID_PATH\"; while :; do sleep 1; done"
                ),
                tempDir,
                Map.of("CHILD_PID_PATH", childPidPath.toString()),
                tempDir.resolve("term-run.log")
            )
        );
        long childPid = -1L;
        try {
            assertTrue(await(Duration.ofSeconds(2), () -> Files.exists(childPidPath)));
            childPid = Long.parseLong(Files.readString(childPidPath));

            assertTrue(launcher.terminateGracefully(process));
            assertFalse(launcher.awaitExit(process, Duration.ofMillis(150)));
            assertTrue(ProcessHandle.of(childPid).map(ProcessHandle::isAlive).orElse(false));

            assertTrue(launcher.terminateForcibly(process));
            assertTrue(launcher.awaitExit(process, Duration.ofSeconds(2)));
        } finally {
            forceGroupCleanup(process, childPid);
        }
        assertFalse(ProcessHandle.of(childPid).map(ProcessHandle::isAlive).orElse(false));
    }

    @Test
    void descendantCreatedAfterGracefulSignalMustRemainGroupOwnedUntilKilled() throws Exception {
        assumeLinuxProcessTools();
        Path lateChildPidPath = tempDir.resolve("late-child.pid");
        CrawlerAttemptProcessLauncher.ManagedProcess process = launchAndResume(
            new CrawlerAttemptProcessLauncher.LaunchSpec(
                List.of(
                    "sh",
                    "-c",
                    "trap 'sleep 30 & late=$!; printf \"%s\" \"$late\" > \"$LATE_CHILD_PID_PATH\"; exit 0' TERM; "
                        + "while :; do sleep 1; done"
                ),
                tempDir,
                Map.of("LATE_CHILD_PID_PATH", lateChildPidPath.toString()),
                tempDir.resolve("late-child-run.log")
            )
        );
        long lateChildPid = -1L;
        try {
            assertTrue(launcher.terminateGracefully(process));
            assertTrue(await(Duration.ofSeconds(2), () -> Files.exists(lateChildPidPath)));
            lateChildPid = Long.parseLong(Files.readString(lateChildPidPath));
            assertTrue(ProcessHandle.of(lateChildPid).map(ProcessHandle::isAlive).orElse(false));

            assertFalse(launcher.awaitExit(process, Duration.ofMillis(150)));
            assertEquals(
                CrawlerAttemptProcessLauncher.LookupCode.FOUND,
                launcher.findExact(new CrawlerAttemptProcessLauncher.ProcessIdentity(
                    process.pid(),
                    process.startedAt()
                )).code()
            );

            assertTrue(launcher.terminateForcibly(process));
            assertTrue(launcher.awaitExit(process, Duration.ofSeconds(2)));
        } finally {
            forceGroupCleanup(process, lateChildPid);
        }
        assertFalse(ProcessHandle.of(lateChildPid).map(ProcessHandle::isAlive).orElse(false));
    }

    private void assumeLinuxProcessTools() {
        Assumptions.assumeTrue(Files.isDirectory(Path.of("/proc")));
        Assumptions.assumeTrue(Files.isExecutable(Path.of("/usr/bin/kill"))
            || Files.isExecutable(Path.of("/bin/kill")));
        Assumptions.assumeTrue(Files.isExecutable(Path.of("/usr/bin/setsid"))
            || Files.isExecutable(Path.of("/bin/setsid")));
    }

    private CrawlerAttemptProcessLauncher.LaunchSpec longRunningGroup(
        Path childPidPath,
        String logName
    ) {
        return new CrawlerAttemptProcessLauncher.LaunchSpec(
            List.of(
                "sh",
                "-c",
                "sleep 30 & child=$!; printf '%s' \"$child\" > \"$CHILD_PID_PATH\"; "
                    + "while :; do sleep 1; done"
            ),
            tempDir,
            Map.of("CHILD_PID_PATH", childPidPath.toString()),
            tempDir.resolve(logName)
        );
    }

    private CrawlerAttemptProcessLauncher.LaunchSpec immediateMarkerGroup(
        Path markerPath,
        Path childPidPath,
        String logName
    ) {
        return new CrawlerAttemptProcessLauncher.LaunchSpec(
            List.of(
                "sh",
                "-c",
                "printf 'worker-ran' > \"$MARKER_PATH\"; sleep 30 & child=$!; "
                    + "printf '%s' \"$child\" > \"$CHILD_PID_PATH\"; wait"
            ),
            tempDir,
            Map.of(
                "MARKER_PATH", markerPath.toString(),
                "CHILD_PID_PATH", childPidPath.toString()
            ),
            tempDir.resolve(logName)
        );
    }

    private CrawlerAttemptProcessLauncher.ManagedProcess launchAndResume(
        CrawlerAttemptProcessLauncher.LaunchSpec spec
    ) throws Exception {
        return launchAndResume(launcher, spec);
    }

    private CrawlerAttemptProcessLauncher.ManagedProcess launchAndResume(
        ProcessBuilderCrawlerAttemptLauncher processLauncher,
        CrawlerAttemptProcessLauncher.LaunchSpec spec
    ) throws Exception {
        CrawlerAttemptProcessLauncher.ManagedProcess process = processLauncher.launch(spec);
        assertTrue(processLauncher.isPaused(process));
        assertTrue(processLauncher.resume(process));
        return process;
    }

    private long readPid(Path path) {
        try {
            return Long.parseLong(Files.readString(path));
        } catch (IOException exception) {
            throw new IllegalStateException("cannot read controlled child pid", exception);
        }
    }

    private void forceRawGroupCleanup(long groupId, long childPid) throws Exception {
        if (groupId > 0L) {
            new ProcessBuilder("kill", "-KILL", "--", "-" + groupId).start().waitFor();
        }
        if (childPid > 0L) {
            OptionalProcessHandle.destroyForciblyAndWait(childPid);
        }
    }

    private void forceGroupCleanup(
        CrawlerAttemptProcessLauncher.ManagedProcess process,
        long knownChildPid
    ) throws Exception {
        launcher.terminateForcibly(process);
        launcher.awaitExit(process, Duration.ofSeconds(2));
        if (knownChildPid > 0L) {
            OptionalProcessHandle.destroyForciblyAndWait(knownChildPid);
        }
        if (process.handle().isAlive()) {
            process.handle().destroyForcibly();
            process.handle().onExit().get();
        }
    }

    private boolean processStateMatches(long pid, Predicate<Character> predicate) {
        try {
            String stat = Files.readString(Path.of("/proc", Long.toString(pid), "stat"));
            int commandEnd = stat.lastIndexOf(')');
            return commandEnd >= 0
                && commandEnd + 2 < stat.length()
                && predicate.test(stat.charAt(commandEnd + 2));
        } catch (Exception exception) {
            return false;
        }
    }

    private static final class OptionalProcessHandle {
        private OptionalProcessHandle() {}

        private static void destroyForciblyAndWait(long pid) throws Exception {
            ProcessHandle handle = ProcessHandle.of(pid).orElse(null);
            if (handle != null && handle.isAlive()) {
                handle.destroyForcibly();
                handle.onExit().get();
            }
        }
    }

    private CrawlerAttemptProcessLauncher.ManagedProcess managed(
        ProcessHandle handle,
        Instant startedAt
    ) {
        return new CrawlerAttemptProcessLauncher.ManagedProcess() {
            @Override
            public long pid() {
                return handle.pid();
            }

            @Override
            public Instant startedAt() {
                return startedAt;
            }

            @Override
            public boolean isAlive() {
                return handle.isAlive();
            }

            @Override
            public int exitValue() {
                throw new IllegalThreadStateException("not used");
            }

            @Override
            public ProcessHandle handle() {
                return handle;
            }
        };
    }

    private boolean await(Duration timeout, BooleanSupplier condition) throws InterruptedException {
        long deadline = System.nanoTime() + timeout.toNanos();
        while (System.nanoTime() < deadline) {
            if (condition.getAsBoolean()) {
                return true;
            }
            Thread.sleep(20L);
        }
        return condition.getAsBoolean();
    }
}
