# Context Compression Rules

## Core Rule

Minimize repeated input, not just output verbosity.

## Preferred Techniques

- Use `rg` or exact file paths instead of broad directory reads
- Read small slices of logs and source files
- Convert raw findings into a short reusable summary once
- Reuse previous `reports/*.md` or structured outputs when still valid
- Keep one active objective per round when possible

## Avoid

- full-repo scans without a narrow hypothesis
- reading the same report multiple times in the same task
- mixing implementation, audit, reporting, and git cleanup in one rolling context
- copying large command output into summaries
- rereading generated JSON when a derived markdown summary already exists

## Practical Thresholds

- Prefer reading at most one report before opening raw inputs
- Prefer reading the smallest relevant log tail first
- Prefer a file whitelist over an open-ended directory search
- After a major finding, stop and compress it into 3 to 7 bullets before more exploration

## Summary Discipline

A reusable summary should answer:

- what the task is
- what files matter
- what has been confirmed
- what changed
- what remains open

If the summary cannot replace earlier conversation, it is still too verbose or too vague.
