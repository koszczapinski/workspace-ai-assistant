-- One Avatar per User: the re-encoded 256×256 WebP (ADR-0007). Deleting the User deletes it.
CREATE TABLE "user_avatar" (
	"user_id" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE cascade,
	"bytes" bytea NOT NULL,
	"content_type" text DEFAULT 'image/webp' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
