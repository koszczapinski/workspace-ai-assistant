# Observability for the self-hosted starter

Research note, 2026-11-26, extended the same day to cover application-wide error tracking. Question from the owner: which observability tool is worth introducing? Read-only research; no code changed. Claims cite a URL or a path in this repo. Anything not confirmed from a primary source is marked **UNVERIFIED**. Versions and star counts are as returned by the GitHub and npm APIs on the date above and will drift.

## Summary and recommendation

The owner's goal is to **catch and aggregate errors from the whole app**: route handlers, server actions, Better Auth, Drizzle/PostgreSQL failures, bootstrap/migrate scripts, and client-side React errors. LLM-call errors are one part of that. LLM tracing (Langfuse, Phoenix, OTel spans) is a separate, smaller question and is treated second.

The app has almost no error visibility today: no `instrumentation.ts`, no `error.tsx` or `global-error.tsx`, no health endpoint, and three `console.error` calls (`src/lib/provider.ts`, `src/lib/conversation-reply.ts`). More important, `src/app/api/chat/route.ts` has five bare `catch {}` blocks (lines 51, 59, 80, 96, 120) that discard the error and return a 400 or 503 with no log at all. A failing history query, limiter query, or stream setup therefore never reaches Next's `onRequestError` and is not logged anywhere. README line 194 lists "alerting or monitoring" as not covered.

Three facts decide the recommendation:

1. **Next gives a good server-side hook for free but nothing client-side or process-level** (detail in "Application-wide error tracking" below). `onRequestError` sees only errors that escape a route, render, or action; it does not see errors the app catches and converts to a response.
2. **Error events are a privacy hazard in this app, and the default SDK settings are the wrong ones.** The installed `drizzle-orm` 0.45.4 builds `DrizzleQueryError` with the message `Failed query: <sql>\nparams: <bound values>` (`node_modules/drizzle-orm/errors.js`, thrown at `pg-core/session.js` lines 41-98), so a failed insert into `messages` puts the Conversation text in `error.message`. And `@sentry/nextjs` 11.19.0 defaults to sending incoming request bodies, cookies, headers, the full query string, IP, local variables and AI inputs/outputs (`@sentry/core` 11.19.0 `types/datacollection.d.ts`). A chat POST body is the Conversation. Any error tracker must be configured to send none of these, and tests must prove it.
3. **AI SDK 7 telemetry is opt-out and records prompts and completions by default** (`node_modules/ai/docs/03-ai-sdk-core/60-telemetry.mdx`). Same rule: switch recording off at the single AI seam.

**Recommended order:**

1. **Close the blind spots with no new service.** Structured JSON logs to stdout (pino, MIT) with request id, event name, route, status, error class, Postgres error code, and IDs only, never message text, Assistant instructions, Document text or `err.message` of a Drizzle error. Log inside the five `catch {}` blocks. Add `src/instrumentation.ts` exporting `onRequestError`, plus `error.tsx` and `global-error.tsx` that show the error `digest` so a User can quote it and the Deployer can find the matching log line. Add a content-free `/api/health`, a Compose healthcheck on `app`, and `logging:` rotation on the Compose services. This is the default, and `docker compose logs app` is "the single place" for a Deployer.
2. **Optional error inbox, off by default: GlitchTip.** It is MIT-licensed, needs PostgreSQL plus an optional Valkey/Redis, and runs as one service. It is the only Sentry-SDK-compatible self-hosted tracker that meets "MIT or permissive, low ops". Ship it as a Compose profile with the app's Sentry SDK configured to a strict scrub-by-default and a no-op when no DSN is set (verified: "If this is not set, the SDK will not send any events", `@sentry/core` 11.19.0 `options.d.ts`). Compatibility of GlitchTip with `@sentry/nextjs` 11.x is **UNVERIFIED** and must be tested before this ships.
3. **Optional OTel traces for LLM and request latency** (second increment in the earlier recommendation, unchanged): opt-in, `recordInputs/recordOutputs: false`, OTLP to whatever the Deployer runs, optional ephemeral Jaeger profile.

**Not recommended:** Sentry self-hosted (heavy, FSL), Bugsink (PolyForm Shield license, not permissive), Sentry SaaS as a default (violates "no mandatory SaaS"; fine only as a Deployer's own choice), Langfuse, Phoenix, SigNoz, Grafana LGTM as a supported path, pg_stat_statements in the default Compose.

**Open questions for the owner** are at the end.

## Application-wide error tracking

### What Next.js 16.4.6 gives for free, and what it does not

Source: `node_modules/next/dist/docs/01-app/` unless stated.

| Error source in this app | Caught or seen by | Gap |
|---|---|---|
| Server Component render error | `error.tsx` boundary renders a fallback; production message is generic with `error.digest` to match server logs (`03-api-reference/03-file-conventions/error.md` lines 104-113). `onRequestError` fires with `routeType: 'render'`. | The repo has no `error.tsx`; Next's default UI is shown. |
| Uncaught throw in a Route Handler (`src/app/api/**/route.ts`) | `onRequestError` with `routeType: 'route'` (`.../instrumentation.md`). | Errors the handler catches itself are invisible. `src/app/api/chat/route.ts` swallows five (lines 51, 59, 80, 96, 120), including the history, limiter and stream-setup failures, and returns 503 with no log. Fix by logging in the catch, not by a tracker. |
| Server Actions | `onRequestError` with `routeType: 'action'`. | The repo has no Server Actions (`grep "use server" src` finds none), so this is future-proofing only. |
| Better Auth (`src/app/api/auth/[...all]/route.ts`, better-auth 1.7.20) | It is a Route Handler, so a throw that escapes it reaches `onRequestError`. | Better Auth turns its own API errors into responses; whether those reach `onRequestError` is **UNVERIFIED**. Its options page documents a `logger` (default level `warn`, custom `log` function) and `onAPIError.onError` (`better-auth.com/docs/reference/options`); use those to forward to the same logger. |
| Drizzle / postgres.js failures | No hook. They surface as exceptions in whatever code called the query, so they are seen only if that code lets them escape (then `onRequestError`) or logs them. | `DrizzleQueryError.message` embeds SQL and bound parameters (see summary). postgres.js attaches `query`/`parameters` to errors but makes them non-enumerable unless `debug` is set (`node_modules/postgres/src/errors.js` lines 73-88). Never log or forward `err.message` or the whole error object from Drizzle unfiltered. Postgres' own messages can also include key values (**UNVERIFIED**, not checked in the Postgres docs). |
| Client React render errors | `error.tsx` per segment, `global-error.tsx` for the root layout (`error.md` line 96, 163). `catchError` from `next/error` for component-level boundaries (`04-functions/catchError.md`). | Nothing reports them to the server. The error boundary `useEffect` only runs in the browser, so without a client reporter these errors never reach any log. |
| Client event-handler and async errors | Not caught by React error boundaries: "Event handlers", "Asynchronous code" and errors in the boundary itself are out of scope (`react.dev/reference/react/Component`, error boundary section). | Needs `window` `error`/`unhandledrejection` listeners; Next's `instrumentation-client.ts` is the documented place ("Set up error tracking", `03-file-conventions/instrumentation-client.md`). |
| `useChat` stream errors | The route's `onError` replaces the provider error with a constant message (`src/lib/provider.ts` lines 130-132), by design. | The real cause is dropped; log its class and status only, content-free. |
| Process-level: unhandled rejection, uncaught exception outside a request | Not documented in the installed Next docs I read (they only mention a dev log `⨯ unhandledRejection` for un-awaited `notFound()` and similar, e.g. `04-functions/not-found.md`). | A `process.on('unhandledRejection')` in `register()` is possible; whether Next already installs handlers that would conflict is **UNVERIFIED**. |
| Scripts: `migrate`, `bootstrap`, `seed` | Not Next code, so no instrumentation. Each does `main().catch(...)`: prints `Failed to <x>: <message>` and sets `process.exitCode = 1` (`scripts/bootstrap.ts` lines 37-41, `scripts/migrate.ts` line 27, `scripts/seed.ts` line 86). | Compose already gates `app` on `migrate` with `service_completed_successfully` (`docker-compose.yml`), so a failed migration is visible in `docker compose ps` and `logs`. These scripts print `error.message`; if Drizzle were used in them the same parameter leak would apply (they use postgres.js directly: **UNVERIFIED** for every code path). Sending these to a tracker is not worth a second SDK; exit code and stderr are enough. |

Other facts from the installed docs: `onRequestError` receives `(error, request, context)` where `request.headers` is the full header map, so it includes cookies and Authorization and must never be forwarded wholesale; the `error` "might not be the original error instance thrown" when React processes it, so use `digest` (`.../03-file-conventions/instrumentation.md`). `instrumentation.ts` must be at the root or in `src/`, and `register` must finish before the server takes requests. `error.tsx` in this Next version receives `{ error, retry }` (not `reset`), so copy from the installed docs, not older examples (`error.md`, "retry").

### Error-tracking options compared

Constraints from the owner: self-hosted via Compose, low ops, MIT or permissive license, privacy (Conversation content must never leave).

| | GlitchTip | Bugsink | Sentry self-hosted | Sentry SaaS (free tier) |
|---|---|---|---|---|
| License | MIT (`gitlab.com/glitchtip/glitchtip-backend`, `LICENSE`) | PolyForm Shield 1.0.0 outside `ee/` (`github.com/bugsink/bugsink`, `LICENSE`) | FSL-1.1-Apache-2.0, Apache-2.0 after two years (`getsentry/sentry` `LICENSE.md`) | Proprietary service |
| Meets "MIT or permissive" | Yes | **No.** Source-available. Its "Noncompete" clause permits any purpose "except for providing any product that competes with the software" (`LICENSE` in the Bugsink repo). A chat starter is not an error tracker, so use would likely be allowed, but redistributing it inside a forkable starter and whether that is acceptable is a legal call for the owner (UNVERIFIED); it is not a permissive license | No (fair source) | n/a |
| Extra containers (Compose) | One app service (all-in-one, or separate web and worker) + PostgreSQL 14+; Valkey/Redis optional (`glitchtip.com/documentation/install`). It can share the app's existing `db` service only as a separate database (UNVERIFIED) | One `web` container + PostgreSQL in the sample compose (`bugsink/bugsink` `docker-compose-sample.yaml`: `postgres:18-alpine` and `bugsink/bugsink:2`); the app's `db` is `postgres:16`, so sharing is UNVERIFIED. SQLite and MySQL also supported (`bugsink.com/docs/installation/`) | 16+ services listed (kafka, clickhouse, postgres, redis, snuba, symbolicator, relay, vroom, taskbroker, seaweedfs, nginx, ...) | 0 |
| RAM / CPU | Recommended 512 MB RAM; minimum 256 MB all-in-one (`glitchtip.com/documentation/install`) | Each Gunicorn worker "well under 100 MiB"; "should easily fit into a 2GiB server"; up to 1.5M events/day on one cheap server (`bugsink.com/docs/single-server-production/`). The sample Compose sets no limits | 4 cores, 16 GB RAM + 16 GB swap (32 GB recommended), x86-64-v3 (`develop.sentry.dev/self-hosted/`) | n/a |
| Maintenance signal | Release v7.0.0 on 2026-11-09; last activity 2026-11-25; 367 stars on GitLab (GitLab API) | Release 2.7.1 on 2026-11-26; 2.2k stars (GitHub API) | 26.11.0 on 2026-11-18; "no guarantees or dedicated support" | Vendor-run |
| SDK compatibility | Documents `@sentry/nextjs` setup, but the page uses old `sentry.client.config.js` and does not list SDK or Next versions (`glitchtip.com/sdkdocs/javascript-nextjs`). **UNVERIFIED** against `@sentry/nextjs` 11.19.0 | Sentry-SDK compatible; "intentionally ... only error events", no traces, `traces_sample_rate` 0 (`bugsink.com/docs/sdk-recommendations/`). Version support for SDK 11 **UNVERIFIED** | Native | Native |
| Scope | Errors, plus performance, uptime, logs | Errors only; alerts to Slack, Discord, Teams, webhooks | Full APM, replay, profiling | Developer plan: 1 user, 5k errors, 30-day retention, email-only alerts, no API access or integrations (`sentry.io/pricing/`) |
| Needs email | `EMAIL_URL` is a required variable; `consolemail://` writes mails to the logs (`glitchtip.com/documentation/install`). Signup is open until the first user unless `ENABLE_USER_REGISTRATION=False` | Not stated; initial user from `CREATE_SUPERUSER` env | Yes | n/a |
| Data location | Your server | Your server | Your server | Sentry's cloud: error events leave your infrastructure |

Conclusion: GlitchTip is the only tracker that clears the stated license and ops constraints. Bugsink is lighter and simpler and has the better "errors only" story, but its license fails the owner's "MIT or permissive" requirement; if the owner relaxes that to "source-available is fine", Bugsink becomes the preferred option and the Compose profile would be one container plus a database. Sentry SaaS is a Deployer's own choice, not something the starter ships.

### What the Sentry SDK captures by default, and the scrub-by-default config

All of the trackers above use the Sentry SDK (`@sentry/nextjs` 11.19.0, MIT, peers Next `^14 || ^15 || ^16`, Node `>=20.19.0 <22 || >=22.12.0 <23 || >=23.2.0`; the Dockerfile uses `node:22-alpine`). Its defaults are the risk, not the backend. From `@sentry/core` 11.19.0 `types/datacollection.d.ts` and `docs.sentry.io/platforms/javascript/guides/nextjs/data-management/data-collected/`:

| Data | Default | Why it matters here | Setting to turn off |
|---|---|---|---|
| Incoming request body (server) | Collected | `/api/chat` body is the User's message | `dataCollection.httpBodies: []` |
| Outgoing response body | Collected, incl. Server Action results | Assistant replies | same |
| Cookies | Collected on the server | Better Auth session cookie | `dataCollection.cookies: false` |
| HTTP headers | Collected, sensitive keys such as auth/token/password replaced with `[Filtered]` | Other headers still leave | `dataCollection.httpHeaders: false` |
| Full URL query string | Collected | Invitation tokens may sit in URLs (e.g. `/invite/...`; check routes) | `dataCollection.urlQueryParams: false` |
| URL path | Always sent, cannot be disabled | Contains Workspace and Conversation IDs; acceptable | n/a |
| IP address / inferred user | Collected | PII | `dataCollection.userInfo: false` |
| Local variables in stack frames | On for Node (`stackFrameVariables` default true) | Message text held in variables | `dataCollection.stackFrameVariables: false` |
| Source context lines | 5 lines around each frame | Source code, not data | `dataCollection.frameContextLines: 0` (optional) |
| DB query data | Collected | Bound parameters of queries | `dataCollection.databaseQueryData: false` |
| Console breadcrumbs, up to 100 | On | Any `console.*` text ends up in the event | `maxBreadcrumbs: 0` or `beforeBreadcrumb` returning `null` |
| AI inputs/outputs | On if the AI integration is active | Prompts and completions | `dataCollection.genAI: { inputs: false, outputs: false }` |
| Exception message | Always | `DrizzleQueryError` message holds SQL and params | `beforeSend` must rewrite `event.exception.values[].value`, and drop the `cause` chain's values, for any message starting `Failed query:` |

`sendDefaultPii` is not present in the v11 option types I inspected (`grep` of `@sentry/core` 11.19.0 `build/types` finds none), replaced by `dataCollection`. `@sentry/nextjs` `captureRequestError` (the helper for `onRequestError`) copies `request.headers` into the event, subject to the `dataCollection` rules above (`@sentry/nextjs` 11.19.0 `build/cjs/common/captureRequestError.js`).

Scrub-by-default design for the starter, in priority order:

1. **Default is off.** No DSN, no events (verified above).
2. **Strict `dataCollection`** as in the table (all off). Wrap `beforeSend` as a final allowlist: build a new event containing only error type, a sanitized message, stack frames, route, release, and environment, rather than deleting known-bad fields from the SDK's event.
3. **Sanitize messages, not just fields.** Replace any message matching `Failed query:` with the error class and Postgres `code`. Do not trust `err.message` from any library that may echo user input (Zod issues, JSON parse errors with snippets: **UNVERIFIED** which ones echo).
4. **Tests.** A unit test with a controlled error whose message and request body contain a sentinel string, asserting the serialized outgoing event does not contain it. Use the SDK's `beforeSend` seam or a fake transport. This matches AGENTS.md's "tests use a fake provider or a controlled stream".
5. **Do not enable** Session Replay, tracing, logs, user feedback, or the Vercel AI integration. Replay records the DOM, i.e. the chat transcript. Sentry's manual-setup example for `instrumentation-client.ts` includes tracing and Session Replay (`docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/`); strip those from any copy of it.
6. **Client DSN delivery.** Next inlines `NEXT_PUBLIC_*` variables at build time, but this repo's Dockerfile bakes no configuration and Compose passes configuration at run time (Dockerfile comment). A browser-side DSN would force a build-time variable or a runtime injection. The installed `@sentry/nextjs` has a "managed tunnel" (`tunnel: true` in the browser init plus `serveTunnelIntegration()` on the server, `build/types/config/types.d.ts` lines 266-278) that forwards through the app server, which also avoids exposing the tracker's port and ad-blocker loss. Whether the browser still needs a DSN string with the managed tunnel is **UNVERIFIED**.

### A concrete minimal path: how errors reach one place

**Without an extra service (the default, step 1):**

```
route handler catch / onRequestError / error.tsx+global-error.tsx / scripts
        |  content-free structured event: { event, route, status, errorClass, pgCode, digest, requestId }
        v
   pino JSON on stdout  ->  docker compose logs app   (Deployer looks here)
```

- Server: one logger module used by the route catch blocks, `onRequestError` (log `digest`, `routePath`, `routeType`, error class only), and the Better Auth `logger.log` / `onAPIError.onError` hooks.
- Client: `error.tsx` and `global-error.tsx` show the `digest` so a User can report it, and the matching server line is already in the log. For errors that exist only in the browser (event handlers, async code), a `window` `error`/`unhandledrejection` listener in `instrumentation-client.ts` could POST `{ name, route, build id }` to a small authenticated, size-bounded endpoint that logs it. Whether to build that endpoint, given the out-of-scope line on abuse protection, is a decision for the owner (question 3 below). It must not accept or log the error message or stack text, which can contain message content.
- Scripts: keep exit code and stderr; the Compose `migrate` gate already stops `app` on failure.

**With an extra service (opt-in profile, step 2):** the same events additionally go to GlitchTip through `@sentry/nextjs` with the strict config above, `onRequestError = Sentry.captureRequestError`, a `global-error.tsx` that calls `Sentry.captureException`, and DSN supplied only through server-side environment variables in Compose. Pino stays the primary record: the tracker aggregates and de-duplicates, but logs remain the source of truth and the fallback when the tracker is down or unconfigured. Ship it as `docker compose --profile errors up`, so the default stack stays at two services plus `migrate`.

**How this fits with pino and OTel:** pino carries events and aggregates nothing; GlitchTip groups the same errors across requests; OTel traces (optional, content-free) show where in a request time or failure occurred. Link them with one `requestId`/trace id field in every log line and every error event. The AI SDK integration must not be registered both in OTel and in Sentry (Sentry's own docs: "Don't combine this integration with the AI SDK's `registerTelemetry` API", `docs.sentry.io/.../integrations/vercelai/`), another reason not to enable Sentry's AI integration at all.

**Recommended default:** step 1 for everyone, shipped first as its own increment and issue. Step 2 (GlitchTip profile) only after the owner answers questions 2 and 4 below and after GlitchTip compatibility with `@sentry/nextjs` 11.x is tested.

## Comparison

| Option | What it gives this app | Extra Compose services | License | Privacy by default | Effort with Next 16.4.6 / ai 7.0.169 | Verdict |
|---|---|---|---|---|---|---|
| Structured logs (pino) | Request/error/latency events, grep-able via `docker compose logs`; content-free by construction | 0 | MIT (pino 10.4.0) | Only what you log; `redact` available | Very low; pino is already on Next's auto-external list | **Do first** |
| `onRequestError` + health endpoint | Server error visibility, liveness for Compose | 0 | n/a (Next feature) | Only what you forward | Very low | **Do first** |
| OpenTelemetry (`@ai-sdk/otel`, `@vercel/otel`) | Traces: Next request spans, AI SDK `invoke_agent`/`chat` spans, token usage, provider host | 0 to export to an existing collector; 1 for a bundled backend | Apache-2.0 (`@ai-sdk/otel`), MIT (`@vercel/otel`) | **Records prompts and completions unless `recordInputs/Outputs: false`** | Low to medium; version pins matter (see notes) | **Second, opt-in** |
| Jaeger v2 (trace backend) | Trace UI, OTLP in | 1 container; in-memory storage by default | Apache-2.0 | Whatever the app exports | Low | Best minimal backend if one is shipped |
| Grafana LGTM (`grafana/otel-lgtm`) | Traces, metrics, logs, profiles in one image | 1 container (bundles 5 components) | Image Apache-2.0; Grafana, Loki, Tempo, Pyroscope AGPL-3.0 | Whatever the app exports | Low | Dev/demo only per its own README |
| SigNoz | All-in-one OTel UI | ClickHouse, Keeper, Postgres, collector, server (5) | MIT except `ee/` | Whatever the app exports | Medium; 4 GB+ | Defer |
| Langfuse (self-hosted) | LLM traces, prompt/completion viewer, evals, cost | 6 to 7 (web, worker, Postgres, ClickHouse, Redis, MinIO, optional gateway) | MIT except `ee/` | Stores full prompts/completions; masking only transforms | Medium; 4 cores, 16 GiB documented | Reject for this app |
| Arize Phoenix | LLM traces and evals UI | 1 container; SQLite default, Postgres optional | Elastic License 2.0 (not OSI open source) | Content captured unless AI SDK recording is off | Medium | Defer; license caveat |
| OpenLLMetry (Traceloop) | Auto-instrumentation of provider SDKs | 0 (library) | Apache-2.0 | Prompts/completions traced by default; `TRACELOOP_TRACE_CONTENT=false` | Not listed as supporting the Vercel AI SDK; redundant with `@ai-sdk/otel` | Skip |
| Error trackers (GlitchTip, Bugsink, Sentry self-hosted, Sentry SaaS) | Aggregated, de-duplicated errors across server and client | 1 to 16+ (see "Application-wide error tracking") | MIT (GlitchTip); PolyForm Shield (Bugsink); FSL (Sentry) | SDK defaults send request bodies, cookies, headers, locals; must be scrubbed | Medium; SDK config plus tests | **GlitchTip as optional profile** |
| pg_stat_statements | Slow-query visibility in PostgreSQL | 0, but needs `shared_preload_libraries` and a restart | PostgreSQL license (contrib) | Normalized SQL, constants replaced by `$n` | Low | Document as a Deployer tip, not default |

## Notes per option

### What the installed stack provides

- **Next 16.4.6** documents `instrumentation.ts` with `register()` and `onRequestError` (`node_modules/next/dist/docs/01-app/02-guides/instrumentation.md`; `.../03-file-conventions/instrumentation.md`). `register` runs once per server instance; use `process.env.NEXT_RUNTIME === 'nodejs'` to gate Node-only code. `onRequestError(err, request, context)` receives the error, request path/method/headers, and route context (`routerKind`, `routePath`, `routeType`). Note that `request.headers` includes cookies and the Authorization header, so a forwarder must not log them.
- Next ships its own OpenTelemetry spans (root `GET /route` span with `http.method`, `http.route`, `http.target`; `AppRouteRouteHandlers.runHandler`; `fetch` spans with `http.url`), and recommends OpenTelemetry (`.../02-guides/open-telemetry.md`). `NEXT_OTEL_VERBOSE=1` emits more spans; `NEXT_OTEL_FETCH_DISABLED=1` turns off the fetch span. `@vercel/otel` "works both on Vercel and when self-hosted" with an OpenTelemetry Collector; the manual `NodeSDK` path requires Node-runtime-only import. This repo's Dockerfile runs `node:22-alpine` with `output: 'standalone'` (`Dockerfile`, `next.config.ts`).
- **AI SDK 7.0.169** (`node_modules/ai/docs/03-ai-sdk-core/60-telemetry.mdx`):
  - OpenTelemetry spans now come from a separate package, `@ai-sdk/otel`, registered with `registerTelemetry(new OpenTelemetry())`. It is not installed in this repo (`node_modules/@opentelemetry` is absent; `@ai-sdk/otel` is not in `package.json`).
  - Telemetry is opt-out: once an integration is registered, all calls emit events. `telemetry: { isEnabled: false }` opts out per call. `recordInputs`/`recordOutputs` default to true (also in `07-reference/01-ai-sdk-core/02-stream-text.mdx` lines 521-535).
  - When either recording flag is false, raw provider bodies and provider metadata are omitted and span errors use a generic message. Application callbacks and returned results still get full content.
  - `runtimeContext` is excluded from telemetry unless listed in `telemetry.includeRuntimeContext`.
  - The built-in OpenTelemetry integration records `server.address`/`server.port` of the provider endpoint, and token usage as `gen_ai.usage.*`.
  - `ai:telemetry` is a Node `diagnostics_channel` that any subscriber can listen to, and "Not registering integrations ... does not disable ... Node.js tracing-channel subscribers". A per-call `telemetry: { isEnabled: false }` is the only way to stop those events. Relevant if a future dependency subscribes.
  - Current call site: `src/lib/provider.ts` `streamText({...})` passes no `telemetry` option. After RAG, `embed`/`embedMany` calls will also emit telemetry containing Document text unless set.
- **Version caution.** On npm today `@ai-sdk/otel` is 1.0.183 and pins `ai` at exactly 7.0.183, while this repo has 7.0.169 installed (`^7.0.169` in `package.json`) (npm registry, `registry.npmjs.org/@ai-sdk/otel`). An install would either need `ai` bumped or an older matching `@ai-sdk/otel`; how npm would resolve this here is **UNVERIFIED**. Separately, OpenTelemetry JS has moved to a 3.x line (`@opentelemetry/sdk-node` 0.301.2 requires `@opentelemetry/api` 1.10; GitHub `open-telemetry/opentelemetry-js` latest v3.1.1), while `@vercel/otel` 2.3.0 peers on 2.x packages and `@langfuse/otel` documents `sdk-node` `>=0.202.0 <0.300.0`. Pin a mutually compatible set deliberately; do not install "latest" of everything.

### Structured logging (pino) — baseline

- **Gives:** JSON events with request id, route, status, duration; readable with `docker compose logs`, shippable later to any collector. No content unless someone logs it.
- **Cost:** zero services. pino 10.4.0, MIT (npm registry; GitHub `pinojs/pino`, 18k stars, active). Next lists `pino` among packages it externalizes automatically (`.../05-config/01-next-config-js/serverExternalPackages.md`).
- **Privacy:** safe by design if the log schema carries IDs and counts only. pino `redact` (paths, `censor`, `remove: true`) exists as a backstop; paths must not come from user input and wildcards cost performance (`github.com/pinojs/pino/blob/main/docs/redaction.md`). A backstop is not a substitute for not logging content.
- **Existing precedent:** `src/lib/provider.ts` already comments "Content-free on purpose" on its `onError`. The logger should follow the same rule and have a unit test for it.
- **Alternative:** a 20-line wrapper over `console` writing one JSON line. Cheaper, fewer dependencies; pino is worth it mainly for levels, child loggers, and redaction.

### OpenTelemetry traces (Next instrumentation + AI SDK telemetry)

- **Gives:** a trace per chat request: Next server span, route-handler span, AI SDK `invoke_agent` and `chat` spans with token usage, finish reason, provider host, timing. With a Document pipeline, spans around `embed`/`embedMany`. Vendor-neutral: Next's guide says it "allows you to change your observability provider without changing your code".
- **Services:** none required in the app's Compose file if the Deployer points `OTEL_EXPORTER_OTLP_ENDPOINT` at their own collector; otherwise one backend container (below). Next's self-hosting note: "You will need to spin up your own OpenTelemetry Collector" for the Collector route, but "OpenTelemetry Collector is not necessary" if a custom exporter is used.
- **Privacy:** records inputs and outputs by default (see above). Mitigation: register with `recordInputs: false, recordOutputs: false` set where the integration reads them (the doc shows these as `telemetry` options on calls; whether they can be set once globally on the `OpenTelemetry` integration rather than per call is **UNVERIFIED** from the docs read). The per-call route is workable here because `streamAssistant` is the single seam (`src/lib/provider.ts`, ADR-0005), so one `telemetry: { recordInputs: false, recordOutputs: false, functionId: 'chat' }` covers every chat call, and the later embedding adapter gets the same. Also: do not put `userId` in `includeRuntimeContext`; pseudonymous Workspace/Conversation IDs are the most that should go in spans. Next's HTTP spans carry `http.target`, which includes Conversation/Workspace IDs in paths; acceptable, but not message content.
- **Also check:** Next's `fetch` spans record `http.url` of outgoing calls; for `AI_BASE_URL` pointing at a provider this is a host, but a base URL containing credentials in the query would leak. Not confirmed to occur; **UNVERIFIED**, avoid keys in URLs.
- **Effort:** low to medium. Add `src/instrumentation.ts`, gate by `OTEL_EXPORTER_OTLP_ENDPOINT` being set so default Compose does nothing. Must test with Turbopack build and the `standalone` output; whether OpenTelemetry packages trace correctly into `.next/standalone` is **UNVERIFIED** here.

### Trace backends for OTel (if the Deployer wants a bundled one)

- **Jaeger v2.23.0** — Apache-2.0 (GitHub API). `docker run ... cr.jaegertracing.io/jaegertracing/jaeger:2.23.0` is a single all-in-one container with UI on 16686 and OTLP on 4317/4318; storage is transient in-memory by default, so traces vanish on restart (`jaegertracing.io/docs/latest/getting-started/`). Persistent backends (Badger, Cassandra, Elasticsearch, OpenSearch) need a config file. Traces only, no logs/metrics. Best match for "one extra container, low burden" and honest about being ephemeral.
- **Grafana `otel-lgtm` v0.41.1** — image repo is Apache-2.0; it bundles OpenTelemetry Collector, Prometheus, Tempo, Loki, Pyroscope and Grafana in one container. Its own README says it is "intended for development, demo, and testing environments" and points to Grafana Cloud for production (`github.com/grafana/docker-otel-lgtm`). Tempo, Loki, Grafana and Pyroscope are AGPL-3.0 (GitHub API). Fine to run unmodified, but an AGPL component inside a forkable starter is a decision for the owner. A good developer-experience profile, not a supported deploy path.
- **SigNoz v0.152.0** — MIT outside `ee/` (`github.com/SigNoz/signoz/blob/main/LICENSE`). Docker standalone starts ClickHouse, ClickHouse Keeper, Postgres 16, a collector and the server; "at least 4GB allocated to Docker"; the Docker install script and `deploy/` Compose files are deprecated since v0.130.0 in favor of Foundry (`signoz.io/docs/install/docker/`). Heavy for a starter that is already two containers. Also, AI SDK's observability page lists SigNoz as an integration (`ai-sdk.dev/providers/observability`).

### Langfuse (self-hosted)

- **Gives:** the best LLM-specific UI: nested traces, prompt/completion viewer, token and cost, sessions, scores/evals. Integrates with AI SDK 7 via `@langfuse/vercel-ai-sdk` 6.1.1 (MIT, peers `ai >=7 <8`) and `@langfuse/otel`; requires Node 22+ (`langfuse.com/integrations/frameworks/vercel-ai-sdk`; npm registry).
- **Services:** web, worker, PostgreSQL, ClickHouse, Redis/Valkey, S3-compatible storage (MinIO), plus an optional beta AI gateway; the Compose guide lists 7 containers and states at least 4 cores, 16 GiB RAM, 100 GiB disk, "not for production", no HA or backups (`langfuse.com/self-hosting`, `.../deployment/docker-compose`). That is three to four times the footprint of the whole current stack, and a second PostgreSQL.
- **License and ownership:** MIT except `ee/` directories (`github.com/langfuse/langfuse/blob/main/LICENSE`). 37.9k stars, latest v4.88.0 published 2026-11-26. The README says "Since January 2026 we're part of ClickHouse" (repo README, via fetch).
- **Privacy:** this is the deal-breaker. Its purpose is to store prompts and completions. The documented masking hook (`mask` on `LangfuseSpanProcessor`) transforms `input`, `output`, `metadata` for every observation; the docs do not describe dropping them, and its AI SDK page documents no input/output switch other than disabling a call (`langfuse.com/docs/observability/features/masking`; `.../vercel-ai-sdk`). The AI SDK's `recordInputs: false` would still work upstream of it, leaving traces with no content, at which point most of Langfuse's value is gone. Anyone with Langfuse access could read every User's private Conversation, contradicting ADR-0001 for any deployment where the Deployer is not the sole User.
- **Verdict:** do not add. Revisit only if a content-free mode is a real product need, or for a developer's local machine (single user, fake data).

### Arize Phoenix and OpenLLMetry

- **Phoenix:** Elastic License 2.0 (`github.com/Arize-ai/phoenix/blob/main/LICENSE`): forbids offering it "as a hosted or managed service" and circumventing license-key functionality. Source-available, not OSI open source. 12.4k stars, release `arize-phoenix-v22.1.0` on 2026-11-26. One container, SQLite default (volume mount), PostgreSQL 14+ via `PHOENIX_SQL_DATABASE_URL` for production (`arize.com/docs/phoenix/self-hosting/architecture`). AI SDK 7 is supported with `@arizeai/phoenix-otel` 2.x and `@arizeai/openinference-vercel` 3.x (npm: peers `ai ^7`, `@ai-sdk/otel ^1`; `arize.com/docs/phoenix/integrations/typescript/vercel/vercel-ai-sdk-tracing-js`). The docs describe no masking feature; the only privacy knob is `headers: false`. Lighter than Langfuse, same content-capture problem.
- **OpenLLMetry (Traceloop):** Apache-2.0 library (`@traceloop/node-server-sdk` 0.27.0, 2026-06-01). By default it "logs prompts, completions, and embeddings to span attributes"; `TRACELOOP_TRACE_CONTENT=false` or `traceContent: false` disables (`traceloop.com/docs/openllmetry/privacy/traces`). The Next.js guide requires a webpack `node-loader` rule and passing LLM modules explicitly, and the Vercel AI SDK is not in its JS/TS supported tables (`.../getting-started-nextjs`, `.../tracing/supported`). With AI SDK 7's native OpenTelemetry integration it adds nothing. Skip.

### Error tracking

Moved and extended: see "Application-wide error tracking" near the top (Next.js built-ins, GlitchTip vs Bugsink vs Sentry, scrub-by-default config).

### PostgreSQL-level: pg_stat_statements

- **Gives:** per-normalized-query call counts and timings, useful for finding slow Conversation list queries and, after RAG, vector search cost.
- **Cost:** no service, but it needs `shared_preload_libraries = 'pg_stat_statements'` and `compute_query_id` set, a server restart, and `CREATE EXTENSION` per database (`postgresql.org/docs/16/pgstatstatements.html`). In Compose this is a `command:` override on `db`. That the official `postgres:16` image ships the contrib module is **UNVERIFIED** from a primary source (general knowledge only).
- **Privacy:** constants are replaced by `$1`, `$2`, but the docs note constants may still appear unnormalized when entries are frequently deallocated, and only superusers and `pg_read_all_stats` members can read other users' query text. Query text is SQL, not row values, so message content is not stored; the risk is low but not zero.
- **Verdict:** document as an optional Deployer tip; do not change the default `db` service for it. Revisit when RAG lands.

## Privacy checklist for any telemetry that is ever turned on

- Default off. Enabled only by an explicit environment variable (for example the standard `OTEL_EXPORTER_OTLP_ENDPOINT`).
- `recordInputs: false` and `recordOutputs: false` set in code at the single AI seam, plus a unit test using a controlled stream that fails if a span or log would contain message text. AGENTS.md already requires tests to avoid real keys; this fits.
- No `userId` in `includeRuntimeContext`; IDs of Workspace and Conversation only if needed.
- Forwarders for `onRequestError` and any SDK must drop headers and cookies; error events must not contain request bodies, local variables, breadcrumbs or `DrizzleQueryError` messages (SQL plus parameters). Pin this with a test that feeds a sentinel string through the error path and asserts it is absent from the outgoing event or log line.
- Telemetry credentials (OTLP headers, DSNs) come from server-side environment variables only; none in the client bundle (AGENTS.md "Secrets stay on the server").
- State in the README what is and is not captured, because Owners cannot read Conversations and the Deployer should not either through a side door.

## Open questions for the owner

1. Who is the audience for the starter's observability: a Deployer running a single-person instance (logs are enough), or a team with its own Grafana/Datadog/Sentry stack (then only an optional DSN or OTLP endpoint matters and nothing is bundled)?
2. Is "MIT or permissive" a firm bar for anything shipped in Compose? It excludes Bugsink (PolyForm Shield, noncompete) and Sentry self-hosted (FSL). If source-available is acceptable, Bugsink is lighter than GlitchTip (one container plus a database, errors only).
3. Should browser-only errors (event handlers, async code, which React error boundaries do not catch) be captured without a tracker? That needs a small authenticated, size-bounded endpoint that logs name and route only. It adds a write path, which sits next to the out-of-scope abuse-protection line.
4. Ship a GlitchTip Compose profile in the starter, or only document how a Deployer points the app at their own Sentry-compatible server? Shipping it means taking `@sentry/nextjs` (build wrapper `withSentryConfig`, client bundle) as a dependency for an optional feature, and testing GlitchTip against SDK 11.x.
5. Should the first increment (log in the chat route's five `catch {}` blocks, pino, `instrumentation.ts`, `error.tsx`/`global-error.tsx`, `/api/health`, Compose log rotation and healthcheck) be one issue? The roadmap says not to start a planned item unless its issue is the task, so this needs its own issue.
6. Should telemetry that records message content ever be possible, for example behind an explicit "debug only" variable for a single-user instance? This research assumes no.
7. Bump `ai` to the version `@ai-sdk/otel` expects, or pin an older `@ai-sdk/otel`? (Version-skew note above.)
8. If a trace backend is bundled at all, is an ephemeral Jaeger profile acceptable, or is AGPL (Grafana stack) a blocker for a forkable starter?
9. After RAG, should embedding calls be traced at all, given Document text is Workspace-wide knowledge but still sensitive?

## UNVERIFIED items (consolidated)

- Whether `recordInputs`/`recordOutputs` can be set once globally on the `OpenTelemetry` integration; the docs show them per call.
- Whether OpenTelemetry packages work with the Turbopack build and `standalone` output; how npm resolves the `@ai-sdk/otel` / `ai` exact-version pin here.
- Whether the official `postgres:16` image ships `pg_stat_statements` (Postgres docs describe it as contrib only).
- GlitchTip and Bugsink compatibility with `@sentry/nextjs` 11.19.0 (neither vendor page lists SDK versions; GlitchTip's Next.js guide shows pre-App-Router config files).
- Whether Better Auth's handled API errors reach `onRequestError`.
- Whether Next installs its own process-level `unhandledRejection` handlers that would conflict with one added in `register()`.
- Whether Postgres error messages (not Drizzle's) include row values in this app's constraint errors.
- Whether the browser still needs a DSN string when using Sentry's managed tunnel.
- Whether GlitchTip or Bugsink can use a separate database in the app's existing `postgres:16` service (Bugsink's sample uses `postgres:18-alpine`).
- Whether a Bugsink or GlitchTip redistribution inside a forkable starter is acceptable under their licenses (legal question; only the license text was read).
- Whether pino output is captured as Sentry console breadcrumbs (pino writes to the stream, not `console.*`).
- Several vendor-page figures (Langfuse resources, Sentry requirements, Phoenix storage, SigNoz containers, GlitchTip resources, Bugsink memory) came via a page-summarizing fetch tool, not raw page text.

## Sources

- Repo: `AGENTS.md`, `docs/product.md`, `docs/adr/0005-self-hosted-starter.md`, `.scratch/roadmap/roadmap.md`, `package.json`, `docker-compose.yml`, `Dockerfile`, `next.config.ts`, `src/lib/provider.ts`, `src/lib/conversation-reply.ts`, `README.md` line 194.
- Installed docs: `node_modules/next/dist/docs/01-app/02-guides/instrumentation.md`, `.../open-telemetry.md`, `.../03-file-conventions/instrumentation.md`, `.../serverExternalPackages.md`; `node_modules/ai/docs/03-ai-sdk-core/60-telemetry.mdx`, `.../65-devtools.mdx`, `.../08-migration-guides/23-migration-guide-7-0.mdx`, `.../07-reference/01-ai-sdk-core/02-stream-text.mdx`.
- GitHub API (repo, license, latest release) for langfuse, phoenix, grafana, jaeger, signoz, sentry, opentelemetry-js, pino, openllmetry; raw `LICENSE` files for Langfuse, SigNoz, Sentry, Phoenix.
- npm registry: `@ai-sdk/otel`, `@langfuse/vercel-ai-sdk`, `@langfuse/otel`, `@arizeai/openinference-vercel`, `@vercel/otel`, `@opentelemetry/sdk-node`, `@sentry/nextjs`, `pino`, `@traceloop/node-server-sdk`.
- Vendor docs: langfuse.com (self-hosting, Docker Compose, Vercel AI SDK, masking); arize.com/docs/phoenix (self-hosting, architecture, Vercel AI SDK tracing); jaegertracing.io getting started; signoz.io Docker install; github.com/grafana/docker-otel-lgtm; develop.sentry.dev/self-hosted; docs.sentry.io (sensitive data, Vercel AI); glitchtip.com install; gitlab.com/glitchtip/glitchtip-backend; traceloop.com docs; postgresql.org pg_stat_statements; pino redaction doc; ai-sdk.dev/providers/observability.
- Error tracking follow-up: `node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md`, `.../03-file-conventions/error.md`, `.../instrumentation-client.md`, `.../04-functions/catchError.md`; `node_modules/drizzle-orm/errors.js` and `pg-core/session.js` (0.45.4); `node_modules/postgres/src/errors.js`; `src/app/api/chat/route.ts`; `scripts/bootstrap.ts`, `scripts/migrate.ts`, `scripts/seed.ts`.
- Sentry SDK source (downloaded with `npm pack`, not installed): `@sentry/core` 11.19.0 `build/types/types/datacollection.d.ts` and `options.d.ts`; `@sentry/nextjs` 11.19.0 `build/cjs/common/captureRequestError.js`, `package.json` engines and peers.
- Error tracker sources: `gitlab.com/glitchtip/glitchtip-backend` (LICENSE, releases API, `compose.yml`); `glitchtip.com/documentation/install`, `.../sdkdocs/javascript-nextjs`; `github.com/bugsink/bugsink` (LICENSE, `docker-compose-sample.yaml`, releases API); `bugsink.com/docs/` (installation, single-server-production, sdk-recommendations); `sentry.io/pricing/`; `docs.sentry.io/platforms/javascript/guides/nextjs/` (manual-setup, data-management/data-collected, integrations/vercelai); `better-auth.com/docs/reference/options`; `react.dev/reference/react/Component`.
- Fetch-summarizer caveat: where a figure came through a page-summarizing fetch tool rather than raw text, spot-check it before it drives a decision. License text, package metadata and source files above were read raw.
