#!/usr/bin/env bash
#
# Runs on the EC2 instance (after `git pull`) to rebuild and restart the backend.
# The GitHub Actions workflow injects MOTN_API_KEY, SITE_ADDRESS and FRONTEND_ORIGIN
# as environment variables before calling this script.
#
set -euo pipefail

# Repo root is two levels up from deploy/backend/.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"

cd "$BACKEND_DIR"

# Write the runtime environment file consumed by docker-compose.yml.
# This file is gitignored, so `git pull` will never overwrite it.
cat > .env <<EOF
MOTN_API_KEY=${MOTN_API_KEY:-}
SITE_ADDRESS=${SITE_ADDRESS:-:80}
CORS_ORIGIN=${FRONTEND_ORIGIN:-*}
EOF

# Rebuild the backend image and (re)start both services.
docker compose up -d --build

# Clean up dangling images from previous builds to save disk on the small instance.
docker image prune -f >/dev/null

echo "Backend deployed. Caddy site address: ${SITE_ADDRESS:-:80}"
