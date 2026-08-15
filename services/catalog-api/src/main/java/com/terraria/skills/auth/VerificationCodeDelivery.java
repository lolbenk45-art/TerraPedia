package com.terraria.skills.auth;

public interface VerificationCodeDelivery {

    boolean deliver(String email, String subject, String body, String code);
}
