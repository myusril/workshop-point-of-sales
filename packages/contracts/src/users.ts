import { z } from "zod";

import { passwordSchema, staffRoleSchema } from "./auth.ts";

/**
 * Founder decision (2026-11-26): the Owner role is provisioned, never created
 * or granted from the staff-management API. This prevents accidental
 * privilege escalation from the users screen.
 */
export const ASSIGNABLE_STAFF_ROLES = ["ADMIN", "CASHIER", "MECHANIC"] as const;
export const assignableStaffRoleSchema = z.enum(ASSIGNABLE_STAFF_ROLES);
export type AssignableStaffRole = z.infer<typeof assignableStaffRoleSchema>;

/** Strips separators and converts the Indonesian country code to a leading 0. */
export function normalizePhoneNumber(input: string): string {
  const digits = input.trim().replace(/[\s().-]/g, "");
  if (digits.startsWith("+62")) return `0${digits.slice(3)}`;
  if (digits.startsWith("62")) return `0${digits.slice(2)}`;
  if (digits.startsWith("+")) return digits.slice(1);
  return digits;
}

export const phoneNumberSchema = z
  .string()
  .trim()
  .min(1, "Nomor HP wajib diisi.")
  .max(24, "Nomor HP terlalu panjang.")
  .transform(normalizePhoneNumber)
  .refine((value) => /^0[0-9]{7,14}$/.test(value), "Nomor HP tidak valid.");

/**
 * Usernames share the login identifier namespace with phone numbers. An
 * all-digit username would shadow (or be shadowed by) a phone number during
 * identifier resolution, so it is rejected before it can be created.
 */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Nama pengguna minimal 3 karakter.")
  .max(32, "Nama pengguna maksimal 32 karakter.")
  .regex(/^[a-z0-9._-]+$/, "Nama pengguna hanya boleh huruf kecil, angka, titik, garis bawah, atau tanda hubung.")
  .refine(
    (value) => !/^[0-9]+$/.test(value),
    "Nama pengguna tidak boleh hanya berisi angka.",
  );

const nameSchema = z
  .string()
  .trim()
  .min(2, "Nama minimal 2 karakter.")
  .max(120, "Nama maksimal 120 karakter.");

const emailSchema = z
  .email("Format email tidak valid.")
  .trim()
  .toLowerCase()
  .max(254, "Email terlalu panjang.");

const outletIdsSchema = z.array(z.uuid("Outlet tidak valid.")).max(50, "Terlalu banyak outlet.");

export const createUserSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    username: usernameSchema.optional(),
    phone: phoneNumberSchema,
    password: passwordSchema,
    role: assignableStaffRoleSchema,
    outletIds: outletIdsSchema.default([]),
  })
  .superRefine((value, ctx) => {
    if ((value.role === "CASHIER" || value.role === "MECHANIC") && value.outletIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["outletIds"],
        message: "Kasir dan mekanik harus ditugaskan ke minimal satu outlet.",
      });
    }
  });
export type CreateUserRequest = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  username: usernameSchema.nullable().optional(),
  phone: phoneNumberSchema.optional(),
  role: assignableStaffRoleSchema.optional(),
  outletIds: outletIdsSchema.optional(),
});
export type UpdateUserRequest = z.infer<typeof updateUserSchema>;

export const USER_STATUSES = ["active", "inactive"] as const;
export const userStatusSchema = z.enum(USER_STATUSES);

export const listUsersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  role: staffRoleSchema.optional(),
  outletId: z.uuid().optional(),
  status: userStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const userSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  username: z.string().nullable(),
  phone: z.string(),
  role: staffRoleSchema,
  outletIds: z.array(z.uuid()),
  isActive: z.boolean(),
  deactivatedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type UserSummary = z.infer<typeof userSummarySchema>;

export const userListResponseSchema = z.object({
  items: z.array(userSummarySchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type UserListResponse = z.infer<typeof userListResponseSchema>;

export const deactivateUserRequestSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Alasan penonaktifan minimal 10 karakter.")
    .max(500, "Alasan maksimal 500 karakter."),
});
export type DeactivateUserRequest = z.infer<typeof deactivateUserRequestSchema>;

/**
 * Unlock (DEC-0007): the body is optional. A reason is recorded on the audit
 * row when supplied.
 */
export const unlockUserRequestSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Alasan minimal 10 karakter.")
    .max(500, "Alasan maksimal 500 karakter.")
    .optional(),
});
export type UnlockUserRequest = z.infer<typeof unlockUserRequestSchema>;

export const unlockUserResponseSchema = z.object({
  /**
   * True when at least one recorded login attempt was cleared. The account has
   * no active lock either way, so callers treat both values as success.
   */
  unlocked: z.boolean(),
});
export type UnlockUserResponse = z.infer<typeof unlockUserResponseSchema>;
