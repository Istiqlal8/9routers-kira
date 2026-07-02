#!/bin/bash
# Tambah akun Merlin ke 9router (native mode — tanpa shim/Docker).
# Akun disimpan ke JSON file (merlin-accounts.json), lalu PM2 direstart.
#
# Pemakaian:
#   ./add-account-native.sh signup  <email> <password> [proxy_url]
#   ./add-account-native.sh login   <email> <password> [proxy_url]
#   ./add-account-native.sh refresh <refresh_token> [proxy_url]
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
AFILE="${MERLIN_ACCOUNTS_FILE:-$DIR/merlin-accounts.json}"
PM2_NAME="${PM2_NAME:-9router}"

MODE="$1"
case "$MODE" in
  signup)  ARGS="--signup --email $2 --password $3" ;;
  login)   ARGS="--email $2 --password $3" ;;
  refresh) ARGS="--refresh $2" ;;
  *) echo "Pemakaian: ./add-account-native.sh [signup|login|refresh] <cred> [proxy_url]"; exit 1 ;;
esac

PROXY_URL="${4:-}"
PROXY_ARG=""
if [ -n "$PROXY_URL" ]; then
  PROXY_ARG="--proxy $PROXY_URL"
fi

echo "=== Merlin onboard (native 9router) ==="
echo "Mode: $MODE | File: $AFILE | Proxy: ${PROXY_URL:-direct}"
echo ""

echo "[1/3] Onboard akun + test thread..."
OUT=$(node "$DIR/onboard.js" $ARGS $PROXY_ARG --test --file "$AFILE" 2>&1)
if ! printf '%s\n' "$OUT" | grep -q 'KEY='; then
  echo "GAGAL onboard:"
  echo "$OUT" | tail -10
  exit 1
fi
KEY=$(printf '%s\n' "$OUT" | sed -n 's/^KEY=//p' | tail -n1)
COUNT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$AFILE','utf8')).length)")
echo "OK — key=$KEY | total akun: $COUNT"

echo ""
echo "[2/3] Restart 9router (PM2)..."
if command -v pm2 &>/dev/null; then
  pm2 restart "$PM2_NAME"
  echo "OK — PM2 restarted"
else
  echo "SKIP — pm2 not found (restart manually)"
fi

echo ""
echo "[3/3] Verifikasi..."
sleep 3
echo "✅ Done. Accounts file: $AFILE ($COUNT akun)"
echo ""
echo "Test: curl https://9router.rumahberkarya.com/v1/chat/completions \\"
echo "  -H 'Authorization: Bearer <API_KEY>' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"model\":\"merlin/gpt-4o-mini\",\"messages\":[{\"role\":\"user\",\"content\":\"halo\"}]}'"
