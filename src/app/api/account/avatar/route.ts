import { createAccountAvatarHandlers } from '@/lib/avatar';
import { currentSession } from '@/lib/session';
import { avatarStore } from '@/lib/avatar-store';

export const dynamic = 'force-dynamic';

export const { PUT, DELETE } = createAccountAvatarHandlers({ getSession: currentSession, store: avatarStore });
