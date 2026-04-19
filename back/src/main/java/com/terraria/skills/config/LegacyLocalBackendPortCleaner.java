package com.terraria.skills.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Locale;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.concurrent.TimeUnit;
import java.util.function.LongSupplier;

class LegacyLocalBackendPortCleaner {

    private static final Logger log = LoggerFactory.getLogger(LegacyLocalBackendPortCleaner.class);
    private static final Duration PROCESS_QUERY_TIMEOUT = Duration.ofSeconds(5);

    private final ListeningPidFinder listeningPidFinder;
    private final ProcessSnapshotProvider processSnapshotProvider;
    private final ProcessTerminator processTerminator;
    private final LongSupplier currentPidSupplier;
    private final boolean directWindowsCleanup;

    LegacyLocalBackendPortCleaner() {
        this(
            new PowerShellListeningPidFinder(),
            new PowerShellProcessSnapshotProvider(),
            new JvmProcessTerminator(),
            () -> ProcessHandle.current().pid(),
            true
        );
    }

    LegacyLocalBackendPortCleaner(
        ListeningPidFinder listeningPidFinder,
        ProcessSnapshotProvider processSnapshotProvider,
        ProcessTerminator processTerminator,
        LongSupplier currentPidSupplier
    ) {
        this(listeningPidFinder, processSnapshotProvider, processTerminator, currentPidSupplier, false);
    }

    private LegacyLocalBackendPortCleaner(
        ListeningPidFinder listeningPidFinder,
        ProcessSnapshotProvider processSnapshotProvider,
        ProcessTerminator processTerminator,
        LongSupplier currentPidSupplier,
        boolean directWindowsCleanup
    ) {
        this.listeningPidFinder = listeningPidFinder;
        this.processSnapshotProvider = processSnapshotProvider;
        this.processTerminator = processTerminator;
        this.currentPidSupplier = currentPidSupplier;
        this.directWindowsCleanup = directWindowsCleanup;
    }

    void releaseIfOwnedByOldBackend(int port, Path repoRoot) {
        if (port <= 0 || repoRoot == null) {
            return;
        }

        if (directWindowsCleanup && isWindows()) {
            releaseViaPowerShell(port, repoRoot);
            return;
        }

        OptionalLong listeningPid = listeningPidFinder.findListeningProcessId(port);
        if (listeningPid.isEmpty()) {
            return;
        }

        long pid = listeningPid.getAsLong();
        if (pid == currentPidSupplier.getAsLong()) {
            return;
        }

        Optional<ProcessSnapshot> snapshot = processSnapshotProvider.getProcessSnapshot(pid);
        if (snapshot.isEmpty()) {
            log.warn("Port {} is occupied by pid {} but process details are unavailable", port, pid);
            return;
        }

        if (!isOldTerraPediaBackend(snapshot.get(), repoRoot)) {
            log.warn("Port {} is occupied by a non-TerraPedia process pid={}", port, pid);
            return;
        }

        log.info("Stopping old TerraPedia backend process pid={} on port {}", pid, port);
        if (!processTerminator.terminate(pid)) {
            throw new IllegalStateException("Failed to stop old TerraPedia backend process on port " + port);
        }
    }

    private void releaseViaPowerShell(int port, Path repoRoot) {
        String normalizedRepoRoot = normalize(repoRoot.toAbsolutePath().normalize().toString());
        String normalizedBackDir = normalize(repoRoot.resolve("back").toAbsolutePath().normalize().toString());
        String script =
            "$port = " + port + "; " +
                "$currentPid = " + currentPidSupplier.getAsLong() + "; " +
                "$repoRoot = '" + escapePowerShellString(normalizedRepoRoot) + "'; " +
                "$backDir = '" + escapePowerShellString(normalizedBackDir) + "'; " +
                "$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; " +
                "if ($null -eq $listener) { Write-Output 'NONE'; exit } " +
                "$owningProcess = $listener.OwningProcess; " +
                "if ($owningProcess -eq $currentPid) { Write-Output 'SELF'; exit } " +
                "$process = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $owningProcess) | Select-Object -First 1; " +
                "if ($null -eq $process) { Write-Output ('NO_DETAILS:' + $owningProcess); exit } " +
                "$name = [string]$process.Name; " +
                "$cmd = [string]$process.CommandLine; " +
                "$normalizedCmd = $cmd.ToLowerInvariant().Replace('\\', '/'); " +
                "$javaProcess = $name -ieq 'java.exe' -or $name -ieq 'java'; " +
                "$repoMatch = $normalizedCmd.Contains($backDir) -or $normalizedCmd.Contains($repoRoot); " +
                "$backendSignature = $normalizedCmd.Contains('skillsbackapplication') -or " +
                "$normalizedCmd.Contains('com.terraria.skills.skillsbackapplication') -or " +
                "$normalizedCmd.Contains('spring-boot:run') -or " +
                "$normalizedCmd.Contains('back/target/classes'); " +
                "if (-not ($javaProcess -and $repoMatch -and $backendSignature)) { Write-Output ('SKIPPED:' + $owningProcess); exit } " +
                "Stop-Process -Id $owningProcess -Force; " +
                "for ($i = 0; $i -lt 50; $i++) { " +
                "$remaining = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; " +
                "if ($null -eq $remaining) { Write-Output ('STOPPED:' + $owningProcess); exit } " +
                "Start-Sleep -Milliseconds 200 } " +
                "Write-Output ('STOP_TIMEOUT:' + $owningProcess);";

        ProcessBuilder builder = new ProcessBuilder(resolvePowerShellExecutable(), "-NoProfile", "-Command", script);
        try {
            Process process = builder.start();
            if (!process.waitFor(PROCESS_QUERY_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS)) {
                process.destroyForcibly();
                return;
            }

            String output = decodePowerShellOutput(process.getInputStream().readAllBytes());
            String errorOutput = decodePowerShellOutput(process.getErrorStream().readAllBytes());
            if (StringUtils.hasText(errorOutput)) {
                log.warn("Failed to inspect occupied port {}: {}", port, errorOutput);
                return;
            }
            if (!StringUtils.hasText(output) || "NONE".equals(output) || "SELF".equals(output)) {
                return;
            }
            if (output.startsWith("STOPPED:")) {
                log.info("Stopping old TerraPedia backend process pid={} on port {}", output.substring("STOPPED:".length()), port);
                return;
            }
            if (output.startsWith("SKIPPED:")) {
                log.warn("Port {} is occupied by a non-TerraPedia process pid={}", port, output.substring("SKIPPED:".length()));
                return;
            }
            if (output.startsWith("NO_DETAILS:")) {
                log.warn("Port {} is occupied by pid {} but process details are unavailable", port, output.substring("NO_DETAILS:".length()));
                return;
            }
            if (output.startsWith("STOP_TIMEOUT:")) {
                throw new IllegalStateException("Failed to stop old TerraPedia backend process on port " + port);
            }
        } catch (IOException | InterruptedException exception) {
            if (exception instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private boolean isOldTerraPediaBackend(ProcessSnapshot snapshot, Path repoRoot) {
        String command = normalize(snapshot.command());
        String commandLine = normalize(snapshot.commandLine());
        String normalizedRepoRoot = normalize(repoRoot.toAbsolutePath().normalize().toString());
        String normalizedBackDir = normalize(repoRoot.resolve("back").toAbsolutePath().normalize().toString());

        boolean javaProcess = command.endsWith("java.exe") || command.endsWith("/java") || command.equals("java");
        boolean repoMatch = commandLine.contains(normalizedBackDir) || commandLine.contains(normalizedRepoRoot);
        boolean backendSignature =
            commandLine.contains("skillsbackapplication") ||
            commandLine.contains("com.terraria.skills.skillsbackapplication") ||
            commandLine.contains("spring-boot:run") ||
            commandLine.contains("back/target/classes") ||
            commandLine.contains("back\\target\\classes");

        return javaProcess && repoMatch && backendSignature;
    }

    private String normalize(String value) {
        if (!StringUtils.hasText(value)) {
            return "";
        }
        return value.replace('\\', '/').toLowerCase(Locale.ROOT);
    }

    private String escapePowerShellString(String value) {
        return value.replace("'", "''");
    }

    interface ListeningPidFinder {
        OptionalLong findListeningProcessId(int port);
    }

    interface ProcessSnapshotProvider {
        Optional<ProcessSnapshot> getProcessSnapshot(long pid);
    }

    interface ProcessTerminator {
        boolean terminate(long pid);
    }

    record ProcessSnapshot(long pid, String command, String commandLine) {
    }

    private static final class PowerShellListeningPidFinder implements ListeningPidFinder {

        @Override
        public OptionalLong findListeningProcessId(int port) {
            if (!isWindows()) {
                return OptionalLong.empty();
            }

            String script =
                "$owningProcess = Get-NetTCPConnection -LocalPort " + port +
                    " -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess; " +
                    "if ($null -ne $owningProcess) { Write-Output $owningProcess }";

            ProcessBuilder builder = new ProcessBuilder(resolvePowerShellExecutable(), "-NoProfile", "-Command", script);
            try {
                Process process = builder.start();
                if (!process.waitFor(PROCESS_QUERY_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS)) {
                    process.destroyForcibly();
                    return OptionalLong.empty();
                }

                String output = decodePowerShellOutput(process.getInputStream().readAllBytes());
                if (!StringUtils.hasText(output)) {
                    return OptionalLong.empty();
                }
                return OptionalLong.of(Long.parseLong(output));
            } catch (IOException | InterruptedException | NumberFormatException exception) {
                if (exception instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                }
                return OptionalLong.empty();
            }
        }
    }

    private static final class PowerShellProcessSnapshotProvider implements ProcessSnapshotProvider {

        private final ObjectMapper objectMapper = new ObjectMapper();

        @Override
        public Optional<ProcessSnapshot> getProcessSnapshot(long pid) {
            if (!isWindows()) {
                return Optional.empty();
            }

            String script =
                "$process = Get-CimInstance Win32_Process -Filter 'ProcessId = " + pid + "' | Select-Object -First 1; " +
                    "if ($null -ne $process) { " +
                    "[pscustomobject]@{ pid = $process.ProcessId; command = $process.Name; commandLine = $process.CommandLine } | ConvertTo-Json -Compress }";

            ProcessBuilder builder = new ProcessBuilder(resolvePowerShellExecutable(), "-NoProfile", "-Command", script);
            try {
                Process process = builder.start();
                if (!process.waitFor(PROCESS_QUERY_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS)) {
                    process.destroyForcibly();
                    return Optional.empty();
                }

                byte[] stdoutBytes = process.getInputStream().readAllBytes();
                byte[] stderrBytes = process.getErrorStream().readAllBytes();
                String output = decodePowerShellOutput(stdoutBytes);
                String errorOutput = decodePowerShellOutput(stderrBytes);
                if (StringUtils.hasText(errorOutput)) {
                    return Optional.empty();
                }
                if (!StringUtils.hasText(output)) {
                    return Optional.empty();
                }

                JsonNode node = objectMapper.readTree(output);
                return Optional.of(new ProcessSnapshot(
                    node.path("pid").asLong(pid),
                    node.path("command").asText(""),
                    node.path("commandLine").asText("")
                ));
            } catch (IOException | InterruptedException exception) {
                if (exception instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                }
                return Optional.empty();
            }
        }
    }

    private static final class JvmProcessTerminator implements ProcessTerminator {

        @Override
        public boolean terminate(long pid) {
            Optional<ProcessHandle> handle = ProcessHandle.of(pid);
            if (handle.isEmpty()) {
                return false;
            }

            ProcessHandle processHandle = handle.get();
            processHandle.destroy();
            try {
                processHandle.onExit().get(5, TimeUnit.SECONDS);
                return true;
            } catch (Exception ignored) {
                processHandle.destroyForcibly();
                try {
                    processHandle.onExit().get(5, TimeUnit.SECONDS);
                    return true;
                } catch (Exception secondIgnored) {
                    return false;
                }
            }
        }
    }

    private static String decodePowerShellOutput(byte[] bytes) {
        String utf8 = new String(bytes, StandardCharsets.UTF_8).replace("\u0000", "").trim();
        if (StringUtils.hasText(utf8)) {
            return utf8;
        }
        return new String(bytes, StandardCharsets.UTF_16LE).replace("\u0000", "").trim();
    }

    private static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
    }

    private static String resolvePowerShellExecutable() {
        String systemRoot = System.getenv("SystemRoot");
        if (!StringUtils.hasText(systemRoot)) {
            return "powershell.exe";
        }
        return Path.of(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe").toString();
    }
}
