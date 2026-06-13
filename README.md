# WordPress ZIP Doctor

WordPress ZIP Doctor is a browser-local inspector for WordPress theme and plugin ZIPs. It helps you catch installability problems before you upload the archive.

- Drop a plugin or theme ZIP in your browser.
- Check the archive structure against WordPress install expectations.
- See why the file fails before you open WordPress admin.
- Download the exact ZIP to upload when the checks pass.
- Scope stays narrow: ZIP installability only, with no WordPress login, PHP execution, malware scan, demo import, or hosting fixes.

## Try it

Open `index.html` in a browser, or use the hosted version on KikuAI:

https://kikuai.dev/tools/wordpress-zip-doctor/

## What it checks

- Theme ZIPs: `style.css`, `Theme Name`, and the required parent-theme entry point (`index.php`, `templates/index.html`, or `block-templates/index.html`). Child themes may pass with a `Template` header.
- Plugin ZIPs: a root-level PHP file with a valid `Plugin Name` header.
- Vendor bundles: one nested installable ZIP or one repackable package folder.
- Source archives: common GitHub/source-package shapes that are not ready for WordPress upload.
- Safety: browser-local caps for entry count, declared extracted size, nested ZIP depth, unsafe paths, encryption, and compression ratio.

## What it does not do

- It does not ask for WordPress credentials.
- It does not upload your ZIP to a server.
- It does not execute PHP.
- It does not validate licenses.
- It does not scan for malware.
- It does not fix hosting, permissions, upload limits, demos, or database errors.

## Development

```bash
npm test
npm run smoke
```
