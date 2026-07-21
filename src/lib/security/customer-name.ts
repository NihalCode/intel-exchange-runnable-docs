import "server-only";

/**
 * Derive a display customer name for unanswered snapshots.
 * Never trust client JSON — only session / directory fields.
 */
export function deriveCustomerNameSnapshot(user: {
  name?: string | null;
  email?: string | null;
  displayName?: string | null;
}): string | null {
  const directory = user.displayName?.trim();
  if (directory) return directory.slice(0, 200);

  const idpName = user.name?.trim();
  if (idpName) return idpName.slice(0, 200);

  const email = user.email?.trim();
  if (email) {
    const local = email.split("@")[0]?.trim();
    if (local) return local.slice(0, 200);
  }

  return null;
}
