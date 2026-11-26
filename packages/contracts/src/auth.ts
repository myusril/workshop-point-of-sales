import { z } from "zod";

export const STAFF_ROLES = ["OWNER", "ADMIN", "CASHIER", "MECHANIC"] as const;
export const staffRoleSchema = z.enum(STAFF_ROLES);
export type StaffRole = z.infer<typeof staffRoleSchema>;

export const AUTH_SURFACES = ["web", "mobile"] as const;
export const authSurfaceSchema = z.enum(AUTH_SURFACES);
export type AuthSurface = z.infer<typeof authSurfaceSchema>;

/** Email, username, or phone number. The server resolves which one it is. */
export const loginIdentifierSchema = z
  .string()
  .trim()
  .min(3, "Isi email, nama pengguna, atau nomor HP.")
  .max(320, "Identitas masuk terlalu panjang.");

export const passwordSchema = z
  .string()
  .min(8, "Kata sandi minimal 8 karakter.")
  .max(256, "Kata sandi maksimal 256 karakter.")
  .refine((value) => /[A-Za-z]/.test(value), "Kata sandi harus memuat huruf.")
  .refine((value) => /[0-9]/.test(value), "Kata sandi harus memuat angka.");

export const loginRequestSchema = z.object({
  identifier: loginIdentifierSchema,
  password: z.string().min(1, "Kata sandi wajib diisi.").max(256, "Kata sandi terlalu panjang."),
  surface: authSurfaceSchema.default("web"),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const outletSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  isActive: z.boolean(),
});
export type OutletSummary = z.infer<typeof outletSummarySchema>;

export const sessionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  username: z.string().nullable(),
  phone: z.string(),
  role: staffRoleSchema,
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const authSessionSchema = z.object({
  activeOutletId: z.uuid().nullable(),
  outletIds: z.array(z.uuid()),
  idleTimeoutMinutes: z.number().int().positive(),
  expiresAt: z.string(),
});
export type AuthSession = z.infer<typeof authSessionSchema>;

export const sessionPayloadSchema = z.object({
  user: sessionUserSchema,
  session: authSessionSchema,
  outlets: z.array(outletSummarySchema),
  allowedActions: z.array(z.string()),
});
export type SessionPayload = z.infer<typeof sessionPayloadSchema>;

export const loginResponseSchema = z.object({
  user: sessionUserSchema,
  session: authSessionSchema,
  outlets: z.array(outletSummarySchema),
  allowedActions: z.array(z.string()),
  /** Returned once for `surface: "mobile"`; never stored or logged in plaintext. */
  token: z.string().optional(),
  tokenExpiresAt: z.string().optional(),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const switchOutletRequestSchema = z.object({
  outletId: z.uuid("Outlet tidak valid."),
});
export type SwitchOutletRequest = z.infer<typeof switchOutletRequestSchema>;

export const AUTH_ERROR_CODES = [
  "INVALID_CREDENTIALS",
  "ACCOUNT_DEACTIVATED",
  "ACCOUNT_LOCKED",
  "SESSION_EXPIRED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL_ERROR",
] as const;
export const authErrorCodeSchema = z.enum(AUTH_ERROR_CODES);
export type AuthErrorCode = z.infer<typeof authErrorCodeSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: authErrorCodeSchema,
    message: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
    retryAfterSeconds: z.number().int().nonnegative().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
