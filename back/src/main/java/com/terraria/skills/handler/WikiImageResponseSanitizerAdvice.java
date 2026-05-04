package com.terraria.skills.handler;

import com.terraria.skills.service.WikiImageLocalizationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.StringHttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

import java.beans.IntrospectionException;
import java.beans.Introspector;
import java.beans.PropertyDescriptor;
import java.lang.reflect.Array;
import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.net.URI;
import java.net.URL;
import java.time.temporal.Temporal;
import java.util.Collection;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.IdentityHashMap;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@RestControllerAdvice
@RequiredArgsConstructor
public class WikiImageResponseSanitizerAdvice implements ResponseBodyAdvice<Object> {

    private static final Pattern URL_PATTERN = Pattern.compile("(?:https?:)?//[^\\s,;\"'<>]+", Pattern.CASE_INSENSITIVE);
    private static final Pattern WHOLE_URL_PATTERN = Pattern.compile("(?:https?:)?//[^\\s,;\"'<>]+", Pattern.CASE_INSENSITIVE);

    private static final Set<String> EXCLUDED_FIELD_NAMES = Set.of(
        "generatorcommand",
        "nextevidencecommand",
        "pageurl",
        "pageurls",
        "sourcepageurl",
        "sourcepageurls",
        "wikipageurl",
        "wikipageurls"
    );
    private static final Set<String> IMAGE_FIELD_NAMES = Set.of(
        "avatarurl",
        "buffimage",
        "cachedurl",
        "coinicons",
        "contenthtml",
        "femaleimages",
        "iconurl",
        "image",
        "imagecachedurl",
        "imageoriginalurl",
        "images",
        "imagepath",
        "imageurl",
        "imageurls",
        "itemimage",
        "itemimageurl",
        "maleimages",
        "npcimage",
        "npcimageurl",
        "originalurl",
        "resultitemimage",
        "resultitemimageurl",
        "specialimages",
        "sourceurl",
        "stationimage",
        "stationimageurl",
        "thumbnailurl",
        "thumbnails",
        "url"
    );
    private static final Set<String> URL_CONTAINER_FIELD_NAMES = Set.of(
        "avatar",
        "buff",
        "coinicons",
        "icon",
        "icons",
        "image",
        "images",
        "media",
        "picture",
        "pictures",
        "thumbnail",
        "thumbnails"
    );
    private static final Set<String> JSON_TEXT_FIELD_NAMES = Set.of(
        "rawjson",
        "sourceitemsjson",
        "sourcenpcsjson"
    );

    private final WikiImageLocalizationService wikiImageLocalizationService;

    @Override
    public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
        return !StringHttpMessageConverter.class.isAssignableFrom(converterType);
    }

    @Override
    public Object beforeBodyWrite(
        Object body,
        MethodParameter returnType,
        MediaType selectedContentType,
        Class<? extends HttpMessageConverter<?>> selectedConverterType,
        ServerHttpRequest request,
        ServerHttpResponse response
    ) {
        return sanitizeResponseBody(body);
    }

    Object sanitizeResponseBody(Object body) {
        return sanitizeValue(body, "body", false, new IdentityHashMap<>(), new LinkedHashMap<>());
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private Object sanitizeValue(
        Object value,
        String context,
        boolean inspectStringValues,
        IdentityHashMap<Object, Object> visited,
        Map<String, String> localizedUrlCache
    ) {
        if (value instanceof String text && inspectStringValues) {
            return localizeStringValue(text, context, true, localizedUrlCache);
        }
        if (value == null || isSimpleValue(value)) {
            return value;
        }
        if (visited.containsKey(value)) {
            return visited.get(value);
        }

        if (value instanceof Map map) {
            return sanitizeMap(map, context, inspectStringValues, visited, localizedUrlCache);
        }
        if (value instanceof java.util.List list) {
            return sanitizeList(list, context, inspectStringValues, visited, localizedUrlCache);
        }
        if (value instanceof Collection<?> collection) {
            return sanitizeCollection(collection, context, inspectStringValues, visited, localizedUrlCache);
        }
        if (value.getClass().isArray()) {
            int length = Array.getLength(value);
            Object replacement = Array.newInstance(value.getClass().getComponentType(), length);
            visited.put(value, replacement);
            for (int index = 0; index < length; index++) {
                Object item = Array.get(value, index);
                String itemContext = context + "[" + index + "]";
                if (item instanceof String text && inspectStringValues) {
                    String localized = localizeStringValue(text, itemContext, true, localizedUrlCache);
                    Array.set(replacement, index, localized);
                    continue;
                }
                Object sanitized = sanitizeValue(item, itemContext, inspectStringValues, visited, localizedUrlCache);
                Array.set(replacement, index, sanitized);
            }
            return replacement;
        }

        return sanitizeBean(value, context, inspectStringValues, visited, localizedUrlCache);
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private Object sanitizeMap(
        Map map,
        String context,
        boolean inspectStringValues,
        IdentityHashMap<Object, Object> visited,
        Map<String, String> localizedUrlCache
    ) {
        Map replacement = new LinkedHashMap();
        visited.put(map, replacement);
        for (Object entryObject : map.entrySet()) {
            Map.Entry entry = (Map.Entry) entryObject;
            Object key = entry.getKey();
            Object value = entry.getValue();
            String fieldName = key == null ? "" : String.valueOf(key);
            String fieldContext = context + "." + fieldName;

            if (value instanceof String text && shouldInspectStringValue(fieldName, inspectStringValues)) {
                String localized = localizeStringValue(text, fieldContext, true, localizedUrlCache);
                replacement.put(key, localized);
                continue;
            }

            Object sanitized = sanitizeValue(
                value,
                fieldContext,
                shouldInspectNestedField(fieldName, inspectStringValues),
                visited,
                localizedUrlCache
            );
            replacement.put(key, sanitized);
        }
        return replacement;
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private Object sanitizeList(
        java.util.List list,
        String context,
        boolean inspectStringValues,
        IdentityHashMap<Object, Object> visited,
        Map<String, String> localizedUrlCache
    ) {
        java.util.List replacement = new java.util.ArrayList<>(list.size());
        visited.put(list, replacement);
        for (int index = 0; index < list.size(); index++) {
            Object item = list.get(index);
            String itemContext = context + "[" + index + "]";
            if (item instanceof String text && inspectStringValues) {
                String localized = localizeStringValue(text, itemContext, true, localizedUrlCache);
                replacement.add(localized);
                continue;
            }
            Object sanitized = sanitizeValue(item, itemContext, inspectStringValues, visited, localizedUrlCache);
            replacement.add(sanitized);
        }
        return replacement;
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private Object sanitizeCollection(
        Collection collection,
        String context,
        boolean inspectStringValues,
        IdentityHashMap<Object, Object> visited,
        Map<String, String> localizedUrlCache
    ) {
        Collection replacement = collection instanceof Set<?> ? new LinkedHashSet<>() : new java.util.ArrayList<>();
        visited.put(collection, replacement);
        int index = 0;
        for (Object item : collection) {
            String itemContext = context + "[" + index + "]";
            if (item instanceof String text && inspectStringValues) {
                String localized = localizeStringValue(text, itemContext, true, localizedUrlCache);
                replacement.add(localized);
            } else {
                Object sanitized = sanitizeValue(item, itemContext, inspectStringValues, visited, localizedUrlCache);
                replacement.add(sanitized);
            }
            index++;
        }

        return replacement;
    }

    private Object sanitizeBean(
        Object value,
        String context,
        boolean inspectStringValues,
        IdentityHashMap<Object, Object> visited,
        Map<String, String> localizedUrlCache
    ) {
        Class<?> type = value.getClass();
        if (shouldSkipBeanType(type)) {
            return value;
        }

        Object replacement = instantiateBean(type);
        if (replacement == null) {
            log.warn("Unable to copy response bean for wiki image sanitation type={} field={}", type.getName(), context);
            return value;
        }
        visited.put(value, replacement);

        try {
            for (PropertyDescriptor descriptor : Introspector.getBeanInfo(type, Object.class).getPropertyDescriptors()) {
                if (descriptor.getReadMethod() == null) {
                    continue;
                }
                Object propertyValue = descriptor.getReadMethod().invoke(value);
                String fieldContext = context + "." + descriptor.getName();

                if (propertyValue instanceof String text && shouldInspectStringValue(descriptor.getName(), inspectStringValues)) {
                    String localized = localizeStringValue(text, fieldContext, true, localizedUrlCache);
                    if (descriptor.getWriteMethod() != null) {
                        descriptor.getWriteMethod().invoke(replacement, localized);
                    } else if (!Objects.equals(localized, text)) {
                        log.warn("Unable to replace wiki image URL in read-only response field={}", fieldContext);
                    }
                    continue;
                }

                Object sanitized = sanitizeValue(
                    propertyValue,
                    fieldContext,
                    shouldInspectNestedField(descriptor.getName(), inspectStringValues),
                    visited,
                    localizedUrlCache
                );
                if (descriptor.getWriteMethod() != null) {
                    descriptor.getWriteMethod().invoke(replacement, sanitized);
                } else if (sanitized != propertyValue) {
                    log.warn("Unable to replace wiki image URL in read-only response field={}", fieldContext);
                }
            }
        } catch (IntrospectionException | IllegalAccessException | InvocationTargetException exception) {
            log.debug("Failed to inspect response body for wiki image URLs type={}", type.getName(), exception);
            return value;
        }
        return replacement;
    }

    private Object instantiateBean(Class<?> type) {
        try {
            Constructor<?> constructor = type.getDeclaredConstructor();
            if (!constructor.canAccess(null)) {
                constructor.setAccessible(true);
            }
            return constructor.newInstance();
        } catch (Exception exception) {
            log.debug("Failed to instantiate response bean copy type={}", type.getName(), exception);
            return null;
        }
    }

    private String localizeIfNeeded(String value, String context, Map<String, String> localizedUrlCache) {
        if (localizedUrlCache.containsKey(value)) {
            return localizedUrlCache.get(value);
        }
        if (!wikiImageLocalizationService.isWikiImageUrl(value) || wikiImageLocalizationService.isManagedImageUrl(value)) {
            localizedUrlCache.put(value, value);
            return value;
        }
        String localized = wikiImageLocalizationService.localizeCachedImageUrlOrFallback(value, context);
        localizedUrlCache.put(value, localized);
        return localized;
    }

    private String localizeStringValue(String value, String context, boolean allowDelimitedUrls, Map<String, String> localizedUrlCache) {
        boolean wholeValueIsWikiImage = WHOLE_URL_PATTERN.matcher(value).matches()
            && wikiImageLocalizationService.isWikiImageUrl(value)
            && !wikiImageLocalizationService.isManagedImageUrl(value);
        if (wholeValueIsWikiImage) {
            return localizeIfNeeded(value, context, localizedUrlCache);
        }
        if (!allowDelimitedUrls) {
            return value;
        }

        Matcher matcher = URL_PATTERN.matcher(value);
        StringBuffer buffer = new StringBuffer();
        boolean changed = false;
        while (matcher.find()) {
            String url = trimTrailingUrlPunctuation(matcher.group());
            String suffix = matcher.group().substring(url.length());
            String localizedUrl = localizeIfNeeded(url, context, localizedUrlCache);
            if (!Objects.equals(localizedUrl, url)) {
                changed = true;
            }
            String replacement = localizedUrl == null ? "" : localizedUrl + suffix;
            matcher.appendReplacement(buffer, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(buffer);
        return changed ? buffer.toString() : value;
    }

    private boolean shouldInspectStringValue(String fieldName, boolean inspectStringValues) {
        String normalized = normalizeFieldName(fieldName);
        if (EXCLUDED_FIELD_NAMES.contains(normalized)) {
            return false;
        }
        return inspectStringValues
            || IMAGE_FIELD_NAMES.contains(normalized)
            || JSON_TEXT_FIELD_NAMES.contains(normalized)
            || normalized.endsWith("imageurl")
            || normalized.endsWith("imagecachedurl")
            || normalized.endsWith("imageoriginalurl");
    }

    private boolean shouldInspectNestedField(String fieldName, boolean parentInspectStringValues) {
        String normalized = normalizeFieldName(fieldName);
        if (EXCLUDED_FIELD_NAMES.contains(normalized)) {
            return false;
        }
        return parentInspectStringValues
            || IMAGE_FIELD_NAMES.contains(normalized)
            || URL_CONTAINER_FIELD_NAMES.contains(normalized)
            || normalized.endsWith("imageurl")
            || normalized.endsWith("imagecachedurl")
            || normalized.endsWith("imageoriginalurl");
    }

    private String normalizeFieldName(String fieldName) {
        return fieldName == null
            ? ""
            : fieldName.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    private String trimTrailingUrlPunctuation(String value) {
        String normalized = value;
        while (!normalized.isEmpty()) {
            char last = normalized.charAt(normalized.length() - 1);
            if (last != ',' && last != ';' && last != ')' && last != ']') {
                break;
            }
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private boolean isSimpleValue(Object value) {
        return value instanceof CharSequence
            || value instanceof Number
            || value instanceof Boolean
            || value instanceof Character
            || value instanceof Enum<?>
            || value instanceof Date
            || value instanceof Temporal
            || value instanceof URI
            || value instanceof URL
            || value instanceof Class<?>;
    }

    private boolean shouldSkipBeanType(Class<?> type) {
        if (type.isPrimitive() || type.isEnum()) {
            return true;
        }
        Package typePackage = type.getPackage();
        if (typePackage == null) {
            return false;
        }
        String packageName = typePackage.getName();
        return packageName.startsWith("java.")
            || packageName.startsWith("jakarta.")
            || packageName.startsWith("javax.")
            || packageName.startsWith("org.springframework.");
    }
}
