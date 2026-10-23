package com.terraria.skills.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class PcVersionUpdateHandlingRequestDTO {

    @NotBlank(message = "handling status is required")
    private String handlingStatus;

    @NotNull(message = "expected state revision is required")
    private Long expectedStateRevision;

    @Size(max = 300, message = "handling note is too long")
    private String note;
}
