# TerraPedia Public Web

`apps/public-web` is the maintained public Nuxt application. Its formal package
identity is `terrapedia-public-web`.

During the compatibility window, the historical `front-nuxt/` path is a
symlink to this directory. New commands and documentation use the canonical
path; removing the alias requires a separate consumer-scan checkpoint.

```bash
cd apps/public-web
pnpm install
pnpm run check
pnpm run dev
```

The application consumes the shared article runtime from
`packages/content-runtime` and resolves backend/image origins through the
project constants and local runtime configuration contract.
