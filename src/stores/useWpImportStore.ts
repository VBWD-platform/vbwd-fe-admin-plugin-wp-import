/**
 * wp-import store (S81 Slice 2).
 *
 * Drives the WP Import tab on Settings → Import/Export against the backend
 * `wp_import` plugin contract:
 *   GET  /admin/wp-import/stats?feed_url=…
 *   POST /admin/wp-import/run {feed_url, chunk}
 *   GET  /admin/wp-import/posts?search=&sort=&order=&page=&per_page=
 *   POST /admin/wp-import/posts/bulk/remove {ids}
 *
 * Bulk move-to-draft / assign-term reuse the existing cms admin API (D7);
 * the cms taxonomy is the single source for category/tag pickers (D5).
 * The import loop is frontend-driven in fixed chunks of 10 (D6).
 */
import { defineStore } from 'pinia';
import { api } from '@/api';

/** D6 — every run imports at most this many items; the store loops. */
export const IMPORT_CHUNK_SIZE = 10;

export interface WpImportStats {
  total_in_feed: number;
  never_imported: number;
  already_imported: number;
}

export interface WpImportRunItemResult {
  guid: string;
  title: string;
  status: 'imported' | 'error';
  cms_post_id: string | null;
  error: string | null;
  image_misses: string[];
}

interface WpImportRunResponse {
  imported_count: number;
  skipped_count: number;
  feed_exhausted: boolean;
  results: WpImportRunItemResult[];
}

export interface WpImportedPostRow {
  id: string;
  cms_post_id: string;
  title: string;
  categories: string[];
  tags: string[];
  imported_at: string;
  post_status: string;
}

interface WpImportedPostListResponse {
  items: WpImportedPostRow[];
  total: number;
  page: number;
  per_page: number;
}

export interface CmsTermOption {
  id: string;
  name: string;
}

export type WpImportSortColumn = 'title' | 'imported_at';
export type WpImportSortOrder = 'asc' | 'desc';

interface WpImportState {
  feedUrl: string;
  batchSize: number;
  stats: WpImportStats | null;
  checking: boolean;
  importing: boolean;
  runCompleted: boolean;
  importedSoFar: number;
  feedExhausted: boolean;
  runResults: WpImportRunItemResult[];
  items: WpImportedPostRow[];
  total: number;
  page: number;
  perPage: number;
  search: string;
  sortBy: WpImportSortColumn;
  sortOrder: WpImportSortOrder;
  loading: boolean;
  categories: CmsTermOption[];
  tags: CmsTermOption[];
  error: string | null;
}

/** The cms terms endpoint returns either a bare array or `{terms: […]}`. */
function unwrapTermList(response: unknown): CmsTermOption[] {
  if (Array.isArray(response)) return response as CmsTermOption[];
  const record = response as Record<string, unknown> | null;
  const list = record?.terms ?? record?.items;
  return Array.isArray(list) ? (list as CmsTermOption[]) : [];
}

export const useWpImportStore = defineStore('wp-import', {
  state: (): WpImportState => ({
    feedUrl: '',
    batchSize: IMPORT_CHUNK_SIZE,
    stats: null,
    checking: false,
    importing: false,
    runCompleted: false,
    importedSoFar: 0,
    feedExhausted: false,
    runResults: [],
    items: [],
    total: 0,
    page: 1,
    perPage: 20,
    search: '',
    sortBy: 'imported_at',
    sortOrder: 'desc',
    loading: false,
    categories: [],
    tags: [],
    error: null,
  }),

  getters: {
    errorResults: (state): WpImportRunItemResult[] =>
      state.runResults.filter((result) => result.status === 'error'),
    imageMisses: (state): string[] =>
      state.runResults.flatMap((result) => result.image_misses ?? []),
  },

  actions: {
    // ── Feed stats ───────────────────────────────────────────────────────
    async checkFeed(): Promise<void> {
      if (!this.feedUrl) return;
      this.checking = true;
      this.error = null;
      try {
        this.stats = await api.get<WpImportStats>('/admin/wp-import/stats', {
          params: { feed_url: this.feedUrl },
        });
      } catch (requestError) {
        this.error = requestError instanceof Error ? requestError.message : String(requestError);
      } finally {
        this.checking = false;
      }
    },

    // ── Chunked import loop (D6) ─────────────────────────────────────────
    async runImport(): Promise<void> {
      if (!this.feedUrl || this.importing) return;
      this.importing = true;
      this.runCompleted = false;
      this.importedSoFar = 0;
      this.feedExhausted = false;
      this.runResults = [];
      this.error = null;
      try {
        while (this.importedSoFar < this.batchSize) {
          const response = await api.post<WpImportRunResponse>('/admin/wp-import/run', {
            feed_url: this.feedUrl,
            chunk: IMPORT_CHUNK_SIZE,
          });
          this.runResults.push(...response.results);
          this.importedSoFar += response.imported_count;
          if (response.feed_exhausted) {
            this.feedExhausted = true;
            break;
          }
          // A run that neither imported nor skipped anything made no progress
          // through the feed — stop instead of looping forever.
          if (response.imported_count === 0 && response.skipped_count === 0) break;
        }
        this.runCompleted = true;
      } catch (requestError) {
        this.error = requestError instanceof Error ? requestError.message : String(requestError);
      } finally {
        this.importing = false;
      }
      await Promise.all([this.fetchImported(), this.checkFeed()]);
    },

    // ── Imported-posts list (server-side search/sort/paging) ────────────
    async fetchImported(): Promise<void> {
      this.loading = true;
      try {
        const response = await api.get<WpImportedPostListResponse>('/admin/wp-import/posts', {
          params: {
            search: this.search,
            sort: this.sortBy,
            order: this.sortOrder,
            page: this.page,
            per_page: this.perPage,
          },
        });
        this.items = response.items;
        this.total = response.total;
      } finally {
        this.loading = false;
      }
    },

    async setSort(column: WpImportSortColumn, order: WpImportSortOrder): Promise<void> {
      this.sortBy = column;
      this.sortOrder = order;
      this.page = 1;
      await this.fetchImported();
    },

    async setSearch(term: string): Promise<void> {
      this.search = term;
      this.page = 1;
      await this.fetchImported();
    },

    async setPerPage(perPage: number): Promise<void> {
      this.perPage = perPage;
      this.page = 1;
      await this.fetchImported();
    },

    async setPage(page: number): Promise<void> {
      this.page = page;
      await this.fetchImported();
    },

    // ── Term pickers (cms taxonomy is the single source, D5/D7) ─────────
    async fetchTerms(): Promise<void> {
      const [categoryResponse, tagResponse] = await Promise.all([
        api.get<unknown>('/admin/cms/terms', { params: { type: 'category' } }),
        api.get<unknown>('/admin/cms/terms', { params: { type: 'tag' } }),
      ]);
      this.categories = unwrapTermList(categoryResponse);
      this.tags = unwrapTermList(tagResponse);
    },

    // ── Bulk operations ──────────────────────────────────────────────────
    /** Owned by wp-import (D7): complete removal frees the GUIDs again (D2). */
    async bulkRemove(importRowIds: string[]): Promise<void> {
      await api.post('/admin/wp-import/posts/bulk/remove', { ids: importRowIds });
      await this.reloadAfterBulk();
    },

    async bulkMoveToDraft(cmsPostIds: string[]): Promise<void> {
      await api.post('/admin/cms/posts/bulk/status', { ids: cmsPostIds, status: 'draft' });
      await this.reloadAfterBulk();
    },

    async bulkAssignCategory(cmsPostIds: string[], termId: string): Promise<void> {
      await api.post('/admin/cms/posts/bulk/assign-term', { ids: cmsPostIds, term_id: termId });
      await this.reloadAfterBulk();
    },

    /** Reuses an existing tag when one matches (case-insensitive), else
     *  creates it through the cms terms API — never doubles a term (D5). */
    async bulkAddTag(cmsPostIds: string[], tagName: string): Promise<void> {
      const normalizedName = tagName.trim();
      if (!normalizedName) return;
      let tag = this.tags.find(
        (existingTag) => existingTag.name.toLowerCase() === normalizedName.toLowerCase(),
      );
      if (!tag) {
        tag = await api.post<CmsTermOption>('/admin/cms/terms', {
          term_type: 'tag',
          name: normalizedName,
        });
        this.tags.push(tag);
      }
      await api.post('/admin/cms/posts/bulk/assign-term', { ids: cmsPostIds, term_id: tag.id });
      await this.reloadAfterBulk();
    },

    async reloadAfterBulk(): Promise<void> {
      await this.fetchImported();
      if (this.feedUrl) await this.checkFeed();
    },
  },
});
