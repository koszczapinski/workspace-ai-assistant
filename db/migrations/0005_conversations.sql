CREATE TABLE conversations (
  id text PRIMARY KEY NOT NULL,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX conversations_workspace_user_updated ON conversations (workspace_id, user_id, updated_at);
--> statement-breakpoint
CREATE TABLE messages (
  id text PRIMARY KEY NOT NULL,
  conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CONSTRAINT messages_role_check CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  stopped boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT messages_stopped_assistant_check CHECK (NOT stopped OR role = 'assistant')
);
--> statement-breakpoint
CREATE INDEX messages_conversation_created ON messages (conversation_id, created_at);
