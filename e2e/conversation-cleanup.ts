import postgres from 'postgres';

/**
 * The journeys sign in as the Demo users and their messages are stored as real Conversations.
 * Global setup notes the database time when the run starts; global teardown deletes the Demo users'
 * Conversations created since then (their messages go with them), so a run leaves no rows behind
 * and never touches Conversations that existed before it.
 */
const STARTED_AT = 'E2E_CONVERSATIONS_STARTED_AT';
// A reply the browser stopped reading is still stored after its request ends; give that save time to land.
const SAVE_SETTLE_MS = 1_000;

function demoEmails() {
  return [
    process.env.DEMO_USER_A_EMAIL ?? 'user-a@example.test',
    process.env.DEMO_USER_B_EMAIL ?? 'user-b@example.test',
  ];
}

// The same dedicated test database the integration tests require; these deletes never run anywhere else.
const TEST_DATABASE_NAME = 'workspace_ai_test';

async function withDatabase(run: (sql: postgres.Sql) => Promise<void>) {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  if (new URL(url).pathname !== `/${TEST_DATABASE_NAME}`) {
    throw new Error(`The Playwright journeys store and delete Conversations; DATABASE_URL must point to the dedicated ${TEST_DATABASE_NAME} database`);
  }
  const sql = postgres(url, { max: 1 });
  try {
    const [{ name }] = await sql<{ name: string }[]>`SELECT current_database() AS name`;
    if (name !== TEST_DATABASE_NAME) throw new Error(`Connected to ${name}, not the dedicated ${TEST_DATABASE_NAME} database`);
    await run(sql);
  } finally {
    await sql.end();
  }
}

export async function markConversationsStart() {
  await withDatabase(async sql => {
    const [{ now }] = await sql<{ now: string }[]>`SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS now`;
    process.env[STARTED_AT] = now;
  });
}

export async function deleteConversationsSinceStart() {
  const startedAt = process.env[STARTED_AT];
  if (!startedAt) return;
  await new Promise(resolve => setTimeout(resolve, SAVE_SETTLE_MS));
  await withDatabase(async sql => {
    await sql`
      DELETE FROM conversations
      WHERE created_at >= ${startedAt}::timestamptz
        AND user_id IN (SELECT id FROM "user" WHERE email IN ${sql(demoEmails())})`;
  });
}
