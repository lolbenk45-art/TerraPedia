package com.terraria.skills.service;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class UserAvatarValidatorTest {

    @Test
    void shouldRejectSvgEvenWhenContentTypeIsForged() {
        MockMultipartFile file = new MockMultipartFile(
            "file",
            "avatar.png",
            "image/png",
            "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>".getBytes()
        );

        assertThrows(IllegalArgumentException.class, () -> UserAvatarValidator.validateAndResolve(file));
    }

    @Test
    void shouldRejectEmptyAvatarFile() {
        MockMultipartFile file = new MockMultipartFile("file", "avatar.png", "image/png", new byte[0]);

        assertThrows(IllegalArgumentException.class, () -> UserAvatarValidator.validateAndResolve(file));
    }

    @Test
    void shouldRejectAvatarLargerThanTwoMb() {
        MockMultipartFile file = new MockMultipartFile(
            "file",
            "avatar.png",
            "image/png",
            new byte[(int) UserAvatarValidator.MAX_AVATAR_SIZE_BYTES + 1]
        );

        assertThrows(IllegalArgumentException.class, () -> UserAvatarValidator.validateAndResolve(file));
    }

    @Test
    void shouldRejectPngBytesWithWrongContentType() {
        MockMultipartFile file = new MockMultipartFile(
            "file",
            "avatar.png",
            "image/svg+xml",
            onePixelPng()
        );

        assertThrows(IllegalArgumentException.class, () -> UserAvatarValidator.validateAndResolve(file));
    }

    @Test
    void shouldAcceptValidPngWithPngContentType() {
        MockMultipartFile file = new MockMultipartFile("file", "avatar.png", "image/png", onePixelPng());

        assertDoesNotThrow(() -> UserAvatarValidator.validateAndResolve(file));
    }

    @Test
    void shouldAcceptValidJpegWithJpegContentType() {
        MockMultipartFile file = new MockMultipartFile("file", "avatar.jpg", "image/jpeg", onePixelJpeg());

        assertDoesNotThrow(() -> UserAvatarValidator.validateAndResolve(file));
    }

    @Test
    void shouldRejectHeaderOnlyWebpPayload() {
        byte[] bytes = new byte[] {
            'R', 'I', 'F', 'F',
            12, 0, 0, 0,
            'W', 'E', 'B', 'P',
            'V', 'P', '8', ' ',
            0, 0, 0, 0
        };
        MockMultipartFile file = new MockMultipartFile("file", "avatar.webp", "image/webp", bytes);

        assertThrows(IllegalArgumentException.class, () -> UserAvatarValidator.validateAndResolve(file));
    }

    @Test
    void shouldAcceptStructuredWebpPayloadWithWebpContentType() {
        byte[] bytes = new byte[] {
            'R', 'I', 'F', 'F',
            16, 0, 0, 0,
            'W', 'E', 'B', 'P',
            'V', 'P', '8', ' ',
            4, 0, 0, 0,
            1, 2, 3, 4
        };
        MockMultipartFile file = new MockMultipartFile("file", "avatar.webp", "image/webp", bytes);

        assertDoesNotThrow(() -> UserAvatarValidator.validateAndResolve(file));
    }

    private byte[] onePixelPng() {
        return Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        );
    }

    private byte[] onePixelJpeg() {
        try {
            BufferedImage image = new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB);
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            ImageIO.write(image, "jpg", output);
            return output.toByteArray();
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to create test JPEG", exception);
        }
    }
}
