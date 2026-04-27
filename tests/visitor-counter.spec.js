const { test, expect } = require('@playwright/test');

test('visitor counter falls back gracefully when GoatCounter API is gated', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => sessionStorage.setItem('booted', '1'));
  await page.goto('/');
  await page.waitForTimeout(800);

  const text = await page.locator('#visitor-counter').textContent();
  // Either a cached/live formatted count string, or the localStorage fallback
  // (also a number with thousand separators via toLocaleString).
  expect(text).toMatch(/^[\d,]+$/);
});

test('visitor counter renders the GoatCounter response when fetch resolves', async ({ page }) => {
  // Intercept the GoatCounter call and respond with a synthetic count.
  await page.route('https://reebz.goatcounter.com/counter/TOTAL.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: '42,007' }),
    });
  });

  await page.goto('/');
  await page.evaluate(() => {
    sessionStorage.setItem('booted', '1');
    localStorage.removeItem('visitor-count-cache');
  });
  await page.goto('/');
  await page.waitForFunction(
    () => document.getElementById('visitor-counter').textContent === '42,007',
    { timeout: 5000 }
  );
  const cached = await page.evaluate(() => localStorage.getItem('visitor-count-cache'));
  expect(cached).toBe('42,007');
});

test('visitor counter survives a 403 from GoatCounter and renders cache or fallback', async ({ page }) => {
  await page.route('https://reebz.goatcounter.com/counter/TOTAL.json', async (route) => {
    await route.fulfill({ status: 403, body: 'Forbidden' });
  });

  await page.goto('/');
  await page.evaluate(() => {
    sessionStorage.setItem('booted', '1');
    localStorage.removeItem('visitor-count-cache');
    localStorage.removeItem('visitor-count');
  });
  await page.goto('/');
  await page.waitForTimeout(800);
  const text = await page.locator('#visitor-counter').textContent();
  expect(text).toMatch(/^[\d,]+$/);
});
