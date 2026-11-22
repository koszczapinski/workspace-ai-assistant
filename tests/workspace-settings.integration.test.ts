import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../src/lib/schema';
import { assertPostgresOperationAllowed } from '../src/lib/environment-guard';
import { createWorkspaceQueries } from '../src/lib/workspaces';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const connection = testDatabaseUrl ? postgres(testDatabaseUrl, { max: 5 }) : null;
const runId = `settings-${randomUUID()}`;
const owner = `${runId}-owner`;
const workspaceA = `${runId}-a`;
const workspaceB = `${runId}-b`;
let guardPassed = false;

beforeAll(async () => {
  if (!connection) return;
  await assertPostgresOperationAllowed(connection, testDatabaseUrl!, ['test']);
  guardPassed = true;
  await connection`INSERT INTO "user" (id, name, email) VALUES (${owner}, ${owner}, ${`${owner}@example.test`})`;
  await connection`INSERT INTO workspaces (id, name, assistant_instructions) VALUES (${workspaceA}, 'Alpha', 'Old A')`;
  await connection`INSERT INTO workspaces (id, name, assistant_instructions) VALUES (${workspaceB}, 'Beta', 'Old B')`;
  for (const workspace of [workspaceA, workspaceB]) {
    await connection`INSERT INTO memberships (id, workspace_id, user_id, role) VALUES (${`${workspace}-m`}, ${workspace}, ${owner}, 'owner')`;
  }
});

afterAll(async () => {
  if (!connection) return;
  // A refused guard means this may not be the test database: close without deleting anything.
  if (guardPassed) {
    await connection`DELETE FROM workspaces WHERE id IN (${workspaceA}, ${workspaceB})`;
    await connection`DELETE FROM "user" WHERE id = ${owner}`;
  }
  await connection.end();
});

const queries = () => createWorkspaceQueries(drizzle(connection!, { schema }));

it.skipIf(!testDatabaseUrl)('saves name and Assistant instructions, which the chat lookup then returns, leaving other Workspaces unchanged', async () => {
  const saved = await queries().updateWorkspaceSettings(workspaceA, { name: 'Alpha Renamed', assistantInstructions: 'New A' });
  expect(saved).toEqual({ name: 'Alpha Renamed', assistantInstructions: 'New A' });

  await expect(queries().authorizedWorkspace(owner, workspaceA)).resolves.toMatchObject({ name: 'Alpha Renamed', assistantInstructions: 'New A' });
  await expect(queries().authorizedWorkspace(owner, workspaceB)).resolves.toMatchObject({ name: 'Beta', assistantInstructions: 'Old B' });
  await expect(queries().workspaceSettings(workspaceA)).resolves.toEqual({ name: 'Alpha Renamed', assistantInstructions: 'New A' });
});

it.skipIf(!testDatabaseUrl)('lets two Workspaces share a name', async () => {
  await queries().updateWorkspaceSettings(workspaceA, { name: 'Same', assistantInstructions: 'A' });
  await queries().updateWorkspaceSettings(workspaceB, { name: 'Same', assistantInstructions: 'B' });

  const names = await queries().listWorkspaces(owner);
  expect(names.filter(workspace => workspace.name === 'Same')).toHaveLength(2);
});
