# MinIO bucket inventory audit (2026-05-20)

## Scope

- Plan task: `I-0.4 盘点当前 MinIO bucket 数据`
- Bucket: `wsltest/terrapedia-images`
- Local endpoint from active local config: `http://127.0.0.1:19000`
- Public endpoint from active local config: `http://localhost:9000`
- Goal: record current object count, total size, and whether a backup policy exists.

## Current Runtime Configuration

The checked-in example config defines the TerraPedia bucket contract:

- `scripts/dev/config/local-stack.config.example.json:36-44` sets bucket `terrapedia-images`, default object prefix `items`, and local data dir `~/.local/share/terrapedia/minio/data`.
- `scripts/dev/lib/runtime-config.sh:70-77` maps `TERRAPEDIA_MINIO_*` environment variables into runtime variables.
- `scripts/dev/start-local-stack.sh:278-349` starts local MinIO when enabled and serves a public endpoint proxy when the public port differs from the MinIO endpoint port.

The active private local config is ignored by git and was read only from the main working tree. Its MinIO section currently has:

```json
{
  "enabled": true,
  "endpoint": "http://127.0.0.1:19000",
  "publicEndpoint": "http://localhost:9000",
  "bucket": "terrapedia-images",
  "objectPrefix": "items"
}
```

`mc alias list` shows alias `wsltest` pointing at `http://127.0.0.1:19000`.

## Bucket Usage

`mc stat wsltest/terrapedia-images`:

```text
Total size: 106 MiB
Objects count: 41,108
Versions count: 0
Versioning: Un-versioned
Anonymous: Enabled
ILM: Disabled
```

`mc du wsltest/terrapedia-images`:

```text
106MiB  41108 objects  terrapedia-images
```

Prefix inventory from `mc ls wsltest/terrapedia-images --recursive | awk '{print $NF}' | cut -d/ -f1 | sort | uniq -c | sort -nr`:

```text
38963 items
  984 projectiles
  762 npcs
  337 buffs
   62 bosses
```

Object-size histogram from `mc stat`:

```text
36,319 objects < 1024 B
4,773 objects between 1024 B and 1 MB
16 objects between 1 MB and 10 MB
0 objects >= 10 MB
```

## Backup Policy Search

I searched the repo for MinIO backup/mirror/copy/restore policy references using targeted patterns such as:

```bash
rg -n "(mc mirror|mc replicate|mc admin|mc cp|MinIO backup|minio backup|backup MinIO|backup minio|terrapedia-images.*backup|backup.*terrapedia-images|restore.*terrapedia-images|snapshot.*terrapedia-images|terrapedia-images.*snapshot)" docs project-plan scripts README.md .github
```

No explicit MinIO backup, mirror, replication, lifecycle, or restore policy was found.

Related but non-sufficient evidence:

- `scripts/dev/start-local-stack.sh` can start local MinIO and proxy the public endpoint, but does not mirror or back up objects.
- Existing DB/table backup plans and scripts mention backups, but they do not include the `terrapedia-images` object store.
- Phase 0 task `T-0.4` proposes writing a MinIO object listing into a snapshot, but that is only an inventory, not an object backup.

## Risk Assessment

- The current local bucket is small: 106 MiB and 41,108 objects.
- Versioning is disabled, so overwrite/delete mistakes are not recoverable from bucket versions.
- ILM is disabled, so there is no automatic retention or cleanup policy.
- Anonymous access is enabled for local serving.
- The repo does not currently define a periodic MinIO backup or mirror strategy.

## Recommendation

Before any bulk object migration, cleanup, overwrite, or image-path normalization that touches MinIO content:

- add an explicit object backup or mirror step, for example `mc mirror wsltest/terrapedia-images <backup-target>/terrapedia-images-<timestamp>`;
- record a full object manifest with object key, size, and etag;
- keep T-0.4's `minio-objects.txt`, but do not treat it as sufficient rollback for object content;
- consider enabling versioning for non-throwaway environments if object overwrites become part of the normal workflow.

## I-0.4 Answer

The current `terrapedia-images` bucket contains 41,108 objects totaling 106 MiB. It is un-versioned, has ILM disabled, and no explicit periodic MinIO backup/mirror policy was found in repo scripts or docs.
