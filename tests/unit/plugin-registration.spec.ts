/**
 * S81 Slice 2 — wp-import plugin registration.
 *
 * The plugin is the first real consumer of the `dataExchangeTabs` extension
 * slot (S46.4): it contributes a permission-gated "WP Import" tab to the
 * Settings → Import/Export page and ships translations for every app locale.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { extensionRegistry } from '@/plugins/extensionRegistry';
import { wpImportAdminPlugin } from '../../index';

const APP_LOCALES = ['en', 'de', 'es', 'fr', 'ja', 'ru', 'th', 'zh'];

function createSdkStub() {
  return {
    addTranslations: vi.fn(),
    addRoute: vi.fn(),
    addComponent: vi.fn(),
    createStore: vi.fn(),
  };
}

describe('wp-import plugin registration', () => {
  beforeEach(() => {
    extensionRegistry.clear();
  });

  it('is a named IPlugin export', () => {
    expect(wpImportAdminPlugin.name).toBe('wp-import');
    expect(typeof wpImportAdminPlugin.install).toBe('function');
  });

  it('registers a cms.manage-gated WP Import data-exchange tab on install', () => {
    const sdk = createSdkStub();
    wpImportAdminPlugin.install!(sdk as never);

    const tabs = extensionRegistry.getDataExchangeTabs();
    const wpImportTab = tabs.find((tab) => tab.id === 'wp-import');
    expect(wpImportTab).toBeDefined();
    expect(wpImportTab!.label).toBe('WP Import');
    expect(wpImportTab!.requiredPermission).toBe('cms.manage');
    expect(wpImportTab!.component).toBeTruthy();
  });

  it('adds no route — the tab lives inside /admin/import-export', () => {
    const sdk = createSdkStub();
    wpImportAdminPlugin.install!(sdk as never);
    expect(sdk.addRoute).not.toHaveBeenCalled();
  });

  it('adds wpImport translations for every shipped locale', () => {
    const sdk = createSdkStub();
    wpImportAdminPlugin.install!(sdk as never);

    const registeredLocales = sdk.addTranslations.mock.calls.map(
      (call) => call[0] as string,
    );
    expect(new Set(registeredLocales)).toEqual(new Set(APP_LOCALES));
    for (const call of sdk.addTranslations.mock.calls) {
      const messages = call[1] as Record<string, unknown>;
      expect(messages.wpImport).toBeTruthy();
    }
  });

  it('re-registers on activate and unregisters on deactivate', () => {
    const sdk = createSdkStub();
    wpImportAdminPlugin.install!(sdk as never);
    wpImportAdminPlugin.deactivate!();
    expect(extensionRegistry.getDataExchangeTabs()).toHaveLength(0);

    wpImportAdminPlugin.activate!();
    expect(
      extensionRegistry.getDataExchangeTabs().map((tab) => tab.id),
    ).toEqual(['wp-import']);
  });
});
