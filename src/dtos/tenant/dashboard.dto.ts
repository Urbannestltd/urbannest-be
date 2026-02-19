import {
  VisitorInvite,
  MaintenanceRequest,
  InviteStatus,
} from "@prisma/client";

export interface DashboardOverviewResponse {
  user: {
    firstName: string;
    profilePicUrl: string | null;
  };

  // The "Rent Summary" Card (Visual: Black Card)
  lease: {
    isActive: boolean;
    amount: number; // e.g., 12,000,000
    currency: string;
    expiryDate: string | null; // "12-01-2026"
    daysRemaining: number;
    progressPercentage: number; // For the yellow progress bar (0-100)
    status: "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "NO_LEASE";
  };

  // The "Maintenance Overview" Cards (Visual: 3 White Cards)
  maintenance: {
    active: number; // "Active Requests"
    completed: number; // "Completed Requests"
    total: number; // "Total Requests"
  };

  // The "Visitor's Today" Table (Visual: Bottom Section)
  visitorsToday: {
    walkInCount: number;
    scheduledCount: number;
    list: Array<{
      id: string;
      name: string;
      phone: string;
      status: InviteStatus;
      accessType: string; // "One-off"
      timeIn: string | null; // "11:43 AM"
      timeOut: string | null; // "4:47 PM"
    }>;
  };

  // For the "Recent Activity" User Story (Hidden in design, but needed)
  recentActivity: Array<{
    id: string;
    title: string;
    type: "MESSAGE" | "ALERT" | "PAYMENT";
    date: Date;
  }>;
}
