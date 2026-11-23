ALTER TABLE invitations ADD COLUMN role text NOT NULL DEFAULT 'member' CONSTRAINT invitations_role_check CHECK (role IN ('owner','member'));
--> statement-breakpoint
ALTER TABLE invitations ALTER COLUMN created_by DROP NOT NULL;
