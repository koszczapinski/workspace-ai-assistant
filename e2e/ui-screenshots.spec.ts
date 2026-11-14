import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

test('captures login, workspace, and chat screens across viewports and themes', async ({ page }) => {
  const email = process.env.DEMO_USER_A_EMAIL ?? 'user-a@example.test';
  const password = process.env.DEMO_USER_A_PASSWORD ?? 'test-user-a-password';
  const outputDirectory = 'output/playwright/ui';
  await mkdir(outputDirectory, { recursive: true });

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 960 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    for (const theme of ['dark', 'light'] as const) {
      await page.context().clearCookies();
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      await expect(page).toHaveURL(/\/login$/);
      await page.evaluate(() => window.localStorage.clear());
      await page.reload();

      await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();
      if (theme === 'light') await page.getByRole('button', { name: 'Switch to light theme' }).click();
      await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(theme === 'dark');
      await assertNoHorizontalOverflow(page);
      await saveScreenshot(page, outputDirectory, `login-${viewport.name}-${theme}.png`);

      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password').fill(password);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page).toHaveURL('/');
      await expect(page.getByRole('link', { name: /Northstar Studio/ })).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await saveScreenshot(page, outputDirectory, `workspaces-${viewport.name}-${theme}.png`);

      await page.getByRole('link', { name: /Northstar Studio/ }).click();
      await expect(page.getByRole('heading', { name: 'Northstar Studio' })).toBeVisible();
      await expect(page.getByText('Start a conversation')).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await saveScreenshot(page, outputDirectory, `chat-empty-${viewport.name}-${theme}.png`);

      await page.getByLabel('Message').fill('Plan a short demo');
      await page.getByRole('button', { name: 'Send' }).click();
      const response = page.locator('article[aria-label="Assistant response"]');
      await expect(response).toContainText('Demo response: Plan a short demo');
      await assertNoHorizontalOverflow(page);
      await saveScreenshot(page, outputDirectory, `chat-streamed-${viewport.name}-${theme}.png`);
    }
  }
});

async function assertNoHorizontalOverflow(page: import('@playwright/test').Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function saveScreenshot(page: import('@playwright/test').Page, directory: string, filename: string) {
  await page.screenshot({ path: path.join(directory, filename), fullPage: true });
}
