import { headers } from 'next/headers';
import { auth } from './auth';

/** The Session of the current request, or null when signed out or when authentication is not configured. */
export async function currentSession() {
  return auth ? auth.api.getSession({ headers: await headers() }) : null;
}

/** The address of a User's Avatar, versioned so a new upload shows at once. */
export function avatarUrl(userId: string, updatedAt: Date) {
  return `/api/users/${encodeURIComponent(userId)}/avatar?v=${updatedAt.getTime()}`;
}
