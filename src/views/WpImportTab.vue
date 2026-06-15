<template>
  <div class="wp-import-tab">
    <!-- Import form (D6: chunked, frontend-driven runs) -->
    <section class="wp-import-form">
      <h3>{{ t('wpImport.title') }}</h3>
      <div class="wp-import-form-row">
        <input
          v-model="store.feedUrl"
          type="text"
          class="wp-import-url-input"
          data-testid="wp-import-url"
          :placeholder="t('wpImport.feedUrlPlaceholder')"
        >
        <select
          v-model.number="store.batchSize"
          class="wp-import-select"
          data-testid="wp-import-batch-size"
        >
          <option
            v-for="size in BATCH_SIZES"
            :key="size"
            :value="size"
          >
            {{ size }}
          </option>
        </select>
        <button
          class="wp-import-btn"
          data-testid="wp-import-check"
          :disabled="!store.feedUrl || store.checking"
          @click="store.checkFeed()"
        >
          {{ t('wpImport.checkFeed') }}
        </button>
        <button
          class="wp-import-btn wp-import-btn-primary"
          data-testid="wp-import-run"
          :disabled="!store.feedUrl || store.importing"
          @click="store.runImport()"
        >
          {{ store.importing ? t('wpImport.importing') : t('wpImport.import') }}
        </button>
      </div>

      <p
        v-if="store.stats"
        class="wp-import-stats"
        data-testid="wp-import-stats"
      >
        {{ store.stats.never_imported }} {{ t('wpImport.neverImported') }} · {{ store.stats.already_imported }} {{ t('wpImport.alreadyImported') }} · {{ store.stats.total_in_feed }} {{ t('wpImport.totalInFeed') }}
      </p>

      <p
        v-if="store.importing"
        class="wp-import-progress"
        data-testid="wp-import-progress"
      >
        {{ store.importedSoFar }} {{ t('wpImport.progressImported') }}
      </p>

      <p
        v-if="store.error"
        class="wp-import-error"
        data-testid="wp-import-error"
      >
        {{ store.error }}
      </p>

      <div
        v-if="store.runCompleted"
        class="wp-import-summary"
        data-testid="wp-import-summary"
      >
        <p>{{ store.importedSoFar }} {{ t('wpImport.summaryImported') }}</p>
        <div v-if="store.errorResults.length">
          <strong>{{ t('wpImport.summaryErrors') }}</strong>
          <ul>
            <li
              v-for="result in store.errorResults"
              :key="result.guid"
            >
              {{ result.title }} — {{ result.error }}
            </li>
          </ul>
        </div>
        <div v-if="store.imageMisses.length">
          <strong>{{ t('wpImport.summaryImageMisses') }}</strong>
          <ul>
            <li
              v-for="missedImageUrl in store.imageMisses"
              :key="missedImageUrl"
            >
              {{ missedImageUrl }}
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- Imported-posts table (server-side search/sort/paging) -->
    <section class="wp-import-list">
      <h3>{{ t('wpImport.importedPosts') }}</h3>

      <div class="wp-import-list-controls">
        <input
          v-model="searchTerm"
          type="text"
          class="wp-import-search-input"
          data-testid="wp-import-search"
          :placeholder="t('wpImport.searchPlaceholder')"
          @change="store.setSearch(searchTerm)"
        >
        <label class="wp-import-per-page-label">
          {{ t('wpImport.perPage') }}
          <select
            class="wp-import-select"
            data-testid="wp-import-per-page"
            :value="store.perPage"
            @change="onPerPageChange"
          >
            <option
              v-for="pageSize in PER_PAGE_SIZES"
              :key="pageSize"
              :value="pageSize"
            >
              {{ pageSize }}
            </option>
          </select>
        </label>
      </div>

      <div
        v-if="selectedRowIds.length"
        class="wp-import-bulk-bar"
        data-testid="wp-import-bulk-bar"
      >
        <span>{{ selectedRowIds.length }} {{ t('wpImport.selectedCount') }}</span>
        <button
          class="wp-import-btn wp-import-btn-danger"
          data-testid="wp-import-bulk-remove"
          @click="onBulkRemove"
        >
          {{ t('wpImport.removeSelected') }}
        </button>
        <button
          class="wp-import-btn"
          data-testid="wp-import-bulk-draft"
          @click="onBulkMoveToDraft"
        >
          {{ t('wpImport.moveToDraft') }}
        </button>
        <select
          v-model="selectedCategoryId"
          class="wp-import-select"
          data-testid="wp-import-bulk-category"
          @change="onBulkAssignCategory"
        >
          <option value="">
            {{ t('wpImport.assignCategory') }}
          </option>
          <option
            v-for="category in store.categories"
            :key="category.id"
            :value="category.id"
          >
            {{ category.name }}
          </option>
        </select>
        <input
          v-model="newTagName"
          type="text"
          class="wp-import-tag-input"
          data-testid="wp-import-bulk-tag-input"
          :placeholder="t('wpImport.tagNamePlaceholder')"
        >
        <button
          class="wp-import-btn"
          data-testid="wp-import-bulk-tag"
          @click="onBulkAddTag"
        >
          {{ t('wpImport.addTag') }}
        </button>
      </div>

      <Table
        :columns="tableColumns"
        :data="store.items"
        row-key="id"
        :loading="store.loading"
        hoverable
        @sort="onSort"
      >
        <template #cell-select="{ row }">
          <input
            type="checkbox"
            data-testid="wp-import-row-select"
            :checked="selectedRowIds.includes(asImportedRow(row).id)"
            @change="toggleRowSelection(asImportedRow(row).id, $event)"
          >
        </template>
        <template #cell-title="{ row }">
          <span
            class="wp-import-row-title"
            data-testid="wp-import-row-title"
            @click="openPost(asImportedRow(row))"
          >
            {{ asImportedRow(row).title }}
          </span>
        </template>
        <template #cell-categories="{ row }">
          {{ asImportedRow(row).categories.join(', ') }}
        </template>
        <template #cell-tags="{ row }">
          {{ asImportedRow(row).tags.join(', ') }}
        </template>
        <template #cell-imported_at="{ row }">
          {{ formatImportedAt(asImportedRow(row).imported_at) }}
        </template>
        <template #empty>
          {{ t('wpImport.noPosts') }}
        </template>
      </Table>

      <Pagination
        v-if="totalPages > 1"
        :current-page="store.page"
        :total-pages="totalPages"
        @update:current-page="store.setPage($event)"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * WP Import tab (S81 Slice 2) — rendered inside Settings → Import/Export via
 * the `dataExchangeTabs` extension slot (cms.manage-gated by the host page).
 *
 * Import form drives chunked runs through the store (D6); the imported-posts
 * table is server-side searched/sorted/paged; bulk ops reuse the cms admin
 * API except "remove selected" which is owned by wp-import (D7). A row click
 * opens the normal cms post editor (entity-navigation principle).
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Table, Pagination } from 'vbwd-view-component';
import type { TableColumn } from 'vbwd-view-component';
import {
  useWpImportStore,
  type WpImportedPostRow,
  type WpImportSortColumn,
  type WpImportSortOrder,
} from '../stores/useWpImportStore';

const BATCH_SIZES = [10, 20, 50, 100];
const PER_PAGE_SIZES = [20, 50, 100];
const SORTABLE_COLUMNS: WpImportSortColumn[] = ['title', 'imported_at'];

const { t } = useI18n();
const router = useRouter();
const store = useWpImportStore();

const searchTerm = ref('');
const selectedRowIds = ref<string[]>([]);
const selectedCategoryId = ref('');
const newTagName = ref('');

const tableColumns = computed<TableColumn[]>(() => [
  { key: 'select', label: '', width: '40px' },
  { key: 'title', label: t('wpImport.columnTitle'), sortable: true },
  { key: 'categories', label: t('wpImport.columnCategories') },
  { key: 'tags', label: t('wpImport.columnTags') },
  { key: 'imported_at', label: t('wpImport.columnImportedAt'), sortable: true },
]);

const totalPages = computed(() => Math.ceil(store.total / store.perPage));

const selectedCmsPostIds = computed(() =>
  store.items
    .filter((item) => selectedRowIds.value.includes(item.id))
    .map((item) => item.cms_post_id),
);

/** The fe-core Table slot exposes rows as Record<string, unknown>. */
function asImportedRow(row: Record<string, unknown>): WpImportedPostRow {
  return row as unknown as WpImportedPostRow;
}

function formatImportedAt(importedAt: string): string {
  return new Date(importedAt).toLocaleString();
}

function toggleRowSelection(rowId: string, event: Event): void {
  const isChecked = (event.target as HTMLInputElement).checked;
  if (isChecked && !selectedRowIds.value.includes(rowId)) {
    selectedRowIds.value = [...selectedRowIds.value, rowId];
  } else if (!isChecked) {
    selectedRowIds.value = selectedRowIds.value.filter((id) => id !== rowId);
  }
}

function clearSelection(): void {
  selectedRowIds.value = [];
}

function openPost(row: WpImportedPostRow): void {
  router.push({ name: 'cms-post-edit', params: { id: row.cms_post_id } });
}

async function onSort(columnKey: string, order: 'asc' | 'desc'): Promise<void> {
  if (!SORTABLE_COLUMNS.includes(columnKey as WpImportSortColumn)) return;
  await store.setSort(columnKey as WpImportSortColumn, order as WpImportSortOrder);
}

async function onPerPageChange(event: Event): Promise<void> {
  await store.setPerPage(Number((event.target as HTMLSelectElement).value));
}

async function onBulkRemove(): Promise<void> {
  const confirmed = window.confirm(
    t('wpImport.confirmRemove', { count: selectedRowIds.value.length }),
  );
  if (!confirmed) return;
  await store.bulkRemove(selectedRowIds.value);
  clearSelection();
}

async function onBulkMoveToDraft(): Promise<void> {
  await store.bulkMoveToDraft(selectedCmsPostIds.value);
  clearSelection();
}

async function onBulkAssignCategory(): Promise<void> {
  if (!selectedCategoryId.value) return;
  await store.bulkAssignCategory(selectedCmsPostIds.value, selectedCategoryId.value);
  selectedCategoryId.value = '';
  clearSelection();
}

async function onBulkAddTag(): Promise<void> {
  if (!newTagName.value.trim()) return;
  await store.bulkAddTag(selectedCmsPostIds.value, newTagName.value);
  newTagName.value = '';
  clearSelection();
}

onMounted(async () => {
  await Promise.all([store.fetchImported(), store.fetchTerms()]);
});
</script>

<style scoped>
.wp-import-tab {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.wp-import-form-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.wp-import-url-input {
  flex: 1;
  min-width: 280px;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--vbwd-color-border, #e5e7eb);
  border-radius: 0.375rem;
}

.wp-import-select,
.wp-import-search-input,
.wp-import-tag-input {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--vbwd-color-border, #e5e7eb);
  border-radius: 0.375rem;
  background: white;
}

.wp-import-btn {
  padding: 0.5rem 1rem;
  border: 1px solid var(--vbwd-color-border, #e5e7eb);
  border-radius: 0.375rem;
  background: white;
  color: var(--vbwd-color-text, #374151);
  cursor: pointer;
}

.wp-import-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.wp-import-btn-primary {
  background: var(--vbwd-color-primary, #3b82f6);
  border-color: var(--vbwd-color-primary, #3b82f6);
  color: white;
}

.wp-import-btn-danger {
  background: var(--vbwd-color-danger, #dc2626);
  border-color: var(--vbwd-color-danger, #dc2626);
  color: white;
}

.wp-import-stats {
  font-weight: 600;
  color: var(--vbwd-color-text, #374151);
}

.wp-import-error {
  color: var(--vbwd-color-danger, #dc2626);
}

.wp-import-summary {
  border: 1px solid var(--vbwd-color-border, #e5e7eb);
  border-radius: 0.375rem;
  padding: 0.75rem 1rem;
  background: var(--vbwd-color-surface, #f9fafb);
}

.wp-import-list-controls {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 0.75rem;
}

.wp-import-search-input {
  flex: 1;
  max-width: 320px;
}

.wp-import-per-page-label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--vbwd-color-text-muted, #9ca3af);
}

.wp-import-bulk-bar {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--vbwd-color-border, #e5e7eb);
  border-radius: 0.375rem;
  background: var(--vbwd-color-surface, #f9fafb);
}

.wp-import-row-title {
  color: var(--vbwd-color-primary, #3b82f6);
  cursor: pointer;
}

.wp-import-row-title:hover {
  text-decoration: underline;
}
</style>
