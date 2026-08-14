import { z } from "zod";

export const SubmitLeadSchema = z.object({
  propertyId: z.string().uuid("Invalid property ID"),
  unitId: z.string().uuid("Invalid unit ID"),
  prospectName: z.string().min(2, "Prospect name is required").max(100),
  prospectEmail: z.string().email("Invalid email"),
  prospectPhone: z.string().min(7, "Invalid phone number").max(20),
  proposedRent: z.number().positive("Rent offer must be positive"),
  notes: z.string().max(1000).optional(),
  occupation: z.string().max(100).optional(),
  employerName: z.string().max(100).optional(),
  employmentDuration: z.string().max(100).optional(),
  annualIncome: z.number().positive().optional(),
});
export type SubmitLeadRequest = z.infer<typeof SubmitLeadSchema>;

export interface AgentLeadResponse {
  id: string;
  agentId: string;
  propertyId: string;
  unitId: string | null;
  prospectName: string;
  prospectEmail: string | null;
  prospectPhone: string | null;
  proposedRent: number | null;
  notes: string | null;
  status: string;
  createdAt: Date;
}

// ── List / Filter ─────────────────────────────────────────────────────────────

export const GetLeadsQuerySchema = z.object({
  search: z.string().max(100).optional(),
  status: z.enum(["ALL", "DRAFT", "FORWARDED", "APPROVED", "REJECTED"]).default("ALL"),
  propertyId: z.string().uuid("Invalid property ID").optional(),
});
export type GetLeadsQuery = z.infer<typeof GetLeadsQuerySchema>;

export interface AgentLeadListItem {
  leadId: string;
  prospectName: string;
  propertyName: string | null;
  unitNumber: string | null;
  proposedRent: number | null;
  status: string;
  dateAdded: Date;
}

// ── Delete ────────────────────────────────────────────────────────────────────

export interface DeleteLeadResponse {
  leadId: string;
}

// ── Save (partial update / auto-save) ───────────────────────────────────────────

export const UpdateLeadSchema = z
  .object({
    prospectName: z.string().min(2, "Prospect name is required").max(100),
    prospectEmail: z.string().email("Invalid email"),
    prospectPhone: z.string().min(7, "Invalid phone number").max(20),
    proposedRent: z.number().positive("Rent offer must be positive"),
    notes: z.string().max(1000),
    occupation: z.string().max(100),
    employerName: z.string().max(100),
    employmentDuration: z.string().max(100),
    annualIncome: z.number().positive(),
  })
  .partial();
export type UpdateLeadRequest = z.infer<typeof UpdateLeadSchema>;

// ── Detail ────────────────────────────────────────────────────────────────────

export interface AgentLeadDocumentItem {
  id: string;
  category: string;
  type: string;
  url: string;
  fileName: string;
  fileSizeBytes: number;
  createdAt: Date;
}

// Same shape, plus leadId so the agent can tell staged (null) apart from attached documents.
export interface AgentLeadStagedDocumentItem extends AgentLeadDocumentItem {
  leadId: string | null;
}

export interface AgentLeadRefereeItem {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  relationship: string | null;
  description: string | null;
  createdAt: Date;
}

export interface AgentLeadDetail {
  id: string;
  propertyId: string;
  propertyName: string | null;
  unitId: string | null;
  unitNumber: string | null;
  prospectName: string;
  prospectEmail: string | null;
  prospectPhone: string | null;
  proposedRent: number | null;
  notes: string | null;
  occupation: string | null;
  employerName: string | null;
  employerAddress: string | null;
  employmentDuration: string | null;
  annualIncome: number | null;
  documents: AgentLeadDocumentItem[];
  referees: AgentLeadRefereeItem[];
  status: string;
  rejectionReason: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}

// ── Referees ──────────────────────────────────────────────────────────────────

export const AddRefereeSchema = z.object({
  name: z.string().min(2, "Referee name is required").max(100),
  phone: z.string().min(7, "Invalid phone number").max(20),
  // Accepts "" (empty from a blank form field) as "no email provided", not a validation error.
  email: z
    .union([z.string().email("Invalid email"), z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
  relationship: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
});
export type AddRefereeRequest = z.infer<typeof AddRefereeSchema>;

// ── Forward / Resubmit ───────────────────────────────────────────────────────

export interface ForwardLeadResponse {
  leadId: string;
  status: string;
}

export interface ResubmitLeadResponse {
  leadId: string;
  status: string;
}
