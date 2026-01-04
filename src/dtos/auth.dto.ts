import { z } from "zod";

export const RegisterSchema = z.object({
  userRoleName: z.string(),
  userFullName: z.string().optional(),
  userDisplayName: z.string().optional(),
  userPhone: z.string().optional(),
  userPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[0-9]/, "Must contain at least one number")
    .regex(/[^a-zA-Z0-9]/, "Must contain at least one special character"),
});

export interface RegisterRequest {
  userPassword: string;
  userFullName?: string;
  userDisplayName?: string;
  userPhone?: string;
  userRoleName: string;
}

export const VerifyOtpSchema = z.object({
  email: z.email(),
  otp: z.string().length(6, "OTP must be 6 digits"),
});

export interface VerifyOtpRequest {
  email: string;
  otp: string;
}

export const LoginSchema = z.object({
  email: z.email(),
  password: z.string(),
});

export interface LoginRequest {
  email: string;
  password: string;
}

export const GoogleLoginSchema = z.object({
  idToken: z.string().min(10, "Invalid Google Token"),
});

export interface GoogleLoginRequest {
  idToken: string;
}

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

export interface ForgotPasswordRequest {
  email: string;
}

export const ResetPasswordSchema = z.object({
  token: z.string().min(10, "Invalid token"),
  newPassword: z.string().min(8, "Password must be 8+ chars"),
});

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}
