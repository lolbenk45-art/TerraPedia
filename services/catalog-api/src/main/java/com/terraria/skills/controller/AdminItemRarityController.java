package com.terraria.skills.controller;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.ItemRarityDTO;
import com.terraria.skills.service.ItemRarityService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@RestController
@RequestMapping("/admin/item-rarities")
@RequiredArgsConstructor
public class AdminItemRarityController {

    private final ItemRarityService itemRarityService;

    @GetMapping
    public ApiResponse<List<ItemRarityDTO>> getAll() {
        return ApiResponse.success(itemRarityService.getAll());
    }

    @GetMapping("/{id}")
    public ApiResponse<ItemRarityDTO> getById(@PathVariable Long id) {
        ItemRarityDTO dto = itemRarityService.getById(id);
        if (dto == null) {
            return ApiResponse.error(404, "品质不存在");
        }
        return ApiResponse.success(dto);
    }

    @PostMapping
    public ApiResponse<ItemRarityDTO> create(@RequestBody ItemRarityDTO dto) {
        try {
            return ApiResponse.success(itemRarityService.create(dto), "品质创建成功");
        } catch (IllegalArgumentException ex) {
            return ApiResponse.error(400, ex.getMessage());
        }
    }

    @PutMapping("/{id}")
    public ApiResponse<ItemRarityDTO> update(@PathVariable Long id, @RequestBody ItemRarityDTO dto) {
        try {
            return ApiResponse.success(itemRarityService.update(id, dto), "品质更新成功");
        } catch (IllegalArgumentException ex) {
            return ApiResponse.error(400, ex.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        try {
            itemRarityService.delete(id);
            return ApiResponse.success(null, "品质删除成功");
        } catch (IllegalArgumentException ex) {
            return ApiResponse.error(400, ex.getMessage());
        }
    }
}
