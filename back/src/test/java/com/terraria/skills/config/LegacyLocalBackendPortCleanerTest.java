package com.terraria.skills.config;

import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.OptionalLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class LegacyLocalBackendPortCleanerTest {

    private static final Path REPO_ROOT = Path.of("G:\\ClaudeCode\\TerraPedia-dev");

    @Test
    void shouldTerminateListeningOldTerraPediaBackend() {
        RecordingProcessTerminator terminator = new RecordingProcessTerminator(true);
        LegacyLocalBackendPortCleaner cleaner = new LegacyLocalBackendPortCleaner(
            port -> OptionalLong.of(1234L),
            pid -> Optional.of(new LegacyLocalBackendPortCleaner.ProcessSnapshot(
                pid,
                "C:\\Program Files\\Java\\jdk-21\\bin\\java.exe",
                "\"C:\\Program Files\\Java\\jdk-21\\bin\\java.exe\" -cp G:\\ClaudeCode\\TerraPedia-dev\\back\\target\\classes com.terraria.skills.SkillsBackApplication"
            )),
            terminator,
            () -> 9999L
        );

        cleaner.releaseIfOwnedByOldBackend(8888, REPO_ROOT);

        assertEquals(List.of(1234L), terminator.terminatedPids);
    }

    @Test
    void shouldNotTerminateUnrelatedProcessOccupyingPort() {
        RecordingProcessTerminator terminator = new RecordingProcessTerminator(true);
        LegacyLocalBackendPortCleaner cleaner = new LegacyLocalBackendPortCleaner(
            port -> OptionalLong.of(1234L),
            pid -> Optional.of(new LegacyLocalBackendPortCleaner.ProcessSnapshot(
                pid,
                "C:\\Program Files\\Java\\jdk-21\\bin\\java.exe",
                "\"C:\\Program Files\\Java\\jdk-21\\bin\\java.exe\" -jar C:\\other\\service.jar"
            )),
            terminator,
            () -> 9999L
        );

        cleaner.releaseIfOwnedByOldBackend(8888, REPO_ROOT);

        assertEquals(List.of(), terminator.terminatedPids);
    }

    @Test
    void shouldNotTerminateCurrentProcess() {
        RecordingProcessTerminator terminator = new RecordingProcessTerminator(true);
        LegacyLocalBackendPortCleaner cleaner = new LegacyLocalBackendPortCleaner(
            port -> OptionalLong.of(7777L),
            pid -> Optional.of(new LegacyLocalBackendPortCleaner.ProcessSnapshot(
                pid,
                "C:\\Program Files\\Java\\jdk-21\\bin\\java.exe",
                "\"C:\\Program Files\\Java\\jdk-21\\bin\\java.exe\" -cp G:\\ClaudeCode\\TerraPedia-dev\\back\\target\\classes com.terraria.skills.SkillsBackApplication"
            )),
            terminator,
            () -> 7777L
        );

        cleaner.releaseIfOwnedByOldBackend(8888, REPO_ROOT);

        assertEquals(List.of(), terminator.terminatedPids);
    }

    @Test
    void shouldFailFastWhenOldTerraPediaBackendCannotBeTerminated() {
        LegacyLocalBackendPortCleaner cleaner = new LegacyLocalBackendPortCleaner(
            port -> OptionalLong.of(1234L),
            pid -> Optional.of(new LegacyLocalBackendPortCleaner.ProcessSnapshot(
                pid,
                "C:\\Program Files\\Java\\jdk-21\\bin\\java.exe",
                "\"C:\\Program Files\\Java\\jdk-21\\bin\\java.exe\" -cp G:\\ClaudeCode\\TerraPedia-dev\\back\\target\\classes com.terraria.skills.SkillsBackApplication"
            )),
            new RecordingProcessTerminator(false),
            () -> 9999L
        );

        IllegalStateException error = assertThrows(
            IllegalStateException.class,
            () -> cleaner.releaseIfOwnedByOldBackend(8888, REPO_ROOT)
        );

        assertEquals("Failed to stop old TerraPedia backend process on port 8888", error.getMessage());
    }

    private static final class RecordingProcessTerminator implements LegacyLocalBackendPortCleaner.ProcessTerminator {

        private final boolean terminateResult;
        private final List<Long> terminatedPids = new ArrayList<>();

        private RecordingProcessTerminator(boolean terminateResult) {
            this.terminateResult = terminateResult;
        }

        @Override
        public boolean terminate(long pid) {
            terminatedPids.add(pid);
            return terminateResult;
        }
    }
}
