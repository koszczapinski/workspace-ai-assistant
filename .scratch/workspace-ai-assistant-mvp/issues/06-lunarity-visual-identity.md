# 06: LUNARITY visual identity across the app

**What to build:** Apply the LUNARITY visual identity across the login, workspace list, and workspace chat screens. Use the site’s restrained near-black and white neutral palette and sans-serif typography as direction, expressed through shadcn theme tokens. Add a cohesive dark theme, responsive layouts, and useful empty states without changing authentication or workspace authorization behavior.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Design reference (extracted from https://lunarity.ai)

The site uses the shadcn neutral palette; the identity comes from the effects, not from colour. Use these values as the starting point:

- Tokens (light / dark): background `oklch(100% 0 0)` / `oklch(14.5% 0 0)`, foreground `oklch(14.5% 0 0)` / `oklch(98.5% 0 0)`, card `oklch(100% 0 0)` / `oklch(20.5% 0 0)`, primary `oklch(20.5% 0 0)` / `oklch(92.2% 0 0)`, muted `oklch(97% 0 0)` / `oklch(26.9% 0 0)`, muted-foreground `oklch(55.6% 0 0)` / `oklch(70.8% 0 0)`, border `oklch(92.2% 0 0)` / `oklch(100% 0 0 / .1)`, `--radius: .625rem`.
- Typography: system sans stack (`ui-sans-serif, system-ui`), headings `font-semibold tracking-tight`, small uppercase labels `tracking-widest`, mono for technical details.
- Signature effects: gradient heading text (`from-foreground to-foreground/70`), hairline gradient dividers (`from-transparent via-foreground/50 to-transparent`), a soft radial `blur-3xl` glow behind the hero/login area, a sticky header with `backdrop-blur-xl`, `rounded-2xl` cards with a large soft hover shadow, `rounded-full` pills, and in dark mode a warm "moonlight" glow `rgba(255,247,228,…)`.
- Dark mode is the primary showcase; light mode must stay polished.
- Chat layout reference: like Claude/ChatGPT, a centred reading column (max ~720px), the composer pinned to the bottom, user messages as subtle filled bubbles, assistant messages as plain text on the background.
- Use effects sparingly: at most one glow per screen and no decorative motion in the chat column.

- [ ] Login, workspace list, and chat use a coherent LUNARITY-inspired visual system based on shadcn tokens, including color, typography, spacing, surfaces, and a usable dark appearance.
- [ ] All three screens remain usable at mobile and desktop widths, with no horizontal overflow; long workspace names and chat messages remain readable.
- [ ] An empty workspace list and a conversation with no messages each have a clear, useful empty state.
- [ ] Interactive controls support keyboard navigation, have visible focus indicators, and maintain readable contrast in light and dark appearances.
- [ ] Before finishing, compare the screenshots with lunarity.ai (light and dark) and list the remaining visual differences in the implementation notes; Krzysztof approves the screenshots before merge.
- [ ] The existing Playwright critical journey still passes. Refreshed mobile and desktop screenshots show the updated app using synthetic demo data.
