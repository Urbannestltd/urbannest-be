import { z } from "zod";

// 1. Create Ticket
export const CreateSupportSchema = z.object({
  category: z.enum(["BILLING", "ACCOUNT_ISSUE", "APP_BUG", "DISPUTE", "OTHER"]),
  subject: z.string().min(5),
  message: z.string().min(10), // Initial message
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW"),
  attachments: z.array(z.string().url()).optional(),
});

export interface CreateSupportRequest {
  category: "BILLING" | "ACCOUNT_ISSUE" | "APP_BUG" | "DISPUTE" | "OTHER";
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
