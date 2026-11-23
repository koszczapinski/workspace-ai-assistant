import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Static invariants for the Docker deploy path (docs: README "Run with Docker Compose").
// They need no Docker daemon; the real build and `up` are checked by hand.
const read = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8');
const lines = (file: string) => read(file).split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));

describe('Docker deploy files', () => {
  const dockerfile = lines('Dockerfile');
  const compose = read('docker-compose.yml');

  it('keeps .env files and tooling out of the build context', () => {
    const ignored = lines('.dockerignore');
    for (const entry of ['.env', '.env.*', 'node_modules', '.next', '.git', '.claude']) expect(ignored).toContain(entry);
    expect(ignored).not.toContain('!.env.local');
  });

  it('never copies or sets a secret in the Dockerfile', () => {
    for (const line of dockerfile) {
      if (/^(COPY|ADD)\b/.test(line)) expect(line).not.toMatch(/\.env/);
      if (/^(ENV|ARG)\b/.test(line)) expect(line).not.toMatch(/SECRET|PASSWORD|API_KEY|DATABASE_URL|AI_/);
    }
  });

  it('has a migrate target and a runtime target that runs the standalone server as a non-root user', () => {
    expect(dockerfile.some(line => /^FROM .* AS migrate$/.test(line))).toBe(true);
    expect(dockerfile.some(line => /^FROM .* AS runtime$/.test(line))).toBe(true);
    expect(dockerfile).toContain('CMD ["node", "server.js"]');
    expect(dockerfile).toContain('USER node');
    expect(read('next.config.ts')).toMatch(/output:\s*'standalone'/);
  });

  it('requires the secrets and the AI settings, and runs in production', () => {
    for (const name of ['POSTGRES_PASSWORD', 'BETTER_AUTH_SECRET', 'AI_PROVIDER', 'AI_MODEL']) {
      expect(compose).toContain(`\${${name}:?`);
    }
    expect(compose.match(/APP_ENV: production/g)).toHaveLength(2);
    expect(compose).not.toMatch(/AI_PROVIDER: fake|APP_ENV: (development|test)/);
  });

  it('migrates through the confirmed production path, then starts the app, and never seeds', () => {
    expect(compose).toContain('--confirm-database \\"$$POSTGRES_DB\\"');
    expect(compose).toContain('condition: service_completed_successfully');
    expect(compose).toContain('condition: service_healthy');
    expect(compose).not.toMatch(/db:seed|seed\.ts/);
  });

  it('keeps database data in a named volume and publishes only the app port', () => {
    expect(compose).toContain('db-data:/var/lib/postgresql/data');
    expect(compose.match(/^\s+ports:/gm)).toHaveLength(1);
    expect(compose).toContain('pg_isready');
  });

  it('ships a Compose template without secret values', () => {
    const template = lines('.env.compose.example');
    for (const name of ['POSTGRES_PASSWORD', 'BETTER_AUTH_SECRET', 'AI_API_KEY', 'AI_MODEL']) {
      expect(template).toContain(`${name}=`);
    }
    expect(template).not.toContain('AI_PROVIDER=fake');
  });

  it('gives the migrate service the public URL so bootstrap can build the Invitation link', () => {
    expect(compose).toContain('BETTER_AUTH_URL: ${BETTER_AUTH_URL:?');
    expect(compose.match(/^\s+BETTER_AUTH_URL:/gm)).toHaveLength(2);
  });

  it('has a CI job that builds Compose, runs bootstrap, accepts the Invitation and never chats', () => {
    const workflow = read('.github/workflows/quality.yml');
    expect(workflow).toContain('bootstrap');
    expect(workflow).toContain('--confirm-database');
    expect(workflow).toContain('/api/invitations/accept');
    expect(workflow).not.toContain('/api/chat');
  });

  it('no longer promises a public demo', () => {
    expect(read('README.md')).not.toMatch(/public demo(?! \()/i);
    expect(read('README.md')).not.toMatch(/^## Two-minute demo/m);
  });
});
