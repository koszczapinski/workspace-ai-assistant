ALTER TABLE memberships ADD COLUMN role text NOT NULL DEFAULT 'member' CONSTRAINT memberships_role_check CHECK (role IN ('owner','member'));
