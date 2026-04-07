# Skills Backend API

Backend service for TerraPedia.

## Local Requirements

- Java 17+
- Maven 3.6+
- MySQL 8+
- Redis

## Local Database

Only one local database is supported:

- `terria_v1_local`

Default connection:

```powershell
$env:TERRAPEDIA_DB_URL="jdbc:mysql://localhost:3306/terria_v1_local?createDatabaseIfNotExist=true&useUnicode=true&characterEncoding=utf-8&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true"
$env:TERRAPEDIA_DB_USERNAME="root"
$env:TERRAPEDIA_DB_PASSWORD="<local-db-password>"
$env:TERRAPEDIA_ADMIN_PASSWORD="<local-admin-password>"
$env:TERRAPEDIA_AUTH_TOKEN_SECRET="<local-admin-token-secret>"
$env:TERRAPEDIA_USER_TOKEN_SECRET="<local-user-token-secret>"
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

## Local URLs

- Backend API: `http://localhost:8888/api`
- Swagger UI: `http://localhost:8888/api/swagger-ui.html`
