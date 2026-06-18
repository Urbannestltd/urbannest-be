import { z } from "zod";

export const ApprovalsListQuerySchema = z.object({
  propertyId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});
export type ApprovalsListQuery = z.infer<typeof ApprovalsListQuerySchema>;

export const RejectApplicationBodySchema = z.object({
  reason: z.string().min(5, "Rejection reason must be at least 5 characters").max(500),
});
export type RejectApplicationBody = z.infer<typeof RejectApplicationBodySchema>;

export interface ApprovalListItem {
  leadId: string;
  applicantName: string;
  propertyId: string;
  propertyName: string | null;
  unitId: string | null;
  unitName: string | null;
  annualRent: number | null;
  agentId: string;
  agentName: string | null;
  dateForwarded: Date;
}

export interface ApprovalHistoryItem extends ApprovalListItem {
  outcome: "APPROVED" | "REJECTED";
  decidedAt: Date | null;
  rejectionReason: string | null;
}

export interface ApplicantDossier {
  leadId: string;
  applicantName: string;
  applicantEmail: string | null;
  applicantPhone: string | null;
  occupation: string | null;
  monthlyIncome: number | null;
  annualIncome: number | null;
  employerName: string | null;
  employerAddress: string | null;
  documents: string[];
  proposedRent: number | null;
  notes: string | null;
  propertyId: string;
  propertyName: string | null;
  unitId: string | null;
  unitName: string | null;
  agentId: string;
  agentName: string | null;
  status: string;
  dateForwarded: Date;
}
