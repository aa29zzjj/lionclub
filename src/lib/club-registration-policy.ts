/** Server-owned enrollment exception for the explicitly requested club.
 * The organization comes from a valid stored invite, never a URL mode/title.
 * Other clubs retain the existing central, immediate-use workflow. */
export const SHENGDI_ORGANIZATION_ID = "seed-club-300A-1-聖迪獅子會";

export function registrationTargetsInvitedClub(inviteOrganizationId: string) {
  return inviteOrganizationId === SHENGDI_ORGANIZATION_ID;
}
