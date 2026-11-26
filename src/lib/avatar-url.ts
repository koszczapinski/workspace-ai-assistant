/** The `src` for a User's Avatar image, or null when they have none (initials stand in). */
export function avatarSrc(userId: string, updatedAt: Date | null) {
  return updatedAt ? avatarUrl(userId, updatedAt) : null;
}

/** The address of a User's Avatar, versioned so a new upload shows at once. */
export function avatarUrl(userId: string, updatedAt: Date) {
  return `/api/users/${encodeURIComponent(userId)}/avatar?v=${updatedAt.getTime()}`;
}
