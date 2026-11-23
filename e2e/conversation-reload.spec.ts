import { expect, test } from '@playwright/test';

test('a Member reloads the Workspace and still has their Conversation', async ({ page }) => {
  const email = process.env.DEMO_USER_A_EMAIL ?? 'user-a@example.test';
  const password = process.env.DEMO_USER_A_PASSWORD ?? 'test-user-a-password';
  const question = `Outline the launch checklist ${Date.now()}`;

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
  await page.getByRole('link', { name: 'Northstar Studio' }).click();
  await expect(page.getByRole('heading', { name: 'Northstar Studio' })).toBeVisible();

  await page.getByLabel('Message').fill(question);
  await page.getByRole('button', { name: 'Send' }).click();
  const reply = page.locator('article[aria-label="Assistant response"] > div');
  await expect(reply).toContainText(`Demo response: ${question}`);
  await expect(page).toHaveURL(/\/w\/workspace-a\/c\/[^/]+$/);

  await page.reload();

  const list = page.getByRole('navigation', { name: 'Conversations' });
  await expect(list.getByRole('link', { name: question })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('article[aria-label="Your message"] p.whitespace-pre-wrap')).toHaveText([question]);
  await expect(reply).toHaveCount(1);
  await expect(reply).toContainText(`Demo response: ${question}`);
});
