package com.terraria.skills.common;

import lombok.Data;

import java.io.Serializable;

@Data
public class Pagination implements Serializable {

    private static final long serialVersionUID = 1L;

    private long total;
    private int page;
    private int limit;
    private int size;
    private int totalPages;

    public Pagination() {
    }

    public Pagination(long total, int page, int limit) {
        this.total = total;
        this.page = page;
        this.limit = limit;
        this.size = limit;
        this.totalPages = (int) Math.ceil((double) total / limit);
    }
}
