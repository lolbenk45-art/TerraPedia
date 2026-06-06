import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

const layout = read('layouts/default.vue')
const indexPage = read('pages/index.vue')
const login = read('pages/login.vue')
const categories = read('pages/categories.vue')
const itemRarities = read('pages/item-rarities.vue')
const query = read('pages/query.vue')
const articles = read('pages/articles.vue')
const articleEditorDesign = read('pages/article-editor-design.vue')
const articleEditorWorkspace = read('components/article/ArticleEditorWorkspace.vue')
const appModal = read('components/AppModal.vue')
const users = read('pages/users.vue')
const entities = read('pages/entities/[type].vue')
const townNpcs = read('pages/entities/town-npcs/index.vue')
const crawlerMonitor = read('pages/operations/crawler-monitor.vue')
const crawlerMonitorTest = read('pages/operations/crawler-monitor-test.vue')
const itemRecipeEditor = read('components/ItemRecipeEditor.vue')

test('admin shell uses Chinese section labels and workspace copy', () => {
  assert.match(layout, /label: '资料目录'/)
  assert.match(layout, /label: '制作管理'/)
  assert.match(layout, /label: '实体管理'/)
  assert.match(layout, /label: '世界数据'/)
  assert.match(layout, /label: '运营维护'/)
  assert.doesNotMatch(layout, />Workspace</)
  assert.doesNotMatch(layout, />Admin Workspace</)
  assert.doesNotMatch(layout, /label: 'Catalog'/)
  assert.doesNotMatch(layout, /label: 'Crafting'/)
  assert.doesNotMatch(layout, /label: 'Entities'/)
  assert.doesNotMatch(layout, /label: 'World'/)
  assert.doesNotMatch(layout, /label: 'Operations'/)
})

test('shared admin pages keep Chinese-first visible operator copy', () => {
  assert.match(indexPage, /概览/)
  assert.match(login, /TerraPedia 管理端/)
  assert.match(categories, /分类控制台/)
  assert.match(categories, /顶级类型 topType/)
  assert.match(itemRarities, /品质管理/)
  assert.match(query, /数据查询/)
  assert.match(query, /执行查询/)
  assert.match(appModal, /工作台/)
  assert.doesNotMatch(categories, />Top Type</)
  assert.doesNotMatch(indexPage, />Overview</)
  assert.doesNotMatch(query, />Query Console</)
})

test('article and user workflows expose Chinese operator copy', () => {
  assert.match(articles, /文章管理/)
  assert.match(articles, /查看正文/)
  assert.match(articles, /提交审核/)
  assert.match(articles, /取消发布/)
  assert.match(articleEditorDesign, /访问路径 slug/)
  assert.match(articleEditorWorkspace, /访问路径 slug/)
  assert.match(users, /用户管理/)
  assert.match(users, /暂无用户/)
  assert.doesNotMatch(articles, /Article Management/)
  assert.doesNotMatch(articles, /View Content/)
  assert.doesNotMatch(articles, /No articles found/)
  assert.doesNotMatch(articleEditorDesign, /Slug:/)
  assert.doesNotMatch(articleEditorWorkspace, />Slug</)
  assert.doesNotMatch(users, /No users found/)
})

test('entity workspace badges and town NPC summary cards are Chinese-first', () => {
  for (const token of [
    '套装编排',
    'Boss 档案',
    'NPC 目录',
    '群系图谱',
    '世界条件',
    'Buff 系统',
    '射弹实验室',
    '游戏 ID',
  ]) {
    assert.match(entities, new RegExp(token))
  }

  for (const token of ['缺口', '待复核', '缺少来源', '导入关系', '已重建']) {
    assert.match(townNpcs, new RegExp(token))
  }

  assert.doesNotMatch(entities, /SET COMPOSER/)
  assert.doesNotMatch(entities, /BOSS ARCHIVE/)
  assert.doesNotMatch(entities, /NPC DIRECTORY/)
  assert.doesNotMatch(entities, /BUFF SYSTEM/)
  assert.doesNotMatch(entities, /PROJECTILE LAB/)
  assert.doesNotMatch(entities, /WORLD CONTEXT/)
  assert.doesNotMatch(townNpcs, /label: 'GAPS'/)
  assert.doesNotMatch(townNpcs, /label: 'REVIEW'/)
  assert.doesNotMatch(townNpcs, /label: 'NO SOURCE'/)
})

test('crawler monitor primary operation labels are Chinese-first', () => {
  assert.match(crawlerMonitor, /爬取监控/)
  assert.match(crawlerMonitor, /刷新状态/)
  assert.match(crawlerMonitor, /可读取 readable/)
  assert.match(crawlerMonitorTest, /自动刷新关闭/)
  assert.match(crawlerMonitorTest, /已用/)
  assert.match(crawlerMonitorTest, /测试状态已保存/)
  assert.match(itemRecipeEditor, /替代工作台/)
  assert.match(crawlerMonitor, /暂无进度消息/)
  assert.match(crawlerMonitor, /暂无活动队列状态/)
  assert.doesNotMatch(crawlerMonitor, /Refresh State/)
  assert.doesNotMatch(crawlerMonitor, /No progress message yet\./)
  assert.doesNotMatch(crawlerMonitor, /No active queue state yet\./)
  assert.doesNotMatch(crawlerMonitorTest, /Auto Off/)
  assert.doesNotMatch(crawlerMonitorTest, /Test state saved/)
  assert.doesNotMatch(itemRecipeEditor, /替代配方/)
})
