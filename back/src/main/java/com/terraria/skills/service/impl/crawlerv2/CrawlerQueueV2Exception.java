package com.terraria.skills.service.impl.crawlerv2;

import org.springframework.http.HttpStatus;

public class CrawlerQueueV2Exception extends RuntimeException {
    private final HttpStatus httpStatus;
    private final CrawlerQueueV2ReasonCode reasonCode;

    public CrawlerQueueV2Exception(HttpStatus httpStatus, CrawlerQueueV2ReasonCode reasonCode) {
        this(httpStatus, reasonCode, reasonCode.messageZh(), null);
    }

    public CrawlerQueueV2Exception(
        HttpStatus httpStatus,
        CrawlerQueueV2ReasonCode reasonCode,
        String message,
        Throwable cause
    ) {
        super(message, cause);
        this.httpStatus = httpStatus;
        this.reasonCode = reasonCode;
    }

    public HttpStatus httpStatus() {
        return httpStatus;
    }

    public CrawlerQueueV2ReasonCode reasonCode() {
        return reasonCode;
    }
}
