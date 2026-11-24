/** The address of a User's Avatar, versioned so a new upload shows at once. */
export function avatarUrl(userId: string, updatedAt: Date) {
  return `/api/users/${encodeURIComponent(userId)}/avatar?v=${updatedAt.getTime()}`;
}
