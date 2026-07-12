package com.terraria.skills.service.impl.crawlerv2;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terraria.skills.config.CrawlerQueueV2Properties;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.Channels;
import java.nio.charset.StandardCharsets;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Stream;

public class CrawlerAttemptArtifactStore {

    private static final Pattern ATTEMPT_ID = Pattern.compile("[A-Za-z0-9._-]+");
    private static final String MANIFEST_FILE = "attempt-manifest.json";
    private static final String PROGRESS_FILE = "progress.json";
    private static final String LOG_FILE = "run.log";
    private static final int MIN_TERMINAL_RETENTION_COUNT = 100;
    private static final Duration MIN_TERMINAL_RETENTION_AGE = Duration.ofDays(7);

    private final ObjectMapper objectMapper;
    private final Path repoRoot;
    private final Clock clock;
    private final CrawlerQueueV2Properties properties;

    public CrawlerAttemptArtifactStore(
        ObjectMapper objectMapper,
        Path repoRoot,
        Clock clock,
        CrawlerQueueV2Properties properties
    ) {
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
        this.repoRoot = Objects.requireNonNull(repoRoot, "repoRoot").toAbsolutePath().normalize();
        this.clock = Objects.requireNonNull(clock, "clock");
        this.properties = Objects.requireNonNull(properties, "properties");
    }

    public synchronized PreparedArtifacts prepare(
        String epoch,
        String queueId,
        String attemptId,
        String domain,
        String actionId,
        Instant requestedAt
    ) {
        requireText(epoch, "epoch");
        requireText(queueId, "queueId");
        requireText(domain, "domain");
        requireText(actionId, "actionId");
        validateAttemptId(attemptId);
        Instant preparedAt = requestedAt == null ? clock.instant() : requestedAt;
        Path directory = attemptDirectory(preparedAt, attemptId);
        requireNoSymbolicLinks(repoRoot, directory);
        if (Files.exists(directory, LinkOption.NOFOLLOW_LINKS) || readManifest(attemptId).isPresent()) {
            throw new IllegalStateException("attempt artifacts 已存在：" + attemptId);
        }

        try {
            Files.createDirectories(directory.getParent());
            requireNoSymbolicLinks(repoRoot, directory.getParent());
            Files.createDirectory(directory);
        } catch (IOException exception) {
            throw artifactFailure("创建 attempt 目录", directory, exception);
        }
        requireNoSymbolicLinks(repoRoot, directory);

        String manifestPath = storedPath(directory.resolve(MANIFEST_FILE));
        String progressPath = storedPath(directory.resolve(PROGRESS_FILE));
        String logPath = storedPath(directory.resolve(LOG_FILE));
        CrawlerAttemptManifest manifest = new CrawlerAttemptManifest(
            2,
            epoch,
            queueId,
            attemptId,
            null,
            domain,
            actionId,
            CrawlerQueueV2Status.QUEUED,
            null,
            null,
            null,
            null,
            progressPath,
            logPath,
            null,
            null,
            null,
            null,
            null,
            null,
            List.of()
        );
        writeManifestAt(directory, manifest);
        return new PreparedArtifacts(directory, manifestPath, progressPath, logPath);
    }

    public Optional<CrawlerAttemptManifest> readManifest(String attemptId) {
        validateAttemptId(attemptId);
        Optional<Path> manifestPath = findManifestPath(attemptId);
        if (manifestPath.isEmpty()) {
            return Optional.empty();
        }
        Path path = manifestPath.orElseThrow();
        Path directory = path.getParent();
        requireNoSymbolicLinks(repoRoot, path);
        try (FileChannel channel = FileChannel.open(
            path,
            StandardOpenOption.READ,
            LinkOption.NOFOLLOW_LINKS
        )) {
            CrawlerAttemptManifest manifest = objectMapper.readValue(
                Channels.newInputStream(channel),
                CrawlerAttemptManifest.class
            );
            if (!attemptId.equals(manifest.attemptId())) {
                throw new IllegalStateException("attempt manifest 身份不匹配：" + attemptId);
            }
            return Optional.of(manifest);
        } catch (IOException exception) {
            throw artifactFailure("读取 attempt manifest", path, exception);
        }
    }

    public synchronized void writeManifest(CrawlerAttemptManifest manifest) {
        Objects.requireNonNull(manifest, "manifest");
        validateAttemptId(manifest.attemptId());
        Path path = findManifestPath(manifest.attemptId())
            .orElseThrow(() -> new IllegalArgumentException("attempt manifest 不存在：" + manifest.attemptId()));
        CrawlerAttemptManifest existing = readManifest(manifest.attemptId()).orElseThrow();
        validateManifestUpdate(existing, manifest);
        writeManifestAt(path.getParent(), manifest);
    }

    public CrawlerAttemptLogMetadata logMetadata(String attemptId, Instant now) {
        Instant observedAt = now == null ? clock.instant() : now;
        CrawlerAttemptManifest manifest = requireManifest(attemptId);
        Path directory = requireAttemptDirectory(attemptId);
        Path logPath;
        try {
            logPath = requireCanonicalLogPath(directory, manifest.logPath());
        } catch (SecurityException | IllegalArgumentException exception) {
            return metadata(
                manifest,
                CrawlerAttemptLogAvailability.FORBIDDEN,
                false,
                null,
                null,
                CrawlerQueueV2ReasonCode.LOG_FORBIDDEN
            );
        }

        boolean expired = manifest.artifactsExpiredAt() != null || manifest.cleanedAt() != null;
        if (expired) {
            return metadata(
                manifest,
                CrawlerAttemptLogAvailability.EXPIRED,
                false,
                null,
                null,
                CrawlerQueueV2ReasonCode.LOG_EXPIRED
            );
        }
        if (!Files.exists(logPath, LinkOption.NOFOLLOW_LINKS)) {
            CrawlerAttemptLogAvailability availability = isPastRetention(manifest, observedAt)
                ? CrawlerAttemptLogAvailability.EXPIRED
                : CrawlerAttemptLogAvailability.MISSING;
            CrawlerQueueV2ReasonCode reasonCode = availability == CrawlerAttemptLogAvailability.EXPIRED
                ? CrawlerQueueV2ReasonCode.LOG_EXPIRED
                : CrawlerQueueV2ReasonCode.LOG_MISSING;
            return metadata(manifest, availability, false, null, null, reasonCode);
        }
        requireNoSymbolicLinks(repoRoot, logPath);
        try {
            BasicFileAttributes attributes = Files.readAttributes(
                logPath,
                BasicFileAttributes.class,
                LinkOption.NOFOLLOW_LINKS
            );
            if (!attributes.isRegularFile()) {
                return metadata(
                    manifest,
                    CrawlerAttemptLogAvailability.FORBIDDEN,
                    false,
                    null,
                    null,
                    CrawlerQueueV2ReasonCode.LOG_FORBIDDEN
                );
            }
            long size = attributes.size();
            Instant lastWriteAt = attributes.lastModifiedTime().toInstant();
            if (size == 0) {
                return metadata(
                    manifest,
                    CrawlerAttemptLogAvailability.EMPTY,
                    false,
                    0L,
                    lastWriteAt,
                    CrawlerQueueV2ReasonCode.LOG_EMPTY
                );
            }
            return metadata(
                manifest,
                CrawlerAttemptLogAvailability.AVAILABLE,
                true,
                size,
                lastWriteAt,
                null
            );
        } catch (IOException exception) {
            throw artifactFailure("读取 attempt 日志元数据", logPath, exception);
        }
    }

    public LogChunk readLog(String attemptId, long offset, int maxBytes, Instant now) {
        if (offset < 0 || maxBytes <= 0) {
            throw new IllegalArgumentException("日志 offset/maxBytes 无效");
        }
        CrawlerAttemptLogMetadata metadata = logMetadata(attemptId, now);
        if (metadata.availability() == CrawlerAttemptLogAvailability.FORBIDDEN) {
            throw new SecurityException("attempt 日志路径不允许读取：" + attemptId);
        }
        if (metadata.availability() == CrawlerAttemptLogAvailability.MISSING
            || metadata.availability() == CrawlerAttemptLogAvailability.EXPIRED) {
            throw new IllegalStateException("attempt 日志不可用：" + metadata.availability().value());
        }
        if (metadata.availability() == CrawlerAttemptLogAvailability.EMPTY) {
            if (offset != 0) {
                throw new IllegalArgumentException("日志 offset 超过文件大小");
            }
            return new LogChunk(0, 0, "", false);
        }

        CrawlerAttemptManifest manifest = requireManifest(attemptId);
        Path directory = requireAttemptDirectory(attemptId);
        Path logPath = requireCanonicalLogPath(directory, manifest.logPath());
        long size = metadata.sizeBytes();
        if (offset > size) {
            throw new IllegalArgumentException("日志 offset 超过文件大小");
        }
        int nominalBytes = (int) Math.min((long) maxBytes, size - offset);
        int requestedBytes = (int) Math.min((long) maxBytes + 3L, size - offset);
        ByteBuffer buffer = ByteBuffer.allocate(requestedBytes);
        try (FileChannel channel = FileChannel.open(
            logPath,
            StandardOpenOption.READ,
            LinkOption.NOFOLLOW_LINKS
        )) {
            channel.position(offset);
            while (buffer.hasRemaining() && channel.read(buffer) >= 0) {
                // Continue until the requested bounded chunk is full or EOF is reached.
            }
        } catch (IOException exception) {
            throw artifactFailure("读取 attempt 日志", logPath, exception);
        }
        buffer.flip();
        byte[] bytes = new byte[buffer.remaining()];
        buffer.get(bytes);
        int safeLength = completeUtf8Length(bytes, nominalBytes);
        long nextOffset = offset + safeLength;
        return new LogChunk(
            offset,
            nextOffset,
            new String(bytes, 0, safeLength, StandardCharsets.UTF_8),
            nextOffset < size
        );
    }

    public synchronized CleanupResult cleanupArtifacts(
        String attemptId,
        CrawlerQueueV2Status status,
        String operator,
        Instant now
    ) {
        if (status == null || !status.terminal()) {
            throw new IllegalArgumentException("只有终态 attempt 可以清理证据");
        }
        requireText(operator, "operator");
        Instant cleanedAt = now == null ? clock.instant() : now;
        CrawlerAttemptManifest manifest = requireManifest(attemptId);
        if (manifest.status() == null || !manifest.status().terminal() || manifest.status() != status) {
            throw new IllegalArgumentException("attempt manifest 不是匹配的终态：" + attemptId);
        }
        if (manifest.cleanedAt() != null || manifest.artifactsExpiredAt() != null) {
            throw new IllegalStateException("attempt 证据已经清理或过期：" + attemptId);
        }
        Path directory = requireAttemptDirectory(attemptId);
        StagedDeletion staged = stageEvidenceDeletion(directory, manifest);
        CrawlerAttemptManifest cleanedManifest = new CrawlerAttemptManifest(
            manifest.contractVersion(), manifest.stateStoreEpoch(), manifest.queueId(), manifest.attemptId(),
            manifest.fenceToken(), manifest.domain(), manifest.actionId(), status, manifest.startedAt(),
            manifest.completedAt(), manifest.reasonCode(), manifest.exitCode(), manifest.progressPath(),
            manifest.logPath(), manifest.reportPath(), manifest.outputPath(), manifest.retentionExpiresAt(),
            manifest.artifactsExpiredAt(), cleanedAt, operator, staged.storedPaths()
        );
        commitStagedDeletion(directory, cleanedManifest, staged);
        return new CleanupResult(staged.storedPaths());
    }

    public synchronized void expireArtifacts(String attemptId, Instant now) {
        Instant expiredAt = now == null ? clock.instant() : now;
        CrawlerAttemptManifest manifest = requireManifest(attemptId);
        if (manifest.status() == null || !manifest.status().terminal()) {
            throw new IllegalArgumentException("只有终态 attempt 可以过期证据：" + attemptId);
        }
        if (manifest.artifactsExpiredAt() != null || manifest.cleanedAt() != null) {
            return;
        }
        Path directory = requireAttemptDirectory(attemptId);
        StagedDeletion staged = stageEvidenceDeletion(directory, manifest);
        CrawlerAttemptManifest expiredManifest = new CrawlerAttemptManifest(
            manifest.contractVersion(), manifest.stateStoreEpoch(), manifest.queueId(), manifest.attemptId(),
            manifest.fenceToken(), manifest.domain(), manifest.actionId(), manifest.status(), manifest.startedAt(),
            manifest.completedAt(), manifest.reasonCode(), manifest.exitCode(), manifest.progressPath(),
            manifest.logPath(), manifest.reportPath(), manifest.outputPath(), manifest.retentionExpiresAt(),
            expiredAt, manifest.cleanedAt(), manifest.cleanedBy(), manifest.cleanedPaths()
        );
        commitStagedDeletion(directory, expiredManifest, staged);
    }

    public synchronized RetentionResult applyRetention(List<CrawlerQueueV2Attempt> attempts, Instant now) {
        Instant observedAt = now == null ? clock.instant() : now;
        List<CrawlerQueueV2Attempt> safeAttempts = attempts == null ? List.of() : List.copyOf(attempts);
        Set<String> uniqueAttemptIds = new LinkedHashSet<>();
        for (CrawlerQueueV2Attempt attempt : safeAttempts) {
            if (attempt == null || attempt.status() == null || !uniqueAttemptIds.add(attempt.attemptId())) {
                throw new IllegalArgumentException("retention attempt 身份无效或重复");
            }
        }
        List<CrawlerQueueV2Attempt> terminalAttempts = safeAttempts.stream()
            .filter(attempt -> attempt.status().terminal())
            .toList();
        Set<String> retainedTerminalIds = new LinkedHashSet<>();
        terminalAttempts.stream()
            .filter(attempt -> attempt.completedAt() == null)
            .map(CrawlerQueueV2Attempt::attemptId)
            .forEach(retainedTerminalIds::add);
        terminalAttempts.stream()
            .filter(attempt -> attempt.completedAt() != null)
            .sorted(Comparator.comparing(CrawlerQueueV2Attempt::completedAt).reversed()
                .thenComparing(CrawlerQueueV2Attempt::attemptId))
            .limit(effectiveTerminalRetentionCount())
            .map(CrawlerQueueV2Attempt::attemptId)
            .forEach(retainedTerminalIds::add);
        Instant cutoff = observedAt.minus(effectiveTerminalRetentionAge());
        terminalAttempts.stream()
            .filter(attempt -> attempt.completedAt() != null && !attempt.completedAt().isBefore(cutoff))
            .map(CrawlerQueueV2Attempt::attemptId)
            .forEach(retainedTerminalIds::add);

        List<RetentionWork> workItems = new ArrayList<>();
        for (CrawlerQueueV2Attempt attempt : safeAttempts) {
            CrawlerAttemptManifest manifest = requireManifest(attempt.attemptId());
            CrawlerAttemptManifest updatedManifest = manifestForAttempt(manifest, attempt);
            validateManifestUpdate(manifest, updatedManifest);
            boolean expire = attempt.status().terminal()
                && !retainedTerminalIds.contains(attempt.attemptId());
            if (expire) {
                preflightEvidenceDeletion(requireAttemptDirectory(attempt.attemptId()), manifest);
            }
            workItems.add(new RetentionWork(attempt, updatedManifest, expire));
        }

        List<String> retainedAttemptIds = new ArrayList<>();
        List<String> expiredAttemptIds = new ArrayList<>();
        for (RetentionWork work : workItems) {
            writeManifest(work.updatedManifest());
            if (!work.expire()) {
                retainedAttemptIds.add(work.attempt().attemptId());
                continue;
            }
            expireArtifacts(work.attempt().attemptId(), observedAt);
            expiredAttemptIds.add(work.attempt().attemptId());
        }
        return new RetentionResult(retainedAttemptIds, expiredAttemptIds);
    }

    private CrawlerAttemptManifest manifestForAttempt(
        CrawlerAttemptManifest manifest,
        CrawlerQueueV2Attempt attempt
    ) {
        Instant retentionExpiresAt = attempt.completedAt() == null
            ? null
            : attempt.completedAt().plus(effectiveTerminalRetentionAge());
        return new CrawlerAttemptManifest(
            manifest.contractVersion(), attempt.stateStoreEpoch(), attempt.queueId(), attempt.attemptId(),
            attempt.fenceToken(), attempt.domain(), attempt.actionId(), attempt.status(), attempt.startedAt(),
            attempt.completedAt(), attempt.reasonCode(), manifest.exitCode(), manifest.progressPath(),
            manifest.logPath(), manifest.reportPath(), manifest.outputPath(), retentionExpiresAt,
            manifest.artifactsExpiredAt(), manifest.cleanedAt(), manifest.cleanedBy(), manifest.cleanedPaths()
        );
    }

    private StagedDeletion stageEvidenceDeletion(Path directory, CrawlerAttemptManifest manifest) {
        EvidenceTargets targets = preflightEvidenceDeletion(directory, manifest);
        List<String> storedPathList = targets.storedPaths();
        List<Path> paths = targets.paths();

        List<StagedPath> stagedPaths = new ArrayList<>();
        for (int index = 0; index < paths.size(); index++) {
            Path path = paths.get(index);
            if (!Files.exists(path, LinkOption.NOFOLLOW_LINKS)) {
                continue;
            }
            Path stagedPath = path.resolveSibling(
                path.getFileName() + ".cleanup-" + UUID.randomUUID() + ".tmp"
            );
            try {
                moveReplacing(path, stagedPath);
                stagedPaths.add(new StagedPath(storedPathList.get(index), path, stagedPath));
            } catch (IOException exception) {
                rollbackStagedDeletion(stagedPaths, exception);
                throw artifactFailure("暂存 attempt 证据清理", path, exception);
            }
        }
        return new StagedDeletion(
            stagedPaths.stream().map(StagedPath::storedPath).toList(),
            List.copyOf(stagedPaths)
        );
    }

    private EvidenceTargets preflightEvidenceDeletion(
        Path directory,
        CrawlerAttemptManifest manifest
    ) {
        List<String> storedPaths = new ArrayList<>();
        storedPaths.add(manifest.progressPath());
        storedPaths.add(manifest.logPath());
        addStoredPath(storedPaths, manifest.reportPath());
        addStoredPath(storedPaths, manifest.outputPath());
        if (storedPaths.get(0) == null || storedPaths.get(0).isBlank()
            || storedPaths.get(1) == null || storedPaths.get(1).isBlank()) {
            throw new IllegalStateException("attempt progress/log path 不能为空");
        }
        if (new LinkedHashSet<>(storedPaths).size() != storedPaths.size()) {
            throw new IllegalStateException("attempt artifact path 角色不能复用同一路径");
        }

        List<Path> paths = storedPaths.stream()
            .map(path -> requireInsideAttempt(directory, path))
            .toList();
        Path expectedProgress = directory.resolve(PROGRESS_FILE).toAbsolutePath().normalize();
        Path expectedLog = directory.resolve(LOG_FILE).toAbsolutePath().normalize();
        if (!paths.get(0).equals(expectedProgress) || !paths.get(1).equals(expectedLog)) {
            throw new IllegalStateException("attempt progress/log path 角色不匹配");
        }
        if (new LinkedHashSet<>(paths).size() != paths.size()) {
            throw new IllegalStateException("attempt artifact path 解析后发生别名冲突");
        }
        Path manifestPath = directory.resolve(MANIFEST_FILE).toAbsolutePath().normalize();
        for (Path path : paths) {
            String fileName = path.getFileName().toString();
            if (path.equals(manifestPath)
                || fileName.endsWith(".tmp")
                || fileName.contains(".cleanup-")) {
                throw new IllegalStateException("attempt artifact 使用了保留文件名：" + fileName);
            }
            if (Files.exists(path, LinkOption.NOFOLLOW_LINKS)) {
                try {
                    BasicFileAttributes attributes = Files.readAttributes(
                        path,
                        BasicFileAttributes.class,
                        LinkOption.NOFOLLOW_LINKS
                    );
                    if (!attributes.isRegularFile()) {
                        throw new IllegalStateException("attempt 证据不是普通文件：" + path);
                    }
                } catch (IOException exception) {
                    throw artifactFailure("预检 attempt 证据", path, exception);
                }
            }
        }
        return new EvidenceTargets(storedPaths, paths);
    }

    private void commitStagedDeletion(
        Path directory,
        CrawlerAttemptManifest updated,
        StagedDeletion staged
    ) {
        try {
            writeManifestAt(directory, updated);
        } catch (RuntimeException exception) {
            rollbackStagedDeletion(staged.paths(), exception);
            throw exception;
        }
        IllegalStateException deletionFailure = null;
        for (StagedPath path : staged.paths()) {
            try {
                Files.deleteIfExists(path.stagedPath());
            } catch (IOException exception) {
                if (deletionFailure == null) {
                    deletionFailure = artifactFailure(
                        "删除已审计的 attempt 证据",
                        path.stagedPath(),
                        exception
                    );
                } else {
                    deletionFailure.addSuppressed(exception);
                }
            }
        }
        if (deletionFailure != null) {
            throw deletionFailure;
        }
    }

    private void rollbackStagedDeletion(List<StagedPath> stagedPaths, Throwable originalFailure) {
        for (int index = stagedPaths.size() - 1; index >= 0; index--) {
            StagedPath path = stagedPaths.get(index);
            try {
                moveReplacing(path.stagedPath(), path.originalPath());
            } catch (IOException rollbackFailure) {
                originalFailure.addSuppressed(rollbackFailure);
            }
        }
    }

    private void moveReplacing(Path source, Path destination) throws IOException {
        try {
            Files.move(
                source,
                destination,
                StandardCopyOption.ATOMIC_MOVE,
                StandardCopyOption.REPLACE_EXISTING
            );
        } catch (AtomicMoveNotSupportedException unsupported) {
            Files.move(source, destination, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private void addStoredPath(List<String> storedPaths, String path) {
        if (path != null && !path.isBlank()) {
            storedPaths.add(path);
        }
    }

    private CrawlerAttemptLogMetadata metadata(
        CrawlerAttemptManifest manifest,
        CrawlerAttemptLogAvailability availability,
        boolean previewable,
        Long sizeBytes,
        Instant lastWriteAt,
        CrawlerQueueV2ReasonCode reasonCode
    ) {
        return new CrawlerAttemptLogMetadata(
            manifest.attemptId(),
            manifest.logPath(),
            availability,
            previewable,
            sizeBytes,
            lastWriteAt,
            manifest.retentionExpiresAt(),
            reasonCode
        );
    }

    private boolean isPastRetention(CrawlerAttemptManifest manifest, Instant now) {
        return manifest.status() != null
            && manifest.status().terminal()
            && manifest.retentionExpiresAt() != null
            && !now.isBefore(manifest.retentionExpiresAt());
    }

    private int completeUtf8Length(byte[] bytes, int nominalLength) {
        for (int length = nominalLength; length <= bytes.length; length++) {
            if (isValidUtf8(bytes, length)) {
                return length;
            }
        }
        throw new IllegalArgumentException("日志 offset 不在 UTF-8 字符边界或日志内容不是 UTF-8");
    }

    private boolean isValidUtf8(byte[] bytes, int length) {
        try {
            StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes, 0, length));
            return true;
        } catch (CharacterCodingException exception) {
            return false;
        }
    }

    private int effectiveTerminalRetentionCount() {
        return Math.max(MIN_TERMINAL_RETENTION_COUNT, properties.getTerminalRetentionCount());
    }

    private Duration effectiveTerminalRetentionAge() {
        Duration configured = properties.getTerminalRetentionAge();
        if (configured == null || configured.compareTo(MIN_TERMINAL_RETENTION_AGE) < 0) {
            return MIN_TERMINAL_RETENTION_AGE;
        }
        return configured;
    }

    private void validateManifestUpdate(
        CrawlerAttemptManifest existing,
        CrawlerAttemptManifest updated
    ) {
        if (existing.contractVersion() != updated.contractVersion()
            || !Objects.equals(existing.stateStoreEpoch(), updated.stateStoreEpoch())
            || !Objects.equals(existing.queueId(), updated.queueId())
            || !Objects.equals(existing.attemptId(), updated.attemptId())
            || !Objects.equals(existing.domain(), updated.domain())
            || !Objects.equals(existing.actionId(), updated.actionId())) {
            throw new IllegalArgumentException("attempt manifest 不可变身份发生漂移：" + existing.attemptId());
        }
        Long existingFence = existing.fenceToken();
        Long updatedFence = updated.fenceToken();
        if (updatedFence != null && updatedFence <= 0) {
            throw new IllegalArgumentException("attempt manifest fenceToken 必须为正数");
        }
        if (existingFence != null && !Objects.equals(existingFence, updatedFence)) {
            throw new IllegalArgumentException("attempt manifest fenceToken 不允许变化");
        }
    }

    private CrawlerAttemptManifest requireManifest(String attemptId) {
        return readManifest(attemptId)
            .orElseThrow(() -> new IllegalArgumentException("attempt manifest 不存在：" + attemptId));
    }

    private Path requireAttemptDirectory(String attemptId) {
        return findManifestPath(attemptId)
            .orElseThrow(() -> new IllegalArgumentException("attempt manifest 不存在：" + attemptId))
            .getParent();
    }

    private Optional<Path> findManifestPath(String attemptId) {
        validateAttemptId(attemptId);
        Path root = v2Root();
        if (!Files.isDirectory(root, LinkOption.NOFOLLOW_LINKS)) {
            return Optional.empty();
        }
        requireNoSymbolicLinks(repoRoot, root);
        try (Stream<Path> paths = Files.find(
            root,
            3,
            (path, attributes) -> attributes.isRegularFile()
                && MANIFEST_FILE.equals(path.getFileName().toString())
                && path.getParent() != null
                && attemptId.equals(path.getParent().getFileName().toString())
        )) {
            List<Path> matches = paths.limit(2).toList();
            if (matches.size() > 1) {
                throw new IllegalStateException("attemptId 对应多个 artifact 目录：" + attemptId);
            }
            return matches.stream().findFirst();
        } catch (IOException exception) {
            throw artifactFailure("查找 attempt manifest", root, exception);
        }
    }

    private void writeManifestAt(Path directory, CrawlerAttemptManifest manifest) {
        if (!directory.getFileName().toString().equals(manifest.attemptId())) {
            throw new IllegalArgumentException("attempt manifest 目录身份不匹配");
        }
        Path path = directory.resolve(MANIFEST_FILE).toAbsolutePath().normalize();
        if (!path.startsWith(directory.toAbsolutePath().normalize())) {
            throw new SecurityException("manifest path escapes attempt directory");
        }
        requireNoSymbolicLinks(repoRoot, path);
        Path temp = path.resolveSibling(path.getFileName() + "." + UUID.randomUUID() + ".tmp");
        try {
            objectMapper.writeValue(temp.toFile(), manifest);
            try {
                Files.move(
                    temp,
                    path,
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING
                );
            } catch (AtomicMoveNotSupportedException unsupported) {
                Files.move(temp, path, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException exception) {
            throw artifactFailure("写入 attempt manifest", path, exception);
        } finally {
            try {
                Files.deleteIfExists(temp);
            } catch (IOException ignored) {
                // Preserve the original write failure; stale temp files remain visible to diagnostics.
            }
        }
    }

    private Path requireInsideAttempt(Path directory, String storedPath) {
        if (storedPath == null || storedPath.isBlank()) {
            throw new IllegalArgumentException("artifact path 为空");
        }
        Path normalizedDirectory = directory.toAbsolutePath().normalize();
        Path resolved = repoRoot.resolve(storedPath).toAbsolutePath().normalize();
        if (!normalizedDirectory.startsWith(v2Root()) || !resolved.startsWith(normalizedDirectory)) {
            throw new SecurityException("artifact path escapes attempt directory");
        }
        requireNoSymbolicLinks(repoRoot, resolved);
        return resolved;
    }

    private Path requireCanonicalLogPath(Path directory, String storedPath) {
        Path resolved = requireInsideAttempt(directory, storedPath);
        Path expected = directory.resolve(LOG_FILE).toAbsolutePath().normalize();
        if (!resolved.equals(expected)) {
            throw new SecurityException("attempt log path role mismatch");
        }
        return resolved;
    }

    private void requireNoSymbolicLinks(Path directory, Path target) {
        Path normalizedDirectory = directory.toAbsolutePath().normalize();
        Path normalizedTarget = target.toAbsolutePath().normalize();
        if (!normalizedTarget.startsWith(normalizedDirectory)) {
            throw new SecurityException("artifact path escapes attempt directory");
        }
        if (Files.isSymbolicLink(normalizedDirectory)) {
            throw new SecurityException("attempt directory cannot be a symbolic link");
        }
        Path current = normalizedDirectory;
        for (Path component : normalizedDirectory.relativize(normalizedTarget)) {
            current = current.resolve(component);
            if (Files.isSymbolicLink(current)) {
                throw new SecurityException("artifact path cannot contain symbolic links");
            }
        }
    }

    private Path attemptDirectory(Instant requestedAt, String attemptId) {
        validateAttemptId(attemptId);
        return v2Root()
            .resolve(DateTimeFormatter.ISO_LOCAL_DATE.withZone(ZoneOffset.UTC).format(requestedAt))
            .resolve(attemptId)
            .normalize();
    }

    private Path v2Root() {
        return repoRoot.resolve("reports/crawler-monitor/v2").toAbsolutePath().normalize();
    }

    private String storedPath(Path path) {
        Path normalized = path.toAbsolutePath().normalize();
        if (!normalized.startsWith(repoRoot)) {
            throw new SecurityException("artifact path escapes repository root");
        }
        return repoRoot.relativize(normalized).toString().replace('\\', '/');
    }

    private void validateAttemptId(String attemptId) {
        if (attemptId == null || !ATTEMPT_ID.matcher(attemptId).matches()) {
            throw new IllegalArgumentException("非法 attemptId：" + attemptId);
        }
    }

    private void requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " 不能为空");
        }
    }

    private IllegalStateException artifactFailure(String operation, Path path, IOException cause) {
        return new IllegalStateException(operation + "失败：" + path, cause);
    }

    public record PreparedArtifacts(
        Path directory,
        String manifestPath,
        String progressPath,
        String logPath
    ) {}

    public record LogChunk(
        long offset,
        long nextOffset,
        String content,
        boolean truncated
    ) {}

    public record CleanupResult(List<String> deletedPaths) {
        public CleanupResult {
            deletedPaths = List.copyOf(deletedPaths);
        }
    }

    public record RetentionResult(
        List<String> retainedAttemptIds,
        List<String> expiredAttemptIds
    ) {
        public RetentionResult {
            retainedAttemptIds = List.copyOf(retainedAttemptIds);
            expiredAttemptIds = List.copyOf(expiredAttemptIds);
        }
    }

    private record StagedDeletion(List<String> storedPaths, List<StagedPath> paths) {
        private StagedDeletion {
            storedPaths = List.copyOf(storedPaths);
            paths = List.copyOf(paths);
        }
    }

    private record StagedPath(String storedPath, Path originalPath, Path stagedPath) {}

    private record EvidenceTargets(List<String> storedPaths, List<Path> paths) {
        private EvidenceTargets {
            storedPaths = List.copyOf(storedPaths);
            paths = List.copyOf(paths);
        }
    }

    private record RetentionWork(
        CrawlerQueueV2Attempt attempt,
        CrawlerAttemptManifest updatedManifest,
        boolean expire
    ) {}
}
