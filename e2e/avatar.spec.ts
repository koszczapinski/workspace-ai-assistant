import { expect, test } from '@playwright/test';
import sharp from 'sharp';

// User B, so the screenshot journey (User A) never sees a half-finished Avatar while workers run in parallel.
test('a User uploads an Avatar on Account, sees it in the header menu, and removes it again', async ({ page }) => {
  const email = process.env.DEMO_USER_B_EMAIL ?? 'user-b@example.test';
  const password = process.env.DEMO_USER_B_PASSWORD ?? 'test-user-b-password';
  const picture = await sharp({ create: { width: 600, height: 400, channels: 3, background: { r: 30, g: 140, b: 90 } } }).png().toBuffer();

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');

  const menu = page.getByRole('button', { name: 'User menu' });
  await menu.click();
  await page.getByRole('link', { name: 'Account' }).click();
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();

  // Leftover from an interrupted run: start from initials.
  const remove = page.getByRole('button', { name: 'Remove' });
  if (await remove.isVisible()) {
    await remove.click();
    await expect(remove).toBeHidden();
  }
  await expect(menu.locator('img')).toHaveCount(0);

  await page.getByLabel('Upload a picture').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: picture });

  const headerImage = menu.locator('img');
  await expect(headerImage).toHaveAttribute('src', /^\/api\/users\/[^/]+\/avatar\?v=\d+$/);
  await expect.poll(() => headerImage.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(256);

  await remove.click();
  await expect(menu.locator('img')).toHaveCount(0);
  await expect(menu).toContainText(/\S/);
});
