import { expect, test } from '@playwright/test';

test('Trace shimmer and message entry respect reduced motion', async ({ page }) => {
  const email = process.env.DEMO_USER_A_EMAIL ?? 'user-a@example.test';
  const password = process.env.DEMO_USER_A_PASSWORD ?? 'test-user-a-password';
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
  await page.getByRole('link', { name: /Northstar Studio/ }).click();

  await page.getByLabel('Message').fill('Check reduced motion');
  await page.getByRole('button', { name: 'Send' }).click();
  const thinkingTitle = page.locator('[data-slot="trace-title"]', { hasText: 'Thinking…' });
  await expect(thinkingTitle).toBeVisible();
  await expect.poll(() => thinkingTitle.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  const activityLine = thinkingTitle.locator('..');
  await expect.poll(() => activityLine.evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');
  const userMessage = page.locator('article[aria-label="Your message"]');
  await expect.poll(() => userMessage.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
});
