# EventHub — Booking Management Test Strategy

**Input**: `docs/test-scenarios.md` (114 scenarios total). This strategy currently assigns test layers for the booking-management scenarios; event-management scenarios have been added and still need a dedicated layer-allocation section.
**Consumer**: `/generate-tests`
**Sources scanned**: `backend/src/services/bookingService.js`, `backend/src/services/eventService.js` (`withPersonalSeats`), `backend/src/controllers/bookingController.js`, `backend/src/repositories/bookingRepository.js`, `backend/src/validators/bookingValidator.js`, `backend/src/middleware/{authMiddleware,errorHandler}.js`, `frontend/app/bookings/page.tsx`, `frontend/app/bookings/[id]/page.tsx`, `frontend/app/admin/bookings/page.tsx`, `frontend/components/bookings/BookingCard.jsx`, `frontend/components/ui/ConfirmDialog.jsx`, `frontend/lib/hooks/useBookings.ts`, `frontend/lib/api/{bookings.ts,client.ts,bookingsApi.js,client.js}`, `tests/booking-management.spec.js`, `playwright.config.ts`

---

## 1. Current State vs Target

| | Unit | API | Component | E2E |
|---|---|---|---|---|
| **Today** (2026-10-15) | 0 | 0 | 0 | 5 (TC-001, 002, 003, 005, 008) |
| **Target (primary assignments)** | 7 | 34 | 21 | 10 |
| **Target (incl. defense-in-depth)** | ≈ 45 cases | ≈ 55 cases | ≈ 30 cases | 10 tests |

Today's suite is 100% E2E: an **ice-cream cone**. The target is a pyramid with a thick API band. That band is deliberate. Most booking rules (FIFO pruning, per-user seats, cascades, scoping) live in **Prisma queries** (`findOldestUserBookingExcludingEvent`, `groupBy` in `getBookedQuantitiesForEvents`, `deleteMany({ userId })`). A unit test with mocked repositories can only check orchestration, not the query semantics, so the queries need a real database behind the API. Unit tests are kept for the pure and orchestration logic.

Two scenarios have no standalone test. TC-510 is a spec gap with no feature to test (see §4). TC-511 is folded into the TC-003 E2E test.

### Distribution

| Layer | Primary count | Focus | Est. run time | Tooling |
|---|---|---|---|---|
| **Unit** | 7 (+ ≈ 12 as defense layer) | Ref generation, price calc, FIFO/fallback orchestration, validators, pagination math, `withPersonalSeats`, refund predicate | < 5 s | **Not installed.** Backend: Jest (`jest.mock` for repositories). Frontend: Vitest. |
| **API** | 34 | Endpoint contracts, status codes, auth, sandbox isolation, FIFO and seat behaviour on a real DB, cascades | ≈ 1–2 min (network) | Playwright `request` fixture. **No new dependencies.** |
| **Component** | 21 | Loading, empty, error, dialog, refund-widget states; toasts; conditional rendering | ≈ 15 s | **Not installed.** Vitest + @testing-library/react + jsdom. Interim fallback: Playwright with `page.route()` mocks (see §5). |
| **E2E** | 10 | Critical multi-page journeys, the cross-user UI, and frontend↔backend wiring | ≈ 3–4 min (serial, live) | Playwright (existing) |

---

## 2. Layer Assignments

Legend: **Primary** = the layer that owns the scenario. **Also** = a defense-in-depth layer for critical rules.

### 2.1 Unit (7 primary)

| ID | Scenario | Target under test | Also |
|---|---|---|---|
| TC-103 | Ref prefix = uppercased first letter | `randomRef(eventTitle)` in `bookingService.js` (export required: it is module-private today) | API (format on `POST /api/bookings` response) |
| TC-408 | Title starting with a digit or symbol | `randomRef`: `'2026 Expo'` → `2-`, `'#Hack'` → `#-`, `undefined` title → `E-` | API (`/ref/#-…` URL-encoding behaviour) |
| TC-107 | Total = price × quantity | `createBooking`: `parseFloat(event.price) * data.quantity` with mocked repos (Decimal string `"299.00"` × 4) | API |
| TC-400 | 9th booking does not prune | `createBooking` with `countUserBookings` → 8: assert `bookingRepository.delete` is not called | API |
| TC-403 | Refund boundary q = 2 is not eligible | Refund predicate `quantity === 1` (extract `isRefundEligible(q)` from `RefundEligibility` in `app/bookings/[id]/page.tsx`) | Component |
| TC-409 | Email normalisation | `validateCreateBooking` chain run against a mock `req` (`normalizeEmail()`) | API |
| TC-410 | All-symbol phone passes "10 digits" | `validateCreateBooking` `customerPhone` chain | API |

**Unit as the defense layer** (the primary layer is elsewhere):

| ID | Unit target |
|---|---|
| TC-100/101 | `createBooking` with count = 9: `findOldestUserBookingExcludingEvent` is used first, `findOldestUserBooking` only when it returns null |
| TC-102 | `sameEventFallback` → `eventRepository.decrementSeats(eventId, quantity)` called **only** when the pruned booking has the same `eventId` |
| TC-104/105 | `isRefundEligible(1) === true`, `isRefundEligible(3) === false` |
| TC-108 | `withPersonalSeats` in `eventService.js`: `max(0, availableSeats − userBooked)`, including clamping to 0 |
| TC-304 | `createBooking` with `eventRepository.findById` → null: assert `delete` **not** called (expected to fail today) |
| TC-305 | `InsufficientSeatsError` message `"Only N seat(s) available, but M requested"` |
| TC-306/307 | `validateCreateBooking`: each field rule and message, quantity 0/11/2.5/"two" |
| TC-407 | `getBookings` pagination: `limit=0` → 10, `totalPages = ceil(total/limit)` |
| TC-405 | `generateUniqueRef` collision retry: `findByRef` returns a hit 10× → falls back to `<prefix>-<base36 timestamp>` |

### 2.2 API (34 primary)

All use Playwright `request` against `/api`, authenticated with a token from `POST /api/auth/login`.

| ID | Scenario | Endpoint / function | Priority |
|---|---|---|---|
| TC-006 | Clear all | `DELETE /api/bookings` → `clearAllBookings` → `"N booking(s) cleared"` | P1 |
| TC-009 | Ref lookup (own) | `GET /api/bookings/ref/:ref` → `getBookingByRef` | P2 |
| TC-100 | FIFO prunes the oldest booking for a different event | `POST /api/bookings` → `createBooking` + `findOldestUserBookingExcludingEvent` | **P0** |
| TC-101 | FIFO prefers a different event over the overall-oldest | same | P1 |
| TC-102 | Same-event fallback burns a seat | `createBooking` → `eventRepository.decrementSeats` | P1 |
| TC-108 | Seats drop on booking and restore on cancel | `POST/DELETE /api/bookings` + `GET /api/events/:id` (`withPersonalSeats`) | **P0** |
| TC-109 | Clear all restores seats | `DELETE /api/bookings` + `GET /api/events/:id` | P1 |
| TC-110 | Per-user seats (two accounts) | `GET /api/events/:id` with two tokens | P1 |
| TC-111 | Status always "confirmed" | `POST /api/bookings` with `status: "cancelled"` | P2 |
| TC-112 | Event delete cascades bookings | `DELETE /api/events/:id` → `GET /api/bookings/:id` = 404 | P1 |
| TC-113 | Event FIFO (6 events) cascades bookings | `POST /api/events` ×7 | P2 |
| TC-201 | Cross-user GET → 403 | `getBookingById` | **P0** |
| TC-202 | Cross-user DELETE must not delete (404 today; spec says 403) | `cancelBooking` → `findById(id, userId)` | **P0** |
| TC-203 | Cross-user ref lookup → 403 | `getBookingByRef` | P1 |
| TC-204 | 403/404 id-enumeration oracle | `getBookingById` | P3 |
| TC-205 | Clear all is scoped to the caller | `deleteAllForUser(userId)` | **P0** |
| TC-206 | `?eventId=` filter cannot leak other users' bookings | `findAll` `where.userId` | P1 |
| TC-207 | Auth matrix: 6 endpoints × 3 bad-token types | `authMiddleware` | **P0** |
| TC-210 | Fallback burns a shared static event's seats | `decrementSeats` on `isStatic` event | P2 |
| TC-301 | 404 for missing id or ref | `NotFoundError` → `errorHandler` | P1 |
| TC-302 | Non-numeric or negative id | No param validator → likely 500 | P2 |
| TC-303 | Double cancel → 404 | `cancelBooking` | P1 |
| TC-304 | Failed booking at 9 must not prune | `createBooking` (prune runs before validation) | **P0** |
| TC-305 | Insufficient seats message | `InsufficientSeatsError` → 400 | P1 |
| TC-306 | Field validation (parametrized) | `validateCreateBooking` → 400 `details[]` | P1 |
| TC-307 | Quantity bounds (parametrized) | `validateCreateBooking` | P1 |
| TC-312 | Ref lookup case sensitivity | `findByRef` (MySQL collation) | P3 |
| TC-401 | 10 bookings from zero → the oldest is gone | `createBooking` | P1 |
| TC-402 | Quantity 1 and 10 succeed | `POST /api/bookings` | P1 |
| TC-404 | Exact remaining seats, then +1, then cancel and rebook | `createBooking` seat check | P1 |
| TC-405 | Same event booked multiple times | `createBooking` | P2 |
| TC-406 | Clear all with zero bookings → `"0 booking(s) cleared"` | `clearAllBookings` | P2 |
| TC-407 | Pagination boundaries, including negative values | `getBookings` → `findAll` `skip/take` | P2 |
| TC-412 | Pruned booking id → 404 | `createBooking` → `getBookingById` | P2 |

### 2.3 Component (21 primary)

The target components are `BookingCard.jsx`, `ConfirmDialog.jsx`, `RefundEligibility` (extract from the `[id]` page), `BookingsContent` (`app/bookings/page.tsx`), `BookingDetailPage`, `AdminBookingsPage` and `Pagination.jsx`. Mock `useBookings`/`useBooking`/`useCancelBooking` or the `fetch`/axios layer.

| ID | Scenario | Component / branch |
|---|---|---|
| TC-007 | Back links point to `/bookings` | `BookingDetailPage` breadcrumb + back button `href` |
| TC-010 | Admin table columns and total subtitle | `AdminBookingsPage` |
| TC-104 | Refund eligible (q = 1) message | `RefundEligibility` with fake timers |
| TC-105 | Refund ineligible (q = 3) with interpolated count | `RefundEligibility` |
| TC-106 | Refund check makes no network calls | `RefundEligibility` + fetch spy |
| TC-209 | 401 clears the token and redirects | `client.js` response interceptor (jsdom) |
| TC-300 | 404 → "Booking not found" | `BookingDetailPage` `isError && !is403` |
| TC-308 | List error state + Retry | `BookingsContent` `isError` |
| TC-309 | Cancel failure → error toast, booking kept | `BookingCard` / `BookingDetailPage` `onError` |
| TC-311 | Dismissing the confirm sends no request | `BookingsContent.handleClearAll` with `window.confirm` stubbed to false |
| TC-411 | Unmount during the refund spinner → no errors | `RefundEligibility` (`setTimeout` has no cleanup) |
| TC-500 | Skeleton loading (5 cards) | `BookingsContent` `isLoading` |
| TC-501 | Empty state + Browse Events link | `BookingsContent` |
| TC-502 | Detail spinner | `BookingDetailPage` `isLoading` |
| TC-503 | Dialog text (ref, "release N seat(s)") and close without confirm | `BookingCard` / `BookingDetailPage` + `ConfirmDialog` |
| TC-504 | Confirm loading; Esc and Cancel blocked while loading | `ConfirmDialog` `isLoading` |
| TC-505 | "Clearing…" disabled state | `BookingsContent` `clearing` |
| TC-506 | Refund state machine (idle → checking → result, no re-check) | `RefundEligibility` with fake timers (4000 ms) |
| TC-507 | `status: "cancelled"` → danger badge, no Cancel button | `BookingCard`, detail page, admin row |
| TC-508 | Admin status filter resets page to 1; "Cancelled" → empty | `AdminBookingsPage` |
| TC-509 | Pagination with `totalPages = 1` | `BookingsContent` (no guard) vs admin (`totalPages > 1`) |

### 2.4 E2E (10 primary)

| ID | Journey | Why it must be E2E | Priority |
|---|---|---|---|
| TC-001 | Book → `/bookings` list shows the card | Full-stack render of real data | **P0** |
| TC-002 | List → View Details → all sections | Cross-page navigation + real data mapping | **P0** |
| TC-003 (+ TC-511) | Detail → Cancel → toast → redirect → booking absent from the list | Multi-page journey + React Query invalidation across routes | **P0** |
| TC-004 | Cancel from a list card, other cards remain | Real DELETE + list refetch | P1 |
| TC-005 | Clear all via UI → empty state | Only the real browser→API path proves the page sends the token (TC-310). **Done**: `booking-management.spec.js` | **P0** |
| TC-008 | Booking confirmation → "View My Bookings" → new card first; ref consistent across screens (TC-103 consistency check) | Multi-page journey | P1 |
| TC-011 | Admin bookings: view modal → cancel | Admin route + real cancel | P2 |
| TC-200 | User B opens user A's booking → "Access Denied" | Two real accounts; the critical security journey | **P0** |
| TC-208 | Logged out → `/bookings`, `/bookings/1`, `/admin/bookings` redirect to `/login` (one parametrized test) | Route guard + navigation | P1 |
| TC-310 | Clear-all request carries `Authorization` and surfaces errors | Checks the page → `lib/api/bookings.ts` → `client.ts` wiring end-to-end. Header present on live (suspicion not reproduced) | **P0** |

TC-005 and TC-310 should be **one test**: perform the clear, then assert on the intercepted request header with `page.waitForRequest`, then assert the empty state.

---

## 3. Defense-in-Depth for Critical Rules

| Rule | Unit | API | Component | E2E |
|---|---|---|---|---|
| Sandbox isolation / cross-user access | — | TC-201, 202, 203, 205, 206 | TC-300 (403 vs 404 branch) | TC-200 |
| FIFO 9-booking limit | TC-400, orchestration for 100/101/102/304 | TC-100, 101, 102, 304, 401 | — | — |
| Seat accounting | `withPersonalSeats` | TC-108, 109, 110, 404 | — | (implicit in TC-003) |
| Booking ref format | TC-103, 408 | TC-103 | — | TC-008 (consistency) |
| Refund eligibility | `isRefundEligible`, TC-403 | n/a (client-only) | TC-104, 105, 506 | — (see §4) |
| Cancel / clear all | — | TC-006, 205, 303 | TC-309, 311, 503 | TC-003, 004, 005/310 |
| Auth required | — | TC-207 | TC-209 | TC-208 |

---

## 4. Decision Rationale (contested assignments)

| ID | Decision | Rationale |
|---|---|---|
| **TC-100/101/102 → API, not Unit** | API primary, Unit secondary | The "oldest, preferring a different event" choice is made by two Prisma queries ordered by `createdAt asc` with `eventId: { not }`. Mocked repositories would return whatever the test tells them to, so only a real DB proves the ordering and the exclusion. Unit tests still cover `createBooking`'s branching (which finder is used, when `decrementSeats` fires). |
| **TC-103 ref format → Unit, not E2E** | Unit primary; the existing E2E is downgraded to a consistency check | `randomRef` is a pure function. The existing E2E test spends a full UI booking to check a regex. The one thing only E2E can show is that the same ref appears on every screen, so TC-008 keeps that. Requires exporting `randomRef`/`generateUniqueRef` from `bookingService.js`. |
| **TC-104/105 refund → Component, plus no dedicated E2E** | Component primary | The logic is a `quantity === 1` check plus a 4 s `setTimeout`, with no backend. With fake timers a component test runs in milliseconds; E2E costs 4 s+ of wall time per case. Being business-critical is not enough to justify E2E: there is no integration point to exercise. If no component runner is adopted, fall back to **one** E2E (q = 1) and leave q = 3 and q = 2 to the Unit predicate. |
| **TC-005/310 clear all → E2E** | E2E | This is the one case where a lower layer gives a false pass. An API test of `DELETE /api/bookings` passes, because the backend is fine, and a component test with mocked `bookingsApi.clearAll` also passes. The risk is the page importing `lib/api/bookings.ts`, whose `client.ts` (in this repo) sends no token, and only a real browser request shows that. On live the header **is** sent, so the test passes; it stays as a guard, and the repo code should be checked against a local build. |
| **TC-200 cross-user UI → E2E, despite API coverage** | E2E + API | The API layer proves the 403. The E2E test proves the UI turns it into "Access Denied" rather than a broken page or leaked data, and it is the flow named in the domain (Flow 6). There is one E2E test; the rest of the security matrix is API. |
| **TC-303 double cancel → API + Component, not two-tab E2E** | API primary | A two-tab E2E test is slow and flaky. The API test proves the 404 and the component test proves `onError` → toast. Nothing is left that needs two real tabs. |
| **TC-511 cache invalidation → merged into TC-003** | E2E (merged) | TC-003 already redirects to `/bookings` and can assert the booking is absent. A separate test would repeat the whole setup for one assertion. The seat-restore half belongs to the API layer (TC-108). |
| **TC-209 token expiry → Component** | Component (jsdom) | The behaviour is in the axios interceptor (`client.js`), which can be tested by returning a 401 from a mocked adapter. TC-208 already gives E2E coverage of the auth redirect. |
| **TC-311 dismiss confirm → Component** | Component | Stubbing `window.confirm` is trivial in jsdom. In E2E it needs `page.once('dialog')` plus proving a *negative* (no request), which is weaker. |
| **TC-210/302/304/407 (suspected defects) → API** | API | These describe server behaviour and should be written as **expected-correct** assertions, marked `test.fail()` with a link to the defect until fixed, so the suite stays green and the gap stays visible. |
| **TC-510 sandbox banner** | No test | The feature does not exist in `app/bookings/page.tsx`. Resolve the spec gap first, then add a Component test. |

---

## 5. Prerequisites for `/generate-tests`

1. **API layer (no new dependencies)**: create `tests/api/bookings.api.spec.js` using the `request` fixture. Add a helper `apiLogin(request, email, password) → token`. Use `rahulshetty1@gmail.com` and `rahulshetty1@yahoo.com` for cross-user tests.
2. **Test isolation**: the suite runs against the **live** site with a shared account. Once more than one spec file exists, Playwright's default `workers` will run files in parallel against that account and they will interfere with each other. Prefer **registering a unique user per test** via `POST /api/auth/register` (e.g. `qa+<timestamp>@example.com`). Otherwise set `workers: 1`.
3. **Unit runner (backend)**: add Jest to `backend/` devDependencies; export `randomRef` and `generateUniqueRef` from `bookingService.js`. Tests go in `backend/src/**/__tests__/*.test.js`.
4. **Component runner (frontend)**: add Vitest + @testing-library/react + jsdom; extract `RefundEligibility` to `frontend/components/bookings/RefundEligibility.tsx`.
   **Interim fallback** until then: implement Component scenarios as Playwright tests that stub the API with `page.route()` (`tests/ui-mocked/*.spec.js`). They are slower than real component tests but much faster and more deterministic than full E2E. Do **not** count them as E2E.
5. **Missing selectors**: add `data-testid="booking-ref"` to the detail-page ref badge, `data-testid="clear-all-bookings-btn"` to the Clear all button, and `data-testid="admin-booking-row"` to the admin table rows, so tests stop using CSS chains.

---

## 6. Anti-Patterns in Existing Tests (`tests/booking-management.spec.js`)

> **Status 2026-10-15:** #2–#10 and #12 are fixed. The file now holds only TC-005 and TC-008, with API setup through `tests/fixtures/api.js`. #1 and #11 remain open until the API/unit/component layers exist.

| # | Anti-pattern | Location | Fix |
|---|---|---|---|
| 1 | **Ice-cream cone**: 6/6 tests are E2E; no API, unit or component tests | whole file | Adopt §2 |
| 2 | **Pure logic tested at E2E**: ref regex check spends a full UI booking | `TC-102` test (now **TC-103**) | Unit (`randomRef`) + API; keep only the consistency assertion inside TC-008 |
| 3 | **Setup through the UI**: every test logs in through the form, books through the event page and clears through the UI | `login()`, `bookEvent()`, `clearBookings()` | Seed via API (`POST /api/auth/login` → inject `eventhub_token` into localStorage via `addInitScript`; `POST /api/bookings`; `DELETE /api/bookings`). Login UI belongs in an auth spec. |
| 4 | **Setup depends on a feature under test**: `clearBookings()` uses the UI "Clear all", which TC-004 tests. If it fails, all 6 tests fail and the real failure is hidden | `clearBookings()` | Use `DELETE /api/bookings` via `request` for setup |
| 5 | **Conditional logic on a non-retrying check**: `isVisible().catch(() => false)` resolves immediately, possibly while the skeleton is still showing | `clearBookings()` | Remove the branch; API cleanup is idempotent (TC-406) |
| 6 | **Fragile CSS-chain locator**, and the comment says "breadcrumb" but the locator matches the header badge | `TC-002`: `span.font-mono.font-bold` | Add `data-testid="booking-ref"`; use `getByTestId` |
| 7 | **Stale TC ids** from the previous scenario numbering | `TC-102`→TC-103, `TC-004`→TC-005, `TC-006`→TC-008, `TC-003 + TC-506`→TC-003 + TC-511 | Renumber to match `docs/test-scenarios.md` |
| 8 | **Duplicated helper logic**: the booking flow is re-implemented inline | `TC-006` test | Reuse `bookEvent()` (or API seeding) |
| 9 | **Hardcoded `BASE_URL`** duplicating `playwright.config.ts` `baseURL` | top of file | Use relative `page.goto('/bookings')` |
| 10 | **`console.log` noise** in tests | `bookEvent()`, TC-006, TC-102 | Remove, or use `test.info().annotations` |
| 11 | **Coverage gaps**: no security (TC-200–210), negative (TC-300–312) or limit (TC-100–102, TC-400–401) tests | — | §2.2 API layer |
| 12 | **Resolved**: `TC-004` (clear all) passes on live and the request carries the JWT, so the TC-310 header suspicion does not apply to the deployed build | `TC-004` test | Verify against a local build |

---

## 7. Suggested Implementation Order

1. **API P0** (TC-100, 108, 201, 202, 205, 207, 304), which gives the highest risk coverage per minute and needs no new tooling
2. **Refactor the existing E2E spec** (anti-patterns 3–7) and add **E2E P0** TC-200 and TC-005/310
3. **API P1–P3** for the remaining API scenarios
4. **Unit**, after Jest is added and the helpers are exported
5. **Component**, after Vitest is added (or the interim `ui-mocked` Playwright fallback)
