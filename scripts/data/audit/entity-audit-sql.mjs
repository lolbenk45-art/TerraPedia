export function getBuffAuditStatsSql() {
  return `
    SELECT COUNT(*) AS total,
           SUM(name_zh IS NOT NULL AND TRIM(name_zh) <> '') AS zh_name,
           SUM(image LIKE 'http://localhost:9000/%') AS minio_image
    FROM buffs
    WHERE deleted = 0
  `;
}
