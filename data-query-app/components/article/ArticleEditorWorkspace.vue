<template>
  <div class="editor-page">
    <div v-if="editor.loading" class="editor-loading">
      <div class="editor-loading__card">
        <h2>正在载入文章工作台</h2>
        <p>准备正文、封面和本地草稿状态...</p>
      </div>
    </div>

    <template v-else>
      <header class="editor-topbar">
        <div class="editor-topbar__left">
          <button type="button" class="ghost-btn" @click="editor.goBack">返回文章列表</button>
          <div class="editor-topbar__title">
            <p class="editor-topbar__eyebrow">{{ editor.editorCaption }}</p>
            <h1>{{ editor.editorTitle }}</h1>
          </div>
        </div>

        <div class="editor-topbar__status">
          <span class="status-pill" :class="statusToneClass">{{ editor.statusLabel }}</span>
          <span class="status-meta">字数 {{ editor.wordCount }}</span>
          <span class="status-meta">图片 {{ editor.imageCount }}</span>
          <span class="status-meta">段落 {{ editor.paragraphCount }}</span>
        </div>

        <div class="editor-topbar__actions">
          <button
            type="button"
            class="ghost-btn"
            title="显示或收起右侧面板"
            @click="editor.sidePanelCollapsed = !editor.sidePanelCollapsed"
          >
            {{ editor.sidePanelCollapsed ? '显示侧栏' : '专注写作' }}
          </button>
          <button
            type="button"
            class="ghost-btn"
            :disabled="!editor.canSubmitReview"
            :title="editor.isDirty ? '请先保存草稿再提交审核' : '提交给后台审核'"
            @click="editor.submitForReview"
          >
            {{ editor.submittingReview ? '提交中...' : '提交审核' }}
          </button>
          <button
            type="button"
            class="primary-btn"
            :disabled="editor.saving || editor.isReadOnly"
            title="保存当前草稿"
            @click="editor.saveDraft"
          >
            {{ editor.saving ? '保存中...' : '保存草稿' }}
          </button>
        </div>
      </header>

      <section v-if="editor.pendingRecovery" class="recovery-banner">
        <div>
          <strong>检测到本地草稿</strong>
          <p>最近一次暂存于 {{ editor.formatEditorTime(editor.lastLocalSavedAt) }}，可以恢复继续写作。</p>
        </div>
        <div class="recovery-banner__actions">
          <button type="button" class="ghost-btn" @click="editor.discardPendingRecovery">忽略</button>
          <button type="button" class="primary-btn" @click="editor.restorePendingRecovery">恢复草稿</button>
        </div>
      </section>

      <section v-if="editor.isReadOnly" class="readonly-banner">
        文章当前处于审核中，暂时只能查看，不能直接修改正文。
      </section>

      <div class="editor-shell">
        <aside class="editor-shell__meta">
          <section class="editor-card">
            <div class="editor-card__head">
              <div>
                <p class="editor-card__eyebrow">文章信息</p>
                <h2>封面与摘要</h2>
              </div>
              <span class="mini-badge">{{ statusText }}</span>
            </div>

            <label class="field">
              <span>标题</span>
              <input v-model.trim="editor.form.title" class="field__control" type="text" placeholder="输入文章标题" />
            </label>

            <label class="field">
              <span>摘要</span>
              <textarea
                v-model.trim="editor.form.summary"
                class="field__control field__control--textarea"
                rows="4"
                placeholder="一句话概括文章亮点"
              />
            </label>

            <label class="field">
              <span>Slug</span>
              <input v-model.trim="editor.form.slug" class="field__control" type="text" placeholder="例如 terraria-boss-guide" />
            </label>

            <div
              class="cover-dropzone"
              :class="{ 'cover-dropzone--active': editor.coverDragActive }"
              @dragenter.prevent="editor.handleCoverDragEnter"
              @dragover.prevent="editor.handleCoverDragOver"
              @dragleave.prevent="editor.handleCoverDragLeave"
              @drop.prevent="editor.handleCoverDrop"
            >
              <div class="cover-dropzone__copy">
                <strong>封面图</strong>
                <p>推荐 16:9，支持拖拽、选择和裁剪。</p>
              </div>
              <input
                ref="coverFileInput"
                type="file"
                accept="image/*"
                class="hidden-input"
                @change="editor.handleCoverSelected"
              />
              <button type="button" class="ghost-btn" @click="editor.openCoverFileDialog">选择封面</button>
            </div>

            <div v-if="editor.coverPreviewSrc" class="cover-preview">
              <img :src="editor.coverPreviewSrc" alt="封面预览" />
              <small>{{ editor.form.coverImage || '本地封面将在保存后上传' }}</small>
            </div>
          </section>

          <section class="editor-card">
            <div class="editor-card__head">
              <div>
                <p class="editor-card__eyebrow">写作检查</p>
                <h2>完成度</h2>
              </div>
            </div>

            <ul class="checklist">
              <li v-for="item in editor.checklist" :key="item.id" class="checklist__item">
                <span class="checklist__dot" :class="{ 'checklist__dot--done': item.done }" />
                <div>
                  <strong>{{ item.label }}</strong>
                  <p>{{ item.hint }}</p>
                </div>
              </li>
            </ul>
          </section>
        </aside>

        <main class="editor-shell__main">
          <section class="editor-card editor-card--main">
            <div
              class="editor-toolbar"
              :class="{
                'editor-toolbar--readonly': editor.isReadOnly,
                'editor-toolbar--overflow-open': toolbarOverflowOpen,
              }"
              role="toolbar"
              aria-label="文章编辑工具栏"
              @mousedown.prevent="editor.handleToolbarMouseDown"
            >
              <div class="toolbar-group" role="group" aria-label="历史操作">
                <button
                  type="button"
                  class="toolbar-tool toolbar-tool--icon"
                  title="撤销"
                  aria-label="撤销"
                  :disabled="editor.isReadOnly"
                  @click="editor.execEditorCommand('undo')"
                >
                  <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M6 4 3.5 6.5 6 9" />
                    <path d="M4 6.5h5.2a3.3 3.3 0 1 1 0 6.5H7.8" />
                  </svg>
                </button>
                <button
                  type="button"
                  class="toolbar-tool toolbar-tool--icon"
                  title="重做"
                  aria-label="重做"
                  :disabled="editor.isReadOnly"
                  @click="editor.execEditorCommand('redo')"
                >
                  <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="m10 4 2.5 2.5L10 9" />
                    <path d="M12 6.5H6.8a3.3 3.3 0 1 0 0 6.5h1.4" />
                  </svg>
                </button>
              </div>

              <span class="toolbar-separator" aria-hidden="true" />

              <div class="toolbar-group toolbar-group--select" role="group" aria-label="文本样式">
                <label class="toolbar-select-wrap toolbar-select-wrap--style">
                  <select
                    v-model="blockStyle"
                    class="toolbar-select"
                    :disabled="editor.isReadOnly"
                    title="段落样式"
                    @change="applyToolbarBlockStyle"
                  >
                    <option value="p">正文</option>
                    <option value="h1">标题 1</option>
                    <option value="h2">标题 2</option>
                    <option value="h3">标题 3</option>
                    <option value="blockquote">引用</option>
                  </select>
                </label>

                <label class="toolbar-select-wrap toolbar-select-wrap--size">
                  <select
                    v-model.number="editor.fontSizePx"
                    class="toolbar-select"
                    :disabled="editor.isReadOnly"
                    title="字体大小"
                    @change="editor.applyFontSize"
                  >
                    <option v-for="size in editor.fontSizeOptions" :key="size" :value="size">{{ size }}px</option>
                  </select>
                </label>

                <label class="toolbar-select-wrap toolbar-select-wrap--line-height">
                  <select
                    v-model="editor.lineHeightValue"
                    class="toolbar-select"
                    :disabled="editor.isReadOnly"
                    title="行距"
                    @change="editor.applyLineHeight"
                  >
                    <option v-for="option in editor.lineHeightOptions" :key="option.value" :value="option.value">
                      行距 {{ option.label }}
                    </option>
                  </select>
                </label>

                <label class="toolbar-select-wrap toolbar-select-wrap--indent">
                  <select
                    v-model="editor.textIndentValue"
                    class="toolbar-select"
                    :disabled="editor.isReadOnly"
                    title="首行缩进"
                    @change="editor.applyTextIndent"
                  >
                    <option v-for="option in editor.textIndentOptions" :key="option.value" :value="option.value">
                      首缩 {{ option.label }}
                    </option>
                  </select>
                </label>

                <label class="toolbar-select-wrap toolbar-select-wrap--color">
                  <select
                    v-model="editor.textColorValue"
                    class="toolbar-select"
                    :disabled="editor.isReadOnly"
                    title="文字颜色"
                    @change="editor.applyTextColor"
                  >
                    <option v-for="option in editor.textColorOptions" :key="option.value" :value="option.value">
                      閺傚洤鐡?{{ option.label }}
                    </option>
                  </select>
                </label>
              </div>

              <span class="toolbar-separator" aria-hidden="true" />

              <div class="toolbar-group" role="group" aria-label="文字强调">
                <button
                  type="button"
                  class="toolbar-tool toolbar-tool--text toolbar-tool--strong"
                  :class="{ 'toolbar-tool--active': editor.toolbarState.bold }"
                  title="加粗"
                  aria-label="加粗"
                  :aria-pressed="editor.toolbarState.bold"
                  :disabled="editor.isReadOnly"
                  @click="editor.execEditorCommand('bold')"
                >
                  <span class="toolbar-tool__label" aria-hidden="true">B</span>
                </button>
                <button
                  type="button"
                  class="toolbar-tool toolbar-tool--text toolbar-tool--italic"
                  :class="{ 'toolbar-tool--active': editor.toolbarState.italic }"
                  title="斜体"
                  aria-label="斜体"
                  :aria-pressed="editor.toolbarState.italic"
                  :disabled="editor.isReadOnly"
                  @click="editor.execEditorCommand('italic')"
                >
                  <span class="toolbar-tool__label" aria-hidden="true">I</span>
                </button>
                <button
                  type="button"
                  class="toolbar-tool toolbar-tool--text toolbar-tool--underline"
                  :class="{ 'toolbar-tool--active': editor.toolbarState.underline }"
                  title="下划线"
                  aria-label="下划线"
                  :aria-pressed="editor.toolbarState.underline"
                  :disabled="editor.isReadOnly"
                  @click="editor.execEditorCommand('underline')"
                >
                  <span class="toolbar-tool__label" aria-hidden="true">U</span>
                </button>
                <button
                  type="button"
                  class="toolbar-tool toolbar-tool--text toolbar-tool--strike"
                  :class="{ 'toolbar-tool--active': editor.toolbarState.strikeThrough }"
                  title="删除线"
                  aria-label="删除线"
                  :aria-pressed="editor.toolbarState.strikeThrough"
                  :disabled="editor.isReadOnly"
                  @click="editor.execEditorCommand('strikeThrough')"
                >
                  <span class="toolbar-tool__label" aria-hidden="true">S</span>
                </button>
                <button
                  type="button"
                  class="toolbar-tool toolbar-tool--text toolbar-tool--wide"
                  title="行内代码"
                  aria-label="行内代码"
                  :disabled="editor.isReadOnly"
                  @click="editor.insertInlineCode"
                >
                  <span class="toolbar-tool__label" aria-hidden="true">&lt;/&gt;</span>
                </button>
              </div>

              <span class="toolbar-separator" aria-hidden="true" />

              <div class="toolbar-group" role="group" aria-label="对齐方式">
                <button
                  type="button"
                  class="toolbar-tool toolbar-tool--icon"
                  :class="{ 'toolbar-tool--active': editor.toolbarState.justifyLeft }"
                  title="左对齐"
                  aria-label="左对齐"
                  :aria-pressed="editor.toolbarState.justifyLeft"
                  :disabled="editor.isReadOnly"
                  @click="editor.execEditorCommand('justifyLeft')"
                >
                  <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3 4h10" />
                    <path d="M3 7h7" />
                    <path d="M3 10h10" />
                    <path d="M3 13h8" />
                  </svg>
                </button>
                <button
                  type="button"
                  class="toolbar-tool toolbar-tool--icon"
                  :class="{ 'toolbar-tool--active': editor.toolbarState.justifyCenter }"
                  title="居中"
                  aria-label="居中"
                  :aria-pressed="editor.toolbarState.justifyCenter"
                  :disabled="editor.isReadOnly"
                  @click="editor.execEditorCommand('justifyCenter')"
                >
                  <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3.5 4h9" />
                    <path d="M5 7h6" />
                    <path d="M3 10h10" />
                    <path d="M4.5 13h7" />
                  </svg>
                </button>
                <button
                  type="button"
                  class="toolbar-tool toolbar-tool--icon"
                  :class="{ 'toolbar-tool--active': editor.toolbarState.justifyRight }"
                  title="右对齐"
                  aria-label="右对齐"
                  :aria-pressed="editor.toolbarState.justifyRight"
                  :disabled="editor.isReadOnly"
                  @click="editor.execEditorCommand('justifyRight')"
                >
                  <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3 4h10" />
                    <path d="M6 7h7" />
                    <path d="M3 10h10" />
                    <path d="M5 13h8" />
                  </svg>
                </button>
                <button
                  type="button"
                  class="toolbar-tool toolbar-tool--icon"
                  :class="{ 'toolbar-tool--active': editor.toolbarState.justifyFull }"
                  title="两端对齐"
                  aria-label="两端对齐"
                  :aria-pressed="editor.toolbarState.justifyFull"
                  :disabled="editor.isReadOnly"
                  @click="editor.execEditorCommand('justifyFull')"
                >
                  <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3 4h10" />
                    <path d="M3 7h10" />
                    <path d="M3 10h10" />
                    <path d="M3 13h10" />
                  </svg>
                </button>
              </div>

              <span class="toolbar-separator" aria-hidden="true" />

              <div class="toolbar-group" role="group" aria-label="结构与素材">
                <button
                  type="button"
                  class="toolbar-tool toolbar-tool--icon"
                  :class="{ 'toolbar-tool--active': editor.toolbarState.insertUnorderedList }"
                  title="无序列表"
                  aria-label="无序列表"
                  :aria-pressed="editor.toolbarState.insertUnorderedList"
                  :disabled="editor.isReadOnly"
                  @click="editor.execEditorCommand('insertUnorderedList')"
                >
                  <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <circle cx="4" cy="4" r="0.9" />
                    <circle cx="4" cy="8" r="0.9" />
                    <circle cx="4" cy="12" r="0.9" />
                    <path d="M7 4h6" />
                    <path d="M7 8h6" />
                    <path d="M7 12h6" />
                  </svg>
                </button>
                <button
                  type="button"
                  class="toolbar-tool toolbar-tool--text toolbar-tool--wide"
                  :class="{ 'toolbar-tool--active': editor.toolbarState.insertOrderedList }"
                  title="有序列表"
                  aria-label="有序列表"
                  :aria-pressed="editor.toolbarState.insertOrderedList"
                  :disabled="editor.isReadOnly"
                  @click="editor.execEditorCommand('insertOrderedList')"
                >
                  <span class="toolbar-tool__label" aria-hidden="true">1.</span>
                </button>
                <button
                  type="button"
                  class="toolbar-tool toolbar-tool--icon"
                  title="插入分割线"
                  aria-label="插入分割线"
                  :disabled="editor.isReadOnly"
                  @click="editor.insertDivider"
                >
                  <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M2.5 8h11" />
                  </svg>
                </button>
                <button
                  type="button"
                  class="toolbar-tool toolbar-tool--icon"
                  title="插入链接"
                  aria-label="插入链接"
                  :disabled="editor.isReadOnly"
                  @click="editor.openLinkDialog"
                >
                  <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M6.2 9.8 4.7 11.3a2.1 2.1 0 1 1-3-3l1.8-1.8a2.1 2.1 0 0 1 3 0" />
                    <path d="m9.8 6.2 1.5-1.5a2.1 2.1 0 0 1 3 3l-1.8 1.8a2.1 2.1 0 0 1-3 0" />
                    <path d="M6 10l4-4" />
                  </svg>
                </button>
                <button
                  type="button"
                  class="toolbar-tool toolbar-tool--icon"
                  title="插入图片"
                  aria-label="插入图片"
                  :disabled="editor.isReadOnly"
                  @click="editor.openInlineImageDialog"
                >
                  <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
                    <circle cx="6" cy="6.2" r="1" />
                    <path d="m4.3 11 2.8-2.8 2.1 2.1 1.7-1.7 1.1 1.1" />
                  </svg>
                </button>
                <button
                  type="button"
                  class="toolbar-tool toolbar-tool--icon"
                  title="清除格式"
                  aria-label="清除格式"
                  :disabled="editor.isReadOnly"
                  @click="editor.clearFormatting"
                >
                  <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M4.3 11.2 8.9 6.6l2.1 2.1-4.6 4.5H4.3Z" />
                    <path d="m9.7 5.8 1.2-1.2a1.2 1.2 0 0 1 1.7 0l.8.8a1.2 1.2 0 0 1 0 1.7l-1.2 1.2" />
                    <path d="M8.3 11.2h5.2" />
                  </svg>
                </button>
              </div>
              <span class="toolbar-separator toolbar-separator--advanced" aria-hidden="true" />
              <div class="toolbar-group toolbar-group--advanced" role="group" aria-label="高级工具">
                <button
                  type="button"
                  class="toolbar-tool toolbar-tool--text toolbar-tool--wide"
                  title="插入代码块"
                  aria-label="插入代码块"
                  :disabled="editor.isReadOnly"
                  @click="editor.insertCodeBlock(); closeToolbarOverflow()"
                >
                  <span class="toolbar-tool__label" aria-hidden="true">{ }</span>
                </button>
                <label class="toolbar-mini-field">
                  <span>R</span>
                  <input
                    v-model.number="tableRows"
                    class="toolbar-number"
                    type="number"
                    min="1"
                    max="12"
                    title="表格行数"
                    :disabled="editor.isReadOnly"
                  />
                </label>
                <label class="toolbar-mini-field">
                  <span>C</span>
                  <input
                    v-model.number="tableCols"
                    class="toolbar-number"
                    type="number"
                    min="1"
                    max="8"
                    title="表格列数"
                    :disabled="editor.isReadOnly"
                  />
                </label>
                <button
                  type="button"
                  class="toolbar-tool toolbar-tool--text toolbar-tool--wide"
                  title="插入表格模板"
                  aria-label="插入表格模板"
                  :disabled="editor.isReadOnly"
                  @click="editor.insertTable(tableRows, tableCols); closeToolbarOverflow()"
                >
                  <span class="toolbar-tool__label" aria-hidden="true">Tbl</span>
                </button>
                <button
                  type="button"
                  class="toolbar-tool toolbar-tool--text toolbar-tool--wide"
                  title="移除链接"
                  aria-label="移除链接"
                  :disabled="editor.isReadOnly"
                  @click="editor.removeLink(); closeToolbarOverflow()"
                >
                  <span class="toolbar-tool__label" aria-hidden="true">Unlink</span>
                </button>
              </div>
              <div class="toolbar-group toolbar-group--more" role="group" aria-label="切换高级工具">
                <button
                  type="button"
                  class="toolbar-tool toolbar-tool--text toolbar-tool--wide"
                  :aria-expanded="toolbarOverflowOpen"
                  :disabled="editor.isReadOnly"
                  :title="toolbarOverflowOpen ? '收起高级工具' : '展开高级工具'"
                  @click="toggleToolbarOverflow"
                >
                  <span class="toolbar-tool__label" aria-hidden="true">{{ toolbarOverflowOpen ? 'Less' : 'More' }}</span>
                </button>
              </div>
              <input
                ref="inlineImageInput"
                type="file"
                accept="image/*"
                multiple
                class="hidden-input"
                @change="editor.handleInlineImageSelected"
              />
            </div>

            <div class="editor-stage">
              <div
                ref="editorRef"
                class="rich-editor"
                :class="{ 'rich-editor--readonly': editor.isReadOnly }"
                :contenteditable="!editor.isReadOnly"
                role="textbox"
                aria-label="Article content editor"
                @input="editor.handleEditorInput"
                @paste="editor.handleEditorPaste"
                @dragover.prevent="editor.handleEditorDragOver"
                @drop.prevent="editor.handleEditorDrop"
                @keyup="editor.saveSelection"
                @mouseup="editor.saveSelection"
                @blur="editor.saveSelection"
              />
            </div>

            <div class="editor-stage__tips">
              <span>支持直接粘贴或拖拽图片到正文中。</span>
              <span>建议使用“标题 2 / 标题 3”组织长文结构。</span>
            </div>
          </section>
        </main>

        <aside v-if="!editor.sidePanelCollapsed" class="editor-shell__side">
          <section class="editor-card editor-card--side">
            <div class="side-tabs">
              <button
                v-for="item in sideTabs"
                :key="item.id"
                type="button"
                class="side-tabs__item"
                :class="{ 'side-tabs__item--active': editor.sidePanel === item.id }"
                @click="editor.sidePanel = item.id"
              >
                {{ item.label }}
              </button>
            </div>

            <div v-if="editor.sidePanel === 'preview'" ref="previewRef" class="preview-panel">
              <article class="article-preview">
                <header class="article-preview__head">
                  <p class="article-preview__label">读者预览</p>
                  <h2>{{ editor.form.title || '文章标题' }}</h2>
                  <p>{{ editor.form.summary || '这里会展示摘要，方便你检查列表卡片和导语语气。' }}</p>
                </header>
                <img v-if="editor.coverPreviewSrc" :src="editor.coverPreviewSrc" alt="Cover" class="article-preview__cover" />
                <div class="article-preview__body" v-html="editor.previewHtml" />
              </article>
            </div>

            <div v-else-if="editor.sidePanel === 'outline'" class="outline-panel">
              <div v-if="editor.outline.length" class="outline-list">
                <button
                  v-for="item in editor.outline"
                  :key="item.id"
                  type="button"
                  class="outline-list__item"
                  :style="{ paddingLeft: `${(item.level - 1) * 14 + 12}px` }"
                  @click="editor.scrollToOutlineItem(item.id)"
                >
                  <span class="outline-list__level">H{{ item.level }}</span>
                  <span>{{ item.text }}</span>
                </button>
              </div>
              <p v-else class="empty-copy">还没有识别到小标题，长文建议补充结构层级。</p>
            </div>

            <div v-else class="quality-panel">
              <div class="quality-panel__metric">
                <strong>{{ editor.wordCount }}</strong>
                <span>总字数</span>
              </div>
              <div class="quality-panel__metric">
                <strong>{{ editor.imageCount }}</strong>
                <span>正文图片</span>
              </div>
              <div class="quality-panel__metric">
                <strong>{{ editor.outline.length }}</strong>
                <span>小标题</span>
              </div>
              <div class="quality-panel__metric">
                <strong>{{ editor.formatEditorTime(editor.lastServerSavedAt) }}</strong>
                <span>上次保存</span>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <AppModal v-model="editor.linkDialogVisible" title="插入链接" width="460px">
        <div class="link-dialog">
          <label class="field">
            <span>链接地址</span>
            <input v-model.trim="editor.linkUrl" class="field__control" type="text" placeholder="https://example.com" />
          </label>
          <label class="field">
            <span>展示文案</span>
            <input v-model.trim="editor.linkText" class="field__control" type="text" placeholder="可留空，默认使用选中文本" />
          </label>
        </div>
        <template #footer>
          <button type="button" class="ghost-btn" @click="editor.linkDialogVisible = false">取消</button>
          <button type="button" class="primary-btn" @click="editor.applyLink">插入链接</button>
        </template>
      </AppModal>

      <AppModal v-model="editor.cropVisible" title="裁剪封面 (16:9)" width="760px">
        <div class="cropper-wrap">
          <div
            class="cropper-viewport"
            @pointerdown.prevent="editor.startCropDrag"
            @pointermove.prevent="editor.handleCropDragMove"
            @pointerup.prevent="editor.endCropDrag"
            @pointercancel.prevent="editor.endCropDrag"
          >
            <img
              v-if="editor.cropSourceUrl"
              :src="editor.cropSourceUrl"
              alt="Crop source"
              :style="editor.cropImageStyle"
              class="cropper-image"
              draggable="false"
            />
          </div>
          <div class="cropper-controls">
            <label class="field">
              <span>缩放 {{ editor.cropScale.toFixed(2) }}x</span>
              <input v-model.number="editor.cropScale" class="slider" type="range" min="1" max="3" step="0.01" />
            </label>
            <div class="cropper-actions">
              <button type="button" class="ghost-btn" @click="editor.resetCropTransform">重置位置</button>
              <button type="button" class="primary-btn" @click="editor.confirmCrop">应用裁剪</button>
            </div>
          </div>
        </div>
      </AppModal>
    </template>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ articleId?: number | null }>(), {
  articleId: null,
})

const editor = reactive(useArticleEditor(props.articleId))
const { editorRef, previewRef, inlineImageInput, coverFileInput } = toRefs(editor)

const sideTabs = [
  { id: 'preview', label: '预览' },
  { id: 'outline', label: '大纲' },
  { id: 'quality', label: '质检' },
] as const

const toolbarOverflowOpen = ref(false)
const tableRows = ref(3)
const tableCols = ref(3)

const blockStyle = computed<'p' | 'h1' | 'h2' | 'h3' | 'blockquote'>({
  get: () => editor.toolbarState.blockStyle,
  set: (value) => {
    editor.toolbarState.blockStyle = value
  },
})

const applyToolbarBlockStyle = () => {
  editor.applyBlockStyle(blockStyle.value)
}

const closeToolbarOverflow = () => {
  toolbarOverflowOpen.value = false
}

const toggleToolbarOverflow = () => {
  toolbarOverflowOpen.value = !toolbarOverflowOpen.value
}

const statusToneClass = computed(() => ({
  'status-pill--danger': editor.saveStatus === 'error',
  'status-pill--warning': editor.isDirty || editor.saveStatus === 'autosaved',
}))

const statusText = computed(() => {
  const reviewStatus = editor.article?.reviewStatus
  if (reviewStatus === 'PENDING_REVIEW') return '审核中'
  if (reviewStatus === 'APPROVED') return '已通过'
  if (reviewStatus === 'REJECTED') return '已驳回'
  return '草稿'
})
</script>

<style scoped>
.editor-page {
  display: grid;
  gap: 20px;
}

.editor-loading {
  min-height: 60vh;
  display: grid;
  place-items: center;
}

.editor-loading__card,
.readonly-banner,
.recovery-banner,
.editor-card {
  border: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent);
  border-radius: 20px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-bg-secondary) 88%, black 12%) 0%,
      color-mix(in srgb, var(--color-bg) 94%, black 6%) 100%
    );
  box-shadow:
    0 14px 28px rgb(0 0 0 / 0.18),
    inset 0 1px 0 rgb(255 255 255 / 0.04);
}

.editor-loading__card {
  padding: 32px;
  text-align: center;
}

.editor-loading__card h2,
.editor-topbar__title h1,
.editor-card__head h2 {
  margin: 0;
  font-family: var(--font-display);
  letter-spacing: -0.02em;
}

.editor-loading__card p,
.editor-card__eyebrow,
.field span,
.status-meta,
.article-preview__label {
  color: var(--color-text-secondary);
}

.editor-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 16px;
  align-items: center;
  padding: 18px 20px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 14%, var(--color-border));
  border-radius: 24px;
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-secondary)) 0%,
      color-mix(in srgb, var(--color-bg) 94%, black 6%) 100%
    );
  backdrop-filter: blur(14px);
  box-shadow:
    0 20px 40px rgb(0 0 0 / 0.22),
    inset 0 1px 0 rgb(255 255 255 / 0.03);
}

.editor-topbar__left,
.editor-topbar__actions,
.editor-topbar__status,
.editor-card__head,
.recovery-banner,
.recovery-banner__actions,
.cropper-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.editor-topbar__title {
  display: grid;
  gap: 4px;
}

.editor-topbar__eyebrow,
.editor-card__eyebrow {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.editor-topbar__status {
  flex-wrap: wrap;
  justify-content: center;
}

.status-pill,
.mini-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 0.8rem;
  font-weight: 700;
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
  color: var(--color-primary-dark);
}

.status-pill--warning {
  background: #fef3c7;
  color: #92400e;
}

.status-pill--danger {
  background: #fee2e2;
  color: #991b1b;
}

.ghost-btn,
.primary-btn,
.field__control {
  border-radius: 14px;
  border: 1px solid var(--color-border);
  font: inherit;
}

.ghost-btn,
.primary-btn {
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.ghost-btn {
  padding: 10px 14px;
  background: color-mix(in srgb, var(--color-bg-secondary) 76%, black 24%);
  color: var(--color-text);
}

.primary-btn {
  padding: 10px 16px;
  border-color: transparent;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-light));
  color: #fff;
  box-shadow: 0 12px 24px color-mix(in srgb, var(--color-primary) 28%, transparent);
}

.ghost-btn:hover,
.primary-btn:hover {
  transform: translateY(-1px);
}

.ghost-btn:disabled,
.primary-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.recovery-banner,
.readonly-banner {
  justify-content: space-between;
  padding: 16px 18px;
}

.recovery-banner p,
.readonly-banner {
  margin: 4px 0 0;
}

.readonly-banner {
  color: #92400e;
  background: color-mix(in srgb, #f59e0b 12%, var(--color-bg-secondary));
}

.editor-shell {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr) 360px;
  gap: 20px;
  align-items: start;
}

.editor-shell__meta,
.editor-shell__main,
.editor-shell__side {
  display: grid;
  gap: 20px;
  min-width: 0;
}

.editor-card {
  padding: 18px;
  min-width: 0;
}

.editor-card--main,
.editor-card--side {
  min-height: 72vh;
}

.editor-card__head {
  justify-content: space-between;
  margin-bottom: 16px;
}

.field {
  display: grid;
  gap: 8px;
  margin-bottom: 14px;
}

.field span {
  font-size: 0.84rem;
  font-weight: 600;
}

.field__control {
  width: 100%;
  padding: 12px 14px;
  background: color-mix(in srgb, var(--color-bg) 82%, black 18%);
  color: var(--color-text);
}

.field__control--textarea {
  resize: vertical;
  min-height: 112px;
}

.cover-dropzone {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px dashed color-mix(in srgb, var(--color-primary) 22%, var(--color-border));
  border-radius: 18px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-secondary)) 0%,
    color-mix(in srgb, var(--color-bg) 90%, black 10%) 100%
  );
}

.cover-dropzone--active {
  border-color: var(--color-primary);
}

.cover-dropzone__copy p,
.cover-preview small,
.checklist__item p,
.editor-stage__tips,
.empty-copy {
  margin: 0;
  color: var(--color-text-secondary);
}

.cover-preview {
  display: grid;
  gap: 10px;
}

.cover-preview img,
.article-preview__cover {
  width: 100%;
  border-radius: 18px;
  border: 1px solid var(--color-border);
  object-fit: cover;
}

.checklist {
  display: grid;
  gap: 12px;
  list-style: none;
  padding: 0;
  margin: 0;
}

.checklist__item {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr);
  gap: 12px;
}

.checklist__dot {
  width: 12px;
  height: 12px;
  margin-top: 6px;
  border-radius: 999px;
  background: #d6d3d1;
}

.checklist__dot--done {
  background: var(--color-primary);
}

.editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 10px;
  overflow: visible;
  padding: 10px 12px;
  margin-bottom: 16px;
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, rgb(255 255 255 / 0.06));
  border-radius: 16px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-bg-secondary) 84%, white 6%) 0%,
      color-mix(in srgb, var(--color-bg) 92%, black 8%) 100%
    );
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.06),
    0 14px 28px rgb(0 0 0 / 0.16);
}

.editor-toolbar--readonly {
  opacity: 0.82;
}

.toolbar-group {
  display: inline-flex;
  flex: 0 1 auto;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  min-height: 38px;
  padding: 4px;
  border: 1px solid color-mix(in srgb, var(--color-border) 74%, transparent);
  border-radius: 12px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-bg-secondary) 80%, white 5%) 0%,
      color-mix(in srgb, var(--color-bg) 88%, black 12%) 100%
    );
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.05);
}

.toolbar-group--advanced,
.toolbar-group--more {
  margin-left: auto;
}

.toolbar-group--more {
  display: none;
}

.toolbar-group--select {
  gap: 6px;
  padding-inline: 8px;
}

.toolbar-separator {
  width: 1px;
  flex: 0 0 auto;
  height: 28px;
  background: color-mix(in srgb, var(--color-border) 58%, transparent);
}

.toolbar-separator--advanced {
  display: none;
}

.toolbar-select-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.toolbar-select-wrap::after {
  content: '';
  position: absolute;
  right: 10px;
  top: 50%;
  width: 7px;
  height: 7px;
  border-right: 1.5px solid color-mix(in srgb, var(--color-text-secondary) 82%, white 10%);
  border-bottom: 1.5px solid color-mix(in srgb, var(--color-text-secondary) 82%, white 10%);
  transform: translateY(-62%) rotate(45deg);
  pointer-events: none;
}

.toolbar-select {
  appearance: none;
  min-width: 104px;
  height: 32px;
  padding: 0 28px 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 86%, white 4%);
  color: var(--color-text);
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.04);
}

.toolbar-select-wrap--style .toolbar-select {
  min-width: 112px;
}

.toolbar-select-wrap--size .toolbar-select {
  min-width: 78px;
}

.toolbar-select-wrap--line-height .toolbar-select,
.toolbar-select-wrap--indent .toolbar-select,
.toolbar-select-wrap--color .toolbar-select {
  min-width: 96px;
}

.toolbar-select:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

.toolbar-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

.toolbar-tool__label {
  font-size: 0.84rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.toolbar-tool--wide {
  min-width: 36px;
}

.toolbar-tool--icon {
  padding: 0 7px;
}

.toolbar-icon {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.35;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.toolbar-tool--strong .toolbar-tool__label {
  font-weight: 800;
}

.toolbar-tool--italic .toolbar-tool__label {
  font-style: italic;
}

.toolbar-tool--underline .toolbar-tool__label {
  text-decoration: underline;
}

.toolbar-tool--strike .toolbar-tool__label {
  text-decoration: line-through;
}

.toolbar-tool--active {
  border-color: color-mix(in srgb, var(--color-primary) 34%, var(--color-border));
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-primary) 18%, var(--color-bg-secondary)) 0%,
      color-mix(in srgb, var(--color-primary) 10%, var(--color-bg)) 100%
    );
  color: var(--color-text);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08);
}

.toolbar-tool:hover:not(:disabled),
.toolbar-tool:focus-visible,
.toolbar-select:hover:not(:disabled),
.toolbar-select:focus-visible {
  border-color: color-mix(in srgb, var(--color-primary) 20%, var(--color-border));
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, white 8%);
  color: var(--color-text);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.08),
    0 0 0 2px color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.toolbar-tool:disabled {
  opacity: 0.46;
  cursor: not-allowed;
  box-shadow: none;
}

.toolbar-mini-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 4px;
  color: var(--color-text-secondary);
  font-size: 0.76rem;
  font-weight: 700;
}

.toolbar-number {
  width: 54px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-secondary) 86%, white 4%);
  color: var(--color-text);
  font: inherit;
}

.toolbar-number:hover:not(:disabled),
.toolbar-number:focus-visible {
  border-color: color-mix(in srgb, var(--color-primary) 20%, var(--color-border));
  outline: none;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.08),
    0 0 0 2px color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.editor-stage {
  padding-top: 16px;
  min-width: 0;
}

.rich-editor {
  min-height: 58vh;
  padding: 24px 26px;
  border-radius: 22px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 10%, var(--color-border));
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-bg-secondary) 88%, black 12%) 0%,
      color-mix(in srgb, var(--color-bg) 86%, black 14%) 100%
    );
  color: var(--color-text);
  font-size: 17px;
  line-height: 1.85;
  overflow-wrap: anywhere;
  word-break: break-word;
  outline: none;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.04),
    inset 0 0 0 1px rgb(255 255 255 / 0.02);
}

.rich-editor :deep(p),
.rich-editor :deep(h1),
.rich-editor :deep(h2),
.rich-editor :deep(h3),
.rich-editor :deep(blockquote),
.rich-editor :deep(li) {
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.rich-editor :deep(pre) {
  max-width: 100%;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.rich-editor :deep(img) {
  max-width: 100%;
}

.rich-editor--readonly {
  opacity: 0.82;
  cursor: not-allowed;
}

.rich-editor:empty::before {
  content: '从这里开始写正文，像在公众号后台写一篇新文章。';
  color: var(--color-text-secondary);
}

.editor-stage__tips {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-top: 12px;
  font-size: 0.82rem;
}

.side-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.side-tabs__item {
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-bg) 82%, black 18%);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.side-tabs__item--active {
  border-color: color-mix(in srgb, var(--color-primary) 35%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg));
  color: var(--color-text);
}

.preview-panel,
.outline-panel,
.quality-panel {
  min-height: 60vh;
}

.preview-panel {
  overflow: auto;
  padding-right: 6px;
  min-width: 0;
}

.article-preview {
  display: grid;
  gap: 16px;
  padding: 8px 4px 16px;
}

.article-preview__head h2,
.article-preview__head p {
  margin: 0;
}

.article-preview__body {
  display: grid;
  gap: 12px;
  color: var(--color-text);
  line-height: 1.85;
  padding: 18px 18px 20px;
  border: 1px solid color-mix(in srgb, var(--color-border) 68%, transparent);
  border-radius: 18px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-bg-secondary) 84%, black 16%) 0%,
      color-mix(in srgb, var(--color-bg) 88%, black 12%) 100%
    );
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.article-preview__body :deep(h1),
.article-preview__body :deep(h2),
.article-preview__body :deep(h3) {
  margin: 20px 0 8px;
  line-height: 1.4;
}

.article-preview__body :deep(p),
.article-preview__body :deep(ul),
.article-preview__body :deep(ol),
.article-preview__body :deep(blockquote),
.article-preview__body :deep(pre) {
  margin: 0 0 12px;
}

.article-preview__body :deep(blockquote) {
  padding: 10px 14px;
  border-left: 3px solid var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg));
  border-radius: 12px;
}

.article-preview__body :deep(hr) {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 18px 0;
}

.article-preview__body :deep(img) {
  max-width: 100%;
  border-radius: 16px;
  border: 1px solid var(--color-border);
}

.article-preview__body :deep(pre) {
  max-width: 100%;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.outline-list {
  display: grid;
  gap: 8px;
}

.outline-list__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-bg) 82%, black 18%);
  text-align: left;
  cursor: pointer;
}

.outline-list__level {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-primary-dark);
}

.quality-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.quality-panel__metric {
  display: grid;
  gap: 6px;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--color-bg) 82%, black 18%);
}

.quality-panel__metric strong {
  font-size: 1.1rem;
}

.hidden-input {
  display: none;
}

.link-dialog {
  display: grid;
  gap: 10px;
}

.cropper-wrap {
  display: grid;
  gap: 14px;
}

.cropper-viewport {
  width: 100%;
  max-width: 560px;
  aspect-ratio: 16 / 9;
  margin: 0 auto;
  border-radius: 18px;
  overflow: hidden;
  background: #111827;
  position: relative;
  touch-action: none;
  cursor: grab;
}

.cropper-viewport:active {
  cursor: grabbing;
}

.cropper-image {
  position: absolute;
  left: 50%;
  top: 50%;
  transform-origin: center center;
  user-select: none;
  pointer-events: none;
}

.cropper-controls {
  display: grid;
  gap: 12px;
}

.slider {
  width: 100%;
}

@media (max-width: 1440px) {
  .editor-shell {
    grid-template-columns: 280px minmax(0, 1fr) 320px;
  }
}

@media (max-width: 1100px) {
  .editor-topbar {
    grid-template-columns: 1fr;
  }

  .editor-topbar__status {
    justify-content: flex-start;
  }

  .editor-shell {
    grid-template-columns: 1fr;
  }

  .editor-card--main,
  .editor-card--side {
    min-height: auto;
  }
}

@media (max-width: 768px) {
  .editor-topbar,
  .editor-card,
  .recovery-banner,
  .readonly-banner {
    border-radius: 18px;
  }

  .editor-topbar__left,
  .editor-topbar__status,
  .editor-topbar__actions,
  .recovery-banner {
    flex-direction: column;
    align-items: stretch;
  }

  .editor-stage__tips,
  .quality-panel {
    grid-template-columns: 1fr;
    flex-direction: column;
  }

  .editor-toolbar {
    padding: 10px;
    border-radius: 14px;
  }

  .toolbar-group {
    min-height: 30px;
  }

  .toolbar-separator {
    display: none;
  }

  .toolbar-group--advanced,
  .toolbar-separator--advanced {
    display: none;
  }

  .toolbar-group--more {
    display: inline-flex;
  }

  .editor-toolbar--overflow-open .toolbar-separator--advanced {
    display: block;
    flex-basis: 100%;
    width: 100%;
    height: 1px;
  }

  .editor-toolbar--overflow-open .toolbar-group--advanced {
    display: inline-flex;
    flex-basis: 100%;
    margin-left: 0;
  }

  .rich-editor {
    min-height: 42vh;
    padding: 18px;
    font-size: 16px;
  }
}
</style>
