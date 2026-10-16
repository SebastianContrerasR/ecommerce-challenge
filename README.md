# Ecommerce Challenge

A maintainable, production-minded e-commerce application: product catalog with search and management, all-or-nothing CSV product import, and purchases with a fake payment provider, atomic inventory updates, and persistent idempotency keys. The backend is a modular Fastify monolith, the frontend is a React single-page storefront, and PostgreSQL is the system of record. No mock data or hardcoded products are used in the normal application workflow.

## Table of contents

1. [Project overview and features](#1-project-overview-and-features)
2. [Architecture](#2-architecture)
3. [Monorepo structure](#3-monorepo-structure)
4. [Technology choices](#4-technology-choices)
5. [Alternatives considered](#5-alternatives-considered)
6. [Database schema and migrations](#6-database-schema-and-migrations)
7. [API endpoints and OpenAPI documentation](#7-api-endpoints-and-openapi-documentation)
8. [CSV import](#8-csv-product-import)
9. [Purchase flow, fake payments, and idempotency](#9-purchase-flow-fake-payments-and-idempotency)
10. [Configuration](#10-configuration)
11. [Prerequisites and local development](#11-prerequisites-and-local-development)
12. [Running with Docker Compose](#12-running-with-docker-compose)
13. [Database initialization and demo data](#13-database-initialization-and-demo-data)
14. [Tests](#14-tests)
15. [Formatting, linting, type checking, and builds](#15-formatting-linting-type-checking-and-builds)
16. [Continuous integration](#16-continuous-integration)
17. [Security assumptions and non-goals](#17-security-assumptions-and-non-goals)
18. [Known limitations and future work](#18-known-limitations-and-future-work)

## 1. Project overview and features

- **Product catalog**: create, read, update, and archive products; case-insensitive search across name, SKU, description, and category; category filter; multi-field sorting; bounded pagination; archived and out-of-stock badges.
- **CSV product import**: multipart upload with strict parsing (BOM, CRLF, quoted delimiters, escaped quotes, embedded newlines), per-row structured errors, and all-or-nothing persistence. Existing SKUs are never overwritten.
- **Purchasing and orders**: cart with live stock revalidation, server-computed totals, fake payment with distinct success/decline handling, atomic inventory decrement guarded by the database, full rollback on any failure, and durable order detail pages.
- **Idempotency**: the `Idempotency-Key` request header makes order creation safe to retry; identical requests replay the stored response, differing requests are rejected, and concurrent duplicates collapse to a single order.
- **Storefront**: catalog, product detail, create/edit forms with field-level errors, import page with error list and retry, cart, checkout with preserved idempotency keys, and order confirmation — all reachable through semantic, keyboard-navigable UI with loading, empty, and error states.

## 2. Architecture

```mermaid
flowchart LR
    User([Browser]) -->|":5173"| Web["web container\nnginx + React SPA"]
    User -->|":3000"| API["api container\nFastify modular monolith"]
    Web -->|"VITE_API_URL<br/>(browser-reachable)"| API
    API -->|"Prisma + @prisma/adapter-pg<br/>TCP :5432"| DB[("PostgreSQL 16\npersistent volume")]
    Contracts["packages/api-contracts<br/>TypeBox schemas + types"] -. "single source of truth" .-> API
    Contracts -. "single source of truth" .-> Web
    API -->|"migrate deploy on boot<br/>after pg_isready"| DB
```

Request flow: browser -> `VITE_API_URL` -> Fastify validation -> thin handler -> service module (injected `PrismaClient`, pure helpers for SKU handling, listing, purchasability, and money math) -> PostgreSQL. CSV import flow: multipart upload -> pure parse and row validation with `csv-parse` (no database access) -> single bulk SKU existence lookup -> one transactional `createMany`, or no writes at all. Storefront flow: TanStack Query for server state (`products`, `product`, `order` keys), a `localStorage`-persisted cart kept strictly separate, and checkout `POST /api/orders` with a caller-generated idempotency key. Liveness never touches the database; readiness runs `SELECT 1`.

The backend is one Fastify deployable with internal domain modules (`products`, `import`, `orders`, `payments`). No brokers, queues, or extra microservices: nothing in the requirements needs independent scaling or asynchronous processing at the documented sync limits.

## 3. Monorepo structure

```text
.
├── apps/
│   ├── api/                    # Fastify modular monolith (TypeScript, strict)
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── prisma.config.ts
│   │   │   └── migrations/     # versioned migrations + migration_lock.toml
│   │   └── src/
│   │       ├── app.ts          # plugin + route registration
│   │       ├── server.ts       # listen + SIGTERM/SIGINT shutdown
│   │       ├── config.ts       # env validation (DATABASE_URL required)
│   │       ├── db/client.ts    # Prisma singleton (pg adapter)
│   │       ├── plugins/        # errors, openapi
│   │       ├── routes/         # /live, /ready, /health
│   │       ├── modules/products/
│   │       ├── modules/import/
│   │       ├── modules/orders/
│   │       └── modules/payments/  # PaymentProvider + FakePaymentProvider
│   └── web/                    # React 19 + Vite 8 SPA (TypeScript, strict)
│       └── src/
│           ├── api/            # typed fetch clients (products, orders, import)
│           ├── cart/           # localStorage cart state (pure helpers + context)
│           ├── pages/          # Catalog, ProductDetail, ProductForm, Import,
│           │                   # Cart, OrderDetail (+ colocated component tests)
│           ├── format.ts       # display-only money/weight formatting
│           └── routes.tsx      # /, /products/new, /products/:id,
│                               # /products/:id/edit, /import, /cart, /orders/:id
├── packages/
│   ├── api-contracts/          # TypeBox schemas + inferred types only
│   └── tsconfig/               # shared strict base config
├── e2e/                        # Playwright critical-flow specs (chromium)
├── docs/example.csv            # large mixed-validity CSV used by tests
├── docker-compose.yml          # db + api + web, healthchecks, named volume
└── .github/workflows/ci.yml    # lint, typecheck, unit, integration, build, e2e
```

## 4. Technology choices

| Choice                                                                                                                 | Why                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm workspaces                                                                                                        | One lockfile, isolated dependency trees, `workspace:*` links keep contracts in sync without publishing.                                                                                                                                                 |
| TypeScript strict everywhere (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, no `any` in hand-written code) | Contracts, services, and UI share exact types; mismatches fail at build time instead of at runtime.                                                                                                                                                     |
| Fastify + TypeBox (`@fastify/type-provider-typebox`)                                                                   | One schema validates input, types the handler, and generates OpenAPI — no parallel Zod/JSON-schema definitions to drift.                                                                                                                                |
| Prisma 7 + `@prisma/adapter-pg` + PostgreSQL 16                                                                        | Versioned migrations, typed client, and real database constraints (`UNIQUE`, `CHECK`, `RESTRICT`) as the final authority under concurrency. Raw SQL is used only where Prisma cannot express the operation (conditional stock decrement).               |
| `csv-parse` in strict mode                                                                                             | Battle-tested CSV grammar (BOM, CRLF, quoted delimiters, escaped quotes, embedded newlines) instead of hand-rolled splitting, which cannot handle those cases.                                                                                          |
| `BigInt` integer-cent arithmetic                                                                                       | Exact monetary math without floating point and without adding a decimal library for a two-decimal currency.                                                                                                                                             |
| TanStack Query 5                                                                                                       | Server state (fetch, cache, invalidate, retry) without hand-rolled fetching logic; the cart stays in a separate `localStorage`-backed context so client state never masquerades as server state.                                                        |
| React Router 7, Tailwind CSS 4 (Vite plugin)                                                                           | Declarative routes for the seven storefront pages; utility styling without a component-framework dependency.                                                                                                                                            |
| Vitest + Testing Library + jsdom; Playwright (chromium)                                                                | Fast unit tests for pure logic, real-PostgreSQL integration tests for transactions and concurrency, and browser tests for the critical flows (create → search, import → search, purchase → confirmation, insufficient stock, validation, import retry). |
| Docker Compose (`postgres:16-alpine`, `node:22-alpine`, `nginx:1.27-alpine`)                                           | The whole system — database with health-gated migrations, API, and static frontend — starts reproducibly from one command.                                                                                                                              |
| GitHub Actions                                                                                                         | Every push/PR runs lint, typecheck, unit, integration (real Postgres service), build, and e2e against the composed stack.                                                                                                                               |

## 5. Alternatives considered

- **Microservices / message broker / background workers**: rejected. One deployable with internal modules covers the required load; the CSV flow documents explicit sync limits (5 MiB / 10,000 records) and a concrete async follow-up instead of speculative infrastructure.
- **Drizzle / Knex / raw SQL instead of Prisma**: rejected. Prisma migrations give reviewable, versioned schema evolution and the generated client keeps queries typed; raw SQL is still available for the one conditional update Prisma cannot express.
- **Zod instead of TypeBox**: rejected. TypeBox schemas feed Fastify validation _and_ OpenAPI generation from a single definition; a second validation library would duplicate every contract.
- **Redux/Zustand instead of TanStack Query**: rejected. Almost all client state is server state with TTL semantics (lists, details, import result); TanStack Query covers fetching, caching, and invalidation with less code, while the genuinely local cart lives in a tiny context.
- **Server-side cart**: rejected. The challenge needs a purchase flow, not persistent carts across devices; a `localStorage` cart keeps the server stateless while the server revalidates everything at checkout.
- **Stripe test mode instead of a fake provider**: rejected. No credentials, no network, and no external test-mode behavior may be baked into an offline-runnable submission; the `PaymentProvider` interface keeps the seam open for a real gateway later.
- **tRPC/GraphQL instead of REST + OpenAPI**: rejected. Plain REST with generated OpenAPI is the most broadly reviewable contract and needs no extra client tooling.

## 6. Database schema and migrations

Tables (PostgreSQL 16, UUID primary keys, `NUMERIC(12,2)` money, `NUMERIC(10,3)` weights):

- **`products`** — `name`, unique `sku` (stored trimmed + uppercased), `description`, `category`, `price`, `stock`, `weight_kg`, `created_at`, `updated_at`, nullable `archived_at`. `CHECK`s enforce nonnegative price/stock/weight and field-length bounds; `UNIQUE(sku)` is the duplicate-SKU backstop; indexes on `archived_at`, `category`, `created_at`.
- **`orders`** — `status` (`PAID`), `payment_status` (`SUCCEEDED`) and `payment_reference` (`UNIQUE`), `total`, `created_at`; `CHECK(total >= 0)` plus status allow-lists.
- **`order_items`** — snapshot of `product_sku`, `product_name`, `unit_price`, `quantity`, `line_total` per line; `order_id CASCADE`, `product_id RESTRICT` (products with orders cannot be hard-deleted); `CHECK(quantity > 0)`, nonnegative money.
- **`idempotency_keys`** — `key` primary key, `requestHash` (SHA-256 of the normalized request), `responseStatus`, `responseBody` (`JSONB`), `created_at` (+ index); `CHECK` constrains status to 200–599.

Migrations in `apps/api/prisma/migrations/` (`20251016000000_init` enables `pgcrypto`; `..._products`; `..._orders`) plus `migration_lock.toml`. Strategy: never `db push`; the API entrypoint waits for `pg_isready`, then runs `prisma migrate deploy` before starting; CI applies the same migrations against a real Postgres service.

## 7. API endpoints and OpenAPI documentation

Base URL `http://localhost:3000`. Interactive docs: Swagger UI at `/docs`, raw spec at `/openapi.json`. Every response carries an `x-request-id` header.

| Method & path               | Purpose                                                                                                            | Success                         | Notable errors                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `GET /live`, `GET /health`  | Liveness (no DB touch)                                                                                             | `200`                           | —                                                                                                                          |
| `GET /ready`                | Readiness (`SELECT 1`)                                                                                             | `200` / `503`                   | —                                                                                                                          |
| `GET /api/products`         | Search, filter (`q`, `category`), sort allowlist, bounded pagination (`page`, `pageSize` ≤ 100), `includeArchived` | `200` + `pagination`            | `400 INVALID_SORT/INVALID_PAGINATION/INVALID_QUERY`                                                                        |
| `GET /api/products/:id`     | Product detail (includes archived)                                                                                 | `200` / `404 PRODUCT_NOT_FOUND` | `400` malformed id                                                                                                         |
| `POST /api/products`        | Create (server generates id/timestamps; unknown fields rejected)                                                   | `201`                           | `400 VALIDATION_ERROR`, `409 SKU_EXISTS`                                                                                   |
| `PATCH /api/products/:id`   | Partial update (archived products rejected)                                                                        | `200`                           | `400`, `404`, `409 SKU_EXISTS/PRODUCT_ARCHIVED`                                                                            |
| `DELETE /api/products/:id`  | Archive (never hard-deletes)                                                                                       | `200` with `archivedAt`         | `404`, `409 PRODUCT_ARCHIVED`                                                                                              |
| `POST /api/products/import` | Multipart CSV upload, field `file`                                                                                 | `201` summary                   | `400 IMPORT_MISSING_FILE`, `413 FILE_TOO_LARGE`, `409 IMPORT_CONFLICT`, `422` summary                                      |
| `POST /api/orders`          | Checkout, requires `Idempotency-Key` header                                                                        | `201` order                     | `400`, `402 PAYMENT_DECLINED`, `404 PRODUCT_NOT_FOUND`, `409 INSUFFICIENT_STOCK/PRODUCT_ARCHIVED/IDEMPOTENCY_KEY_CONFLICT` |
| `GET /api/orders/:id`       | Order with snapshotted items                                                                                       | `200` / `404 ORDER_NOT_FOUND`   | `400` malformed id                                                                                                         |

All failures use the envelope `{ error: { code, message, details? } }` except CSV validation failures, which return the import summary shape so the UI can render per-record errors.

## 8. CSV product import

Fixture: `apps/api/test/fixtures/csv/challenge-example.csv`, containing exactly the supplied example:

```csv
name,sku,description,category,price,stock,weight_kg
Running Shoes,RS-001,Lightweight running shoes for daily training,Footwear,89.99,150,0.35
```

Example CSV provenance: The example record was provided inline in the challenge description and reproduced in the project's test fixtures on 2026-10-16. No external downloadable CSV asset was available in the supplied materials, so no download date is claimed. If an original downloadable asset becomes available, replace this note with its actual download date and source.

Validation rules: UTF-8 with optional BOM; LF and CRLF endings; quoted commas, escaped double quotes, and quoted multiline fields; header names trimmed and case-insensitive with order-independent columns; every expected column required exactly once (missing/duplicate/unexpected headers are row-`0` errors); entirely blank records ignored; field boundaries trimmed while descriptions keep interior spaces and newlines; empty descriptions allowed; SKU normalized exactly as in product creation; numerics validated with strict patterns (never `parseFloat`); money never touches binary floating point. `record` numbers are data-record ordinals excluding the header, not physical line numbers.

Duplicates and atomicity: duplicate normalized SKUs within the file are reported (`DUPLICATE_SKU_IN_FILE`); a single bulk lookup detects SKUs already stored (`SKU_EXISTS`); everything is validated before any write, then committed in one transaction, so any failure leaves zero rows. Uniqueness is rechecked inside the write with the database constraint as final authority. Limits: 5 MiB per file and 10,000 data records. The fixture above is exercised by a unit test (exact parsed row), an integration test (201 summary plus persisted product read-back), and an end-to-end test (real file upload through the browser, tolerant of reruns: a repeat upload deterministically reports the `SKU_EXISTS` row error instead of duplicating).

## 9. Purchase flow, fake payments, and idempotency

Exact workflow, in order: validate input; normalize lines (sort by product id, merge duplicates by summing quantities) and hash the canonical form with SHA-256; replay or conflict on the persistent idempotency record; load products and re-verify purchasability; compute every line total and the order total from database prices with integer-cent `BigInt` arithmetic, so totals are exact and no rounding policy is needed; run the fake payment decision outside any transaction; then commit one database transaction containing all conditional stock decrements (`UPDATE products SET stock = stock - qty WHERE id AND stock >= qty`), the order and item rows, and the idempotency record — or roll everything back. A stock shortfall voids the fake charge and returns `409 INSUFFICIENT_STOCK` with no order and no inventory change.

The fake provider (`PaymentProvider` interface with injectable `FakePaymentProvider`) is a local deterministic simulation: `succeed` mints `fake_pay_N` references, `decline` fails closed, and every charge and void is recorded for tests. No network calls happen inside transactions. This is not how a real gateway behaves: replacing the fake would require external authorization and capture, timeouts, webhook reconciliation, and compensation flows, because a database transaction cannot commit an external payment. Only completed attempts are stored for idempotency (`201` orders and `402` declines replay byte-identically); validation failures such as missing products or insufficient stock are never stored, so the same key stays safely retryable after fixing the cause. Concurrent requests sharing one key cannot duplicate orders: the loser's transaction hits the unique key constraint, voids its charge, and replays the winner.

```sh
curl -X POST http://localhost:3000/api/orders \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 11111111-1111-1111-1111-111111111111' \
  -d '{"items":[{"productId":"<uuid>","quantity":2}]}'
```

## 10. Configuration

| Variable                                              | Used by            | Default                                                                                    | Purpose                                                       |
| ----------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `DATABASE_URL`                                        | api, local tooling | _required_ (`postgresql://ecommerce:ecommerce@localhost:5432/ecommerce` in `.env.example`) | PostgreSQL connection string                                  |
| `PORT` / `HOST`                                       | api                | `3000` / `0.0.0.0`                                                                         | API listen address                                            |
| `LOG_LEVEL`                                           | api                | `info`                                                                                     | Pino log level                                                |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | compose db + api   | `ecommerce`                                                                                | Local database credentials                                    |
| `POSTGRES_HOST_PORT`                                  | compose            | `5432`                                                                                     | Host port mapped to Postgres (set `5433` if occupied)         |
| `VITE_API_URL`                                        | web build arg      | `http://localhost:3000`                                                                    | Browser-reachable API base URL (never a Compose service name) |
| `PAYMENT_MODE`                                        | reserved           | `fake`                                                                                     | Placeholder for a future provider switch                      |
| `E2E_WEB_URL` / `E2E_API_URL`                         | Playwright         | `http://localhost:5173` / `http://localhost:3000`                                          | E2E targets                                                   |

Copy `.env.example` to `.env` for local work. `.env` is gitignored and never committed; Compose works without it because every variable has a safe default.

## 11. Prerequisites and local development

Prerequisites: Node 22, pnpm 10.14.0 (`corepack enable`), Docker + Compose.

```sh
cp .env.example .env
pnpm install
docker compose up -d db
pnpm --filter api prisma:generate
pnpm --filter api prisma:deploy
pnpm dev:api     # Fastify with tsx watch on :3000
pnpm dev:web     # Vite dev server on :5173
```

`prisma:generate` accepts a dummy `DATABASE_URL` for codegen; `prisma:deploy` and the integration tests need a reachable one. If host port 5432 is taken, run Compose with `POSTGRES_HOST_PORT=5433` and point local `DATABASE_URL` at `localhost:5433`.

## 12. Running with Docker Compose

```sh
docker compose up --build
```

- Frontend: http://localhost:5173 (nginx serving the production build)
- API liveness: http://localhost:3000/live
- API readiness: http://localhost:3000/ready
- OpenAPI JSON: http://localhost:3000/openapi.json
- Docs UI: http://localhost:3000/docs

The API container waits for PostgreSQL to be healthy, runs `prisma migrate deploy`, then starts. The `db` service persists data in the `pgdata` volume across restarts.

## 13. Database initialization and demo data

There is no seed script; migrations plus the API are the only writers. Initialize and load a demo product:

```sh
docker compose up -d db
pnpm --filter api prisma:generate
pnpm --filter api prisma:deploy
curl -F "file=@apps/api/test/fixtures/csv/challenge-example.csv" http://localhost:3000/api/products/import
curl -s "http://localhost:3000/api/products?q=RS-001"
```

The first command creates the product (`201`, `created: 1`); repeating it deterministically returns the `SKU_EXISTS` row error instead of duplicating.

## 14. Tests

| Suite           | Command                                                                                                          | What it covers                                                                                                                                                                                                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API unit        | `pnpm --filter api test:unit` (9 files, 53 tests)                                                                | Pure rules: CSV parsing edge cases (incl. the challenge fixture byte-for-byte), money math without floats, SKU normalization, idempotency hashing, fake-payment behaviors                                                                                                                                                                   |
| Web unit        | `pnpm --filter web test` (5 files, 16 tests)                                                                     | Cart clamping/accumulation/removal, display formatting, form validation + submit-once + SKU error mapping, import error list + retry, checkout retry reusing the same idempotency key                                                                                                                                                       |
| API integration | `DATABASE_URL=... pnpm test:integration` (6 files, 43 tests, real PostgreSQL via `vitest.integration.config.ts`) | CRUD, search/pagination boundaries, archived-product rules, import summary + zero-write failures + persistence-conflict rollback, checkout totals/snapshots, insufficient-stock atomicity, payment decline + replay, idempotency replay/conflict/retries, **concurrent oversell and shared-key races**, DB-constraint checks, OpenAPI shape |
| E2E             | `pnpm e2e` (4 files, 9 tests, chromium)                                                                          | Health/connectivity, create → search, validation + duplicate-SKU errors, edit + archive, CSV upload + refresh, invalid-file retry, fixture import, purchase → confirmation → order detail, inventory conflict                                                                                                                               |

`pnpm test:unit` runs the API and web suites; `pnpm test` runs every workspace suite. E2E expects the Compose stack on `http://localhost:5173` + `http://localhost:3000` (override with `E2E_WEB_URL` / `E2E_API_URL`).

## 15. Formatting, linting, type checking, and builds

```sh
pnpm format       # prettier --check .
pnpm format:write # apply formatting
pnpm lint         # eslint . (zero warnings allowed)
pnpm typecheck    # tsc --noEmit across all workspaces
pnpm build        # contracts + api + web production builds
```

TypeScript is strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, no `any` in hand-written code); the only `as` casts are JSON-boundary or generated-client typings covered by round-trip/replay tests.

## 16. Continuous integration

`.github/workflows/ci.yml` runs on push and pull request: `lint` → `format` + `eslint`; `typecheck` (dummy DB URL for codegen); `unit` (`pnpm test:unit`); `integration` (real `postgres:16-alpine` service + `migrate deploy` + `pnpm test:integration`); `build` (needs lint/typecheck/unit: `prisma generate`, `pnpm build`, `docker compose build`); `e2e` (needs build + integration: installs Chromium, `docker compose up -d --build`, waits for `/live`, runs `pnpm e2e`, dumps logs on failure, always tears down).

## 17. Security assumptions and non-goals

- **No authentication or authorization.** Anyone with network access can manage products, import, and order. Deliberate for a local challenge; a real deployment needs authN/authZ plus per-user idempotency scopes.
- **Fake payments only.** No credentials, no network calls, no real money movement. Do not treat `paymentReference` as proof of external capture.
- **Trust model:** single-tenant local deployment. CORS explicitly allows browser `PATCH`/`DELETE` (the plugin default only permits `GET,HEAD,POST`, which the edit/archive flows caught in E2E). No rate limiting; the 5 MiB upload cap and 100-line order cap bound the cheapest abuse vectors only.
- **Secrets:** all secrets come from the environment; `.env` is gitignored and only `.env.example` (safe placeholders) is committed. Error responses never leak stacks; 5xx details stay server-side in logs with request ids (`x-request-id` on every response aids tracing without exposing internals).
- **Client input:** validated at the API boundary with shared TypeBox schemas (`additionalProperties: false` rejects unknown fields); the database re-enforces every invariant that matters under concurrency.

## 18. Known limitations and future work

- No order-history list endpoint (a placed order stays reachable through its confirmation link and detail page).
- Import is synchronous within the documented limits; larger files need the background-job design noted in the CSV section (`202` + job id + polling).
- Retrying a declined payment with the same idempotency key replays the `402` (executions are idempotent; use a new key for a genuinely new attempt).
- E2E tests pollute the dev database by design (timestamped fixtures avoid collisions); integration tests clean their tables per file.
- Swagger UI documents the import endpoint but cannot attach a file upload; use the curl command above or any multipart client with a `file` field.
- Future work, if requirements demand it: authentication and roles, server-side carts, multi-currency and tax, refunds/cancellations, webhook-driven payment reconciliation, background import jobs, rate limiting, and non-root container users.
