# Ecommerce Challenge

Product catalog with search and management, all-or-nothing CSV import, and checkout with a fake payment provider, atomic stock decrements, and durable idempotency keys. Fastify modular monolith + React SPA + PostgreSQL; no mock data in the normal workflow.

## Example CSV

Obtained **2026-10-16**

## Run it locally

One command brings up the whole system:

```sh
docker compose up --build
```

It builds three images and starts three containers. The API waits for PostgreSQL to report healthy, applies `prisma migrate deploy`, then serves; nginx serves the production build of the SPA.

- **web** — http://localhost:5173 — open this in a browser
- **api** — http://localhost:3000 — `/docs` for Swagger UI, `/openapi.json` for the spec
- **db** — localhost:5432 — PostgreSQL 16, data in the `pgdata` volume

Confirm it came up healthy:

```sh
curl -s http://localhost:3000/ready  # {"status":"ok","database":"connected"}
```

Then try it: create or edit a product, import a CSV, add something to the cart and check out. Everything the API accepts is documented at `/docs`. When you are done:

```sh
docker compose down -v               # stop; -v also discards the database volume
```

## Decisions, approach, alternatives

| Decision                                                       | Rejected alternative                        | Why                                                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| One deployable, no broker                                      | Microservices, Kafka/queue workers          | Nothing needs independent scaling at the documented limits (5 MiB / 10k records); async follow-up documented instead |
| Conditional `UPDATE … WHERE stock >= qty`                      | Read-then-write, or `SELECT … FOR UPDATE`   | The affected-row count _is_ the verdict; one round trip, no decision gap                                             |
| Payment outside the transaction                                | Charge inside the transaction               | Never hold a transaction open across a network call                                                                  |
| `Idempotency-Key` in Postgres + SHA-256 of the normalized body | Redis cache, per-client keys                | Survives restarts; same key replays, different body is `409`                                                         |
| `BigInt` integer cents, DB `NUMERIC(12,2)`                     | `decimal.js`, float arithmetic              | Exact with no float and no extra dependency                                                                          |
| One TypeBox schema for validation, types, OpenAPI              | Zod, tRPC/GraphQL                           | A single source cannot drift from the spec                                                                           |
| Pure parse + validate, then one transaction                    | Upsert, streaming import, background worker | Per-record errors, and a failed file writes nothing                                                                  |
| Archive instead of delete                                      | Hard delete                                 | `OrderItem.productId` is `ON DELETE RESTRICT`; history must survive                                                  |
| Prisma + raw SQL for the one guard                             | Drizzle/Knex, raw SQL throughout            | Reviewable versioned migrations, typed client, raw SQL still available                                               |
| `localStorage` cart, fake provider                             | Server cart, Stripe test mode               | Stateless checkout; no credentials and no network in an offline submission                                           |

**Approach.** Schema first — invariants in the database, not only in application code. A pure domain core (`totals.ts`, `sku.ts`, `csvImport.ts`, `requestHash`) with `PrismaClient` and `PaymentProvider` injected at the edges, unit-tested without mocks. Correctness under concurrency designed before any UI. Three test tiers, each chosen for what it can prove: pure logic in Vitest, transactions and races against a **real PostgreSQL instance** (a mocked client cannot demonstrate row locks), Playwright only for critical browser flows. [`AGENTS.md`](AGENTS.md) holds the working agreement the code was written against, including "the database is authoritative". Written with AI assistance; per the challenge rules the source carries no comments (the only `//` in `apps/*/src` is Vite's `/// <reference>` directive), so correctness is carried by the tests.

**Questions that changed the design:**

| Question                                            | Answer                                                                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Can two concurrent checkouts take the last unit?    | Not with read-then-write — hence one guarded `UPDATE` inside the transaction ([below](#how-it-works))                                               |
| What if the charge succeeds and the DB write fails? | Every error path voids the charge, but a real gateway would authorize first and capture after commit, or reconcile by webhook on `paymentReference` |
| Should an import overwrite an existing SKU?         | No — imports create only, so order history never changes retroactively                                                                              |

## How it works

Checkout, in order: validate → normalize lines and hash the canonical body → replay or conflict on the stored idempotency record → load products and re-verify purchasability → compute every line total and the total from database prices in integer cents → fake charge **outside** any transaction → one transaction:

```sql
UPDATE "products" SET "stock" = "stock" - $qty, "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = $id::uuid AND "stock" >= $qty;   -- rows = 0  =>  409 INSUFFICIENT_STOCK, full rollback
```

followed by the order, its item snapshots, and the idempotency row. A unique-collision (two requests sharing one key) voids the loser's charge and replays the winner's stored response. Never store client-supplied prices; the server recomputes every line.

Other load-bearing choices: TypeBox validates the body, headers, params, and query at the boundary; failures use one envelope `{ "error": { code, message, details } }`; every response carries `x-request-id` and never a stack trace. The frontend is three routes (`/`, `/products/:id`, `/orders/:id`) — create, import, archive, and cart are modal/drawer surfaces rather than pages; the catalog, product-detail, and product-form actions carry hand-built inline SVG icons, and their labels collapse to the icon alone below `sm` while an `aria-label` keeps the accessible name at every width.

## Project structure

```
apps/api          Fastify modular monolith — modules/products, import, orders, payments
apps/web          React 19 + Vite SPA — pages, components, cart, api clients
packages/api-contracts   TypeBox schemas + inferred types (single source for api and web)
apps/api/prisma   schema.prisma + versioned migrations (never `db push`)
e2e               Playwright specs (chromium)      docs/  the two example CSVs
```

## API and data model

`GET/POST /api/products` · `GET/PATCH/DELETE /api/products/:id` · `POST /api/products/import` · `POST /api/orders` (requires `Idempotency-Key`) · `GET /api/orders/:id` · `/live` `/ready` `/health`. Spec at `/openapi.json`, UI at `/docs`.

Tables: `products` (`NUMERIC(12,2)` price, `NUMERIC(10,3)` weight, `UNIQUE(sku)`, `CHECK`s on price/stock/weight and field lengths), `orders` (`UNIQUE(payment_reference)`), `order_items` (price/name snapshots, `CASCADE` on order, `RESTRICT` on product), `idempotency_keys` (key + hash + stored status/body). Money is a decimal string on the wire, `NUMERIC` in the database, `BigInt` cents in business logic.

## Tests

57 API unit + 114 web unit + 48 integration (real PostgreSQL) + 18 Playwright. The concurrency ones are the point:

- `orders.test.ts` seeds `stock = 1`, fires concurrent checkouts with distinct keys, and asserts exactly one `201`, the rest `409`, and final `stock = 0`.
- The same file proves two requests sharing one idempotency key produce one order with byte-identical responses, and that the stock guard holds when driven directly through SQL.

## Security and known gaps

No authN/authZ (deliberate for a local submission), no rate limiting, fake payments only — `paymentReference` is not proof of capture. Errors never leak stacks; secrets come from the environment; the browser may send `PATCH`/`DELETE`. Known gaps: no order-history list endpoint, synchronous import only within its limits, and the charge/DB gap described above. Each is revisited when a requirement appears, not in anticipation of one.
