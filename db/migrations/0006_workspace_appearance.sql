ALTER TABLE workspaces ADD COLUMN background_preset text NOT NULL DEFAULT 'terra';
--> statement-breakpoint
ALTER TABLE workspaces ADD COLUMN font_preset text NOT NULL DEFAULT 'system';
--> statement-breakpoint
ALTER TABLE workspaces ADD COLUMN accent_preset text NOT NULL DEFAULT 'sky';
