export default defineEventHandler(async (event) => {
  const columns = [
    { Field: 'id', Type: 'int' },
    { Field: 'name', Type: 'varchar(255)' },
    { Field: 'category_id', Type: 'int' },
    { Field: 'description', Type: 'text' },
    { Field: 'price', Type: 'decimal' },
    { Field: 'created_at', Type: 'datetime' }
  ];
  const filteredColumns = columns.map(col => col.Field);
  
  const sampleData = [
    { id: 1, name: '测试物品1', category_id: 1, description: '描述1', price: 100, created_at: '2023-01-01' },
    { id: 2, name: '测试物品2', category_id: 2, description: '描述2', price: 200, created_at: '2023-01-02' }
  ];

  return {
    success: true,
    columns: filteredColumns,
    sampleData: sampleData
  }
})