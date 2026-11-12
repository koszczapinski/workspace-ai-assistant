# 07: AI-native chat presentation with Trace

**What to build:** Present chat activity with the shadcn Trace component (`npx shadcn@latest add trace`). Show the waiting, streaming, completed, stopped, and failed states as Trace lines while preserving incremental plain-text responses, Stop, and Retry behavior. Surface provider reasoning only when it is returned, in a collapsible Trace row.

**Blocked by:** 06 — LUNARITY visual identity across the app.

**Status:** ready-for-agent

- [ ] Before the first response token, a `TraceLine` with `status="running"` shows the shimmer title “Thinking…”. While response text streams, it remains clear that generation is active; after completion the line drops its `status` (Trace has no "done" status; a line without `status` means finished) and shows an elapsed-time title such as “Thought 3s”.
- [ ] Stop and provider errors are presented as Trace lines with their state stated in the title. Stop keeps any partial response visible and restores the existing interactive controls; errors retain the existing Retry behavior without duplicating the user message.
- [ ] When the provider returns reasoning parts, they appear as plain text in a collapsible Trace row that is open while reasoning is running and can be toggled after completion. No reasoning row is shown when the provider returns none. Model output and reasoning are never rendered as raw HTML.
- [ ] The “Thinking…” shimmer respects `prefers-reduced-motion`. Assistive technology is informed when the activity state changes, but is not made to announce individual streamed tokens.
- [ ] Motion: only the Trace shimmer plus a subtle entry for new messages (opacity plus at most 4px of upward movement, 150–200ms, Framer Motion or CSS). No other decorative animation. All motion is disabled under `prefers-reduced-motion`.
- [ ] The fake provider has a configurable delay so tests can observe the waiting and streaming states without a real AI key or paid call.
- [ ] Unit and/or Playwright coverage with the fake provider verifies thinking → streaming → done, stopped, and error states, including incremental text and the accessible state announcements.
