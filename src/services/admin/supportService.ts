import { prisma } from "../../config/prisma";

export class AdminSupportService {
  /**
   * All support tickets across all users, most recent first.
   */
  public async listAllTickets() {
    return prisma.supportTicket.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        submitter: {
          select: {
            userId: true,
            userFullName: true,
            userEmail: true,
            userRole: { select: { roleName: true } },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
  }
}
