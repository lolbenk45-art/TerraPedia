export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { sql, timeout = 30 } = body

  if (!sql || !sql.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'SQL 查询语句不能为空'
    })
  }

  // 安全检查：只允许 SELECT 查询
  const trimmedSql = sql.trim().toUpperCase()
  if (!trimmedSql.startsWith('SELECT') && !trimmedSql.startsWith('SHOW') && !trimmedSql.startsWith('DESCRIBE')) {
    throw createError({
      statusCode: 403,
      statusMessage: '只允许执行 SELECT/SHOW/DESCRIBE 查询'
    })
  }

  // 模拟返回结果
  const data = [
    { id: 1, info: '模拟查询结果 - 行1' },
    { id: 2, info: '模拟查询结果 - 行2' }
  ];
  
  return {
    success: true,
    data: data,
    columns: ['id', 'info'],
    rowCount: data.length,
    queryTime: 5
  }
})