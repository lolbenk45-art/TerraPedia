---
name: xlab-image-generation
description: Use when the user wants Codex to generate images through the local XLab gpt-image-2 setup, including requests to make, create, preview, or save AI-generated raster images from prompts using scripts/tooling/image-2/xlab.json.
---

# XLab Image Generation

Generate raster images through the repository-local XLab API configuration.

## Workflow

1. Treat `scripts/tooling/image-2/xlab.json` as a local secret. Never print its contents, API key, request headers, or raw API response.
2. Use the bundled generator script:

```bash
node scripts/tooling/image-2/generate-image.mjs \
  --prompt "<image prompt>" \
  --output-dir scripts/tooling/image-2/generated
```

3. If the user wants a custom filename stem, add `--filename-prefix "<slug>"`.
4. If the user asks for a model change, pass `--model "<model>"`; otherwise keep the default `gpt-image-2`.
5. Report only the saved image path, dimensions or file size if checked, and the prompt used.

## Validation

- Run `node --test scripts/tooling/image-2/generate-image.test.mjs` after editing the script.
- For live generation, verify the saved file with `file <path>` or an equivalent image check before claiming success.

## Failure Handling

- `Config file not found`: ask the user to restore `scripts/tooling/image-2/xlab.json`.
- `Config is missing apikey` or `baseURL`: report the missing field name only.
- HTTP errors: summarize the status and non-sensitive message; do not paste raw response bodies.
