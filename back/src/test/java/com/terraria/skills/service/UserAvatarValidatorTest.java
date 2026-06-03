package com.terraria.skills.service;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

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
}
