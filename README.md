# vbwd-fe-admin-plugin-wp-import

> VBWD fe-admin plugin: WordPress import UI

**Type:** Admin frontend plugin · **Host app:** `vbwd-fe-admin` · **Plugin:** `wp-import`

Part of the [VBWD platform](https://github.com/VBWD-platform). This repository is one
plugin in the modular VBWD SaaS marketplace platform; the core is intentionally
agnostic and gains this functionality only when the plugin is enabled.

## Install

Consumed by the **`vbwd-fe-admin`** app as a plugin package. Register it in the app's
plugin manifests (`plugins.json` / `public/plugins.json` /
`var/plugins/*-plugins.json`) and enable it via the admin plugin settings.
Frontend plugins use **named exports** (`export const wp-importPlugin`).

## Versioning & changelog

Releases are tagged (e.g. `v26.6`); see [`CHANGELOG.md`](./CHANGELOG.md).

## License

Business Source License 1.1 — see [`LICENSE`](./LICENSE). Free for commercial
use while annual VBWD-attributable sales stay below the value of 6.7 BTC for the
reporting year; above that, a commercial license is required.
