package com.terraria.skills.service;

public class CrawlerMonitorRedisUnavailableException extends RuntimeException {

    public CrawlerMonitorRedisUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }

    public CrawlerMonitorRedisUnavailableException(String message) {
        super(message);
    }
}
