import { z } from "zod";

export const AdminCreateUserSchema = z.object({
  userEmail: z.email(),
  userRole: z
    .enum(["TENANT", "LANDLORD", "ADMIN", "FACILITY_MANAGER"])
    .optional(),
});

export interface AdminCreateUserRequest {
  userEmail: string;
  unitId?: string;
  propertyId?: string;
  userRole?: "TENANT" | "LANDLORD" | "ADMIN" | "FACILITY_MANAGER";
}

export const AdminGetUsersSchema = z.object({
  page: z.number().min(1).optional(),
  limit: z.number().min(1).max(100).optional(),
  search: z.string().optional(),
});

export interface AdminGetUsersRequest {
  page?: number;
  limit?: number;
  search?: string;
}

export const AdminGetUserSchema = z.object({
  userId: z.uuid(),
});

export interface AdminGetUserRequest {
  userId: string;
}
