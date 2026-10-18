# AGENTS.md — ecommerce-challenge

Read this file before changing code. Inspect existing code and follow established patterns before adding new ones. Work incrementally and avoid unrelated refactoring.

## Language and code style

All application code, API fields, identifiers, tests, UI labels, and documentation are in English.

Strict TypeScript everywhere. Avoid `any`, unnecessary assertions, duplicated schemas, and unsafe casts. If a cast is unavoidable, narrow the scope and prove it with a test.

Do not add comments to source code. Prefer descriptive names, small functions, and explicit types. Documentation belongs in `README.md`, not in code comments.

## Architecture — modular monolith

`pnpm` workspaces monorepo. One Fastify backend deployable with internal domain modules. No extra backend microservices, brokers, Kubernetes, or Terraform without a demonstrated requirement.

```
apps/api/                  Fastify modular monolith
apps/web/                  React + Vite frontend
packages/api-contracts/    TypeBox schemas + inferred types only
packages/tsconfig/         shared strict configs
```

Backend module boundary:

```
apps/api/src/app.ts
apps/api/src/server.ts
apps/api/src/config.ts
apps/api/src/db/client.ts
apps/api/src/plugins/errors.ts
apps/api/src/plugins/openapi.ts
apps/api/src/modules/products/
apps/api/src/modules/import/
apps/api/src/modules/orders/ (includes persistent idempotency handling)
apps/api/src/modules/payments/
```

Frontend boundary:

```
apps/web/src/routes.tsx
apps/web/src/api/client.ts
apps/web/src/api/*.ts
apps/web/src/components/*.tsx (Page/PageHeader/EmptyState/SectionHeading, Modal, ProductFormModal, ImportModal, CartDrawer, ArchiveButton, icons)
apps/web/src/pages/*.tsx
```

`packages/api-contracts` is the single source of API schemas. Both `apps/api` and `apps/web` import from it. Never import Prisma or SQL into `packages/api-contracts`. Never import Prisma into `apps/web`. Money on the wire is a decimal `string`, never a binary float.

## Separation of concerns

Keep route handlers thin: validate, call a service, map to HTTP. Separate transport, business logic, and infrastructure where that improves testability.

Prefer pure functions for business rules and transformations (`modules/orders/totals.ts`, CSV row validation, `requestHash`). Use dependency injection for external dependencies: pass `PrismaClient` and `PaymentProvider` into services, do not import singletons inside business logic.

## Money, database, and concurrency rules

Use exact decimal semantics for prices and totals, never binary floating-point arithmetic for money. PostgreSQL stores money as `NUMERIC(12,2)` (weights `NUMERIC(10,3)`), so the Prisma client returns `Decimal` and every mapper converts it at the API boundary with `toFixed(2)` / `toFixed(3)` (see `modules/products/mapper.ts`, `modules/orders/mapper.ts`). Hand-written business math converts those strings to integer cents as `bigint` (`modules/orders/totals.ts`: `priceStringToCents`, `formatCents`, `calculateOrderLines`) — the project deliberately ships no decimal library, because a fixed two-decimal currency does not need one. Reconsider that decision (and the recorded assumption) if multi-currency or FX rounding ever enters scope.

Enforce critical invariants in the database, not only in application code: `price >= 0`, `stock >= 0`, `quantity > 0`, `UNIQUE(sku)`, `OrderItem.productId RESTRICT ON DELETE`, `OrderItem.orderId CASCADE ON DELETE`.

Do not perform network requests while a database transaction is open. Checkout order is: validate input, load products, compute totals in pure code, call `PaymentProvider.charge()` outside the transaction, then open one short transaction to re-check stock, decrement atomically (`UPDATE ... WHERE stock >= qty` or `SELECT ... FOR UPDATE`), insert order + items + idempotency record.

CSV imports must be fully validated before a single all-or-nothing database transaction commits them. Parse with `csv-parse` (`bom: true`, `columns: false` with manual header mapping, `trim: false` with manual boundary trimming, `skip_empty_lines: true`), handling quoted delimiters, escaped quotes, embedded newlines, BOM, CRLF. Expected header: `name,sku,description,category,price,stock,weight_kg`. `stock` is a nonnegative integer string. `category` is a free-form string. On any row error return HTTP `422` with the `ImportSummary` body (per-record `{ record, field, code, message }` errors, capped at 100 details with the true `errorCount`) and write zero rows. Imports create products only and never overwrite existing SKUs. Reject missing, duplicate, or unexpected headers instead of silently dropping data. Limits: 5 MiB per file and 10,000 data records.

Purchases must be safe under concurrency and repeated requests. `POST /api/orders` requires an `Idempotency-Key` header (any opaque 1–128 character value; a UUID is recommended). Store `key`, `requestHash`, `responseStatus`, `responseBody` in PostgreSQL in the same transaction as the order. Same key + same body replays the stored response. Same key + different body returns `409 IDEMPOTENCY_KEY_CONFLICT`.

Never store authoritative prices, order totals, or payment outcomes supplied by the client. The server loads `Product.price`, recomputes every `lineTotal` and `total`, and records only the provider result it observed.

Do not use in-memory state for persistence, inventory consistency, or idempotency. Everything load-bearing lives in PostgreSQL and survives restarts.

## Validation and errors

Validate all external input at the API boundary with TypeBox schemas from `packages/api-contracts`. This includes JSON bodies, query strings, params, and parsed CSV rows.

Use the consistent envelope:

```json
{ "error": { "code": "INSUFFICIENT_STOCK", "message": "...", "details": {} } }
```

Map TypeBox failures to `400 VALIDATION_ERROR`. Use `404 PRODUCT_NOT_FOUND / ORDER_NOT_FOUND`, `409 SKU_EXISTS / INSUFFICIENT_STOCK / IDEMPOTENCY_KEY_CONFLICT / IMPORT_CONFLICT`, `413 FILE_TOO_LARGE`, `402 PAYMENT_DECLINED`, and `422` with the `ImportSummary` body for CSV validation failures (per-record codes such as `REQUIRED`, `INVALID_PRICE`, `INVALID_STOCK`, `MISSING_HEADER`, `DUPLICATE_SKU_IN_FILE`, `SKU_EXISTS`). Never leak stacks.

## Dependencies and secrets

Avoid unnecessary dependencies, abstractions, services, or infrastructure. Prefer the installed solution (`csv-parse`, Prisma, React, TanStack Query) over a new library; check `package.json` before naming a dependency as installed.

Keep environment secrets out of source control. Maintain a complete `.env.example` with safe placeholders (`DATABASE_URL`, `PORT`, `VITE_API_URL`, `PAYMENT_MODE=fake`).

Maintain versioned database migrations under `apps/api/prisma/migrations/`. Document how to initialize the database and run migrations in `README.md`. Never use `prisma db push` as the production path; containers and CI run `prisma migrate deploy`.

Keep the Docker setup reproducible from a clean checkout: `docker compose up --build` starts `db`, `api` (applies migrations on boot), and `web`. Do not require manual steps that are not in `README.md`.

## Package commands

Future sessions must keep these working from the repo root:

```
pnpm install
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm build
pnpm e2e
docker compose up --build
```

`apps/api` additionally supports `pnpm --filter api prisma:migrate`, `prisma:deploy`, `prisma:generate` as defined in its `package.json`. Do not rename these without updating `README.md` and this file.

## Local development workflow

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL: `docker compose up db`.
3. Apply migrations: `pnpm --filter api prisma:deploy` (or `prisma:migrate` during development).
4. Run API and web with `pnpm dev` or `docker compose up --build` for the full stack.
5. OpenAPI JSON at `/openapi.json`, UI at `/docs`.

## Testing conventions

Write tests for failure cases and boundary conditions, not only happy paths: validation rejects, SKU conflicts, CSV row errors with zero writes, insufficient stock, payment decline, idempotency replay and mismatch, negative/zero price and stock guards.

Integration tests involving transaction behavior and concurrency must use a real PostgreSQL instance (Compose service or CI `postgres` service), never a mock. The parallel-checkout test seeds `stock=1`, fires concurrent checkouts with distinct idempotency keys, and asserts exactly one `201`, remainder `409`, final `stock=0`.

Layout: `apps/api/test/unit/**/*.test.ts`, `apps/api/test/integration/**/*.test.ts`, Playwright specs at repo-root `e2e/*.spec.ts` for create -> search -> import -> checkout. Vitest for unit/integration, Playwright only for critical browser workflows.

Do not claim tests pass without executing them. Do not silently skip failures, weaken assertions, or disable tests to make CI pass.

After each implementation phase, run the relevant formatter, linter, type checker, and tests. Summarize what ran and its actual result (command + pass/fail + counts). Update `README.md` when architecture, commands, configuration, or behavior changes.

When uncertain about a major design decision, inspect the project and available documentation before choosing. Record material assumptions in `README.md` instead of inventing facts. Current recorded assumptions: client-side-only cart, CSV creates products only and never overwrites existing SKUs with a 5 MiB / 10,000-record sync limit, fixed `USD`, single fake payment provider (behavior-flag `succeed`/`decline`, no card numbers), product with orders cannot be hard-deleted (`409`), no auth.
