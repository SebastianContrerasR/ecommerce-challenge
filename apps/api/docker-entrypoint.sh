#!/bin/sh
set -e
: "${DATABASE_URL:?DATABASE_URL must be set}"
: "${POSTGRES_HOST:=db}"
echo "Waiting for PostgreSQL at ${POSTGRES_HOST}..."
until pg_isready -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT:-5432}" -U "${POSTGRES_USER:-ecommerce}" >/dev/null 2>&1; do
  sleep 1
done
echo "PostgreSQL is ready, applying migrations..."
./node_modules/.bin/prisma migrate deploy
echo "Starting API..."
exec node ./dist/server.js
