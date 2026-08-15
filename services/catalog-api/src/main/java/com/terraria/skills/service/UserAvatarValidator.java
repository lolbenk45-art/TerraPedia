package com.terraria.skills.service;

import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Locale;

public final class UserAvatarValidator {

    public static final long MAX_AVATAR_SIZE_BYTES = 2L * 1024L * 1024L;

    private UserAvatarValidator() {
    }

    public static AvatarImage validateAndResolve(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Avatar file is required");
        }
        if (file.getSize() > MAX_AVATAR_SIZE_BYTES) {
            throw new IllegalArgumentException("Avatar file must not exceed 2 MB");
        }

        String contentType = normalizeContentType(file.getContentType());
        if (!isAllowedContentType(contentType)) {
            throw new IllegalArgumentException("Avatar only supports JPEG, PNG, or WebP");
        }

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException exception) {
            throw new IllegalArgumentException("Unable to read avatar file");
        }

        String magicType = detectMagicContentType(bytes);
        if (!isAllowedContentType(magicType) || !contentType.equals(magicType)) {
            throw new IllegalArgumentException("Avatar file type does not match its content");
        }
        if ("image/webp".equals(magicType)) {
            validateWebpStructure(bytes);
        } else if (!canDecodeImage(bytes)) {
            throw new IllegalArgumentException("Avatar image content is invalid");
        }

        return new AvatarImage(magicType, extensionFor(magicType));
    }

    private static String normalizeContentType(String contentType) {
        if (!StringUtils.hasText(contentType)) {
            return "";
        }
        return contentType.trim().toLowerCase(Locale.ROOT);
    }

    private static boolean isAllowedContentType(String contentType) {
        return "image/jpeg".equals(contentType)
            || "image/png".equals(contentType)
            || "image/webp".equals(contentType);
    }

    private static String detectMagicContentType(byte[] header) {
        if (header.length >= 3
            && (header[0] & 0xFF) == 0xFF
            && (header[1] & 0xFF) == 0xD8
            && (header[2] & 0xFF) == 0xFF) {
            return "image/jpeg";
        }
        if (header.length >= 8
            && (header[0] & 0xFF) == 0x89
            && header[1] == 'P'
            && header[2] == 'N'
            && header[3] == 'G'
            && header[4] == '\r'
            && header[5] == '\n'
            && (header[6] & 0xFF) == 0x1A
            && header[7] == '\n') {
            return "image/png";
        }
        if (header.length >= 12
            && header[0] == 'R'
            && header[1] == 'I'
            && header[2] == 'F'
            && header[3] == 'F'
            && header[8] == 'W'
            && header[9] == 'E'
            && header[10] == 'B'
            && header[11] == 'P') {
            return "image/webp";
        }
        return "";
    }

    private static void validateWebpStructure(byte[] bytes) {
        if (bytes.length < 20) {
            throw new IllegalArgumentException("Avatar image content is invalid");
        }
        int riffPayloadSize = littleEndianInt(bytes, 4);
        if (riffPayloadSize < 12 || riffPayloadSize > bytes.length - 8) {
            throw new IllegalArgumentException("Avatar image content is invalid");
        }
        String chunk = new String(bytes, 12, 4, java.nio.charset.StandardCharsets.US_ASCII);
        if (!"VP8 ".equals(chunk) && !"VP8L".equals(chunk) && !"VP8X".equals(chunk)) {
            throw new IllegalArgumentException("Avatar image content is invalid");
        }
        int chunkSize = littleEndianInt(bytes, 16);
        if (chunkSize <= 0 || 20L + chunkSize > bytes.length) {
            throw new IllegalArgumentException("Avatar image content is invalid");
        }
    }

    private static int littleEndianInt(byte[] bytes, int offset) {
        return (bytes[offset] & 0xFF)
            | ((bytes[offset + 1] & 0xFF) << 8)
            | ((bytes[offset + 2] & 0xFF) << 16)
            | ((bytes[offset + 3] & 0xFF) << 24);
    }

    private static String extensionFor(String contentType) {
        return switch (contentType) {
            case "image/jpeg" -> ".jpg";
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            default -> ".bin";
        };
    }

    private static boolean canDecodeImage(byte[] bytes) {
        try {
            return ImageIO.read(new ByteArrayInputStream(bytes)) != null;
        } catch (IOException exception) {
            return false;
        }
    }

    public record AvatarImage(String contentType, String extension) {
    }
}
