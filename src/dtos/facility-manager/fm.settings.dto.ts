import { z } from "zod";

// ── Requests ─────────────────────────────────────────────────────────────────

export const UpdateProfileSchema = z.object({
  userFullName: z.string().min(1, "Name cannot be empty").optional(),
  userPhone: z.string().min(7, "Invalid phone number").optional(),
  userEmergencyContact: z.string().min(7, "Invalid emergency contact").optional(),
  userProfileUrl: z.string().url("Must be a valid URL").optional(),
});
export type FmUpdateProfileRequest = z.infer<typeof UpdateProfileSchema>;

export const ChangePasswordSchema = z.object({
  oldPassword: z.string().min(1, "Old password is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[0-9]/, "Must contain at least one number")
    .regex(/[^a-zA-Z0-9]/, "Must contain at least one special character"),
});
export type FmChangePasswordRequest = z.infer<typeof ChangePasswordSchema>;

// ── Responses ─────────────────────────────────────────────────────────────────

export interface FmProfileResponse {
  userId: string;
  userFullName: string | null;
  userEmail: string;
  userPhone: string | null;
  userEmergencyContact: string | null;
  userProfileUrl: string | null;
  managedProperties: { id: string; name: string | null }[];
  managedUnits: { id: string; name: string }[];
}

export interface FmProfileUpdateResponse {
  userFullName: string | null;
  userPhone: string | null;
  userEmergencyContact: string | null;
  userProfileUrl: string | null;
}
