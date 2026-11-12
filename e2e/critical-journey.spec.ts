import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('a member signs in, opens their workspace, and sees a streamed answer', async ({ page }) => {
  const email = process.env.DEMO_USER_A_EMAIL ?? 'user-a@example.test';
  const password = process.env.DEMO_USER_A_PASSWORD ?? 'test-user-a-password';

  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL('/');
  await page.getByRole('link', { name: 'Northstar Studio' }).click();
  await expect(page.getByRole('heading', { name: 'Northstar Studio' })).toBeVisible();

  await page.getByLabel('Message').fill('Plan a short demo');
  await page.getByRole('button', { name: 'Send' }).click();
  const response = page.locator('article').filter({ hasText: 'Assistant' }).locator('p');
  await expect(response).toContainText('Demo response:');
  await expect(response).toContainText('Plan a short demo');

  await mkdir('output/playwright', { recursive: true });
  await page.screenshot({ path: 'output/playwright/critical-journey.png', fullPage: true });
});
