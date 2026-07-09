# Current API Contracts

Status: current
Last updated: 2026-07-09

This file is the current API contract entrypoint for TerraPedia development. It
summarizes the source-of-truth order, route families, response envelope,
authentication boundaries, frontend API clients, and validation expectations.
It is a document-level contract summary, not generated OpenAPI evidence and not
runtime smoke evidence.

## Source Of Truth

Use this order when API documentation and implementation disagree:

1. Running route behavior in the correct local stack.
2. Backend controllers under `back/src/main/java/com/terraria/skills/controller/`.
3. DTOs under `back/src/main/java/com/terraria/skills/dto/`.
4. Shared response and error handling:
   - `back/src/main/java/com/terraria/skills/common/ApiResponse.java`
   - `back/src/main/java/com/terraria/skills/handler/GlobalExceptionHandler.java`
5. Authentication and request interceptors:
   - `back/src/main/java/com/terraria/skills/auth/`
   - `back/src/main/java/com/terraria/skills/config/WebConfig.java`
6. Frontend API clients and call sites:
   - `front-nuxt/composables/usePublicApi.ts`
   - `front-nuxt/composables/useUserApi.ts`
   - `data-query-app/composables/useApi.ts`
7. Generated OpenAPI from a running backend:
   - `/api/v3/api-docs`
   - `/api/swagger-ui.html`
8. This summary document.

The backend servlet context path is `/api`, configured in
`back/src/main/resources/application.yml`. Controller mappings are written
without that servlet prefix, so a controller route such as `/public/items` is
reached through `/api/public/items` from Nuxt/browser clients.

## Frontend Proxy Boundary

Both maintained Nuxt apps proxy `/api` to the Spring Boot backend in development:

| App | Config | API client boundary |
| --- | --- | --- |
| Public frontend | `front-nuxt/nuxt.config.ts` | `front-nuxt/composables/usePublicApi.ts` and `useUserApi.ts` |
| Admin/data-query frontend | `data-query-app/nuxt.config.ts` | `data-query-app/composables/useApi.ts` |

Rules:

- Frontend code should call logical backend paths such as `/public/items`,
  `/user-auth/login`, or `/admin/items`; the Nuxt API client adds or proxies the
  `/api` boundary.
- Do not hardcode backend origins in page or component code. Use runtime config
  and the existing composables.
- SSR requests that need backend access must use the server-side base configured
  by the app, not browser-only assumptions.
- Image/object URLs are separate from API contracts and use the
  `/terrapedia-images` or file-object handling documented by the relevant image
  and storage code.

## Response Envelope

The default backend envelope is:

```json
{
  "success": true,
  "data": {},
  "message": "操作成功",
  "statusCode": 200,
  "pagination": {
    "total": 0,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

Current rules:

- Use `ApiResponse<T>` as the default response wrapper for JSON APIs.
- Success responses set `success=true`, `statusCode=200`, and place the payload
  in `data`.
- Error responses set `success=false`, carry `message`, and use the matching
  `statusCode` where the handler or controller defines one.
- Paginated list APIs should prefer top-level `pagination` on the envelope.
- Existing frontend normalizers tolerate older shapes such as nested
  `data.pagination`, `data.page`, `page`, or `meta`. New APIs should not add new
  shapes without a compatibility reason and matching tests.
- `Pagination` fields in current frontend types are `total`, `page`, `limit`,
  optional `size`, and `totalPages`.

## Error Boundary

Current global error handling maps common failures into `ApiResponse`:

| Condition | HTTP status | Contract behavior |
| --- | --- | --- |
| Missing route/resource | 404 | `success=false`, resource message. |
| Validation or argument error | 400 | `success=false`, validation/argument message. |
| Admin access denied | 403 | `success=false`, access-denied message. |
| Crawler monitor Redis unavailable | 503 | `success=false`, service-unavailable message. |
| Unhandled runtime/system error | 500 | `success=false`, generic user-facing message. |

Route-specific controllers may still return explicit `ResponseEntity` statuses,
for example login failures or rate-limit responses. Preserve the envelope shape
when adding those exceptions.

## Authentication Boundary

Admin authentication:

- Admin login route: `POST /api/auth/login`.
- Admin current-user route: `GET /api/auth/me`.
- Admin token style: `Authorization: Bearer <token>`.
- The admin interceptor protects `/admin/**`, `/auth/me`,
  `/statistics/admin/**`, write access to `/items/**` and `/categories/**`,
  `/items/import/**`, and protected file routes.
- `data-query-app/composables/useApi.ts` reads the admin token cookie
  `tp_admin_token` and adds the Bearer header.

User authentication:

- User auth routes live under `/api/user-auth/**`.
- User sessions use HTTP-only access and refresh cookies from
  `UserAuthController`; the interceptor also accepts `Authorization: Bearer`
  for compatible clients.
- Protected user routes include `/user/favorites`, `/user/history`,
  `/user/saved-routes`, `/user/notifications`, `/user/preferences`,
  `/user/articles`, selected `/user-auth/*` routes, and article-comment write
  actions.
- Cookie-backed user write requests are guarded by local-origin checks in
  `UserWriteOriginInterceptor`.
- `front-nuxt/composables/useUserApi.ts` uses `credentials: include` and
  forwards server-side cookies where needed.

Public read APIs:

- `/public/**` routes are public-read oriented.
- Legacy public read routes such as `/items`, `/categories`, `/articles`,
  `/biomes`, `/npcs`, `/statistics/overview`, and `/users/{id}` still exist.
  Prefer `/public/**` for new public domain APIs unless a current caller or
  compatibility requirement needs the older route family.

## Route Families

Current backend route families are grouped as follows.

| Family | Examples | Primary consumer |
| --- | --- | --- |
| Public catalog/domain | `/public/items`, `/public/bosses`, `/public/npcs`, `/public/buffs`, `/public/projectiles`, `/public/armor-sets`, `/public/biomes`, `/public/home/focus-item`, `/public/content-references` | `front-nuxt/` public pages and article editor references |
| Public legacy/read | `/items`, `/categories`, `/articles`, `/biomes`, `/npcs`, `/statistics/overview`, `/users/{id}` | Existing public/admin callers; compatibility surface |
| User account/content | `/user-auth`, `/user/articles`, `/user/favorites`, `/user/history`, `/user/saved-routes`, `/user/notifications`, `/user/preferences`, article comment write routes | `front-nuxt/` user module |
| Admin CRUD/domain | `/admin/items`, `/admin/categories`, `/admin/buffs`, `/admin/biomes`, `/admin/npcs`, `/admin/bosses`, `/admin/projectiles`, `/admin/armor-sets`, `/admin/world-contexts`, `/admin/condition-terms` | `data-query-app/` admin views |
| Admin operations | `/admin/crawler-monitor`, `/admin/domain-acceptance`, `/admin/data-source-acceptance`, `/admin/operations/classification-audit`, `/admin/relation`, `/admin/storage`, `/admin/audio-assets`, `/admin/recipe-imports` | `data-query-app/` operations views |
| Files/storage | `/files/images`, `/files/objects/{objectKey}` | Public/user/admin upload and object access |

When adding a route, choose the family first. Do not add a public route under
`/admin/**`, or an admin-only route under `/public/**`, just because the caller
is convenient.

## DTO And Type Boundary

Backend:

- Request and response DTOs belong under `back/src/main/java/com/terraria/skills/dto/`.
- Controller methods should expose DTOs rather than entity objects unless an
  existing route is intentionally legacy.
- Validation annotations on request DTOs are part of the API contract.
- Multipart routes must declare `MediaType.MULTIPART_FORM_DATA_VALUE`.

Frontend:

- Public frontend types live mainly in `front-nuxt/types/public-api.ts` and
  nearby composables.
- Admin frontend types may be local to stores/pages or shared composables.
- When a backend response changes, update the matching frontend type,
  normalizer, and contract tests or page checks in the same task.

## Change Rules

Before changing an API route, request body, response shape, auth behavior, or
pagination behavior:

1. Identify current backend controller, DTO, service caller, and frontend call
   sites.
2. Decide whether the change is backward-compatible.
3. Update backend DTO/controller and frontend types/normalizers together.
4. Preserve `ApiResponse` unless the endpoint is intentionally streaming,
   file/object access, or another documented exception.
5. Add or update focused backend/frontend tests for the changed contract.
6. Update this file when the change alters route families, response envelope,
   auth boundaries, frontend API client behavior, or OpenAPI location.
7. Record task validation and residual risk in devlog.

## Validation

Use the narrowest validation that proves the API contract change:

- Docs-only API contract changes:
  - `git diff --check`
  - targeted scans for linked paths, route family names, and stale/current
    routing.
- Backend API behavior changes:
  - focused Maven tests for the changed controller/service/DTO path.
  - OpenAPI or route smoke only when runtime behavior matters.
- Public frontend API consumption changes:
  - `cd front-nuxt && pnpm run check`
  - relevant contract/page scripts when they cover the changed surface.
- Admin API consumption changes:
  - `cd data-query-app && pnpm run check` or `pnpm run test`
  - relevant store/page tests when they cover the changed surface.
- Cross-surface or release-sensitive changes:
  - `bash ./scripts/dev/quality-gate.sh`, or scoped skip flags with the
    limitation recorded.

Do not claim API runtime readiness from this document alone. Runtime readiness
requires a running stack, route checks, and recorded evidence.

## Known Gaps

- This repository does not currently track a generated static OpenAPI artifact
  as current authority.
- The route list above is a family-level summary, not an exhaustive endpoint
  catalog.
- Some legacy public/admin shapes are normalized defensively in frontend code.
  Treat those as compatibility debt, not a pattern for new APIs.
- Current governance work did not run backend, frontend, runtime, database, or
  full quality gates.
