import { test, expect } from '@playwright/test';
import {
  apiLogin,
  clearBookingsViaApi,
  createBookingViaApi,
  getBookingsViaApi,
  signInBrowser,
} from './fixtures/api.js';

const CUSTOMER = {
  customerName:  'Test User',
  customerEmail: 'testuser@example.com',
  customerPhone: '9876543210',
};

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Books the first available (non-sold-out) event through the UI.
 * Returns { bookingRef, eventTitle } from the confirmation card.
 * Precondition: browser is signed in.
 */
async function bookEventViaUi(page) {
  await page.goto('/events');

  // Pick the first card that has a "Book Now" button (not sold out)
  const firstCard = page.getByTestId('event-card').filter({
    has: page.getByTestId('book-now-btn'),
  }).first();
  await expect(firstCard).toBeVisible();

  // Capture title before navigating away
  const eventTitle = (await firstCard.getByRole('heading', { level: 3 }).textContent())?.trim() ?? '';

  await firstCard.getByTestId('book-now-btn').click();
  await expect(page).toHaveURL(/\/events\/\d+/);

  await page.getByLabel('Full Name').fill(CUSTOMER.customerName);
  await page.getByTestId('customer-email').fill(CUSTOMER.customerEmail);
  await page.getByPlaceholder('+91 98765 43210').fill(CUSTOMER.customerPhone);
  await page.getByRole('button', { name: 'Confirm Booking' }).click();

  const refEl = page.locator('.booking-ref').first();
  await expect(refEl).toBeVisible();
  const bookingRef = (await refEl.textContent())?.trim() ?? '';
  return { bookingRef, eventTitle };
}

// ── Test Suite ─────────────────────────────────────────────────────────────────

test.describe('Booking Management — UI Journeys', () => {
  let token;

  test.beforeEach(async ({ page, request }) => {
    token = await apiLogin(request);
    await clearBookingsViaApi(request, token);
    await signInBrowser(page, token);
  });

  // TC-008 (+ TC-103 consistency) ─────────────────────────────────────────────
  test('TC-008: View My Bookings after booking lists the new booking first with the same ref', async ({ page }) => {
    // -- Step 1: Book an event through the UI --
    const { bookingRef, eventTitle } = await bookEventViaUi(page);

    // -- Step 2: Ref prefix is the event title's first letter, uppercased (TC-103) --
    const prefix = escapeRegExp(eventTitle[0].toUpperCase());
    expect(bookingRef).toMatch(new RegExp(`^${prefix}-[A-Z0-9]{6}$`));

    // -- Step 3: Follow "View My Bookings" from the confirmation card --
    await page.getByRole('link', { name: 'View My Bookings' }).click();
    await expect(page).toHaveURL(/\/bookings$/);

    // -- Step 4: New booking is the first card and shows the same ref --
    const firstCard = page.getByTestId('booking-card').first();
    await expect(firstCard.locator('.booking-ref')).toHaveText(bookingRef);
    await expect(firstCard).toContainText(eventTitle);
  });

  // TC-005 (+ TC-310) ─────────────────────────────────────────────────────────
  test('TC-005: Clear all bookings sends an authenticated request and shows the empty state', async ({ page, request }) => {
    // -- Step 1: Seed two bookings --
    await createBookingViaApi(request, token, { quantity: 1, customer: CUSTOMER });
    await createBookingViaApi(request, token, { quantity: 1, customer: CUSTOMER });

    await page.goto('/bookings');
    await expect(page.getByTestId('booking-card')).toHaveCount(2);

    // -- Step 2: Clear all, accepting the native confirm() --
    page.once('dialog', (dialog) => dialog.accept());
    const clearRequest = page.waitForRequest(
      (req) => req.method() === 'DELETE' && /\/api\/bookings$/.test(req.url()),
    );
    await page.getByRole('button', { name: 'Clear all bookings' }).click();

    // -- Step 3: Request carries the JWT (TC-310) --
    expect((await clearRequest).headers()['authorization']).toBe(`Bearer ${token}`);

    // -- Step 4: Empty state in the UI and on the server --
    await expect(page.getByText('No bookings yet')).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: 'Browse Events' })).toBeVisible();
    expect((await getBookingsViaApi(request, token)).pagination.total).toBe(0);
  });
});
