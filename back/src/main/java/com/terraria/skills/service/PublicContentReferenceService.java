package com.terraria.skills.service;

import com.terraria.skills.dto.PublicContentReferenceDTO;
import com.terraria.skills.dto.PublicContentReferenceResolveItemDTO;

import java.util.List;
import java.util.Set;

public interface PublicContentReferenceService {

    List<PublicContentReferenceDTO> search(Set<String> types, String query, int limit);

    List<PublicContentReferenceDTO> resolve(List<PublicContentReferenceResolveItemDTO> refs);
}
