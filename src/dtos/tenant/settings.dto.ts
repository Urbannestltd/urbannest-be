import { z } from "zod";

// 1. Update Profile (Matches the form in your image)
export const UpdateProfileSchema = z.object({
  userFullName: z.string().min(2).optional(),
  userEmail: z.email(),
  userPhone: z.string().min(10).optional(),
  emergencyContact: z.string().min(10).optional(),

  // The frontend uploads the image to Supabase first,
  // then sends us the URL here.
  ussrProfileUrl: z.url().optional(),
});

export interface UpdateProfileRequest {
  userFullName?: string;
  userEmail?: string;
  userPhone?: string;
  userEmergencyContact?: string;
  userProfileUrl?: string;
}

// 2. Manage Cards
// (We usually delete cards here; adding happens during payment)
export interface PaymentMethodResponse {
  id: string;
  last4: string;
  cardType: string;
  bank: string;
  isDefault: boolean;
}

// 1. Notification Preferences
export const UpdateNotificationSettingsSchema = z.object({
  emailPayments: z.boolean().optional(),
  emailLease: z.boolean().optional(),
  emailMaintenance: z.boolean().optional(),
  emailVisitors: z.boolean().optional(),
});

export interface UpdateNotificationSettingsRequest {
  emailPayments?: boolean;
  emailLease?: boolean;
  emailMaintenance?: boolean;
  emailVisitors?: boolean;
}

// 2. Custom Reminders
export const CreateReminderSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  dueAt: z.coerce.date(), // Accepts ISO string, converts to Date
});

export interface CreateReminderRequest {
  title: string;
  description?: string;
  dueAt: Date;
}

export const ChangePasswordSchema = z.object({
  oldPassword: z.string().min(1, "Old password required"),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 chars")
    .regex(/[A-Z]/, "Must contain uppercase")
    .regex(/[0-9]/, "Must contain number"),
});

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

// 2. Two-Factor Setup
export const VerifyTwoFactorSchema = z.object({
  otp: z.string().length(6, "OTP must be 6 digits"),
});

export interface VerifyTwoFactorRequest {
  otp: string;
}
