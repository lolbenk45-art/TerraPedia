package com.terraria.skills.service;

import java.util.List;

public interface ManagedImageUrlPolicy {

    boolean isManagedImageUrl(String value);

    List<String> trustedManagedImageUrlPrefixes();
}
