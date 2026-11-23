---
status: accepted
date: 2026-11-23
---

# Owners edit the Workspace name and Assistant instructions

ADR-0003 allowed one exception to "no Workspace editing": Appearance. It said the Workspace name and Assistant instructions stay read-only and that any further editable field needs its own decision. This is that decision, taken after the "Owner edits Workspace settings" increment shipped (#22): an Owner edits the Workspace name and Assistant instructions on the settings screen.

A save replaces both fields, the last save wins, and the change applies from the next chat request. The server allows only an Owner, using the existing Owner authorization, and never accepts the role from the client. The same rules apply to Appearance.

## Considered Options

- **Keep both fields read-only (ADR-0003 as written):** rejected. A Workspace whose assistant behaviour can only be changed by editing the database is not usable as a starter. The deployer would need SQL for the most basic customisation.
- **Edit through a deployer-only file or script:** rejected. It splits one Workspace's settings across two places and makes the Owner dependent on the deployer.
- **Version history or approval for instruction changes:** rejected for now. It adds a review workflow for a one-field change. An audit log of Owner actions stays on the "later" list of the roadmap.

## Consequences

- ADR-0003 is superseded in part: only its statement that name and Assistant instructions stay read-only. Its decision on Appearance stands.
- `GLOSSARY.md` already defines **Workspace settings** accordingly.
- Assistant instructions still influence answers only; they are never an authorization mechanism.
