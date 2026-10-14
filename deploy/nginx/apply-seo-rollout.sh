#!/usr/bin/env bash
set -Eeuo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
site_link=/etc/nginx/sites-enabled/fluide-atelier
site_config="$(readlink -f "$site_link")"
route_config=/etc/nginx/snippets/fluide-seo-routes.conf

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root (sudo bash deploy/nginx/apply-seo-rollout.sh)." >&2
  exit 1
fi
if [[ "$project_root" != /var/www/fluide-atelier ]]; then
  echo "Unexpected checkout: $project_root" >&2
  exit 1
fi
if [[ "$site_config" != /etc/nginx/sites-available/fluide-atelier || ! -f "$site_config" || ! -f "$project_root/deploy/nginx/fluide-seo-routes.conf" ]]; then
  echo "Nginx site or SEO route file is missing." >&2
  exit 1
fi
backup_dir="$(mktemp -d /etc/nginx/fluide-seo-backup.XXXXXXXX)"
cp -a "$site_config" "$backup_dir/fluide-atelier"
had_route_config=0
if [[ -e "$route_config" ]]; then
  cp -a "$route_config" "$backup_dir/fluide-seo-routes.conf"
  had_route_config=1
fi

rollback() {
  trap - ERR
  echo "SEO rollout failed. Restoring Nginx configuration from $backup_dir" >&2
  cp -a "$backup_dir/fluide-atelier" "$site_config"
  if [[ "$had_route_config" -eq 1 ]]; then
    cp -a "$backup_dir/fluide-seo-routes.conf" "$route_config"
  else
    rm -f -- "$route_config"
  fi
  nginx -t && systemctl reload nginx
}
trap rollback ERR

install -m 0644 "$project_root/deploy/nginx/fluide-seo-routes.conf" "$route_config"
python3 - "$site_config" <<'PY'
from pathlib import Path
import sys

config = Path(sys.argv[1])
content = config.read_text()
server_name = "    server_name fluide-atelier.ru www.fluide-atelier.ru;\n"
performance = "    include /etc/nginx/snippets/fluide-performance.conf;"
legacy_redirect = "return 301 https://$host$request_uri;"
assert content.count(server_name) == 2, "Unexpected main server blocks"
assert content.count(performance) == 1, "Unexpected performance include"
assert content.count(legacy_redirect) in (0, 2), "Unexpected HTTP redirects"

canonical_rules = """    # Canonical host and index before choosing a location (one redirect hop).
    if ($uri = /index.html) {
        return 301 https://fluide-atelier.ru/$is_args$args;
    }
    if ($host = www.fluide-atelier.ru) {
        return 301 https://fluide-atelier.ru$request_uri;
    }
"""
if "# Canonical host and index before choosing a location" not in content:
    content = content.replace(server_name, server_name + canonical_rules, 1)
seo_include = "    include /etc/nginx/snippets/fluide-seo-routes.conf;"
if seo_include not in content:
    content = content.replace(performance, performance + "\n" + seo_include, 1)

http_server_start = "server {\n    if ($host = www.fluide-atelier.ru) {"
if "# Canonical index for HTTP" not in content:
    assert content.count(http_server_start) == 1, "Unexpected HTTP server block"
    http_index_rule = """server {
    # Canonical index for HTTP in one redirect hop.
    if ($uri = /index.html) {
        return 301 https://fluide-atelier.ru/$is_args$args;
    }
    if ($host = www.fluide-atelier.ru) {"""
    content = content.replace(http_server_start, http_index_rule, 1)
content = content.replace(legacy_redirect, "return 301 https://fluide-atelier.ru$request_uri;")
config.write_text(content)
PY

nginx -t
systemctl restart fluide-api
systemctl is-active --quiet fluide-api
api_ready=0
for attempt in {1..30}; do
  if curl --noproxy '*' --silent --fail --max-time 2 http://127.0.0.1:3000/api/health > /dev/null; then
    api_ready=1
    break
  fi
  sleep 1
done
if [[ "$api_ready" -ne 1 ]]; then
  echo "FLUIDE API did not become ready within 30 seconds." >&2
  false
fi
systemctl reload nginx

check_status() {
  local expected="$1" path="$2" actual
  actual="$(curl --noproxy '*' --silent --show-error --max-time 15 --resolve fluide-atelier.ru:443:127.0.0.1 --output /dev/null --write-out '%{http_code}' "https://fluide-atelier.ru$path")"
  echo "$path: $actual (expected $expected)"
  [[ "$actual" == "$expected" ]]
}

check_status 200 /catalog/
check_status 200 /catalog/home/
check_status 301 '/product.html?id=025'
check_status 301 /index.html
check_status 200 /sitemap.xml
check_status 200 /api/health

trap - ERR
echo "SEO rollout succeeded. Nginx backup: $backup_dir"
