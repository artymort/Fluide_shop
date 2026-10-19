#!/usr/bin/env bash
set -Eeuo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
env_file=/etc/fluide/fluide.env
key_file=/etc/fluide/yookassa-live.key
shop_id=1499983

if [[ "$(id -u)" -ne 0 || "$project_root" != /var/www/fluide-atelier
  || ! -f "$env_file" || ! -f "$key_file" ]]; then
  echo "Run as root from /var/www/fluide-atelier with the FLUIDE environment and saved live key." >&2
  exit 1
fi

cd "$project_root"

# Read-only authorization check against the FLUIDE shop; never print the secret.
node --input-type=module -e '
  import { readFileSync } from "node:fs";
  const key = readFileSync(process.argv[1], "utf8").trim();
  if (!/^live_[A-Za-z0-9_-]{20,}$/.test(key)) throw new Error("Saved FLUIDE live key is missing or invalid");
  const authorization = Buffer.from(`${process.argv[2]}:${key}`).toString("base64");
  const response = await fetch("https://api.yookassa.ru/v3/payments?limit=1", {
    headers: { Authorization: `Basic ${authorization}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("FLUIDE YooKassa credentials were not accepted");
' "$key_file" "$shop_id"

backup_file="$(mktemp /etc/fluide/fluide.env.before-yookassa.XXXXXXXX)"
cp -p -- "$env_file" "$backup_file"

rollback() {
  trap - ERR
  cp -p -- "$backup_file" "$env_file"
  systemctl restart fluide-api || true
  echo "YooKassa rollout failed; previous FLUIDE settings restored from $backup_file" >&2
}
trap rollback ERR

# Additive migration; no existing orders, customers, or payments are deleted.
node --env-file="$env_file" server/scripts/migrate.js

set_config() {
  local name="$1" value="$2"
  if grep -q "^${name}=" "$env_file"; then
    sed -i "s|^${name}=.*$|${name}=${value}|" "$env_file"
  else
    printf '\n%s=%s\n' "$name" "$value" >> "$env_file"
  fi
}

IFS= read -r live_key < "$key_file" || [[ -n "$live_key" ]]
[[ "$live_key" =~ ^live_[A-Za-z0-9_-]{20,}$ ]]
set_config YOOKASSA_SHOP_ID "$shop_id"
set_config YOOKASSA_SECRET_KEY "$live_key"
set_config YOOKASSA_TEST_MODE false
set_config YOOKASSA_RECEIPT_UNMARKED_CONFIRMED true
set_config YOOKASSA_RETURN_URL https://fluide-atelier.ru/checkout.html?payment=return
unset live_key
chown --reference="$backup_file" "$env_file"
chmod --reference="$backup_file" "$env_file"

node --env-file="$env_file" --input-type=module -e '
  import { loadConfig } from "./server/config.js";
  const config = loadConfig().yooKassa;
  if (!config.enabled || config.testMode || config.shopId !== "1499983"
    || !config.receiptUnmarkedConfirmed || !config.secretKey.startsWith("live_")) process.exit(1);
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

trap - ERR
echo "FLUIDE YooKassa live shop $shop_id enabled. Existing data preserved. Settings backup: $backup_file"
