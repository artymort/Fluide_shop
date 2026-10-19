#!/usr/bin/env bash
set -Eeuo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
env_file=/etc/fluide/fluide.env

if [[ "$(id -u)" -ne 0 || "$project_root" != /var/www/fluide-atelier || ! -f "$env_file" ]]; then
  echo "Run as root in /var/www/fluide-atelier with /etc/fluide/fluide.env present." >&2
  exit 1
fi

cd "$project_root"
# Only read existing credentials and account shipping points. No parcel is created here.
shipping_point="$(node --env-file="$env_file" --input-type=module -e '
  import { loadConfig } from "./server/config.js";
  import { createRussianPostClient } from "./server/delivery/russian-post.js";
  const config = loadConfig().russianPost;
  if (!config.enabled) throw new Error("Russian Post credentials are missing");
  const client = createRussianPostClient(config);
  const points = await client.shippingPoints();
  const selected = config.fromIndex
    ? points.find((point) => point["operator-postcode"] === config.fromIndex)
    : (points.length === 1 ? points[0] : null);
  if (!selected) throw new Error(`Set RUSSIAN_POST_FROM_INDEX to an enabled point. Available: ${points.map((point) => point["operator-postcode"]).join(", ")}`);
  await client.quote("460044");
  process.stdout.write(selected["operator-postcode"]);
')"

backup_file="$(mktemp /etc/fluide/fluide.env.before-russian-post.XXXXXXXX)"
cp -p -- "$env_file" "$backup_file"

rollback() {
  trap - ERR
  cp -p -- "$backup_file" "$env_file"
  systemctl restart fluide-api || true
  echo "Russian Post rollout failed; protected environment restored from $backup_file" >&2
}
trap rollback ERR

# The migration only adds a shipment status table; existing order/payment rows are untouched.
node --env-file="$env_file" server/scripts/migrate.js

set_config() {
  local name="$1" value="$2"
  if grep -q "^${name}=" "$env_file"; then
    sed -i "s|^${name}=.*$|${name}=${value}|" "$env_file"
  else
    printf '\n%s=%s\n' "$name" "$value" >> "$env_file"
  fi
}

set_config RUSSIAN_POST_FROM_INDEX "$shipping_point"
set_config RUSSIAN_POST_ORDER_PREFIX FLUIDE-
set_config RUSSIAN_POST_CONTENTS_APPROVED true
set_config RUSSIAN_POST_CREATE_ORDERS true
chown --reference="$backup_file" "$env_file"
chmod --reference="$backup_file" "$env_file"

node --env-file="$env_file" --input-type=module -e '
  import { loadConfig } from "./server/config.js";
  const config = loadConfig().russianPost;
  if (!config.enabled || !config.createOrders || !config.contentsApproved || !config.fromIndex) process.exit(1);
'

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

curl --noproxy '*' --silent --show-error --fail --max-time 20 \
  -H 'Content-Type: application/json' \
  --data '{"postalCode":"460044","city":"Оренбург"}' \
  http://127.0.0.1:3000/api/delivery/russian-post/quote > /dev/null

trap - ERR
echo "Russian Post live registration enabled for existing FLUIDE service and point $shipping_point. Environment backup: $backup_file"
