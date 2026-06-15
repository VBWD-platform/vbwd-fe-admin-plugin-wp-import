/**
 * S81 Slice 2 — WpImportTab.vue component behaviour.
 *
 * Stats render, sortable/searchable table driven by the store (server-side
 * params), bulk actions hit the right (cms vs wp-import) endpoints, and a
 * row click opens the normal cms post editor (entity-navigation principle).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import WpImportTab from '../../src/views/WpImportTab.vue';
import en from '../../locales/en.json';

vi.mock('@/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const routerPush = vi.hoisted(() => vi.fn());
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}));

import { api } from '@/api';

const STATS = { total_in_feed: 40, never_imported: 25, already_imported: 15 };

const ROW = {
  id: 'imp-1',
  cms_post_id: 'cms-1',
  title: 'Hello WordPress',
  categories: ['News'],
  tags: ['hot'],
  imported_at: '2026-06-11T10:00:00Z',
  post_status: 'published',
};

const LIST = { items: [ROW], total: 1, page: 1, per_page: 20 };
const EMPTY_LIST = { items: [], total: 0, page: 1, per_page: 20 };

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en },
});

function mockApiGet(listResponse: unknown = EMPTY_LIST) {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === '/admin/wp-import/stats') return Promise.resolve(STATS);
    if (url === '/admin/wp-import/posts') return Promise.resolve(listResponse);
    if (url === '/admin/cms/terms') return Promise.resolve([]);
    return Promise.resolve(EMPTY_LIST);
  });
}

async function mountTab(listResponse: unknown = EMPTY_LIST): Promise<VueWrapper> {
  mockApiGet(listResponse);
  const wrapper = mount(WpImportTab, { global: { plugins: [i18n] } });
  await flushPromises();
  return wrapper;
}

describe('WpImportTab', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('renders the import form controls with testids', async () => {
    const wrapper = await mountTab();

    expect(wrapper.find('[data-testid="wp-import-url"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="wp-import-check"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="wp-import-run"]').exists()).toBe(true);

    const batchOptions = wrapper
      .find('[data-testid="wp-import-batch-size"]')
      .findAll('option')
      .map((option) => option.text());
    expect(batchOptions).toEqual(['10', '20', '50', '100']);
  });

  it('shows the stats line after Check feed', async () => {
    const wrapper = await mountTab();

    await wrapper.find('[data-testid="wp-import-url"]').setValue('https://blog.example.com/feed/');
    await wrapper.find('[data-testid="wp-import-check"]').trigger('click');
    await flushPromises();

    const statsLine = wrapper.find('[data-testid="wp-import-stats"]');
    expect(statsLine.exists()).toBe(true);
    expect(statsLine.text()).toContain('25 never imported');
    expect(statsLine.text()).toContain('15 already imported');
  });

  it('navigates to cms-post-edit when a row title is clicked', async () => {
    const wrapper = await mountTab(LIST);

    await wrapper.find('[data-testid="wp-import-row-title"]').trigger('click');

    expect(routerPush).toHaveBeenCalledWith({
      name: 'cms-post-edit',
      params: { id: 'cms-1' },
    });
  });

  it('sorts by title when the Title header is clicked', async () => {
    const wrapper = await mountTab(LIST);
    vi.mocked(api.get).mockClear();

    const titleHeader = wrapper
      .findAll('th')
      .find((header) => header.text().includes('Title'));
    expect(titleHeader).toBeDefined();
    await titleHeader!.trigger('click');
    await flushPromises();

    expect(api.get).toHaveBeenCalledWith('/admin/wp-import/posts', {
      params: expect.objectContaining({ sort: 'title', order: 'asc', page: 1 }),
    });
  });

  it('searches server-side via the search box', async () => {
    const wrapper = await mountTab(LIST);
    vi.mocked(api.get).mockClear();

    const searchBox = wrapper.find('[data-testid="wp-import-search"]');
    await searchBox.setValue('wordpress');
    await searchBox.trigger('change');
    await flushPromises();

    expect(api.get).toHaveBeenCalledWith('/admin/wp-import/posts', {
      params: expect.objectContaining({ search: 'wordpress', page: 1 }),
    });
  });

  it('changes the page size via the per-page select', async () => {
    const wrapper = await mountTab(LIST);
    vi.mocked(api.get).mockClear();

    await wrapper.find('[data-testid="wp-import-per-page"]').setValue('50');
    await flushPromises();

    expect(api.get).toHaveBeenCalledWith('/admin/wp-import/posts', {
      params: expect.objectContaining({ per_page: 50, page: 1 }),
    });
  });

  it('bulk remove asks for confirmation, then posts import-row ids to wp-import', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.post).mockResolvedValue({ removed: 1 });
    const wrapper = await mountTab(LIST);

    await wrapper.find('[data-testid="wp-import-row-select"]').setValue(true);
    await wrapper.find('[data-testid="wp-import-bulk-remove"]').trigger('click');
    await flushPromises();

    expect(confirmSpy).toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledWith('/admin/wp-import/posts/bulk/remove', {
      ids: ['imp-1'],
    });
    confirmSpy.mockRestore();
  });

  it('bulk remove does nothing when the confirm dialog is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const wrapper = await mountTab(LIST);

    await wrapper.find('[data-testid="wp-import-row-select"]').setValue(true);
    await wrapper.find('[data-testid="wp-import-bulk-remove"]').trigger('click');
    await flushPromises();

    expect(api.post).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('bulk move-to-draft posts cms post ids to the cms bulk status endpoint', async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const wrapper = await mountTab(LIST);

    await wrapper.find('[data-testid="wp-import-row-select"]').setValue(true);
    await wrapper.find('[data-testid="wp-import-bulk-draft"]').trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith('/admin/cms/posts/bulk/status', {
      ids: ['cms-1'],
      status: 'draft',
    });
  });

  it('assign-to-category picker posts to the cms assign-term endpoint', async () => {
    vi.mocked(api.get).mockImplementation((url: string, config?: unknown) => {
      const params = (config as { params?: { type?: string } } | undefined)?.params;
      if (url === '/admin/cms/terms' && params?.type === 'category') {
        return Promise.resolve([{ id: 'cat-1', name: 'News' }]);
      }
      if (url === '/admin/cms/terms') return Promise.resolve([]);
      if (url === '/admin/wp-import/posts') return Promise.resolve(LIST);
      return Promise.resolve(STATS);
    });
    vi.mocked(api.post).mockResolvedValue({});
    const wrapper = mount(WpImportTab, { global: { plugins: [i18n] } });
    await flushPromises();

    await wrapper.find('[data-testid="wp-import-row-select"]').setValue(true);
    await wrapper.find('[data-testid="wp-import-bulk-category"]').setValue('cat-1');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith('/admin/cms/posts/bulk/assign-term', {
      ids: ['cms-1'],
      term_id: 'cat-1',
    });
  });

  it('add-tag input assigns through the cms assign-term flow', async () => {
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === '/admin/cms/terms') {
        return Promise.resolve({ id: 'tag-new', name: 'fresh' });
      }
      return Promise.resolve({});
    });
    const wrapper = await mountTab(LIST);

    await wrapper.find('[data-testid="wp-import-row-select"]').setValue(true);
    await wrapper.find('[data-testid="wp-import-bulk-tag-input"]').setValue('fresh');
    await wrapper.find('[data-testid="wp-import-bulk-tag"]').trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith('/admin/cms/terms', {
      term_type: 'tag',
      name: 'fresh',
    });
    expect(api.post).toHaveBeenCalledWith('/admin/cms/posts/bulk/assign-term', {
      ids: ['cms-1'],
      term_id: 'tag-new',
    });
  });
});
