#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

copy_env() {
  local source_file=$1
  local target_file=$2
  if [[ -f "$target_file" ]]; then
    return
  fi
  if [[ -f "$source_file" ]]; then
    cp "$source_file" "$target_file"
    echo "Created $(realpath --relative-to="$ROOT_DIR" "$target_file") from example"
  fi
}

copy_env "$ROOT_DIR/packages/server/.env.example" "$ROOT_DIR/packages/server/.env"
copy_env "$ROOT_DIR/packages/sdk/.env.example" "$ROOT_DIR/packages/sdk/.env"
copy_env "$ROOT_DIR/packages/dashboard/.env.example" "$ROOT_DIR/packages/dashboard/.env"

if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
  else
    COMPOSE_CMD=(docker-compose)
  fi
  "${COMPOSE_CMD[@]}" up -d postgres redis
else
  echo "Docker is required to start Postgres and Redis." >&2
  exit 1
fi

echo "Waiting for Postgres to become ready..."
ATTEMPTS=30
until "${COMPOSE_CMD[@]}" exec -T postgres pg_isready -U agentpay -d agentpay -h localhost -p 5432 >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS - 1))
  if [[ $ATTEMPTS -le 0 ]]; then
    echo "Postgres did not become ready in time." >&2
    exit 1
  fi
  sleep 1
done

echo "Applying database migrations..."
pnpm --dir="$ROOT_DIR/packages/server" prisma migrate deploy --schema "$ROOT_DIR/packages/server/prisma/schema.prisma"

echo "Generating Prisma client..."
pnpm --dir="$ROOT_DIR/packages/server" prisma generate

echo "Seeding development data..."
pnpm --dir="$ROOT_DIR/packages/server" prisma db seed

echo "Bootstrap complete. API key details are logged during seeding if generated."
