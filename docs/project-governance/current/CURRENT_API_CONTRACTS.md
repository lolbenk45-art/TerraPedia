# Current API Contracts

Status: current
Last updated: 2026-07-16

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

## Concrete Response Formats

Use these concrete formats when documenting new endpoints, writing endpoint
tests, or recording API smoke evidence.

Success detail response:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Example"
  },
  "message": "操作成功",
  "statusCode": 200
}
```

Success list response without pagination:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Example"
    }
  ],
  "message": "操作成功",
  "statusCode": 200
}
```

Success paginated response:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Example"
    }
  ],
  "message": "操作成功",
  "statusCode": 200,
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 20,
    "size": 20,
    "totalPages": 1
  }
}
```

Validation or bad-request response:

```json
{
  "success": false,
  "message": "参数验证失败：name must not be blank",
  "statusCode": 400
}
```

Authentication failure response:

```json
{
  "success": false,
  "message": "未登录或登录状态已失效",
  "statusCode": 401
}
```

Permission failure response:

```json
{
  "success": false,
  "message": "Forbidden",
  "statusCode": 403
}
```

Server failure response:

```json
{
  "success": false,
  "message": "系统繁忙，请稍后重试",
  "statusCode": 500
}
```

Mutation response:

```json
{
  "success": true,
  "data": {
    "id": 1
  },
  "message": "Created",
  "statusCode": 200
}
```

Empty success response:

```json
{
  "success": true,
  "message": "操作成功",
  "statusCode": 200
}
```

Upload response:

```json
{
  "success": true,
  "data": {
    "bucket": "terrapedia-images",
    "objectKey": "uploads/example.png",
    "url": "/terrapedia-images/uploads/example.png",
    "originalFilename": "example.png",
    "contentType": "image/png",
    "size": 12345
  },
  "message": "Upload success",
  "statusCode": 200
}
```

Contract notes:

- `data` can be an object, array, primitive, or omitted/null for empty success.
- `pagination` belongs at the top level for new paginated APIs.
- `statusCode` in the JSON body should match the intended HTTP status when a
  controller returns a non-200 `ResponseEntity`.
- Do not add `code`, `error`, `meta`, or nested pagination for new APIs unless
  the route is intentionally preserving a legacy contract.
- Do not document secrets, tokens, full cookies, or private file keys in example
  payloads. Use redacted placeholders in test evidence.

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

## Endpoint Contract Format

Use this Markdown shape when a task adds or materially changes an endpoint.
Small internal-only changes can keep the record in the task devlog, but public,
admin, user, or cross-surface changes should update the durable contract doc or
a focused contract file under `docs/contracts/`.

````md
### METHOD /api/<route>

- Status: current | planned | legacy-compatible | deprecated
- Owner surface: public frontend | admin/data-query | user module | backend-only
- Backend source: `back/src/main/java/.../Controller.java`
- Request DTO: `...RequestDTO`
- Response DTO: `...ResponseDTO`
- Auth: public | admin Bearer | user cookie/Bearer | service/internal
- Query params:
  - `page`: number, optional, default `1`
  - `limit`: number, optional, default `20`
- Request body:

```json
{
  "field": "value"
}
```

- Success response:

```json
{
  "success": true,
  "data": {},
  "message": "操作成功",
  "statusCode": 200
}
```

- Error responses:
  - `400`: validation or bad request
  - `401`: unauthenticated
  - `403`: forbidden
  - `404`: not found
- Frontend consumers:
  - `front-nuxt/...`
  - `data-query-app/...`
- Compatibility notes:
  - none
- Validation:
  - backend focused test
  - frontend check or contract script
  - optional runtime smoke evidence path
````

Keep endpoint examples short. If a response has many fields, include the fields
that define the contract and link to DTO/source or an artifact for the full
runtime payload.

### GET /api/categories/navigation

- Status: current
- Owner surface: public frontend
- Backend source:
  - `back/src/main/java/com/terraria/skills/controller/CategoryController.java`
  - `back/src/main/java/com/terraria/skills/service/impl/CategoryNavigationServiceImpl.java`
- Response DTO: `CategoryNavigationVO` with `CategoryNavigationChildVO`
- Auth: public
- Query params: none
- Example note: the response below is an abbreviated 2026-07-16 local-data
  snapshot; `categoryIds`, `children`, and counts can change after a data
  refresh.
- Success response:

```json
{
  "success": true,
  "data": [
    {
      "slug": "weapons",
      "filterKey": "weapon",
      "name": "武器",
      "categoryPath": "/categories/weapons",
      "itemPath": "/items?filter=weapon",
      "categoryCodes": ["WEAPON"],
      "categoryIds": [271, 314, 315, 317, 318],
      "itemCount": 488,
      "children": [
        {
          "id": 315,
          "code": "WEAPON_MELEE",
          "name": "近战武器"
        }
      ]
    }
  ],
  "message": "操作成功",
  "statusCode": 200
}
```

- Ordering and scope:
  - exactly six entries in `weapons`, `armor`, `potions`, `materials`,
    `furniture`, and `tools` order;
  - `categoryIds` contains each configured category and all descendants;
  - `itemCount` uses the public item-list predicate: primary category or active
    `item_category_rel`, with one count row per item.
- Error response:
  - `503`: any configured category code is missing; `success=false`,
    `statusCode=503`, and no partial `data` list.
- Frontend consumers:
  - `front-nuxt/pages/categories/index.vue`
  - `front-nuxt/pages/categories/[id].vue`
  - `front-nuxt/pages/items/index.vue`
- Compatibility notes:
  - existing `/api/categories` and `/api/categories/items` responses remain
    unchanged;
  - catalog filters outside the six navigation entries retain their existing
    frontend category-code behavior.
- Validation:
  - `CategoryNavigationServiceImplTest`
  - `CategoryControllerTest`
  - `ItemMapperPreferredImageSqlTest#categoryScopedCountShouldMatchPrimaryOrActiveRelationWithoutDuplicateRows`
  - `front-nuxt/scripts/check-category-navigation-contract.mjs`
  - restarted local-stack API and page acceptance recorded in the task devlog.

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

## API Test Evidence Format

API test return data is needed when a task claims runtime behavior, route
readiness, release readiness, or a fixed API regression. Do not paste large
payloads into governance docs. Record compact evidence in devlog and put full
machine-readable output under `reports/` when useful.

Minimum devlog evidence for an API test:

```md
- Command or tool: `curl ...` / focused test name / smoke script
- Environment: local stack, backend origin, database name if relevant
- Endpoint: `METHOD /api/<route>`
- Auth mode: public | admin Bearer | user cookie/Bearer | redacted
- HTTP status: 200
- Envelope: `success=true`, `statusCode=200`, `pagination.total=<n>` if relevant
- Response sample: compact redacted JSON or artifact path
- Assertion: what the result proves
- Limitation: what was not tested
```

Preferred artifact shape under `reports/api-smoke/`:

```json
{
  "runId": "2026-07-09T23-31-00-current-api-contract",
  "createdAt": "2026-07-09T23:31:00+08:00",
  "environment": {
    "backendOrigin": "http://localhost:18088",
    "database": "terria_v1_local"
  },
  "checks": [
    {
      "name": "public-items-first-page",
      "method": "GET",
      "path": "/api/public/items?page=1&limit=1",
      "auth": "public",
      "httpStatus": 200,
      "success": true,
      "statusCode": 200,
      "pagination": {
        "total": 1,
        "page": 1,
        "limit": 1,
        "totalPages": 1
      },
      "sample": {
        "dataType": "array",
        "count": 1,
        "firstItemKeys": ["id", "name"]
      },
      "redactions": [],
      "passed": true
    }
  ]
}
```

Rules for returned data:

- Keep full raw response only in generated artifacts when it is useful for
  debugging or review.
- Promote durable conclusions, not long payloads, into `docs/audits/`.
- Redact tokens, cookies, email addresses, private object keys, and any local
  secrets.
- For paginated endpoints, record both HTTP/envelope status and pagination
  totals or count assertions.
- For mutation endpoints, record the created/updated identifier and cleanup or
  rollback behavior if the test writes data.
- For file/upload endpoints, record content type, size, object key shape, and
  URL shape; do not paste binary data.
- For negative tests, record the expected HTTP status, `success=false`, message
  class, and the request field or auth condition that caused the failure.

## Known Gaps

- This repository does not currently track a generated static OpenAPI artifact
  as current authority.
- The route list above is a family-level summary, not an exhaustive endpoint
  catalog.
- Some legacy public/admin shapes are normalized defensively in frontend code.
  Treat those as compatibility debt, not a pattern for new APIs.
- Current governance work did not run backend, frontend, runtime, database, or
  full quality gates.
