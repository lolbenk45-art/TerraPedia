package com.terraria.skills.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.ItemDTO;
import com.terraria.skills.common.PageQuery;

import java.util.List;

public interface ItemService {

    Page<ItemDTO> getItems(PageQuery pageQuery);

    ItemDTO getItemById(Long id);

    List<ItemDTO> getAllItems();

    List<ItemDTO> searchSuggestions(String keyword, int limit);

    ItemDTO createItem(ItemDTO itemDTO);

    ItemDTO updateItem(Long id, ItemDTO itemDTO);

    void deleteItem(Long id);
}
