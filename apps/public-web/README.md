# TerraPedia Public Web

`apps/public-web` is the maintained public Nuxt application. Its formal package
identity is `terrapedia-public-web`.

The historical `front-nuxt/` entrypoint was retired after the compatibility
window closure. New commands and documentation use this canonical path.

```bash
cd apps/public-web
pnpm install
pnpm run check
pnpm run dev
```

The application consumes the shared article runtime from
`packages/content-runtime` and resolves backend/image origins through the
project constants and local runtime configuration contract.
