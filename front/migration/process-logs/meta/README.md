# Process Logs

This folder stores temporary migration logs for batch execution.

Structure:
- `batches/`: per-batch working logs
- `summaries/`: merged summaries (kept)
- `cleanup/`: cleanup operation records
- `archive/`: optional old summary packs

Rules:
1. Keep logs small and batch-scoped.
2. Do not write unrelated details.
3. After batch completion, merge to one summary markdown and clear that batch temp log.
4. Keep summary files as long-term record.
