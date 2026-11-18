import { expect, test } from '@playwright/test';

test('an Owner invites a new person who accepts, lands in the Workspace and appears in the member list', async ({ page, browser }) => {
  const ownerEmail = process.env.DEMO_USER_A_EMAIL ?? 'user-a@example.test';
  const ownerPassword = process.env.DEMO_USER_A_PASSWORD ?? 'test-user-a-password';
  const unique = Date.now();
  const newName = `Invited ${unique}`;
  const newEmail = `invited-${unique}@example.test`;

  // The Owner signs in and creates an Invitation.
  await page.goto('/login');
  await page.getByLabel('Email').fill(ownerEmail);
  await page.getByLabel('Password').fill(ownerPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
  await page.goto('/w/workspace-a/members');
  await page.getByRole('button', { name: 'Create invitation link' }).click();
  const link = await page.getByLabel('Invitation link').inputValue();
  expect(link).toContain('/invite/');

  // A new person, in a separate browser context without a Session, accepts it.
  const guest = await browser.newContext();
  try {
    const guestPage = await guest.newPage();
    await guestPage.goto(link);
    await expect(guestPage.getByRole('heading', { name: 'Join Northstar Studio' })).toBeVisible();
    await guestPage.getByLabel('Name').fill(newName);
    await guestPage.getByLabel('Email').fill(newEmail);
    await guestPage.getByLabel('Password').fill('a-fresh-password-1');
    await guestPage.getByRole('button', { name: 'Create account and join' }).click();
    await expect(guestPage).toHaveURL(/\/w\/workspace-a$/);
    await expect(guestPage.getByRole('heading', { name: 'Northstar Studio' })).toBeVisible();

    // The link is single-use.
    await guestPage.goto(link);
    await expect(guestPage.getByRole('heading', { name: 'This link is not valid' })).toBeVisible();
  } finally {
    await guest.close();
  }

  // The Owner sees the new Member, then removes them so the journey can run again.
  await page.reload();
  const row = page.getByRole('listitem').filter({ hasText: newEmail });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Member');
  await row.getByRole('button', { name: `Remove ${newName}` }).click();
  await expect(row).toHaveCount(0);
});
