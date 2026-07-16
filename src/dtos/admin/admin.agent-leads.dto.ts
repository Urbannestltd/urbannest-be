import { z } from "zod";

export const AdminAgentLeadsQuerySchema = z.object({
  status: z
    .enum(["PENDING", "FORWARDED_TO_LANDLORD", "APPROVED", "REJECTED", "CONVERTED_TO_TENANT", "WITHDRAWN"])
    .optional(),
  propertyId: z.string().uuid("Invalid property ID").optional(),
  agentId: z.string().uuid("Invalid agent ID").optional(),
});
export type AdminAgentLeadsQuery = z.infer<typeof AdminAgentLeadsQuerySchema>;

export interface AdminAgentLeadListItem {
  leadId: string;
  prospectName: string;
  prospectEmail: string | null;
  prospectPhone: string | null;
  propertyId: string;
  propertyName: string | null;
  unitId: string | null;
  unitName: string | null;
  proposedRent: number | null;
  agentId: string;
  agentName: string | null;
  status: string;
  dateForwarded: Date;
  decidedAt: Date | null;
}

export interface ConvertToTenantResponse {
  leadId: string;
  status: string;
  unitId: string;
  tenantUserId: string;
}
