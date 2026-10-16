# EventHub — Booking and Event Management Test Scenarios

**Scope**: Booking creation where it affects managed booking state, viewing booking lists/details, cancellation, clearing bookings, seat accounting, booking limits, refund eligibility, and event creation and management (create, view, update, delete, ownership, and event limits).

**Sources**: `eventhub-domain.md` (business rules, flows, and API reference), backend booking/event services, repositories, routes and validators, frontend booking/event pages and forms, and existing Playwright booking tests.

> **Code/spec discrepancies** are explicitly called out in expected results. Treat these as defect-revealing scenarios, not as passing assertions against current behavior.

## Happy Path

### TC-001: View the user's bookings list
**Category**: Happy Path
**Priority**: P0
**Preconditions**: Signed in; user has at least one booking.
**Steps**:
1. Open `/bookings`.
2. Inspect each booking card.
**Expected Results**: "My Bookings" and one card per booking are shown, newest first. Each card shows its reference, confirmed status, booking ID, event title/date/city, quantity, booked date, total price, and "View Details" and "Cancel Booking" actions.
**Business Rule**: A user sees only their own bookings; booking lists are newest-first.
**Suggested Layer**: E2E

### TC-002: View booking details
**Category**: Happy Path
**Priority**: P0
**Preconditions**: Signed in; user owns booking B.
**Steps**:
1. Open `/bookings` and select "View Details" for B.
2. Review the details page.
**Expected Results**: URL is `/bookings/<B.id>`. Reference, status, event information, customer name/email/phone, ticket quantity, per-ticket price, total, booking date, and booking ID match B.
**Business Rule**: A user can view full details of their own booking.
**Suggested Layer**: E2E

### TC-003: Cancel a booking from its details page
**Category**: Happy Path
**Priority**: P0
**Preconditions**: Signed in; user owns a confirmed booking B.
**Steps**:
1. Open `/bookings/<B.id>` and select "Cancel Booking".
2. Confirm cancellation in the dialog.
**Expected Results**: Success toast appears, user returns to `/bookings`, B disappears, and `GET /api/bookings/<B.id>` returns 404.
**Business Rule**: Cancelling deletes the booking and frees its seats.
**Suggested Layer**: E2E

### TC-004: Cancel a booking from its list card
**Category**: Happy Path
**Priority**: P1
**Preconditions**: Signed in; user has at least two bookings.
**Steps**:
1. On `/bookings`, select "Cancel Booking" on one card.
2. Confirm cancellation.
**Expected Results**: Success toast appears, the selected card is removed without a full-page reload, and other cards remain.
**Business Rule**: A user can cancel an individual booking.
**Suggested Layer**: E2E

### TC-005: Clear all bookings in the UI
**Category**: Happy Path
**Priority**: P0
**Preconditions**: Signed in; user has at least two bookings.
**Steps**:
1. Open `/bookings` and select "Clear all bookings".
2. Accept the browser confirmation.
**Expected Results**: Button shows "Clearing…" while pending. The list becomes empty, the empty state appears, and `GET /api/bookings` returns no records and total 0.
**Business Rule**: Clear All removes all bookings belonging to the current user.
**Suggested Layer**: E2E

### TC-006: Clear all bookings through the API
**Category**: Happy Path
**Priority**: P1
**Preconditions**: Valid authenticated token; user has N bookings.
**Steps**:
1. Send `DELETE /api/bookings`.
2. Fetch `GET /api/bookings`.
**Expected Results**: API returns success and reports N bookings cleared; the subsequent list is empty.
**Business Rule**: A user can clear all of their bookings in one action.
**Suggested Layer**: API

### TC-007: Return to the bookings list from details
**Category**: Happy Path
**Priority**: P2
**Preconditions**: Signed in; viewing an owned booking detail page.
**Steps**:
1. Select the "My Bookings" breadcrumb.
2. Reopen the detail page and select "Back to My Bookings".
**Expected Results**: Both controls navigate to `/bookings`.
**Business Rule**: Booking management provides navigation back to the user's list.
**Suggested Layer**: Component

### TC-008: View a newly confirmed booking
**Category**: Happy Path
**Priority**: P1
**Preconditions**: Signed in; an event has available seats.
**Steps**:
1. Book the event with valid customer data.
2. Note the confirmation reference and select "View My Bookings".
**Expected Results**: The booking appears first in the list and its reference matches the confirmation card.
**Business Rule**: Users can navigate from booking confirmation to their bookings.
**Suggested Layer**: E2E

### TC-009: Look up an owned booking by reference
**Category**: Happy Path
**Priority**: P2
**Preconditions**: Valid token; user owns booking with reference R.
**Steps**:
1. Send `GET /api/bookings/ref/R`.
**Expected Results**: 200 response contains the booking with matching reference and populated event details.
**Business Rule**: The booking API supports reference lookup.
**Suggested Layer**: API

### TC-010: View bookings in the Admin Bookings page
**Category**: Happy Path
**Priority**: P2
**Preconditions**: Signed in; user has bookings.
**Steps**:
1. Open `/admin/bookings`.
2. Inspect the table and total.
**Expected Results**: "Manage Bookings", total count, and columns for reference, customer, event, quantity, total, status, date, and actions are displayed. Only the signed-in user's bookings appear.
**Business Rule**: Admin UI is still scoped to the current user's sandbox.
**Suggested Layer**: E2E

### TC-011: Inspect and cancel a booking in the Admin Bookings page
**Category**: Happy Path
**Priority**: P2
**Preconditions**: Signed in; Admin Bookings table has at least one booking.
**Steps**:
1. Select "View" on a row and inspect the modal.
2. Close it, select "Cancel" on the row, and confirm.
**Expected Results**: Modal fields match the selected booking. After cancellation, its row is removed and total count decreases by one.
**Business Rule**: Admin booking actions operate on the current user's bookings.
**Suggested Layer**: E2E

## Business Rules

### TC-100: Tenth booking prunes the oldest booking for a different event
**Category**: Business Rule
**Priority**: P0
**Preconditions**: User has 9 bookings; oldest is for event X; next booking is for event Y.
**Steps**:
1. Create a valid booking for Y.
2. Fetch the user's list and request the old booking by ID.
**Expected Results**: Creation succeeds; booking count remains 9; the oldest booking for X is gone and the other prior bookings remain.
**Business Rule**: Maximum 9 bookings; FIFO removes the oldest, preferring a different event than the new booking.
**Suggested Layer**: API

### TC-101: FIFO prefers a different event to the overall-oldest booking
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User has 9 bookings; oldest belongs to the event being booked; a later booking belongs to another event.
**Steps**:
1. Create another booking for the oldest booking's event.
2. Check all previous booking IDs.
**Expected Results**: Oldest booking for a different event is pruned first; same-event oldest remains.
**Business Rule**: FIFO pruning excludes the new booking's event when possible.
**Suggested Layer**: API

### TC-102: Same-event FIFO fallback preserves seat accounting
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User has 9 bookings, all for the event being booked; event has enough seats.
**Steps**:
1. Record event seat availability and oldest booking.
2. Create another booking for the same event.
3. Fetch event and bookings.
**Expected Results**: Oldest booking is pruned; new booking exists; personal available seats decrease by the new quantity, not increase due to the replacement.
**Business Rule**: Same-event fallback must maintain the immediate seat reduction invariant.
**Suggested Layer**: API

### TC-103: Booking reference uses event-title prefix and required format
**Category**: Business Rule
**Priority**: P1
**Preconditions**: Signed in; event title begins with a letter.
**Steps**:
1. Create a booking.
2. Inspect `bookingRef`.
**Expected Results**: Reference matches `^[A-Z]-[A-Z0-9]{6}$`; prefix is the uppercase first character of the event title.
**Business Rule**: Reference format is `[FIRST_LETTER]-[6_RANDOM_ALPHANUMERIC]`.
**Suggested Layer**: API

### TC-104: Single-ticket booking is refund-eligible
**Category**: Business Rule
**Priority**: P1
**Preconditions**: Owned booking has quantity 1.
**Steps**:
1. Open booking details and select "Check eligibility for refund?".
2. Wait for the check to finish.
**Expected Results**: After 4 seconds, eligible message says a single-ticket booking qualifies for a full refund.
**Business Rule**: Quantity 1 qualifies for refund according to client-side logic.
**Suggested Layer**: Component

### TC-105: Multi-ticket booking is not refund-eligible
**Category**: Business Rule
**Priority**: P1
**Preconditions**: Owned booking has quantity greater than 1.
**Steps**:
1. Open booking details and run the refund eligibility check.
2. Wait for the check to finish.
**Expected Results**: After 4 seconds, result says group bookings are non-refundable and interpolates the actual ticket count.
**Business Rule**: Quantity greater than 1 is not eligible for refund.
**Suggested Layer**: Component

### TC-106: Refund eligibility check is client-side only
**Category**: Business Rule
**Priority**: P2
**Preconditions**: Owned booking detail page is loaded; network calls can be observed.
**Steps**:
1. Record network requests.
2. Run the refund eligibility check and wait for its result.
**Expected Results**: The result appears after the spinner; no refund API request is sent.
**Business Rule**: Refund eligibility is frontend-only.
**Suggested Layer**: Component

### TC-107: Total price equals ticket price times quantity
**Category**: Business Rule
**Priority**: P1
**Preconditions**: Event price is known; user can book quantity Q.
**Steps**:
1. Create a booking for Q tickets.
2. Compare total price in API response, card, and detail view with event price × Q.
**Expected Results**: All displayed/stored totals equal event price multiplied by Q.
**Business Rule**: `totalPrice = event.price × quantity`.
**Suggested Layer**: API

### TC-108: Booking decreases personal seats and cancellation restores them
**Category**: Business Rule
**Priority**: P0
**Preconditions**: Signed in; event has at least 3 available seats.
**Steps**:
1. Read available seats for the user.
2. Book 2 tickets and reread availability.
3. Cancel that booking and reread availability.
**Expected Results**: Availability drops by 2 after booking and returns to its starting value after cancellation.
**Business Rule**: Booking immediately consumes seats; cancellation frees them.
**Suggested Layer**: API

### TC-109: Clear all restores personal seats
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User has bookings for one or more events.
**Steps**:
1. Record personal availability for affected events.
2. Clear all bookings and reread availability.
**Expected Results**: All user's bookings are removed and personal availability is restored for each affected event.
**Business Rule**: Removing bookings immediately frees booked seats.
**Suggested Layer**: API

### TC-110: Dynamic event seat availability is isolated per user
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User A owns a dynamic event; users A and B have valid tokens.
**Steps**:
1. Read event availability as A and B.
2. A books tickets and both users reread availability.
**Expected Results**: A's personal availability decreases; B's availability is unaffected by A's booking.
**Business Rule**: Dynamic event seats are computed using the requesting user's bookings.
**Suggested Layer**: API

### TC-111: Booking status cannot be set by the client
**Category**: Business Rule
**Priority**: P2
**Preconditions**: Signed in; valid booking data.
**Steps**:
1. Submit booking with a client-supplied `status: "cancelled"`.
2. Inspect the created booking.
**Expected Results**: Created booking status is `confirmed`.
**Business Rule**: Booking status is always confirmed at creation.
**Suggested Layer**: API

### TC-112: Deleting an owned dynamic event cascades to its bookings
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User owns a dynamic event and has booked it.
**Steps**:
1. Record booking ID.
2. Delete the event.
3. Request the booking by ID.
**Expected Results**: Event deletion succeeds and the dependent booking no longer exists.
**Business Rule**: Event deletion cascades to bookings.
**Suggested Layer**: API

### TC-113: Event FIFO pruning cascades to bookings for the pruned event
**Category**: Business Rule
**Priority**: P2
**Preconditions**: User has 6 dynamic events; at least one has a booking.
**Steps**:
1. Record the oldest event and its booking IDs.
2. Create a seventh event.
3. Request the old event and its bookings.
**Expected Results**: Oldest event is pruned; its associated bookings are removed by cascade; six user-created events remain.
**Business Rule**: Maximum 6 user-created events with FIFO replacement; event deletion cascades.
**Suggested Layer**: API

## Security

### TC-200: Cross-user booking detail is denied in the UI
**Category**: Security
**Priority**: P0
**Preconditions**: User A owns booking B; user B is authenticated separately.
**Steps**:
1. As B, navigate to `/bookings/<B.id>`.
**Expected Results**: "Access Denied" is displayed; no booking or customer data is exposed.
**Business Rule**: Cross-user booking access is forbidden.
**Suggested Layer**: E2E

### TC-201: Cross-user booking lookup by ID returns forbidden
**Category**: Security
**Priority**: P0
**Preconditions**: A owns booking B; valid token for user C.
**Steps**:
1. C sends `GET /api/bookings/<B.id>`.
**Expected Results**: 403 response; no booking data is returned.
**Business Rule**: Cross-user booking access returns 403 Forbidden.
**Suggested Layer**: API

### TC-202: Cross-user cancellation cannot delete another user's booking
**Category**: Security
**Priority**: P0
**Preconditions**: A owns booking B; valid token for C.
**Steps**:
1. C sends `DELETE /api/bookings/<B.id>`.
2. A requests B again.
**Expected Results**: C cannot delete B; B remains accessible to A. Domain rule expects 403; current service may return 404 because it looks up by both ID and user ID before its ownership check.
**Business Rule**: Users may cancel only their own bookings.
**Suggested Layer**: API

### TC-203: Cross-user lookup by reference is denied
**Category**: Security
**Priority**: P1
**Preconditions**: A owns booking with reference R; valid token for C.
**Steps**:
1. C sends `GET /api/bookings/ref/R`.
**Expected Results**: 403 response; no booking fields are returned.
**Business Rule**: Reference lookup is scoped to the authenticated user.
**Suggested Layer**: API

### TC-204: Booking identifiers do not reveal another user's booking existence
**Category**: Security
**Priority**: P3
**Preconditions**: C is authenticated; one tested ID/reference belongs to A and one does not exist.
**Steps**:
1. Request both IDs and both references as C.
2. Compare status codes and response bodies.
**Expected Results**: Responses do not provide a useful existence oracle. Current implementation may distinguish existing cross-user records (403) from missing records (404); document and assess this discrepancy.
**Business Rule**: User sandbox isolation; minimize cross-user information disclosure.
**Suggested Layer**: API

### TC-205: Clear all deletes only the caller's bookings
**Category**: Security
**Priority**: P0
**Preconditions**: Users A and B each have bookings.
**Steps**:
1. A sends `DELETE /api/bookings`.
2. Fetch both users' lists.
**Expected Results**: A's bookings are removed; B's bookings remain unchanged.
**Business Rule**: Clear-all operation is scoped by authenticated user ID.
**Suggested Layer**: API

### TC-206: Event filter does not leak another user's bookings
**Category**: Security
**Priority**: P1
**Preconditions**: A and B have bookings for the same event; B has a valid token.
**Steps**:
1. B sends `GET /api/bookings?eventId=<shared event id>`.
**Expected Results**: Only B's bookings are returned.
**Business Rule**: Booking list filters preserve user sandbox isolation.
**Suggested Layer**: API

### TC-207: All booking endpoints require valid authentication
**Category**: Security
**Priority**: P0
**Preconditions**: None.
**Steps**:
1. Call list, detail by ID, detail by reference, create, cancel, and clear-all endpoints without a token.
2. Repeat with malformed and invalid tokens.
**Expected Results**: Every endpoint rejects each unauthenticated request with 401 and returns no booking data or mutations.
**Business Rule**: Booking routes require authentication.
**Suggested Layer**: API

### TC-208: Logged-out navigation to booking pages redirects to login
**Category**: Security
**Priority**: P1
**Preconditions**: Browser is signed out.
**Steps**:
1. Navigate directly to `/bookings`, `/bookings/1`, and `/admin/bookings`.
**Expected Results**: Each protected route redirects to `/login`; booking data is not rendered.
**Business Rule**: Booking management requires an authenticated user.
**Suggested Layer**: E2E

### TC-209: Expired or rejected token clears session and redirects
**Category**: Security
**Priority**: P1
**Preconditions**: Browser has an expired or invalid token; user is viewing bookings.
**Steps**:
1. Trigger a booking API request.
**Expected Results**: Session token is cleared and user is redirected to login; protected booking content is not retained.
**Business Rule**: Invalid authentication cannot continue to access bookings.
**Suggested Layer**: Component

### TC-210: Same-event fallback does not consume shared static-event seats for other users
**Category**: Security
**Priority**: P2
**Preconditions**: User A has 9 bookings all for a static event; user B can view that event.
**Steps**:
1. Record shared event availability for B.
2. A creates a replacement booking for the same event.
3. B rereads event availability.
**Expected Results**: A's operation must not reduce B's shared static-event availability. Current service invokes `decrementSeats` during same-event fallback, which may violate this expectation.
**Business Rule**: Static events are shared; per-user booking activity must not unexpectedly mutate seats for other users.
**Suggested Layer**: API

## Negative / Error

### TC-300: Missing booking displays not-found state
**Category**: Negative
**Priority**: P1
**Preconditions**: Signed in; chosen booking ID does not exist.
**Steps**:
1. Navigate to `/bookings/<missing id>`.
**Expected Results**: "Booking not found" state appears with a link to the user's booking list.
**Business Rule**: Invalid booking lookups return a not-found response.
**Suggested Layer**: Component

### TC-301: Missing booking ID or reference returns 404
**Category**: Negative
**Priority**: P1
**Preconditions**: Valid token; ID and reference do not exist.
**Steps**:
1. Request `GET /api/bookings/<missing id>`.
2. Request `GET /api/bookings/ref/<missing ref>`.
**Expected Results**: Both requests return 404 and no booking data.
**Business Rule**: Unknown bookings are not found.
**Suggested Layer**: API

### TC-302: Malformed booking ID is handled safely
**Category**: Negative
**Priority**: P2
**Preconditions**: Valid token.
**Steps**:
1. Request booking detail and cancellation using a non-numeric ID.
**Expected Results**: Request is rejected as invalid/not found without server error or mutation. Current routes have no evident ID parameter validator; verify actual status and treat 500 as a defect.
**Business Rule**: Invalid IDs must not cause an unhandled server error.
**Suggested Layer**: API

### TC-303: Cancelling an already deleted booking is safe
**Category**: Negative
**Priority**: P1
**Preconditions**: Valid token; booking B has already been cancelled.
**Steps**:
1. Send `DELETE /api/bookings/<B.id>` again.
**Expected Results**: Second request returns 404 and does not affect other bookings.
**Business Rule**: A booking can be cancelled only while it exists.
**Suggested Layer**: API

### TC-304: Failed booking creation does not prune an existing booking
**Category**: Negative
**Priority**: P0
**Preconditions**: User has 9 bookings; next request references a nonexistent event or requests more seats than available.
**Steps**:
1. Record all 9 booking IDs.
2. Submit the invalid booking request.
3. Fetch existing bookings.
**Expected Results**: Creation fails with the relevant 404 or 400; all original bookings remain. Current `createBooking` prunes before event and seat validation, so this is a suspected defect.
**Business Rule**: Failed operations must not destroy valid bookings.
**Suggested Layer**: API

### TC-305: Insufficient seats returns a clear client error
**Category**: Negative
**Priority**: P1
**Preconditions**: Event has N available seats; user requests M > N.
**Steps**:
1. Submit a booking for M tickets.
**Expected Results**: API returns 400 with a message stating available and requested seat counts; no booking is created and seat availability is unchanged.
**Business Rule**: A booking cannot exceed available seats.
**Suggested Layer**: API

### TC-306: Missing or invalid customer fields are rejected
**Category**: Negative
**Priority**: P1
**Preconditions**: Valid token; event exists and has seats.
**Steps**:
1. Submit requests with each required field missing in turn.
2. Submit a name shorter than 2 characters, malformed email, and phone shorter than 10 characters.
**Expected Results**: Each invalid request returns 400 with validation details identifying the field; no booking is created.
**Business Rule**: Customer name, email, and phone are validated before booking.
**Suggested Layer**: API

### TC-307: Invalid ticket quantity is rejected
**Category**: Negative
**Priority**: P1
**Preconditions**: Valid token; event exists.
**Steps**:
1. Submit quantities 0, 11, 2.5, and a non-numeric value.
**Expected Results**: Each request returns 400 and identifies quantity validation; no booking or seat mutation occurs.
**Business Rule**: Quantity must be an integer from 1 through 10.
**Suggested Layer**: API

### TC-308: Booking list failure offers retry
**Category**: Negative
**Priority**: P1
**Preconditions**: Booking-list request fails.
**Steps**:
1. Open `/bookings`.
2. Inspect the error state and select "Retry".
**Expected Results**: "Couldn't load bookings" and retry action appear; retry issues another request and renders data if the API recovers.
**Business Rule**: Booking load failures are visible and recoverable.
**Suggested Layer**: Component

### TC-309: Cancellation failure is surfaced and booking stays visible
**Category**: Negative
**Priority**: P1
**Preconditions**: A booking card is visible; cancellation API responds with an error.
**Steps**:
1. Start cancellation and confirm it.
**Expected Results**: Error toast is shown; booking remains in the list and confirmation dialog is closed or recoverable.
**Business Rule**: Failed cancellation must not present false success or hide the booking.
**Suggested Layer**: Component

### TC-310: Clear-all request is authenticated and errors are surfaced
**Category**: Negative
**Priority**: P0
**Preconditions**: Signed in; user has bookings; clear-all API can be made to fail.
**Steps**:
1. Accept the clear-all confirmation.
2. Inspect the request authorization header.
3. Repeat with the API returning an error.
**Expected Results**: Request includes the user's bearer token. On failure, an explicit error is surfaced and bookings remain visible. Current page has `try/finally` without `catch`, so an error may be unhandled and no error feedback shown.
**Business Rule**: Clear-all is authenticated and failures are not silent.
**Suggested Layer**: E2E

### TC-311: Dismissing clear-all confirmation does not mutate bookings
**Category**: Negative
**Priority**: P2
**Preconditions**: Signed in; user has bookings.
**Steps**:
1. Select "Clear all bookings".
2. Dismiss the browser confirmation.
**Expected Results**: No delete request is sent; button returns to normal; all bookings remain.
**Business Rule**: Destructive action requires confirmation.
**Suggested Layer**: Component

### TC-312: Booking reference lookup case handling is consistent
**Category**: Negative
**Priority**: P3
**Preconditions**: User owns booking with uppercase reference R.
**Steps**:
1. Look up R.
2. Look up the same reference using lowercase characters.
**Expected Results**: API consistently follows documented reference case behavior; document database collation-dependent behavior if case-insensitive.
**Business Rule**: Booking references are unique identifiers.
**Suggested Layer**: API

## Edge Cases

### TC-400: Ninth booking does not trigger pruning
**Category**: Edge Case
**Priority**: P1
**Preconditions**: User has exactly 8 bookings.
**Steps**:
1. Create the ninth valid booking.
2. Check all 9 booking IDs.
**Expected Results**: New booking succeeds and all prior bookings remain; total is 9.
**Business Rule**: FIFO pruning begins only when the 9-booking cap is reached before creation.
**Suggested Layer**: API

### TC-401: Ten bookings from an empty account keep only the newest nine
**Category**: Edge Case
**Priority**: P1
**Preconditions**: User has no bookings; test event(s) have sufficient seats.
**Steps**:
1. Create 10 valid bookings sequentially.
2. Fetch the list and request the first booking by ID.
**Expected Results**: Nine bookings remain; the oldest is gone and the newest is present.
**Business Rule**: User booking limit is 9 with FIFO replacement.
**Suggested Layer**: API

### TC-402: Minimum and maximum allowed quantities succeed
**Category**: Edge Case
**Priority**: P1
**Preconditions**: Event has at least 10 seats.
**Steps**:
1. Create a booking with quantity 1.
2. Create a booking with quantity 10.
**Expected Results**: Both succeed and total prices and seat reductions match their quantities.
**Business Rule**: Valid quantity range is inclusive 1–10.
**Suggested Layer**: API

### TC-403: Refund boundary at quantity two is ineligible
**Category**: Edge Case
**Priority**: P2
**Preconditions**: Owned booking has quantity 2.
**Steps**:
1. Run the refund eligibility check.
**Expected Results**: Result is ineligible; group message says 2 tickets are non-refundable.
**Business Rule**: Only single-ticket bookings qualify.
**Suggested Layer**: Component

### TC-404: Exact remaining seats succeed; one extra fails; cancellation permits rebooking
**Category**: Edge Case
**Priority**: P1
**Preconditions**: User has event with exactly N personal seats available.
**Steps**:
1. Book exactly N tickets.
2. Attempt to book one additional ticket.
3. Cancel the first booking and retry the one-ticket booking.
**Expected Results**: Exact-fit booking succeeds; extra ticket fails with 400; cancellation restores seats and the retry succeeds.
**Business Rule**: Bookings cannot exceed per-user seat availability; cancellation frees seats.
**Suggested Layer**: API

### TC-405: Same user books the same event multiple times
**Category**: Edge Case
**Priority**: P2
**Preconditions**: User has access to an event with enough seats.
**Steps**:
1. Create multiple bookings for the same event, each with valid customer details.
2. Inspect the list and event availability.
**Expected Results**: Multiple bookings are accepted within seat and booking limits; aggregate booked quantity is reflected in personal availability.
**Business Rule**: A user may book the same event more than once.
**Suggested Layer**: API

### TC-406: Clear all when there are no bookings
**Category**: Edge Case
**Priority**: P2
**Preconditions**: Valid token; user has zero bookings.
**Steps**:
1. Send `DELETE /api/bookings`.
**Expected Results**: Request succeeds and reports 0 bookings cleared; no unrelated data is changed.
**Business Rule**: Clear-all is safe for an empty list.
**Suggested Layer**: API

### TC-407: Booking pagination handles boundary parameters safely
**Category**: Edge Case
**Priority**: P2
**Preconditions**: Valid token; user has bookings.
**Steps**:
1. Request page 1, a page beyond the last page, page 0, a negative page, limit 0, and a negative limit.
**Expected Results**: Valid pages return consistent pagination metadata; invalid values are normalized or rejected with 400, not a server error. Current service defaults page/limit using `Number(value) || default`, while negative values may reach Prisma and error.
**Business Rule**: Pagination must not produce invalid server queries.
**Suggested Layer**: API

### TC-408: Reference prefix with non-letter event title
**Category**: Edge Case
**Priority**: P2
**Preconditions**: Test event title begins with a digit or punctuation.
**Steps**:
1. Book the event.
2. Inspect the generated reference.
**Expected Results**: Reference follows the documented title-first-character rule, uppercased, with six random alphanumeric characters. Verify URL encoding when looking up punctuation-prefixed references.
**Business Rule**: Reference begins with the event title's first character.
**Suggested Layer**: Unit

### TC-409: Customer email normalization is applied
**Category**: Edge Case
**Priority**: P2
**Preconditions**: Valid token and event; submit an email with surrounding whitespace and uppercase characters.
**Steps**:
1. Create the booking.
2. Inspect the stored customer email.
**Expected Results**: The email is normalized by validation and the normalized value appears consistently in API and UI.
**Business Rule**: Customer email must be valid; validator normalizes it.
**Suggested Layer**: API

### TC-410: Phone validation rejects values without ten digits
**Category**: Edge Case
**Priority**: P1
**Preconditions**: Valid token and event.
**Steps**:
1. Submit a phone value containing at least 10 punctuation/space characters but fewer than 10 digits.
**Expected Results**: Request should fail because the domain rule requires at least 10 digits. Current validator checks character length and permitted characters, so all-symbol values may pass; flag this as a suspected defect.
**Business Rule**: Customer phone must contain at least 10 digits.
**Suggested Layer**: API

### TC-411: Leave the page while refund check is running
**Category**: Edge Case
**Priority**: P2
**Preconditions**: Owned booking detail page is open.
**Steps**:
1. Start refund eligibility check.
2. Navigate away before the 4-second timer completes.
**Expected Results**: Navigation succeeds without visible errors, stale state updates, or unhandled exceptions.
**Business Rule**: Refund check has a bounded 4-second checking state.
**Suggested Layer**: Component

### TC-412: Open a booking detail URL after FIFO has pruned it
**Category**: Edge Case
**Priority**: P2
**Preconditions**: User's booking B was pruned by FIFO.
**Steps**:
1. Navigate directly to `/bookings/<B.id>`.
**Expected Results**: "Booking not found" state appears; no stale booking details are shown.
**Business Rule**: FIFO deletion removes the old booking from subsequent lookups.
**Suggested Layer**: API

## UI State

### TC-500: Bookings list loading skeleton
**Category**: UI State
**Priority**: P2
**Preconditions**: Booking-list request is delayed.
**Steps**:
1. Open `/bookings` while the request is pending.
**Expected Results**: Loading skeleton cards appear and are replaced by results when the request completes.
**Business Rule**: Loading state is shown while bookings are being fetched.
**Suggested Layer**: Component

### TC-501: Empty bookings state and browse action
**Category**: UI State
**Priority**: P1
**Preconditions**: Signed in; user has zero bookings.
**Steps**:
1. Open `/bookings`.
**Expected Results**: "No bookings yet" empty state is shown with a "Browse Events" link to `/events`.
**Business Rule**: Empty booking list provides a next step.
**Suggested Layer**: Component

### TC-502: Booking detail loading state
**Category**: UI State
**Priority**: P2
**Preconditions**: Booking detail request is delayed.
**Steps**:
1. Open an owned booking detail URL while the request is pending.
**Expected Results**: Centered loading spinner appears and is replaced by details when loaded.
**Business Rule**: Booking detail shows a loading state while fetching.
**Suggested Layer**: Component

### TC-503: Cancel confirmation dialog content and dismissal
**Category**: UI State
**Priority**: P2
**Preconditions**: A confirmed booking is visible.
**Steps**:
1. Select "Cancel Booking".
2. Inspect dialog text, then close or dismiss without confirming.
**Expected Results**: Dialog identifies the booking and seats to be released; dismissal sends no request and leaves the booking visible.
**Business Rule**: Destructive cancellation is confirmed before execution.
**Suggested Layer**: Component

### TC-504: Confirm dialog blocks duplicate action while cancellation is pending
**Category**: UI State
**Priority**: P2
**Preconditions**: Cancellation request can be held pending.
**Steps**:
1. Open the cancel dialog and confirm.
2. While request is pending, attempt to confirm again, press Escape, or select Cancel.
**Expected Results**: Confirm action is disabled and dialog cannot be dismissed into an inconsistent state until the request resolves.
**Business Rule**: A pending cancellation cannot be submitted repeatedly.
**Suggested Layer**: Component

### TC-505: Clear-all button shows pending state
**Category**: UI State
**Priority**: P2
**Preconditions**: Clear-all request is held pending.
**Steps**:
1. Confirm "Clear all bookings".
2. Inspect the button before the response returns.
**Expected Results**: Button reads "Clearing…" and is disabled until completion.
**Business Rule**: Clear-all communicates its in-progress state.
**Suggested Layer**: Component

### TC-506: Refund widget transitions through all states
**Category**: UI State
**Priority**: P2
**Preconditions**: Owned booking details are loaded.
**Steps**:
1. Inspect refund section before interaction.
2. Start check; inspect immediately and before 4 seconds.
3. Advance beyond 4 seconds.
4. Try to start another check.
**Expected Results**: State transitions idle → checking → eligible/ineligible result; result is stable and check cannot be run again unless reset by navigation.
**Business Rule**: Refund check displays a 4-second spinner before the result.
**Suggested Layer**: Component

### TC-507: Non-confirmed booking has no cancel action
**Category**: UI State
**Priority**: P2
**Preconditions**: Booking data has a non-confirmed status.
**Steps**:
1. Render the booking in list, detail, and Admin Bookings views.
**Expected Results**: Cancel action is hidden for the non-confirmed booking; status uses the non-confirmed/danger presentation.
**Business Rule**: Cancellation action is available only for confirmed bookings.
**Suggested Layer**: Component

### TC-508: Admin status filter updates rows and pagination
**Category**: UI State
**Priority**: P2
**Preconditions**: Admin Bookings has records in more than one status and multiple pages.
**Steps**:
1. Navigate to a later page.
2. Select the "Cancelled" status filter.
**Expected Results**: Filtered results match the selected status and page resets to 1; empty state appears if there are no matches.
**Business Rule**: Admin list supports status filtering.
**Suggested Layer**: Component

### TC-509: Booking pagination visibility is consistent at one and multiple pages
**Category**: UI State
**Priority**: P3
**Preconditions**: Test the list with one page and then enough records for multiple pages.
**Steps**:
1. Open `/bookings` and `/admin/bookings` with one page of results.
2. Repeat when pagination spans multiple pages.
**Expected Results**: Page navigation works when multiple pages exist; a single-page control, if rendered, has no misleading navigation. Record the current difference: user page renders Pagination whenever metadata exists; admin page may hide it for one page.
**Business Rule**: Bookings pages show the user's available bookings with usable pagination.
**Suggested Layer**: Component

### TC-510: Bookings-page sandbox limit warning
**Category**: UI State
**Priority**: P2
**Preconditions**: User has 8 or 9 bookings.
**Steps**:
1. Open `/bookings`.
**Expected Results**: Domain rules describe a conditional warning about the 9-booking sandbox limit. Current `frontend/app/bookings/page.tsx` contains no such banner; confirm whether this is a missing feature or outdated documentation.
**Business Rule**: Sandbox warning banner should inform users near the booking limit.
**Suggested Layer**: E2E

### TC-511: Booking list refreshes after cancellation from details
**Category**: UI State
**Priority**: P1
**Preconditions**: User has at least two bookings.
**Steps**:
1. Open the list and a booking detail page.
2. Cancel one booking and return to the list.
3. Visit the corresponding event page.
**Expected Results**: Cancelled booking disappears without a hard reload; remaining cards stay visible and seat availability reflects the cancellation.
**Business Rule**: Successful cancellation invalidates booking and event data.
**Suggested Layer**: E2E

## Coverage Summary

| Category | Count | IDs |
|---|---:|---|
| Category | Booking | Event management | Total |
|---|---:|---:|---:|
| Happy Path | 11 | 6 | 17 |
| Business Rule | 14 | 8 | 22 |
| Security | 11 | 5 | 16 |
| Negative | 13 | 8 | 21 |
| Edge Case | 13 | 6 | 19 |
| UI State | 12 | 7 | 19 |
| **Total** | **74** | **40** | **114** |

## Event Management — Create and Manage Events

### Happy Path

### TC-012: Create an event from the Admin Events form
**Category**: Happy Path
**Priority**: P0
**Preconditions**: Signed in; fewer than 6 user-created events.
**Steps**:
1. Open `/admin/events`.
2. Enter a title, description, category, city, venue, future date/time, non-negative price, and positive seat count.
3. Submit the form.
**Expected Results**: "Event created!" toast appears; the form resets; the new event appears in the table with matching details and available seats equal to total seats.
**Business Rule**: Users can create events with required event details; new events start with all seats available.
**Suggested Layer**: E2E

### TC-013: Create an event through the API
**Category**: Happy Path
**Priority**: P1
**Preconditions**: Valid token; user has fewer than 6 dynamic events.
**Steps**:
1. Send `POST /api/events` with valid event data.
2. Fetch the new event by ID and in the event list.
**Expected Results**: 201 response includes the created event; owner is the authenticated user; event is dynamic, `availableSeats` equals `totalSeats`, and it is visible to its owner.
**Business Rule**: Created events belong to the caller and initialize available seats from total seats.
**Suggested Layer**: API

### TC-014: Create an event with optional description and image omitted
**Category**: Happy Path
**Priority**: P2
**Preconditions**: Signed in; fewer than 6 dynamic events.
**Steps**:
1. Submit a valid event with the required fields and leave description and image URL empty.
**Expected Results**: Event is created; omitted description is stored as empty text and image URL is null or absent.
**Business Rule**: Description and image URL are optional.
**Suggested Layer**: API

### TC-015: Create an event with each supported category
**Category**: Happy Path
**Priority**: P2
**Preconditions**: Signed in; event limit has room.
**Steps**:
1. Create an event for each category: Conference, Concert, Sports, Workshop, and Festival.
**Expected Results**: All events are created and each category is displayed correctly in the events list and Admin Events table.
**Business Rule**: Event categories supported by the product are available for selection.
**Suggested Layer**: API

### TC-016: Find a newly created event on the public event list
**Category**: Happy Path
**Priority**: P1
**Preconditions**: Signed in; a dynamic event was created by the current user.
**Steps**:
1. Open `/events`.
2. Search for the event title or venue.
**Expected Results**: The newly created event appears with the correct title and details and can be opened from the list.
**Business Rule**: Users can browse and search their own events along with shared static events.
**Suggested Layer**: E2E

### TC-017: Edit an owned event using the prefilled form
**Category**: Happy Path
**Priority**: P1
**Preconditions**: Signed in; user owns a dynamic event.
**Steps**:
1. Open `/admin/events` and select Edit for the event.
2. Verify form values are prefilled; change title or description and submit.
**Expected Results**: "Event updated!" toast appears; updated values appear in the table and public event list; unchanged fields retain their prior values.
**Business Rule**: Owners can edit their dynamic events.
**Suggested Layer**: E2E

### Business Rules

### TC-114: Seventh dynamic event replaces the oldest of the user's six
**Category**: Business Rule
**Priority**: P0
**Preconditions**: User owns exactly 6 dynamic events; at least one other user's dynamic event and shared static events also exist.
**Steps**:
1. Record the current user's oldest event ID and the other user's event ID.
2. Create a seventh event as the current user.
3. Fetch the old event, new event, and other user's event.
**Expected Results**: New event is created; current user has 6 dynamic events; their oldest event is gone; the other user's event and shared static events remain.
**Business Rule**: Maximum 6 user-created events per account; FIFO pruning applies only to the current user's dynamic events, not static or other-user events.
**Suggested Layer**: API

### TC-115: Static events do not count toward the six-event limit
**Category**: Business Rule
**Priority**: P1
**Preconditions**: Seeded static events are available; user owns 5 dynamic events.
**Steps**:
1. Create a sixth dynamic event.
2. Check all static and dynamic event IDs.
**Expected Results**: Creation succeeds without pruning a static event; all seeded static events remain.
**Business Rule**: Static events are shared and excluded from the per-user dynamic event limit.
**Suggested Layer**: API

### TC-116: Event create and edit persist date, price, category, and seat values
**Category**: Business Rule
**Priority**: P1
**Preconditions**: Signed in; event is eligible for creation or editing.
**Steps**:
1. Create an event with a known future date/time, price, category, and seat count.
2. Fetch it through the API and inspect its Admin Events row.
3. Edit these values and fetch it again.
**Expected Results**: API and UI values match submitted values; date/time is stored consistently; price and total seats are not silently altered.
**Business Rule**: Event details supplied by the owner are persisted.
**Suggested Layer**: API

### TC-117: Event deletion cascades to its bookings
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User owns a dynamic event with at least one booking.
**Steps**:
1. Record event and booking IDs.
2. Delete the event as its owner.
3. Fetch the event and booking.
**Expected Results**: Event is deleted; associated bookings are removed and cannot be retrieved.
**Business Rule**: Deleting an event cascades to associated bookings.
**Suggested Layer**: API

### TC-118: Event list ordering places static events before dynamic events
**Category**: Business Rule
**Priority**: P2
**Preconditions**: Static events and one or more dynamic events are visible to the user.
**Steps**:
1. Request `GET /api/events` and inspect list ordering.
**Expected Results**: Static events appear before dynamic events; dynamic events are ordered newest first.
**Business Rule**: Event list ordering is static-first, then newest-created dynamic events.
**Suggested Layer**: API

### TC-119: New event becomes searchable by title, description, and venue
**Category**: Business Rule
**Priority**: P2
**Preconditions**: User owns an event with unique title, description, and venue text.
**Steps**:
1. Search the event list separately using a distinctive title term, description term, and venue term.
**Expected Results**: The event appears for each matching search term; unrelated events are excluded from the filtered results.
**Business Rule**: Event search covers title, description, and venue.
**Suggested Layer**: API

### TC-120: Event filters combine category, city, and search
**Category**: Business Rule
**Priority**: P2
**Preconditions**: Visible events exist across multiple categories/cities with unique text.
**Steps**:
1. Apply a category filter and city filter together.
2. Add a search term that matches one event.
**Expected Results**: Results satisfy all active filters and search; filter changes reset pagination to page 1.
**Business Rule**: Event list supports category, city, search, and pagination filters.
**Suggested Layer**: API

### TC-121: Event update changes only submitted fields when valid
**Category**: Business Rule
**Priority**: P2
**Preconditions**: Valid token; user owns a dynamic event.
**Steps**:
1. Send a valid full event payload to `PUT /api/events/<id>` with one changed field.
2. Fetch the event.
**Expected Results**: Update succeeds and the changed value is persisted. Since the current route applies create validation to PUT, the request must include every required field; a partial payload is expected to receive 400 unless the API behavior is deliberately changed.
**Business Rule**: Owners can update dynamic event details; update input is currently validated with create-event requirements.
**Suggested Layer**: API

### Security

### TC-211: Event routes require authentication
**Category**: Security
**Priority**: P0
**Preconditions**: No valid token.
**Steps**:
1. Call event list, event detail, create, update, and delete endpoints without a token.
2. Repeat with malformed and invalid tokens.
**Expected Results**: Every endpoint rejects the request with 401 and no event is exposed or mutated.
**Business Rule**: Event endpoints require authentication.
**Suggested Layer**: API

### TC-212: User cannot see another user's dynamic event
**Category**: Security
**Priority**: P0
**Preconditions**: User A owns a dynamic event; user B has a separate valid token.
**Steps**:
1. Request `GET /api/events` as B.
2. Request `GET /api/events/<A's event id>` as B.
**Expected Results**: A's event is absent from B's list; direct detail request returns 404 and does not expose the event.
**Business Rule**: Each user sees only their own dynamic events; static events are shared.
**Suggested Layer**: API

### TC-213: User cannot update another user's dynamic event
**Category**: Security
**Priority**: P0
**Preconditions**: A owns a dynamic event; B has a valid token.
**Steps**:
1. B sends `PUT /api/events/<A's event id>` with changed event fields.
2. A fetches the event.
**Expected Results**: Update is denied (currently expected 404 because owner-scoped lookup does not find it); A's original event remains unchanged.
**Business Rule**: Only the owner can edit a dynamic event.
**Suggested Layer**: API

### TC-214: User cannot delete another user's dynamic event
**Category**: Security
**Priority**: P0
**Preconditions**: A owns a dynamic event; B has a valid token.
**Steps**:
1. B sends `DELETE /api/events/<A's event id>`.
2. A fetches the event and its bookings.
**Expected Results**: Delete is denied (currently expected 404); event and its bookings remain unchanged and accessible to A.
**Business Rule**: Only the owner can delete a dynamic event.
**Suggested Layer**: API

### TC-215: Static event is read-only for every user
**Category**: Security
**Priority**: P1
**Preconditions**: A seeded static event exists; valid tokens for users A and B.
**Steps**:
1. A attempts to update the static event.
2. B attempts to delete the static event.
3. Fetch the event as either user.
**Expected Results**: Update and delete each return 403 with a static-event immutability error; the event remains unchanged and visible to both users.
**Business Rule**: Static seeded events are shared, immutable, and cannot be deleted.
**Suggested Layer**: API

### Negative / Error

### TC-313: Missing required event fields are rejected
**Category**: Negative
**Priority**: P1
**Preconditions**: Valid token; fewer than 6 user-created events.
**Steps**:
1. Submit create requests with title, category, venue, city, event date, price, or total seats omitted in turn.
**Expected Results**: Each request returns 400 with validation details naming the missing field; no event is created and no existing event is pruned.
**Business Rule**: Title, category, venue, city, event date, price, and total seats are required.
**Suggested Layer**: API

### TC-314: Blank required text fields are rejected after trimming
**Category**: Negative
**Priority**: P1
**Preconditions**: Valid token.
**Steps**:
1. Submit event data with whitespace-only title, category, venue, or city, one field per request.
**Expected Results**: Each request returns 400 and identifies the invalid field; no event is created.
**Business Rule**: Required event text fields must not be blank.
**Suggested Layer**: API

### TC-315: Past or invalid event date is rejected
**Category**: Negative
**Priority**: P1
**Preconditions**: Valid token.
**Steps**:
1. Submit a date in the past.
2. Submit the current date/time or a malformed/non-ISO date.
**Expected Results**: Each request returns 400 with a date validation message; no event is created.
**Business Rule**: Event date must be valid ISO 8601 and in the future.
**Suggested Layer**: API

### TC-316: Invalid price and seat counts are rejected
**Category**: Negative
**Priority**: P1
**Preconditions**: Valid token.
**Steps**:
1. Submit price values below zero, non-numeric, and non-finite.
2. Submit total seats values 0, negative, fractional, and non-numeric.
**Expected Results**: Each request returns 400; price must be a non-negative number and total seats a positive integer; no event is created.
**Business Rule**: Price ≥ 0 and total seats ≥ 1 as an integer.
**Suggested Layer**: API

### TC-317: Invalid optional image URL is rejected
**Category**: Negative
**Priority**: P2
**Preconditions**: Valid token.
**Steps**:
1. Submit an otherwise-valid event with a malformed non-empty image URL.
**Expected Results**: API returns 400 with an image URL validation detail; no event is created.
**Business Rule**: A provided image URL must be a valid URL.
**Suggested Layer**: API

### TC-318: Edit and delete non-existent event IDs return not found
**Category**: Negative
**Priority**: P1
**Preconditions**: Valid token; tested event ID does not exist.
**Steps**:
1. Send valid `PUT` data to `/api/events/<missing id>`.
2. Send `DELETE /api/events/<missing id>`.
**Expected Results**: Both return 404 with no server error and no event mutation.
**Business Rule**: Mutations require an existing event owned by the caller.
**Suggested Layer**: API

### TC-319: Server-side creation failure does not prune the user's oldest event
**Category**: Negative
**Priority**: P1
**Preconditions**: User owns 6 dynamic events; event repository create can be made to fail after validation.
**Steps**:
1. Record all six event IDs.
2. Submit a valid seventh event while forcing persistence failure.
3. Fetch the original six IDs.
**Expected Results**: Creation failure is explicit and all six original events remain. Current service prunes before persistence, so this scenario may reveal a destructive failure-path defect.
**Business Rule**: Failed event creation should not destroy an existing event.
**Suggested Layer**: API

### TC-320: Event API error is shown in the create/edit form
**Category**: Negative
**Priority**: P1
**Preconditions**: Admin event form is open; create or update request returns an error.
**Steps**:
1. Submit otherwise-valid event data.
2. Return a server validation or authorization error.
**Expected Results**: Error toast shows the API message; form data remains available for correction; success toast and form reset do not occur.
**Business Rule**: Failed event mutation must be surfaced without losing user input.
**Suggested Layer**: Component

### Edge Cases

### TC-413: Zero event price and one seat are valid boundaries
**Category**: Edge Case
**Priority**: P1
**Preconditions**: Valid token; event limit has room.
**Steps**:
1. Create event with price 0 and total seats 1.
**Expected Results**: Event is created; price is zero; total and available seats are both 1.
**Business Rule**: Price may be zero; total seats must be at least one.
**Suggested Layer**: API

### TC-414: Create the sixth event without pruning; seventh triggers FIFO
**Category**: Edge Case
**Priority**: P1
**Preconditions**: User owns 5 dynamic events.
**Steps**:
1. Create event number 6 and verify prior events remain.
2. Create event number 7 and inspect the six remaining events.
**Expected Results**: Sixth creation leaves all 6 events intact. Seventh creation leaves exactly 6 and removes only the oldest event owned by the user.
**Business Rule**: The cap is 6 and FIFO pruning starts only when creating beyond the cap.
**Suggested Layer**: API

### TC-415: Event pagination handles first, last, and out-of-range pages
**Category**: Edge Case
**Priority**: P2
**Preconditions**: More events exist than one page can display.
**Steps**:
1. Request the first and last valid pages.
2. Request a page beyond the last page, page 0, and a negative page.
**Expected Results**: Valid pages return consistent pagination metadata. Out-of-range/invalid values are handled without a server crash; current code does not visibly validate page values, so verify whether Prisma rejects invalid offsets.
**Business Rule**: Event lists are paginated and invalid pagination must not fail as an unhandled server error.
**Suggested Layer**: API

### TC-416: Editing seat capacity after bookings does not expose negative availability
**Category**: Edge Case
**Priority**: P2
**Preconditions**: User owns a dynamic event with existing bookings; booked quantity is greater than zero.
**Steps**:
1. Edit total seats to a value below the booked quantity.
2. Fetch event as owner and inspect availability.
**Expected Results**: Availability is never negative and no previously confirmed bookings disappear. Current personal-seat calculation clamps to zero; verify whether lowering capacity below booked quantity should be rejected or allowed.
**Business Rule**: Event seat availability is derived from capacity and bookings and cannot be negative.
**Suggested Layer**: API

### TC-417: Optional text and image inputs are trimmed and handled consistently
**Category**: Edge Case
**Priority**: P2
**Preconditions**: Valid token and future event date.
**Steps**:
1. Submit a valid event with surrounding whitespace in required text and optional description/image values.
2. Fetch the event.
**Expected Results**: Required fields are trimmed by validation; description is trimmed when supplied; optional image URL is stored consistently with the submitted URL.
**Business Rule**: Event input normalization should produce stable stored values.
**Suggested Layer**: API

### TC-418: Unknown non-empty category behavior is explicit
**Category**: Edge Case
**Priority**: P2
**Preconditions**: Valid token.
**Steps**:
1. Submit an event using a non-empty category outside the five listed categories.
**Expected Results**: The API should reject unsupported categories if categories are a closed domain set. Current validator only checks non-empty text and may accept it; confirm whether categories are intentionally extensible or flag the mismatch.
**Business Rule**: The user-facing category choices are Conference, Concert, Sports, Workshop, and Festival.
**Suggested Layer**: API

### UI State

### TC-512: Admin Events page shows loading and empty states
**Category**: UI State
**Priority**: P2
**Preconditions**: Event-list request can be delayed or returns no visible events.
**Steps**:
1. Open `/admin/events` while the list request is pending.
2. Repeat with an empty event list.
**Expected Results**: Loading spinner is shown while pending; empty state says "No events yet" and directs the user to create the first event.
**Business Rule**: Event management provides loading and empty states.
**Suggested Layer**: Component

### TC-513: Event form displays required-field validation
**Category**: UI State
**Priority**: P1
**Preconditions**: `/admin/events` is open.
**Steps**:
1. Submit the form with required inputs empty.
2. Enter invalid date, negative price, and zero seats, then submit again.
**Expected Results**: Field-level messages appear for each invalid value; request is not sent until client-side validation succeeds.
**Business Rule**: Required fields, future date, non-negative price, and positive seat count are validated in the form.
**Suggested Layer**: Component

### TC-514: Event form displays pending and success states
**Category**: UI State
**Priority**: P2
**Preconditions**: Create-event request can be held pending.
**Steps**:
1. Submit a valid new event.
2. Inspect the submit button while pending and after success.
**Expected Results**: Button shows loading/disabled state during submission; success toast appears, form resets, and the new event appears in the list after query refresh.
**Business Rule**: Event creation communicates progress and updates event data on success.
**Suggested Layer**: Component

### TC-515: Edit mode prepopulates fields and can be cancelled
**Category**: UI State
**Priority**: P2
**Preconditions**: User owns a dynamic event visible in Admin Events.
**Steps**:
1. Select Edit.
2. Verify current values and select "Cancel edit".
**Expected Results**: Form switches to Edit Event mode with existing values; cancelling exits edit mode without sending an update or changing event data.
**Business Rule**: Owners can enter and exit event editing without unintended mutation.
**Suggested Layer**: Component

### TC-516: Static events are visibly read-only in Admin Events
**Category**: UI State
**Priority**: P1
**Preconditions**: Static events are present in the Admin Events table.
**Steps**:
1. Inspect a static event row.
**Expected Results**: Row shows "Featured" and "Read-only"; Edit and Delete controls are absent.
**Business Rule**: Static events cannot be modified or deleted.
**Suggested Layer**: Component

### TC-517: Event delete requires confirmation and rolls back on failure
**Category**: UI State
**Priority**: P1
**Preconditions**: User owns a dynamic event; delete request can be held pending or made to fail.
**Steps**:
1. Select Delete and inspect the confirmation dialog.
2. Dismiss it and verify no request is sent.
3. Reopen, confirm deletion, and simulate a server error.
**Expected Results**: Dialog warns event and associated bookings will be deleted. Dismissal preserves event; while pending the action shows loading; on failure the optimistically removed row is restored and an error toast appears.
**Business Rule**: Event deletion is destructive, confirmed, and failure must preserve visible state.
**Suggested Layer**: Component

### TC-518: Events list search and filter UI updates URL and results
**Category**: UI State
**Priority**: P2
**Preconditions**: Events exist across categories/cities and search terms.
**Steps**:
1. Enter a search term and wait for debounce.
2. Select a category and city.
3. Select "Clear filters".
**Expected Results**: URL reflects active filters; results update; filtering resets page to 1; clearing removes filter query parameters and restores the unfiltered list.
**Business Rule**: Browse-events controls support search, category/city filters, and pagination.
**Suggested Layer**: Component
