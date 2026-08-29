package com.terraria.skills.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.NpcBuffRelationDTO;
import com.terraria.skills.dto.NpcDetailDTO;
import com.terraria.skills.dto.NpcListItemDTO;
import com.terraria.skills.dto.NpcLootEntryDTO;
import com.terraria.skills.dto.NpcShopEntryDTO;
import com.terraria.skills.dto.PublicNpcQuery;

import java.util.List;

public interface PublicNpcService {

    Page<NpcListItemDTO> getNpcs(PublicNpcQuery query);

    NpcDetailDTO getNpcById(Long id);

    /**
     * Loads the aggregate base without applying multipart representative
     * collapsing. Aggregate consumers need the requested segment identity so
     * its structured loot rows remain attributable to the correct NPC.
     */
    default NpcDetailDTO getNpcAggregateBaseById(Long id) {
        return getNpcById(id);
    }

    List<NpcLootEntryDTO> getNpcLoot(Long npcId, Long gameId, String npcName);

    List<NpcShopEntryDTO> getNpcShopEntries(Long npcId);

    List<NpcBuffRelationDTO> getNpcBuffRelations(Long npcId);
}
