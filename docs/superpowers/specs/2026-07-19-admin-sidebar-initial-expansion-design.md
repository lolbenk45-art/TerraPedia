# Admin Sidebar Initial Expansion Design

## Goal

Make the expanded admin sidebar start with only the section containing the
current route open. After that initial setup, preserve every manual section
toggle for the lifetime of the mounted admin layout.

## Behavior

- On each fresh admin layout mount, treat every menu section as collapsed.
- Find the current route's active menu entry and expand only its owning section.
- On `/`, expand `资料目录` so the active `仪表盘` link is visible.
- After initialization, section buttons remain independent toggles. Users may
  open multiple sections or close the active section.
- Route changes inside the mounted layout must not automatically expand or
  collapse any section. They may still update the active link and close mobile
  navigation as today.
- A browser refresh or a new admin layout mount performs the initial reset
  again using that entry route.

## State Model

- Keep desktop sidebar width collapse preference persisted.
- Stop treating section expansion as a durable preference across layout mounts.
- Add one store operation that receives all section labels plus the active
  section label, then atomically sets the collapsed list to every non-active
  label.
- Keep the existing manual toggle API unchanged.
- Remove the obsolete one-time default seeding flag and section-level
  `defaultCollapsed` metadata.

## Accessibility And Layout

- Preserve existing `aria-expanded`, keyboard-focus styles, counts, icons,
  compact desktop sidebar, and mobile navigation behavior.
- Preserve active-link scrolling on initial mount without mutating section
  expansion on later route changes.
- Make no visual styling changes.

## Validation

- Store behavior tests prove initialization collapses all non-active sections
  and replaces stale persisted section state.
- Layout contracts prove initialization runs once on mount and route watchers do
  not expand or reset sections.
- Focused sidebar tests and Admin typecheck pass.
- Runtime verification covers `/`, a route in another group, manual multi-group
  expansion, and navigation after manual toggles.

## Scope

- `data-query-app/layouts/default.vue`
- `data-query-app/stores/uiPreferences.ts`
- Focused sidebar/store tests
- Devlog and implementation plan

## Out Of Scope

- Dashboard, login, article editor, menu taxonomy, sidebar visual styling,
  backend behavior, data changes, merge, push, or worktree cleanup.
