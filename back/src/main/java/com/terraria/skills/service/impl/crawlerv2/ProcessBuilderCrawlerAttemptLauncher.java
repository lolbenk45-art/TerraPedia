package com.terraria.skills.service.impl.crawlerv2;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

public class ProcessBuilderCrawlerAttemptLauncher implements CrawlerAttemptProcessLauncher {

    private static final Path PROC_ROOT = Path.of("/proc");
    private static final Duration SESSION_SETUP_WAIT = Duration.ofMillis(500);
    private static final Duration PRE_RETURN_CLEANUP_WAIT = Duration.ofSeconds(2);
    private static final long GROUP_POLL_MILLIS = 20L;
    private static final int GROUP_LOOKUP_ATTEMPTS = 3;
    private final StartInstantResolver startInstantResolver;
    private final SessionValidator sessionValidator;
    private final ProcStatSource procStatSource;

    public ProcessBuilderCrawlerAttemptLauncher() {
        this(null, null, Files::readString);
    }

    ProcessBuilderCrawlerAttemptLauncher(
        StartInstantResolver startInstantResolver,
        SessionValidator sessionValidator,
        ProcStatSource procStatSource
    ) {
        this.startInstantResolver = startInstantResolver;
        this.sessionValidator = sessionValidator;
        this.procStatSource = Objects.requireNonNull(procStatSource, "procStatSource");
    }

    @Override
    public ManagedProcess launch(LaunchSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        if (spec.command().isEmpty()) {
            throw new IllegalArgumentException("crawler command 不能为空");
        }
        if (!Files.isDirectory(PROC_ROOT)) {
            throw new IOException("crawler 精确进程组监管仅支持 Linux/WSL /proc");
        }
        Path directory = Objects.requireNonNull(spec.directory(), "directory")
            .toAbsolutePath()
            .normalize();
        Path logPath = Objects.requireNonNull(spec.logPath(), "logPath")
            .toAbsolutePath()
            .normalize();
        Files.createDirectories(logPath.getParent());

        List<String> isolatedCommand = new ArrayList<>(spec.command().size() + 6);
        isolatedCommand.add("setsid");
        isolatedCommand.add("--");
        isolatedCommand.add("sh");
        isolatedCommand.add("-c");
        isolatedCommand.add("kill -STOP $$; exec \"$@\"");
        isolatedCommand.add("terrapedia-crawler-pre-exec");
        isolatedCommand.addAll(spec.command());
        ProcessBuilder builder = new ProcessBuilder(isolatedCommand);
        builder.directory(directory.toFile());
        builder.environment().putAll(spec.environment());
        builder.redirectOutput(ProcessBuilder.Redirect.appendTo(logPath.toFile()));
        builder.redirectError(ProcessBuilder.Redirect.appendTo(logPath.toFile()));
        Process process = builder.start();
        boolean preExecStoppedConfirmed = validatePreExecStoppedSession(
            process.pid(),
            SESSION_SETUP_WAIT
        );
        if (!preExecStoppedConfirmed) {
            throw launchFailure(
                process,
                resolveStartInstant(process).orElse(null),
                false,
                "crawler 子进程未建立独立 session/process-group：pid=" + process.pid()
            );
        }
        Optional<Instant> startedAt = resolveStartInstant(process);
        if (startedAt.isEmpty()) {
            throw launchFailure(
                process,
                null,
                true,
                "无法取得 crawler 子进程精确启动时间：pid=" + process.pid()
            );
        }
        return new LaunchedManagedProcess(process, startedAt.orElseThrow());
    }

    @Override
    public ProcessLookup findExact(ProcessIdentity identity) {
        if (identity == null || identity.pid() < 1L || identity.processStartedAt() == null) {
            return new ProcessLookup(LookupCode.INSPECTION_UNAVAILABLE, null);
        }
        try {
            for (int attempt = 0; attempt < GROUP_LOOKUP_ATTEMPTS; attempt++) {
                Optional<ProcessHandle> candidate = ProcessHandle.of(identity.pid());
                if (candidate.isPresent()) {
                    ProcessHandle root = candidate.orElseThrow();
                    Optional<Instant> startedAt = root.info().startInstant();
                    if (startedAt.isEmpty()) {
                        return new ProcessLookup(LookupCode.INSPECTION_UNAVAILABLE, null);
                    }
                    if (!identity.processStartedAt().equals(startedAt.orElseThrow())) {
                        return new ProcessLookup(LookupCode.START_TIME_MISMATCH, null);
                    }
                    ProcStatRead rootStat = readProcStat(identity.pid());
                    if (rootStat.code() != ProcStatReadCode.PRESENT) {
                        return new ProcessLookup(LookupCode.INSPECTION_UNAVAILABLE, null);
                    }
                    if (!rootStat.stat().belongsToIsolatedGroup(identity.pid())) {
                        return new ProcessLookup(LookupCode.INSPECTION_UNAVAILABLE, null);
                    }
                    GroupInspection group = inspectGroup(identity.pid());
                    if (!group.available()) {
                        return new ProcessLookup(LookupCode.INSPECTION_UNAVAILABLE, null);
                    }
                    List<ProcStat> activeMembers = activeMembers(group);
                    if (activeMembers.isEmpty()) {
                        return new ProcessLookup(LookupCode.NOT_FOUND, null);
                    }
                    return new ProcessLookup(
                        LookupCode.FOUND,
                        new RecoveredManagedProcess(identity, root)
                    );
                }
                GroupInspection group = inspectGroup(identity.pid());
                if (!group.available()) {
                    return new ProcessLookup(LookupCode.INSPECTION_UNAVAILABLE, null);
                }
                List<ProcStat> activeMembers = activeMembers(group);
                if (activeMembers.isEmpty()) {
                    return new ProcessLookup(LookupCode.NOT_FOUND, null);
                }
                ProcessHandle representative = ProcessHandle.of(activeMembers.get(0).pid())
                    .orElse(null);
                if (representative != null) {
                    return new ProcessLookup(
                        LookupCode.FOUND,
                        new RecoveredManagedProcess(identity, representative)
                    );
                }
            }
            return new ProcessLookup(LookupCode.INSPECTION_UNAVAILABLE, null);
        } catch (SecurityException | UnsupportedOperationException exception) {
            return new ProcessLookup(LookupCode.INSPECTION_UNAVAILABLE, null);
        }
    }

    @Override
    public boolean pause(ManagedProcess process) {
        return signalExactGroup(process, "STOP");
    }

    @Override
    public boolean resume(ManagedProcess process) {
        return signalExactGroup(process, "CONT");
    }

    @Override
    public boolean terminateGracefully(ManagedProcess process) {
        return signalExactGroup(process, "TERM");
    }

    @Override
    public boolean terminateForcibly(ManagedProcess process) {
        return signalExactGroup(process, "KILL");
    }

    @Override
    public boolean awaitExit(ManagedProcess process, Duration timeout) {
        if (process == null || timeout == null || timeout.isNegative()) {
            return false;
        }
        long deadline = System.nanoTime() + timeout.toNanos();
        while (true) {
            GroupInspection group = inspectGroup(process.pid());
            if (!group.available()) {
                return false;
            }
            if (activeMembers(group).isEmpty()) {
                return true;
            }
            if (System.nanoTime() >= deadline) {
                return false;
            }
            try {
                TimeUnit.MILLISECONDS.sleep(GROUP_POLL_MILLIS);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
    }

    @Override
    public boolean isPaused(ManagedProcess process) {
        if (process == null || findExact(identityOf(process)).code() != LookupCode.FOUND) {
            return false;
        }
        GroupInspection group = inspectGroup(process.pid());
        if (!group.available() || activeMembers(group).isEmpty()) {
            return false;
        }
        for (ProcStat member : activeMembers(group)) {
            if (!member.isStopped()) {
                return false;
            }
        }
        return true;
    }

    private boolean signalExactGroup(ManagedProcess process, String signal) {
        if (process == null || findExact(identityOf(process)).code() != LookupCode.FOUND) {
            return false;
        }
        return signalGroup(process.pid(), signal);
    }

    private boolean signalGroup(long groupId, String signal) {
        try {
            Process signalProcess = new ProcessBuilder(
                "kill",
                "-" + signal,
                "--",
                "-" + groupId
            ).start();
            return signalProcess.waitFor() == 0;
        } catch (IOException exception) {
            return false;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private ProcessIdentity identityOf(ManagedProcess process) {
        return new ProcessIdentity(process.pid(), process.startedAt());
    }

    private Optional<Instant> resolveStartInstant(Process process) {
        if (startInstantResolver != null) {
            return startInstantResolver.resolve(process);
        }
        try {
            return process.toHandle().info().startInstant();
        } catch (SecurityException | UnsupportedOperationException exception) {
            return Optional.empty();
        }
    }

    private boolean validatePreExecStoppedSession(long rootPid, Duration timeout) {
        if (!awaitPreExecStoppedSession(rootPid, timeout)) {
            return false;
        }
        return sessionValidator == null || sessionValidator.validate(rootPid, timeout);
    }

    private LaunchFailureException launchFailure(
        Process process,
        Instant startedAt,
        boolean preExecStoppedConfirmed,
        String message
    ) {
        boolean cleanupConfirmed = cleanupBeforeReturn(process, preExecStoppedConfirmed);
        return new LaunchFailureException(message, process.pid(), startedAt, cleanupConfirmed);
    }

    private boolean cleanupBeforeReturn(Process process, boolean preExecStoppedConfirmed) {
        long groupId = process.pid();
        if (preExecStoppedConfirmed) {
            // The handshake proves the wrapper is the group's only active member.
            if (!signalGroup(groupId, "KILL")) {
                process.destroyForcibly();
            }
            try {
                return process.waitFor(
                    PRE_RETURN_CLEANUP_WAIT.toMillis(),
                    TimeUnit.MILLISECONDS
                );
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        GroupInspection initial = inspectGroup(groupId);
        if (initial.available() && !initial.members().isEmpty()) {
            signalGroup(groupId, "KILL");
        } else {
            process.destroyForcibly();
        }
        boolean rootExited;
        try {
            rootExited = process.waitFor(PRE_RETURN_CLEANUP_WAIT.toMillis(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return false;
        }
        return rootExited && awaitGroupEmpty(groupId, PRE_RETURN_CLEANUP_WAIT);
    }

    private boolean awaitGroupEmpty(long groupId, Duration timeout) {
        long deadline = System.nanoTime() + timeout.toNanos();
        while (true) {
            GroupInspection group = inspectGroup(groupId);
            if (!group.available()) {
                return false;
            }
            if (group.members().isEmpty()) {
                return true;
            }
            if (System.nanoTime() >= deadline) {
                return false;
            }
            try {
                TimeUnit.MILLISECONDS.sleep(GROUP_POLL_MILLIS);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
    }

    private boolean awaitPreExecStoppedSession(long rootPid, Duration timeout) {
        long deadline = System.nanoTime() + timeout.toNanos();
        while (true) {
            ProcStatRead root = readProcStat(rootPid);
            if (root.code() == ProcStatReadCode.ERROR) {
                return false;
            }
            if (root.code() == ProcStatReadCode.PRESENT
                && root.stat().belongsToIsolatedGroup(rootPid)
                && root.stat().isStopped()) {
                GroupInspection group = inspectGroup(rootPid);
                if (!group.available()) {
                    return false;
                }
                List<ProcStat> activeMembers = group.members().stream()
                    .filter(member -> !member.isExited())
                    .toList();
                if (activeMembers.size() == 1
                    && activeMembers.get(0).pid() == rootPid
                    && activeMembers.get(0).isStopped()) {
                    return true;
                }
            }
            if (System.nanoTime() >= deadline || ProcessHandle.of(rootPid).isEmpty()) {
                return false;
            }
            try {
                TimeUnit.MILLISECONDS.sleep(1L);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
    }

    private GroupInspection inspectGroup(long groupId) {
        if (!Files.isDirectory(PROC_ROOT)) {
            return GroupInspection.unavailable();
        }
        List<ProcStat> members = new ArrayList<>();
        try (Stream<Path> paths = Files.list(PROC_ROOT)) {
            for (Path path : paths.filter(this::isNumericProcessDirectory).toList()) {
                ProcStatRead stat = readProcStat(path);
                if (stat.code() == ProcStatReadCode.ERROR) {
                    return GroupInspection.unavailable();
                }
                if (stat.code() == ProcStatReadCode.PRESENT
                    && stat.stat().belongsToIsolatedGroup(groupId)) {
                    members.add(stat.stat());
                }
            }
            return GroupInspection.available(members);
        } catch (IOException | SecurityException exception) {
            return GroupInspection.unavailable();
        }
    }

    private List<ProcStat> activeMembers(GroupInspection group) {
        return group.members().stream()
            .filter(member -> !member.isExited())
            .toList();
    }

    private boolean isNumericProcessDirectory(Path path) {
        String name = path.getFileName().toString();
        if (name.isEmpty()) {
            return false;
        }
        for (int index = 0; index < name.length(); index++) {
            if (!Character.isDigit(name.charAt(index))) {
                return false;
            }
        }
        return true;
    }

    private ProcStatRead readProcStat(long pid) {
        return readProcStat(PROC_ROOT.resolve(Long.toString(pid)));
    }

    private ProcStatRead readProcStat(Path processDirectory) {
        try {
            String raw = procStatSource.read(processDirectory.resolve("stat"));
            int firstSpace = raw.indexOf(' ');
            int commandEnd = raw.lastIndexOf(')');
            if (firstSpace < 1 || commandEnd < firstSpace || commandEnd + 2 >= raw.length()) {
                return ProcStatRead.error();
            }
            long pid = Long.parseLong(raw.substring(0, firstSpace));
            String[] fields = raw.substring(commandEnd + 2).trim().split("\\s+");
            if (fields.length < 4 || fields[0].length() != 1) {
                return ProcStatRead.error();
            }
            return ProcStatRead.present(new ProcStat(
                pid,
                fields[0].charAt(0),
                Long.parseLong(fields[2]),
                Long.parseLong(fields[3])
            ));
        } catch (NoSuchFileException exception) {
            return ProcStatRead.absent();
        } catch (IOException | NumberFormatException | SecurityException exception) {
            return ProcStatRead.error();
        }
    }

    private final class LaunchedManagedProcess implements ManagedProcess {
        private final Process process;
        private final Instant startedAt;

        private LaunchedManagedProcess(Process process, Instant startedAt) {
            this.process = Objects.requireNonNull(process, "process");
            this.startedAt = Objects.requireNonNull(startedAt, "startedAt");
        }

        @Override
        public long pid() {
            return process.pid();
        }

        @Override
        public Instant startedAt() {
            return startedAt;
        }

        @Override
        public boolean isAlive() {
            GroupInspection group = inspectGroup(pid());
            return group.available() && !activeMembers(group).isEmpty();
        }

        @Override
        public int exitValue() {
            return process.exitValue();
        }

        @Override
        public ProcessHandle handle() {
            return process.toHandle();
        }
    }

    private final class RecoveredManagedProcess implements ManagedProcess {
        private final ProcessIdentity identity;
        private final ProcessHandle representative;

        private RecoveredManagedProcess(ProcessIdentity identity, ProcessHandle representative) {
            this.identity = Objects.requireNonNull(identity, "identity");
            this.representative = Objects.requireNonNull(representative, "representative");
        }

        @Override
        public long pid() {
            return identity.pid();
        }

        @Override
        public Instant startedAt() {
            return identity.processStartedAt();
        }

        @Override
        public boolean isAlive() {
            GroupInspection group = inspectGroup(pid());
            return group.available() && !activeMembers(group).isEmpty();
        }

        @Override
        public int exitValue() {
            if (isAlive()) {
                throw new IllegalThreadStateException("process group is still alive");
            }
            throw new IllegalStateException("recovered process exit code is unavailable");
        }

        @Override
        public boolean exitCodeAvailable() {
            return false;
        }

        @Override
        public ProcessHandle handle() {
            return representative;
        }
    }

    private record GroupInspection(boolean available, List<ProcStat> members) {
        private GroupInspection {
            members = List.copyOf(members);
        }

        private static GroupInspection available(List<ProcStat> members) {
            return new GroupInspection(true, members);
        }

        private static GroupInspection unavailable() {
            return new GroupInspection(false, List.of());
        }
    }

    private enum ProcStatReadCode {
        PRESENT,
        ABSENT,
        ERROR
    }

    private record ProcStatRead(ProcStatReadCode code, ProcStat stat) {
        private static ProcStatRead present(ProcStat stat) {
            return new ProcStatRead(ProcStatReadCode.PRESENT, stat);
        }

        private static ProcStatRead absent() {
            return new ProcStatRead(ProcStatReadCode.ABSENT, null);
        }

        private static ProcStatRead error() {
            return new ProcStatRead(ProcStatReadCode.ERROR, null);
        }
    }

    private record ProcStat(long pid, char state, long processGroupId, long sessionId) {
        private boolean belongsToIsolatedGroup(long groupId) {
            return processGroupId == groupId && sessionId == groupId;
        }

        private boolean isStopped() {
            return state == 'T' || state == 't';
        }

        private boolean isExited() {
            return state == 'X' || state == 'x' || state == 'Z';
        }
    }

    @FunctionalInterface
    interface StartInstantResolver {
        Optional<Instant> resolve(Process process);
    }

    @FunctionalInterface
    interface SessionValidator {
        boolean validate(long pid, Duration timeout);
    }

    @FunctionalInterface
    interface ProcStatSource {
        String read(Path statPath) throws IOException;
    }
}
