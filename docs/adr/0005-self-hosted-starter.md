---
status: accepted
date: 2026-11-23
---

# The project is a self-hosted starter, not a hosted product

The project began as a two-evening portfolio MVP. We now treat it as a **self-hosted starter**: someone forks it, sets environment variables and runs their own instance. One **Deployer** runs one instance; the instance holds many Workspaces and Users, isolated by the server. `docs/product.md` is the living description; `docs/spec.md` is the frozen MVP record.

## Decisions

- **AI configuration is per deployment.** One provider and model per instance, chosen by the Deployer through server-side environment variables (issue #29). There are no per-Workspace provider settings, no named model profiles, and no model choice by Owners or Members. Provider keys never enter the database.
- **A single seam.** The chat model comes from one resolver inside the provider adapter, so a later reversal of the decision above changes one place.
- **First run uses a bootstrap script,** not Workspace creation in the UI and not public signup. The script creates a Workspace and prints a single-use Owner Invitation link. It follows the safety rules of ADR-0002.
- **The supported deploy path is Docker Compose** (app and PostgreSQL). Other hosts may work but are not tested. Local models (LM Studio, Ollama, vLLM) work through the `openai-compatible` provider and are not exercised in CI.
- **No public demo.** The README tells the Deployer that Usage limits are basic and must be reviewed before any public exposure.
- **RAG is planned next after the deployment work.** It stays inside the same PostgreSQL (pgvector). Tools and function calling remain out of scope until a separate decision.

## Considered Options

- **Hosted multi-customer SaaS:** rejected. It needs billing, public signup, Workspace creation, per-customer secrets and production-grade abuse protection. Every one of those is a large project and none shows the isolation and streaming work this repository is about.
- **Stay a portfolio MVP:** rejected. The increments already shipped (Invitations, Owner role, settings, Appearance, persistent Conversations) go beyond a demo, and a configurable provider only makes sense for someone who deploys it.
- **Per-Workspace AI configuration:** rejected. It means storing and encrypting provider keys per tenant and opens a second path for key leakage. Environment variables keep secrets out of the database.

## Consequences

- `AGENTS.md` scope and out-of-scope lists, `.scratch/roadmap/roadmap.md` and `GLOSSARY.md` change in the same PR as this ADR.
- The roadmap order becomes: configurable provider (#29), bootstrap script and Docker Compose, RAG, then later items.
- Reversing the per-deployment decision later means a schema for provider settings and a key-encryption design. The resolver seam limits the code change, not the security work.
