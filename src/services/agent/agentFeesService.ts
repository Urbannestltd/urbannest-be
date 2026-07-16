import { AgentFeeStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import type {
  GetFeesQuery,
  AgentFeeSummary,
  AgentFeeListItem,
  AgentFeesListResponse,
} from "../../dtos/agent/agent.fees.dto";

// Agents only ever see two buckets: PENDING (covers both the landlord-approval
// stage and admin-confirmed-but-not-yet-disbursed) and PAID once the commission
// is actually sent. REJECTED fees are excluded from both, same as before.
const PENDING_DB_STATUSES: AgentFeeStatus[] = [
  AgentFeeStatus.PENDING_ADMIN_CONFIRMATION,
  AgentFeeStatus.CONFIRMED,
];
const STATUS_FILTER_MAP = {
  PENDING: { in: PENDING_DB_STATUSES },
  PAID: AgentFeeStatus.PAID,
} as const;

function toDisplayStatus(dbStatus: string): string {
  return (PENDING_DB_STATUSES as string[]).includes(dbStatus) ? "PENDING" : dbStatus;
}

export class AgentFeesService {

  public async getSummary(agentId: string): Promise<AgentFeeSummary> {
    const groups = await prisma.agentFee.groupBy({
      by: ["status"],
      where: { agentId },
      _sum: { amount: true },
    });

    const sumFor = (status: string) =>
      groups.find((g) => g.status === status)?._sum.amount ?? 0;

    return {
      totalPending: sumFor("PENDING_ADMIN_CONFIRMATION") + sumFor("CONFIRMED"),
      totalPaid: sumFor("PAID"),
    };
  }

  public async getFees(agentId: string, query: GetFeesQuery): Promise<AgentFeesListResponse> {
    const fees = await prisma.agentFee.findMany({
      where: {
        agentId,
        ...(query.status ? { status: STATUS_FILTER_MAP[query.status] } : {}),
        ...(query.propertyId ? { propertyId: query.propertyId } : {}),
      },
      select: {
        id: true,
        amount: true,
        status: true,
        createdAt: true,
        property: { select: { name: true } },
        lead: { select: { prospectName: true, unit: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    const items: AgentFeeListItem[] = fees.map((f) => ({
      feeId: f.id,
      propertyName: f.property.name,
      unitNumber: f.lead.unit?.name ?? null,
      tenantName: f.lead.prospectName,
      amount: f.amount,
      status: toDisplayStatus(f.status),
      generationDate: f.createdAt,
    }));

    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);

    return { fees: items, totalAmount };
  }
}
