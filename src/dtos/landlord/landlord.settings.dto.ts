import { z } from "zod";

const phoneRegex = /^\+?[0-9\s\-().]{7,20}$/;
const imageUrlRegex = /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i;

// ── Requests ──────────────────────────────────────────────────────────────────

export const LandlordUpdateProfileSchema = z.object({
  userFullName: z.string().min(1, "Name cannot be empty").optional(),
  userEmail: z.string().email("Must be a valid email address").optional(),
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
export type LandlordUpdateProfileRequest = z.infer<typeof LandlordUpdateProfileSchema>;

export const LandlordChangePasswordSchema = z
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
export type LandlordChangePasswordRequest = z.infer<typeof LandlordChangePasswordSchema>;

export const LandlordUpdateNotificationPreferencesSchema = z.object({
  emailPayments: z.boolean().optional(),
  emailLease: z.boolean().optional(),
  emailMaintenance: z.boolean().optional(),
  emailVisitors: z.boolean().optional(),
  pushPayments: z.boolean().optional(),
  pushMaintenance: z.boolean().optional(),
});
export type LandlordUpdateNotificationPreferencesRequest = z.infer<
  typeof LandlordUpdateNotificationPreferencesSchema
>;

export const LandlordUpdateTwoFaSchema = z.object({
  enabled: z.boolean(),
});
export type LandlordUpdateTwoFaRequest = z.infer<typeof LandlordUpdateTwoFaSchema>;

// ── Responses ─────────────────────────────────────────────────────────────────

export interface LandlordProfileResponse {
  userId: string;
  userFullName: string | null;
  userEmail: string;
  userPhone: string | null;
  userEmergencyContact: string | null;
  userProfileUrl: string | null;
  role: string;
  isTwoFactorEnabled: boolean;
}

export interface LandlordNotificationPreferences {
  emailPayments: boolean;
  emailLease: boolean;
  emailMaintenance: boolean;
  emailVisitors: boolean;
  pushPayments: boolean;
  pushMaintenance: boolean;
}

export interface LandlordTwoFaStatusResponse {
  isTwoFactorEnabled: boolean;
}
