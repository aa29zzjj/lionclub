/** Shared validity rules: future grants and expired grants never authorize access. */
export function activeAdminRoleWhere(now = new Date()) {
  return { validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }] };
}

export function isActiveAdminRole(role: { validFrom: Date | string; validUntil: Date | string | null }, now = new Date()) {
  return new Date(role.validFrom) <= now && (role.validUntil === null || new Date(role.validUntil) > now);
}
