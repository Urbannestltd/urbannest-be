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
