import { z } from "zod";

// 1. Create Ticket
// category is open-ended (plain string, not an enum) — the frontend can
// send any category label without a matching backend value to update.
export const CreateSupportSchema = z.object({
  category: z.string().min(1, "Category is required"),
  subject: z.string().min(5),
  message: z.string().min(10), // Initial message
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW"),
  attachments: z.array(z.string().url()).optional(),
});

export interface CreateSupportRequest {
  category: string;
  subject: string;
  message: string;
  priority?: "LOW" | "MEDIUM" | "HIGH";
  attachments?: string[];
}

// 2. Reply to Ticket
export const AddSupportMessageSchema = z.object({
  message: z.string().min(1),
  attachments: z.array(z.url()).optional(),
});

export interface AddSupportMessageRequest {
  message: string;
  attachments?: string[];
}
