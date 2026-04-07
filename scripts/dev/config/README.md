# Local Dev Config

- `local-stack.config.example.json`
  - Committed template for local ports, DB, Redis, auth, and MinIO options
- `local-stack.config.json`
  - Ignored local copy used by `scripts/dev/start-local-stack.ps1` and verification scripts
- `credentials.example.json`
  - Committed MinIO credentials template
- `credentials.json`
  - Ignored local MinIO credential file referenced from `local-stack.config.json`

Recommended setup:

```powershell
Copy-Item .\scripts\dev\config\local-stack.config.example.json .\scripts\dev\config\local-stack.config.json
Copy-Item .\scripts\dev\config\credentials.example.json .\scripts\dev\config\credentials.json
```
