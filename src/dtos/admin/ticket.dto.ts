import { MaintenanceCategory, MaintenanceStatus } from "@prisma/client";

export interface TicketListResponseDto {
  id: string;
  subject: string;
  category: string;
  dateSubmitted: Date;
  status: string;
}

export interface TicketDetailResponseDto {
  id: string;
  subject: string;
  dateSubmitted: Date;
  status: string;
  category: string;
  description: string;
  images: string[];

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
}

export interface AddCommentDto {
  message: string;
  senderId: string; // The ID of the logged-in user making the comment
}

export interface UpdateTicketStatusDto {
  status: MaintenanceStatus;
  adminId: string; // The ID of the admin making the change
}
