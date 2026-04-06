<template>
  <div class="page-wrap page-workspace entity-page">
    <section v-if="currentConfig" class="workspace-shell workspace-shell--unified">
      <div class="workspace-hero workspace-hero--unified hero-card">
        <div class="workspace-hero__copy">
        <p class="hero-card__eyebrow">{{ currentConfig.badge }}</p>
        <h1 class="page-head__title hero-card__title">{{ currentConfig.title }}</h1>
        <p class="page-head__subtitle hero-card__subtitle">{{ currentConfig.subtitle }}</p>
        <div v-if="entityType === 'projectiles'" class="hero-inline-notes">
          <span class="hero-inline-note">中文名优先展示</span>
          <span class="hero-inline-note">English name retained</span>
          <span class="hero-inline-note">Internal name preserved</span>
        </div>
      </div>
      <div class="hero-stats entity-hero__stats workspace-summary-grid">
        <article class="hero-stat">
          <span class="hero-stat__label">总数</span>
          <strong class="hero-stat__value">{{ entityTotalCount }}</strong>
        </article>
        <article class="hero-stat">
          <span class="hero-stat__label">当前可见</span>
          <strong class="hero-stat__value">{{ displayRows.length }}</strong>
        </article>
        <article class="hero-stat">
          <span class="hero-stat__label">模式</span>
          <strong class="hero-stat__value">{{ hasActiveFilters ? '筛选中' : '浏览' }}</strong>
        </article>
      </div>
      </div>
    </section>

    <section v-if="!currentConfig" class="section-card">
      <p class="empty-text">暂不支持的实体类型：{{ entityType }}</p>
    </section>

    <template v-else>
      <section class="workspace-controls workspace-controls--integrated">
        <form class="toolbar" @submit.prevent="handleSearch">
          <label class="field field--search">
            <span class="field__label">关键词</span>
            <div class="search-wrap">
              <span class="search-wrap__icon">
                <Search :size="16" />
              </span>
              <input v-model.trim="search" class="input input--search" type="text" :placeholder="currentConfig.searchPlaceholder" />
            </div>
          </label>
          <label v-if="entityType === 'npcs'" class="field">
            <span class="field__label">分类</span>
            <AppCategoryPicker
              v-model="selectedNpcCategoryId"
              :categories="npcCategoryTree"
              placeholder="全部 NPC 分类"
              title="选择 NPC 分类"
              clear-text="清空分类"
              compact
            />
          </label>
          <div v-if="entityType === 'buffs'" class="field field--full">
            <div class="field__topline">
              <span class="field__label">分类筛选</span>
              <span class="field__hint">按 Buff 类型快速切换，点击即生效。</span>
            </div>
            <div class="filter-chip-group" role="tablist" aria-label="Buff 类型筛选">
              <button
                v-for="option in buffTypeOptions"
                :key="option.value"
                type="button"
                class="filter-chip"
                :class="{ 'filter-chip--active': selectedBuffType === option.value }"
                :aria-pressed="selectedBuffType === option.value"
                @click="handleBuffTypeChange(option.value)"
              >
                <span>{{ option.label }}</span>
                <small>{{ option.description }}</small>
              </button>
            </div>
          </div>
          <div v-if="entityType === 'bosses'" class="field field--full">
            <div class="field__topline">
              <span class="field__label">基础分类</span>
              <span class="field__hint">按 Terraria 进度与特殊来源浏览 Boss 档案，计数会跟随关键词搜索更新。</span>
            </div>
            <div class="boss-type-strip" role="tablist" aria-label="Boss 基础分类筛选">
              <button
                v-for="option in bossTypeCards"
                :key="option.value"
                type="button"
                class="boss-type-pill"
                :class="{ 'boss-type-pill--active': selectedBossType === option.value }"
                :aria-pressed="selectedBossType === option.value"
                @click="handleBossTypeChange(option.value)"
              >
                <span class="boss-type-pill__eyebrow">{{ option.eyebrow }}</span>
                <strong>{{ option.label }}</strong>
                <small>{{ option.count }} 条</small>
              </button>
            </div>
          </div>
          <div class="toolbar__actions">
            <button type="submit" class="btn btn-primary">搜索</button>
            <button type="button" class="btn btn-secondary" @click="handleReset">重置</button>
            <button type="button" class="btn btn-strong" @click="openCreateDialog">新增{{ currentConfig.shortLabel }}</button>
          </div>
        </form>
      </section>

      <section v-if="entityType === 'bosses'" class="section-card boss-browser">
        <div class="boss-browser__head">
          <div>
            <h2 class="section-card__title">Boss 图谱</h2>
            <p class="section-card__subtitle">按基础分类查看真实 Boss 主图，点开详情可检查成员 NPC、部件归组和组合 Boss 引用关系。</p>
          </div>
          <div class="table-card__summary">
            <span>{{ displayRows.length }} 条可见</span>
            <span>{{ bossSourceRows.length }} 条归档</span>
          </div>
        </div>

        <div class="boss-type-grid">
          <button
            v-for="option in bossTypeCards"
            :key="`boss-grid-${option.value}`"
            type="button"
            class="boss-type-card"
            :class="{ 'boss-type-card--active': selectedBossType === option.value }"
            @click="handleBossTypeChange(option.value)"
          >
            <span class="boss-type-card__eyebrow">{{ option.eyebrow }}</span>
            <strong>{{ option.label }}</strong>
            <small>{{ option.description }}</small>
            <span class="boss-type-card__count">{{ option.count }}</span>
          </button>
        </div>

        <div v-if="displayRows.length" class="boss-gallery">
          <article v-for="row in displayRows" :key="`boss-card-${row.id}`" class="boss-card">
            <button type="button" class="boss-card__media" @click="row.__imageUrl ? openImageLightbox(row.__imageUrl, getDisplayTitle(row)) : openDetailDialog(row)">
              <img v-if="row.__imageUrl" :src="row.__imageUrl" class="boss-card__image" alt="" loading="lazy" @error="handleImageError" />
              <div v-else class="boss-card__fallback">{{ currentConfig.fallback }}</div>
            </button>
            <div class="boss-card__body">
              <div class="boss-card__pills">
                <span class="preview-pill preview-pill--accent">{{ getBossTypeLabel(row.bossType) }}</span>
                <span class="preview-pill">成员 {{ row.memberCount ?? 0 }}</span>
                <span v-if="row.memberSourceMode === 'reference'" class="preview-pill">组合引用</span>
              </div>
              <div class="boss-card__heading">
                <h3>{{ getDisplayTitle(row) }}</h3>
                <p>{{ getBossCardSubtitle(row) }}</p>
              </div>
              <p class="boss-card__note">{{ getBossCardNote(row) }}</p>
              <div class="boss-card__meta">
                <span>Code {{ row.code || '--' }}</span>
                <span>进度序 {{ row.progressionOrder ?? '--' }}</span>
              </div>
              <div class="boss-card__actions">
                <button type="button" class="btn-link" @click="openDetailDialog(row)">详情</button>
                <button type="button" class="btn-link" @click="openEditDialog(row)">编辑</button>
              </div>
            </div>
          </article>
        </div>
        <p v-else class="empty-text">当前筛选条件下暂无 Boss 档案。</p>
      </section>

      <section class="section-card workspace-content table-card">
        <div class="table-card__head">
          <div>
            <h2 class="section-card__title">数据列表</h2>
            <p class="section-card__subtitle">{{ tableCardSubtitle }}</p>
          </div>
          <div class="table-card__summary">
            <span>{{ displayRows.length }} 条可见</span>
            <span>{{ entityTotalCount }} 条总计</span>
          </div>
        </div>

        <div v-if="loading" class="empty-text">加载中...</div>
        <template v-else>
          <div v-if="displayRows.length" class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th v-for="column in currentConfig.columns" :key="column.key">{{ column.label }}</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in displayRows" :key="row.id">
                  <td v-for="column in currentConfig.columns" :key="`${row.id}-${column.key}`">
                    <template v-if="column.key === '__imageUrl'">
                      <div class="thumb-wrap">
                        <img v-if="row.__imageUrl" :src="row.__imageUrl" class="thumb" alt="" loading="lazy" @error="handleImageError" />
                        <span v-else class="thumb thumb--fallback">{{ currentConfig.fallback }}</span>
                      </div>
                    </template>
                    <template v-else-if="column.key === currentConfig.primaryColumn">
                      <div class="cell-primary">
                        <strong>{{ getDisplayTitle(row) }}</strong>
                        <span v-if="getDisplaySubtitle(row)">{{ getDisplaySubtitle(row) }}</span>
                        <div v-if="entityType === 'armor-sets'" class="cell-badges">
                          <span v-if="getArmorSetWearCount(row, 'male')" class="cell-badge">男套 {{ getArmorSetWearCount(row, 'male') }}</span>
                          <span v-if="getArmorSetWearCount(row, 'female')" class="cell-badge">女套 {{ getArmorSetWearCount(row, 'female') }}</span>
                          <span v-if="getArmorSetWearCount(row, 'special')" class="cell-badge">特殊 {{ getArmorSetWearCount(row, 'special') }}</span>
                          <span v-if="getArmorSetRelatedCount(row)" class="cell-badge">装配 {{ getArmorSetRelatedCount(row) }}</span>
                          <span class="cell-badge cell-badge--accent">点详情查看</span>
                        </div>
                        <div v-else-if="entityType === 'projectiles'" class="cell-badges">
                          <span class="cell-badge cell-badge--accent">{{ getProjectileNameZh(row) ? '中英双语' : '待补中文' }}</span>
                          <span v-for="tag in getProjectileTags(row).slice(0, 4)" :key="`${row.id}-${tag}`" class="cell-badge">{{ tag }}</span>
                        </div>
                        <div v-else-if="entityType === 'bosses'" class="cell-badges">
                          <span class="cell-badge cell-badge--accent">{{ getBossTypeLabel(row.bossType) }}</span>
                          <span class="cell-badge">成员 {{ row.memberCount ?? 0 }}</span>
                          <span v-if="row.memberSourceMode === 'reference'" class="cell-badge">组合引用</span>
                        </div>
                        <div v-if="entityType === 'projectiles'" class="cell-bilingual">
                          <span><strong>ZH</strong> {{ getProjectileNameZh(row) || '待补充' }}</span>
                          <span><strong>EN</strong> {{ getProjectileNameEn(row) }}</span>
                        </div>
                        <code v-if="getAtomicSummary(row)" class="cell-primary__atomic">{{ getAtomicSummary(row) }}</code>
                      </div>
                    </template>
                    <span v-else>{{ formatCell(row, column.key) }}</span>
                  </td>
                  <td>
                    <div class="row-actions">
                      <button v-if="entityType === 'armor-sets' || entityType === 'projectiles' || entityType === 'buffs' || entityType === 'bosses'" type="button" class="btn-link" @click="openDetailDialog(row)">详情</button>
                      <button type="button" class="btn-link" @click="openEditDialog(row)">编辑</button>
                      <button type="button" class="btn-link btn-link--danger" @click="handleDelete(row)">删除</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="empty-text">暂无数据</p>
        </template>

        <div v-if="entityType !== 'bosses' && pagination.totalPages > 1" class="pagination-wrap">
          <AppPagination :page="pagination.page" :total="pagination.total" :total-pages="pagination.totalPages" @change="handlePageChange" />
        </div>
      </section>

      <AppModal v-model="dialogVisible" :title="isEdit ? `编辑${currentConfig.title}` : `新增${currentConfig.title}`" width="min(1160px, calc(100vw - 32px))">
        <div class="editor-layout">
          <section class="editor-pane">
            <div class="editor-pane__head">
              <h3>编辑区</h3>
              <p>主编辑区优先放中文展示字段，辅助保留原子字段和 JSON 帮助信息。</p>
            </div>
            <div class="form-grid">
              <template v-for="field in coreFields" :key="field.key">
                <label class="field" :class="field.span === 'full' ? 'field--full' : ''">
                  <div class="field__topline">
                    <span class="field__label">{{ field.label }}<span v-if="field.required" class="field__required">*</span></span>
                    <button v-if="field.format === 'json'" type="button" class="field__action" @click="formatJsonField(field.key)">Format JSON</button>
                  </div>
                  <textarea v-if="field.type === 'textarea'" v-model="form[field.key]" class="input textarea" :class="{ 'textarea--code': field.format === 'json' }" :rows="field.rows || 4" :placeholder="field.placeholder || field.label" />
                  <select v-else-if="field.type === 'boolean'" v-model="form[field.key]" class="input">
                    <option :value="true">true</option>
                    <option :value="false">false</option>
                  </select>
                  <input v-else v-model="form[field.key]" class="input" :type="field.type === 'number' ? 'number' : 'text'" :placeholder="field.placeholder || field.label" />
                  <span v-if="field.helper" class="field__hint">{{ field.helper }}</span>
                </label>
              </template>
            </div>

            <div v-if="advancedFields.length" class="advanced-fields">
              <div class="editor-pane__subhead">
                <h4>结构化编辑</h4>
                <p>用于维护关系、资源和扩展 JSON 字段。</p>
              </div>
              <div class="form-grid">
                <template v-for="field in advancedFields" :key="field.key">
                  <label class="field" :class="field.span === 'full' ? 'field--full' : ''">
                    <div class="field__topline">
                      <span class="field__label">{{ field.label }}</span>
                      <button v-if="field.format === 'json'" type="button" class="field__action" @click="formatJsonField(field.key)">Format JSON</button>
                    </div>
                    <textarea v-model="form[field.key]" class="input textarea textarea--code" :rows="field.rows || 6" :placeholder="field.placeholder || field.label" />
                    <span v-if="field.helper" class="field__hint">{{ field.helper }}</span>
                  </label>
                </template>
              </div>
            </div>
          </section>

          <aside class="preview-pane">
            <section class="preview-card preview-card--hero">
              <div class="preview-card__media">
                <img v-if="previewImageUrl" :src="previewImageUrl" class="preview-card__image" alt="" @error="handleImageError" />
                <div v-else class="preview-card__placeholder">{{ currentConfig.fallback }}</div>
              </div>
              <div class="preview-card__body">
                <div class="preview-pills">
                  <span class="preview-pill preview-pill--accent">{{ currentConfig.badge }}</span>
                  <span class="preview-pill">{{ statusLabel }}</span>
                </div>
                <h3>{{ previewTitle }}</h3>
                <p>{{ previewSubtitle }}</p>
                <div class="preview-stats">
                  <article v-for="stat in previewStats" :key="stat.label" class="preview-stat">
                    <span>{{ stat.label }}</span>
                    <strong>{{ stat.value }}</strong>
                  </article>
                </div>
              </div>
            </section>

            <section v-if="previewNotes.length" class="preview-card">
              <div class="preview-card__head"><h4>内容预览</h4><span>{{ previewNotes.length }} 段</span></div>
              <article v-for="note in previewNotes" :key="note.label" class="preview-note">
                <strong>{{ note.label }}</strong>
                <p>{{ note.value }}</p>
              </article>
            </section>

            <section v-if="entityType === 'armor-sets'" class="preview-card">
              <div class="preview-card__head"><h4>映射状态</h4><span>{{ previewRow.definitionMappingStatus || 'placeholder' }}</span></div>
              <article class="preview-note">
                <strong>定义匹配</strong>
                <p>
                  {{
                    previewRow.definitionMappingStatus === 'mapped'
                      ? '当前穿戴套装已自动挂接到标准化套装加成定义。'
                      : '当前仍为占位定义，需要继续补充映射。'
                  }}
                </p>
              </article>
            </section>

            <section v-if="armorSetPreviewImages.length" class="preview-card">
              <div class="preview-card__head"><h4>穿戴套装图片</h4><span>{{ armorSetPreviewImages.length }} 张</span></div>
              <div class="preview-gallery">
                <img v-for="image in armorSetPreviewImages" :key="image" :src="image" class="preview-gallery__image" alt="" @error="handleImageError" />
              </div>
            </section>

            <section v-if="armorSetRelatedItems.length" class="preview-card">
              <div class="preview-card__head"><h4>套装物品预览</h4><span>{{ armorSetRelatedItems.length }} 件</span></div>
              <div class="related-items">
                <article v-for="item in armorSetRelatedItems" :key="item.id ?? item.internalName" class="related-item">
                  <img v-if="item.image" :src="item.image" class="related-item__image" alt="" @error="handleImageError" />
                  <div v-else class="related-item__fallback">IT</div>
                  <div class="related-item__body">
                    <strong>{{ item.nameZh || item.name || item.internalName || `#${item.id}` }}</strong>
                    <span>{{ item.internalName || `ID ${item.id}` }}</span>
                  </div>
                </article>
              </div>
            </section>

            <section v-if="previewReferenceFields.length" class="preview-card">
              <div class="preview-card__head"><h4>英文参考字段</h4><span>{{ previewReferenceFields.length }} 项</span></div>
              <article v-for="field in previewReferenceFields" :key="field.label" class="preview-note">
                <strong>{{ field.label }}</strong>
                <p>{{ field.value }}</p>
              </article>
            </section>

            <section v-if="previewAtomicFields.length" class="preview-card">
              <div class="preview-card__head"><h4>原子字段</h4><span>{{ previewAtomicFields.length }} 项</span></div>
              <article v-for="field in previewAtomicFields" :key="field.label" class="preview-note">
                <strong>{{ field.label }}</strong>
                <p>{{ field.value }}</p>
              </article>
            </section>

            <section v-if="jsonPreviewBlocks.length" class="preview-card">
              <div class="preview-card__head"><h4>结构化字段</h4><span>{{ jsonPreviewBlocks.length }} 项</span></div>
              <article v-for="block in jsonPreviewBlocks" :key="block.label" class="preview-json">
                <div class="preview-json__head">
                  <strong>{{ block.label }}</strong>
                  <span>{{ block.summary }}</span>
                </div>
                <pre>{{ block.preview }}</pre>
              </article>
            </section>
          </aside>
        </div>

        <template #footer>
          <button type="button" class="btn btn-secondary" @click="dialogVisible = false">取消</button>
          <button type="button" class="btn btn-strong" :disabled="submitting" @click="handleSubmit">{{ submitting ? '提交中...' : isEdit ? '保存更改' : '创建记录' }}</button>
        </template>
      </AppModal>

      <AppModal v-model="detailVisible" :title="detailModalTitle" width="min(1280px, calc(100vw - 32px))" body-padding="0">
        <div v-if="detailRow && entityType === 'armor-sets'" class="armor-detail">
          <section class="armor-detail__hero">
            <div class="armor-detail__hero-media">
              <img v-if="detailHeroImage" :src="detailHeroImage" class="armor-detail__hero-image" alt="" @error="handleImageError" />
              <div v-else class="armor-detail__hero-fallback">{{ currentConfig?.fallback || 'AS' }}</div>
            </div>
            <div class="armor-detail__hero-body">
              <div class="preview-pills">
                <span class="preview-pill preview-pill--accent">SET COMPOSER</span>
                <span class="preview-pill">{{ detailRow.definitionMappingStatus || 'placeholder' }}</span>
              </div>
              <h3>{{ detailTitle }}</h3>
              <p>{{ detailSubtitle }}</p>
              <div class="preview-stats">
                <article v-for="stat in detailStats" :key="stat.label" class="preview-stat">
                  <span>{{ stat.label }}</span>
                  <strong>{{ stat.value }}</strong>
                </article>
              </div>
            </div>
          </section>

          <section v-if="armorSetDetailImageGroups.length" class="armor-detail__section">
            <div class="armor-detail__section-head">
              <h4>穿戴套装展示</h4>
              <span>{{ armorSetDetailImageGroups.length }} 组</span>
            </div>
            <p class="armor-detail__helper">优先展示男套、女套和特殊穿戴图。点击任意图片可放大查看细节。</p>
            <div class="armor-detail__wear-groups">
              <article v-for="group in armorSetDetailImageGroups" :key="group.label" class="armor-detail__wear-group">
                <div class="armor-detail__section-head armor-detail__section-head--sub">
                  <div class="armor-detail__section-copy">
                    <strong>{{ group.label }}</strong>
                    <p>{{ group.description }}</p>
                  </div>
                  <span>{{ group.images.length }} 张</span>
                </div>
                <div class="armor-detail__wear-layout">
                  <button type="button" class="armor-detail__wear-feature" @click="group.images[0] ? openImageLightbox(group.images[0], `${group.label} 主展示`) : null">
                    <img :src="group.images[0]" class="armor-detail__wear-feature-image" alt="" @error="handleImageError" />
                  </button>
                  <div class="preview-gallery armor-detail__wear-strip">
                    <img v-for="image in group.images" :key="`${group.label}-${image}`" :src="image" class="preview-gallery__image armor-detail__zoomable" alt="" @error="handleImageError" @click="openImageLightbox(image, group.label)" />
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section v-if="detailRelatedItemGroups.length" class="armor-detail__section">
            <div class="armor-detail__section-head">
              <h4>具体装配图片</h4>
              <span>{{ detailRelatedItems.length }} 件</span>
            </div>
            <p class="armor-detail__helper">装配物品会按头部、身体、腿部和其他部位自动分组，便于快速核对整套构成。</p>
            <div class="armor-detail__item-groups">
              <section v-for="group in detailRelatedItemGroups" :key="group.key" class="armor-detail__item-group">
                <div class="armor-detail__section-head armor-detail__section-head--sub">
                  <div class="armor-detail__section-copy">
                    <strong>{{ group.label }}</strong>
                    <p>{{ group.description }}</p>
                  </div>
                  <span>{{ group.items.length }} 件</span>
                </div>
                <div class="armor-detail__item-grid">
                  <article v-for="item in group.items" :key="item.id ?? item.internalName" class="armor-detail__item-card">
                    <button type="button" class="armor-detail__item-media" @click="item.image ? openImageLightbox(item.image, item.nameZh || item.name || item.internalName || '物品图片') : null">
                      <img v-if="item.image" :src="item.image" class="armor-detail__item-image" alt="" @error="handleImageError" />
                      <div v-else class="armor-detail__item-fallback">IT</div>
                    </button>
                    <div class="armor-detail__item-body">
                      <strong>{{ item.nameZh || item.name || item.internalName || `#${item.id}` }}</strong>
                      <span>{{ item.internalName || `ID ${item.id}` }}</span>
                    </div>
                  </article>
                </div>
              </section>
            </div>
          </section>
        </div>

        <div v-else-if="detailRow && entityType === 'bosses'" class="boss-detail">
          <section class="boss-detail__hero">
            <div class="boss-detail__media">
              <img v-if="detailHeroImage" :src="detailHeroImage" class="boss-detail__image" alt="" @error="handleImageError" />
              <div v-else class="boss-detail__fallback">{{ currentConfig?.fallback || 'BS' }}</div>
            </div>
            <div class="boss-detail__body">
              <div class="preview-pills">
                <span class="preview-pill preview-pill--accent">BOSS ARCHIVE</span>
                <span class="preview-pill">{{ getBossTypeLabel(detailRow.bossType) }}</span>
                <span class="preview-pill">{{ bossMemberSourceLabel }}</span>
              </div>
              <h3>{{ detailTitle }}</h3>
              <p>{{ detailSubtitle }}</p>
              <div class="preview-stats">
                <article v-for="stat in detailStats" :key="stat.label" class="preview-stat">
                  <span>{{ stat.label }}</span>
                  <strong>{{ stat.value }}</strong>
                </article>
              </div>
            </div>
          </section>

          <section v-if="bossDetailMemberGroups.length" class="boss-detail__section">
            <div class="boss-detail__section-head">
              <h4>{{ bossMemberSectionTitle }}</h4>
              <span>{{ bossDetailMembers.length }} 条</span>
            </div>
            <p class="boss-detail__helper">{{ bossMemberSectionHelper }}</p>
            <div class="boss-detail__group-list">
              <section v-for="group in bossDetailMemberGroups" :key="group.key" class="boss-detail__group">
                <div class="boss-detail__section-head boss-detail__section-head--sub">
                  <div class="armor-detail__section-copy">
                    <strong>{{ group.label }}</strong>
                    <p>{{ group.description }}</p>
                  </div>
                  <span>{{ group.members.length }} 条</span>
                </div>
                <div class="boss-detail__member-grid">
                  <article v-for="member in group.members" :key="`${group.key}-${member.id ?? member.internalName}`" class="boss-detail__member-card">
                    <button type="button" class="boss-detail__member-media" @click="member.imageUrl ? openImageLightbox(member.imageUrl, member.nameZh || member.name || member.internalName || 'Boss 成员') : null">
                      <img v-if="member.imageUrl" :src="member.imageUrl" class="boss-detail__member-image" alt="" @error="handleImageError" />
                      <div v-else class="boss-detail__member-fallback">{{ group.short }}</div>
                    </button>
                    <div class="boss-detail__member-body">
                      <div class="boss-detail__member-pills">
                        <span class="cell-badge cell-badge--accent">{{ group.label }}</span>
                        <span v-if="member.sourceBossCode" class="cell-badge">{{ member.sourceBossCode }}</span>
                      </div>
                      <strong>{{ member.nameZh || member.name || member.internalName || `NPC ${member.gameId ?? member.id ?? '--'}` }}</strong>
                      <span>{{ member.name && member.nameZh ? member.name : member.internalName || '--' }}</span>
                      <span>Game ID {{ member.gameId ?? '--' }}</span>
                    </div>
                  </article>
                </div>
              </section>
            </div>
          </section>

          <section class="boss-detail__section">
            <div class="boss-detail__section-head">
              <h4>档案说明</h4>
              <span>{{ detailRow.sourcePage ? 'Wiki 来源' : '本地档案' }}</span>
            </div>
            <div class="projectile-detail__note-grid">
              <article v-if="detailRow.notes" class="preview-note">
                <strong>Boss Notes</strong>
                <p>{{ detailRow.notes }}</p>
              </article>
              <article v-if="detailRow.sourcePage" class="preview-note">
                <strong>Source Page</strong>
                <p>{{ detailRow.sourcePage }}</p>
              </article>
              <article v-if="detailRow.sourceRevisionTimestamp" class="preview-note">
                <strong>Source Revision</strong>
                <p>{{ formatDateTime(detailRow.sourceRevisionTimestamp) }}</p>
              </article>
            </div>
          </section>
        </div>

        <div v-else-if="detailRow && entityType === 'projectiles'" class="projectile-detail">
          <section class="projectile-detail__hero">
            <div class="projectile-detail__media">
              <img v-if="detailHeroImage" :src="detailHeroImage" class="projectile-detail__image" alt="" @error="handleImageError" />
              <div v-else class="projectile-detail__fallback">{{ currentConfig?.fallback || 'PJ' }}</div>
            </div>
            <div class="projectile-detail__body">
              <div class="preview-pills">
                <span class="preview-pill preview-pill--accent">PROJECTILE PROFILE</span>
                <span class="preview-pill">{{ getProjectileNameZh(detailRow) ? 'ZH + EN' : 'EN only' }}</span>
                <span v-for="tag in getProjectileTags(detailRow).slice(0, 4)" :key="`detail-${tag}`" class="preview-pill">{{ tag }}</span>
              </div>
              <h3>{{ detailTitle }}</h3>
              <p>{{ projectileDetailSummary }}</p>
              <div class="projectile-detail__lang-grid">
                <article class="projectile-detail__lang-card">
                  <span>中文名</span>
                  <strong>{{ getProjectileNameZh(detailRow) || '待补充' }}</strong>
                </article>
                <article class="projectile-detail__lang-card">
                  <span>English Name</span>
                  <strong>{{ getProjectileNameEn(detailRow) }}</strong>
                </article>
                <article class="projectile-detail__lang-card">
                  <span>Internal Name</span>
                  <strong>{{ detailRow.internalName || '--' }}</strong>
                </article>
              </div>
              <div class="preview-stats">
                <article v-for="stat in detailStats" :key="stat.label" class="preview-stat">
                  <span>{{ stat.label }}</span>
                  <strong>{{ stat.value }}</strong>
                </article>
              </div>
            </div>
          </section>

          <section class="projectile-detail__section">
            <div class="projectile-detail__section-head">
              <h4>行为与判定</h4>
              <span>{{ projectileBehaviorNotes.length }} 项</span>
            </div>
            <div class="projectile-detail__chip-grid">
              <article v-for="note in projectileBehaviorNotes" :key="note.label" class="projectile-detail__chip">
                <span>{{ note.label }}</span>
                <strong>{{ note.value }}</strong>
              </article>
            </div>
          </section>

          <section v-if="projectileRawJsonHighlights.length" class="projectile-detail__section">
            <div class="projectile-detail__section-head">
              <h4>Raw JSON 摘要</h4>
              <span>{{ projectileRawJsonHighlights.length }} 项</span>
            </div>
            <div class="projectile-detail__note-grid">
              <article v-for="note in projectileRawJsonHighlights" :key="note.label" class="preview-note">
                <strong>{{ note.label }}</strong>
                <p>{{ note.value }}</p>
              </article>
            </div>
          </section>

          <section v-if="detailRow.rawJson" class="projectile-detail__section">
            <div class="projectile-detail__section-head">
              <h4>原始数据</h4>
              <span>Raw JSON</span>
            </div>
            <pre class="projectile-detail__code">{{ formatPrettyJson(detailRow.rawJson) }}</pre>
          </section>
        </div>

        <div v-else-if="detailRow && entityType === 'buffs'" class="projectile-detail projectile-detail--buff">
          <section class="projectile-detail__hero">
            <div class="projectile-detail__media">
              <img v-if="detailHeroImage" :src="detailHeroImage" class="projectile-detail__image" alt="" @error="handleImageError" />
              <div v-else class="projectile-detail__fallback">{{ currentConfig?.fallback || 'BF' }}</div>
            </div>
            <div class="projectile-detail__body">
              <div class="preview-pills">
                <span class="preview-pill preview-pill--accent">BUFF PROFILE</span>
                <span class="preview-pill">{{ detailRow.buffType || 'unknown' }}</span>
                <span class="preview-pill">来源 {{ detailSourceItems.length }}</span>
                <span class="preview-pill">免疫 NPC {{ detailImmuneNpcSamples.length }}</span>
              </div>
              <h3>{{ detailTitle }}</h3>
              <p>{{ detailSubtitle }}</p>
              <div class="projectile-detail__lang-grid">
                <article class="projectile-detail__lang-card">
                  <span>中文名</span>
                  <strong>{{ detailRow.nameZh || '--' }}</strong>
                </article>
                <article class="projectile-detail__lang-card">
                  <span>English Name</span>
                  <strong>{{ detailRow.englishName || '--' }}</strong>
                </article>
                <article class="projectile-detail__lang-card">
                  <span>Internal Name</span>
                  <strong>{{ detailRow.internalName || '--' }}</strong>
                </article>
              </div>
              <div class="preview-stats">
                <article v-for="stat in detailStats" :key="stat.label" class="preview-stat">
                  <span>{{ stat.label }}</span>
                  <strong>{{ stat.value }}</strong>
                </article>
              </div>
            </div>
          </section>

          <section v-if="detailBuffNotes.length" class="projectile-detail__section">
            <div class="projectile-detail__section-head">
              <h4>提示文本</h4>
              <span>{{ detailBuffNotes.length }} 项</span>
            </div>
            <div class="projectile-detail__note-grid">
              <article v-for="note in detailBuffNotes" :key="note.label" class="preview-note">
                <strong>{{ note.label }}</strong>
                <p>{{ note.value }}</p>
              </article>
            </div>
          </section>

          <section v-if="detailSourceItems.length" class="projectile-detail__section">
            <div class="projectile-detail__section-head">
              <h4>关联物品（数据库）</h4>
              <span>{{ detailSourceItems.length }} 条</span>
            </div>
            <div class="armor-detail__item-grid">
              <article v-for="(item, index) in detailSourceItems" :key="`${item.itemId ?? item.internalName ?? item.name ?? index}`" class="armor-detail__item-card">
                <button type="button" class="armor-detail__item-media" @click="item.image ? openImageLightbox(item.image, item.nameZh || item.name || item.internalName || '物品图片') : null">
                  <img v-if="item.image" :src="item.image" class="armor-detail__item-image" alt="" @error="handleImageError" />
                  <div v-else class="armor-detail__item-fallback">IT</div>
                </button>
                <div class="armor-detail__item-body">
                  <strong>{{ item.nameZh || item.name || item.nameEn || item.internalName || `Item ${item.itemId ?? index + 1}` }}</strong>
                  <span>{{ item.internalName || `Source ID ${item.itemId ?? '--'}` }}</span>
                  <span>持续 {{ item.buffTime != null ? item.buffTime : '--' }}</span>
                </div>
              </article>
            </div>
          </section>

          <section v-if="detailImmuneNpcSamples.length" class="projectile-detail__section">
            <div class="projectile-detail__section-head">
              <h4>免疫 NPC 样例</h4>
              <span>{{ detailImmuneNpcSamples.length }} 条</span>
            </div>
            <div class="armor-detail__item-grid">
              <article v-for="(npc, index) in detailImmuneNpcSamples" :key="`${npc.npcId ?? npc.internalName ?? npc.name ?? index}`" class="armor-detail__item-card">
                <button type="button" class="armor-detail__item-media" @click="npc.__imageUrl ? openImageLightbox(npc.__imageUrl, npc.nameZh || npc.name || npc.internalName || `NPC ${npc.npcId ?? index + 1}`) : null">
                  <img v-if="npc.__imageUrl" :src="npc.__imageUrl" class="armor-detail__item-image" alt="" @error="handleImageError" />
                  <div v-else class="armor-detail__item-fallback">NP</div>
                </button>
                <div class="armor-detail__item-body">
                  <strong>{{ npc.nameZh || npc.name || npc.internalName || `NPC ${npc.npcId ?? index + 1}` }}</strong>
                  <span>{{ npc.internalName || '--' }}</span>
                  <span>ID {{ npc.npcId != null ? npc.npcId : '--' }}</span>
                </div>
              </article>
            </div>
          </section>

          <section v-if="detailRow.sourceItemsJson || detailRow.immuneNpcSampleJson" class="projectile-detail__section">
            <div class="projectile-detail__section-head">
              <h4>参考源数据 JSON</h4>
              <span>JSON</span>
            </div>
            <div class="projectile-detail__note-grid">
              <article v-if="detailRow.sourceItemsJson" class="preview-json">
                <div class="preview-json__head">
                  <strong>Source Items JSON</strong>
                  <span>{{ detailSourceItems.length }} items</span>
                </div>
                <pre>{{ formatPrettyJson(detailRow.sourceItemsJson) }}</pre>
              </article>
              <article v-if="detailRow.immuneNpcSampleJson" class="preview-json">
                <div class="preview-json__head">
                  <strong>Immune NPC Sample JSON</strong>
                  <span>{{ detailImmuneNpcSamples.length }} items</span>
                </div>
                <pre>{{ formatPrettyJson(detailRow.immuneNpcSampleJson) }}</pre>
              </article>
            </div>
          </section>
        </div>
      </AppModal>

      <AppModal v-model="lightboxVisible" :title="lightboxTitle || '图片预览'" width="min(960px, calc(100vw - 32px))" body-padding="0">
        <div class="armor-lightbox">
          <img v-if="lightboxImage" :src="lightboxImage" class="armor-lightbox__image" alt="" @error="handleImageError" />
        </div>
      </AppModal>
    </template>
  </div>
</template>
<script setup lang="ts">
import { Search } from 'lucide-vue-next'

import { get, post, put, del } from '~/composables/useApi'
import { showToast } from '~/composables/useToast'
import { useCategoriesStore } from '~/stores/categories'

definePageMeta({
  headerVariant: 'compact',
})

type FieldType = 'text' | 'number' | 'textarea' | 'boolean'
interface FieldConfig {
  key: string
  label: string
  type: FieldType
  required?: boolean
  helper?: string
  placeholder?: string
  rows?: number
  span?: 'half' | 'full'
  format?: 'json'
}
interface EntityConfig {
  badge: string
  title: string
  shortLabel: string
  subtitle: string
  searchPlaceholder: string
  fallback: string
  endpoint: string
  primaryColumn: string
  secondaryColumn?: string
  displayTitleKeys: string[]
  displaySubtitleKeys?: string[]
  referenceFields?: Array<{ key: string; label: string }>
  atomicFields?: Array<{ key: string; label: string }>
  columns: Array<{ key: string; label: string }>
  fields: FieldConfig[]
}

const route = useRoute()
const router = useRouter()
const entityType = computed(() => String(route.params.type || ''))
const categoriesStore = useCategoriesStore()
const selectedNpcCategoryId = ref<number | null>(null)
const selectedBuffType = ref<'all' | 'buff' | 'debuff'>('all')
const selectedBossType = ref<'all' | 'PRE_HARDMODE' | 'HARDMODE' | 'EVENT' | 'SPECIAL_SEED'>('all')
const npcCategoryTree = computed(() => {
  const root = categoriesStore.findCategoryNodeByCode('CATEGORY_NPC')
  return root ? [root] : []
})
const buffTypeOptions = [
  { value: 'all', label: '全部', description: '显示全部 Buff 与 Debuff' },
  { value: 'buff', label: 'Buff', description: '仅显示正面增益效果' },
  { value: 'debuff', label: 'Debuff', description: '仅显示负面减益效果' },
] as const
const bossTypeOptions = [
  { value: 'all', label: '全部 Boss', eyebrow: 'ALL', description: '查看完整 Boss 档案，不区分进度阶段。' },
  { value: 'PRE_HARDMODE', label: '困难前', eyebrow: 'PRE', description: '进入困难模式前的关键 Boss。' },
  { value: 'HARDMODE', label: '困难模式', eyebrow: 'HARD', description: '困难模式主线推进 Boss。' },
  { value: 'EVENT', label: '事件 Boss', eyebrow: 'EVENT', description: '事件波次中的首领与核心目标。' },
  { value: 'SPECIAL_SEED', label: '特殊种子', eyebrow: 'SEED', description: '特殊世界种子专属 Boss。' },
] as const

const configs: Record<string, EntityConfig> = {
  buffs: {
    badge: 'BUFF SYSTEM', title: 'Buff 管理', shortLabel: 'Buff', fallback: 'BF', endpoint: '/admin/buffs', primaryColumn: 'nameZh', secondaryColumn: 'englishName',
    subtitle: '中文优先展示 Buff 名称和提示文本，同时保留英文原始字段与内部标识。',
    searchPlaceholder: '搜索 Buff 中文名、英文名或内部标识',
    displayTitleKeys: ['nameZh', 'englishName', 'internalName'],
    displaySubtitleKeys: ['englishName', 'internalName'],
    referenceFields: [
      { key: 'englishName', label: '英文名' },
      { key: 'tooltipEn', label: '英文提示' },
    ],
    atomicFields: [
      { key: 'internalName', label: 'internalName' },
      { key: 'sourceId', label: 'sourceId' },
    ],
    columns: [
      { key: '__imageUrl', label: '预览' }, { key: 'id', label: 'ID' }, { key: 'sourceId', label: '源 ID' }, { key: 'nameZh', label: '展示名称' },
      { key: 'buffType', label: '类型' }, { key: 'sourceItemCount', label: '来源物品数' }, { key: 'updatedAt', label: '更新时间' },
    ],
    fields: [
      { key: 'sourceId', label: 'Source ID', type: 'number', required: true },
      { key: 'internalName', label: 'Internal Name', type: 'text', required: true },
      { key: 'englishName', label: 'English Name', type: 'text' },
      { key: 'nameZh', label: 'Chinese Name', type: 'text' },
      { key: 'buffType', label: 'Buff Type', type: 'text', placeholder: 'buff / debuff' },
      { key: 'status', label: 'Status', type: 'number', helper: '1 = enabled, 0 = disabled.' },
      { key: 'image', label: 'Image URL', type: 'text', span: 'full', helper: '仅填写 MinIO 或可直接访问的图片地址。' },
      { key: 'sourceItemCount', label: 'Source Item Count', type: 'number' },
      { key: 'immuneNpcCount', label: 'Immune NPC Count', type: 'number' },
      { key: 'tooltipEn', label: 'Tooltip (EN)', type: 'textarea', rows: 4 },
      { key: 'tooltipZh', label: 'Tooltip (ZH)', type: 'textarea', rows: 4 },
      { key: 'linkedSourceItems', label: '关联物品（数据库写回）', type: 'textarea', span: 'full', rows: 8, format: 'json', helper: '主编辑字段。优先写回 buff_source_items，可传 sourceItemId / itemId / internalName / buffTime / sortOrder。' },
      { key: 'sourceItemsJson', label: 'Source Items JSON', type: 'textarea', span: 'full', rows: 7, format: 'json', helper: '参考字段。未提供 linkedSourceItems 时才作为回退输入。' },
      { key: 'immuneNpcSampleJson', label: 'Immune NPC Sample JSON', type: 'textarea', span: 'full', rows: 6, format: 'json', helper: 'QA-friendly structured sample.' },
    ],
  },
  biomes: {
    badge: 'BIOME ATLAS', title: '群系管理', shortLabel: '群系', fallback: 'BM', endpoint: '/admin/biomes', primaryColumn: 'nameZh', secondaryColumn: 'nameEn',
    subtitle: '中文优先展示群系名称，编辑时保留 code、来源页面和来源提供方等原子信息。',
    searchPlaceholder: '搜索群系 code、中文名或英文名',
    displayTitleKeys: ['nameZh', 'nameEn', 'code'],
    displaySubtitleKeys: ['nameEn', 'code'],
    referenceFields: [
      { key: 'nameEn', label: '英文名' },
      { key: 'sourcePage', label: '来源页面' },
      { key: 'sourceProvider', label: '来源提供方' },
    ],
    atomicFields: [
      { key: 'code', label: 'code' },
    ],
    columns: [
      { key: '__imageUrl', label: '预览' }, { key: 'id', label: 'ID' }, { key: 'code', label: 'Code' }, { key: 'nameZh', label: '展示名称' },
      { key: 'biomeType', label: '群系类型' }, { key: 'layerType', label: '层级类型' }, { key: 'updatedAt', label: '更新时间' },
    ],
    fields: [
      { key: 'code', label: 'Code', type: 'text', required: true },
      { key: 'nameZh', label: 'Chinese Name', type: 'text' },
      { key: 'nameEn', label: 'English Name', type: 'text' },
      { key: 'aliasZh', label: 'Chinese Alias', type: 'text' },
      { key: 'aliasEn', label: 'English Alias', type: 'text' },
      { key: 'biomeType', label: 'Biome Type', type: 'text' },
      { key: 'layerType', label: 'Layer Type', type: 'text' },
      { key: 'status', label: 'Status', type: 'number', helper: '1 = enabled, 0 = disabled.' },
      { key: 'iconUrl', label: 'Icon URL', type: 'text', span: 'full', helper: 'Supports direct image preview.' },
      { key: 'sourceProvider', label: 'Source Provider', type: 'text' },
      { key: 'sourcePage', label: 'Source Page', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea', span: 'full', rows: 6 },
      { key: 'relations', label: 'Relations JSON', type: 'textarea', span: 'full', rows: 8, format: 'json', helper: '群系关系数组，至少填写 relatedBiomeId 和 relationType。' },
      { key: 'resources', label: 'Resources JSON', type: 'textarea', span: 'full', rows: 10, format: 'json', helper: '群系资源数组，支持 itemId 或 resourceNameRaw。' },
    ],
  },
  npcs: {
    badge: 'NPC DIRECTORY', title: 'NPC 管理', shortLabel: 'NPC', fallback: 'NP', endpoint: '/admin/npcs', primaryColumn: 'nameZh', secondaryColumn: 'internalName',
    subtitle: '中文名优先展示，编辑时保留英文别名与内部字段以支持映射校对。',
    searchPlaceholder: '按中文/英文名、游戏 ID 或内部标识搜索 NPC',
    displayTitleKeys: ['nameZh', 'name', 'nameEn', 'internalName'],
    displaySubtitleKeys: ['subNameZh', 'subName', 'subNameEn', 'internalName'],
    referenceFields: [
      { key: 'nameEn', label: '英文名' },
      { key: 'subNameEn', label: '英文别名' },
    ],
    atomicFields: [
      { key: 'internalName', label: 'internalName' },
      { key: 'gameId', label: 'Game ID' },
    ],
    columns: [
      { key: '__imageUrl', label: '预览' },
      { key: 'id', label: 'ID' },
      { key: 'gameId', label: 'Game ID' },
      { key: 'internalName', label: 'internalName' },
      { key: 'nameZh', label: '中文名' },
      { key: 'subNameZh', label: '中文别名' },
      { key: 'categoryName', label: '分类' },
      { key: 'bossGroupName', label: 'Boss 组' },
      { key: 'nameEn', label: '英文名' },
      { key: 'damage', label: '伤害' },
      { key: 'lifeMax', label: '生命上限' },
      { key: 'updatedAt', label: '更新时间' },
    ],
    fields: [
      { key: 'sourceId', label: 'Game ID / Source ID', type: 'number', required: true, helper: '填写 Terraria NPC 的唯一 gameId（API 中的 sourceId）。' },
      { key: 'internalName', label: 'Internal Name', type: 'text', required: true },
      { key: 'nameZh', label: '中文名', type: 'text', placeholder: '如：黄蜂' },
      { key: 'subNameZh', label: '中文别名/子名', type: 'text', placeholder: '如：大毒刺黄蜂' },
      { key: 'categoryId', label: 'Category ID', type: 'number', helper: '对应 NPC 分类节点。' },
      { key: 'gamePeriodId', label: 'Game Period ID', type: 'number' },
      { key: 'gameModelId', label: 'Game Model ID', type: 'number' },
      { key: 'isBoss', label: 'Is Boss', type: 'boolean' },
      { key: 'bossGroupId', label: 'Boss Group ID', type: 'number' },
      { key: 'bossRole', label: 'Boss Role', type: 'text', placeholder: 'primary / phase / part / clone' },
      { key: 'isFriendly', label: 'Is Friendly', type: 'boolean' },
      { key: 'isTownNpc', label: 'Is Town NPC', type: 'boolean' },
      { key: 'behaviorNotes', label: 'Behavior Notes', type: 'textarea', span: 'full', rows: 4, helper: '补充 AI、阶段、召唤、部件等行为说明。' },
      { key: 'status', label: 'Status', type: 'number', helper: '1=启用, 0=禁用' },
      { key: 'bannerSourceItemId', label: 'Banner Source Item ID', type: 'number' },
      { key: 'bannerItemId', label: 'Banner Item DB ID', type: 'number' },
      { key: 'catchSourceItemId', label: 'Catch Source Item ID', type: 'number' },
      { key: 'catchItemId', label: 'Catch Item DB ID', type: 'number' },
      { key: 'lootEntries', label: 'Loot Entries JSON', type: 'textarea', span: 'full', rows: 8, format: 'json', helper: '结构化掉落数据。支持 itemId/sourceItemId、数量、概率、条件等。' },
      { key: 'buffRelations', label: 'Buff Relations JSON', type: 'textarea', span: 'full', rows: 8, format: 'json', helper: 'NPC 附加或关联 Buff 的结构化关系。' },
      { key: 'shopEntries', label: 'Shop Entries JSON', type: 'textarea', span: 'full', rows: 8, format: 'json', helper: 'NPC 售卖骨架，条件数组支持 BIOME / WORLD_CONTEXT。' },
      { key: 'rawJson', label: 'Raw JSON Payload', type: 'textarea', span: 'full', rows: 10, format: 'json', helper: '标准化补充数据预览字段，通常由同步脚本生成；手工编辑不会直接写回数据库结构化列。' },
    ],
  },
  bosses: {
    badge: 'BOSS ARCHIVE', title: 'Boss 管理', shortLabel: 'Boss', fallback: 'BS', endpoint: '/admin/bosses', primaryColumn: 'name', secondaryColumn: 'code',
    subtitle: '按 Boss 档案聚合成员 NPC，并维护阶段、部件、分身等归组关系。',
    searchPlaceholder: '搜索 Boss 中文名、英文名或 code',
    displayTitleKeys: ['nameZh', 'nameEn', 'name', 'code'],
    displaySubtitleKeys: ['code', 'notes'],
    referenceFields: [
      { key: 'nameEn', label: '英文名' },
      { key: 'code', label: 'Code' },
    ],
    atomicFields: [
      { key: 'progressionOrder', label: 'progressionOrder' },
    ],
    columns: [
      { key: '__imageUrl', label: '预览' },
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Boss 档案' },
      { key: 'code', label: 'Code' },
      { key: 'bossType', label: '类型' },
      { key: 'memberCount', label: '成员 NPC' },
      { key: 'progressionOrder', label: '进度序' },
      { key: 'updatedAt', label: '更新时间' },
    ],
    fields: [
      { key: 'code', label: 'Code', type: 'text', required: true },
      { key: 'nameZh', label: '中文名', type: 'text' },
      { key: 'nameEn', label: '英文名', type: 'text', required: true },
      { key: 'bossType', label: 'Boss Type', type: 'text', placeholder: 'PRE_HARDMODE / HARDMODE / EVENT / SPECIAL_SEED' },
      { key: 'imageUrl', label: 'Image URL', type: 'text', span: 'full' },
      { key: 'progressionOrder', label: 'Progression Order', type: 'number' },
      { key: 'status', label: 'Status', type: 'number' },
      { key: 'notes', label: 'Notes', type: 'textarea', span: 'full', rows: 4 },
      { key: 'sourcePage', label: 'Source Page', type: 'text', span: 'full' },
      { key: 'sourceRevisionTimestamp', label: 'Source Revision Timestamp', type: 'text', span: 'full' },
      { key: 'memberNpcIds', label: 'Member NPC IDs JSON', type: 'textarea', span: 'full', rows: 6, format: 'json', helper: '填写 NPC 数据库 ID 数组，用于归组 Boss 成员。' },
    ],
  },
  projectiles: {
    badge: 'PROJECTILE LAB', title: '射弹 / Projectile 管理', shortLabel: '射弹', fallback: 'PJ', endpoint: '/admin/projectiles', primaryColumn: 'name', secondaryColumn: 'internalName',
    subtitle: '列表按中文名、英文名、内部名三层展示，便于快速校对射弹词条与行为数据。',
    searchPlaceholder: '搜索中文名、English name 或 internalName',
    displayTitleKeys: ['nameZh', 'name', 'nameEn', 'internalName'],
    displaySubtitleKeys: ['nameEn', 'internalName'],
    referenceFields: [
      { key: 'nameEn', label: '英文名' },
    ],
    atomicFields: [
      { key: 'internalName', label: 'internalName' },
      { key: 'sourceId', label: 'sourceId' },
    ],
    columns: [
      { key: '__imageUrl', label: '预览' }, { key: 'id', label: 'ID' }, { key: 'sourceId', label: '源 ID' }, { key: 'name', label: '中英名称' },
      { key: 'aiStyle', label: 'AI Style' }, { key: 'damage', label: '伤害' }, { key: 'timeLeft', label: '持续时间' }, { key: 'updatedAt', label: '更新时间' },
    ],
    fields: [
      { key: 'sourceId', label: 'Source ID', type: 'number', required: true }, { key: 'internalName', label: 'Internal Name', type: 'text', required: true },
      { key: 'nameZh', label: 'Chinese Name / 中文名', type: 'text' }, { key: 'name', label: 'English Name / 展示名', type: 'text', helper: '当前后端结构仍以英文名字段落库，中文名在页面侧优先展示。' }, { key: 'aiStyle', label: 'AI Style', type: 'number' }, { key: 'damage', label: 'Damage', type: 'number' },
      { key: 'knockBack', label: 'Knockback', type: 'number' }, { key: 'penetrate', label: 'Penetrate', type: 'number' }, { key: 'timeLeft', label: 'Time Left', type: 'number' },
      { key: 'width', label: 'Width', type: 'number' }, { key: 'height', label: 'Height', type: 'number' }, { key: 'scale', label: 'Scale', type: 'number' },
      { key: 'friendly', label: 'Friendly', type: 'boolean' }, { key: 'hostile', label: 'Hostile', type: 'boolean' }, { key: 'tileCollide', label: 'Tile Collide', type: 'boolean' },
      { key: 'status', label: 'Status', type: 'number' },
      { key: 'rawJson', label: 'Raw JSON Payload', type: 'textarea', span: 'full', rows: 10, format: 'json', helper: '仅保留可直接访问的 imageUrl，避免使用 wiki 文件名回退。' },
    ],
  },
  'armor-sets': {
    badge: 'SET COMPOSER', title: 'Armor Set 管理', shortLabel: 'Armor Set', fallback: 'AS', endpoint: '/admin/armor-sets', primaryColumn: 'name', secondaryColumn: 'sourceKey',
    subtitle: '同一条记录同时维护穿戴套装图片与套装加成定义，并展示对应物品图片。',
    searchPlaceholder: '搜索套装名、sourceKey、textKey 或效果描述',
    displayTitleKeys: ['nameZh', 'name', 'textZh', 'textKey', 'sourceKey'],
    displaySubtitleKeys: ['benefitZh', 'benefitExpression', 'textKey', 'sourceKey'],
    referenceFields: [
      { key: 'nameEn', label: '英文穿戴名' },
      { key: 'textEn', label: '英文定义键' },
      { key: 'benefitEn', label: '英文效果定义' },
    ],
    atomicFields: [
      { key: 'sourceKey', label: 'sourceKey' },
      { key: 'primaryPart', label: 'primaryPart' },
    ],
    columns: [
      { key: '__imageUrl', label: '预览' }, { key: 'id', label: 'ID' }, { key: 'nameZh', label: '穿戴套装' }, { key: 'textZh', label: '加成定义' }, { key: 'sourceKey', label: 'Source Key' }, { key: 'benefitZh', label: '效果描述' },
      { key: 'setCount', label: '套装数' }, { key: 'uniqueItemCount', label: '唯一物品数' }, { key: 'updatedAt', label: '更新时间' },
    ],
    fields: [
      { key: 'name', label: 'Wear Set Name', type: 'text' },
      { key: 'sourceKey', label: 'Source Key', type: 'text', required: true }, { key: 'textKey', label: 'Text Key', type: 'text' },
      { key: 'benefitExpression', label: 'Benefit Expression', type: 'text', span: 'full' }, { key: 'primaryPart', label: 'Primary Part', type: 'text' },
      { key: 'setCount', label: 'Set Count', type: 'number' }, { key: 'uniqueItemCount', label: 'Unique Item Count', type: 'number' }, { key: 'status', label: 'Status', type: 'number' },
      { key: 'maleImages', label: 'Male Wear Images', type: 'textarea', span: 'full', rows: 4, helper: 'CSV，多张穿戴图。' },
      { key: 'femaleImages', label: 'Female Wear Images', type: 'textarea', span: 'full', rows: 4, helper: 'CSV，多张穿戴图。' },
      { key: 'specialImages', label: 'Special Wear Images', type: 'textarea', span: 'full', rows: 4, helper: 'CSV，多张特殊图。' },
      { key: 'currentItemIdsJson', label: 'Current Item IDs JSON', type: 'textarea', span: 'full', rows: 6, format: 'json', helper: '套装部件的数据库 ID 列表，会同步写入 armor_set_items。' },
      { key: 'setsJson', label: 'Sets JSON', type: 'textarea', span: 'full', rows: 8, format: 'json', helper: 'Nested set combinations grouped by variant.' },
      { key: 'uniqueItemIdsJson', label: 'Unique Item IDs JSON', type: 'textarea', span: 'full', rows: 6, format: 'json', helper: 'Canonical item list used to build the set.' },
    ],
  },
  'world-contexts': {
    badge: 'WORLD CONTEXT', title: '世界条件管理', shortLabel: 'Context', fallback: 'WC', endpoint: '/admin/world-contexts', primaryColumn: 'nameZh', secondaryColumn: 'code',
    subtitle: '统一维护环境、月相等制作或售卖条件，供配方和 NPC 售卖复用。',
    searchPlaceholder: '搜索 code、中文名、英文名或说明',
    displayTitleKeys: ['nameZh', 'nameEn', 'code'],
    displaySubtitleKeys: ['contextType', 'code'],
    referenceFields: [
      { key: 'nameEn', label: '英文名' },
      { key: 'code', label: 'Code' },
    ],
    atomicFields: [
      { key: 'contextType', label: 'contextType' },
    ],
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'code', label: 'Code' },
      { key: 'nameZh', label: '显示名称' },
      { key: 'contextType', label: '类型' },
      { key: 'sortOrder', label: '排序' },
      { key: 'updatedAt', label: '更新时间' },
    ],
    fields: [
      { key: 'code', label: 'Code', type: 'text', required: true },
      { key: 'nameZh', label: '中文名', type: 'text' },
      { key: 'nameEn', label: '英文名', type: 'text', required: true },
      { key: 'contextType', label: 'Context Type', type: 'text', required: true, placeholder: 'ENVIRONMENT / MOON_PHASE' },
      { key: 'sortOrder', label: 'Sort Order', type: 'number' },
      { key: 'status', label: 'Status', type: 'number' },
      { key: 'iconUrl', label: 'Icon URL', type: 'text', span: 'full' },
      { key: 'description', label: 'Description', type: 'textarea', span: 'full', rows: 6 },
    ],
  },
}

const currentConfig = computed(() => configs[entityType.value] ?? null)
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const detailVisible = ref(false)
const lightboxVisible = ref(false)
const isEdit = ref(false)
const editingId = ref<number | null>(null)
const rows = ref<Array<Record<string, any>>>([])
const bossSourceRows = ref<Array<Record<string, any>>>([])
const previewExtras = ref<Record<string, any>>({})
const detailRow = ref<Record<string, any> | null>(null)
const lightboxImage = ref('')
const lightboxTitle = ref('')
const search = ref('')
const pagination = reactive({ page: 1, size: 20, total: 0, totalPages: 0 })
const form = reactive<Record<string, any>>({})
const hasActiveFilters = computed(() => {
  if (search.value) return true
  if (entityType.value === 'npcs' && selectedNpcCategoryId.value != null) return true
  if (entityType.value === 'buffs' && selectedBuffType.value !== 'all') return true
  if (entityType.value === 'bosses' && selectedBossType.value !== 'all') return true
  return false
})

const coreFields = computed(() => (currentConfig.value?.fields ?? []).filter(field => field.format !== 'json' && field.key !== 'rawJson' && field.key !== 'linkedSourceItems' && field.key !== 'sourceItemsJson' && field.key !== 'immuneNpcSampleJson' && field.key !== 'setsJson' && field.key !== 'uniqueItemIdsJson'))
const advancedFields = computed(() => (currentConfig.value?.fields ?? []).filter(field => !coreFields.value.includes(field)))
function isHttpUrl(value: unknown) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim())
}

function normalizeImageUrl(value: unknown) {
  if (typeof value !== 'string') return ''
  const normalized = value.trim()
  if (!normalized) return ''
  if (isHttpUrl(normalized)) return normalized
  if (normalized.startsWith('localhost:') || normalized.startsWith('127.0.0.1:')) return `http://${normalized}`
  if (normalized.startsWith('/')) return normalized
  return ''
}

function splitImageCsv(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return []
  return value.split(',').map(entry => normalizeImageUrl(entry)).filter(Boolean)
}

function tryParseJson(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  try { return JSON.parse(value) } catch { return null }
}

function extractRawJsonObject(value: unknown) {
  const payload = tryParseJson(value)
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, any> : null
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function resolveImageFromRawJson(rawJson: unknown) {
  const payload = extractRawJsonObject(rawJson)
  if (!payload) return ''
  const directUrl = typeof payload.imageUrl === 'string' ? payload.imageUrl : typeof payload.image_url === 'string' ? payload.image_url : ''
  return normalizeImageUrl(directUrl)
}

function resolveRowImageUrl(row: Record<string, any>) {
  const wearImages = [...splitImageCsv(row.maleImages), ...splitImageCsv(row.femaleImages), ...splitImageCsv(row.specialImages)]
  if (wearImages.length > 0) return wearImages[0]
  if (entityType.value === 'armor-sets' && Array.isArray(row.relatedItems)) {
    const relatedImage = row.relatedItems
      .map((item: Record<string, any>) => normalizeImageUrl(item?.image ?? item?.imageUrl))
      .find((value: string) => Boolean(value))
    if (relatedImage) return relatedImage
  }
  const iconUrl = normalizeImageUrl(row.iconUrl)
  if (iconUrl) return iconUrl
  const imageUrl = normalizeImageUrl(row.imageUrl)
  if (imageUrl) return imageUrl
  const image = normalizeImageUrl(row.image)
  if (image) return image
  if (entityType.value === 'armor-sets') return ''
  return resolveImageFromRawJson(row.rawJson)
}

function normalizeRow(row: Record<string, any>) {
  return { ...row, __imageUrl: resolveRowImageUrl(row) }
}

function normalizeBossType(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (normalized === 'PRE_HARDMODE' || normalized === 'HARDMODE' || normalized === 'EVENT' || normalized === 'SPECIAL_SEED') {
    return normalized
  }
  return ''
}

function getBossTypeMeta(value: unknown) {
  const normalized = normalizeBossType(value)
  return bossTypeOptions.find(option => option.value === normalized) ?? null
}

function getBossTypeLabel(value: unknown) {
  return getBossTypeMeta(value)?.label ?? '--'
}

function matchesBossSearch(row: Record<string, any>) {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return true
  return [
    row.nameZh,
    row.nameEn,
    row.name,
    row.code,
    row.notes,
    Array.isArray(row.memberNames) ? row.memberNames.join(' ') : '',
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .some(value => value.toLowerCase().includes(keyword))
}

const bossSearchedRows = computed(() => {
  if (entityType.value !== 'bosses') return []
  return bossSourceRows.value.filter(matchesBossSearch)
})

const filteredBossRows = computed(() => {
  if (entityType.value !== 'bosses') return []
  if (selectedBossType.value === 'all') return bossSearchedRows.value
  return bossSearchedRows.value.filter(row => normalizeBossType(row.bossType) === selectedBossType.value)
})

const displayRows = computed(() => entityType.value === 'bosses' ? filteredBossRows.value : rows.value)

const bossTypeCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {}
  for (const row of bossSearchedRows.value) {
    const key = normalizeBossType(row.bossType)
    if (!key) continue
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
})

const bossTypeCards = computed(() => bossTypeOptions.map(option => ({
  ...option,
  count: option.value === 'all'
    ? bossSearchedRows.value.length
    : (bossTypeCounts.value[option.value] ?? 0),
})))

const entityTotalCount = computed(() => entityType.value === 'bosses'
  ? bossSourceRows.value.length
  : (pagination.total || rows.value.length))

const tableCardSubtitle = computed(() => {
  if (entityType.value === 'projectiles') {
    return '射弹页面已切换为中英双语浏览，补充内部标识、行为标签和碰撞信息。'
  }
  if (entityType.value === 'bosses') {
    return 'Boss 表格保持编辑能力，同时配合上方图谱区完成基础分类浏览和真图核对。'
  }
  return '中文优先展示，同时保留英文参考字段与原子字段。'
})

function getBossCardSubtitle(row: Record<string, any>) {
  const en = row.nameEn && row.nameEn !== row.nameZh ? row.nameEn : ''
  const pieces = [en, row.code].filter(Boolean)
  return pieces.join(' · ') || getBossTypeLabel(row.bossType)
}

function getBossCardNote(row: Record<string, any>) {
  const text = typeof row.notes === 'string' ? row.notes.trim() : ''
  if (!text) {
    return row.memberSourceMode === 'reference'
      ? '该档案通过组合 Boss 引用成员展示，不直接写入 NPC 归组。'
      : '点开详情查看成员 NPC、部件结构和来源信息。'
  }
  return text.length > 160 ? `${text.slice(0, 160)}...` : text
}

function resetForm() {
  Object.keys(form).forEach(key => delete form[key])
  previewExtras.value = {}
  for (const field of currentConfig.value?.fields ?? []) {
    form[field.key] = field.type === 'boolean' ? false : ''
  }
}

function parseValue(field: FieldConfig, value: any) {
  if (value === '' || value == null) return null
  if (field.format === 'json') {
    if (typeof value !== 'string') return value
    return JSON.parse(value)
  }
  if (field.type === 'number') {
    const num = Number(value)
    return Number.isFinite(num) ? num : null
  }
  if (field.type === 'boolean') return Boolean(value)
  return value
}

function buildPayload() {
  const payload: Record<string, any> = {}
  for (const field of currentConfig.value?.fields ?? []) {
    payload[field.key] = parseValue(field, form[field.key])
  }
  return payload
}

async function fetchRows(page = pagination.page) {
  if (!currentConfig.value) return
  loading.value = true
  try {
    const params: Record<string, any> = entityType.value === 'bosses'
      ? { page: 1, limit: 100 }
      : { page, limit: pagination.size, search: search.value || undefined }
    if (entityType.value === 'npcs' && selectedNpcCategoryId.value != null) {
      params.categoryId = selectedNpcCategoryId.value
    }
    if (entityType.value === 'buffs' && selectedBuffType.value !== 'all') {
      params.buffType = selectedBuffType.value
    }
    const response: any = await get(currentConfig.value.endpoint, params)
    const normalizedRows = Array.isArray(response?.data) ? response.data.map(normalizeRow) : []
    if (entityType.value === 'bosses') {
      bossSourceRows.value = normalizedRows
      rows.value = normalizedRows
      pagination.page = 1
      pagination.size = Math.max(normalizedRows.length, 1)
      pagination.total = Number(response?.pagination?.total ?? normalizedRows.length)
      pagination.totalPages = 1
      return
    }
    bossSourceRows.value = []
    rows.value = normalizedRows
    pagination.page = Number(response?.pagination?.page ?? page)
    pagination.size = Number(response?.pagination?.limit ?? pagination.size)
    pagination.total = Number(response?.pagination?.total ?? rows.value.length)
    pagination.totalPages = Number(response?.pagination?.totalPages ?? Math.ceil(pagination.total / Math.max(pagination.size, 1)))
  } catch (error: any) {
    rows.value = []
    bossSourceRows.value = []
    pagination.total = 0
    pagination.totalPages = 0
    showToast(error?.data?.message || error?.message || 'Failed to load data', 'error')
  } finally {
    loading.value = false
  }
}

function openCreateDialog() {
  isEdit.value = false
  editingId.value = null
  resetForm()
  dialogVisible.value = true
}

async function openDetailDialog(row: Record<string, any>) {
  let detail: Record<string, any> = row
  if (currentConfig.value) {
    try {
      const response: any = await get(`${currentConfig.value.endpoint}/${row.id}`)
      detail = response?.data ?? response ?? row
    } catch (error) {
      console.error('Failed to load entity detail:', error)
    }
  }
  detailRow.value = normalizeRow(detail)
  detailVisible.value = true
}

async function openEditDialog(row: Record<string, any>) {
  isEdit.value = true
  editingId.value = Number(row.id)
  resetForm()
  let detail: Record<string, any> = row
  if (currentConfig.value) {
    try {
      const response: any = await get(`${currentConfig.value.endpoint}/${row.id}`)
      detail = response?.data ?? response ?? row
    } catch (error) {
      console.error('Failed to load entity detail:', error)
    }
  }
  previewExtras.value = normalizeRow(detail)
  for (const field of currentConfig.value?.fields ?? []) {
    const rawValue = field.key === 'linkedSourceItems'
      ? (detail.linkedSourceItems ?? [])
      : field.key === 'image' && detail.__imageUrl
        ? detail.__imageUrl
        : (detail[field.key] ?? form[field.key])
    form[field.key] = field.format === 'json'
      ? (rawValue == null || rawValue === '' ? '' : JSON.stringify(rawValue, null, 2))
      : rawValue
  }
  dialogVisible.value = true
}

async function handleSubmit() {
  if (!currentConfig.value) return
  const requiredField = currentConfig.value.fields.find(field => field.required)
  if (requiredField && (form[requiredField.key] == null || String(form[requiredField.key]).trim() === '')) {
    showToast(`${requiredField.label} is required`, 'warning')
    return
  }
  submitting.value = true
  try {
    const payload = buildPayload()
    if (isEdit.value && editingId.value) {
      await put(`${currentConfig.value.endpoint}/${editingId.value}`, payload)
      showToast('Updated', 'success')
    } else {
      await post(currentConfig.value.endpoint, payload)
      showToast('Created', 'success')
    }
    dialogVisible.value = false
    await fetchRows(isEdit.value ? pagination.page : 1)
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || 'Submit failed', 'error')
  } finally {
    submitting.value = false
  }
}

async function handleDelete(row: Record<string, any>) {
  if (!currentConfig.value) return
  if (!window.confirm(`Confirm delete #${row.id}?`)) return
  try {
    await del(`${currentConfig.value.endpoint}/${row.id}`)
    showToast('Deleted', 'success')
    await fetchRows(pagination.page)
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || 'Delete failed', 'error')
  }
}

async function syncRouteQuery(page = 1) {
  if (import.meta.server) return
  const nextQuery: Record<string, string> = {}
  if (search.value) nextQuery.search = search.value
  if (entityType.value === 'npcs' && selectedNpcCategoryId.value != null) {
    nextQuery.categoryId = String(selectedNpcCategoryId.value)
  }
  if (entityType.value === 'buffs' && selectedBuffType.value !== 'all') {
    nextQuery.buffType = selectedBuffType.value
  }
  if (entityType.value === 'bosses' && selectedBossType.value !== 'all') {
    nextQuery.bossType = selectedBossType.value
  }
  if (entityType.value !== 'bosses' && page > 1) {
    nextQuery.page = String(page)
  }
  await router.replace({ query: nextQuery })
}

async function handleSearch() {
  await syncRouteQuery(1)
  if (entityType.value === 'bosses') return
  await fetchRows(1)
}

async function handleReset() {
  search.value = ''
  selectedNpcCategoryId.value = null
  selectedBuffType.value = 'all'
  selectedBossType.value = 'all'
  await syncRouteQuery(1)
  if (entityType.value === 'bosses') return
  await fetchRows(1)
}

async function handlePageChange(page: number) {
  await syncRouteQuery(page)
  await fetchRows(page)
}

async function handleBuffTypeChange(value: 'all' | 'buff' | 'debuff') {
  if (selectedBuffType.value === value) return
  selectedBuffType.value = value
  await syncRouteQuery(1)
  await fetchRows(1)
}

async function handleBossTypeChange(value: 'all' | 'PRE_HARDMODE' | 'HARDMODE' | 'EVENT' | 'SPECIAL_SEED') {
  if (selectedBossType.value === value) return
  selectedBossType.value = value
  await syncRouteQuery(1)
}

function openImageLightbox(image: string, title: string) {
  lightboxImage.value = image
  lightboxTitle.value = title
  lightboxVisible.value = true
}

function formatDateTime(value?: string) {
  if (!value) return '--'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN')
}

function formatBooleanLabel(value: unknown, trueLabel = '是', falseLabel = '否') {
  if (value === true) return trueLabel
  if (value === false) return falseLabel
  return '--'
}

function formatPrettyJson(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return '--'
  const parsed = tryParseJson(value)
  return parsed ? JSON.stringify(parsed, null, 2) : String(value)
}

function formatStatusLabel(statusValue: unknown) {
  const status = Number(statusValue ?? 1)
  return status === 1 ? '启用' : status === 0 ? '禁用' : `状态 ${status}`
}

function formatCell(row: Record<string, any>, key: string) {
  if (key === '__imageUrl') return row.__imageUrl ? 'Preview available' : '--'
  if (key === 'bossType') return getBossTypeLabel(row[key])
  if (key.toLowerCase().includes('at')) return formatDateTime(row[key])
  if (typeof row[key] === 'boolean') return row[key] ? 'true' : 'false'
  if (row[key] == null || row[key] === '') return '--'
  return typeof row[key] === 'object' ? JSON.stringify(row[key]) : String(row[key])
}

function handleImageError(event: Event) {
  const target = event.target as HTMLImageElement
  target.style.display = 'none'
}

function fieldClass(field: FieldConfig) { return field.span === 'full' ? 'field--full' : '' }
function isJsonField(field: FieldConfig) { return field.format === 'json' }
function formatJsonField(key: string) {
  const value = form[key]
  if (typeof value !== 'string' || !value.trim()) { showToast('No JSON content to format', 'warning'); return }
  try { form[key] = JSON.stringify(JSON.parse(value), null, 2); showToast('JSON formatted', 'success') } catch { showToast('Invalid JSON, unable to format', 'error') }
}

const previewRow = computed<Record<string, any>>(() => {
  const draft: Record<string, any> = { ...previewExtras.value }
  for (const field of currentConfig.value?.fields ?? []) draft[field.key] = form[field.key]
  return normalizeRow(draft)
})
const previewImageUrl = computed(() => previewRow.value.__imageUrl || '')
const armorSetPreviewImages = computed(() => {
  if (entityType.value !== 'armor-sets') return []
  return [...splitImageCsv(previewRow.value.maleImages), ...splitImageCsv(previewRow.value.femaleImages), ...splitImageCsv(previewRow.value.specialImages)]
})
const armorSetRelatedItems = computed(() => {
  if (entityType.value !== 'armor-sets') return []
  return Array.isArray(previewRow.value.relatedItems) ? previewRow.value.relatedItems : []
})
const armorSetDetailImageGroups = computed(() => {
  if (!detailRow.value || entityType.value !== 'armor-sets') return []
  const groups = [
    { label: '男套展示', description: '优先查看男性角色的完整穿戴效果。', images: splitImageCsv(detailRow.value.maleImages) },
    { label: '女套展示', description: '用于比对女性角色的套装穿戴差异。', images: splitImageCsv(detailRow.value.femaleImages) },
    { label: '特殊展示', description: '补充特殊姿态、额外变体或宣传用套装图。', images: splitImageCsv(detailRow.value.specialImages) },
  ]
  return groups.filter(group => group.images.length)
})
const detailRelatedItems = computed(() => {
  if (!detailRow.value || entityType.value !== 'armor-sets') return []
  return Array.isArray(detailRow.value.relatedItems) ? detailRow.value.relatedItems : []
})
const detailRelatedItemGroups = computed(() => {
  if (!detailRelatedItems.value.length) return []
  const groups = [
    { key: 'head', label: '头部部件', description: '头盔、面具、头饰等头部装备。', items: [] as Array<Record<string, any>> },
    { key: 'body', label: '身体部件', description: '胸甲、上衣、长袍等身体装备。', items: [] as Array<Record<string, any>> },
    { key: 'legs', label: '腿部部件', description: '护腿、裤装、靴类等腿部装备。', items: [] as Array<Record<string, any>> },
    { key: 'other', label: '其他部件', description: '不易自动判断部位的补充物品。', items: [] as Array<Record<string, any>> },
  ]
  for (const item of detailRelatedItems.value) {
    const groupKey = guessArmorItemGroup(item)
    const target = groups.find(group => group.key === groupKey) ?? groups[groups.length - 1]!
    target.items.push(item)
  }
  return groups.filter(group => group.items.length)
})
const detailHeroImage = computed(() => {
  if (!detailRow.value) return ''
  return resolveRowImageUrl(detailRow.value)
})
const detailTitle = computed(() => {
  if (!detailRow.value) return ''
  return getDisplayTitle(detailRow.value) || '套装详情'
})
const detailSubtitle = computed(() => {
  if (!detailRow.value) return ''
  if (entityType.value === 'projectiles') return projectileDetailSummary.value
  if (entityType.value === 'buffs') return '查看关联物品、免疫 NPC 样例和结构化 JSON。'
  if (entityType.value === 'bosses') return bossDetailSummary.value
  return getDisplayValue(detailRow.value, currentConfig.value?.displaySubtitleKeys) || '查看男女穿戴图与具体装配图片。'
})
const detailStats = computed(() => {
  if (!detailRow.value) return []
  if (entityType.value === 'projectiles') return [
    { label: '伤害 Damage', value: detailRow.value.damage != null ? String(detailRow.value.damage) : '--' },
    { label: '击退 Knockback', value: detailRow.value.knockBack != null ? String(detailRow.value.knockBack) : '--' },
    { label: '持续 Time Left', value: detailRow.value.timeLeft != null ? String(detailRow.value.timeLeft) : '--' },
    { label: '尺寸 Size', value: detailRow.value.width && detailRow.value.height ? `${detailRow.value.width} × ${detailRow.value.height}` : '--' },
    { label: '缩放 Scale', value: detailRow.value.scale != null ? String(detailRow.value.scale) : '--' },
    { label: '源 ID', value: detailRow.value.sourceId != null ? String(detailRow.value.sourceId) : '--' },
  ]
  if (entityType.value === 'buffs') return [
    { label: '源 ID', value: detailRow.value.sourceId != null ? String(detailRow.value.sourceId) : '--' },
    { label: '类型', value: detailRow.value.buffType || '--' },
    { label: '来源物品数', value: detailRow.value.sourceItemCount != null ? String(detailRow.value.sourceItemCount) : '--' },
    { label: '免疫 NPC 数', value: detailRow.value.immuneNpcCount != null ? String(detailRow.value.immuneNpcCount) : '--' },
    { label: '更新时间', value: formatDateTime(detailRow.value.updatedAt) },
  ]
  if (entityType.value === 'bosses') return [
    { label: 'Boss 类型', value: getBossTypeLabel(detailRow.value.bossType) },
    { label: '成员数', value: bossDetailMembers.value.length ? String(bossDetailMembers.value.length) : '--' },
    { label: '进度序', value: detailRow.value.progressionOrder != null ? String(detailRow.value.progressionOrder) : '--' },
    { label: '成员模式', value: bossMemberSourceLabel.value },
    { label: '状态', value: detailRow.value.status != null ? formatStatusLabel(detailRow.value.status) : '--' },
    { label: '更新时间', value: formatDateTime(detailRow.value.updatedAt) },
  ]
  if (entityType.value !== 'armor-sets') return []
  return [
    { label: '映射状态', value: detailRow.value.definitionMappingStatus || 'placeholder' },
    { label: '套装数', value: detailRow.value.setCount ? String(detailRow.value.setCount) : '--' },
    { label: '唯一物品', value: detailRow.value.uniqueItemCount ? String(detailRow.value.uniqueItemCount) : '--' },
    { label: '主部位', value: detailRow.value.primaryPart || '--' },
  ]
})
const detailModalTitle = computed(() => {
  if (entityType.value === 'projectiles') return '射弹详情 / Projectile Detail'
  if (entityType.value === 'buffs') return 'Buff 详情'
  if (entityType.value === 'bosses') return 'Boss 详情'
  return '套装详情'
})
const detailSourceItems = computed(() => {
  if (!detailRow.value || entityType.value !== 'buffs') return []
  if (Array.isArray(detailRow.value.linkedSourceItems)) {
    return detailRow.value.linkedSourceItems.filter(item => item && typeof item === 'object')
  }
  const parsed = typeof detailRow.value.sourceItemsJson === 'string'
    ? tryParseJson(detailRow.value.sourceItemsJson)
    : detailRow.value.sourceItemsJson
  return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object') : []
})
const detailImmuneNpcSamples = computed<Array<Record<string, any>>>(() => {
  if (!detailRow.value || entityType.value !== 'buffs') return []
  if (Array.isArray(detailRow.value.immuneNpcSamples)) {
    return detailRow.value.immuneNpcSamples
      .filter(item => item && typeof item === 'object')
      .map(item => normalizeRow(item as Record<string, any>))
  }
  const parsed = typeof detailRow.value.immuneNpcSampleJson === 'string'
    ? tryParseJson(detailRow.value.immuneNpcSampleJson)
    : detailRow.value.immuneNpcSampleJson
  return Array.isArray(parsed)
    ? parsed
        .filter(item => item && typeof item === 'object')
        .map(item => normalizeRow(item as Record<string, any>))
    : []
})
const detailBuffNotes = computed(() => {
  if (!detailRow.value || entityType.value !== 'buffs') return []
  return [
    { label: '中文提示', value: detailRow.value.tooltipZh },
    { label: '英文提示', value: detailRow.value.tooltipEn },
  ].filter(note => typeof note.value === 'string' && note.value.trim())
})
const bossDetailMembers = computed<Array<Record<string, any>>>(() => {
  if (!detailRow.value || entityType.value !== 'bosses') return []
  if (detailRow.value.memberSourceMode === 'reference' && Array.isArray(detailRow.value.referenceMembers)) {
    return detailRow.value.referenceMembers
      .filter(item => item && typeof item === 'object')
      .map(item => normalizeRow(item as Record<string, any>))
  }
  if (Array.isArray(detailRow.value.members)) {
    return detailRow.value.members
      .filter(item => item && typeof item === 'object')
      .map(item => normalizeRow(item as Record<string, any>))
  }
  return []
})
const bossMemberSourceLabel = computed(() => {
  if (!detailRow.value || entityType.value !== 'bosses') return '--'
  if (detailRow.value.memberSourceMode === 'reference') return '组合引用成员'
  if (detailRow.value.memberSourceMode === 'assigned') return '直接归组成员'
  return '暂无成员'
})
const bossDetailSummary = computed(() => {
  if (!detailRow.value || entityType.value !== 'bosses') return ''
  const count = bossDetailMembers.value.length
  const mode = bossMemberSourceLabel.value
  const snippet = typeof detailRow.value.notes === 'string' ? detailRow.value.notes.trim() : ''
  if (snippet) {
    const summary = snippet.length > 180 ? `${snippet.slice(0, 180)}...` : snippet
    return `${summary} 当前以 ${mode} 展示，共 ${count} 条。`
  }
  return `${getBossTypeLabel(detailRow.value.bossType)} Boss 档案，当前以 ${mode} 展示，共 ${count} 条成员记录。`
})
const bossMemberSectionTitle = computed(() => bossMemberSourceLabel.value === '组合引用成员' ? '组合成员引用' : 'Boss 成员')
const bossMemberSectionHelper = computed(() => {
  if (!detailRow.value || entityType.value !== 'bosses') return ''
  if (detailRow.value.memberSourceMode === 'reference') {
    return '该 Boss 不直接写回 NPC 归组，下面展示的是来自相关 Boss 档案的引用成员，用于浏览和图片核对。'
  }
  return '成员会按主目标、阶段/部件和其他角色分组，便于快速核对 Boss 结构。'
})
const bossDetailMemberGroups = computed(() => {
  if (!bossDetailMembers.value.length) return []
  const groups = [
    { key: 'primary', label: '主目标', short: 'PR', description: 'Boss 主体或主要目标。', members: [] as Array<Record<string, any>> },
    { key: 'phase', label: '阶段目标', short: 'PH', description: '阶段切换或独立阶段实体。', members: [] as Array<Record<string, any>> },
    { key: 'part', label: '部件', short: 'PT', description: '身体部件、附属武装或连带实体。', members: [] as Array<Record<string, any>> },
    { key: 'clone', label: '分身', short: 'CL', description: '分身、幻影或复制体。', members: [] as Array<Record<string, any>> },
    { key: 'other', label: '其他', short: 'OT', description: '无法明确归入以上分类的成员。', members: [] as Array<Record<string, any>> },
  ]
  for (const member of bossDetailMembers.value) {
    const role = typeof member.bossRole === 'string' ? member.bossRole.trim().toLowerCase() : ''
    const target = groups.find(group => group.key === role) ?? groups[groups.length - 1]!
    target.members.push(member)
  }
  return groups.filter(group => group.members.length)
})
const previewTitle = computed(() => getDisplayTitle(previewRow.value) || `未命名${currentConfig.value?.shortLabel || '实体'}`)
const previewSubtitle = computed(() => getDisplaySubtitle(previewRow.value) || '预览会随着编辑内容实时更新。')
const statusLabel = computed(() => formatStatusLabel(previewRow.value.status))
const previewReferenceFields = computed(() => (currentConfig.value?.referenceFields ?? [])
  .map(field => ({ label: field.label, value: getDisplayValue(previewRow.value, [field.key]) }))
  .filter(field => field.value))
const previewAtomicFields = computed(() => (currentConfig.value?.atomicFields ?? [])
  .map(field => ({ label: field.label, value: getDisplayValue(previewRow.value, [field.key]) }))
  .filter(field => field.value))
const previewStats = computed(() => {
  if (entityType.value === 'buffs') return [
    { label: '源 ID', value: previewRow.value.sourceId ? String(previewRow.value.sourceId) : '--' },
    { label: '来源物品', value: previewRow.value.sourceItemCount ? String(previewRow.value.sourceItemCount) : '--' },
    { label: '免疫 NPC', value: previewRow.value.immuneNpcCount ? String(previewRow.value.immuneNpcCount) : '--' },
    { label: '类型', value: previewRow.value.buffType || '--' },
  ]
  if (entityType.value === 'npcs') return [
    { label: '中文名', value: previewRow.value.nameZh || previewRow.value.name || '--' },
    { label: '英文名', value: previewRow.value.nameEn || '--' },
    { label: '伤害', value: previewRow.value.damage ? String(previewRow.value.damage) : '--' },
    { label: '防御', value: previewRow.value.defense ? String(previewRow.value.defense) : '--' },
    { label: '生命', value: previewRow.value.lifeMax ? String(previewRow.value.lifeMax) : '--' },
    { label: 'AI Style', value: previewRow.value.aiStyle ? String(previewRow.value.aiStyle) : '--' },
  ]
  if (entityType.value === 'projectiles') return [
    { label: '中文名', value: getProjectileNameZh(previewRow.value) || '--' },
    { label: '英文名', value: getProjectileNameEn(previewRow.value) },
    { label: '伤害', value: previewRow.value.damage != null ? String(previewRow.value.damage) : '--' },
    { label: '穿透', value: previewRow.value.penetrate != null ? String(previewRow.value.penetrate) : '--' },
    { label: '持续', value: previewRow.value.timeLeft != null ? String(previewRow.value.timeLeft) : '--' },
    { label: 'AI Style', value: previewRow.value.aiStyle != null ? String(previewRow.value.aiStyle) : '--' },
  ]
  if (entityType.value === 'biomes') return [
    { label: 'Code', value: previewRow.value.code || '--' },
    { label: '中文名', value: previewRow.value.nameZh || '--' },
    { label: '英文名', value: previewRow.value.nameEn || '--' },
    { label: '层级', value: previewRow.value.layerType || '--' },
  ]
  if (entityType.value === 'bosses') return [
    { label: 'Code', value: previewRow.value.code || '--' },
    { label: '中文名', value: previewRow.value.nameZh || previewRow.value.name || '--' },
    { label: '英文名', value: previewRow.value.nameEn || '--' },
    { label: '成员 NPC', value: previewRow.value.memberCount != null ? String(previewRow.value.memberCount) : '--' },
    { label: '进度序', value: previewRow.value.progressionOrder != null ? String(previewRow.value.progressionOrder) : '--' },
    { label: '状态', value: statusLabel.value },
  ]
  if (entityType.value === 'world-contexts') return [
    { label: 'Code', value: previewRow.value.code || '--' },
    { label: '中文名', value: previewRow.value.nameZh || '--' },
    { label: '英文名', value: previewRow.value.nameEn || '--' },
    { label: '类型', value: previewRow.value.contextType || '--' },
    { label: '排序', value: previewRow.value.sortOrder != null ? String(previewRow.value.sortOrder) : '--' },
    { label: '状态', value: statusLabel.value },
  ]
  return [
    { label: '映射状态', value: previewRow.value.definitionMappingStatus || 'placeholder' },
    { label: '套装数', value: previewRow.value.setCount ? String(previewRow.value.setCount) : '--' },
    { label: '唯一物品', value: previewRow.value.uniqueItemCount ? String(previewRow.value.uniqueItemCount) : '--' },
    { label: '主部位', value: previewRow.value.primaryPart || '--' },
    { label: '状态', value: statusLabel.value },
  ]
})
const previewNotes = computed(() => {
  const entries = [
    ['中文名', entityType.value === 'projectiles' ? getProjectileNameZh(previewRow.value) : ''],
    ['English Name', entityType.value === 'projectiles' ? getProjectileNameEn(previewRow.value) : ''],
    ['英文提示', previewRow.value.tooltipEn],
    ['中文提示', previewRow.value.tooltipZh],
    ['Buff Immune', previewRow.value.buffImmune],
    ['效果描述', previewRow.value.benefitExpression],
    ['英文效果定义', previewRow.value.benefitEn],
  ]
  return entries.filter(([, value]) => typeof value === 'string' && value.trim()).slice(0, 3).map(([label, value]) => ({ label, value: String(value).trim() }))
})
const jsonPreviewBlocks = computed(() => [...advancedFields.value, ...coreFields.value]
  .filter(field => field.format === 'json' && typeof form[field.key] === 'string' && String(form[field.key]).trim())
  .map(field => {
    const raw = String(form[field.key]).trim()
    const parsed = tryParseJson(raw)
    const summary = Array.isArray(parsed) ? `${parsed.length} items` : parsed && typeof parsed === 'object' ? `${Object.keys(parsed).length} keys` : 'Invalid JSON'
    return { label: field.label, summary, preview: raw.split('\n').slice(0, 8).join('\n') }
  }))
const projectileBehaviorNotes = computed(() => {
  if (!detailRow.value || entityType.value !== 'projectiles') return []
  return [
    { label: '友方判定', value: formatBooleanLabel(detailRow.value.friendly, '友方 / Friendly', '否') },
    { label: '敌对判定', value: formatBooleanLabel(detailRow.value.hostile, '敌对 / Hostile', '否') },
    { label: '地形碰撞', value: formatBooleanLabel(detailRow.value.tileCollide, '开启 / On', '关闭 / Off') },
    { label: '穿透', value: detailRow.value.penetrate != null ? String(detailRow.value.penetrate) : '--' },
    { label: 'AI Style', value: detailRow.value.aiStyle != null ? String(detailRow.value.aiStyle) : '--' },
    { label: '更新时间', value: formatDateTime(detailRow.value.updatedAt) },
  ]
})
const projectileRawJsonHighlights = computed(() => {
  if (!detailRow.value || entityType.value !== 'projectiles') return []
  const raw = extractRawJsonObject(detailRow.value.rawJson)
  if (!raw) return []
  return [
    ['imageUrl', raw.imageUrl],
    ['internalName', raw.internalName],
    ['type', raw.type],
    ['class', raw.className],
    ['notes', raw.notes],
  ]
    .filter(([, value]) => value != null && String(value).trim())
    .map(([label, value]) => ({ label: String(label), value: String(value).trim() }))
})
const projectileDetailSummary = computed(() => {
  if (!detailRow.value || entityType.value !== 'projectiles') return ''
  const zh = getProjectileNameZh(detailRow.value)
  const en = getProjectileNameEn(detailRow.value)
  const size = detailRow.value.width && detailRow.value.height ? `${detailRow.value.width} × ${detailRow.value.height}` : '--'
  return `${zh || '中文名待补充'} / ${en}，AI Style ${detailRow.value.aiStyle ?? '--'}，尺寸 ${size}，用于快速核对中英命名与行为参数。`
})

watch(() => entityType.value, async () => {
  search.value = typeof route.query.search === 'string' ? route.query.search.trim() : ''
  selectedNpcCategoryId.value = null
  selectedBuffType.value = 'all'
  selectedBossType.value = 'all'
  const pageFromQuery = Number(route.query.page)
  pagination.page = Number.isFinite(pageFromQuery) && pageFromQuery > 0 ? pageFromQuery : 1
  pagination.size = 20
  rows.value = []
  bossSourceRows.value = []
  resetForm()
  if (entityType.value === 'npcs') {
    const rawCategoryId = Number(route.query.categoryId)
    selectedNpcCategoryId.value = Number.isFinite(rawCategoryId) && rawCategoryId > 0 ? rawCategoryId : null
    await categoriesStore.fetchCategories()
  }
  if (entityType.value === 'buffs') {
    const rawBuffType = typeof route.query.buffType === 'string' ? route.query.buffType.trim().toLowerCase() : ''
    selectedBuffType.value = rawBuffType === 'buff' || rawBuffType === 'debuff' ? rawBuffType : 'all'
  }
  if (entityType.value === 'bosses') {
    const rawBossType = typeof route.query.bossType === 'string' ? route.query.bossType.trim().toUpperCase() : ''
    selectedBossType.value = rawBossType === 'PRE_HARDMODE' || rawBossType === 'HARDMODE' || rawBossType === 'EVENT' || rawBossType === 'SPECIAL_SEED'
      ? rawBossType
      : 'all'
  }
  await fetchRows(pagination.page)
}, { immediate: true })

function getDisplayValue(row: Record<string, any>, keys?: string[]) {
  if (!row || !Array.isArray(keys)) return ''
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function getDisplayTitle(row: Record<string, any>) {
  if (entityType.value === 'projectiles') return getProjectileNameZh(row) || getProjectileNameEn(row) || '--'
  return getDisplayValue(row, currentConfig.value?.displayTitleKeys) || '--'
}

function getDisplaySubtitle(row: Record<string, any>) {
  if (entityType.value === 'projectiles') {
    const en = getProjectileNameEn(row)
    const zh = getProjectileNameZh(row)
    const parts = [zh ? en : '', row.internalName].filter(Boolean)
    return parts.join(' · ')
  }
  const title = getDisplayTitle(row)
  const subtitle = getDisplayValue(row, currentConfig.value?.displaySubtitleKeys)
  return subtitle && subtitle !== title ? subtitle : ''
}

function getAtomicSummary(row: Record<string, any>) {
  const parts = (currentConfig.value?.atomicFields ?? [])
    .map(field => {
      const value = getDisplayValue(row, [field.key])
      return value ? `${field.label}: ${value}` : ''
    })
    .filter(Boolean)
  return parts.join(' · ')
}

function getProjectileNameZh(row: Record<string, any> | null | undefined) {
  if (!row) return ''
  const raw = extractRawJsonObject(row.rawJson)
  return pickFirstString(row.nameZh, raw?.nameZh, raw?.zhName, raw?.cnName, raw?.displayNameZh)
}

function getProjectileNameEn(row: Record<string, any> | null | undefined) {
  if (!row) return '--'
  const raw = extractRawJsonObject(row.rawJson)
  return pickFirstString(row.nameEn, row.name, raw?.nameEn, raw?.englishName, raw?.displayNameEn, row.internalName) || '--'
}

function getProjectileTags(row: Record<string, any> | null | undefined) {
  if (!row) return []
  const tags: string[] = []
  if (row.friendly === true) tags.push('友方 Friendly')
  if (row.hostile === true) tags.push('敌对 Hostile')
  if (row.tileCollide === true) tags.push('撞砖 On')
  if (row.tileCollide === false) tags.push('穿砖 Off')
  if (typeof row.penetrate === 'number') tags.push(`穿透 ${row.penetrate}`)
  if (typeof row.aiStyle === 'number') tags.push(`AI ${row.aiStyle}`)
  return tags
}

function getArmorSetWearCount(row: Record<string, any>, type: 'male' | 'female' | 'special') {
  const key = type === 'male' ? 'maleImages' : type === 'female' ? 'femaleImages' : 'specialImages'
  return splitImageCsv(row?.[key]).length
}

function getArmorSetRelatedCount(row: Record<string, any>) {
  return Array.isArray(row?.relatedItems) ? row.relatedItems.length : 0
}

function guessArmorItemGroup(item: Record<string, any>) {
  const values = [item?.nameZh, item?.name, item?.internalName]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(value => value.toLowerCase())
  const joined = values.join(' ')
  if (/(helmet|headgear|hat|hood|mask|cap|crown|helm|wig|头盔|头饰|帽|兜帽|面具|王冠)/.test(joined)) return 'head'
  if (/(breastplate|plate mail|chainmail|shirt|robe|tunic|jerkin|carapace|胸甲|上衣|长袍|护胸|链甲|外套)/.test(joined)) return 'body'
  if (/(greaves|leggings|pants|trousers|skirt|boots|chaps|leg guards|护腿|裤|腿甲|靴|裙)/.test(joined)) return 'legs'
  return 'other'
}
</script>
<style scoped>
.entity-page { padding-bottom: 24px; }
.entity-hero__stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.hero-inline-notes { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
.hero-inline-note { padding: 6px 10px; border-radius: var(--radius-full); border: 1px solid color-mix(in srgb, var(--color-primary) 22%, var(--color-border)); background: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg-secondary)); color: var(--color-text-secondary); font-size: 0.78rem; font-weight: 700; }
.toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; align-items: end; }
.field--search { min-width: 0; }
.field--full { grid-column: 1 / -1; }
.field__required { color: var(--color-danger); }
.field__action { border: 1px solid var(--color-border); background: var(--color-bg-tertiary); color: var(--color-text-secondary); border-radius: var(--radius-full); padding: 6px 10px; font-size: 0.75rem; font-weight: 700; cursor: pointer; }
.filter-chip-group { display: flex; gap: 10px; flex-wrap: wrap; }
.filter-chip {
  min-width: 148px;
  min-height: 48px;
  padding: 10px 14px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg) 82%, var(--color-bg-secondary));
  color: var(--color-text-secondary);
  display: grid;
  gap: 2px;
  text-align: left;
  cursor: pointer;
  transition: border-color .18s ease, background-color .18s ease, box-shadow .18s ease, transform .18s ease;
}
.filter-chip:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--color-primary) 36%, var(--color-border));
}
.filter-chip:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--color-primary) 70%, var(--color-border));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-primary) 16%, transparent);
}
.filter-chip span {
  color: var(--color-text);
  font-size: 0.92rem;
  font-weight: 700;
}
.filter-chip small {
  color: var(--color-text-muted);
  font-size: 0.75rem;
  line-height: 1.4;
}
.filter-chip--active {
  border-color: color-mix(in srgb, var(--color-primary) 64%, var(--color-border));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 14%, var(--color-bg-secondary)), color-mix(in srgb, var(--color-primary-light) 8%, var(--color-bg)));
  box-shadow: 0 14px 28px -22px color-mix(in srgb, var(--color-primary) 72%, transparent);
}
.filter-chip--active span,
.filter-chip--active small {
  color: var(--color-text);
}
.boss-type-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 10px;
}
.boss-type-pill {
  padding: 12px 14px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 16%, var(--color-border));
  background: color-mix(in srgb, var(--color-bg) 82%, var(--color-bg-secondary));
  display: grid;
  gap: 4px;
  text-align: left;
  cursor: pointer;
  transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
}
.boss-type-pill:hover { transform: translateY(-1px); }
.boss-type-pill strong { color: var(--color-text); font-size: 0.92rem; }
.boss-type-pill small { color: var(--color-text-secondary); font-size: 0.78rem; }
.boss-type-pill__eyebrow { color: var(--color-text-muted); font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; }
.boss-type-pill--active {
  border-color: color-mix(in srgb, var(--color-primary) 56%, var(--color-border));
  box-shadow: 0 16px 30px -24px color-mix(in srgb, var(--color-primary) 72%, transparent);
  background: linear-gradient(145deg, color-mix(in srgb, var(--color-primary) 16%, var(--color-bg-secondary)), color-mix(in srgb, var(--color-primary-light) 8%, var(--color-bg)));
}
.boss-browser { display: grid; gap: 18px; }
.boss-browser__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
.boss-type-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 12px;
}
.boss-type-card {
  position: relative;
  min-height: 132px;
  padding: 18px 18px 16px;
  border-radius: 22px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 18%, var(--color-border));
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--color-primary) 14%, transparent), transparent 48%),
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-secondary) 96%, transparent), color-mix(in srgb, var(--color-bg) 94%, transparent));
  display: grid;
  gap: 8px;
  text-align: left;
  cursor: pointer;
  transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
}
.boss-type-card:hover { transform: translateY(-2px); }
.boss-type-card--active {
  border-color: color-mix(in srgb, var(--color-primary) 62%, var(--color-border));
  box-shadow: 0 18px 34px -24px color-mix(in srgb, var(--color-primary) 84%, transparent);
}
.boss-type-card__eyebrow { color: var(--color-text-muted); font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; }
.boss-type-card strong { color: var(--color-text); font-size: 1.04rem; }
.boss-type-card small { color: var(--color-text-secondary); font-size: 0.8rem; line-height: 1.5; max-width: 26ch; }
.boss-type-card__count {
  position: absolute;
  top: 16px;
  right: 16px;
  min-width: 42px;
  padding: 6px 10px;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-primary) 14%, var(--color-bg-secondary));
  color: var(--color-text);
  font-weight: 700;
  text-align: center;
}
.boss-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}
.boss-card {
  display: grid;
  gap: 14px;
  padding: 14px;
  border-radius: 22px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 18%, var(--color-border));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--color-primary) 10%, transparent), transparent 44%),
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-secondary) 96%, transparent), color-mix(in srgb, var(--color-bg) 96%, transparent));
  box-shadow: var(--shadow-sm);
}
.boss-card__media {
  border: 0;
  padding: 12px;
  min-height: 224px;
  border-radius: 18px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--color-bg-tertiary) 94%, transparent), color-mix(in srgb, var(--color-bg-secondary) 92%, transparent));
  cursor: zoom-in;
  display: grid;
  place-items: center;
}
.boss-card__image { width: 100%; max-height: 240px; object-fit: contain; }
.boss-card__fallback {
  width: 96px;
  height: 96px;
  border-radius: 28px;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--color-primary) 16%, var(--color-bg-secondary));
  color: var(--color-text);
  font-size: 1.9rem;
  font-weight: 700;
}
.boss-card__body { display: grid; gap: 12px; }
.boss-card__pills,.boss-detail__member-pills { display: flex; gap: 8px; flex-wrap: wrap; }
.boss-card__heading { display: grid; gap: 4px; }
.boss-card__heading h3 { margin: 0; color: var(--color-text); font-size: 1.1rem; }
.boss-card__heading p,.boss-card__meta span,.boss-card__note { color: var(--color-text-secondary); }
.boss-card__note { margin: 0; line-height: 1.6; font-size: 0.85rem; min-height: 4.8em; }
.boss-card__meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 0.8rem; }
.boss-card__actions { display: flex; gap: 12px; flex-wrap: wrap; }
.toolbar__actions { display: flex; gap: 10px; flex-wrap: wrap; }
.input--search { padding-left: 40px; }
.textarea--code { font-family: Consolas, 'SFMono-Regular', 'Liberation Mono', monospace; line-height: 1.6; background: color-mix(in srgb, var(--color-bg-tertiary) 82%, transparent); }
.table-wrap { overflow-x: auto; border-radius: calc(var(--radius-lg) - 2px); border: 1px solid var(--color-border); }
.data-table { width: 100%; min-width: 980px; border-collapse: collapse; background: color-mix(in srgb, var(--color-bg-secondary) 94%, transparent); }
.data-table th,.data-table td { padding: 13px 14px; border-bottom: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent); text-align: left; vertical-align: middle; }
.data-table th { position: sticky; top: 0; z-index: 1; background: color-mix(in srgb, var(--color-bg-tertiary) 94%, transparent); color: var(--color-text-secondary); font-weight: 700; white-space: nowrap; }
.data-table tbody tr:hover { background: color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-secondary)); }
.thumb-wrap { width: 44px; }
.thumb { width: 44px; height: 44px; object-fit: contain; border-radius: 12px; background: color-mix(in srgb, var(--color-bg-tertiary) 90%, transparent); border: 1px solid var(--color-border); display: grid; place-items: center; overflow: hidden; }
.thumb--fallback { font-size: 1.1rem; color: var(--color-text-muted); }
.cell-primary { display: grid; gap: 4px; }
.cell-primary strong { color: var(--color-text); font-weight: 700; }
.cell-primary span,.data-table td > span { color: var(--color-text-secondary); font-size: 0.86rem; }
.cell-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
.cell-badge { padding: 4px 8px; border-radius: var(--radius-full); border: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-bg-tertiary) 92%, transparent); color: var(--color-text-secondary); font-size: 0.74rem; font-weight: 700; line-height: 1; }
.cell-badge--accent { color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 12%, var(--color-bg-secondary)); }
.cell-bilingual { display: grid; gap: 2px; margin-top: 4px; }
.cell-bilingual span { color: var(--color-text-secondary); font-size: 0.8rem; }
.cell-bilingual strong { color: var(--color-text); margin-right: 6px; }
.cell-primary__atomic { color: var(--color-text-muted); font-size: 0.78rem; font-family: Consolas, 'SFMono-Regular', 'Liberation Mono', monospace; white-space: normal; word-break: break-all; }
.row-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.btn-link--danger { color: var(--color-danger); }
.pagination-wrap { margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--color-border); }
.editor-layout { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(300px, 0.85fr); gap: 24px; }
.editor-pane,.preview-pane { display: grid; gap: 16px; align-content: start; }
.editor-pane__head h3,.preview-card__head h4 { margin: 0; color: var(--color-text); }
.editor-pane__head p,.preview-card__head span { color: var(--color-text-secondary); font-size: 0.84rem; margin-top: 4px; }
.editor-pane__subhead { display: grid; gap: 4px; margin-top: 8px; }
.editor-pane__subhead h4 { margin: 0; color: var(--color-text); }
.editor-pane__subhead p { margin: 0; color: var(--color-text-secondary); font-size: 0.82rem; }
.advanced-fields { display: grid; gap: 14px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.preview-card { padding: 18px; border-radius: var(--radius-lg); background: color-mix(in srgb, var(--color-bg) 78%, var(--color-bg-secondary)); border: 1px solid var(--color-border); box-shadow: var(--shadow-sm); display: grid; gap: 14px; }
.preview-card--hero {
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--color-primary) 20%, transparent), transparent 42%),
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-secondary) 94%, transparent), var(--color-bg-secondary));
}
.preview-card__media { min-height: 180px; border-radius: calc(var(--radius-lg) - 4px); border: 1px solid color-mix(in srgb, var(--color-primary) 18%, var(--color-border)); background: color-mix(in srgb, var(--color-bg-tertiary) 85%, transparent); display: grid; place-items: center; overflow: hidden; }
.preview-card__image { width: 100%; height: 100%; max-height: 240px; object-fit: contain; }
.preview-card__placeholder { width: 96px; height: 96px; border-radius: 24px; display: grid; place-items: center; font-size: 2rem; background: color-mix(in srgb, var(--color-primary) 12%, var(--color-bg-secondary)); }
.preview-card__body { display: grid; gap: 12px; }
.preview-card__body h3 { margin: 0; color: var(--color-text); font-size: 1.25rem; }
.preview-card__body p { margin: 0; color: var(--color-text-secondary); line-height: 1.6; }
.preview-pills { display: flex; gap: 10px; flex-wrap: wrap; }
.preview-pill { padding: 6px 10px; border-radius: var(--radius-full); border: 1px solid var(--color-border); background: var(--color-bg-tertiary); color: var(--color-text-secondary); font-size: 0.78rem; font-weight: 700; }
.preview-pill--accent { background: color-mix(in srgb, var(--color-primary) 14%, var(--color-bg-secondary)); color: var(--color-primary); }
.preview-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.preview-stat { padding: 12px; border-radius: var(--radius-md); background: color-mix(in srgb, var(--color-bg-secondary) 88%, transparent); border: 1px solid var(--color-border); display: grid; gap: 4px; }
.preview-stat span { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-text-muted); }
.preview-stat strong { color: var(--color-text); }
.preview-card__head,.preview-json__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.preview-note { display: grid; gap: 6px; padding: 12px; border-radius: var(--radius-md); background: color-mix(in srgb, var(--color-bg-secondary) 90%, transparent); border: 1px solid var(--color-border); }
.preview-note strong { color: var(--color-text); font-size: 0.86rem; }
.preview-note p { margin: 0; color: var(--color-text-secondary); line-height: 1.6; white-space: pre-wrap; }
.preview-json { display: grid; gap: 10px; }
.preview-json__head strong { color: var(--color-text); font-size: 0.86rem; }
.preview-json__head span { color: var(--color-text-secondary); font-size: 0.8rem; }
.preview-json pre { margin: 0; padding: 14px; border-radius: var(--radius-md); background: color-mix(in srgb, var(--color-bg-tertiary) 88%, transparent); border: 1px solid var(--color-border); color: var(--color-text-secondary); font-size: 0.8rem; line-height: 1.6; overflow-x: auto; }
.preview-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
.preview-gallery__image { width: 100%; min-height: 120px; max-height: 160px; object-fit: contain; border-radius: var(--radius-md); border: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-bg-tertiary) 90%, transparent); }
.armor-detail { display: grid; gap: 20px; padding: 24px; }
.armor-detail__hero { display: grid; grid-template-columns: minmax(260px, 0.9fr) minmax(0, 1.1fr); gap: 18px; padding: 18px; border-bottom: 1px solid var(--color-border); background: linear-gradient(180deg, color-mix(in srgb, var(--color-bg-secondary) 94%, transparent), var(--color-bg-secondary)); }
.armor-detail__hero-media { min-height: 260px; border-radius: var(--radius-lg); border: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-bg-tertiary) 92%, transparent); display: grid; place-items: center; overflow: hidden; }
.armor-detail__hero-image { width: 100%; height: 100%; max-height: 320px; object-fit: contain; }
.armor-detail__hero-fallback { width: 108px; height: 108px; border-radius: 28px; display: grid; place-items: center; font-size: 2rem; background: color-mix(in srgb, var(--color-primary) 14%, var(--color-bg-secondary)); }
.armor-detail__hero-body { display: grid; gap: 12px; align-content: start; }
.armor-detail__hero-body h3 { margin: 0; color: var(--color-text); font-size: 1.4rem; }
.armor-detail__hero-body p { margin: 0; color: var(--color-text-secondary); line-height: 1.6; }
.armor-detail__section { display: grid; gap: 14px; }
.armor-detail__section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.armor-detail__section-head h4,.armor-detail__section-head strong { margin: 0; color: var(--color-text); }
.armor-detail__section-head span { color: var(--color-text-secondary); font-size: 0.84rem; }
.armor-detail__section-head--sub { padding-bottom: 6px; border-bottom: 1px solid color-mix(in srgb, var(--color-border) 75%, transparent); }
.armor-detail__section-copy { display: grid; gap: 4px; }
.armor-detail__section-copy p { margin: 0; color: var(--color-text-secondary); font-size: 0.82rem; line-height: 1.55; }
.armor-detail__helper { margin: 0; color: var(--color-text-secondary); font-size: 0.84rem; line-height: 1.6; }
.armor-detail__wear-groups { display: grid; gap: 18px; }
.armor-detail__wear-group { display: grid; gap: 12px; padding: 16px; border-radius: var(--radius-lg); border: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-bg-secondary) 90%, transparent); }
.armor-detail__wear-layout { display: grid; grid-template-columns: minmax(240px, 0.9fr) minmax(0, 1.1fr); gap: 14px; align-items: start; }
.armor-detail__wear-feature { border: 0; padding: 0; background: transparent; cursor: zoom-in; }
.armor-detail__wear-feature-image { width: 100%; min-height: 220px; max-height: 320px; object-fit: contain; border-radius: var(--radius-lg); border: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-bg-tertiary) 92%, transparent); }
.armor-detail__wear-strip { align-content: start; }
.armor-detail__item-groups { display: grid; gap: 18px; }
.armor-detail__item-group { display: grid; gap: 12px; padding: 16px; border-radius: var(--radius-lg); border: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-bg-secondary) 90%, transparent); }
.armor-detail__item-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
.armor-detail__item-card { display: grid; gap: 10px; padding: 12px; border-radius: var(--radius-lg); border: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-bg-secondary) 90%, transparent); }
.armor-detail__item-media { border: 0; padding: 0; background: transparent; cursor: pointer; }
.armor-detail__item-image,.armor-detail__item-fallback { width: 100%; min-height: 150px; max-height: 180px; object-fit: contain; border-radius: var(--radius-md); border: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-bg-tertiary) 92%, transparent); display: grid; place-items: center; }
.armor-detail__item-body { display: grid; gap: 4px; }
.armor-detail__item-body strong { color: var(--color-text); }
.armor-detail__item-body span { color: var(--color-text-secondary); font-size: 0.82rem; }
.projectile-detail--buff .armor-detail__item-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
.projectile-detail--buff .armor-detail__item-card { padding: 10px; gap: 8px; }
.projectile-detail--buff .armor-detail__item-image,
.projectile-detail--buff .armor-detail__item-fallback { min-height: 104px; max-height: 120px; }
.projectile-detail--buff .armor-detail__item-body { gap: 3px; }
.projectile-detail--buff .armor-detail__item-body span { font-size: 0.78rem; }
.armor-detail__zoomable { cursor: zoom-in; }
.armor-lightbox { display: grid; place-items: center; min-height: 70dvh; background: color-mix(in srgb, var(--color-bg) 94%, var(--color-bg-secondary)); }
.armor-lightbox__image { width: 100%; max-width: 920px; max-height: 82dvh; object-fit: contain; }
.boss-detail { display: grid; gap: 20px; padding: 24px; }
.boss-detail__hero {
  display: grid;
  grid-template-columns: minmax(260px, 0.86fr) minmax(0, 1.14fr);
  gap: 18px;
  padding: 18px;
  border-bottom: 1px solid var(--color-border);
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--color-primary) 16%, transparent), transparent 44%),
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-secondary) 95%, transparent), var(--color-bg-secondary));
}
.boss-detail__media {
  min-height: 260px;
  border-radius: var(--radius-lg);
  border: 1px solid color-mix(in srgb, var(--color-primary) 22%, var(--color-border));
  background: color-mix(in srgb, var(--color-bg-tertiary) 92%, transparent);
  display: grid;
  place-items: center;
  overflow: hidden;
}
.boss-detail__image { width: 100%; height: 100%; max-height: 320px; object-fit: contain; }
.boss-detail__fallback {
  width: 108px;
  height: 108px;
  border-radius: 28px;
  display: grid;
  place-items: center;
  font-size: 2rem;
  background: color-mix(in srgb, var(--color-primary) 14%, var(--color-bg-secondary));
}
.boss-detail__body { display: grid; gap: 12px; align-content: start; }
.boss-detail__body h3 { margin: 0; color: var(--color-text); font-size: 1.4rem; }
.boss-detail__body p { margin: 0; color: var(--color-text-secondary); line-height: 1.6; }
.boss-detail__section { display: grid; gap: 14px; }
.boss-detail__section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.boss-detail__section-head h4,.boss-detail__section-head strong { margin: 0; color: var(--color-text); }
.boss-detail__section-head span { color: var(--color-text-secondary); font-size: 0.84rem; }
.boss-detail__section-head--sub { padding-bottom: 6px; border-bottom: 1px solid color-mix(in srgb, var(--color-border) 75%, transparent); }
.boss-detail__helper { margin: 0; color: var(--color-text-secondary); font-size: 0.84rem; line-height: 1.6; }
.boss-detail__group-list { display: grid; gap: 18px; }
.boss-detail__group {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-secondary) 90%, transparent);
}
.boss-detail__member-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
.boss-detail__member-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-secondary) 92%, transparent);
}
.boss-detail__member-media { border: 0; padding: 0; background: transparent; cursor: pointer; }
.boss-detail__member-image,.boss-detail__member-fallback {
  width: 100%;
  min-height: 128px;
  max-height: 152px;
  object-fit: contain;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-tertiary) 92%, transparent);
  display: grid;
  place-items: center;
}
.boss-detail__member-body { display: grid; gap: 4px; }
.boss-detail__member-body strong { color: var(--color-text); }
.boss-detail__member-body span { color: var(--color-text-secondary); font-size: 0.82rem; }
.projectile-detail { display: grid; gap: 20px; padding: 24px; }
.projectile-detail__hero { display: grid; grid-template-columns: minmax(260px, 0.88fr) minmax(0, 1.12fr); gap: 18px; padding: 18px; border-bottom: 1px solid var(--color-border); background: linear-gradient(180deg, color-mix(in srgb, var(--color-bg-secondary) 94%, transparent), var(--color-bg-secondary)); }
.projectile-detail__media { min-height: 260px; border-radius: var(--radius-lg); border: 1px solid color-mix(in srgb, var(--color-primary) 20%, var(--color-border)); background: radial-gradient(circle at top, color-mix(in srgb, var(--color-primary) 14%, transparent), transparent 55%), color-mix(in srgb, var(--color-bg-tertiary) 92%, transparent); display: grid; place-items: center; overflow: hidden; }
.projectile-detail__image { width: 100%; height: 100%; max-height: 320px; object-fit: contain; }
.projectile-detail__fallback { width: 108px; height: 108px; border-radius: 28px; display: grid; place-items: center; font-size: 2rem; background: color-mix(in srgb, var(--color-primary) 14%, var(--color-bg-secondary)); }
.projectile-detail__body { display: grid; gap: 12px; align-content: start; }
.projectile-detail__body h3 { margin: 0; color: var(--color-text); font-size: 1.4rem; }
.projectile-detail__body p { margin: 0; color: var(--color-text-secondary); line-height: 1.6; }
.projectile-detail--buff { gap: 16px; padding: 20px; }
.projectile-detail--buff .projectile-detail__hero { grid-template-columns: minmax(180px, 0.72fr) minmax(0, 1.28fr); gap: 16px; padding: 16px; }
.projectile-detail--buff .projectile-detail__media { min-height: 190px; }
.projectile-detail--buff .projectile-detail__image { max-height: 200px; }
.projectile-detail--buff .projectile-detail__fallback { width: 88px; height: 88px; font-size: 1.6rem; }
.projectile-detail__lang-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.projectile-detail__lang-card { padding: 14px; border-radius: var(--radius-md); background: color-mix(in srgb, var(--color-bg-secondary) 88%, transparent); border: 1px solid var(--color-border); display: grid; gap: 6px; }
.projectile-detail__lang-card span { color: var(--color-text-muted); font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.08em; }
.projectile-detail__lang-card strong { color: var(--color-text); word-break: break-word; }
.projectile-detail__section { display: grid; gap: 14px; }
.projectile-detail--buff .projectile-detail__section { gap: 12px; }
.projectile-detail__section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.projectile-detail__section-head h4 { margin: 0; color: var(--color-text); }
.projectile-detail__section-head span { color: var(--color-text-secondary); font-size: 0.84rem; }
.projectile-detail__chip-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.projectile-detail__chip { padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-bg-secondary) 90%, transparent); display: grid; gap: 6px; }
.projectile-detail__chip span { color: var(--color-text-muted); font-size: 0.76rem; }
.projectile-detail__chip strong { color: var(--color-text); }
.projectile-detail__note-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.projectile-detail__code { margin: 0; padding: 16px; border-radius: var(--radius-lg); border: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-bg-tertiary) 88%, transparent); color: var(--color-text-secondary); font-size: 0.84rem; line-height: 1.7; overflow: auto; }
.related-items { display: grid; gap: 10px; }
.related-item { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 12px; align-items: center; padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-bg-secondary) 90%, transparent); }
.related-item__image,.related-item__fallback { width: 64px; height: 64px; border-radius: 14px; object-fit: contain; border: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-bg-tertiary) 90%, transparent); display: grid; place-items: center; }
.related-item__body { display: grid; gap: 4px; min-width: 0; }
.related-item__body strong { color: var(--color-text); }
.related-item__body span { color: var(--color-text-secondary); font-size: 0.82rem; }
@media (max-width: 1080px) {
  .toolbar,.editor-layout { grid-template-columns: 1fr; }
  .armor-detail__hero,.boss-detail__hero,.projectile-detail__hero { grid-template-columns: 1fr; }
  .armor-detail__wear-layout { grid-template-columns: 1fr; }
  .projectile-detail--buff .projectile-detail__hero { grid-template-columns: 1fr; }
  .projectile-detail--buff .projectile-detail__media { min-height: 160px; }
  .projectile-detail--buff .projectile-detail__image { max-height: 180px; }
}
@media (max-width: 820px) {
  .entity-hero__stats,.form-grid,.preview-stats { grid-template-columns: 1fr; }
  .boss-type-strip,.boss-type-grid,.boss-gallery,.boss-detail__member-grid { grid-template-columns: 1fr; }
  .projectile-detail__lang-grid,.projectile-detail__chip-grid,.projectile-detail__note-grid { grid-template-columns: 1fr; }
  .toolbar__actions,.table-card__head,.preview-card__head,.preview-json__head,.boss-browser__head,.boss-detail__section-head { flex-direction: column; align-items: flex-start; }
  .filter-chip { width: 100%; min-width: 0; }
  .projectile-detail--buff .armor-detail__item-image,
  .projectile-detail--buff .armor-detail__item-fallback { min-height: 92px; max-height: 108px; }
}
</style>

