CREATE TABLE invitations (
  id text PRIMARY KEY NOT NULL,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CONSTRAINT invitations_status_check CHECK (status IN ('pending','accepted','revoked')),
  expires_at timestamp with time zone NOT NULL,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX invitations_workspace_status ON invitations (workspace_id, status);
