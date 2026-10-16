import { expect } from '@playwright/test';

// UI pages use playwright.config.ts `baseURL`; the API lives on its own host.
// Override API_URL when pointing baseURL at a local frontend (e.g. http://localhost:3001/api).
export const API_URL       = process.env.API_URL ?? 'https://api.eventhub.rahulshettyacademy.com/api';
export const USER_EMAIL    = 'rahulshetty1@gmail.com';
export const USER_PASSWORD = 'Magiclife1!';

export const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

export async function apiLogin(request, email = USER_EMAIL, password = USER_PASSWORD) {
  const res = await request.post(`${API_URL}/auth/login`, { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).token;
}

export async function clearBookingsViaApi(request, token) {
  const res = await request.delete(`${API_URL}/bookings`, { headers: authHeaders(token) });
  expect(res.ok()).toBeTruthy();
}

export async function getBookingsViaApi(request, token) {
  const res = await request.get(`${API_URL}/bookings`, { headers: authHeaders(token) });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

/** Books the first static event with enough seats. Returns the API booking (with `event`). */
export async function createBookingViaApi(request, token, { quantity, customer }) {
  const eventsRes = await request.get(`${API_URL}/events?limit=50`, { headers: authHeaders(token) });
  expect(eventsRes.ok()).toBeTruthy();
  const { data: events } = await eventsRes.json();
  const event = events.find((e) => e.isStatic && e.availableSeats >= quantity);
  expect(event, 'a static event with free seats').toBeDefined();

  const res = await request.post(`${API_URL}/bookings`, {
    headers: authHeaders(token),
    data: { eventId: event.id, quantity, ...customer },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data;
}

/** Signs the browser in by seeding the JWT that useAuth reads on mount. */
export async function signInBrowser(page, token) {
  await page.addInitScript((t) => localStorage.setItem('eventhub_token', t), token);
}
