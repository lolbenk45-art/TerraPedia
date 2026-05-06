# Wiki Crawler

Crawler source and crawler tests now live under `scripts/data/crawler/src` and `scripts/data/crawler/tests`.
`data/wiki-crawler/` is reserved for crawler data, reports, normalized outputs, and other rerunnable artifacts.

The following directories are treated as rerunnable outputs by default and should not be promoted into long-term mainline facts without milestone validation:

- `data/wiki-crawler/report`
- `data/wiki-crawler/audit`
- `data/wiki-crawler/canonical`
- `data/wiki-crawler/normalized-light`
- `data/generated/wiki-crawler-npc-bridge`

Only promote generated outputs after the corresponding milestone gate is satisfied.
