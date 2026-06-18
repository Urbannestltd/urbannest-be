import { z } from "zod";

export const SubmitLeadSchema = z.object({
  propertyId: z.string().uuid("Invalid property ID"),
  unitId: z.string().uuid("Invalid unit ID").optional(),
  prospectName: z.string().min(2, "Prospect name is required").max(100),
  prospectEmail: z.string().email("Invalid email").optional(),
  prospectPhone: z.string().max(20).optional(),
  proposedRent: z.number().positive("Proposed rent must be positive").optional(),
  notes: z.string().max(1000).optional(),
  occupation: z.string().max(100).optional(),
  monthlyIncome: z.number().positive().optional(),
  employerName: z.string().max(100).optional(),
  employerAddress: z.string().max(200).optional(),
  documents: z.array(z.string().url("Each document must be a valid URL")).max(10).optional(),
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
