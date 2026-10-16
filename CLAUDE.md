# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
EventHub is a full-stack event ticket booking platform built for QA training. Users browse events, book tickets, manage bookings, and create their own events. Each user operates in an isolated sandbox.

- **Frontend** (`frontend/`, port 3000): Next.js 14 App Router, React 18, TypeScript (some `.jsx` components), Tailwind, React Query v5
- **Backend** (`backend/`, port 3001): Express, Prisma 5, MySQL 8, JWT auth (7-day expiry), bcryptjs, Swagger at `/api/docs`
- **Tests** (`tests/`): Playwright E2E, Chromium only, JavaScript

## Commands
Run from the repo root unless noted.

```bash
npm run setup        # npm install in backend/ and frontend/ (root deps: npm install)
npm run db:push      # push Prisma schema to DB (non-interactive)
npm run migrate      # prisma migrate dev (interactive)
npm run seed         # seed 10 static events
npm run dev          # backend (nodemon) + frontend (next dev) concurrently
npm run build        # next build
npm run lint         # next lint

npm test                                                   # all Playwright tests
npx playwright test tests/<file>.spec.js --reporter=line   # single file
npx playwright test -g "<test title>" --reporter=line      # single test by title
npm run test:ui / npm run test:report
docker compose run tests                                   # run tests in the Playwright container
```

CI checks you can reproduce locally: `cd frontend && npx tsc --noEmit && npm run build`; backend runs `node --check` on JS files and `npx prisma validate` / `prisma format --check`.

Env setup: `backend/.env` (`DATABASE_URL`, `PORT`, `CORS_ORIGIN`, `JWT_SECRET`, `SHOW_EXPLORE_LINKS`) and `frontend/.env.local` (`NEXT_PUBLIC_API_URL=http://localhost:3001/api`). See the `.example` files.

## Important: tests target the live site
`playwright.config.ts` sets `baseURL` to `https://eventhub.rahulshettyacademy.com`, and specs also hardcode that `BASE_URL`. Running tests does **not** exercise local code unless you point them at `http://localhost:3000`. Tests mutate real data on that deployment for the shared test account (`rahulshetty1@gmail.com` / `Magiclife1!`).

## Architecture

### Backend
Layered: `routes → controllers → services → repositories → Prisma`. Entry is `server.js` → `app.js` (middleware, Swagger, `/api/auth`, `/api/events`, `/api/bookings`, `/api/health`, `/api/config` feature flags).

- **Auth**: `middleware/authMiddleware.js` verifies the Bearer JWT and sets `req.user` (`userId`, `email`). Services take `userId` explicitly.
- **Sandboxing** is enforced in repositories: event queries filter `OR: [{ isStatic: true }, { userId }]`, so users see the seeded static events plus only their own. Bookings are scoped by `userId`; reading someone else's booking throws `ForbiddenError`.
- **Errors**: services throw the domain errors in `src/utils/errors.js` (`NotFoundError`, `ForbiddenError`, `ValidationError`, `InsufficientSeatsError`). `middleware/errorHandler.js` maps them, plus Prisma codes such as P2002 → 409, to `{ success: false, error, details? }`. Throw these errors rather than writing responses from services.
- **Validation**: `express-validator` chains in `src/validators/`, attached in routes.
- Swagger docs come from `@swagger` JSDoc blocks on routes. Update them when you change endpoints.

### Frontend
- `app/` pages: `events`, `events/[id]`, `bookings`, `bookings/[id]`, `admin/events`, `admin/bookings`, `login`, `register`. `components/auth/AuthGuard.tsx` protects routes, and `lib/hooks/useAuth.tsx` holds the auth context.
- Data fetching uses React Query hooks (`lib/hooks/useEvents.ts`, `useBookings.ts`) over the API clients in `lib/api/`.
- `lib/api/` has **duplicate JS and TS clients** (`client.js`/`client.ts`, `events.ts`/`eventsApi.js`, `bookings.ts`/`bookingsApi.js`). `index.ts` exports the TS ones, and `useAuth` uses `authApi.js`. Check which one a page actually imports before you edit.
- Interactive elements carry `data-testid` attributes used by the tests. The README lists them. Keep them when you change markup.

## Key Business Rules
These are implemented mainly in `bookingService.js` and `eventService.js`:
- Max 6 user-created events per user. On overflow the oldest is pruned (FIFO).
- Max 9 bookings per user. On overflow the oldest is pruned, preferring a booking for a different event.
- Booking ref format is `<first letter of event title, uppercased>-<6 alphanumerics>`.
- Booking reduces `availableSeats`, and cancellation restores them.
- Refund eligibility is computed client-side: 1 ticket is eligible, more than 1 is not.
- Static (seeded, `isStatic: true`) events are immutable.

## Testing Conventions
- Specs go in `tests/<feature-name>.spec.js` and must be self-contained (login → action → assert).
- Locator priority: `data-testid` > role > label/placeholder > id > CSS class.
- Do not use `page.waitForTimeout()`. Rely on web-first assertions such as `expect(...).toBeVisible()`.
- `fullyParallel: false`, `retries: 0`, 30s test timeout, 5s expect timeout.

## Project Skills (`.claude/skills/`)
- Auto-loaded reference skills: `eventhub-domain` (API reference, business rules, user flows, UI selectors) and `playwright-best-practices`. Read these before writing or reviewing tests.
- User-invoked skills:
  - `/generate-tests <feature>` writes Playwright tests
  - `/review-tests <file>` reviews test quality
  - `/create-scenarios <area>` writes functional scenarios to `docs/test-scenarios.md`
  - `/test-strategy` assigns scenarios to test pyramid layers (`docs/test-strategy.md`)

## CI/CD
- `ci.yml` runs on PRs to `main`: backend syntax and Prisma checks, a schema drift check against the production DB over SSH, and the frontend type check and build.
- `deploy.yml` runs on push to `main` and deploys over SSH with PM2. **Schema changes are not migrated automatically**; they have to be applied on the server by hand.
- `playwright.yml` runs E2E tests against the live site and uploads the HTML report.
