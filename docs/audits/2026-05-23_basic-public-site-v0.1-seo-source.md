# Basic Public Site V0.1 SEO Source - 2026-05-23

## Source Disclaimer

- About page states TerraPedia is an unofficial Terraria Chinese reference site.
- About page states the baseline data uses public materials and project-maintained data processed through the project data chain.
- About page states Terraria names, images, and trademarks belong to their rights holders.
- About page states content will keep being corrected as data maintenance changes.

## Sitemap Status

- Command: `printf 'TERRAPEDIA_PUBLIC_SITE_ORIGIN=%s\n' "${TERRAPEDIA_PUBLIC_SITE_ORIGIN:-}"`
- Result: `TERRAPEDIA_PUBLIC_SITE_ORIGIN=`
- Decision: sitemap blocked because public HTTPS site origin is not confirmed.
- File action: `front-nuxt/public/sitemap.xml` was not created.

## Robots Status

- File: `front-nuxt/public/robots.txt`
- Result: allows public crawling but does not advertise a sitemap until canonical HTTPS origin is confirmed.
