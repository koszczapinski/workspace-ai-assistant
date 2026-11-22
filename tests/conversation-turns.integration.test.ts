import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../src/lib/schema';
import { assertPostgresOperationAllowed } from '../src/lib/environment-guard';
import { createConversationStore } from '../src/lib/conversations';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const connection = testDatabaseUrl ? postgres(testDatabaseUrl, { max: 5 }) : null;
const runId = `turns-${randomUUID()}`;
const owner = `${runId}-owner`;
const other = `${runId}-other`;
const workspace = `${runId}-ws`;
const otherWorkspace = `${runId}-ws2`;
let guardPassed = false;

beforeAll(async () => {
  if (!connection) return;
  await assertPostgresOperationAllowed(connection, testDatabaseUrl!, ['test']);
  guardPassed = true;
  for (const id of [owner, other]) {
    await connection`INSERT INTO "user" (id, name, email) VALUES (${id}, ${id}, ${`${id}@example.test`})`;
  }
  for (const id of [workspace, otherWorkspace]) {
    await connection`INSERT INTO workspaces (id, name, assistant_instructions) VALUES (${id}, ${id}, 'Test')`;
  }
});

afterAll(async () => {
  if (!connection) return;
  // A refused guard means this may not be the test database: close without deleting anything.
  if (guardPassed) {
    await connection`DELETE FROM workspaces WHERE id IN (${workspace}, ${otherWorkspace})`;
    await connection`DELETE FROM "user" WHERE id IN (${owner}, ${other})`;
  }
  await connection.end();
});

const store = () => createConversationStore(drizzle(connection!, { schema }));
/** The stored transcript without generated ids and timestamps. */
const transcript = async (messages: Promise<Array<{ role: string; content: string; stopped: boolean }> | null>) =>
  (await messages)?.map(({ role, content, stopped }) => ({ role, content, stopped })) ?? null;
const at = (seconds: number) => new Date(Date.UTC(2030, 0, 1, 12, 0, seconds));

async function conversationRow(id: string) {
  const [row] = await connection!<{ title: string; updatedAt: string }[]>`
    SELECT title, updated_at AS "updatedAt" FROM conversations WHERE id = ${id}`;
  return row && { title: row.title, updatedAt: new Date(row.updatedAt) };
}

it.skipIf(!testDatabaseUrl)('stores a first turn as a new Conversation the owner can continue, User message first', async () => {
  const id = randomUUID();
  await store().saveTurn({
    conversationId: id, userId: owner, workspaceId: workspace,
    userText: '  Plan   the\nlaunch  ', assistantText: 'Here is a plan.', stopped: false,
    receivedAt: at(0), savedAt: at(0),
  });

  expect(await transcript(store().history(owner, workspace, id, 30))).toEqual([
    { role: 'user', content: '  Plan   the\nlaunch  ', stopped: false },
    { role: 'assistant', content: 'Here is a plan.', stopped: false },
  ]);
  expect(await conversationRow(id)).toEqual({ title: 'Plan the launch', updatedAt: at(0) });
});

it.skipIf(!testDatabaseUrl)('hides a Conversation from another User and from another Workspace', async () => {
  const id = randomUUID();
  await store().saveTurn({
    conversationId: id, userId: owner, workspaceId: workspace,
    userText: 'Private', assistantText: 'Reply', stopped: false, receivedAt: at(1), savedAt: at(2),
  });

  await expect(store().history(other, workspace, id, 30)).resolves.toBeNull();
  await expect(store().history(owner, otherWorkspace, id, 30)).resolves.toBeNull();
  await expect(store().history(owner, workspace, randomUUID(), 30)).resolves.toBeNull();
});

it.skipIf(!testDatabaseUrl)('refuses to append to a foreign Conversation and writes no one-sided turn', async () => {
  const id = randomUUID();
  await store().saveTurn({
    conversationId: id, userId: owner, workspaceId: workspace,
    userText: 'Mine', assistantText: 'Yours', stopped: false, receivedAt: at(1), savedAt: at(2),
  });

  await expect(store().saveTurn({
    conversationId: id, userId: other, workspaceId: workspace,
    userText: 'Intruder', assistantText: 'No', stopped: false, receivedAt: at(3), savedAt: at(4),
  })).rejects.toThrow();

  await expect(store().history(owner, workspace, id, 30)).resolves.toHaveLength(2);
});

it.skipIf(!testDatabaseUrl)('continues a Conversation: keeps the title, moves updated_at, marks Stopped, and caps history at the most recent', async () => {
  const id = randomUUID();
  const s = store();
  await s.saveTurn({
    conversationId: id, userId: owner, workspaceId: workspace,
    userText: 'x'.repeat(100), assistantText: 'First', stopped: false, receivedAt: at(10), savedAt: at(11),
  });
  await s.saveTurn({
    conversationId: id, userId: owner, workspaceId: workspace,
    userText: 'Second question', assistantText: 'Partial', stopped: true, receivedAt: at(20), savedAt: at(20),
  });

  expect(await conversationRow(id)).toEqual({ title: 'x'.repeat(80), updatedAt: at(20) });
  expect(await transcript(s.history(owner, workspace, id, 30))).toEqual([
    { role: 'user', content: 'x'.repeat(100), stopped: false },
    { role: 'assistant', content: 'First', stopped: false },
    { role: 'user', content: 'Second question', stopped: false },
    { role: 'assistant', content: 'Partial', stopped: true },
  ]);
  expect(await transcript(s.history(owner, workspace, id, 3))).toEqual([
    { role: 'assistant', content: 'First', stopped: false },
    { role: 'user', content: 'Second question', stopped: false },
    { role: 'assistant', content: 'Partial', stopped: true },
  ]);
});

async function savedConversation(userText: string, savedAt = at(30)) {
  const id = randomUUID();
  await store().saveTurn({
    conversationId: id, userId: owner, workspaceId: workspace,
    userText, assistantText: 'Reply', stopped: false, receivedAt: savedAt, savedAt,
  });
  return id;
}

it.skipIf(!testDatabaseUrl)('renames a Conversation, keeping updated_at and the list order', async () => {
  const older = await savedConversation('Older question', at(40));
  const newer = await savedConversation('Newer question', at(41));
  const order = async () => (await store().listConversations(owner, workspace, null)).conversations
    .map(({ id }) => id).filter(id => id === older || id === newer);
  expect(await order()).toEqual([newer, older]);

  await expect(store().renameConversation(owner, workspace, older, 'Launch plan')).resolves.toBe('Launch plan');

  expect(await conversationRow(older)).toEqual({ title: 'Launch plan', updatedAt: at(40) });
  expect((await store().findConversation(owner, workspace, older))?.title).toBe('Launch plan');
  expect(await order()).toEqual([newer, older]);
});

it.skipIf(!testDatabaseUrl)('cannot rename a Conversation of another User, another Workspace, or a missing one', async () => {
  const id = await savedConversation('Private');

  await expect(store().renameConversation(other, workspace, id, 'Hijacked')).resolves.toBeNull();
  await expect(store().renameConversation(owner, otherWorkspace, id, 'Hijacked')).resolves.toBeNull();
  await expect(store().renameConversation(owner, workspace, randomUUID(), 'Hijacked')).resolves.toBeNull();
  expect((await conversationRow(id))?.title).toBe('Private');
});

it.skipIf(!testDatabaseUrl)('restores the automatic Title from the first User message', async () => {
  const id = await savedConversation('  Plan   the launch ');
  await store().renameConversation(owner, workspace, id, 'Mine');

  await expect(store().renameConversation(owner, workspace, id, null)).resolves.toBe('Plan the launch');
  expect((await conversationRow(id))?.title).toBe('Plan the launch');
});

it.skipIf(!testDatabaseUrl)('keeps a manual Title when a later turn is stored', async () => {
  const id = await savedConversation('First question', at(50));
  await store().renameConversation(owner, workspace, id, 'Mine');

  await store().saveTurn({
    conversationId: id, userId: owner, workspaceId: workspace,
    userText: 'Second question', assistantText: 'Reply', stopped: false, receivedAt: at(51), savedAt: at(52),
  });

  expect(await conversationRow(id)).toEqual({ title: 'Mine', updatedAt: at(52) });
});
