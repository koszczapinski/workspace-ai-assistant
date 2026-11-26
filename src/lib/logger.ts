import pino from 'pino';

/**
 * The only place the app writes logs. An event is a closed set of fields: no free-form text, no
 * error message, no Conversation content. Callers pass the error object only so its class and
 * Postgres code can be read; its message is never read.
 */
export type LogEvent = {
  event: string;
  route: string;
  status?: number;
  requestId: string;
  error?: unknown;
  userId?: string;
  workspaceId?: string;
  conversationId?: string;
};

export type Logger = { event: (event: LogEvent) => void };

type Sink = { write: (line: string) => void };

export function createLogger(sink: Sink = process.stdout): Logger {
  const base = pino({ base: null, messageKey: '_unused', timestamp: pino.stdTimeFunctions.isoTime }, sink);
  return {
    event({ error, ...fields }) {
      base.error({ ...fields, errorClass: error === undefined ? undefined : errorClass(error), pgCode: postgresCode(error) });
    },
  };
}

function errorClass(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error;
}

/** A Postgres SQLSTATE such as `23505`, on the error itself or on its cause (Drizzle wraps the driver error). */
function postgresCode(error: unknown): string | undefined {
  for (let current = error, depth = 0; current instanceof Error && depth < 3; current = current.cause, depth++) {
    const { code } = current as { code?: unknown };
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return undefined;
}

export const logger = createLogger();
