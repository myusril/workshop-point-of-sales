import type { AuthRuntime } from "@workshop-pos/auth";

/**
 * Re-authentication for irreversible money actions (state matrix §2.10: a paid
 * void asks the Owner for their password on web).
 *
 * This is verify-only: it reads the Better Auth credential hash and compares,
 * without creating a session or touching the login-attempt budget. A missing
 * credential or a verification failure is `false`; the caller audits the denial.
 */
export async function verifyUserPassword(
  auth: AuthRuntime["auth"],
  userId: string,
  password: string,
): Promise<boolean> {
  try {
    const authContext = await auth.$context;
    const credential = await authContext.internalAdapter.findCredentialAccount(userId);
    const hash = credential?.password;
    if (typeof hash !== "string" || hash.length === 0) return false;
    return await authContext.password.verify({ hash, password });
  } catch {
    console.error("auth: failed to verify a re-authentication password");
    return false;
  }
}
