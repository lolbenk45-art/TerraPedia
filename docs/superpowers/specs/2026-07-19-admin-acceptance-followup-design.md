# Admin Acceptance Follow-up Design

## Goal

Resolve the two user-acceptance findings on `fix/admin-p1-p2-batch`: restore the established login-page visual style from Git and make the admin article editor expose the same enhanced article rendering that the public article page shows.

## Login Restoration

- Treat Git as the visual authority rather than inventing another palette.
- Restore the complete scoped `<style>` block from `3a1d178^:data-query-app/pages/login.vue`.
- Keep the current Lucide `Package` icon introduced by `7549fae5`; do not restore the former emoji.
- Keep the current template, login behavior, authentication flow, copy, and accessibility semantics.
- Add a contract that locks the restored background, card, logo, input, button, and copy colors so another token migration cannot silently recreate the regression.

## Article Editor Rendering

- Article `31` proves this is not stale data: the public API returns intact `tp-content-ref` nodes, two empty `tp-recipe-tree` embed placeholders, and the body image.
- The public page enhances those placeholders at runtime. The admin editor currently assigns the raw HTML directly to `contenteditable`, so empty recipe-tree placeholders have no visible editing surface.
- Keep the editor DOM as the only save source. Runtime-rendered graph DOM must never be serialized into `contentHtml`.
- Add an `编辑` / `前台效果` view switch to `ArticleEditorWorkspace.vue`.
- In preview mode, render `editor.previewHtml` through the existing `AdminArticleRuntimePreview`, which already uses the shared recipe hierarchy renderer and admin theme.
- Disable editing toolbar controls only through the existing edit view; switching back restores the same editor content without fetching or rewriting article data.

## Validation

- Observe focused contract failures before implementation.
- Pass focused login/article contracts and admin typecheck.
- Verify article `31` shows both recipe-tree graphs in the preview view while its editor HTML remains unchanged.
- Verify the restored login page visually at `1280x900`.
- Keep the worktree running on ports `13010`, `15183`, and `18197` for user re-acceptance.

## Out Of Scope

- No database migration or article content rewrite.
- No change to the public article renderer.
- No global design-token change.
- No merge, push, or worktree cleanup.
