import { z } from "zod";

// ── Shared ─────────────────────────────────────────────────────────────────────

const phoneRegex = /^\+?[0-9\s\-().]{7,20}$/;

const imageUrlRegex = /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i;

// ── Requests ─────────────────────────────────────────────────────────────────

export const UpdateProfileSchema = z.object({
  userFullName: z.string().min(1, "Name cannot be empty").optional(),
  userPhone: z
    .string()
    .regex(phoneRegex, "Phone must be 7–20 digits and may include +, spaces, dashes")
    .optional(),
  userEmergencyContact: z
    .string()
    .regex(phoneRegex, "Emergency contact must be 7–20 digits and may include +, spaces, dashes")
    .optional(),
  userProfileUrl: z
    .string()
    .url("Must be a valid URL")
    .regex(imageUrlRegex, "Profile URL must point to a valid image (jpg, jpeg, png, webp, gif)")
    .optional(),
});
export type FmUpdateProfileRequest = z.infer<typeof UpdateProfileSchema>;

export const ChangePasswordSchema = z
  .object({
    oldPassword: z.string().min(1, "Old password is required"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain at least one uppercase letter")
      .regex(/[0-9]/, "Must contain at least one number")
      .regex(/[^a-zA-Z0-9]/, "Must contain at least one special character"),
    confirmPassword: z.string().min(1, "Confirm password is required"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type FmChangePasswordRequest = z.infer<typeof ChangePasswordSchema>;

export const UpdateNotificationPreferencesSchema = z.object({
  fmEmailNewTicket: z.boolean().optional(),
  fmEmailTenantMessage: z.boolean().optional(),
  fmEmailAdminNote: z.boolean().optional(),
  fmEmailBudgetResponse: z.boolean().optional(),
  fmEmailNewAgentVisit: z.boolean().optional(),
  fmEmailAgentReschedule: z.boolean().optional(),
});
export type FmUpdateNotificationPreferencesRequest = z.infer<
  typeof UpdateNotificationPreferencesSchema
>;

// ── Responses ─────────────────────────────────────────────────────────────────

export interface FmProfileResponse {
  userId: string;
  userFullName: string | null;
  userEmail: string;
  userPhone: string | null;
  userEmergencyContact: string | null;
  userProfileUrl: string | null;
  role: string;
  managedProperties: { id: string; name: string | null }[];
  managedUnits: { id: string; name: string }[];
}

export interface FmNotificationPreferences {
  fmEmailNewTicket: boolean;
  fmEmailTenantMessage: boolean;
  fmEmailAdminNote: boolean;
  fmEmailBudgetResponse: boolean;
  fmEmailNewAgentVisit: boolean;
  fmEmailAgentReschedule: boolean;
  warnings: string[];
}
