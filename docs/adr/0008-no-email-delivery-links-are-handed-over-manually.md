---
status: accepted
date: 2026-11-27
---

# The application sends no email; links are handed over manually

The application does not send email. Invitations stay single-use links that an Owner or the Deployer passes on by hand. A forgotten password is recovered the same way: the Deployer runs a CLI command that prints a single-use password reset link, under the same safety rules as `bootstrap` (ADR-0002). There is no "Forgot password?" on the login page.

## Considered Options

- **Optional SMTP:** "Forgot password?" by email when `SMTP_*` is set, and the CLI otherwise. Deferred. An Invitation is not tied to an email address and nothing verifies the address a User types when creating an account. Sending a reset link to an unverified address could deliver it to a stranger or let someone take over an account. Email delivery therefore needs email verification first. It would also add a second code path and a mail catcher in CI.
- **Required SMTP:** rejected. Every Deployer would need a mail provider before the first sign-in, which goes against the one-command first run of ADR-0005.

## Consequences

- If email arrives later, it comes as its own increment, starting with email verification. Self-service reset and emailed Invitations build on top of that.
- A User who forgets their password depends on the Deployer. This is acceptable for a self-hosted instance with one Deployer.
