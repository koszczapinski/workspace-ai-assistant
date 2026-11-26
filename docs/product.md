# Workspace AI Assistant — Product

The living description of the project. It replaces `docs/spec.md` as the source of truth for scope. `docs/spec.md` stays as the frozen record of the MVP; where the two disagree, this document and `GLOSSARY.md` win. Decisions behind it: `docs/adr/`.

## Vision

A self-hosted starter for a multi-tenant AI chat application (ADR-0005). A **Deployer** forks the repository, sets environment variables and runs one instance. Inside it, signed-in Users chat with an assistant scoped to a Workspace they belong to. The server alone decides who may access which Workspace; assistant instructions never enforce isolation.

It stays a small, finished codebase: one increment at a time, each its own PR with a spec and tickets.

## Principles

- **Server-enforced isolation.** Authentication and Workspace access are decided only on the server. Client filtering, a submitted `userId` and assistant instructions are never authorization.
- **Private Conversations.** A Conversation is owned by one User and visible only to them, including to Owners (ADR-0001).
- **Secrets stay in the environment.** Provider keys are server-side environment variables, never in the database or the client (ADR-0005).
- **No hidden defaults.** Missing or invalid configuration is an explicit error, not a silent fallback to a paid provider.
- **Tests need no paid calls.** Tests use a fake provider or a controlled stream.

## Current capabilities

- Login; Workspace list; streamed chat in `/w/[workspaceId]` with Stop and Retry.
- Assistant replies and the Reasoning trace render a safe Markdown subset; User messages stay plain text (ADR-0006).
- Persistent, private Conversations with a list, rename and delete.
- Owner and Member roles; single-use Invitations; members screen.
- The Deployer creates Workspaces, one per name, with `bootstrap --workspace "Name"`, each with a single-use Owner Invitation; the same command re-issues it while the Workspace has no Owner.
- Avatar: each User uploads one picture on their Account page (initials otherwise), stored re-encoded in PostgreSQL and served only to the User and to Owners of a Workspace they belong to; the members screen shows it next to the role (ADR-0007).
- Workspace settings: name and Assistant instructions (ADR-0004); Appearance presets (ADR-0003).
- Usage limits per User per minute and per Workspace per day.
- Explicit environment (`APP_ENV`) and database safety rules (ADR-0002).

## Roadmap

Order and status live in `.scratch/roadmap/roadmap.md`. In short:

1. **Configurable AI provider** (issue #29, shipped: #32, #33, #34). One provider per deployment, chosen by environment variables; includes an OpenAI-compatible provider so a local model works.
2. **Bootstrap and deployment.** A `bootstrap` script creates a Workspace (any number, by name) and prints a single-use Owner Invitation link, or re-issues it by name while the Workspace has no Owner. Docker Compose (app and PostgreSQL) is the one supported deploy path; the README walks a Deployer from clone to first Conversation, and a CI job (`compose-smoke`) boots Compose with the fake provider, runs `bootstrap` and accepts the Owner Invitation without chatting (Compose is production-only, which refuses the fake provider).
3. **User Avatar** (issue #56, shipped).
4. **User management** (decided 2026-11-27). The goal: a Deployer can run one instance with many Workspaces without editing the database. There are seven increments, in this order, and each gets its own spec and tickets when it starts:
   1. The Deployer creates more Workspaces from the command line (shipped, issue #75): `bootstrap --workspace "Beta"` creates a Workspace and prints its single-use Owner Invitation link.
   2. Invitations for existing Users: a signed-in User joins another Workspace without creating a second account.
   3. Account: change name and password, and sign out other devices.
   4. Password reset issued by the Deployer: a command-line command prints a single-use reset link (ADR-0008).
   5. An audit log of Owner actions.
   6. Deleting your own account. The last Owner of a Workspace must hand over the role first.
   7. Per-Workspace Usage limits.
5. **RAG** (decisions below).
6. **Later:** optional email delivery (SMTP), starting with email verification (ADR-0008).

## RAG: decisions taken

Details get their own spec and tickets when the increment starts. These decisions are already made:

- A **Document** is text uploaded by an Owner as knowledge of the Workspace. Only Owners upload and delete. It belongs to the Workspace, not to a User, and the assistant may use it in every Conversation of that Workspace.
- **Confidentiality:** a Document is knowledge of the whole Workspace. Any Member can obtain its content through the assistant, and Owners upload nothing they do not want Members to see. There are no Documents visible to only some Members.
- **Sources.** The UI names the Documents used under an answer. There is no query log: an Owner cannot see which Documents were used in another User's Conversation.
- **Untrusted content.** Document text is untrusted data and can contain prompt injection. Authorization and isolation never depend on it. Retrieval filters by Workspace on the server and has an isolation test.
- **Files.** `.txt`, `.md` and `.pdf` with a text layer. No OCR, images or Office formats. 5 MB per file and 20 Documents per Workspace. Only extracted text, split into chunks with embeddings, is stored in PostgreSQL (pgvector); the original file is not kept and cannot be downloaded. Deleting a Document deletes its chunks.
- **Embeddings.** One embedding model per deployment, set by environment variables (e.g. `AI_EMBEDDING_PROVIDER`, `AI_EMBEDDING_MODEL`, `AI_EMBEDDING_BASE_URL`), with an `openai-compatible` provider and a `fake` one limited to development and test. Changing the model changes the vector size and needs a re-index script.

## Not planned

Billing; public signup; Workspace creation in the UI; sign-in through OAuth providers and two-factor authentication; more than two roles; model selection by Owners or Members; per-Workspace AI configuration and named model profiles; permissions per Document. Tools and function calling stay out of scope until a separate decision, which comes after RAG.

## Deployment

One Deployer, one instance, Docker Compose as the tested path. Local models (LM Studio, Ollama, vLLM) work through the `openai-compatible` provider and are not part of CI. There is no public demo: Usage limits are basic, and the Deployer must review them before any public exposure.
