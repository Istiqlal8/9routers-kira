#!/bin/bash
# Auto-farming kontinu — generate email random → signup Merlin → simpan → ulangi.
# Pakai proxy dari proxies.txt (rotate round-robin), delay antar akun biar nggak kena rate limit.
#
# Pemakaian:
#   ./farm-continuous.sh              # jalan terus, 120s delay antar akun
#   ./farm-continuous.sh 60           # custom delay (detik)
#   ./farm-continuous.sh 30 100       # delay + max akun sebelum berhenti
#
# Env vars:
#   MERLIN_ACCOUNTS_FILE   lokasi file akun (default: ./merlin-accounts.json)
#   PM2_NAME               nama PM2 process (default: 9router)
#   RESTART_INTERVAL       restart PM2 tiap N akun (default: 5)

set -e
DIR=$(cd "$(dirname "$0")" && pwd)
AFILE="${MERLIN_ACCOUNTS_FILE:-$DIR/merlin-accounts.json}"
PROXYFILE="$DIR/proxies.txt"
LOG="$DIR/farm-$(date +%Y%m%d-%H%M%S).log"
DELAY="${1:-120}"
MAX="${2:-0}"
RESTART_EVERY="${RESTART_INTERVAL:-5}"
PM2_NAME="${PM2_NAME:-9router}"

touch "$LOG"
exec > >(tee -a "$LOG") 2>&1

echo "=========================================="
echo " merlin-auto-farm   $(date)"
echo " accounts file: $AFILE"
echo " delay: ${DELAY}s | restart tiap: $RESTART_EVERY akun"
echo " max: ${MAX:-tanpa batas} | log: $LOG"
echo "=========================================="

# Muat proxy dari file
PROXIES=()
if [ -f "$PROXYFILE" ]; then
  while IFS= read -r p || [ -n "$p" ]; do
    p=$(echo "$p" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    [ -z "$p" ] && continue
    case "$p" in \#*) continue ;; esac
    PROXIES+=("$p")
  done < "$PROXYFILE"
  echo "Proxy: ${#PROXIES[@]} loaded from $PROXYFILE"
else
  echo "WARN: proxies.txt not found — farming tanpa proxy"
fi

ADDED=0
FAIL=0
PI=0

farm_one() {
  local email pass proxy proxyarg phost
  email="$1"
  pass="$2"
  proxy=""
  proxyarg=""

  if [ "${#PROXIES[@]}" -gt 0 ]; then
    proxy="${PROXIES[$((PI % ${#PROXIES[@]}))]}"
    proxyarg="--proxy $proxy"
    PI=$((PI + 1))
  fi
  phost="${proxy:-direct}"

  printf '[%s] %s [%s] ... ' "$(date +%H:%M:%S)" "$email" "$phost"

  if OUT=$(node "$DIR/onboard.js" --signup --email "$email" --password "$pass" $proxyarg --file "$AFILE" 2>&1); then
    KEY=$(printf '%s\n' "$OUT" | sed -n 's/^KEY=//p' | tail -n1)
    echo "OK key=$KEY"
    echo "$email,$pass,$KEY,$proxy" >> "$DIR/farm-accounts.csv"
    return 0
  else
    ERR=$(echo "$OUT" | tail -3 | tr '\n' ' ')
    echo "GAGAL: $ERR"
    return 1
  fi
}

restart_pm2() {
  if command -v pm2 &>/dev/null; then
    echo "--- restart PM2 ($PM2_NAME) ---"
    pm2 restart "$PM2_NAME" >/dev/null 2>&1 || true
    sleep 3
    echo "--- PM2 restarted ---"
  fi
}

trap 'echo ""; echo "=== STOPPED: +$ADDED akun, $FAIL gagal ==="; echo "Log: $LOG"; exit 0' SIGINT SIGTERM

while true; do
  GEN=$(node "$DIR/gen-email.js" 1)
  EMAIL="${GEN%%,*}"
  PASS="${GEN##*,}"

  if farm_one "$EMAIL" "$PASS"; then
    ADDED=$((ADDED + 1))
  else
    FAIL=$((FAIL + 1))
    if [ "$FAIL" -ge 5 ]; then
      echo "FATAL: $FAIL gagal berturut-turut — hentikan"
      break
    fi
  fi

  # Restart PM2 tiap N akun supaya akun baru kebaca
  if [ $((ADDED % RESTART_EVERY)) -eq 0 ] && [ "$ADDED" -gt 0 ]; then
    restart_pm2
  fi

  # Cek max
  if [ "$MAX" -gt 0 ] && [ "$ADDED" -ge "$MAX" ]; then
    echo "MAX $MAX akun tercapai — berhenti"
    restart_pm2
    break
  fi

  echo "  → total: +$ADDED ok | $FAIL gagal | next in ${DELAY}s..."
  sleep "$DELAY"
done

echo "=== SELESAI: +$ADDED akun, $FAIL gagal ==="
echo "Log: $LOG"
echo "CSV: $DIR/farm-accounts.csv"
