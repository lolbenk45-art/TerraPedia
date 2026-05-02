package com.terraria.skills.service.impl;

import com.terraria.skills.config.MinioConnectionDetails;
import com.terraria.skills.dto.AdminWikiImageSyncRequestDTO;
import com.terraria.skills.dto.AdminWikiImageSyncResultDTO;
import com.terraria.skills.entity.Item;
import com.terraria.skills.entity.ItemImage;
import com.terraria.skills.mapper.BiomeMapper;
import com.terraria.skills.mapper.BuffMapper;
import com.terraria.skills.mapper.ItemImageMapper;
import com.terraria.skills.mapper.ItemMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import io.minio.BucketExistsArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WikiImageSyncServiceImplTest {

    @Mock
    private ItemImageMapper itemImageMapper;

    @Mock
    private ItemMapper itemMapper;

    @Mock
    private BuffMapper buffMapper;

    @Mock
    private BiomeMapper biomeMapper;

    @Mock
    private MinioClient minioClient;

    private HttpServer imageServer;

    @AfterEach
    void stopImageServer() {
        if (imageServer != null) {
            imageServer.stop(0);
        }
    }

    @Test
    void shouldMirrorLegacyWikiItemImageIntoItemImagesWithoutOverwritingItemsImage() throws Exception {
        String sourceUrl = startImageServer("/terraria.wiki.gg/images/Sharp_Blade.png");
        Item item = legacyItem(sourceUrl);
        when(itemImageMapper.selectList(any())).thenReturn(List.of());
        when(itemMapper.selectList(any())).thenReturn(List.of(item));
        when(minioClient.bucketExists(any(BucketExistsArgs.class))).thenReturn(true);
        when(minioClient.putObject(any(PutObjectArgs.class))).thenReturn(null);

        AdminWikiImageSyncResultDTO result = service().syncWikiImages(itemImagesOnlyRequest());

        assertEquals(1, result.getItemImages().getSyncedCount());
        verify(itemMapper, never()).updateById(any(Item.class));

        ArgumentCaptor<ItemImage> imageCaptor = ArgumentCaptor.forClass(ItemImage.class);
        verify(itemImageMapper).insert(imageCaptor.capture());
        ItemImage inserted = imageCaptor.getValue();
        assertEquals(7L, inserted.getItemId());
        assertEquals("icon", inserted.getRole());
        assertEquals("wiki_gg", inserted.getProvider());
        assertEquals(sourceUrl, inserted.getOriginalUrl());
        assertTrue(inserted.getCachedUrl().startsWith("http://localhost:9000/terrapedia-images/items/legacy/items/"));
        assertEquals("image/png", inserted.getContentType());
        assertEquals(Boolean.TRUE, inserted.getIsPrimary());
        assertEquals(0, inserted.getSortOrder());
        assertEquals(1, inserted.getStatus());
        assertEquals(0, inserted.getDeleted());
        assertNotNull(inserted.getLastVerifiedAt());
    }

    @Test
    void shouldSkipLegacyItemImageWhenMatchingItemImageAlreadyHasManagedCache() throws Exception {
        String sourceUrl = startImageServer("/terraria.wiki.gg/images/Sharp_Blade.png");
        Item item = legacyItem(sourceUrl);

        ItemImage existing = new ItemImage();
        existing.setId(11L);
        existing.setItemId(7L);
        existing.setOriginalUrl(sourceUrl);
        existing.setCachedUrl("http://localhost:9000/terrapedia-images/items/legacy/items/existing.png");
        existing.setProvider("wiki_gg");
        existing.setStatus(1);

        when(itemImageMapper.selectList(any())).thenReturn(List.of(existing));
        when(itemMapper.selectList(any())).thenReturn(List.of(item));

        AdminWikiImageSyncResultDTO result = service().syncWikiImages(itemImagesOnlyRequest());

        assertEquals(0, result.getItemImages().getSyncedCount());
        assertTrue(result.getItemImages().getSkippedCount() >= 1);
        verify(minioClient, never()).putObject(any(PutObjectArgs.class));
        verify(itemImageMapper, never()).insert(any(ItemImage.class));
        verify(itemImageMapper, never()).updateById(any(ItemImage.class));
        verify(itemMapper, never()).updateById(any(Item.class));
    }

    @Test
    void shouldPreserveWikiFallbackWhenExistingItemImageUsesWikiCachedUrl() throws Exception {
        String sourceUrl = startImageServer("/terraria.wiki.gg/images/Sharp_Blade.png");

        ItemImage existing = new ItemImage();
        existing.setId(11L);
        existing.setItemId(7L);
        existing.setCachedUrl(sourceUrl);
        existing.setProvider("wiki_gg");
        existing.setStatus(1);

        when(itemImageMapper.selectList(any())).thenReturn(List.of(existing));
        when(itemMapper.selectList(any())).thenReturn(List.of());
        when(minioClient.bucketExists(any(BucketExistsArgs.class))).thenReturn(true);
        when(minioClient.putObject(any(PutObjectArgs.class))).thenReturn(null);

        AdminWikiImageSyncResultDTO result = service().syncWikiImages(itemImagesOnlyRequest());

        assertEquals(1, result.getItemImages().getSyncedCount());

        ArgumentCaptor<ItemImage> imageCaptor = ArgumentCaptor.forClass(ItemImage.class);
        verify(itemImageMapper).updateById(imageCaptor.capture());
        ItemImage updated = imageCaptor.getValue();
        assertEquals(sourceUrl, updated.getOriginalUrl());
        assertTrue(updated.getCachedUrl().startsWith("http://localhost:9000/terrapedia-images/items/wiki/item-images/"));
        assertEquals("image/png", updated.getContentType());
        assertNotNull(updated.getLastVerifiedAt());
    }

    @Test
    void shouldSyncLegacyWikiProviderAliasRows() throws Exception {
        String sourceUrl = startImageServer("/terraria.wiki.gg/images/Sharp_Blade.png");

        ItemImage existing = new ItemImage();
        existing.setId(11L);
        existing.setItemId(7L);
        existing.setOriginalUrl(sourceUrl);
        existing.setCachedUrl(sourceUrl);
        existing.setProvider("terraria.wiki.gg");
        existing.setStatus(1);

        when(itemImageMapper.selectList(any())).thenReturn(List.of(existing));
        when(itemMapper.selectList(any())).thenReturn(List.of());
        when(minioClient.bucketExists(any(BucketExistsArgs.class))).thenReturn(true);
        when(minioClient.putObject(any(PutObjectArgs.class))).thenReturn(null);

        AdminWikiImageSyncResultDTO result = service().syncWikiImages(itemImagesOnlyRequest());

        assertEquals(1, result.getItemImages().getSyncedCount());

        ArgumentCaptor<ItemImage> imageCaptor = ArgumentCaptor.forClass(ItemImage.class);
        verify(itemImageMapper).updateById(imageCaptor.capture());
        ItemImage updated = imageCaptor.getValue();
        assertEquals(sourceUrl, updated.getOriginalUrl());
        assertTrue(updated.getCachedUrl().startsWith("http://localhost:9000/terrapedia-images/items/wiki/item-images/"));
        assertEquals("terraria.wiki.gg", updated.getProvider());
    }

    @Test
    void shouldBackfillWikiFallbackForManagedLegacyItemImageWithoutReuploading() throws Exception {
        String sourceUrl = startImageServer("/terraria.wiki.gg/images/Sharp_Blade.png");
        Item item = legacyItem(sourceUrl);

        ItemImage existing = new ItemImage();
        existing.setId(11L);
        existing.setItemId(7L);
        existing.setRole("icon");
        existing.setCachedUrl("http://localhost:9000/terrapedia-images/items/legacy/items/existing.png");
        existing.setProvider("wiki_gg");
        existing.setIsPrimary(Boolean.TRUE);
        existing.setSortOrder(0);
        existing.setStatus(1);
        existing.setDeleted(0);

        when(itemImageMapper.selectList(any())).thenReturn(List.of(existing));
        when(itemMapper.selectList(any())).thenReturn(List.of(item));

        AdminWikiImageSyncResultDTO result = service().syncWikiImages(itemImagesOnlyRequest());

        assertEquals(0, result.getItemImages().getSyncedCount());
        assertTrue(result.getItemImages().getSkippedCount() >= 1);

        ArgumentCaptor<ItemImage> imageCaptor = ArgumentCaptor.forClass(ItemImage.class);
        verify(itemImageMapper).updateById(imageCaptor.capture());
        ItemImage updated = imageCaptor.getValue();
        assertEquals(sourceUrl, updated.getOriginalUrl());
        assertEquals("http://localhost:9000/terrapedia-images/items/legacy/items/existing.png", updated.getCachedUrl());
        assertNotNull(updated.getLastVerifiedAt());
        verify(minioClient, never()).putObject(any(PutObjectArgs.class));
        verify(itemImageMapper, never()).insert(any(ItemImage.class));
        verify(itemMapper, never()).updateById(any(Item.class));
    }

    private WikiImageSyncServiceImpl service() {
        return new WikiImageSyncServiceImpl(
            itemImageMapper,
            itemMapper,
            buffMapper,
            biomeMapper,
            minioClient,
            new MinioConnectionDetails(
                "http://localhost:9000",
                "http://localhost:9000",
                "minio",
                "minio123",
                "terrapedia-images",
                "items",
                true,
                true,
                true,
                1024 * 1024
            )
        );
    }

    private AdminWikiImageSyncRequestDTO itemImagesOnlyRequest() {
        AdminWikiImageSyncRequestDTO request = new AdminWikiImageSyncRequestDTO();
        request.setIncludeItemImages(true);
        request.setIncludeBuffs(false);
        request.setIncludeBiomes(false);
        return request;
    }

    private Item legacyItem(String sourceUrl) {
        Item item = new Item();
        item.setId(7L);
        item.setInternalName("Sharp Blade");
        item.setName("Sharp Blade");
        item.setNameZh("锋利之刃");
        item.setImage(sourceUrl);
        return item;
    }

    private String startImageServer(String path) throws IOException {
        byte[] imageBytes = new byte[] {
            (byte) 0x89, 0x50, 0x4E, 0x47,
            0x0D, 0x0A, 0x1A, 0x0A
        };
        imageServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        imageServer.createContext(path, exchange -> writeImageResponse(exchange, imageBytes));
        imageServer.start();
        return "http://127.0.0.1:" + imageServer.getAddress().getPort() + path;
    }

    private void writeImageResponse(HttpExchange exchange, byte[] imageBytes) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "image/png");
        exchange.sendResponseHeaders(200, imageBytes.length);
        try (OutputStream outputStream = exchange.getResponseBody()) {
            outputStream.write(imageBytes);
        }
    }
}
