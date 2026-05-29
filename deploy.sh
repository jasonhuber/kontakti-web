#!/usr/bin/env bash
# Deploy Kontakti to kontakti.app on Hostinger
# Usage: ./deploy.sh [--frontend-only] [--backend-only] [--marketing-only]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

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
MARKETING_ONLY=false
for arg in "$@"; do
  case $arg in
    --frontend-only)  FRONTEND_ONLY=true ;;
    --backend-only)   BACKEND_ONLY=true ;;
    --marketing-only) MARKETING_ONLY=true ;;
  esac
done

# ── Marketing page (served via PHP to bypass LiteSpeed full-page cache) ────────
if ! $BACKEND_ONLY && ! $FRONTEND_ONLY; then
  echo "→ Deploying marketing page to root..."

  rsync -avz --delete \
    -e "$RSYNC_RSH" \
    --exclude='.DS_Store' \
    --exclude='.htaccess' \
    --exclude='index.html' \
    --exclude='app' \
    --exclude='photos' \
    --exclude='api.php' \
    "$ROOT/frontend/marketing/" \
    "$USER@$HOST:~/$REMOTE_PUBLIC/"

  # Remove stale static index.html so PHP takes precedence
  "${SSH_CMD[@]}" "$USER@$HOST" "rm -f ~/$REMOTE_PUBLIC/index.html"
fi

if $MARKETING_ONLY; then
  echo "✅ Marketing deployed. https://kontakti.app"
  exit 0
fi

# ── React SPA (built to /app subdirectory) ────────────────────────────────────
if ! $BACKEND_ONLY; then
  echo "→ Building frontend..."
  cd "$ROOT/frontend"
  npm run build

  echo "→ Deploying SPA to $REMOTE_PUBLIC/app/..."
  "${SSH_CMD[@]}" "$USER@$HOST" "mkdir -p ~/$REMOTE_PUBLIC/app"
  rsync -avz --delete \
    -e "$RSYNC_RSH" \
    --exclude='.DS_Store' \
    "$ROOT/frontend/dist/" \
    "$USER@$HOST:~/$REMOTE_PUBLIC/app/"
fi

# ── Backend ───────────────────────────────────────────────────────────────────
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

  echo "→ Running composer install + artisan (PHP 8.3)..."
  "${SSH_CMD[@]}" "$USER@$HOST" "
    cd ~/$REMOTE_BACKEND
    PHP=/opt/alt/php83/usr/bin/php
    \$PHP /usr/local/bin/composer install --no-dev --optimize-autoloader --no-interaction 2>&1 | tail -5
    \$PHP artisan config:cache
    \$PHP artisan route:cache
    \$PHP artisan view:cache
    \$PHP artisan migrate --force

    # Ensure photos directory exists and the public_html symlink is in place.
    # The marketing rsync used to wipe this symlink — that's now excluded, but
    # we re-create it every deploy as a safety net.
    mkdir -p ~/$REMOTE_BACKEND/storage/app/public/photos
    if [ ! -L ~/$REMOTE_PUBLIC/photos ]; then
      ln -sfn ~/$REMOTE_BACKEND/storage/app/public/photos ~/$REMOTE_PUBLIC/photos
      echo 'Photos symlink (re)created'
    fi

    echo 'Backend deployed'
  "
fi

# ── .htaccess (only on full or backend deploys) ───────────────────────────────
if ! $FRONTEND_ONLY && ! $MARKETING_ONLY; then
cat <<'HTACCESS' | "${SSH_CMD[@]}" "$USER@$HOST" "cat > ~/$REMOTE_PUBLIC/.htaccess"
Options -MultiViews
RewriteEngine On

# Route /api/* to Laravel via the api.php bootstrap shim
RewriteCond %{REQUEST_URI} ^/api/
RewriteRule ^api/(.*)$ api.php [L,QSA]

# SPA fallback for /app and /app/* — skip real files (JS/CSS assets), rewrite everything else
RewriteCond %{REQUEST_URI} ^/app
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^app(/.*)?$ /app/index.html [L]
HTACCESS
fi

echo ""
echo "✅ Deployed. https://kontakti.app"
