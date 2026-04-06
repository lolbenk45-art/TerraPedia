const tables = [
  {
    name: 'category',
    columns: [
      { Field: 'id', Type: 'int' },
      { Field: 'name', Type: 'varchar(255)' },
      { Field: 'description', Type: 'text' },
      { Field: 'created_at', Type: 'datetime' }
    ]
  },
  {
    name: 'items',
    columns: [
      { Field: 'id', Type: 'int' },
      { Field: 'name', Type: 'varchar(255)' },
      { Field: 'category_id', Type: 'int' },
      { Field: 'description', Type: 'text' },
      { Field: 'price', Type: 'decimal(10,2)' },
      { Field: 'created_at', Type: 'datetime' }
    ]
  }
]

export default defineEventHandler(() => {
  return {
    success: true,
    database: 'mock_database',
    tables
  }
})
