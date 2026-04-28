const { test, expect } = require('@playwright/test');

const COUNTER_URL = 'https://reebz.goatcounter.com/counter/TOTAL.json';

const cleanState = (page) => page.evaluate(() => {
  sessionStorage.setItem('booted', '1');
  sessionStorage.removeItem('counter-fetched-at');
  localStorage.removeItem('visitor-count-cache');
  localStorage.removeItem('visitor-count');
  sessionStorage.removeItem('counted');
});

test('falls back gracefully when GoatCounter API is gated', async ({ page }) => {
  await page.goto('/');
  await cleanState(page);
  await page.goto('/');
  await page.waitForTimeout(800);

  const text = await page.locator('#visitor-counter').textContent();
  expect(text).toMatch(/^[\d,]+$/);
});

test('renders GoatCounter string response and caches it', async ({ page }) => {
  await page.route(COUNTER_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: '42,007' }),
    });
  });

  await page.goto('/');
  await cleanState(page);
  await page.goto('/');
  await page.waitForFunction(
    () => document.getElementById('visitor-counter').textContent === '42,007',
    { timeout: 5000 }
  );
  const cached = await page.evaluate(() => localStorage.getItem('visitor-count-cache'));
  expect(cached).toBe('42,007');
});

test('accepts numeric count from GoatCounter and renders it formatted', async ({ page }) => {
  await page.route(COUNTER_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: 42008 }),
    });
  });

  await page.goto('/');
  await cleanState(page);
  await page.goto('/');
  await page.waitForFunction(
    () => document.getElementById('visitor-counter').textContent === '42,008',
    { timeout: 5000 }
  );
  const cached = await page.evaluate(() => localStorage.getItem('visitor-count-cache'));
  expect(cached).toBe('42,008');
});

test('skips refetch within session when counter-fetched-at is recent', async ({ page }) => {
  let fetchCount = 0;
  await page.route(COUNTER_URL, async (route) => {
    fetchCount++;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: '99,999' }),
    });
  });
  // addInitScript runs BEFORE any page script, so the gate is in place by the
  // time initVisitorCounter checks it.
  await page.addInitScript(() => {
    sessionStorage.setItem('booted', '1');
    localStorage.setItem('visitor-count-cache', '99,999');
    sessionStorage.setItem('counter-fetched-at', String(Date.now() - 5 * 60 * 1000));
  });
  await page.goto('/');
  await page.waitForTimeout(600);
  expect(fetchCount).toBe(0);
  const text = await page.locator('#visitor-counter').textContent();
  expect(text).toBe('99,999');
});

test('does not poison cache when GoatCounter returns null count', async ({ page }) => {
  await page.route(COUNTER_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: null }),
    });
  });

  await page.goto('/');
  await cleanState(page);
  await page.goto('/');
  await page.waitForTimeout(600);
  const cached = await page.evaluate(() => localStorage.getItem('visitor-count-cache'));
  expect(cached).toBeNull();
  const text = await page.locator('#visitor-counter').textContent();
  expect(text).toMatch(/^[\d,]+$/);
});

test('does not poison cache when GoatCounter returns empty string count', async ({ page }) => {
  await page.route(COUNTER_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: '' }),
    });
  });

  await page.goto('/');
  await cleanState(page);
  await page.goto('/');
  await page.waitForTimeout(600);
  const cached = await page.evaluate(() => localStorage.getItem('visitor-count-cache'));
  expect(cached).toBeNull();
});

test('survives a 403 and renders cache or fallback', async ({ page }) => {
  await page.route(COUNTER_URL, async (route) => {
    await route.fulfill({ status: 403, body: 'Forbidden' });
  });

  await page.goto('/');
  await cleanState(page);
  await page.goto('/');
  await page.waitForTimeout(800);
  const text = await page.locator('#visitor-counter').textContent();
  expect(text).toMatch(/^[\d,]+$/);
  const cached = await page.evaluate(() => localStorage.getItem('visitor-count-cache'));
  expect(cached).toBeNull();
});

test('cache renders identically formatted to fallback', async ({ page }) => {
  // First visit: no cache, no fetched-at, GoatCounter unavailable. Fallback renders.
  await page.route(COUNTER_URL, async (route) => {
    await route.fulfill({ status: 403, body: 'Forbidden' });
  });
  await page.goto('/');
  await cleanState(page);
  await page.goto('/');
  await page.waitForTimeout(400);
  const fallbackText = await page.locator('#visitor-counter').textContent();
  // Second visit: cache present from a prior live fetch, fetched-at recent so no refetch.
  await page.evaluate((value) => {
    localStorage.setItem('visitor-count-cache', value);
    sessionStorage.setItem('counter-fetched-at', String(Date.now()));
  }, fallbackText);
  await page.goto('/');
  await page.waitForTimeout(400);
  const cachedText = await page.locator('#visitor-counter').textContent();
  expect(cachedText).toBe(fallbackText);
});
