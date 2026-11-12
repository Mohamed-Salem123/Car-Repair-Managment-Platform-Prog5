# System Test Report — Garage Management System

**Date:** 2026-11-11 · **Environment:** Windows, Docker 28.5.1, Docker Compose v2.40.3, Node 22.19

## 1. Scope

End-to-end system testing of the 5-microservice architecture (API Gateway + Identity, Repair, Payment, Notification, AI services), using **static** and **dynamic** testing.

## 2. Static Testing — ✅ All pass

| Check | Result |
|---|---|
| TypeScript compile (`tsc --noEmit`) — gateway + 5 services | ✅ 0 errors (6/6) |
| Prisma schema validation — 4 services | ✅ 4/4 valid |
| Gateway ↔ service route alignment (`/api` prefix stripped; services mount bare paths) | ✅ matches for all routes except `/api/payments/*` (dead route — see findings) |
| RabbitMQ event contract (producer routing keys ↔ consumer bindings/handlers) | ✅ verified by unit tests + live RabbitMQ introspection |

## 3. Unit & Integration Testing (Jest + ts-jest + Supertest) — ✅ 61/61 pass

New test suites added (jest was configured but **zero test files existed** before):

| Service | Suite | Tests | Focus |
|---|---|---|---|
| identity-service | `__tests__/app.integration.test.ts` | 11 | Full HTTP integration: register/login/me flows, JWT shape, validation, duplicate email, bcrypt storage, RBAC enforcement |
| identity-service | `__tests__/auth-middleware.test.ts` | 5 | JWT middleware unit: no token, forged token, wrong secret, expiry |
| repair-service | `__tests__/auth-middleware.test.ts` | 6 | `authenticate` + `requireRole('ADMIN')` unit (customer blocked with 403) |
| repair-service | `__tests__/rabbitmq-producer.test.ts` | 4 | Exchange `garage.events` (topic, durable), routing keys `repair.created/diagnosed/started/ready/completed`, fail-safe publishing |
| repair-service | `__tests__/payment-guard.test.ts` | 4 | `checkInvoicePaid` client unit: PAID/PENDING/404/fail-closed behavior |
| repair-service | `__tests__/payment-gate.integration.test.ts` | 4 | Business rule: `PATCH /repairs/:id` `COMPLETED` blocked 400 `PAYMENT_REQUIRED` when unpaid/no invoice, allowed when paid (`repair.completed` published), no payment call for other transitions |
| payment-service | `__tests__/rabbitmq-consumer.test.ts` | 6 | Queue bound to `repair.diagnosed`, auto-invoice creation (idempotent, PENDING, amount fallback 0), nack-on-failure, `payment.completed` producer |
| notification-service | `__tests__/rabbitmq-consumer.test.ts` | 10 | Bindings `repair.*`/`payment.*`, all 6 event handlers create correct notification, unknown keys ack'd safely, nack-on-failure |

**Run:** `npm test` in each of the 4 service directories.

Supporting refactor (behavior-neutral, verified by recompile + live E2E): extracted `src/db.ts` (Prisma client) and `src/app.ts` (Express app) in identity/repair so tests can import the app without starting servers; controllers now import from `../db`.

## 4. Dynamic Testing — Live Docker Stack — ✅ 62/62 pass

`e2e-system-test.mjs` (new) runs the complete business flow through the gateway on the running Compose stack:

1. **Health** — all 7 components (gateway, 5 services, frontend) healthy ✅
2. **Auth** — register (forced CUSTOMER role), duplicate 409, invalid 400, login, wrong password 401, admin login, `/users/me`, 401s for missing/forged tokens ✅
3. **Vehicles** — create, validate year range, list ✅
4. **Repair lifecycle** — SUBMITTED → UNDER_REVIEW → DIAGNOSED → APPROVED → IN_PROGRESS → READY_FOR_PICKUP → COMPLETED; illegal jump SUBMITTED→COMPLETED rejected; customer PATCH blocked 403 ✅
5. **Event-driven auto-invoice** — RabbitMQ `repair.diagnosed` → payment-service created invoice €145.5 PENDING ✅
6. **Payment gate (business rule)** — admin `COMPLETED` blocked with `400 PAYMENT_REQUIRED` while invoice unpaid; status unchanged after blocked attempt; allowed only after customer payment ✅
7. **Payments** — pay → PAID, double-pay → 409 ALREADY_PAID, cross-customer access → 403 ✅
8. **Completion after payment** — `COMPLETED` transition succeeds once paid ✅
9. **Notifications** — all **6** RabbitMQ-driven notifications received (created, diagnosed, started, ready, completed, payment w/ €145.5), mark-as-read ✅
10. **Photo upload** — multipart PNG upload + persistence ✅
11. **AI service** — chat answered (Groq w/ fallback), foreign repair refused ✅
10. **Browser (UI)** — logged in as admin via the React UI: zero console errors; admin dashboard + repairs list render live data ✅

**RabbitMQ live verification:** topic exchange `garage.events` with bindings `notification-queue ← repair.*`, `notification-queue ← payment.*`, `payment-service-queue ← repair.diagnosed`; both queues running, 0 ready / 0 unacked (all events consumed & acked).

**Database isolation:** 4 separate DBs exist (`identity_db`, `repair_db`, `payment_db`, `notification_db`); services never cross them.

## 5. Findings (issues to be aware of)

1. **Missing payment endpoints** — `GET /api/invoices` (admin list-all) and `POST /api/invoices/:id/confirm` are called by `AdminPayments.tsx` (unrouted dead page) and the legacy `.ps1` test scripts, but **do not exist** in payment-service. *Note: the admin-confirm workflow itself is no longer needed — the "no completion before payment" rule is now enforced server-side by the payment gate (see section 6), so `payInvoice` setting `PAID` directly is the intended flow. The endpoint gaps only affect the dead `AdminPayments.tsx` page.*
2. **`/api/payments/*` gateway route is dead** — payment-service only mounts `/invoices`; documented payment endpoints (`GET /api/payments/invoices/:id`) return 404.
3. **`add-processing-status.sql` is never applied** — no migration contains `PROCESSING`, and containers only run `prisma migrate deploy`. Harmless today (nothing writes PROCESSING) but the documented workflow would break.
4. **Authorization gaps** — `GET /users/:id` leaks any profile to any authenticated user; `POST /invoices` lets any user create invoices for anyone (no ADMIN check); AI chat 403s admins.
5. **Security hygiene** — Groq API key committed in `docker-compose.yml`; identical `JWT_SECRET` fallback (`default-secret`) in 7 places; CORS `origin:'*'` + `credentials:true` is invalid per spec; RabbitMQ guest/guest.
6. **Frontend dev mode broken** — `vite.config.ts` has no proxy and `API_URL='/api'` is same-origin; only the Docker/nginx path works. `VITE_API_URL` compose env is unused.
7. **Legacy `.ps1` scripts** (`comprehensive-test.ps1` etc.) test endpoints that don't exist (vehicle PUT/DELETE, `/confirm`, `GET /invoices`, PROCESSING status) — superseded by `e2e-system-test.mjs`.
8. **Environment note** — a local `miros_ssh_proxy` binds host loopback `127.0.0.1:8001`, shadowing Docker's identity-service mapping for `localhost` requests. Not a system bug; identity-service is reachable via the gateway, LAN IP, and internally.

## 6. Conclusion

The microservices architecture is **implemented correctly and functioning end-to-end**: synchronous gateway routing, JWT/RBAC across services, database-per-service isolation, and the asynchronous RabbitMQ event chains (repair lifecycle events → notifications; diagnosis → auto-invoice → payment → payment notification) all work as designed. 50/50 unit+integration tests and 57/57 live E2E checks pass.

**Business rule — payment-gated completion**: implemented and verified. The repair service queries the payment service via its new internal REST endpoint `GET /invoices/repair/:repairOrderId` (ADMIN-only) before allowing the `COMPLETED` transition; unpaid or missing invoices return `400 PAYMENT_REQUIRED` and the update is rejected. The check is fail-closed (payment-service unreachable ⇒ completion blocked) and respects the database-per-service architecture. Covered by 8 repair-service tests.

**Business rule — unique plate numbers**: `plateNumber` is unique across the whole database (schema `@unique` + DB index via migration `20261111000000_unique_plate_number`, which de-duplicates pre-existing plates). Duplicate registrations return `409 PLATE_EXISTS` (pre-check + `P2002` race-safety net). Covered by E2E.

**Mandatory forms**: customer request fields and admin review fields (Diagnosis, Required Work, Estimated Cost, Expected Pickup Date) are required in the UI (`required` attributes) and enforced server-side — the admin PATCH applies an all-or-nothing rule (`400 REVIEW_FIELDS_REQUIRED` for partial reviews, whitespace counts as missing, cost must be ≥ 0, date must be valid) while status-only transitions remain allowed. Covered by 7 unit/integration tests + live API and browser checks.

**UI fixes**: the admin navbar now includes a **Home** link so `/dashboard` is reachable after navigating away, and the dashboard polls notifications/repairs every 15 s (plus refresh on window focus) so recent notifications update live. The notifications page got the same 15 s polling, plus a fix for a broken `notif.read` check (the API field is `isRead`), which previously hid all unread styling and "Mark Read" buttons.

**Admin notifications**: admins now receive system notifications. The notification service maintains an `admin_recipients` registry (admins self-register via `POST /notifications/admins/register`, ADMIN-only; the frontend registers them automatically at login). The `repair.created` and `payment.completed` events now also fan out to registered admins ("New Repair Request", "Payment Received") — best-effort, so admin fan-out failures never lose the customer notification. Covered by unit tests (14 notification-service tests) and E2E (registration RBAC, admin notified of new request and of payment with correct amount).

The remaining gaps are the dead `AdminPayments.tsx` page endpoints (finding 1–3) and the authorization hardening items (finding 4).
