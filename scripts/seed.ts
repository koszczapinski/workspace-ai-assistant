import { loadEnvConfig } from '@next/env';
import { createHash } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import postgres from 'postgres';

loadEnvConfig(process.cwd());

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const emailA = process.env.DEMO_USER_A_EMAIL;
  const passwordA = process.env.DEMO_USER_A_PASSWORD;
  const emailB = process.env.DEMO_USER_B_EMAIL;
  const passwordB = process.env.DEMO_USER_B_PASSWORD;

  if (!databaseUrl) throw new Error('Set DATABASE_URL before seeding');
  if (!emailA || !passwordA || !emailB || !passwordB) {
    throw new Error('Set both demo email and password environment variables');
  }
  if (emailA === emailB) throw new Error('Demo users must have distinct email addresses');

  const sql = postgres(databaseUrl);
  const demoUsers = [
    {
      key: 'a', email: emailA, password: passwordA, name: 'Demo User A',
      workspaceId: 'workspace-a', workspaceName: 'Northstar Studio',
      instructions: 'You are the Northstar Studio assistant. Help with synthetic product planning.',
    },
    {
      key: 'b', email: emailB, password: passwordB, name: 'Demo User B',
      workspaceId: 'workspace-b', workspaceName: 'Harbor Analytics',
      instructions: 'You are the Harbor Analytics assistant. Help with synthetic data analysis.',
    },
  ] as const;

  try {
    await sql.begin(async transaction => {
      for (const demo of demoUsers) {
        const userId = `demo-${demo.key}-${createHash('sha256').update(demo.email).digest('hex').slice(0, 16)}`;
        const hashedPassword = await hashPassword(demo.password);
        await transaction`
          INSERT INTO "user" (id, name, email, email_verified)
          VALUES (${userId}, ${demo.name}, ${demo.email}, true)
          ON CONFLICT (email) DO NOTHING
        `;
        const [user] = await transaction<{ id: string }[]>`
          SELECT id FROM "user" WHERE email = ${demo.email}
        `;
        if (!user) throw new Error(`Unable to find seeded user ${demo.email}`);

        await transaction`
          INSERT INTO workspaces (id, name, assistant_instructions)
          VALUES (${demo.workspaceId}, ${demo.workspaceName}, ${demo.instructions})
          ON CONFLICT (id) DO UPDATE
          SET name = excluded.name, assistant_instructions = excluded.assistant_instructions
        `;
        await transaction`
          INSERT INTO memberships (id, user_id, workspace_id, role)
          VALUES (${`${user.id}-membership`}, ${user.id}, ${demo.workspaceId}, 'owner')
          ON CONFLICT (user_id, workspace_id) DO UPDATE SET role = 'owner'
        `;
        const [existingCredential] = await transaction<{ id: string }[]>`
          UPDATE account SET account_id = ${user.id}, password = ${hashedPassword}
          WHERE user_id = ${user.id} AND provider_id = 'credential'
          RETURNING id
        `;
        if (!existingCredential) {
          await transaction`
            INSERT INTO account (id, user_id, account_id, provider_id, password)
            VALUES (${`${user.id}-account`}, ${user.id}, ${user.id}, 'credential', ${hashedPassword})
          `;
        }
      }
    });
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`Failed to seed demo data: ${message}`);
  process.exitCode = 1;
});
