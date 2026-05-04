package com.terraria.skills.handler;

import com.terraria.skills.common.ApiResponse;
import com.terraria.skills.dto.ItemAggregateDTO;
import com.terraria.skills.dto.ItemImageDTO;
import com.terraria.skills.service.WikiImageLocalizationService;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertNull;

class WikiImageResponseSanitizerAdviceTest {

    @Test
    void shouldLocalizeWikiImageFieldsInNestedApiResponsePayload() {
        StubWikiImageLocalizationService localizationService = new StubWikiImageLocalizationService(Map.of(
            "https://terraria.wiki.gg/images/Foo.png",
            "http://localhost:9000/terrapedia-images/items/wiki/Foo.png",
            "https://static.wikia.nocookie.net/terraria_gamepedia/images/Bar.png",
            "http://localhost:9000/terrapedia-images/items/wiki/Bar.png",
            "https://terraria.wiki.gg/images/Gold_Coin.png",
            "http://localhost:9000/terrapedia-images/items/wiki/Gold_Coin.png"
        ));
        WikiImageResponseSanitizerAdvice advice = new WikiImageResponseSanitizerAdvice(localizationService);

        Map<String, Object> item = new LinkedHashMap<>();
        item.put("imageUrl", "https://terraria.wiki.gg/images/Foo.png");
        item.put("sourcePageUrl", "https://terraria.wiki.gg/wiki/Foo");
        item.put("iconUrl", "http://localhost:9000/terrapedia-images/items/existing.png");

        Map<String, Object> nestedImage = new LinkedHashMap<>();
        nestedImage.put("originalUrl", "https://static.wikia.nocookie.net/terraria_gamepedia/images/Bar.png");
        nestedImage.put("wikiPageUrl", "https://terraria.wiki.gg/wiki/File:Bar.png");
        item.put("images", new ArrayList<>(List.of(nestedImage)));
        Map<String, String> coinIcons = new LinkedHashMap<>();
        coinIcons.put("gold", "https://terraria.wiki.gg/images/Gold_Coin.png");
        item.put("coinIcons", coinIcons);

        ApiResponse<Map<String, Object>> response = ApiResponse.success(item);

        item = sanitizedData(advice, item);

        assertEquals("http://localhost:9000/terrapedia-images/items/wiki/Foo.png", item.get("imageUrl"));
        assertEquals("https://terraria.wiki.gg/wiki/Foo", item.get("sourcePageUrl"));
        assertEquals("http://localhost:9000/terrapedia-images/items/existing.png", item.get("iconUrl"));
        @SuppressWarnings("unchecked")
        Map<String, Object> sanitizedNestedImage = (Map<String, Object>) ((List<?>) item.get("images")).get(0);
        assertEquals("https://static.wikia.nocookie.net/terraria_gamepedia/images/Bar.png", nestedImage.get("originalUrl"));
        assertEquals("http://localhost:9000/terrapedia-images/items/wiki/Bar.png", sanitizedNestedImage.get("originalUrl"));
        assertEquals("https://terraria.wiki.gg/wiki/File:Bar.png", nestedImage.get("wikiPageUrl"));
        @SuppressWarnings("unchecked")
        Map<String, String> sanitizedCoinIcons = (Map<String, String>) item.get("coinIcons");
        assertEquals("https://terraria.wiki.gg/images/Gold_Coin.png", coinIcons.get("gold"));
        assertEquals("http://localhost:9000/terrapedia-images/items/wiki/Gold_Coin.png", sanitizedCoinIcons.get("gold"));
        assertEquals(3, localizationService.getCachedLocalizationCalls());
        assertEquals(0, localizationService.getBlockingLocalizationCalls());
    }

    @Test
    void shouldSuppressWikiImageWhenCachedLocalizationMissesInApiResponse() {
        StubWikiImageLocalizationService localizationService = new StubWikiImageLocalizationService(Map.of());
        WikiImageResponseSanitizerAdvice advice = new WikiImageResponseSanitizerAdvice(localizationService);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("cachedUrl", "https://terraria.wiki.gg/images/Fallback.png");
        payload.put("thumbnailUrl", "https://terraria.wiki.gg/images/Fallback.thumb.png");
        payload.put("contentHtml", "<img src=\"https://terraria.wiki.gg/images/Fallback.html.png\">");

        payload = sanitizedData(advice, payload);

        assertNull(payload.get("cachedUrl"));
        assertNull(payload.get("thumbnailUrl"));
        assertEquals("<img src=\"\">", payload.get("contentHtml"));
        assertEquals(3, localizationService.getCachedLocalizationCalls());
        assertEquals(0, localizationService.getBlockingLocalizationCalls());
    }

    @Test
    void shouldLocalizeImagePathAndDelimitedImageFields() {
        StubWikiImageLocalizationService localizationService = new StubWikiImageLocalizationService(Map.of(
            "https://terraria.wiki.gg/images/Buff.png",
            "http://localhost:9000/terrapedia-images/items/wiki/Buff.png",
            "https://terraria.wiki.gg/images/Male.png",
            "http://localhost:9000/terrapedia-images/items/wiki/Male.png",
            "https://terraria.wiki.gg/images/Female.png",
            "http://localhost:9000/terrapedia-images/items/wiki/Female.png",
            "https://terraria.wiki.gg/images/Special.png",
            "http://localhost:9000/terrapedia-images/items/wiki/Special.png"
        ));
        WikiImageResponseSanitizerAdvice advice = new WikiImageResponseSanitizerAdvice(localizationService);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("imagePath", "https://terraria.wiki.gg/images/Buff.png");
        payload.put("maleImages", "https://terraria.wiki.gg/images/Male.png");
        payload.put("femaleImages", "https://terraria.wiki.gg/images/Female.png, https://terraria.wiki.gg/images/Special.png");
        payload.put("specialImages", "https://terraria.wiki.gg/wiki/File:Special.png");

        payload = sanitizedData(advice, payload);

        assertEquals("http://localhost:9000/terrapedia-images/items/wiki/Buff.png", payload.get("imagePath"));
        assertEquals("http://localhost:9000/terrapedia-images/items/wiki/Male.png", payload.get("maleImages"));
        assertEquals(
            "http://localhost:9000/terrapedia-images/items/wiki/Female.png, http://localhost:9000/terrapedia-images/items/wiki/Special.png",
            payload.get("femaleImages")
        );
        assertEquals("https://terraria.wiki.gg/wiki/File:Special.png", payload.get("specialImages"));
        assertEquals(4, localizationService.getCachedLocalizationCalls());
    }

    @Test
    void shouldLocalizeStringArraysAndGenericCollectionsInsideImageContainers() {
        StubWikiImageLocalizationService localizationService = new StubWikiImageLocalizationService(Map.of(
            "https://terraria.wiki.gg/images/Array.png",
            "http://localhost:9000/terrapedia-images/items/wiki/Array.png",
            "https://terraria.wiki.gg/images/Collection.png",
            "http://localhost:9000/terrapedia-images/items/wiki/Collection.png"
        ));
        WikiImageResponseSanitizerAdvice advice = new WikiImageResponseSanitizerAdvice(localizationService);

        String[] thumbnails = new String[] {"https://terraria.wiki.gg/images/Array.png"};
        Collection<String> icons = new LinkedHashSet<>(List.of("https://terraria.wiki.gg/images/Collection.png"));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("thumbnails", thumbnails);
        payload.put("icons", icons);

        payload = sanitizedData(advice, payload);

        assertEquals("https://terraria.wiki.gg/images/Array.png", thumbnails[0]);
        assertEquals("http://localhost:9000/terrapedia-images/items/wiki/Array.png", ((String[]) payload.get("thumbnails"))[0]);
        assertEquals(
            List.of("http://localhost:9000/terrapedia-images/items/wiki/Collection.png"),
            new ArrayList<>((Collection<String>) payload.get("icons"))
        );
        assertEquals(2, localizationService.getCachedLocalizationCalls());
    }

    @Test
    void shouldInspectContentHtmlAndSourceJsonButSkipOrdinaryLargeTextFieldsForImageUrls() {
        StubWikiImageLocalizationService localizationService = new StubWikiImageLocalizationService(Map.of(
            "https://terraria.wiki.gg/images/Article.png",
            "http://localhost:9000/terrapedia-images/items/wiki/Article.png",
            "https://terraria.wiki.gg/images/Raw.png",
            "http://localhost:9000/terrapedia-images/items/wiki/Raw.png",
            "https://terraria.wiki.gg/images/Report.png",
            "http://localhost:9000/terrapedia-images/items/wiki/Report.png",
            "https://terraria.wiki.gg/images/Zoologist.png",
            "http://localhost:9000/terrapedia-images/items/wiki/Zoologist.png"
        ));
        WikiImageResponseSanitizerAdvice advice = new WikiImageResponseSanitizerAdvice(localizationService);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("contentHtml", "<img src=\"https://terraria.wiki.gg/images/Article.png\">");
        payload.put("rawJson", "{\"imageUrl\":\"https://terraria.wiki.gg/images/Raw.png\"}");
        payload.put("content", "report: https://terraria.wiki.gg/images/Report.png");
        payload.put("sourceNpcsJson", "[{\"sourcePage\":\"https://terraria.wiki.gg/images/Zoologist.png\"}]");

        payload = sanitizedData(advice, payload);

        assertEquals("<img src=\"http://localhost:9000/terrapedia-images/items/wiki/Article.png\">", payload.get("contentHtml"));
        assertEquals("{\"imageUrl\":\"http://localhost:9000/terrapedia-images/items/wiki/Raw.png\"}", payload.get("rawJson"));
        assertEquals("report: https://terraria.wiki.gg/images/Report.png", payload.get("content"));
        assertEquals("[{\"sourcePage\":\"http://localhost:9000/terrapedia-images/items/wiki/Zoologist.png\"}]", payload.get("sourceNpcsJson"));
        assertEquals(3, localizationService.getCachedLocalizationCalls());
    }

    @Test
    void shouldLocalizeCompositeImageUrlFieldsAndProtocolRelativeWikiImages() {
        StubWikiImageLocalizationService localizationService = new StubWikiImageLocalizationService(Map.of(
            "https://terraria.wiki.gg/images/Original.png",
            "http://localhost:9000/terrapedia-images/items/wiki/Original.png",
            "//static.wikia.nocookie.net/terraria_gamepedia/images/Proto.png",
            "http://localhost:9000/terrapedia-images/items/wiki/Proto.png"
        ));
        WikiImageResponseSanitizerAdvice advice = new WikiImageResponseSanitizerAdvice(localizationService);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("imageOriginalUrl", "https://terraria.wiki.gg/images/Original.png");
        payload.put("imageCachedUrl", "https://terraria.wiki.gg/images/Missing.png");
        payload.put("imageUrl", "//static.wikia.nocookie.net/terraria_gamepedia/images/Proto.png");

        payload = sanitizedData(advice, payload);

        assertEquals("http://localhost:9000/terrapedia-images/items/wiki/Original.png", payload.get("imageOriginalUrl"));
        assertNull(payload.get("imageCachedUrl"));
        assertEquals("http://localhost:9000/terrapedia-images/items/wiki/Proto.png", payload.get("imageUrl"));
        assertEquals(3, localizationService.getCachedLocalizationCalls());
    }

    @Test
    void shouldNotMutateCachedAggregateDtoWhenSuppressingWikiImageFields() {
        StubWikiImageLocalizationService localizationService = new StubWikiImageLocalizationService(Map.of());
        WikiImageResponseSanitizerAdvice advice = new WikiImageResponseSanitizerAdvice(localizationService);
        ItemImageDTO image = new ItemImageDTO();
        image.setOriginalUrl("https://terraria.wiki.gg/images/Cached.png");
        image.setImageUrl("http://localhost:9000/terrapedia-images/items/wiki/Cached.png");
        ItemAggregateDTO aggregate = new ItemAggregateDTO();
        aggregate.setImages(new ArrayList<>(List.of(image)));

        Object sanitized = advice.sanitizeResponseBody(ApiResponse.success(aggregate));

        @SuppressWarnings("unchecked")
        ApiResponse<ItemAggregateDTO> sanitizedResponse = (ApiResponse<ItemAggregateDTO>) sanitized;
        ItemAggregateDTO sanitizedAggregate = sanitizedResponse.getData();
        assertNotSame(aggregate, sanitizedAggregate);
        assertNotSame(image, sanitizedAggregate.getImages().get(0));
        assertEquals("https://terraria.wiki.gg/images/Cached.png", image.getOriginalUrl());
        assertNull(sanitizedAggregate.getImages().get(0).getOriginalUrl());
        assertEquals("http://localhost:9000/terrapedia-images/items/wiki/Cached.png", sanitizedAggregate.getImages().get(0).getImageUrl());
    }

    @Test
    void shouldLocalizeWikiImageSourceUrlButPreserveWikiPageSourceUrl() {
        StubWikiImageLocalizationService localizationService = new StubWikiImageLocalizationService(Map.of(
            "https://terraria.wiki.gg/images/Source.png",
            "http://localhost:9000/terrapedia-images/items/wiki/Source.png"
        ));
        WikiImageResponseSanitizerAdvice advice = new WikiImageResponseSanitizerAdvice(localizationService);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("sourceUrl", "https://terraria.wiki.gg/images/Source.png");
        payload.put("sourcePageUrl", "https://terraria.wiki.gg/wiki/Source");
        payload.put("wikiPageUrl", "https://terraria.wiki.gg/wiki/File:Source.png");

        payload = sanitizedData(advice, payload);

        assertEquals("http://localhost:9000/terrapedia-images/items/wiki/Source.png", payload.get("sourceUrl"));
        assertEquals("https://terraria.wiki.gg/wiki/Source", payload.get("sourcePageUrl"));
        assertEquals("https://terraria.wiki.gg/wiki/File:Source.png", payload.get("wikiPageUrl"));
    }

    @Test
    void shouldSkipStringValuesInOrdinaryCollectionsAndArrays() {
        StubWikiImageLocalizationService localizationService = new StubWikiImageLocalizationService(Map.of(
            "https://terraria.wiki.gg/images/CollectionLeak.png",
            "http://localhost:9000/terrapedia-images/items/wiki/CollectionLeak.png",
            "https://terraria.wiki.gg/images/ArrayLeak.png",
            "http://localhost:9000/terrapedia-images/items/wiki/ArrayLeak.png",
            "https://terraria.wiki.gg/images/ImmutableLeak.png",
            "http://localhost:9000/terrapedia-images/items/wiki/ImmutableLeak.png"
        ));
        WikiImageResponseSanitizerAdvice advice = new WikiImageResponseSanitizerAdvice(localizationService);

        Collection<String> notes = new LinkedHashSet<>(List.of("drop https://terraria.wiki.gg/images/CollectionLeak.png"));
        String[] args = new String[] {"https://terraria.wiki.gg/images/ArrayLeak.png"};
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("notes", notes);
        payload.put("args", args);
        payload.put("warnings", List.of("https://terraria.wiki.gg/images/ImmutableLeak.png"));

        payload = sanitizedData(advice, payload);

        assertEquals(
            List.of("drop https://terraria.wiki.gg/images/CollectionLeak.png"),
            new ArrayList<>(notes)
        );
        assertEquals("https://terraria.wiki.gg/images/ArrayLeak.png", args[0]);
        assertEquals(
            List.of("https://terraria.wiki.gg/images/ImmutableLeak.png"),
            payload.get("warnings")
        );
        assertEquals(0, localizationService.getCachedLocalizationCalls());
    }

    @Test
    void shouldReplaceImmutableMapAndListBranchesWithLocalizedCopiesInsideImageContainers() {
        StubWikiImageLocalizationService localizationService = new StubWikiImageLocalizationService(Map.of(
            "https://terraria.wiki.gg/images/ImmutableMap.png",
            "http://localhost:9000/terrapedia-images/items/wiki/ImmutableMap.png",
            "https://terraria.wiki.gg/images/ImmutableList.png",
            "http://localhost:9000/terrapedia-images/items/wiki/ImmutableList.png"
        ));
        WikiImageResponseSanitizerAdvice advice = new WikiImageResponseSanitizerAdvice(localizationService);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("detail", Map.of("imageUrl", "https://terraria.wiki.gg/images/ImmutableMap.png"));
        payload.put("icons", List.of("https://terraria.wiki.gg/images/ImmutableList.png"));
        ApiResponse<Map<String, Object>> response = ApiResponse.success(payload);

        payload = sanitizedData(advice, payload);

        @SuppressWarnings("unchecked")
        Map<String, Object> detail = (Map<String, Object>) payload.get("detail");
        assertEquals("http://localhost:9000/terrapedia-images/items/wiki/ImmutableMap.png", detail.get("imageUrl"));
        assertEquals(
            List.of("http://localhost:9000/terrapedia-images/items/wiki/ImmutableList.png"),
            payload.get("icons")
        );
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> sanitizedData(WikiImageResponseSanitizerAdvice advice, Map<String, Object> payload) {
        Object sanitized = advice.sanitizeResponseBody(ApiResponse.success(payload));
        return (Map<String, Object>) ((ApiResponse<?>) sanitized).getData();
    }

    private static final class StubWikiImageLocalizationService implements WikiImageLocalizationService {

        private final Map<String, String> localizedUrls;
        private int cachedLocalizationCalls;
        private int blockingLocalizationCalls;

        private StubWikiImageLocalizationService(Map<String, String> localizedUrls) {
            this.localizedUrls = localizedUrls;
        }

        @Override
        public boolean isWikiImageUrl(String value) {
            return value != null
                && (value.contains("terraria.wiki.gg/images/")
                    || value.contains("static.wikia.nocookie.net")
                    || value.contains("//static.wikia.nocookie.net"));
        }

        @Override
        public boolean isManagedImageUrl(String value) {
            return value != null && value.contains("/terrapedia-images/");
        }

        @Override
        public String localizeImageUrlOrFallback(String sourceUrl, String context) {
            blockingLocalizationCalls++;
            return localizedUrls.getOrDefault(sourceUrl, sourceUrl);
        }

        @Override
        public String localizeCachedImageUrlOrFallback(String sourceUrl, String context) {
            cachedLocalizationCalls++;
            return localizedUrls.get(sourceUrl);
        }

        private int getCachedLocalizationCalls() {
            return cachedLocalizationCalls;
        }

        private int getBlockingLocalizationCalls() {
            return blockingLocalizationCalls;
        }
    }
}
