# Article Review Workbench Design

## Goal

Turn the admin article detail experience from an editor-first page into a review-first workbench for user-submitted articles.

The administrator normally does not rewrite user content. The default task is to read the submitted article, check whether it is acceptable, approve it, or reject it with clear feedback for the user. Administrator editing remains an exceptional permission path and is not part of this first implementation.

## Confirmed Scope

- Build the first version as **A + B basic**:
  - A: review console with read-only article preview and a fixed review panel.
  - B: lightweight problem classification for rejection feedback.
- Reuse existing admin article APIs:
  - `GET /admin/articles/:id`
  - `POST /admin/articles/:id/review`
  - `GET /admin/articles/:id/review-logs`
- Keep `/article-editor/new` on the existing writing editor.
- Keep non-pending articles on the existing writing editor for now.
- Route pending review articles through the new review workbench.

## Out Of Scope

- Full paragraph anchoring or inline comment threads.
- Backend schema changes for structured review issues.
- Administrator rich-text editing in the review workbench.
- Multi-reviewer assignment, SLA, or queue ownership.
- Changing public article rendering.

## User Flow

1. Admin opens `文章管理`.
2. A pending article primary action reads `审核文章`.
3. Admin enters `/article-editor/:id`. The list page does not expose direct approve or reject actions for pending rows.
4. If the article is `PENDING_REVIEW`, the page renders the review workbench.
5. The workbench loads article detail and review logs.
6. Admin reads sanitized rich preview and checks article metadata, outline, images, and word count.
7. Admin either:
   - approves the article, or
   - chooses problem categories/scopes, writes rejection feedback, and rejects it.
8. The action uses the existing `reviewArticle` store method.
9. The page refreshes local detail state and review logs after review action.
10. After approve or reject, the workbench remains visible in a completed read-only state with review actions disabled.

## Layout

Desktop:

- Sticky top review bar:
  - back to article list
  - article id/title
  - review status
  - word count, image count, paragraph count
  - secondary `查看审核记录`
  - primary `通过审核`
  - danger `打回修改`
- Main grid:
  - left/main read-only public-style article preview
  - right fixed review panel
- Review panel sections:
  - completion checks
  - lightweight problem scope selector
  - problem type selector
  - rejection textarea
  - recent review log list

Mobile:

- Single-column layout.
- Article preview appears before review controls.
- Review panel becomes a normal block below the preview.

## Rejection Feedback

The first version stores structured choices by composing a readable comment string for the existing backend comment field.

Example:

```text
问题位置：正文段落、图片说明
问题类型：内容描述不清、图片信息缺失
审核说明：第 3 段来源描述不清，请补充来源或游戏内依据。
```

Rejection requires at least one of:

- selected scope
- selected issue type
- free text feedback

Free text is still required before submitting so the user receives an actionable explanation.

## Status And Permissions

- `PENDING_REVIEW`: render review workbench.
- `DRAFT`, `REJECTED`, `APPROVED`, or other states: render the existing editor workspace.
- If an article entered the page as pending review, keep the review workbench visible after the review action so the admin can see final status and logs.
- React to route article ID changes so the page cannot show stale review/editor state when navigating between article details.
- The review workbench does not expose rich-text editing.
- Any future administrator editing must be an explicit "接管编辑" path with audit trail. It is intentionally omitted from this implementation.

## Validation

- Unit contract tests must verify:
  - pending detail route renders `ArticleReviewWorkspace`.
  - pending rows cannot be approved or rejected directly from the list.
  - route and workbench respond to article ID changes.
  - new route still renders `ArticleEditorWorkspace`.
  - review workspace includes read-only preview, approve/reject actions, problem scopes/types, review logs, and existing store calls.
  - article list primary pending action label is `审核文章`.
- Management app checks:
  - `pnpm run test:unit`
  - `pnpm run check`
  - `pnpm run build`

## Review Notes

Cross-review concluded that the original production desk direction was wrong for the clarified workflow. The correct first version is a review-first system: user submits article, admin reviews read-only content, approves or rejects with reasons, and review actions are recorded.
