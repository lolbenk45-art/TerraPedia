# Local platform

`platform/local` is the source-of-truth location for Bash-first local stack,
smoke, verification, acceptance, and quality-gate entrypoints.

The former `scripts/dev` entrypoint was removed when the compatibility window
closed. This is the only maintained local-platform source.
Run commands from any working directory; entrypoints resolve the repository
root from their own location and retain the existing environment/configuration
precedence.

Primary commands:

```bash
bash platform/local/start-local-stack.sh
bash platform/local/stop-local-stack.sh
bash platform/local/quality-gate.sh
```
