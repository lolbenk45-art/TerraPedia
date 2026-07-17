# 前台禁词(forbiddenPublicTerms)扫描口径:只扫模板段

日期:2026-07-17

## 背景

`front-nuxt/scripts/check-public-pages.mjs` 的 `forbiddenPublicTerms`
(`sourceItems` / `inflictingNpcs` / `immuneNpcs`)原本对全部 scanFiles
**全文件**扫描。这些词是后端字段名,禁词的本意是防止它们泄漏到**用户可见文案**;
但业务代码消费后端返回时必然要访问同名字段,全文件扫描导致正常代码也中弹,
催生了两处字符串拼接绕行 hack:

- `pages/npcs/[id].vue`:`(npc.value as Record<string, unknown>)?.['source' + 'Items']`
- `composables/usePublicBuffDetail.ts`:`` detailRecord[`source${'Items'}`] `` 等三处

绕行写法比"违规"本身更糟:类型擦除、不可 grep、误导后来者。

## 决策

禁词扫描范围从全文件收窄为:

- `.vue` 文件:只扫 `<template>` 段(含插值表达式)。字段名出现在模板里
  即有直接渲染给用户的风险,仍然报红。
- `.ts` 等脚本文件:跳过。脚本中的字段访问属于正常数据消费;脚本产出的
  文案最终仍要经过页面模板渲染,由模板段扫描兜底。

同时删除上述两处拼接 hack,恢复直白字段访问,并同步更新
check-public-pages.mjs 中锁定 hack 写法的 data-layer marker。

## 验证口径

- `node scripts/check-public-pages.mjs` 绿;
- 负测试:在任一 scanFile 页面 `<template>` 中临时塞入 `sourceItems`
  字样,脚本必须报 `forbidden backend field`(验证后撤销)。
