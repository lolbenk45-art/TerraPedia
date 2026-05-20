# Skills Backend API

Backend service for TerraPedia.

## Local Requirements

- Java 17+
- Maven 3.6+
- MySQL 8+
- Redis

## Local Databases

The backend uses `terria_v1_local` for the primary application schema. Some data-source and image sync flows also read and update the maint and relation schemas:

- `terria_v1_local`
- `terria_v1_maint`
- `terria_v1_relation`

Default connection:

```powershell
$env:TERRAPEDIA_DB_URL="jdbc:mysql://localhost:3306/terria_v1_local?createDatabaseIfNotExist=true&useUnicode=true&characterEncoding=utf-8&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true"
$env:TERRAPEDIA_DB_USERNAME="root"
$env:TERRAPEDIA_DB_PASSWORD="<local-db-password>"
$env:TERRAPEDIA_ADMIN_PASSWORD="<local-admin-password>"
$env:TERRAPEDIA_AUTH_TOKEN_SECRET="<local-admin-token-secret>"
$env:TERRAPEDIA_USER_TOKEN_SECRET="<local-user-token-secret>"
```

If your maint or relation schemas use non-default names, configure the cross-database schema names before starting the backend:

```powershell
$env:TERRAPEDIA_DB_MAINT="terria_v1_maint"
$env:TERRAPEDIA_DB_RELATION="terria_v1_relation"
```

Copy `scripts/dev/config/local-stack.config.example.json` to `scripts/dev/config/local-stack.config.json` and keep the real values only in the ignored local file.

## Start And Stop

Start the full local stack from the repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\start-local-stack.ps1
```

This is the only supported local start entrypoint.

Stop the full local stack:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\stop-local-stack.ps1
```

## Build And Test

```powershell
cd back
mvn test
mvn clean package
```

## Cloudflare Challenge Fallback

Wiki requests normally go through `scripts/data/lib/wiki-request-gate.mjs`. On Linux or WSL, set `TERRAPEDIA_FLARESOLVERR_URL` to enable FlareSolverr as the Cloudflare fallback:

```powershell
$env:TERRAPEDIA_FLARESOLVERR_URL="http://127.0.0.1:8191/v1"
```

For the local stack, set `"flaresolverr.enabled": true` in `scripts/dev/config/local-stack.config.json`; `scripts/dev/start-local-stack.sh` will start or reuse the `terrapedia-flaresolverr` Docker container and export the same URL.

If FlareSolverr is offline, the wiki gate treats fallback failure as retryable Cloudflare pressure. It increments the gate failure counters, enters cooldown after the configured threshold, and writes the existing crawler alert record instead of silently bypassing the gate.

## Local URLs

- Backend API: `http://localhost:18088/api`
- Swagger UI: `http://localhost:18088/api/swagger-ui.html`
