import pino from 'pino';

/**
 * The only place the app writes logs. An event is a closed set of fields: no free-form text, no
 * error message, no Conversation content. Callers pass the error object only so its class and
 * Postgres code can be read; its message is never read.
 */
export type LogEventName =
  | 'chat.body_unreadable' | 'chat.body_malformed' | 'chat.history_failed' | 'chat.limiter_failed'
  | 'chat.stream_setup_failed' | 'chat.save_failed' | 'provider.stream_failed';

export type LogEvent = {
  event: LogEventName;
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createLogger(sink: Sink = process.stdout): Logger {
  const base = pino({ base: null, messageKey: '_unused', timestamp: pino.stdTimeFunctions.isoTime }, sink);
  return {
    event({ event, route, status, requestId, error, userId, workspaceId, conversationId }) {
      // Fields are picked one by one, so nothing outside the schema reaches the log whatever the caller passes.
      base.error({
        event, route, status, requestId, userId, workspaceId,
        // The client chooses the id of a Conversation it asks for; only a well-formed UUID is safe to log.
        conversationId: conversationId && UUID.test(conversationId) ? conversationId : undefined,
        errorClass: error === undefined ? undefined : errorClass(error), pgCode: postgresCode(error),
      });
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
