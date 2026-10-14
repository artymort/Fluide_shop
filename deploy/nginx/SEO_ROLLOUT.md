# SEO route rollout

The Node storefront SEO routes rely on the existing PostgreSQL catalog and do not change orders or payments.

The current production site is `/var/www/fluide-atelier`, with Nginx at
`/etc/nginx/sites-enabled/fluide-atelier` and the `fluide-api` systemd service.
The one-time rollout script is intentionally guarded for exactly this layout.

1. Confirm `git status -sb` is clean, then pull the reviewed revision with `git pull --ff-only`.
2. From `/var/www/fluide-atelier`, run `sudo bash deploy/nginx/apply-seo-rollout.sh`.
   It saves the old Nginx configuration under `/etc/nginx/fluide-seo-backup.*`,
   installs only the SEO locations, canonicalizes `www`/HTTP/`index.html`, runs
   `nginx -t`, restarts `fluide-api`, reloads Nginx and checks the key routes.
   A failed check automatically restores the previous Nginx configuration.
3. Check a real product page, cart/checkout, CMS and a test purchase flow. The
   rollout changes neither database schema nor order/payment handlers.
4. Submit the verified sitemap to Yandex Webmaster and Google Search Console;
   monitor crawl errors and sales for the next several days.

The checked-in `sitemap.xml` is a static fallback generated from repository JSON. Production must proxy `/sitemap.xml` to Node, which builds it from published PostgreSQL rows and excludes `noindex` products.
