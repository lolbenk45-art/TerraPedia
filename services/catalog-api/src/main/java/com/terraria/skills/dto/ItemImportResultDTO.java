package com.terraria.skills.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Data
public class ItemImportResultDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String source;
    private int total;
    private int created;
    private int updated;
    private int skipped;
    private List<String> errors = new ArrayList<>();
    private List<ItemImportPreviewDTO> toBeCreated = new ArrayList<>();
    private List<ItemImportPreviewDTO> toBeUpdated = new ArrayList<>();
    private List<ItemImportPreviewDTO> toBeSkipped = new ArrayList<>();

    @Data
    public static class ItemImportPreviewDTO implements Serializable {

        private static final long serialVersionUID = 1L;

        private String name;
        private String internalName;
        private String reason;

        public static ItemImportPreviewDTO of(String name, String internalName, String reason) {
            ItemImportPreviewDTO preview = new ItemImportPreviewDTO();
            preview.setName(name);
            preview.setInternalName(internalName);
            preview.setReason(reason);
            return preview;
        }
    }
}
