/** The two roles a Membership can hold. */
export const MEMBER_ROLES = ['owner', 'member'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Outcome of changing or removing a Membership. */
export type MemberChangeResult = 'ok' | 'not-found' | 'last-owner';
