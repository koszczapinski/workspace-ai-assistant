---
status: accepted
date: 2026-11-23
---

# Workspace appearance is the only editable Workspace setting

The MVP keeps "Workspace creation and editing" out of scope. We decided to make one narrow exception: an Owner can change the Workspace's appearance (a background, a font and an accent color), each chosen from a closed list of presets defined in code. The Workspace name and Assistant instructions stay read-only. Appearance belongs to the Workspace, so every Member sees the same one, and the server allows only an Owner to change it, using the existing Owner authorization.

## Considered Options

- **General Workspace editing (name, Assistant instructions, appearance):** rejected. Editing Assistant instructions changes how the assistant behaves for every Member and needs its own design. Appearance is low-risk and visual only.
- **Per-User appearance:** rejected. It does not give a Workspace its own identity, and it adds a second place where appearance is stored.
- **Free-form values (image URL, upload, color picker):** rejected. Uploads are out of scope, URLs raise CSP and privacy questions, and free colors need contrast validation.
- **DB CHECK constraints on preset values:** rejected. Adding or removing a preset would then need a migration. Zod validates writes, and rendering falls back to the default for unknown stored values.

## Consequences

- `workspaces` gains three additive columns (`background_preset`, `font_preset`, `accent_preset`). Their defaults keep today's look.
- An Owner now manages Appearance in addition to Memberships and Invitations. `GLOSSARY.md` is updated to say so.
- Appearance applies only inside a Workspace. The login page, the Workspace list and the global header keep the brand look.
- Any further editable Workspace field needs its own decision. This ADR does not open general Workspace editing.

Accepted on 2026-11-23. Spec: GitHub issue #24.
