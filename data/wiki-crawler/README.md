# Wiki Crawler

`data/wiki-crawler/src` and `data/wiki-crawler/tests` are the NPC wiki crawler tooling kept on the main application branch.

The following directories are treated as rerunnable outputs by default and should not be promoted into long-term mainline facts without milestone validation:

- `data/wiki-crawler/report`
- `data/wiki-crawler/audit`
- `data/wiki-crawler/canonical`
- `data/wiki-crawler/normalized-light`
- `data/generated/wiki-crawler-npc-bridge`

Only promote generated outputs after the corresponding milestone gate is satisfied.
