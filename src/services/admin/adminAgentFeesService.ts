import { prisma } from "../../config/prisma";
import { ConflictError, NotFoundError } from "../../utils/apiError";
import { logActivity } from "../../utils/activityLogger";
import type { MarkAgentFeePaidResponse } from "../../dtos/admin/admin.agent-fees.dto";

export class AdminAgentFeesService {

  public async markPaid(adminId: string, feeId: string): Promise<MarkAgentFeePaidResponse> {
    const fee = await prisma.agentFee.findUnique({ where: { id: feeId } });
    if (!fee) throw new NotFoundError("Agent fee not found");

    if (fee.status !== "CONFIRMED") {
      throw new ConflictError("Only confirmed fees can be marked as paid");
    }

    const paidAt = new Date();
    await prisma.agentFee.update({
      where: { id: feeId },
      data: { status: "PAID", paidAt },
    });

    void logActivity({
      userId: adminId,
      action: "ADMIN_AGENT_FEE_MARKED_PAID",
      description: `Marked agent fee ${feeId} as paid`,
      metadata: { feeId, agentId: fee.agentId, amount: fee.amount },
    });

    return { feeId, status: "PAID", paidAt };
  }
}
