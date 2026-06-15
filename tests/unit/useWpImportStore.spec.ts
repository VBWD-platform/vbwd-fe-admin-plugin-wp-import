/**
 * S81 Slice 2 — wp-import Pinia store.
 *
 * Backend HTTP contract (fixed, built in parallel):
 *   GET  /admin/wp-import/stats?feed_url=…
 *   POST /admin/wp-import/run {feed_url, chunk}
 *   GET  /admin/wp-import/posts?search=&sort=&order=&page=&per_page=
 *   POST /admin/wp-import/posts/bulk/remove {ids}
 * Bulk reuse (D7): cms bulk/status + bulk/assign-term, terms find-or-create
 * via the cms terms API.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import {
  useWpImportStore,
  IMPORT_CHUNK_SIZE,
} from '../../src/stores/useWpImportStore';

vi.mock('@/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { api } from '@/api';

const FEED_URL = 'https://blog.example.com/feed/?token=secret&show_on_page=10';

const EMPTY_LIST = { items: [], total: 0, page: 1, per_page: 20 };
const STATS = { total_in_feed: 40, never_imported: 25, already_imported: 15 };

function runResponse(
  importedCount: number,
  feedExhausted: boolean,
  results: unknown[] = [],
  skippedCount = 0,
) {
  return {
    imported_count: importedCount,
    skipped_count: skippedCount,
    feed_exhausted: feedExhausted,
    results,
  };
}

function importedItem(guid: string) {
  return {
    guid,
    title: `Post ${guid}`,
    status: 'imported',
    cms_post_id: `cms-${guid}`,
    error: null,
    image_misses: [],
  };
}

describe('useWpImportStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue(EMPTY_LIST);
  });

  describe('checkFeed', () => {
    it('requests stats with the feed_url param and stores the counts', async () => {
      vi.mocked(api.get).mockResolvedValue(STATS);

      const store = useWpImportStore();
      store.feedUrl = FEED_URL;
      await store.checkFeed();

      expect(api.get).toHaveBeenCalledWith('/admin/wp-import/stats', {
        params: { feed_url: FEED_URL },
      });
      expect(store.stats).toEqual(STATS);
    });
  });

  describe('runImport (D6 — chunked, frontend-driven)', () => {
    it('repeats chunk-10 runs until the selected total is reached', async () => {
      vi.mocked(api.post)
        .mockResolvedValueOnce(runResponse(10, false, [importedItem('a')]))
        .mockResolvedValueOnce(runResponse(10, false, [importedItem('b')]));

      const store = useWpImportStore();
      store.feedUrl = FEED_URL;
      store.batchSize = 20;
      await store.runImport();

      expect(api.post).toHaveBeenCalledTimes(2);
      expect(api.post).toHaveBeenNthCalledWith(1, '/admin/wp-import/run', {
        feed_url: FEED_URL,
        chunk: IMPORT_CHUNK_SIZE,
      });
      expect(api.post).toHaveBeenNthCalledWith(2, '/admin/wp-import/run', {
        feed_url: FEED_URL,
        chunk: IMPORT_CHUNK_SIZE,
      });
      expect(store.importedSoFar).toBe(20);
      expect(store.importing).toBe(false);
    });

    it('stops early when the feed is exhausted', async () => {
      vi.mocked(api.post).mockResolvedValueOnce(
        runResponse(4, true, [importedItem('a')]),
      );

      const store = useWpImportStore();
      store.feedUrl = FEED_URL;
      store.batchSize = 50;
      await store.runImport();

      expect(api.post).toHaveBeenCalledTimes(1);
      expect(store.feedExhausted).toBe(true);
      expect(store.importedSoFar).toBe(4);
    });

    it('stops on a zero-progress run instead of looping forever', async () => {
      vi.mocked(api.post).mockResolvedValue(runResponse(0, false, [], 0));

      const store = useWpImportStore();
      store.feedUrl = FEED_URL;
      store.batchSize = 10;
      await store.runImport();

      expect(api.post).toHaveBeenCalledTimes(1);
      expect(store.importing).toBe(false);
    });

    it('accumulates per-item results including errors and image misses', async () => {
      const errorItem = {
        guid: 'bad',
        title: 'Broken post',
        status: 'error',
        cms_post_id: null,
        error: 'boom',
        image_misses: [],
      };
      const missItem = {
        ...importedItem('miss'),
        image_misses: ['https://old.example.com/img.png'],
      };
      vi.mocked(api.post).mockResolvedValueOnce(
        runResponse(1, true, [errorItem, missItem], 1),
      );

      const store = useWpImportStore();
      store.feedUrl = FEED_URL;
      store.batchSize = 10;
      await store.runImport();

      expect(store.runResults).toHaveLength(2);
      expect(store.errorResults).toEqual([errorItem]);
      expect(store.imageMisses).toEqual(['https://old.example.com/img.png']);
    });

    it('reloads the imported list and the stats after the run', async () => {
      vi.mocked(api.post).mockResolvedValueOnce(
        runResponse(10, true, [importedItem('a')]),
      );
      vi.mocked(api.get).mockImplementation((url: string) =>
        Promise.resolve(url === '/admin/wp-import/stats' ? STATS : EMPTY_LIST),
      );

      const store = useWpImportStore();
      store.feedUrl = FEED_URL;
      store.batchSize = 10;
      await store.runImport();

      const requestedUrls = vi.mocked(api.get).mock.calls.map((call) => call[0]);
      expect(requestedUrls).toContain('/admin/wp-import/posts');
      expect(requestedUrls).toContain('/admin/wp-import/stats');
    });
  });

  describe('imported-posts list', () => {
    it('fetches with search/sort/order/page/per_page params', async () => {
      const store = useWpImportStore();
      store.search = 'hello';
      store.sortBy = 'title';
      store.sortOrder = 'asc';
      store.page = 3;
      store.perPage = 50;
      await store.fetchImported();

      expect(api.get).toHaveBeenCalledWith('/admin/wp-import/posts', {
        params: {
          search: 'hello',
          sort: 'title',
          order: 'asc',
          page: 3,
          per_page: 50,
        },
      });
    });

    it('stores items and total from the response', async () => {
      const row = {
        id: 'imp-1',
        cms_post_id: 'cms-1',
        title: 'Hello',
        categories: ['News'],
        tags: ['hot'],
        imported_at: '2026-06-11T10:00:00Z',
        post_status: 'published',
      };
      vi.mocked(api.get).mockResolvedValue({
        items: [row],
        total: 1,
        page: 1,
        per_page: 20,
      });

      const store = useWpImportStore();
      await store.fetchImported();

      expect(store.items).toEqual([row]);
      expect(store.total).toBe(1);
    });

    it('setSort resets to page 1 and refetches with the new sort', async () => {
      const store = useWpImportStore();
      store.page = 4;
      await store.setSort('title', 'desc');

      expect(api.get).toHaveBeenCalledWith('/admin/wp-import/posts', {
        params: expect.objectContaining({ sort: 'title', order: 'desc', page: 1 }),
      });
    });

    it('setSearch resets to page 1 and refetches with the search term', async () => {
      const store = useWpImportStore();
      store.page = 4;
      await store.setSearch('wordpress');

      expect(api.get).toHaveBeenCalledWith('/admin/wp-import/posts', {
        params: expect.objectContaining({ search: 'wordpress', page: 1 }),
      });
    });

    it('setPerPage resets to page 1; setPage fetches that page', async () => {
      const store = useWpImportStore();
      await store.setPerPage(100);
      expect(api.get).toHaveBeenLastCalledWith('/admin/wp-import/posts', {
        params: expect.objectContaining({ per_page: 100, page: 1 }),
      });

      await store.setPage(2);
      expect(api.get).toHaveBeenLastCalledWith('/admin/wp-import/posts', {
        params: expect.objectContaining({ page: 2 }),
      });
    });
  });

  describe('terms (D7 — cms taxonomy is the single source)', () => {
    it('fetches category and tag terms from the cms admin API', async () => {
      vi.mocked(api.get).mockImplementation((url: string, config?: unknown) => {
        const params = (config as { params?: { type?: string } } | undefined)
          ?.params;
        if (url === '/admin/cms/terms' && params?.type === 'category') {
          return Promise.resolve([{ id: 'cat-1', name: 'News' }]);
        }
        if (url === '/admin/cms/terms' && params?.type === 'tag') {
          return Promise.resolve({ terms: [{ id: 'tag-1', name: 'hot' }] });
        }
        return Promise.resolve(EMPTY_LIST);
      });

      const store = useWpImportStore();
      await store.fetchTerms();

      expect(store.categories).toEqual([{ id: 'cat-1', name: 'News' }]);
      expect(store.tags).toEqual([{ id: 'tag-1', name: 'hot' }]);
    });
  });

  describe('bulk operations', () => {
    it('bulkRemove posts import-row ids to the wp-import endpoint and reloads', async () => {
      vi.mocked(api.post).mockResolvedValue({ removed: 2 });

      const store = useWpImportStore();
      await store.bulkRemove(['imp-1', 'imp-2']);

      expect(api.post).toHaveBeenCalledWith(
        '/admin/wp-import/posts/bulk/remove',
        { ids: ['imp-1', 'imp-2'] },
      );
      const requestedUrls = vi.mocked(api.get).mock.calls.map((call) => call[0]);
      expect(requestedUrls).toContain('/admin/wp-import/posts');
    });

    it('bulkMoveToDraft posts cms post ids to the cms bulk status endpoint', async () => {
      vi.mocked(api.post).mockResolvedValue({});

      const store = useWpImportStore();
      await store.bulkMoveToDraft(['cms-1', 'cms-2']);

      expect(api.post).toHaveBeenCalledWith('/admin/cms/posts/bulk/status', {
        ids: ['cms-1', 'cms-2'],
        status: 'draft',
      });
    });

    it('bulkAssignCategory posts to the cms assign-term endpoint', async () => {
      vi.mocked(api.post).mockResolvedValue({});

      const store = useWpImportStore();
      await store.bulkAssignCategory(['cms-1'], 'cat-1');

      expect(api.post).toHaveBeenCalledWith(
        '/admin/cms/posts/bulk/assign-term',
        { ids: ['cms-1'], term_id: 'cat-1' },
      );
    });

    it('bulkAddTag reuses an existing tag (no term created)', async () => {
      vi.mocked(api.post).mockResolvedValue({});

      const store = useWpImportStore();
      store.tags = [{ id: 'tag-1', name: 'Hot' }];
      await store.bulkAddTag(['cms-1'], 'hot');

      expect(api.post).not.toHaveBeenCalledWith(
        '/admin/cms/terms',
        expect.anything(),
      );
      expect(api.post).toHaveBeenCalledWith(
        '/admin/cms/posts/bulk/assign-term',
        { ids: ['cms-1'], term_id: 'tag-1' },
      );
    });

    it('bulkAddTag creates a missing tag, then assigns it', async () => {
      vi.mocked(api.post).mockImplementation((url: string) => {
        if (url === '/admin/cms/terms') {
          return Promise.resolve({ id: 'tag-new', name: 'fresh' });
        }
        return Promise.resolve({});
      });

      const store = useWpImportStore();
      store.tags = [];
      await store.bulkAddTag(['cms-1'], 'fresh');

      expect(api.post).toHaveBeenCalledWith('/admin/cms/terms', {
        term_type: 'tag',
        name: 'fresh',
      });
      expect(api.post).toHaveBeenCalledWith(
        '/admin/cms/posts/bulk/assign-term',
        { ids: ['cms-1'], term_id: 'tag-new' },
      );
    });

    it('refreshes the stats after a bulk op when a feed URL is set', async () => {
      vi.mocked(api.post).mockResolvedValue({ removed: 1 });

      const store = useWpImportStore();
      store.feedUrl = FEED_URL;
      await store.bulkRemove(['imp-1']);

      expect(api.get).toHaveBeenCalledWith('/admin/wp-import/stats', {
        params: { feed_url: FEED_URL },
      });
    });
  });
});
