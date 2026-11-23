ALTER TABLE invitations ADD COLUMN role text NOT NULL DEFAULT 'member' CONSTRAINT invitations_role_check CHECK (role IN ('owner','member'));
--> statement-breakpoint
-- created_by IS NULL marks an Invitation issued by the Deployer's bootstrap command: no User exists yet.
ALTER TABLE invitations ALTER COLUMN created_by DROP NOT NULL;
