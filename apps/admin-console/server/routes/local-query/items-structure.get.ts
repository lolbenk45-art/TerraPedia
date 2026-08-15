const columns = [
  { Field: 'id', Type: 'int' },
  { Field: 'name', Type: 'varchar(255)' },
  { Field: 'category_id', Type: 'int' },
  { Field: 'description', Type: 'text' },
  { Field: 'price', Type: 'decimal(10,2)' },
  { Field: 'created_at', Type: 'datetime' }
]

const sampleData = [
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
  }
]

export default defineEventHandler(() => {
  return {
    success: true,
    columns: columns.map((column) => column.Field),
    sampleData
  }
})
