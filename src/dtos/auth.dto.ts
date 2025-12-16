import { z } from "zod";

export const InitiateRegistrationSchema = z.object({
  userEmail: z.email(),
  userRoleName: z.uuid(),
  userFirstName: z.string().optional(),
  userLastName: z.string().optional(),
  userDisplayName: z.string().optional(),
  userPhone: z.string().optional(),
  userPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[0-9]/, "Must contain at least one number")
    .regex(/[^a-zA-Z0-9]/, "Must contain at least one special character"),
});

export interface InitiateRegistrationRequest {
  userEmail: string;
  userPassword: string;
  userFirstName?: string;
  userLastName?: string;
  userDisplayName?: string;
  userPhone?: string;
  userRoleName: string;
}
