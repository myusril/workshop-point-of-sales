export { createAuth, getSessionCookieNames, type CreateAuthOptions } from "./config.ts";
export {
  generateDeviceToken,
  hashDeviceToken,
  issueDeviceToken,
  pinDeviceTokenOutlet,
  resolveDeviceToken,
  revokeDeviceToken,
  revokeDeviceTokenById,
  revokeUserDeviceTokens,
  touchDeviceToken,
  type DeviceTokenResolution,
  type IssuedDeviceToken,
  type IssueDeviceTokenInput,
} from "./device-tokens.ts";
export {
  AuthError,
  isAuthError,
  toApiErrorBody,
  uniqueViolationConstraint,
  type AuthErrorOptions,
} from "./errors.ts";
export {
  ABSOLUTE_SESSION_MS,
  BEARER_PREFIX,
  assertOutletAccess,
  assertOutletAccessAudited,
  assertPermission,
  auditDenial,
  getBearerToken,
  logoutCurrentSession,
  resolveAuth,
  resolveAuthContext,
  switchActiveOutlet,
  type AuthResolution,
  type DenialAuditInput,
  type LogoutResult,
  type SwitchOutletResult,
} from "./guard.ts";
export {
  loginWithPassword,
  type LoginDeps,
  type LoginOutcome,
} from "./login.ts";
export {
  accountLockKeys,
  evaluateLockStatus,
  getLockStatus,
  getLockStatusForKeys,
  maybePruneExpiredLoginAttempts,
  normalizeIdentifier,
  pruneExpiredLoginAttempts,
  pruneLoginAttempts,
  recordLoginAttempt,
  recordLoginAttempts,
  type LockStatus,
  type RecordLoginAttemptInput,
} from "./login-attempts.ts";
export {
  createOutlet,
  listOutlets,
  updateOutlet,
} from "./outlets.ts";
export {
  SEED_USERNAMES,
  provisionAccounts,
  type ProvisionCredential,
  type ProvisionOptions,
  type ProvisionResult,
} from "./provisioning.ts";
export {
  CROSS_OUTLET_MESSAGE,
  POLICY,
  RBAC_ACTIONS,
  allowedActions,
  can,
  denialMessage,
  findRbacAction,
  rbacActionDefinition,
  scopeFor,
  type PermissionScope,
  type RbacAction,
  type RbacActionDefinition,
  type RbacCell,
} from "./rbac.ts";
export { findInvalidOutletIds, getOutletScope, listActiveOutletIds, resolveIdleTimeoutMinutes } from "./scope.ts";
export { buildSessionPayload } from "./session-payload.ts";
export type {
  AuthContext,
  AuthContextUser,
  AuthMethod,
  AuthRuntime,
  ScopedOutlets,
} from "./types.ts";
export {
  createStaffUser,
  deactivateStaffUser,
  listStaffUsers,
  unlockStaffUser,
  updateStaffUser,
  type UnlockStaffUserOptions,
  type UnlockStaffUserResult,
  type UserWriteDeps,
} from "./users.ts";
