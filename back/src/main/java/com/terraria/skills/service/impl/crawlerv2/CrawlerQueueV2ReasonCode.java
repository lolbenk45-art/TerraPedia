package com.terraria.skills.service.impl.crawlerv2;

public enum CrawlerQueueV2ReasonCode {
    CUTOVER_NOT_ENABLED("V2 切换入口未在当前环境启用。", "设置 TERRAPEDIA_CRAWLER_QUEUE_V2_CUTOVER_ALLOWED=true 后重新启动并复核维护窗口。"),
    CUTOVER_ROLLBACK_FORBIDDEN("V2 已发生真实写入或首次写入结果无法排除，禁止恢复 V1 实时调度。", "进入维护只读并修复或前滚 V2；不要让 V1 mirror 接管当前状态。"),
    LEGACY_CUTOVER("V1 活动记录已在硬切换时中断并归档。", "从历史重新执行会创建全新的 V2 任务。"),
    LEGACY_PROCESS_UNCONFIRMED("无法确认 V1 运行进程已经退出，V2 切换已中止。", "检查清单中的 PID 和启动时间，确认进程退出后重新执行切换。"),
    STATE_STORE_UNAVAILABLE("V2 状态存储不可用，写操作已关闭。", "恢复 Redis 后刷新页面；不要回退到 V1 队列。"),
    SSE_SUBSCRIBER_LIMIT("Crawler SSE 订阅数已达到安全上限。", "关闭不再使用的管理端页面后重试；不要通过重复连接绕过上限。"),
    STATE_STORE_RESET("V2 状态空间或 epoch 已重置，旧任务不会恢复为实时任务。", "检查中断历史并按需创建新的 V2 任务。"),
    FIRST_MUTATION_OUTCOME_UNCERTAIN("首次 V2 写入已经预留，但 Redis 结果无法确认，系统已进入维护只读。", "核对 Redis 首次写入证据；若无法确认，执行显式新 epoch 前滚恢复，禁止回退 V1。"),
    ORPHAN_PROCESS_UNCONFIRMED("无法确认旧 V2 进程已经退出，相关域正在安全隔离。", "等待隔离到期或确认旧进程退出后再重试。"),
    DEDUPED_ACTIVE_ATTEMPT("相同任务已有活动 attempt，本次请求未重复创建。", "打开返回的 attempt 查看当前状态。"),
    OWNERSHIP_CONFLICT("任务覆盖的域已被另一个 V2 attempt 占用。", "查看占用 attempt 和 lease 到期时间。"),
    STALE_STATE_VERSION("页面状态版本已过期，控制命令未执行。", "刷新 overview 后基于最新 allowedActions 重试。"),
    STALE_FENCE_TOKEN("旧进程或旧 writer 的写入已被 fencing 拒绝。", "查看被拒绝的 attempt 身份；不要覆盖当前 attempt。"),
    RECONCILER_STALE("后台收敛器超过 15 秒没有完成健康扫描。", "检查后端线程和 Redis；页面中的 overdue 数量仍需处理。"),
    QUEUE_WAIT_TIMEOUT("任务排队超过允许时间，已标记超时。", "确认占用和调度健康后重新排队。"),
    ATTEMPT_START_FAILED("任务取得执行权后未能启动进程。", "查看 attempt 身份与启动配置；修复后重新排队。"),
    START_HEARTBEAT_MISSING("任务启动后未按时写入首个心跳。", "查看启动日志和进程身份，等待自动收敛。"),
    HEARTBEAT_TIMEOUT("任务超过 90 秒没有更新心跳，已进入异常收敛。", "查看日志；若进程仍存在，请等待自动终止或执行强制回收。"),
    LEASE_RENEW_FAILED("任务未能完整续租全部 covered domains。", "检查 Redis 和域占用；系统会阻止并发新任务。"),
    PROCESS_EXIT_NONZERO("子进程以非零退出码结束。", "查看 attempt 日志和退出码后重试。"),
    PROCESS_EXIT_CODE_UNAVAILABLE("恢复接管的子进程已退出，但原始退出码不可获得。", "查看 attempt 日志和进度证据后重试。"),
    PROCESS_TERMINATION_UNCONFIRMED("取消后仍无法确认子进程退出。", "在隔离到期前不要启动同域任务，并人工核对 PID。"),
    PAUSE_ACK_TIMEOUT("暂停请求未在期限内得到进程确认。", "查看进程状态，必要时取消任务。"),
    PAUSE_EXPIRED("任务暂停时间超过上限，系统已进入取消流程。", "等待取消收敛或检查进程退出状态。"),
    RETRY_WINDOW_EXPIRED("重试任务在可执行后仍未及时启动。", "检查调度健康和域租约后重新重试。"),
    LOG_EMPTY("日志文件存在但没有内容。", "等待活动任务继续写入或检查进程是否真正启动。"),
    LOG_MISSING("本次 attempt 没有形成可读日志。", "查看 manifest 和进程启动错误。"),
    LOG_EXPIRED("日志已按统一保留策略清理。", "使用保留的 manifest 查看运行身份和终态。"),
    ATTEMPT_ARTIFACT_UNAVAILABLE("V2 attempt 日志证据不可读取，未被误判为缺失。", "检查 attempt manifest、目录完整性、符号链接和磁盘 I/O；修复后刷新日志。"),
    LOG_FORBIDDEN("日志路径不在允许的 attempt 目录内。", "使用 attemptId 重新请求日志，不要提交任意路径。");

    private final String messageZh;
    private final String suggestedAction;

    CrawlerQueueV2ReasonCode(String messageZh, String suggestedAction) {
        this.messageZh = messageZh;
        this.suggestedAction = suggestedAction;
    }

    public String messageZh() {
        return messageZh;
    }

    public String suggestedAction() {
        return suggestedAction;
    }
}
