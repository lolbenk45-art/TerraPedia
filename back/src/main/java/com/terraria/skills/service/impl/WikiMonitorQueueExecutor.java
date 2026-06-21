package com.terraria.skills.service.impl;

import java.nio.file.Path;

interface WikiMonitorQueueExecutor {

    String lane();

    boolean supports(WikiMonitorQueueItem item);

    WikiMonitorQueueStartResult start(Path repoRoot, WikiMonitorQueueItem item);

    String lockPath(Path repoRoot);

    String progressPath(Path repoRoot, WikiMonitorQueueItem item);

    String reportPath(Path repoRoot, WikiMonitorQueueItem item);
}
