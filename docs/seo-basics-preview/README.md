# SEO basics preview

Screenshots for the search and sharing metadata change. Taken 2026-11-16.

`before-*` is the live site at https://roamingeye.org before this change. The
browser tab title is `RoamingEye`. `/robots.txt`, `/sitemap.xml`, and
`/manifest.json` each return GitHub Pages' 404.

`after-*` is the production build of this branch, previewed with Vite at the
site root (`http://127.0.0.1:4173`, base `/`). The tab tooltip shows the full
title, because Chrome shortens a long tab label. The address bar's Install
control is Chrome offering to install the app from `manifest.json`.
`robots.txt`, `sitemap.xml`, and `manifest.json` are the files the preview
serves at those root paths.

`before-og.png` and `after-og.png` are link cards drawn from the page's
`og:title`, `og:description`, and `og:image`. The social image is unchanged.
The globe UI is unchanged.
