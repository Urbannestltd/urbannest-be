import { prisma } from "../../config/prisma";
import { ZeptoMailService } from "../external/zeptoMailService";
import { fmWalkInTimedOutEmail } from "../../config/emailTemplates";
import { logActivity } from "../../utils/activityLogger";

export class WalkInTimeoutWorker {
  private emailService = new ZeptoMailService();

  public async processExpiredWalkIns() {
    const expired = await prisma.visitorInvite.findMany({
      where: {
        isWalkIn: true,
        status: "PENDING",
        approvalExpiresAt: { lte: new Date() },
      },
      include: {
        unit: {
          select: {
            name: true,
            property: { select: { type: true } },
          },
        },
        tenant: { select: { userFullName: true } },
        registeredByFm: {
          select: { userId: true, userFullName: true, userEmail: true },
        },
      },
    });

    if (expired.length === 0) return;

    console.log(`⏰ Processing ${expired.length} expired walk-in(s)...`);

    for (const visit of expired) {
      try {
        const propertyType = visit.unit.property.type;
        const isCommercial = propertyType === "COMMERCIAL";

        let newStatus: "CHECKED_IN" | "REJECTED";
        if (!isCommercial) {
          newStatus = "REJECTED";
        } else if (visit.fallbackRule === "SEND_UP") {
          newStatus = "CHECKED_IN";
        } else {
          newStatus = "REJECTED";
        }

        await prisma.visitorInvite.update({
          where: { id: visit.id },
          data: {
            status: newStatus as any,
            checkedInAt: newStatus === "CHECKED_IN" ? new Date() : undefined,
            approvalToken: null,
          },
        });

        const fmId = visit.registeredByFm?.userId ?? visit.tenantId;
        void logActivity({
          userId: fmId,
          action: "WALK_IN_TIMEOUT_APPLIED",
          description: `Walk-in for ${visit.visitorName} auto-resolved to ${newStatus} after approval timeout`,
          metadata: { visitId: visit.id, appliedRule: newStatus },
        });

        if (visit.registeredByFm?.userEmail) {
          const emailTemplate = fmWalkInTimedOutEmail(
            visit.registeredByFm.userFullName ?? "Facility Manager",
            visit.visitorName,
            visit.tenant.userFullName ?? "Tenant",
            visit.unit.name,
            newStatus,
          );
          await this.emailService.sendEmail(
            {
              email: visit.registeredByFm.userEmail,
              name: visit.registeredByFm.userFullName ?? undefined,
            },
            emailTemplate.subject,
            emailTemplate.html,
          );
        }

        console.log(`✅ Walk-in ${visit.id} resolved to ${newStatus}`);
      } catch (error) {
        console.error(`❌ Failed to process expired walk-in ${visit.id}:`, error);
      }
    }
  }
}
