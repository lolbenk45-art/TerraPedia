package com.terraria.skills.dto;

import lombok.Builder;
import lombok.Value;

import java.io.InputStream;

@Value
@Builder
public class StoredObjectDTO {

    InputStream inputStream;
    String contentType;
    long size;
}
