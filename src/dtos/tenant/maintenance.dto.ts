import { z } from "zod";

// The DB enum is SAFETY_SECURITY, but clients commonly send the shorter
// "SECURITY" label — accept it as an alias rather than rejecting the ticket.
const MAINTENANCE_CATEGORY_VALUES = [
  "PLUMBING",
  "ELECTRICAL",
  "HVAC",
  "APPLIANCE",
  "STRUCTURAL",
  "PEST_CONTROL",
  "CLEANING",
  "SAFETY_SECURITY",
  "OTHER",
] as const;

const normalizeCategory = (val: unknown) =>
  typeof val === "string" && val.toUpperCase() === "SECURITY" ? "SAFETY_SECURITY" : val;

export const CreateMaintenanceSchema = z.object({
  category: z.preprocess(normalizeCategory, z.enum(MAINTENANCE_CATEGORY_VALUES)),
  subject: z.string().min(3, "Subject is required"),
  description: z
    .string()
    .min(10, "Please provide more details about the issue."),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "EMERGENCY"]).default("MEDIUM"),
  attachments: z.array(z.string().url()).optional(), // Array of Valid URLs
});

export interface CreateMaintenanceRequest {
  category:
    | "PLUMBING"
    | "ELECTRICAL"
    | "HVAC"
    | "APPLIANCE"
    | "STRUCTURAL"
    | "PEST_CONTROL"
    | "CLEANING"
    | "SAFETY_SECURITY"
    | "SECURITY"
    | "OTHER";
  subject: string;
  description: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "EMERGENCY";
  attachments?: string[];
}

export const AddMessageSchema = z.object({
  message: z.string().min(1, "Message cannot be empty"),
  attachments: z.array(z.string().url()).optional(),
});

export interface AddMessageRequest {
  message: string;
  attachments?: string[];
}

export const UpdateMaintenanceSchema = z.object({
  category: z
    .preprocess(normalizeCategory, z.enum(MAINTENANCE_CATEGORY_VALUES))
    .optional(),
  subject: z.string().min(3).optional(),
  description: z.string().min(5).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "EMERGENCY"]).optional(),
  // We generally don't overwrite attachments on edit,
  // we usually just add more via the message flow, but we can allow it here.
  attachments: z.array(z.string().url()).optional(),
});

export interface UpdateMaintenanceRequest {
  category?:
    | "PLUMBING"
    | "ELECTRICAL"
    | "HVAC"
    | "APPLIANCE"
    | "STRUCTURAL"
    | "PEST_CONTROL"
    | "CLEANING"
    | "SAFETY_SECURITY"
    | "SECURITY"
    | "OTHER";
  subject?: string;
  description?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "EMERGENCY";
  attachments?: string[];
}
