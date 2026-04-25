import { MaintenanceApprovalStatus, MaintenanceStatus } from "@prisma/client";

export interface TicketListResponseDto {
  id: string;
  subject: string;
  priority: string;
  category: string;
  dateSubmitted: Date;
  status: string;
  assignedTo: { id: string; name: string | null } | null;
  unit: { id: string; name: string } | null;
  property: { id: string; name: string | null } | null;

  // Budget & approval
  budget: number | null;
  quotedCost: number | null;
  approvalStatus: MaintenanceApprovalStatus | null;

  // SLA tracking
  responseTimeMinutes: number | null;
  projectedFixDeadline: Date;
  isResponseLate: boolean;
  isFixLate: boolean;
}

export interface TicketDetailResponseDto {
  id: string;
  subject: string;
  dateSubmitted: Date;
  status: string;
  category: string;
  description: string;
  images: string[];

  unit: { id: string; name: string } | null;
  property: { id: string; name: string | null } | null;
  tenant: { name: string | null; phone: string | null } | null;

  // Activity & Comments
  activity: {
    id: string;
    senderName: string;
    message: string;
    timestamp: Date;
    isSystemMessage: boolean;
  }[];

  // Response time metrics
  responseMetrics: {
    timeToFirstResponseMinutes: number | null;
    timeToResolutionMinutes: number | null;
  };

  // Ordered event timeline
  timeline: {
    event: string;
    timestamp: Date;
  }[];

  // Budget & approval
  budget: number | null;
  quotedCost: number | null;
  approvalStatus: MaintenanceApprovalStatus | null;
  rebuttalNote: string | null;
}

export interface MaintenanceMetricsDto {
  /** Count of HIGH + EMERGENCY tickets that are still open */
  highPriorityOpenCount: number;

  /** Average time (in minutes) from ticket creation to first admin response */
  avgResponseTimeMinutes: number | null;

  /** % of tickets created this week that are now resolved/fixed/cancelled */
  weeklyCompletionPercent: number;
  /** Raw counts backing the weekly % */
  weeklyTicketsTotal: number;
  weeklyTicketsCompleted: number;

  /** Sum of approved budgets for all non-cancelled tickets (₦) */
  maintenanceCostEstimate: number;
}

export interface TicketFiltersDto {
  /** Filter to a single property */
  propertyId?: string;
  /** Filter by ticket status */
  status?: MaintenanceStatus;
  /** Filter by priority */
  priority?: string;
  /** Filter by issue category */
  category?: string;
  /** Earliest createdAt (ISO string) */
  dateFrom?: string;
  /** Latest createdAt (ISO string) */
  dateTo?: string;
}

export interface AddCommentDto {
  message: string;
  senderId: string;
}

export interface UpdateTicketStatusDto {
  status: MaintenanceStatus;
  adminId: string;
}

export interface SetBudgetDto {
  budget: number;
  quotedCost?: number;
}

export interface RejectTicketDto {
  reason: string;
}

export interface RebuttalDto {
  message: string;
  suggestedAmount?: number;
}
