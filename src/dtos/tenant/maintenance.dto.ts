import { z } from "zod";

export const CreateMaintenanceSchema = z.object({
  category: z.enum([
    "PLUMBING",
    "ELECTRICAL",
    "HVAC",
    "APPLIANCE",
    "STRUCTURAL",
    "PEST_CONTROL",
    "OTHER",
  ]),
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
    | "OTHER";
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
