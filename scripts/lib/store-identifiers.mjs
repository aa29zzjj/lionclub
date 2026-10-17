// Public identifiers only. Account login email is not an Apple Team ID.
// Apple reference: https://developer.apple.com/help/glossary/team-id/
export const validAppleTeamId = value => typeof value === 'string' && /^[A-Z0-9]{10}$/.test(value);
