# Adding a plugin

Add an entry from [`plugin-template.json`](plugin-template.json) to
`catalog/registry.json`'s `plugins` array. Keep the `id` unique and kebab-case,
and include a nonempty name, description, one or more supported `types`, status,
source, and compatibility for both `github_copilot` and `claude`.

Use statuses conservatively:

- `draft`: planned or incomplete; use `source: null` and mark unconfirmed
  provider compatibility as `unverified`.
- `unverified`: an entry whose identity or implementation has not been verified;
  keep `source: null` until it is safe to browse.
- `verified`: reviewed plugin with a local source directory relative to
  `catalog/`. Verify its license, setup, permissions, and provider behavior.

Compatibility values are `native`, `adapted`, `unsupported`, and `unverified`.
Only claim `native` or `adapted` after testing; document any required adaptation
in the plugin's guide. Provider filters only show native/adapted entries.

Add a bundle by listing the entry's ID in a bundle's `pluginIds`. Bundle IDs must
be unique and every referenced plugin must exist. Bundles are collections, not
installers.

Run `npm run validate:plugins` before submitting. Verified local Copilot plugins
must also be added to `.github/plugin/marketplace.json` and pass the existing
marketplace/source validation.
