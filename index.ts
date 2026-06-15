/**
 * wp-import Admin Plugin (S81 Slice 2)
 *
 * Imports an existing WordPress blog into the CMS from its RSS feed.
 * First real consumer of the `dataExchangeTabs` extension slot (S46.4):
 * contributes a cms.manage-gated "WP Import" tab to the Settings →
 * Import/Export page (D8 — no new permission, no new route). Bulk
 * operations reuse the cms admin API; only "remove selected imported"
 * is owned by the backend `wp_import` plugin (D7).
 */
import type { IPlugin, IPlatformSDK } from 'vbwd-view-component';
import { extensionRegistry } from '../../vue/src/plugins/extensionRegistry';
import type { DataExchangeTabExtension } from '../../vue/src/plugins/extensionRegistry';
import WpImportTab from './src/views/WpImportTab.vue';
import en from './locales/en.json';
import de from './locales/de.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import ja from './locales/ja.json';
import ru from './locales/ru.json';
import th from './locales/th.json';
import zh from './locales/zh.json';

const DATA_EXCHANGE_TABS: DataExchangeTabExtension[] = [
  {
    id: 'wp-import',
    label: 'WP Import',
    component: WpImportTab,
    requiredPermission: 'cms.manage',
  },
];

function addTranslations(sdk: IPlatformSDK): void {
  const bundles: Record<string, Record<string, unknown>> = {
    en: en as Record<string, unknown>,
    de: de as Record<string, unknown>,
    es: es as Record<string, unknown>,
    fr: fr as Record<string, unknown>,
    ja: ja as Record<string, unknown>,
    ru: ru as Record<string, unknown>,
    th: th as Record<string, unknown>,
    zh: zh as Record<string, unknown>,
  };
  for (const [locale, bundle] of Object.entries(bundles)) {
    sdk.addTranslations(locale, { wpImport: bundle.wpImport });
  }
}

export const wpImportAdminPlugin: IPlugin = {
  name: 'wp-import',
  version: '1.0.0',
  description: 'Import WordPress posts from an RSS feed into the CMS.',

  install(sdk: IPlatformSDK) {
    addTranslations(sdk);
    extensionRegistry.register('wp-import', { dataExchangeTabs: DATA_EXCHANGE_TABS });
  },

  activate() {
    extensionRegistry.register('wp-import', { dataExchangeTabs: DATA_EXCHANGE_TABS });
  },

  deactivate() {
    extensionRegistry.unregister('wp-import');
  },
};

export default wpImportAdminPlugin;
