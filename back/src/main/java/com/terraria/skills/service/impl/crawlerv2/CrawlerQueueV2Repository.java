package com.terraria.skills.service.impl.crawlerv2;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

public interface CrawlerQueueV2Repository {

    EngineState readEngineState();

    String requireEpoch();

    EnqueueResult createQueue(CreateQueueCommand command);

    Optional<CrawlerQueueV2Queue> findQueue(String queueId);

    Optional<CrawlerQueueV2Attempt> findAttempt(String attemptId);

    record EngineState(
        CrawlerQueueEngineMode mode,
        String stateStoreEpoch,
        String activeCutoverId,
        String firstLiveMutationAt
    ) {}

    record CreateQueueCommand(
        String expectedEpoch,
        CrawlerQueueV2Queue queue,
        CrawlerQueueV2Attempt attempt,
        long readyScore,
        Duration dedupeTtl,
        CrawlerQueueV2Event event
    ) {}

    enum EnqueueCode {
        CREATED,
        DEDUPED
    }

    record EnqueueResult(
        EnqueueCode code,
        String queueId,
        String attemptId,
        long stateVersion,
        CrawlerQueueV2ReasonCode reasonCode,
        Instant firstLiveMutationAt
    ) {}
}
