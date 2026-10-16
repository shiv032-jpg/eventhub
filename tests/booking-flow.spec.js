import { test, expect } from '@playwright/test';
import {
  API_URL,
  authHeaders,
  apiLogin,
  clearBookingsViaApi,
  createBookingViaApi,
  signInBrowser,
} from './fixtures/api.js';

const CUSTOMER = {
  customerName:  'Booking Flow QA',
  customerEmail: 'booking.flow.qa@example.com',
  customerPhone: '9876543210',
};
const QUANTITY = 2;

// Mirrors fmt_price in BookingCard.jsx / bookings/[id]/page.tsx
const formatPrice = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

// ── Test Suite ─────────────────────────────────────────────────────────────────

test.describe('Booking Flow — Critical E2E Journeys', () => {
  let token;
  let booking;

  test.beforeEach(async ({ page, request }) => {
    token = await apiLogin(request);
    await clearBookingsViaApi(request, token);
    booking = await createBookingViaApi(request, token, { quantity: QUANTITY, customer: CUSTOMER });
    await signInBrowser(page, token);
  });

  // TC-001 ───────────────────────────────────────────────────────────────────
  test('TC-001: bookings list shows the booking card with its details', async ({ page }) => {
    // -- Step 1: Open My Bookings --
    await page.goto('/bookings');
    await expect(page.getByRole('heading', { name: 'My Bookings' })).toBeVisible();

    // -- Step 2: Exactly one card, matching the seeded booking --
    const cards = page.getByTestId('booking-card');
    await expect(cards).toHaveCount(1);
    const card = cards.filter({ has: page.locator('.booking-ref', { hasText: booking.bookingRef }) });
    await expect(card).toBeVisible();

    // -- Step 3: Card fields --
    await expect(card.getByTestId('booking-id')).toHaveText(`#${booking.id}`);
    await expect(card).toContainText('confirmed');
    await expect(card).toContainText(booking.event.title);
    await expect(card).toContainText(`${QUANTITY} tickets`);
    await expect(card).toContainText(booking.event.city);
    await expect(card).toContainText(formatPrice(booking.totalPrice));

    // -- Step 4: Card actions --
    await expect(card.getByRole('link', { name: 'View Details' })).toBeVisible();
    await expect(card.getByTestId('cancel-booking-btn')).toBeVisible();
  });

  // TC-002 ───────────────────────────────────────────────────────────────────
  test('TC-002: View Details opens the booking detail page with all sections', async ({ page }) => {
    // -- Step 1: Navigate from the list to the detail page --
    await page.goto('/bookings');
    const card = page.getByTestId('booking-card').filter({ hasText: booking.bookingRef });
    await card.getByRole('link', { name: 'View Details' }).click();
    await expect(page).toHaveURL(new RegExp(`/bookings/${booking.id}$`));

    // -- Step 2: Breadcrumb and header --
    const breadcrumb = page.getByRole('navigation').filter({ hasText: booking.bookingRef });
    await expect(breadcrumb.getByRole('link', { name: 'My Bookings' })).toHaveAttribute('href', '/bookings');
    await expect(page.getByRole('heading', { level: 1, name: booking.event.title })).toBeVisible();

    // -- Step 3: Event, customer, payment and metadata sections --
    for (const section of ['Event Details', 'Customer Details', 'Payment Summary', 'Booking Information']) {
      await expect(page.getByRole('heading', { level: 2, name: section })).toBeVisible();
    }
    await expect(page.getByText(booking.event.venue)).toBeVisible();
    await expect(page.getByText(CUSTOMER.customerName)).toBeVisible();
    await expect(page.getByText(CUSTOMER.customerEmail)).toBeVisible();
    await expect(page.getByText(CUSTOMER.customerPhone)).toBeVisible();
    await expect(page.getByText('Total Paid')).toBeVisible();
    await expect(page.getByText(formatPrice(booking.totalPrice), { exact: true })).toBeVisible();
    await expect(page.getByText(`#${booking.id}`)).toBeVisible();

    // -- Step 4: Refund check entry point --
    await expect(page.getByTestId('check-refund-btn')).toBeVisible();
  });

  // TC-003 (+ TC-511) ────────────────────────────────────────────────────────
  test('TC-003: cancelling from the detail page shows a toast, redirects and removes the booking', async ({ page, request }) => {
    // -- Step 1: Open the booking detail page --
    await page.goto(`/bookings/${booking.id}`);
    await expect(page.getByRole('heading', { level: 1, name: booking.event.title })).toBeVisible();

    // -- Step 2: Open the confirm dialog --
    await page.getByRole('button', { name: 'Cancel Booking', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Cancel this booking?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(booking.bookingRef);
    await expect(dialog).toContainText(`release ${QUANTITY} seat(s)`);

    // -- Step 3: Confirm --
    await dialog.getByTestId('confirm-dialog-yes').click();

    // -- Step 4: Toast + redirect, list refreshed without reload (TC-511) --
    await expect(page.getByText('Booking cancelled successfully')).toBeVisible();
    await expect(page).toHaveURL(/\/bookings$/);
    await expect(page.getByText('No bookings yet')).toBeVisible();
    await expect(page.getByTestId('booking-card')).toHaveCount(0);

    // -- Step 5: Booking is gone server-side --
    const res = await request.get(`${API_URL}/bookings/${booking.id}`, { headers: authHeaders(token) });
    expect(res.status()).toBe(404);
  });
});
