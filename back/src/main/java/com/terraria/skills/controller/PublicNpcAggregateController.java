package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.NpcAggregateDTO;
import com.terraria.skills.dto.NpcDetailDTO;
import com.terraria.skills.service.PublicNpcService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

@RestController
@RequestMapping("/public/npcs")
@RequiredArgsConstructor
@Tag(name = "Public NPC Aggregate", description = "Public aggregate NPC detail APIs")
public class PublicNpcAggregateController {

    private static final String MODULE_LOOT = "loot";
    private static final String MODULE_SHOP = "shop";
    private static final String MODULE_BUFFS = "buffs";

    private final PublicNpcService publicNpcService;

    @GetMapping("/{id}/aggregate")
    @Operation(summary = "Get aggregated public NPC detail")
    public ResponseEntity<ApiResponse<NpcAggregateDTO>> getNpcAggregate(
        @PathVariable Long id,
        @RequestParam(defaultValue = "loot,shop,buffs") String include
    ) {
        NpcDetailDTO npc = publicNpcService.getNpcById(id);
        if (npc == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error(404, "Npc not found"));
        }

        Set<String> requestedModules = parseRequestedModules(include);
        NpcAggregateDTO response = new NpcAggregateDTO();
        response.setNpc(npc);

        if (requestedModules.contains(MODULE_LOOT)) {
            response.setLoot(publicNpcService.getNpcLoot(id, npc.getGameId(), npc.getName()));
            response.getModuleStatus().put(MODULE_LOOT, response.getLoot().isEmpty() ? "empty" : "ok");
        } else {
            response.getModuleStatus().put(MODULE_LOOT, "skipped");
        }

        if (requestedModules.contains(MODULE_SHOP)) {
            response.setShopEntries(publicNpcService.getNpcShopEntries(id));
            response.getModuleStatus().put(MODULE_SHOP, response.getShopEntries().isEmpty() ? "empty" : "ok");
        } else {
            response.getModuleStatus().put(MODULE_SHOP, "skipped");
        }

        if (requestedModules.contains(MODULE_BUFFS)) {
            response.setBuffRelations(publicNpcService.getNpcBuffRelations(id));
            response.getModuleStatus().put(MODULE_BUFFS, response.getBuffRelations().isEmpty() ? "empty" : "ok");
        } else {
            response.getModuleStatus().put(MODULE_BUFFS, "skipped");
        }

        response.setAggregatedAt(LocalDateTime.now());
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    private Set<String> parseRequestedModules(String include) {
        if (include == null || include.isBlank()) {
            return Set.of(MODULE_LOOT, MODULE_SHOP, MODULE_BUFFS);
        }

        Set<String> modules = new LinkedHashSet<>();
        Arrays.stream(include.split(","))
            .map(value -> value == null ? "" : value.trim().toLowerCase(Locale.ROOT))
            .forEach(value -> {
                if ("all".equals(value) || MODULE_LOOT.equals(value) || MODULE_SHOP.equals(value) || MODULE_BUFFS.equals(value)) {
                    if ("all".equals(value)) {
                        modules.add(MODULE_LOOT);
                        modules.add(MODULE_SHOP);
                        modules.add(MODULE_BUFFS);
                    } else {
                        modules.add(value);
                    }
                }
            });

        if (modules.isEmpty()) {
            modules.add(MODULE_LOOT);
            modules.add(MODULE_SHOP);
            modules.add(MODULE_BUFFS);
        }
        return modules;
    }
}
