import { z } from "zod";

import { phoneNumberSchema } from "./users.ts";

const outletNameSchema = z
  .string()
  .trim()
  .min(2, "Nama outlet minimal 2 karakter.")
  .max(120, "Nama outlet maksimal 120 karakter.");

const addressSchema = z
  .string()
  .trim()
  .max(300, "Alamat maksimal 300 karakter.");

export const createOutletSchema = z.object({
  name: outletNameSchema,
  address: addressSchema.optional(),
  phone: phoneNumberSchema.optional(),
  isActive: z.boolean().optional(),
});
export type CreateOutletRequest = z.infer<typeof createOutletSchema>;

export const updateOutletSchema = z.object({
  name: outletNameSchema.optional(),
  address: addressSchema.nullable().optional(),
  phone: phoneNumberSchema.nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateOutletRequest = z.infer<typeof updateOutletSchema>;

export const outletSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Outlet = z.infer<typeof outletSchema>;

export const outletListResponseSchema = z.object({
  items: z.array(outletSchema),
});
export type OutletListResponse = z.infer<typeof outletListResponseSchema>;
