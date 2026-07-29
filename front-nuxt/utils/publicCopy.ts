// 详情页共享:面向玩家的安全展示文案过滤(items/npcs/bosses 三页原逐字复制,WP-5 沉淀)。
// rawPublicCopyPattern 命中即视为"未清洗的后端/模板原文",拒绝渲染;
// createSafeDisplayText 可选 transform 表达各页差异(如 NPC 需先本地化钱币简写)。

// 命中即为不可直接展示给玩家的原始文案(模板占位、HTML 标签、URL、wiki 路径、shop 编号等)。
export const rawPublicCopyPattern = /{{|}}|<\/?[a-z][\s\S]*?>|https?:\/\/|wiki\.gg|iteminfo|eicons|internal|wiki\s*(?:page|path)|(?:^|[\s_-])shop[\s_/-]*\d+(?:[\s_/-]*\d+)*(?:$|[\s_-])/i

// 对外数据边界承诺：缺少聚合/完整资料时只使用这些明确文案，不能由页面临时改写。
export const PUBLIC_COPY_UNDER_CONSTRUCTION = '资料整理中'
export const PUBLIC_COPY_PAGE_READING_DATA = '本页阅读数据'
export const PUBLIC_COPY_CURRENT_AVAILABLE_SHOP_DATA = '当前可用商店资料'

// 取第一个非空字符串(等价于三页原本的 firstText / displayText 单值行为)。
export const firstDisplayText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }

  return ''
}

// 生成安全展示文案函数:逐个候选值取第一个非空、经可选 transform 后仍不命中原文模式的结果。
export const createSafeDisplayText = (transform?: (value: string) => string) => (...values: unknown[]) => {
  for (const value of values) {
    const base = transform ? transform(firstDisplayText(value)) : firstDisplayText(value)
    const text = base.replace(/\s+/g, ' ')
    if (text && !rawPublicCopyPattern.test(text)) return text
  }

  return ''
}
