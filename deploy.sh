#!/usr/bin/env bash
# Deploy Kontakti to kontakti.app on Hostinger
# Usage: ./deploy.sh [--frontend-only] [--backend-only]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$ROOT/backend/.env"
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE"; exit 1; }
set -a; source "$ENV_FILE"; set +a

SSH_KEY="${HOME}/.ssh/id_ed25519_hostinger"
HOST="88.223.85.36"
PORT="65002"
USER="u675113980"
REMOTE_PUBLIC="domains/kontakti.app/public_html"
REMOTE_BACKEND="domains/kontakti.app/backend"

SSH_CMD=(ssh -i "$SSH_KEY" -p "$PORT" -o StrictHostKeyChecking=accept-new)
RSYNC_RSH="ssh -i $SSH_KEY -p $PORT -o StrictHostKeyChecking=accept-new"

FRONTEND_ONLY=false
BACKEND_ONLY=false
for arg in "$@"; do
  case $arg in --frontend-only) FRONTEND_ONLY=true ;; --backend-only) BACKEND_ONLY=true ;; esac
done

if ! $BACKEND_ONLY; then
  echo "→ Building frontend..."
  cd "$ROOT/frontend"
  npm run build

  echo "→ Deploying frontend to $REMOTE_PUBLIC..."
  rsync -avz --delete \
    -e "$RSYNC_RSH" \
    --exclude='.DS_Store' \
    "$ROOT/frontend/dist/" \
    "$USER@$HOST:~/$REMOTE_PUBLIC/"
fi

if ! $FRONTEND_ONLY; then
  echo "→ Syncing backend files..."
  rsync -avz \
    -e "$RSYNC_RSH" \
    --exclude='.git' \
    --exclude='vendor/' \
    --exclude='.env' \
    --exclude='node_modules/' \
    --exclude='storage/logs/' \
    "$ROOT/backend/" \
    "$USER@$HOST:~/$REMOTE_BACKEND/"

  echo "→ Running composer install + artisan..."
  "${SSH_CMD[@]}" "$USER@$HOST" "
    cd ~/$REMOTE_BACKEND
    composer install --no-dev --optimize-autoloader --no-interaction 2>&1 | tail -5
    php artisan config:cache
    php artisan route:cache
    php artisan view:cache
    php artisan migrate --force
    echo 'Backend deployed'
  "
fi

echo ""
echo "✅ Deployed. https://kontakti.app"
