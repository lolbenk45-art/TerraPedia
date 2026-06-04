package com.terraria.skills.mapper;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UserMapperContractTest {

    private static final Pattern PUBLIC_USER_SELECT_PATTERN = Pattern.compile(
        "<select id=\"selectPublicUserById\"[\\s\\S]*?</select>",
        Pattern.MULTILINE
    );

    @Test
    void publicUserQueryMustNotSelectPrivateAccountColumns() throws IOException {
        String mapperXml = Files.readString(Path.of("src/main/resources/mapper/UserMapper.xml"));
        Matcher matcher = PUBLIC_USER_SELECT_PATTERN.matcher(mapperXml);
        assertTrue(matcher.find(), "selectPublicUserById query must exist");

        String query = matcher.group().toLowerCase();

        assertFalse(query.contains("email"), "public user query must not select email");
        assertFalse(query.contains("password_hash"), "public user query must not select password_hash");
        assertFalse(query.contains("avatar_object_key"), "public user query must not select avatar_object_key");
        assertFalse(query.contains("last_login_at"), "public user query must not select last_login_at");
        assertTrue(query.contains("deleted = 0"), "public user query must filter deleted users");
        assertTrue(query.contains("status = 1"), "public user query must filter inactive users");
    }
}
