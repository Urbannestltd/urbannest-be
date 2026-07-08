import { prisma } from "../../config/prisma";
import type {
  GetFeesQuery,
  AgentFeeSummary,
  AgentFeeListItem,
  AgentFeesListResponse,
} from "../../dtos/agent/agent.fees.dto";

const STATUS_FILTER_MAP = {
  PENDING: "PENDING_ADMIN_CONFIRMATION",
  APPROVED: "CONFIRMED",
  PAID: "PAID",
} as const;

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
      totalPending: sumFor("PENDING_ADMIN_CONFIRMATION"),
      totalApproved: sumFor("CONFIRMED"),
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
      status: f.status,
      generationDate: f.createdAt,
    }));

    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);

    return { fees: items, totalAmount };
  }
}
