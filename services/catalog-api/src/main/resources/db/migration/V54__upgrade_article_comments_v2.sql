ALTER TABLE article_comments
  ADD COLUMN parent_id BIGINT NULL AFTER article_id,
  ADD COLUMN root_id BIGINT NULL AFTER parent_id,
  ADD COLUMN reply_to_user_id BIGINT NULL AFTER author_id,
  ADD COLUMN like_count INT NOT NULL DEFAULT 0 AFTER content,
  ADD COLUMN reply_count INT NOT NULL DEFAULT 0 AFTER like_count,
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED' AFTER reply_count,
  ADD COLUMN deleted_by_type VARCHAR(20) NULL AFTER deleted,
  ADD COLUMN deleted_by_id BIGINT NULL AFTER deleted_by_type,
  ADD COLUMN deleted_by_name VARCHAR(120) NULL AFTER deleted_by_id,
  ADD COLUMN deleted_reason VARCHAR(300) NULL AFTER deleted_by_name,
  ADD COLUMN deleted_at DATETIME NULL AFTER deleted_reason,
  ADD INDEX idx_article_comments_article_root_created (article_id, root_id, deleted, status, created_at, id),
  ADD INDEX idx_article_comments_article_parent_created (article_id, parent_id, deleted, status, created_at, id),
  ADD INDEX idx_article_comments_reply_user (reply_to_user_id, deleted, created_at);

UPDATE article_comments
SET status = CASE WHEN deleted = 1 THEN 'DELETED' ELSE 'PUBLISHED' END,
    root_id = id,
    like_count = 0,
    reply_count = 0
WHERE parent_id IS NULL
  AND root_id IS NULL;

CREATE TABLE IF NOT EXISTS article_comment_likes (
  id BIGINT NOT NULL AUTO_INCREMENT,
  comment_id BIGINT NOT NULL,
  article_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  deleted TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_article_comment_likes_comment_user (comment_id, user_id),
  KEY idx_comment_likes_article_user (article_id, user_id, deleted),
  KEY idx_comment_likes_comment (comment_id, deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
