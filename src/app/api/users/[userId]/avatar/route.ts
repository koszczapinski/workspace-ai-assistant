import { createUserAvatarHandlers } from '@/lib/avatar';
import { isOwnerOfMember } from '@/lib/authorization';
import { currentSession } from '@/lib/session';
import { avatarStore } from '@/lib/avatar-store';

export const dynamic = 'force-dynamic';

export const { GET } = createUserAvatarHandlers({ getSession: currentSession, store: avatarStore, isOwnerOfMember });
