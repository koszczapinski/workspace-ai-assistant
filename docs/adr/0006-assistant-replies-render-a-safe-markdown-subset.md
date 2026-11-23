---
status: accepted
date: 2026-11-23
---

# Assistant replies render a safe Markdown subset

Most models answer in Markdown, so showing it as plain text leaves raw `**` and `#` in the chat. This supersedes the MVP spec's "plain text is sufficient" rule. The raw text stays the stored source; rendering is only a display concern.

## Decisions

- **Scope:** assistant response text and the Reasoning trace. User messages and Conversation titles stay plain text.
- **Subset:** CommonMark plus GFM: paragraphs, emphasis, strikethrough, nested lists, quotes, rules, inline and fenced code, tables, links. Headings are shifted below the page outline (`#` → h3, `##` → h4, deeper → h5).
- **No images:** an image renders as its alt text and is never fetched. A prompt-injected image URL could otherwise exfiltrate Conversation data; this matters more once RAG adds untrusted Document text.
- **No raw HTML:** it is shown as literal text.
- **Links:** only `http:`, `https:` and `mailto:` become anchors (`target="_blank"`, `rel="noopener noreferrer nofollow"`). Any other scheme is plain text.
- **Streaming:** only the streaming response passes through `remend` to close unfinished Markdown. Finished, stopped and reloaded responses render the stored text as is.
- **Implementation:** `react-markdown` with `remark-gfm`, behind one component (`src/components/safe-markdown.tsx`) that owns the policy. No `innerHTML`, no `rehype-raw`.

## Rejected alternatives

- Plain text plus a prompt asking for no Markdown: models ignore it.
- Stripping Markdown: loses structure.
- `streamdown`: parses raw HTML and relies on a sanitizer; heavier.
- `markdown-it` + DOMPurify: requires `innerHTML`.
