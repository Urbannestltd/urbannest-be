import { prisma } from "../../config/prisma";
import { logActivity } from "../../utils/activityLogger";

export class NoShowWorker {
  public async processNoShows() {
    const now = new Date();

    const noShows = await prisma.visitorInvite.findMany({
      where: {
        status: { in: ["UPCOMING", "ACTIVE"] as any[] },
        validUntil: { lt: now },
        isWalkIn: false,
      },
      select: { id: true, tenantId: true, visitorName: true },
    });

    if (noShows.length === 0) return;

    console.log(`📋 Marking ${noShows.length} no-show visit(s)...`);

    const ids = noShows.map((v) => v.id);
    await prisma.visitorInvite.updateMany({
      where: { id: { in: ids } },
      data: { status: "EXPIRED_NO_SHOW" as any },
    });

    for (const visit of noShows) {
      void logActivity({
        userId: visit.tenantId,
        action: "GATE_NO_SHOW_EXPIRED",
        description: `Visitor ${visit.visitorName} marked as no-show — pass window elapsed without check-in`,
        metadata: { inviteId: visit.id },
      });
    }

    console.log(`✅ ${noShows.length} no-show record(s) updated to EXPIRED_NO_SHOW`);
  }
}
