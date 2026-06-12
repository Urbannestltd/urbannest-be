import { z } from "zod";

// ── Shared enums ──────────────────────────────────────────────────────────────

const FM_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

const MAINTENANCE_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "WORK_SCHEDULED",
  "RESOLVED",
  "FIXED",
  "CANCELLED",
] as const;

const MAINTENANCE_CATEGORIES = [
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

const EXPENSE_CATEGORIES = [
  "PARTS",
  "SUPPLIES",
  "LABOUR",
  "EQUIPMENT",
  "TRANSPORT_COSTS",
  "PERMITS",
  "OTHER",
] as const;

// ── Requests ──────────────────────────────────────────────────────────────────

export const GetTicketsQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(MAINTENANCE_STATUSES).optional(),
  propertyId: z.string().uuid("Invalid property ID").optional(),
  propertyType: z.enum(["RESIDENTIAL", "COMMERCIAL"]).optional(),
  priority: z.enum([...FM_PRIORITIES, "EMERGENCY"]).optional(),
  category: z.enum(MAINTENANCE_CATEGORIES).optional(),
  dateFrom: z.string().datetime({ offset: true, message: "dateFrom must be ISO 8601" }).optional(),
  dateTo: z.string().datetime({ offset: true, message: "dateTo must be ISO 8601" }).optional(),
});
export type GetTicketsQuery = z.infer<typeof GetTicketsQuerySchema>;

export const SetPrioritySchema = z.object({
  priority: z.enum(FM_PRIORITIES, {
    error: `Priority must be one of: ${FM_PRIORITIES.join(", ")}`,
  }),
});
export type SetPriorityRequest = z.infer<typeof SetPrioritySchema>;

export const UpdateStatusSchema = z.object({
  status: z.enum(MAINTENANCE_STATUSES, {
    error: `Status must be one of: ${MAINTENANCE_STATUSES.join(", ")}`,
  }),
});
export type UpdateStatusRequest = z.infer<typeof UpdateStatusSchema>;

export const SendMessageSchema = z.object({
  message: z.string().min(1, "Message cannot be empty").max(2000, "Message too long"),
  isInternalNote: z.boolean().optional().default(false),
});
export type SendMessageRequest = z.infer<typeof SendMessageSchema>;

export const LogExpenseSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0"),
  category: z.enum(EXPENSE_CATEGORIES, {
    error: `Category must be one of: ${EXPENSE_CATEGORIES.join(", ")}`,
  }),
  description: z.string().min(1, "Description is required").max(500),
  date: z
    .string()
    .datetime({ offset: true, message: "date must be ISO 8601" })
    .optional(),
});
export type LogExpenseRequest = z.infer<typeof LogExpenseSchema>;

export const UpdateExpenseSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0").optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  description: z.string().min(1, "Description is required").max(500).optional(),
  date: z
    .string()
    .datetime({ offset: true, message: "date must be ISO 8601" })
    .optional(),
});
export type UpdateExpenseRequest = z.infer<typeof UpdateExpenseSchema>;

export const FlagExpenseSchema = z.object({
  reason: z.string().min(1, "Reason is required").max(500, "Reason too long"),
});
export type FlagExpenseRequest = z.infer<typeof FlagExpenseSchema>;

// ── Responses ─────────────────────────────────────────────────────────────────

export interface FmTicketStats {
  avgResponseMinutes: number | null;
  highPriorityOpenCount: number;
  weeklyResolutionRate: number;
}

export interface FmTicketListItem {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  dateSubmitted: Date;
  propertyId: string | null;
  propertyName: string | null;
  unitId: string | null;
  unitName: string | null;
  tenantName: string;
  responseTimeMinutes: number | null;
  isResponseLate: boolean;
  isFixLate: boolean;
  approvalStatus: string | null;
  unreadCount: number;
}

export interface FmTicketDetail {
  id: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  isClosed: boolean;
  isChatLocked: boolean;
  availableActions: string[];
  dateSubmitted: Date;
  images: string[];
  propertyId: string | null;
  propertyName: string | null;
  unitId: string | null;
  unitName: string | null;
  tenant: { id: string; name: string | null; phone: string | null } | null;
  budget: number | null;
  quotedCost: number | null;
  approvalStatus: string | null;
  rebuttalNote: string | null;
  activity: FmMessageItem[];
  timeline: { event: string; timestamp: Date }[];
  responseMetrics: {
    timeToFirstResponseMinutes: number | null;
    timeToResolutionMinutes: number | null;
  };
}

export interface FmMessageItem {
  id: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: Date;
  readAt: Date | null;
  isSystemMessage: boolean;
  isInternalNote: boolean;
  isMine: boolean;
}

export interface FmExpenseItem {
  id: string;
  amount: number;
  category: string;
  description: string;
  date: Date;
  status: string;
  flagReason: string | null;
  propertyId: string | null;
  unitId: string | null;
  maintenanceRequestId: string | null;
  createdAt: Date;
  // Derived action flags based on time window and status
  canEdit: boolean;
  canDelete: boolean;
  canFlag: boolean;
  canCancel: boolean;
  canAcceptRebuttal: boolean;
}

export interface FmBudgetSummary {
  assignedBudget: number | null;
  totalExpenses: number;
  remainingBudget: number | null;
  quotedCost: number | null;
  approvalStatus: string | null;
  rebuttalNote: string | null;
  expenses: FmExpenseItem[];
  budgetAdjustmentHistory: FmBudgetAdjustmentItem[];
}

export interface FmBudgetAdjustmentItem {
  id: string;
  oldBudget: number;
  newBudget: number;
  reason: string | null;
  adjustedAt: Date;
}
