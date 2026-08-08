import { prisma } from "../../config/prisma";
import { resolveExpiredWalkIn } from "../facility-manager/fmWalkInsService";

export class WalkInTimeoutWorker {
  public async processExpiredWalkIns() {
    const expired = await prisma.visitorInvite.findMany({
      where: {
        isWalkIn: true,
        status: "PENDING",
        approvalExpiresAt: { lte: new Date() },
      },
      select: { id: true },
    });

    if (expired.length === 0) return;

    console.log(`⏰ Processing ${expired.length} expired walk-in(s)...`);

    for (const visit of expired) {
      try {
        const newStatus = await resolveExpiredWalkIn(visit.id);
        console.log(`✅ Walk-in ${visit.id} resolved to ${newStatus ?? "already resolved"}`);
      } catch (error) {
        console.error(`❌ Failed to process expired walk-in ${visit.id}:`, error);
      }
    }
  }
}
