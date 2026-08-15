package com.terraria.skills.controller;

import com.terraria.skills.common.ItemImageSql;

final class AdminItemImageSql {

    private AdminItemImageSql() {
    }

    static String preferredItemImageExpression(String itemAlias) {
        return ItemImageSql.preferredItemImageExpression(itemAlias);
    }
}
