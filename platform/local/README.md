# Local platform

`platform/local` is the source-of-truth location for Bash-first local stack,
smoke, verification, acceptance, and quality-gate entrypoints.

During the compatibility window, legacy `scripts/dev` is a symlink to this
directory. Both paths must resolve the same files and must not maintain
separate copies.
Run commands from any working directory; entrypoints resolve the repository
root from their own location and retain the existing environment/configuration
precedence.

Primary commands:

```bash
bash platform/local/start-local-stack.sh
bash platform/local/stop-local-stack.sh
bash platform/local/quality-gate.sh
```

The legacy commands under `scripts/dev/` remain supported until the consumer
scan and rollback checkpoint for this migration window are closed.
