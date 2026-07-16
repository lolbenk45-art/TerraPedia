package com.terraria.skills.service.impl.crawlerv2;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

public interface CrawlerAttemptProcessLauncher {

    ManagedProcess launch(LaunchSpec spec) throws IOException;

    ProcessLookup findExact(ProcessIdentity identity);

    boolean pause(ManagedProcess process);

    boolean resume(ManagedProcess process);

    boolean terminateGracefully(ManagedProcess process);

    boolean terminateForcibly(ManagedProcess process);

    boolean awaitExit(ManagedProcess process, Duration timeout);

    boolean isPaused(ManagedProcess process);

    record LaunchSpec(
        List<String> command,
        Path directory,
        Map<String, String> environment,
        Path logPath
    ) {
        public LaunchSpec {
            command = List.copyOf(command);
            environment = Map.copyOf(environment);
        }
    }

    record ProcessIdentity(long pid, Instant processStartedAt) {}

    enum LookupCode {
        FOUND,
        NOT_FOUND,
        START_TIME_MISMATCH,
        INSPECTION_UNAVAILABLE
    }

    record ProcessLookup(LookupCode code, ManagedProcess process) {}

    final class LaunchFailureException extends IOException {
        private final Long pid;
        private final Instant processStartedAt;
        private final boolean cleanupConfirmed;

        public LaunchFailureException(
            String message,
            Long pid,
            Instant processStartedAt,
            boolean cleanupConfirmed
        ) {
            super(message);
            this.pid = pid;
            this.processStartedAt = processStartedAt;
            this.cleanupConfirmed = cleanupConfirmed;
        }

        public Long pid() {
            return pid;
        }

        public Instant processStartedAt() {
            return processStartedAt;
        }

        public boolean cleanupConfirmed() {
            return cleanupConfirmed;
        }
    }

    interface ManagedProcess {
        long pid();

        Instant startedAt();

        boolean isAlive();

        int exitValue();

        default boolean exitCodeAvailable() {
            return true;
        }

        ProcessHandle handle();
    }
}
