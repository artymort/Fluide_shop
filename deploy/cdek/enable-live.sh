#!/usr/bin/env bash
set -Eeuo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
env_file=/etc/fluide/fluide.env

if [[ "$(id -u)" -ne 0 || "$project_root" != /var/www/fluide-atelier || ! -f "$env_file" ]]; then
  echo "Run as root in /var/www/fluide-atelier with /etc/fluide/fluide.env present." >&2
  exit 1
fi

backup_file="$(mktemp /etc/fluide/fluide.env.before-cdek.XXXXXXXX)"
cp -p -- "$env_file" "$backup_file"

rollback() {
  trap - ERR
  cp -p -- "$backup_file" "$env_file"
  systemctl restart fluide-api || true
  echo "CDEK rollout failed; protected environment restored from $backup_file" >&2
}
trap rollback ERR

set_config() {
  local name="$1" value="$2"
  if grep -q "^${name}=" "$env_file"; then
    sed -i "s|^${name}=.*$|${name}=${value}|" "$env_file"
  else
    printf '\n%s=%s\n' "$name" "$value" >> "$env_file"
  fi
}

set_config CDEK_API_BASE https://api.cdek.ru/v2
set_config CDEK_SHIPMENT_POINT VLD10
set_config CDEK_ORDER_PREFIX FLUIDE-
set_config CDEK_TARIFF_CODE 136
set_config CDEK_CREATE_ORDERS true
chown --reference="$backup_file" "$env_file"
chmod --reference="$backup_file" "$env_file"

cd "$project_root"
node --env-file="$env_file" --input-type=module -e \
  'import { loadConfig } from "./server/config.js"; const c=loadConfig(); if (!c.cdek.enabled || !c.cdek.createOrders || c.cdek.shipmentPoint!=="VLD10") process.exit(1)'
node --env-file="$env_file" server/scripts/migrate.js
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
  echo "FLUIDE API did not become ready." >&2
  false
fi

# A live read-only tariff calculation proves credentials, tariff and VLD10 work.
curl --noproxy '*' --silent --show-error --fail --max-time 20 \
  --resolve fluide-atelier.ru:443:127.0.0.1 \
  -H 'Content-Type: application/json' \
  --data '{"mode":"pvz","city":"Москва","cityCode":44}' \
  https://fluide-atelier.ru/api/delivery/cdek/quote > /dev/null

trap - ERR
echo "CDEK live shipment registration enabled. Environment backup: $backup_file"
