// Shared status label maps for the user article surfaces (my-articles list and
// the two editors). Kept in one place so the review/publish wording stays in
// sync across pages instead of drifting between copied maps.

const reviewStatusLabels: Record<string, string> = {
  DRAFT: '草稿',
  PENDING_REVIEW: '待审核',
  APPROVED: '已通过',
  REJECTED: '已退回',
}

const articleStatusLabels: Record<string, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  OFFLINE: '已下架',
}

export const formatReviewStatus = (status: string): string => reviewStatusLabels[status] || status

export const formatArticleStatus = (status: string): string => articleStatusLabels[status] || status
