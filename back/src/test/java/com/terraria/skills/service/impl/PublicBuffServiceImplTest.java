package com.terraria.skills.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.terraria.skills.dto.PublicBuffListDTO;
import com.terraria.skills.dto.PublicBuffQuery;
import com.terraria.skills.entity.Buff;
import com.terraria.skills.mapper.BuffMapper;
import com.terraria.skills.service.ManagedImageUrlPolicy;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PublicBuffServiceImplTest {

    private static final String CDN_BUFF_IMAGE_URL = "https://cdn.example.com/terrapedia-images/buffs/wiki/ab/sharpened.png";

    @Mock
    private BuffMapper buffMapper;

    @Test
    void shouldAllowConfiguredCdnBuffImages() {
        Buff buff = new Buff();
        buff.setId(159L);
        buff.setSourceId(159);
        buff.setInternalName("Sharpened");
        buff.setEnglishName("Sharpened");
        buff.setNameZh("Sharpened");
        buff.setImageCachedUrl(CDN_BUFF_IMAGE_URL);
        buff.setBuffType("buff");
        buff.setStatus(1);

        Page<Buff> page = new Page<>(1, 20);
        page.setTotal(1);
        page.setRecords(List.of(buff));
        when(buffMapper.selectPage(any(Page.class), any())).thenReturn(page);

        PublicBuffServiceImpl service = new PublicBuffServiceImpl(buffMapper, managedImageUrlPolicy());
        Page<PublicBuffListDTO> result = service.getPublicBuffs(new PublicBuffQuery());

        assertEquals(1, result.getRecords().size());
        assertEquals(CDN_BUFF_IMAGE_URL, result.getRecords().get(0).getImageUrl());
    }

    private ManagedImageUrlPolicy managedImageUrlPolicy() {
        return new ManagedImageUrlPolicy() {
            @Override
            public boolean isManagedImageUrl(String value) {
                return value != null && value.startsWith("https://cdn.example.com/terrapedia-images/");
            }

            @Override
            public List<String> trustedManagedImageUrlPrefixes() {
                return List.of("https://cdn.example.com/terrapedia-images/buffs/");
            }
        };
    }
}
