---
status: accepted
date: 2026-11-24
---

# Avatar: an upload, re-encoded and stored in PostgreSQL, never a URL

A User can set one Avatar (#56). This is the first image the application stores. ADR-0003 rejected uploads and URLs for Appearance over CSP and privacy concerns; the same concerns shape this decision.

## Decisions

- **Source:** a User uploads a file on their Account page. Without one, the UI shows their initials. There are no image URLs and no Gravatar.
- **One per User:** the Avatar belongs to the User, not to a Membership, so it is the same in every Workspace.
- **Re-encoded on the server:** `sharp` decodes the upload and writes a 256×256 WebP (centre crop, quality about 80) with no metadata, so EXIF and GPS location never reach storage. The upload must be PNG, JPEG or WebP, at most 2 MB and at most 4096×4096 pixels. SVG (it can carry script) and GIF are refused. The body is bounded before parsing, and the original file is never kept.
- **Storage:** the table `user_avatar` (`user_id` as primary key and foreign key with `ON DELETE CASCADE`, `bytes bytea`, `content_type`, `updated_at`). That is about 10–30 KB per User, one row per User, replaced on each upload. One `pg_dump` covers it, and Compose needs no extra service or volume.
- **Serving:** `GET /api/users/<id>/avatar` checks the Session on every request. Every refusal, including a missing Avatar, is the same `404`, so the endpoint reveals nothing about which Users exist. Responses are `image/webp` with `nosniff` and `Cache-Control: private, no-cache`; the URL carries `?v=<updated_at>` so a new upload shows at once. A plain `<img>` is used instead of `next/image`, whose optimizer would cache the picture on the server outside the access check.
- **Who may see it:** the User themselves, and an Owner of a Workspace in which the User has a Membership (#63). The Owner check reads the stored Memberships on every request, so removing the Membership ends access at once.
- **Better Auth:** `/update-user` is disabled (#60) and `user.image` is never read or written, so the Avatar can only change through this path.

## Rejected alternatives

- **S3-compatible object storage:** an extra container, volume and credentials for files of tens of KB. MinIO's community edition is archived and no longer published as an image; if object storage is ever needed, Garage or SeaweedFS are the maintained options.
- **Image URLs or Gravatar:** the browser would fetch from third parties, a privacy leak and a tracking-pixel path for Owners viewing a Member.
- **Keeping the original file:** larger, and it would store metadata such as location.
- **Per-Workspace Avatars:** a second identity per Membership for no clear gain.
