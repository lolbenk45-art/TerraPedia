# Crawler V2 System Drawer Design

## Goal

Make the crawler V2 system drawer readable for long diagnostic text and make every listed report visibly openable from the report library.

## Approved Direction

Use the approved vertical workspace layout. The drawer remains a right-side modal but becomes a single vertically scrollable surface. Diagnostic cards, the report library, and V2 automation settings occupy full-width sections in document order instead of competing for fixed equal-height grid rows.

## Layout

- Drawer width increases from 720px to 820px while remaining capped at `100vw`.
- The header remains fixed at the top of the drawer body.
- The content below the header scrolls as one vertical region.
- Diagnostic cards use responsive columns and collapse to one column before text becomes cramped.
- Every diagnostic label, status, and detail uses `min-width: 0` plus wrapping; no ellipsis is used for diagnostic meaning.
- The report library displays category, report name, updated time, size, and an explicit preview affordance.
- V2 automation controls remain a separate final section with 44px controls and the existing save/scan behavior.

## Report Preview

The current report API and `recentReports` overview data remain authoritative. Clicking a report from the system drawer opens the existing report preview above the system drawer, with its own backdrop and close button. The system drawer stays mounted beneath it so closing the preview returns to the same report list position.

## Boundaries

- No backend, crawler, database, report-generation, or automation-policy changes.
- No new report filtering or search in this task.
- Existing destructive-operation confirmations and V2 settings behavior remain unchanged.

## Validation

- Contract tests cover vertical scrolling, diagnostic wrapping, report metadata, and system-overlaid report preview.
- Admin unit tests and Nuxt typecheck pass.
- Authenticated browser checks cover desktop and 375px widths, long diagnostic containment, report click visibility, and horizontal overflow.
