type QueryRow = Record<string, string | number | null>

const tables = ['category', 'items']

const itemColumns = ['id', 'name', 'category_id', 'description', 'price', 'created_at']
const itemRows: QueryRow[] = [
  {
    id: 1,
    name: '测试物品1',
    category_id: 1,
    description: '示例描述1',
    price: 100,
    created_at: '2023-01-01 08:00:00'
  },
  {
    id: 2,
    name: '测试物品2',
    category_id: 2,
    description: '示例描述2',
    price: 200,
    created_at: '2023-01-02 09:30:00'
  },
  {
    id: 3,
    name: '测试物品3',
    category_id: 1,
    description: '示例描述3',
    price: 300,
    created_at: '2023-01-03 11:00:00'
  }
]

const categoryColumns = ['id', 'name', 'description', 'created_at']
const categoryRows: QueryRow[] = [
  {
    id: 1,
    name: '武器',
    description: '武器分类',
    created_at: '2023-01-01 00:00:00'
  },
  {
    id: 2,
    name: '材料',
    description: '材料分类',
    created_at: '2023-01-02 00:00:00'
  }
]

function buildResponse(columns: string[], rows: QueryRow[]) {
  return {
    success: true,
    columns,
    data: rows,
    rowCount: rows.length,
    queryTime: 5
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ sql?: string; timeout?: number }>(event)
  const sql = body?.sql?.trim()

  if (!sql) {
    throw createError({
      statusCode: 400,
      statusMessage: 'SQL 查询语句不能为空'
    })
  }

  const normalizedSql = sql.replace(/\s+/g, ' ').trim()
  const upperSql = normalizedSql.toUpperCase()

  if (!upperSql.startsWith('SELECT') && !upperSql.startsWith('SHOW') && !upperSql.startsWith('DESCRIBE')) {
    throw createError({
      statusCode: 403,
      statusMessage: '只允许执行 SELECT / SHOW / DESCRIBE 只读查询'
    })
  }

  if (upperSql.startsWith('SHOW TABLES')) {
    return buildResponse(['Tables_in_mock_database'], tables.map((table) => ({ Tables_in_mock_database: table })))
  }

  if (upperSql.startsWith('DESCRIBE ITEMS')) {
    return buildResponse(
      ['Field', 'Type', 'Null', 'Key', 'Default', 'Extra'],
      [
        { Field: 'id', Type: 'int', Null: 'NO', Key: 'PRI', Default: null, Extra: 'auto_increment' },
        { Field: 'name', Type: 'varchar(255)', Null: 'NO', Key: '', Default: null, Extra: '' },
        { Field: 'category_id', Type: 'int', Null: 'YES', Key: 'MUL', Default: null, Extra: '' },
        { Field: 'description', Type: 'text', Null: 'YES', Key: '', Default: null, Extra: '' },
        { Field: 'price', Type: 'decimal(10,2)', Null: 'YES', Key: '', Default: null, Extra: '' },
        { Field: 'created_at', Type: 'datetime', Null: 'NO', Key: '', Default: 'CURRENT_TIMESTAMP', Extra: '' }
      ]
    )
  }

  if (upperSql.includes('FROM CATEGORY')) {
    return buildResponse(categoryColumns, categoryRows)
  }

  return buildResponse(itemColumns, itemRows)
})
