# Canonicalization Scripts

This directory contains the minimal P0.2 canonical candidate skeleton.

## Boundaries

- Read-only inputs come from landing-compatible business data sources.
- Candidate artifacts must write to `reports/canonical/candidates/{domain}/`.
- Large candidate payloads are stored under `payloads/`; `canonical-candidates.json` is an index artifact.
- Do not write DB state.
- Do not add any apply behavior here.
- Candidate artifacts are not a source of truth and must not be consumed by maint, import, or domain acceptance flows.
