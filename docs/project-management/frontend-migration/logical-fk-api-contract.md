# Logical FK API Contract (Frontend Integration)

Date: 2026-03-28
Scope: `front` integration with backend write APIs

## Mandatory Rule

- Database layer must not use physical foreign keys.
- Relation checks must be logical only (`*_id` + index + service validation).

## Response Metadata (Recommended)

Backend write APIs should return these optional fields in `ApiResponse`:

- `logicalReferenceStatus`: array of relation check results
- `traceId`: request trace id for diagnostics
- `deferredCheckId`: async/deferred validation job id (if used)

## Frontend Handling

1. Frontend remains backward compatible when metadata is absent.
2. If `logicalReferenceStatus` exists and contains non-`OK` results, log a warning for troubleshooting.
3. UI-level blocking behavior should be decided by product/UX policy, not hardcoded by default in API layer.

## Suggested Status Values

- `OK`
- `MISSING`
- `INVALID_STATE`
- `DEFERRED`

## Example Payload (Write API)

```json
{
  "success": true,
  "message": "ok",
  "statusCode": 200,
  "data": { "id": 123 },
  "traceId": "req-abc-123",
  "logicalReferenceStatus": [
    { "name": "article_author", "result": "OK" }
  ]
}
```
