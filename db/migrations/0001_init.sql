CREATE TABLE "user" (id text PRIMARY KEY,name text NOT NULL,email text NOT NULL UNIQUE,email_verified boolean NOT NULL DEFAULT false,image text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE TABLE session (id text PRIMARY KEY,user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,token text NOT NULL UNIQUE,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),ip_address text,user_agent text);
--> statement-breakpoint
CREATE TABLE account (id text PRIMARY KEY,user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,account_id text NOT NULL,provider_id text NOT NULL,access_token text,refresh_token text,id_token text,access_token_expires_at timestamptz,refresh_token_expires_at timestamptz,scope text,password text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE TABLE verification (id text PRIMARY KEY,identifier text NOT NULL,value text NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE TABLE workspaces (id text PRIMARY KEY,name text NOT NULL,assistant_instructions text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE TABLE memberships (id text PRIMARY KEY,user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,created_at timestamptz NOT NULL DEFAULT now(),CONSTRAINT memberships_user_workspace UNIQUE(user_id,workspace_id));
